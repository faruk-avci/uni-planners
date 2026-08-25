#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 /path/to/repository" >&2; exit 1; }
SOURCE_DIR="${1:-$(pwd)}"
APP_DIR="${APP_DIR:-/opt/uniplanner/app}"
SERVICE_USER="${SERVICE_USER:-uniplanner}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

[[ -f "${SOURCE_DIR}/backend/package.json" && -f "${SOURCE_DIR}/frontend/package.json" ]] || {
  echo "Repository not found at ${SOURCE_DIR}" >&2; exit 1;
}
[[ -f /etc/uniplanner/backend.env ]] || { echo "Run 10-database.sh first" >&2; exit 1; }

id "$SERVICE_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/uniplanner --shell /usr/sbin/nologin "$SERVICE_USER"
install -d -m 0755 -o "$SERVICE_USER" -g "$SERVICE_USER" "$APP_DIR"

source_real="$(realpath "$SOURCE_DIR")"
app_real="$(realpath "$APP_DIR")"
[[ "$app_real" == /opt/uniplanner/* ]] || {
  echo "APP_DIR must stay under /opt/uniplanner; resolved to ${app_real}" >&2
  exit 1
}
if [[ "$source_real" != "$app_real" ]]; then
  rsync -a --delete \
    --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' \
    --exclude 'backend/.env' --exclude 'tmp/' --exclude 'archive/' \
    "${SOURCE_DIR}/" "${APP_DIR}/"
else
  echo "Source is already ${APP_DIR}; skipping repository copy."
fi
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

install -d -m 0750 -o "$SERVICE_USER" -g "$SERVICE_USER" /var/lib/uniplanner/data/curriculums /var/lib/uniplanner/data/elective-pools
rsync -a --ignore-existing "${APP_DIR}/backend/data/" /var/lib/uniplanner/data/
chown -R "$SERVICE_USER:$SERVICE_USER" /var/lib/uniplanner/data

sudo -u "$SERVICE_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm ci --omit=dev --prefix "${APP_DIR}/backend"
sudo -u "$SERVICE_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm ci --prefix "${APP_DIR}/frontend"
sudo -u "$SERVICE_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm run build --prefix "${APP_DIR}/frontend"
sudo -u "$SERVICE_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm ci --prefix "${APP_DIR}/panel"
sudo -u "$SERVICE_USER" env PATH=/usr/local/bin:/usr/bin:/bin npm run build --prefix "${APP_DIR}/panel"

install -m 0644 "${SCRIPT_DIR}/systemd/uniplanner-api.service" /etc/systemd/system/uniplanner-api.service
systemctl daemon-reload
systemctl enable --now uniplanner-api.service
systemctl restart uniplanner-api.service
systemctl --no-pager --full status uniplanner-api.service
