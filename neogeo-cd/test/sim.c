/*
 * PC checks for the board rules (src/rules.c) and the CPU (src/cpu.c).
 *
 *   gcc -std=c89 -pedantic -Wall -Wextra -Werror -O2 -Isrc -o sim src/rules.c src/cpu.c test/sim.c
 *   ./sim
 *
 * Exits non-zero on the first failure.
 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "rules.h"
#include "cpu.h"

static int fails;
#define CHECK(c, msg) do { if (!(c)) { printf("FAIL: %s (line %d)\n", msg, __LINE__); fails++; } } while (0)

/* a board from a picture: rows given bottom-up are placed at the bottom */
static void field(tt_board *b, const char **pic, int n)
{
    int y, x;
    memset(b->grid, 0, sizeof b->grid);
    for (y = 0; y < n; y++)
        for (x = 0; x < TT_COLS; x++)
            b->grid[TT_ROWS - n + y][x] = (tt_u8)(pic[y][x] == '#' ? TT_GARBAGE : 0);
}

static void set_piece(tt_board *b, int type, int rot, int x, int y)
{
    b->type = (tt_u8)type; b->rot = (tt_u8)rot; b->x = (tt_s8)x; b->y = (tt_s8)y;
    b->active = 1; b->last_rot = 0; b->lock_t = 0; b->resets = 0; b->low_y = (tt_s8)y;
}

static void test_bag(void)
{
    tt_board b;
    int k, n, seen;
    tt_init(&b, 1234, 1, 0, 0, 0);
    /* the first brick plus the queue: each bag of 7 has every brick once */
    for (n = 0; n < 50; n++) {
        seen = 0;
        for (k = 0; k < 7; k++) {
            seen |= 1 << b.type;
            b.clear_delay = 0;
            tt_hard_drop(&b);
            memset(b.grid, 0, sizeof b.grid);
            if (!b.active) { b.alive = 1; }
        }
        CHECK(seen == 0xfe, "7-bag deals each brick once per bag");
        if (seen != 0xfe) return;
    }
}

static void test_kicks(void)
{
    tt_board b;
    static const char *wall[] = { "#.........", "#.........", "#........." };
    tt_init(&b, 1, 1, 0, 0, 0);
    field(&b, wall, 3);
    /* vertical I against the left wall rotates using a kick */
    set_piece(&b, TT_I, 1, -2, 10);
    CHECK(!tt_collides(&b, TT_I, 1, -2, 10), "I vertical at the wall fits");
    b.ev = 0;
    CHECK(tt_rotate(&b, 1), "I rotates off the wall");
    CHECK(b.ev & TT_EV_KICK, "...with a kick");
    CHECK(!tt_collides(&b, b.type, b.rot, b.x, b.y), "...into a free spot");
}

/* T-spin double: T dropped into the slot, then rotated in */
static void test_tsd(void)
{
    tt_board b;
    static const char *pic[] = {
        "##........",
        "#...######",
        "##.#######",
    };
    tt_init(&b, 7, 1, 0, 0, 1);
    b.clear_delay = 0;
    field(&b, pic, 3);
    /* T pointing right (rot 1) at x=1: cells (2,0),(1,1)... place it pointing down after rotating */
    set_piece(&b, TT_T, 1, 1, TT_ROWS - 3);
    CHECK(!tt_collides(&b, TT_T, 1, 1, TT_ROWS - 3), "T fits above the slot");
    CHECK(tt_rotate(&b, 1), "T rotates into the slot");
    b.ev = 0;
    tt_hard_drop(&b);
    CHECK(b.last_spin == TT_SPIN_FULL, "T-spin recognised");
    CHECK(b.last_lines == 2, "T-spin double clears 2");
    CHECK(b.score == 1200, "T-spin double scores 1200 at level 1");
    CHECK(b.last_attack == 4, "T-spin double sends 4");
}

static void test_pc_and_b2b(void)
{
    tt_board b;
    static const char *pic[] = { "####.#####", "####.#####", "####.#####", "####.#####" };
    tt_init(&b, 9, 1, 0, 0, 1);
    b.clear_delay = 0;
    field(&b, pic, 4);
    set_piece(&b, TT_I, 1, 2, 5);           /* vertical I: cells at x = 4 */
    tt_hard_drop(&b);
    CHECK(b.last_lines == 4, "quad clears 4");
    CHECK(b.last_pc, "all clear");
    CHECK(b.last_attack == 14, "quad all clear sends 4 + 10");
    field(&b, pic, 4);
    set_piece(&b, TT_I, 1, 2, 5);
    tt_hard_drop(&b);
    CHECK(b.last_b2b, "second quad is back-to-back");
    CHECK(b.combo == 1, "combo counted");
}

