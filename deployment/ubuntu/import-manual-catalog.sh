#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 /path/to/courseCatalogDS.xls [\"TERM LABEL\"]" >&2; exit 1; }

XLS_FILE="${1:-}"
TERM_LABEL="${2:-}"
APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER_DIR="${APP_DIR}/scraper/katalog"

[[ -n "$XLS_FILE" ]] || {
  echo "Usage: sudo bash $0 /path/to/courseCatalogDS.xls [\"2026 - 2027 Güz\"]" >&2
  exit 1
}
[[ -f "$XLS_FILE" ]] || { echo "File does not exist: ${XLS_FILE}" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "${SCRAPER_DIR}/import_manual_catalog.js" ]] || { echo "Missing ${SCRAPER_DIR}/import_manual_catalog.js" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Creating a recovery point before replacing catalog data..."
bash "${SCRIPT_DIR}/backup-database.sh"

echo "Importing manual catalog from ${XLS_FILE}..."
export HOME=/var/lib/uniplanner
export PATH=/usr/local/bin:/usr/bin:/bin
export NODE_ENV=production
import_args=(--file "$XLS_FILE")
[[ -n "$TERM_LABEL" ]] && import_args+=(--term "$TERM_LABEL")
sudo -H -u "$SERVICE_USER" \
  --preserve-env=NODE_ENV,DB_HOST,DB_PORT,DB_USER,DB_PASSWORD,DB_NAME \
  node "${SCRAPER_DIR}/import_manual_catalog.js" "${import_args[@]}"

if [[ -n "$TERM_LABEL" ]]; then
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
fi

systemctl restart uniplanner-api.service
bash "${SCRIPT_DIR}/health-check.sh" "https://${APP_DOMAIN}" "127.0.0.1"
echo "Manual catalog import complete."
