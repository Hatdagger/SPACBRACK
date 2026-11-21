// One player's board: pieces, gravity, line clears, garbage, card abilities.
// No DOM access here, so it can be tested headless.
(function (G) {
  'use strict';

  var COLS = G.COLS, ROWS = G.ROWS;
  var LINE_SCORE = [0, 100, 300, 500, 800];
  var LINE_GARBAGE = [0, 0, 1, 2, 4];
  var LOCK_MS = 500, MAX_RESETS = 15;
  var SOFT_MS = 50;           // soft drop: one row every 50 ms while held
  // Card abilities: shared cooldown after any ability fires, so they can't be chained.
  var ABILITY_COOLDOWN = 8000;
  var CAST_MS = 1100;          // how long the card shows over the field when an ability fires
  G.CAST_MS = CAST_MS; G.ABILITY_COOLDOWN = ABILITY_COOLDOWN;

  function makeGrid() {
    var g = [];
    for (var y = 0; y < ROWS; y++) g.push(new Array(COLS).fill(null));
    return g;
  }

  function Player(opts) {
    this.name = opts.name || 'Player';
    this.features = Object.assign(G.noFeatures(), opts.features || {});
    this.cardId = opts.cardId || 'starter';
    this.card = G.CARDS[this.cardId];
    this.rank = opts.rank || 1;
    this.rng = opts.rng || Math.random;
    this.isCPU = !!opts.isCPU;
    this.grid = makeGrid();
    this.queue = [];
    this.bagPool = [];
    this.holdType = null;
    this.holdUsed = false;
    this.lines = 0;
    this.score = 0;
    this.meter = 0;
    this.meterMax = 10;
    this.pending = [];       // incoming garbage batches: {rows, pattern, gap}
    this.effects = {};       // effect name -> ms left
    this.alive = true;
    this.won = false;
    this.gravTimer = 0;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.softDrop = false;
    this.pieceId = 0;
    this.shiverTimer = 0;
    this.flash = [];         // {text, t} floating messages for the renderer
    this.fxEvents = [];      // short visual effects for the renderer: {kind, x, y, t, ...}
    this.cooldown = 0;       // ms until card abilities can fire again    this.clearAnim = 0;
    this.opponent = null;
    this.fillQueue();
    this.spawn();
  }

  var P = Player.prototype;

  P.unlocked = function (dir) {
    return !!this.card.actives[dir] && this.rank >= G.DIR_RANK[dir];
  };
  P.hasPassive = function (id) { return this.card.passive.id === id; };

  P.previewCount = function () {
    if (this.effects.glare) return 0;
    if (this.effects.sonar) return 5;
    var n = this.features.preview ? 3 : 0;
    if (this.hasPassive('echo')) n += 1;
    return n;
  };
  P.showGhost = function () { return this.features.ghost || this.hasPassive('focus'); };

  P.randomType = function () {
    if (this.features.bag) {
      if (!this.bagPool.length) {
        this.bagPool = G.PIECE_TYPES.slice();
        for (var i = this.bagPool.length - 1; i > 0; i--) {
          var j = Math.floor(this.rng() * (i + 1));
          var t = this.bagPool[i]; this.bagPool[i] = this.bagPool[j]; this.bagPool[j] = t;
        }
        this.bagRefilled = true;
      }
      return this.bagPool.pop();
    }
    return G.PIECE_TYPES[Math.floor(this.rng() * 7)];
  };
  P.fillQueue = function () { while (this.queue.length < 6) this.queue.push(this.randomType()); };

  P.cells = function (type, rot, x, y) {
    return G.SHAPES[type][rot].map(function (c) { return [x + c[0], y + c[1]]; });
  };
  P.collides = function (type, rot, x, y, grid) {
    grid = grid || this.grid;
    var s = G.SHAPES[type][rot];
    for (var i = 0; i < 4; i++) {
      var cx = x + s[i][0], cy = y + s[i][1];
      if (cx < 0 || cx >= COLS || cy >= ROWS) return true;
      if (cy >= 0 && grid[cy][cx]) return true;
    }
    return false;
  };

  P.spawn = function (type) {
    type = type || this.queue.shift();
    this.fillQueue();
    var x = type === 'O' ? 4 : 3;
    this.piece = { type: type, rot: 0, x: x, y: 0 };
    this.pieceId++;
    this.gravTimer = 0; this.lockTimer = 0; this.lockResets = 0;
    if (this.collides(type, 0, x, 0)) {
      if (!this.collides(type, 0, x, -1)) this.piece.y = -1;
      else this.alive = false;
    }
  };

  // ---------- Chrono Station: save states ----------
  // Marking opens at 10 lines. A jump is earned at 10, 20 and 30 lines (so 10 lines gives both).
  // A jump restores the field as marked and wipes waiting garbage; the brick in hand, the held brick
  // and the line count stay. Each mark is one use: it disappears after the jump.
  P.jumpsLeft = function () { return Math.min(3, Math.floor(this.lines / 10)) - (this.jumpsUsed || 0); };
  P.canMark = function () { return !!this.chronoOn && this.alive && this.lines >= 10; };
  P.mark = function () {
    if (!this.canMark()) { if (this.chronoOn) this.say('MARK AT 10 LINES'); return false; }
    this.markGrid = this.grid.map(function (r) { return r.slice(); });
    this.say('MARKED');
    return true;
  };
  P.jump = function () {
    if (!this.chronoOn || !this.alive) return false;
    if (!this.markGrid) { this.say(this.lines < 10 ? 'MARK AT 10 LINES' : 'NO MARK YET'); return false; }
    if (this.jumpsLeft() <= 0) { this.say('NO JUMPS LEFT'); return false; }
    // The field comes back exactly as marked, all waiting garbage is wiped, and the mark is used up.
    this.grid = this.markGrid;
    this.markGrid = null;
    this.pending = [];
    this.jumpsUsed = (this.jumpsUsed || 0) + 1;
    this.fieldVersion = (this.fieldVersion || 0) + 1;
    var p = this.piece;
    while (this.collides(p.type, p.rot, p.x, p.y) && p.y > -3) p.y--;
    if (this.collides(p.type, p.rot, p.x, p.y)) this.alive = false;
    this.lockTimer = 0;
    this.fxEvents.push({ kind: 'jump', t: 500 });
    this.say('JUMP!');
    return true;
  };

  P.onGround = function () {
    var p = this.piece;
    return this.collides(p.type, p.rot, p.x, p.y + 1);
  };
  P.touched = function () {
    if (this.onGround() && this.lockResets < MAX_RESETS) { this.lockTimer = 0; this.lockResets++; }
  };

  P.move = function (dx) {
    var p = this.piece;
    if (!this.alive || this.collides(p.type, p.rot, p.x + dx, p.y)) return false;
    p.x += dx; this.touched(); return true;
  };

  P.rotate = function (dir) {
    var p = this.piece;
    if (!this.alive || p.type === 'O') return false;
    var to = (p.rot + (dir > 0 ? 1 : 3)) % 4;
    var kicks = this.features.wallKick ? G.kicks(p.type, p.rot, to) : [[0, 0]];
    for (var i = 0; i < kicks.length; i++) {
      var nx = p.x + kicks[i][0], ny = p.y + kicks[i][1];
      if (!this.collides(p.type, to, nx, ny)) {
        p.x = nx; p.y = ny; p.rot = to; this.touched();
        if (i > 0) this.kickFlash = 200;
        return true;
      }
    }
    return false;
  };

  P.ghostY = function () {
    var p = this.piece, y = p.y;
    while (!this.collides(p.type, p.rot, p.x, y + 1)) y++;
    return y;
  };

  P.hardDrop = function () {
    if (!this.alive || !this.features.hardDrop) return false;
    var y = this.ghostY();
    this.score += (y - this.piece.y) * 2;
    this.piece.y = y;
    this.lock();
    return true;
  };

  P.hold = function () {
    if (!this.alive || !this.features.hold || this.holdUsed) return false;
    var cur = this.piece.type;
    if (this.holdType) { var h = this.holdType; this.holdType = cur; this.spawn(h); }
    else { this.holdType = cur; this.spawn(); }
    this.holdUsed = true;
    return true;
  };

  P.gravityMs = function () {
    var ms = Math.max(120, 900 - this.lines * 15);
    if (this.effects.howl) ms /= 3;
    return ms;
  };

  P.update = function (dt) {
    if (!this.alive || this.won) return;
    for (var k in this.effects) { this.effects[k] -= dt; if (this.effects[k] <= 0) delete this.effects[k]; }
    if (this.kickFlash) this.kickFlash = Math.max(0, this.kickFlash - dt);
    if (this.clearAnim) this.clearAnim = Math.max(0, this.clearAnim - dt);
    this.flash = this.flash.filter(function (f) { f.t -= dt; return f.t > 0; });
    this.fxEvents = this.fxEvents.filter(function (f) { f.t -= dt; return f.t > 0; });
    if (this.cooldown) this.cooldown = Math.max(0, this.cooldown - dt);

    if (this.effects.shiver) {
      this.shiverTimer += dt;
      if (this.shiverTimer > 1000) { this.shiverTimer = 0; this.move(this.rng() < 0.5 ? -1 : 1); }
    }

    var frozen = this.effects.roost;
    var interval = this.gravityMs();
    if (this.softDrop) interval = Math.min(interval, SOFT_MS);
    // Starting a soft drop must not cash in the gravity time already built up
    // (that used to teleport the brick to the floor, like a free hard drop).
    if (this.softDrop && !this.wasSoft) this.gravTimer = Math.min(this.gravTimer, interval);
    this.wasSoft = this.softDrop;
    if (!frozen) {
      this.gravTimer += dt;
      while (this.gravTimer >= interval) {
        this.gravTimer -= interval;
        if (!this.onGround()) {
          this.piece.y++;
          if (this.softDrop) this.score += 1;
        } else break;
      }
    }
    if (this.onGround()) {
      this.lockTimer += dt;
      if (this.lockTimer >= LOCK_MS) this.lock();
    } else this.lockTimer = 0;
  };

  P.lock = function () {
    var p = this.piece, self = this;
    var above = true;
    this.cells(p.type, p.rot, p.x, p.y).forEach(function (c) {
      if (c[1] >= 0) self.grid[c[1]][c[0]] = p.type;
      if (c[1] >= G.HIDDEN) above = false;
    });
    var cleared = this.clearLines();
    if (cleared > 0) {
      this.lines += cleared;
      this.score += LINE_SCORE[cleared];
      this.meter = Math.min(this.meterMax, this.meter + cleared);
      var out = LINE_GARBAGE[cleared];
      // Outgoing garbage cancels incoming first.
      while (out > 0 && this.pending.length) {
        var b = this.pending[0], n = Math.min(out, b.rows);
        b.rows -= n; out -= n;
        if (b.rows <= 0) this.pending.shift();
      }
      if (out > 0 && this.opponent) this.opponent.receive(out, this.card.pattern);
      if (cleared === 4) this.say('QUAD!');
      if (this.lines >= G.WIN_LINES) { this.won = true; return; }
    } else {
      this.applyGarbage();
    }
    if (above && cleared === 0) { this.alive = false; return; }
    this.holdUsed = false;
    this.spawn();
  };

  P.clearLines = function () {
    var n = 0;
    for (var y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(function (c) { return c; })) {
        this.grid.splice(y, 1);
        this.grid.unshift(new Array(COLS).fill(null));
        n++; y++;
      }
    }
    if (n) this.clearAnim = 180;
    return n;
  };

  P.receive = function (rows, pattern) {
    if (this.noGarbage) return;   // Launch Complex house rule: garbage off
    if (this.effects.fur) { delete this.effects.fur; this.say('BLOCKED'); return; }
    this.pending.push({ rows: rows, pattern: pattern || 'standard', gap: Math.floor(this.rng() * COLS) });
  };
  P.pendingRows = function () {
    return this.pending.reduce(function (s, b) { return s + b.rows; }, 0);
  };

  P.garbageRow = function (pattern, gap, i) {
    var row = new Array(COLS).fill('G');
    var g;
    switch (pattern) {
      case 'claw': g = (gap + i) % COLS; break;
      case 'ribs': g = i % 2 ? (gap + 5) % COLS : gap; break;
      case 'stairs': g = Math.min(COLS - 1, (gap % 5) + i); break;
      default: g = gap;
    }
    row[g] = null;
    return row;
  };

  P.applyGarbage = function () {
    var budget = 10;
    while (this.pending.length && budget > 0) {
      var b = this.pending[0];
      var n = Math.min(b.rows, budget);
      for (var i = 0; i < n; i++) {
        var top = this.grid.shift();
        if (top.some(function (c) { return c; })) this.alive = false;
        this.grid.push(this.garbageRow(b.pattern, b.gap, b.done ? b.done + i : i));
      }
      b.done = (b.done || 0) + n;
      b.rows -= n; budget -= n;
      if (b.rows <= 0) this.pending.shift();
    }
  };

  P.say = function (text) { this.flash.push({ text: text, t: 1200 }); };

  // ---------- card abilities ----------
  P.canFire = function (dir) {
    var a = this.card.actives[dir];
    return !!a && this.unlocked(dir) && this.meter >= a.cost && !this.cooldown;
  };

  P.fire = function (dir) {
    if (!this.canFire(dir)) return false;
    var a = this.card.actives[dir], foe = this.opponent;
    this.meter -= a.cost;
    this.cooldown = ABILITY_COOLDOWN;
    this.fxEvents.push({ kind: 'cast', name: a.name, t: CAST_MS });
    switch (a.id) {
      case 'boulder': foe && foe.dropBoulder(); break;
      case 'rockslide': if (foe) { foe.dropBoulder(); foe.dropBoulder(); foe.dropBoulder(); } break;
      case 'staredown': this.cancelPending(3); break;
      case 'glare': foe && (foe.effects.glare = 8000); break;
      case 'rattle': foe && foe.move(foe.rng() < 0.5 ? -1 : 1) || (foe && foe.move(1)) || (foe && foe.move(-1)); break;
      case 'bonepatch': this.bonePatch(4); break;
      case 'shiver': foe && (foe.effects.shiver = 6000); break;
      case 'bonestorm': foe && foe.receive(4, this.card.pattern); break;
      case 'claw3': foe && foe.receive(3, 'claw'); break;
      case 'fur': this.effects.fur = 30000; break;
      case 'howl': foe && (foe.effects.howl = 6000); break;
      case 'fullmoon': this.queue[0] = 'I'; this.queue[1] = 'I'; this.queue[2] = 'I'; break;
      case 'nightfall': if (foe) { foe.receive(1, this.card.pattern); foe.effects.dark = 5000; } break;
      case 'roost': this.effects.roost = 4000; break;
      case 'sonar': this.effects.sonar = 10000; break;
      case 'swarm': if (foe) { foe.receive(3, this.card.pattern); foe.effects.dark = 8000; } break;
    }
    return true;
  };

  P.cancelPending = function (n) {
    while (n > 0 && this.pending.length) {
      var b = this.pending[0], k = Math.min(n, b.rows);
      b.rows -= k; n -= k;
      if (b.rows <= 0) this.pending.shift();
    }
  };

  P.columnHeightRow = function (x) {
    for (var y = 0; y < ROWS; y++) if (this.grid[y][x]) return y;
    return ROWS;
  };

  P.dropBoulder = function () {
    if (!this.alive) return;
    var x = Math.floor(this.rng() * (COLS - 1));
    var top = Math.min(this.columnHeightRow(x), this.columnHeightRow(x + 1));
    var y0 = top - 2;
    this.fxEvents.push({ kind: 'boulder', x: x, y: y0, t: 400 });
    for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
      var yy = y0 + dy;
      if (yy >= 0) this.grid[yy][x + dx] = 'R';
    }
    if (y0 < 0) this.alive = false;
    // If the rock landed on the falling piece's cells, nudge the piece up.
    var p = this.piece, tries = 0;
    while (this.alive && this.collides(p.type, p.rot, p.x, p.y) && tries < 4) { p.y--; tries++; }
    if (this.collides(p.type, p.rot, p.x, p.y)) this.alive = false;
  };

  P.bonePatch = function (n) {
    var filled = 0;
    for (var y = ROWS - 1; y > 0 && filled < n; y--) {
      for (var x = 0; x < COLS && filled < n; x++) {
        if (!this.grid[y][x]) {
          var covered = false;
          for (var yy = y - 1; yy >= 0; yy--) if (this.grid[yy][x]) { covered = true; break; }
          if (covered) { this.grid[y][x] = 'B'; filled++; }
        }
      }
    }
    var c = this.clearLines();
    if (c) { this.lines += c; if (this.lines >= G.WIN_LINES) this.won = true; }
  };

  G.Player = Player;
  G.makeGrid = makeGrid;
})(globalThis.G = globalThis.G || {});
