# SPACBRACK — Concept Notes

Demo-disc entry: over-the-shoulder exploration RPG (was top-down grid) where every battle is a falling-brick versus match. Carried by gameplay; scope kept to "enough to convey the idea."

## Decisions so far
- **Terminology: the falling pieces are always called "bricks"** (game text and docs).
- Aesthetic: retro-futurism / NASA-punk themes (space-age locations, B-movie monsters), **presented as blank-VHS-box art + cassette futurism in big colourful Neo Geo-style pixels** (native 320x224, pixel font, chrome logo, racing stripes, beige cassette labels, tape-deck panels, LED counters, VU meter, CRT scanlines).
- Collectible: **Tokens**, 6 total. Each token unlocks a battle feature.
- No overworld: a **map screen** with 6 selectable locations; each location is a small, explorable area with its own identity.
- **Each location's theme matches the token it awards.**
- **Each location has its own house rules** for battles fought there, and **every stage has an active perk on the stage perk button.**
- Battles are **mutual**: talk to an NPC, agree to fight. Any NPC can be re-fought unlimited times.
- Area boss is gated on first encounter: must beat the location's lower NPCs first.
- Standard win rule: first to clear **40 lines** (or opponent tops out).
- **No money and no shop.** Cards are the inventory and the loot players chase.
- **Single-player adventure only — split-screen co-op dropped.** Multiplayer is versus mode.
- Base randomizer before the casino token: pure random bricks.

## Cards (core loot)
- One card equipped at a time; enemies have cards too. Card determines garbage look and abilities.
- **Winning an adventure fight awards a random card.**
- **Losing an adventure fight destroys your equipped card.**
- **Card XP is saved per monster:** a destroyed card's rank returns when you find that monster again.
- **Basic starter card:** unlosable, plain, no abilities.
- **Card loss is adventure only.** Versus never destroys cards.
- **Inventory has a small cap** (around 6–8 slots). When a win would exceed the cap, the player chooses what to keep and what to toss (the new card included).
- The number of monster card types sets the game's length; keep the roster tight.
- XP: score from won matches.

### Ranks and abilities (decided)
| Rank | Unlocks | Use |
|---|---|---|
| 1 | **Passive** | Always on while the card is equipped |
| 2 | Active ability 1 | Card button + direction |
| 3 | Active ability 2 | Card button + direction |
| 4 | Active ability 3 | Card button + direction |
| 5 | Active ability 4 | Card button + direction |

- 5 abilities total per card: 1 passive + 4 actives, one active per direction.
- Abilities are hidden until their rank is reached.
- **Active abilities cost meter**, filled by line clears.
- Proposal for the active curve: R2 basic themed attack, R3 defense/counter, R4 timed effect on the opponent, R5 signature super. The old "rank 1 assist" ideas mostly become passives.
- Proposal: each direction has a fixed role across all cards so players learn one layout (e.g. up = super, left = attack, right = defense, down = timed effect). Open.

### Card ability ideas (to re-slot: passive + 4 actives)
- **Mummy** — Embalm: pause your gravity briefly / Unravel: 2 lines with diagonal bandage-stripe gaps
- **Werewolf** — Full Moon: next 3 bricks are I-bricks / Claw Marks: 3 rows with slashed diagonal gaps
- **Skeleton** — Bone Patch: fills single holes in your stack / Rattle: shakes opponent's falling brick one column
- **Giant Bat** — Echolocation: briefly reveals your upcoming bricks / Nightfall: 1 line + darkens opponent board briefly
- **Sax Skeleton** — Smooth Jazz: slows your fall speed / Solo: staircase garbage like piano keys
- **Cyclops** — Focus: temporary ghost brick / Boulder: drops a 2x2 rock onto opponent's stack
- **Minotaur** — Labyrinth Run: clears one column of your garbage / Charge: shoves opponent's top rows sideways
- More: Swamp Creature, Frankenstein-style brute, Robot, Martian, Giant Ant, Blob.

## Locations, tokens, house rules and stage perks
| # | Location | Token / feature | House rule | Stage perk (button) |
|---|---|---|---|---|
| 1 | **Launch Complex** | **Thrusters** — wall kicks | **Countdown race, garbage off:** clear the target lines within a target time AND before the opponent | **Launch Countdown (decided):** 10-count; when it ends, the player ahead wins (see below) |
| 2 | **Hologram Hall** | **Ghost brick** (hologram) | **Hologram decoys:** fake blocks that bricks fall through | **Projector** (proposal): tap = scan, briefly reveal which of your blocks are fake; hold = beam a decoy onto the opponent's board |
| 3 | **Fold Lab** | **Hard drop** | **Fold garbage** (see below) | **Early Fold (decided):** send your held fold garbage now; cannot stack with other folds |
| 4 | **Space Bank** | **Hold** | **Interest:** held-back garbage grows over time, lost if the opponent clears enough first | **Withdraw:** release your banked garbage at the opponent |
| 5 | **Chrono Station** | **Next-brick preview** | **Save states** (see below) | **Mark / Jump:** tap = mark, hold = jump (decided) |
| 6 | **Space Casino** | **7-bag randomizer** | **Card bet:** both players stake an inventory card; winner takes both | **Pull the Lever** (proposal): slot spin for a random effect — jackpot (garbage to opponent), cherries (clear your bottom row), bust (garbage to you) |

