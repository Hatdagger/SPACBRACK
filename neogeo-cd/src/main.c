/*
 * SPACBRACK - brick race for the Neo Geo CD.
 *
 * Only the falling-brick game from the SPACBRACK prototype: no story, no
 * exploration.  Modes:
 *   Marathon  150 lines, levels speed up every 10, high score
 *   Sprint    40 lines as fast as you can, best time
 *   Versus    vs CPU (levels 1-8) or vs 2P, garbage, last one standing
 *   Survival  king of the hill: whoever tops out is replaced (3 s: K.O.,
 *             READY, GO) while the other board keeps going; score = KOs
 *
 * Two boards side by side like Calm Combo.  In Marathon or Sprint a second
 * player can press Start at any time and choose PLAY SOLO (their own game on
 * the other board) or CHALLENGE (both boards switch to a fresh Versus).  In
 * Versus against the CPU, 2P's Start takes the CPU's place in a new Versus
 * match.  In Survival a player's Start claims the CPU's seat: they come in
 * when that CPU is knocked out (it eases off meanwhile), and the run goes on.
 * A player who is knocked out can press Start during the K.O. pause to come
 * straight back with a new streak; if nobody does, a CPU comes in.
 *
 * Drawing: the boards, panels and all text are on the fix layer (8x8 tiles:
 * one brick = one tile, recoloured per palette), written through a shadow
 * copy so only changed tiles go out (fx_put / fx_flush).  The backdrop is
 * one sprite picture whose floor grid scrolls by palette cycling, and the
 * big chrome letters (logo, countdown, PAUSED) are sprites.
 *
 * Strict C89: gcc 2.95, no // comments, declarations at the top of blocks.
 */
#include <neocore.h>
#include <DATlib.h>
#include <input.h>
#include "externs.h"
#include "rules.h"
#include "cpu.h"
#include "sound.h"
#include "save.h"
#include "art_keys.h"

/* the PC harness can let a CPU play a human's board (test/frontend.c) */
#ifndef HARNESS_BOT
#define HARNESS_BOT(s) 0
#endif

/* ---------- layout (fix columns / screen rows; fix row = screen row + 2) ---------- */
#define FIX_COLS   40
#define FIX_ROWS   28
#define FIELD_ROW  4                 /* field rows 4..23 (pixel y 32..191) */
static const BYTE FIELD_COL[2] = { 6, 24 };
static const BYTE PANEL_COL[2] = { 1, 35 };
#define CENTER_COL 17                /* centre console, 6 columns */
#define HOLD_ROW   4
#define NEXT_ROW   8
#define STAT_ROW   25
#define FX_ROW     24                /* card effect tag under the NEXT column */

/* fix palettes */
#define PAL_GARB   9
#define PAL_GREY   9
#define PAL_WHITE  10
#define PAL_AMBER  11
#define PAL_GREEN  12
#define PAL_BEIGE  13
#define PAL_STEEL  14
#define PAL_BLUE   15
#define PAL_RED    8
#define PAL_YELLOW 4
#define PAL_CYAN   3
#define PAL_PINK   2
#define PAL_ORANGE 5
#define PAL_LIME   7
#define PAL_VIOLET 6
#define PAL_OF(t)  ((BYTE)((t) + 1))  /* brick type -> palette (I=2 .. Z=8, garbage=9) */

#include "cards.h"

#define FIXBANK    0x300
#define BLANK      ((WORD)(FIXBANK | ' '))

/* sprite palettes and numbers */
#define SPR_PAL_BG    16
#define SPR_PAL_GLYPH 24
#define SPR_BG        1              /* 20 sprites */
#define SPR_G0        64             /* chrome letters: 2 sprites each */
#define G_SLOTS       40             /* sprites in the chrome pool */
#define GS_LOGO       0              /* 18 sprites */
#define SPR_PAL_CARD  40
#define SPR_CARD      104            /* card portraits: 4 sprites each, 2 cards */

/* timings (frames) */
#define COUNT_FRAMES  120
#define GO_FRAMES     30
#define CALL_FRAMES   80
#define SURV_KO       90             /* K.O. pause: Start here to come (back) in */
#define SURV_READY    90             /* ...then READY on the new board, then GO: 3 s in all */
#define SURV_MAX_SPEED 5             /* Survival's minute-by-minute speed stops here */
#define VS_MAX_SPEED  10
#define TRAIL_FRAMES  9              /* hard drop tail: 3 rows, then 2, then 1 */
/* card effects (the web game's times) */
#define FX_GLARE      480            /* foe loses the preview: 8 s */
#define FX_SHIVER     360
#define FX_HOWL       360
#define FX_NIGHTFALL  300
#define FX_SWARM      480
#define FX_ECHO       360
#define FX_SONAR      600
#define AIM_FRAMES    240            /* Eye Beam: aiming too long fires where it points */
#define CPU_CARD_EVERY 60            /* a CPU thinks about its card once a second */
#define LAUNCH_FRAMES 600            /* Launch Key: the 10-count */
#define BROKEN_FRAMES 108            /* COUNT BROKEN shows this long */

static const BYTE TRAIL_LEN[TRAIL_FRAMES + 1] = { 0, 1, 1, 1, 2, 2, 2, 3, 3, 3 };

enum { S_OFF, S_ASK, S_COUNT, S_PLAY, S_DONE, S_NAME, S_GAP };
enum { M_MARATHON, M_SPRINT, M_VS, M_SURV };
enum { R_NONE, R_CLEAR, R_TOPOUT, R_WIN, R_LOSE, R_DRAW, R_LIFTOFF, R_LATE };   /* LIFTOFF / LATE: a Launch Countdown ran out */
enum { SCR_TITLE, SCR_GAME, SCR_RECORDS, SCR_PICK, SCR_OPTIONS, SCR_SOUND, SCR_GUIDE };
enum { MENU_MARATHON, MENU_SPRINT, MENU_VS, MENU_SURV, MENU_RECORDS, MENU_OPTIONS, MENU_N };

typedef struct {
    BYTE    i;
    BYTE    state;
    BYTE    cpu_on;
    tt_board b;
    tt_cpu  cpu;
    WORD    count_t, go_t;
    DWORD   time;                    /* frames played */
    BYTE    result;
    BYTE    ask_sel;
    /* input */
    BYTE    prev, das_dir, das_t, arr_t;
    BYTE    card_hit, card_down;     /* card button pressed this frame / held */
    WORD    card_n;                  /* card presses (the harness checks them) */
    /* effects */
    char    call1[13], call2[13];
    WORD    call_t;
    BYTE    trail_t, flash_t;
    BYTE    tr_type, tr_rot;
    signed char tr_x, tr_y0, tr_y1;
    /* records */
    signed char rank;
    char    name[4];
    BYTE    name_pos;
    BYTE    wins;
    /* survival */
    WORD    kos;                     /* this streak's knock-outs */
    WORD    gap_t;                   /* S_GAP: frames left of the K.O. pause */
    BYTE    join;                    /* this pad's player takes the seat next */
    BYTE    ready;                   /* this count-in shows READY, not 3 2 1 */
    /* cards */
    BYTE    card;                    /* CARD_CYCLOPS.. (when cards are on) */
    BYTE    card_mode, card_dir;     /* card button held: picking an ability (1 + DIR_x, 0 none yet) */
    BYTE    aim;                     /* Eye Beam: aiming */
    signed char aim_x;
    WORD    aim_t, cpu_card_t;
    WORD    fired;                   /* abilities fired (the harness checks them) */
    BYTE    launch_used, launch_ready; /* Launch Key: the count was used / ready was announced */
    BYTE    bank_t, bank_col;        /* Gold Ledger: the bar flashes (interest white, hit red) */
    BYTE    cap_t, cap_fired, cap_ready; /* Time Capsule: frames the button is held, the hold jumped, 10 lines announced */
    BYTE    jump_t;                  /* ...the field flashes after a jump */
    BYTE    cpu_mark;                /* ...a CPU's mark: its field then had max height cpu_mh, holes cpu_mo, total cpu_ma */
    BYTE    cpu_mh, cpu_mo;
    WORD    cpu_ma;
    BYTE    spins_seen;              /* Ace of Stars: spins ready last announced */
    /* what is on screen now, so a frame only draws what changed */
    BYTE    fd_full, fd_state, fd_paused, fd_go, fd_aim, fd_dark, fd_cap;
    WORD    fx_key;
    DWORD   fd_sig, fd_ov;           /* field signature, rows holding the brick/ghost/trail */
    BYTE    ov_key, mini_key[2 + TT_NEXT];
    WORD    meter_key, call_key, call_gen;
    DWORD   gauge_key;
    DWORD   st_key[3];
} Side;

static Side  side[2];
static BYTE  screen = SCR_TITLE, mode = M_MARATHON, paused = 0;
static BYTE  menu_sel = 0, cpu_level = 4, track_on = 0;
static BYTE  opt_player = 0, opt_sel = 0, save_rec_due = 0, save_opt_due = 0;
static BYTE  demo = 0;                    /* attract mode: two CPUs play, any button goes back */
static WORD  idle_t = 0, demo_t = 0, demo_end = 0;
static BYTE  snd_sel = 0, snd_track = 0, snd_id = 0, guide_card = 0;
static BYTE  pick_card[2] = { CARD_CYCLOPS, CARD_SKELETON };   /* each pad's last pick */
static BYTE  pick_on[2], pick_done[2], pick_t;
static WORD  pick_key[2];
static DWORD frames = 0, seed_mix = 0x1234567UL, vs_time = 0;
static DWORD ctr_key1, ctr_key2;
static signed char launch_by = -1;  /* Launch Countdown running for side[launch_by] */
static WORD  launch_t, launch_at, broken_t, launch_key;
static WORD  rec_gen = 0;           /* records changed (the BEST shown in the middle) */
static picture bg;

/* ======================================================================
 * colours
 * ==================================================================== */
static WORD ng5(WORD r, WORD g, WORD b)
{
    return (WORD)(((r & 1) << 14) | ((g & 1) << 13) | ((b & 1) << 12) |
                  ((r >> 1) << 8) | ((g >> 1) << 4) | (b >> 1));
}
static WORD ng8(const unsigned char *c) { return ng5((WORD)(c[0] >> 3), (WORD)(c[1] >> 3), (WORD)(c[2] >> 3)); }
static WORD ch_r(WORD w) { return (WORD)(((w >> 7) & 0x1e) | ((w >> 14) & 1)); }
static WORD ch_g(WORD w) { return (WORD)(((w >> 3) & 0x1e) | ((w >> 13) & 1)); }
static WORD ch_b(WORD w) { return (WORD)(((w << 1) & 0x1e) | ((w >> 12) & 1)); }

/* is palette word w the 8-bit colour c (compared at 5 bits)? */
static int same5(WORD w, const unsigned char *c)
{
    return ch_r(w) == (c[0] >> 3) && ch_g(w) == (c[1] >> 3) && ch_b(w) == (c[2] >> 3);
}

static WORD fixpal[16 * 16];

static int adiff(int a, int b) { return a > b ? a - b : b - a; }

/*
 * tiles.png is painted in "role" colours.  Whatever slot the converter gave
 * each role, find it, then build the 14 palettes by role (art_keys.h).
 */
static void load_fix_palettes(void)
{
    BYTE role[16];
    int k, r, p, best, d, bd;
    WORD w;
    role[0] = 0;
    for (k = 1; k < 16; k++) {
        w = tt_fix_Palettes.data[k];
        best = 7; bd = 999;
        for (r = 1; r < 16; r++) {
            d = adiff(ch_r(w), ROLE_REF[r][0] >> 3) + adiff(ch_g(w), ROLE_REF[r][1] >> 3) + adiff(ch_b(w), ROLE_REF[r][2] >> 3);
            if (d < bd) { bd = d; best = r; }
        }
        role[k] = (BYTE)best;
    }
    for (p = 2; p < 16; p++) {
        fixpal[p * 16] = 0;
        for (k = 1; k < 16; k++) fixpal[p * 16 + k] = ng8(FIX_PAL_RGB[p][role[k]]);
    }
    palJobPut(2, 14, &fixpal[32]);
}

/* ---------- backdrop: floor lines scroll by palette cycling ---------- */
static WORD bgpal[16 * 4];
static BYTE bg_npal;
static BYTE bg_phase_at[BG_NPHASE][4], bg_phase_n[BG_NPHASE];
static BYTE bg_vline_at[4], bg_vline_n;
static WORD bg_floor, bg_line, bg_phase;
static const unsigned char ACCENT[5][3] = {
    { 157, 77, 255 }, { 47, 224, 255 }, { 255, 138, 30 }, { 255, 63, 164 }, { 166, 255, 58 }
};
static BYTE accent_now = 0;

static void bg_boot(void)
{
    int k, j;
    bg_npal = (BYTE)tt_bg_Palettes.count;
    if (bg_npal > 4) bg_npal = 4;
    for (k = 0; k < bg_npal * 16; k++) bgpal[k] = tt_bg_Palettes.data[k];
    for (j = 0; j < BG_NPHASE; j++) bg_phase_n[j] = 0;
    bg_vline_n = 0;
    for (k = 0; k < bg_npal * 16; k++) {
        if (!(k & 15)) continue;
        for (j = 0; j < BG_NPHASE; j++)
            if (same5(bgpal[k], BG_PHASE_KEY[j]) && bg_phase_n[j] < 4) bg_phase_at[j][bg_phase_n[j]++] = (BYTE)k;
        if (same5(bgpal[k], BG_VLINE_KEY) && bg_vline_n < 4) bg_vline_at[bg_vline_n++] = (BYTE)k;
    }
    bg_floor = ng8(BG_FLOOR_KEY);
}

/* accent colour of the floor grid (title violet, marathon cyan, ...) */
static void bg_accent(BYTE a)
{
    const unsigned char *c = ACCENT[a];
    accent_now = a;
    /* web: G.shade(accent, -0.35) */
    bg_line = ng5((WORD)((c[0] * 65 / 100) >> 3), (WORD)((c[1] * 65 / 100) >> 3), (WORD)((c[2] * 65 / 100) >> 3));
}

static void bg_tick(void)
{
    int j, k;
    if (frames % 10) return;
    bg_phase = (WORD)((bg_phase + 1) % BG_NPHASE);
    for (j = 0; j < BG_NPHASE; j++)
        for (k = 0; k < bg_phase_n[j]; k++) bgpal[bg_phase_at[j][k]] = j == bg_phase ? bg_line : bg_floor;
    for (k = 0; k < bg_vline_n; k++) bgpal[bg_vline_at[k]] = bg_line;
    palJobPut(SPR_PAL_BG, bg_npal, bgpal);
}

static void resend_static_palettes(void)
{
    palJobPut(2, 14, &fixpal[32]);
    palJobPut(SPR_PAL_GLYPH, tt_glyphs_Palettes.count, tt_glyphs_Palettes.data);
    palJobPut(SPR_PAL_CARD, tt_cards_Palettes.count, tt_cards_Palettes.data);
}

/* ======================================================================
 * fix layer through a shadow copy
 * ==================================================================== */
#define FX_N      (FIX_COLS * 32)
#define FX_BUDGET 600
static WORD fx_want[FX_N], fx_sent[FX_N], fx_list[FX_N];
static BYTE fx_dirty[FX_N];
static WORD fx_n;

static void fx_put(int x, int y, WORD w)
{
    WORD i;
    if (x < 0 || x >= FIX_COLS || y < 0 || y >= FIX_ROWS) return;
    i = (WORD)((x << 5) + y + 2);
    if (fx_want[i] == w) return;
    fx_want[i] = w;
    if (!fx_dirty[i]) { fx_dirty[i] = 1; fx_list[fx_n++] = i; }
}

static void fx_flush(void)
{
    WORD k, n = fx_n > FX_BUDGET ? FX_BUDGET : fx_n, i;
    for (k = 0; k < n; k++) {
        i = fx_list[k];
        fx_dirty[i] = 0;
        if (fx_sent[i] != fx_want[i]) {
            SC234Put(0x7000 + i, fx_want[i]);
            fx_sent[i] = fx_want[i];
        }
    }
    for (k = n; k < fx_n; k++) fx_list[k - n] = fx_list[k];
    fx_n = (WORD)(fx_n - n);
}

static void fx_boot(void)
{
    WORD i;
    for (i = 0; i < FX_N; i++) { fx_want[i] = 0xffff; fx_sent[i] = 0xffff; fx_dirty[i] = 0; }
    fx_n = 0;
}

static WORD tw(BYTE pal, WORD tile) { return (WORD)(((WORD)pal << 12) | FIXBANK | tile); }

static void fill(int x, int y, int w, int h, WORD word)
{
    int i, j;
    for (j = 0; j < h; j++) for (i = 0; i < w; i++) fx_put(x + i, y + j, word);
}

/* the screen was wiped: everything is drawn again */
static void invalidate(void)
{
    int k, j;
    for (k = 0; k < 2; k++) {
        Side *s = &side[k];
        s->fd_full = 1;
        s->ov_key = 0xff;
        s->mini_key[0] = 0xff;
        s->gauge_key = 0xffff;
        s->meter_key = 0xffff;
        s->call_key = 0xffff;
        for (j = 0; j < 3; j++) s->st_key[j] = 0xffffffffUL;
    }
    ctr_key1 = 0xffffffffUL;
}

static void cls(void) { fill(0, 0, FIX_COLS, FIX_ROWS, BLANK); invalidate(); }

static void txt(int x, int y, BYTE pal, const char *s)
{
    char c;
    while ((c = *s++) != 0) {
        if (c >= 'a' && c <= 'z') c = (char)(c - 32);
        if (c < 32 || c > 95) c = '?';
        fx_put(x++, y, tw(pal, (WORD)c));
    }
}

static void str_cpy(char *d, const char *s) { while ((*d++ = *s++) != 0) ; }

static int slen(const char *s) { int n = 0; while (s[n]) n++; return n; }

static void txt_c(int cx, int w, int y, BYTE pal, const char *s)   /* centred in w columns from cx */
{
    txt(cx + (w - slen(s)) / 2, y, pal, s);
}

/* LED digits with dim 8s behind them */
static void led(int x, int y, BYTE pal, const char *s)
{
    char c;
    WORD t;
    while ((c = *s++) != 0) {
        if (c >= '0' && c <= '9') t = (WORD)(T_LED + c - '0');
        else if (c == ':') t = T_LED + 10;
        else if (c == '.') t = T_LED + 11;
        else if (c == '-') t = T_LED + 12;
        else t = T_LED + 13;
        fx_put(x++, y, tw(pal, t));
    }
}

static char nb[16];

/* the 68000 has no 32-bit divide (each / or % is a slow library call), so
   digits come from subtracting powers of ten */
static const DWORD P10[9] = { 1UL, 10UL, 100UL, 1000UL, 10000UL, 100000UL, 1000000UL, 10000000UL, 100000000UL };

