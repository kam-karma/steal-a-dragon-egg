"""Builds the CrazyGames covers: the title logo over real in-game renders.

The renders come from the game itself (dev hook __game.snap() at 1920x1080, 1000x1500 and 1200x1200),
so the covers show the actual 3D characters, dragon and cave the player will see.

Usage: python -I tools/make_covers.py <wide> <tall> <square> <logo> <out dir>
Writes cover_1920x1080.png (logo top-right, clear of the portal's top-left labels),
cover_800x1200.png (logo top-centre, below the label zone) and cover_800x800.png (logo top-right, beside the dragon).
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


def stamp(bg: Image.Image, logo: Image.Image, width_frac: float, top_frac: float, centre_x: float = 0.5) -> Image.Image:
    lw = round(bg.width * width_frac)
    l = logo.resize((lw, round(logo.height * lw / logo.width)), Image.LANCZOS)
    out = bg.convert('RGBA')
    out.alpha_composite(l, (round(bg.width * centre_x - lw / 2), round(bg.height * top_frac)))
    return out.convert('RGB')


def main() -> None:
    wide, tall, square, logo_path, out = (Path(a) for a in sys.argv[1:6])
    logo = Image.open(logo_path).convert('RGBA')
    out.mkdir(parents=True, exist_ok=True)
    w = Image.open(wide).convert('RGB')
    stamp(fill(w, 1920, 1080), logo, 0.34, 0.03, 0.80).save(out / 'cover_1920x1080.png')
    t = Image.open(tall).convert('RGB')
    stamp(fill(t, 800, 1200), logo, 0.80, 0.095).save(out / 'cover_800x1200.png')
    q = Image.open(square).convert('RGB')
    stamp(fill(q, 800, 800), logo, 0.42, 0.09, 0.76).save(out / 'cover_800x800.png')


if __name__ == '__main__':
    main()
