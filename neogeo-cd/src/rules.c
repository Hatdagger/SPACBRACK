/*
 * SPACBRACK (brick race) - the rules of one board.  See rules.h.
 *
 * Strict C89: gcc 2.95, no // comments, declarations at the top of blocks.
 */
#include "rules.h"

/* rotation states made from SPACBRACK's piece table (js/data.js), y down */
const tt_s8 TT_SHAPE[8][4][4][2] = {
    { { {0,0},{0,0},{0,0},{0,0} }, { {0,0},{0,0},{0,0},{0,0} }, { {0,0},{0,0},{0,0},{0,0} }, { {0,0},{0,0},{0,0},{0,0} } },
    { { {0,1},{1,1},{2,1},{3,1} }, { {2,0},{2,1},{2,2},{2,3} }, { {3,2},{2,2},{1,2},{0,2} }, { {1,3},{1,2},{1,1},{1,0} } },   /* I */
    { { {0,0},{0,1},{1,1},{2,1} }, { {2,0},{1,0},{1,1},{1,2} }, { {2,2},{2,1},{1,1},{0,1} }, { {0,2},{1,2},{1,1},{1,0} } },   /* J */
    { { {2,0},{0,1},{1,1},{2,1} }, { {2,2},{1,0},{1,1},{1,2} }, { {0,2},{2,1},{1,1},{0,1} }, { {0,0},{1,2},{1,1},{1,0} } },   /* L */
    { { {0,0},{1,0},{0,1},{1,1} }, { {1,0},{1,1},{0,0},{0,1} }, { {1,1},{0,1},{1,0},{0,0} }, { {0,1},{0,0},{1,1},{1,0} } },   /* O */
    { { {1,0},{2,0},{0,1},{1,1} }, { {2,1},{2,2},{1,0},{1,1} }, { {1,2},{0,2},{2,1},{1,1} }, { {0,1},{0,0},{1,2},{1,1} } },   /* S */
    { { {1,0},{0,1},{1,1},{2,1} }, { {2,1},{1,0},{1,1},{1,2} }, { {1,2},{2,1},{1,1},{0,1} }, { {0,1},{1,2},{1,1},{1,0} } },   /* T */
    { { {0,0},{1,0},{1,1},{2,1} }, { {2,0},{2,1},{1,1},{1,2} }, { {2,2},{1,2},{1,1},{0,1} }, { {0,2},{0,1},{1,1},{1,0} } },   /* Z */
};

/*
 * SRS wall kicks, y down (the usual tables are y up; signs flipped here).
 * Index: from-state * 2 + (0 = clockwise, 1 = counter-clockwise).
 */
static const tt_s8 KICK_JLSTZ[8][5][2] = {
    { {0,0},{-1,0},{-1,-1},{0,2},{-1,2} },   /* 0>1 */
    { {0,0},{1,0},{1,-1},{0,2},{1,2} },      /* 0>3 */
    { {0,0},{1,0},{1,1},{0,-2},{1,-2} },     /* 1>2 */
    { {0,0},{1,0},{1,1},{0,-2},{1,-2} },     /* 1>0 */
    { {0,0},{1,0},{1,-1},{0,2},{1,2} },      /* 2>3 */
    { {0,0},{-1,0},{-1,-1},{0,2},{-1,2} },   /* 2>1 */
    { {0,0},{-1,0},{-1,1},{0,-2},{-1,-2} },  /* 3>0 */
    { {0,0},{-1,0},{-1,1},{0,-2},{-1,-2} },  /* 3>2 */
};
static const tt_s8 KICK_I[8][5][2] = {
    { {0,0},{-2,0},{1,0},{-2,1},{1,-2} },    /* 0>1 */
    { {0,0},{-1,0},{2,0},{-1,-2},{2,1} },    /* 0>3 */
    { {0,0},{-1,0},{2,0},{-1,-2},{2,1} },    /* 1>2 */
    { {0,0},{2,0},{-1,0},{2,-1},{-1,2} },    /* 1>0 */
    { {0,0},{2,0},{-1,0},{2,-1},{-1,2} },    /* 2>3 */
    { {0,0},{1,0},{-2,0},{1,2},{-2,-1} },    /* 2>1 */
    { {0,0},{1,0},{-2,0},{1,2},{-2,-1} },    /* 3>0 */
    { {0,0},{-2,0},{1,0},{-2,1},{1,-2} },    /* 3>2 */
};

/* guideline gravity, (0.8 - (L-1) * 0.007) ^ (L-1) s per row, as rows per frame x 4096 */
static const tt_u16 GRAVITY[TT_MAX_LEVEL + 1] = {
    68, 68, 86, 111, 144, 192, 261, 360, 507, 727, 1064, 1588, 2419, 3761, 5968, 9671
};
#define G_ONE 4096

