"""SPACBRACK audio for the Neo Geo CD.

    python3 tools/make_audio.py              placeholders for anything missing, then build
    python3 tools/make_audio.py --force      remake every placeholder (overwrites your audio!)
    python3 tools/make_audio.py --build      only build the sound-chip files from sfx/*.wav

What it makes, under src/assets/:
  cdda/track02_title.wav  track03_marathon.wav  track04_sprint.wav
  cdda/track05_versus.wav track06_survival.wav
      The songs, 44.1 kHz stereo.  Placeholders are rendered from the web
      prototype's own chiptune data (tools/songs.json, taken from js/audio.js):
      title = title theme, marathon = battle theme, sprint = boss theme,
      versus = battle theme in another key, survival = boss theme lower.
      Your own songs: put a file named after the slot in neogeo-cd/music/
      (title, marathon, sprint, versus, survival; .mp3 .flac .ogg .opus .m4a
      .aac .wav) and it is converted to 44.1 kHz 16-bit stereo, levelled to
      about the same loudness, and used instead of the placeholder.  Needs
      ffmpeg on the PATH (WAV works without it).  A WAV put straight into
      cdda/ is also kept as it is.
  sfx/*.wav
      The sound effects at 18,500 Hz mono, copying the prototype's synth.
  sounds/spac.pcm  sounds/spac.z80  ../sound_ids.h
      Every sfx/*.wav is encoded to the YM2610's ADPCM-A format and packed
      into spac.pcm.  spac.z80 is the NGFX SoundBuilder Z80 driver (from
      NeoCore's soundFX_poly sample, MIT) with its sample table rewritten:
      each sound gets three commands, for hard left, centre and hard right.

Needs numpy and scipy (and ffmpeg for your own songs).
"""
import json, os, shutil, subprocess, sys, wave
import numpy as np
from scipy.signal import lfilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, '..', 'src'))
ASSETS = os.path.join(SRC, 'assets')

SFX = ['move', 'rotate', 'kick', 'lock', 'hard', 'hold', 'clear1', 'clear2', 'clear3', 'clear4',
       'tspin', 'combo', 'garbage', 'level', 'topout', 'menu', 'beep', 'go',
       'cast', 'boulder', 'beam', 'echo', 'deny', 'holo', 'freeze', 'holoset',
       'fold', 'earlyfold', 'foldin', 'interest', 'bankhit', 'withdraw',
       'mark', 'jump', 'spin', 'jackpot', 'cherries', 'bust']
# (file, song, semitones)
TRACKS = [('track02_title', 'title', 0), ('track03_marathon', 'battle', 0), ('track04_sprint', 'boss', 0),
          ('track05_versus', 'battle', 3), ('track06_survival', 'boss', -2)]
SFX_RATE = 18500
CD_RATE = 44100
CMD_BASE = 0x20
TABLE = 0x1000
PANS = [(0x80, 'L'), (0xc0, 'C'), (0x40, 'R')]
PCM_NAME, Z80_NAME = 'spac.pcm', 'spac.z80'
MUSIC = os.path.normpath(os.path.join(HERE, '..', 'music'))
MUSIC_EXTS = ['.flac', '.wav', '.mp3', '.ogg', '.opus', '.m4a', '.aac']
CD_AUDIO_MAX_MINUTES = 70       # what's left on a 74-minute disc after the data track, roughly
SONG_MIN_SECONDS = 150          # loop the song data to at least this long

DATA = json.load(open(os.path.join(HERE, 'songs.json')))


def mtof(m): return 440.0 * 2 ** ((m - 69) / 12.0)


def note(n):
    if isinstance(n, (int, float)): return n
    semi = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}[n[0]]
    rest = n[1:]
    if rest[0] == '#': semi += 1; rest = rest[1:]
    elif rest[0] == 'b': semi -= 1; rest = rest[1:]
    return 12 * (int(rest) + 1) + semi


