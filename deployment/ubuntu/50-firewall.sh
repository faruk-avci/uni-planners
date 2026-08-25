#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }
SSH_PORT="${SSH_PORT:-22}"
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] && (( SSH_PORT >= 1 && SSH_PORT <= 65535 )) || {
  echo "SSH_PORT must be between 1 and 65535" >&2; exit 1;
}

ufw allow "${SSH_PORT}/tcp"
ufw allow 'Nginx Full'
ufw --force enable
ufw status verbose
echo "Opened SSH ${SSH_PORT}/tcp plus HTTP/HTTPS. This script does not expose Node 3001 or PostgreSQL 5432."
