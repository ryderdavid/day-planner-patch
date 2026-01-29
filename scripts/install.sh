#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLUGIN_NAME="day-planner-patch"
DEST="$HOME/Documents/Obsidian/Main/.obsidian/plugins/$PLUGIN_NAME"

cd "$PROJECT_DIR"

echo "Building $PLUGIN_NAME..."
npm run build

echo "Installing to $DEST..."
mkdir -p "$DEST"
cp main.js manifest.json "$DEST/"
[ -f styles.css ] && cp styles.css "$DEST/"

echo "✓ Installed $PLUGIN_NAME. Reload Obsidian to see changes."
