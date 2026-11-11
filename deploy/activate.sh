#!/usr/bin/env bash
# CI entry point. Bootstrap a separately tested recovery only when the live release is an old reader.
set -euo pipefail
release="${1:?usage: activate.sh <release> <recovery-directory> <recovery-id>}"
recovery_source="${2:?missing recovery directory}"
recovery_id="${3:?missing recovery identifier}"
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ && "$recovery_id" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ && "$release" != "$recovery_id" ]] || { echo 'Invalid or overlapping release identifiers.' >&2; exit 1; }
here="$(cd "$(dirname "$0")" && pwd)"
root="${TUXOS_ROOT:-/opt/tuxos}"
node "$here/check-release.mjs" "$here/.."
previous="$(readlink -f "$root/current" 2>/dev/null || true)"
if [[ -n "$previous" ]] && node "$here/check-release.mjs" "$previous"; then
  # Once upgraded, use the actual previous release, not the bootstrap checkpoint.
  unset TUXOS_ROLLBACK_RELEASE
else
  node "$here/check-release.mjs" "$recovery_source"
  recovery="$root/releases/$recovery_id"
  if [[ -e "$recovery" || -L "$recovery" ]]; then
    [[ -d "$recovery" && ! -L "$recovery" ]] || { echo 'Recovery path is not a release directory.' >&2; exit 1; }
    node "$here/check-release.mjs" "$recovery"
    diff -qr "$recovery_source" "$recovery" >/dev/null || { echo 'Existing recovery differs; refusing to overwrite it.' >&2; exit 1; }
  else
    mkdir -p "$root/releases"
    staging="$(mktemp -d "$root/releases/.recovery-XXXXXXXX")"
    trap 'rm -rf "$staging"' EXIT
    cp -a "$recovery_source/." "$staging/"
    chmod -R a+rX "$staging"
    node "$here/check-release.mjs" "$staging"
    mv -T "$staging" "$recovery"
    trap - EXIT
  fi
  export TUXOS_ROLLBACK_RELEASE="$recovery_id"
  echo "Prepared compatible recovery $recovery_id; retaining the old release."
fi
exec bash "$here/deploy.sh" "$release"