/* points x level: [spin][lines] */
static const tt_u16 POINTS[3][5] = {
    { 0, 100, 300, 500, 800 },
    { 100, 200, 400, 400, 400 },
    { 400, 800, 1200, 1600, 1600 }
};
static const tt_u16 PC_POINTS[5] = { 0, 800, 1200, 1800, 2000 };
static const tt_u8  ATTACK[5] = { 0, 0, 1, 2, 4 };
static const tt_u8  COMBO_ATTACK[12] = { 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5 };

tt_u16 tt_gravity_for(tt_u8 level)
{
    if (level < 1) level = 1;
    if (level > TT_MAX_LEVEL) level = TT_MAX_LEVEL;
    return GRAVITY[level];
}

tt_u32 tt_rand(tt_board *b)
{
    tt_u32 x = b->rng;
    x ^= (x << 13) & 0xffffffffUL;
    x ^= x >> 17;
    x ^= (x << 5) & 0xffffffffUL;
    b->rng = x & 0xffffffffUL;
    return b->rng;
}

static void fill_queue(tt_board *b)
{
    tt_u8 bag[7];
    int k, j;
    tt_u8 t;
    while (b->qlen <= TT_NEXT) {
        for (k = 0; k < 7; k++) bag[k] = (tt_u8)(k + 1);
        for (k = 6; k > 0; k--) {
            j = (int)(tt_rand(b) % (tt_u32)(k + 1));
            t = bag[k]; bag[k] = bag[j]; bag[j] = t;
        }
        for (k = 0; k < 7; k++) b->queue[b->qlen++] = bag[k];
    }
}

int tt_collides(const tt_board *b, int type, int rot, int x, int y)
{
    int k, cx, cy;
    for (k = 0; k < 4; k++) {
        cx = x + TT_SHAPE[type][rot][k][0];
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cx < 0 || cx >= TT_COLS || cy >= TT_ROWS) return 1;
        if (cy >= 0 && b->grid[cy][cx]) return 1;
    }
    return 0;
}

/* what stops the falling brick: a hologram passes through bricks, so only
   the walls and the floor stop it */
static int hits(const tt_board *b, int type, int rot, int x, int y)
{
    int k, cx, cy;
    if (!b->holo) return tt_collides(b, type, rot, x, y);
    for (k = 0; k < 4; k++) {
        cx = x + TT_SHAPE[type][rot][k][0];
        cy = y + TT_SHAPE[type][rot][k][1];
        if (cx < 0 || cx >= TT_COLS || cy >= TT_ROWS) return 1;
    }
    return 0;
}

static int on_ground(const tt_board *b)
{
    return hits(b, b->type, b->rot, b->x, b->y + 1);
}

static void top_out(tt_board *b)
{
    b->alive = 0;
    b->active = 0;
    b->ev |= TT_EV_TOPOUT;
}

/* put a brick in play: type 0 = the next one from the queue */
static void spawn(tt_board *b, tt_u8 type)
{
    int k;
    b->holo = 0;
    if (!type) {
        type = b->queue[0];
        for (k = 1; k < b->qlen; k++) b->queue[k - 1] = b->queue[k];
        b->qlen--;
        fill_queue(b);
        /* Phantom Reel: an earned hologram comes in as the next brick from the queue */
        if (tt_holo_ready(b) > 0) {
            b->holo = 1;
            b->holo_used++;
            b->ev |= TT_EV_HOLO;
        }
    }
    b->type = type;
    b->rot = 0;
    b->x = (tt_s8)(type == TT_O ? 4 : 3);
    b->y = 0;
    b->gacc = 0;
    b->lock_t = 0;
    b->resets = 0;
    b->last_rot = 0;
    b->last_kick = 0;
    if (hits(b, type, 0, b->x, 0)) { top_out(b); return; }
    /* drop one row at once, so the brick shows straight away */
    if (!hits(b, type, 0, b->x, 1)) b->y = 1;
    b->low_y = b->y;
    b->active = 1;
}

static void fold_land(tt_board *b);

/* a brick was placed (and its lines cleared): folded garbage lands first, then the next brick */
static void next_brick(tt_board *b)
{
    if (b->fi_n) { fold_land(b); return; }
    spawn(b, 0);
}

void tt_init(tt_board *b, tt_u32 seed, tt_u8 level, tt_u16 goal, tt_u8 level_up, tt_u8 vs)
{
    tt_u8 *p = (tt_u8 *)b;
    unsigned k;
    for (k = 0; k < sizeof *b; k++) p[k] = 0;
    b->rng = seed ? seed : 0x2545F491UL;
    tt_rand(b); tt_rand(b);
    b->level = (tt_u8)(level < 1 ? 1 : level);
    b->gravity = tt_gravity_for(b->level);
    b->goal = goal;
    b->level_up = level_up;
    b->vs = vs;
    b->combo = -1;
    b->clear_delay = 8;
    b->alive = 1;
    fill_queue(b);
    spawn(b, 0);
}

/* a move or rotation that worked while on the floor restarts the lock delay */
static void moved(tt_board *b)
{
    if (on_ground(b) && b->resets < TT_MAX_RESETS) {
        b->lock_t = 0;
        b->resets++;
    }
}

