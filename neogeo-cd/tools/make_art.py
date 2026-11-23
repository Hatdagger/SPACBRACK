"""Make the Neo Geo CD art for SPACBRACK from the web prototype's look.

    python3 tools/make_art.py

Everything is drawn the way js/gfx.js and js/battle.js drew it on the web
(same palette, same 5x7 pixel font, same bricks), so the disc looks like the
prototype.  Output, under src/assets/gfx/:

  fix/tiles.png   128x128 fix-layer bank (16x16 tiles of 8x8): the font,
                  LED digits, bricks, ghost, field cells, bezel pieces.
                  Painted in "role" colours: the game recolours each role
                  per palette at boot (e.g. role 1 = brick colour), so one
                  brick tile serves all seven bricks.
  bg.png          320x224 backdrop: starfield, perspective floor grid, VHS
                  stripes.  The floor's horizontal lines are painted in six
                  key colours; the game lights one set at a time (palette
                  cycling) so the floor scrolls like the prototype's.
  glyphs.png      chrome logo letters (banded gradient + outline + shadow),
                  32x32 each, for the title, the countdown and PAUSED.

It also writes src/art_keys.h with the role and key colours, so the game
and this tool always agree.  Magenta (#FF00FF) is transparent.
"""
import json, os, random
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'src'))
GFX = os.path.join(SRC, 'assets', 'gfx')
MAG = (255, 0, 255)

FONT = json.load(open(os.path.join(HERE, 'font_big.json')))


def hexc(s):
    s = s.lstrip('#')
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


def snap(c):
    """to a colour the Neo Geo shows exactly (5 bits per channel)"""
    return tuple((v >> 3) << 3 for v in c)


def shade(c, amt):
    """js/gfx.js G.shade: amt < 0 darkens, > 0 lightens"""
    def f(v):
        return max(0, min(255, round(v * (1 + amt) if amt < 0 else v + (255 - v) * amt)))
    return tuple(f(v) for v in c)


# ---------------------------------------------------------------- fix roles
# Role colours as painted in tiles.png (a reference palette: the J brick and
# amber text).  Each must be a distinct 5-bit colour.
ROLE_NAMES = ['', 'brick', 'brick_hi', 'brick_lo', 'brick_mid', 'spark', 'text', 'black',
              'steel', 'steel_hi', 'steel_lo', 'field', 'grid', 'inset', 'led_dim', 'gauge']
J = hexc('#2fe0ff')
REF = [None, J, shade(J, .55), shade(J, -.5), shade(J, -.2), (255, 255, 255), hexc('#ffb21e'), (0, 0, 0),
       hexc('#3a3f52'), hexc('#5d6580'), hexc('#1d2030'), hexc('#05060c'), hexc('#161a2c'), hexc('#0a0d14'),
       hexc('#3d2a06'), hexc('#16080a')]
REF = [None] + [snap(c) for c in REF[1:]]
# black and the field are both very dark: keep them apart by at least one step
REF[11] = (0, 8, 16)
REF[15] = (24, 8, 8)
assert len(set(REF[1:])) == 15, 'fix role colours must all differ'

# The game's 14 fix palettes (2..15; NeoCore keeps 0 and 1): brick colour and
# text colour.  Palettes 2-8 are the seven bricks (I J L O S T Z, the web
# prototype's VHS colours), so text can be drawn in any brick colour too.
PALS = [None, None,
        ('#ff3fa4', '#ff3fa4'), ('#2fe0ff', '#2fe0ff'), ('#ffdc2e', '#ffdc2e'), ('#ff8a1e', '#ff8a1e'),
        ('#9d4dff', '#9d4dff'), ('#a6ff3a', '#a6ff3a'), ('#ff3b47', '#ff3b47'),
        ('#4a4858', '#8c8aa0'),   # 9  garbage brick / grey text
        ('#fff8ec', '#fff8ec'),   # 10 white (flashes) / white text
        ('#ffb21e', '#ffb21e'),   # 11 amber
        ('#5cff7a', '#5cff7a'),   # 12 green
        ('#f2e8cc', '#f2e8cc'),   # 13 beige
        ('#5d6580', '#5d6580'),   # 14 steel (dim labels)
        ('#3b6bff', '#3b6bff')]   # 15 blue


