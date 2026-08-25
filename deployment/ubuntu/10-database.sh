#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }

requested_domain="${DOMAIN:-}"
requested_db_name="${DB_NAME:-}"
requested_db_user="${DB_USER:-}"
requested_db_password="${DB_PASSWORD:-}"
requested_admin_secret="${ADMIN_SECRET:-}"

# Preserve generated credentials when the setup is safely re-run.
if [[ -f /etc/uniplanner/backend.env ]]; then
  set -a
  # shellcheck disable=SC1091
  source /etc/uniplanner/backend.env
  set +a
fi

DOMAIN="${requested_domain:-${APP_DOMAIN:-uniplanner.org}}"
DB_NAME="${requested_db_name:-${DB_NAME:-ozu_schedule}}"
DB_USER="${requested_db_user:-${DB_USER:-ozu_user}}"
DB_PASSWORD="${requested_db_password:-${DB_PASSWORD:-$(openssl rand -base64 36 | tr -d '\n')}}"
ADMIN_SECRET="${requested_admin_secret:-${ADMIN_SECRET:-$(openssl rand -hex 48)}}"

[[ "$DB_NAME" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "Invalid DB_NAME" >&2; exit 1; }
[[ "$DB_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || { echo "Invalid DB_USER" >&2; exit 1; }
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid DOMAIN" >&2; exit 1; }
[[ "$DB_PASSWORD" != *"'"* && "$DB_PASSWORD" != *$'\n'* ]] || { echo "DB_PASSWORD contains unsupported characters" >&2; exit 1; }
[[ "$ADMIN_SECRET" != *"'"* && "$ADMIN_SECRET" != *$'\n'* ]] || { echo "ADMIN_SECRET contains unsupported characters" >&2; exit 1; }

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE \"${DB_USER}\" LOGIN PASSWORD '${DB_PASSWORD}'"
else
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "ALTER ROLE \"${DB_USER}\" PASSWORD '${DB_PASSWORD}'"
fi

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb --owner "$DB_USER" "$DB_NAME"
fi

install -d -m 0750 -o root -g root /etc/uniplanner
cat > /etc/uniplanner/backend.env <<EOF
NODE_ENV='production'
PORT='3001'
APP_DOMAIN='${DOMAIN}'
APP_DATA_DIR='/var/lib/uniplanner/data'
DB_HOST='127.0.0.1'
DB_PORT='5432'
DB_USER='${DB_USER}'
DB_PASSWORD='${DB_PASSWORD}'
DB_NAME='${DB_NAME}'
DB_POOL_MAX='20'
CORS_ORIGIN='https://${DOMAIN},https://www.${DOMAIN},https://panel.${DOMAIN}'
COOKIE_SECURE='1'
TRUST_PROXY='1'
HEAVY_QUEUE_MAX='250'
LOG_FLUSH_MS='250'
LOG_BATCH_SIZE='500'
LOG_QUEUE_MAX='20000'
ADMIN_SECRET='${ADMIN_SECRET}'
CATALOG_TERM='2025 - 2026 Bahar'
EOF
chmod 0600 /etc/uniplanner/backend.env
echo "Database and /etc/uniplanner/backend.env are ready. Save a secure backup of this file."