int tt_move(tt_board *b, int dx)
{
    if (!b->active || hits(b, b->type, b->rot, b->x + dx, b->y)) return 0;
    b->x = (tt_s8)(b->x + dx);
    b->last_rot = 0;
    b->ev |= TT_EV_MOVE;
    moved(b);
    return 1;
}

int tt_rotate(tt_board *b, int dir)
{
    int to, k, nx, ny, idx;
    const tt_s8 (*kicks)[5][2];
    if (!b->active || b->type == TT_O) return 0;
    to = (b->rot + (dir > 0 ? 1 : 3)) & 3;
    idx = b->rot * 2 + (dir > 0 ? 0 : 1);
    kicks = b->type == TT_I ? KICK_I : KICK_JLSTZ;
    for (k = 0; k < 5; k++) {
        nx = b->x + kicks[idx][k][0];
        ny = b->y + kicks[idx][k][1];
        if (!hits(b, b->type, to, nx, ny)) {
            b->x = (tt_s8)nx;
            b->y = (tt_s8)ny;
            b->rot = (tt_u8)to;
            b->last_rot = 1;
            b->last_kick = (tt_u8)k;
            b->ev |= TT_EV_ROTATE | (k ? TT_EV_KICK : 0);
            if (b->y > b->low_y) { b->low_y = b->y; b->resets = 0; }
            moved(b);
            return 1;
        }
    }
    return 0;
}

int tt_ghost_y(const tt_board *b)
{
    int y = b->y;
    while (!hits(b, b->type, b->rot, b->x, y + 1)) y++;
    return y;
}

int tt_hold(tt_board *b)
{
    tt_u8 cur;
    if (!b->active || b->hold_used || b->holo) return 0;   /* a hologram can't be held */
    cur = b->type;
    b->hold_used = 1;
    b->ev |= TT_EV_HOLD;
    if (b->hold) { tt_u8 h = b->hold; b->hold = cur; spawn(b, h); }
    else { b->hold = cur; spawn(b, 0); }
    return 1;
}

int tt_pending(const tt_board *b)
{
    int k, n = 0;
    for (k = 0; k < b->g_n; k++) n += b->g_rows[k];
    return n;
}

int tt_pending_ready(const tt_board *b)
{
    int k, n = 0;
    for (k = 0; k < b->g_n; k++) if (!b->g_wait[k]) n += b->g_rows[k];
    return n;
}

void tt_receive_pat(tt_board *b, tt_u8 rows, tt_u8 pat)
{
    if (!rows || !b->alive) return;
    if (b->g_n == TT_GMAX) {                    /* full: add to the newest batch */
        b->g_rows[TT_GMAX - 1] = (tt_u8)(b->g_rows[TT_GMAX - 1] + rows);
        return;
    }
    b->g_rows[b->g_n] = rows;
    b->g_hole[b->g_n] = (tt_u8)(tt_rand(b) % TT_COLS);
    b->g_wait[b->g_n] = TT_GARBAGE_DELAY;
    b->g_pat[b->g_n] = pat;
    b->g_done[b->g_n] = 0;
    b->g_n++;
}

void tt_receive(tt_board *b, tt_u8 rows) { tt_receive_pat(b, rows, TT_PAT_STD); }

/* the oldest batch is gone: move the rest up */
static void drop_batch(tt_board *b)
{
    int k;
    for (k = 1; k < b->g_n; k++) {
        b->g_rows[k - 1] = b->g_rows[k]; b->g_hole[k - 1] = b->g_hole[k]; b->g_wait[k - 1] = b->g_wait[k];
        b->g_pat[k - 1] = b->g_pat[k]; b->g_done[k - 1] = b->g_done[k];
    }
    b->g_n--;
}

int tt_take_pending(tt_board *b, tt_u8 *rows, tt_u8 *pat)
{
    if (!b->g_n) return 0;
    *rows = b->g_rows[0];
    *pat = b->g_pat[0];
    drop_batch(b);
    return 1;
}

/* your attack cancels waiting garbage first (oldest first) */
static int cancel(tt_board *b, int n)
{
    while (n > 0 && b->g_n) {
        if (b->g_rows[0] > n) { b->g_rows[0] = (tt_u8)(b->g_rows[0] - n); return 0; }
        n -= b->g_rows[0];
        drop_batch(b);
    }
    return n;
}

/* fold chunks: cancel from the oldest; add one (a full list adds to the newest) */
static int cancel_chunks(tt_chunk *c, tt_u8 *n, int k)
{
    int j;
    while (k > 0 && *n) {
        if (c[0].rows > k) { c[0].rows = (tt_u8)(c[0].rows - k); return 0; }
        k -= c[0].rows;
        for (j = 1; j < *n; j++) c[j - 1] = c[j];
        (*n)--;
    }
    return k;
}

