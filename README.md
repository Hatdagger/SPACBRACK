# SPACBRACK: brick race (Neo Geo CD)

This branch (`tetris`) is only the falling-brick game from SPACBRACK, made for the **Neo Geo CD**. The story, exploration, station map and house rules are not here (they stay on `main`). It keeps SPACBRACK's look: VHS-box colours, the chunky 5x7 pixel font, cassette-deck bezels, LED counters, the starfield and the scrolling perspective floor.

Note: the falling blocks are called **bricks** everywhere in this game.

## Modes

| Mode | Goal |
|---|---|
| **Marathon** | 150 lines. The level (and drop speed) goes up every 10 lines, up to level 15. High score. |
| **Sprint** | 40 lines as fast as you can. Best time. |
| **Versus** | Against the CPU (level 1-8, chosen on the title menu with left/right) or a 2nd player. Garbage, last one standing wins. The drop speed rises every minute. |
| **Survival** | King of the hill. Whoever tops out is replaced while the other board keeps going: a 3-second changeover (K.O. pause, then READY, GO) brings in a new, tougher CPU (or a player, see below). Drop speed rises every minute up to 5. Score = your KO streak. |

**Two players:** whoever presses A or Start on the title menu plays, on their own side of the screen. In Marathon or Sprint the other player can press **Start** at any time and choose **SOLO** (their own game on the other board, the first player's game keeps running) or **VERSUS** (both boards switch to a fresh Versus match). In Versus against the CPU, 2P pressing Start takes the CPU's place in a new Versus match. In Survival, Start on the CPU's pad claims its seat: the CPU eases off a little and the player comes in when it is knocked out, without restarting the other player's streak. A player who is knocked out can press Start during the K.O. pause to come straight back with a new streak; otherwise a CPU takes the seat. The run ends when no player is left on a board.

## Rules (modern)

- 7-bag randomizer, 5 next bricks, hold, ghost brick, hard drop, soft drop
- SRS rotation with wall kicks (both directions)
- Lock delay of 0.5 s, refreshed by up to 15 moves or turns on the floor (reaching a new lowest row refills it)
- T-spins (3-corner rule, with minis), back-to-back, combos, all clears
- Versus garbage: 2/3/4 lines send 1/2/4, T-spins send 2 per line, +1 back-to-back, combo bonus, +10 for an all clear. Your clears cancel waiting garbage first. Incoming garbage waits 1 s (amber bar in the left bezel) before it can land (flashing red bar).

## Controls (Neo Geo pad, remappable)

| Button | Action |
|---|---|
| Left / Right | Move (DAS/ARR speed in Options) |
| Down | Soft drop (fast, or instant in Options) |
| Up | Hard drop (can be turned off) |
| A / B | Rotate left / right |
| C | Hold |
| D | Card (Versus and Survival; the cards are being added) |
| Start | Pause / join / retry |
| Select | Pause; while paused, quit to the title |

The card button can also go on Select or Start: then the other one pauses.

**Options** (opened by the player who picks it, so each player has their own): DAS, ARR (0 = instant), soft drop speed, which button does rotate left, rotate right, hold and hard drop (a button already in use swaps), whether Up hard drops, and the card button (A-D, Select or Start). Shared: ghost on/off, line clear delay, music on/off, cards on/off in Versus and Survival. Options saved by an older version still load; a pad that used D for hard drop with Up hard drop on moves to the new layout. Records and options are saved in the console's backup memory.

## Build and test

Everything is in [`neogeo-cd/`](neogeo-cd/) and builds on every push (GitHub Actions, *Neo Geo CD build*):

- **SPACBRACK-BINCUE**: raw BIN/CUE for burning, the MiSTer or SD loaders
- **SPACBRACK-NeoGeoCD**: NeoCore's ISO/WAV/CUE and a CHD for MAME
- **SPACBRACK-screenshots**: screenshots of a scripted play-through on the PC test harness

See [`neogeo-cd/README.md`](neogeo-cd/README.md) for the code layout, art, audio and how to build on your own PC.
