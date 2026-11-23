/*
 * SPACBRACK - CPU opponent for Versus (levels 1-8), ported from js/ai.js.
 *
 * It scores every place the brick (or the held brick) can drop to with the
 * prototype's board heuristic, then steers there like a player: a pause to
 * "think", one move or turn every few frames, and the odd slip on low levels.
 * The search is spread over several frames so the 68000 never stalls.
 */
#ifndef TT_CPU_H
#define TT_CPU_H

#include "rules.h"

#define CPU_MAX_LEVEL 8
#define CPU_NCAND 112

typedef struct {
    tt_u8  level;
    tt_u8  ease;                  /* someone is waiting for this seat: play a bit worse */
    tt_u8  avoid;                 /* its own Launch Countdown runs: build without clearing lines */
    tt_u8  state;
    tt_u16 timer;
    tt_u32 rng;
    tt_u16 piece_no;              /* b->pieces when the plan was made */
    tt_u8  piece_type;
    /* search */
    tt_u8  ci;                    /* next candidate to score */
    tt_u8  nc;                    /* candidates scored */
    long   sc[8];                 /* best few scores, kept sorted */
    tt_u8  cand[8];               /* ...and their candidate numbers */
    tt_u16 rows[TT_ROWS];         /* the field as bit rows */
    tt_u8  top[TT_COLS];          /* highest filled row in each column (TT_ROWS if empty) */
    tt_u8  top_min;               /* rows above this are empty */
    /* plan */
    tt_u8  use_hold, trot;
    tt_s8  tx;
} tt_cpu;

void cpu_init(tt_cpu *c, tt_u8 level, tt_u32 seed);
void cpu_frame(tt_cpu *c, tt_board *b);   /* plays one frame on board b */

#endif