### Launch Complex perk: Launch Countdown (decided)
- Pressing the perk button starts a **10-count**. **Only allowed while you are ahead**, and **one use per round**.
- When the count reaches zero, **the player ahead wins**.
- The count **breaks** if the **initiator clears more lines**, or the **opponent catches up to or takes the lead** (garbage stays off at Launch Complex).
- The initiator is stuck **building without clearing** for 10 seconds while the opponent races to catch up.
- If the count breaks, that player's countdown is spent for the round.

### Fold Lab perk: Early Fold (decided)
- Sends your **held fold garbage** (everything built up since your last fold) to the opponent immediately instead of waiting for the next 8-line fold.
- **Not stackable:** cannot combine with another fold (e.g., can't be fired while a fold is already queued).
- Open: after an Early Fold, does the 8-line counter reset? (Proposal: yes.)

### Perk charges (proposal)
- Default: **one charge per 10 lines cleared, stackable**.
- Exceptions: **Space Bank Withdraw** is free whenever you have garbage banked; **Launch Countdown** is one per round, only while ahead.
- Enemies use stage perks too.

### Making the 7-bag felt
After the token, the HUD shows a slot reel of the 7 shapes, each going dark as it's dealt, reshuffling with a casino chime.

### Fold Lab rule (decided)
- **Trigger:** a fold happens each time a player reaches another 8 cleared lines (8, 16, 24, 32 — 40 wins). Garbage from that player's clears is held until then.
- **Delivery:** applies at the receiver's next brick placement; receiver's input is locked during the fold animation (roughly half a second to a second).
- **Chunks:** each clear in that span is its own chunk, folded in at the row height where it was cleared, in order.
  - Inside the receiver's stack → overwrites those cells.
  - Above the receiver's stack → drops as a rigid brick onto the stack.
- Indicator: "FOLD IN 3" counter for both players, plus side markers for pending chunk heights.
- Card garbage patterns keep their shape when stamped in.

#### Playtest: folds can create line clears for the receiver
- **Whole-row replace:** folds never complete lines. Safest.
- **Solid-cells only:** folds can complete lines (backfire risk).
- **Middle ground:** fold-completed lines clear but don't count toward the 40 or send garbage back.
- Chain risk: if fold clears count, they can push the receiver to their own next fold.

### Chrono Station rule: save states (decided)
- Player can **mark** the field **at any time**, then **jump back** to it later.
- **Only the field comes back.** The brick in hand and the held brick stay as they are at the moment of the jump.
- **Line count is NOT rewound — farming is intended.**
- **Jumps are earned:** a charge each time the player reaches another 10 cleared lines (10, 20, 30) — **3 per race to 40**. **Charges stack.**
- Designer's estimate: best case is around 12 farmed lines in a row from one save.
- Playtest: farmed lines count toward the next 10 (snowball).
- Proposals: jump erases garbage received since the mark; one mark at a time; marked field shown as a faint "photo" in the corner.

### Chrono Station boss: Past You
- Uses a snapshot of the player from their previous visit: card, rank, and only the features they had then.
- Encountered again on revisits (snapshot refreshes) and can be rechallenged.

### Note on Hologram Hall references
Keep game references as parody / nods rather than actual copyrighted characters.

## Exploration view (decided, replaces the top-down rooms)
- **Over-the-shoulder view:** the hero is a large foreground sprite with their back to the camera (uses the Neo Geo's big-sprite strength). Foreground is detailed with little motion.
- **Turning:** Left/Right scrolls a **wide background strip** (panorama) behind the hero. No free walking.
- **Interactables** (people, doors) get a visible cue (bouncing "A" marker). Confirm on the person you're facing starts the conversation; confirm on a door enters/leaves.
- **Walk-forward animation** plays before each scene transition.
- **Talking = full-screen close-up (decided):** Snatcher/Policenauts-style face close-up with blink and lip flap, dialogue underneath.
- **Art target:** Policenauts / Snatcher / Art of Fighting quality, using the Neo Geo's big sprites. Flat 8-bit-looking samples rejected. Hero test sample (satin tour jacket with a rocket patch, one 15-colour palette): https://claude.ai/artifact/2mfqrKbQcQLEswp8UhpSTX
- Letterbox bars top and bottom are fine if rendering is tight, with a few pixel details layered over them (location name, tokens, button hints).
- **Look:** no space suits. NPC outfits are **mixed by location** (ground crew, ushers, scientists, tellers, timekeepers, dealers); bosses get a fancier take on their location's outfit. Hero outfit not picked yet (samples: mission control, jet-age pilot, B-movie hero).
- **Map:** a static image with a cursor that moves between the 6 locations (samples: star chart, station cutaway).
- Art samples page: https://claude.ai/artifact/4ufvG1uWV37WGZA3AQ8XHu

## v0.2 playtest changes
- Soft drop fixed (no longer acts like a hard drop).
- Abilities: 8 s shared recharge, higher costs (super = full meter).
- "YOU GOT BRICKED UP!" only on top-out; losing the race shows "OUTRACED!".
- Cards are prominent: portraits in battle, pop-up over the field when an ability fires, "CARD GET!" flip screen after wins, cracked card after losses.
- Duplicate cards stack (max 9, shown as xN). The 6 slots count monster types; a loss destroys one copy. (Note: stacks make losses softer than before.)

## Battle system
- Two boards side by side. Win: first to 40 lines OR opponent tops out (house rules and perks may change this).
- Bare-bones start: 7 standard bricks, pure random, left/right/soft drop, 90° rotation.
- Open: are matches a single round, or best-of-3 rounds? ("One countdown per round" assumes rounds may repeat.)

## Controls
### Battle actions
- Move left/right, soft drop (D-pad)
- Rotate (one direction minimum; second direction where buttons allow)
- **Hard drop on a button, not D-pad up** (decided)
- **Hold on its own button** (decided)
- **Stage perk button** (decided) — used in every stage (see table).
- **Card ability button** (decided) — directional select, see below.

### Card ability: directional select (decided)
- **Hold** the card ability button → overlay shows the card's 4 active abilities on the **4 directions** (passive is always on, shown in the center as info).
- **Hold a direction**, then **release** the card ability button → that ability fires.
- **Neutral (no direction) on release does nothing.**
- **Cancel:** pressing any other button cancels.
- Locked directions (rank not reached) show as "?" — abilities stay hidden until unlocked.
- Proposals: while the card button is held, the D-pad picks abilities instead of moving the brick; the game keeps running; unaffordable abilities greyed out with meter cost shown; diagonals ignored; a cancelling button press still performs its action.
- Online: only the final "ability fired" event is sent.

### Per-platform maps (proposal)
| Action | Xbox / PC pad / Android pad | Keyboard | Neo Geo (A B C D + Start/Select) |
|---|---|---|---|
| Move / soft drop | D-pad / stick | Arrows | Stick |
| Rotate CW | A | X | A |
| Rotate CCW | B | Z | — (one rotate direction only) |
| Hard drop | X | Space | B |
| Hold | Y | C / Shift | C |
| Card ability (hold + direction + release) | Right trigger | A | D |
| Stage perk | Left trigger | S | Select (AES/CD) / A+B together (MVS) |
| Pause | Start | Esc | Start |

## Multiplayer (versus only)
- From main menu: local 2P and online. Toggle features, cards, house rules and perks. No card loss.
- Netcode: each client simulates its own board and sends garbage/move events + board snapshots. Countdown start/break events need to be authoritative (host decides) so both screens agree on who won.

## Platform feasibility (first pass)
| Platform | Adventure | Local versus | Online versus |
|---|---|---|---|
| Windows / Linux / Android | Yes | Yes | Yes |
| Web | Yes | Yes | Yes (needs relay server) |
| Original Xbox (nxdk homebrew) | Yes | Yes | LAN/IP only |
| Neo Geo AES/MVS | Yes | Yes | Drop |
| Neo Geo CD | Yes (one load per location) | Yes | Drop |

## Prototype
- **v0.1 pushed to GitHub: Hatdagger/spacbrack** (renamed from SPACtris) (browser build: open index.html; Windows/Linux/Android, keyboard + controller).
- In: map + 6 walkable locations, NPC battles, boss gating, tokens/features, 4 placeholder cards (Cyclops, Skeleton, Werewolf, Giant Bat) with ranks/XP/meter/card loss/toss screen, CPU levels 1-5, Versus vs CPU or local 2P.
- Not in: house rules, stage perks, online, Past You snapshot, final ability sets.
- **Name (decided): SPACBRACK**, all caps. Dropped SPACtris because "-tris" names have drawn Tetris Holding takedowns (Setris, Playtris, Apotris).
- Losing a battle shows "YOU GOT BRICKED UP!"

## Open questions
- Card abilities: fixed role per direction across all cards? Full ability sets per monster.
- Matches: single round or best-of-3?
- Early Fold: counter reset.
- Approve Hologram and Casino perks; perk charge rules.
- Exact inventory size.
- Fold Lab: input-lock duration; playtest fold-created line clears.
- Neo Geo: accept single rotate direction? Stage perk on Select vs combo.
