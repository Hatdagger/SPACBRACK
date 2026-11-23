# SPACBRACK: Neo Geo CD port plan

Goal: a disc image (BIN/CUE for the MiSTer, ISO/CHD for MAME) built on every push, so the user can test on real-hardware-equivalent (MiSTer SuperStation One, Neo Geo CD core).

## Toolchain (copy Calm Combo's, it already works)
- **NeoCore** (GCC 2.95 + DATlib, MIT), vendored like `Hatdagger/calm-combo/neogeo-cd/neocore/` (src-lib, toolchain, manifest.xml; compiler/MAME downloaded on first run).
- **CI:** copy `calm-combo/.github/workflows/neogeo-cd.yml`: `windows-latest` runs `Builder-Manager.ps1` rules lib → sprite → make → dist:iso → dist:mame, then `tools/make_bincue.py` makes a raw BIN/CUE. Artifacts: `SPACBRACK-BINCUE` (MiSTer) and `SPACBRACK-NeoGeoCD` (ISO/CHD).
- **Linux checks** like Calm Combo: strict C89 PC build of the rules + a parity test against the web build, and a PC front end with stub hardware headers that renders screenshots.
- Folder: `neogeo-cd/` in the SPACBRACK repo (src/, tools/, test/, neocore/).

## What maps well
- Native resolution is the same (320x224), and the look was designed for it.
- **The board fits the fix layer:** 8x8 tiles, 40x28 screen. Both 10x20 fields, HUDs, LED counters and text can live there (cheap, no sprites). Falling bricks, ghost, cards, close-ups, hero and NPCs are sprites.
- `board.js` and `ai.js` have no browser code, so they port to C almost line for line. Use a seeded RNG in both so the parity test can compare them.

## Feasibility / cuts to decide early
- **Buttons:** a Neo Geo pad has A B C D + Start + Select. Proposed (from the concept's per-platform table): A rotate CW, B hard drop, C hold, D card button (hold + direction), Select stage perk, Start pause. **Only one rotate direction** (rotate CCW dropped) unless the user prefers B = rotate CCW and hard drop on something else.
- **Sound:** music becomes CD audio tracks rendered from the `audio.js` song data (title, map, explore, battle x key changes, boss, win/lose jingles). Sound effects become ADPCM-A samples on the YM2610 (Calm Combo's `make_audio.py` + NGFX SoundBuilder Z80 driver pattern). Budget 512 KB of samples.
- **Art:** the current placeholder art is drawn by code. For the disc it has to be exported to PNGs (panoramas 640x176, hero 112x160, NPCs, close-ups 320x176, cards, map) and converted by DATlib. The pixel artist's PNGs will drop into the same slots later.
- **Memory:** NGCD has 2 MB program RAM + 4 MB sprite RAM, so each location's art loads when you enter it (a short CD load is fine, the concept already allows "one load per location").
- **Saves:** backup memory via the BIOS CARD call, like Calm Combo (save flags, tokens, cards, XP).
- **Online versus:** dropped on Neo Geo (already decided).

## Milestones
1. **Versus battle only:** C port of the board rules + CPU (8 levels), two fields on the fix layer, falling bricks as sprites, title → Versus setup → battle. Placeholder beeps. Parity test vs the web build. *First disc to test on the MiSTer.*
2. **All house rules, perks, card abilities, unique cards** in Versus.
3. **Sound:** CD audio songs + sound-chip effects.
4. **Adventure:** station map, explore panoramas, talk close-ups, NPC battles, cards/inventory, tokens, Terminal/Past You, ending, saving.
5. Polish on real hardware (sprite limits per line, load times).

## Open questions for the user
- Button layout: OK to drop rotate counter-clockwise?
- Milestone 1 first (Versus only) for a quick test disc?