static void test_meter(void)
{
    tt_board b;
    static const char *pic[] = { "####.#####", "####.#####", "####.#####", "####.#####" };
    int k;
    tt_init(&b, 9, 1, 0, 0, 1);
    b.clear_delay = 0;
    CHECK(b.meter == 0 && !tt_can_spend(&b, 1), "meter starts empty");
    for (k = 0; k < 3; k++) {
        field(&b, pic, 4);
        set_piece(&b, TT_I, 1, 2, 5);
        tt_hard_drop(&b);
    }
    CHECK(b.meter == TT_METER_MAX, "meter fills a point a line, up to 10");
    CHECK(tt_spend(&b, 4) && b.meter == 6, "an ability takes its cost");
    CHECK(!tt_spend(&b, 1), "nothing fires during the cooldown");
    for (k = 0; k < TT_CARD_COOL - 1; k++) tt_tick(&b);
    CHECK(!tt_can_spend(&b, 1), "cooldown lasts 8 seconds");
    tt_tick(&b);
    CHECK(tt_can_spend(&b, 6) && !tt_can_spend(&b, 7), "then the meter is usable again");
}

static void test_garbage(void)
{
    tt_board b;
    tt_init(&b, 3, 1, 0, 0, 1);
    b.clear_delay = 0;
    tt_receive(&b, 3);
    CHECK(tt_pending(&b) == 3 && !tt_pending_ready(&b), "garbage waits");
    tt_hard_drop(&b);
    CHECK(!b.recv, "garbage not ready yet does not land");
    b.g_wait[0] = 0;
    tt_hard_drop(&b);
    CHECK(b.recv == 3, "ready garbage lands on the next placement");
}

static void test_lock_delay(void)
{
    tt_board b;
    int f;
    tt_init(&b, 5, 1, 0, 0, 0);
    b.clear_delay = 0;
    set_piece(&b, TT_T, 0, 3, TT_ROWS - 2);
    for (f = 0; f < TT_LOCK_FRAMES - 1; f++) tt_tick(&b);
    CHECK(b.pieces == 0, "no lock before the delay");
    tt_tick(&b);
    CHECK(b.pieces == 1, "locks after 30 frames on the floor");
}

/* the hole of each row the board took, bottom row first */
static int hole_of(const tt_board *b, int y)
{
    int x, h = -1;
    for (x = 0; x < TT_COLS; x++) {
        if (b->grid[y][x] != TT_GARBAGE) { if (h >= 0) return -2; h = x; }
    }
    return h;
}

static void land(tt_board *b, tt_u8 rows, tt_u8 pat)
{
    memset(b->grid, 0, sizeof b->grid);
    b->g_n = 0;
    tt_receive_pat(b, rows, pat);
    b->g_wait[0] = 0;
    set_piece(b, TT_O, 0, 4, 0);
    tt_hard_drop(b);
}

static void test_patterns(void)
{
    tt_board b;
    int i, h0, ok;
    tt_init(&b, 7, 1, 0, 0, 1);
    b.clear_delay = 0;
    land(&b, 4, TT_PAT_STD);
    h0 = hole_of(&b, TT_ROWS - 4);
    ok = h0 >= 0;
    for (i = 1; i < 4; i++) ok = ok && hole_of(&b, TT_ROWS - 4 + i) == h0;
    CHECK(ok, "plain garbage: one hole, same column");
    land(&b, 4, TT_PAT_RIBS);
    h0 = hole_of(&b, TT_ROWS - 4);       /* the batch's first row ends up on top */
    ok = h0 >= 0;
    for (i = 1; i < 4; i++) ok = ok && hole_of(&b, TT_ROWS - 4 + i) == ((i & 1) ? (h0 + 5) % 10 : h0);
    CHECK(ok, "rib garbage: holes alternate 5 apart");
    land(&b, 3, TT_PAT_CLAW);
    h0 = hole_of(&b, TT_ROWS - 3);
    ok = h0 >= 0;
    for (i = 1; i < 3; i++) ok = ok && hole_of(&b, TT_ROWS - 3 + i) == (h0 + i) % 10;
    CHECK(ok, "claw garbage: the hole steps right each row");
    land(&b, 3, TT_PAT_STAIRS);
    h0 = hole_of(&b, TT_ROWS - 3);
    ok = h0 >= 0 && h0 <= 4;
    for (i = 1; i < 3; i++) ok = ok && hole_of(&b, TT_ROWS - 3 + i) == h0 + i;
    CHECK(ok, "stair garbage: the hole climbs from the left half");
    /* a batch cut by the 8-row cap carries on its pattern */
    land(&b, 10, TT_PAT_CLAW);
    h0 = hole_of(&b, TT_ROWS - 8);
    b.g_wait[0] = 0;
    set_piece(&b, TT_O, 0, 4, 0);
    tt_hard_drop(&b);
    CHECK(b.recv >= 10 && hole_of(&b, TT_ROWS - 2) == (h0 + 8) % 10 && hole_of(&b, TT_ROWS - 1) == (h0 + 9) % 10, "a split claw batch keeps stepping");
}

