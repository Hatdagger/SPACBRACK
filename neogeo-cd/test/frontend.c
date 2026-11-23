/*
 * PC harness for the Neo Geo CD front end (src/main.c), like Calm Combo's.
 *
 * main.c is compiled against the stand-in headers in test/stubs.  Every
 * VRAM write lands in a fake VRAM (fix layer and sprites), palettes in a
 * fake palette RAM.  A script feeds joypad input frame by frame and asks for
 * snapshots, which test/render_frames.py turns into PNG screenshots with
 * the real art.
 *
 *   sh test/build_frontend.sh            (builds build-pc/frontend)
 *   build-pc/frontend test/tour.txt shots
 *   python3 test/render_frames.py shots
 *
 * Script commands, one per line (# starts a comment):
 *   wait N            let N frames pass
 *   p1 KEY / p2 KEY   press a button for one frame, then release for one
 *                     (U D L R A B C D, START, SELECT)
 *   hold P KEY N      hold a button for N frames (KEY+KEY: several at once)
 *   bot P LEVEL       a CPU plays player P's board (0 = stop)
 *   until P STATE N   wait until player P's board is in STATE (at most N
 *                     frames, then fail): OFF ASK COUNT PLAY DONE NAME
 *   state P STATE     fail unless player P's board is in STATE
 *   lines P N         set player P's line count (to reach a goal quickly)
 *   meter P N [COOL]  set player P's card meter (and cooldown frames)
 *   check P WHAT N    fail unless player P's WHAT is N (meter, aim, card,
 *                     alive, fx0..fx5 on/off) or at least N (cool, rocks,
 *                     pending, fired = abilities fired)
 *   setcard P N       give player P card N (0 Cyclops .. 3 Giant Bat ..)
 *   garbage P N       send player P N rows of garbage
 *   cards P N         fail unless player P has pressed the card button N times
 *   paused N          fail unless the game is paused (1) or not (0)
 *   pad P WHAT N      fail unless player P's options have WHAT (card, hard, up) = N
 *   oldsave HARD UP   put options in the old "SB02" form (A B C rotate L/R,
 *                     hold; HARD hard drop 0-4; UP up-drop) and load them
 *   dump NAME         snapshot to OUTDIR/NAME.txt
 *   sounds NAME...    fail unless each named effect (or "cdda", "save") played
 *   end
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "neocore.h"
#include "DATlib.h"

static int bot_on[2];
#define HARNESS_BOT(s) (bot_on[(s)->i])

/* the game itself, with its main() renamed so the harness drives it */
#define main game_main
#include "main.c"
#undef main

static void stub_snd(BYTE cmd);
static void stub_cdda(int op, BYTE track);
#define SND_WRITE(cmd) stub_snd(cmd)
#define CDDA_PLAY(t)   stub_cdda(0, (t))
#define CDDA_PAUSE()   stub_cdda(1, 0)
#define CDDA_RESUME()  stub_cdda(2, 0)
#include "sound.c"

static BYTE stub_card(BYTE cmd, BYTE sub, BYTE *buf);
#define SAVE_CARD(cmd, sub, buf) stub_card((cmd), (sub), (buf))
#include "save.c"

unsigned char stub_in[8];
ushort LSPCmode;

/* ---- fake art: tile word = picture id << 10 | tile index ---- */
static ushort bg_map[20 * 14 * 2], gl_map[38 * 2 * 2], cd_map[40 * 4 * 2];
paletteInfo tt_bg_Palettes = { 1, { 0 } };
paletteInfo tt_glyphs_Palettes = { 1, { 0 } };
paletteInfo tt_fix_Palettes = { 1, { 0 } };
paletteInfo tt_cards_Palettes = { 1, { 0 } };
const pictureInfo tt_bg = { 14 * 4, 20, 14, &tt_bg_Palettes, { bg_map, bg_map, bg_map, bg_map } };
const pictureInfo tt_glyphs = { 2 * 4, 38, 2, &tt_glyphs_Palettes, { gl_map, gl_map, gl_map, gl_map } };
const pictureInfo tt_cards = { 4 * 4, 40, 4, &tt_cards_Palettes, { cd_map, cd_map, cd_map, cd_map } };

static WORD ng(const unsigned char *c) { return ng5((WORD)(c[0] >> 3), (WORD)(c[1] >> 3), (WORD)(c[2] >> 3)); }

/*
 * Palettes as the converter could have made them: fix roles in order
 * (index = role), the backdrop's key colours at known slots.
 */