static void push_chunk(tt_chunk *c, tt_u8 *n, const tt_chunk *add)
{
    int r;
    if (*n == TT_FMAX) {
        r = c[TT_FMAX - 1].rows + add->rows;
        c[TT_FMAX - 1].rows = (tt_u8)(r > 255 ? 255 : r);
        return;
    }
    c[(*n)++] = *add;
}

/* the hole of row i of a batch (i counts from the batch's first row) */
static int hole_at(int pat, int gap, int i)
{
    int h;
    switch (pat) {
    case TT_PAT_RIBS:   return (i & 1) ? (gap + 5) % TT_COLS : gap;
    case TT_PAT_CLAW:   return (gap + i) % TT_COLS;
    case TT_PAT_STAIRS: h = gap % 5 + i; return h > TT_COLS - 1 ? TT_COLS - 1 : h;
    default:            return gap;
    }
}

static void apply_garbage(tt_board *b)
{
    int landed = 0, n, x, y, h, y0;
    while (b->g_n && !b->g_wait[0] && landed < TT_GARBAGE_CAP) {
        n = b->g_rows[0];
        if (n > TT_GARBAGE_CAP - landed) n = TT_GARBAGE_CAP - landed;
        /* anything pushed out of the top tops you out */
        for (y = 0; y < n; y++)
            for (x = 0; x < TT_COLS; x++)
                if (b->grid[y][x]) b->alive = 0;
        for (y = 0; y < TT_ROWS - n; y++)
            for (x = 0; x < TT_COLS; x++) b->grid[y][x] = b->grid[y + n][x];
        /* the batch's rows come in from the bottom: its first row ends up on top */
        y0 = TT_ROWS - n;
        for (y = y0; y < TT_ROWS; y++) {
            h = hole_at(b->g_pat[0], b->g_hole[0], b->g_done[0] + y - y0);
            for (x = 0; x < TT_COLS; x++) b->grid[y][x] = (tt_u8)(x == h ? 0 : TT_GARBAGE);
        }
        landed += n;
        b->recv = (tt_u16)(b->recv + n);
        b->g_rows[0] = (tt_u8)(b->g_rows[0] - n);
        b->g_done[0] = (tt_u8)(b->g_done[0] + n);
        if (!b->g_rows[0]) drop_batch(b);
    }
    if (landed) { b->ev |= TT_EV_GARBAGE; b->grid_rows = 0xffffffffUL; }
    if (!b->alive) top_out(b);
}

static int occupied(const tt_board *b, int x, int y)
{
    if (x < 0 || x >= TT_COLS || y >= TT_ROWS) return 1;
    if (y < 0) return 0;
    return b->grid[y][x] != 0;
}

/* 3-corner T-spin check, before the brick is written into the grid */
static int spin_kind(const tt_board *b)
{
    static const tt_s8 CORNER[4][2] = { {0,0}, {2,0}, {2,2}, {0,2} };   /* clockwise from top-left */
    int c[4], k, n = 0, front;
    if (b->type != TT_T || !b->last_rot) return TT_SPIN_NONE;
    for (k = 0; k < 4; k++) {
        c[k] = occupied(b, b->x + CORNER[k][0], b->y + CORNER[k][1]);
        n += c[k];
    }
    if (n < 3) return TT_SPIN_NONE;
    /* the two corners on the side the T points to: rot 0 up, 1 right, 2 down, 3 left */
    front = c[b->rot] + c[(b->rot + 1) & 3];
    if (front == 2 || b->last_kick == 4) return TT_SPIN_FULL;
    return TT_SPIN_MINI;
}

static void collapse(tt_board *b)
{
    int y, to = TT_ROWS - 1, x;
    for (y = TT_ROWS - 1; y >= 0; y--) {
        if (b->clear_rows & (1UL << y)) continue;
        if (to != y) for (x = 0; x < TT_COLS; x++) b->grid[to][x] = b->grid[y][x];
        to--;
    }
    for (; to >= 0; to--) for (x = 0; x < TT_COLS; x++) b->grid[to][x] = 0;
    b->clear_rows = 0;
    b->grid_rows = 0xffffffffUL;
}

/* attack: cancel this board's waiting garbage, then what is folding in to it; the rest goes out */
static void attack_out(tt_board *b, int attack)
{
    if (!b->vs || !attack) return;
    b->last_attack = (tt_u8)attack;
    attack = cancel(b, attack);
    attack = cancel_chunks(b->fi, &b->fi_n, attack);
    b->out = (tt_u16)(b->out + attack);
    b->sent = (tt_u16)(b->sent + attack);
}

