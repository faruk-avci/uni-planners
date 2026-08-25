#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0 /path/to/repository" >&2; exit 1; }
SOURCE_DIR="${1:-$(pwd)}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

bash "${SCRIPT_DIR}/20-application.sh" "$SOURCE_DIR"
bash "${SCRIPT_DIR}/25-scraper.sh"
nginx -t
systemctl reload nginx
bash "${SCRIPT_DIR}/health-check.sh" "http://127.0.0.1"
echo "UniPlanner updated successfully."
