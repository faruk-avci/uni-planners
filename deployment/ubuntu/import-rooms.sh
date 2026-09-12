#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 /path/to/rooms.csv" >&2; exit 1; }

CSV_FILE="${1:-}"
APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER_DIR="${APP_DIR}/scraper/katalog"

[[ -n "$CSV_FILE" ]] || {
  echo "Usage: sudo bash $0 /path/to/rooms.csv" >&2
  exit 1
}
[[ -f "$CSV_FILE" ]] || { echo "File does not exist: ${CSV_FILE}" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "${SCRAPER_DIR}/import_rooms.js" ]] || { echo "Missing ${SCRAPER_DIR}/import_rooms.js" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Creating a recovery point before updating room assignments..."
bash "${SCRIPT_DIR}/backup-database.sh"

echo "Importing rooms from ${CSV_FILE}..."
export HOME=/var/lib/uniplanner
export PATH=/usr/local/bin:/usr/bin:/bin
export NODE_ENV=production
sudo -H -u "$SERVICE_USER" \
  --preserve-env=NODE_ENV,DB_HOST,DB_PORT,DB_USER,DB_PASSWORD,DB_NAME \
  node "${SCRAPER_DIR}/import_rooms.js" --file "$CSV_FILE"

systemctl restart uniplanner-api.service
bash "${SCRIPT_DIR}/health-check.sh" "https://${APP_DOMAIN}" "127.0.0.1"
echo "Room import complete."
