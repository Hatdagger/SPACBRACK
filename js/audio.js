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
      var at = ctx.currentTime;
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
    // hard drop teleport: a quick phase-out zap and a phase-in thump
    teleport: function (o) {
      tone({ f: 2400, to: 300, d: 0.09, v: 0.1 * o.v, type: 'square', pan: o.pan });
      noise({ d: 0.09, v: 0.1 * o.v, type: 'bandpass', f: 6000, to: 800, q: 3, pan: o.pan });
      tone({ f: 160, to: 45, d: 0.12, v: 0.25 * o.v, type: 'triangle', pan: o.pan, at: ctx.currentTime + 0.03 });
    },

    // ----- card abilities (one each) -----
    ab_boulder: function (o) { noise({ d: 0.3, v: 0.15 * o.v, f: 250, pan: o.pan }); tone({ f: 60, to: 120, d: 0.3, v: 0.2 * o.v, type: 'triangle', pan: o.pan }); },
    ab_rockslide: function (o) {
      noise({ d: 1.2, v: 0.2 * o.v, f: 300, to: 120, pan: o.pan });
      for (var i = 0; i < 6; i++) tone({ f: 90 - i * 6, to: 35, d: 0.15, v: 0.2 * o.v, type: 'triangle', pan: o.pan, at: ctx.currentTime + 0.1 + i * 0.16 });
    },
    ab_staredown: function (o) { tone({ f: 330, to: 110, d: 0.7, v: 0.16 * o.v, type: 'sine', pan: o.pan, vib: 1 }); tone({ f: 333, to: 112, d: 0.7, v: 0.1 * o.v, type: 'triangle', pan: o.pan }); },
    ab_glare: function (o) {
      tone({ f: 400, to: 3200, d: 0.25, v: 0.1 * o.v, type: 'sawtooth', pan: o.pan });
      tone({ f: 3200, d: 0.6, v: 0.06 * o.v, type: 'sine', pan: o.pan, at: ctx.currentTime + 0.25, vib: 1 });
    },
    ab_rattle: function (o) { for (var i = 0; i < 5; i++) noise({ d: 0.03, v: 0.2 * o.v, type: 'bandpass', f: 2200 + (i % 2) * 600, q: 6, pan: o.pan, at: ctx.currentTime + i * 0.05 }); },
    ab_bonepatch: function (o) { arp(['C5', 'E5', 'G5', 'B5'], 0.06, { type: 'triangle', d: 0.12, v: 0.16 * o.v, pan: o.pan }); },
    ab_shiver: function (o) { for (var i = 0; i < 12; i++) noise({ d: 0.025, v: 0.13 * o.v, type: 'bandpass', f: 1800 + Math.random() * 1500, q: 8, pan: o.pan, at: ctx.currentTime + i * 0.045 }); tone({ f: 220, d: 0.55, v: 0.07 * o.v, type: 'sine', vib: 1, pan: o.pan }); },
    ab_bonestorm: function (o) {
      for (var i = 0; i < 18; i++) noise({ d: 0.03, v: 0.16 * o.v, type: 'bandpass', f: 1500 + i * 150, q: 7, pan: o.pan, at: ctx.currentTime + i * 0.04 });
      tone({ f: 200, to: 1200, d: 0.75, v: 0.1 * o.v, type: 'sawtooth', pan: o.pan });
    },
    ab_claw3: function (o) { for (var i = 0; i < 3; i++) noise({ d: 0.12, v: 0.22 * o.v, type: 'bandpass', f: 7000, to: 900, q: 2, pan: o.pan, at: ctx.currentTime + i * 0.13 }); },
    ab_fur: function (o) { noise({ d: 0.5, v: 0.12 * o.v, f: 600, pan: o.pan }); tone({ f: 110, d: 0.5, v: 0.12 * o.v, type: 'triangle', sus: 1, pan: o.pan }); },
    ab_howl: function (o) {
      var t = ctx.currentTime, osc = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(300, t); osc.frequency.linearRampToValueAtTime(700, t + 0.35);
      osc.frequency.setValueAtTime(700, t + 0.8); osc.frequency.linearRampToValueAtTime(420, t + 1.2);
      lfo.frequency.value = 6; lg.gain.value = 12; lfo.connect(lg); lg.connect(osc.frequency);
      var flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 1600;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * o.v, t + 0.15); g.gain.setValueAtTime(0.12 * o.v, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.25);
      osc.connect(flt); flt.connect(g); g.connect(out(sfxBus, o.pan)); osc.start(t); lfo.start(t); osc.stop(t + 1.3); lfo.stop(t + 1.3);
    },
    ab_fullmoon: function (o) { ['E6', 'G#6', 'B6', 'E7'].forEach(function (n, k) { tone({ f: hz(NOTE(n)), d: 0.9, v: 0.06 * o.v, type: 'sine', at: ctx.currentTime + k * 0.08, vib: 1, pan: o.pan }); }); },
    ab_nightfall: function (o) { tone({ f: 500, to: 80, d: 0.9, v: 0.12 * o.v, type: 'sawtooth', pan: o.pan }); noise({ d: 0.9, v: 0.08 * o.v, f: 1200, to: 100, pan: o.pan }); },
    ab_roost: function (o) { for (var i = 0; i < 5; i++) noise({ d: 0.09, v: 0.18 * o.v, f: 900, pan: o.pan, at: ctx.currentTime + i * 0.13 }); },
    ab_sonar: function (o) { for (var i = 0; i < 4; i++) tone({ f: 1500, d: 0.25, v: 0.12 * o.v * Math.pow(0.5, i), type: 'sine', pan: o.pan, at: ctx.currentTime + i * 0.22 }); },
    ab_swarm: function (o) {
      for (var i = 0; i < 24; i++) tone({ f: 2500 + Math.random() * 2500, to: 1500 + Math.random() * 1000, d: 0.05, v: 0.06 * o.v, type: 'square', pan: (o.pan || 0) + (Math.random() - 0.5) * 0.6, at: ctx.currentTime + Math.random() * 0.9 });
      noise({ d: 0.9, v: 0.07 * o.v, type: 'bandpass', f: 3000, q: 2, pan: o.pan });
    },

    // ----- stage perks -----
    perk_deny: function (o) { tone({ f: 120, d: 0.18, v: 0.13 * o.v, type: 'square', pan: o.pan, sus: 1 }); tone({ f: 127, d: 0.18, v: 0.1 * o.v, type: 'square', pan: o.pan, sus: 1 }); },
    perk_mark: function (o) {   // camera shutter
      noise({ d: 0.03, v: 0.25 * o.v, type: 'highpass', f: 3000, pan: o.pan });
      noise({ d: 0.05, v: 0.2 * o.v, type: 'bandpass', f: 1500, q: 2, pan: o.pan, at: ctx.currentTime + 0.07 });
      tone({ f: 2000, d: 0.08, v: 0.06 * o.v, pan: o.pan, at: ctx.currentTime + 0.12 });
    },
    perk_withdraw: function (o) {   // ka-ching
      noise({ d: 0.08, v: 0.2 * o.v, type: 'bandpass', f: 2500, q: 3, pan: o.pan });
      tone({ f: 2093, d: 0.5, v: 0.1 * o.v, type: 'square', pan: o.pan, at: ctx.currentTime + 0.08 });
      tone({ f: 2637, d: 0.6, v: 0.08 * o.v, type: 'square', pan: o.pan, at: ctx.currentTime + 0.12 });
      tone({ f: 120, to: 60, d: 0.4, v: 0.2 * o.v, type: 'triangle', pan: o.pan, at: ctx.currentTime + 0.15 });
    },
    perk_earlyFold: function (o) {
      tone({ f: 100, to: 1600, d: 0.45, v: 0.12 * o.v, type: 'sawtooth', pan: o.pan });
      tone({ f: 104, to: 1700, d: 0.45, v: 0.1 * o.v, type: 'square', pan: o.pan });
      noise({ d: 0.5, v: 0.12 * o.v, type: 'bandpass', f: 400, to: 5000, q: 5, pan: o.pan });
    },
    perk_fold: function (o) { tone({ f: 200, to: 900, d: 0.3, v: 0.08 * o.v, type: 'sawtooth', pan: o.pan }); noise({ d: 0.3, v: 0.08 * o.v, type: 'bandpass', f: 600, to: 3000, q: 4, pan: o.pan }); },
    perk_spin: function (o) {   // lever clunk, then the reels clicking until they stop (1.2 s)
      var t0 = ctx.currentTime;
      tone({ f: 140, to: 70, d: 0.15, v: 0.25 * o.v, type: 'triangle', pan: o.pan });
      noise({ d: 0.1, v: 0.15 * o.v, f: 900, pan: o.pan });
      for (var i = 0; i < 16; i++) noise({ d: 0.02, v: 0.09 * o.v, type: 'highpass', f: 3000, at: t0 + 0.15 + i * (0.05 + i * 0.002), pan: o.pan });
    },
    perk_launch: function (o) {   // ignition rumble + rising engine
      noise({ d: 1.4, v: 0.25 * o.v, f: 200, to: 900, pan: o.pan });
      tone({ f: 50, to: 160, d: 1.4, v: 0.18 * o.v, type: 'sawtooth', pan: o.pan, sus: 1 });
      tone({ f: 880, d: 0.15, v: 0.1 * o.v, type: 'square', pan: o.pan });
    },

    count: function () { tone({ f: 660, d: 0.15, v: 0.14, type: 'square' }); },
    go: function () { tone({ f: 1320, d: 0.4, v: 0.14, type: 'square', sus: 1 }); },
    tick: function (o) { tone({ f: o.last ? 1760 : 1100, d: 0.06, v: 0.1, type: 'square' }); },
    alarm: function () { tone({ f: 880, to: 440, d: 0.3, v: 0.1, type: 'sawtooth' }); }
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
  // Songs are built from sections (A, B, C...) played in the order given by `form`, then looped.
  // A section: chords (one per bar) and an optional lead (16 tokens per bar). It can also override
  // the song's bass / arp / drums (e.g. a breakdown with no lead and lighter drums).
  // `once: true` = a jingle that plays one time and then stops.
  var SONGS = {
    title: {
      bpm: 128, bass: 'R.ROR.ROR.ROR.RO', arp: '0123', arpOct: 2, drums: 'k.h.s.h.k.hks.ho', fill: 'k.h.s.h.s.ssssss',
      form: 'ABAC',
      A: {
        chords: [['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['E2', 'dom']],
        lead: 'A4 - - - C5 - E5 - D5 - - C5 B4 - G4 - ' + 'A4 - - - - - . . C5 - D5 - E5 - - - ' +
              'G5 - - - E5 - C5 - D5 - - E5 D5 - B4 - ' + 'C5 - - - - - B4 - G#4 - - - - - . . ' +
              'A4 - - - C5 - E5 - D5 - - C5 B4 - G4 - ' + 'A4 - - - - - . . C5 - D5 - E5 - G5 - ' +
              'A5 - - - G5 - E5 - G5 - - E5 D5 - C5 - ' + 'B4 - - - - - - - G#4 - - - B4 - - - '
      },
      B: {
        chords: [['F2', 'maj'], ['G2', 'maj'], ['E2', 'min'], ['A2', 'min'], ['D2', 'min'], ['G2', 'maj'], ['C3', 'maj'], ['E2', 'dom']],
        lead: 'A5 - - - G5 - F5 - E5 - - - C5 - - - ' + 'D5 - - - E5 - G5 - - - B5 - A5 - G5 - ' +
              'G5 - - - - - E5 - B4 - - - - - . . ' + 'C5 - - - E5 - A5 - - - G5 - E5 - - - ' +
              'F5 - - - E5 - D5 - A4 - - - D5 - F5 - ' + 'G5 - - - F5 - D5 - B4 - - - G4 - - - ' +
              'E5 - - - G5 - C6 - - - B5 - G5 - E5 - ' + 'G#5 - - - - - - - B5 - - - E6 - - - '
      },
      C: {   // breakdown: same chords as A, arpeggio and kick only
        chords: [['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['E2', 'dom']],
        drums: 'k.......k.......', bass: 'R.......R.......', arp: '01231232'
      }
    },
    map: {
      bpm: 92, bass: 'R...O...R...F...', arp: '0213', arpOct: 2, arpWave: 'triangle', drums: 'k...h...s...h..h',
      leadWave: 'triangle', form: 'AABAC',
      A: {
        chords: [['C3', 'M7'], ['A2', 'm7'], ['F2', 'M7'], ['G2', 'dom']],
        lead: 'E5 - - - - - G5 - - - - - - - . . ' + 'C5 - - - - - E5 - - - D5 - - - . . ' +
              'A4 - - - C5 - - - E5 - - - D5 - C5 - ' + 'B4 - - - - - - - D5 - - - - - . . '
      },
      B: {
        chords: [['F2', 'M7'], ['G2', 'dom'], ['E2', 'm7'], ['A2', 'm7']],
        lead: 'A4 - - - C5 - - - E5 - - - - - . . ' + 'D5 - - - - - B4 - - - G4 - - - . . ' +
              'G4 - - - B4 - - - D5 - - - E5 - - - ' + 'C5 - - - - - - - - - - - . . . . '
      },
      C: { chords: [['C3', 'M7'], ['A2', 'm7'], ['F2', 'M7'], ['G2', 'dom']], drums: 'k.......h.......' }
    },
    explore: {
      bpm: 84, bass: 'R.....R...O.....', arp: '0.2.1.3.', arpOct: 2, arpWave: 'triangle', drums: 'k.......s.....h.',
      leadWave: 'sine', leadVib: 1, form: 'ABAC',
      A: {
        chords: [['D3', 'm7'], ['E3', 'm7'], ['D3', 'm7'], ['C3', 'M7']],
        lead: 'F5 - - - - - - - . . A5 - G5 - - - ' + 'E5 - - - - - - - . . . . . . . . ' +
              'D5 - - - F5 - - - A5 - - - C6 - - - ' + 'B5 - - - - - - - G5 - - - - - . . '
      },
      B: {
        chords: [['Bb2', 'M7'], ['C3', 'maj'], ['A2', 'm7'], ['A2', 'dom']],
        lead: 'D5 - - - - - F5 - - - A5 - - - . . ' + 'G5 - - - - - E5 - - - - - . . . . ' +
              'C5 - - - E5 - - - A5 - - - G5 - E5 - ' + 'C#5 - - - - - - - E5 - - - - - . . '
      },
      C: { chords: [['D3', 'm7'], ['E3', 'm7'], ['D3', 'm7'], ['C3', 'M7']], drums: '........k.......' }
    },
    battle: {
      bpm: 150, bass: 'RRORRROR', bassStep: 2, arp: '012', arpOct: 3, drums: 'k.hsk.hsk.hsk.ss', fill: 'k.hsk.hss.ssssss',
      form: 'ABAC',
      A: {
        chords: [['E2', 'min'], ['C2', 'maj'], ['D2', 'maj'], ['B1', 'maj'], ['E2', 'min'], ['C2', 'maj'], ['A1', 'min'], ['B1', 'dom']],
        lead: 'E5 - - - G5 - - - F#5 - E5 - D5 - B4 - ' + 'C5 - - - E5 - G5 - - - E5 - - - . . ' +
              'D5 - - - F#5 - A5 - - - F#5 - D5 - - - ' + 'D#5 - - - - - - - F#5 - - - B5 - - - ' +
              'E5 - - - G5 - - - B5 - A5 - G5 - E5 - ' + 'G5 - - - - - E5 - C5 - - - - - . . ' +
              'A4 - - - C5 - E5 - A5 - - - G5 - E5 - ' + 'F#5 - - - - - - - D#5 - - - B4 - - - '
      },
      B: {
        chords: [['A1', 'min'], ['B1', 'min'], ['C2', 'maj'], ['D2', 'maj'], ['A1', 'min'], ['B1', 'min'], ['C2', 'maj'], ['B1', 'dom']],
        lead: 'A4 - - - C5 - E5 - A5 - - - G5 - E5 - ' + 'F#5 - - - - - D5 - B4 - - - D5 - F#5 - ' +
              'G5 - - - E5 - C5 - G5 - - - A5 - B5 - ' + 'A5 - - - F#5 - D5 - A5 - - - - - . . ' +
              'C6 - - - B5 - A5 - E5 - - - A5 - C6 - ' + 'D6 - - - B5 - F#5 - D5 - - - B4 - D5 - ' +
              'E5 - - - G5 - C6 - B5 - A5 - G5 - E5 - ' + 'D#5 - - - F#5 - - - B5 - - - A5 - F#5 - '
      },
      C: {
        chords: [['E2', 'min'], ['C2', 'maj'], ['D2', 'maj'], ['B1', 'maj'], ['E2', 'min'], ['C2', 'maj'], ['A1', 'min'], ['B1', 'dom']],
        drums: 'k...s...k.k.s...', arp: '0121'
      }
    },
    boss: {
      bpm: 164, bass: 'RORORORORORORORO', arp: '0120', arpOct: 3, arpWave: 'sawtooth', drums: 'kkhskkhskkhskshs', fill: 'kkhskkhsssssssss',
      form: 'ABAC',
      A: {
        chords: [['C2', 'min'], ['Ab1', 'maj'], ['Bb1', 'maj'], ['G1', 'dom'], ['C2', 'min'], ['Ab1', 'maj'], ['F1', 'min'], ['G1', 'dom']],
        lead: 'C5 - - Eb5 - - G5 - C6 - - - Bb5 - Ab5 - ' + 'Ab5 - - - G5 - Eb5 - C5 - - - - - . . ' +
              'Bb4 - - D5 - - F5 - Bb5 - - - Ab5 - G5 - ' + 'G5 - - - - - F5 - D5 - B4 - - - . . ' +
              'C5 - - Eb5 - - G5 - C6 - - - D6 - Eb6 - ' + 'C6 - - - Ab5 - - - Eb5 - - - - - . . ' +
              'F5 - - - Ab5 - - - C6 - - - Bb5 - Ab5 - ' + 'G5 - - - - - - - B5 - - - D6 - - - '
      },
      B: {
        chords: [['Eb2', 'maj'], ['Bb1', 'maj'], ['Ab1', 'maj'], ['G1', 'dom'], ['F1', 'min'], ['G1', 'dom'], ['Ab1', 'maj'], ['G1', 'dom']],
        lead: 'Eb5 - - G5 - - Bb5 - Eb6 - - - D6 - Bb5 - ' + 'D5 - - F5 - - Bb5 - D6 - - - C6 - Bb5 - ' +
              'C6 - - - Ab5 - Eb5 - C5 - Eb5 - Ab5 - C6 - ' + 'B5 - - - G5 - D5 - B4 - - - D5 - G5 - ' +
              'Ab5 - - - F5 - C5 - Ab4 - C5 - F5 - Ab5 - ' + 'G5 - - - D5 - B4 - G4 - - - B4 - D5 - ' +
              'Eb5 - - - Ab5 - C6 - Eb6 - - - C6 - Ab5 - ' + 'D6 - - - - - B5 - G5 - - - B5 - D6 - '
      },
      C: {
        chords: [['C2', 'min'], ['Ab1', 'maj'], ['Bb1', 'maj'], ['G1', 'dom'], ['C2', 'min'], ['Ab1', 'maj'], ['F1', 'min'], ['G1', 'dom']],
        drums: 'k...k...k...k.k.', bass: 'R.R.R.R.R.R.R.RO'
      }
    },
    win: {
      once: true, bpm: 150, bass: 'R.R.O.R.R.R.O.R.', arp: '0120', arpOct: 3, drums: 'k.s.k.s.k.s.ssss', form: 'AZ',
      A: {
        chords: [['C3', 'maj'], ['F2', 'maj'], ['G2', 'dom']],
        lead: 'C5 - E5 - G5 - C6 - - - G5 - C6 - E6 - ' + 'F6 - - - E6 - D6 - C6 - - - A5 - C6 - ' +
              'D6 - - - - - B5 - G5 - B5 - D6 - F6 - '
      },
      Z: { chords: [['C3', 'maj'], ['C3', 'maj']], lead: 'E6 - - - - - - - - - - - - - - - ' + '- - - - - - - - . . . . . . . . ',
        drums: 'k...............', bass: 'R...............', arp: '0123' }
    },
    lose: {
      once: true, bpm: 104, bass: 'R.......R.......', arp: '0.1.2.1.', arpOct: 2, arpWave: 'triangle', drums: 'k.......s.......', form: 'A',
      leadWave: 'square', leadVib: 1,
      A: {
        chords: [['A2', 'min'], ['D2', 'min'], ['E2', 'dom'], ['A2', 'min']],
        lead: 'E5 - - - D5 - C5 - B4 - - - A4 - - - ' + 'C5 - - - B4 - A4 - F4 - - - - - . . ' +
              'G#4 - - - - - B4 - E4 - - - - - . . ' + 'A4 - - - - - - - - - - - . . . . '
      }
    }
  };

  function compile(song) {
    var ev = [], step0 = 0;
    song.form.split('').forEach(function (name) {
      var sec = song[name], bars = sec.chords.length;
      var bass = sec.bass || song.bass, arpP = sec.arp || song.arp, drums = sec.drums || song.drums;
      var lead = sec.lead ? sec.lead.trim().split(/\s+/) : [];
      for (var bar = 0; bar < bars; bar++) {
        var root = NOTE(sec.chords[bar][0]) + (song.transpose || 0), tones = Q[sec.chords[bar][1]];
        var bs = song.bassStep || 1;
        // a drum fill on the last bar of a section
        var dpat = (bar === bars - 1 && song.fill && !sec.drums) ? song.fill : drums;
        for (var s = 0; s < 16; s++) {
          var st = step0 + bar * 16 + s;
          var b = bass[(s / bs | 0) % bass.length];
          if (s % bs === 0 && b !== '.') ev.push({ st: st, ch: 'bass', n: root + (b === 'O' ? 12 : b === 'F' ? 7 : 0), len: bs * 0.9 });
          var a = arpP[s % arpP.length];
          if (a !== '.') {
            var k = parseInt(a, 10), tn = tones[k % tones.length] + 12 * Math.floor(k / tones.length);
            ev.push({ st: st, ch: 'arp', n: root + 12 * song.arpOct + tn, len: 0.8 });
          }
          var d = dpat[s % dpat.length];
          if (d !== '.') ev.push({ st: st, ch: 'drum', d: d });
        }
      }
      for (var i = 0; i < lead.length && i < bars * 16; i++) {
        var tok = lead[i];
        if (tok === '-' || tok === '.') continue;
        var len = 1; while (lead[i + len] === '-') len++;
        ev.push({ st: step0 + i, ch: 'lead', n: NOTE(tok) + (song.transpose || 0), len: len });
      }
      step0 += bars * 16;
    });
    ev.sort(function (x, y) { return x.st - y.st; });
    return { ev: ev, steps: step0, song: song };
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

  var cur = null;          // {key, c: compiled, step, nextT, idx}
  var after = null;        // track waiting for a jingle to finish
  var tempo = 1;
  function startSong(name, transpose) {
    var key = name + ':' + (transpose || 0);
    // Let a jingle finish; whatever was asked for meanwhile starts after it.
    if (cur && cur.c.song.once && !(SONGS[name] && SONGS[name].once)) { after = name ? { name: name, tr: transpose } : null; return; }
    if (cur && cur.key === key) return;
    cur = null; after = null;
    if (!name || !SONGS[name]) return;
    var song = Object.assign({}, SONGS[name], { transpose: transpose || 0 });
    cur = { key: key, c: compile(song), step: 0, idx: 0, nextT: ctx.currentTime + 0.08 };
  }
  function pump() {
    if (!cur || !ready()) return;
    var c = cur.c, stepDur = 60 / (c.song.bpm * (c.song.once ? 1 : tempo)) / 4;
    var ahead = ctx.currentTime + 0.15;
    if (cur.nextT < ctx.currentTime - 0.5) cur.nextT = ctx.currentTime + 0.05;   // tab was asleep: don't burst
    while (cur && cur.nextT < ahead) {
      if (c.song.once && cur.step >= c.steps) {
        // jingle done: wait for its tail to ring out, then start what was asked for
        if (ctx.currentTime > cur.nextT + 0.3) { var nx = after; cur = null; after = null; if (nx) startSong(nx.name, nx.tr); }
        return;
      }
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
      else if (f.kind === 'cast') play(SFX['ab_' + f.id] ? 'ab_' + f.id : 'cast', o);
      else if (f.kind === 'perk') play('perk_' + f.id, o);
      else if (SFX[f.kind]) play(f.kind, o);
    });
    (p.flash || []).forEach(function (f) {
      if (f._snd) return; f._snd = 1;
      if (f.text === 'COUNT BROKEN') play('alarm', o);
    });
    var cleared = now.lines - m.lines;
    if (cleared > 0) play(cleared >= 4 ? 'quad' : 'clear', Object.assign({ n: cleared }, o));
    if (now.pid !== m.pid) {
      if (now.hold !== m.hold) { if (human) play('hold', o); }
      else if (m.y < m.ghost - 1) { /* hard drop: the teleport effect has its own sound */ }
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
    tempo = tall && !bt.over ? 1.12 : 1;
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
      cur = null; after = null;
      var w = bt.winner === 'a' ? bt.a : bt.b;
      var vsHuman = !bt.a.isCPU && !bt.b.isCPU;
      startSong(vsHuman || !w.isCPU ? 'win' : 'lose');
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
      if (s !== lastScreen && name !== 'CardResult') startSong(TRACK_FOR[name]);
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