static int filled(const tt_board *b)
{
    int x, y, n = 0;
    for (y = 0; y < TT_ROWS; y++) for (x = 0; x < TT_COLS; x++) n += b->grid[y][x] != 0;
    return n;
}

static void test_effects(void)
{
    static const char *pic[4] = { "#### #####", "## #######", "#.#.#.#.#.", "##########" };
    tt_board b;
    tt_u8 r, p;
    int n, f, x;
    tt_u16 lines;

    /* boulders: a 2x2 rock on top of the stack, the brick lifted clear */
    tt_init(&b, 21, 1, 0, 0, 1);
    n = filled(&b);
    tt_boulder(&b);
    CHECK(filled(&b) == n + 4, "a boulder is 4 rock cells");
    CHECK(!tt_collides(&b, b.type, b.rot, b.x, b.y), "the falling brick is clear of the rock");
    for (x = 0; x < 40 && b.alive; x++) tt_boulder(&b);
    CHECK(!b.alive, "a field full of rocks tops out");

    /* eye beam empties 2 columns; the CPU aims at the fullest */
    tt_init(&b, 22, 1, 0, 0, 1);
    field(&b, pic, 4);
    b.grid[TT_ROWS - 5][6] = b.grid[TT_ROWS - 5][7] = TT_GARBAGE;
    CHECK(tt_best_beam(&b) == 6, "the beam picks the fullest pair");
    tt_eye_beam(&b, 6);
    for (n = 0, f = 0; f < TT_ROWS; f++) n += b.grid[f][6] || b.grid[f][7];
    CHECK(n == 0, "eye beam empties both columns");

    /* collapse: bricks fall down their columns; full rows go without counting */
    tt_init(&b, 23, 1, 0, 0, 1);
    field(&b, pic, 4);
    lines = b.lines;
    tt_collapse(&b);
    CHECK(b.lines == lines && b.meter == 0, "collapse lines don't count");
    for (n = 0, x = 0; x < TT_COLS; x++) n += b.grid[TT_ROWS - 1][x] != 0;
    CHECK(n < TT_COLS, "collapse clears the rows it completes");
    for (n = 0, x = 0; x < TT_COLS; x++)
        for (f = TT_ROWS - 1; f > 0; f--) if (!b.grid[f][x] && b.grid[f - 1][x]) n++;
    CHECK(n == 0, "after a collapse no brick hangs over a gap");

    /* pound: the bottom 3 rows go */
    tt_init(&b, 24, 1, 0, 0, 1);
    field(&b, pic, 4);
    tt_pound(&b, 3);
    for (n = 0, x = 0; x < TT_COLS; x++) n += b.grid[TT_ROWS - 1][x] != 0;
    CHECK(n == 9 && filled(&b) == 9, "pound leaves only the top row, dropped to the floor");

    /* howl: 3x gravity */
    tt_init(&b, 25, 1, 0, 0, 1);
    for (f = 0; f < 60; f++) tt_tick(&b);
    n = b.y;
    tt_init(&b, 25, 1, 0, 0, 1);
    tt_fx_on(&b, TT_FX_HOWL, 360);
    for (f = 0; f < 60; f++) tt_tick(&b);
    CHECK(b.y >= 3 * n - 1 && b.y > n, "howl makes the brick fall 3x faster");
    CHECK(b.fx[TT_FX_HOWL] == 300, "effects count down");

    /* shiver: a column a second */
    tt_init(&b, 26, 1, 0, 0, 1);
    b.gravity = 0;
    x = b.x;
    tt_fx_on(&b, TT_FX_SHIVER, 360);
    for (f = 0; f < 59; f++) tt_tick(&b);
    CHECK(b.x == x, "no shiver before a second");
    tt_tick(&b);
    CHECK(b.x == x + 1 || b.x == x - 1, "shiver slips the brick a column");

    /* full moon and waiting garbage taken back (echo wall) */
    tt_init(&b, 27, 1, 0, 0, 1);
    tt_full_moon(&b);
    CHECK(b.queue[0] == TT_I && b.queue[1] == TT_I && b.queue[2] == TT_I, "full moon: 3 I bricks next");
    tt_receive_pat(&b, 2, TT_PAT_RIBS);
    tt_receive_pat(&b, 3, TT_PAT_CLAW);
    CHECK(tt_take_pending(&b, &r, &p) && r == 2 && p == TT_PAT_RIBS, "take back the oldest batch");
    CHECK(tt_take_pending(&b, &r, &p) && r == 3 && p == TT_PAT_CLAW, "...then the next");
    CHECK(!tt_take_pending(&b, &r, &p) && !tt_pending(&b), "...until none wait");
}

