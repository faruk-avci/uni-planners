#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"

curl --fail --silent --show-error --max-time 15 "${BASE_URL}/" >/dev/null
health_json="$(curl --fail --silent --show-error --max-time 15 "${BASE_URL}/api/health")"

if [[ "$health_json" != *'"status":"ok"'* && "$health_json" != *'"status": "ok"'* ]]; then
  echo "Unexpected health response: ${health_json}" >&2
  exit 1
fi

echo "Healthy: ${BASE_URL}"
echo "$health_json"
