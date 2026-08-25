#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo DOMAIN=uniplanner.org bash $0" >&2; exit 1; }
DOMAIN="${DOMAIN:-uniplanner.org}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET="/etc/nginx/sites-available/${DOMAIN}"
PANEL_TARGET="/etc/nginx/sites-available/panel.${DOMAIN}"
PROXY_HASH_TARGET="/etc/nginx/conf.d/uniplanner-proxy-hash.conf"

sed "s/__DOMAIN__/${DOMAIN}/g" "${SCRIPT_DIR}/nginx/uniplanner.org.conf.template" > "$TARGET"
sed "s/__DOMAIN__/${DOMAIN}/g" "${SCRIPT_DIR}/nginx/panel.uniplanner.org.conf.template" > "$PANEL_TARGET"
cat > "$PROXY_HASH_TARGET" <<'EOF'
proxy_headers_hash_max_size 1024;
proxy_headers_hash_bucket_size 128;
EOF
ln -sfn "$TARGET" "/etc/nginx/sites-enabled/${DOMAIN}"
ln -sfn "$PANEL_TARGET" "/etc/nginx/sites-enabled/panel.${DOMAIN}"
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo "Nginx enabled for ${DOMAIN} and panel.${DOMAIN}."
