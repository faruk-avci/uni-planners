#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root with DOMAIN and EMAIL" >&2; exit 1; }
DOMAIN="${DOMAIN:-uniplanner.org}"
EMAIL="${EMAIL:?Set EMAIL before running install-all.sh}"
SOURCE_DIR="${1:-$(pwd)}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

DOMAIN="$DOMAIN" bash "${SCRIPT_DIR}/00-system.sh"
DOMAIN="$DOMAIN" bash "${SCRIPT_DIR}/10-database.sh"
bash "${SCRIPT_DIR}/20-application.sh" "$SOURCE_DIR"
bash "${SCRIPT_DIR}/25-scraper.sh"
DOMAIN="$DOMAIN" bash "${SCRIPT_DIR}/30-nginx.sh"
DOMAIN="$DOMAIN" EMAIL="$EMAIL" bash "${SCRIPT_DIR}/40-tls.sh"
bash "${SCRIPT_DIR}/50-firewall.sh"
bash "${SCRIPT_DIR}/60-backups.sh"
bash "${SCRIPT_DIR}/health-check.sh" "https://${DOMAIN}"
