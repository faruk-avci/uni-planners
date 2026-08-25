#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

install -d -m 0700 /var/backups/uniplanner
install -m 0644 "${SCRIPT_DIR}/systemd/uniplanner-db-backup.service" /etc/systemd/system/uniplanner-db-backup.service
install -m 0644 "${SCRIPT_DIR}/systemd/uniplanner-db-backup.timer" /etc/systemd/system/uniplanner-db-backup.timer
systemctl daemon-reload
systemctl enable --now uniplanner-db-backup.timer
systemctl --no-pager list-timers uniplanner-db-backup.timer
echo "Daily database backups enabled with 14-day retention."
