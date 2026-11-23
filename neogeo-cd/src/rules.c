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

static int on_ground(const tt_board *b)
{
    return tt_collides(b, b->type, b->rot, b->x, b->y + 1);
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
    if (!type) {
        type = b->queue[0];
        for (k = 1; k < b->qlen; k++) b->queue[k - 1] = b->queue[k];
        b->qlen--;
        fill_queue(b);
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
    if (tt_collides(b, type, 0, b->x, 0)) { top_out(b); return; }
    /* drop one row at once, so the brick shows straight away */
    if (!tt_collides(b, type, 0, b->x, 1)) b->y = 1;
    b->low_y = b->y;
    b->active = 1;
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
    if (!b->active || tt_collides(b, b->type, b->rot, b->x + dx, b->y)) return 0;
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
        if (!tt_collides(b, b->type, to, nx, ny)) {
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
    while (!tt_collides(b, b->type, b->rot, b->x, y + 1)) y++;
    return y;
}

int tt_hold(tt_board *b)
{
    tt_u8 cur;
    if (!b->active || b->hold_used) return 0;
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

void tt_receive(tt_board *b, tt_u8 rows)
{
    if (!rows || !b->alive) return;
    if (b->g_n == TT_GMAX) {                    /* full: add to the newest batch */
        b->g_rows[TT_GMAX - 1] = (tt_u8)(b->g_rows[TT_GMAX - 1] + rows);
        return;
    }
    b->g_rows[b->g_n] = rows;
    b->g_hole[b->g_n] = (tt_u8)(tt_rand(b) % TT_COLS);
    b->g_wait[b->g_n] = TT_GARBAGE_DELAY;
    b->g_n++;
}

/* your attack cancels waiting garbage first (oldest first) */
static int cancel(tt_board *b, int n)
{
    int k;
    while (n > 0 && b->g_n) {
        if (b->g_rows[0] > n) { b->g_rows[0] = (tt_u8)(b->g_rows[0] - n); return 0; }
        n -= b->g_rows[0];
        for (k = 1; k < b->g_n; k++) {
            b->g_rows[k - 1] = b->g_rows[k]; b->g_hole[k - 1] = b->g_hole[k]; b->g_wait[k - 1] = b->g_wait[k];
        }
        b->g_n--;
    }
    return n;
}

static void apply_garbage(tt_board *b)
{
    int landed = 0, n, k, x, y;
    while (b->g_n && !b->g_wait[0] && landed < TT_GARBAGE_CAP) {
        n = b->g_rows[0];
        if (n > TT_GARBAGE_CAP - landed) n = TT_GARBAGE_CAP - landed;
        /* anything pushed out of the top tops you out */
        for (y = 0; y < n; y++)
            for (x = 0; x < TT_COLS; x++)
                if (b->grid[y][x]) b->alive = 0;
        for (y = 0; y < TT_ROWS - n; y++)
            for (x = 0; x < TT_COLS; x++) b->grid[y][x] = b->grid[y + n][x];
        for (y = TT_ROWS - n; y < TT_ROWS; y++)
            for (x = 0; x < TT_COLS; x++) b->grid[y][x] = (tt_u8)(x == b->g_hole[0] ? 0 : TT_GARBAGE);
        landed += n;
        b->recv = (tt_u16)(b->recv + n);
        b->g_rows[0] = (tt_u8)(b->g_rows[0] - n);
        if (!b->g_rows[0]) {
            for (k = 1; k < b->g_n; k++) {
                b->g_rows[k - 1] = b->g_rows[k]; b->g_hole[k - 1] = b->g_hole[k]; b->g_wait[k - 1] = b->g_wait[k];
            }
            b->g_n--;
        }
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

static void lock(tt_board *b)
{
    int k, x, y, n = 0, spin, hidden = 1, pc = 1, attack = 0, difficult;
    tt_u32 pts, mask = 0;

    spin = spin_kind(b);
    for (k = 0; k < 4; k++) {
        x = b->x + TT_SHAPE[b->type][b->rot][k][0];
        y = b->y + TT_SHAPE[b->type][b->rot][k][1];
        if (y >= 0) { b->grid[y][x] = b->type; b->grid_rows |= 1UL << y; }
        if (y >= TT_HIDDEN) hidden = 0;
        b->lock_cells[k][0] = (tt_u8)x;
        b->lock_cells[k][1] = (tt_u8)(y < 0 ? 0 : y);
    }
    b->active = 0;
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

    if (b->vs && attack) {
        b->last_attack = (tt_u8)attack;
        attack = cancel(b, attack);
        b->out = (tt_u16)(b->out + attack);
        b->sent = (tt_u16)(b->sent + attack);
    }

    if (hidden && !n) { top_out(b); return; }   /* locked entirely above the field */

    if (n) {
        b->lines = (tt_u16)(b->lines + n);
        b->meter = (tt_u8)(b->meter + n > TT_METER_MAX ? TT_METER_MAX : b->meter + n);
        if (b->level_up && b->level < TT_MAX_LEVEL && 1 + b->lines / 10 > b->level) {
            b->level = (tt_u8)(1 + b->lines / 10);
            if (b->level > TT_MAX_LEVEL) b->level = TT_MAX_LEVEL;
            b->gravity = tt_gravity_for(b->level);
            b->ev |= TT_EV_LEVEL;
        }
        if (b->goal && b->lines >= b->goal) { b->done = 1; b->ev |= TT_EV_DONE; }
        b->clear_rows = mask;
        b->clear_t = b->clear_delay;
        if (!b->clear_t) {
            collapse(b);
            if (!b->done) spawn(b, 0);
        }
        return;
    }
    apply_garbage(b);
    if (b->alive) spawn(b, 0);
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

    if (b->clear_t) {
        if (--b->clear_t == 0) { collapse(b); spawn(b, 0); }
        return;
    }
    if (!b->active) return;

    g = b->gravity;
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