static void fake_palettes(void)
{
    paletteInfo *f = &tt_fix_Palettes, *b = &tt_bg_Palettes;
    int k;
    for (k = 1; k < 16; k++) f->data[k] = ng(ROLE_REF[k]);
    /* scramble two roles, as a converter might: the game must still find them */
    { WORD t = f->data[3]; f->data[3] = f->data[12]; f->data[12] = t; }
    for (k = 0; k < BG_NPHASE; k++) b->data[1 + k] = ng(BG_PHASE_KEY[k]);
    b->data[7] = ng(BG_VLINE_KEY);
    b->data[8] = ng(BG_FLOOR_KEY);
}

/* ---- fake hardware ---- */
static WORD vram[0x10000];
static WORD pal_ram[256 * 16];
static WORD bgc;
static long frame;
static FILE *script;
static const char *outdir;
static long sc234_this_frame, sc234_max;
static FILE *sndlog;
static long snd_heard[SND_COUNT], cdda_plays, snd_this_frame, card_saves;
static const char *snd_name[SND_COUNT] = { SND_NAMES };
static const char *pan_name = "LCR";
static picture *pic;

static void stub_snd(BYTE cmd)
{
    int id = (cmd - SND_CMD_BASE) / 3, pan = (cmd - SND_CMD_BASE) % 3;
    if (cmd < SND_CMD_BASE || id >= SND_COUNT) { fprintf(stderr, "frame %ld: bad sound command %02x\n", frame, cmd); exit(4); }
    if (++snd_this_frame > 1) { fprintf(stderr, "frame %ld: two sound commands in one frame\n", frame); exit(4); }
    snd_heard[id]++;
    if (sndlog) fprintf(sndlog, "%ld %s %c\n", frame, snd_name[id], pan_name[pan]);
}

static void stub_cdda(int op, BYTE track)
{
    if (op == 0) {
        if (track < 2 || track > 6) { fprintf(stderr, "frame %ld: CD track %d is not a song\n", frame, track); exit(4); }
        cdda_plays++;
    }
    if (sndlog) fprintf(sndlog, "%ld cdda %s %d\n", frame, op == 0 ? "play" : op == 1 ? "pause" : "resume", track);
}

static BYTE card_mem[8][64];
static int card_has[8];
static BYTE stub_card(BYTE cmd, BYTE sub, BYTE *buf)
{
    if (sub > 7) return 0x80;
    if (cmd == 2) {
        if (!card_has[sub]) return 0x82;
        memcpy(buf, card_mem[sub], 64);
        return 0;
    }
    if (cmd == 3) {
        memcpy(card_mem[sub], buf, 64);
        card_has[sub] = 1;
        card_saves++;
        if (sndlog) fprintf(sndlog, "%ld save %d\n", frame, sub);
        return 0;
    }
    return 0x80;
}

void stub_bg(WORD c) { bgc = c; }
void stub_pal(int n, int c, const void *d) { memcpy(&pal_ram[n * 16], d, (size_t)c * 32); }
void stub_vram(WORD a, WORD d) { vram[a] = d; sc234_this_frame++; }

void initGfx(void)
{
    int k;
    for (k = 0; k < 20 * 14; k++) { bg_map[k * 2] = (ushort)((1 << 10) | k); bg_map[k * 2 + 1] = 0; }
    for (k = 0; k < 38 * 2; k++) { gl_map[k * 2] = (ushort)((2 << 10) | k); gl_map[k * 2 + 1] = 0; }
    for (k = 0; k < 40 * 4; k++) { cd_map[k * 2] = (ushort)((3 << 10) | k); cd_map[k * 2 + 1] = 0; }
    fake_palettes();
}
void clearFixLayer(void) { int k; for (k = 0; k < 0x500; k++) vram[0x7000 + k] = 0x0020; }
void fixPrint(ushort x, ushort y, ushort pal, ushort bank, const char *buf) { (void)x; (void)y; (void)pal; (void)bank; (void)buf; }
void pictureInit(picture *p, const pictureInfo *pi, ushort bs, ushort bp, short x, short y, ushort f)
{
    p->baseSprite = bs; p->basePalette = bp; p->posX = x; p->posY = y; p->currentFlip = f;
    p->info = pi; p->shown = 1; pic = p;
}
void pictureHide(picture *p) { p->shown = 0; }
void pictureShow(picture *p) { p->shown = 1; }
void SCClose(void) {}