static const char *num(DWORD v, int width, char pad)
{
    int k;
    char d, lead = 1;
    DWORD p;
    if (v >= P10[width]) v %= P10[width];        /* keep the last width digits (rare) */
    for (k = 0; k < width; k++) {
        p = P10[width - 1 - k];
        d = '0';
        while (v >= p) { v -= p; d++; }
        if (d != '0' || k == width - 1) lead = 0;
        nb[k] = lead ? pad : d;
    }
    nb[width] = 0;
    return nb;
}

/* frames -> "M:SS.CC" (cent = 1) or "M:SS.T" or "M:SS" */
static const BYTE CENTI[60] = {   /* frame of a second -> hundredths */
     0,  1,  3,  5,  6,  8, 10, 11, 13, 15, 16, 18, 20, 21, 23, 25, 26, 28, 30, 31,
    33, 35, 36, 38, 40, 41, 43, 45, 46, 48, 50, 51, 53, 55, 56, 58, 60, 61, 63, 65,
    66, 68, 70, 71, 73, 75, 76, 78, 80, 81, 83, 85, 86, 88, 90, 91, 93, 95, 96, 98
};

/* *v (0..99) -> its tens digit, leaving the units in *v */
static WORD tens(WORD *v)
{
    WORD t = 0;
    while (*v >= 10) { *v -= 10; t++; }
    return t;
}

static const char *fmt_time(DWORD f, int dec)
{
    WORD m = 0, s = 0, fr, cs;
    int k = 0;
    while (f >= 36000UL) { f -= 36000UL; m += 10; }   /* no 32-bit divide: see num() */
    while (f >= 3600UL) { f -= 3600UL; m++; }
    fr = (WORD)f;
    while (fr >= 600) { fr -= 600; s += 10; }
    while (fr >= 60) { fr -= 60; s++; }
    cs = CENTI[fr];
    if (m > 99) m = 99;
    if (m >= 10) nb[k++] = (char)('0' + tens(&m));
    nb[k++] = (char)('0' + m);
    nb[k++] = ':';
    nb[k++] = (char)('0' + tens(&s));
    nb[k++] = (char)('0' + s);
    if (dec >= 1) { nb[k++] = '.'; nb[k++] = (char)('0' + tens(&cs)); }
    if (dec >= 2) nb[k++] = (char)('0' + cs);
    nb[k] = 0;
    return nb;
}

/* ======================================================================
 * chrome letter sprites (logo, countdown, PAUSED)
 * ==================================================================== */
static WORD gs_y[G_SLOTS], gs_x[G_SLOTS], gs_col[G_SLOTS];

static void gs_boot(void)
{
    int k;
    for (k = 0; k < G_SLOTS; k++) {
        gs_y[k] = 0; gs_x[k] = 0xffff; gs_col[k] = 0xffff;
        SC234Put(VRAM_SHRINK_ADDR(SPR_G0 + k), 0xfff);
        SC234Put(VRAM_POSY_ADDR(SPR_G0 + k), VRAM_POSY(224, SPR_UNLINK, 0));
    }
}

static void gs_hide(int k)
{
    if (!gs_y[k]) return;
    SC234Put(VRAM_POSY_ADDR(SPR_G0 + k), VRAM_POSY(224, SPR_UNLINK, 0));
    gs_y[k] = 0;
}

/* sprite k shows column col (0..) of glyphs.png, 2 tiles tall, at (x, y) */
static void gs_show(int k, short x, short y, int col)
{
    WORD s = (WORD)(SPR_G0 + k), v;
    const ushort *m = tt_glyphs.maps[0] + col * tt_glyphs.tileHeight * 2;
    v = (WORD)VRAM_POSY(y, SPR_UNLINK, 2);
    if (gs_y[k] != v) { SC234Put(VRAM_POSY_ADDR(s), v); gs_y[k] = v; }
    v = (WORD)VRAM_POSX(x & 0x1ff);
    if (gs_x[k] != v) { SC234Put(VRAM_POSX_ADDR(s), v); gs_x[k] = v; }
    if (gs_col[k] != col) {
        SC234Put(VRAM_SPR_ADDR(s), m[0]);
        SC234Put(VRAM_SPR_ADDR(s) + 1, (WORD)(m[1] + (SPR_PAL_GLYPH << 8)));
        SC234Put(VRAM_SPR_ADDR(s) + 2, m[2]);
        SC234Put(VRAM_SPR_ADDR(s) + 3, (WORD)(m[3] + (SPR_PAL_GLYPH << 8)));
        gs_col[k] = (WORD)col;
    }
}

/* a word in chrome letters from slot k (2 sprites per letter), letters 24 px apart */
static void gs_word(int k, short x, short y, const char *s, int maxlen)
{
    static const char *G = GLYPHS;
    int n = 0, g;
    for (; *s && n < maxlen; s++, n++) {
        for (g = 0; G[g] && G[g] != *s; g++) ;
        if (!G[g]) { gs_hide(k + n * 2); gs_hide(k + n * 2 + 1); continue; }
        gs_show(k + n * 2, (short)(x + n * 24), y, g * 2);
        gs_show(k + n * 2 + 1, (short)(x + n * 24 + 16), y, g * 2 + 1);
    }
    for (; n < maxlen; n++) { gs_hide(k + n * 2); gs_hide(k + n * 2 + 1); }
}

static void gs_clear(int k, int n) { while (n--) gs_hide(k++); }

/* ---------- card portraits: 64x64, 4 sprites of 4 tiles; slot 0 or 1 ---------- */
static BYTE card_shown[2] = { 0xff, 0xff };

static void card_show(int slot, int card, short x, short y)
{
    int j, t;
    WORD sp;
    const ushort *m;
    for (j = 0; j < 4; j++) {
        sp = (WORD)(SPR_CARD + slot * 4 + j);
        SC234Put(VRAM_SHRINK_ADDR(sp), 0xfff);
        SC234Put(VRAM_POSY_ADDR(sp), VRAM_POSY(y, SPR_UNLINK, 4));
        SC234Put(VRAM_POSX_ADDR(sp), VRAM_POSX(x + 16 * j));
        if (card_shown[slot] == card) continue;
        m = tt_cards.maps[0] + (card * 4 + j) * tt_cards.tileHeight * 2;
        for (t = 0; t < 4; t++) {
            SC234Put(VRAM_SPR_ADDR(sp) + t * 2, m[t * 2]);
            SC234Put(VRAM_SPR_ADDR(sp) + t * 2 + 1, (WORD)(m[t * 2 + 1] + (SPR_PAL_CARD << 8)));
        }
    }
    card_shown[slot] = (BYTE)card;
}

static void card_hide(int slot)
{
    int j;
    for (j = 0; j < 4; j++) SC234Put(VRAM_POSY_ADDR(SPR_CARD + slot * 4 + j), VRAM_POSY(224, SPR_UNLINK, 0));
}

/* big letters on the fix layer (2x2 tiles each): the fix layer is drawn over
   every sprite, so anything shown over a board has to live there */
static void big(int x, int y, BYTE pal, const char *s)
{
    static const char *B = BIGCHARS;
    int g;
    for (; *s; s++, x += 2) {
        for (g = 0; B[g] && B[g] != *s; g++) ;
        if (!B[g]) continue;
        fx_put(x, y, tw(pal, (WORD)(T_BIG + g * 4)));
        fx_put(x + 1, y, tw(pal, (WORD)(T_BIG + g * 4 + 1)));
        fx_put(x, y + 1, tw(pal, (WORD)(T_BIG + g * 4 + 2)));
        fx_put(x + 1, y + 1, tw(pal, (WORD)(T_BIG + g * 4 + 3)));
    }
}

/* ======================================================================
 * sound and music
 * ==================================================================== */
static BYTE pan_of(Side *s)
{
    if (screen != SCR_GAME || side[0].state == S_OFF || side[1].state == S_OFF) return SND_CENTRE;
    return s->i ? SND_RIGHT : SND_LEFT;
}

static void sfx(Side *s, BYTE id) { snd_play(id, s ? pan_of(s) : SND_CENTRE); }

/* CD tracks: 2 title, 3 marathon, 4 sprint, 5 versus, 6 survival */
static void music(BYTE track)
{
    if (!opt_music) { if (track_on) music_pause(); track_on = 0; return; }
    if (track == track_on) return;
    track_on = track;
    music_play(track);
}

static BYTE mode_track(void) { return (BYTE)(3 + mode); }

/* ======================================================================
 * boards
 * ==================================================================== */
static DWORD fresh_seed(void)
{
    seed_mix = seed_mix * 1103515245UL + 12345UL + frames;
    return seed_mix ^ (frames << 16);
}

static Side *other(Side *s) { return &side[s->i ^ 1]; }

static void say(Side *s, const char *a, const char *b)
{
    int k;
    for (k = 0; k < 12 && a[k]; k++) s->call1[k] = a[k];
    s->call1[k] = 0;
    for (k = 0; k < 12 && b[k]; k++) s->call2[k] = b[k];
    s->call2[k] = 0;
    s->call_t = CALL_FRAMES;
    s->call_gen++;
}

/* "12 ROWS": a number and a word, for callouts (12 columns at most) */
static char ct[16];
static const char *count_txt(WORD n, const char *word)
{
    const char *p = num(n, 3, ' ');
    while (*p == ' ') p++;
    str_cpy(ct, p);
    p = word;
    n = (WORD)slen(ct);
    while (*p && n < 12) ct[n++] = *p++;
    ct[n] = 0;
    return ct;
}

static BYTE active(Side *s) { return (BYTE)(s->state == S_COUNT || s->state == S_PLAY); }

/* a Survival CPU gets tougher every 2 KOs of the player it faces */
static tt_u8 surv_level(Side *s)
{
    WORD l = (WORD)(1 + other(s)->kos / 2);
    return (tt_u8)(l > 8 ? 8 : l);
}

static void begin_side(Side *s, DWORD seed, WORD count)
{
    tt_u16 goal = mode == M_MARATHON ? 150 : mode == M_SPRINT ? 40 : 0;
    tt_init(&s->b, seed, 1, goal, (tt_u8)(mode == M_MARATHON), (tt_u8)(mode >= M_VS));
    s->b.clear_delay = opt_clear;
    s->b.sonic = (tt_u8)(s->cpu_on ? 0 : pad_cfg[s->i].sonic);
    s->state = S_COUNT;
    s->count_t = count;
    s->go_t = 0;
    s->time = 0;
    s->result = R_NONE;
    s->call_t = 0;
    s->trail_t = s->flash_t = 0;
    s->das_dir = 0;
    s->rank = -1;
    s->fd_full = 1;
    s->join = 0;
    s->ready = 0;
    s->card_mode = s->card_dir = s->aim = 0;
    s->launch_used = s->launch_ready = 0;
    s->bank_t = s->cap_t = s->cap_fired = s->cap_ready = s->jump_t = 0;
    s->cpu_mh = s->cpu_mo = 0; s->cpu_ma = 0;
    s->spins_seen = 0;
    s->fired = 0;
    s->cpu_card_t = 0;
    if (s->cpu_on) cpu_init(&s->cpu, mode == M_SURV ? surv_level(s) : cpu_level, fresh_seed());
}

/* both boards, same bricks: a fresh Versus or Survival match */
static void begin_match(void)
{
    DWORD seed = fresh_seed();
    vs_time = 0;
    launch_by = -1; broken_t = 0;
    side[0].kos = side[1].kos = 0;
    begin_side(&side[0], seed, COUNT_FRAMES);
    begin_side(&side[1], seed, COUNT_FRAMES);
}

static void draw_static(void);
static void pick_open(BYTE who);
static BYTE cards_on(void);
static BYTE carries(Side *s);
static BYTE ghost_on(const Side *s);
static BYTE can_launch(Side *s);
static BYTE previews(const Side *s);

/* a fresh Versus or Survival match: with cards on, players in who (bits) pick first */
static void new_match(BYTE who)
{
    if (cards_on()) pick_open(who);
    else begin_match();
}

static BYTE random_card(void) { return (BYTE)(fresh_seed() % CARD_COUNT); }
static void surv_gap(Side *s);

static void start_game(BYTE m, BYTE p)
{
    int k;
    mode = m;
    screen = SCR_GAME;
    paused = 0;
    launch_by = -1; broken_t = 0;
    gs_clear(GS_LOGO, 18);
    cls();
    for (k = 0; k < 2; k++) {
        Side *s = &side[k];
        s->i = (BYTE)k;
        s->state = S_OFF;
        s->cpu_on = 0;
        s->wins = 0;
        s->prev = 0xff;              /* the button that started the game is not a move */
        s->call_t = 0;
    }
    bg_accent((BYTE)(1 + (m > 3 ? 3 : m)));
    music(mode_track());
    if (m == M_VS || m == M_SURV) {
        side[p ^ 1].cpu_on = 1;
        if (cards_on()) { pick_open((BYTE)(1 << p)); return; }
        begin_match();
    } else begin_side(&side[p], fresh_seed(), COUNT_FRAMES);
    draw_static();
}

/* attract mode: the title sat idle, so two CPUs play a Versus match (cards if they're on) */
static void start_demo(void)
{
    int k;
    start_game(M_VS, 0);
    demo = 1;
    demo_t = demo_end = 0;
    side[0].cpu_on = side[1].cpu_on = 1;
    if (screen == SCR_PICK) {                   /* the CPUs need no pick screen */
        for (k = 0; k < 2; k++) side[k].card = random_card();
        card_hide(0); card_hide(1);
        screen = SCR_GAME;
        cls();
    }
    begin_match();
    for (k = 0; k < 2; k++) cpu_init(&side[k].cpu, (tt_u8)(4 + fresh_seed() % 5), fresh_seed());
    draw_static();
}

static void to_title(void)
{
    screen = SCR_TITLE;
    demo = 0;
    idle_t = 0;
    paused = 0;
    gs_clear(0, G_SLOTS);
    card_hide(0); card_hide(1);
    cls();
    bg_accent(0);
    music(2);
}

/* ---------- input during play ---------- */
static BYTE btn_bit(BYTE b) { return (BYTE)(b < 4 ? (JOY_A << b) : 0); }

static void side_input(Side *s, BYTE cur, BYTE live)
{
    PadCfg *c = &pad_cfg[s->i];
    tt_board *b = &s->b;
    BYTE edge = (BYTE)(cur & ~s->prev);
    BYTE l = (BYTE)(cur & JOY_LEFT), r = (BYTE)(cur & JOY_RIGHT);
    int dir;
    s->prev = cur;
    if (live) {
        if (edge & btn_bit(c->btn[ACT_HOLD])) {
            if (b->holo) { say(s, "CAN'T HOLD", "A HOLOGRAM"); sfx(s, SND_DENY); }
            else tt_hold(b);
        }
        if (edge & btn_bit(c->btn[ACT_ROT_L])) tt_rotate(b, -1);
        if (edge & btn_bit(c->btn[ACT_ROT_R])) tt_rotate(b, 1);
    }
    /* DAS / ARR (charges during the countdown and line clears too) */
    if (edge & JOY_LEFT) { s->das_dir = 1; s->das_t = 0; if (live) tt_move(b, -1); }
    else if (edge & JOY_RIGHT) { s->das_dir = 2; s->das_t = 0; if (live) tt_move(b, 1); }
    else if ((s->das_dir == 1 && !l) || (s->das_dir == 2 && !r)) {
        s->das_dir = (BYTE)(l ? 1 : r ? 2 : 0);
        s->das_t = 0;
    } else if (s->das_dir) {
        dir = s->das_dir == 1 ? -1 : 1;
        if (s->das_t < c->das) s->das_t++;
        if (s->das_t >= c->das && live) {
            if (!c->arr) { while (tt_move(b, dir)) ; }
            else if (s->das_t == c->das) { s->das_t++; s->arr_t = 0; tt_move(b, dir); }
            else if (++s->arr_t >= c->arr) { s->arr_t = 0; tt_move(b, dir); }
        }
    }
    b->soft = (tt_u8)(live && (cur & JOY_DOWN) != 0);
    if (live && ((edge & btn_bit(c->btn[ACT_HARD])) || (c->up_drop && (edge & JOY_UP)))) tt_hard_drop(b);
}

/* ---------- Ace of Stars: the reels ---------- */
static const char REEL_SYM[5] = { '7', '*', 'C', '$', 'X' };

/* the callout while the reels turn: [7][*][C], each reel stopping in turn on the result */
static void reels(Side *s)
{
    tt_board *b = &s->b;
    static const char WIN[4][3] = { { 'X', '$', 'C' }, { '7', '7', '7' }, { 'C', 'C', 'C' }, { '7', 'X', 'C' } };
    char c[10];
    int k, t = TT_SPIN_FRAMES - b->spin_t, stop;
    if (t % 4 && b->spin_t) return;
    for (k = 0; k < 3; k++) {
        stop = (k + 1) * TT_SPIN_FRAMES / 4 + (k == 2 ? TT_SPIN_FRAMES / 4 : 0);   /* 18, 36, 72 */
        c[k * 3] = '[';
        c[k * 3 + 1] = t >= stop || !b->spin_t ? WIN[b->spin_res][k] : REEL_SYM[(t / 4 + k * 2) % 5];
        c[k * 3 + 2] = ']';
    }
    c[9] = 0;
    say(s, b->spin_t ? "ACE OF STARS" : b->spin_res == TT_LEVER_JACKPOT ? "JACKPOT!" :
        b->spin_res == TT_LEVER_CHERRIES ? "CHERRIES!" : "BUST!", c);
}

/* ---------- what happened this frame: sounds and callouts ---------- */
static const char *LINE_NAME[5] = { "", "SINGLE", "DOUBLE", "TRIPLE", "QUAD!" };

