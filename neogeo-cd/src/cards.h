/*
 * SPACBRACK - the cards (Versus and Survival, with cards on).
 *
 * The same cards as the web game (branch main: js/data.js): four monster
 * cards with a passive and four abilities (Left, Right, Down, Up: hold the
 * card button and press the direction), and six unique boss cards that
 * carry a house rule and a perk.  Every card and ability is unlocked here.
 * Portraits are tools/cards.json, drawn into cards.png by tools/make_art.py
 * in this order.
 *
 * Included once, by main.c.  Strict C89.
 */
#ifndef TT_CARDS_H
#define TT_CARDS_H

enum { CARD_CYCLOPS, CARD_SKELETON, CARD_WEREWOLF, CARD_BAT,
       CARD_LAUNCH, CARD_REEL, CARD_ORIGAMI, CARD_LEDGER, CARD_CAPSULE, CARD_ACE, CARD_COUNT };
#define CARD_MONSTERS 4                 /* the first 4 are monsters, the rest boss cards */

enum { DIR_L, DIR_R, DIR_D, DIR_U };   /* ability order */

typedef struct {
    const char *name;
    BYTE        pal;                    /* fix palette for the name */
    const char *pas;                    /* passive (monster) or house rule (boss) */
    const char *line[3];                /* what it does, 18 columns each */
    const char *act[4];                 /* monsters: Left Right Down Up */
    BYTE        cost[4];                /* meter points */
} CardDef;

static const CardDef CARDS[CARD_COUNT] = {
    { "CYCLOPS",       PAL_AMBER,  "FOCUS",          { "GHOST ALWAYS ON", 0, 0 },
      { "BOULDER", "EYE BEAM", "GLARE", "ROCKSLIDE" }, { 5, 3, 6, 10 } },
    { "SKELETON",      PAL_BEIGE,  "RIBCAGE",        { "YOUR GARBAGE HAS", "RIB GAPS", 0 },
      { "RATTLE", "COLLAPSE", "SHIVER", "BONE STORM" }, { 4, 3, 6, 10 } },
    { "WEREWOLF",      PAL_ORANGE, "CLAW MARKS",     { "YOUR GARBAGE HAS", "SLASHED GAPS", 0 },
      { "CLAW", "POUND", "HOWL", "FULL MOON" }, { 5, 3, 6, 10 } },
    { "GIANT BAT",     PAL_VIOLET, "ECHOLOCATION",   { "+1 PREVIEW BRICK", 0, 0 },
      { "NIGHTFALL", "ECHO WALL", "SONAR", "SWARM" }, { 4, 3, 4, 10 } },
    { "LAUNCH KEY",    PAL_ORANGE, "LAUNCH COUNTDOWN", { "PERK: 10-COUNT", "WHILE AHEAD. STILL", "AHEAD AT 0 = WIN" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } },
    { "PHANTOM REEL",  PAL_CYAN,   "HOLOGRAMS",      { "A HOLO BRICK EVERY", "10 LINES. PERK:", "FREEZE IT" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } },
    { "ORIGAMI CRANE", PAL_LIME,   "FOLD GARBAGE",   { "YOUR GARBAGE FOLDS", "OVER EVERY 8 LINES", "PERK: FOLD EARLY" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } },
    { "GOLD LEDGER",   PAL_YELLOW, "INTEREST",       { "GARBAGE IS BANKED", "AND GROWS. PERK:", "WITHDRAW IT ALL" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } },
    { "TIME CAPSULE",  PAL_BLUE,   "SAVE STATES",    { "MARK AT 10 LINES.", "PERK: TAP TO MARK,", "HOLD TO JUMP BACK" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } },
    { "ACE OF STARS",  PAL_PINK,   "PULL THE LEVER", { "A SLOT SPIN EVERY", "10 LINES: JACKPOT,", "CHERRIES OR BUST" },
      { 0, 0, 0, 0 }, { 0, 0, 0, 0 } }
};

#endif
