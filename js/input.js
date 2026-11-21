// Keyboard + Gamepad input, mapped to abstract actions per player slot.
(function (G) {
  'use strict';

  var ACTIONS = ['left', 'right', 'up', 'down', 'rotCW', 'rotCCW', 'hard', 'hold', 'card', 'perk', 'pause', 'ok', 'back'];

  // Keyboard maps. Slot 0 = player 1, slot 1 = player 2 (local versus).
  var KEYS = [
    {
      left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
      rotCW: ['KeyX'], rotCCW: ['KeyZ'], hard: ['Space'], hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
      card: ['KeyA'], perk: ['KeyS'], pause: ['Escape'],
      ok: ['Enter', 'KeyX', 'Space'], back: ['KeyZ', 'Backspace']
    },
    {
      left: ['KeyJ'], right: ['KeyL'], up: ['KeyI'], down: ['KeyK'],
      rotCW: ['KeyO'], rotCCW: ['KeyU'], hard: ['KeyN'], hold: ['KeyM'],
      card: ['KeyP'], perk: ['Semicolon'], pause: ['Backslash'],
      ok: ['KeyO'], back: ['KeyU']
    }
  ];

  // Standard gamepad layout (Xbox naming): A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Back8 Start9 Dpad 12-15.
  var PAD = {
    rotCW: [0], rotCCW: [1], hard: [2], hold: [3], card: [7, 5], perk: [6, 4], pause: [9],
    ok: [0], back: [1], up: [12], down: [13], left: [14], right: [15]
  };

  var keysDown = {};
  window.addEventListener('keydown', function (e) {
    keysDown[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keysDown[e.code] = false; });
  window.addEventListener('blur', function () { keysDown = {}; });

  function Slot(i) {
    this.i = i;
    this.cur = {}; this.prev = {};
    this.held = {};   // ms each action has been held
    ACTIONS.forEach(function (a) { this.cur[a] = false; this.prev[a] = false; this.held[a] = 0; }, this);
  }
  Slot.prototype.down = function (a) { return this.cur[a]; };
  Slot.prototype.pressed = function (a) { return this.cur[a] && !this.prev[a]; };
  Slot.prototype.released = function (a) { return !this.cur[a] && this.prev[a]; };
  // Auto-repeat helper for menus and walking.
  Slot.prototype.repeat = function (a, delay, rate) {
    if (this.pressed(a)) return true;
    var h = this.held[a];
    if (!this.cur[a] || h < delay) return false;
    var prevH = h - this.lastDt;
    return Math.floor((h - delay) / rate) !== Math.floor(Math.max(0, prevH - delay) / rate);
  };

  var slots = [new Slot(0), new Slot(1)];
  var singlePlayer = true; // when true, every gamepad drives slot 0

  function padState(pad) {
    var s = {};
    if (!pad) return s;
    for (var a in PAD) {
      s[a] = PAD[a].some(function (b) {
        var btn = pad.buttons[b];
        return btn && (btn.pressed || btn.value > 0.5);
      });
    }
    var ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
    if (ax < -0.5) s.left = true;
    if (ax > 0.5) s.right = true;
    if (ay < -0.5) s.up = true;
    if (ay > 0.5) s.down = true;
    return s;
  }

  function poll(dt) {
    var pads = (navigator.getGamepads ? navigator.getGamepads() : []) || [];
    var padList = [];
    for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) padList.push(pads[i]);
    G.padCount = padList.length;

    slots.forEach(function (slot, si) {
      slot.lastDt = dt;
      var states = [];
      if (singlePlayer) { if (si === 0) states = padList.map(padState); }
      else if (padList[si]) states = [padState(padList[si])];
      ACTIONS.forEach(function (a) {
        slot.prev[a] = slot.cur[a];
        var v = (KEYS[si][a] || []).some(function (k) { return keysDown[k]; });
        if (!v) v = states.some(function (s) { return s[a]; });
        slot.cur[a] = v;
        slot.held[a] = v ? slot.held[a] + dt : 0;
      });
    });
  }

  // Touch: tap anywhere acts as OK on menus (minimal, for Android without a pad).
  var touchOk = false;
  window.addEventListener('touchstart', function () { touchOk = true; }, { passive: true });

  G.Input = {
    slots: slots,
    poll: function (dt) {
      poll(dt);
      if (touchOk) { slots[0].cur.ok = true; touchOk = false; }
    },
    setSinglePlayer: function (v) { singlePlayer = v; },
    // Menus: either player can drive.
    any: function (fn, a, x, y) { return slots[0][fn](a, x, y) || slots[1][fn](a, x, y); }
  };
})(globalThis.G = globalThis.G || {});
