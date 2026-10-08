#!/usr/bin/env bash
# Deployment entry point — the only file the deployment system triggers
# (as ~/app/.deploy.sh). Safe to run repeatedly; initial install and every
# later deploy are the same run:
#
#   1. self-install: keep this script at ~/app/.deploy.sh and the unit
#      files at ~/app/.deploy/
#   2. write the quadlet units into ~/.config/containers/systemd/
#   3. pin the app to the current artifact build (point the stable
#      ~/app/current symlink at the resolved realpath of LATEST)
#   4. daemon-reload + restart app.service
#
# Key invariant: the ~/app/current symlink is the pin. Podman resolves the
# /APP mount through it at container creation, so plain restarts never move
# the build forward — only a run of this script does. Rollback = re-pin +
# restart.
set -euo pipefail

# where new artifacts are published (branch latest)
LATEST=/home/my-repos/artifacts/git-viewer.art/main/latest

SRC_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DEPLOY="$SRC_ROOT/.deploy"

APP_DIR="$HOME/app"
APP_SCRIPT="$APP_DIR/.deploy.sh"
APP_DEPLOY="$APP_DIR/.deploy"
QUADLET_DIR="$HOME/.config/containers/systemd"

# 1. self-install: script at ~/app/.deploy.sh, unit files at ~/app/.deploy
#    (skip when already running from the installed copy)
if [[ "$SRC_ROOT" != "$APP_DIR" ]]; then
  cp -a "$SRC_DEPLOY" "$APP_DEPLOY"
  cp "$SRC_ROOT/.deploy.sh" "$APP_SCRIPT"
  chmod 755 "$APP_SCRIPT"
fi

# 2. quadlet units
mkdir -p "$QUADLET_DIR"
install -m 644 "$SRC_DEPLOY"/app.container \
  "$SRC_DEPLOY"/gitviewer-build.path \
  "$SRC_DEPLOY"/gitviewer-build.service \
  "$SRC_DEPLOY"/gitviewer-build.timer \
  "$QUADLET_DIR"/

# 3. pin the current artifact: point the stable ~/app/current symlink at
#    the resolved build. Podman resolves the mount through the symlink at
#    container creation, so restarts stay on the last-deployed build until
#    the next run of this script moves it.
REAL="$(realpath "$LATEST")"
if [[ ! -d "$REAL" ]]; then
  echo "artifact not found: $LATEST -> $REAL" >&2
  exit 1
fi
ln -sfn "$REAL" "$APP_DIR/current"
echo "pinned: $LATEST -> $REAL ($APP_DIR/current)"

# 4. apply: regenerate units, enable everything (idempotent), then bring
#    the running app onto the pinned build
systemctl --user daemon-reload
systemctl --user enable --now app.service gitviewer-build.path gitviewer-build.timer
systemctl --user restart app.service
echo "restarted app.service"
