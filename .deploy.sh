#!/usr/bin/env bash
# Install deployment files from .deploy/ into their target locations.
#
# - Quadlet units (.container/.path/.service/.timer)   -> ~/.config/containers/systemd/
# - deploy.sh (pins the artifact + restarts the app)   -> ~/app/
#
# Run this on the deployment host after pulling the repo:
#   ./.deploy.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.deploy"
QUADLET_DIR="$HOME/.config/containers/systemd"
APP_DIR="$HOME/app"

mkdir -p "$QUADLET_DIR" "$APP_DIR"

# quadlet units
install -m 644 "$SRC_DIR"/app.container \
  "$SRC_DIR"/gitviewer-build.path \
  "$SRC_DIR"/gitviewer-build.service \
  "$SRC_DIR"/gitviewer-build.timer \
  "$QUADLET_DIR"/

# deploy script: resolves the `latest` artifact link into
# ~/app/deployment-target.env and restarts the app onto it
install -m 755 "$SRC_DIR"/deploy.sh "$APP_DIR"/deploy.sh

# pick up the new/changed units
systemctl --user daemon-reload

# enable + start the app and the build watchers
systemctl --user enable --now app.service
systemctl --user enable --now gitviewer-build.path gitviewer-build.timer

echo "deploy files installed:"
echo "  quadlet units      -> $QUADLET_DIR"
echo "  deploy script      -> $APP_DIR/deploy.sh   (run after each new artifact)"
[[ -f $APP_DIR/deployment-target.env ]] || echo "  NOTE: no deployment-target.env yet — run $APP_DIR/deploy.sh once to pin a build"
