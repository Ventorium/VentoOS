#!/usr/bin/env bash
# create_icon.sh — Creates AppIcon.icns for VentoFS.app
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICON_DIR="${SCRIPT_DIR}/icon_tmp"
mkdir -p "$ICON_DIR"

# Generate PNG icons using Python
ICON_DIR="$ICON_DIR" python3 - << 'PYEOF'
import os, sys

icon_dir = os.environ['ICON_DIR']
sizes = [16, 32, 64, 128, 256, 512, 1024]

# Try Pillow first
try:
    from PIL import Image, ImageDraw
    has_pil = True
except ImportError:
    has_pil = False

if has_pil:
    for size in sizes:
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        margin = size // 10
        # Blue rounded background
        draw.rounded_rectangle(
            [margin, margin, size - margin, size - margin],
            radius=size // 6,
            fill=(41, 128, 185, 255)
        )
        # White drive shape
        cx, cy = size // 2, size // 2
        w = int(size * 0.5)
        h = int(size * 0.35)
        draw.rounded_rectangle(
            [cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2],
            radius=size // 15,
            fill=(255, 255, 255, 230)
        )
        # Connection dots
        r = max(1, size // 16)
        for dx in [-w // 4, 0, w // 4]:
            draw.ellipse([cx + dx - r, cy - r, cx + dx + r, cy + r], fill=(41, 128, 185, 255))
        img.save(os.path.join(icon_dir, f"icon_{size}x{size}.png"))
    print("Generated icons with PIL")
else:
    import struct, zlib

    def make_png(size, r, g, b):
        def chunk(name, data):
            crc = zlib.crc32(name + data) & 0xffffffff
            return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

        raw = b''
        for y in range(size):
            raw += b'\x00'
            for x in range(size):
                raw += bytes([r, g, b])
        ihdr = struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0)
        compressed = zlib.compress(raw)
        png = b'\x89PNG\r\n\x1a\n'
        png += chunk(b'IHDR', ihdr)
        png += chunk(b'IDAT', compressed)
        png += chunk(b'IEND', b'')
        return png

    for size in sizes:
        with open(os.path.join(icon_dir, f"icon_{size}x{size}.png"), 'wb') as f:
            f.write(make_png(size, 41, 128, 185))
    print("Generated placeholder icons (no PIL)")
PYEOF

# Create iconset directory
ICONSET="${SCRIPT_DIR}/AppIcon.iconset"
mkdir -p "$ICONSET"

cp "${ICON_DIR}/icon_16x16.png"     "${ICONSET}/icon_16x16.png"
cp "${ICON_DIR}/icon_32x32.png"     "${ICONSET}/icon_16x16@2x.png"
cp "${ICON_DIR}/icon_32x32.png"     "${ICONSET}/icon_32x32.png"
cp "${ICON_DIR}/icon_64x64.png"     "${ICONSET}/icon_32x32@2x.png"
cp "${ICON_DIR}/icon_128x128.png"   "${ICONSET}/icon_128x128.png"
cp "${ICON_DIR}/icon_256x256.png"   "${ICONSET}/icon_128x128@2x.png"
cp "${ICON_DIR}/icon_256x256.png"   "${ICONSET}/icon_256x256.png"
cp "${ICON_DIR}/icon_512x512.png"   "${ICONSET}/icon_256x256@2x.png"
cp "${ICON_DIR}/icon_512x512.png"   "${ICONSET}/icon_512x512.png"
cp "${ICON_DIR}/icon_1024x1024.png" "${ICONSET}/icon_512x512@2x.png"

mkdir -p "${SCRIPT_DIR}/Resources"
iconutil -c icns "$ICONSET" --output "${SCRIPT_DIR}/Resources/AppIcon.icns"

rm -rf "$ICONSET" "$ICON_DIR"
echo "AppIcon.icns created at Resources/AppIcon.icns"
