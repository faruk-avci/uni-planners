#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
ENV_FILE="${ENV_FILE:-/etc/uniplanner/backend.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/uniplanner}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

[[ -f "$ENV_FILE" ]] || { echo "Missing ${ENV_FILE}" >&2; exit 1; }
[[ "$BACKUP_DIR" == /var/backups/uniplanner || "$BACKUP_DIR" == /var/backups/uniplanner/* ]] || {
  echo "BACKUP_DIR must stay under /var/backups/uniplanner" >&2; exit 1;
}
[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || { echo "RETENTION_DAYS must be a non-negative integer" >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

install -d -m 0700 "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${BACKUP_DIR}/${DB_NAME}-${stamp}.dump"
data_target="${BACKUP_DIR}/uniplanner-data-${stamp}.tar.gz"

PGPASSWORD="$DB_PASSWORD" pg_dump \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
  --format=custom --compress=9 --file="$target" "$DB_NAME"
chmod 0600 "$target"

if [[ -d /var/lib/uniplanner/data ]]; then
  tar --create --gzip --file="$data_target" --directory=/var/lib/uniplanner data
  chmod 0600 "$data_target"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name "${DB_NAME}-*.dump" -mtime "+${RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uniplanner-data-*.tar.gz' -mtime "+${RETENTION_DAYS}" -delete
echo "Database backup created: ${target}"
[[ -f "$data_target" ]] && echo "Curriculum data backup created: ${data_target}"
