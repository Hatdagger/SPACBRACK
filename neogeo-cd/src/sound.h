/*
 * SPACBRACK - sound (Neo Geo CD), milestone 4.
 *
 * Music: the three scene songs are CD audio tracks 2-4, played by the BIOS.
 * Sound effects: ADPCM-A samples on the YM2610, played by the NGFX Z80
 * driver (src/assets/sounds/calm.z80 + calm.pcm, built by tools/make_audio.py).
 * The 68000 talks to the Z80 one command byte at a time, so effects go
 * through a short queue and one is sent per frame.
 */
#ifndef TT_SOUND_H
#define TT_SOUND_H

#include "sound_ids.h"

#define SND_LEFT   0
#define SND_CENTRE 1
#define SND_RIGHT  2

void snd_init(void);
void snd_play(BYTE id, BYTE pan);     /* queue an effect                     */
void snd_tick(void);                  /* once per frame: send the next one   */

void music_play(BYTE track);          /* start CD track (2..6), loops        */
void music_pause(void);
void music_resume(void);

#endif
