/*
 * SPACBRACK - CPU opponent.  See cpu.h.
 *
 * Strict C89: gcc 2.95, no // comments, declarations at the top of blocks.
 */
#include "cpu.h"

enum { CS_NEW, CS_SEARCH, CS_THINK, CS_MOVE, CS_SETTLE, CS_DROP };

#define FULL_ROW 0x3ff
#define PER_FRAME 8                       /* placements scored per frame */

/* per level: think, step, settle (frames), mistake (%), slop, hard drop, uses hold */
static const tt_u8 LV[CPU_MAX_LEVEL + 1][7] = {
    { 40, 10, 32, 30, 3, 0, 0 },
    { 40, 10, 32, 30, 3, 0, 0 },          /* 1 */
    { 34,  8, 24, 25, 3, 0, 0 },          /* 2 */
    { 26,  7, 15, 20, 3, 0, 0 },          /* 3 */
    { 23,  6, 13, 15, 3, 1, 0 },          /* 4 */
    { 19,  5,  8, 10, 3, 1, 1 },          /* 5 */
    { 16,  5,  4,  7, 2, 1, 1 },          /* 6 */
    { 12,  4,  1,  4, 2, 1, 1 },          /* 7 */
    {  8,  3,  0,  2, 2, 1, 1 }           /* 8 */
};

static const tt_u8 POP[32] = { 0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4,1,2,2,3,2,3,3,4,2,3,3,4,3,4,4,5 };
#define POPC(v) (POP[(v) & 31] + POP[((v) >> 5) & 31])

static tt_u32 crand(tt_cpu *c)
{
    tt_u32 x = c->rng;
    x ^= (x << 13) & 0xffffffffUL;
    x ^= x >> 17;
    x ^= (x << 5) & 0xffffffffUL;
    c->rng = x & 0xffffffffUL;
    return c->rng;
}

void cpu_init(tt_cpu *c, tt_u8 level, tt_u32 seed)
{
    tt_u8 *p = (tt_u8 *)c;
    unsigned k;
    for (k = 0; k < sizeof *c; k++) p[k] = 0;
    c->level = (tt_u8)(level < 1 ? 1 : level > CPU_MAX_LEVEL ? CPU_MAX_LEVEL : level);
    c->rng = seed | 1;
    c->state = CS_NEW;
}

/* candidate n: hold (n / 56), rotation, x = -3..10 */
#define C_HOLD(n) ((n) / 56)
#define C_ROT(n)  (((n) / 14) & 3)
#define C_X(n)    ((n) % 14 - 3)

static int fits(const tt_u16 *rows, int type, int rot, int x, int y)
{
    int k, cx, cy;
    for (k = 0; k < 4; k++) {
        cx = x + TT_SHAPE[type][rot][k][0];
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cx < 0 || cx >= TT_COLS || cy >= TT_ROWS) return 0;
        if (cy >= 0 && (rows[cy] >> cx) & 1) return 0;
    }
    return 1;
}

/* score one placement x100; returns 0 if impossible (out: 1 = valid) */
static long score_place(const tt_cpu *c, int type, int rot, int x, int y0, int *ok)
{
    const tt_u16 *field = c->rows;
    const tt_u8 *top = c->top;
    tt_u16 r[TT_ROWS], covered = 0, fresh;
    int k, y, cx, cy, d, deep = 0, lines = 0, holes = 0, agg = 0, bump = 0, maxh = 0, above = 1, to, first;
    int h[TT_COLS];
    long s;
    *ok = 0;
    if (!fits(field, type, rot, x, y0)) return 0;
    /* a straight drop stops on the highest filled cell under each part of the
       brick: one step instead of testing every row on the way down */
    y = TT_ROWS;
    for (k = 0; k < 4; k++) {
        cx = x + TT_SHAPE[type][rot][k][0];
        cy = TT_SHAPE[type][rot][k][1];
        if (y0 + cy >= top[cx]) deep = 1;
        d = top[cx] - 1 - cy;
        if (d < y) y = d;
    }
    if (deep) {                       /* starts under an overhang: the slow way */
        y = y0;
        while (fits(field, type, rot, x, y + 1)) y++;
    }
    /* rows above both the stack and the brick stay empty: start below them */
    first = c->top_min;
    for (k = 0; k < 4; k++) {
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cy < first) first = cy;
    }
    if (first < 0) first = 0;
    for (k = first; k < TT_ROWS; k++) r[k] = field[k];
    for (k = 0; k < 4; k++) {
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cy >= 0) r[cy] |= (tt_u16)(1 << (x + TT_SHAPE[type][rot][k][0]));
        if (cy >= TT_HIDDEN) above = 0;
    }
    if (above) return 0;
    /* clear full rows */
    to = TT_ROWS - 1;
    for (k = TT_ROWS - 1; k >= first; k--) {
        if (r[k] == FULL_ROW) { lines++; continue; }
        r[to--] = r[k];
    }
    while (to >= first) r[to--] = 0;
    for (k = 0; k < TT_COLS; k++) h[k] = 0;
    for (y = first; y < TT_ROWS; y++) {
        fresh = (tt_u16)(r[y] & ~covered);
        if (fresh) for (k = 0; k < TT_COLS; k++) if ((fresh >> k) & 1) h[k] = TT_ROWS - y;
        covered |= r[y];
        holes += POPC(covered & ~r[y] & FULL_ROW);
    }
    for (k = 0; k < TT_COLS; k++) { agg += h[k]; if (h[k] > maxh) maxh = h[k]; }
    for (k = 0; k < TT_COLS - 1; k++) bump += h[k] > h[k + 1] ? h[k] - h[k + 1] : h[k + 1] - h[k];
    s = -51L * agg + (maxh > 14 ? 152L : 76L) * lines - 36L * holes - 18L * bump;
    *ok = 1;
    return s;
}