static void side_events(Side *s)
{
    tt_board *b = &s->b;
    DWORD ev = b->ev;
    char a[13], c[13];
    int k = 0, j;
    const char *p;
    if (!ev) return;
    if ((ev & TT_EV_MOVE) && !s->cpu_on) sfx(s, SND_MOVE);
    if (ev & TT_EV_ROTATE) sfx(s, (ev & TT_EV_KICK) ? SND_KICK : SND_ROTATE);
    if (ev & TT_EV_HOLD) sfx(s, SND_HOLD);
    if (ev & TT_EV_HARD) {
        s->trail_t = TRAIL_FRAMES;
        s->tr_type = b->hd_type; s->tr_rot = b->hd_rot;
        s->tr_x = b->hd_x; s->tr_y0 = b->hd_y0; s->tr_y1 = b->hd_y1;
        sfx(s, SND_HARD);
    } else if (ev & TT_EV_LOCK) sfx(s, SND_LOCK);
    if (ev & TT_EV_LOCK) s->flash_t = 4;
    if (ev & (TT_EV_CLEAR | TT_EV_SPIN)) {
        /* first line: B2B / T-SPIN / MINI T-SPIN; second: SINGLE.. QUAD! and the combo */
        if (b->last_b2b) { a[k++] = 'B'; a[k++] = '2'; a[k++] = 'B'; a[k++] = ' '; }
        p = b->last_spin == TT_SPIN_FULL ? "T-SPIN" : b->last_spin == TT_SPIN_MINI ? "MINI T-SPIN" : "";
        while (*p && k < 12) a[k++] = *p++;
        a[k] = 0;
        p = LINE_NAME[b->last_lines];
        for (j = 0; *p && j < 12; ) c[j++] = *p++;
        if (b->last_combo > 0 && j < 9) {
            c[j++] = ' '; c[j++] = 'X';
            if (b->last_combo + 1 >= 10) c[j++] = (char)('0' + (b->last_combo + 1) / 10);
            c[j++] = (char)('0' + (b->last_combo + 1) % 10);
        }
        c[j] = 0;
        if (b->last_pc) say(s, "ALL CLEAR!", c);
        else say(s, a, c);
        if (b->last_spin && b->last_lines) sfx(s, SND_TSPIN);
        else if (b->last_lines) sfx(s, (BYTE)(SND_CLEAR1 + b->last_lines - 1));
        else sfx(s, SND_TSPIN);
        if (b->last_combo > 0) sfx(s, SND_COMBO);
    }
    if (ev & TT_EV_LEVEL) { say(s, "LEVEL UP", num(b->level, 2, '0')); sfx(s, SND_LEVEL); }
    if (ev & TT_EV_GARBAGE) sfx(s, SND_GARBAGE);
    if (ev & TT_EV_TOPOUT) sfx(s, SND_TOPOUT);
    /* Phantom Reel */
    if (ev & TT_EV_HOLO) { say(s, "HOLOGRAM!", s->cpu_on ? "PHANTOM REEL" : "CARD: FREEZE"); sfx(s, SND_HOLO); }
    if (ev & TT_EV_FREEZE) { if (s->cpu_on) say(s, "FREEZE!", "PHANTOM REEL"); sfx(s, SND_FREEZE); }
    if (ev & TT_EV_HOLOSET) sfx(s, SND_HOLOSET);
    /* Origami Crane: folded garbage landed here */
    /* Ace of Stars */
    if (ev & TT_EV_LEVER) {
        reels(s);
        sfx(s, (BYTE)(b->spin_res == TT_LEVER_JACKPOT ? SND_JACKPOT : b->spin_res == TT_LEVER_CHERRIES ? SND_CHERRIES : SND_BUST));
    }
    /* Gold Ledger */
    if (ev & TT_EV_INTEREST) { s->bank_t = 30; s->bank_col = PAL_WHITE; sfx(s, SND_INTEREST); }
    if (ev & TT_EV_FOLDIN) { say(s, "FOLDED IN!", count_txt(b->fold_n, b->fold_n == 1 ? " ROW" : " ROWS")); sfx(s, SND_FOLDIN); }
}

/* ---------- results ---------- */
static void side_finish(Side *s, BYTE result)
{
    s->state = S_DONE;
    s->result = result;
    s->b.active = 0;
    s->rank = -1;
    if (s->cpu_on) return;
    if (mode == M_MARATHON) s->rank = (signed char)mar_rank(s->b.score);
    else if (mode == M_SPRINT && result == R_CLEAR) s->rank = (signed char)spr_rank(s->time);
    else if (mode == M_SURV) s->rank = (signed char)srv_rank(s->kos);
    if (s->rank >= 0) {
        s->state = S_NAME;
        s->name[0] = 'A'; s->name[1] = 'A'; s->name[2] = 'A'; s->name[3] = 0;
        s->name_pos = 0;
    }
    sfx(s, (BYTE)(result == R_TOPOUT || result == R_LOSE || result == R_LATE ? SND_TOPOUT : SND_GO));
}

/* ======================================================================
 * drawing
 * ==================================================================== */
static void draw_bezel(int fc)
{
    int y;
    fx_put(fc - 1, FIELD_ROW - 1, tw(PAL_WHITE, T_BEZ + 0));
    fill(fc, FIELD_ROW - 1, 10, 1, tw(PAL_WHITE, T_BEZ + 1));
    fx_put(fc + 10, FIELD_ROW - 1, tw(PAL_WHITE, T_BEZ + 2));
    for (y = 0; y < 20; y++) {
        fx_put(fc - 1, FIELD_ROW + y, tw(PAL_WHITE, T_BEZ + 3));
        fx_put(fc + 10, FIELD_ROW + y, tw(PAL_WHITE, T_BEZ + 4));
    }
    fx_put(fc - 1, FIELD_ROW + 20, tw(PAL_WHITE, T_BEZ + 5));
    fill(fc, FIELD_ROW + 20, 10, 1, tw(PAL_WHITE, T_BEZ + 6));
    fx_put(fc + 10, FIELD_ROW + 20, tw(PAL_WHITE, T_BEZ + 7));
}

static void draw_static(void)
{
    int k;
    for (k = 0; k < 2; k++) {
        draw_bezel(FIELD_COL[k]);
        txt(PANEL_COL[k], HOLD_ROW - 1, PAL_AMBER, "HOLD");
        fill(PANEL_COL[k], HOLD_ROW, 4, 2, tw(PAL_WHITE, T_INSET));
        txt(PANEL_COL[k], NEXT_ROW - 1, PAL_AMBER, "NEXT");
        fill(PANEL_COL[k], NEXT_ROW, 4, 15, tw(PAL_WHITE, T_INSET));
    }
}

/* a brick in a 4x2 box at (x, y): 3-wide bricks are shifted half a cell to sit centred */
static void draw_mini(int x, int y, BYTE type, BYTE pal)
{
    int k, minx = 9, maxx = -1, miny = 9, cx, cy, w, t, r, lh, rh;
    BYTE cell[2][4];
    for (r = 0; r < 2; r++) for (t = 0; t < 4; t++) cell[r][t] = 0;
    if (type) {
        for (k = 0; k < 4; k++) {
            cx = TT_SHAPE[type][0][k][0]; cy = TT_SHAPE[type][0][k][1];
            if (cx < minx) minx = cx;
            if (cx > maxx) maxx = cx;
            if (cy < miny) miny = cy;
        }
        for (k = 0; k < 4; k++) {
            cx = TT_SHAPE[type][0][k][0] - minx; cy = TT_SHAPE[type][0][k][1] - miny;
            if (cy < 2 && cx < 4) cell[cy][cx] = 1;
        }
    }
    w = type ? maxx - minx + 1 : 4;
    for (r = 0; r < 2; r++)
        for (t = 0; t < 4; t++) {
            WORD tile = T_INSET;
            if (w == 3) {
                lh = t >= 1 && cell[r][t - 1];
                rh = t <= 2 && cell[r][t];
                tile = (WORD)(lh && rh ? T_HALF_LR : lh ? T_HALF_L : rh ? T_HALF_R : T_INSET);
            } else if (w == 2) {
                if (t >= 1 && t <= 2 && cell[r][t - 1]) tile = T_BRICK;
            } else if (cell[r][t]) tile = T_BRICK;
            fx_put(x + t, y + r, tw(pal, tile));
        }
}

/* rows (bit y) that a brick at row y covers */
static DWORD brick_rows(int type, int rot, int y)
{
    DWORD m = 0;
    int k, cy;
    for (k = 0; k < 4; k++) {
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cy >= 0 && cy < TT_ROWS) m |= 1UL << cy;
    }
    return m;
}

#define ROWS_SEEN (((1UL << TT_ROWS) - 1) & ~((1UL << TT_HIDDEN) - 1))

/* a settled cell: a brick in its colour, or a Cyclops boulder */
static WORD cell_w(BYTE c)
{
    return c == TT_ROCK ? tw(PAL_AMBER, T_ROCK) : tw(PAL_OF(c), T_BRICK);
}

/*
 * The field is only drawn when something on it changed, and then only the
 * rows that changed: rows of settled bricks the rules touched (grid_rows),
 * and the rows the falling brick, its ghost, the drop trail and the lock
 * flash are on now or were on last time.
 */
static void draw_field(Side *s)
{
    tt_board *b = &s->b;
    int fc = FIELD_COL[s->i], x, y, k, gy = -1, cx, cy, full;
    BYTE play = (BYTE)(s->state == S_PLAY), go = (BYTE)(s->go_t != 0), c;
    BYTE clearing = (BYTE)(b->clear_t != 0), ghost = ghost_on(s);
    BYTE dark = (BYTE)(b->fx[TT_FX_DARK] && play);
    BYTE aimk = (BYTE)(s->aim && play ? 0x80 | (s->aim_x << 1) | ((frames >> 3) & 1) : 0);
    /* Time Capsule: 1 = the card button is held, the marked field shows; 2 = a jump's flash */
    BYTE capk = (BYTE)(play ? ((s->cap_t >= 6 && !s->cap_fired && b->marked) ? 1 : (s->jump_t & 4) ? 2 : 0) : 0);
    DWORD sig, ov = 0, rows, bit;
    const tt_u8 *row;
    WORD trail_w;

    sig = ((DWORD)(b->x + 4) & 15) | ((DWORD)(b->y & 31) << 4) | ((DWORD)b->rot << 9) |
          ((DWORD)b->type << 11) | ((DWORD)b->active << 14) | ((DWORD)play << 15) |
          ((DWORD)ghost << 16) | ((DWORD)(s->flash_t != 0) << 17) |
          ((DWORD)TRAIL_LEN[s->trail_t] << 18) |
          ((DWORD)(b->clear_t ? 1 + (b->clear_t >> 1 & 1) : 0) << 20) |  /* what shows, not the timers */
          ((DWORD)b->holo << 22) | ((DWORD)(b->holo && (frames >> 3 & 1)) << 23) |
          ((DWORD)(b->fold_t ? 1 + (b->fold_t >> 2 & 1) : 0) << 24);   /* Origami Crane: a fold landing */
    full = s->fd_full || paused != s->fd_paused || s->state != s->fd_state || go != s->fd_go ||
           aimk != s->fd_aim || dark != s->fd_dark || capk != s->fd_cap;
    if (!full && sig == s->fd_sig && !b->grid_rows) return;
    s->fd_full = 0; s->fd_paused = paused; s->fd_state = s->state; s->fd_go = go;
    s->fd_sig = sig; s->fd_aim = aimk; s->fd_dark = dark; s->fd_cap = capk;
    if (paused) { fill(fc, FIELD_ROW, 10, 20, tw(PAL_WHITE, T_BLACK)); s->fd_ov = 0; b->grid_rows = 0; return; }
    /* Nightfall / Swarm: the whole field goes dark */
    if (dark) {
        if (full) {
            fill(fc, FIELD_ROW, 10, 20, tw(PAL_WHITE, T_BLACK));
            txt_c(fc, 10, FIELD_ROW + 9, PAL_VIOLET, "DARK");
        }
        s->fd_ov = 0; b->grid_rows = 0;
        return;
    }

    if (s->trail_t && play)
        for (y = s->tr_y1 - 3 < 0 ? 0 : s->tr_y1 - 3; y <= s->tr_y1 + 3 && y < TT_ROWS; y++) ov |= 1UL << y;
    if (b->active && play) {
        ov |= brick_rows(b->type, b->rot, b->y);
        if (ghost) { gy = tt_ghost_y(b); ov |= brick_rows(b->type, b->rot, gy); }
    }
    if (s->flash_t) for (k = 0; k < 4; k++) ov |= 1UL << b->lock_cells[k][1];
    if (clearing) ov |= b->clear_rows;
    if (b->fold_t) ov |= b->fold_rows;
    rows = full ? ROWS_SEEN : ((ov | s->fd_ov | b->grid_rows) & ROWS_SEEN);
    s->fd_ov = ov;
    b->grid_rows = 0;

    /* settled bricks (and the flashing rows of a line clear) */
    for (y = TT_HIDDEN, bit = 1UL << TT_HIDDEN; y < TT_ROWS; y++, bit <<= 1) {
        if (!(rows & bit)) continue;
        row = b->grid[y];
        if (clearing && (b->clear_rows & bit)) {
            for (x = 0; x < TT_COLS; x++) {
                c = row[x];
                fx_put(fc + x, FIELD_ROW + y - TT_HIDDEN,
                       (b->clear_t & 2) ? tw(PAL_WHITE, T_BRICK) : cell_w(c ? c : TT_GARBAGE));
            }
        } else if (capk == 1) {
            /* holding to jump: the marked field in outline */
            for (x = 0; x < TT_COLS; x++)
                fx_put(fc + x, FIELD_ROW + y - TT_HIDDEN, b->mark[y][x] ? tw(PAL_BLUE, T_GHOST) : tw(PAL_WHITE, T_EMPTY));
        } else if (capk == 2) {
            for (x = 0; x < TT_COLS; x++)
                fx_put(fc + x, FIELD_ROW + y - TT_HIDDEN, row[x] ? tw(PAL_BLUE, T_BRICK) : tw(PAL_WHITE, T_EMPTY));
        } else if (b->fold_t && (b->fold_rows & bit)) {
            /* stamped by a fold: lime and white while it plays */
            for (x = 0; x < TT_COLS; x++)
                fx_put(fc + x, FIELD_ROW + y - TT_HIDDEN, row[x] == TT_GARBAGE ?
                       tw((BYTE)(b->fold_t & 4 ? PAL_WHITE : PAL_LIME), T_BRICK) : row[x] ? cell_w(row[x]) : tw(PAL_WHITE, T_EMPTY));
        } else
            for (x = 0; x < TT_COLS; x++) {
                c = row[x];
                fx_put(fc + x, FIELD_ROW + y - TT_HIDDEN, c ? cell_w(c) : tw(PAL_WHITE, T_EMPTY));
            }
    }
    /* Eye Beam aim: the two columns it will empty, blinking */
    if (aimk)
        for (y = TT_HIDDEN; y < TT_ROWS; y++)
            for (cx = s->aim_x; cx <= s->aim_x + 1; cx++)
                fx_put(fc + cx, FIELD_ROW + y - TT_HIDDEN,
                       b->grid[y][cx] ? tw((BYTE)(aimk & 1 ? PAL_WHITE : PAL_YELLOW), T_BRICK) : tw(PAL_YELLOW, T_GHOST));
    /* on top, lowest first: drop tail, ghost, lock flash, falling brick */
    if (s->trail_t && play) {
        const tt_s8 (*sh)[2] = TT_SHAPE[s->tr_type][s->tr_rot];
        int len = TRAIL_LEN[s->trail_t], j, top, ty;
        for (k = 0; k < 4; k++) {
            /* one tail per column, above the brick's top cell in that column */
            for (j = 0; j < 4; j++) if (sh[j][0] == sh[k][0] && sh[j][1] < sh[k][1]) break;
            if (j < 4) continue;
            cx = s->tr_x + sh[k][0];
            if (cx < 0 || cx >= TT_COLS) continue;
            ty = s->tr_y1 + sh[k][1];                 /* where that cell landed */
            top = s->tr_y0 + sh[k][1];                /* ...and where it started */
            if (ty - len > top) top = ty - len;
            for (y = ty - 1; y >= top; y--) {
                if (y < TT_HIDDEN || y >= TT_ROWS || b->grid[y][cx] || (clearing && (b->clear_rows & (1UL << y)))) continue;
                trail_w = tw(PAL_OF(s->tr_type), (WORD)(T_TRAIL + (y == ty - 1 ? 0 : 1)));
                fx_put(fc + cx, FIELD_ROW + y - TT_HIDDEN, trail_w);
            }
        }
    }
    if (gy >= 0)
        for (k = 0; k < 4; k++) {
            cx = b->x + TT_SHAPE[b->type][b->rot][k][0];
            cy = gy + TT_SHAPE[b->type][b->rot][k][1];
            if (cy >= TT_HIDDEN && !b->grid[cy][cx]) fx_put(fc + cx, FIELD_ROW + cy - TT_HIDDEN, tw(PAL_OF(b->type), T_GHOST));
        }
    if (s->flash_t)
        for (k = 0; k < 4; k++) {
            cx = b->lock_cells[k][0];
            cy = b->lock_cells[k][1];
            if (cy >= TT_HIDDEN && b->grid[cy][cx] && !(clearing && (b->clear_rows & (1UL << cy))))
                fx_put(fc + cx, FIELD_ROW + cy - TT_HIDDEN, tw(PAL_WHITE, T_BRICK));
        }
    if (b->active && play)
        for (k = 0; k < 4; k++) {
            cx = b->x + TT_SHAPE[b->type][b->rot][k][0];
            cy = b->y + TT_SHAPE[b->type][b->rot][k][1];
            if (cy < TT_HIDDEN) continue;
            /* a hologram: scanlines over empty cells (what a freeze fills), dim over bricks */
            if (b->holo)
                fx_put(fc + cx, FIELD_ROW + cy - TT_HIDDEN, b->grid[cy][cx] ? tw(PAL_CYAN, T_HOLO_IN) :
                       tw(PAL_CYAN, (WORD)(T_HOLO + (frames >> 3 & 1))));
            else fx_put(fc + cx, FIELD_ROW + cy - TT_HIDDEN, tw(PAL_OF(b->type), T_BRICK));
        }
}

/*
 * Incoming garbage bar in the left bezel: amber while it waits, flashing red
 * when it can land.  Origami Crane, above it: folded in (lands next
 * placement) flashing red and lime, and what the opponent holds to fold
 * over in lime; Gold Ledger: the opponent's bank in yellow.
 */
static void draw_gauge(Side *s)
{
    int fc = FIELD_COL[s->i], n = tt_pending(&s->b), ready = tt_pending_ready(&s->b), y;
    int fin = tt_fold_queued(&s->b), held = 0;
    BYTE hot = (BYTE)((frames >> 3) & 1 ? PAL_RED : PAL_WHITE), fold = (BYTE)((frames >> 3) & 1 ? PAL_RED : PAL_LIME);
    DWORD key;
    Side *o = other(s);
    if (o->state == S_PLAY || o->state == S_COUNT) held = tt_fold_held(&o->b) + o->b.bank;
    if (n > 20) n = 20;
    if (ready > 20) ready = 20;
    fin = n + fin > 20 ? 20 : n + fin;
    held = fin + held > 20 ? 20 : fin + held;
    key = 0x80000000UL | n | (ready << 5) | ((DWORD)((ready && hot == PAL_RED) || (fin > n && fold == PAL_RED)) << 10) |
          ((DWORD)fin << 11) | ((DWORD)held << 16) | ((DWORD)(o->b.bank != 0) << 21);
    if (key == s->gauge_key) return;
    s->gauge_key = key;
    for (y = 0; y < 20; y++) {
        int from_bottom = 19 - y;
        WORD wd;
        if (from_bottom < ready) wd = tw(hot, T_BEZ_GAUGE);
        else if (from_bottom < n) wd = tw(PAL_AMBER, T_BEZ_GAUGE);
        else if (from_bottom < fin) wd = tw(fold, T_BEZ_GAUGE);
        else if (from_bottom < held) wd = tw((BYTE)(o->b.bank ? PAL_YELLOW : PAL_LIME), T_BEZ_GAUGE);
        else wd = tw(PAL_WHITE, T_BEZ + 3);
        fx_put(fc - 1, FIELD_ROW + y, wd);
    }
}