/* lines cleared (mask: their rows): lines, meter, level, goal, the fold count, the attack */
static void count_lines(tt_board *b, int n, tt_u32 mask, int attack)
{
    int y, ymax = 0;
    tt_u16 prev = b->lines;
    for (y = 0; y < TT_ROWS; y++) if (mask & (1UL << y)) ymax = y;
    b->out_h = (tt_u8)(TT_ROWS - 1 - ymax);
    attack_out(b, attack);
    b->lines = (tt_u16)(b->lines + n);
    b->meter = (tt_u8)(b->meter + n > TT_METER_MAX ? TT_METER_MAX : b->meter + n);
    if (b->level_up && b->level < TT_MAX_LEVEL && 1 + b->lines / 10 > b->level) {
        b->level = (tt_u8)(1 + b->lines / 10);
        if (b->level > TT_MAX_LEVEL) b->level = TT_MAX_LEVEL;
        b->gravity = tt_gravity_for(b->level);
        b->ev |= TT_EV_LEVEL;
    }
    if (b->goal && b->lines >= b->goal) { b->done = 1; b->ev |= TT_EV_DONE; }
    /* Origami Crane: an 8-line mark passed (counted from fold_from) */
    if (b->fold_on && prev >= b->fold_from &&
        (prev - b->fold_from) / TT_FOLD_EVERY < (b->lines - b->fold_from) / TT_FOLD_EVERY)
        b->fold_due = 1;
}

/* full rows flash, then go (or go now with no flash) */
static void clear_rows(tt_board *b, tt_u32 mask)
{
    b->clear_rows = mask;
    b->clear_t = b->clear_delay;
    if (!b->clear_t) {
        collapse(b);
        if (!b->done) next_brick(b);
    }
}

static void lock(tt_board *b)
{
    int k, x, y, n = 0, spin, hidden = 1, pc = 1, attack = 0, difficult;
    tt_u32 pts, mask = 0;

    spin = b->holo ? TT_SPIN_NONE : spin_kind(b);
    if (b->holo && !(b->ev & TT_EV_FREEZE)) b->ev |= TT_EV_HOLOSET;
    for (k = 0; k < 4; k++) {
        x = b->x + TT_SHAPE[b->type][b->rot][k][0];
        y = b->y + TT_SHAPE[b->type][b->rot][k][1];
        /* a hologram only fills the empty cells it covers: bricks already there stay */
        if (y >= 0 && !(b->holo && b->grid[y][x])) { b->grid[y][x] = b->type; b->grid_rows |= 1UL << y; }
        if (y >= TT_HIDDEN) hidden = 0;
        b->lock_cells[k][0] = (tt_u8)x;
        b->lock_cells[k][1] = (tt_u8)(y < 0 ? 0 : y);
    }
    b->active = 0;
    b->holo = 0;
    b->pieces++;
    b->hold_used = 0;
    b->ev |= TT_EV_LOCK;

    for (y = 0; y < TT_ROWS; y++) {
        for (x = 0; x < TT_COLS && b->grid[y][x]; x++) ;
        if (x == TT_COLS) { mask |= 1UL << y; n++; }
        else if (pc) for (x = 0; x < TT_COLS; x++) if (b->grid[y][x]) { pc = 0; break; }
    }
    if (!n) pc = 0;
    if (n > 4) n = 4;

    b->last_lines = (tt_u8)n;
    b->last_spin = (tt_u8)spin;
    b->last_b2b = 0;
    b->last_pc = (tt_u8)pc;
    b->last_attack = 0;
    if (spin) b->ev |= TT_EV_SPIN;

    pts = POINTS[spin][n];
    if (n) {
        difficult = n == 4 || spin;
        if (difficult) {
            if (b->b2b) { pts = pts * 3 / 2; b->last_b2b = 1; }
            b->b2b = 1;
        } else b->b2b = 0;
        b->combo++;
        if (b->combo > 0) pts += 50UL * (tt_u32)b->combo;
        if (pc) pts += PC_POINTS[n];

        attack = spin == TT_SPIN_FULL ? n * 2 : spin == TT_SPIN_MINI ? (n == 2 ? 1 : 0) : ATTACK[n];
        if (b->last_b2b) attack++;
        attack += COMBO_ATTACK[b->combo > 11 ? 11 : b->combo];
        if (pc) attack += 10;
        b->ev |= TT_EV_CLEAR;
    } else b->combo = -1;
    b->last_combo = b->combo;
    b->score += pts * b->level;

    if (hidden && !n) { top_out(b); return; }   /* locked entirely above the field */

    if (n) {
        count_lines(b, n, mask, attack);
        clear_rows(b, mask);
        return;
    }
    attack_out(b, attack);
    apply_garbage(b);
    if (b->alive) next_brick(b);
}

void tt_hard_drop(tt_board *b)
{
    int gy;
    if (!b->active) return;
    gy = tt_ghost_y(b);
    b->hd_type = b->type; b->hd_rot = b->rot;
    b->hd_x = b->x; b->hd_y0 = b->y; b->hd_y1 = (tt_s8)gy;
    if (gy > b->y) b->last_rot = 0;
    b->score += 2UL * (tt_u32)(gy - b->y);
    b->y = (tt_s8)gy;
    b->ev |= TT_EV_HARD;
    lock(b);
}

int tt_can_spend(const tt_board *b, int cost)
{
    return b->alive && !b->cool && b->meter >= cost;
}

