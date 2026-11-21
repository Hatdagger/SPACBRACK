// Screens (title, map, explore, inventory, versus setup, controls), save data, main loop.
// Everything draws in 320x224 pixel space (Neo Geo resolution), scaled up with hard pixels.
(function (G) {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  G.gfxInit(ctx);
  var I = G.Input, R = G.rect, T = G.text, PAL = G.PAL;
  var now = 0;

  function wrap(s, max) {
    var words = String(s).split(' '), lines = [], cur = '';
    words.forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max) { if (cur) lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function blink(ms) { return Math.floor(now / (ms || 400)) % 2 === 0; }
  function cursor(x, y, color) { // little play-button triangle
    for (var i = 0; i < 4; i++) R(x + i, y + i, 1, 7 - i * 2, color || PAL.yellow);
  }

  // ---------- save data ----------
  var SAVE_KEY = 'spacbrack_save_v1';
  function freshSave() {
    var s = { tokens: {}, inventory: [], equipped: -1, xp: {}, beaten: {} };
    G.MONSTERS.forEach(function (m) { s.xp[m] = 0; });
    G.LOCATIONS.forEach(function (l) { s.beaten[l.id] = [false, false, false]; });
    return s;
  }
  var save = freshSave();
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) save = Object.assign(freshSave(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

  function playerFeatures() {
    var f = G.noFeatures();
    G.FEATURES.forEach(function (x) { if (save.tokens[x.key]) f[x.key] = true; });
    return f;
  }
  function equippedCard() {
    var id = save.equipped >= 0 ? save.inventory[save.equipped] : 'starter';
    if (!id) { save.equipped = -1; id = 'starter'; }
    return { id: id, rank: id === 'starter' ? 1 : G.rankForXp(save.xp[id] || 0) };
  }

  // ---------- toasts (cassette-label strips) ----------
  var toasts = [];
  function toast(msg) { toasts.push({ msg: String(msg).toUpperCase(), t: 3500 }); }
  function drawToasts(dt) {
    toasts = toasts.filter(function (t) { t.t -= dt; return t.t > 0; });
    toasts.slice(0, 3).forEach(function (t, k) {
      var w = Math.min(300, G.textWidth(t.msg, 'small') + 16), y = 196 - k * 16;
      G.label(160 - w / 2, y, w, 13, PAL.orange);
      T(t.msg, 160, y + 6, PAL.beigeInk, { align: 'center', font: 'small' });
    });
  }

  // ---------- backgrounds ----------
  function vhsBackdrop(accent) {
    R(0, 0, 320, 224, PAL.night);
    G.starfield(now);
    G.floor(160, 64, G.shade(accent || PAL.pink, -0.35), now / 16);
  }

  // ---------- screen manager ----------
  var screen = null;
  function go(s) { screen = s; if (s.enter) s.enter(); }

  function Menu(items, opts) { this.items = items; this.sel = 0; this.opts = opts || {}; }
  Menu.prototype.update = function () {
    if (I.any('repeat', 'down', 300, 120)) this.sel = (this.sel + 1) % this.items.length;
    if (I.any('repeat', 'up', 300, 120)) this.sel = (this.sel + this.items.length - 1) % this.items.length;
    if (I.any('pressed', 'ok')) { var it = this.items[this.sel]; it.fn && it.fn(); return true; }
    if (I.any('pressed', 'back') && this.opts.back) { this.opts.back(); return true; }
    return false;
  };
  Menu.prototype.draw = function (x, y, ink, gap) {
    var self = this; gap = gap || 11;
    this.items.forEach(function (it, k) {
      var sel = k === self.sel;
      if (sel) cursor(x - 8, y + k * gap, PAL.red);
      T(typeof it.label === 'function' ? it.label() : it.label, x, y + k * gap, sel ? PAL.red : (ink || PAL.beigeInk));
    });
  };

  // ---------- title: blank VHS box ----------
  function Title() {
    var self = this;
    this.menu = new Menu([
      { label: 'Adventure', fn: function () { go(new MapScreen()); } },
      { label: 'Versus', fn: function () { go(new VersusSetup()); } },
      { label: 'Controls', fn: function () { go(new Controls(self)); } },
      { label: 'Reset save', fn: function () { save = freshSave(); persist(); toast('Save data cleared'); } }
    ]);
  }
  Title.prototype.update = function () { this.menu.update(); };
  Title.prototype.draw = function (dt) {
    R(0, 0, 320, 224, PAL.black);
    G.starfield(now);
    // big diagonal racing stripes across the "box"
    G.stripes(0, 64, 320, 5, G.STRIPES, 0.8);
    // spine-style side band
    R(0, 0, 14, 224, '#1b1826'); for (var y = 0; y < 224; y += 6) R(3, y, 8, 3, '#2a2638');
    T('BB-40', 7, 6, PAL.amber, { font: 'small', align: 'center' });
    // logo
    G.chrome('SPACBRACK', 167, 22, 3, 'center');
    T('A RETRO-FUTURE BRICK BATTLE RPG', 167, 50, PAL.cyan, { font: 'small', align: 'center' });
    // falling bricks over the stripes
    for (var k = 0; k < 6; k++) {
      var bx = 40 + k * 46, by = ((now / 25 + k * 53) % 260) - 30;
      G.brick(bx, by, 8, G.BLOCK_COLORS[G.PIECE_TYPES[k]]);
    }
    // cassette label holding the menu
    G.label(104, 104, 126, 66, PAL.red);
    for (var l = 0; l < 4; l++) R(118, 118 + l * 11, 104, 1, '#c4b694');
    this.menu.draw(120, 111);
    // footer: tape specs
    G.deck(20, 182, 290, 34);
    T('HIGH GRADE', 28, 188, PAL.white, { font: 'small' });
    T('PROTOTYPE V0.1', 302, 188, PAL.grey, { font: 'small', align: 'right' });
    T(G.padCount ? G.padCount + ' CONTROLLER(S) READY' : 'PRESS A BUTTON ON A CONTROLLER TO CONNECT IT', 165, 198, PAL.amber, { font: 'small', align: 'center' });
    T('KEYBOARD: ARROWS + X / Z, ENTER', 165, 206, PAL.grey, { font: 'small', align: 'center' });
    drawToasts(dt);
  };

  // ---------- controls ----------
  function Controls(back) { this.back = back; }
  Controls.prototype.update = function () { if (I.any('pressed', 'back') || I.any('pressed', 'ok')) go(this.back); };
  Controls.prototype.draw = function () {
    vhsBackdrop(PAL.cyan);
    G.chrome('CONTROLS', 160, 8, 2, 'center');
    G.label(8, 30, 304, 150, PAL.cyan);
    var rows = [
      ['ACTION', 'PAD', 'KEYS P1', 'KEYS P2'],
      ['MOVE / SOFT DROP', 'D-PAD/STICK', 'ARROWS', 'J L K'],
      ['ROTATE CW', 'A', 'X', 'O'],
      ['ROTATE CCW', 'B', 'Z', 'U'],
      ['HARD DROP *', 'X', 'SPACE', 'N'],
      ['HOLD *', 'Y', 'C / SHIFT', 'M'],
      ['CARD ABILITY', 'RT (RB)', 'A', 'P'],
      ['STAGE PERK', 'LT (LB)', 'S', ';'],
      ['PAUSE / CARDS', 'START', 'ESC', '\\'],
      ['MENU OK / BACK', 'A / B', 'ENTER / BKSP', '']
    ];
    rows.forEach(function (r, k) {
      var y = 40 + k * 10, c = k === 0 ? PAL.red : PAL.beigeInk;
      T(r[0], 16, y, c, { font: 'small' }); T(r[1], 100, y, c, { font: 'small' });
      T(r[2], 166, y, c, { font: 'small' }); T(r[3], 250, y, c, { font: 'small' });
    });
    T('* NEEDS ITS TOKEN IN ADVENTURE', 16, 146, PAL.beigeLo, { font: 'small' });
    T('CARD: HOLD THE BUTTON, HOLD A DIRECTION, RELEASE TO FIRE.', 16, 156, PAL.beigeLo, { font: 'small' });
    T('ANY OTHER BUTTON CANCELS. LINE CLEARS FILL THE METER.', 16, 164, PAL.beigeLo, { font: 'small' });
    if (blink()) T('PRESS B', 160, 196, PAL.white, { align: 'center' });
  };

  // ---------- map: a shelf of VHS tapes ----------
  function MapScreen() { this.sel = MapScreen.last || 0; }
  MapScreen.prototype.update = function () {
    var s = this.sel;
    if (I.any('repeat', 'right', 300, 150)) s = (s % 3 === 2) ? s - 2 : s + 1;
    if (I.any('repeat', 'left', 300, 150)) s = (s % 3 === 0) ? s + 2 : s - 1;
    if (I.any('repeat', 'down', 300, 150) || I.any('repeat', 'up', 300, 150)) s = (s + 3) % 6;
    this.sel = s; MapScreen.last = s;
    if (I.any('pressed', 'ok')) { go(new Explore(G.LOCATIONS[s])); return; }
    if (I.any('pressed', 'back')) { go(new Title()); return; }
    if (I.any('pressed', 'pause')) go(new Inventory(this));
  };
  function tapeBox(x, y, w, h, loc, sel, k) {
    var lift = sel ? -3 : 0;
    y += lift;
    R(x + 3, y + 3 - lift, w, h, '#000');
    R(x, y, w, h, '#120f1c');
    if (sel) { R(x - 1, y - 1, w + 2, 1, PAL.white); R(x - 1, y + h, w + 2, 1, PAL.white); R(x - 1, y, 1, h, PAL.white); R(x + w, y, 1, h, PAL.white); }
    // diagonal stripe in the location colour family
    var cols = [G.shade(loc.color, 0.4), loc.color, G.shade(loc.color, -0.3), G.shade(loc.color, -0.55)];
    for (var r = 0; r < 16; r++) {
      var band = Math.floor(r / 4), off = r;
      R(x + 4 + off, y + 16 + r, w - 8 - off, 1, cols[band]);
    }
    // white label + number
    R(x + 4, y + 4, w - 8, 9, PAL.white);
    T(loc.name, x + w / 2, y + 6, '#000', { font: 'small', align: 'center' });
    T('T-' + (k + 1) * 20, x + w - 5, y + h - 9, PAL.grey, { font: 'small', align: 'right' });
    var got = save.tokens[loc.feature], beaten = save.beaten[loc.id].filter(Boolean).length;
    if (got) { G.bevel(x + 4, y + h - 13, 30, 9, PAL.yellow, '#fff', PAL.orange, '#000'); T('TOKEN', x + 19, y + h - 11, '#000', { font: 'small', align: 'center' }); }
    else T(beaten + '/3', x + 5, y + h - 10, PAL.amber, { font: 'small' });
  }
  MapScreen.prototype.draw = function (dt) {
    var loc = G.LOCATIONS[this.sel];
    vhsBackdrop(loc.color);
    G.chrome('SECTOR MAP', 120, 6, 2, 'center');
    var tokens = G.FEATURES.filter(function (f) { return save.tokens[f.key]; }).length;
    G.inset(236, 6, 70, 13);
    T('TOKENS', 241, 9, PAL.grey, { font: 'small' });
    G.led(tokens + '/6', 301, 9, PAL.amber, 'right');
    var self = this;
    G.LOCATIONS.forEach(function (l, k) {
      tapeBox(14 + (k % 3) * 102, 30 + Math.floor(k / 3) * 66, 90, 56, l, k === self.sel, k);
    });
    var feat = G.FEATURES.filter(function (f) { return f.key === loc.feature; })[0];
    G.label(8, 166, 304, 52, loc.color);
    T(loc.name, 16, 174, PAL.beigeInk);
    T('TOKEN: ' + feat.name + ' (' + feat.desc + ')', 16, 185, PAL.beigeInk, { font: 'small' });
    T('HOUSE RULE: ' + loc.rule, 16, 193, PAL.beigeInk, { font: 'small' });
    T('A: ENTER   START: CARDS   B: TITLE', 16, 205, PAL.beigeLo, { font: 'small' });
    drawToasts(dt);
  };

  // ---------- explorable location ----------
  var ROOM = [
    '####################',
    '#..................#',
    '#..oo..........oo..#',
    '#........3.........#',
    '#..................#',
    '#...1..........2...#',
    '#..................#',
    '#..oo..........oo..#',
    '#..................#',
    '#........P.........#',
    '#########EE#########'
  ];
  var TILE = 16, RX = 0, RY = 18;

  function Explore(loc) {
    this.loc = loc;
    this.npcs = [];
    for (var y = 0; y < ROOM.length; y++) for (var x = 0; x < ROOM[y].length; x++) {
      var ch = ROOM[y][x];
      if (ch === 'P') { this.px = x; this.py = y; }
      if (ch >= '1' && ch <= '3') this.npcs[+ch - 1] = { x: x, y: y, idx: +ch - 1, data: loc.npcs[+ch - 1] };
    }
    if (Explore.returnPos && Explore.returnPos.loc === loc.id) { this.px = Explore.returnPos.x; this.py = Explore.returnPos.y; }
    this.face = 'up'; this.moveT = 0; this.fromX = this.px; this.fromY = this.py;
    this.dialog = null;
  }
  Explore.prototype.blocked = function (x, y) {
    var ch = ROOM[y] && ROOM[y][x];
    if (!ch || ch === '#' || ch === 'o') return true;
    return this.npcs.some(function (n) { return n.x === x && n.y === y; });
  };
  Explore.prototype.update = function (dt) {
    if (this.dialog) {
      var d = this.dialog;
      if (d.menu) d.menu.update();
      else if (I.any('pressed', 'ok') || I.any('pressed', 'back')) this.dialog = null;
      return;
    }
    if (I.any('pressed', 'pause')) { go(new Inventory(this)); return; }
    if (this.moveT > 0) { this.moveT = Math.max(0, this.moveT - dt); return; }
    var dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    for (var d2 in dirs) {
      if (I.any('down', d2)) {
        this.face = d2;
        var nx = this.px + dirs[d2][0], ny = this.py + dirs[d2][1];
        if (ROOM[ny] && ROOM[ny][nx] === 'E') { go(new MapScreen()); return; }
        if (!this.blocked(nx, ny)) { this.fromX = this.px; this.fromY = this.py; this.px = nx; this.py = ny; this.moveT = 140; }
        return;
      }
    }
    if (I.any('pressed', 'ok')) {
      var f = dirs[this.face], tx = this.px + f[0], ty = this.py + f[1];
      var npc = this.npcs.filter(function (n) { return n.x === tx && n.y === ty; })[0];
      if (npc) this.talk(npc);
    }
    if (I.any('pressed', 'back')) go(new MapScreen());
  };
  Explore.prototype.talk = function (npc) {
    var self = this, loc = this.loc, n = npc.data, beaten = save.beaten[loc.id];
    if (n.boss && !(beaten[0] && beaten[1])) {
      this.dialog = { who: n.name, line: 'Beat my crew first. Then we talk.' };
      return;
    }
    this.dialog = {
      who: n.name, line: n.line + (beaten[npc.idx] ? ' (Rematch)' : ''),
      menu: new Menu([
        { label: 'Battle!', fn: function () { self.dialog = null; self.startBattle(npc); } },
        { label: 'Not now', fn: function () { self.dialog = null; } }
      ], { back: function () { self.dialog = null; } })
    };
  };
  Explore.prototype.startBattle = function (npc) {
    var self = this, loc = this.loc, n = npc.data, me = equippedCard();
    Explore.returnPos = { loc: loc.id, x: this.px, y: this.py };
    var foeCard = n.mirror ? me.id : n.card, foeRank = n.mirror ? me.rank : n.rank;
    var foeFeat = n.mirror ? playerFeatures() : G.allFeatures();
    I.setSinglePlayer(true);
    go(new G.Battle({
      title: loc.name, subtitle: 'HOUSE RULE: ' + loc.rule,
      color: loc.color,
      a: { name: 'YOU', features: playerFeatures(), cardId: me.id, rank: me.rank, slot: 0 },
      b: { name: n.name, features: foeFeat, cardId: foeCard, rank: foeRank, cpu: n.level },
      onQuit: function () { go(self); },
      onEnd: function (winner, battle) { self.afterBattle(npc, winner === 'a', battle); }
    }));
  };
  Explore.prototype.afterBattle = function (npc, won, battle) {
    var loc = this.loc, n = npc.data, me = equippedCard();
    go(this);
    if (won) {
      save.beaten[loc.id][npc.idx] = true;
      if (me.id !== 'starter') {
        var before = G.rankForXp(save.xp[me.id]);
        save.xp[me.id] += battle.a.score;
        var after = G.rankForXp(save.xp[me.id]);
        toast(G.CARDS[me.id].name + ' +' + battle.a.score + ' XP' + (after > before ? '  RANK UP! R' + after : ''));
      }
      if (n.boss && !save.tokens[loc.feature]) {
        save.tokens[loc.feature] = true;
        var f = G.FEATURES.filter(function (x) { return x.key === loc.feature; })[0];
        toast('TOKEN: ' + f.name + ' - ' + f.desc + ' unlocked!');
      }
      var prize = G.MONSTERS[Math.floor(Math.random() * G.MONSTERS.length)];
      toast('Won a ' + G.CARDS[prize].name + ' card');
      persist();
      if (save.inventory.length >= G.INVENTORY_CAP) { go(new Inventory(this, prize)); return; }
      save.inventory.push(prize);
    } else if (me.id !== 'starter') {
      save.inventory.splice(save.equipped, 1);
      save.equipped = -1;
      toast('Bricked up! Your ' + G.CARDS[me.id].name + ' card was destroyed!');
    } else {
      toast('Bricked up! Your Cadet Badge is safe.');
    }
    persist();
  };
  Explore.prototype.drawProp = function (px, py, loc) {
    var c = loc.color, d = G.shade(c, -0.55), l = G.shade(c, 0.45);
    G.bevel(px + 1, py + 2, 14, 13, '#2a2638', '#4a4660', '#100e18', '#000');
    switch (loc.prop) {
      case 'gantry':
        for (var i = 0; i < 4; i++) { R(px + 4, py + 3 + i * 3, 8, 1, c); R(px + 4 + (i % 2) * 6, py + 3 + i * 3, 2, 3, d); }
        R(px + 7, py + 1, 2, 3, PAL.red); break;
      case 'pillar':
        R(px + 5, py + 3, 6, 11, d); for (var j = 0; j < 11; j += 2) R(px + 5, py + 3 + j, 6, 1, (Math.floor(now / 200) + j) % 4 ? c : l); break;
      case 'vat':
        R(px + 4, py + 4, 8, 10, d); R(px + 5, py + 7, 6, 6, c); R(px + 6, py + 8 + (Math.floor(now / 300) % 3), 1, 1, l); R(px + 4, py + 4, 8, 1, l); break;
      case 'vault':
        R(px + 3, py + 4, 10, 10, d); R(px + 6, py + 7, 4, 4, c); R(px + 7, py + 8, 2, 2, l); break;
      case 'clock':
        R(px + 3, py + 4, 10, 9, '#000'); G.text(Math.floor(now / 1000) % 60 < 10 ? '0' + Math.floor(now / 1000) % 60 : String(Math.floor(now / 1000) % 60), px + 8, py + 6, c, { font: 'small', align: 'center' }); break;
      case 'slots':
        for (var k = 0; k < 3; k++) { R(px + 3 + k * 4, py + 5, 3, 6, '#fff'); R(px + 4 + k * 4, py + 7, 1, 2, [PAL.red, PAL.yellow, PAL.cyan][(k + Math.floor(now / 150)) % 3]); }
        R(px + 13, py + 3, 1, 5, c); break;
    }
  };
  Explore.prototype.figure = function (x, y, suit, accent, face, boss) {
    var pal = { k: '#000', w: suit, v: PAL.cyan, l: '#fff', c: accent, g: '#6a6880', d: PAL.red };
    var rows = G.ASTRO;
    if (face === 'up') rows = rows.map(function (r) { return r.replace(/[vl]/g, 'w'); });
    var key = 'fig' + suit + accent + (face === 'up' ? 'u' : '');
    R(x + 3, y + 15, 10, 1, 'rgba(0,0,0,0.5)');
    G.sprite(rows, x, y, pal, key, face === 'left');
    if (boss) { R(x + 7, y - 3, 2, 3, PAL.yellow); G.px(x + 7, y - 4, PAL.red); }
  };
  Explore.prototype.draw = function (dt) {
    var loc = this.loc, self = this;
    R(0, 0, 320, 224, PAL.black);
    // header strip
    G.stripes(0, 0, 60, 1, [loc.color, G.shade(loc.color, -0.3), G.shade(loc.color, -0.5)], 2, 'right');
    T(loc.name, 66, 5, loc.color, { shadow: '#000' });
    T('A: TALK  START: CARDS', 316, 6, PAL.grey, { font: 'small', align: 'right' });
    for (var y = 0; y < ROOM.length; y++) for (var x = 0; x < ROOM[y].length; x++) {
      var ch = ROOM[y][x], px = RX + x * TILE, py = RY + y * TILE;
      if (ch === '#') {
        G.bevel(px, py, TILE, TILE, '#2c2a3e', '#47445e', '#141220');
        if (y === 0) R(px + 2, py + 6, 12, 2, G.shade(loc.color, -0.4));
      } else {
        R(px, py, TILE, TILE, (x + y) % 2 ? '#16141f' : '#1b1926');
        R(px, py, TILE, 1, '#100e18'); R(px, py, 1, TILE, '#100e18');
        if (ch === 'E') { R(px + 2, py + 2, 12, 12, G.shade(loc.color, -0.5)); for (var a = 0; a < 3; a++) R(px + 7 - a, py + 5 + a, 2 + a * 2, 1, blink(300) ? loc.color : G.shade(loc.color, 0.4)); }
        if (ch === 'o') this.drawProp(px, py, loc);
      }
    }
    this.npcs.forEach(function (n) {
      var beaten = save.beaten[loc.id][n.idx], card = G.CARDS[n.data.mirror ? 'starter' : n.data.card];
      var suit = n.data.boss ? PAL.yellow : card.color;
      self.figure(RX + n.x * TILE, RY + n.y * TILE, suit, G.shade(suit, -0.5), 'down', n.data.boss);
      var name = n.data.name;
      T(name, RX + n.x * TILE + 8, RY + n.y * TILE - (n.data.boss ? 10 : 7), beaten ? PAL.green : PAL.white, { font: 'small', align: 'center', shadow: '#000' });
    });
    var t = this.moveT / 140;
    var dx = this.px + (this.fromX - this.px) * t, dy = this.py + (this.fromY - this.py) * t;
    var bob = this.moveT > 0 && Math.floor(this.moveT / 70) % 2 ? -1 : 0;
    this.figure(Math.round(RX + dx * TILE), Math.round(RY + dy * TILE) + bob, PAL.white, PAL.orange, this.face);

    // footer
    var me = equippedCard();
    R(0, 196, 320, 28, '#0c0a14');
    T('CARD', 6, 202, PAL.grey, { font: 'small' });
    T(G.CARDS[me.id].name + ' R' + me.rank, 26, 202, G.CARDS[me.id].color, { font: 'small' });
    var tokens = G.FEATURES.filter(function (f) { return save.tokens[f.key]; }).length;
    T('TOKENS ' + tokens + '/6', 314, 202, PAL.amber, { font: 'small', align: 'right' });
    T('EXIT: BOTTOM DOOR', 160, 212, PAL.grey, { font: 'small', align: 'center' });

    if (this.dialog) {
      var d = this.dialog, lines = wrap(d.line.toUpperCase(), 66);
      G.label(10, 136, 300, 62, loc.color);
      T(d.who, 18, 144, PAL.red);
      lines.forEach(function (ln, k) { T(ln, 18, 155 + k * 7, PAL.beigeInk, { font: 'small' }); });
      if (d.menu) d.menu.draw(30, 172, PAL.beigeInk, 10);
      else if (blink()) T('A: OK', 302, 188, PAL.beigeLo, { font: 'small', align: 'right' });
    }
    drawToasts(dt);
  };

  // ---------- inventory: tape spines + label ----------
  function Inventory(back, incoming) { this.back = back; this.incoming = incoming || null; this.sel = 0; }
  Inventory.prototype.entries = function () {
    var list = [{ id: 'starter', idx: -1 }];
    save.inventory.forEach(function (id, k) { list.push({ id: id, idx: k }); });
    if (this.incoming) list.push({ id: this.incoming, idx: 'new' });
    return list;
  };
  Inventory.prototype.update = function () {
    var list = this.entries();
    if (I.any('repeat', 'down', 300, 120)) this.sel = (this.sel + 1) % list.length;
    if (I.any('repeat', 'up', 300, 120)) this.sel = (this.sel + list.length - 1) % list.length;
    var e = list[this.sel];
    if (I.any('pressed', 'ok')) {
      if (this.incoming) {
        if (e.idx === -1) { toast('The Cadet Badge cannot be tossed'); return; }
        if (e.idx !== 'new') {
          var wasEquipped = save.equipped === e.idx;
          save.inventory.splice(e.idx, 1);
          if (wasEquipped) save.equipped = -1;
          else if (save.equipped > e.idx) save.equipped--;
          save.inventory.push(this.incoming);
          toast('Tossed ' + G.CARDS[e.id].name);
        } else toast('Tossed the new ' + G.CARDS[e.id].name);
        persist(); go(this.back); return;
      }
      save.equipped = e.idx; persist();
      toast('Equipped ' + G.CARDS[e.id].name);
    }
    if (!this.incoming && (I.any('pressed', 'back') || I.any('pressed', 'pause'))) go(this.back);
  };
  Inventory.prototype.draw = function (dt) {
    vhsBackdrop(PAL.violet);
    G.chrome(this.incoming ? 'TOSS ONE' : 'CARDS', 84, 6, 2, 'center');
    T(save.inventory.length + '/' + G.INVENTORY_CAP + ' SLOTS', 84, 24, PAL.grey, { font: 'small', align: 'center' });
    var list = this.entries(), self = this;
    list.forEach(function (e, k) {
      var c = G.CARDS[e.id], sel = k === self.sel, y = 32 + k * 18, x = sel ? 12 : 8;
      R(x + 2, y + 2, 148, 15, '#000');
      R(x, y, 148, 15, '#141120');
      R(x, y, 6, 15, c.color); R(x + 6, y, 2, 15, G.shade(c.color, -0.5));
      R(x + 12, y + 3, 100, 9, sel ? PAL.white : '#d8d2c0');
      var rank = e.id === 'starter' ? 1 : G.rankForXp(save.xp[e.id] || 0);
      T(c.name, x + 15, y + 4, '#000');
      T('R' + rank, x + 144, y + 5, PAL.amber, { font: 'small', align: 'right' });
      if (e.idx === save.equipped && !self.incoming) T('ON', x + 128, y + 5, PAL.green, { font: 'small', align: 'right' });
      if (e.idx === 'new') T('NEW', x + 130, y + 5, PAL.pink, { font: 'small', align: 'right' });
      if (sel) cursor(x - 7, y + 4, PAL.yellow);
    });
    var e = list[this.sel], c = G.CARDS[e.id];
    var rank = e.id === 'starter' ? 1 : G.rankForXp(save.xp[e.id] || 0);
    G.label(166, 8, 148, 182, c.color);
    T(c.name, 174, 18, PAL.beigeInk);
    if (e.id !== 'starter') {
      var xp = save.xp[e.id] || 0, nxt = G.RANK_XP[Math.min(5, rank + 1)];
      G.inset(174, 29, 132, 11);
      T('RANK', 177, 32, PAL.grey, { font: 'small' });
      G.led(String(rank), 200, 31, PAL.amber);
      T('XP ' + xp + (rank < 5 ? '/' + nxt : ' MAX'), 302, 32, PAL.green, { font: 'small', align: 'right' });
    }
    T('PASSIVE: ' + c.passive.name, 174, 46, PAL.red, { font: 'small' });
    wrap(c.passive.desc.toUpperCase(), 33).forEach(function (ln, k) { T(ln, 174, 53 + k * 7, PAL.beigeInk, { font: 'small' }); });
    G.DIRS.forEach(function (d, k) {
      var a = c.actives[d], y = 70 + k * 28;
      if (!a) return;
      var open = rank >= G.DIR_RANK[d];
      T(d + ' - ' + G.DIR_ROLE[d] + ' (R' + G.DIR_RANK[d] + ')', 174, y, PAL.red, { font: 'small' });
      if (open) {
        T(a.name + ' [' + a.cost + ']', 174, y + 7, PAL.beigeInk, { font: 'small' });
        T(a.desc, 174, y + 14, PAL.beigeLo, { font: 'small' });
      } else T('? ? ?', 174, y + 7, PAL.beigeLo, { font: 'small' });
    });
    T('WIN SCORE = XP. LOSING IN', 174, 174, PAL.beigeLo, { font: 'small' });
    T('ADVENTURE DESTROYS THE CARD.', 174, 181, PAL.beigeLo, { font: 'small' });
    T(this.incoming ? 'A: TOSS SELECTED' : 'A: EQUIP   B: BACK', 84, 182, PAL.white, { font: 'small', align: 'center' });
    drawToasts(dt);
  };

  // ---------- versus setup ----------
  var CARD_CHOICES = ['starter'].concat(G.MONSTERS);
  var vs = { mode: 0, level: 3, feat: G.allFeatures(), c1: 1, r1: 3, c2: 2, r2: 3 };
  function VersusSetup() { this.sel = 0; }
  VersusSetup.prototype.rows = function () {
    var r = [
      { label: 'Mode', value: ['VS CPU', '2P LOCAL'][vs.mode], adj: function (d) { vs.mode = (vs.mode + 2 + d) % 2; } }
    ];
    if (vs.mode === 0) r.push({ label: 'CPU level', value: String(vs.level), adj: function (d) { vs.level = Math.max(1, Math.min(5, vs.level + d)); } });
    G.FEATURES.forEach(function (f) {
      r.push({ label: f.desc, value: vs.feat[f.key] ? 'ON' : 'OFF', adj: function () { vs.feat[f.key] = !vs.feat[f.key]; } });
    });
    r.push({ label: 'P1 card', value: G.CARDS[CARD_CHOICES[vs.c1]].name, adj: function (d) { vs.c1 = (vs.c1 + CARD_CHOICES.length + d) % CARD_CHOICES.length; } });
    r.push({ label: 'P1 rank', value: String(vs.r1), adj: function (d) { vs.r1 = Math.max(1, Math.min(5, vs.r1 + d)); } });
    r.push({ label: (vs.mode ? 'P2' : 'CPU') + ' card', value: G.CARDS[CARD_CHOICES[vs.c2]].name, adj: function (d) { vs.c2 = (vs.c2 + CARD_CHOICES.length + d) % CARD_CHOICES.length; } });
    r.push({ label: (vs.mode ? 'P2' : 'CPU') + ' rank', value: String(vs.r2), adj: function (d) { vs.r2 = Math.max(1, Math.min(5, vs.r2 + d)); } });
    r.push({ label: 'START', value: '', start: true });
    return r;
  };
  VersusSetup.prototype.update = function () {
    var rows = this.rows();
    if (I.any('repeat', 'down', 300, 120)) this.sel = (this.sel + 1) % rows.length;
    if (I.any('repeat', 'up', 300, 120)) this.sel = (this.sel + rows.length - 1) % rows.length;
    this.sel = Math.min(this.sel, rows.length - 1);
    var row = rows[this.sel];
    if (row.adj && I.any('repeat', 'right', 300, 150)) row.adj(1);
    if (row.adj && I.any('repeat', 'left', 300, 150)) row.adj(-1);
    if (I.any('pressed', 'ok')) { if (row.start) this.start(); else if (row.adj) row.adj(1); }
    if (I.any('pressed', 'back')) go(new Title());
  };
  VersusSetup.prototype.start = function () {
    var self = this, two = vs.mode === 1;
    I.setSinglePlayer(!two);
    var feat = Object.assign({}, vs.feat);
    go(new G.Battle({
      title: 'VERSUS', subtitle: two ? 'LOCAL 2P - NO CARD LOSS' : 'VS CPU LEVEL ' + vs.level + ' - NO CARD LOSS',
      color: PAL.violet,
      a: { name: 'P1', features: feat, cardId: CARD_CHOICES[vs.c1], rank: vs.r1, slot: 0 },
      b: two ? { name: 'P2', features: feat, cardId: CARD_CHOICES[vs.c2], rank: vs.r2, slot: 1 }
        : { name: 'CPU', features: feat, cardId: CARD_CHOICES[vs.c2], rank: vs.r2, cpu: vs.level },
      onQuit: function () { I.setSinglePlayer(true); go(self); },
      onEnd: function () { I.setSinglePlayer(true); go(self); }
    }));
  };
  VersusSetup.prototype.draw = function () {
    vhsBackdrop(PAL.violet);
    G.chrome('VERSUS', 160, 4, 2, 'center');
    var rows = this.rows(), self = this;
    G.deck(16, 24, 288, rows.length * 11 + 10);
    rows.forEach(function (r, k) {
      var y = 30 + k * 11, sel = k === self.sel;
      if (sel) { R(22, y - 2, 276, 11, '#000'); cursor(24, y, PAL.yellow); }
      T(r.label, 32, y, r.start ? PAL.red : (sel ? PAL.yellow : PAL.white));
      if (r.value) {
        var on = r.value === 'ON', off = r.value === 'OFF';
        T('< ' + r.value + ' >', 294, y, on ? PAL.green : off ? '#6c6880' : PAL.amber, { align: 'right' });
      }
    });
    var by = 24 + rows.length * 11 + 16;
    T('UP/DOWN: CHOOSE  LEFT/RIGHT: CHANGE  A: START  B: BACK', 160, by, PAL.grey, { font: 'small', align: 'center' });
    if (vs.mode === 1) T('2P: PAD 1 + P1 KEYS / PAD 2 + P2 KEYS', 160, by + 8, PAL.grey, { font: 'small', align: 'center' });
  };

  // ---------- canvas scaling + loop ----------
  var scan = document.getElementById('scan');
  function resize() {
    var s = Math.min(window.innerWidth / 320, window.innerHeight / 224);
    if (s >= 2) s = Math.floor(s);
    var w = Math.floor(320 * s), h = Math.floor(224 * s);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    if (scan) {
      scan.style.width = w + 'px'; scan.style.height = h + 'px';
      scan.style.backgroundSize = '100% ' + Math.max(2, s) + 'px';
    }
  }
  window.addEventListener('resize', resize); resize();
  function toggleFs() {
    if (document.fullscreenElement) document.exitFullscreen(); else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { });
  }
  canvas.addEventListener('dblclick', toggleFs);

  var last = performance.now();
  function frame(t) {
    var dt = Math.min(50, t - last); last = t; now = t;
    I.poll(dt);
    screen.update(dt);
    if (screen instanceof G.Battle) { screen.draw(ctx); drawToasts(dt); } else screen.draw(dt);
    requestAnimationFrame(frame);
  }

  G.go = go;
  G.currentScreen = function () { return screen; };
  G.debug = { save: function () { return save; }, screens: { Title: Title, MapScreen: MapScreen, Explore: Explore, Inventory: Inventory, VersusSetup: VersusSetup, Controls: Controls } };
  go(new Title());
  requestAnimationFrame(frame);
})(globalThis.G = globalThis.G || {});
