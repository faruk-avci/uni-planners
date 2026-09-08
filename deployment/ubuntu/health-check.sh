#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${1:-http://127.0.0.1}"
BASE_URL="${BASE_URL%/}"
ORIGIN_IP="${2:-}"
MAX_ATTEMPTS="${HEALTH_CHECK_ATTEMPTS:-10}"
RETRY_DELAY_S="${HEALTH_CHECK_RETRY_DELAY:-2}"

curl_args=(--fail --silent --show-error --max-time 15)
if [[ -n "$ORIGIN_IP" ]]; then
  origin_host="${BASE_URL#*://}"
  origin_host="${origin_host%%/*}"
  origin_host="${origin_host%%:*}"
  origin_port=80
  [[ "$BASE_URL" == https://* ]] && origin_port=443
  curl_args+=(--resolve "${origin_host}:${origin_port}:${ORIGIN_IP}")
fi

# A service that was just (re)started can take a few seconds to bind its port
# and finish startup queries. Retry instead of failing on the first request so
# callers running this right after `systemctl restart` don't see a
# false-alarm failure while the process is still coming up.
health_json=""
for (( attempt = 1; attempt <= MAX_ATTEMPTS; attempt++ )); do
  if curl "${curl_args[@]}" "${BASE_URL}/" >/dev/null 2>&1; then
    health_json="$(curl "${curl_args[@]}" "${BASE_URL}/api/health" 2>/dev/null || true)"
    if [[ "$health_json" == *'"status":"ok"'* || "$health_json" == *'"status": "ok"'* ]]; then
      echo "Healthy: ${BASE_URL}${ORIGIN_IP:+ (origin ${ORIGIN_IP})}"
      echo "$health_json"
      exit 0
    fi
  fi
  [[ $attempt -lt $MAX_ATTEMPTS ]] && sleep "$RETRY_DELAY_S"
done

echo "Still unhealthy after ${MAX_ATTEMPTS} attempts (last response: ${health_json:-none}): ${BASE_URL}" >&2
exit 1
