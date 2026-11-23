"""Turn the PC harness snapshots (test/frontend.c) into screenshots.

    python3 test/render_frames.py SHOTDIR [--sheet sheet.png]

Each SHOTDIR/NAME.txt becomes SHOTDIR/NAME.png at 2x, drawn with the real
art from src/assets/gfx and the palettes the game uploaded.  It also checks
the Neo Geo limit of 96 sprites on one scanline (exit code 1 if over).
"""
import glob, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'tools'))
import make_art  # noqa: E402  (role and key colours)

GFX = os.path.join(HERE, '..', 'src', 'assets', 'gfx')
MAG = (255, 0, 255)
FIX = Image.open(os.path.join(GFX, 'fix', 'tiles.png')).convert('RGB')
BG = Image.open(os.path.join(GFX, 'bg.png')).convert('RGB')
GLY = Image.open(os.path.join(GFX, 'glyphs.png')).convert('RGB')
ROLE = {c: r for r, c in enumerate(make_art.REF) if c}
SWAP = {3: 12, 12: 3}                 # the harness swaps these two palette slots
BG_KEYS = {c: 1 + k for k, c in enumerate(make_art.BG_PHASE)}
BG_KEYS[make_art.BG_VLINE] = 7
BG_KEYS[make_art.BG_FLOOR] = 8


def ng(w):
    r = ((w >> 7) & 0x1e) | ((w >> 14) & 1)
    g = ((w >> 3) & 0x1e) | ((w >> 13) & 1)
    b = ((w << 1) & 0x1e) | ((w >> 12) & 1)
    return (r << 3 | r >> 2, g << 3 | g >> 2, b << 3 | b >> 2)


def render(path):
    pals, sprs, fix, pict = {}, [], [], None
    bg = (0, 0, 0)
    for line in open(path):
        p = line.split()
        if p[0] == 'bg': bg = ng(int(p[1], 16))
        elif p[0] == 'pal': pals[int(p[1])] = [int(v, 16) for v in p[2:]]
        elif p[0] == 'pict': pict = [int(v) for v in p[1:]]
        elif p[0] == 'spr':
            h = int(p[4]); w = [int(v, 16) for v in p[5:5 + 2 * h]]
            sprs.append((int(p[2]), int(p[3]), list(zip(w[0::2], w[1::2]))))
        elif p[0] == 'fix': fix.append([int(v, 16) for v in p[1:]])
    im = Image.new('RGB', (320, 224), bg)
    lines = [0] * 224
    if pict:
        pal = pals.get(pict[1], [0] * 16)
        src = BG.load(); dst = im.load()
        for y in range(224):
            for x in range(320):
                c = src[x, y]
                if c == MAG: continue
                k = BG_KEYS.get(c)
                dst[x, y] = ng(pal[k]) if k else c
            lines[y] += 20
    for x, y, tiles in sprs:
        for row, (t, a) in enumerate(tiles):
            idx = t & 0x3ff
            col, r = idx // 2, idx % 2
            tile = GLY.crop((col * 16, r * 16, col * 16 + 16, r * 16 + 16))
            mask = Image.eval(tile.convert('L'), lambda v: 255)
            px = tile.load()
            m = mask.load()
            for yy in range(16):
                for xx in range(16):
                    if px[xx, yy] == MAG: m[xx, yy] = 0
            im.paste(tile, (x, y + row * 16), mask)
            for yy in range(max(0, y + row * 16), min(224, y + row * 16 + 16)): lines[yy] += 1
    dst = im.load(); src = FIX.load()
    for row, words in enumerate(fix):
        for col, w in enumerate(words):
            if (w & 0xf00) != 0x300: continue
            t, pal = w & 0xff, pals.get(w >> 12)
            if not pal: continue
            ox, oy = (t % 16) * 8, (t // 16) * 8
            for yy in range(8):
                for xx in range(8):
                    c = src[ox + xx, oy + yy]
                    if c == MAG: continue
                    r = ROLE.get(c)
                    if r is None: continue
                    dst[col * 8 + xx, row * 8 + yy] = ng(pal[SWAP.get(r, r)])
    return im.resize((640, 448), Image.NEAREST), max(lines)


def main():
    d = sys.argv[1]
    sheet = sys.argv[sys.argv.index('--sheet') + 1] if '--sheet' in sys.argv else None
    shots, bad = [], 0
    for path in sorted(p for p in glob.glob(os.path.join(d, '*.txt')) if os.path.basename(p) != 'sounds.txt'):
        im, peak = render(path)
        name = os.path.basename(path)[:-4]
        im.save(os.path.join(d, name + '.png'))
        flag = '  OVER THE LIMIT' if peak > 96 else ''
        bad += peak > 96
        print('%-22s peak %2d sprites on one line%s' % (name, peak, flag))
        shots.append((name, im))
    if sheet and shots:
        cols = 2
        rows = (len(shots) + cols - 1) // cols
        out = Image.new('RGB', (cols * 660, rows * 478), (24, 20, 32))
        dr = ImageDraw.Draw(out)
        for k, (name, im) in enumerate(shots):
            x, y = (k % cols) * 660 + 10, (k // cols) * 478 + 24
            out.paste(im, (x, y))
            dr.text((x, y - 16), name, fill=(240, 236, 255))
        out.save(sheet)
        print('wrote', sheet)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
