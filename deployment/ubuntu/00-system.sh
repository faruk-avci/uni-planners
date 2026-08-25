#!/usr/bin/env bash
set -Eeuo pipefail

[[ ${EUID} -eq 0 ]] || { echo "Run as root: sudo bash $0" >&2; exit 1; }

NODE_VERSION="${NODE_VERSION:-24.19.0}"
case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl xz-utils openssl rsync git \
  nginx postgresql postgresql-client ufw certbot python3-certbot-nginx

NODE_BASENAME="node-v${NODE_VERSION}-linux-${NODE_ARCH}"
NODE_PREFIX="/opt/${NODE_BASENAME}"
if [[ ! -x "${NODE_PREFIX}/bin/node" ]]; then
  work_dir="$(mktemp -d)"
  trap 'rm -rf -- "$work_dir"' EXIT
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_BASENAME}.tar.xz" \
    --output "${work_dir}/${NODE_BASENAME}.tar.xz"
  curl --fail --silent --show-error --location \
    "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
    --output "${work_dir}/SHASUMS256.txt"
  (cd "$work_dir" && grep " ${NODE_BASENAME}.tar.xz$" SHASUMS256.txt | sha256sum --check --strict -)
  tar -xJf "${work_dir}/${NODE_BASENAME}.tar.xz" -C /opt
fi

for binary in node npm npx corepack; do
  ln -sfn "${NODE_PREFIX}/bin/${binary}" "/usr/local/bin/${binary}"
done

systemctl enable --now postgresql nginx
node --version
npm --version
echo "System packages and verified Node.js ${NODE_VERSION} installed."
