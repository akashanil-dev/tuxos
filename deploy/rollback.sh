#!/usr/bin/env bash
# Manual rollback never downgrades the database or overwrites learner saves.
set -euo pipefail
release="${1:?usage: rollback.sh <compatible-release-name>}"
[[ "$release" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$ ]] || { echo 'Invalid release name.' >&2; exit 1; }
root="${TUXOS_ROOT:-/opt/tuxos}"
target="$root/releases/$release"
node "$(dirname "$0")/check-release.mjs" "$target"
ln -sfn "$target" "$root/current.next"
mv -Tf "$root/current.next" "$root/current"
${TUXOS_RESTART:-sudo /usr/bin/systemctl restart tuxos-api}
echo "Restored compatible release $release. Check /api/health and a disposable account; no database was restored."
