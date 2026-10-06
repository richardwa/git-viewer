#!/bin/sh
# Install the git-viewer build units as systemd USER units on the host.
#
#   REPOS_DIR=/path/to/repos PROJECT_DIR=/path/to/git-viewer .deploy/install.sh
#
# REPOS_DIR must be the host-side path of the repos dir (the same directory
# the viewer container mounts). PROJECT_DIR defaults to the directory this
# script lives in.
set -e

REPOS_DIR="${REPOS_DIR:-$HOME/repos}"
PROJECT_DIR="${PROJECT_DIR:-"$(cd "$(dirname "$0")/.." && pwd)"}"
BUN="${BUN:-$(command -v bun)}"
UNIT_DIR="${UNIT_DIR:-${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user}"

mkdir -p "$UNIT_DIR"
for unit in gitviewer-build.service gitviewer-build.path gitviewer-build.timer; do
  sed -e "s|__PROJECT__|$PROJECT_DIR|g" \
      -e "s|__REPOS_DIR__|$REPOS_DIR|g" \
      -e "s|__BUN__|$BUN|g" \
      "$(dirname "$0")/$unit" > "$UNIT_DIR/$unit"
  echo "installed $UNIT_DIR/$unit"
done

systemctl --user daemon-reload
systemctl --user enable --now gitviewer-build.path gitviewer-build.timer
echo
echo "enabled: gitviewer-build.path (fswatcher) + gitviewer-build.timer (2min fallback)"
echo "status:  systemctl --user status gitviewer-build.path gitviewer-build.timer"
echo "journal: journalctl --user -u gitviewer-build.service -f"