static void keep_best(tt_cpu *c, long s, tt_u8 n)
{
    int k = c->nc < 8 ? c->nc : 8;
    if (k == 8 && s <= c->sc[7]) return;
    if (k == 8) k = 7;
    while (k > 0 && c->sc[k - 1] < s) { c->sc[k] = c->sc[k - 1]; c->cand[k] = c->cand[k - 1]; k--; }
    c->sc[k] = s; c->cand[k] = n;
    if (c->nc < 8) c->nc++;
}

static void search_step(tt_cpu *c, const tt_board *b)
{
    int n, ok, type, quota = PER_FRAME, maxc = LV[c->level][6] ? CPU_NCAND : 56;
    long s;
    while (c->ci < maxc && quota > 0) {
        n = c->ci++;
        if (C_HOLD(n)) {
            if (b->hold_used) continue;
            type = b->hold ? b->hold : b->queue[0];
        } else type = b->type;
        if (type == TT_O && C_ROT(n)) continue;
        quota--;
        s = score_place(c, type, C_ROT(n), C_X(n), 1, &ok);
        if (ok) keep_best(c, s, (tt_u8)n);
    }
}

static void plan(tt_cpu *c)
{
    int pick = 0, slop = LV[c->level][4];
    if (!c->nc) { c->use_hold = 0; c->trot = 0; c->tx = 3; return; }
    if ((int)(crand(c) % 100) < LV[c->level][3]) {
        if (slop > c->nc) slop = c->nc;
        pick = (int)(crand(c) % (tt_u32)slop);
    }
    c->use_hold = (tt_u8)C_HOLD(c->cand[pick]);
    c->trot = (tt_u8)C_ROT(c->cand[pick]);
    c->tx = (tt_s8)C_X(c->cand[pick]);
}

void cpu_frame(tt_cpu *c, tt_board *b)
{
    int y, x, d;
    b->soft = 0;
    if (!b->alive || b->done) return;
    if (!b->active) { c->state = CS_NEW; return; }
    if (c->state != CS_NEW && (b->pieces != c->piece_no || (b->type != c->piece_type && !c->use_hold)))
        c->state = CS_NEW;
    switch (c->state) {
    case CS_NEW:
        c->piece_no = b->pieces;
        c->piece_type = b->type;
        for (y = 0; y < TT_ROWS; y++) {
            c->rows[y] = 0;
            for (x = 0; x < TT_COLS; x++) if (b->grid[y][x]) c->rows[y] |= (tt_u16)(1 << x);
        }
        for (x = 0; x < TT_COLS; x++) {
            for (y = 0; y < TT_ROWS && !((c->rows[y] >> x) & 1); y++) ;
            c->top[x] = (tt_u8)y;
        }
        c->top_min = TT_ROWS;
        for (x = 0; x < TT_COLS; x++) if (c->top[x] < c->top_min) c->top_min = c->top[x];
        c->ci = 0; c->nc = 0;
        c->timer = LV[c->level][0];
        c->state = CS_SEARCH;
        /* fall through */
    case CS_SEARCH:
        search_step(c, b);
        if (c->timer) c->timer--;
        if (c->ci >= CPU_NCAND || (!LV[c->level][6] && c->ci >= 56)) { plan(c); c->state = CS_THINK; }
        break;
    case CS_THINK:
        if (c->timer) { c->timer--; break; }
        if (c->use_hold) {
            tt_hold(b);
            c->use_hold = 0;
            c->piece_type = b->type;
            c->piece_no = b->pieces;
        }
        c->state = CS_MOVE;
        c->timer = 0;
        break;
    case CS_MOVE:
        if (c->timer) { c->timer--; break; }
        c->timer = LV[c->level][1];
        if (b->rot != c->trot) {
            d = (c->trot - b->rot) & 3;
            if (!tt_rotate(b, d == 3 ? -1 : 1)) c->state = CS_SETTLE;
            break;
        }
        if (b->x != c->tx) {
            if (!tt_move(b, b->x < c->tx ? 1 : -1)) c->state = CS_SETTLE;
            break;
        }
        c->state = CS_SETTLE;
        c->timer = LV[c->level][2];
        break;
    case CS_SETTLE:
        if (c->timer) { c->timer--; break; }
        c->state = CS_DROP;
        /* fall through */
    case CS_DROP:
        if (LV[c->level][5]) tt_hard_drop(b);
        else b->soft = 1;
        break;
    }
}
