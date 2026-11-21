# SPACBRACK — prototype v0.6

A retro-futurism / NASA-punk RPG where every fight is a falling-block versus match. One entry on the "New Games Ideas" demo disc. The full design is in [`docs/concept.md`](docs/concept.md).

Note: the falling blocks are called **bricks** everywhere in this game.

**Look:** blank-VHS-box art and cassette futurism, drawn in big chunky pixels at the Neo Geo's native 320x224 with a hand-made pixel font and CRT scanlines. Racing-stripe bands, chrome logo lettering, beige cassette labels, dark tape-deck panels, amber/green LED counters, and a VU meter for the ability meter.

## Run it

No build step and nothing to install. Open `index.html` in Chrome, Edge or Firefox. That works on Windows, Linux and Android.

- To get a link you can open on your phone: in the GitHub repo go to **Settings → Pages**, set the source to the `main` branch, and open the URL it gives you.
- Plug in or pair a controller, then press any button on it so the browser sees it.
- Double-click (or double-tap) the screen for fullscreen.

## New in v0.6 (Chrono Station save states)

- **Save states:** at 10 lines you can start marking your field. Tap the perk button to mark (a new mark replaces the old one), hold it to jump back to the mark. Each mark is one use: it disappears after the jump.
- Jumps are earned at 10, 20 and 30 lines (so the first 10 lines give you both marking and a jump), and unused jumps stack.
- A jump brings the field back exactly as it was when marked and wipes all garbage waiting to come in. The brick in hand, the held brick and your line count stay, so farming lines is allowed.
- The marked field shows as a faint "photo" in the corner of your board, and the line above the board shows your jumps.
- CPUs use it: they mark a clean, low field and jump back when their stack gets tall or messy.
- Versus "House rule" option now also has Save States.

## New in v0.5 (Launch Complex house rule + perk)

- **Countdown race, garbage off:** no garbage is sent in Launch Complex fights. There's a time limit of 1.5x the time the CPU needs to clear 40 lines (about 9 min vs the weakest crew, 4.5 min vs the strongest). When time runs out, more lines wins; a tie goes to sudden death (next line wins).
- **Launch Countdown perk** (perk button: LT/LB, keyboard S): only while you're ahead, once per match. A 10-count starts; if you're still ahead when it ends, you win. It breaks if you clear a line or the opponent catches up.
- The clock counts down in the centre, the count shows as "LAUNCH IN 9...", and a hint above your board tells you when the perk is ready.
- CPUs use the countdown too. Weak CPUs wait for a 3-line lead and are slow to use it; strong ones go at 2 lines.
- Versus has a new "House rule" option to play with Launch Countdown.
- Card abilities that send garbage do nothing under this rule; their other effects still work.

## New in v0.4 (CPU difficulty)

- CPU opponents now have 8 levels instead of 5, and the low ones are much gentler: they think longer, move slower and pause before dropping.
- CPU mistakes are now small slips, and CPUs stop making them once their stack gets tall, so weak opponents no longer bury themselves.
- Adventure strength follows your progress, not the location. Crew 1 is level 1, crew 2 is level 2 and the boss is level 3, plus 1 for every token you hold (top level 8). So whichever location you visit first is the easy one.
- Measured solo time to clear 40 lines (no features): level 1 about 6 minutes, level 4 about 4.5, level 8 about 3.
- Versus lets you pick CPU level 1 to 8 (default 4).

## New in v0.3 (new exploration)

- Over-the-shoulder exploration: the hero stands in the foreground with his back to you (flight jacket). Left/Right scrolls a wide panorama of the room.
- Each location has two scenes: a Hall (two crew and the exit) and an Inner Room (the boss). A cue floats over whoever or whatever you're facing; press A to talk or go through a door. Going through a door plays a walk-forward animation.
- Talking cuts to a full-screen face close-up with a typed line and a moving mouth, then Battle! / Not now.
- The sector map is now a station cutaway with a cursor that moves between the six rooms.
- All art is placeholder, sized to the Art Asset Guide (`art-tests/templates/`) so the pixel artist's files drop straight in.

## New in v0.2 (playtest fixes)

- Soft drop no longer jumps the brick to the floor (it was spending stored gravity time all at once).
- Card abilities: 8-second shared recharge after any ability, and higher meter costs (supers cost the full meter).
- "YOU GOT BRICKED UP!" only shows when your stack tops out. Losing the race shows "OUTRACED!".
- Cards have pixel-art portraits and rank pips. They show beside each board, pop up over the field when an ability fires, and fill the Cards screen.
- After a win, a "CARD GET!" screen flips over the card you won. After a top-out loss, the equipped card cracks.
- Duplicate cards stack (up to 9) and show xN. The 6 slots count monster types. Losing destroys one copy.