int tt_spend(tt_board *b, int cost)
{
    if (!tt_can_spend(b, cost)) return 0;
    b->meter = (tt_u8)(b->meter - cost);
    b->cool = TT_CARD_COOL;
    return 1;
}

static void fold_done(tt_board *b);

void tt_tick(tt_board *b)
{
    tt_u32 g;
    int k;
    if (!b->alive || b->done) {
        if (b->clear_t && --b->clear_t == 0) collapse(b);   /* let the last clear finish */
        return;
    }
    for (k = 0; k < b->g_n; k++) if (b->g_wait[k]) b->g_wait[k]--;
    if (b->cool) b->cool--;
    for (k = 0; k < TT_FX_N; k++) if (b->fx[k]) b->fx[k]--;
    /* Gold Ledger: interest */
    if (b->bank && b->bank < TT_BANK_CAP) {
        if (++b->interest_t >= TT_INTEREST) { b->interest_t = 0; b->bank++; b->ev |= TT_EV_INTEREST; }
    } else b->interest_t = 0;

    if (b->fold_t) {
        if (--b->fold_t == 0) fold_done(b);
        return;
    }
    if (b->clear_t) {
        if (--b->clear_t == 0) { collapse(b); if (!b->done) next_brick(b); }
        return;
    }
    if (!b->active) return;

    /* Shiver: the brick slips a column every second */
    if (b->fx[TT_FX_SHIVER] && ++b->shiver_t >= 60) { b->shiver_t = 0; tt_rattle(b); }

    g = b->gravity;
    if (b->fx[TT_FX_HOWL]) g *= 3;
    if (b->soft) {
        if (b->sonic) g = (tt_u32)G_ONE * TT_ROWS;
        else {
            g *= 20;
            if (g < G_ONE / 2) g = G_ONE / 2;      /* soft drop: at least 30 rows a second */
        }
    }
    if (g > (tt_u32)G_ONE * TT_ROWS) g = (tt_u32)G_ONE * TT_ROWS;
    g += b->gacc;
    while (g >= G_ONE) {
        g -= G_ONE;
        if (on_ground(b)) { g = 0; break; }
        b->y++;
        b->last_rot = 0;
        if (b->soft) b->score++;
        if (b->y > b->low_y) { b->low_y = b->y; b->resets = 0; }
    }
    b->gacc = (tt_u16)g;

    if (on_ground(b)) {
        if (!b->lock_t) b->ev |= TT_EV_LAND;
        b->lock_t++;
        if (b->lock_t >= TT_LOCK_FRAMES || b->resets >= TT_MAX_RESETS) lock(b);
    } else b->lock_t = 0;
}

/* ======================================================================
 * card effects
 * ==================================================================== */

/* an effect changes the field: a line clear still flashing finishes first */
static void settle(tt_board *b)
{
    if (!b->clear_t) return;
    b->clear_t = 0;
    collapse(b);
    if (b->alive && !b->done) next_brick(b);
}

/* bricks moved under the falling one: lift it clear (or it is bricked up) */
static void nudge(tt_board *b)
{
    int t = 0;
    if (!b->active) return;
    while (t < 4 && hits(b, b->type, b->rot, b->x, b->y)) { b->y--; t++; }
    if (hits(b, b->type, b->rot, b->x, b->y)) top_out(b);
}

/* full rows go without counting */
static void silent_clear(tt_board *b)
{
    int y, x, to = TT_ROWS - 1;
    for (y = TT_ROWS - 1; y >= 0; y--) {
        for (x = 0; x < TT_COLS && b->grid[y][x]; x++) ;
        if (x == TT_COLS) continue;
        if (to != y) for (x = 0; x < TT_COLS; x++) b->grid[to][x] = b->grid[y][x];
        to--;
    }
    for (; to >= 0; to--) for (x = 0; x < TT_COLS; x++) b->grid[to][x] = 0;
}

static int col_top(const tt_board *b, int x)
{
    int y;
    for (y = 0; y < TT_ROWS && !b->grid[y][x]; y++) ;
    return y;
}

void tt_fx_on(tt_board *b, int fx, tt_u16 frames)
{
    if (fx < 0 || fx >= TT_FX_N || !b->alive) return;
    b->fx[fx] = frames;
    if (fx == TT_FX_SHIVER) b->shiver_t = 0;
}

void tt_boulder(tt_board *b)
{
    int x, top, t2, y0, dx, dy;
    if (!b->alive) return;
    settle(b);
    x = (int)(tt_rand(b) % (TT_COLS - 1));
    top = col_top(b, x);
    t2 = col_top(b, x + 1);
    if (t2 < top) top = t2;
    y0 = top - 2;
    for (dy = 0; dy < 2; dy++)
        for (dx = 0; dx < 2; dx++)
            if (y0 + dy >= 0) b->grid[y0 + dy][x + dx] = TT_ROCK;
    b->grid_rows = 0xffffffffUL;
    if (y0 < 0) { top_out(b); return; }
    nudge(b);
}