/* cards are in play: Versus (CPU or 2P) and Survival, with the option on */
static BYTE cards_on(void)
{
    return (BYTE)(opt_cards && (mode == M_VS || mode == M_SURV));
}

static BYTE has_card(const Side *s, BYTE card) { return (BYTE)(cards_on() && s->card == card); }

/* Cyclops' Focus: the ghost is always on */
static BYTE ghost_on(const Side *s) { return (BYTE)(opt_ghost || has_card(s, CARD_CYCLOPS)); }

/*
 * Next bricks shown.  Without cards: all 5.  With cards, as in the web game:
 * 3, Giant Bat's Echolocation 4, Sonar 5, under a Glare none.
 */
static BYTE previews(const Side *s)
{
    if (!cards_on()) return TT_NEXT;
    if (s->b.fx[TT_FX_GLARE]) return 0;
    if (s->b.fx[TT_FX_SONAR]) return 5;
    return (BYTE)(has_card(s, CARD_BAT) ? 4 : 3);
}

/* the garbage this board sends: Skeleton ribs, Werewolf claws, Giant Bat stairs */
static tt_u8 pat_of(const Side *s)
{
    if (!cards_on()) return TT_PAT_STD;
    switch (s->card) {
    case CARD_SKELETON: return TT_PAT_RIBS;
    case CARD_WEREWOLF: return TT_PAT_CLAW;
    case CARD_BAT:      return TT_PAT_STAIRS;
    default:            return TT_PAT_STD;
    }
}

/*
 * Effects on a board, one word at a time under the NEXT column (4 columns,
 * level with the bottom bezel): what hit it (HOWL, SHVR, GLAR, DARK) and
 * what it has up (ECHO, SONR).
 */
static void draw_fx(Side *s, BYTE show)
{
    static const char *FX_TAG[TT_FX_N] = { "GLAR", "SONR", "HOWL", "SHVR", "DARK", "ECHO" };
    static const BYTE FX_PAL[TT_FX_N] = { PAL_YELLOW, PAL_CYAN, PAL_RED, PAL_WHITE, PAL_VIOLET, PAL_VIOLET };
    const char *tag[TT_FX_N + 6];
    static char spins[4] = { '7', 'X', '2', 0 };
    BYTE pal[TT_FX_N + 6], id[TT_FX_N + 6], n = 0;
    tt_board *b = &s->b;
    int k;
    WORD key = 0;
    if (show) {
        for (k = 0; k < TT_FX_N; k++) if (b->fx[k]) { tag[n] = FX_TAG[k]; id[n] = (BYTE)k; pal[n++] = FX_PAL[k]; }
        /* boss cards: Phantom Reel HOLO; Origami Crane FOLD (red while one is coming in,
           lime while holding some); Gold Ledger BANK */
        if (b->holo || tt_holo_ready(b) > 0) { tag[n] = "HOLO"; id[n] = 16; pal[n++] = PAL_CYAN; }
        if (b->fi_n) { tag[n] = "FOLD"; id[n] = 17; pal[n++] = PAL_RED; }
        else if (b->fh_n) { tag[n] = "FOLD"; id[n] = 17; pal[n++] = PAL_LIME; }
        if (b->bank) { tag[n] = "BANK"; id[n] = 18; pal[n++] = PAL_YELLOW; }
        if (b->marked) { tag[n] = "MARK"; id[n] = 19; pal[n++] = PAL_BLUE; }
        if (b->spin_t) { tag[n] = "SPIN"; id[n] = 20; pal[n++] = PAL_PINK; }
        else if (tt_lever_spins(b) > 1) {            /* spins stacked: 7X2 */
            k = tt_lever_spins(b);
            spins[2] = (char)('0' + (k > 9 ? 9 : k));
            tag[n] = spins; id[n] = (BYTE)(21 + k); pal[n++] = PAL_PINK;
        }
    }
    if (n) {
        k = (int)((frames / 40) % n);
        key = (WORD)(0x8000 | ((WORD)pal[k] << 8) | id[k]);
    }
    if (key == s->fx_key) return;
    s->fx_key = key;
    fill(PANEL_COL[s->i], FX_ROW, 4, 1, BLANK);
    if (n) txt(PANEL_COL[s->i], FX_ROW, pal[k], tag[k]);
}

/*
 * Card meter in the right bezel: 10 segments, one per line cleared.
 * Cyan while it fills, yellow when full, grey during the 8 s cooldown.
 */
static void draw_meter(Side *s)
{
    int fc = FIELD_COL[s->i], k, n = s->b.meter;
    BYTE on = cards_on(), col = (BYTE)(s->b.cool ? PAL_GREY : n >= TT_METER_MAX ? PAL_YELLOW : PAL_CYAN);
    WORD key;
    /* Launch Key: the bar is the count.  Grey until you're ahead, flashing when
       you can start it, draining (red for the last 3) while it runs, empty once used */
    if (on && s->card == CARD_LAUNCH) {
        if (launch_by == s->i) { n = (launch_t + 59) / 60; col = (BYTE)(n <= 3 ? PAL_RED : PAL_AMBER); }
        else if (s->launch_used) n = 0;
        else { n = TT_METER_MAX; col = (BYTE)(can_launch(s) ? ((frames >> 3) & 1 ? PAL_YELLOW : PAL_AMBER) : PAL_GREY); }
    }
    /* Phantom Reel: the bar fills over 10 lines to the next hologram; full and
       flashing while one is next or in play; empty once all 3 are used */
    if (on && s->card == CARD_REEL) {
        tt_board *b = &s->b;
        if (b->holo || tt_holo_ready(b) > 0) { n = TT_METER_MAX; col = (BYTE)((frames >> 3) & 1 ? PAL_CYAN : PAL_WHITE); }
        else if (b->holo_used >= TT_HOLO_MAX) n = 0;
        else { n = b->lines < b->holo_from ? 0 : (b->lines - b->holo_from) % TT_HOLO_LINES; col = PAL_CYAN; }
    }
    /* Origami Crane: the bar fills over 8 lines to the next fold; flashing
       yellow while an Early Fold can go */
    if (on && s->card == CARD_ORIGAMI) {
        tt_board *b = &s->b;
        n = ((TT_FOLD_EVERY - tt_fold_in_lines(b)) * 10 + 4) / TT_FOLD_EVERY;
        col = PAL_LIME;
        if (tt_fold_early_block(b, &other(s)->b) == TT_FOLD_OK && other(s)->state == S_PLAY) {
            if (!n) n = 1;
            col = (BYTE)((frames >> 3) & 1 ? PAL_YELLOW : PAL_LIME);
        }
    }
    /* Time Capsule: the bar fills over 10 lines to the next jump; full when one
       is ready (flashing blue and white while a mark is saved too); empty after 3 */
    if (on && s->card == CARD_CAPSULE) {
        tt_board *b = &s->b;
        col = PAL_BLUE;
        if (tt_cap_jumps(b) > 0) {
            n = TT_METER_MAX;
            if (b->marked) col = (BYTE)((frames >> 3) & 1 ? PAL_BLUE : PAL_WHITE);
        } else if (b->jumps_used >= TT_CAP_MAX) n = 0;
        else n = b->lines < b->cap_from ? 0 : (b->lines - b->cap_from) % TT_CAP_LINES;
    }
    /* Ace of Stars: the bar fills over 10 lines to the next spin; full and
       flashing pink and yellow while one is ready */
    if (on && s->card == CARD_ACE) {
        tt_board *b = &s->b;
        col = PAL_PINK;
        if (tt_lever_spins(b) > 0) { n = TT_METER_MAX; col = (BYTE)((frames >> 3) & 1 ? PAL_PINK : PAL_YELLOW); }
        else n = b->lines < b->spin_from ? 0 : (b->lines - b->spin_from) % TT_LEVER_LINES;
    }
    /* Gold Ledger: the bar is the bank (10 rows); white when interest pays, red when it's hit */
    if (on && s->card == CARD_LEDGER) {
        n = s->b.bank;
        col = (BYTE)(s->bank_t && (s->bank_t & 4) ? s->bank_col : PAL_YELLOW);
    }
    key = (WORD)(0x8000 | (on << 14) | (col << 8) | n);
    if (key == s->meter_key) return;
    s->meter_key = key;
    for (k = 0; k < 10; k++) {
        int y = FIELD_ROW + 18 - 2 * k;
        if (!on) {
            fx_put(fc + 10, y, tw(PAL_WHITE, T_BEZ + 4));
            fx_put(fc + 10, y + 1, tw(PAL_WHITE, T_BEZ + 4));
        } else if (k < n) {
            fx_put(fc + 10, y, tw(col, T_METER + 2));
            fx_put(fc + 10, y + 1, tw(col, T_METER + 3));
        } else {
            fx_put(fc + 10, y, tw(PAL_WHITE, T_METER));
            fx_put(fc + 10, y + 1, tw(PAL_WHITE, T_METER + 1));
        }
    }
}

static void banner(Side *s, int row, int h)
{
    fill(FIELD_COL[s->i], row, 10, h, tw(PAL_WHITE, T_BLACK));
}