/* Phantom Reel: holograms pass through bricks and fill only empty cells */
static void test_holo(void)
{
    static const char *pic[3] = { "####.#####", "#.##.#####", "#.##.#####" };
    tt_board b;
    int n;

    tt_init(&b, 5, 1, 0, 0, 1);
    b.holo_on = 1;
    CHECK(tt_holo_ready(&b) == 0, "no hologram before 10 lines");
    b.lines = 10;
    CHECK(tt_holo_ready(&b) == 1, "a hologram at 10 lines");
    b.ev = 0;
    tt_hard_drop(&b);
    CHECK(b.active && b.holo && (b.ev & TT_EV_HOLO), "it comes in as the next brick");
    CHECK(tt_holo_ready(&b) == 0 && b.holo_used == 1, "...and is used up");
    CHECK(!tt_hold(&b), "a hologram can't be held");

    /* freeze it in a column with a brick in the middle: the holes fill, the brick stays */
    field(&b, pic, 3);
    set_piece(&b, TT_I, 1, -1, TT_ROWS - 4);     /* vertical I in column 1, rows 18..21 */
    b.holo = 1;
    CHECK(tt_holo_fills(&b) == 3, "3 of its 4 cells are empty");
    n = filled(&b);
    b.ev = 0;
    CHECK(tt_holo_freeze(&b), "freeze");
    CHECK(filled(&b) == n + 3, "it filled the 3 empty cells");
    CHECK(b.grid[TT_ROWS - 3][1] == TT_GARBAGE, "the brick it covered is still there");
    CHECK(b.grid[TT_ROWS - 1][1] == TT_I && b.grid[TT_ROWS - 2][1] == TT_I, "the holes under it are filled");
    CHECK((b.ev & TT_EV_FREEZE) && !(b.ev & TT_EV_HOLOSET), "frozen, not set");
    CHECK(!b.holo, "the next brick is normal");
    CHECK(!tt_holo_freeze(&b), "nothing to freeze now");

    /* the next one moves through bricks and, unfrozen, falls to the floor */
    b.lines = 20;
    b.ev = 0;
    tt_hard_drop(&b);
    CHECK(b.holo, "a second hologram at 20 lines");
    set_piece(&b, TT_I, 0, 2, 5);
    b.holo = 1;
    CHECK(tt_ghost_y(&b) == TT_ROWS - 2, "a hologram's drop goes to the floor");
    tt_hard_drop(&b);
    CHECK(b.ev & TT_EV_HOLOSET, "unfrozen, it sets on the floor");
    CHECK(b.grid[TT_ROWS - 1][4] == TT_I && b.grid[TT_ROWS - 1][2] == TT_GARBAGE, "...filling only the gaps of the bottom row");
    CHECK(b.last_lines == 1 && b.lines == 21, "a line it completes counts");

    /* at most 3, and Survival starts a fresh count per opponent */
    b.lines = 200;
    CHECK(tt_holo_ready(&b) == 1, "3 at most");
    tt_holo_restart(&b);
    CHECK(tt_holo_ready(&b) == 0, "a fresh count starts empty");
    b.lines = 210;
    CHECK(tt_holo_ready(&b) == 1, "...and gives one 10 lines later");
    b.holo_on = 0;
    CHECK(tt_holo_ready(&b) == 0, "none without the card");
}

