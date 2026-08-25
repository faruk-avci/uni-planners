#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }

APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
SCRAPER_DIR="${APP_DIR}/scraper/katalog"

[[ -f "${SCRAPER_DIR}/package.json" ]] || {
  echo "Scraper not found at ${SCRAPER_DIR}" >&2
  exit 1
}
id "$SERVICE_USER" >/dev/null 2>&1 || {
  echo "Service user ${SERVICE_USER} does not exist; run 20-application.sh first" >&2
  exit 1
}

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y poppler-utils

sudo -u "$SERVICE_USER" env HOME=/var/lib/uniplanner PATH=/usr/local/bin:/usr/bin:/bin \
  npm ci --prefix "$SCRAPER_DIR"

# Playwright resolves the Ubuntu packages itself, then its browser is installed
# in the service user's home so manual term updates never need a root-owned cache.
env PATH=/usr/local/bin:/usr/bin:/bin \
  "${SCRAPER_DIR}/node_modules/.bin/playwright" install-deps chromium
sudo -u "$SERVICE_USER" env HOME=/var/lib/uniplanner PATH=/usr/local/bin:/usr/bin:/bin \
  "${SCRAPER_DIR}/node_modules/.bin/playwright" install chromium

echo "Scraper dependencies and Chromium are ready."