static const char NAME_LETTERS[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ .!";

static void draw_overlay(Side *s)
{
    int fc = FIELD_COL[s->i];
    const char *a = 0, *b2 = 0;
    BYTE pa = PAL_WHITE, enter;
    if (paused) { s->ov_key = 0xff; return; }
    enter = (BYTE)(s->ov_key != s->state);
    s->ov_key = s->state;
    switch (s->state) {
    case S_OFF:
        if (enter) {
            fill(fc, FIELD_ROW, 10, 20, tw(PAL_WHITE, T_EMPTY));
            banner(s, 11, 4);
            txt_c(fc, 10, 12, PAL_AMBER, s->i ? "2P" : "1P");
            txt_c(fc, 10, 14, PAL_WHITE, "START");
        }
        if ((frames >> 5) & 1) txt_c(fc, 10, 13, PAL_WHITE, "PRESS");
        else fill(fc, 13, 10, 1, tw(PAL_WHITE, T_BLACK));
        return;
    case S_ASK:
        if (enter) {
            fill(fc, FIELD_ROW, 10, 20, tw(PAL_WHITE, T_EMPTY));
            banner(s, 10, 6);
            txt_c(fc, 10, 11, PAL_AMBER, s->i ? "2P JOINS" : "1P JOINS");
        }
        txt(fc, 13, s->ask_sel == 0 ? PAL_YELLOW : PAL_GREY, s->ask_sel == 0 ? ">SOLO" : " SOLO");
        txt(fc, 14, s->ask_sel == 1 ? PAL_YELLOW : PAL_GREY, s->ask_sel == 1 ? ">VERSUS" : " VERSUS");
        return;
    case S_NAME:
        banner(s, 9, 7);
        txt_c(fc, 10, 10, PAL_YELLOW, "NEW RECORD");
        txt_c(fc, 10, 11, PAL_WHITE, "NO.");
        fx_put(fc + 6, 11, tw(PAL_WHITE, (WORD)('1' + s->rank)));
        {
            int k;
            for (k = 0; k < 3; k++)
                fx_put(fc + 3 + k * 2, 13, tw((BYTE)(k == s->name_pos && ((frames >> 3) & 1) ? PAL_WHITE : PAL_AMBER),
                                              (WORD)s->name[k]));
        }
        txt_c(fc, 10, 15, PAL_STEEL, "A: NEXT");
        return;
    case S_GAP:
        banner(s, 10, 6);
        txt_c(fc, 10, 11, PAL_RED, "K.O.");
        txt_c(fc, 10, 12, PAL_WHITE, "KOS");
        fill(fc, 13, 10, 1, tw(PAL_WHITE, T_BLACK));
        b2 = num(s->kos, 3, ' ');
        led(fc + (10 - slen(b2)) / 2, 13, PAL_GREEN, b2);
        fill(fc, 14, 10, 1, tw(PAL_WHITE, T_BLACK));
        if (s->join) txt_c(fc, 10, 14, PAL_YELLOW, s->i ? "2P IS NEXT" : "1P IS NEXT");
        else if ((frames >> 4) & 1) txt_c(fc, 10, 14, PAL_WHITE, s->i ? "2P START" : "1P START");
        return;
    case S_DONE:
        switch (s->result) {
        case R_CLEAR:  a = "COMPLETE!"; pa = PAL_GREEN; break;
        case R_TOPOUT: a = mode == M_SURV ? "GAME OVER" : "BRICKED UP"; pa = PAL_RED; break;
        case R_WIN:    a = "WINNER!"; pa = PAL_YELLOW; break;
        case R_LOSE:   a = "BRICKED UP"; pa = PAL_RED; break;
        case R_LIFTOFF: a = "LIFT OFF!"; pa = PAL_YELLOW; break;
        case R_LATE:   a = "TOO LATE"; pa = PAL_RED; break;
        default:       a = "DRAW"; pa = PAL_WHITE; break;
        }
        banner(s, 10, 6);
        txt_c(fc, 10, 11, pa, a);
        if (mode == M_SPRINT && s->result == R_CLEAR) b2 = fmt_time(s->time, 2);
        else if (mode == M_MARATHON) b2 = num(s->b.score, 7, ' ');
        else if (mode == M_SURV) { txt_c(fc, 10, 12, PAL_WHITE, "KOS"); b2 = num(s->kos, 3, ' '); }
        if (b2) { fill(fc, 13, 10, 1, tw(PAL_WHITE, T_BLACK)); led(fc + (10 - slen(b2)) / 2, 13, PAL_GREEN, b2); }
        if (!s->cpu_on && ((frames >> 5) & 1)) txt_c(fc, 10, 14, PAL_WHITE, "START");
        return;
    default:
        return;
    }
}

static void draw_stats(Side *s)
{
    int x0 = FIELD_COL[s->i] - 1;
    tt_board *b = &s->b;
    DWORD m = 0x80000000UL | ((DWORD)mode << 28), k0, k1, k2, who;
    if (s->state == S_OFF || s->state == S_ASK) {
        if (s->st_key[0]) { fill(x0, STAT_ROW, 12, 3, BLANK); s->st_key[0] = s->st_key[1] = s->st_key[2] = 0; }
        return;
    }
    who = s->cpu_on ? 0x100UL | s->cpu.level : 0x200UL | s->i;
    switch (mode) {
    case M_MARATHON:
        k0 = m | (who << 16) | b->lines;
        k1 = m | (b->score & 0x0fffffffUL);
        k2 = m | ((DWORD)b->level << 20) | (s->time / 6);
        break;
    case M_SPRINT:
        k0 = m | (who << 16) | b->lines;
        k1 = m | (s->time & 0x0fffffffUL);
        k2 = m | b->pieces;
        break;
    default:
        k0 = m | (who << 16);
        k1 = m | (mode == M_SURV ? s->kos : b->lines);
        k2 = m | ((DWORD)b->sent << 8) | s->wins;
        break;
    }
    if (k0 != s->st_key[0]) {
        s->st_key[0] = k0;
        fill(x0, STAT_ROW, 12, 1, BLANK);
        if (s->cpu_on) {
            txt(x0, STAT_ROW, PAL_PINK, "CPU");
            txt(x0 + 4, STAT_ROW, PAL_GREY, "LV");
            led(x0 + 7, STAT_ROW, PAL_AMBER, num(s->cpu.level, 1, '0'));
        } else txt(x0, STAT_ROW, s->i ? PAL_CYAN : PAL_YELLOW, s->i ? "2P" : "1P");
        if (mode == M_MARATHON) {
            txt(x0 + 3, STAT_ROW, PAL_GREY, "LINES");
            led(x0 + 9, STAT_ROW, PAL_AMBER, num(b->lines, 3, '0'));
        } else if (mode == M_SPRINT) {
            txt(x0 + 3, STAT_ROW, PAL_GREY, "LINES");
            led(x0 + 9, STAT_ROW, PAL_AMBER, num(b->lines > 40 ? 0 : 40 - b->lines, 2, '0'));
        }
    }
    if (k1 != s->st_key[1]) {
        s->st_key[1] = k1;
        fill(x0, STAT_ROW + 1, 12, 1, BLANK);
        if (mode == M_MARATHON) {
            txt(x0, STAT_ROW + 1, PAL_GREY, "SCORE");
            led(x0 + 5, STAT_ROW + 1, PAL_AMBER, num(b->score, 7, '0'));
        } else if (mode == M_SPRINT) led(x0 + 2, STAT_ROW + 1, PAL_GREEN, fmt_time(s->time, 2));
        else if (mode == M_SURV) {
            txt(x0, STAT_ROW + 1, PAL_GREY, "KOS");
            led(x0 + 6, STAT_ROW + 1, PAL_AMBER, num(s->kos, 3, '0'));
        } else {
            txt(x0, STAT_ROW + 1, PAL_GREY, "LINES");
            led(x0 + 6, STAT_ROW + 1, PAL_AMBER, num(b->lines, 3, '0'));
        }
    }
    if (k2 != s->st_key[2]) {
        s->st_key[2] = k2;
        fill(x0, STAT_ROW + 2, 12, 1, BLANK);
        if (mode == M_MARATHON) {
            txt(x0, STAT_ROW + 2, PAL_GREY, "LV");
            led(x0 + 2, STAT_ROW + 2, PAL_AMBER, num(b->level, 2, '0'));
            led(x0 + 5, STAT_ROW + 2, PAL_GREEN, fmt_time(s->time, 1));
        } else if (mode == M_SPRINT) {
            txt(x0, STAT_ROW + 2, PAL_GREY, "PCS");
            led(x0 + 4, STAT_ROW + 2, PAL_AMBER, num(b->pieces, 3, '0'));
        } else {
            txt(x0, STAT_ROW + 2, PAL_GREY, "SENT");
            led(x0 + 5, STAT_ROW + 2, PAL_AMBER, num(b->sent, 3, '0'));
            if (mode == M_VS) {
                txt(x0 + 9, STAT_ROW + 2, PAL_GREY, "W");
                led(x0 + 10, STAT_ROW + 2, PAL_AMBER, num(s->wins, 2, '0'));
            }
        }
    }
}

static void draw_side(Side *s)
{
    int pc = PANEL_COL[s->i], k, x0 = FIELD_COL[s->i] - 1;
    tt_board *b = &s->b;
    BYTE live = (BYTE)(s->state == S_COUNT || s->state == S_PLAY || s->state == S_DONE || s->state == S_NAME || s->state == S_GAP);
    BYTE key[2 + TT_NEXT], show = (BYTE)(live && !paused && s->state != S_GAP), changed = 0, np = previews(s);
    WORD ck;
    /* field */
    if (live) draw_field(s);
    draw_overlay(s);
    draw_gauge(s);
    draw_meter(s);
    draw_fx(s, (BYTE)(live && !paused && s->state == S_PLAY));
    /* hold and next, when they change */
    key[0] = (BYTE)(show ? 1 + b->hold_used : 0);
    key[1] = (BYTE)(show ? b->hold : 0);
    for (k = 0; k < TT_NEXT; k++) key[2 + k] = (BYTE)(show && k < np ? b->queue[k] : 0);
    if (key[2] && !b->holo && tt_holo_ready(b) > 0) key[2] |= 0x80;     /* Phantom Reel: the next one is a hologram */
    for (k = 0; k < 2 + TT_NEXT; k++) if (key[k] != s->mini_key[k]) { s->mini_key[k] = key[k]; changed = 1; }
    if (changed) {
        if (show) {
            draw_mini(pc, HOLD_ROW, b->hold, b->hold_used ? PAL_STEEL : PAL_OF(b->hold));
            for (k = 0; k < TT_NEXT; k++)
                draw_mini(pc, NEXT_ROW + k * 3, (BYTE)(key[2 + k] & 0x7f),
                          key[2 + k] & 0x80 ? PAL_WHITE : key[2 + k] ? PAL_OF(key[2 + k]) : PAL_WHITE);
        } else {
            fill(pc, HOLD_ROW, 4, 2, tw(PAL_WHITE, T_INSET));
            fill(pc, NEXT_ROW, 4, 15, tw(PAL_WHITE, T_INSET));
        }
    }
    /* callouts above the board */
    ck = (WORD)(s->call_t && !paused ? 0x8000 | (s->call_gen & 0x7fff) : 0);
    if (ck != s->call_key) {
        s->call_key = ck;
        fill(x0, 1, 12, 2, BLANK);
        if (ck) {
            txt_c(x0, 12, 1, PAL_YELLOW, s->call1);
            txt_c(x0, 12, 2, PAL_WHITE, s->call2);
        }
    }
    /* stats under the board */
    draw_stats(s);
}

/* the drop speed both Survival boards share (a new board takes it on) */
static BYTE surv_speed(void)
{
    return (BYTE)(side[0].b.level > side[1].b.level ? side[0].b.level : side[1].b.level);
}

static BYTE draw_center(void)
{
    static const char *MODE_NAME[4] = { "MARATHON", "SPRINT", "VERSUS", "SURVIVAL" };
    int x = CENTER_COL;
    DWORD k1 = 0x80000000UL | mode | ((DWORD)paused << 4) | ((DWORD)rec_gen << 8) | ((DWORD)demo << 20), k2 = 0;
    if (mode == M_VS) k2 = (vs_time / 60) | ((DWORD)side[0].b.level << 24);
    else if (mode == M_SURV) k2 = (vs_time / 60) | ((DWORD)surv_speed() << 24);
    if (k1 == ctr_key1 && k2 == ctr_key2) return 0;
    ctr_key1 = k1; ctr_key2 = k2;
    fill(14, 0, 12, 1, BLANK);
    txt_c(14, 12, 0, demo ? PAL_YELLOW : PAL_WHITE, demo ? "DEMO PLAY" : MODE_NAME[mode]);
    fill(x, 4, 6, 20, BLANK);
    switch (mode) {
    case M_MARATHON:
        txt_c(x, 6, 4, PAL_GREY, "BEST");
        if (mar_score[0] > 999999UL) { led(x, 5, PAL_AMBER, num(mar_score[0] / 1000, 5, ' ')); txt(x + 5, 5, PAL_AMBER, "K"); }
        else led(x, 5, PAL_AMBER, num(mar_score[0], 6, ' '));
        txt_c(x, 6, 6, PAL_BEIGE, mar_name[0]);
        txt_c(x, 6, 8, PAL_GREY, "GOAL");
        led(x + 1, 9, PAL_AMBER, "150");
        break;
    case M_SPRINT:
        txt_c(x, 6, 4, PAL_GREY, "BEST");
        led(x, 5, PAL_GREEN, fmt_time(spr_time[0], 1));
        txt_c(x, 6, 6, PAL_BEIGE, spr_name[0]);
        txt_c(x, 6, 8, PAL_GREY, "GOAL");
        led(x + 2, 9, PAL_AMBER, "40");
        break;
    case M_VS:
        txt_c(x, 6, 5, PAL_PINK, "VS");
        led(x + 1, 7, PAL_GREEN, fmt_time(vs_time, 0));
        txt_c(x, 6, 9, PAL_GREY, "SPEED");
        led(x + 2, 10, PAL_AMBER, num(side[0].b.level, 2, '0'));
        break;
    default:
        txt_c(x, 6, 4, PAL_GREY, "BEST");
        led(x + 1, 5, PAL_AMBER, num(srv_kos[0], 3, '0'));
        txt_c(x, 6, 6, PAL_BEIGE, srv_name[0]);
        led(x + 1, 8, PAL_GREEN, fmt_time(vs_time, 0));
        txt_c(x, 6, 10, PAL_GREY, "SPEED");
        led(x + 2, 11, PAL_AMBER, num(surv_speed(), 2, '0'));
        break;
    }
    if (paused) {
        banner(&side[0], 10, 6); banner(&side[1], 10, 6);
        txt_c(x, 6, 14, PAL_WHITE, "START");
        txt_c(x, 6, 15, PAL_GREY, "RESUME");
        txt_c(x, 6, 17, PAL_WHITE, "SELECT");
        txt_c(x, 6, 18, PAL_GREY, "QUIT");
        big(FIELD_COL[0], 6, PAL_YELLOW, "PAUSE");
        big(FIELD_COL[1], 6, PAL_YELLOW, "PAUSE");
    }
    return 1;
}

/* Launch Countdown in the centre console: who, and the seconds left */
static void draw_launch(BYTE redrawn)
{
    int x = CENTER_COL;
    WORD key = 0;
    BYTE col;
    Side *p;
    if (!paused) {
        if (launch_by >= 0) key = (WORD)(0x8000 | (launch_by << 8) | ((launch_t + 59) / 60) | ((frames >> 4 & 1) << 9));
        else if (broken_t) key = 0x4000;
    }
    if (key == launch_key && !redrawn) return;
    launch_key = key;
    if (paused) return;
    fill(x, 13, 6, 4, BLANK);
    if (key & 0x8000) {
        p = &side[launch_by];
        col = (BYTE)((launch_t + 59) / 60 <= 3 ? PAL_RED : PAL_AMBER);
        if (p->cpu_on) txt_c(x, 6, 13, PAL_PINK, "CPU");
        else txt_c(x, 6, 13, p->i ? PAL_CYAN : PAL_YELLOW, p->i ? "2P" : "1P");
        if ((frames >> 4) & 1) txt_c(x, 6, 14, col, "LAUNCH");
        led(x + 2, 15, col, num((launch_t + 59) / 60, 2, '0'));
    } else if (key) {
        txt_c(x, 6, 14, PAL_RED, "COUNT");
        txt_c(x, 6, 15, PAL_RED, "BROKEN");
    }
}

/* countdown 3 2 1 GO (or READY GO) in big letters over each board */
static void draw_count(Side *s)
{
    int fc = FIELD_COL[s->i];
    char d[2];
    if (paused) return;
    if (s->state == S_COUNT && s->ready) big(fc, 11, PAL_YELLOW, "READY");
    else if (s->state == S_COUNT) {
        d[0] = (char)('1' + (s->count_t - 1) / 40); d[1] = 0;
        big(fc + 4, 11, PAL_YELLOW, d);
    } else if (s->go_t && s->state == S_PLAY) big(fc + 3, 11, PAL_GREEN, "GO");
}

/* ======================================================================
 * game flow
 * ==================================================================== */
static void name_input(Side *s, BYTE edge)
{
    int c = 0;
    while (NAME_LETTERS[c] && NAME_LETTERS[c] != s->name[s->name_pos]) c++;
    if (edge & JOY_UP) c = (c + 1) % 29;
    if (edge & JOY_DOWN) c = (c + 28) % 29;
    s->name[s->name_pos] = NAME_LETTERS[c];
    if (edge & (JOY_UP | JOY_DOWN)) sfx(s, SND_MENU);
    if ((edge & (JOY_B | JOY_LEFT)) && s->name_pos > 0) s->name_pos--;
    if (edge & (JOY_A | JOY_RIGHT)) {
        sfx(s, SND_MENU);
        if (++s->name_pos >= 3) {
            if (mode == M_MARATHON) mar_insert(s->rank, s->name, s->b.score);
            else if (mode == M_SPRINT) spr_insert(s->rank, s->name, s->time);
            else srv_insert(s->rank, s->name, s->kos);
            save_rec_due = 1;
            rec_gen++;
            s->state = S_DONE;
            if (mode == M_SURV && carries(other(s))) surv_gap(s);
        }
    }
}

/* ---------- Survival ---------- */
/* a player on a board keeps the run going */
static BYTE carries(Side *s) { return (BYTE)(!s->cpu_on && active(s)); }

/* the K.O. pause on a knocked-out board: Start comes (back) in */
static void surv_gap(Side *s)
{
    s->state = S_GAP;
    s->gap_t = SURV_KO;
    s->b.active = 0;
    if (!s->cpu_on) s->join = 0;
}

/* side l topped out: the other board scores a K.O. and plays on */
static void surv_topout(Side *l)
{
    Side *w = other(l);
    char c[13];
    int k;
    const char *p;
    if (w->state == S_PLAY) {
        if (w->kos < 999) w->kos++;
        p = num(w->kos, 1, '0');
        for (k = 0; *p && k < 8; ) c[k++] = *p++;
        p = w->kos == 1 ? " KO" : " KOS";
        while (*p && k < 12) c[k++] = *p++;
        c[k] = 0;
        say(w, "K.O.!", c);
        sfx(w, SND_GO);
    }
    if (l->cpu_on) { surv_gap(l); return; }
    side_finish(l, R_TOPOUT);                  /* GAME OVER, and maybe a record */
    if (l->state == S_DONE && carries(w)) surv_gap(l);
}

/* the K.O. pause is over: whoever claimed the seat comes in, else a CPU */
static void surv_next(Side *s)
{
    Side *o = other(s);
    s->cpu_on = (BYTE)!s->join;
    s->kos = 0;
    s->card = s->cpu_on ? random_card() : pick_card[s->i];
    begin_side(s, fresh_seed(), SURV_READY);
    o->launch_used = 0;                        /* a new opponent: a new Launch Countdown */
    tt_holo_restart(&o->b);                    /* ...and a fresh 3 holograms (folds and the bank carry over) */
    tt_cap_restart(&o->b);                     /* ...and fresh jumps */
    tt_lever_restart(&o->b);                   /* ...and fresh spins */
    s->ready = 1;
    s->b.level = o->b.level < 1 ? 1 : o->b.level;
    s->b.gravity = tt_gravity_for(s->b.level);
    s->prev = 0xff;
}

/* nobody is playing or coming in: the run is over */
static void surv_check_end(void)
{
    int k;
    for (k = 0; k < 2; k++)
        if (carries(&side[k]) || (side[k].state == S_GAP && side[k].join)) return;
    for (k = 0; k < 2; k++) {
        Side *s = &side[k];
        if (active(s)) { s->state = S_DONE; s->result = R_WIN; s->b.active = 0; }
        else if (s->state == S_GAP) { s->state = S_DONE; s->result = R_TOPOUT; s->rank = -1; }
    }
}

/* a player claims a CPU's seat (Start on that CPU's pad) */
static void surv_claim(Side *s)
{
    if (s->state == S_COUNT) {                 /* still counting in: just take over */
        s->cpu_on = 0;
        s->kos = 0;
        s->b.sonic = pad_cfg[s->i].sonic;
        s->prev = 0xff;
    } else {                                   /* playing: wait for it to go down */
        s->join = 1;
        s->cpu.ease = 1;
        say(s, s->i ? "2P" : "1P", "IS NEXT");
    }
    sfx(s, SND_MENU);
}

/* ======================================================================
 * card abilities (monster cards: hold the card button, pick a direction,
 * let go to fire; the 6 boss cards come later)
 * ==================================================================== */

/* garbage changes hands; Echo Wall bounces it back (bounced garbage doesn't bounce again) */
static void deliver(Side *from, Side *to, tt_u8 rows, tt_u8 pat, BYTE bounced)
{
    if (!rows || (to->state != S_PLAY && to->state != S_COUNT)) return;
    if (!bounced && to->b.fx[TT_FX_ECHO]) {
        say(to, "ECHO!", "");
        sfx(to, SND_ECHO);
        deliver(to, from, rows, pat, 1);
        return;
    }
    tt_receive_pat(&to->b, rows, pat);
}

/* abilities that hit the other board (they need someone playing there) */
static const BYTE AT_FOE[CARD_MONSTERS][4] = {
    { 1, 0, 1, 1 },      /* Cyclops:  Boulder, Eye Beam, Glare, Rockslide */
    { 1, 0, 1, 1 },      /* Skeleton: Rattle, Collapse, Shiver, Bone Storm */
    { 1, 0, 1, 0 },      /* Werewolf: Claw, Pound, Howl, Full Moon */
    { 1, 0, 0, 1 }       /* Giant Bat: Nightfall, Echo Wall, Sonar, Swarm */
};

static BYTE card_ready(Side *s, BYTE dir)
{
    return (BYTE)(s->card < CARD_MONSTERS && tt_can_spend(&s->b, CARDS[s->card].cost[dir]) &&
                  (!AT_FOE[s->card][dir] || other(s)->state == S_PLAY));
}

static void beam_fire(Side *s)
{
    s->aim = 0;
    tt_eye_beam(&s->b, s->aim_x);
    sfx(s, SND_BEAM);
}

/* fire ability dir (DIR_L..DIR_U) of this board's card: 1 if it went off */
static BYTE card_fire(Side *s, BYTE dir)
{
    Side *o = other(s);
    tt_board *f = &o->b;
    tt_u8 r, pt;
    int k;
    if (!card_ready(s, dir)) {
        say(s, CARDS[s->card].act[dir], s->b.cool ? "COOLING" : AT_FOE[s->card][dir] && o->state != S_PLAY ? "NO TARGET" : "NEED MORE");
        sfx(s, SND_DENY);
        return 0;
    }
    tt_spend(&s->b, CARDS[s->card].cost[dir]);
    s->fired++;
    say(s, CARDS[s->card].act[dir], CARDS[s->card].name);
    sfx(s, SND_CAST);
    switch (s->card * 4 + dir) {
    case CARD_CYCLOPS * 4 + DIR_L:  tt_boulder(f); sfx(o, SND_BOULDER); break;
    case CARD_CYCLOPS * 4 + DIR_R:
        if (s->cpu_on || HARNESS_BOT(s)) { s->aim_x = (signed char)tt_best_beam(&s->b); beam_fire(s); }
        else { s->aim = 1; s->aim_x = (signed char)tt_beam_start(&s->b); s->aim_t = AIM_FRAMES; }
        break;
    case CARD_CYCLOPS * 4 + DIR_D:  tt_fx_on(f, TT_FX_GLARE, FX_GLARE); break;
    case CARD_CYCLOPS * 4 + DIR_U:  for (k = 0; k < 3; k++) tt_boulder(f); sfx(o, SND_BOULDER); break;
    case CARD_SKELETON * 4 + DIR_L: tt_rattle(f); break;
    case CARD_SKELETON * 4 + DIR_R: tt_collapse(&s->b); break;
    case CARD_SKELETON * 4 + DIR_D: tt_fx_on(f, TT_FX_SHIVER, FX_SHIVER); break;
    case CARD_SKELETON * 4 + DIR_U: deliver(s, o, 4, TT_PAT_RIBS, 0); break;
    case CARD_WEREWOLF * 4 + DIR_L: deliver(s, o, 3, TT_PAT_CLAW, 0); break;
    case CARD_WEREWOLF * 4 + DIR_R: tt_pound(&s->b, 3); sfx(s, SND_BOULDER); break;
    case CARD_WEREWOLF * 4 + DIR_D: tt_fx_on(f, TT_FX_HOWL, FX_HOWL); break;
    case CARD_WEREWOLF * 4 + DIR_U: tt_full_moon(&s->b); break;
    case CARD_BAT * 4 + DIR_L:      deliver(s, o, 1, TT_PAT_STAIRS, 0); tt_fx_on(f, TT_FX_DARK, FX_NIGHTFALL); break;
    case CARD_BAT * 4 + DIR_R:
        while (tt_take_pending(&s->b, &r, &pt)) deliver(s, o, r, pt, 1);
        tt_fx_on(&s->b, TT_FX_ECHO, FX_ECHO);
        sfx(s, SND_ECHO);
        break;
    case CARD_BAT * 4 + DIR_D:      tt_fx_on(&s->b, TT_FX_SONAR, FX_SONAR); break;
    case CARD_BAT * 4 + DIR_U:      deliver(s, o, 3, TT_PAT_STAIRS, 0); tt_fx_on(f, TT_FX_DARK, FX_SWARM); break;
    }
    return 1;
}

/* ---------- Launch Key: Launch Countdown (once a match) ---------- */
static BYTE can_launch(Side *s)
{
    Side *o = other(s);
    return (BYTE)(has_card(s, CARD_LAUNCH) && launch_by < 0 && !s->launch_used &&
                  s->state == S_PLAY && o->state == S_PLAY && s->b.alive && s->b.lines > o->b.lines);
}

static void try_launch(Side *s)
{
    if (launch_by >= 0) return;
    if (!can_launch(s)) {
        say(s, "LAUNCH KEY", s->launch_used ? "COUNT SPENT" : "GET AHEAD");
        sfx(s, SND_DENY);
        return;
    }
    s->launch_used = 1;
    s->fired++;
    launch_by = (signed char)s->i;
    launch_t = LAUNCH_FRAMES;
    launch_at = s->b.lines;
    broken_t = 0;
    if (s->cpu_on) s->cpu.avoid = 1;
    say(s, "COUNTDOWN!", "NO LINES NOW");
    sfx(s, SND_CAST);
}

static void launch_stop(void)
{
    side[launch_by].cpu.avoid = 0;
    launch_by = -1;
}

/* once a frame: the count goes on, breaks (you cleared a line, or they caught up) or wins */
static void launch_tick(void)
{
    Side *p, *o;
    int k;
    if (broken_t) broken_t--;
    for (k = 0; k < 2; k++) {                    /* tell a player once when they can start it */
        Side *q = &side[k];
        BYTE r = can_launch(q);
        if (r && !q->launch_ready && !q->cpu_on) { say(q, "LAUNCH KEY", "READY"); sfx(q, SND_MENU); }
        q->launch_ready = r;
    }
    if (launch_by < 0) return;
    p = &side[launch_by];
    o = other(p);
    if (p->state != S_PLAY || o->state != S_PLAY) { launch_stop(); return; }
    if (p->b.lines > launch_at || o->b.lines >= p->b.lines) {
        launch_stop();
        broken_t = BROKEN_FRAMES;
        say(p, "COUNT", "BROKEN");
        sfx(p, SND_DENY);
        return;
    }
    if (--launch_t == 0) {
        launch_stop();
        say(p, "LIFT OFF!", "");
        if (mode == M_SURV) {                    /* a K.O. like any other */
            o->b.alive = 0; o->b.active = 0;
            surv_topout(o);
        } else {
            p->wins++;
            side_finish(p, R_LIFTOFF);
            side_finish(o, R_LATE);
        }
    } else if (launch_t % 60 == 0) sfx(0, SND_BEEP);
}

/* ---------- Phantom Reel: freeze the hologram where it is ---------- */
static void reel_freeze(Side *s)
{
    tt_board *b = &s->b;
    WORD n;
    const char *p;
    char c[13];
    if (!b->holo) {
        if (tt_holo_ready(b) > 0) say(s, "PHANTOM REEL", "HOLO NEXT");
        else if (b->holo_used >= TT_HOLO_MAX) say(s, "PHANTOM REEL", "NO MORE");
        else {
            n = (WORD)(b->holo_from + (b->holo_used + 1) * TT_HOLO_LINES);    /* lines for the next one */
            p = num(n, 4, ' ');
            while (*p == ' ') p++;
            str_cpy(c, "AT ");
            str_cpy(c + 3, p);
            str_cpy(c + 3 + slen(p), " LINES");
            say(s, "PHANTOM REEL", c);
        }
        sfx(s, SND_DENY);
        return;
    }
    n = (WORD)tt_holo_fills(b);
    tt_holo_freeze(b);
    s->fired++;
    say(s, "FREEZE!", n == 1 ? "FILLS 1" : n == 2 ? "FILLS 2" : n == 3 ? "FILLS 3" : n == 4 ? "FILLS 4" : "FILLS 0");
}

/* ---------- Origami Crane: fold the held garbage over ---------- */
static BYTE fold_over(Side *s, BYTE early)
{
    Side *o = other(s);
    int n;
    if (o->state != S_PLAY && o->state != S_COUNT) return 0;   /* nobody there: keep holding */
    n = tt_fold_send(&s->b, &o->b);
    if (!n) return 0;
    say(s, early ? "EARLY FOLD!" : "FOLD!", count_txt((WORD)n, n == 1 ? " ROW OVER" : " ROWS OVER"));
    say(o, "FOLD", "INCOMING");
    sfx(s, early ? SND_EARLYFOLD : SND_FOLD);
    return 1;
}

static void crane_early(Side *s)
{
    Side *o = other(s);
    int why = tt_fold_early_block(&s->b, &o->b);
    if (why == TT_FOLD_OK && o->state != S_PLAY && o->state != S_COUNT) why = TT_FOLD_QUEUED;
    if (why != TT_FOLD_OK) {
        if (why == TT_FOLD_AT10) {
            char c[13];
            str_cpy(c, "AT ");
            str_cpy(c + 3, count_txt((WORD)(s->b.fold_from + TT_FOLD_EARLY), " LINES"));
            say(s, "EARLY FOLD", c);
        } else say(s, "EARLY FOLD", why == TT_FOLD_NOCHARGE ? "NO CHARGE" : why == TT_FOLD_NOTHING ? "NOTHING HELD" : "FOLD QUEUED");
        sfx(s, SND_DENY);
        return;
    }
    s->b.early_used++;               /* the 8-line count is NOT reset */
    fold_over(s, 1);
    s->fired++;
}

/* ---------- Gold Ledger: withdraw the whole bank as garbage ---------- */
static void ledger_withdraw(Side *s)
{
    Side *o = other(s);
    int n;
    if (!s->b.bank || o->state != S_PLAY) {
        say(s, "GOLD LEDGER", s->b.bank ? "NOBODY THERE" : "VAULT EMPTY");
        sfx(s, SND_DENY);
        return;
    }
    n = tt_withdraw(&s->b);
    say(s, "WITHDRAW!", count_txt((WORD)n, n == 1 ? " ROW" : " ROWS"));
    sfx(s, SND_WITHDRAW);
    deliver(s, o, (tt_u8)n, pat_of(s), 0);
    s->fired++;
}

/* ---------- Time Capsule: tap to mark the field, hold to jump back to it ---------- */
#define CAP_HOLD 24                  /* frames held = a jump (0.4 s) */

static void cap_mark(Side *s)
{
    int why = tt_cap_mark(&s->b);
    if (why != TT_CAP_OK) { say(s, "TIME CAPSULE", "AT 10 LINES"); sfx(s, SND_DENY); return; }
    say(s, "MARKED", s->cpu_on ? "TIME CAPSULE" : "HOLD: JUMP");
    sfx(s, SND_MARK);
}

static BYTE cap_jump(Side *s)
{
    int why = tt_cap_jump(&s->b);
    if (why != TT_CAP_OK) {
        say(s, "TIME CAPSULE", why == TT_CAP_AT10 ? "AT 10 LINES" : why == TT_CAP_NOMARK ? "NO MARK YET" : "NO JUMPS LEFT");
        sfx(s, SND_DENY);
        return 0;
    }
    say(s, "JUMP!", count_txt((WORD)tt_cap_jumps(&s->b), tt_cap_jumps(&s->b) == 1 ? " JUMP LEFT" : " JUMPS LEFT"));
    sfx(s, SND_JUMP);
    s->jump_t = 30;
    s->fd_full = 1;
    s->fired++;
    return 1;
}

/* the card button: a tap (let go before 0.4 s) marks, holding it jumps */
static void capsule_ctl(Side *s)
{
    if (s->card_hit) { s->cap_t = 0; s->cap_fired = 0; }
    if (s->card_down) {
        if (s->cap_t < 255) s->cap_t++;
        if (!s->cap_fired && s->cap_t >= CAP_HOLD) { s->cap_fired = 1; cap_jump(s); }
    } else if (s->cap_t) {
        if (!s->cap_fired) cap_mark(s);
        s->cap_t = 0;
    }
}

/* ---------- Ace of Stars: pull the lever ---------- */
static void ace_pull(Side *s)
{
    int why = tt_lever_pull(&s->b);
    if (why == TT_PULL_BUSY) return;
    if (why != TT_PULL_OK) {
        if (why == TT_PULL_AT10) {
            char c[13];
            str_cpy(c, "AT ");
            str_cpy(c + 3, count_txt((WORD)(s->b.spin_from + TT_LEVER_LINES * (s->b.spins_used + 1)), " LINES"));
            say(s, "ACE OF STARS", c);
        } else say(s, "ACE OF STARS", "NO SPINS LEFT");
        sfx(s, SND_DENY);
        return;
    }
    sfx(s, SND_SPIN);
    s->fired++;
    reels(s);
}

/*
 * A player's card button during play.  Returns 1 when it took this frame's
 * input (the brick doesn't move): aiming the Eye Beam, or picking an ability
 * with the card button held.  Another button cancels the pick and works as usual.
 */
static BYTE card_ctl(Side *s, BYTE cur)
{
    PadCfg *c = &pad_cfg[s->i];
    BYTE edge = (BYTE)(cur & ~s->prev), cb = c->card < 4 ? btn_bit(c->card) : 0;
    BYTE others = (BYTE)((JOY_A | JOY_B | JOY_C | JOY_D) & ~cb), d = 0;
    char cost[8];
    if (s->aim) {
        if ((edge & JOY_LEFT) && s->aim_x > 0) { s->aim_x--; sfx(s, SND_MOVE); }
        if ((edge & JOY_RIGHT) && s->aim_x < TT_COLS - 2) { s->aim_x++; sfx(s, SND_MOVE); }
        if ((edge & others) || s->card_hit || (c->up_drop && (edge & JOY_UP)) || !--s->aim_t) beam_fire(s);
    } else {
        if (!cards_on()) return 0;
        if (s->card >= CARD_MONSTERS) {          /* boss cards: a tap runs the perk */
            if (s->card_hit && s->card == CARD_LAUNCH) try_launch(s);
            if (s->card_hit && s->card == CARD_REEL) reel_freeze(s);
            if (s->card_hit && s->card == CARD_ORIGAMI) crane_early(s);
            if (s->card_hit && s->card == CARD_LEDGER) ledger_withdraw(s);
            if (s->card == CARD_CAPSULE) capsule_ctl(s);
            if (s->card_hit && s->card == CARD_ACE) ace_pull(s);
            return 0;
        }
        if (s->card_hit) { s->card_mode = 1; s->card_dir = 0; }
        if (!s->card_mode) return 0;
        if (edge & others) { s->card_mode = 0; s->call_t = 0; return 0; }
        if (edge & JOY_LEFT) d = 1 + DIR_L;
        else if (edge & JOY_RIGHT) d = 1 + DIR_R;
        else if (edge & JOY_DOWN) d = 1 + DIR_D;
        else if (edge & JOY_UP) d = 1 + DIR_U;
        else if (!s->card_dir)
            d = (BYTE)(cur & JOY_LEFT ? 1 + DIR_L : cur & JOY_RIGHT ? 1 + DIR_R : cur & JOY_DOWN ? 1 + DIR_D : cur & JOY_UP ? 1 + DIR_U : 0);
        if (d && d != s->card_dir) {
            s->card_dir = d;
            str_cpy(cost, card_ready(s, (BYTE)(d - 1)) ? "COST " : "NEED ");
            cost[5] = (char)(CARDS[s->card].cost[d - 1] >= 10 ? '1' : '0' + CARDS[s->card].cost[d - 1]);
            cost[6] = (char)(CARDS[s->card].cost[d - 1] >= 10 ? '0' : 0);
            cost[7] = 0;
            say(s, CARDS[s->card].act[d - 1], cost);
            sfx(s, SND_MOVE);
        }
        if (!s->card_down) {
            s->card_mode = 0;
            if (s->card_dir) card_fire(s, (BYTE)(s->card_dir - 1));
            else s->call_t = 0;
        }
    }
    s->prev = cur;
    s->das_dir = 0;
    s->b.soft = 0;
    return 1;
}

/* a CPU with a monster card fires something it can afford now and then (js/ai.js abilityRate) */
static const BYTE CPU_CARD_RATE[CPU_MAX_LEVEL + 1] = { 0, 5, 10, 15, 20, 30, 40, 50, 60 };

static void cpu_card(Side *s)
{
    BYTE ready[4], n = 0, k;
    int lead;
    if (!cards_on() || ++s->cpu_card_t < CPU_CARD_EVERY) return;
    s->cpu_card_t = 0;
    if (s->card == CARD_LAUNCH) {
        /* when comfortably ahead, sometimes start the count (weaker CPUs want a bigger lead) */
        lead = s->b.lines - other(s)->b.lines;
        if (can_launch(s) && s->b.lines >= 8 && lead >= (s->cpu.level <= 3 ? 3 : 2) &&
            (BYTE)(fresh_seed() % 100) < 3 * s->cpu.level)
            try_launch(s);
        return;
    }
    if (s->card == CARD_ORIGAMI) {
        /* Early Fold with a decent pile and the next fold far off, or when the
           opponent is already tall (weaker CPUs wait for more) - js/ai.js fold */
        tt_board *b = &s->b;
        int held = tt_fold_held(b);
        if (tt_fold_early_block(b, &other(s)->b) != TT_FOLD_OK || other(s)->state != S_PLAY) return;
        if ((held >= (s->cpu.level <= 3 ? 3 : 2) && tt_fold_in_lines(b) >= 3) ||
            (tt_stack_height(&other(s)->b) >= 12 && held >= 2))
            if ((BYTE)(fresh_seed() % 100) < 5 * s->cpu.level + 10) crane_early(s);
        return;
    }
    if (s->card == CARD_ACE) {
        /* pull now and then when a spin is ready; more eager when the stack is tall
           (cherries help), stronger CPUs sooner - js/ai.js lever */
        if (s->b.spin_t || tt_lever_spins(&s->b) <= 0) return;
        if ((BYTE)(fresh_seed() % 100) < 6 + 3 * s->cpu.level + (tt_stack_height(&s->b) >= 10 ? 20 : 0)) ace_pull(s);
        return;
    }
    if (s->card == CARD_CAPSULE) {
        /* mark a clean, low field; jump back when the stack gets bad - js/ai.js chrono */
        int ho, mh, ag;
        tt_board *b = &s->b;
        if (b->lines < TT_CAP_LINES || (BYTE)(fresh_seed() % 100) >= 25 + 8 * s->cpu.level) return;
        tt_field_stats(b, &ho, &mh, &ag);
        if (!ho && mh >= 2 && mh <= 7 && (!b->marked || ag > s->cpu_ma || s->cpu_mh > 7)) {
            cap_mark(s);
            s->cpu_mh = (BYTE)mh; s->cpu_mo = (BYTE)ho; s->cpu_ma = (WORD)ag;
            return;
        }
        if (b->marked && tt_cap_jumps(b) > 0 && (mh >= 13 || ho >= s->cpu_mo + 5) && s->cpu_mh + 3 < mh)
            cap_jump(s);
        return;
    }
    if (s->card == CARD_LEDGER) {
        /* cash out around 5 rows (stronger CPUs wait a little longer for interest),
           at the cap, or early when the opponent is tall - js/ai.js bank */
        BYTE bank = s->b.bank, target = (BYTE)(5 + (s->cpu.level > 3 ? (s->cpu.level - 3) / 2 : 0));
        if (!bank || other(s)->state != S_PLAY) return;
        if (bank >= TT_BANK_CAP || bank >= target || (tt_stack_height(&other(s)->b) >= 12 && bank >= 2))
            if ((BYTE)(fresh_seed() % 100) < 30 + 8 * s->cpu.level) ledger_withdraw(s);
        return;
    }
    if (s->card >= CARD_MONSTERS) return;
    for (k = 0; k < 4; k++) if (card_ready(s, k)) ready[n++] = k;
    if (n && (BYTE)(fresh_seed() % 100) < CPU_CARD_RATE[s->cpu.level]) card_fire(s, ready[fresh_seed() % n]);
}

static void side_play(Side *s, BYTE cur, BYTE edge, BYTE start)
{
    tt_board *b = &s->b;
    (void)edge;
    if (s->card_hit) s->card_n++;
    if (mode == M_VS && s->cpu_on && start && s->state != S_OFF) {
        /* 2P takes the CPU's place: a new Versus match */
        sfx(s, SND_MENU);
        s->cpu_on = 0;
        side[0].wins = side[1].wins = 0;
        s->prev = 0xff;
        new_match((BYTE)(1 << s->i));
        return;
    }
    switch (s->state) {
    case S_COUNT:
        if (mode == M_SURV && s->cpu_on && start) surv_claim(s);
        if (!s->cpu_on) side_input(s, cur, 0);
        if (s->ready ? s->count_t == SURV_READY : s->count_t % 40 == 0) sfx(s, SND_BEEP);
        if (--s->count_t == 0) { s->state = S_PLAY; s->go_t = GO_FRAMES; sfx(s, SND_GO); }
        break;
    case S_PLAY:
        if (s->go_t) s->go_t--;
        if (start && !s->cpu_on) { paused = 1; sfx(0, SND_MENU); return; }
        if (start && mode == M_SURV && !s->join) surv_claim(s);
        b->holo_on = has_card(s, CARD_REEL);
        b->fold_on = has_card(s, CARD_ORIGAMI);
        b->bank_on = has_card(s, CARD_LEDGER);
        b->cap_on = has_card(s, CARD_CAPSULE);
        b->lever_on = has_card(s, CARD_ACE);
        if (s->jump_t) s->jump_t--;
        if (s->bank_t) s->bank_t--;
        if (s->cpu_on || HARNESS_BOT(s)) { cpu_frame(&s->cpu, b); if (s->cpu_on) cpu_card(s); }
        else if (!card_ctl(s, cur)) side_input(s, cur, 1);
        tt_tick(b);
        side_events(s);
        /* Ace of Stars: the reels turn; a spin is ready */
        if (b->spin_t) reels(s);
        if (b->lever_on && tt_lever_spins(b) > s->spins_seen) {
            if (!s->cpu_on && !b->spin_t) { say(s, "ACE OF STARS", "TAP: SPIN"); sfx(s, SND_MENU); }
        }
        s->spins_seen = (BYTE)tt_lever_spins(b);
        /* Time Capsule: marking opens */
        if (b->cap_on && !s->cap_ready && b->lines >= TT_CAP_LINES) {
            s->cap_ready = 1;
            if (!s->cpu_on) { say(s, "TIME CAPSULE", "TAP: MARK"); sfx(s, SND_MENU); }
        }
        s->time++;
        if (s->trail_t) s->trail_t--;
        if (s->flash_t) s->flash_t--;
        if (b->done) side_finish(s, R_CLEAR);
        else if (!b->alive) {
            if (mode == M_VS) {
                Side *o = other(s);
                if (o->state == S_PLAY && o->b.alive) { o->wins++; side_finish(o, R_WIN); side_finish(s, R_LOSE); }
                else side_finish(s, R_DRAW);
            } else if (mode == M_SURV) surv_topout(s);
            else side_finish(s, R_TOPOUT);
        }
        break;
    case S_DONE:
        s->prev = cur;
        if (mode == M_SURV && (start || (!s->cpu_on && (edge & JOY_A)))) {
            /* a new run: whoever pressed plays, the other board is a CPU */
            sfx(s, SND_MENU);
            s->cpu_on = 0;
            other(s)->cpu_on = 1;
            new_match((BYTE)(1 << s->i));
            break;
        }
        if (s->cpu_on) break;
        if (start || (edge & JOY_A)) {
            sfx(s, SND_MENU);
            if (mode >= M_VS) begin_match();
            else begin_side(s, fresh_seed(), COUNT_FRAMES);
        }
        break;
    case S_NAME:
        s->prev = cur;
        name_input(s, edge);
        break;
    case S_GAP:
        s->prev = cur;
        if (start && !s->join) { s->join = 1; sfx(s, SND_MENU); }
        if (--s->gap_t == 0) surv_next(s);
        break;
    case S_OFF:
        s->prev = cur;
        if (!start || s->cpu_on) break;
        sfx(s, SND_MENU);
        if (mode >= M_VS) {
            /* 2P takes the CPU's place: a new Versus match */
            other(s)->cpu_on = 0;
            mode = M_VS;
            music(mode_track());
            new_match((BYTE)(1 << s->i));
        } else { s->state = S_ASK; s->ask_sel = 0; }
        break;
    case S_ASK:
        s->prev = cur;
        if (edge & (JOY_UP | JOY_DOWN)) { s->ask_sel ^= 1; sfx(s, SND_MENU); }
        if (edge & JOY_B) { s->state = S_OFF; break; }
        if (start || (edge & JOY_A)) {
            sfx(s, SND_MENU);
            if (s->ask_sel == 0) begin_side(s, fresh_seed(), COUNT_FRAMES);
            else {
                mode = M_VS;
                side[0].cpu_on = side[1].cpu_on = 0;
                side[0].wins = side[1].wins = 0;
                bg_accent(3);
                music(mode_track());
                new_match((BYTE)(1 << s->i));
            }
        }
        break;
    }
}

/* a player at the controls of a board (their card button is live) */
static BYTE at_controls(const Side *s)
{
    return (BYTE)(!s->cpu_on && (s->state == S_PLAY || s->state == S_COUNT));
}

/*
 * The card button: A-D, or Select or Start.  While its player is at the
 * controls, a card on Start doesn't pause (Select does) and a card on
 * Select doesn't pause (Start does).
 */
static void card_input(Side *s, BYTE cur, BYTE edge, BYTE ps, BYTE psc, BYTE *start, BYTE *select)
{
    BYTE c = pad_cfg[s->i].card;
    BYTE sb = (BYTE)(s->i ? P2_SELECT : P1_SELECT), tb = (BYTE)(s->i ? P2_START : P1_START);
    BYTE bit = c < 4 ? (BYTE)(JOY_A << c) : 0, sys = c == CARD_SELECT ? sb : c == CARD_START ? tb : 0;
    s->card_hit = s->card_down = 0;
    if (!at_controls(s)) return;
    s->card_hit = (BYTE)((edge & bit) || (ps & sys));
    s->card_down = (BYTE)((cur & bit) || (psc & sys));
    if (c == CARD_START) *start = 0;
    if (c == CARD_SELECT) *select = 0;
}

static void game_frame(const BYTE *cur, const BYTE *edge, BYTE ps, BYTE psc)
{
    int k;
    BYTE start[2], select[2];
    start[0] = (BYTE)(ps & P1_START);
    start[1] = (BYTE)(ps & P2_START);
    select[0] = (BYTE)(ps & P1_SELECT);
    select[1] = (BYTE)(ps & P2_SELECT);
    if (!paused) for (k = 0; k < 2; k++) card_input(&side[k], cur[k], edge[k], ps, psc, &start[k], &select[k]);
    if (paused) {
        if (start[0] || start[1]) { paused = 0; side[0].prev = cur[0]; side[1].prev = cur[1]; }
        else if (ps & (P1_SELECT | P2_SELECT)) { to_title(); return; }
    } else {
        if ((select[0] || select[1]) &&
            side[0].state != S_PLAY && side[1].state != S_PLAY && side[0].state != S_COUNT && side[1].state != S_COUNT) {
            to_title();
            return;
        }
        if (select[0] || select[1]) { paused = 1; side[0].card_hit = side[1].card_hit = 0; }
        for (k = 0; k < 2 && !paused && screen == SCR_GAME; k++) {
            side[k].b.ev = 0;
            side_play(&side[k], cur[k], edge[k], start[k]);
        }
        if (screen != SCR_GAME) return;           /* off to pick cards */
        if (!paused) {
            /* garbage changes hands after both boards moved */
            if (mode >= M_VS) {
                for (k = 0; k < 2; k++) {
                    Side *f = &side[k], *t = &side[k ^ 1];
                    if (f->b.out) {
                        /* Origami Crane: it eats what the receiver holds, then is held (card) or sent */
                        BYTE had = t->b.bank;
                        int n = tt_attack_route(&f->b, &t->b, f->b.out > 40 ? 40 : f->b.out, pat_of(f));
                        if (n) deliver(f, t, (tt_u8)n, pat_of(f), 0);
                        if (t->b.bank < had) { t->bank_t = 30; t->bank_col = PAL_RED; sfx(t, SND_BANKHIT); }
                        f->b.out = 0;
                    }
                    if (f->b.fold_due && (t->state == S_PLAY || t->state == S_COUNT)) { f->b.fold_due = 0; fold_over(f, 0); }   /* Survival changeover: waits for the next opponent */
                    if (f->b.lever_out) { deliver(f, t, f->b.lever_out, pat_of(f), 0); f->b.lever_out = 0; }   /* Ace of Stars: jackpot */
                }
                if (side[0].state == S_PLAY || side[1].state == S_PLAY) {
                    vs_time++;
                    /* the drop speed rises every minute */
                    if (vs_time % 3600 == 0)
                        for (k = 0; k < 2; k++) {
                            tt_board *b = &side[k].b;
                            if (b->level < (mode == M_SURV ? SURV_MAX_SPEED : VS_MAX_SPEED)) { b->level++; b->gravity = tt_gravity_for(b->level); }
                        }
                }
            }
            if (mode >= M_VS && cards_on()) launch_tick();
            if (mode == M_SURV) surv_check_end();
            for (k = 0; k < 2; k++) if (side[k].call_t) side[k].call_t--;
        }
    }
    for (k = 0; k < 2; k++) { draw_side(&side[k]); draw_count(&side[k]); }
    draw_launch(draw_center());
}

/* ======================================================================
 * menus
 * ==================================================================== */
#define REP_FIRST 14
#define REP_NEXT  5
typedef struct { BYTE prev, hold; } Rep;
static Rep rep[2];

static BYTE repeat_dirs(Rep *p, BYTE cur)
{
    BYTE dirs = (BYTE)(cur & (JOY_UP | JOY_DOWN | JOY_LEFT | JOY_RIGHT));
    BYTE edge = (BYTE)(cur & ~p->prev), out = (BYTE)(edge & dirs);
    if (!dirs || (edge & dirs)) p->hold = 0;
    else if (++p->hold >= REP_FIRST && (p->hold - REP_FIRST) % REP_NEXT == 0) out = dirs;
    if (p->hold > REP_FIRST + REP_NEXT * 40) p->hold = REP_FIRST;
    p->prev = cur;
    return out;
}

#define DEMO_IDLE   1200             /* 20 s on the title starts the demo */
#define DEMO_LENGTH 3600             /* a demo match runs at most 60 s */

static void title_frame(const BYTE *edge, const BYTE *rp, BYTE ps)
{
    static const char *ITEM[MENU_N] = { "MARATHON", "SPRINT", "VERSUS", "SURVIVAL", "RECORDS", "OPTIONS" };
    static const char *INFO[MENU_N] = { "150 LINES, HIGH SCORE", "40 LINES, BEST TIME", "VS CPU, OR 2P PRESS START",
                                        "TOP OUT CPU AFTER CPU", "BEST SCORES AND TIMES", "SPEED, BUTTONS, SOUND" };
    BYTE r = (BYTE)(rp[0] | rp[1]), go;
    int k;
    if (edge[0] | edge[1] | ps) idle_t = 0;
    else if (++idle_t >= DEMO_IDLE) { start_demo(); return; }
    go = (BYTE)(((edge[0] & JOY_A) || (ps & P1_START)) ? 1 : ((edge[1] & JOY_A) || (ps & P2_START)) ? 2 : 0);
    if (r & (JOY_UP | JOY_DOWN)) {
        menu_sel = (BYTE)((menu_sel + ((r & JOY_UP) ? MENU_N - 1 : 1)) % MENU_N);
        sfx(0, SND_MENU);
    }
    if (menu_sel == MENU_VS && (r & JOY_LEFT) && cpu_level > 1) { cpu_level--; sfx(0, SND_MOVE); }
    if (menu_sel == MENU_VS && (r & JOY_RIGHT) && cpu_level < CPU_MAX_LEVEL) { cpu_level++; sfx(0, SND_MOVE); }
    if (go) {
        sfx(0, SND_MENU);
        switch (menu_sel) {
        case MENU_MARATHON: start_game(M_MARATHON, (BYTE)(go - 1)); return;
        case MENU_SPRINT:   start_game(M_SPRINT, (BYTE)(go - 1)); return;
        case MENU_VS:       start_game(M_VS, (BYTE)(go - 1)); return;
        case MENU_SURV:     start_game(M_SURV, (BYTE)(go - 1)); return;
        case MENU_RECORDS:  screen = SCR_RECORDS; gs_clear(GS_LOGO, 18); cls(); return;
        default:            screen = SCR_OPTIONS; opt_player = (BYTE)(go - 1); opt_sel = 0;
                            gs_clear(GS_LOGO, 18); cls(); return;
        }
    }
    gs_word(GS_LOGO, 52, 28, "SPACBRACK", 9);
    txt_c(0, 40, 8, PAL_AMBER, "BRICK RACE");
    for (k = 0; k < MENU_N; k++) {
        BYTE on = (BYTE)(k == menu_sel);
        fx_put(13, 11 + k * 2, on ? tw(PAL_YELLOW, '>') : BLANK);
        txt(15, 11 + k * 2, on ? PAL_WHITE : PAL_GREY, ITEM[k]);
    }
    fill(24, 15, 10, 1, BLANK);
    txt(24, 15, menu_sel == MENU_VS ? PAL_PINK : PAL_STEEL, "CPU LV");
    led(31, 15, PAL_AMBER, num(cpu_level, 1, '0'));
    if (menu_sel == MENU_VS) { fx_put(30, 15, tw(PAL_PINK, '<')); fx_put(32, 15, tw(PAL_PINK, '>')); }
    else { fx_put(30, 15, BLANK); fx_put(32, 15, BLANK); }
    fill(0, 24, 40, 1, BLANK);
    txt_c(0, 40, 24, PAL_BEIGE, INFO[menu_sel]);
    txt_c(0, 40, 26, PAL_STEEL, "A OR START: WHOEVER PRESSES PLAYS");
}

static void records_frame(const BYTE *edge, BYTE ps)
{
    int k;
    if ((edge[0] | edge[1]) & (JOY_A | JOY_B) || (ps & (P1_START | P2_START | P1_SELECT | P2_SELECT))) {
        sfx(0, SND_MENU); to_title(); return;
    }
    txt_c(0, 40, 1, PAL_WHITE, "RECORDS");
    txt(2, 4, PAL_CYAN, "MARATHON");
    txt(15, 4, PAL_ORANGE, "SPRINT");
    txt(28, 4, PAL_PINK, "SURVIVAL");
    for (k = 0; k < REC_N; k++) {
        fx_put(1, 6 + k * 2, tw(PAL_STEEL, (WORD)('1' + k)));
        txt(2, 6 + k * 2, PAL_BEIGE, mar_name[k]);
        led(6, 6 + k * 2, PAL_AMBER, num(mar_score[k], 7, ' '));
        txt(15, 6 + k * 2, PAL_BEIGE, spr_name[k]);
        led(19, 6 + k * 2, PAL_GREEN, fmt_time(spr_time[k], 2));
        txt(28, 6 + k * 2, PAL_BEIGE, srv_name[k]);
        led(32, 6 + k * 2, PAL_AMBER, num(srv_kos[k], 3, ' '));
        txt(36, 6 + k * 2, PAL_STEEL, "KO");
    }
    if (save_answer) { txt(2, 22, PAL_RED, "NOT SAVED: ERROR "); led(19, 22, PAL_RED, num(save_answer, 3, '0')); }
    txt_c(0, 40, 26, PAL_STEEL, "A: BACK");
}

/* ---------- pick a card: 1P on the left half, 2P or the CPU on the right ---------- */
static void pick_open(BYTE who)
{
    int k;
    screen = SCR_PICK;
    paused = 0;
    gs_clear(0, G_SLOTS);
    cls();
    for (k = 0; k < 2; k++) {
        Side *s = &side[k];
        s->state = S_OFF;
        pick_key[k] = 0xffff;
        pick_on[k] = (BYTE)(!s->cpu_on && (who >> k) & 1);
        pick_done[k] = (BYTE)!pick_on[k];
        if (s->cpu_on) s->card = random_card();
        else s->card = pick_card[k];
    }
    pick_t = 0;
}

static void pick_draw(int k)
{
    Side *s = &side[k];
    const CardDef *c = &CARDS[s->card];
    int hx = k * 20, j;
    BYTE blink = (BYTE)((frames >> 4) & 1);
    WORD key = (WORD)(0x8000 | s->card | (pick_done[k] << 4) | (pick_on[k] << 5) | (s->cpu_on << 6) | (blink << 7));
    static const char DIRC[4] = { '<', '>', '\\', '^' };   /* font: \\ is the down arrow */
    char d[2];
    if (key == pick_key[k]) return;
    pick_key[k] = key;
    fill(hx, 3, 20, 23, BLANK);
    if (s->cpu_on) txt_c(hx, 20, 3, PAL_PINK, "CPU");
    else txt_c(hx, 20, 3, k ? PAL_CYAN : PAL_YELLOW, k ? "2P" : "1P");
    txt_c(hx, 20, 4, c->pal, c->name);
    card_show(k, s->card, (short)(hx * 8 + 48), 48);
    /* a bezel round the portrait (the fix layer is over the sprites) */
    fx_put(hx + 5, 5, tw(PAL_WHITE, T_BEZ + 0));
    fill(hx + 6, 5, 8, 1, tw(PAL_WHITE, T_BEZ + 1));
    fx_put(hx + 14, 5, tw(PAL_WHITE, T_BEZ + 2));
    for (j = 0; j < 8; j++) {
        fx_put(hx + 5, 6 + j, tw(PAL_WHITE, T_BEZ_PLAIN));
        fx_put(hx + 14, 6 + j, tw(PAL_WHITE, T_BEZ + 4));
    }
    fx_put(hx + 5, 14, tw(PAL_WHITE, T_BEZ + 5));
    fill(hx + 6, 14, 8, 1, tw(PAL_WHITE, T_BEZ + 6));
    fx_put(hx + 14, 14, tw(PAL_WHITE, T_BEZ + 7));
    if (pick_on[k] && !pick_done[k]) {
        txt(hx + 3, 9, PAL_WHITE, "<");
        txt(hx + 16, 9, PAL_WHITE, ">");
        led(hx + 8, 15, PAL_GREY, num(s->card + 1, 2, ' '));
        txt(hx + 10, 15, PAL_GREY, "/10");
    }
    txt_c(hx, 20, 16, c->pal, c->pas);
    for (j = 0; j < 3; j++) if (c->line[j]) txt_c(hx, 20, 17 + j, PAL_WHITE, c->line[j]);
    if (s->card < CARD_MONSTERS) {
        d[1] = 0;
        for (j = 0; j < 4; j++) {
            d[0] = DIRC[j];
            txt(hx + 2, 21 + j, PAL_AMBER, d);
            txt(hx + 4, 21 + j, PAL_WHITE, c->act[j]);
            led(hx + 15, 21 + j, PAL_AMBER, num(c->cost[j], 2, ' '));
        }
    } else txt_c(hx, 20, 22, PAL_WHITE, "BOSS CARD");
    if (pick_done[k]) txt_c(hx, 20, 26, PAL_GREEN, "READY!");
    else if (blink) txt_c(hx, 20, 26, PAL_WHITE, "A: PICK");
}

static void pick_frame(const BYTE *edge, const BYTE *rp, BYTE ps)
{
    int k, n;
    BYTE st;
    if (ps & (P1_SELECT | P2_SELECT)) { card_hide(0); card_hide(1); to_title(); return; }
    for (k = 0; k < 2; k++) {
        Side *s = &side[k];
        st = (BYTE)(ps & (k ? P2_START : P1_START));
        if (s->cpu_on && st) {
            /* a player takes the CPU's seat and picks too */
            s->cpu_on = 0; pick_on[k] = 1; pick_done[k] = 0; s->card = pick_card[k];
            side[0].wins = side[1].wins = 0;
            sfx(0, SND_MENU);
            continue;
        }
        if (!pick_on[k]) continue;
        if (!pick_done[k]) {
            n = (rp[k] & JOY_RIGHT) ? 1 : (rp[k] & JOY_LEFT) ? -1 : 0;
            if (n) { s->card = (BYTE)((s->card + CARD_COUNT + n) % CARD_COUNT); sfx(0, SND_MOVE); }
            if ((edge[k] & JOY_A) || st) { pick_done[k] = 1; pick_card[k] = s->card; sfx(0, SND_MENU); }
        } else if (edge[k] & JOY_B) { pick_done[k] = 0; sfx(0, SND_MENU); }
    }
    txt_c(0, 40, 1, PAL_WHITE, "PICK A CARD");
    for (k = 0; k < 2; k++) pick_draw(k);
    txt_c(0, 40, 27, PAL_STEEL, "LEFT/RIGHT: CARD  A: PICK  B: BACK");
    if (pick_done[0] && pick_done[1]) {
        if (++pick_t >= 30) {
            card_hide(0); card_hide(1);
            screen = SCR_GAME;
            cls();
            for (k = 0; k < 2; k++) side[k].prev = 0xff;
            begin_match();
            draw_static();
        }
    } else pick_t = 0;
}

/* ---------- options: speed and buttons per player, shared settings ---------- */
enum { O_DAS, O_ARR, O_SOFT, O_ROTL, O_ROTR, O_HOLD, O_HARD, O_UP, O_CARD, O_GHOST, O_CLEAR, O_MUSIC, O_CARDS,
       O_SOUND, O_GUIDE, O_DEFAULTS, O_EXIT, O_N };

static void opt_button(PadCfg *c, int act, int d)
{
    BYTE old = c->btn[act], nw = (BYTE)((old + 5 + d) % 5);
    int k;
    /* a button does one thing: whoever had it gets this action's old button
     * (the card button can't be left without one: it goes to Select) */
    if (nw < 4) for (k = 0; k < ACT_N; k++) if (k != act && c->btn[k] == nw) c->btn[k] = old;
    if (nw < 4 && c->card == nw) c->card = (BYTE)(old < 4 ? old : CARD_SELECT);
    c->btn[act] = nw;
}

static void opt_card(PadCfg *c, int d)
{
    BYTE old = c->card, nw = (BYTE)((old + CARD_N + d) % CARD_N);
    int k;
    if (nw < 4) for (k = 0; k < ACT_N; k++) if (c->btn[k] == nw) c->btn[k] = (BYTE)(old < 4 ? old : 4);
    c->card = nw;
}

static void options_frame(const BYTE *edge, const BYTE *rp, BYTE ps)
{
    static const char *LABEL[O_N] = { "DAS (FRAMES)", "ARR (FRAMES)", "SOFT DROP", "ROTATE LEFT", "ROTATE RIGHT",
                                      "HOLD", "HARD DROP", "UP HARD DROPS", "CARD", "GHOST", "LINE CLEAR",
                                      "MUSIC", "CARDS VS/SURV", "SOUND TEST", "CARD GUIDE", "DEFAULTS", "SAVE AND EXIT" };
    static const char *CARD_BTN[CARD_N] = { "A", "B", "C", "D", "SELECT", "START" };
    static const char *BTN = "ABCD-";
    PadCfg *c = &pad_cfg[opt_player];
    BYTE r = rp[opt_player], e = edge[opt_player];
    int k, d = (r & JOY_RIGHT) ? 1 : (r & JOY_LEFT) ? -1 : 0;
    char v[12];
    if (r & JOY_UP) { opt_sel = (BYTE)((opt_sel + O_N - 1) % O_N); sfx(0, SND_MENU); }
    if (r & JOY_DOWN) { opt_sel = (BYTE)((opt_sel + 1) % O_N); sfx(0, SND_MENU); }
    if (d) {
        sfx(0, SND_MOVE);
        switch (opt_sel) {
        case O_DAS:   c->das = (BYTE)(c->das + d < 4 ? 4 : c->das + d > 20 ? 20 : c->das + d); break;
        case O_ARR:   c->arr = (BYTE)(c->arr + d < 0 ? 0 : c->arr + d > 6 ? 6 : c->arr + d); break;
        case O_SOFT:  c->sonic ^= 1; break;
        case O_ROTL:  opt_button(c, ACT_ROT_L, d); break;
        case O_ROTR:  opt_button(c, ACT_ROT_R, d); break;
        case O_HOLD:  opt_button(c, ACT_HOLD, d); break;
        case O_HARD:  opt_button(c, ACT_HARD, d); break;
        case O_UP:    c->up_drop ^= 1; break;
        case O_CARD:  opt_card(c, d); break;
        case O_CARDS: opt_cards ^= 1; break;
        case O_GHOST: opt_ghost ^= 1; break;
        case O_CLEAR: opt_clear = (BYTE)(opt_clear + d * 4 < 0 ? 0 : opt_clear + d * 4 > 20 ? 20 : opt_clear + d * 4); break;
        case O_MUSIC: opt_music ^= 1; if (!opt_music) music(0); else { track_on = 0; music(2); } break;
        default: break;
        }
    }
    if ((e & JOY_A) || (ps & (opt_player ? P2_START : P1_START))) {
        if (opt_sel == O_DEFAULTS) { save_defaults_pad(c); opt_ghost = 1; opt_clear = 8; opt_cards = 1; sfx(0, SND_MENU); }
        else if (opt_sel == O_EXIT) { save_opt_due = 1; sfx(0, SND_MENU); to_title(); return; }
        else if (opt_sel == O_SOUND) { sfx(0, SND_MENU); screen = SCR_SOUND; snd_sel = 0; cls(); return; }
        else if (opt_sel == O_GUIDE) { sfx(0, SND_MENU); screen = SCR_GUIDE; cls(); return; }
    }
    if (e & JOY_B) { save_opt_due = 1; sfx(0, SND_MENU); to_title(); return; }

    txt_c(0, 40, 1, PAL_WHITE, opt_player ? "OPTIONS  2P" : "OPTIONS  1P");
    for (k = 0; k < O_N; k++) {
        BYTE on = (BYTE)(k == opt_sel), y = (BYTE)(4 + k + (k >= O_GHOST) + (k >= O_SOUND) + (k >= O_DEFAULTS));
        v[0] = 0;
        if (k == O_DAS) str_cpy(v, num(c->das, 2, ' '));
        else if (k == O_ARR) str_cpy(v, num(c->arr, 2, ' '));
        else if (k == O_CLEAR) str_cpy(v, num(opt_clear, 2, ' '));
        else if (k >= O_ROTL && k <= O_HARD) { v[0] = BTN[c->btn[k - O_ROTL]]; v[1] = 0; }
        fx_put(6, y, on ? tw(PAL_YELLOW, '>') : BLANK);
        txt(8, y, on ? PAL_WHITE : PAL_GREY, LABEL[k]);
        fill(24, y, 9, 1, BLANK);
        if (k == O_SOFT) txt(24, y, PAL_AMBER, c->sonic ? "INSTANT" : "FAST");
        else if (k == O_UP) txt(24, y, PAL_AMBER, c->up_drop ? "ON" : "OFF");
        else if (k == O_GHOST) txt(24, y, PAL_AMBER, opt_ghost ? "ON" : "OFF");
        else if (k == O_MUSIC) txt(24, y, PAL_AMBER, opt_music ? "ON" : "OFF");
        else if (k == O_CARDS) txt(24, y, PAL_AMBER, opt_cards ? "ON" : "OFF");
        else if (k == O_CARD) txt(24, y, PAL_AMBER, CARD_BTN[c->card]);
        else if (k == O_ARR && !c->arr) txt(24, y, PAL_AMBER, " 0 INSTANT");
        else if (v[0]) txt(24, y, PAL_AMBER, v);
    }
    txt(6, 3, PAL_CYAN, "THIS PLAYER");
    txt(6, 13, PAL_CYAN, "EVERYONE");
    txt(6, 18, PAL_CYAN, "EXTRAS");
    txt_c(0, 40, 25, PAL_STEEL, opt_sel == O_SOUND || opt_sel == O_GUIDE ? "        A: OPEN   B: SAVE AND EXIT    "
                                                                         : "LEFT/RIGHT: CHANGE   B: SAVE AND EXIT");
    txt_c(0, 40, 26, PAL_STEEL, "BUTTONS SWAP IF ALREADY USED");
}


/* back to the options from the sound test or the guide */
static void to_options(void)
{
    screen = SCR_OPTIONS;
    card_hide(0);
    cls();
    if (!opt_music && track_on) music_pause();  /* the sound test plays even with music off */
    track_on = 0;
    music(2);                                   /* the title song again (or silence, music off) */
}

/* ---------- sound test: every CD song and every sound effect ---------- */
static void sound_frame(const BYTE *edge, const BYTE *rp, BYTE ps)
{
    static const char *SONG[6] = { "TITLE", "MARATHON", "SPRINT", "VERSUS", "SURVIVAL", "STOP" };
    static const char *SND[SND_COUNT] = { SND_NAMES };
    BYTE r = (BYTE)(rp[0] | rp[1]), e = (BYTE)(edge[0] | edge[1]);
    int d = (r & JOY_RIGHT) ? 1 : (r & JOY_LEFT) ? -1 : 0, k;
    char nm[12];
    if ((e & JOY_B) || (ps & (P1_SELECT | P2_SELECT))) { sfx(0, SND_MENU); to_options(); return; }
    if (r & (JOY_UP | JOY_DOWN)) { snd_sel ^= 1; sfx(0, SND_MOVE); }
    if (d && !snd_sel) snd_track = (BYTE)((snd_track + 6 + d) % 6);
    if (d && snd_sel) snd_id = (BYTE)((snd_id + SND_COUNT + d) % SND_COUNT);
    if ((e & JOY_A) || (ps & (P1_START | P2_START))) {
        if (snd_sel) snd_play(snd_id, SND_CENTRE);
        else if (snd_track == 5) { music_pause(); track_on = 0; }
        else { track_on = (BYTE)(2 + snd_track); music_play(track_on); }   /* plays even with music off */
    }
    txt_c(0, 40, 1, PAL_WHITE, "SOUND TEST");
    for (k = 0; k < 2; k++) {
        BYTE y = (BYTE)(8 + k * 6), on = (BYTE)(k == snd_sel);
        fx_put(6, y, on ? tw(PAL_YELLOW, '>') : BLANK);
        txt(8, y, on ? PAL_WHITE : PAL_GREY, k ? "SOUND" : "SONG");
        fill(15, y, 20, 1, BLANK);
        fx_put(15, y, on ? tw(PAL_PINK, '<') : BLANK);
        if (k) {
            const char *p = SND[snd_id];
            int j = 0;
            while (*p && j < 11) { char c = *p++; nm[j++] = (char)(c >= 'a' && c <= 'z' ? c - 32 : c); }
            nm[j] = 0;
            led(17, y, PAL_AMBER, num(snd_id + 1, 2, '0'));
            txt(20, y, PAL_AMBER, nm);
        } else {
            if (snd_track < 5) { txt(17, y, PAL_STEEL, "CD"); led(20, y, PAL_AMBER, num(snd_track + 2, 2, '0')); }
            txt(23, y, PAL_AMBER, SONG[snd_track]);
        }
        fx_put(33, y, on ? tw(PAL_PINK, '>') : BLANK);
    }
    fill(0, 18, 40, 2, BLANK);
    if (track_on >= 2) { txt_c(0, 40, 18, PAL_GREEN, "NOW PLAYING:"); txt_c(0, 40, 19, PAL_GREEN, SONG[track_on - 2]); }
    txt_c(0, 40, 24, PAL_STEEL, "UP/DOWN: SONG/SOUND  LEFT/RIGHT: PICK");
    txt_c(0, 40, 25, PAL_STEEL, "A: PLAY   B: BACK");
    txt_c(0, 40, 26, PAL_STEEL, "YOUR OWN SONGS: SEE MUSIC/README");
}

/* ---------- card guide: what every card and ability does ---------- */
typedef struct { const char *l[14]; } Guide;
static const Guide ABIL[CARD_MONSTERS] = {
    { { "A 2X2 ROCK LANDS", "ON THE FOE",
        "AIM L/R, FIRE WITH", "A: EMPTIES 2 COLS",
        "FOE SEES NO NEXT", "BRICKS FOR 8 S",
        "THREE BOULDERS", 0 } },
    { { "FOE'S BRICK SLIPS", "A COLUMN",
        "YOUR BRICKS FALL", "STRAIGHT DOWN",
        "FOE'S BRICK SLIPS", "EVERY SECOND, 6 S",
        "SEND 4 RIB ROWS", 0 } },
    { { "SEND 3 SLASHED", "ROWS",
        "YOUR BOTTOM 3 ROWS", "GO",
        "FOE FALLS 3X", "FASTER FOR 6 S",
        "YOUR NEXT 3 BRICKS", "ARE I BRICKS" } },
    { { "SEND 1 ROW, FOE'S", "FIELD DARK FOR 5 S",
        "WAITING GARBAGE", "BOUNCES BACK, 6 S",
        "5 NEXT BRICKS", "FOR 10 S",
        "SEND 3 ROWS, DARK", "FOR 8 S" } }
};
static const Guide BOSS[CARD_COUNT - CARD_MONSTERS] = {
    { { "WHILE YOU HAVE MORE", "LINES THAN THE FOE,", "TAP TO START A", "10-COUNT. ONCE A", "MATCH (SURVIVAL:",
        "ONCE PER FOE).", "", "CLEAR A LINE, OR", "LET THEM CATCH UP,", "AND IT BREAKS.", "",
        "STILL AHEAD AT 0:", "YOU WIN. LIFT OFF!", 0 } },
    { { "EVERY 10 LINES (3", "A MATCH) YOUR NEXT", "BRICK IS A HOLOGRAM", "(WHITE IN NEXT).", "",
        "IT PASSES THROUGH", "BRICKS, FILLS ONLY", "EMPTY CELLS (HOLES", "TOO) AND CAN'T BE", "HELD.", "",
        "TAP: FREEZE IT", "WHERE IT IS.", 0 } },
    { { "YOUR GARBAGE IS", "HELD, NOT SENT.", "", "EVERY 8 LINES IT", "FOLDS OVER, AT THE",
        "HEIGHT YOU CLEARED", "AT: INTO THEIR", "STACK.", "",
        "TAP: EARLY FOLD,", "1 CHARGE PER 10", "LINES.", 0 } },
    { { "YOUR GARBAGE GOES", "IN YOUR VAULT", "(10 ROWS AT MOST)", "AND EARNS A ROW", "EVERY 10 S.", "",
        "THE FOE'S ATTACKS", "EAT INTO IT FIRST.", "",
        "TAP: WITHDRAW. THE", "WHOLE VAULT GOES", "OVER AS GARBAGE.", 0 } },
    { { "FROM 10 LINES ON:", "", "TAP: MARK (SAVE)", "YOUR FIELD.", "",
        "HOLD: JUMP BACK TO", "THE MARK. ALL", "GARBAGE ON ITS WAY", "IS WIPED.", "",
        "A JUMP EVERY 10", "LINES, 3 AT MOST.", "HOLD SHOWS THE MARK", 0 } },
    { { "A SPIN EVERY 10", "LINES. SPINS STACK.", "", "TAP: PULL THE LEVER", "",
        "JACKPOT 30%:", " SEND 3 ROWS", "CHERRIES 45%:", " LOSE YOUR BOTTOM", " ROW", "BUST 25%:",
        " 2 ROWS DROP ON YOU", 0 } }
};

static void guide_frame(const BYTE *edge, const BYTE *rp, BYTE ps)
{
    static WORD key = 0xffff;
    static const char DIRC[4] = { '<', '>', '\\', '^' };
    const CardDef *c;
    BYTE r = (BYTE)(rp[0] | rp[1]), e = (BYTE)(edge[0] | edge[1]);
    int n = (r & JOY_RIGHT) ? 1 : (r & JOY_LEFT) ? -1 : 0, j;
    char d[2];
    if ((e & JOY_B) || (ps & (P1_SELECT | P2_SELECT))) { sfx(0, SND_MENU); key = 0xffff; to_options(); return; }
    if (n) { guide_card = (BYTE)((guide_card + CARD_COUNT + n) % CARD_COUNT); sfx(0, SND_MOVE); }
    card_show(0, guide_card, 48, 48);
    if (key == guide_card) return;
    key = guide_card;
    c = &CARDS[guide_card];
    cls();
    txt_c(0, 40, 1, PAL_WHITE, "CARD GUIDE");
    txt_c(0, 20, 3, c->pal, c->name);
    fx_put(5, 5, tw(PAL_WHITE, T_BEZ + 0));
    fill(6, 5, 8, 1, tw(PAL_WHITE, T_BEZ + 1));
    fx_put(14, 5, tw(PAL_WHITE, T_BEZ + 2));
    for (j = 0; j < 8; j++) { fx_put(5, 6 + j, tw(PAL_WHITE, T_BEZ_PLAIN)); fx_put(14, 6 + j, tw(PAL_WHITE, T_BEZ + 4)); }
    fx_put(5, 14, tw(PAL_WHITE, T_BEZ + 5));
    fill(6, 14, 8, 1, tw(PAL_WHITE, T_BEZ + 6));
    fx_put(14, 14, tw(PAL_WHITE, T_BEZ + 7));
    txt(2, 9, PAL_WHITE, "<");
    txt(17, 9, PAL_WHITE, ">");
    led(7, 15, PAL_GREY, num(guide_card + 1, 2, ' '));
    txt(9, 15, PAL_GREY, "/10");
    txt_c(0, 20, 17, c->pal, c->pas);
    for (j = 0; j < 3; j++) if (c->line[j]) txt_c(0, 20, 18 + j, PAL_WHITE, c->line[j]);
    if (guide_card < CARD_MONSTERS) {
        const Guide *g = &ABIL[guide_card];
        txt_c(0, 20, 22, PAL_STEEL, "HOLD CARD BUTTON,");
        txt_c(0, 20, 23, PAL_STEEL, "PICK A WAY,");
        txt_c(0, 20, 24, PAL_STEEL, "LET GO TO FIRE");
        txt(19, 3, PAL_STEEL, "ABILITY       METER");
        d[1] = 0;
        for (j = 0; j < 4; j++) {
            int y = 5 + j * 5;
            d[0] = DIRC[j];
            txt(19, y, PAL_AMBER, d);
            txt(21, y, PAL_WHITE, c->act[j]);
            led(36, y, PAL_AMBER, num(c->cost[j], 2, ' '));
            if (g->l[j * 2]) txt(21, y + 1, PAL_BEIGE, g->l[j * 2]);
            if (g->l[j * 2 + 1]) txt(21, y + 2, PAL_BEIGE, g->l[j * 2 + 1]);
        }
    } else {
        const Guide *g = &BOSS[guide_card - CARD_MONSTERS];
        txt_c(0, 20, 22, PAL_STEEL, "BOSS CARD:");
        txt_c(0, 20, 23, PAL_STEEL, "TAP CARD BUTTON");
        txt_c(0, 20, 24, PAL_STEEL, "FOR ITS PERK");
        for (j = 0; j < 14 && g->l[j]; j++) txt(19, 4 + j, PAL_BEIGE, g->l[j]);
    }
    txt_c(0, 40, 26, PAL_STEEL, "LEFT/RIGHT: CARD   B: BACK");
}

/* attract mode, every frame before the game runs: any button ends it.
   Returns 1 when it handled the frame. */
static BYTE demo_frame(const BYTE *edge, BYTE ps)
{
    static const BYTE NONE[2] = { 0, 0 };
    if ((edge[0] | edge[1]) || ps || ++demo_t >= DEMO_LENGTH ||
        (demo_end && ++demo_end > 240)) { to_title(); return 1; }
    if (!demo_end && (side[0].state == S_DONE || side[1].state == S_DONE)) demo_end = 1;
    game_frame(NONE, NONE, 0, 0);
    fill(14, 0, 12, 1, BLANK);                  /* the title line takes turns */
    if ((frames >> 6) & 1) txt_c(14, 12, 0, PAL_WHITE, "PRESS START");
    else txt_c(14, 12, 0, PAL_YELLOW, "DEMO PLAY");
    return 1;
}

/* ======================================================================
 * main
 * ==================================================================== */
int main(void)
{
    BYTE cur[2], edge[2], rp[2], ps, k, psc;
    static BYTE ps_prev, prev[2];

    initGfx();
    clearFixLayer();
    LSPCmode = 0x1c00;
    {
        static const unsigned char NIGHT[3] = { 14, 12, 26 };   /* web PAL.night #0e0c1a */
        backgroundColor(ng8(NIGHT));
    }
    fx_boot();
    load_fix_palettes();
    bg_boot();
    bg_accent(0);
    palJobPut(SPR_PAL_BG, bg_npal, bgpal);
    palJobPut(SPR_PAL_GLYPH, tt_glyphs_Palettes.count, tt_glyphs_Palettes.data);
    pictureInit(&bg, &tt_bg, SPR_BG, SPR_PAL_BG, 0, 0, FLIP_NONE);
    gs_boot();
    snd_init();
    save_load();
    side[0].i = 0; side[1].i = 1;
    cls();
    to_title();

    for (;;) {
        SCClose();
        waitVBlank();
        frames++;
        if ((frames & 15) == 0) resend_static_palettes();
        bg_tick();
        snd_tick();
        if (save_rec_due) { save_rec_due = 0; save_records(); }
        else if (save_opt_due) { save_opt_due = 0; save_options(); }

        cur[0] = volMEMBYTE(P1_CURRENT);
        cur[1] = volMEMBYTE(P2_CURRENT);
        psc = volMEMBYTE(PS_CURRENT);
        ps = (BYTE)(psc & ~ps_prev);
        ps_prev = psc;
        for (k = 0; k < 2; k++) {
            edge[k] = (BYTE)(cur[k] & ~prev[k]);
            prev[k] = cur[k];
            rp[k] = repeat_dirs(&rep[k], cur[k]);
        }
        seed_mix += edge[0] + (edge[1] << 8) + ps;

        if (demo && screen == SCR_GAME && demo_frame(edge, ps)) { fx_flush(); continue; }
        switch (screen) {
        case SCR_TITLE:   title_frame(edge, rp, ps); break;
        case SCR_GAME:    game_frame(cur, edge, ps, psc); break;
        case SCR_RECORDS: records_frame(edge, ps); break;
        case SCR_PICK:    pick_frame(edge, rp, ps); break;
        case SCR_SOUND:   sound_frame(edge, rp, ps); break;
        case SCR_GUIDE:   guide_frame(edge, rp, ps); break;
        default:          options_frame(edge, rp, ps); break;
        }
        fx_flush();
    }
    return 0;
}
