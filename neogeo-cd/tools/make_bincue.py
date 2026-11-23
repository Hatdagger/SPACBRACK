"""Turn NeoCore's ISO + WAV + CUE into a raw BIN/CUE (one BIN per track).

    python3 tools/make_bincue.py dist/.../cd/iso OUTDIR

The data track becomes MODE1/2352: every 2048-byte sector gets its sync
pattern, address header, EDC and ECC, the way a pressed CD stores it.  Each
audio track becomes raw 16-bit 44.1 kHz stereo PCM, with its 2-second pregap
stored as silence (INDEX 00).  This is the layout burners, MAME and SD loaders
expect from a BIN/CUE.
"""
import os, re, sys, wave

SECTOR = 2352
PREGAP = 150                     # 2 seconds of sectors

# ---- EDC/ECC tables (CD-ROM mode 1, Reed-Solomon over GF(2^8), poly 0x11D)
ECC_F = [0] * 256
ECC_B = [0] * 256
EDC = [0] * 256
for i in range(256):
    j = ((i << 1) ^ (0x11D if i & 0x80 else 0)) & 0xff
    ECC_F[i] = j
    ECC_B[i ^ j] = i
    e = i
    for _ in range(8):
        e = (e >> 1) ^ (0xD8018001 if e & 1 else 0)
    EDC[i] = e


def edc(data):
    e = 0
    for b in data:
        e = (e >> 8) ^ EDC[(e ^ b) & 0xff]
    return e


def ecc_block(s, base, major_count, minor_count, major_mult, minor_inc, dest):
    size = major_count * minor_count
    for major in range(major_count):
        index = (major >> 1) * major_mult + (major & 1)
        a = b = 0
        for _ in range(minor_count):
            t = s[base + index]
            index += minor_inc
            if index >= size: index -= size
            a ^= t
            b ^= t
            a = ECC_F[a]
        a = ECC_B[ECC_F[a] ^ b]
        s[dest + major] = a
        s[dest + major + major_count] = a ^ b


def bcd(n): return ((n // 10) << 4) | (n % 10)


def mode1_sector(lba, data):
    s = bytearray(SECTOR)
    s[0:12] = b'\x00' + b'\xff' * 10 + b'\x00'
    a = lba + 150
    s[12], s[13], s[14], s[15] = bcd(a // 4500), bcd(a // 75 % 60), bcd(a % 75), 1
    s[16:2064] = data
    s[2064:2068] = edc(s[0:2064]).to_bytes(4, 'little')
    ecc_block(s, 12, 86, 24, 2, 86, 2076)           # P parity
    ecc_block(s, 12, 52, 43, 86, 88, 2076 + 172)    # Q parity
    return bytes(s)


def msf(frames): return '%02d:%02d:%02d' % (frames // 4500, frames // 75 % 60, frames % 75)


def main(src, out):
    cue = [f for f in os.listdir(src) if f.lower().endswith('.cue')][0]
    name = os.path.splitext(cue)[0]
    files = re.findall(r'FILE "([^"]+)"', open(os.path.join(src, cue)).read())
    os.makedirs(out, exist_ok=True)
    lines = []
    for n, f in enumerate(files, 1):
        binname = '%s (Track %d).bin' % (name, n)
        with open(os.path.join(out, binname), 'wb') as o:
            if n == 1:
                iso = open(os.path.join(src, f), 'rb').read()
                iso += b'\0' * ((-len(iso)) % 2048)
                for lba in range(len(iso) // 2048):
                    o.write(mode1_sector(lba, iso[lba * 2048:(lba + 1) * 2048]))
                lines += ['FILE "%s" BINARY' % binname, '  TRACK 01 MODE1/2352', '    INDEX 01 00:00:00']
            else:
                w = wave.open(os.path.join(src, f))
                if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (2, 2, 44100):
                    sys.exit('%s must be 44.1 kHz 16-bit stereo' % f)
                pcm = w.readframes(w.getnframes())
                pcm += b'\0' * ((-len(pcm)) % SECTOR)
                o.write(b'\0' * (PREGAP * SECTOR))
                o.write(pcm)
                lines += ['FILE "%s" BINARY' % binname, '  TRACK %02d AUDIO' % n,
                          '    INDEX 00 00:00:00', '    INDEX 01 %s' % msf(PREGAP)]
        print('  %s  %.1f MB' % (binname, os.path.getsize(os.path.join(out, binname)) / 1048576.0))
    open(os.path.join(out, name + '.cue'), 'w', newline='\r\n').write('\n'.join(lines) + '\n')
    print('  %s.cue' % name)


if __name__ == '__main__':
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