static void dump(const char *name)
{
    char path[512];
    FILE *f;
    int s, x, y, k, t;
    sprintf(path, "%s/%s.txt", outdir, name);
    f = fopen(path, "w");
    if (!f) { perror(path); exit(2); }
    fprintf(f, "frame %ld\nbg %04x\n", frame, bgc);
    for (k = 0; k < 256 * 16; k += 16) {
        int any = 0;
        for (x = 1; x < 16; x++) any |= pal_ram[k + x];
        if (!any) continue;
        fprintf(f, "pal %d", k / 16);
        for (x = 0; x < 16; x++) fprintf(f, " %04x", pal_ram[k + x]);
        fprintf(f, "\n");
    }
    if (pic && pic->shown) fprintf(f, "pict %d %d %d %d\n", pic->baseSprite, pic->basePalette, pic->posX, pic->posY);
    for (s = 1; s < 381; s++) {
        WORD yw = vram[0x8200 | s];
        int h = yw & 0x3f, cx = vram[0x8400 | s] >> 7, cy = YSHIFT - (yw >> 7);
        if (!h || (yw & 0x40)) continue;
        if (cx >= 400) cx -= 512;
        if (cy > 300) cy -= 512;
        fprintf(f, "spr %d %d %d %d", s, cx, cy, h);
        for (t = 0; t < h; t++) fprintf(f, " %04x %04x", vram[(s << 6) + t * 2], vram[(s << 6) + t * 2 + 1]);
        fprintf(f, "\n");
    }
    for (y = 2; y < 30; y++) {
        fprintf(f, "fix");
        for (x = 0; x < 40; x++) fprintf(f, " %04x", vram[0x7000 + x * 32 + y]);
        fprintf(f, "\n");
    }
    fclose(f);
}

/* ---- script ---- */
static const char *STATE_NAME[] = { "OFF", "ASK", "COUNT", "PLAY", "DONE", "NAME", "GAP" };
static int wait_n, hold_p, hold_n, until_p = -1, until_left;
static BYTE hold_k, hold_sys, tap_k[2], tap_sys, tap_phase;
static char until_s[64];

static BYTE key1(const char *k, BYTE *sys, int pl)
{
    *sys = 0;
    if (!strcmp(k, "U")) return JOY_UP;
    if (!strcmp(k, "D")) return JOY_DOWN;
    if (!strcmp(k, "L")) return JOY_LEFT;
    if (!strcmp(k, "R")) return JOY_RIGHT;
    if (!strcmp(k, "A")) return JOY_A;
    if (!strcmp(k, "B")) return JOY_B;
    if (!strcmp(k, "C")) return JOY_C;
    if (!strcmp(k, "D2")) return JOY_D;
    if (!strcmp(k, "START")) { *sys = (BYTE)(pl == 1 ? P1_START : P2_START); return 0; }
    if (!strcmp(k, "SELECT")) { *sys = (BYTE)(pl == 1 ? P1_SELECT : P2_SELECT); return 0; }
    fprintf(stderr, "unknown key %s\n", k); exit(2);
    return 0;
}

/* KEY or KEY+KEY.. (held together) */
static BYTE key(const char *k, BYTE *sys, int pl)
{
    char one[16];
    BYTE out = 0, s1;
    int n;
    *sys = 0;
    while (*k) {
        for (n = 0; k[n] && k[n] != '+' && n < 15; n++) one[n] = k[n];
        one[n] = 0;
        out |= key1(one, &s1, pl);
        *sys |= s1;
        k += n;
        if (*k == '+') k++;
    }
    return out;
}

static int count_cells(const tt_board *b, int v)
{
    int x, y, n = 0;
    for (y = 0; y < TT_ROWS; y++) for (x = 0; x < TT_COLS; x++) n += b->grid[y][x] == v;
    return n;
}

static int state_id(const char *n)
{
    int k;
    for (k = 0; k < 7; k++) if (!strcmp(n, STATE_NAME[k])) return k;
    fprintf(stderr, "unknown state %s\n", n); exit(2);
    return 0;
}

