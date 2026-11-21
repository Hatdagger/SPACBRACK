// A versus match: two Players, human/CPU controllers, drawing.
(function (G) {
  'use strict';

  var DAS = 160, ARR = 40;
  var C = 8;                 // brick size in pixels
  var FW = 80, FH = 160;     // field size
  var FX = [48, 192], FY = 30;

  // Human controller for one board.
  function Human(player, slot) {
    this.p = player; this.slot = slot;
    this.dasDir = 0; this.dasT = 0;
    this.cardMode = false; this.cardDir = null;
  }
  Human.prototype.update = function (dt) {
    var p = this.p, s = this.slot;
    if (!p.alive || p.won) return;

    // Card ability: hold button, pick direction, release to fire.
    if (s.pressed('card')) { this.cardMode = true; this.cardDir = null; }
    if (this.cardMode) {
      var self = this;
      G.DIRS.forEach(function (d) { if (s.down(d)) self.cardDir = d; });
      var cancel = ['rotCW', 'rotCCW', 'hard', 'hold', 'perk'].some(function (a) { return s.pressed(a); });
      if (cancel) { this.cardMode = false; }
      else if (s.released('card') || !s.down('card')) {
        if (this.cardDir) p.fire(this.cardDir);
        this.cardMode = false;
      }
      p.softDrop = false;
      if (this.cardMode) return; // d-pad picks abilities while the card button is held
    }

    if (s.pressed('rotCW')) p.rotate(1);
    if (s.pressed('rotCCW')) p.rotate(-1);
    if (s.pressed('hold')) p.hold();
    if (s.pressed('hard')) { p.hardDrop(); return; }

    var dir = s.down('left') ? -1 : s.down('right') ? 1 : 0;
    if (s.pressed('left')) dir = -1;
    if (s.pressed('right')) dir = 1;
    if (dir !== this.dasDir) { this.dasDir = dir; this.dasT = 0; this.arrT = 0; if (dir) p.move(dir); }
    else if (dir) {
      this.dasT += dt;
      if (this.dasT >= DAS) {
        this.arrT += dt;
        while (this.arrT >= ARR) { this.arrT -= ARR; p.move(dir); }
      }
    }
    p.softDrop = s.down('down');
  };

  function Battle(cfg) {
    // cfg: {a:{name,features,cardId,rank,cpu?:level, slot?}, b:{...}, title, onEnd(result)}
    this.cfg = cfg;
    var seed = Math.random;
    this.a = new G.Player(Object.assign({ rng: seed, isCPU: cfg.a.cpu != null }, cfg.a));
    this.b = new G.Player(Object.assign({ rng: seed, isCPU: cfg.b.cpu != null }, cfg.b));
    this.a.opponent = this.b; this.b.opponent = this.a;
    this.ctrl = [this.a, this.b].map(function (p, i) {
      var c = i === 0 ? cfg.a : cfg.b;
      return c.cpu != null ? new G.CPU(p, c.cpu) : new Human(p, G.Input.slots[c.slot || 0]);
    });
    this.countdown = 2400;
    this.paused = false;
    this.over = false;
    this.time = 0;
  }

  Battle.prototype.result = function () {
    var a = this.a, b = this.b;
    if (a.won || !b.alive) return 'a';
    if (b.won || !a.alive) return 'b';
    return null;
  };

  Battle.prototype.update = function (dt) {
    var anyPause = G.Input.any('pressed', 'pause');
    if (this.over) {
      if (this.endT > 800 && (G.Input.any('pressed', 'ok') || anyPause)) this.cfg.onEnd(this.winner, this);
      this.endT += dt;
      return;
    }
    if (anyPause && this.countdown <= 0) this.paused = !this.paused;
    if (this.paused) {
      if (G.Input.any('pressed', 'back')) { this.paused = false; this.cfg.onQuit && this.cfg.onQuit(); }
      return;
    }
    if (this.countdown > 0) { this.countdown -= dt; return; }
    this.time += dt;
    this.ctrl.forEach(function (c) { c.update(dt); });
    this.a.update(dt); this.b.update(dt);
    var r = this.result();
    if (r) { this.over = true; this.winner = r; this.endT = 0; }
  };

  // ---------- drawing (320x224 pixel space) ----------
  var R = G.rect, T = G.text, PAL = G.PAL;

  function mini(type, cx, cy, s) {
    if (!type) return;
    var cells = G.SHAPES[type][0], minX = 9, maxX = -1, minY = 9, maxY = -1;
    cells.forEach(function (c) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
    var w = (maxX - minX + 1) * s, h = (maxY - minY + 1) * s;
    cells.forEach(function (c) { G.brick(cx - (w >> 1) + (c[0] - minX) * s, cy - (h >> 1) + (c[1] - minY) * s, s, G.BLOCK_COLORS[type]); });
  }

  function ghostCell(x, y, color) {
    for (var yy = 0; yy < C; yy++) for (var xx = 0; xx < C; xx++) {
      var edge = xx === 0 || yy === 0 || xx === C - 1 || yy === C - 1;
      if (edge ? (xx + yy) % 2 === 0 : false) G.px(x + xx, y + yy, color);
    }
  }

  Battle.prototype.drawBoard = function (p, i, ctrl) {
    var fx = FX[i], fy = FY, accent = p.card.color, t = this.time;
    // Deck bezel + recessed field
    G.deck(fx - 6, fy - 6, FW + 12, FH + 12);
    G.inset(fx, fy, FW, FH, '#05060c');
    for (var gy = 1; gy < 20; gy++) for (var gx = 1; gx < 10; gx++) G.px(fx + gx * C, fy + gy * C, '#161a2c');

    for (var y = G.HIDDEN; y < G.ROWS; y++) for (var x = 0; x < G.COLS; x++) {
      var c = p.grid[y][x];
      if (c) G.brick(fx + x * C, fy + (y - G.HIDDEN) * C, C, c === 'G' ? G.shade(accent, -0.55) : G.BLOCK_COLORS[c]);
    }
    if (p.alive && !p.won) {
      var pc = p.piece, col = G.BLOCK_COLORS[pc.type];
      if (p.showGhost()) {
        var gyy = p.ghostY();
        p.cells(pc.type, pc.rot, pc.x, gyy).forEach(function (c) {
          if (c[1] >= G.HIDDEN) ghostCell(fx + c[0] * C, fy + (c[1] - G.HIDDEN) * C, col);
        });
      }
      p.cells(pc.type, pc.rot, pc.x, pc.y).forEach(function (c) {
        if (c[1] >= G.HIDDEN) G.brick(fx + c[0] * C, fy + (c[1] - G.HIDDEN) * C, C, col);
      });
    }
    if (p.effects.dark) {
      for (var dy = 0; dy < 112; dy++) R(fx, fy + dy, FW, 1, dy % 2 ? '#000' : '#07040f');
      T('DARK', fx + 40, fy + 50, PAL.violet, { align: 'center', font: 'small' });
    }
    if (p.clearAnim) { var ctxA = this._ctx; ctxA.globalAlpha = p.clearAnim / 180 * 0.5; R(fx, fy, FW, FH, '#fff8ec'); ctxA.globalAlpha = 1; }
    if (p.kickFlash) T('THRUST!', fx + 40, fy + 3, PAL.orange, { align: 'center', font: 'small' });

    // Incoming garbage gauge in the bezel
    var pend = p.pendingRows();
    R(fx - 5, fy, 3, FH, '#16080a');
    if (pend) { var gh = Math.min(FH, pend * C); R(fx - 5, fy + FH - gh, 3, gh, (Math.floor(t / 150) % 2) ? PAL.red : '#ff8a8a'); }

    // Side panel: hold, lucky-7 reel, next, equipped card
    var sx = i === 0 ? 4 : 280;
    if (p.features.hold) {
      T('HOLD', sx, fy - 6, PAL.amber, { font: 'small' });
      G.inset(sx, fy + 1, 36, 19);
      if (p.holdUsed) this._ctx.globalAlpha = 0.35;
      mini(p.holdType, sx + 18, fy + 10, 4);
      this._ctx.globalAlpha = 1;
    }
    if (p.features.bag) {
      var ry = fy + 23;
      G.PIECE_TYPES.forEach(function (tp, k2) {
        var lit = p.bagPool.indexOf(tp) >= 0;
        G.bevel(sx + 1 + k2 * 5, ry, 4, 7, lit ? G.BLOCK_COLORS[tp] : '#1c1a28', lit ? '#fff' : '#2a2838', lit ? G.shade(G.BLOCK_COLORS[tp], -0.5) : '#0c0b12');
      });
    }
    var n = p.previewCount();
    if (n) {
      var ny = fy + 33;
      T('NEXT', sx, ny, PAL.amber, { font: 'small' });
      G.inset(sx, ny + 7, 36, n * 13 + 4);
      for (var k = 0; k < n; k++) mini(p.queue[k], sx + 18, ny + 14 + k * 13, 4);
    }
    var castNow = p.fxEvents.some(function (f) { return f.kind === 'cast'; });
    G.drawCard(sx - 1, fy + 110, p.cardId, p.rank, { size: 'md', glow: castNow && Math.floor(t / 80) % 2 ? PAL.white : null });

    // Under the board: name, card status / cooldown, LED line counter, VU meter (= ability meter)
    var by = fy + FH + 8;
    T(p.name.slice(0, 15), fx - 6, by, PAL.white, { font: 'small' });
    if (p.cooldown) {
      T('RECHARGE', fx - 6, by + 7, PAL.grey, { font: 'small' });
      var cw = Math.ceil(30 * p.cooldown / G.ABILITY_COOLDOWN);
      R(fx + 28, by + 8, 30, 3, '#1a1726'); R(fx + 28, by + 8, cw, 3, PAL.grey);
    } else T(Object.keys(p.card.actives).length ? 'CARD READY' : p.card.name, fx - 6, by + 7, p.cardId === 'starter' ? PAL.grey : accent, { font: 'small' });
    G.led(('0' + Math.min(p.lines, G.WIN_LINES)).slice(-2) + '/' + G.WIN_LINES, fx + FW + 6, by, PAL.amber, 'right');
    if (p.cooldown) this._ctx.globalAlpha = 0.4;
    G.vu(fx - 6, by + 15, 10, p.meter, 8, 4);
    this._ctx.globalAlpha = 1;

    // Ability effects on this board
    p.fxEvents.forEach(function (f) {
      if (f.kind === 'boulder') {
        var bx = fx + f.x * C - 2, byy = fy + (f.y - G.HIDDEN) * C - 2, S = 2 * C + 4;
        if (Math.floor(f.t / 60) % 2) { R(bx, byy, S, 1, PAL.yellow); R(bx, byy + S - 1, S, 1, PAL.yellow); R(bx, byy, 1, S, PAL.yellow); R(bx + S - 1, byy, 1, S, PAL.yellow); }
        for (var d = 0; d < 6; d++) G.px(bx + 2 + ((d * 7 + Math.floor(f.t / 20)) % (2 * C)), byy - 2 - ((d * 3 + Math.floor((400 - f.t) / 20)) % 8), '#c89a5a');
      }
    });
    var stat = [];
    if (p.effects.fur) stat.push(['FUR', PAL.orange]);
    if (p.effects.roost) stat.push(['ROOST', PAL.violet]);
    if (p.effects.sonar) stat.push(['SONAR', PAL.cyan]);
    if (p.effects.howl) stat.push(['HOWL', PAL.red]);
    if (p.effects.shiver) stat.push(['SHIVER', PAL.white]);
    if (p.effects.glare) stat.push(['GLARE', PAL.yellow]);
    stat.forEach(function (st, k4) {
      var w = G.textWidth(st[0], 'small') + 4;
      R(fx + 1, fy + 1 + k4 * 8, w, 7, '#000'); R(fx + 1, fy + 1 + k4 * 8, 1, 7, st[1]);
      T(st[0], fx + 3, fy + 2 + k4 * 8, st[1], { font: 'small' });
    });
    if (p.effects.fur) { var sc = Math.floor(t / 120) % 2 ? PAL.orange : G.shade(PAL.orange, -0.4); R(fx, fy + FH - 1, FW, 1, sc); R(fx, fy + FH - 3, FW, 1, sc); }

    // Floating callouts
    p.flash.forEach(function (f, k3) {
      var yy = fy + 60 - k3 * 10 - Math.floor((1200 - f.t) / 60);
      T(f.text, fx + 40, yy, PAL.yellow, { align: 'center', shadow: '#000' });
    });

    if (ctrl && ctrl.cardMode) this.drawCardOverlay(p, ctrl, fx + 40, fy + 80);
    var cast = p.fxEvents.filter(function (f) { return f.kind === 'cast'; })[0];
    if (cast) this.drawCast(p, cast, fx, fy);
    if (!p.alive) {
      R(fx, fy + 62, FW, 30, '#000'); R(fx, fy + 62, FW, 1, PAL.red); R(fx, fy + 91, FW, 1, PAL.red);
      T('BRICKED', fx + 40, fy + 67, PAL.red, { align: 'center' });
      T('UP!', fx + 40, fy + 78, PAL.red, { align: 'center' });
    }
  };

  // The card pops up over the caster's field when an ability fires.
  Battle.prototype.drawCast = function (p, f, fx, fy) {
    var ctx = this._ctx, age = G.CAST_MS - f.t, m = G.cardSize('lg');
    var rise = age < 150 ? Math.round((150 - age) / 6) : 0;
    ctx.globalAlpha = f.t < 250 ? f.t / 250 : 1;
    var x = fx + ((FW - m.w) >> 1), y = fy + 22 + rise;
    G.drawCard(x, y, p.cardId, p.rank, { size: 'lg', glow: Math.floor(age / 70) % 2 ? PAL.white : p.card.color });
    var w = Math.max(m.w + 8, G.textWidth(f.name, 'big') + 8), bx = fx + 40 - (w >> 1), by = y + m.h + 4;
    R(bx, by, w, 11, '#000'); R(bx, by, w, 1, p.card.color); R(bx, by + 10, w, 1, p.card.color);
    T(f.name, fx + 40, by + 2, PAL.yellow, { align: 'center' });
    ctx.globalAlpha = 1;
  };

  Battle.prototype.drawCardOverlay = function (p, ctrl, cx, cy) {
    var c = p.card;
    G.label(cx - 62, cy - 56, 124, 112, c.color);
    if (!Object.keys(c.actives).length) {
      T('NO ABILITIES', cx, cy - 6, PAL.beigeInk, { align: 'center', font: 'small' });
      T('ON ' + c.name, cx, cy + 2, PAL.beigeInk, { align: 'center', font: 'small' });
      return;
    }
    T('PASSIVE: ' + c.passive.name, cx, cy - 48, PAL.beigeInk, { align: 'center', font: 'small' });
    var pos = { up: [0, -28], down: [0, 28], left: [-31, 0], right: [31, 0] };
    G.DIRS.forEach(function (d) {
      var a = c.actives[d], x = cx + pos[d][0] - 28, y = cy + pos[d][1] - 8;
      var open = p.unlocked(d), afford = p.canFire(d), sel = ctrl.cardDir === d;
      G.bevel(x, y, 56, 16, sel ? c.color : '#1a1726', sel ? '#fff' : '#3a3650', sel ? G.shade(c.color, -0.5) : '#000', '#000');
      var ink = sel ? '#000' : (afford ? PAL.white : '#6c6880');
      T(open ? a.name : '? ? ?', x + 28, y + 2, ink, { align: 'center', font: 'small' });
      T(open ? 'COST ' + a.cost : 'RANK ' + G.DIR_RANK[d], x + 28, y + 9, sel ? '#000' : (open ? PAL.amber : '#4a4660'), { align: 'center', font: 'small' });
    });
  };

  var STARS = [];
  for (var si = 0; si < 70; si++) STARS.push([Math.floor(Math.random() * 320), Math.floor(Math.random() * 150), Math.random() < 0.2]);
  G.starfield = function (t) {
    STARS.forEach(function (s) { G.px(s[0], s[1], s[2] && Math.floor(t / 400 + s[0]) % 3 === 0 ? '#fff' : '#5a5878'); });
  };

  Battle.prototype.draw = function (ctx) {
    this._ctx = ctx;
    var accent = this.cfg.color || PAL.cyan, now = performance.now();
    R(0, 0, 320, 224, PAL.night);
    G.starfield(now);
    G.floor(150, 74, G.shade(accent, -0.35), now / 16);
    // title strip with stripes
    G.stripes(0, 0, 70, 1, G.STRIPES, 1, 'right');
    G.stripes(250, 0, 70, 1, G.STRIPES, 1);
    T(this.cfg.title || 'VERSUS', 160, 4, accent, { align: 'center', shadow: '#000' });
    if (this.cfg.subtitle) T(this.cfg.subtitle, 160, 14, PAL.grey, { align: 'center', font: 'small' });

    this.drawBoard(this.a, 0, this.ctrl[0] instanceof Human ? this.ctrl[0] : null);
    this.drawBoard(this.b, 1, this.ctrl[1] instanceof Human ? this.ctrl[1] : null);

    // centre console
    G.chrome('VS', 160, 76, 2, 'center');
    var secs = Math.floor(this.time / 1000);
    G.inset(141, 100, 38, 11);
    G.led(Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2), 160, 102, PAL.green, 'center', PAL.greenDim);
    T('FIRST', 160, 118, PAL.grey, { align: 'center', font: 'small' });
    T('TO ' + G.WIN_LINES, 160, 125, PAL.grey, { align: 'center', font: 'small' });

    if (this.countdown > 0) {
      for (var y = 0; y < 224; y += 2) R(0, y, 320, 1, 'rgba(0,0,0,0.6)');
      var n = Math.ceil(this.countdown / 800);
      R(0, 82, 320, 60, '#000'); G.stripes(0, 82, 320, 1); G.stripes(0, 137, 320, 1, G.STRIPES.slice().reverse());
      G.chrome(n > 0 ? String(n) : 'GO', 160, 92, 5, 'center');
    }
    if (this.paused) {
      R(0, 80, 320, 64, '#000'); G.stripes(0, 80, 320, 1); G.stripes(0, 139, 320, 1, G.STRIPES.slice().reverse());
      G.chrome('PAUSED', 160, 92, 3, 'center');
      T('START: RESUME   B: QUIT MATCH', 160, 124, PAL.white, { align: 'center', font: 'small' });
    }
    if (this.over) {
      var win = this.winner === 'a' ? this.a : this.b, lose = this.winner === 'a' ? this.b : this.a;
      var youLost = lose.name === 'YOU' || (lose === this.a && this.ctrl[1] instanceof G.CPU);
      R(0, 84, 320, 56, '#000'); G.stripes(0, 84, 320, 1); G.stripes(0, 135, 320, 1, G.STRIPES.slice().reverse());
      var red = ['#fff8ec', '#ff8a8a', '#ff3b47', '#c0203a', '#7a0a2a'];
      var toppedOut = !lose.alive;   // "bricked up" only when the stack hit the top
      if (youLost && toppedOut) {
        G.chrome('YOU GOT', 160, 92, 2, 'center', red);
        G.chrome('BRICKED UP!', 160, 108, 2, 'center', red);
      } else if (youLost) {
        G.chrome('OUTRACED!', 160, 94, 2, 'center', red);
        T(win.name + ' CLEARED ' + G.WIN_LINES + ' LINES FIRST', 160, 113, PAL.red, { align: 'center', font: 'small' });
      } else {
        G.chrome(win.name.length > 12 ? 'WINNER!' : win.name + ' WINS', 160, 94, 2, 'center');
        T(toppedOut ? lose.name + ' GOT BRICKED UP!' : win.name + ' CLEARED ' + G.WIN_LINES + ' LINES FIRST', 160, 113, toppedOut ? PAL.red : PAL.green, { align: 'center', font: 'small' });
      }
      if (this.endT > 800 && Math.floor(now / 400) % 2) T('PRESS A', 160, 126, PAL.white, { align: 'center', font: 'small' });
    }
  };

  G.Battle = Battle;
})(globalThis.G = globalThis.G || {});