/* the CPU plays solo; returns lines cleared before topping out or the goal */
static int cpu_solo(int level, tt_u32 seed, tt_u16 goal, long *frames)
{
    tt_board b;
    tt_cpu c;
    long f;
    tt_init(&b, seed, 1, goal, 0, 0);
    cpu_init(&c, (tt_u8)level, seed * 3 + 1);
    for (f = 0; f < 60L * 60 * 20 && b.alive && !b.done; f++) {
        b.ev = 0;
        cpu_frame(&c, &b);
        tt_tick(&b);
    }
    *frames = f;
    return b.lines;
}

static void test_cpu(void)
{
    long f;
    int lv, l;
    for (lv = 1; lv <= CPU_MAX_LEVEL; lv++) {
        l = cpu_solo(lv, 100 + lv, 40, &f);
        printf("  CPU level %d: %d lines in %ld:%02ld\n", lv, l, f / 3600, (f / 60) % 60);
        CHECK(l >= 40, "CPU clears 40 lines");
    }
}

/* the CPU with Phantom Reel freezes its holograms into holes (garbage keeps making them) */
static int holo_run(int lv, int on, int *frozen, int *set)
{
    tt_board b;
    tt_cpu c;
    long f;
    tt_init(&b, 300 + lv, 1, 60, 0, 0);
    b.holo_on = (tt_u8)on;
    cpu_init(&c, (tt_u8)lv, 7 + lv);
    *frozen = *set = 0;
    for (f = 0; f < 60L * 60 * 20 && b.alive && !b.done; f++) {
        b.ev = 0;
        cpu_frame(&c, &b);
        tt_tick(&b);
        if (b.ev & TT_EV_FREEZE) (*frozen)++;
        if (b.ev & TT_EV_HOLOSET) (*set)++;
        if (f % 600 == 300 && b.alive) tt_receive(&b, 1);
    }
    return b.lines;
}

static void test_cpu_holo(void)
{
    static const char *pic[4] = { "##.#######", "#.########", "#.########", "#.########" };
    tt_board b;
    tt_cpu c;
    long f;
    int lv, l, l0, frozen, set, f0, s0, fz = 0;

    /* a covered well: the hologram goes down column 1 through the brick on top and fills it */
    tt_init(&b, 9, 1, 0, 0, 0);
    field(&b, pic, 4);
    set_piece(&b, TT_I, 0, 3, 0);
    b.holo = 1;
    cpu_init(&c, 8, 5);
    for (f = 0; f < 600 && b.lines == 0; f++) {
        b.ev = 0;
        cpu_frame(&c, &b);
        tt_tick(&b);
        if (b.ev & TT_EV_FREEZE) fz++;
    }
    CHECK(fz == 1 && b.lines == 3, "the CPU freezes a hologram into a covered well for 3 lines");

    for (lv = 2; lv <= CPU_MAX_LEVEL; lv += 3) {
        l = holo_run(lv, 1, &frozen, &set);
        l0 = holo_run(lv, 0, &f0, &s0);
        printf("  CPU level %d with holograms: %d lines (%d without), %d frozen, %d set on the floor\n", lv, l, l0, frozen, set);
        CHECK(l + 4 >= l0 && (lv < 5 || l >= 60), "holograms don't hurt the CPU");
        CHECK(frozen + set == (l >= 30 ? 3 : l / 10), "one hologram per 10 lines, 3 at most");
        CHECK(frozen >= set, "it freezes most of them");
    }
}

/* Origami Crane: garbage is held, folds over every 8 lines, lands overwriting rows */
static void drop_o(tt_board *b, int x)
{
    set_piece(b, TT_O, 0, x, 0);
    tt_hard_drop(b);
}