void waitVBlank(void)
{
    char line[256], cmd[32], a1[64], a2[64], a3[64];
    int n, pl;
    BYTE sys, k;

    if (sc234_this_frame > sc234_max) sc234_max = sc234_this_frame;
    if (sc234_this_frame > 1140) { fprintf(stderr, "frame %ld: %ld SC234 writes overflow DATlib's list\n", frame, sc234_this_frame); exit(3); }
    sc234_this_frame = 0;
    snd_this_frame = 0;
    frame++;
    memset(stub_in, 0, sizeof stub_in);

    for (;;) {
        if (hold_n > 0) {
            hold_n--;
            if (hold_p == 1) stub_in[0] = hold_k; else stub_in[2] = hold_k;
            stub_in[4] = hold_sys;
            return;
        }
        if (tap_phase == 1) {
            stub_in[0] = tap_k[0]; stub_in[2] = tap_k[1]; stub_in[4] = tap_sys;
            tap_phase = 2;
            return;
        }
        if (tap_phase == 2) { tap_phase = 0; return; }
        if (wait_n > 0) { wait_n--; return; }
        if (until_p >= 0) {
            if (side[until_p].state == state_id(until_s)) { until_p = -1; continue; }
            if (--until_left <= 0) {
                fprintf(stderr, "frame %ld: player %d is %s, waited for %s\n", frame, until_p + 1,
                        STATE_NAME[side[until_p].state], until_s);
                exit(4);
            }
            return;
        }
        if (!fgets(line, sizeof line, script)) { fprintf(stderr, "script ended without 'end'\n"); exit(2); }
        a1[0] = a2[0] = a3[0] = 0;
        n = sscanf(line, "%31s %63s %63s %63s", cmd, a1, a2, a3);
        if (n < 1 || cmd[0] == '#') continue;
        if (!strcmp(cmd, "wait")) wait_n = atoi(a1);
        else if (!strcmp(cmd, "dump")) dump(a1);
        else if (!strcmp(cmd, "p1") || !strcmp(cmd, "p2")) {
            pl = cmd[1] - '0';
            k = key(a1, &sys, pl);
            tap_k[0] = tap_k[1] = 0;
            tap_k[pl - 1] = k; tap_sys = sys; tap_phase = 1;
        } else if (!strcmp(cmd, "hold")) {
            hold_p = atoi(a1);
            hold_k = key(a2, &hold_sys, hold_p);
            hold_n = atoi(a3);
        } else if (!strcmp(cmd, "bot")) {
            pl = atoi(a1) - 1;
            bot_on[pl] = atoi(a2) > 0;
            if (bot_on[pl]) cpu_init(&side[pl].cpu, (tt_u8)atoi(a2), 77 + pl);
        } else if (!strcmp(cmd, "until")) {
            until_p = atoi(a1) - 1;
            strcpy(until_s, a2);
            until_left = atoi(a3);
        } else if (!strcmp(cmd, "state")) {
            pl = atoi(a1) - 1;
            if (side[pl].state != state_id(a2)) {
                fprintf(stderr, "frame %ld: player %d is %s, expected %s\n", frame, pl + 1, STATE_NAME[side[pl].state], a2);
                exit(4);
            }
        } else if (!strcmp(cmd, "human") || !strcmp(cmd, "cpu")) {
            pl = atoi(a1) - 1;
            if (!side[pl].cpu_on != !strcmp(cmd, "human")) {
                fprintf(stderr, "frame %ld: player %d's seat is %s, expected %s\n", frame, pl + 1,
                        side[pl].cpu_on ? "a CPU" : "a player", cmd);
                exit(4);
            }
        } else if (!strcmp(cmd, "check")) {
            /* check P WHAT N: meter = N, cool (frames left) >= N, rocks >= N,
               pending >= N, fx<k> (effect k on) = N, aim = N, card = N, alive = N */
            Side *cs = &side[atoi(a1) - 1];
            long v, want = atol(a3);
            int ge = 0;
            if (!strcmp(a2, "meter")) v = cs->b.meter;
            else if (!strcmp(a2, "cool")) { v = cs->b.cool; ge = 1; }
            else if (!strcmp(a2, "rocks")) { v = count_cells(&cs->b, TT_ROCK); ge = 1; }
            else if (!strcmp(a2, "pending")) { v = tt_pending(&cs->b); ge = 1; }
            else if (!strncmp(a2, "fx", 2)) v = cs->b.fx[atoi(a2 + 2) % TT_FX_N] != 0;
            else if (!strcmp(a2, "aim")) v = cs->aim;
            else if (!strcmp(a2, "card")) v = cs->card;
            else if (!strcmp(a2, "alive")) v = cs->b.alive;
            else if (!strcmp(a2, "fired")) { v = cs->fired; ge = 1; }
            else { fprintf(stderr, "unknown check %s\n", a2); exit(2); }
            if (ge ? v < want : v != want) {
                fprintf(stderr, "frame %ld: player %s %s is %ld, expected %s%ld\n", frame, a1, a2, v, ge ? ">= " : "", want);
                exit(4);
            }
        } else if (!strcmp(cmd, "setcard")) side[atoi(a1) - 1].card = (BYTE)atoi(a2);
        else if (!strcmp(cmd, "garbage")) tt_receive(&side[atoi(a1) - 1].b, (tt_u8)atoi(a2));
        else if (!strcmp(cmd, "meter")) {
            side[atoi(a1) - 1].b.meter = (tt_u8)atoi(a2);
            side[atoi(a1) - 1].b.cool = (tt_u16)atoi(a3);
        } else if (!strcmp(cmd, "cards")) {
            pl = atoi(a1) - 1;
            if (side[pl].card_n != atoi(a2)) {
                fprintf(stderr, "frame %ld: player %d pressed the card button %d times, expected %s\n", frame, pl + 1, side[pl].card_n, a2);
                exit(4);
            }
        } else if (!strcmp(cmd, "paused")) {
            if (paused != atoi(a1)) { fprintf(stderr, "frame %ld: paused is %d, expected %s\n", frame, paused, a1); exit(4); }
        } else if (!strcmp(cmd, "pad")) {
            PadCfg *c = &pad_cfg[atoi(a1) - 1];
            int v = !strcmp(a2, "card") ? c->card : !strcmp(a2, "hard") ? c->btn[ACT_HARD] : !strcmp(a2, "up") ? c->up_drop : -1;
            if (v != atoi(a3)) { fprintf(stderr, "frame %ld: player %s's %s is %d, expected %s\n", frame, a1, a2, v, a3); exit(4); }
        } else if (!strcmp(cmd, "oldsave")) {
            BYTE *m = card_mem[3], s = 0;
            memset(m, 0, 64);
            m[0] = 'S'; m[1] = 'B'; m[2] = '0'; m[3] = '2';
            for (pl = 0; pl < 2; pl++) {
                BYTE *q = m + 4 + pl * 8;
                q[0] = 10; q[1] = 2; q[2] = 0; q[3] = 0; q[4] = 1; q[5] = 2;
                q[6] = (BYTE)atoi(a1); q[7] = (BYTE)atoi(a2);
            }
            m[20] = 1; m[21] = 8; m[22] = 1;
            for (pl = 0; pl < 63; pl++) s = (BYTE)(s + m[pl]);
            m[63] = s;
            card_has[3] = 1;
            save_load();
        } else if (!strcmp(cmd, "lines")) side[atoi(a1) - 1].b.lines = (tt_u16)atoi(a2);
        else if (!strcmp(cmd, "sounds")) {
            char *w;
            int id;
            for (w = strtok(line + 6, " \t\r\n"); w; w = strtok(0, " \t\r\n")) {
                if (!strcmp(w, "cdda")) { if (!cdda_plays) { fprintf(stderr, "no CD track was started\n"); exit(4); } continue; }
                if (!strcmp(w, "save")) { if (!card_saves) { fprintf(stderr, "frame %ld: the game never saved\n", frame); exit(4); } continue; }
                for (id = 0; id < SND_COUNT && strcmp(w, snd_name[id]); id++) ;
                if (id == SND_COUNT) { fprintf(stderr, "unknown sound %s\n", w); exit(2); }
                if (!snd_heard[id]) { fprintf(stderr, "frame %ld: sound %s never played\n", frame, w); exit(4); }
            }
        } else if (!strcmp(cmd, "end")) {
            int id;
            printf("ran %ld frames, peak %ld VRAM writes per frame\n", frame, sc234_max);
            printf("sounds:");
            for (id = 0; id < SND_COUNT; id++) if (snd_heard[id]) printf(" %s x%ld", snd_name[id], snd_heard[id]);
            printf("; CD track starts: %ld; saves: %ld\n", cdda_plays, card_saves);
            exit(0);
        } else { fprintf(stderr, "bad script line: %s", line); exit(2); }
    }
}

int main(int argc, char **argv)
{
    char path[512];
    if (argc < 3) { fprintf(stderr, "usage: frontend SCRIPT OUTDIR\n"); return 1; }
    script = fopen(argv[1], "r");
    if (!script) { perror(argv[1]); return 1; }
    outdir = argv[2];
    sprintf(path, "%s/sounds.txt", outdir);
    sndlog = fopen(path, "a");
    return game_main();
}
