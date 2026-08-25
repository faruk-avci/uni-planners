#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 \"TERM LABEL\"" >&2; exit 1; }

TERM_LABEL="${1:-}"
APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER_DIR="${APP_DIR}/scraper/katalog"

[[ -n "$TERM_LABEL" ]] || {
  echo "Usage: sudo bash $0 \"2026 - 2027 Güz\"" >&2
  exit 1
}
[[ "$TERM_LABEL" != *$'\n'* && "$TERM_LABEL" != *"'"* ]] || {
  echo "Term label contains unsupported characters" >&2
  exit 1
}
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "${SCRAPER_DIR}/package.json" ]] || { echo "Missing ${SCRAPER_DIR}" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Creating a recovery point before replacing catalog data..."
bash "${SCRIPT_DIR}/backup-database.sh"

echo "Updating SIS term: ${TERM_LABEL}"
# Keep database credentials in the inherited environment rather than command-line
# arguments, where another local user could briefly see them in the process list.
export HOME=/var/lib/uniplanner
export PATH=/usr/local/bin:/usr/bin:/bin
export NODE_ENV=production
runuser -u "$SERVICE_USER" --preserve-environment -- \
  npm run --prefix "$SCRAPER_DIR" term:update -- --term "$TERM_LABEL"

env_tmp="$(mktemp /etc/uniplanner/backend.env.XXXXXX)"
trap 'rm -f -- "$env_tmp"' EXIT
awk -v term="$TERM_LABEL" '
  BEGIN { replaced = 0 }
  /^CATALOG_TERM=/ { print "CATALOG_TERM=\047" term "\047"; replaced = 1; next }
  { print }
  END { if (!replaced) print "CATALOG_TERM=\047" term "\047" }
' "$ENV_FILE" > "$env_tmp"
chmod 0600 "$env_tmp"
mv -f -- "$env_tmp" "$ENV_FILE"
trap - EXIT

systemctl restart uniplanner-api.service
bash "${SCRIPT_DIR}/health-check.sh" "http://127.0.0.1"
echo "Term update complete: ${TERM_LABEL}"
