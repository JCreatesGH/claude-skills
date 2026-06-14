#!/usr/bin/env python3
"""probe_image.py — inspect a game screenshot without eyeballing a downscaled thumbnail.

When you review a capture you often need to (a) confirm exact pixel dimensions, (b) zoom into one
HUD corner to read small text, or (c) measure the real colour of a region (is that "black void"
actually pure #000, or a dark-navy backdrop?). This does all three with only Pillow.

Usage:
  probe_image.py dims    SHOT.png
  probe_image.py crop    SHOT.png X1 Y1 X2 Y2 [OUT.png] [SCALE]   # zoom a region (nearest-neighbour)
  probe_image.py color   SHOT.png X1 Y1 X2 Y2                     # mean RGB + min/max of a region

Install once:  python3 -m pip install pillow
"""
import sys
from PIL import Image


def dims(path):
    im = Image.open(path)
    print(f"{path}: {im.width}x{im.height} {im.mode}")


def crop(path, box, out=None, scale=2):
    im = Image.open(path).convert("RGB")
    x1, y1, x2, y2 = box
    region = im.crop((x1, y1, x2, y2))
    if scale != 1:
        region = region.resize((region.width * scale, region.height * scale), Image.NEAREST)
    out = out or path.rsplit(".", 1)[0] + f"_crop_{x1}_{y1}.png"
    region.save(out)
    print(f"wrote {out} ({region.width}x{region.height})")


def color(path, box):
    im = Image.open(path).convert("RGB")
    region = im.crop(tuple(box))
    px = list(region.getdata())
    n = len(px)
    mean = tuple(round(sum(c[i] for c in px) / n) for i in range(3))
    mn = tuple(min(c[i] for c in px) for i in range(3))
    mx = tuple(max(c[i] for c in px) for i in range(3))
    print(f"region {box}: mean rgb={mean}  min={mn}  max={mx}  (#%02x%02x%02x mean)" % mean)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == "dims":
        dims(path)
    elif cmd == "crop":
        box = list(map(int, sys.argv[3:7]))
        out = sys.argv[7] if len(sys.argv) > 7 else None
        scale = int(sys.argv[8]) if len(sys.argv) > 8 else 2
        crop(path, box, out, scale)
    elif cmd == "color":
        color(path, list(map(int, sys.argv[3:7])))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