void tt_eye_beam(tt_board *b, int x)
{
    int y;
    if (!b->alive) return;
    if (x < 0) x = 0;
    if (x > TT_COLS - 2) x = TT_COLS - 2;
    settle(b);
    for (y = 0; y < TT_ROWS; y++) b->grid[y][x] = b->grid[y][x + 1] = 0;
    b->grid_rows = 0xffffffffUL;
}

int tt_best_beam(const tt_board *b)
{
    int x, y, n, best = 0, bn = -1;
    for (x = 0; x <= TT_COLS - 2; x++) {
        n = 0;
        for (y = 0; y < TT_ROWS; y++) n += (b->grid[y][x] != 0) + (b->grid[y][x + 1] != 0);
        if (n > bn) { bn = n; best = x; }
    }
    return best;
}

int tt_beam_start(const tt_board *b)
{
    int k, x, mx = TT_COLS;
    if (!b->active) return TT_COLS / 2 - 1;
    for (k = 0; k < 4; k++) { x = b->x + TT_SHAPE[b->type][b->rot][k][0]; if (x < mx) mx = x; }
    return mx > TT_COLS - 2 ? TT_COLS - 2 : mx < 0 ? 0 : mx;
}

void tt_collapse(tt_board *b)
{
    int x, y, to;
    if (!b->alive) return;
    settle(b);
    for (x = 0; x < TT_COLS; x++) {
        to = TT_ROWS - 1;
        for (y = TT_ROWS - 1; y >= 0; y--)
            if (b->grid[y][x]) { b->grid[to][x] = b->grid[y][x]; if (to != y) b->grid[y][x] = 0; to--; }
    }
    silent_clear(b);
    b->grid_rows = 0xffffffffUL;
    nudge(b);
}

void tt_pound(tt_board *b, int n)
{
    int x, y;
    if (!b->alive || n <= 0) return;
    settle(b);
    if (n > TT_ROWS) n = TT_ROWS;
    for (y = TT_ROWS - 1; y >= 0; y--)
        for (x = 0; x < TT_COLS; x++) b->grid[y][x] = (tt_u8)(y >= n ? b->grid[y - n][x] : 0);
    b->grid_rows = 0xffffffffUL;
}

void tt_rattle(tt_board *b)
{
    int d = (tt_rand(b) & 1) ? 1 : -1;
    if (!b->active) return;
    if (!tt_move(b, d)) tt_move(b, -d);
}

void tt_full_moon(tt_board *b)
{
    b->queue[0] = b->queue[1] = b->queue[2] = TT_I;
}

/* ======================================================================
 * Phantom Reel: holograms
 * ==================================================================== */

int tt_holo_ready(const tt_board *b)
{
    int n;
    if (!b->holo_on || b->lines < b->holo_from) return 0;
    n = (b->lines - b->holo_from) / TT_HOLO_LINES;
    if (n > TT_HOLO_MAX) n = TT_HOLO_MAX;
    n -= b->holo_used;
    return n > 0 ? n : 0;
}

int tt_holo_fills(const tt_board *b)
{
    int k, x, y, n = 0;
    if (!b->active || !b->holo) return 0;
    for (k = 0; k < 4; k++) {
        x = b->x + TT_SHAPE[b->type][b->rot][k][0];
        y = b->y + TT_SHAPE[b->type][b->rot][k][1];
        if (y >= 0 && !b->grid[y][x]) n++;
    }
    return n;
}

int tt_holo_freeze(tt_board *b)
{
    if (!b->active || !b->holo) return 0;
    b->ev |= TT_EV_FREEZE;
    lock(b);
    return 1;
}

void tt_holo_restart(tt_board *b)
{
    b->holo_from = b->lines;
    b->holo_used = 0;
}

/* ======================================================================
 * Origami Crane: fold garbage
 * ==================================================================== */

int tt_stack_height(const tt_board *b)
{
    int x, y;
    for (y = 0; y < TT_ROWS; y++)
        for (x = 0; x < TT_COLS; x++)
            if (b->grid[y][x]) return TT_ROWS - y;
    return 0;
}

/* the folded chunks land: inside the stack they overwrite those rows (solid cells only), above it they sit on it */
static void fold_land(tt_board *b)
{
    int k, i, x, y, base, top, hole;
    tt_u32 mask = 0;
    tt_chunk *c;
    b->fold_n = 0;
    for (k = 0; k < b->fi_n && b->alive; k++) {
        c = &b->fi[k];
        top = tt_stack_height(b);
        base = c->h < top ? c->h : top;
        for (i = 0; i < c->rows; i++) {
            y = TT_ROWS - 1 - (base + i);
            if (y < 0) { b->alive = 0; break; }
            hole = hole_at(c->pat, c->hole, i);
            for (x = 0; x < TT_COLS; x++) if (x != hole) b->grid[y][x] = TT_GARBAGE;
            mask |= 1UL << y;
            b->fold_n++;
        }
    }
    b->fi_n = 0;
    b->recv = (tt_u16)(b->recv + b->fold_n);
    b->fold_rows = mask;
    b->grid_rows |= mask;
    b->ev |= TT_EV_FOLDIN;
    b->active = 0;
    if (!b->alive) { top_out(b); return; }
    b->fold_t = TT_FOLD_FRAMES;
}

