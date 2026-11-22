// A versus match: two Players, human/CPU controllers, drawing.
(function (G) {
  'use strict';

  var DAS = 160, ARR = 40;
  var HOLD_MS = 400;         // perk button held this long = jump (Chrono Station)
  var C = 8;                 // brick size in pixels
  var FW = 80, FH = 160;     // field size
  var FX = [48, 192], FY = 30;

  // Human controller for one board.
  function Human(player, slot) {
    this.p = player; this.slot = slot;
    this.dasDir = 0; this.dasT = 0;
    this.cardMode = false; this.cardDir = null;
  }
  // One button driving one rule's perk. Save states: tap = mark, hold = jump.
  Human.prototype.perkButton = function (btn, rule, dt) {
    var p = this.p, s = this.slot, st = this['pb_' + btn] || (this['pb_' + btn] = { t: 0, fired: false });
    if (rule === 'chrono') {
      if (s.pressed(btn)) { st.t = 0; st.fired = false; }
      if (s.down(btn)) {
        st.t += dt;
        if (!st.fired && st.t >= HOLD_MS) { st.fired = true; p.jump(); }
      } else if (s.released(btn) && !st.fired) p.mark();
      return;
    }
    if (!s.pressed(btn)) return;
    if (rule === 'launch') p.battle.tryLaunch(p);
    else if (rule === 'fold') p.earlyFold();
    else if (rule === 'bank') p.withdraw();
    else if (rule === 'casino') p.pullLever();
    else if (rule === 'holo') p.holoFreeze();
  };
  // Which button runs a rule's perk for this player, for the on-screen hints.
  Battle.prototype.btnName = function (p, rule) { return this.rule === rule ? 'PERK' : 'CARD'; };

  Human.prototype.update = function (dt) {
    var p = this.p, s = this.slot;
    if (!p.alive || p.won) return;
    if (p.foldLock > 0) { this.cardMode = false; p.softDrop = false; this.dasDir = 0; return; }   // fold playing: input locked

    // Eye Beam aiming: left/right moves the beam, A / B / hard drop / card button fires it.
    if (p.aim) {
      if (s.pressed('left')) p.aimMove(-1);
      if (s.pressed('right')) p.aimMove(1);
      if (['rotCW', 'rotCCW', 'hard', 'card', 'ok'].some(function (a) { return s.pressed(a); })) p.aimFire();
      p.softDrop = false;
      return;
    }
    // Unique boss cards have no directional moves: the card button runs the card's own perk.
    // The stage perk button only ever runs the location's house rule.
    var houseRule = p.battle && p.battle.rule, cardRule = p.card.unique ? p.card.rule : null;
    if (houseRule) this.perkButton('perk', houseRule, dt);
    if (cardRule) this.perkButton('card', cardRule, dt);
    // Card ability: hold button, pick direction, release to fire.
    if (s.pressed('card') && !cardRule) { this.cardMode = true; this.cardDir = null; }
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
    var self = this;
    [this.a, this.b].forEach(function (p) { p.battle = self; });
    // House rule. 'launch' = Launch Complex: garbage off, time limit, Launch Countdown perk.
    this.rule = cfg.rule || null;
    this.winLines = cfg.winLines || G.WIN_LINES;
    this.a.winLines = this.b.winLines = this.winLines;
    this.launch = null;                // active Launch Countdown: {by, t, linesAt}
    this.launchUsed = [false, false];
    if (this.rule === 'launch') {
      this.a.noGarbage = this.b.noGarbage = true;
      this.limit = cfg.timeLimit || 360000;
    }
    if (this.rule === 'chrono') this.a.chronoOn = this.b.chronoOn = true;
    if (this.rule === 'fold') this.a.foldOn = this.b.foldOn = true;
    if (this.rule === 'bank') this.a.bankOn = this.b.bankOn = true;
    if (this.rule === 'casino') this.a.leverOn = this.b.leverOn = true;
    if (this.rule === 'holo') this.a.holoOn = this.b.holoOn = true;
    this.bet = cfg.bet || null;        // Space Casino card bet (Adventure): {mine, theirs} card ids
    this.endWhy = null;
    this.countdown = 2400;
    this.paused = false;
    this.over = false;
    this.time = 0;
  }

  // ---------- Launch Complex: Launch Countdown perk ----------
  var LAUNCH_MS = 10000;
  Battle.prototype.idx = function (p) { return p === this.a ? 0 : 1; };
  // Launch Countdown: everyone at Launch Complex, or whoever holds the Launch Key card.
  Battle.prototype.hasLaunch = function (p) { return this.rule === 'launch' || p.card.rule === 'launch'; };
  Battle.prototype.canLaunch = function (p) {
    return this.hasLaunch(p) && !this.over && !this.launch && this.countdown <= 0 &&
      !this.launchUsed[this.idx(p)] && p.alive && p.lines > p.opponent.lines;
  };
  Battle.prototype.tryLaunch = function (p) {
    if (!this.canLaunch(p)) {
      if (this.hasLaunch(p) && !this.over && !this.launch) { p.say(this.launchUsed[this.idx(p)] ? 'COUNT SPENT' : 'GET AHEAD FIRST'); p.perkFx('deny'); }
      return false;
    }
    this.launchUsed[this.idx(p)] = true;
    this.launch = { by: p, t: LAUNCH_MS, linesAt: p.lines };
    p.avoidClears = true;
    p.say('COUNTDOWN!'); p.perkFx('launch');
    return true;
  };
  Battle.prototype.updateLaunch = function (dt) {
    var L = this.launch;
    if (L) {
      var p = L.by, o = p.opponent, why = null;
      if (p.lines > L.linesAt) why = 'CLEARED A LINE';
      else if (o.lines >= p.lines) why = o.name + ' CAUGHT UP';
      if (why) {
        p.avoidClears = false; this.launch = null;
        p.say('COUNT BROKEN'); this.brokenMsg = { text: 'COUNT BROKEN - ' + why, t: 1800 };
      } else {
        L.t -= dt;
        if (L.t <= 0) { p.avoidClears = false; this.launch = null; this.forced = this.idx(p) === 0 ? 'a' : 'b'; this.endWhy = 'launch'; }
      }
    }
    if (this.brokenMsg && (this.brokenMsg.t -= dt) <= 0) this.brokenMsg = null;
    // Time limit: more lines wins. A tie goes to sudden death (next line wins).
    if (!this.forced && this.limit && this.time >= this.limit) {
      if (this.a.lines !== this.b.lines) { this.forced = this.a.lines > this.b.lines ? 'a' : 'b'; this.endWhy = 'time'; }
      else this.sudden = true;
    }
  };

  Battle.prototype.result = function () {
    var a = this.a, b = this.b;
    if (this.forced) return this.forced;
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
    if (this.rule === 'launch' || this.launch || this.brokenMsg) this.updateLaunch(dt);
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

  // Hard drop "teleport": the brick goes white and shakes where it was (fading out) while the landing
  // spot does the same (fading in to the real colour), plus a few sparks between them.
  Battle.prototype.drawTeleport = function (p, fx, fy) {
    var ctx = this._ctx, self = p;
    p.fxEvents.forEach(function (f) {
      if (f.kind !== 'teleport') return;
      var k = f.t / G.TELEPORT_MS;              // 1 -> 0
      var cells0 = self.cells(f.type, f.rot, f.x, f.y0), cells1 = self.cells(f.type, f.rot, f.x, f.y1);
      var j = function () { return Math.round((Math.random() * 2 - 1) * 2 * k); };
      // phase out at the start position
      ctx.globalAlpha = Math.max(0, k);
      var ox = j(), oy = j();
      cells0.forEach(function (c) { if (c[1] >= G.HIDDEN) R(fx + c[0] * C + ox, fy + (c[1] - G.HIDDEN) * C + oy, C, C, '#ffffff'); });
      // phase in at the landing spot: white flash fading back to the brick colour underneath
      ctx.globalAlpha = Math.max(0, k * 0.9);
      var lx = j(), ly = j();
      cells1.forEach(function (c) {
        if (c[1] < G.HIDDEN) return;
        var x = fx + c[0] * C, y = fy + (c[1] - G.HIDDEN) * C;
        R(x + lx, y + ly, C, C, '#ffffff');
      });
      // sparks along the path
      ctx.globalAlpha = Math.max(0, k);
      var top = (f.y0 - G.HIDDEN) * C, bot = (f.y1 - G.HIDDEN) * C;
      for (var s = 0; s < 8; s++) {
        var cx = cells0[s % cells0.length][0] * C + Math.floor(Math.random() * C);
        var cy = top + Math.random() * Math.max(1, bot - top + C);
        if (cy >= 0) G.px(fx + cx, fy + cy, s % 2 ? '#ffffff' : '#9ff3ff');
      }
      ctx.globalAlpha = 1;
    });
  };

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
      if (pc.holo) this.drawHoloPiece(p, fx, fy, t);
      else p.cells(pc.type, pc.rot, pc.x, pc.y).forEach(function (c) {
        if (c[1] >= G.HIDDEN) G.brick(fx + c[0] * C, fy + (c[1] - G.HIDDEN) * C, C, col);
      });
    }
    this.drawTeleport(p, fx, fy);
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
    G.led(('0' + Math.min(p.lines, p.winLines)).slice(-2) + '/' + p.winLines, fx + FW + 6, by, PAL.amber, 'right');
    if (p.cooldown) this._ctx.globalAlpha = 0.4;
    G.vu(fx - 6, by + 15, 10, p.meter, 8, 4);
    this._ctx.globalAlpha = 1;

    // Eye Beam aim: two columns outlined, blinking
    if (p.aim) {
      var ax = fx + p.aim.x * C, on = Math.floor(t / 120) % 2;
      this._ctx.globalAlpha = 0.25; R(ax, fy, 2 * C, FH, PAL.yellow); this._ctx.globalAlpha = 1;
      if (on) { R(ax, fy, 1, FH, PAL.yellow); R(ax + 2 * C - 1, fy, 1, FH, PAL.yellow); }
      T('AIM', fx + 40, fy + 20, PAL.yellow, { align: 'center', shadow: '#000' });
      T('LEFT/RIGHT  A: FIRE', fx + 40, fy + 30, PAL.white, { align: 'center', font: 'small', shadow: '#000' });
    }
    // Ability effects on this board
    var ctx2 = this._ctx;
    p.fxEvents.forEach(function (f) {
      if (f.kind === 'defense') {
        var k = f.t / 400;
        ctx2.globalAlpha = k * 0.7;
        if (f.id === 'eyebeam') R(fx + f.x * C, fy, 2 * C, FH, '#fff3a0');
        else if (f.id === 'pound') R(fx, fy + FH - 3 * C, FW, 3 * C, '#ff8a1e');
        else if (f.id === 'echo') { R(fx, fy, FW, 3, '#b18cff'); R(fx, fy + FH - 3, FW, 3, '#b18cff'); R(fx, fy, 3, FH, '#b18cff'); R(fx + FW - 3, fy, 3, FH, '#b18cff'); }
        else R(fx, fy, FW, FH, '#efe6cc');
        ctx2.globalAlpha = 1;
      }
      if (f.kind === 'boulder') {
        var bx = fx + f.x * C - 2, byy = fy + (f.y - G.HIDDEN) * C - 2, S = 2 * C + 4;
        if (Math.floor(f.t / 60) % 2) { R(bx, byy, S, 1, PAL.yellow); R(bx, byy + S - 1, S, 1, PAL.yellow); R(bx, byy, 1, S, PAL.yellow); R(bx + S - 1, byy, 1, S, PAL.yellow); }
        for (var d = 0; d < 6; d++) G.px(bx + 2 + ((d * 7 + Math.floor(f.t / 20)) % (2 * C)), byy - 2 - ((d * 3 + Math.floor((400 - f.t) / 20)) % 8), '#c89a5a');
      }
    });
    var stat = [];
    if (p.effects.fur) stat.push(['FUR', PAL.orange]);
    if (p.effects.echo) stat.push(['ECHO', PAL.violet]);
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

    if (p.chronoOn) this.drawChrono(p, i, fx, fy, t);
    if (p.foldOn) this.drawFold(p, i, fx, fy, t);
    if (p.bankOn) this.drawBank(p, i, fx, fy, t);
    if (p.leverOn) this.drawLever(p, i, fx, fy, t);
    if (p.holoOn) this.drawHolo(p, i, fx, fy, t);

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

  // Chrono Station: status line over the board and the marked field as a faint "photo" in the corner.
  Battle.prototype.drawChrono = function (p, i, fx, fy, t) {
    var ctx = this._ctx, jumps = p.jumpsLeft(), human = this.ctrl[i] instanceof Human;
    var txt, col;
    if (p.lines < 10) { txt = 'MARK AT 10 LINES'; col = '#6c6880'; }
    else if (!p.markGrid) { txt = human ? 'TAP ' + this.btnName(p, 'chrono') + ': MARK' : 'NO MARK'; col = Math.floor(t / 300) % 2 ? PAL.yellow : PAL.amber; }
    else { txt = 'JUMPS ' + jumps + (human && jumps ? '  HOLD ' + this.btnName(p, 'chrono') : ''); col = jumps ? PAL.cyan : '#6c6880'; }
    T(txt, fx + 40, fy - 7, col, { align: 'center', font: 'small' });
    if (p.markGrid) {
      var px = fx + FW - 23, py = fy + 2, s = 2;
      ctx.globalAlpha = 0.5;
      R(px - 1, py - 1, G.COLS * s + 2, (G.ROWS - G.HIDDEN) * s + 9, '#000');
      for (var y = G.HIDDEN; y < G.ROWS; y++) for (var x = 0; x < G.COLS; x++)
        if (p.markGrid[y][x]) R(px + x * s, py + (y - G.HIDDEN) * s, s, s, '#9ab8d8');
      T('MARK', px + G.COLS, py + (G.ROWS - G.HIDDEN) * s + 1, PAL.cyan, { align: 'center', font: 'small' });
      ctx.globalAlpha = 1;
    }
    var j = p.fxEvents.filter(function (f) { return f.kind === 'jump'; })[0];
    if (j) { ctx.globalAlpha = j.t / 500; R(fx, fy, FW, FH, '#bfe4ff'); ctx.globalAlpha = 1; }
  };

  // Fold Lab: "FOLD IN n" over the board, side markers for chunks heading to this board, fold flash.
  Battle.prototype.drawFold = function (p, i, fx, fy, t) {
    var ctx = this._ctx, human = this.ctrl[i] instanceof Human, o = p.opponent;
    var held = p.heldRows();
    var txt = 'FOLD IN ' + p.foldInLines() + (held ? '  HELD ' + held : '');
    T(txt, fx + 40, fy - 7, held ? PAL.green : '#6c6880', { align: 'center', font: 'small' });
    if (human && p.earlyFoldBlock() === null) T(this.btnName(p, 'fold') + ': EARLY FOLD', fx + 40, fy + FH + 1, Math.floor(t / 300) % 2 ? PAL.yellow : PAL.amber, { align: 'center', font: 'small' });
    // Right bezel: dim = held by the opponent, blinking red = folded in, lands next placement.
    var mx = fx + FW + 2, bottom = fy + FH, vis = G.ROWS - G.HIDDEN;
    R(mx, fy, 3, FH, '#0a1608');
    var marks = function (chunks, col) {
      p.foldLandings(chunks).forEach(function (m) {
        var top = Math.min(vis, m.base + m.rows), h0 = Math.min(vis, m.base);
        if (top <= h0) { R(mx, fy, 3, 2, col); return; }
        R(mx, bottom - top * C, 3, (top - h0) * C - 1, col);
      });
    };
    var queued = p.foldIn.length;
    if (!queued && o) marks(o.foldHeld, G.shade(PAL.green, -0.35));
    if (queued) marks(p.foldIn, Math.floor(t / 120) % 2 ? PAL.red : '#ff8a8a');
    // Fold flash: stamped rows light up while input is locked.
    var f = p.fxEvents.filter(function (e) { return e.kind === 'fold'; })[0];
    if (f) {
      ctx.globalAlpha = 0.25 + 0.5 * f.t / G.FOLD_LOCK_MS;
      f.rows.forEach(function (y) { if (y >= G.HIDDEN) R(fx, fy + (y - G.HIDDEN) * C, FW, C, Math.floor(t / 80) % 2 ? '#d8ffc0' : PAL.green); });
      ctx.globalAlpha = 1;
      T('FOLD!', fx + 40, fy + 40, PAL.green, { align: 'center', shadow: '#000' });
    }
  };

  // Space Bank: vault counter over the board with an interest bar; flashes when interest pays or the bank is hit.
  Battle.prototype.drawBank = function (p, i, fx, fy, t) {
    var human = this.ctrl[i] instanceof Human;
    var pay = p.fxEvents.some(function (e) { return e.kind === 'interest'; });
    var hit = p.fxEvents.some(function (e) { return e.kind === 'bankHit'; });
    var full = p.bank >= G.BANK_CAP;
    var col = hit ? PAL.red : pay ? PAL.white : p.bank ? PAL.yellow : '#6c6880';
    T('VAULT ' + p.bank + (full ? ' MAX' : '') + (pay ? ' +1' : ''), fx + 4, fy - 7, col, { font: 'small' });
    // interest bar: fills toward the next row
    R(fx + 50, fy - 6, 28, 3, '#1a1726');
    if (p.bank && !full) R(fx + 50, fy - 6, Math.round(28 * p.interestT / G.INTEREST_MS), 3, PAL.amber);
    if (full) R(fx + 50, fy - 6, 28, 3, Math.floor(t / 200) % 2 ? PAL.yellow : PAL.amber);
    if (human && p.bank) T(this.btnName(p, 'bank') + ': WITHDRAW', fx + 40, fy + FH + 1, Math.floor(t / 300) % 2 ? PAL.yellow : PAL.amber, { align: 'center', font: 'small' });
  };

  // Space Casino: spins counter over the board; a three-reel slot over the field while spinning.
  function leverIcon(id, x, y) {
    if (id === 'jackpot') T('7', x + 5, y + 2, PAL.red, { align: 'center' });
    else if (id === 'cherries') {
      R(x + 4, y + 1, 1, 4, PAL.green); R(x + 5, y + 1, 3, 1, PAL.green); R(x + 7, y + 1, 1, 3, PAL.green);
      R(x + 2, y + 5, 4, 4, PAL.red); R(x + 6, y + 4, 4, 4, PAL.red); G.px(x + 3, y + 6, '#fff'); G.px(x + 7, y + 5, '#fff');
    } else { R(x + 2, y + 2, 7, 6, '#c8c4d8'); R(x + 3, y + 4, 2, 2, '#000'); R(x + 6, y + 4, 2, 2, '#000'); R(x + 3, y + 8, 5, 2, '#c8c4d8'); }
  }
  // Hologram brick: see-through cyan with scanlines and flicker. Cells over empty space (what a
  // freeze would fill) are bright; cells phasing through bricks are just a dotted outline.
  Battle.prototype.drawHoloPiece = function (p, fx, fy, t) {
    var ctx = this._ctx, pc = p.piece, g = p.grid;
    var flick = 0.55 + 0.25 * Math.sin(t / 60) + (Math.random() < 0.06 ? -0.3 : 0);
    var shift = Math.random() < 0.08 ? (Math.random() < 0.5 ? -1 : 1) : 0;    // rare glitch jitter
    p.cells(pc.type, pc.rot, pc.x, pc.y).forEach(function (c) {
      if (c[1] < G.HIDDEN) return;
      var x = fx + c[0] * C + shift, y = fy + (c[1] - G.HIDDEN) * C, solid = g[c[1]][c[0]];
      if (!solid) {
        ctx.globalAlpha = Math.max(0.2, flick * 0.7);
        R(x, y, C, C, '#2fe8ff');
        ctx.globalAlpha = Math.max(0.3, flick);
        for (var yy = 0; yy < C; yy += 2) R(x, y + yy, C, 1, '#c8fbff');      // scanlines
        R(x, y, C, 1, '#ffffff'); R(x, y, 1, C, '#ffffff');
      } else {
        ctx.globalAlpha = Math.max(0.35, flick);
        for (var k = 0; k < C; k += 2) { G.px(x + k, y, '#7ff6ff'); G.px(x + k, y + C - 1, '#7ff6ff'); G.px(x, y + k, '#7ff6ff'); G.px(x + C - 1, y + k, '#7ff6ff'); }
      }
    });
    ctx.globalAlpha = 1;
  };
  Battle.prototype.drawHolo = function (p, i, fx, fy, t) {
    var human = this.ctrl[i] instanceof Human, n = p.holoReady(), pc = p.piece;
    var txt = pc && pc.holo ? 'HOLOGRAM - FILLS ' + p.holoFills() : p.lines < 10 ? 'HOLOGRAM AT 10 LINES' : n > 0 ? 'HOLOGRAM NEXT' : 'HOLOGRAM AT ' + (Math.floor(p.lines / 10) + 1) * 10;
    if (p.holoUsed >= 3 && !(pc && pc.holo)) txt = 'NO MORE HOLOGRAMS';
    T(txt, fx + 40, fy - 7, (pc && pc.holo) || n > 0 ? '#7ff6ff' : '#6c6880', { align: 'center', font: 'small' });
    if (human && pc && pc.holo && p.alive) T(this.btnName(p, 'holo') + ': FREEZE', fx + 40, fy + FH + 1, Math.floor(t / 300) % 2 ? '#7ff6ff' : PAL.white, { align: 'center', font: 'small' });
    // flash on arrival and when it's set
    p.fxEvents.forEach(function (f) {
      if (f.kind === 'holo' || f.kind === 'holoSet') {
        var a = f.t / (f.kind === 'holo' ? 600 : 400);
        this._ctx.globalAlpha = a * 0.25; R(fx, fy, FW, FH, '#7ff6ff'); this._ctx.globalAlpha = 1;
      }
    }, this);
  };

  Battle.prototype.drawLever = function (p, i, fx, fy, t) {
    var human = this.ctrl[i] instanceof Human, n = p.spinsLeft();
    var txt = p.lines < 10 ? 'LEVER AT 10 LINES' : 'SPINS ' + n;
    T(txt, fx + 40, fy - 7, n > 0 ? PAL.pink : '#6c6880', { align: 'center', font: 'small' });
    if (human && n > 0 && !p.spin) T(this.btnName(p, 'casino') + ': PULL LEVER', fx + 40, fy + FH + 1, Math.floor(t / 300) % 2 ? PAL.yellow : PAL.amber, { align: 'center', font: 'small' });
    var done = p.fxEvents.filter(function (e) { return e.kind === 'lever'; })[0];
    if (!p.spin && !done) return;
    var bx = fx + 18, by = fy + 24;
    R(bx - 3, by - 3, 50, 20, '#000'); R(bx - 3, by - 3, 50, 1, PAL.pink); R(bx - 3, by + 16, 50, 1, PAL.pink);
    var ids = ['jackpot', 'cherries', 'bust'];
    for (var k = 0; k < 3; k++) {
      var x = bx + k * 15;
      G.inset(x, by, 13, 13, '#fff8ec');
      var stopAt = G.SPIN_MS - 300 * (k + 1);   // reels stop left to right
      var id = done ? done.result : (p.spin.t < stopAt ? p.spin.result : ids[(Math.floor(t / 70) + k) % 3]);
      leverIcon(id, x + 1, by + 1);
    }
    if (done) {
      var lv = G.LEVER.filter(function (l) { return l.id === done.result; })[0];
      T(lv.name, fx + 40, by + 21, done.result === 'bust' ? PAL.red : PAL.yellow, { align: 'center', shadow: '#000' });
    }
  };

  // Launch Countdown display: big count in the centre console, frame around the initiator's board.
  Battle.prototype.drawLaunch = function (now) {
    var L = this.launch;
    if (L) {
      var i = this.idx(L.by), n = Math.ceil(L.t / 1000), fx = FX[i], blink = Math.floor(now / 250) % 2;
      var col = n <= 3 ? PAL.red : PAL.amber;
      if (blink) { R(fx - 8, FY - 8, FW + 16, 2, col); R(fx - 8, FY + FH + 6, FW + 16, 2, col); R(fx - 8, FY - 8, 2, FH + 16, col); R(fx + FW + 6, FY - 8, 2, FH + 16, col); }
      R(132, 134, 56, 36, '#000'); R(132, 134, 56, 1, col); R(132, 169, 56, 1, col);
      T('LAUNCH IN', 160, 137, col, { align: 'center', font: 'small' });
      G.chrome(String(n), 160, 146, 2, 'center');
    } else if (this.brokenMsg) {
      T('COUNT', 160, 140, PAL.red, { align: 'center', font: 'small' });
      T('BROKEN', 160, 147, PAL.red, { align: 'center', font: 'small' });
    } else {
      // Perk hint for human players
      var self = this;
      [this.a, this.b].forEach(function (p, k) {
        if (!(self.ctrl[k] instanceof Human) || !self.hasLaunch(p)) return;
        var used = self.launchUsed[k], ready = self.canLaunch(p);
        var txt = used ? 'COUNT SPENT' : ready ? self.btnName(p, 'launch') + ': LAUNCH!' : self.btnName(p, 'launch') + ' WHEN AHEAD';
        var c = used ? '#4a4660' : ready ? (Math.floor(now / 300) % 2 ? PAL.yellow : PAL.amber) : '#6c6880';
        T(txt, FX[k] + 40, FY - 7, c, { align: 'center', font: 'small' });
      });
    }
  };

  var STARS = [];
  for (var si = 0; si < 70; si++) STARS.push([Math.floor(Math.random() * 320), Math.floor(Math.random() * 150), Math.random() < 0.2]);
  G.starfield = function (t) {
    STARS.forEach(function (s) { G.px(s[0], s[1], s[2] && Math.floor(t / 400 + s[0]) % 3 === 0 ? '#fff' : '#5a5878'); });
  };

  Battle.prototype.whyText = function (win) {
    if (this.endWhy === 'launch') return win.name + ' WON THE LAUNCH COUNTDOWN';
    if (this.endWhy === 'time') return 'TIME UP - ' + win.name + ' HAD MORE LINES';
    return win.name + ' CLEARED ' + this.winLines + ' LINES FIRST';
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
    var launchRule = this.rule === 'launch';
    var ms = launchRule ? Math.max(0, this.limit - this.time) : this.time;
    var secs = launchRule ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
    var low = launchRule && secs <= 30;
    G.inset(141, 100, 38, 11);
    G.led(Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2), 160, 102, low ? PAL.red : PAL.green, 'center', PAL.greenDim);
    if (launchRule) {
      T(this.sudden ? 'SUDDEN' : 'GARBAGE', 160, 118, this.sudden ? PAL.red : PAL.grey, { align: 'center', font: 'small' });
      T(this.sudden ? 'DEATH' : 'OFF', 160, 125, this.sudden ? PAL.red : PAL.grey, { align: 'center', font: 'small' });
      this.drawLaunch(now);
    } else if (this.hasLaunch(this.a) || this.hasLaunch(this.b)) {
      T('FIRST', 160, 118, PAL.grey, { align: 'center', font: 'small' });
      T('TO ' + this.winLines, 160, 125, PAL.grey, { align: 'center', font: 'small' });
      this.drawLaunch(now);
    } else if (this.rule === 'casino') {
      T(this.bet ? 'CARD BET' : 'LEVER', 160, 118, PAL.pink, { align: 'center', font: 'small' });
      T(this.bet ? 'WIN BOTH' : '1 PER 10L', 160, 125, PAL.pink, { align: 'center', font: 'small' });
    } else if (this.rule === 'bank') {
      T('BANK +1', 160, 118, PAL.yellow, { align: 'center', font: 'small' });
      T('EVERY ' + (G.INTEREST_MS / 1000) + 'S', 160, 125, PAL.yellow, { align: 'center', font: 'small' });
    } else if (this.rule === 'fold') {
      T('FOLD EVERY', 160, 118, PAL.green, { align: 'center', font: 'small' });
      T(G.FOLD_EVERY + ' LINES', 160, 125, PAL.green, { align: 'center', font: 'small' });
    } else {
      T('FIRST', 160, 118, PAL.grey, { align: 'center', font: 'small' });
      T('TO ' + this.winLines, 160, 125, PAL.grey, { align: 'center', font: 'small' });
    }

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
        G.chrome(this.endWhy === 'launch' ? 'LIFTOFF!' : this.endWhy === 'time' ? 'TIME UP!' : 'OUTRACED!', 160, 94, 2, 'center', red);
        T(this.whyText(win), 160, 113, PAL.red, { align: 'center', font: 'small' });
      } else {
        G.chrome(win.name.length > 12 ? 'WINNER!' : win.name + ' WINS', 160, 94, 2, 'center');
        T(toppedOut ? lose.name + ' GOT BRICKED UP!' : this.whyText(win), 160, 113, toppedOut ? PAL.red : PAL.green, { align: 'center', font: 'small' });
      }
      if (this.endT > 800 && Math.floor(now / 400) % 2) T('PRESS A', 160, 126, PAL.white, { align: 'center', font: 'small' });
    }
  };

  G.Battle = Battle;
})(globalThis.G = globalThis.G || {});
