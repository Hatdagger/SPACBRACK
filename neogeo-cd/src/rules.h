/*
 * SPACBRACK (brick race) - the rules of one board, Neo Geo CD.
 *
 * Plain C89 with no floats and no hardware access, so the PC tests
 * (test/sim.c) run the exact same code as the disc.  Everything is counted
 * in frames (60 per second).
 *
 * Modern rules: 7-bag, 5 next bricks, hold, ghost, hard drop, SRS rotation
 * with wall kicks, lock delay with 15 move resets, T-spins (3-corner rule,
 * minis), back-to-back, combos, all clears, and versus garbage with a short
 * warning delay before it lands.
 */
#ifndef TT_RULES_H
#define TT_RULES_H

typedef unsigned char  tt_u8;
typedef signed char    tt_s8;
typedef unsigned short tt_u16;
typedef short          tt_s16;
typedef unsigned long  tt_u32;

#define TT_COLS    10
#define TT_ROWS    22          /* rows 0 and 1 are hidden above the field */
#define TT_HIDDEN  2
#define TT_NEXT    5           /* next bricks shown */
#define TT_QMAX    16
#define TT_GMAX    8           /* garbage batches waiting */

/* cell values (0 = empty) */
enum { TT_I = 1, TT_J, TT_L, TT_O, TT_S, TT_T, TT_Z, TT_GARBAGE };

#define TT_LOCK_FRAMES   30    /* 0.5 s on the floor before a brick locks */
#define TT_MAX_RESETS    15    /* moves/rotations that restart the lock delay */
#define TT_GARBAGE_DELAY 60    /* incoming garbage waits 1 s before it can land */
#define TT_GARBAGE_CAP   8     /* most rows that land on one placement */
#define TT_MAX_LEVEL     15

/* events of the last frame, for sound and callouts (bit flags) */
#define TT_EV_MOVE     0x0001
#define TT_EV_ROTATE   0x0002
#define TT_EV_KICK     0x0004
#define TT_EV_LOCK     0x0008
#define TT_EV_HARD     0x0010
#define TT_EV_HOLD     0x0020
#define TT_EV_CLEAR    0x0040  /* lines cleared: see last_* below */
#define TT_EV_SPIN     0x0080  /* a T-spin (with or without lines) */
#define TT_EV_LEVEL    0x0100
#define TT_EV_GARBAGE  0x0200  /* garbage rose into the field */
#define TT_EV_TOPOUT   0x0400
#define TT_EV_DONE     0x0800  /* goal reached (150 / 40 lines) */
#define TT_EV_LAND     0x1000  /* a falling brick touched down */

enum { TT_SPIN_NONE, TT_SPIN_MINI, TT_SPIN_FULL };

typedef struct {
    tt_u8  grid[TT_ROWS][TT_COLS];

    /* the falling brick */
    tt_u8  type, rot;
    tt_s8  x, y;
    tt_u8  active;             /* 0 while lines clear or after the game ends */

    tt_u8  queue[TT_QMAX];
    tt_u8  qlen;
    tt_u8  hold, hold_used;
    tt_u32 rng;

    /* timing */
    tt_u16 gravity;            /* rows per frame x 256 */
    tt_u16 gacc;
    tt_u8  soft;               /* soft drop held (set by the front end) */
    tt_u8  sonic;              /* soft drop goes straight down (option) */
    tt_u8  lock_t, resets;
    tt_s8  low_y;              /* lowest row reached: resets refill below it */
    tt_u8  clear_delay;        /* frames the cleared rows flash */
    tt_u8  clear_t;
    tt_u32 clear_rows;         /* bit y: row y is being cleared */

    /* game */
    tt_u8  alive, done;
    tt_u16 goal;               /* lines to finish (0 = no goal) */
    tt_u8  level, level_up;    /* level_up: marathon levels rise every 10 lines */
    tt_u16 lines;
    tt_u32 score;
    tt_s16 combo;              /* -1 = no combo going */
    tt_u8  b2b;                /* the last clear was a difficult one */
    tt_u16 pieces;

    /* how the brick was last moved (T-spin check) */
    tt_u8  last_rot, last_kick;

    /* versus garbage */
    tt_u8  g_rows[TT_GMAX], g_hole[TT_GMAX], g_wait[TT_GMAX];
    tt_u8  g_n;
    tt_u16 out;                /* rows to send to the opponent (front end takes them) */
    tt_u16 sent, recv;         /* totals, for the result screen */
    tt_u8  vs;                 /* versus: attack counts */

    /* last frame's events */
    tt_u16 ev;
    tt_u8  last_lines, last_spin, last_b2b, last_pc, last_attack;
    tt_s16 last_combo;
    tt_u8  hd_type, hd_rot;    /* hard drop trail: from hd_y0 down to hd_y1 */
    tt_s8  hd_x, hd_y0, hd_y1;
    tt_u8  lock_cells[4][2];   /* where the last brick locked (x, y) */
    tt_u32 grid_rows;          /* bit y: grid row y changed (the front end redraws it, then clears this) */
} tt_board;

/* shape cell k (0..3) of a brick in a rotation state */
extern const tt_s8 TT_SHAPE[8][4][4][2];

/* gravity for a level, rows per frame x 256 */
tt_u16 tt_gravity_for(tt_u8 level);

/* level: starting level; goal: lines (0 none); level_up: 1 for marathon */
void tt_init(tt_board *b, tt_u32 seed, tt_u8 level, tt_u16 goal, tt_u8 level_up, tt_u8 vs);

int  tt_move(tt_board *b, int dx);          /* 1 if it moved */
int  tt_rotate(tt_board *b, int dir);       /* +1 clockwise, -1 counter-clockwise */
int  tt_hold(tt_board *b);
void tt_hard_drop(tt_board *b);
void tt_tick(tt_board *b);                  /* one frame: gravity, lock, clears */
void tt_receive(tt_board *b, tt_u8 rows);   /* garbage from the opponent */

int  tt_collides(const tt_board *b, int type, int rot, int x, int y);
int  tt_ghost_y(const tt_board *b);
int  tt_pending(const tt_board *b);         /* garbage rows waiting */
int  tt_pending_ready(const tt_board *b);   /* ...of which can land now */
tt_u32 tt_rand(tt_board *b);

#endif