/* the fold has played: lines it completed clear normally (they count and attack), then the next brick */
static void fold_done(tt_board *b)
{
    int x, y, n = 0;
    tt_u32 mask = 0;
    b->grid_rows |= b->fold_rows;
    b->fold_rows = 0;
    for (y = 0; y < TT_ROWS; y++) {
        for (x = 0; x < TT_COLS && b->grid[y][x]; x++) ;
        if (x == TT_COLS) { mask |= 1UL << y; n++; }
    }
    if (!n) { next_brick(b); return; }
    if (n > 4) n = 4;
    b->last_lines = (tt_u8)n;
    b->last_spin = 0;
    b->last_b2b = 0;
    b->last_pc = 0;
    b->last_combo = -1;
    b->last_attack = 0;
    b->score += (tt_u32)POINTS[0][n] * b->level;
    b->ev |= TT_EV_CLEAR | TT_EV_FOLDCLR;
    count_lines(b, n, mask, ATTACK[n]);
    clear_rows(b, mask);
}

int tt_attack_route(tt_board *from, tt_board *to, int rows, tt_u8 pat)
{
    tt_chunk c;
    int eat;
    rows = cancel_chunks(to->fh, &to->fh_n, rows);
    /* Gold Ledger: it eats into the other board's bank */
    if (rows > 0 && to->bank) {
        eat = rows < to->bank ? rows : to->bank;
        to->bank = (tt_u8)(to->bank - eat);
        rows -= eat;
        if (!to->bank) to->interest_t = 0;
    }
    if (rows > 0 && from->bank_on && !from->fold_on) {
        if (!from->bank) from->interest_t = 0;
        from->bank = (tt_u8)(from->bank + rows > TT_BANK_CAP ? TT_BANK_CAP : from->bank + rows);
        return 0;
    }
    if (!from->fold_on || rows <= 0) return rows;
    c.rows = (tt_u8)(rows > 255 ? 255 : rows);
    c.h = from->out_h;
    c.hole = (tt_u8)(tt_rand(from) % TT_COLS);
    c.pat = pat;
    push_chunk(from->fh, &from->fh_n, &c);
    return 0;
}

int tt_fold_send(tt_board *from, tt_board *to)
{
    int k, n = 0;
    for (k = 0; k < from->fh_n; k++) {
        n += from->fh[k].rows;
        if (to->alive) push_chunk(to->fi, &to->fi_n, &from->fh[k]);
    }
    from->fh_n = 0;
    return n;
}

int tt_fold_held(const tt_board *b)
{
    int k, n = 0;
    for (k = 0; k < b->fh_n; k++) n += b->fh[k].rows;
    return n;
}

int tt_fold_queued(const tt_board *b)
{
    int k, n = 0;
    for (k = 0; k < b->fi_n; k++) n += b->fi[k].rows;
    return n;
}

int tt_fold_in_lines(const tt_board *b)
{
    if (b->lines < b->fold_from) return TT_FOLD_EVERY;
    return TT_FOLD_EVERY - (b->lines - b->fold_from) % TT_FOLD_EVERY;
}

int tt_fold_charges(const tt_board *b)
{
    int n;
    if (b->lines < b->fold_from) return 0;
    n = (b->lines - b->fold_from) / TT_FOLD_EARLY - b->early_used;
    return n > 0 ? n : 0;
}

int tt_fold_early_block(const tt_board *b, const tt_board *to)
{
    if (!b->fold_on || !b->alive) return TT_FOLD_OFF;
    if (tt_fold_charges(b) <= 0)
        return b->lines < b->fold_from + TT_FOLD_EARLY ? TT_FOLD_AT10 : TT_FOLD_NOCHARGE;
    if (!b->fh_n) return TT_FOLD_NOTHING;
    if (to->fi_n) return TT_FOLD_QUEUED;
    return TT_FOLD_OK;
}

int tt_fold_early(tt_board *b, tt_board *to)
{
    int why = tt_fold_early_block(b, to);
    if (why != TT_FOLD_OK) return why;
    b->early_used++;               /* the 8-line count is NOT reset */
    tt_fold_send(b, to);
    return TT_FOLD_OK;
}

void tt_fold_restart(tt_board *b)
{
    b->fold_from = b->lines;
    b->early_used = 0;
}

/* ======================================================================
 * Gold Ledger: interest
 * ==================================================================== */

int tt_withdraw(tt_board *b)
{
    int n = b->bank;
    if (!b->bank_on || !b->alive) return 0;
    b->bank = 0;
    b->interest_t = 0;
    return n;
}