static void test_fold(void)
{
    static const char *two[3] = { "########..", "########..", "####.#####" };
    static const char *low[1] = { "#........." };
    tt_board a, b;
    int f;

    tt_init(&a, 7, 1, 0, 0, 1);
    tt_init(&b, 8, 1, 0, 0, 1);
    a.clear_delay = b.clear_delay = 0;
    a.fold_on = 1;

    /* a double at the floor: 1 row, held at height 0 instead of sent */
    field(&a, two, 3);
    drop_o(&a, 8);
    CHECK(a.lines == 2 && a.out == 1, "a double makes 1 row");
    CHECK(tt_attack_route(&a, &b, a.out, TT_PAT_STD) == 0, "with the card it isn't sent");
    a.out = 0;
    CHECK(tt_fold_held(&a) == 1 && a.fh[0].h == 1, "it is held, at the height it was cleared at");
    CHECK(!a.fold_due, "no fold before 8 lines");

    /* the opponent's attack eats what you hold */
    CHECK(tt_attack_route(&b, &a, 1, TT_PAT_STD) == 0 && tt_fold_held(&a) == 0, "the opponent's attack cancels held rows");
    CHECK(tt_attack_route(&b, &a, 2, TT_PAT_STD) == 2, "...and the rest is sent normally");

    /* the 8-line mark folds it over */
    a.lines = 6;
    field(&a, two, 3);
    drop_o(&a, 8);
    tt_attack_route(&a, &b, a.out, TT_PAT_STD); a.out = 0;
    CHECK(a.fold_due, "8 lines: the held rows fold over");
    CHECK(tt_fold_send(&a, &b) == 1 && b.fi_n == 1 && a.fh_n == 0, "they move to the opponent");
    CHECK(tt_fold_queued(&b) == 1, "queued on the opponent");

    /* they land at the next placement, overwriting solid cells, and complete a line */
    field(&b, low, 1);
    b.fi[0].hole = 0;
    b.fi[0].h = 0;
    b.g_n = 0;
    b.ev = 0;
    drop_o(&b, 4);
    CHECK((b.ev & TT_EV_FOLDIN) && b.fold_t == TT_FOLD_FRAMES && !b.active && b.fi_n == 0, "the fold lands and plays");
    CHECK(b.fold_rows == (1UL << (TT_ROWS - 1)), "it stamped the bottom row");
    for (f = 0; f < TT_FOLD_FRAMES; f++) { b.ev = 0; tt_tick(&b); }
    CHECK(b.lines == 1 && b.active, "the line it completed cleared and counted; the next brick came");

    /* above the stack it drops onto it */
    memset(b.grid, 0, sizeof b.grid);
    b.fi[0].rows = 2; b.fi[0].h = 12; b.fi[0].hole = 3; b.fi[0].pat = TT_PAT_STD; b.fi_n = 1;
    drop_o(&b, 0);
    CHECK(b.grid[TT_ROWS - 3][5] == TT_GARBAGE && b.grid[TT_ROWS - 3][3] == 0, "it sits on the stack (O on the floor, 2 rows)");
    CHECK(b.grid[TT_ROWS - 4][5] == TT_GARBAGE && b.grid[TT_ROWS - 5][5] == 0, "...2 rows high");
    for (f = 0; f < TT_FOLD_FRAMES; f++) tt_tick(&b);

    /* your attack cancels what is folding in to you */
    b.fi[0].rows = 3; b.fi_n = 1;
    field(&b, two, 3);
    drop_o(&b, 8);
    CHECK(b.out == 0 && tt_fold_queued(&b) == 0, "...the fold landed (the double's row cancelled 1 of 3)");
    CHECK(b.fold_n == 2, "2 rows folded in");
    for (f = 0; f < TT_FOLD_FRAMES; f++) tt_tick(&b);

    /* Early Fold */
    tt_init(&a, 9, 1, 0, 0, 1);
    tt_init(&b, 10, 1, 0, 0, 1);
    a.fold_on = 1;
    a.lines = 9;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_AT10, "no charge before 10 lines");
    a.lines = 10;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_NOTHING, "nothing held");
    a.out_h = 0;
    tt_attack_route(&a, &b, 2, TT_PAT_STD);
    b.fi_n = 1; b.fi[0].rows = 1;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_QUEUED, "not while a fold is queued on them");
    b.fi_n = 0;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_OK && tt_fold_queued(&b) == 2, "Early Fold sends the held rows");
    tt_attack_route(&a, &b, 1, TT_PAT_STD);
    b.fi_n = 0;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_NOCHARGE, "one charge per 10 lines");
    a.lines = 20;
    CHECK(tt_fold_charges(&a) == 1, "a second at 20");
    tt_fold_restart(&a);
    CHECK(tt_fold_charges(&a) == 0 && tt_fold_in_lines(&a) == TT_FOLD_EVERY, "a fresh count");
    a.fold_on = 0;
    CHECK(tt_fold_early(&a, &b) == TT_FOLD_OFF, "nothing without the card");
}

