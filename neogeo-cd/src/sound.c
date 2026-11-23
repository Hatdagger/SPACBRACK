/*
 * SPACBRACK - sound (Neo Geo CD).  See sound.h.
 *
 * Strict C89: gcc 2.95, no // comments, declarations at the top of blocks.
 */
#include <neocore.h>
#include "externs.h"
#include <DATlib.h>
#include "sound.h"

#ifdef PLATFORM_CD
#include <cdda.h>
#endif

/* The PC harness (test/frontend.c) defines these to record what was sent. */
#ifndef SND_WRITE
#define SND_WRITE(cmd) (*((volatile BYTE *)0x320000) = (cmd))   /* 68000 -> Z80 */
#endif
#ifndef CDDA_PLAY
#define CDDA_PLAY(t)   nc_sound_play_cdda(t)
#define CDDA_PAUSE()   nc_sound_pause_cdda()
#define CDDA_RESUME()  nc_sound_resume_cdda()
#endif

#define QLEN 8

static BYTE sq[QLEN];
static BYTE sq_head, sq_count;

void snd_init(void)
{
    sq_head = sq_count = 0;
}

void snd_play(BYTE id, BYTE pan)
{
    BYTE cmd, k;
    if (id >= SND_COUNT || pan > SND_RIGHT) return;
    cmd = SND_CMD(id, pan);
    /* the same effect already waiting: once is enough */
    for (k = 0; k < sq_count; k++)
        if (sq[(sq_head + k) % QLEN] == cmd) return;
    if (sq_count == QLEN) {               /* full: drop the oldest */
        sq_head = (BYTE)((sq_head + 1) % QLEN);
        sq_count--;
    }
    sq[(sq_head + sq_count) % QLEN] = cmd;
    sq_count++;
}

/*
 * One command per frame.  The Z80 picks each byte up in its NMI handler, and
 * a second byte written before it has done so would replace the first.
 */
void snd_tick(void)
{
    if (!sq_count) return;
    SND_WRITE(sq[sq_head]);
    sq_head = (BYTE)((sq_head + 1) % QLEN);
    sq_count--;
}

void music_play(BYTE track)
{
#ifdef PLATFORM_CD
    CDDA_PLAY(track);
#else
    (void)track;
#endif
}

void music_pause(void)
{
#ifdef PLATFORM_CD
    CDDA_PAUSE();
#endif
}

void music_resume(void)
{
#ifdef PLATFORM_CD
    CDDA_RESUME();
#endif
}
