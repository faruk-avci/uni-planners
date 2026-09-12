#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 CS304 EE311" >&2; exit 1; }

FROM_CODE="${1:-}"
TO_CODE="${2:-}"
APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRAPER_DIR="${APP_DIR}/scraper/katalog"

[[ -n "$FROM_CODE" && -n "$TO_CODE" ]] || {
  echo "Usage: sudo bash $0 CS304 EE311" >&2
  exit 1
}
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "${SCRAPER_DIR}/rename_course_code.js" ]] || { echo "Missing ${SCRAPER_DIR}/rename_course_code.js" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

echo "Creating a recovery point before renaming ${FROM_CODE} -> ${TO_CODE}..."
bash "${SCRIPT_DIR}/backup-database.sh"

echo "Renaming ${FROM_CODE} -> ${TO_CODE}..."
export HOME=/var/lib/uniplanner
export PATH=/usr/local/bin:/usr/bin:/bin
export NODE_ENV=production
sudo -H -u "$SERVICE_USER" \
  --preserve-env=NODE_ENV,DB_HOST,DB_PORT,DB_USER,DB_PASSWORD,DB_NAME \
  node "${SCRAPER_DIR}/rename_course_code.js" --from "$FROM_CODE" --to "$TO_CODE"

systemctl restart uniplanner-api.service
bash "${SCRIPT_DIR}/health-check.sh" "https://${APP_DOMAIN}" "127.0.0.1"
echo "Course rename complete."
