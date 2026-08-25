#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
ORIGIN_IP="${2:-}"

curl_args=(--fail --silent --show-error --max-time 15)
if [[ -n "$ORIGIN_IP" ]]; then
  origin_host="${BASE_URL#*://}"
  origin_host="${origin_host%%/*}"
  origin_host="${origin_host%%:*}"
  origin_port=80
  [[ "$BASE_URL" == https://* ]] && origin_port=443
  curl_args+=(--resolve "${origin_host}:${origin_port}:${ORIGIN_IP}")
fi

curl "${curl_args[@]}" "${BASE_URL}/" >/dev/null
health_json="$(curl "${curl_args[@]}" "${BASE_URL}/api/health")"

if [[ "$health_json" != *'"status":"ok"'* && "$health_json" != *'"status": "ok"'* ]]; then
  echo "Unexpected health response: ${health_json}" >&2
  exit 1
fi

echo "Healthy: ${BASE_URL}${ORIGIN_IP:+ (origin ${ORIGIN_IP})}"
echo "$health_json"