def pal_rgb(p):
    brick, text = hexc(PALS[p][0]), hexc(PALS[p][1])
    out = [(255, 0, 255), brick, shade(brick, .55), shade(brick, -.5), shade(brick, -.2), (255, 255, 255), text,
           (0, 0, 0), hexc('#3a3f52'), hexc('#5d6580'), hexc('#1d2030'), hexc('#05060c'), hexc('#161a2c'),
           hexc('#0a0d14'), shade(text, -.78), hexc('#16080a')]
    return [snap(c) for c in out]


# tile numbers in the bank
T_FONT = 0          # ASCII code = tile (32..95)
T_LED = 96          # '0'..'9' 96..105, ':' 106, '.' 107, '-' 108, ' ' 109
T_BRICK = 128
T_GHOST = 129
T_EMPTY = 130
T_INSET = 131
T_HALF_L = 132      # right half of a brick on the tile's left, inset on the right
T_HALF_R = 133      # inset on the left, left half of a brick on the right
T_HALF_LR = 134     # right half of one brick, left half of the next
T_TRAIL = 135       # hard drop trail (two frames: 135, 136)
T_BEZ = 140         # TL T TR L R BL B BR  (140..147)
T_BEZ_GAUGE = 148   # left bezel with the incoming-garbage bar lit
T_BLACK = 150
T_STEEL = 151
T_METER = 152       # right bezel with the card meter: track top/bottom, lit top/bottom (152..155)
T_BIG = 160         # big letters on the fix layer, 2x2 tiles each (TL TR BL BR)
BIGCHARS = '321GOPAUSEDK.!WINREY'


def font_glyph(ch):
    return FONT['g'].get(ch, FONT['g']['?'])


