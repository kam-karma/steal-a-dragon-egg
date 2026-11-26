"""Builds the CrazyGames covers: the title logo over generated key art.

Usage: python -I tools/make_covers.py <wide art> <tall art> <logo> <out dir>
Writes cover_1920x1080.png, cover_800x1200.png and cover_800x800.png (square cut from the wide art).
"""
import sys
from pathlib import Path

from PIL import Image


def fill(im: Image.Image, w: int, h: int, focus_y: float = 0.5) -> Image.Image:
    """Scales to cover w x h, then crops; focus_y picks which part of the height is kept."""
    s = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x = (r.width - w) // 2
    y = round((r.height - h) * focus_y)
    return r.crop((x, y, x + w, y + h))


def stamp(bg: Image.Image, logo: Image.Image, width_frac: float, top_frac: float) -> Image.Image:
    lw = round(bg.width * width_frac)
    l = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    out = bg.convert('RGBA')
    out.alpha_composite(l, ((bg.width - lw) // 2, round(bg.height * top_frac)))
    return out.convert('RGB')


def main() -> None:
    wide, tall, logo_path, out = (Path(a) for a in sys.argv[1:5])
    logo = Image.open(logo_path).convert('RGBA')
    w = Image.open(wide).convert('RGB')
    t = Image.open(tall).convert('RGB')
    out.mkdir(parents=True, exist_ok=True)
    stamp(fill(w, 1920, 1080), logo, 0.40, 0.02).save(out / 'cover_1920x1080.png')
    stamp(fill(t, 800, 1200, 0.0), logo, 0.82, 0.03).save(out / 'cover_800x1200.png')
    sq = w.crop(((w.width - w.height) // 2, 0, (w.width + w.height) // 2, w.height))
    stamp(fill(sq, 800, 800), logo, 0.62, 0.02).save(out / 'cover_800x800.png')


if __name__ == '__main__':
    main()
