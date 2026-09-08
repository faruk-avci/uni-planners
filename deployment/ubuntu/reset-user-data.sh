#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo CONFIRM_RESET=ozu_schedule bash $0" >&2; exit 1; }
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ "${CONFIRM_RESET:-}" == "$DB_NAME" ]] || {
  echo "This wipes sessions, baskets, shared schedules, dino scores, and all" >&2
  echo "site/request logs in ${DB_NAME}. catalog_courses, catalog_sections, and" >&2
  echo "course_assessments are NOT touched." >&2
  echo "Re-run with CONFIRM_RESET=${DB_NAME} to proceed." >&2
  exit 1
}

echo "Creating a recovery point before wiping user/session/log data..."
bash "${SCRIPT_DIR}/backup-database.sh"

echo "Truncating session-scoped and log tables..."
PGPASSWORD="$DB_PASSWORD" psql \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
  --set=ON_ERROR_STOP=1 \
  -c "TRUNCATE TABLE
        sessions,
        basket_items,
        saved_baskets,
        shared_schedules,
        course_add_events,
        major_selection_events,
        dino_high_scores,
        site_events,
        server_request_logs
      RESTART IDENTITY;"

echo "Restarting API so in-memory session caches don't reference truncated rows..."
systemctl restart uniplanner-api.service
bash "${SCRIPT_DIR}/health-check.sh" "https://${APP_DOMAIN}" "127.0.0.1"
echo "Reset complete. Catalog tables were left untouched."