def filt(x, kind, f, rate, q=0.7071):
    f = min(max(f, 20), rate * .45)
    w = 2 * np.pi * f / rate
    c, s = np.cos(w), np.sin(w)
    al = s / (2 * q)
    if kind == 'lowpass': b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == 'highpass': b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else: b = [al, 0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return lfilter(np.array(b) / a[0], np.array(a) / a[0], x, axis=0)


class Bus:
    """Web Audio style voices (js/audio.js tone() and noise()) mixed into a buffer."""
    def __init__(self, seconds, rate, seed=1):
        self.rate = rate
        self.buf = np.zeros(int(seconds * rate) + rate)
        self.rng = np.random.default_rng(seed)

    def add(self, t, sig):
        i = int(round(t * self.rate))
        if i >= len(self.buf) or i < 0: return
        n = min(len(sig), len(self.buf) - i)
        self.buf[i:i + n] += sig[:n]

    def tone(self, f, d=.1, v=.2, typ='square', at=0, to=None, sus=False, vib=False, a=.004):
        n = int((d + .02) * self.rate)
        t = np.arange(n) / self.rate
        freq = f * (to / f) ** np.minimum(t / d, 1) if to else np.full(n, float(f))
        if vib: freq = freq * (1 + .012 * np.sin(2 * np.pi * 5.5 * t))
        ph = np.cumsum(freq) / self.rate
        if typ == 'sine': w = np.sin(2 * np.pi * ph)
        elif typ == 'triangle': w = 1 - 4 * np.abs((ph + .25) % 1 - .5)
        elif typ == 'sawtooth': w = 2 * (ph % 1) - 1
        else: w = np.where(ph % 1 < .5, 1.0, -1.0)
        g = np.empty(n)
        up = t < a
        g[up] = v * (1e-4 / v) ** (1 - t[up] / a)
        start = d * .7 if sus else a
        hold = (t >= a) & (t < start)
        g[hold] = v
        dec = t >= start
        g[dec] = v * (1e-4 / v) ** np.minimum((t[dec] - start) / max(d - start, 1e-3), 1)
        g[t > d] = 0
        self.add(at, w * g)

    def noise(self, d=.1, v=.2, f=2000, at=0, to=None, typ='lowpass', q=.7):
        n = int((d + .02) * self.rate)
        x = self.rng.uniform(-1, 1, n)
        fc = np.sqrt(f * to) if to else f
        x = filt(x, typ, fc, self.rate, q)
        t = np.arange(n) / self.rate
        g = v * (1e-4 / v) ** np.minimum(t / d, 1)
        g[t > d] = 0
        self.add(at, x * g)

    def arp(self, notes, step, at=0, **o):
        for i, nn in enumerate(notes):
            kw = dict(d=step * 1.6, v=.14)
            kw.update(o)
            self.tone(mtof(note(nn)), at=at + i * step, **kw)


# ---------------------------------------------------------------- songs (js/audio.js compile + voice)
def compile_song(song, transpose):
    Q = DATA['Q']
    ev, step0 = [], 0
    for name in song['form']:
        sec = song[name]
        bars = len(sec['chords'])
        bass = sec.get('bass', song['bass']); arp = sec.get('arp', song['arp']); drums = sec.get('drums', song['drums'])
        lead = sec['lead'].split() if 'lead' in sec else []
        for bar in range(bars):
            root = note(sec['chords'][bar][0]) + transpose
            tones = Q[sec['chords'][bar][1]]
            bs = song.get('bassStep', 1)
            dpat = song['fill'] if (bar == bars - 1 and 'fill' in song and 'drums' not in sec) else drums
            for s in range(16):
                st = step0 + bar * 16 + s
                b = bass[(s // bs) % len(bass)]
                if s % bs == 0 and b != '.':
                    ev.append((st, 'bass', root + (12 if b == 'O' else 7 if b == 'F' else 0), bs * .9))
                a = arp[s % len(arp)]
                if a != '.':
                    k = int(a)
                    tn = tones[k % len(tones)] + 12 * (k // len(tones))
                    ev.append((st, 'arp', root + 12 * song['arpOct'] + tn, .8))
                dd = dpat[s % len(dpat)]
                if dd != '.': ev.append((st, 'drum', dd, 0))
        i = 0
        while i < len(lead) and i < bars * 16:
            tok = lead[i]
            if tok not in ('-', '.'):
                ln = 1
                while i + ln < len(lead) and lead[i + ln] == '-': ln += 1
                ev.append((step0 + i, 'lead', note(tok) + transpose, ln))
            i += 1
        step0 += bars * 16
    return ev, step0


def render_song(name, transpose):
    song = DATA['SONGS'][name]
    ev, steps = compile_song(song, transpose)
    sd = 60.0 / song['bpm'] / 4
    loops = max(1, int(np.ceil(SONG_MIN_SECONDS / (steps * sd))))
    length = loops * steps * sd
    bus = Bus(length + 2, CD_RATE, seed=len(name))
    for lp in range(loops):
        for st, ch, n, ln in ev:
            t = (lp * steps + st) * sd
            if ch == 'bass': bus.tone(mtof(n), d=sd * ln, v=.22, typ='triangle', at=t, sus=True)
            elif ch == 'arp': bus.tone(mtof(n), d=sd * ln, v=.045, typ=song.get('arpWave', 'square'), at=t)
            elif ch == 'lead':
                bus.tone(mtof(n), d=max(.08, sd * ln * .92), v=.12 if song.get('leadWave') == 'sine' else .07,
                         typ=song.get('leadWave', 'square'), at=t, sus=True, vib=bool(song.get('leadVib')) or ln > 3)
            elif n == 'k': bus.tone(150, to=40, d=.12, v=.35, typ='sine', at=t)
            elif n == 's':
                bus.noise(d=.12, v=.16, f=3500, at=t)
                bus.tone(200, to=120, d=.06, v=.08, typ='triangle', at=t)
            elif n == 'h': bus.noise(d=.03, v=.06, typ='highpass', f=7000, at=t)
            elif n == 'o': bus.noise(d=.12, v=.05, typ='highpass', f=6000, at=t)
    L = int(round(length * CD_RATE))
    out = bus.buf
    out[:len(out) - L] += out[L:]          # fold the tail onto the start so it loops cleanly
    out = out[:L] * .55 * .7
    out = filt(out, 'lowpass', 6000, CD_RATE)
    out *= .89 / max(1e-6, np.abs(out).max())
    return np.stack([out, out], axis=1)


# ---------------------------------------------------------------- sound effects (js/audio.js SFX)
def render_sfx(name):
    b = Bus(2.0, SFX_RATE, seed=sum(map(ord, name)))
    if name == 'move': b.tone(900, d=.018, v=.035 * 2.5)
    elif name == 'rotate': b.tone(600, to=1000, d=.04, v=.05 * 2)
    elif name == 'kick': b.tone(500, to=1600, d=.08, v=.06 * 1.5, typ='sawtooth')
    elif name == 'lock':
        b.tone(180, to=90, d=.07, v=.14, typ='triangle'); b.noise(d=.04, v=.06, f=1800)
    elif name == 'hard':                     # the prototype's hard drop "teleport"
        b.tone(2400, to=300, d=.09, v=.1); b.noise(d=.09, v=.1, typ='bandpass', f=6000, to=800, q=3)
        b.tone(160, to=45, d=.12, v=.25, typ='triangle', at=.03)
    elif name == 'hold': b.arp(['G5', 'D6'], .035, d=.05, v=.07)
    elif name in ('clear1', 'clear2', 'clear3'):
        sets = [['C5', 'E5'], ['C5', 'E5', 'G5'], ['C5', 'E5', 'G5', 'C6']]
        b.arp(sets[int(name[-1]) - 1], .045, d=.09, v=.12); b.noise(d=.2, v=.05, typ='highpass', f=4000)
    elif name == 'clear4':
        b.arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], .04, d=.12, v=.12)
        b.arp(['C4', 'G4', 'C5'], .09, d=.25, v=.1, typ='sawtooth'); b.noise(d=.5, v=.08, typ='highpass', f=5000)
    elif name == 'tspin':
        b.tone(200, to=1600, d=.35, v=.12, typ='sawtooth')
        b.arp(['E6', 'G#6', 'B6', 'E7'], .05, d=.1, v=.06, typ='triangle')
    elif name == 'combo': b.arp(['B5', 'E6'], .07, d=.25, v=.09)
    elif name == 'garbage':
        b.noise(d=.25, v=.22, f=700, to=120); b.tone(70, to=35, d=.25, v=.3, typ='sawtooth')
    elif name == 'level': b.arp(['C6', 'E6', 'G6', 'C7'], .07, d=.12, v=.1)
    elif name == 'topout':
        b.tone(440, to=55, d=.9, v=.18, typ='sawtooth'); b.noise(d=.9, v=.18, f=2000, to=100)
    elif name == 'menu': b.tone(1320, d=.04, v=.08 * 1.5)
    elif name == 'beep': b.tone(660, d=.15, v=.14)
    elif name == 'go': b.tone(1320, d=.4, v=.14, sus=True)
    # card abilities (js/audio.js ab_glare, boulder, defense_eyebeam, ab_echo)
    elif name == 'cast':
        b.tone(300, to=1600, d=.25, v=.1, typ='triangle'); b.tone(1600, d=.4, v=.07, typ='sine', at=.25, vib=True)
    elif name == 'boulder':
        b.tone(120, to=30, d=.35, v=.3, typ='triangle'); b.noise(d=.3, v=.2, f=400)
    elif name == 'beam':
        b.tone(2200, to=200, d=.5, v=.14, typ='sawtooth'); b.noise(d=.5, v=.14, typ='bandpass', f=3000, to=400, q=3)
    elif name == 'echo':
        for i in range(4): b.tone(1200, to=2400, d=.15, v=.1 * .6 ** i, at=i * .12)
    elif name == 'deny':
        b.tone(150, d=.07, v=.1, typ='triangle'); b.tone(110, d=.1, v=.1, typ='triangle', at=.09)
    # Phantom Reel (js/audio.js holo, perk_freeze, holoSet)
    elif name == 'holo':                     # a hologram brick materializes
        b.arp(['C6', 'G6', 'C7', 'G7'], .05, d=.3, v=.07, typ='sine', vib=True)
        b.noise(d=.4, v=.06, typ='bandpass', f=5000, q=6)
    elif name == 'freeze':                   # frozen in place: crystal "shing"
        b.tone(3000, to=900, d=.15, v=.08, typ='sawtooth')
        for k, n in enumerate(['E7', 'B6', 'G#6']): b.tone(mtof(note(n)), d=.5, v=.06, typ='sine', at=.05 + k * .04)
        b.noise(d=.25, v=.1, typ='highpass', f=6000)
    elif name == 'holoset':                  # set on the floor without being frozen
        b.tone(1200, to=300, d=.2, v=.08, typ='sine')
    # Origami Crane (js/audio.js perk_fold, perk_earlyFold, fold)
    elif name == 'fold':                     # the held garbage folds over
        b.tone(200, to=900, d=.3, v=.08, typ='sawtooth'); b.noise(d=.3, v=.08, typ='bandpass', f=600, to=3000, q=4)
    elif name == 'earlyfold':                # ...early, by the perk
        b.tone(100, to=1600, d=.45, v=.12, typ='sawtooth'); b.tone(104, to=1700, d=.45, v=.1, typ='square')
        b.noise(d=.5, v=.12, typ='bandpass', f=400, to=5000, q=5)
    elif name == 'foldin':                   # folded garbage lands on you
        b.noise(d=.6, v=.2, typ='bandpass', f=300, to=3000, q=3); b.tone(80, to=300, d=.6, v=.1, typ='sawtooth')
    # Gold Ledger (js/audio.js interest, bankHit, perk_withdraw)
    elif name == 'interest': b.arp(['B5', 'E6'], .07, d=.25, v=.09)
    elif name == 'bankhit': b.arp(['E5', 'C5', 'A4'], .05, d=.08, v=.09)
    elif name == 'withdraw':                 # ka-ching
        b.noise(d=.08, v=.2, typ='bandpass', f=2500, q=3)
        b.tone(2093, d=.5, v=.1, typ='square', at=.08); b.tone(2637, d=.6, v=.08, typ='square', at=.12)
        b.tone(120, to=60, d=.4, v=.2, typ='triangle', at=.15)
    # Time Capsule (js/audio.js perk_mark, jump)
    elif name == 'mark':                     # camera shutter
        b.noise(d=.03, v=.25, typ='highpass', f=3000); b.noise(d=.05, v=.2, typ='bandpass', f=1500, q=2, at=.07)
        b.tone(2000, d=.08, v=.06, at=.12)
    elif name == 'jump':                     # rewind
        b.tone(1800, to=150, d=.4, v=.12, typ='sawtooth'); b.noise(d=.4, v=.08, typ='bandpass', f=4000, to=300, q=4)
    # Ace of Stars (js/audio.js perk_spin, lever)
    elif name == 'spin':                     # lever clunk, then the reels clicking until they stop (1.2 s)
        b.tone(140, to=70, d=.15, v=.25, typ='triangle'); b.noise(d=.1, v=.15, f=900)
        for i in range(16): b.noise(d=.02, v=.09, typ='highpass', f=3000, at=.15 + i * (.05 + i * .002))
    elif name == 'jackpot':
        for k, n in enumerate(['C6', 'E6', 'G6', 'C7', 'G6', 'C7']): b.tone(mtof(note(n)), d=.12, v=.1, at=k * .07)
    elif name == 'cherries':
        b.tone(mtof(note('A6')), d=.2, v=.1); b.tone(mtof(note('E7')), d=.3, v=.08, at=.08)
    elif name == 'bust':
        b.tone(150, d=.45, v=.14, typ='sawtooth', sus=True); b.tone(142, d=.45, v=.14, typ='sawtooth', sus=True)
    x = b.buf * 4.5
    x = filt(x, 'lowpass', 6000, SFX_RATE)
    pk = np.abs(x).max()
    if pk > .95: x *= .95 / pk
    nz = np.nonzero(np.abs(x) > 1e-4)[0]
    return x[:nz[-1] + 1] if len(nz) else x[:1]

def write_wav(path, x, rate):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    x = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    w = wave.open(path, 'wb')
    w.setnchannels(1 if x.ndim == 1 else x.shape[1])
    w.setsampwidth(2)
    w.setframerate(rate)
    w.writeframes(x.tobytes())
    w.close()


def read_wav(path):
    w = wave.open(path)
    ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(n)
    w.close()
    if sw == 2: x = np.frombuffer(raw, '<i2').astype(float) / 32768
    elif sw == 1: x = (np.frombuffer(raw, 'u1').astype(float) - 128) / 128
    elif sw == 3:
        b = np.frombuffer(raw, 'u1').reshape(-1, 3).astype(np.int32)
        x = ((b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)) << 8 >> 8) / 8388608.0
    else: x = np.frombuffer(raw, '<i4').astype(float) / 2147483648.0
    return x.reshape(-1, ch).mean(axis=1), fr

# ---------------------------------------------------------------- ADPCM-A
STEPS = [16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130,
         143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
         876, 963, 1060, 1166, 1282, 1411, 1552]
INC = [-1, -1, -1, -1, 2, 5, 7, 9]
# delta for (step index, nibble)
DELTA = [[((2 * (n & 7) + 1) * s // 8) * (-1 if n & 8 else 1) for n in range(16)] for s in STEPS]


def adpcma_encode(x):
    """x in -1..1 at the chip rate -> bytes (high nibble first), padded to 256 bytes."""
    target = np.clip(np.round(x * 2047), -2048, 2047).astype(int).tolist()
    target += [0] * ((-len(target)) % 512)            # pad with silence: 512 nibbles = 256 bytes
    acc, idx, nibs = 0, 0, []
    for v in target:
        best, bn = None, 0
        row = DELTA[idx]
        for n in range(16):
            a = acc + row[n]
            if a > 2047 or a < -2048: continue        # the chip would wrap round
            e = abs(v - a)
            if best is None or e < best: best, bn = e, n
        acc += row[bn]
        idx = min(48, max(0, idx + INC[bn & 7]))
        nibs.append(bn)
    return bytes((nibs[i] << 4) | nibs[i + 1] for i in range(0, len(nibs), 2))


def adpcma_decode(data):
    acc, idx, out = 0, 0, []
    for b in data:
        for n in (b >> 4, b & 15):
            acc = ((acc + DELTA[idx][n] + 2048) & 0xfff) - 2048
            idx = min(48, max(0, idx + INC[n & 7]))
            out.append(acc)
    return np.array(out) / 2048.0


def resample(x, fr, to):
    if fr == to: return x
    n = int(round(len(x) * to / float(fr)))
    if fr > to: x = filt(x, 'lowpass', to * .45, fr)
    return np.interp(np.arange(n) * (fr / float(to)), np.arange(len(x)), x)


def build_chip():
    pcm = bytearray()
    entries = []
    report = []
    for name in SFX:
        path = os.path.join(ASSETS, 'sfx', name + '.wav')
        x, fr = read_wav(path)
        x = resample(x, fr, SFX_RATE)
        if len(x) > 2 * SFX_RATE:
            print('  note: %s.wav is %.1f s, cut to 2 s' % (name, len(x) / float(SFX_RATE)))
            x = x[:2 * SFX_RATE] * np.minimum(1, (2 * SFX_RATE - np.arange(2 * SFX_RATE)) / 400.0)
        data = adpcma_encode(x)
        start = len(pcm) // 256
        pcm += data
        end = len(pcm) // 256 - 1
        entries.append((start, end))
        y = adpcma_decode(data)[:len(x)]
        snr = 10 * np.log10((x ** 2).sum() / max(((x - y) ** 2).sum(), 1e-12))
        report.append('  %-10s %5.2f s  %6d bytes  SNR %4.1f dB' % (name, len(x) / float(SFX_RATE), len(data), snr))
    if len(pcm) > 512 * 1024:
        print('WARNING: sound effects use %d KB, over the 512 KB budget' % (len(pcm) // 1024))
    if len(pcm) > 1024 * 1024:
        sys.exit('ERROR: sound effects are over the 1 MB of sound memory')

    z80 = bytearray(open(os.path.join(ASSETS, 'sounds', 'ngfx_driver.z80'), 'rb').read())
    for a in range(TABLE, TABLE + 0x800): z80[a] = 0                  # drop the sample's old table
    if len(entries) * len(PANS) > 0x800 // 16:
        sys.exit('ERROR: %d driver commands, the table holds 128 (0x20-0x9f)' % (len(entries) * len(PANS)))
    k = 0
    for (start, end) in entries:
        for bits, _ in PANS:
            e = TABLE + 16 * k
            z80[e] = 1                                                 # ADPCM-A, any free channel
            z80[e + 1] = bits | 0x1f                                   # pan + volume 31
            z80[e + 6:e + 8] = bytes([start & 255, start >> 8])
            z80[e + 8:e + 10] = bytes([end & 255, end >> 8])
            k += 1
    os.makedirs(os.path.join(ASSETS, 'sounds'), exist_ok=True)
    open(os.path.join(ASSETS, 'sounds', PCM_NAME), 'wb').write(bytes(pcm))
    open(os.path.join(ASSETS, 'sounds', Z80_NAME), 'wb').write(bytes(z80))

    h = ['/* Generated by tools/make_audio.py - do not edit. */',
         '#ifndef TT_SOUND_IDS_H', '#define TT_SOUND_IDS_H', '',
         '/* sound effects, in the order of the driver table (3 commands each: L, C, R) */',
         'enum {']
    h += ['    SND_%s,' % n.upper() for n in SFX]
    h += ['    SND_COUNT', '};', '', '#define SND_CMD_BASE 0x%02x' % CMD_BASE,
          '#define SND_CMD(id, pan) ((BYTE)(SND_CMD_BASE + (id) * 3 + (pan)))   /* pan 0 left, 1 centre, 2 right */',
          '#define SND_NAMES ' + ', '.join('"%s"' % n for n in SFX) + '   /* file names, for the PC harness */',
          '', '#endif', '']
    open(os.path.join(SRC, 'sound_ids.h'), 'w', newline='\n').write('\n'.join(h))
    print('\n'.join(report))
    print('  sound memory: %d KB of 512 KB budget, %d driver commands (0x%02x-0x%02x)'
          % (len(pcm) // 1024, k, CMD_BASE, CMD_BASE + k - 1))


def own_song(slot):
    """music/<slot>.<ext> if the user has put one there"""
    for ext in MUSIC_EXTS:
        p = os.path.join(MUSIC, slot + ext)
        if os.path.exists(p): return p
    return None


def import_song(src, dst):
    """the user's song -> 44.1 kHz 16-bit stereo WAV, about -14 LUFS like the placeholders"""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    ff = shutil.which('ffmpeg')
    if ff:
        r = subprocess.run([ff, '-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vn', '-map_metadata', '-1',
                            '-af', 'loudnorm=I=-14:TP=-1.0:LRA=11', '-ar', str(CD_RATE), '-ac', '2',
                            '-c:a', 'pcm_s16le', '-f', 'wav', dst])
        if r.returncode: sys.exit('ffmpeg could not convert %s' % src)
        return
    if not src.lower().endswith('.wav'):
        sys.exit('%s: install ffmpeg to use .%s files (or use a WAV)' % (src, src.rsplit('.', 1)[-1]))
    # no ffmpeg: a plain resample of a WAV, peak-levelled
    from scipy.signal import resample_poly
    w = wave.open(src)
    ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
    raw = w.readframes(n)
    w.close()
    if sw != 2: sys.exit('%s: 16-bit WAV please (or install ffmpeg)' % src)
    x = np.frombuffer(raw, '<i2').astype(float).reshape(-1, ch) / 32768
    x = x[:, :2] if ch >= 2 else np.repeat(x, 2, axis=1)
    if fr != CD_RATE:
        from math import gcd
        g = gcd(CD_RATE, fr)
        x = resample_poly(x, CD_RATE // g, fr // g, axis=0)
    peak = np.abs(x).max()
    if peak > 0: x = x * (0.89 / peak)
    write_wav(dst, x, CD_RATE)


def wav_seconds(p):
    w = wave.open(p)
    t = w.getnframes() / float(w.getframerate())
    w.close()
    return t


def main():
    force = '--force' in sys.argv
    if '--build' not in sys.argv:
        for name in SFX:
            p = os.path.join(ASSETS, 'sfx', name + '.wav')
            if force or not os.path.exists(p):
                write_wav(p, render_sfx(name), SFX_RATE)
                print('  made sfx/%s.wav' % name)
        slots = [f.split('_', 1)[1] for f, _, _ in TRACKS]
        if os.path.isdir(MUSIC):
            for f in sorted(os.listdir(MUSIC)):
                stem, ext = os.path.splitext(f)
                if ext.lower() in MUSIC_EXTS and stem not in slots:
                    print('  WARNING: music/%s is not used (name it one of: %s)' % (f, ', '.join(slots)))
        total = 0.0
        for fname, song, tr in TRACKS:
            p = os.path.join(ASSETS, 'cdda', fname + '.wav')
            mine = own_song(fname.split('_', 1)[1])
            if mine:
                if force or not os.path.exists(p) or os.path.getmtime(mine) > os.path.getmtime(p):
                    print('  your song music/%s -> cdda/%s.wav' % (os.path.basename(mine), fname))
                    sys.stdout.flush()
                    import_song(mine, p)
            elif force or not os.path.exists(p):
                print('  rendering cdda/%s.wav ...' % fname)
                sys.stdout.flush()
                write_wav(p, render_song(song, tr), CD_RATE)
            total += wav_seconds(p)
        print('  CD audio: %d:%02d of about %d:00' % (total // 60, total % 60, CD_AUDIO_MAX_MINUTES))
        if total > CD_AUDIO_MAX_MINUTES * 60:
            sys.exit('the songs are too long for the disc: shorten some of them')
    print('Building sound-chip files')
    build_chip()


if __name__ == '__main__':
    main()
