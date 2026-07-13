#!/usr/bin/env bash
# Ensure Tauri icons exist for desktop builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ICON_DIR="$ROOT/apps/desktop-tauri/src-tauri/icons"
SOURCE_PNG="$ICON_DIR/icon.png"

if [[ -f "$ICON_DIR/icon.png" && -f "$ICON_DIR/icon.ico" && -f "$ICON_DIR/icon.icns" ]]; then
  # Reject placeholder .icns that is actually a PNG (legacy generate script).
  if file "$ICON_DIR/icon.icns" 2>/dev/null | grep -qi 'PNG\|png'; then
    echo "Replacing placeholder icon.icns with a real icon set..."
  else
    echo "Tauri icons already present."
    exit 0
  fi
fi

mkdir -p "$ICON_DIR"

if [[ ! -f "$SOURCE_PNG" ]]; then
  python3 <<PY
import struct, zlib
from pathlib import Path
icon_dir = Path("$ICON_DIR")
icon_dir.mkdir(parents=True, exist_ok=True)

def png_chunk(tag, data):
    crc = zlib.crc32(tag + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

def write_png(path, size, rgb=(124, 58, 237)):
    r, g, b = rgb
    row = bytes([0] + [r, g, b] * size)
    raw = row * size
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    data = png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b"")
    path.write_bytes(b"\\x89PNG\\r\\n\\x1a\\n" + data)

write_png(icon_dir / "icon.png", 1024)
print("Wrote placeholder icon.png")
PY
fi

cd "$ROOT/apps/desktop-tauri"
npx --yes @tauri-apps/cli icon "$SOURCE_PNG" -o src-tauri/icons
echo "Generated Tauri icons via @tauri-apps/cli icon"
