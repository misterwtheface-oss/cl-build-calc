#!/usr/bin/env python3
"""Trim fully-transparent margins from tile icons so they fill their container.

The game's building/item sprites are cropped out of atlases onto a fixed canvas
(e.g. 13x26) with the art sitting low and a tall transparent "sky" header. In a
square icon box that padding reads as the icon not filling — the building looks
small and off-centre. Trimming the transparent border leaves near-square content
(median W/H ~0.90) that `object-fit: contain` fills cleanly, with no distortion
and no cropping of the art.

Lossless for content (only fully/near-transparent edge pixels are removed) and
idempotent (re-running a trimmed image is a no-op). Source of truth remains the
_cl_extract catalog — re-copy from there to undo.

Usage:  python tools/trim_icons.py
"""
import os
import glob
from PIL import Image

# Icon folders surfaced in tiles/detail overlays. Guild badges/banners and
# counselor portraits are intentionally excluded (chrome / cover-fit portraits).
DIRS = ["assets/buildings", "assets/buildings_tiny", "assets/nature", "assets/items"]
ALPHA_THRESHOLD = 8  # treat <=this alpha as transparent when finding the bbox

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def trim(path):
    im = Image.open(path).convert("RGBA")
    # bbox over the alpha channel thresholded, so near-transparent fringe counts as empty
    mask = im.getchannel("A").point(lambda a: 255 if a > ALPHA_THRESHOLD else 0)
    bbox = mask.getbbox()
    if not bbox:
        return False  # fully transparent — leave untouched
    if bbox == (0, 0, im.width, im.height):
        return False  # already tight
    im.crop(bbox).save(path)
    return True


def main():
    total = trimmed = 0
    for d in DIRS:
        full = os.path.join(ROOT, d)
        if not os.path.isdir(full):
            continue
        for f in sorted(glob.glob(os.path.join(full, "*.png"))):
            total += 1
            try:
                if trim(f):
                    trimmed += 1
            except Exception as e:  # noqa: BLE001 — report and continue
                print(f"  skip {os.path.relpath(f, ROOT)}: {e}")
    print(f"trimmed {trimmed} / {total} icons")


if __name__ == "__main__":
    main()
