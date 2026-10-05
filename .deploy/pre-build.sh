#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROJECT="$HOME/repos/git-viewer.git"
CHECKOUT_DIR="$SCRIPT_DIR/app_source"
mkdir -p "$CHECKOUT_DIR"
git --git-dir="$PROJECT" archive main | tar -x -C "$CHECKOUT_DIR"