## What's in v0.1

**Adventure**
- A sector map with the 6 locations. Each one is a small walkable room with 2 crew NPCs and a boss.
- Talk to an NPC (face them, press A) and agree to battle. Rematches are unlimited.
- Each boss only fights you after both crew members have been beaten.
- Beating a boss gives that location's token, and the token turns on its battle feature:

| Location | Token | Feature |
|---|---|---|
| Launch Complex | Thrusters | Wall kicks |
| Hologram Hall | Hologram | Ghost brick |
| Fold Lab | Fold Drive | Hard drop |
| Space Bank | Vault | Hold |
| Chrono Station | Chrono Lens | Next-brick preview |
| Space Casino | Lucky Seven | 7-bag randomizer, shown as a slot-reel HUD |

- You start with none of the features: pure random bricks, rotation without kicks, no hard drop, no hold, no preview.
- Crew opponents have none of the features. Each boss has only the one feature its token unlocks (e.g. the Fold Lab boss can hard drop, on about 1 brick in 4). The exception is Past You (Chrono Station boss), which carries whatever features you have.
- Cards:
  - Every win gives a random monster card, and your win score becomes XP for the equipped card.
  - XP raises the card's rank, and each rank unlocks one more ability.
  - Losing an Adventure fight destroys the equipped card. Its XP is kept for that monster.
  - The Cadet Badge starter card can't be lost.
  - Duplicates stack (up to 9 copies). The inventory holds 6 different monsters; a 7th means tossing a stack.
- "Past You" (Chrono Station boss) currently mirrors your current card and features. The "previous visit" snapshot isn't in yet.
- Progress saves in the browser.

**Battles**
- Two boards. First to 40 lines wins, or the other player tops out.
- Garbage: 2/3/4 lines send 1/2/4. Your clears cancel incoming garbage first. The red bar beside the board shows what's incoming.
- Each card's garbage has its own look: standard, rib gaps, claw slashes or stairs.
- Card abilities:
  - Hold the card button, hold a direction, then release the card button to fire.
  - Other buttons cancel.
  - Line clears fill the meter, and abilities spend it.
- Direction roles follow the open proposal: left = attack (R2), right = defense (R3), down = timed (R4), up = super (R5).
- CPU opponents have 8 difficulty levels and use their card abilities too.

**Versus**
- Vs CPU or local 2P. Every feature can be switched on or off, and you pick each player's card and rank.
- Cards are never lost in Versus.

## Not in yet (next steps)

- House rules and stage perks for the other four locations (Hologram Hall being rethought, Fold garbage, Interest, Card bet). The perk button is already mapped.
- Full ability sets per monster. The four cards here (Cyclops, Skeleton, Werewolf, Giant Bat) use placeholder sets built from the concept's idea list.
- Online versus, sound, and art beyond the placeholder look.
- Ports: Original Xbox (nxdk) and Neo Geo need a C rewrite of `board.js` and `ai.js`. Those two files have no browser code, so they can serve as the reference version.

## Controls

| Action | Controller | Keyboard P1 | Keyboard P2 |
|---|---|---|---|
| Move / soft drop | D-pad / left stick | Arrows | J L K |
| Rotate CW / CCW | A / B | X / Z | O / U |
| Hard drop | X | Space | N |
| Hold | Y | C / Shift | M |
| Card ability | RT (or RB) | A | P |
| Stage perk (not used yet) | LT (or LB) | S | ; |
| Pause / cards menu | Start | Esc | \ |
| Menu OK / back | A / B | Enter / Backspace | |
| Explore: look around / talk or enter / map | Left-Right / A / B | Arrows / Enter / Backspace | |

In local 2P, controller 1 plays P1 and controller 2 plays P2.

## Code layout

```
index.html      canvas + script tags
js/gfx.js       pixel renderer: fonts, bricks, panels, LEDs, sprites
js/scenes.js    placeholder explore art: panoramas, hero, NPCs, close-ups, station map
js/data.js      bricks, kicks, cards, locations, game title
js/board.js     one player's board rules (no browser code)
js/ai.js        CPU opponent (no browser code)
js/input.js     keyboard + gamepad mapping
js/battle.js    match flow + battle drawing
js/main.js      screens, save data, main loop
docs/concept.md design doc
```
