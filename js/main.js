// Screens (title, map, explore, inventory, versus setup, controls), save data, main loop.
(function (G) {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var I = G.Input;

  // ---------- helpers ----------
  G.roundRect = function (c, x, y, w, h, r) {
    if (w < 0) w = 0;
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  };
  G.shade = function (hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  };
  var stars = [];
  for (var i = 0; i < 120; i++) stars.push([Math.random() * 1280, Math.random() * 720, Math.random() * 1.6 + 0.3]);
  G.drawBackdrop = function (c, accent) {
    var g = c.createLinearGradient(0, 0, 0, 720);
    g.addColorStop(0, '#0d1428'); g.addColorStop(1, '#1d1530');
    c.fillStyle = g; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = 'rgba(244,236,216,0.7)';
    stars.forEach(function (s) { c.fillRect(s[0], s[1], s[2], s[2]); });
    c.strokeStyle = accent || '#4fd1c5'; c.globalAlpha = 0.12; c.lineWidth = 2;
    c.beginPath(); c.ellipse(640, 760, 820, 220, 0, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  };
  function text(t, x, y, size, color, align, bold) {
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px monospace';
    ctx.fillStyle = color || '#f4ecd8'; ctx.textAlign = align || 'left';
    ctx.fillText(t, x, y);
  }
  function panel(x, y, w, h, accent) {
    ctx.fillStyle = 'rgba(20,28,44,0.92)'; G.roundRect(ctx, x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = accent || '#4fd1c5'; ctx.lineWidth = 2; G.roundRect(ctx, x, y, w, h, 12); ctx.stroke();
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

  // ---------- messages ----------
  var toasts = [];
  function toast(msg) { toasts.push({ msg: msg, t: 3500 }); }
  function drawToasts(dt) {
    toasts = toasts.filter(function (t) { t.t -= dt; return t.t > 0; });
    toasts.slice(0, 3).forEach(function (t, k) {
      ctx.globalAlpha = Math.min(1, t.t / 500);
      panel(340, 600 - k * 54, 600, 44, '#f2d16b');
      text(t.msg, 640, 628 - k * 54, 16, '#f2d16b', 'center');
      ctx.globalAlpha = 1;
    });
  }

  // ---------- screen manager ----------
  var screen = null;
  function go(s) { screen = s; if (s.enter) s.enter(); }

  // Generic vertical menu
  function Menu(items, opts) {
    this.items = items; this.sel = 0; this.opts = opts || {};
  }
  Menu.prototype.update = function () {
    if (I.any('repeat', 'down', 300, 120)) this.sel = (this.sel + 1) % this.items.length;
    if (I.any('repeat', 'up', 300, 120)) this.sel = (this.sel + this.items.length - 1) % this.items.length;
    if (I.any('pressed', 'ok')) { var it = this.items[this.sel]; it.fn && it.fn(); return true; }
    if (I.any('pressed', 'back') && this.opts.back) { this.opts.back(); return true; }
    return false;
  };
  Menu.prototype.draw = function (x, y, w) {
    var self = this;
    this.items.forEach(function (it, k) {
      var sel = k === self.sel;
      if (sel) { ctx.fillStyle = 'rgba(232,118,58,0.25)'; G.roundRect(ctx, x - 12, y + k * 44 - 28, w, 38, 8); ctx.fill(); }
      text((sel ? '> ' : '  ') + (typeof it.label === 'function' ? it.label() : it.label), x, y + k * 44, 22, sel ? '#f2d16b' : '#f4ecd8');
    });
  };

  // ---------- title ----------
  function Title() {
    var self = this;
    this.menu = new Menu([
      { label: 'Adventure', fn: function () { go(new MapScreen()); } },
      { label: 'Versus', fn: function () { go(new VersusSetup()); } },
      { label: 'Controls', fn: function () { go(new Controls(self)); } },
      { label: 'Reset save', fn: function () { save = freshSave(); persist(); toast('Save data cleared'); } }
    ]);
    this.t = 0;
  }
  Title.prototype.update = function (dt) { this.t += dt; this.menu.update(); };
  Title.prototype.draw = function (dt) {
    G.drawBackdrop(ctx, '#e8763a');
    // falling demo blocks
    var types = G.PIECE_TYPES;
    for (var k = 0; k < 14; k++) {
      var y = ((this.t / 12 + k * 97) % 820) - 60;
      G.drawBlock(ctx, 60 + k * 85, y, 34, G.BLOCK_COLORS[types[k % 7]], 0.35);
    }
    text(G.TITLE, 640, 210, 84, '#f2d16b', 'center');
    text(G.SUBTITLE, 640, 250, 16, '#9fb3d1', 'center', false);
    text('A RETRO-FUTURE BLOCK BATTLE RPG', 640, 290, 18, '#e8763a', 'center');
    panel(470, 340, 340, 210, '#e8763a');
    this.menu.draw(510, 392, 290);
    text(G.padCount ? G.padCount + ' controller(s) connected' : 'Press any button on a controller to connect it', 640, 600, 14, '#9fb3d1', 'center', false);
    text('Keyboard: arrows + X / Z, Enter', 640, 622, 14, '#9fb3d1', 'center', false);
    drawToasts(dt);
  };

  // ---------- controls ----------
  function Controls(back) { this.back = back; }
  Controls.prototype.update = function () { if (I.any('pressed', 'back') || I.any('pressed', 'ok')) go(this.back); };
  Controls.prototype.draw = function () {
    G.drawBackdrop(ctx);
    text('CONTROLS', 640, 80, 36, '#f2d16b', 'center');
    var rows = [
      ['Action', 'Controller', 'Keyboard P1', 'Keyboard P2'],
      ['Move / soft drop', 'D-pad / stick', 'Arrows', 'J L K'],
      ['Rotate CW', 'A', 'X', 'O'],
      ['Rotate CCW', 'B', 'Z', 'U'],
      ['Hard drop *', 'X', 'Space', 'N'],
      ['Hold *', 'Y', 'C / Shift', 'M'],
      ['Card ability', 'RT (or RB)', 'A', 'P'],
      ['Stage perk', 'LT (or LB)', 'S', ';'],
      ['Pause / cards menu', 'Start', 'Esc', '\\']
    ];
    rows.forEach(function (r, k) {
      var y = 150 + k * 40, c = k === 0 ? '#e8763a' : '#f4ecd8';
      text(r[0], 160, y, 18, c); text(r[1], 480, y, 18, c); text(r[2], 720, y, 18, c); text(r[3], 960, y, 18, c);
    });
    text('* needs the matching token in Adventure (always on in Versus if toggled).', 640, 540, 15, '#9fb3d1', 'center', false);
    text('Card ability: HOLD the card button, hold a direction, RELEASE the card button to fire.', 640, 570, 15, '#9fb3d1', 'center', false);
    text('Any other button cancels. Abilities cost meter; clear lines to fill it.', 640, 594, 15, '#9fb3d1', 'center', false);
    text('Press B to go back', 640, 660, 16, '#f2d16b', 'center');
  };

  // ---------- map ----------
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
  MapScreen.prototype.draw = function (dt) {
    G.drawBackdrop(ctx, G.LOCATIONS[this.sel].color);
    text('SECTOR MAP', 640, 60, 32, '#f2d16b', 'center');
    var tokens = G.FEATURES.filter(function (f) { return save.tokens[f.key]; }).length;
    text('Tokens ' + tokens + '/6', 640, 90, 16, '#9fb3d1', 'center', false);
    var self = this;
    G.LOCATIONS.forEach(function (loc, k) {
      var cx = 300 + (k % 3) * 340, cy = 220 + Math.floor(k / 3) * 230;
      var sel = k === self.sel, got = save.tokens[loc.feature];
      ctx.strokeStyle = loc.color; ctx.lineWidth = sel ? 5 : 2;
      ctx.fillStyle = sel ? G.shade(loc.color, -0.55) : '#141c2c';
      ctx.beginPath(); ctx.arc(cx, cy, sel ? 62 : 54, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, 92, 22, -0.3, 0, Math.PI * 2); ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
      text(loc.name, cx, cy + 96, 18, sel ? '#f2d16b' : '#f4ecd8', 'center');
      var beaten = save.beaten[loc.id].filter(Boolean).length;
      text(got ? 'TOKEN GOT' : beaten + '/3 beaten', cx, cy + 6, 14, got ? '#f2d16b' : '#9fb3d1', 'center');
    });
    var loc = G.LOCATIONS[this.sel], feat = G.FEATURES.filter(function (f) { return f.key === loc.feature; })[0];
    panel(240, 620, 800, 70, loc.color);
    text('Token: ' + feat.name + ' (' + feat.desc + ')   House rule: ' + loc.rule, 640, 648, 15, '#f4ecd8', 'center', false);
    text('A: enter   Start: cards   B: title', 640, 674, 14, '#9fb3d1', 'center', false);
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
  var TILE = 60, RX = 40, RY = 50;

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
      who: n.name, line: n.line + (beaten[npc.idx] ? '  (Rematch)' : ''),
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
      title: loc.name.toUpperCase(), subtitle: 'House rule: ' + loc.rule + '  |  First to ' + G.WIN_LINES + ' lines',
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
  Explore.prototype.draw = function (dt) {
    var loc = this.loc, self = this;
    ctx.fillStyle = '#0d1428'; ctx.fillRect(0, 0, 1280, 720);
    text(loc.name.toUpperCase(), 40, 36, 22, loc.color);
    text('A: talk   Start: cards   exit at the bottom door', 1240, 36, 14, '#9fb3d1', 'right', false);
    for (var y = 0; y < ROOM.length; y++) for (var x = 0; x < ROOM[y].length; x++) {
      var ch = ROOM[y][x], px = RX + x * TILE, py = RY + y * TILE;
      if (ch === '#') { ctx.fillStyle = '#2a3248'; ctx.fillRect(px, py, TILE, TILE); ctx.fillStyle = '#3a4460'; ctx.fillRect(px + 4, py + 4, TILE - 8, 6); }
      else {
        ctx.fillStyle = (x + y) % 2 ? '#1a2236' : '#1e273d'; ctx.fillRect(px, py, TILE, TILE);
        if (ch === 'E') { ctx.fillStyle = loc.color; ctx.globalAlpha = 0.4; ctx.fillRect(px + 6, py + 6, TILE - 12, TILE - 12); ctx.globalAlpha = 1; }
        if (ch === 'o') this.drawProp(px, py, loc);
      }
    }
    this.npcs.forEach(function (n) {
      var beaten = save.beaten[loc.id][n.idx];
      self.drawFigure(RX + n.x * TILE, RY + n.y * TILE, n.data.boss ? '#f2d16b' : G.CARDS[n.data.mirror ? 'starter' : n.data.card].color, n.data.boss);
      text(n.data.name, RX + n.x * TILE + TILE / 2, RY + n.y * TILE - 6, 12, beaten ? '#7fbf6a' : '#f4ecd8', 'center');
    });
    var t = this.moveT / 140;
    var dx = this.px + (this.fromX - this.px) * t, dy = this.py + (this.fromY - this.py) * t;
    this.drawFigure(RX + dx * TILE, RY + dy * TILE, '#f4ecd8', false, this.face);

    var me = equippedCard();
    text('Card: ' + G.CARDS[me.id].name + ' R' + me.rank, 40, 708, 14, G.CARDS[me.id].color, 'left', false);

    if (this.dialog) {
      var d = this.dialog;
      panel(140, 470, 1000, 200, loc.color);
      text(d.who, 170, 506, 20, loc.color);
      text(d.line, 170, 540, 18, '#f4ecd8', 'left', false);
      if (d.menu) d.menu.draw(190, 600, 300);
      else text('A: OK', 1110, 650, 14, '#9fb3d1', 'right', false);
    }
    drawToasts(dt);
  };
  Explore.prototype.drawProp = function (px, py, loc) {
    ctx.fillStyle = G.shade(loc.color, -0.5);
    G.roundRect(ctx, px + 6, py + 6, TILE - 12, TILE - 12, 8); ctx.fill();
    ctx.fillStyle = loc.color;
    switch (loc.prop) {
      case 'gantry': ctx.fillRect(px + 26, py + 10, 8, TILE - 20); break;
      case 'pillar': ctx.globalAlpha = 0.6; ctx.fillRect(px + 18, py + 10, 24, TILE - 20); ctx.globalAlpha = 1; break;
      case 'vat': ctx.beginPath(); ctx.arc(px + 30, py + 32, 14, 0, Math.PI * 2); ctx.fill(); break;
      case 'vault': ctx.strokeStyle = loc.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px + 30, py + 30, 14, 0, Math.PI * 2); ctx.stroke(); break;
      case 'clock': ctx.strokeStyle = loc.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px + 30, py + 30, 15, 0, Math.PI * 2); ctx.moveTo(px + 30, py + 30); ctx.lineTo(px + 30, py + 19); ctx.moveTo(px + 30, py + 30); ctx.lineTo(px + 38, py + 30); ctx.stroke(); break;
      case 'slots': for (var k = 0; k < 3; k++) ctx.fillRect(px + 12 + k * 13, py + 22, 10, 16); break;
    }
  };
  Explore.prototype.drawFigure = function (px, py, color, boss, face) {
    var cx = px + TILE / 2, cy = py + TILE / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(cx, py + TILE - 8, 16, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color; G.roundRect(ctx, cx - 13, cy - 6, 26, 26, 6); ctx.fill();
    ctx.fillStyle = '#cfe8ff'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(cx, cy - 12, 13, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy - 12, 13, 0, Math.PI * 2); ctx.stroke();
    if (boss) { ctx.fillStyle = '#e8763a'; ctx.fillRect(cx - 2, cy - 34, 4, 9); }
    if (face) {
      var o = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[face];
      ctx.fillStyle = '#0b1020'; ctx.beginPath(); ctx.arc(cx + o[0] * 6, cy - 12 + o[1] * 4, 3, 0, Math.PI * 2); ctx.fill();
    }
  };

  // ---------- inventory (equip, or toss when full) ----------
  function Inventory(back, incoming) {
    this.back = back; this.incoming = incoming || null; this.sel = 0;
  }
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
    G.drawBackdrop(ctx, '#b06ab3');
    text(this.incoming ? 'INVENTORY FULL - CHOOSE A CARD TO TOSS' : 'CARDS', 640, 60, 28, '#f2d16b', 'center');
    text(save.inventory.length + '/' + G.INVENTORY_CAP + ' slots (Cadet Badge is free)', 640, 88, 14, '#9fb3d1', 'center', false);
    var list = this.entries(), self = this;
    list.forEach(function (e, k) {
      var c = G.CARDS[e.id], sel = k === self.sel, y = 120 + k * 52;
      var rank = e.id === 'starter' ? 1 : G.rankForXp(save.xp[e.id] || 0);
      ctx.fillStyle = sel ? 'rgba(232,118,58,0.25)' : 'rgba(20,28,44,0.8)';
      G.roundRect(ctx, 80, y, 520, 44, 8); ctx.fill();
      ctx.fillStyle = c.color; ctx.fillRect(92, y + 8, 8, 28);
      var tag = e.idx === save.equipped && !self.incoming ? '  [EQUIPPED]' : e.idx === 'new' ? '  [NEW]' : '';
      text(c.name + '  R' + rank + tag, 114, y + 29, 18, sel ? '#f2d16b' : '#f4ecd8');
    });
    var e = list[this.sel], c = G.CARDS[e.id];
    var rank = e.id === 'starter' ? 1 : G.rankForXp(save.xp[e.id] || 0);
    panel(640, 120, 560, 420, c.color);
    text(c.name, 670, 160, 26, c.color);
    if (e.id !== 'starter') {
      var xp = save.xp[e.id] || 0, nxt = G.RANK_XP[Math.min(5, rank + 1)];
      text('Rank ' + rank + '   XP ' + xp + (rank < 5 ? ' / ' + nxt : ' (max)'), 670, 190, 15, '#9fb3d1', 'left', false);
    }
    text('Passive: ' + c.passive.name + ' - ' + c.passive.desc, 670, 230, 15, '#f4ecd8', 'left', false);
    G.DIRS.forEach(function (d, k) {
      var a = c.actives[d], y = 270 + k * 50;
      if (!a) return;
      var open = rank >= G.DIR_RANK[d];
      text(d.toUpperCase() + ' (' + G.DIR_ROLE[d] + ', R' + G.DIR_RANK[d] + ')', 670, y, 14, '#e8763a');
      text(open ? a.name + ' [' + a.cost + '] - ' + a.desc : '? ? ?', 670, y + 20, 15, open ? '#f4ecd8' : '#5d6880', 'left', false);
    });
    text('Win score becomes XP for the equipped card. Losing in Adventure destroys it.', 640, 600, 14, '#9fb3d1', 'center', false);
    text(this.incoming ? 'A: toss selected' : 'A: equip   B: back', 640, 630, 16, '#f2d16b', 'center');
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
      r.push({ label: f.name + ' (' + f.desc + ')', value: vs.feat[f.key] ? 'ON' : 'OFF', adj: function () { vs.feat[f.key] = !vs.feat[f.key]; } });
    });
    r.push({ label: 'P1 card', value: G.CARDS[CARD_CHOICES[vs.c1]].name, adj: function (d) { vs.c1 = (vs.c1 + CARD_CHOICES.length + d) % CARD_CHOICES.length; } });
    r.push({ label: 'P1 card rank', value: String(vs.r1), adj: function (d) { vs.r1 = Math.max(1, Math.min(5, vs.r1 + d)); } });
    r.push({ label: (vs.mode ? 'P2' : 'CPU') + ' card', value: G.CARDS[CARD_CHOICES[vs.c2]].name, adj: function (d) { vs.c2 = (vs.c2 + CARD_CHOICES.length + d) % CARD_CHOICES.length; } });
    r.push({ label: (vs.mode ? 'P2' : 'CPU') + ' card rank', value: String(vs.r2), adj: function (d) { vs.r2 = Math.max(1, Math.min(5, vs.r2 + d)); } });
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
      title: 'VERSUS', subtitle: two ? 'Local 2P - no card loss' : 'Vs CPU level ' + vs.level + ' - no card loss',
      color: '#b06ab3',
      a: { name: 'P1', features: feat, cardId: CARD_CHOICES[vs.c1], rank: vs.r1, slot: 0 },
      b: two ? { name: 'P2', features: feat, cardId: CARD_CHOICES[vs.c2], rank: vs.r2, slot: 1 }
        : { name: 'CPU', features: feat, cardId: CARD_CHOICES[vs.c2], rank: vs.r2, cpu: vs.level },
      onQuit: function () { I.setSinglePlayer(true); go(self); },
      onEnd: function () { I.setSinglePlayer(true); go(self); }
    }));
  };
  VersusSetup.prototype.draw = function () {
    G.drawBackdrop(ctx, '#b06ab3');
    text('VERSUS SETUP', 640, 60, 30, '#f2d16b', 'center');
    var rows = this.rows(), self = this;
    panel(240, 90, 800, rows.length * 38 + 30, '#b06ab3');
    rows.forEach(function (r, k) {
      var y = 128 + k * 38, sel = k === self.sel;
      if (sel) { ctx.fillStyle = 'rgba(232,118,58,0.25)'; G.roundRect(ctx, 256, y - 26, 768, 34, 6); ctx.fill(); }
      text(r.label, 280, y, 18, r.start ? '#e8763a' : (sel ? '#f2d16b' : '#f4ecd8'));
      if (r.value) text('< ' + r.value + ' >', 1000, y, 18, sel ? '#f2d16b' : '#9fb3d1', 'right');
    });
    text('Up/Down: choose   Left/Right: change   A: start   B: back', 640, 690, 14, '#9fb3d1', 'center', false);
    if (vs.mode === 1) text('2P: controller 1 + keyboard P1 keys, controller 2 + keyboard P2 keys', 640, 666, 14, '#9fb3d1', 'center', false);
  };

  // ---------- canvas scaling + loop ----------
  function resize() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    canvas.style.width = Math.floor(1280 * s) + 'px';
    canvas.style.height = Math.floor(720 * s) + 'px';
  }
  window.addEventListener('resize', resize); resize();
  canvas.addEventListener('dblclick', function () {
    if (document.fullscreenElement) document.exitFullscreen(); else if (canvas.requestFullscreen) canvas.requestFullscreen();
  });

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(50, now - last); last = now;
    I.poll(dt);
    screen.update(dt);
    if (screen instanceof G.Battle) screen.draw(ctx); else screen.draw(dt);
    if (screen instanceof G.Battle) drawToasts(dt);
    requestAnimationFrame(frame);
  }

  G.go = go;
  G.currentScreen = function () { return screen; };
  G.debug = { save: function () { return save; }, screens: { Title: Title, MapScreen: MapScreen, Explore: Explore, Inventory: Inventory, VersusSetup: VersusSetup, Controls: Controls } };
  go(new Title());
  requestAnimationFrame(frame);
})(globalThis.G = globalThis.G || {});
