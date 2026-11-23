/*
 * SPACBRACK - saving (Neo Geo CD).  See save.h.
 *
 * Same method as Calm Combo: the CD systems' 8 KB of battery-backed memory
 * is reached through the BIOS CARD call ($C00468): command 2 loads a save,
 * 3 writes it, by game number (NGH, NeoCore's 0x7777) and save number.
 * Two 64-byte saves, each starting with a tag and ending with a checksum
 * (anything else under that number is ignored, and nothing is formatted):
 *
 *   save 2 "SB01" records:  5 x Marathon (name 2 bytes, score 3 bytes)
 *                           5 x Sprint   (name 2 bytes, frames 3 bytes)
 *   save 3 "SB04" options:  per player DAS, ARR, sonic, 4 buttons, up-drop,
 *                           card button; ghost, line-clear delay, music, cards
 *                           (the older "SB02" options, without the card
 *                           button or cards, still load: see old_card)
 *   save 4 "SB03" survival: 5 x (name 2 bytes, CPUs knocked out 2 bytes)
 *
 * Names are 3 letters of 5 bits each ("A"-"Z", space, ".", "!").
 * Calm Combo uses save 0 under the same game number, so they never clash.
 *
 * Strict C89: gcc 2.95, no // comments, declarations at the top of blocks.
 */
#include <neocore.h>
#include "externs.h"
#include <DATlib.h>
#include "save.h"

#define SAVE_SIZE 64
#define SAVE_NGH  0x7777
#define SUB_REC   2
#define SUB_OPT   3
#define SUB_SRV   4
#define CARD_LOAD 2
#define CARD_SAVE 3

/* The PC harness (test/frontend.c) defines SAVE_CARD to use a fake memory. */
#ifndef SAVE_CARD
#define BIOS_CARD_COMMAND (*(volatile BYTE *)0x10FDC4)
#define BIOS_CARD_ANSWER  (*(volatile BYTE *)0x10FDC6)
#define BIOS_CARD_START   (*(volatile DWORD *)0x10FDC8)
#define BIOS_CARD_SIZE    (*(volatile WORD *)0x10FDCC)
#define BIOS_CARD_FCB     (*(volatile WORD *)0x10FDCE)
#define BIOS_CARD_SUB     (*(volatile WORD *)0x10FDD0)

static BYTE bios_card(BYTE cmd, BYTE sub, BYTE *buf)
{
    BIOS_CARD_COMMAND = cmd;
    BIOS_CARD_START = (DWORD)buf;
    BIOS_CARD_SIZE = SAVE_SIZE;
    BIOS_CARD_FCB = SAVE_NGH;
    BIOS_CARD_SUB = sub;
    disableIRQ();
    /* the BIOS doesn't keep registers: save the ones GCC expects kept */
    __asm__ volatile (
        "movem.l %%d2-%%d7/%%a2-%%a6,-(%%sp)\n\t"
        "jsr     0xC00468\n\t"
        "movem.l (%%sp)+,%%d2-%%d7/%%a2-%%a6"
        : : : "d0", "d1", "a0", "a1", "memory");
    enableIRQ();
    return BIOS_CARD_ANSWER;
}
#define SAVE_CARD(cmd, sub, buf) bios_card((cmd), (sub), (buf))
#endif

char  mar_name[REC_N][4];
DWORD mar_score[REC_N];
char  spr_name[REC_N][4];
DWORD spr_time[REC_N];
char  srv_name[REC_N][4];
DWORD srv_kos[REC_N];
PadCfg pad_cfg[2];
BYTE  opt_ghost, opt_clear, opt_music;
BYTE  opt_cards;
BYTE  save_answer;

static BYTE buf[SAVE_SIZE];

static const char  DEF_NAME[REC_N][4] = { "SPC", "BRK", "VHS", "NEO", "CRT" };
static const DWORD DEF_SCORE[REC_N]   = { 100000, 50000, 25000, 10000, 5000 };
static const DWORD DEF_TIME[REC_N]    = { 3L * 3600, 4L * 3600, 5L * 3600, 6L * 3600, 7L * 3600 };

