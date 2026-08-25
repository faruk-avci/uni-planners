#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root with DOMAIN and EMAIL" >&2; exit 1; }
DOMAIN="${DOMAIN:-uniplanner.org}"
EMAIL="${EMAIL:?Set EMAIL for Let's Encrypt notices}"

certbot --nginx --non-interactive --agree-tos --redirect \
  --email "$EMAIL" -d "$DOMAIN" -d "www.${DOMAIN}" -d "panel.${DOMAIN}"
certbot renew --dry-run
echo "TLS enabled and renewal verified."
