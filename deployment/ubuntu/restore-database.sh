#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root with a dump path" >&2; exit 1; }
DUMP_FILE="${1:?Usage: sudo CONFIRM_RESTORE=ozu_schedule bash $0 /absolute/path/backup.dump}"
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "$DUMP_FILE" ]] || { echo "Dump does not exist: ${DUMP_FILE}" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

[[ "${CONFIRM_RESTORE:-}" == "$DB_NAME" ]] || {
  echo "Restore replaces objects in ${DB_NAME}. Re-run with CONFIRM_RESTORE=${DB_NAME}." >&2
  exit 1
}

systemctl stop uniplanner-api.service
restore_status=0
PGPASSWORD="$DB_PASSWORD" pg_restore \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
  --dbname="$DB_NAME" --clean --if-exists --no-owner --exit-on-error \
  "$DUMP_FILE" || restore_status=$?
systemctl start uniplanner-api.service

if [[ $restore_status -ne 0 ]]; then
  echo "Restore failed; the API was restarted. Inspect PostgreSQL output above." >&2
  exit "$restore_status"
fi

echo "Database restored from ${DUMP_FILE}."
