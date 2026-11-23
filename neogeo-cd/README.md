# SPACBRACK brick race: Neo Geo CD port

Built with [NeoCore](https://github.com/David-Vandensteen/neocore) (GCC 2.95 + DATlib, vendored in `neocore/`, MIT license), the same toolchain as Calm Combo.

## Code
| File | What |
|---|---|
| `src/rules.c/.h` | One board's rules: bag, SRS kicks, gravity, lock delay, T-spins, scoring, garbage (with the cards' hole patterns), and the card effects on a board (boulders, eye beam, collapse, pound, timed effects). Plain C89, no hardware, so the PC tests run the same code. |
| `src/cpu.c/.h` | CPU opponent (levels 1-8), ported from the web prototype's `ai.js`. Its search is spread over frames. |
| `src/main.c` | Screens, modes, input (DAS/ARR, remap), drawing, card abilities (who they hit, aiming, Echo Wall, CPU use). |
| `src/cards.h` | The 10 cards: names, passives, abilities and costs. |
| `src/save.c/.h` | Records and options in backup memory (BIOS CARD call, saves 2-4 under NeoCore's game number 0x7777). |
| `src/sound.c/.h` | Sound-chip effects queue and CD audio tracks (from Calm Combo). |
| `test/sim.c` | Rules checks: 7-bag, kicks, T-spin double, all clear, back-to-back, garbage and its patterns, card meter and effects, lock delay, fuzzing (card effects included), CPU 40-line runs, CPU vs CPU. |
| `test/frontend.c` | Runs the real `main.c` against stand-in hardware from a script (`test/tour.txt`) and dumps snapshots; `test/render_frames.py` draws them. |

```
gcc -std=c89 -pedantic -Wall -Wextra -Werror -O2 -Isrc -o sim src/rules.c src/cpu.c test/sim.c && ./sim
sh test/build_frontend.sh && mkdir -p shots && build-pc/frontend test/tour.txt shots && python3 test/render_frames.py shots --sheet shots/00_sheet.png
```

## Drawing
The boards, panels, text and the big countdown letters are all on the **fix layer**: one brick is one 8x8 tile, and the bricks, ghost, bezels and the 5x7 font share one tile bank (`src/assets/gfx/fix/tiles.png`) painted in "role" colours that the game recolours per palette at boot. Only changed tiles are written each frame. The fix layer is drawn over every sprite, which is why everything over a board lives there. Sprites are only used for the backdrop (`bg.png`, whose floor grid scrolls by palette cycling) and the chrome SPACBRACK logo (`glyphs.png`).

`python3 tools/make_art.py` remakes all three PNGs and `src/art_keys.h` from the web prototype's palette and font.

## Audio
- **Songs** are CD audio tracks: 2 title, 3 Marathon, 4 Sprint, 5 Versus, 6 Survival (`src/assets/cdda/track0N_*.wav`, 44.1 kHz 16-bit stereo). The placeholders are rendered during the build from the web prototype's chiptune data (`tools/songs.json`). A WAV you put there with the same name is used instead.
- **Effects** are `src/assets/sfx/*.wav` (mono, under 2 s), encoded for the YM2610 by `tools/make_audio.py` with the NGFX SoundBuilder Z80 driver.

## Building on your own Windows PC
Same as Calm Combo (keep the path short, GCC 2.95 has a 100-character path limit):
```
git clone -b tetris https://github.com/Hatdagger/SPACBRACK C:\sb
cd C:\sb\neogeo-cd
python tools\make_audio.py
cd src
mak lib
mak sprite
mak
mak run:mame
```
For `mak dist:iso`, also copy `assets\cdda\*.wav` into `..\build\SPACBRACK\assets\cdda\`.

## Next
1. Test the disc on the MiSTer / real hardware (saving, sprite and fix timing).
2. Cards: the boss cards' house rules and perks, one at a time (monster abilities, Launch Key and Phantom Reel are in; next Origami Crane, Gold Ledger, Time Capsule, Ace of Stars).
3. Your own songs.
