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
| D | Card (Versus and Survival): hold it, pick a direction, let go to fire |
| Start | Pause / join / retry |
| Select | Pause; while paused, quit to the title |

The card button can also go on Select or Start: then the other one pauses.

**Cards** (Versus and Survival, can be turned off in Options): before a match each player picks one card on the PICK A CARD screen (Left/Right to look through all 10, A or Start to pick, B to change your mind; Start on the CPU's pad joins the pick). Four monster cards (Cyclops, Skeleton, Werewolf, Giant Bat) each have a passive and four abilities, used by holding the card button and pressing a direction; six boss cards (Launch Key, Phantom Reel, Origami Crane, Gold Ledger, Time Capsule, Ace of Stars) bring a house rule and a perk. Everything is unlocked. CPUs pick at random. A rematch keeps the cards.

**Monster abilities**: hold the card button, press a direction (the ability's name and cost show above your board), and let go to fire. Pressing another button while picking cancels. Not enough meter, the cooldown, or nobody on the other board: nothing fires (a low buzz).

| Card (passive) | Left | Right | Down | Up |
|---|---|---|---|---|
| Cyclops (ghost always on) | Boulder 5: a 2x2 rock lands on the foe | Eye Beam 3: aim with Left/Right, fire with any button (or after 4 s); empties 2 of your columns | Glare 6: foe sees no next bricks for 8 s | Rockslide 10: three boulders |
| Skeleton (your garbage has rib gaps) | Rattle 4: foe's brick slips a column | Collapse 3: your bricks fall straight down their columns | Shiver 6: foe's brick slips every second for 6 s | Bone Storm 10: send 4 rib rows |
| Werewolf (your garbage has slashed gaps) | Claw 5: send 3 slashed rows | Pound 3: your bottom 3 rows go | Howl 6: foe falls 3x faster for 6 s | Full Moon 10: your next 3 bricks are I |
| Giant Bat (+1 next brick) | Nightfall 4: send 1 row, foe's field goes dark for 5 s | Echo Wall 3: garbage waiting for you bounces back, and so does more for 6 s | Sonar 4: 5 next bricks for 10 s | Swarm 10: send 3 rows, dark for 8 s |

Lines your own abilities clear don't count, score or fill the meter. With cards on you see 3 next bricks (the web game's number), 4 with the Giant Bat. Effects on a board show as a word under its NEXT column (GLAR, SONR, HOWL, SHVR, DARK, ECHO). CPUs fire an ability they can afford now and then, more often at higher levels. **Boss cards**: a tap of the card button runs the card's perk.
- **Launch Key** (Launch Countdown): while you have more lines than the other board, tap to start a 10-count, once a match (in Survival, once per opponent). Clear a line yourself or let them catch up and the count breaks; still ahead at zero and you win (LIFT OFF!; in Survival it's a K.O.). The bar in your right bezel is the count: grey until you're ahead, flashing when you can start it, draining while it runs, empty once used. The centre console shows whose count it is. A CPU with the key starts it when well ahead and then builds without clearing lines.

- **Phantom Reel** (Holograms): every 10 lines (at most 3 a match; in Survival, 3 per opponent) your next brick comes in as a hologram. It passes through bricks (only the walls and the floor stop it), can't be held, and fills only the empty cells it covers, holes included. Tap to freeze it where it is; left alone it falls to the floor and fills the gaps there. The brick that will become a hologram shows white in NEXT, the right bezel bar fills over the 10 lines to the next one (flashing while one is next or falling), and HOLO shows under NEXT. A CPU with the reel steers its hologram into holes and freezes it.

- **Origami Crane** (Fold Garbage): the garbage your clears make isn't sent; it's held, one chunk per clear, remembering the height you cleared at. Every 8 lines (in Survival, counted per opponent) everything held folds over and lands at the other board's next placement: inside their stack it overwrites those rows (all but one hole per row, so it can complete lines, which clear and count for them); above their stack it drops onto it. Nothing falls for 0.7 s while it lands. Any attack eats its own board's waiting garbage first, then a fold coming in, then what the other board holds. Tap for an Early Fold: one charge per 10 lines, not while a fold is already on its way to them (the 8-line count carries on). The right bezel bar fills over the 8 lines (flashing yellow when an Early Fold can go); the other board's left gauge shows what you hold in lime and a fold on its way flashing red; FOLD shows under NEXT. A CPU with the crane folds early when it has a pile.

- **Gold Ledger** (Interest): the garbage your clears make goes into your vault instead of out (10 rows at most), and the vault earns a row every 10 s. The other board's attacks eat into your vault before anything of theirs gets through. Tap to Withdraw: the whole vault goes over as garbage. The right bezel bar is the vault (white when interest pays, red when it's hit); the other board's left gauge shows your vault in yellow; BANK shows under NEXT. A CPU with the ledger cashes out around 5 rows (a little later at higher levels), at the cap, or early when you're stacked high.

The other two boss cards (Time Capsule, Ace of Stars) are still being added.

**Card meter** (Versus and Survival, with cards on): the bar in each board's right bezel fills one segment per line cleared, up to 10. Abilities spend from it; after any ability the bar turns grey for 8 seconds before the next one can fire. Cyan while filling, yellow when full.

**Options** (opened by the player who picks it, so each player has their own): DAS, ARR (0 = instant), soft drop speed, which button does rotate left, rotate right, hold and hard drop (a button already in use swaps), whether Up hard drops, and the card button (A-D, Select or Start). Shared: ghost on/off, line clear delay, music on/off, cards on/off in Versus and Survival. Options saved by an older version still load; a pad that used D for hard drop with Up hard drop on moves to the new layout. Records and options are saved in the console's backup memory.

## Build and test

Everything is in [`neogeo-cd/`](neogeo-cd/) and builds on every push (GitHub Actions, *Neo Geo CD build*):

- **SPACBRACK-BINCUE**: raw BIN/CUE for burning, the MiSTer or SD loaders
- **SPACBRACK-NeoGeoCD**: NeoCore's ISO/WAV/CUE and a CHD for MAME
- **SPACBRACK-screenshots**: screenshots of a scripted play-through on the PC test harness

See [`neogeo-cd/README.md`](neogeo-cd/README.md) for the code layout, art, audio and how to build on your own PC.
