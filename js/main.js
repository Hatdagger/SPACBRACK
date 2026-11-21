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
    var s = { tokens: {}, inventory: [], equipped: 'starter', xp: {}, beaten: {} };
    G.MONSTERS.forEach(function (m) { s.xp[m] = 0; });
    G.LOCATIONS.forEach(function (l) { s.beaten[l.id] = [false, false, false]; });
    return s;
  }
  var save = freshSave();
  try { var raw = localStorage.getItem(SAVE_KEY); if (raw) save = Object.assign(freshSave(), JSON.parse(raw)); } catch (e) { /* storage unavailable */ }
  // v0.1 saves stored the equipped card as a list index.
  if (typeof save.equipped === 'number') save.equipped = save.inventory[save.equipped] || 'starter';
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }

  function playerFeatures() {
    var f = G.noFeatures();
    G.FEATURES.forEach(function (x) { if (save.tokens[x.key]) f[x.key] = true; });
    return f;
  }
  function equippedCard() {
    var id = save.equipped;
    if (id !== 'starter' && save.inventory.indexOf(id) < 0) { save.equipped = id = 'starter'; }
    return { id: id, rank: id === 'starter' ? 1 : G.rankForXp(save.xp[id] || 0) };
  }
  function rankOf(id) { return id === 'starter' ? 1 : G.rankForXp(save.xp[id] || 0); }
  function countOf(id) { return save.inventory.filter(function (x) { return x === id; }).length; }
  function stackIds() { // unique monster types in the order they were first found
    var seen = []; save.inventory.forEach(function (id) { if (seen.indexOf(id) < 0) seen.push(id); }); return seen;
  }
  // Adds a won card. Returns 'ok', 'full' (stack already at max) or 'toss' (no free slot).
  function addCard(id) {
    var n = countOf(id);
    if (n >= G.STACK_MAX) return 'full';
    if (n === 0 && stackIds().length >= G.INVENTORY_CAP) return 'toss';
    save.inventory.push(id); return 'ok';
  }
  function removeOne(id) {
    var k = save.inventory.indexOf(id);
    if (k >= 0) save.inventory.splice(k, 1);
    if (!countOf(id) && save.equipped === id) save.equipped = 'starter';
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
    T('PROTOTYPE V0.2', 302, 188, PAL.grey, { font: 'small', align: 'right' });
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

  // ---------- map: station cutaway with a cursor ----------
  function MapScreen() { this.sel = MapScreen.last || 0; this.t = 0; }
  MapScreen.prototype.update = function (dt) {
    this.t += dt;
    var s = this.sel;
    if (I.any('repeat', 'right', 300, 150)) s = (s % 3 === 2) ? s - 2 : s + 1;
    if (I.any('repeat', 'left', 300, 150)) s = (s % 3 === 0) ? s + 2 : s - 1;
    if (I.any('repeat', 'down', 300, 150) || I.any('repeat', 'up', 300, 150)) s = (s + 3) % 6;
    if (s !== this.sel) this.t = 0;
    this.sel = s; MapScreen.last = s;
    if (I.any('pressed', 'ok')) { go(new Explore(G.LOCATIONS[s], 'hall', 0)); return; }
    if (I.any('pressed', 'back')) { go(new Title()); return; }
    if (I.any('pressed', 'pause')) go(new Inventory(this));
  };
  MapScreen.prototype.draw = function (dt) {
    var loc = G.LOCATIONS[this.sel], self = this;
    ctx.drawImage(G.stationMap(), 0, 0);
    G.LOCATIONS.forEach(function (l, k) {
      var p = G.MAP_ROOMS[k], got = save.tokens[l.feature], beaten = save.beaten[l.id].filter(Boolean).length;
      if (k === self.sel) { // lit overlay
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now / 200); R(p[0], p[1], 80, 48, l.color); ctx.globalAlpha = 1;
      }
      T(l.name.toUpperCase(), p[0] + 3, p[1] + 3, k === self.sel ? PAL.white : G.shade(l.color, 0.3), { font: 'small', shadow: '#000' });
      if (got) { G.bevel(p[0] + 46, p[1] + 36, 32, 9, PAL.yellow, '#fff', PAL.orange, '#000'); T('CLEAR', p[0] + 62, p[1] + 38, '#000', { font: 'small', align: 'center' }); }
      else T(beaten + '/3', p[0] + 76, p[1] + 38, PAL.amber, { font: 'small', align: 'right', shadow: '#000' });
    });
    // cursor: 32x32 pulsing brackets around the room centre
    var p = G.MAP_ROOMS[this.sel], cx = p[0] + 40, cy = p[1] + 22, o = 14 + Math.round(2 * Math.sin(now / 120));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
      var x = cx + s[0] * o, y = cy + s[1] * o;
      R(s[0] < 0 ? x : x - 5, y, 6, 2, PAL.yellow); R(x, s[1] < 0 ? y : y - 5, 2, 6, PAL.yellow);
    });
    cursor(cx - 2, cy - 3, PAL.yellow);
    // info panel
    var tokens = G.FEATURES.filter(function (f) { return save.tokens[f.key]; }).length;
    var feat = G.FEATURES.filter(function (f) { return f.key === loc.feature; })[0];
    G.label(6, 178, 308, 42, loc.color);
    T(loc.name, 14, 184, PAL.beigeInk);
    G.led('TOKENS ' + tokens + '/6', 306, 184, PAL.amber, 'right');
    T('TOKEN: ' + feat.name + ' (' + feat.desc + ')   HOUSE RULE: ' + loc.rule, 14, 196, PAL.beigeInk, { font: 'small' });
    T('A: GO THERE   START: CARDS   B: TITLE', 14, 207, PAL.beigeLo, { font: 'small' });
    G.chrome('STATION MAP', 160, 166, 1, 'center');
    drawToasts(dt);
  };

  // ---------- explorable location: over-the-shoulder panorama ----------
  var SCROLL_SPEED = 0.16;  // px per ms
  var HERO_X = 16, HERO_Y = 32, VIEW_Y = 16;
  function Explore(loc, scene, cam) {
    this.loc = loc; this.scene = scene || 'hall';
    this.cam = cam || 0; this.look = 0; this.t = 0;
    this.mode = 'arrive'; this.modeT = 0; this.talk = null; this.target = null;
  }
  Explore.prototype.spots = function () { return G.SCENES[this.scene].spots; };
  Explore.prototype.npcFor = function (sp) { return this.loc.npcs[sp.idx]; };
  Explore.prototype.focus = function () { // hotspot nearest the middle of the view
    var c = this.cam + 200, best = null, bd = 70;
    this.spots().forEach(function (sp) { var d = Math.abs(sp.x - c); if (d < bd) { bd = d; best = sp; } });
    return best;
  };
  Explore.prototype.update = function (dt) {
    this.t += dt;
    if (this.mode === 'arrive') { this.modeT += dt; if (this.modeT > 300) this.mode = 'walk'; return; }
    if (this.mode === 'enter') { this.modeT += dt; if (this.modeT > 850) this.arrive(); return; }
    if (this.mode === 'talk') { this.updateTalk(dt); return; }
    if (I.any('pressed', 'pause')) { go(new Inventory(this)); return; }
    if (I.any('pressed', 'back')) { go(new MapScreen()); return; }
    var dir = (I.any('down', 'right') ? 1 : 0) - (I.any('down', 'left') ? 1 : 0);
    this.cam = Math.max(0, Math.min(G.PANO_W - 320, this.cam + dir * SCROLL_SPEED * dt));
    this.look = dir * 4;
    if (I.any('pressed', 'ok')) {
      var sp = this.focus();
      if (!sp) return;
      if (sp.kind === 'npc') this.startTalk(sp);
      else { this.mode = 'enter'; this.modeT = 0; this.target = sp; this.look = 0; }
    }
  };
  Explore.prototype.arrive = function () {
    var sp = this.target, loc = this.loc;
    if (sp.kind === 'exit') { go(new MapScreen()); return; }
    var back = G.SCENES[sp.to].spots.filter(function (s) { return s.kind === 'door' || s.kind === 'exit'; })[0];
    go(new Explore(loc, sp.to, Math.max(0, Math.min(G.PANO_W - 320, back.x - 200))));
  };
  Explore.prototype.startTalk = function (sp) {
    var self = this, loc = this.loc, n = this.npcFor(sp), beaten = save.beaten[loc.id];
    var talk = { sp: sp, n: n, shown: 0, t: 0 };
    if (n.boss && !(beaten[0] && beaten[1])) talk.text = 'Beat my crew first. Then we talk.';
    else {
      talk.text = n.line + (beaten[sp.idx] ? ' Rematch?' : '');
      talk.menu = new Menu([
        { label: 'Battle!', fn: function () { self.mode = 'walk'; self.talk = null; self.startBattle(sp); } },
        { label: 'Not now', fn: function () { self.mode = 'walk'; self.talk = null; } }
      ], { back: function () { self.mode = 'walk'; self.talk = null; } });
    }
    this.talk = talk; this.mode = 'talk';
  };
  Explore.prototype.updateTalk = function (dt) {
    var tk = this.talk; tk.t += dt;
    var full = tk.text.length;
    if (tk.shown < full) {
      tk.shown = Math.min(full, tk.shown + dt * 0.045);
      if (tk.t > 150 && (I.any('pressed', 'ok') || I.any('pressed', 'back'))) tk.shown = full;
      return;
    }
    if (tk.menu) tk.menu.update();
    else if (I.any('pressed', 'ok') || I.any('pressed', 'back')) { this.mode = 'walk'; this.talk = null; }
  };
  Explore.prototype.startBattle = function (sp) {
    var self = this, loc = this.loc, n = this.npcFor(sp), me = equippedCard();
    var foeCard = n.mirror ? me.id : n.card, foeRank = n.mirror ? me.rank : n.rank;
    // Fair fights: opponents only get the features you've unlocked. A boss also uses its own
    // location's feature, so you see the token in action before you win it.
    var foeFeat = playerFeatures();
    if (n.boss && !n.mirror) foeFeat[loc.feature] = true;
    I.setSinglePlayer(true);
    this.mode = 'arrive'; this.modeT = 0;
    go(new G.Battle({
      title: loc.name, subtitle: 'HOUSE RULE: ' + loc.rule,
      color: loc.color,
      a: { name: 'YOU', features: playerFeatures(), cardId: me.id, rank: me.rank, slot: 0 },
      b: { name: n.name, features: foeFeat, cardId: foeCard, rank: foeRank, cpu: n.level },
      onQuit: function () { go(self); },
      onEnd: function (winner, battle) { self.afterBattle(sp.idx, winner === 'a', battle); }
    }));
  };
  Explore.prototype.afterBattle = function (idx, won, battle) {
    var loc = this.loc, n = loc.npcs[idx], me = equippedCard(), self = this;
    var info = { won: won, toppedOut: !battle.a.alive, me: me.id, lines: [] };
    if (won) {
      save.beaten[loc.id][idx] = true;
      if (me.id !== 'starter') {
        var before = rankOf(me.id);
        save.xp[me.id] += battle.a.score;
        var after = rankOf(me.id);
        info.lines.push([G.CARDS[me.id].name + ' +' + battle.a.score + ' XP', PAL.green]);
        if (after > before) info.lines.push(['RANK UP! ' + G.CARDS[me.id].name + ' IS NOW R' + after, PAL.yellow]);
      }
      if (n.boss && !save.tokens[loc.feature]) {
        save.tokens[loc.feature] = true;
        var f = G.FEATURES.filter(function (x) { return x.key === loc.feature; })[0];
        info.lines.push(['TOKEN: ' + f.name + ' - ' + f.desc + ' unlocked!', PAL.amber]);
      }
      info.prize = G.MONSTERS[Math.floor(Math.random() * G.MONSTERS.length)];
      info.isNew = countOf(info.prize) === 0;
      info.add = addCard(info.prize);
      info.count = countOf(info.prize);
    } else if (me.id !== 'starter') {
      removeOne(me.id);
      info.destroyed = me.id;
      info.left = countOf(me.id);
    }
    persist();
    go(new CardResult(info, function () {
      if (info.add === 'toss') go(new Inventory(self, info.prize)); else go(self);
    }));
  };

  // ---------- after-battle card screen ----------
  function CardResult(info, next) { this.info = info; this.next = next; this.t = 0; }
  CardResult.prototype.update = function (dt) {
    this.t += dt;
    if (this.t > 900 && (I.any('pressed', 'ok') || I.any('pressed', 'back'))) this.next();
  };
  function cardBack(x, y, size) {
    var m = G.cardSize(size);
    R(x + 2, y + 2, m.w, m.h, '#000');
    G.bevel(x, y, m.w, m.h, '#1b1826', '#3a3650', '#0c0b12', '#000');
    G.stripes(x + 3, y + (m.h >> 1) - 10, m.w - 6, 4, G.STRIPES, 1);
    T('SPAC', x + m.w / 2, y + 10, PAL.white, { align: 'center' });
    T('BRACK', x + m.w / 2, y + m.h - 18, PAL.white, { align: 'center' });
  }
  CardResult.prototype.draw = function (dt) {
    var info = this.info, t = this.t, m = G.cardSize('lg');
    var id = info.won ? info.prize : (info.destroyed || info.me);
    vhsBackdrop(G.CARDS[id].color);
    var red = ['#fff8ec', '#ff8a8a', '#ff3b47', '#c0203a', '#7a0a2a'];
    if (info.won) G.chrome('CARD GET!', 160, 8, 3, 'center');
    else G.chrome(info.toppedOut ? 'BRICKED UP!' : 'OUTRACED!', 160, 8, 3, 'center', red);

    var cx = 160, x = cx - (m.w >> 1), y = 40;
    if (info.won) {
      // flip in: card back, squash to an edge, then the face
      var ph = Math.min(1, t / 600), sx = ph < 0.5 ? 1 - ph * 2 : ph * 2 - 1;
      ctx.save(); ctx.translate(cx, 0); ctx.scale(Math.max(0.04, sx), 1); ctx.translate(-cx, 0);
      if (ph < 0.5) cardBack(x, y, 'lg');
      else G.drawCard(x, y, id, rankOf(id), { size: 'lg', count: info.count, glow: t > 600 && t < 900 && Math.floor(t / 60) % 2 ? PAL.white : null });
      ctx.restore();
      if (t > 600) {
        var tag = info.add === 'full' ? 'STACK FULL - CARD RETURNED' : info.add === 'toss' ? 'NO FREE SLOT - TOSS ONE NEXT' : info.isNew ? 'NEW CARD!' : 'NOW X' + info.count + ' IN YOUR STACK';
        T(G.CARDS[id].name + ' R' + rankOf(id), cx, y + m.h + 8, PAL.white, { align: 'center', shadow: '#000' });
        T(tag, cx, y + m.h + 19, info.isNew ? PAL.pink : PAL.amber, { align: 'center', font: 'small' });
      }
    } else if (info.destroyed) {
      var shake = t < 700 ? (Math.floor(t / 40) % 2 ? 1 : -1) * (t > 300 ? 2 : 0) : 0;
      G.drawCard(x + shake, y, id, rankOf(id), { size: 'lg', dead: t > 700 });
      if (t > 700) {
        T('YOUR ' + G.CARDS[id].name + ' CARD WAS DESTROYED', cx, y + m.h + 8, PAL.red, { align: 'center', font: 'small' });
        T(info.left ? info.left + ' LEFT IN YOUR STACK' : 'XP IS KEPT FOR THIS MONSTER', cx, y + m.h + 18, PAL.grey, { align: 'center', font: 'small' });
      }
    } else {
      G.drawCard(x, y, 'starter', 1, { size: 'lg' });
      T('YOUR CADET BADGE IS SAFE', cx, y + m.h + 8, PAL.white, { align: 'center', font: 'small' });
    }
    if (t > 600) info.lines.forEach(function (ln, k) { T(ln[0], cx, 172 + k * 9, ln[1], { align: 'center', font: 'small', shadow: '#000' }); });
    if (t > 900 && blink()) T('PRESS A', cx, 206, PAL.white, { align: 'center' });
  };

  // ---------- explore drawing ----------
  function speechCue(x, y) { // 16x16 person cue
    R(x + 1, y + 1, 14, 10, '#000'); R(x + 2, y + 2, 12, 8, PAL.white);
    R(x + 4, y + 10, 4, 2, PAL.white); R(x + 4, y + 12, 2, 2, PAL.white);
    for (var k = 0; k < 3; k++) R(x + 4 + k * 3, y + 5, 2, 2, k <= Math.floor(now / 250) % 3 ? PAL.orange : '#000');
  }
  function doorCue(x, y) { // 16x16 door cue: down arrow
    for (var i = 0; i < 6; i++) R(x + 2 + i, y + 4 + i, 12 - i * 2, 1, PAL.yellow);
    R(x + 6, y, 4, 4, PAL.yellow);
  }
  Explore.prototype.draw = function (dt) {
    var loc = this.loc, self = this, cam = Math.round(this.cam);
    R(0, 0, 320, 224, '#000');
    ctx.drawImage(G.panorama(loc, this.scene), cam, 0, 320, 176, 0, VIEW_Y, 320, 176);
    var focus = this.mode === 'walk' ? this.focus() : null;
    // NPCs
    this.spots().forEach(function (sp) {
      if (sp.kind !== 'npc') return;
      var n = self.npcFor(sp), img = G.npcSprite(n, loc, Math.floor((now + sp.x * 7) / 520) % 2);
      var x = sp.x - cam - (img.width >> 1), y = VIEW_Y + G.FLOOR_Y - img.height;
      if (x > 320 || x + img.width < 0) return;
      R(x + 4, y + img.height - 2, img.width - 8, 3, 'rgba(0,0,0,0.45)');
      ctx.drawImage(img, x, y);
      var beaten = save.beaten[loc.id][sp.idx];
      T(n.name.toUpperCase(), x + (img.width >> 1), y - 8, beaten ? PAL.green : PAL.white, { font: 'small', align: 'center', shadow: '#000' });
      if (sp === focus) speechCue(x + (img.width >> 1) - 8, y - 26 + (Math.floor(now / 300) % 2));
    });
    // door labels + cue
    this.spots().forEach(function (sp) {
      if (sp.kind === 'npc' || sp !== focus) return;
      var x = sp.x - cam, top = VIEW_Y + G.FLOOR_Y - sp.h + (sp.h === 64 ? 4 : 12);
      doorCue(x - 8, top - 28 + (Math.floor(now / 300) % 2));
    });
    // hero (foreground, back view)
    var rim = loc.color;
    if (this.mode === 'enter') {
      var p = Math.min(1, this.modeT / 700), sp = this.target;
      var tx = sp.x - cam, ty = VIEW_Y + G.FLOOR_Y - 20;
      var sc = 1 - 0.7 * p, w = 112 * sc, h = 160 * sc;
      var hx = HERO_X + 56 + (tx - HERO_X - 56) * p - w / 2, hy = HERO_Y + 160 + (ty - HERO_Y - 160) * p - h;
      var step = Math.floor(this.modeT / 140) % 2;
      ctx.drawImage(G.heroBack(step, 0, rim), Math.round(hx), Math.round(hy), Math.round(w), Math.round(h));
      if (this.modeT > 550) { ctx.globalAlpha = Math.min(1, (this.modeT - 550) / 250); R(0, 0, 320, 224, '#000'); ctx.globalAlpha = 1; }
    } else {
      var bob = [0, 1, 2, 1][Math.floor(this.t / 450) % 4];
      ctx.drawImage(G.heroBack(bob, this.look, rim), HERO_X, HERO_Y);
    }
    // talk close-up covers the scene
    if (this.mode === 'talk') {
      var tk = this.talk, typing = tk.shown < tk.text.length;
      var mouth = typing && tk.text[Math.floor(tk.shown)] !== ' ' ? Math.floor(now / 90) % 3 : 0;
      G.closeup(tk.n, loc, mouth, (now % 3200) < 130);
    }
    // letterbox bars
    R(0, 0, 320, VIEW_Y, '#000'); R(0, 192, 320, 32, '#000');
    G.stripes(0, 0, 48, 1, [loc.color, G.shade(loc.color, -0.3), G.shade(loc.color, -0.5)], 2, 'right');
    T(loc.name + ' - ' + G.SCENES[this.scene].name, 54, 5, loc.color, { font: 'small' });
    var me = equippedCard(), tokens = G.FEATURES.filter(function (f) { return save.tokens[f.key]; }).length;
    T(G.CARDS[me.id].name + ' R' + me.rank + '   TOKENS ' + tokens + '/6', 316, 5, PAL.grey, { font: 'small', align: 'right' });
    if (this.mode === 'talk') {
      var tk2 = this.talk;
      T(tk2.n.name.toUpperCase(), 8, 195, PAL.red);
      wrap(tk2.text.slice(0, Math.floor(tk2.shown)).toUpperCase(), 54).slice(0, 3).forEach(function (ln, k) { T(ln, 8, 204 + k * 7, PAL.white, { font: 'small' }); });
      if (tk2.shown >= tk2.text.length) {
        if (tk2.menu) tk2.menu.draw(258, 197, PAL.grey, 11);
        else if (blink()) T('A: OK', 312, 212, PAL.grey, { font: 'small', align: 'right' });
      }
    } else if (this.mode === 'walk') {
      var hint = '';
      if (focus) hint = focus.kind === 'npc' ? 'A: TALK TO ' + this.npcFor(focus).name : 'A: ' + focus.label;
      T(hint.toUpperCase(), 8, 198, PAL.white, { font: 'small' });
      T('< > LOOK AROUND   START: CARDS   B: MAP', 8, 210, PAL.grey, { font: 'small' });
    }
    if (this.mode === 'arrive') { ctx.globalAlpha = 1 - Math.min(1, this.modeT / 300); R(0, 0, 320, 224, '#000'); ctx.globalAlpha = 1; }
    drawToasts(dt);
  };

  // ---------- inventory: card grid, duplicates stack ----------
  function Inventory(back, incoming) { this.back = back; this.incoming = incoming || null; this.sel = 0; }
  Inventory.prototype.entries = function () {
    var list = [{ id: 'starter' }];
    stackIds().forEach(function (id) { list.push({ id: id, count: countOf(id) }); });
    if (this.incoming) list.push({ id: this.incoming, isNew: true, count: 1 });
    return list;
  };
  Inventory.prototype.update = function () {
    var list = this.entries(), n = list.length;
    if (I.any('repeat', 'right', 300, 150)) this.sel = Math.min(n - 1, this.sel + 1);
    if (I.any('repeat', 'left', 300, 150)) this.sel = Math.max(0, this.sel - 1);
    if (I.any('repeat', 'down', 300, 150) && this.sel + 3 < n) this.sel += 3;
    if (I.any('repeat', 'up', 300, 150) && this.sel - 3 >= 0) this.sel -= 3;
    var e = list[this.sel];
    if (I.any('pressed', 'ok')) {
      if (this.incoming) {
        if (e.id === 'starter') { toast('The Cadet Badge cannot be tossed'); return; }
        if (!e.isNew) {
          save.inventory = save.inventory.filter(function (x) { return x !== e.id; });
          if (save.equipped === e.id) save.equipped = 'starter';
          save.inventory.push(this.incoming);
          toast('Tossed your ' + G.CARDS[e.id].name + ' stack');
        } else toast('Tossed the new ' + G.CARDS[e.id].name);
        persist(); go(this.back); return;
      }
      save.equipped = e.id; persist();
      toast('Equipped ' + G.CARDS[e.id].name);
    }
    if (!this.incoming && (I.any('pressed', 'back') || I.any('pressed', 'pause'))) go(this.back);
  };
  Inventory.prototype.draw = function (dt) {
    vhsBackdrop(PAL.violet);
    G.chrome(this.incoming ? 'TOSS ONE' : 'CARDS', 84, 4, 2, 'center');
    T(stackIds().length + '/' + G.INVENTORY_CAP + ' SLOTS', 84, 21, PAL.grey, { font: 'small', align: 'center' });
    var list = this.entries(), self = this, cm = G.cardSize('md');
    list.forEach(function (e, k) {
      var sel = k === self.sel, x = 14 + (k % 3) * 50, y = 34 + Math.floor(k / 3) * 60 - (sel ? 3 : 0);
      var on = !self.incoming && save.equipped === e.id;
      G.drawCard(x, y, e.id, rankOf(e.id), { size: 'md', count: e.count, glow: sel ? (Math.floor(now / 250) % 2 ? PAL.yellow : PAL.orange) : on ? PAL.green : null });
      if (on) { R(x + 1, y + cm.h + 2, 13, 7, '#000'); T('ON', x + 3, y + cm.h + 3, PAL.green, { font: 'small' }); }
      if (e.isNew) { R(x + 1, y + cm.h + 2, 17, 7, '#000'); T('NEW', x + 3, y + cm.h + 3, PAL.pink, { font: 'small' }); }
    });
    var e = list[this.sel], c = G.CARDS[e.id], rank = rankOf(e.id);
    G.label(166, 8, 148, 182, c.color);
    T(c.name, 174, 18, PAL.beigeInk);
    if (e.count) T('X' + e.count, 306, 18, PAL.red, { align: 'right' });
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
      var a = c.actives[d], y = 70 + k * 26;
      if (!a) return;
      var open = rank >= G.DIR_RANK[d];
      T(d + ' - ' + G.DIR_ROLE[d] + ' (R' + G.DIR_RANK[d] + ')', 174, y, PAL.red, { font: 'small' });
      if (open) {
        T(a.name + ' [' + a.cost + ']', 174, y + 7, PAL.beigeInk, { font: 'small' });
        T(a.desc, 174, y + 14, PAL.beigeLo, { font: 'small' });
      } else T('? ? ?', 174, y + 7, PAL.beigeLo, { font: 'small' });
    });
    T('LOSING IN ADVENTURE DESTROYS', 174, 174, PAL.beigeLo, { font: 'small' });
    T('ONE COPY OF THE EQUIPPED CARD.', 174, 181, PAL.beigeLo, { font: 'small' });
    T(this.incoming ? 'A: TOSS SELECTED STACK' : 'A: EQUIP   B: BACK', 84, 212, PAL.white, { font: 'small', align: 'center' });
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
  G.debug = { save: function () { return save; }, screens: { CardResult: CardResult, Title: Title, MapScreen: MapScreen, Explore: Explore, Inventory: Inventory, VersusSetup: VersusSetup, Controls: Controls } };
  go(new Title());
  requestAnimationFrame(frame);
})(globalThis.G = globalThis.G || {});
