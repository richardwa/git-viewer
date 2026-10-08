#!/usr/bin/env bash
set -euo pipefail
SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# pin to latest on deploy 
LATEST=/home/my-repos/artifacts/git-viewer.art/main/latest
REAL="$(realpath "$LATEST")"
ln -sf "$REAL" "$HOME/deployment-target"
ls -al "$HOME/deployment-target"

# build image
podman build -f "$SRC_ROOT"/.deploy/Containerfile -t app "$HOME/app"

# install files to user systemd dir
SYSTEMD_DIR="$HOME/.config/containers/systemd"
mkdir -p "$SYSTEMD_DIR"
install -m 644 "$SRC_ROOT"/.deploy/app.container \
  "$SRC_ROOT"/.deploy/gitviewer-build.path \
  "$SRC_ROOT"/.deploy/gitviewer-build.service \
  "$SRC_ROOT"/.deploy/gitviewer-build.timer \
  "$SYSTEMD_DIR"

systemctl --user daemon-reload
# check ~/check-status-log.txt for syntax errors on reload

systemctl --user restart app.service
echo "restarted app.service"
