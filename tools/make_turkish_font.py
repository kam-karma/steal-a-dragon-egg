"""Add the Turkish letters Lilita One lacks (Ş ş İ Ğ ğ) using the font's own shapes.

python tools/make_turkish_font.py

Lilita One (SIL OFL 1.1) has no Ş, ş, İ, Ğ, ğ: browsers draw them from a fallback font.
We build them: S/s + the font's cedilla, I + the dot of i, G/g + a breve drawn to match.
Output: src/assets/fonts/lilita-one-tr.woff2 (the OFL allows modified versions; the font
keeps its OFL licence; Reserved Font Name: none declared, but the family is renamed anyway).
"""
import math
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

SRC = Path('node_modules/@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2')
OUT = Path('src/assets/fonts/lilita-one-tr.woff2')

font = TTFont(SRC)
glyphs = font.getGlyphSet()
glyf = font['glyf']
hmtx = font['hmtx']
cmap = font.getBestCmap()


def contours(name):
    """Each contour of a glyph as a list of pen operations."""
    rec = RecordingPen()
    glyphs[name].draw(rec)
    out, cur = [], []
    for op in rec.value:
        cur.append(op)
        if op[0] in ('closePath', 'endPath'):
            out.append(cur)
            cur = []
    return out


def bounds(ops_list):
    pen = BoundsPen(glyphs)
    for ops in ops_list:
        for op, args in ops:
            getattr(pen, op)(*args)
    return pen.bounds


def replay(pen, ops_list, dx=0, dy=0):
    tp = TransformPen(pen, (1, 0, 0, 1, dx, dy))
    for ops in ops_list:
        for op, args in ops:
            getattr(tp, op)(*args)


def add(char, base, mark_ops, mark_dx, mark_dy):
    name = f'uni{ord(char):04X}'
    pen = TTGlyphPen(None)
    replay(pen, contours(base))
    replay(pen, mark_ops, mark_dx, mark_dy)
    glyf[name] = pen.glyph()
    hmtx[name] = hmtx[base]
    for table in font['cmap'].tables:
        if table.isUnicode():
            table.cmap[ord(char)] = name
    print('added', char, name)


def centre_x(name):
    b = bounds(contours(name))
    return (b[0] + b[2]) / 2


# Cedilla: the font's own, centred under the letter like in Ç.
ced = contours('cedilla')
cb = bounds(ced)
ced_cx = (cb[0] + cb[2]) / 2
for char, base in (('Ş', 'S'), ('ş', 's')):
    add(char, base, ced, centre_x(base) - ced_cx, 0)

# Dot: the top contour of i, lifted above the capital I by the same gap it has above the stem.
i_parts = contours('i')
dot = max(i_parts, key=lambda c: bounds([c])[1])
stem_top = min(bounds([c])[3] for c in i_parts if c is not dot)
db = bounds([dot])
gap = db[1] - stem_top
I_top = bounds(contours('I'))[3]
add('İ', 'I', [dot], centre_x('I') - (db[0] + db[2]) / 2, I_top + gap - db[1])


# Breve: a thick crescent sized like the dot's width x2, drawn as a polygon.
def breve(cx, base_y, width, thick):
    r_out = width / 2
    r_in = r_out - thick
    pts_out = [(cx + r_out * math.cos(a), base_y + r_out + r_out * math.sin(a)) for a in [math.pi + k * math.pi / 16 for k in range(17)]]
    pts_in = [(cx + r_in * math.cos(a), base_y + r_out + r_in * math.sin(a)) for a in [2 * math.pi - k * math.pi / 16 for k in range(17)]]
    pts = pts_out + pts_in
    ops = [('moveTo', ((round(pts[0][0]), round(pts[0][1])),))]
    ops += [('lineTo', ((round(x), round(y)),)) for x, y in pts[1:]]
    ops.append(('closePath', ()))
    return [ops]


bw = (db[2] - db[0]) * 2.1
thick = (db[3] - db[1]) * 0.62
G_top = bounds(contours('G'))[3]
g_top = bounds(contours('g'))[3]
add('Ğ', 'G', breve(centre_x('G'), G_top + gap * 0.9, bw, thick), 0, 0)
add('ğ', 'g', breve(centre_x('g'), g_top + gap, bw, thick), 0, 0)

font.setGlyphOrder(list(glyf.glyphOrder))

# Rename so it never clashes with a system-installed Lilita One.
for rec in font['name'].names:
    if rec.nameID in (1, 4, 16):
        rec.string = 'Lilita One TR'
    if rec.nameID == 6:
        rec.string = 'LilitaOneTR-Regular'
OUT.parent.mkdir(parents=True, exist_ok=True)
font.flavor = 'woff2'
font.save(OUT)
print('saved', OUT, OUT.stat().st_size)