/* Gold Ledger: garbage is banked, earns interest, the opponent eats it, Withdraw sends it */
static void test_bank(void)
{
    static const char *two[3] = { "########..", "########..", "####.#####" };
    tt_board a, b;
    int f;
    tt_init(&a, 31, 1, 0, 0, 1);
    tt_init(&b, 32, 1, 0, 0, 1);
    a.clear_delay = 0;
    a.bank_on = 1;
    CHECK(tt_withdraw(&a) == 0, "an empty bank sends nothing");
    field(&a, two, 3);
    drop_o(&a, 8);
    CHECK(tt_attack_route(&a, &b, a.out, TT_PAT_STD) == 0 && a.bank == 1, "the double's row is banked, not sent");
    a.out = 0;
    for (f = 0; f < TT_INTEREST; f++) { a.ev = 0; tt_tick(&a); }
    CHECK(a.bank == 2 && (a.ev & TT_EV_INTEREST), "10 s of interest: +1 row");
    CHECK(tt_attack_route(&a, &b, 20, TT_PAT_STD) == 0 && a.bank == TT_BANK_CAP, "10 rows at most");
    for (f = 0; f < TT_INTEREST * 2; f++) tt_tick(&a);
    CHECK(a.bank == TT_BANK_CAP, "no interest at the cap");
    CHECK(tt_attack_route(&b, &a, 3, TT_PAT_STD) == 0 && a.bank == 7, "the opponent's attack eats the bank");
    CHECK(tt_attack_route(&b, &a, 9, TT_PAT_STD) == 2 && a.bank == 0, "...and the rest gets through");
    a.bank = 6;
    CHECK(tt_withdraw(&a) == 6 && a.bank == 0 && a.interest_t == 0, "Withdraw empties it all");
    a.bank = 3; a.bank_on = 0;
    CHECK(tt_withdraw(&a) == 0, "nothing without the card");
}

/* a CPU with Origami Crane against one without: folds land, and the match ends */
static void test_fold_versus(void)
{
    tt_board a, b;
    tt_cpu ca, cb;
    long f;
    int folds = 0, n;
    tt_init(&a, 21, 1, 0, 0, 1);
    tt_init(&b, 22, 1, 0, 0, 1);
    a.fold_on = 1;
    cpu_init(&ca, 7, 1);
    cpu_init(&cb, 5, 2);
    for (f = 0; f < 60L * 60 * 15 && a.alive && b.alive; f++) {
        a.ev = b.ev = 0;
        cpu_frame(&ca, &a); cpu_frame(&cb, &b);
        tt_tick(&a); tt_tick(&b);
        if (a.out) { n = tt_attack_route(&a, &b, a.out, TT_PAT_STD); if (n) tt_receive(&b, (tt_u8)n); a.out = 0; }
        if (b.out) { n = tt_attack_route(&b, &a, b.out, TT_PAT_STD); if (n) tt_receive(&a, (tt_u8)n); b.out = 0; }
        if (a.fold_due) { a.fold_due = 0; if (tt_fold_send(&a, &b)) folds++; }
        if (b.fold_due) { b.fold_due = 0; if (tt_fold_send(&b, &a)) folds++; }
        if (f % 3600 == 3599 && a.level < 10) {        /* the drop speed rises every minute, as in the game */
            a.level++; b.level++;
            a.gravity = b.gravity = tt_gravity_for(a.level);
        }
        if (a.active) CHECK(!tt_collides(&a, a.type, a.rot, a.x, a.y), "fold versus: no overlap");
        if (fails) return;
    }
    printf("  fold versus CPU 7 (Origami) vs CPU 5: %s after %ld s, %d folds, folded in %u / %u\n",
           !b.alive ? "level 7 wins" : !a.alive ? "level 5 wins" : "no result", f / 60, folds, a.recv, b.recv);
    CHECK(!a.alive || !b.alive, "fold versus ends");
    CHECK(folds > 0, "folds happened");
}

