#!/usr/bin/env bash
# One-time server setup for TuxOS on Ubuntu (tested target: Ubuntu 24.04, aarch64). Run as root:
#   sudo bash deploy/setup-server.sh
# It installs Node.js 24, creates the `tuxos` service user and the `tuxos-deploy` user GitHub Actions logs in
# as, the /opt/tuxos release folders, the /etc/tuxos/tuxos.env secrets file and the systemd unit.
# Safe to run again: it skips what already exists. It does not touch Caddy; add deploy/Caddyfile yourself.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run this as root: sudo bash $0" >&2
  exit 1
fi
here="$(cd "$(dirname "$0")" && pwd)"

# Node.js 24 LTS from NodeSource: Ubuntu's own package is too old to run the API's TypeScript directly.
node_major() { node --version 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || echo 0; }
if [[ "$(node_major)" -lt 24 ]]; then
  echo "Installing Node.js 24..."
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node --version) at $(command -v node)"

# The API runs as `tuxos`, which can't log in or write its own code.
id tuxos &>/dev/null || useradd --system --home /opt/tuxos --shell /usr/sbin/nologin tuxos

# GitHub Actions logs in as `tuxos-deploy`. It owns the releases and may only restart the API with sudo.
if ! id tuxos-deploy &>/dev/null; then
  useradd --create-home --shell /bin/bash tuxos-deploy
fi
install -d -m 700 -o tuxos-deploy -g tuxos-deploy /home/tuxos-deploy/.ssh
touch /home/tuxos-deploy/.ssh/authorized_keys
chown tuxos-deploy:tuxos-deploy /home/tuxos-deploy/.ssh/authorized_keys
chmod 600 /home/tuxos-deploy/.ssh/authorized_keys
cat > /etc/sudoers.d/tuxos-deploy <<'SUDOERS'
tuxos-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart tuxos-api, /usr/bin/systemctl is-active tuxos-api
SUDOERS
chmod 440 /etc/sudoers.d/tuxos-deploy
visudo -cf /etc/sudoers.d/tuxos-deploy

# Releases live in /opt/tuxos/releases/<commit>; /opt/tuxos/current points at the live one.
# Everything is world-readable so Caddy and the tuxos user can read it, but only tuxos-deploy can write.
install -d -m 755 -o tuxos-deploy -g tuxos-deploy /opt/tuxos /opt/tuxos/releases

# Settings: created once, never overwritten. Learners bring their own OpenAI keys: the server has none.
install -d -m 755 /etc/tuxos
if [[ ! -f /etc/tuxos/tuxos.env ]]; then
  cat > /etc/tuxos/tuxos.env <<'ENV'
# TuxOS API settings. Readable only by root; systemd passes them to the service.
# Learners use their own AI provider and key (Settings → AI); the server has none of its own.
# AI is off until AI_FEATURES=1. Never set ALLOW_CUSTOM_AI_URL or ALLOW_PRIVATE_AI_URL on this server.
# AI_FEATURES=1
# The API listens on a Unix socket that only Caddy can reach; no network port is opened.
SOCKET=/run/tuxos/api.sock
# Behind Caddy and Cloudflare: rate-limit by the visitor's real IP from Cloudflare's header.
TRUST_PROXY=1
TUTOR_REQUESTS_PER_MINUTE=30
# Accounts and saved progress (SQLite). Back this file up.
DATABASE_PATH=/var/lib/tuxos/tuxos.db
ENV
  chmod 600 /etc/tuxos/tuxos.env
  echo "Created /etc/tuxos/tuxos.env."
fi
# Older settings files had a server-wide key. The API ignores it now; remove it so no key sits on the server.
sed -i '/^OPENAI_API_KEY=/d' /etc/tuxos/tuxos.env

# The socket folder, shared with the Caddy container.
install -m 644 "$here/tuxos.tmpfiles.conf" /etc/tmpfiles.d/tuxos.conf
systemd-tmpfiles --create /etc/tmpfiles.d/tuxos.conf
if grep -q '^HOST=\|^PORT=' /etc/tuxos/tuxos.env && ! grep -q '^SOCKET=' /etc/tuxos/tuxos.env; then
  # An env file from the first version of this script: switch it from a port to the socket.
  sed -i -e 's/^HOST=.*/SOCKET=\/run\/tuxos\/api.sock/' -e '/^PORT=/d' /etc/tuxos/tuxos.env
  echo "Switched /etc/tuxos/tuxos.env to the Unix socket."
fi

if ! grep -q '^DATABASE_PATH=' /etc/tuxos/tuxos.env; then
  # An env file from before accounts existed.
  printf '\n# Accounts and saved progress (SQLite). Back this file up.\nDATABASE_PATH=/var/lib/tuxos/tuxos.db\n' >> /etc/tuxos/tuxos.env
  echo "Added DATABASE_PATH to /etc/tuxos/tuxos.env."
fi

install -m 644 "$here/tuxos-api.service" /etc/systemd/system/tuxos-api.service
systemctl daemon-reload
systemctl enable tuxos-api >/dev/null
# Pick up the new unit and settings if the API is already running.
if systemctl is-active --quiet tuxos-api; then systemctl restart tuxos-api; fi
echo "Installed tuxos-api.service (it starts working after the first deploy)."

echo
echo "Done. Next steps:"
echo "  1. Put your OpenAI key in /etc/tuxos/tuxos.env"
echo "  2. Add the GitHub Actions public key to /home/tuxos-deploy/.ssh/authorized_keys"
echo "  3. Add deploy/Caddyfile's site block to Caddy's Caddyfile, mount /opt/tuxos and /run/tuxos into the"
echo "     Caddy container (read-only), and recreate it"
