#!/usr/bin/env bash
# Installs an immutable release and rolls back only to a verified continuation-compatible reader/API.
set -euo pipefail
release="${1:?usage: deploy.sh <new-release-name>}"
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || { echo 'Invalid release name.' >&2; exit 1; }
root="${TUXOS_ROOT:-/opt/tuxos}"
restart="${TUXOS_RESTART:-sudo /usr/bin/systemctl restart tuxos-api}"
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
target="$root/releases/$release"
[[ ! -e "$target" && ! -L "$target" ]] || { echo 'Release already exists; use a new immutable release name.' >&2; exit 1; }
node "$source_dir/deploy/check-release.mjs" "$source_dir"
previous="$(readlink -f "$root/current" 2>/dev/null || true)"
# For the first schema-2 rollout, prepare and verify a separate compatible recovery release before activation.
if [[ -n "${TUXOS_ROLLBACK_RELEASE:-}" ]]; then
  [[ "$TUXOS_ROLLBACK_RELEASE" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || { echo 'Invalid recovery release name.' >&2; exit 1; }
  previous="$root/releases/$TUXOS_ROLLBACK_RELEASE"
  [[ -d "$previous" ]] || { echo 'The requested recovery release does not exist.' >&2; exit 1; }
fi
if [[ -n "$previous" && -d "$previous" ]]; then
  node "$source_dir/deploy/check-release.mjs" "$previous"
fi
health_check() {
  if [[ -n "${TUXOS_HEALTH_URL:-}" ]]; then curl -fsS --max-time 5 "$TUXOS_HEALTH_URL";
  else curl -fsS --max-time 5 --unix-socket /run/tuxos/api.sock http://localhost/api/health; fi
}
health() {
  for ((attempt=0; attempt<${TUXOS_HEALTH_ATTEMPTS:-20}; attempt++)); do
    if health_check >/dev/null 2>&1 && [[ -f "$root/current/web/index.html" ]]; then return 0; fi
    sleep 1
  done
  return 1
}
switch_to() {
  ln -sfn "$1" "$root/current.next"
  mv -Tf "$root/current.next" "$root/current"
  $restart
}
mkdir -p "$target"
cp -a "$source_dir/web" "$source_dir/api" "$source_dir/release.json" "$target/"
chmod -R a+rX "$target"
echo "Switching to $release"
if switch_to "$target" && health; then
  echo "Release $release is live."
else
  echo "Release $release failed startup or its health check." >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    echo "Restoring compatible release $(basename "$previous")" >&2
    switch_to "$previous" && health || echo 'Recovery release is not healthy; keep the database and inspect the API service.' >&2
  else
    echo 'No previous release exists; preserve this release and its data for recovery.' >&2
  fi
  exit 1
fi
# During migration, retain releases and recovery artifacts. Prune explicitly only after the release gates pass.
