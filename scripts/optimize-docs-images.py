#!/usr/bin/env python3
"""
Shrinks the README screenshots in docs/img after `pnpm docs:capture`.

Full-window captures (3200 px wide at 2x) are scaled to 1600 px; crops keep
their 2x density so they stay sharp on high-resolution screens. Every PNG is
reduced to a 256-colour palette, which keeps UI text crisp at a third of the
size. Needs Pillow (pip install pillow).
"""
import sys
from pathlib import Path

from PIL import Image

IMG = Path(__file__).resolve().parent.parent / "docs" / "img"
MAX_WIDTH = 1800
TARGET_WIDTH = 1600

total_before = total_after = 0
# With file names as arguments, only those are processed (re-quantising an
# already optimised image loses a little each time).
names = sys.argv[1:]
paths = [IMG / n for n in names] if names else sorted(IMG.glob("*.png"))
for path in paths:
    before = path.stat().st_size
    im = Image.open(path).convert("RGB")
    if im.width > MAX_WIDTH:
        im = im.resize((TARGET_WIDTH, round(im.height * TARGET_WIDTH / im.width)), Image.LANCZOS)
    im.quantize(colors=256, method=Image.Quantize.MEDIANCUT).save(path, "PNG", optimize=True)
    after = path.stat().st_size
    total_before += before
    total_after += after
    print(f"{path.name:40s} {before // 1024:6d} KB -> {after // 1024:5d} KB")
print(f"{'total':40s} {total_before // 1024:6d} KB -> {total_after // 1024:5d} KB")
