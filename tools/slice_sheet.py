"""Cut a generated icon sheet (icons on a green background) into transparent PNGs.

python tools/slice_sheet.py <sheet.png> <rows> <cols> <out_dir> name1 name2 ...

The background is removed by flood-filling from each cell's border, so greens
inside an icon (a clover in a potion, leaves) survive. Edges get green spill removed.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image

sheet, rows, cols, out_dir, *names = sys.argv[1:]
rows, cols = int(rows), int(cols)
out = Path(out_dir)
out.mkdir(parents=True, exist_ok=True)
img = Image.open(sheet).convert('RGBA')
W, H = img.size
cw, ch = W / cols, H / rows


def is_bg(p):
    r, g, b, _ = p
    return g > 60 and g > r * 1.35 and g > b * 1.35


for idx, name in enumerate(names):
    rr, cc = divmod(idx, cols)
    inset = 10  # skip grid lines between cells
    box = (int(cc * cw) + inset, int(rr * ch) + inset, int((cc + 1) * cw) - inset, int((rr + 1) * ch) - inset)
    cell = img.crop(box)
    w, h = cell.size
    px = cell.load()
    seen = bytearray(w * h)
    q = deque([(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)])
    while q:
        x, y = q.popleft()
        i = y * w + x
        if seen[i] or not is_bg(px[x, y]):
            continue
        seen[i] = 1
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx]:
                q.append((nx, ny))
    # De-spill: pixels next to removed background lose their green tint and get softened.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            near = any(0 <= x + dx < w and 0 <= y + dy < h and px[x + dx, y + dy][3] == 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if near and g > max(r, b):
                px[x, y] = (r, max(r, b), b, 140)
    bbox = cell.getbbox()
    if bbox:
        cell = cell.crop(bbox)
    cell.thumbnail((256, 256), Image.LANCZOS)
    cell.save(out / f'{name}.png', optimize=True)
    print('saved', name, cell.size)