static const char NAME_CH[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZ .!";

void save_defaults_pad(PadCfg *c)
{
    c->das = 10; c->arr = 2; c->sonic = 0;
    /* A rotate left, B rotate right, C hold, D card, Up hard drop */
    c->btn[ACT_ROT_L] = 0; c->btn[ACT_ROT_R] = 1; c->btn[ACT_HOLD] = 2; c->btn[ACT_HARD] = 4;
    c->up_drop = 1;
    c->card = CARD_D;
}

static void defaults_rec(void)
{
    int k, j;
    for (k = 0; k < REC_N; k++) {
        for (j = 0; j < 4; j++) { mar_name[k][j] = DEF_NAME[k][j]; spr_name[k][j] = DEF_NAME[k][j]; }
        mar_score[k] = DEF_SCORE[k];
        spr_time[k] = DEF_TIME[k];
        for (j = 0; j < 4; j++) srv_name[k][j] = DEF_NAME[k][j];
        srv_kos[k] = (DWORD)(REC_N - k) * 2;
    }
}

static void defaults_opt(void)
{
    save_defaults_pad(&pad_cfg[0]);
    save_defaults_pad(&pad_cfg[1]);
    opt_ghost = 1; opt_clear = 8; opt_music = 1; opt_cards = 1;
}

static BYTE checksum(void)
{
    BYTE s = 0;
    int k;
    for (k = 0; k < SAVE_SIZE - 1; k++) s = (BYTE)(s + buf[k]);
    return s;
}

static int ch_code(char c)
{
    int k;
    for (k = 0; NAME_CH[k]; k++) if (NAME_CH[k] == c) return k;
    return 26;
}

static BYTE *put_name(BYTE *p, const char *n)
{
    WORD w = (WORD)((ch_code(n[0]) << 10) | (ch_code(n[1]) << 5) | ch_code(n[2]));
    *p++ = (BYTE)(w >> 8); *p++ = (BYTE)w;
    return p;
}

static const BYTE *get_name(const BYTE *p, char *n)
{
    WORD w = (WORD)((p[0] << 8) | p[1]);
    int k, c;
    for (k = 0; k < 3; k++) {
        c = (w >> (10 - 5 * k)) & 31;
        n[k] = c < 29 ? NAME_CH[c] : ' ';
    }
    n[3] = 0;
    return p + 2;
}

static BYTE *put24(BYTE *p, DWORD v)
{
    if (v > 0xffffffUL) v = 0xffffffUL;
    *p++ = (BYTE)(v >> 16); *p++ = (BYTE)(v >> 8); *p++ = (BYTE)v;
    return p;
}

static DWORD get24(const BYTE *p)
{
    return ((DWORD)p[0] << 16) | ((DWORD)p[1] << 8) | (DWORD)p[2];
}

static void tag(BYTE n)
{
    int k;
    for (k = 0; k < SAVE_SIZE; k++) buf[k] = 0;
    buf[0] = 'S'; buf[1] = 'B'; buf[2] = '0'; buf[3] = n;
}

static int tag_ok(BYTE n)
{
    return buf[0] == 'S' && buf[1] == 'B' && buf[2] == '0' && buf[3] == n && buf[SAVE_SIZE - 1] == checksum();
}

static int clamp(int v, int lo, int hi, int def)
{
    return v < lo || v > hi ? def : v;
}

/*
 * Options saved before the card button existed: give it D when that is
 * free, or when D was hard drop and Up hard drops too (the old default,
 * which becomes the new one); else the first free face button; else Select.
 */
static void old_card(PadCfg *c)
{
    int j, b;
    BYTE used[5] = { 0, 0, 0, 0, 0 };
    for (j = 0; j < ACT_N; j++) used[c->btn[j]] = 1;
    if (!used[3] || (c->btn[ACT_HARD] == 3 && c->up_drop)) { c->card = CARD_D; return; }
    for (b = 0; b < 4; b++) if (!used[b]) { c->card = (BYTE)b; return; }
    c->card = CARD_SELECT;
}

void save_load(void)
{
    int k, j;
    const BYTE *p;
    defaults_rec();
    defaults_opt();
    save_answer = SAVE_CARD(CARD_LOAD, SUB_REC, buf);
    if (save_answer == 0 && tag_ok('1')) {
        p = buf + 4;
        for (k = 0; k < REC_N; k++) { p = get_name(p, mar_name[k]); mar_score[k] = get24(p); p += 3; }
        for (k = 0; k < REC_N; k++) { p = get_name(p, spr_name[k]); spr_time[k] = get24(p); p += 3; }
    }
    if (SAVE_CARD(CARD_LOAD, SUB_SRV, buf) == 0 && tag_ok('3')) {
        p = buf + 4;
        for (k = 0; k < REC_N; k++) { p = get_name(p, srv_name[k]); srv_kos[k] = ((DWORD)p[0] << 8) | p[1]; p += 2; }
    }
    if (SAVE_CARD(CARD_LOAD, SUB_OPT, buf) == 0) {
        int fresh = tag_ok('4'), old = !fresh && tag_ok('2'), w = fresh ? 9 : 8;
        if (!fresh && !old) return;
        p = buf + 4;
        for (k = 0; k < 2; k++) {
            PadCfg *c = &pad_cfg[k];
            c->das = (BYTE)clamp(p[0], 4, 20, 10);
            c->arr = (BYTE)clamp(p[1], 0, 6, 2);
            c->sonic = (BYTE)(p[2] ? 1 : 0);
            for (j = 0; j < ACT_N; j++) c->btn[j] = (BYTE)clamp(p[3 + j], 0, 4, j);
            c->up_drop = (BYTE)(p[7] ? 1 : 0);
            if (fresh) c->card = (BYTE)clamp(p[8], 0, CARD_N - 1, CARD_D);
            else old_card(c);
            /* a button does one thing */
            if (c->card < 4) for (j = 0; j < ACT_N; j++) if (c->btn[j] == c->card) c->btn[j] = 4;
            p += w;
        }
        opt_ghost = (BYTE)(p[0] ? 1 : 0);
        opt_clear = (BYTE)clamp(p[1], 0, 20, 8);
        opt_music = (BYTE)(p[2] ? 1 : 0);
        if (fresh) opt_cards = (BYTE)(p[3] ? 1 : 0);
    }
}

void save_records(void)
{
    int k;
    BYTE *p;
    tag('1');
    p = buf + 4;
    for (k = 0; k < REC_N; k++) { p = put_name(p, mar_name[k]); p = put24(p, mar_score[k]); }
    for (k = 0; k < REC_N; k++) { p = put_name(p, spr_name[k]); p = put24(p, spr_time[k]); }
    buf[SAVE_SIZE - 1] = checksum();
    save_answer = SAVE_CARD(CARD_SAVE, SUB_REC, buf);
    if (save_answer) return;
    tag('3');
    p = buf + 4;
    for (k = 0; k < REC_N; k++) {
        p = put_name(p, srv_name[k]);
        *p++ = (BYTE)(srv_kos[k] >> 8); *p++ = (BYTE)srv_kos[k];
    }
    buf[SAVE_SIZE - 1] = checksum();
    save_answer = SAVE_CARD(CARD_SAVE, SUB_SRV, buf);
}

void save_options(void)
{
    int k, j;
    BYTE *p;
    tag('4');
    p = buf + 4;
    for (k = 0; k < 2; k++) {
        PadCfg *c = &pad_cfg[k];
        p[0] = c->das; p[1] = c->arr; p[2] = c->sonic;
        for (j = 0; j < ACT_N; j++) p[3 + j] = c->btn[j];
        p[7] = c->up_drop;
        p[8] = c->card;
        p += 9;
    }
    p[0] = opt_ghost; p[1] = opt_clear; p[2] = opt_music; p[3] = opt_cards;
    buf[SAVE_SIZE - 1] = checksum();
    save_answer = SAVE_CARD(CARD_SAVE, SUB_OPT, buf);
}

int mar_rank(DWORD score)
{
    int k;
    if (!score) return -1;
    for (k = 0; k < REC_N; k++) if (score > mar_score[k]) return k;
    return -1;
}

int srv_rank(DWORD kos)
{
    int k;
    if (!kos) return -1;
    for (k = 0; k < REC_N; k++) if (kos > srv_kos[k]) return k;
    return -1;
}

int spr_rank(DWORD frames)
{
    int k;
    for (k = 0; k < REC_N; k++) if (frames < spr_time[k]) return k;
    return -1;
}

static void ins(char names[REC_N][4], DWORD *vals, int rank, const char *name, DWORD v)
{
    int k, j;
    if (rank < 0 || rank >= REC_N) return;
    for (k = REC_N - 1; k > rank; k--) {
        for (j = 0; j < 4; j++) names[k][j] = names[k - 1][j];
        vals[k] = vals[k - 1];
    }
    for (j = 0; j < 3; j++) names[rank][j] = name[j];
    names[rank][3] = 0;
    vals[rank] = v;
}

void mar_insert(int rank, const char *name, DWORD score) { ins(mar_name, mar_score, rank, name, score); }
void spr_insert(int rank, const char *name, DWORD frames) { ins(spr_name, spr_time, rank, name, frames); }
void srv_insert(int rank, const char *name, DWORD kos) { ins(srv_name, srv_kos, rank, name, kos); }
