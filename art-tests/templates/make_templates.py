# Builds the exact-size asset templates for the SPACBRACK art guide.
# Each template: 1x PNG (paint over it) + a 3x preview with the 16-px grid and its palette swatches.
# Run: python3 make_templates.py  (needs Pillow)
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
MAG = (248, 0, 248)  # transparent key


def snap(c):  # Neo Geo-ish: 5 bits per channel, steps of 8
    return tuple(min(248, (v // 8) * 8) for v in c)


def hx(s):
    s = s.lstrip('#')
    return snap(tuple(int(s[i:i + 2], 16) for i in (0, 2, 4)))


def ramp(base, n, lo=0.25, hi=1.35):
    b = hx(base)
    out = []
    for i in range(n):
        t = lo + (hi - lo) * i / max(1, n - 1)
        out.append(snap(tuple(int(max(0, min(255, v * t if t <= 1 else v + (255 - v) * (t - 1)))) for v in b)))
    return out


FONT = ImageFont.load_default()


def note(d, xy, s, fill=(248, 248, 248)):
    x, y = xy
    d.text((x + 1, y + 1), s, fill=(0, 0, 0), font=FONT)
    d.text((x, y), s, fill=fill, font=FONT)


def box(d, x, y, w, h, c, dash=False):
    if not dash:
        d.rectangle([x, y, x + w - 1, y + h - 1], outline=c)
        return
    for i in range(0, w, 4):
        d.line([x + i, y, x + min(i + 1, w - 1), y], fill=c)
        d.line([x + i, y + h - 1, x + min(i + 1, w - 1), y + h - 1], fill=c)
    for i in range(0, h, 4):
        d.line([x, y + i, x, y + min(i + 1, h - 1)], fill=c)
        d.line([x + w - 1, y + i, x + w - 1, y + min(i + 1, h - 1)], fill=c)


def save(name, img, pals, title, notes_fn=None):
    img.save(os.path.join(OUT, name + '.png'))
    S = 3
    w, h = img.size
    big = img.convert('RGB').resize((w * S, h * S), Image.NEAREST)
    g = Image.new('RGBA', big.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for x in range(0, w + 1, 16):
        gd.line([x * S, 0, x * S, h * S], fill=(255, 255, 255, 40))
    for y in range(0, h + 1, 16):
        gd.line([0, y * S, w * S, y * S], fill=(255, 255, 255, 40))
    big = Image.alpha_composite(big.convert('RGBA'), g)
    if notes_fn:
        nd = ImageDraw.Draw(big)
        notes_fn(nd, S)
    # header + palette strips
    sw = 14
    rows = len(pals)
    pad = 30 + rows * (sw + 6) + 8
    W = max(big.width, 16 * (sw + 2) + 140)
    sheet = Image.new('RGB', (W, big.height + pad), (18, 16, 28))
    sd = ImageDraw.Draw(sheet)
    note(sd, (6, 6), title, (248, 216, 48))
    sheet.paste(big, (0, 24))
    y0 = 24 + big.height + 8
    for k, (pname, cols) in enumerate(pals):
        y = y0 + k * (sw + 6)
        note(sd, (6, y + 2), pname[:20], (200, 200, 210))
        for i, c in enumerate(cols[:15]):
            sd.rectangle([130 + i * (sw + 2), y, 130 + i * (sw + 2) + sw - 1, y + sw - 1], fill=c, outline=(0, 0, 0))
        note(sd, (130 + 15 * (sw + 2) + 6, y + 2), '%d/15' % len(cols[:15]), (140, 140, 150))
    sheet.save(os.path.join(OUT, name + '_preview.png'))


# ---------------------------------------------------------------- 1. panorama
def panorama():
    W, H = 640, 176
    col = '#e8763a'
    wall = ramp('#3a3650', 6, 0.3, 1.2)
    acc = ramp(col, 6, 0.3, 1.3)
    floor = ramp('#24202e', 3, 0.5, 1.4)
    pal = wall + acc[:5] + floor + [hx('#f8f0d8')]
    img = Image.new('RGB', (W, H), wall[0])
    d = ImageDraw.Draw(img)
    vx, vy = 330, 96  # vanishing point
    # back wall
    d.rectangle([250, 50, 410, 140], fill=wall[1])
    # ceiling and floor planes
    d.polygon([(0, 0), (W, 0), (410, 50), (250, 50)], fill=wall[0])
    d.polygon([(0, H), (W, H), (410, 140), (250, 140)], fill=floor[0])
    for i in range(0, 12):  # floor strips
        y = 140 + int((i / 12) ** 1.6 * 36)
        d.line([0, y, W, y], fill=floor[1])
    # side walls panels
    d.polygon([(0, 0), (250, 50), (250, 140), (0, H)], fill=wall[2])
    d.polygon([(W, 0), (410, 50), (410, 140), (W, H)], fill=wall[2])
    for x in range(20, 250, 46):
        t = x / 250
        y1, y2 = int(50 * t), int(H - 36 * t)
        d.line([x, y1 + 6, x, y2 - 6], fill=wall[3])
        d.line([x + 2, y1 + 8, x + 2, y2 - 8], fill=wall[4])
    for x in range(620, 410, -46):
        t = (W - x) / (W - 410)
        y1, y2 = int(50 * t), int(H - 36 * t)
        d.line([x, y1 + 6, x, y2 - 6], fill=wall[3])
    # racing stripe on walls
    for k in range(4):
        c = acc[4 - k]
        d.polygon([(0, 70 + k * 6), (250, 92 + k * 3), (250, 95 + k * 3), (0, 75 + k * 6)], fill=c)
        d.polygon([(W, 70 + k * 6), (410, 92 + k * 3), (410, 95 + k * 3), (W, 75 + k * 6)], fill=c)
    # doors (16-aligned boxes)
    doors = [(304, 80, 48, 64), (528, 64, 64, 96), (48, 48, 48, 96)]
    for (x, y, w, h) in doors:
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=wall[0], outline=acc[3])
        d.rectangle([x + 4, y + 4, x + w - 5, y + h - 5], fill=wall[1])
        d.line([x + w // 2, y + 4, x + w // 2, y + h - 5], fill=acc[4])
        d.rectangle([x + 6, y + 6, x + 12, y + 9], fill=acc[5])
    # lights
    for x in range(260, 410, 30):
        d.rectangle([x, 52, x + 12, 54], fill=pal[-1])
    img2 = img.copy()
    dd = ImageDraw.Draw(img2)

    def notes(nd, S):
        for (x, y, w, h) in doors:
            box(nd, x * S, y * S, w * S, h * S, (80, 255, 120))
            note(nd, (x * S + 3, y * S - 12), 'DOOR %dx%d' % (w, h), (80, 255, 120))
        box(nd, 16 * S, 16 * S, 112 * S, 160 * S, (255, 220, 60), True)
        note(nd, (19 * S, 20 * S), 'HERO COVERS THIS (112x160)', (255, 220, 60))
        nd.line([0, 140 * S, W * S, 140 * S], fill=(255, 80, 80))
        note(nd, (140 * S, 141 * S), 'FLOOR LINE y=140: NPC feet', (255, 120, 120))
        for x in (176, 432):
            box(nd, x * S, 28 * S, 48 * S, 112 * S, (80, 200, 255), True)
            note(nd, (x * S + 3, 30 * S), 'NPC 48x112', (80, 200, 255))
        nd.line([320 * S, 0, 320 * S, H * S], fill=(255, 255, 255))
        note(nd, (322 * S, 4), 'SCREEN 2 ->', (255, 255, 255))
    save('1_panorama_640x176', img2, [('wall', wall), ('accent', acc[:5]), ('floor+light', floor + [pal[-1]])],
         '1. PANORAMA 640x176 (near layer) - Launch Complex example, 3 palettes used of 24', notes)

    # full screen layout 320x224
    scr = Image.new('RGB', (320, 224), (0, 0, 0))
    scr.paste(img.crop((0, 0, 320, 176)), (0, 16))

    def notes2(nd, S):
        note(nd, (4, 3 * S), 'LETTERBOX 16 px', (200, 200, 200))
        note(nd, (4, 200 * S), 'BOTTOM BAR 32 px: prompts, dialogue', (200, 200, 200))
        box(nd, 8 * S, 8 * S, 304 * S, 208 * S, (255, 80, 80), True)
        note(nd, (10 * S, 186 * S), 'SAFE AREA 304x208', (255, 120, 120))
    save('1b_explore_screen_320x224', scr, [('(same as panorama)', wall)], '1b. EXPLORE SCREEN LAYOUT 320x224', notes2)


# ---------------------------------------------------------------- 2. hero
JACKET = ['#140c08', '#2c1810', '#4a2a18', '#6e4024', '#9a6034', '#c8884c']
FLEECE = ['#a89070', '#e0d0b0', '#f8f0e0']
HAIR = ['#181420', '#302838']
SKIN = ['#a05838', '#e09870']
PATCH = ['#e8763a', '#f8d048']


def hero_frame(d, ox, oy, bob=0, look=0):
    J = [hx(c) for c in JACKET]
    F = [hx(c) for c in FLEECE]
    Hh = [hx(c) for c in HAIR]
    S = [hx(c) for c in SKIN]
    P = [hx(c) for c in PATCH]
    y = oy + bob
    # body / jacket
    d.polygon([(ox + 8, oy + 160), (ox + 6, y + 108), (ox + 16, y + 84), (ox + 40, y + 74), (ox + 72, y + 74),
               (ox + 96, y + 84), (ox + 106, y + 108), (ox + 104, oy + 160)], fill=J[0])
    d.polygon([(ox + 10, oy + 160), (ox + 9, y + 108), (ox + 18, y + 86), (ox + 40, y + 77), (ox + 72, y + 77),
               (ox + 94, y + 86), (ox + 103, y + 108), (ox + 102, oy + 160)], fill=J[2])
    # lighting: right side rim
    d.polygon([(ox + 80, y + 80), (ox + 94, y + 86), (ox + 103, y + 108), (ox + 102, oy + 160), (ox + 90, oy + 160), (ox + 92, y + 110)], fill=J[3])
    d.polygon([(ox + 96, y + 92), (ox + 103, y + 108), (ox + 102, oy + 160), (ox + 99, oy + 160), (ox + 99, y + 108)], fill=J[5])
    d.polygon([(ox + 10, y + 110), (ox + 20, y + 90), (ox + 26, y + 100), (ox + 22, oy + 160), (ox + 10, oy + 160)], fill=J[1])
    # arm seams / folds
    d.line([ox + 28, y + 90, ox + 32, oy + 160], fill=J[1])
    d.line([ox + 84, y + 90, ox + 80, oy + 160], fill=J[1])
    d.line([ox + 40, y + 120, ox + 56, y + 128], fill=J[1])
    d.line([ox + 60, y + 128, ox + 76, y + 120], fill=J[4])
    # rib waist
    for x in range(ox + 12, ox + 100, 3):
        d.line([x, oy + 148, x, oy + 159], fill=J[1] if (x // 3) % 2 else J[0])
    # shoulder patch + back patch
    d.ellipse([ox + 40, y + 96, ox + 72, y + 124], fill=P[0], outline=J[0])
    d.ellipse([ox + 46, y + 102, ox + 66, y + 118], fill=P[1])
    d.rectangle([ox + 86, y + 90, ox + 96, y + 100], fill=P[0])
    # fleece collar
    d.polygon([(ox + 30, y + 80), (ox + 40, y + 66), (ox + 72, y + 66), (ox + 82, y + 80), (ox + 56, y + 84)], fill=F[0])
    d.polygon([(ox + 34, y + 78), (ox + 42, y + 68), (ox + 70, y + 68), (ox + 78, y + 78), (ox + 56, y + 80)], fill=F[1])
    d.line([ox + 60, y + 69, ox + 74, y + 76], fill=F[2])
    # neck
    d.rectangle([ox + 46, y + 54, ox + 66, y + 68], fill=S[0])
    d.rectangle([ox + 60 + look, y + 56, ox + 64 + look, y + 66], fill=S[1])
    # hair (back of head)
    d.ellipse([ox + 34 + look, y + 8, ox + 78 + look, y + 62], fill=Hh[0])
    d.ellipse([ox + 40 + look, y + 12, ox + 76 + look, y + 54], fill=Hh[1])
    d.line([ox + 70 + look, y + 18, ox + 74 + look, y + 44], fill=hx('#e8763a'))  # rim light in scene colour
    # ear
    d.ellipse([ox + 74 + look, y + 32, ox + 80 + look, y + 44], fill=S[0] if look <= 0 else S[1])


def hero():
    frames = [(0, 0), (1, 0), (2, 0), (1, 0), (0, -4), (0, 4)]
    W = 112
    img = Image.new('RGB', (W * len(frames), 160), MAG)
    d = ImageDraw.Draw(img)
    for i, (bob, look) in enumerate(frames):
        hero_frame(d, i * W, 0, bob, look)
    pal = [hx(c) for c in JACKET + FLEECE + HAIR + SKIN + PATCH]

    def notes(nd, S):
        names = ['IDLE 1', 'IDLE 2', 'IDLE 3', 'IDLE 4', 'GLANCE L', 'GLANCE R']
        for i, n in enumerate(names):
            box(nd, i * W * S, 0, W * S, 160 * S, (255, 220, 60))
            note(nd, (i * W * S + 4, 4), n, (255, 220, 60))
    save('2_hero_112x160_sheet', img, [('hero (1 palette)', pal)],
         '2. HERO 112x160 per frame - flight jacket blocking sample (magenta = transparent), 15 colours', notes)


# ---------------------------------------------------------------- 3. NPC
def npc():
    W, H = 48, 112
    img = Image.new('RGB', (W * 2 + 64 + 16, 128), MAG)
    d = ImageDraw.Draw(img)
    C = [hx(c) for c in ['#101018', '#283040', '#3c5878', '#6088b0', '#98c0e0']]  # coveralls
    S = [hx(c) for c in ['#a05838', '#e09870']]
    Y = [hx(c) for c in ['#b88820', '#f8d048']]
    O = [hx(c) for c in ['#e8763a', '#f8f0e0']]
    def body(ox, oy, w, h, main, acc):
        cx = ox + w // 2
        d.ellipse([cx - 7, oy + 4, cx + 7, oy + 20], fill=S[0])
        d.ellipse([cx - 5, oy + 6, cx + 5, oy + 18], fill=S[1])
        d.rectangle([cx - 8, oy + 2, cx + 8, oy + 8], fill=acc[0])  # cap / ear defenders
        d.rectangle([ox + 8, oy + 22, ox + w - 9, oy + h * 55 // 100], fill=main[2])
        d.rectangle([ox + w - 14, oy + 22, ox + w - 9, oy + h * 55 // 100], fill=main[3])
        d.rectangle([ox + 4, oy + 24, ox + 8, oy + h * 50 // 100], fill=main[1])
        d.rectangle([ox + w - 9, oy + 24, ox + w - 5, oy + h * 50 // 100], fill=main[4])
        d.rectangle([ox + 10, oy + h * 55 // 100, cx - 2, oy + h - 6], fill=main[2])
        d.rectangle([cx + 2, oy + h * 55 // 100, ox + w - 11, oy + h - 6], fill=main[3])
        d.rectangle([ox + 8, oy + h - 6, cx - 2, oy + h - 1], fill=main[0])
        d.rectangle([cx + 2, oy + h - 6, ox + w - 9, oy + h - 1], fill=main[0])
        d.rectangle([ox + 8, oy + h * 45 // 100, ox + w - 9, oy + h * 45 // 100 + 3], fill=acc[1])  # belt stripe
    body(0, 16, 48, 112, C, Y)
    body(48, 16, 48, 112, C, O)
    R = [hx(c) for c in ['#200810', '#581828', '#902838', '#c84850', '#f88070']]
    body(112, 0, 64, 128, R, Y)
    pal = C + S + Y + O

    def notes(nd, S_):
        box(nd, 0, 16 * S_, 48 * S_, 112 * S_, (80, 200, 255)); note(nd, (3, 16 * S_ + 3), 'CREW 48x112', (80, 200, 255))
        box(nd, 48 * S_, 16 * S_, 48 * S_, 112 * S_, (80, 200, 255)); note(nd, (48 * S_ + 3, 16 * S_ + 3), 'CREW, OUTFIT 2', (80, 200, 255))
        box(nd, 112 * S_, 0, 64 * S_, 128 * S_, (255, 120, 120)); note(nd, (112 * S_ + 3, 3), 'BOSS 64x128', (255, 120, 120))
    save('3_npc_48x112_boss_64x128', img, [('crew (1 palette)', pal), ('boss (1 palette)', R + S + Y)],
         '3. NPC SCENE SPRITES - crew 48x112, boss 64x128, 1 palette each', notes)


# ---------------------------------------------------------------- 4. close-up
def closeup():
    W, H = 320, 176
    img = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    bg = ramp('#e8763a', 5, 0.15, 0.9)
    for i in range(H):
        d.line([0, i, W, i], fill=bg[min(4, i * 5 // H)])
    for k in range(5):
        d.rectangle([0, 120 + k * 6, W, 123 + k * 6], fill=hx(['#f83848', '#f88818', '#f8d828', '#28e0f8', '#9848f8'][k]))
    S = [hx(c) for c in ['#401818', '#783020', '#a85838', '#d08058', '#f0b088', '#f8d8b8']]
    Hh = [hx(c) for c in ['#100c10', '#282028', '#483848']]
    Cl = [hx(c) for c in ['#101830', '#283c68', '#4870a8', '#80b0e0']]
    d.polygon([(60, H), (90, 130), (230, 130), (260, H)], fill=Cl[1])
    d.polygon([(200, 130), (230, 130), (260, H), (220, H)], fill=Cl[2])
    d.rectangle([140, 108, 180, 136], fill=S[1])
    d.ellipse([104, 20, 216, 136], fill=S[2])
    d.ellipse([112, 24, 208, 128], fill=S[3])
    d.ellipse([150, 30, 206, 110], fill=S[4])
    d.polygon([(100, 70), (104, 20), (160, 6), (218, 22), (222, 70), (206, 40), (160, 30), (114, 44)], fill=Hh[1])
    d.polygon([(150, 12), (200, 18), (214, 40), (180, 26)], fill=Hh[2])
    # eyes
    for ex in (132, 172):
        d.rectangle([ex, 66, ex + 18, 72], fill=hx('#f8f0e0'))
        d.rectangle([ex + 6, 66, ex + 11, 72], fill=Hh[0])
        d.line([ex - 2, 60, ex + 20, 58], fill=Hh[1], width=2)
    d.line([158, 78, 154, 98], fill=S[1]); d.line([154, 98, 162, 100], fill=S[1])
    d.rectangle([146, 110, 178, 113], fill=S[0])
    pal_s, pal_h, pal_c, pal_b = S, Hh, Cl, bg

    def notes(nd, Sc):
        box(nd, 48 * Sc, 16 * Sc, 224 * Sc, 144 * Sc, (255, 220, 60), True)
        note(nd, (50 * Sc, 18 * Sc), 'FACE AREA 224x144', (255, 220, 60))
        box(nd, 128 * Sc, 48 * Sc, 96 * Sc, 32 * Sc, (80, 255, 120)); note(nd, (226 * Sc, 52 * Sc), 'BLINK PATCH 96x32 (2 frames)', (80, 255, 120))
        box(nd, 136 * Sc, 96 * Sc, 48 * Sc, 32 * Sc, (80, 200, 255)); note(nd, (186 * Sc, 104 * Sc), 'MOUTH PATCH 48x32 (3 frames)', (80, 200, 255))
    save('4_closeup_320x176', img, [('skin', pal_s), ('hair', pal_h), ('clothes', pal_c), ('background', pal_b)],
         '4. TALK CLOSE-UP 320x176 - 4 palettes; patches must sit on the 16-px grid', notes)


# ---------------------------------------------------------------- 5. map
LOCS = [('LAUNCH', '#e8763a'), ('HOLO HALL', '#4fd1c5'), ('FOLD LAB', '#9ae66e'),
        ('BANK', '#f2c94c'), ('CHRONO', '#6fa8ff'), ('CASINO', '#ff5d8f')]
ROOMS = [(32, 32), (128, 32), (224, 32), (32, 96), (128, 96), (224, 96)]


def map_():
    img = Image.new('RGB', (320, 224), hx('#080818'))
    d = ImageDraw.Draw(img)
    import random
    rnd = random.Random(3)
    for _ in range(90):
        x, y = rnd.randrange(320), rnd.randrange(176)
        d.point((x, y), fill=hx('#a8a8c8') if rnd.random() < 0.7 else hx('#f8f8f8'))
    hull = ramp('#5a5878', 4, 0.4, 1.3)
    d.rounded_rectangle([16, 16, 303, 159], 20, fill=hull[1], outline=hull[0])
    d.rectangle([150, 4, 170, 16], fill=hull[2])
    d.line([160, 0, 160, 4], fill=hull[3])
    d.rectangle([0, 80, 16, 96], fill=hull[2]); d.rectangle([303, 80, 319, 96], fill=hull[2])
    for (x, y), (n, c) in zip(ROOMS, LOCS):
        r = ramp(c, 4, 0.25, 1.2)
        d.rectangle([x, y, x + 79, y + 47], fill=r[0], outline=hull[3])
        d.rectangle([x + 4, y + 30, x + 75, y + 43], fill=r[1])
        d.rectangle([x + 8, y + 8, x + 24, y + 30], fill=r[2])
        d.rectangle([x + 54, y + 12, x + 70, y + 30], fill=r[1])
        d.line([x + 4, y + 30, x + 75, y + 30], fill=r[3])
    d.rectangle([16, 80, 303, 95], fill=hull[0])  # corridor between rows
    for x in range(24, 300, 12):
        d.point((x, 87), fill=hx('#f8d048'))
    d.rectangle([0, 176, 319, 223], fill=hx('#101020'))

    def notes(nd, S):
        for (x, y), (n, c) in zip(ROOMS, LOCS):
            box(nd, x * S, y * S, 80 * S, 48 * S, (255, 255, 255))
            note(nd, (x * S + 4, y * S + 4), n + ' 80x48', (255, 255, 255))
        box(nd, 104 * S, 28 * S, 32 * S, 32 * S, (255, 220, 60))
        note(nd, (104 * S, 61 * S), 'CURSOR 32x32', (255, 220, 60))
        note(nd, (6, 180 * S), 'INFO PANEL 320x48 - keep plain, game prints name + token here', (200, 200, 200))
    save('5_map_cutaway_320x224', img, [('hull', hull)] + [(n, ramp(c, 4, 0.25, 1.2)) for n, c in LOCS[:3]],
         '5. STATION CUTAWAY MAP 320x224 - 6 rooms, cursor, info panel', notes)

    # cues + cursor + tokens sheet
    s = Image.new('RGB', (16 * 4 + 16 + 32 * 4 + 16, 64), MAG)
    sd = ImageDraw.Draw(s)
    cue = [hx(c) for c in ['#000000', '#f8f0e0', '#f8d048', '#e8763a']]
    for i in range(4):
        x, y = i * 16, 2 - (i % 2)
        sd.rounded_rectangle([x + 1, y + 1, x + 14, y + 10], 3, fill=cue[1], outline=cue[0])
        sd.polygon([(x + 4, y + 10), (x + 8, y + 10), (x + 4, y + 14)], fill=cue[1])
        for k in range(3):
            sd.point((x + 4 + k * 3, y + 5), fill=cue[3] if k <= i % 3 else cue[0])
    for i in range(4):
        x, y = i * 16, 24 + (i % 2)
        sd.polygon([(x + 3, y + 2), (x + 13, y + 2), (x + 8, y + 12)], fill=cue[2], outline=cue[0])
    for i in range(4):
        x = 80 + i * 32
        o = i * 2
        sd.rectangle([x + 2 + o // 2, 2 + o // 2, x + 29 - o // 2, 29 - o // 2], outline=cue[2])
        sd.polygon([(x + 12, 12), (x + 20, 16), (x + 12, 20)], fill=cue[3])
    for i, (n, c) in enumerate(LOCS):
        x, y = 80 + (i % 4) * 32, 36 + (i // 4) * 16
        cc = ramp(c, 3, 0.4, 1.3)
        sd.ellipse([x, y, x + 15, y + 15], fill=cc[1], outline=cc[0])
        sd.ellipse([x + 4, y + 4, x + 11, y + 11], fill=cc[2])

    def notes2(nd, S):
        note(nd, (2, 18 * S), 'PERSON CUE 16x16 x4', (255, 255, 255))
        note(nd, (2, 42 * S), 'DOOR CUE 16x16 x4', (255, 255, 255))
        note(nd, (80 * S, 31 * S), 'MAP CURSOR 32x32 x4', (255, 255, 255))
        note(nd, (80 * S + 2, 52 * S + 4), 'TOKENS 16x16 x6', (255, 255, 255))
    save('5b_cues_cursor_tokens', s, [('cues + cursor (shared)', cue)], '5b. CUES 16x16, MAP CURSOR 32x32, TOKENS 16x16', notes2)


# ---------------------------------------------------------------- 6. cards
def cards():
    img = Image.new('RGB', (80 + 16 + 48 + 16 + 80, 112), MAG)
    d = ImageDraw.Draw(img)
    grey = ramp('#a0a0b0', 5, 0.2, 1.3)

    def frame(x, y, w, h, pw, band):
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=grey[2], outline=hx('#000000'))
        d.line([x + 1, y + 1, x + w - 2, y + 1], fill=grey[4]); d.line([x + 1, y + 1, x + 1, y + h - 2], fill=grey[4])
        d.line([x + 1, y + h - 2, x + w - 2, y + h - 2], fill=grey[0]); d.line([x + w - 2, y + 1, x + w - 2, y + h - 2], fill=grey[0])
        d.rectangle([x + 3, y + 3, x + w - 4, y + 3 + band], fill=hx('#181020'))
        px, py = x + (w - pw) // 2, y + 6 + band
        sky = ramp('#9d4dff', 4, 0.2, 0.9)
        for i in range(pw):
            d.line([px, py + i, px + pw - 1, py + i], fill=sky[min(3, i * 4 // pw)])
        # cyclops head placeholder
        cx, cy, r = px + pw // 2, py + pw // 2 + pw // 10, pw // 3
        mon = ramp('#9ae66e', 4, 0.3, 1.2)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=mon[1])
        d.ellipse([cx - r + 2, cy - r + 2, cx + r - r // 3, cy + r - 2], fill=mon[2])
        d.ellipse([cx - r // 2, cy - r // 2, cx + r // 2, cy + r // 4], fill=hx('#f8f0e0'))
        d.ellipse([cx - r // 5, cy - r // 3, cx + r // 5, cy + r // 8], fill=hx('#c02038'))
        # pips
        pip = 8 if w > 60 else 6
        for k in range(5):
            xx = x + w // 2 - (5 * (pip + 2)) // 2 + k * (pip + 2)
            d.rectangle([xx, y + h - pip - 4, xx + pip - 1, y + h - 5], fill=hx('#f8d048') if k < 3 else grey[1], outline=hx('#000000'))
        return px, py
    frame(0, 0, 80, 112, 64, 10)
    frame(96, 0, 48, 64, 32, 6)
    # card back
    x = 160
    d.rectangle([x, 0, x + 79, 111], fill=hx('#181828'), outline=hx('#000000'))
    for k, c in enumerate(['#f83848', '#f88818', '#f8d828', '#28e0f8', '#9848f8']):
        d.rectangle([x + 4, 48 + k * 4, x + 75, 50 + k * 4], fill=hx(c))
    d.text((x + 18, 12), 'SPAC', fill=(248, 248, 248), font=FONT)
    d.text((x + 16, 88), 'BRACK', fill=(248, 248, 248), font=FONT)

    def notes(nd, S):
        box(nd, 8 * S, 18 * S, 64 * S, 64 * S, (255, 220, 60)); note(nd, (8 * S + 3, 18 * S + 3), 'PORTRAIT 64x64', (255, 220, 60))
        box(nd, 104 * S, 12 * S, 32 * S, 32 * S, (255, 220, 60)); note(nd, (96 * S, 66 * S), 'SMALL 48x64, PORTRAIT 32x32', (255, 220, 60))
        note(nd, (4, 4), 'LARGE 80x112', (255, 255, 255))
        note(nd, (160 * S + 4, 4), 'CARD BACK 80x112', (255, 255, 255))
    save('6_cards_80x112_48x64', img, [('frame (grey, recoloured)', grey), ('portrait example', ramp('#9ae66e', 4, 0.3, 1.2) + ramp('#9d4dff', 4, 0.2, 0.9) + [hx('#f8f0e0'), hx('#c02038')])],
         '6. MONSTER CARDS - large 80x112, small 48x64, back', notes)


# ---------------------------------------------------------------- 7. battle
BRICKS = ['#ff3fa4', '#2fe0ff', '#ffdc2e', '#ff8a1e', '#9d4dff', '#a6ff3a', '#ff3b47']


def brick(d, x, y, c):
    b = hx(c)
    hi = snap(tuple(min(255, v + (255 - v) // 2) for v in b))
    lo = snap(tuple(v // 2 for v in b))
    d.rectangle([x, y, x + 7, y + 7], fill=b)
    d.line([x, y + 7, x + 7, y + 7], fill=lo); d.line([x + 7, y, x + 7, y + 7], fill=lo)
    d.line([x, y, x + 6, y], fill=hi); d.line([x, y, x, y + 6], fill=hi)
    d.point((x + 1, y + 1), fill=(248, 248, 248)); d.point((x + 2, y + 1), fill=(248, 248, 248))


def battle():
    img = Image.new('RGB', (320, 224), hx('#100c18'))
    d = ImageDraw.Draw(img)
    bg = ramp('#e8763a', 5, 0.12, 0.7)
    for i in range(224):
        d.line([0, i, 319, i], fill=bg[min(4, i * 5 // 224)])
    for k, c in enumerate(['#f83848', '#f88818', '#f8d828', '#28e0f8', '#9848f8']):
        d.rectangle([0, 12 + k * 3, 319, 13 + k * 3], fill=hx(c))
    import random
    rnd = random.Random(5)
    for bx in (24, 216):
        d.rectangle([bx - 4, 36, bx + 83, 199], fill=hx('#282838'), outline=hx('#000000'))
        d.rectangle([bx, 40, bx + 79, 199], fill=hx('#080810'))
        for row in range(20 - 8, 20):
            for col in range(10):
                if rnd.random() < 0.75:
                    brick(d, bx + col * 8, 40 + row * 8, BRICKS[rnd.randrange(7)])
    for i, c in enumerate(BRICKS):
        brick(d, 136 + (i % 4) * 12, 150 + (i // 4) * 12, c)

    def notes(nd, S):
        box(nd, 24 * S, 40 * S, 80 * S, 160 * S, (80, 255, 120)); note(nd, (26 * S, 42 * S), 'BOARD 80x160', (80, 255, 120))
        box(nd, 216 * S, 40 * S, 80 * S, 160 * S, (80, 255, 120))
        note(nd, (112 * S, 140 * S), 'BRICKS 8x8', (255, 255, 255))
        note(nd, (112 * S, 40 * S), 'BACKGROUND SHOWS', (255, 220, 60))
        note(nd, (112 * S, 46 * S), 'MOSTLY HERE + TOP', (255, 220, 60))
    save('7_battle_320x224', img, [('bricks (text layer)', [hx(c) for c in BRICKS]), ('background', bg)],
         '7. BATTLE SCREEN 320x224 - boards 80x160, bricks 8x8', notes)


# ---------------------------------------------------------------- 8. title + font
def title():
    img = Image.new('RGB', (320, 224), hx('#f0ece0'))
    d = ImageDraw.Draw(img)
    for k, c in enumerate(['#f83848', '#f88818', '#f8d828', '#28e0f8', '#9848f8']):
        d.polygon([(0, 140 + k * 8), (320, 100 + k * 8), (320, 106 + k * 8), (0, 146 + k * 8)], fill=hx(c))
    d.rectangle([16, 24, 303, 87], fill=hx('#181828'))
    chrome = ramp('#a8c8f8', 6, 0.3, 1.3)
    for i in range(48):
        d.line([24, 32 + i, 295, 32 + i], fill=chrome[min(5, abs(i - 24) * 6 // 25)])
    d.rectangle([16, 190, 303, 206], fill=hx('#e8dcc0'), outline=hx('#000000'))
    d.text((112, 194), 'PRESS START', fill=(40, 30, 30), font=FONT)

    def notes(nd, S):
        box(nd, 16 * S, 24 * S, 288 * S, 64 * S, (255, 80, 80)); note(nd, (20 * S, 26 * S), 'LOGO 288x64 (chrome letters go here)', (255, 80, 80))
    save('8_title_320x224', img, [('logo chrome', chrome), ('stripes', [hx(c) for c in ['#f83848', '#f88818', '#f8d828', '#28e0f8', '#9848f8']])],
         '8. TITLE 320x224 with 288x64 logo box', notes)

    chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,!?:;-+/\'"()%#x'
    f = Image.new('RGB', (16 * 8, ((len(chars) + 15) // 16) * 8 * 2 + 8), MAG)
    fd = ImageDraw.Draw(f)
    for i, ch in enumerate(chars):
        x, y = (i % 16) * 8, (i // 16) * 8
        fd.rectangle([x, y, x + 7, y + 7], outline=(60, 60, 80))
        fd.rectangle([x + 1, y + 1, x + 6, y + 6], outline=(200, 200, 220))
    y0 = ((len(chars) + 15) // 16) * 8 + 8
    for i, ch in enumerate(chars):
        x, y = (i % 16) * 8, y0 + (i // 16) * 8
        fd.rectangle([x, y, x + 7, y + 7], outline=(60, 60, 80))
        fd.rectangle([x + 2, y + 2, x + 5, y + 6], outline=(200, 180, 120))

    def notes2(nd, S):
        for i, ch in enumerate(chars):
            nd.text(((i % 16) * 8 * S + 8, (i // 16) * 8 * S + 6), ch, fill=(255, 220, 60), font=FONT)
            nd.text(((i % 16) * 8 * S + 8, (y0 + (i // 16) * 8) * S + 6), ch, fill=(255, 220, 60), font=FONT)
    save('8b_font_grid_8x8', f, [('font white', [hx('#f8f8f8'), hx('#000000')]), ('font beige ink', [hx('#e8dcc0'), hx('#302020')])],
         '8b. FONT GRID - big (7x7 inside 8x8) top, small (4x5) bottom', notes2)


if __name__ == '__main__':
    panorama(); hero(); npc(); closeup(); map_(); cards(); battle(); title()
    print('\n'.join(sorted(os.listdir(OUT))))
