#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"
[ "$(uname -m)" = arm64 ] || { echo 'This installer is for Apple Silicon Macs.'; exit 1; }
mkdir -p .runtime/media
python3 -m venv .runtime/bootstrap
.runtime/bootstrap/bin/pip install --no-cache-dir uv
export UV_CACHE_DIR="$ROOT/.runtime/uv-cache"
export UV_PYTHON_INSTALL_DIR="$ROOT/.runtime/uv-python"
.runtime/bootstrap/bin/uv venv --python 3.11 .runtime/venv
.runtime/bootstrap/bin/uv pip install --python .runtime/venv/bin/python -r backend/requirements.txt
curl -fL https://github.com/prefix-dev/pixi/releases/latest/download/pixi-aarch64-apple-darwin.tar.gz -o .runtime/pixi.tar.gz
tar -xzf .runtime/pixi.tar.gz -C .runtime
cat > .runtime/media/pixi.toml <<'TOML'
[workspace]
name = "nightwatch-media"
channels = ["conda-forge"]
platforms = ["osx-arm64"]
[dependencies]
ffmpeg = "9.0.2.*"
TOML
PIXI_HOME="$ROOT/.runtime/pixi-home" PIXI_CACHE_DIR="$ROOT/.runtime/pixi-cache" XDG_CACHE_HOME="$ROOT/.runtime/cache" .runtime/pixi install --manifest-path .runtime/media/pixi.toml
(cd backend && ../.runtime/venv/bin/python -m nightwatch.fetch_model ../models/yolo11n.pt)
echo 'Dependencies ready. Configure .env (repository root) privately, then run scripts/run-local.sh worker.'