static void test_versus(void)
{
    tt_board a, b;
    tt_cpu ca, cb;
    long f;
    tt_init(&a, 11, 1, 0, 0, 1);
    tt_init(&b, 11, 1, 0, 0, 1);
    cpu_init(&ca, 8, 1);
    cpu_init(&cb, 4, 2);
    for (f = 0; f < 60L * 60 * 15 && a.alive && b.alive; f++) {
        a.ev = b.ev = 0;
        cpu_frame(&ca, &a); cpu_frame(&cb, &b);
        tt_tick(&a); tt_tick(&b);
        if (a.out) { tt_receive(&b, (tt_u8)a.out); a.out = 0; }
        if (b.out) { tt_receive(&a, (tt_u8)b.out); b.out = 0; }
    }
    printf("  versus CPU 8 vs CPU 4: %s after %ld s, sent %u / %u\n",
           !b.alive ? "level 8 wins" : !a.alive ? "level 4 wins" : "no result", f / 60, a.sent, b.sent);
    CHECK(!a.alive || !b.alive, "versus ends");
    CHECK(a.alive, "the stronger CPU wins");
}

/* random button mashing never breaks the board */
static void test_fuzz(void)
{
    tt_board b;
    long f;
    int k, games = 0;
    tt_u32 r = 99;
    tt_init(&b, 42, 1, 0, 1, 1);
    b.holo_on = 1;
    for (f = 0; f < 400000L; f++) {
        r = r * 1103515245UL + 12345UL;
        k = (int)((r >> 16) & 31);
        b.ev = 0;
        b.soft = (tt_u8)(k == 9);
        if (k < 3) tt_move(&b, -1);
        else if (k < 6) tt_move(&b, 1);
        else if (k == 6) tt_rotate(&b, 1);
        else if (k == 7) tt_rotate(&b, -1);
        else if (k == 8) tt_hold(&b);
        else if (k == 10) tt_hard_drop(&b);
        else if (k == 11 && (r & 0x100000)) tt_receive_pat(&b, (tt_u8)(1 + (r >> 24) % 4), (tt_u8)((r >> 8) & 3));
        else if (k == 12 && (r & 0xf00000) == 0x100000) tt_boulder(&b);
        else if (k == 12 && (r & 0xf00000) == 0x200000) tt_collapse(&b);
        else if (k == 12 && (r & 0xf00000) == 0x300000) tt_pound(&b, 3);
        else if (k == 12 && (r & 0xf00000) == 0x400000) tt_eye_beam(&b, (int)((r >> 8) % 9));
        else if (k == 12 && (r & 0xf00000) == 0x500000) tt_fx_on(&b, (int)((r >> 8) % TT_FX_N), 300);
        else if (k == 12 && (r & 0xf00000) == 0x600000) b.lines = (tt_u16)(b.lines + 10);
        else if (k == 13 && (r & 0x300000) == 0x100000) tt_holo_freeze(&b);
        else if (k == 13 && (r & 0x300000) == 0x200000 && b.fi_n < TT_FMAX) {
            b.fi[b.fi_n].rows = (tt_u8)(1 + (r >> 8) % 4); b.fi[b.fi_n].h = (tt_u8)((r >> 12) % 20);
            b.fi[b.fi_n].hole = (tt_u8)((r >> 4) % 10); b.fi[b.fi_n].pat = (tt_u8)((r >> 16) & 3); b.fi_n++;
        }
        tt_tick(&b);
        if (b.fold_t) CHECK(!b.active, "nothing falls while a fold plays");
        if (b.active && !b.holo) CHECK(!tt_collides(&b, b.type, b.rot, b.x, b.y), "falling brick never overlaps");
        if (b.holo) CHECK(!tt_hold(&b), "a hologram is never held");
        if (!b.alive) { games++; tt_init(&b, (tt_u32)f + 1, 1 + games % 15, 0, 1, 1); b.holo_on = (tt_u8)(games & 1); }
        if (fails) return;
    }
    printf("  fuzz: %d games\n", games);
}

int main(void)
{
    test_bag();
    test_kicks();
    test_tsd();
    test_pc_and_b2b();
    test_garbage();
    test_meter();
    test_patterns();
    test_effects();
    test_lock_delay();
    test_holo();
    test_fold();
    test_bank();
    test_fuzz();
    test_cpu();
    test_cpu_holo();
    test_versus();
    test_fold_versus();
    if (fails) { printf("%d check(s) failed\n", fails); return 1; }
    printf("all rules checks passed\n");
    return 0;
}
