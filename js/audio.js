// Placeholder sound effects and chiptune music, all synthesized with Web Audio (no sound files).
// It only listens: every frame it looks at the current screen and the players' state and plays
// sounds for what changed, so board.js / ai.js stay free of browser code.
// Swap-in later: real samples can replace any entry in SFX, and real tracks any entry in SONGS.
(function (G) {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var ctx = null, master, musicBus, sfxBus, noiseBuf;
  var MODE_KEY = 'spacbrack-sound';
  var MODES = ['ALL ON', 'MUSIC OFF', 'ALL OFF'];
  var mode = 0;
  try { mode = Math.max(0, Math.min(2, parseInt(localStorage.getItem(MODE_KEY), 10) || 0)); } catch (e) { }

  function init() {
    if (ctx || !AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.7;
    var comp = ctx.createDynamicsCompressor();
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applyMode();
  }
  // iPhone/iPad: Web Audio is muted by the ring/silent switch unless an <audio> element is playing,
  // so a silent looping clip is started on the first tap to put the page in "media playback" mode.
  var silentEl = null;
  function silentWav() {
    var n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
    str(36, 'data'); dv.setUint32(40, n, true);
    for (var i = 0; i < n; i++) buf[44 + i] = 128;
    var s = ''; for (var j = 0; j < buf.length; j++) s += String.fromCharCode(buf[j]);
    return 'data:audio/wav;base64,' + btoa(s);
  }
  function unlock() {
    init();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().catch(function () { });
    // a tiny blip through the context also helps older mobile browsers wake it
    try { var b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0); } catch (e) { }
    if (!silentEl) {
      try { silentEl = new Audio(silentWav()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); } catch (e) { silentEl = false; }
    }
    if (silentEl && silentEl.paused) { var pr = silentEl.play(); if (pr && pr.catch) pr.catch(function () { }); }
  }
  // Browsers only count some events as a real "user gesture": on phones it's when the finger
  // lifts (touchend / pointerup / click), not when it lands.
  ['keydown', 'keyup', 'mousedown', 'pointerup', 'touchend', 'click'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true });
  });
  // Coming back to the tab can leave the context suspended.
  document.addEventListener('visibilitychange', function () { if (!document.hidden && ctx && ctx.state !== 'running') ctx.resume().catch(function () { }); });
  function applyMode() {
    if (!ctx) return;
    musicBus.gain.value = mode === 0 ? 0.55 : 0;
    sfxBus.gain.value = mode === 2 ? 0 : 0.9;
  }
  function ready() { return ctx && ctx.state === 'running'; }

  // ---------- synth voices ----------
  function NOTE(n) {
    if (typeof n === 'number') return n;
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) return 0;
    var semi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + semi;          // MIDI number
  }
  function hz(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

  function out(bus, pan) {
    if (pan && ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(bus); return p; }
    return bus;
  }
  // tone: o = {f, to, type, v, d, at, a, pan, bus}
  function tone(o) {
    var t = o.at || ctx.currentTime, d = o.d || 0.1, v = o.v == null ? 0.2 : o.v;
    var osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + d);
    if (o.vib) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.5; lg.gain.value = o.f * 0.012;
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + d + 0.05);
    }
    var a = o.a || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    if (o.sus) { g.gain.setValueAtTime(v, t + d * 0.7); }
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    osc.connect(g); g.connect(out(o.bus || sfxBus, o.pan));
    osc.start(t); osc.stop(t + d + 0.02);
  }
  // noise: o = {d, v, at, f (filter), q, type, to, pan, bus}
  function noise(o) {
    var t = o.at || ctx.currentTime, d = o.d || 0.1;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.loop = true;
    var flt = ctx.createBiquadFilter(); flt.type = o.type || 'lowpass';
    flt.frequency.setValueAtTime(o.f || 2000, t);
    if (o.to) flt.frequency.exponentialRampToValueAtTime(o.to, t + d);
    flt.Q.value = o.q || 0.7;
    var g = ctx.createGain();
    g.gain.setValueAtTime(o.v == null ? 0.2 : o.v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.connect(flt); flt.connect(g); g.connect(out(o.bus || sfxBus, o.pan));
    src.start(t, Math.random() * 0.5); src.stop(t + d + 0.02);
  }
  function arp(notes, step, o) {
    var t0 = ctx.currentTime;
    notes.forEach(function (n, i) {
      tone(Object.assign({ f: hz(NOTE(n)), d: step * 1.6, v: 0.14 }, o, { at: t0 + i * step }));
    });
  }

  // ---------- sound effects (placeholders) ----------
  // o = {pan, v (volume scale), n (count), result}
  var SFX = {
    blip: function (o) { tone({ f: 1320, d: 0.04, v: 0.08 * o.v }); },
    ok: function (o) { arp(['E6', 'B6'], 0.04, { d: 0.06, v: 0.1 * o.v }); },
    back: function (o) { arp(['B5', 'E5'], 0.04, { d: 0.06, v: 0.1 * o.v }); },
    talk: function (o) { tone({ f: o.f || 520, d: 0.03, v: 0.05, type: 'square' }); },
    step: function (o) { noise({ d: 0.07, v: 0.18, f: 500, at: o.at }); tone({ f: 90, to: 50, d: 0.07, v: 0.12, type: 'triangle', at: o.at }); },
    move: function (o) { tone({ f: 900, d: 0.018, v: 0.035 * o.v, pan: o.pan }); },
    rotate: function (o) { tone({ f: 600, to: 1000, d: 0.04, v: 0.05 * o.v, pan: o.pan }); },
    kick: function (o) { tone({ f: 500, to: 1600, d: 0.08, v: 0.06 * o.v, type: 'sawtooth', pan: o.pan }); },
    lock: function (o) {
      tone({ f: 180, to: 90, d: 0.07, v: 0.14 * o.v, type: 'triangle', pan: o.pan });
      noise({ d: 0.04, v: 0.06 * o.v, f: 1800, pan: o.pan });
    },
    drop: function (o) {
      noise({ d: 0.14, v: 0.14 * o.v, f: 3000, to: 300, pan: o.pan });
      tone({ f: 220, to: 50, d: 0.14, v: 0.2 * o.v, type: 'triangle', pan: o.pan });
    },
    hold: function (o) { arp(['G5', 'D6'], 0.035, { d: 0.05, v: 0.07 * o.v, pan: o.pan }); },
    clear: function (o) {
      var sets = [['C5', 'E5'], ['C5', 'E5', 'G5'], ['C5', 'E5', 'G5', 'C6']];
      arp(sets[Math.min(3, o.n) - 1], 0.045, { d: 0.09, v: 0.12 * o.v, pan: o.pan });
      noise({ d: 0.2, v: 0.05 * o.v, type: 'highpass', f: 4000, pan: o.pan });
    },
    quad: function (o) {
      arp(['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'], 0.04, { d: 0.12, v: 0.12 * o.v, pan: o.pan });
      arp(['C4', 'G4', 'C5'], 0.09, { d: 0.25, v: 0.1 * o.v, type: 'sawtooth', pan: o.pan });
      noise({ d: 0.5, v: 0.08 * o.v, type: 'highpass', f: 5000, pan: o.pan });
    },
    warn: function (o) { tone({ f: 110, d: 0.09, v: 0.12 * o.v, pan: o.pan }); tone({ f: 104, d: 0.09, v: 0.12 * o.v, pan: o.pan, at: ctx.currentTime + 0.1 }); },
    garbage: function (o) {
      noise({ d: 0.25, v: 0.22 * o.v, f: 700, to: 120, pan: o.pan });
      tone({ f: 70, to: 35, d: 0.25, v: 0.3 * o.v, type: 'sawtooth', pan: o.pan });
    },
    topout: function (o) {
      tone({ f: 440, to: 55, d: 0.9, v: 0.18, type: 'sawtooth', pan: o.pan });
      noise({ d: 0.9, v: 0.18, f: 2000, to: 100, pan: o.pan });
    },
    cast: function (o) {
      tone({ f: 200, to: 1600, d: 0.35, v: 0.12 * o.v, type: 'sawtooth', pan: o.pan });
      arp(['E6', 'G#6', 'B6', 'E7'], 0.05, { d: 0.1, v: 0.06 * o.v, pan: o.pan, type: 'triangle' });
    },
    boulder: function (o) { tone({ f: 120, to: 30, d: 0.35, v: 0.3 * o.v, type: 'triangle', pan: o.pan }); noise({ d: 0.3, v: 0.2 * o.v, f: 400, pan: o.pan }); },
    jump: function (o) { tone({ f: 1800, to: 150, d: 0.4, v: 0.12 * o.v, type: 'sawtooth', pan: o.pan }); noise({ d: 0.4, v: 0.08 * o.v, type: 'bandpass', f: 4000, to: 300, q: 4, pan: o.pan }); },
    mark: function (o) { tone({ f: 2000, d: 0.05, v: 0.08 * o.v, pan: o.pan }); noise({ d: 0.08, v: 0.1 * o.v, type: 'highpass', f: 6000, pan: o.pan, at: ctx.currentTime + 0.05 }); },
    fold: function (o) { noise({ d: 0.6, v: 0.2 * o.v, type: 'bandpass', f: 300, to: 3000, q: 3, pan: o.pan }); tone({ f: 80, to: 300, d: 0.6, v: 0.1 * o.v, type: 'sawtooth', pan: o.pan }); },
    interest: function (o) { arp(['B5', 'E6'], 0.07, { d: 0.25, v: 0.09 * o.v, pan: o.pan }); },
    bankHit: function (o) { arp(['E5', 'C5', 'A4'], 0.05, { d: 0.08, v: 0.09 * o.v, pan: o.pan }); },
    lever: function (o) {
      var t0 = ctx.currentTime;
      for (var i = 0; i < 14; i++) noise({ d: 0.02, v: 0.08 * o.v, type: 'highpass', f: 3000, at: t0 + i * 0.07, pan: o.pan });
      var at = t0 + 1.0;
      if (o.result === 'jackpot') {
        ['C6', 'E6', 'G6', 'C7', 'G6', 'C7'].forEach(function (n, k) { tone({ f: hz(NOTE(n)), d: 0.12, v: 0.1 * o.v, at: at + k * 0.07, pan: o.pan }); });
      } else if (o.result === 'bust') {
        tone({ f: 150, d: 0.45, v: 0.14 * o.v, type: 'sawtooth', at: at, pan: o.pan, sus: 1 });
        tone({ f: 142, d: 0.45, v: 0.14 * o.v, type: 'sawtooth', at: at, pan: o.pan, sus: 1 });
      } else {
        tone({ f: hz(NOTE('A6')), d: 0.2, v: 0.1 * o.v, at: at, pan: o.pan });
        tone({ f: hz(NOTE('E7')), d: 0.3, v: 0.08 * o.v, at: at + 0.08, pan: o.pan });
      }
    },
    count: function () { tone({ f: 660, d: 0.15, v: 0.14, type: 'square' }); },
    go: function () { tone({ f: 1320, d: 0.4, v: 0.14, type: 'square', sus: 1 }); },
    tick: function (o) { tone({ f: o.last ? 1760 : 1100, d: 0.06, v: 0.1, type: 'square' }); },
    alarm: function () { tone({ f: 880, to: 440, d: 0.3, v: 0.1, type: 'sawtooth' }); },
    win: function () {
      var t0 = ctx.currentTime;
      [['C5', 0], ['E5', 0.12], ['G5', 0.24], ['C6', 0.36], ['A5', 0.6], ['C6', 0.72], ['D6', 0.84]].forEach(function (s) {
        tone({ f: hz(NOTE(s[0])), d: 0.14, v: 0.12, at: t0 + s[1], bus: sfxBus });
      });
      ['C5', 'E5', 'G5', 'D6'].forEach(function (n) { tone({ f: hz(NOTE(n)), d: 1.2, v: 0.07, at: t0 + 1.0, type: 'square', sus: 1, vib: 1 }); });
      tone({ f: hz(NOTE('C3')), d: 1.2, v: 0.15, at: t0 + 1.0, type: 'triangle', sus: 1 });
    },
    lose: function () {
      var t0 = ctx.currentTime;
      [['G4', 0], ['F#4', 0.25], ['F4', 0.5]].forEach(function (s) { tone({ f: hz(NOTE(s[0])), d: 0.24, v: 0.12, at: t0 + s[1], type: 'square' }); });
      tone({ f: hz(NOTE('E4')), d: 1.2, v: 0.12, at: t0 + 0.75, type: 'square', sus: 1, vib: 1 });
      tone({ f: hz(NOTE('C3')), to: hz(NOTE('C2')), d: 1.4, v: 0.15, at: t0 + 0.75, type: 'triangle', sus: 1 });
    }
  };

  function play(name, o) {
    if (!ready() || mode === 2 || !SFX[name]) return;
    o = o || {}; if (o.v == null) o.v = 1;
    SFX[name](o);
  }

  // ---------- music: tiny step sequencer ----------
  // Each song: bpm, chords (one per bar), bass/arp patterns over the chord, drum pattern (one bar),
  // and an optional lead line (one token per 16th: note, '-' = keep holding, '.' = rest).
  // C = chord tones as MIDI offsets; written as [root note, quality].
  var Q = { min: [0, 3, 7], maj: [0, 4, 7], m7: [0, 3, 7, 10], M7: [0, 4, 7, 11], dom: [0, 4, 7, 10], sus: [0, 5, 7] };
  var SONGS = {
    title: {
      bpm: 128,
      chords: [['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['E2', 'dom']],
      bass: 'R.ROR.ROR.ROR.RO', arp: '0123', arpOct: 2, drums: 'k.h.s.h.k.hks.ho',
      lead: 'A4 - - - C5 - E5 - D5 - - C5 B4 - G4 - ' + 'A4 - - - - - . . C5 - D5 - E5 - - - ' +
            'G5 - - - E5 - C5 - D5 - - E5 D5 - B4 - ' + 'C5 - - - - - B4 - G#4 - - - - - . . ' +
            'A4 - - - C5 - E5 - D5 - - C5 B4 - G4 - ' + 'A4 - - - - - . . C5 - D5 - E5 - G5 - ' +
            'A5 - - - G5 - E5 - G5 - - E5 D5 - C5 - ' + 'B4 - - - - - - - G#4 - - - B4 - - - '
    },
    map: {
      bpm: 92,
      chords: [['C3', 'M7'], ['A2', 'm7'], ['F2', 'M7'], ['G2', 'dom']],
      bass: 'R...O...R...F...', arp: '0213', arpOct: 2, arpWave: 'triangle', drums: 'k...h...s...h..h',
      lead: 'E5 - - - - - G5 - - - - - - - . . ' + 'C5 - - - - - E5 - - - D5 - - - . . ' +
            'A4 - - - C5 - - - E5 - - - D5 - C5 - ' + 'B4 - - - - - - - D5 - - - - - . . ',
      leadWave: 'triangle'
    },
    explore: {
      bpm: 84,
      chords: [['D3', 'm7'], ['E3', 'm7'], ['D3', 'm7'], ['C3', 'M7']],
      bass: 'R.....R...O.....', arp: '0.2.1.3.', arpOct: 2, arpWave: 'triangle', drums: 'k.......s.....h.',
      lead: 'F5 - - - - - - - . . A5 - G5 - - - ' + 'E5 - - - - - - - . . . . . . . . ' +
            'D5 - - - F5 - - - A5 - - - C6 - - - ' + 'B5 - - - - - - - G5 - - - - - . . ',
      leadWave: 'sine', leadVib: 1
    },
    battle: {
      bpm: 150,
      chords: [['E2', 'min'], ['C2', 'maj'], ['D2', 'maj'], ['B1', 'maj'], ['E2', 'min'], ['C2', 'maj'], ['A1', 'min'], ['B1', 'dom']],
      bass: 'RRORRROR', bassStep: 2, arp: '012', arpOct: 3, drums: 'k.hsk.hsk.hsk.ss',
      lead: 'E5 - - - G5 - - - F#5 - E5 - D5 - B4 - ' + 'C5 - - - E5 - G5 - - - E5 - - - . . ' +
            'D5 - - - F#5 - A5 - - - F#5 - D5 - - - ' + 'D#5 - - - - - - - F#5 - - - B5 - - - ' +
            'E5 - - - G5 - - - B5 - A5 - G5 - E5 - ' + 'G5 - - - - - E5 - C5 - - - - - . . ' +
            'A4 - - - C5 - E5 - A5 - - - G5 - E5 - ' + 'F#5 - - - - - - - D#5 - - - B4 - - - '
    },
    boss: {
      bpm: 164,
      chords: [['C2', 'min'], ['Ab1', 'maj'], ['Bb1', 'maj'], ['G1', 'dom'], ['C2', 'min'], ['Ab1', 'maj'], ['F1', 'min'], ['G1', 'dom']],
      bass: 'RORORORORORORORO', arp: '0120', arpOct: 3, arpWave: 'sawtooth', drums: 'kkhskkhskkhskshs',
      lead: 'C5 - - Eb5 - - G5 - C6 - - - Bb5 - Ab5 - ' + 'Ab5 - - - G5 - Eb5 - C5 - - - - - . . ' +
            'Bb4 - - D5 - - F5 - Bb5 - - - Ab5 - G5 - ' + 'G5 - - - - - F5 - D5 - B4 - - - . . ' +
            'C5 - - Eb5 - - G5 - C6 - - - D6 - Eb6 - ' + 'C6 - - - Ab5 - - - Eb5 - - - - - . . ' +
            'F5 - - - Ab5 - - - C6 - - - Bb5 - Ab5 - ' + 'G5 - - - - - - - B5 - - - D6 - - - '
    }
  };

  function compile(song) {
    var ev = [], bars = song.chords.length;
    var lead = song.lead ? song.lead.trim().split(/\s+/) : [];
    for (var bar = 0; bar < bars; bar++) {
      var root = NOTE(song.chords[bar][0]) + (song.transpose || 0), tones = Q[song.chords[bar][1]];
      var bs = song.bassStep || 1;
      for (var s = 0; s < 16; s++) {
        var st = bar * 16 + s;
        // bass
        var b = song.bass[(s / bs | 0) % song.bass.length];
        if (s % bs === 0 && b !== '.') {
          var bn = root + (b === 'O' ? 12 : b === 'F' ? 7 : 0);
          ev.push({ st: st, ch: 'bass', n: bn, len: bs * 0.9 });
        }
        // arpeggio
        var a = song.arp[s % song.arp.length];
        if (a !== '.') {
          var k = parseInt(a, 10), tn = tones[k % tones.length] + 12 * Math.floor(k / tones.length);
          ev.push({ st: st, ch: 'arp', n: root + 12 * song.arpOct + tn, len: 0.8 });
        }
        // drums
        var d = song.drums[s % song.drums.length];
        if (d !== '.') ev.push({ st: st, ch: 'drum', d: d });
      }
    }
    // lead: hold notes over '-'
    for (var i = 0; i < lead.length && i < bars * 16; i++) {
      var tok = lead[i];
      if (tok === '-' || tok === '.') continue;
      var len = 1; while (lead[i + len] === '-') len++;
      ev.push({ st: i, ch: 'lead', n: NOTE(tok) + (song.transpose || 0), len: len });
    }
    ev.sort(function (x, y) { return x.st - y.st; });
    return { ev: ev, steps: bars * 16, song: song };
  }

  function voice(e, t, stepDur, song) {
    var bus = musicBus;
    if (e.ch === 'bass') tone({ f: hz(e.n), d: stepDur * e.len, v: 0.22, type: 'triangle', at: t, bus: bus, sus: 1 });
    else if (e.ch === 'arp') tone({ f: hz(e.n), d: stepDur * e.len, v: 0.045, type: song.arpWave || 'square', at: t, bus: bus });
    else if (e.ch === 'lead') tone({ f: hz(e.n), d: Math.max(0.08, stepDur * e.len * 0.92), v: song.leadWave === 'sine' ? 0.12 : 0.07, type: song.leadWave || 'square', at: t, bus: bus, sus: 1, vib: song.leadVib || e.len > 3 });
    else if (e.d === 'k') { tone({ f: 150, to: 40, d: 0.12, v: 0.35, type: 'sine', at: t, bus: bus }); }
    else if (e.d === 's') { noise({ d: 0.12, v: 0.16, f: 3500, at: t, bus: bus }); tone({ f: 200, to: 120, d: 0.06, v: 0.08, type: 'triangle', at: t, bus: bus }); }
    else if (e.d === 'h') noise({ d: 0.03, v: 0.06, type: 'highpass', f: 7000, at: t, bus: bus });
    else if (e.d === 'o') noise({ d: 0.12, v: 0.05, type: 'highpass', f: 6000, at: t, bus: bus });
  }

  var cur = null;          // {name, c: compiled, step, nextT, idx}
  var tempo = 1;
  function startSong(name, transpose) {
    var key = name + ':' + (transpose || 0);
    if (cur && cur.key === key) return;
    cur = null;
    if (!name || !SONGS[name]) return;
    var song = Object.assign({}, SONGS[name], { transpose: transpose || 0 });
    cur = { key: key, c: compile(song), step: 0, idx: 0, nextT: ctx.currentTime + 0.08 };
  }
  function pump() {
    if (!cur || !ready()) return;
    var c = cur.c, stepDur = 60 / (c.song.bpm * tempo) / 4;
    var ahead = ctx.currentTime + 0.15;
    if (cur.nextT < ctx.currentTime - 0.5) cur.nextT = ctx.currentTime + 0.05;   // tab was asleep: don't burst
    while (cur.nextT < ahead) {
      var st = cur.step % c.steps;
      if (st === 0) cur.idx = 0;
      while (cur.idx < c.ev.length && c.ev[cur.idx].st === st) { voice(c.ev[cur.idx], cur.nextT, stepDur, c.song); cur.idx++; }
      cur.step++; cur.nextT += stepDur;
    }
  }

  // ---------- watching the game ----------
  var mem = new WeakMap();
  var lastScreen = null, battleMem = null;
  var RULE_KEY = { launch: 0, chrono: 2, fold: -2, bank: 3, casino: 5 };

  function garbageRows(p) {
    var n = 0;
    for (var y = 0; y < p.grid.length; y++) if (p.grid[y].indexOf('G') >= 0) n++;
    return n;
  }
  function snap(p) {
    var pc = p.piece || {};
    return { lines: p.lines, pid: p.pieceId, x: pc.x, rot: pc.rot, y: pc.y, ghost: p.alive && p.piece ? p.ghostY() : 0,
      hold: p.holdType, pend: p.pendingRows ? p.pendingRows() : 0, gar: garbageRows(p), alive: p.alive, kick: p.kickFlash };
  }

  function watchPlayer(p, i, bt) {
    var m = mem.get(p);
    var now = snap(p);
    if (!m) { mem.set(p, now); return; }
    var human = !p.isCPU, pan = i ? 0.4 : -0.4;
    var o = { pan: pan, v: human ? 1 : 0.55 };
    (p.fxEvents || []).forEach(function (f) {
      if (f._snd) return; f._snd = 1;
      if (f.kind === 'lever') play('lever', Object.assign({ result: f.result }, o));
      else if (SFX[f.kind]) play(f.kind, o);
    });
    (p.flash || []).forEach(function (f) {
      if (f._snd) return; f._snd = 1;
      if (f.text === 'MARKED') play('mark', o);
      else if (f.text === 'COUNT BROKEN') play('alarm', o);
      else if (f.text === 'COUNTDOWN!') play('go', o);
    });
    var cleared = now.lines - m.lines;
    if (cleared > 0) play(cleared >= 4 ? 'quad' : 'clear', Object.assign({ n: cleared }, o));
    if (now.pid !== m.pid) {
      if (now.hold !== m.hold) { if (human) play('hold', o); }
      else if (m.y < m.ghost - 1) play('drop', o);
      else if (cleared <= 0) play('lock', o);
    } else if (human) {
      if (now.rot !== m.rot) play(now.kick > 0 && !m.kick ? 'kick' : 'rotate', o);
      else if (now.x !== m.x) play('move', o);
    }
    if (now.pend > m.pend && human) play('warn', o);
    if (now.gar > m.gar) play('garbage', o);
    if (m.alive && !now.alive) play('topout', o);
    mem.set(p, now);
  }

  function watchBattle(bt) {
    var bm = battleMem;
    if (!bm || bm.bt !== bt) bm = battleMem = { bt: bt, cd: Math.ceil(bt.countdown / 800), over: false, lt: null };
    // music: location battle theme (key changes by house rule), boss theme for bosses
    if (!bt.over) startSong(bt.cfg.boss ? 'boss' : 'battle', RULE_KEY[bt.rule] || 0);
    // tense: speed the music up a little when a human's stack is tall
    var tall = [bt.a, bt.b].some(function (p) { return !p.isCPU && p.alive && p.stackHeight && p.stackHeight() >= 14; });
    tempo = tall ? 1.12 : 1;
    musicBus && (musicBus.gain.value = mode === 0 ? (bt.paused ? 0.18 : 0.55) : 0);
    // 3-2-1-GO
    var n = bt.countdown > 0 ? Math.ceil(bt.countdown / 800) : 0;
    if (n !== bm.cd) { play(n > 0 ? 'count' : 'go'); bm.cd = n; }
    if (bt.countdown <= 0 && !bt.paused) { watchPlayer(bt.a, 0, bt); watchPlayer(bt.b, 1, bt); }
    // Launch Countdown: tick every second
    if (bt.launch) {
      var s = Math.ceil(bt.launch.t / 1000);
      if (s !== bm.lt) { if (bm.lt != null) play('tick', { last: s <= 3 }); bm.lt = s; }
    } else bm.lt = null;
    if (bt.over && !bm.over) {
      bm.over = true;
      cur = null;
      var w = bt.winner === 'a' ? bt.a : bt.b;
      var vsHuman = !bt.a.isCPU && !bt.b.isCPU;
      play(vsHuman || !w.isCPU ? 'win' : 'lose');
    }
  }

  var talkMem = { shown: 0 };
  function watchMenus(s, name) {
    var I = G.Input;
    if (name === 'Explore') {
      if (s.mode === 'talk' && s.talk) {
        var c = Math.floor(s.talk.shown);
        if (c !== talkMem.shown && c % 2 === 0 && c < s.talk.text.length) {
          var h = 0, nm = (s.talk.n && s.talk.n.name) || '';
          for (var k = 0; k < nm.length; k++) h = (h * 31 + nm.charCodeAt(k)) & 255;
          play('talk', { f: 320 + h * 2 + (c % 4) * 30 });
        }
        talkMem.shown = c;
      }
      if (s.mode === 'enter' && talkMem.mode !== 'enter' && ready()) {
        for (var st = 0; st < 3; st++) play('step', { at: ctx.currentTime + st * 0.26 });
      }
      talkMem.mode = s.mode;
      if (s.mode === 'walk') {
        if (I.any('pressed', 'ok')) play('ok');
        else if (I.any('pressed', 'back') || I.any('pressed', 'pause')) play('back');
        return;
      }
    }
    if (I.any('pressed', 'up') || I.any('pressed', 'down') || I.any('pressed', 'left') || I.any('pressed', 'right')) play('blip');
    if (I.any('pressed', 'ok')) play('ok');
    else if (I.any('pressed', 'back')) play('back');
  }

  var TRACK_FOR = { Title: 'title', Controls: 'title', VersusSetup: 'title', MapScreen: 'map', Explore: 'explore', Inventory: 'explore', CardResult: 'map' };

  function tick(dt, s) {
    if (!ctx) return;
    var name = s && s.constructor && s.constructor.name;
    if (name === 'Battle') watchBattle(s);
    else {
      tempo = 1;
      if (musicBus) musicBus.gain.value = mode === 0 ? 0.55 : 0;
      if (s !== lastScreen && !(name === 'CardResult')) startSong(TRACK_FOR[name]);
      if (name === 'CardResult' && lastScreen && lastScreen.constructor.name !== 'CardResult') startSong(null);
      watchMenus(s, name);
    }
    lastScreen = s;
    pump();
  }

  G.Audio = {
    tick: tick,
    play: play,
    locked: function () { return !ready(); },
    modeName: function () { return MODES[mode]; },
    cycleMode: function () {
      mode = (mode + 1) % 3;
      try { localStorage.setItem(MODE_KEY, String(mode)); } catch (e) { }
      applyMode();
    },
    SFX: SFX, SONGS: SONGS
  };
})(globalThis.G = globalThis.G || {});
