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
        else if (k == 11 && (r & 0x100000)) tt_receive(&b, (tt_u8)(1 + (r >> 24) % 4));
        tt_tick(&b);
        if (b.active) CHECK(!tt_collides(&b, b.type, b.rot, b.x, b.y), "falling brick never overlaps");
        if (!b.alive) { games++; tt_init(&b, (tt_u32)f + 1, 1 + games % 15, 0, 1, 1); }
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
    test_lock_delay();
    test_fuzz();
    test_cpu();
    test_versus();
    if (fails) { printf("%d check(s) failed\n", fails); return 1; }
    printf("all rules checks passed\n");
    return 0;
}