def make_fix():
    im = Image.new('RGB', (128, 128), MAG)
    px = im.load()

    def tile_origin(n):
        return (n % 16) * 8, (n // 16) * 8

    def put(n, x, y, role):
        ox, oy = tile_origin(n)
        if 0 <= x < 8 and 0 <= y < 8:
            px[ox + x, oy + y] = REF[role]

    def fill(n, role):
        for y in range(8):
            for x in range(8): put(n, x, y, role)

    # font: 5x7 glyph at (1,0), black shadow at +1,+1
    for code in range(32, 96):
        g = font_glyph(chr(code))
        for p, c in enumerate(g):
            if c == '#': put(code, 1 + p % 5 + 1, p // 5 + 1, 7)
        for p, c in enumerate(g):
            if c == '#': put(code, 1 + p % 5, p // 5, 6)
    # LED: dim "8" ghost behind each digit (web G.led)
    eight = font_glyph('8')
    for k, ch in enumerate('0123456789:.- '):
        n = T_LED + k
        if ch in '0123456789':
            for p, c in enumerate(eight):
                if c == '#': put(n, 1 + p % 5, p // 5, 14)
        if ch != ' ':
            for p, c in enumerate(font_glyph(ch)):
                if c == '#': put(n, 1 + p % 5, p // 5, 6)

    # brick (web G.brick, size 8)
    def brick(n, x0=0, x_from=0, x_to=8):
        for y in range(8):
            for x in range(8):
                r = 1
                if x == 7 or y == 7: r = 3
                elif x == 0 or y == 0: r = 2
                elif (y == 6 and 2 <= x <= 6) or (x == 6 and 2 <= y <= 6): r = 4
                if (x, y) in ((1, 1), (2, 1), (1, 2)): r = 5
                tx = x - x0
                if x_from <= tx < x_to: put(n, tx, y, r)
    brick(T_BRICK)
    # empty field cell: field colour with the grid dot at the top-left corner
    fill(T_EMPTY, 11); put(T_EMPTY, 0, 0, 12)
    # ghost: dotted outline in the brick colour over an empty cell (web ghostCell)
    fill(T_GHOST, 11); put(T_GHOST, 0, 0, 12)
    for y in range(8):
        for x in range(8):
            if (x in (0, 7) or y in (0, 7)) and (x + y) % 2 == 0: put(T_GHOST, x, y, 1)
    fill(T_INSET, 13)
    # half bricks for previews of 3-wide bricks (shifted half a cell)
    fill(T_HALF_L, 13); brick(T_HALF_L, x0=4, x_from=0, x_to=4)
    fill(T_HALF_R, 13); brick(T_HALF_R, x0=-4, x_from=4, x_to=8)
    fill(T_HALF_LR, 13); brick(T_HALF_LR, x0=4, x_from=0, x_to=4); brick(T_HALF_LR, x0=-4, x_from=4, x_to=8)
    # hard drop tail: a solid band in the brick colour just above where it
    # landed (T_TRAIL, next to the brick) and a thin one further up (T_TRAIL + 1)
    for k, band in enumerate((((1, 3), (2, 1), (3, 2), (4, 2), (5, 1), (6, 3)), ((3, 3), (4, 3)))):
        n = T_TRAIL + k
        fill(n, 11); put(n, 0, 0, 12)
        for x, role in band:
            for y in range(8): put(n, x, y, role)
    # bezel (web G.deck: steel, light top/left, dark bottom/right, black line at the field)
    bez = ['TL', 'T', 'TR', 'L', 'R', 'BL', 'B', 'BR']
    for k, kind in enumerate(bez):
        n = T_BEZ + k
        fill(n, 8)
        for y in range(8):
            for x in range(8):
                r = None
                if 'T' in kind and y == 0: r = 9
                if 'B' in kind and y == 7: r = 10
                if 'L' in kind and x == 0: r = 9 if 'B' not in kind or y < 7 else 10
                if 'R' in kind and x == 7: r = 10 if 'T' not in kind or y > 0 else 9
                # black line on the side that touches the field
                if kind == 'L' and x == 7: r = 7
                if kind == 'R' and x == 0: r = 7
                if kind == 'T' and y == 7: r = 7
                if kind == 'B' and y == 0: r = 7
                if kind == 'TL' and (x == 7 and y == 7): r = 7
                if kind == 'TR' and (x == 0 and y == 7): r = 7
                if kind == 'BL' and (x == 7 and y == 0): r = 7
                if kind == 'BR' and (x == 0 and y == 0): r = 7
                if r: put(n, x, y, r)
        if kind in ('TL', 'TR', 'BL', 'BR'):            # screws
            sx, sy = (2 if 'L' in kind else 4), (2 if 'T' in kind else 4)
            for dx in range(2):
                for dy in range(2): put(n, sx + dx, sy + dy, 10)
            put(n, sx, sy, 9)
        if kind == 'L':                                  # empty garbage gauge track
            for y in range(8):
                for x in (3, 4, 5): put(n, x, y, 15)
    n = T_BEZ_GAUGE
    for y in range(8):
        for x in range(8):
            px[tile_origin(n)[0] + x, tile_origin(n)[1] + y] = px[tile_origin(T_BEZ + 3)[0] + x, tile_origin(T_BEZ + 3)[1] + y]
    for y in range(8):
        for x in (3, 4, 5): put(n, x, y, 6)
    # card meter in the right bezel: 10 segments of 2 tiles, a 2-pixel gap on top of each
    for k in range(4):
        n = T_METER + k
        for y in range(8):
            for x in range(8):
                px[tile_origin(n)[0] + x, tile_origin(n)[1] + y] = px[tile_origin(T_BEZ + 4)[0] + x, tile_origin(T_BEZ + 4)[1] + y]
        for y in range(2 if k % 2 == 0 else 0, 8):
            for x in (2, 3, 4): put(n, x, y, 6 if k >= 2 else 15)
    fill(T_BLACK, 7)
    fill(T_STEEL, 8)
    # big letters (countdown, PAUSED, K.O.!): the 5x7 font at 2x with a black
    # outline over the field colour, shaded top to bottom in the brick roles
    for k, ch in enumerate(BIGCHARS):
        g = font_glyph(ch)
        cell = [[11] * 16 for _ in range(16)]
        on = set()
        for p, c in enumerate(g):
            if c == '#':
                for sy in range(2):
                    for sx in range(2): on.add((3 + (p % 5) * 2 + sx, 1 + (p // 5) * 2 + sy))
        for (x, y) in on:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if 0 <= x + dx < 16 and 0 <= y + dy < 16: cell[y + dy][x + dx] = 7
        for (x, y) in on:
            r = y - 1
            cell[y][x] = 5 if r < 2 else 2 if r < 5 else 1 if r < 9 else 4 if r < 12 else 3
        for q in range(4):
            n = T_BIG + k * 4 + q
            ox, oy = (q % 2) * 8, (q // 2) * 8
            for y in range(8):
                for x in range(8): put(n, x, y, cell[oy + y][ox + x])
    os.makedirs(os.path.join(GFX, 'fix'), exist_ok=True)
    im.convert('RGBA').save(os.path.join(GFX, 'fix', 'tiles.png'))


# ---------------------------------------------------------------- backdrop
STRIPES = ['#ff3b47', '#ff8a1e', '#ffdc2e', '#2fe0ff', '#9d4dff']
BG_STAR = snap(hexc('#5a5878'))
BG_STAR_HI = (248, 248, 248)
BG_FLOOR = snap(hexc('#0b0618'))
BG_VLINE = snap(shade(hexc('#2fe0ff'), -.35))
NPHASE = 6
# floor line key colours, one per phase (dark reds, never shown as painted)
BG_PHASE = [(40 + 8 * k, 0, 8) for k in range(NPHASE)]
BG_STRIPE = [snap(hexc(c)) for c in STRIPES]
FLOOR_Y, FLOOR_H = 150, 74


def make_bg():
    im = Image.new('RGB', (320, 224), MAG)
    px = im.load()
    rnd = random.Random(7)
    for _ in range(70):
        x, y = rnd.randrange(320), rnd.randrange(FLOOR_Y)
        px[x, y] = BG_STAR_HI if rnd.random() < .2 else BG_STAR
    for y in range(FLOOR_Y, 224):
        for x in range(320): px[x, y] = BG_FLOOR
    cx = 160
    for i in range(-12, 13):
        xb = cx + i * 40
        for r in range(FLOOR_H):
            x = int(cx + (xb - cx) * (r / FLOOR_H))
            if 0 <= x < 320: px[x, FLOOR_Y + r] = BG_VLINE
    for k in range(NPHASE - 1, -1, -1):
        for j in range(8):
            p = (j + k / NPHASE) / 8
            y = FLOOR_Y + int(p * p * FLOOR_H)
            for x in range(320): px[x, y] = BG_PHASE[k]
    # VHS stripes in the top corners (web G.stripes, 1 px bands, slant 1)
    for k, c in enumerate(BG_STRIPE):
        for x in range(0, 70 - k): px[x, k] = c
        for x in range(250 + k, 320): px[x, k] = c
    im.convert('RGBA').save(os.path.join(GFX, 'bg.png'))


# ---------------------------------------------------------------- chrome glyphs
GLYPHS = 'SPACBRKGOUED321!WIN'
BANDS = ['#fff8ec', '#ffe98a', '#ffdc2e', '#ff8a1e', '#ff3b47', '#c0207a', '#7a1a8a']
SCALE = 4


def make_glyphs():
    im = Image.new('RGB', (32 * len(GLYPHS), 32), MAG)
    px = im.load()
    H = 7 * SCALE
    bands = [snap(hexc(c)) for c in BANDS]
    for k, ch in enumerate(GLYPHS):
        g = font_glyph(ch)
        ox, oy = 32 * k + 1, 1

        def draw(dx, dy, colfn):
            for p, c in enumerate(g):
                if c != '#': continue
                gx, gy = p % 5, p // 5
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        x, y = ox + dx + gx * SCALE + sx, oy + dy + gy * SCALE + sy
                        if 32 * k <= x < 32 * k + 32 and 0 <= y < 32:
                            px[x, y] = colfn(gy * SCALE + sy)
        draw(2, 2, lambda r: (0, 0, 0))
        for d in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            draw(d[0] + 1, d[1] + 1, lambda r: (24, 8, 40))
        draw(1, 1, lambda r: bands[min(len(bands) - 1, r * len(bands) // H)])
    im.convert('RGBA').save(os.path.join(GFX, 'glyphs.png'))


# ---------------------------------------------------------------- header
def write_header():
    def c3(c): return '{ %3d, %3d, %3d }' % c
    out = ['/* Generated by tools/make_art.py - do not edit. */',
           '#ifndef TT_ART_KEYS_H', '#define TT_ART_KEYS_H', '',
           '/* fix tile numbers (bank 3) */']
    for name, val in [('T_LED', T_LED), ('T_BRICK', T_BRICK), ('T_GHOST', T_GHOST), ('T_EMPTY', T_EMPTY),
                      ('T_INSET', T_INSET), ('T_HALF_L', T_HALF_L), ('T_HALF_R', T_HALF_R),
                      ('T_HALF_LR', T_HALF_LR), ('T_TRAIL', T_TRAIL), ('T_BEZ', T_BEZ),
                      ('T_BEZ_GAUGE', T_BEZ_GAUGE), ('T_BLACK', T_BLACK), ('T_STEEL', T_STEEL), ('T_METER', T_METER),
                      ('T_BIG', T_BIG)]:
        out.append('#define %-12s %d' % (name, val))
    out += ['', '/* role colours painted in fix/tiles.png (index = role) */',
            'static const unsigned char ROLE_REF[16][3] = {', '    { 255, 0, 255 },']
    out += ['    %s,   /* %d %s */' % (c3(REF[k]), k, ROLE_NAMES[k]) for k in range(1, 16)]
    out += ['};', '', '/* fix palettes 2..15, by role (0, 1 unused) */',
            'static const unsigned char FIX_PAL_RGB[16][16][3] = {']
    for p in range(16):
        rows = pal_rgb(p) if PALS[p] else [(0, 0, 0)] * 16
        out.append('    { ' + ', '.join(c3(c) for c in rows) + ' },')
    out += ['};', '', '/* backdrop key colours (bg.png) */', '#define BG_NPHASE %d' % NPHASE,
            'static const unsigned char BG_PHASE_KEY[BG_NPHASE][3] = {']
    out += ['    %s,' % c3(c) for c in BG_PHASE]
    out += ['};', 'static const unsigned char BG_VLINE_KEY[3] = %s;' % c3(BG_VLINE),
            'static const unsigned char BG_FLOOR_KEY[3] = %s;' % c3(BG_FLOOR), '',
            '/* chrome letters in glyphs.png, 32x32 each */', '#define GLYPHS "%s"' % GLYPHS,
            '/* big fix-layer letters from T_BIG, 4 tiles each */', '#define BIGCHARS "%s"' % BIGCHARS, '', '#endif', '']
    open(os.path.join(SRC, 'art_keys.h'), 'w', newline='\n').write('\n'.join(out))


if __name__ == '__main__':
    make_fix()
    make_bg()
    make_glyphs()
    write_header()
    print('made fix/tiles.png, bg.png, glyphs.png and art_keys.h')
