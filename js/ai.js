// CPU opponent: picks a placement with a simple board-evaluation heuristic,
// then steers the piece there with human-like delays.
(function (G) {
  'use strict';

  var COLS = G.COLS, ROWS = G.ROWS;

  // Difficulty 1..5
  var LEVELS = {
    1: { think: 700, step: 200, mistake: 0.35, abilityRate: 0.10 },
    2: { think: 500, step: 150, mistake: 0.20, abilityRate: 0.20 },
    3: { think: 350, step: 110, mistake: 0.10, abilityRate: 0.30 },
    4: { think: 220, step: 80, mistake: 0.05, abilityRate: 0.45 },
    5: { think: 140, step: 55, mistake: 0.02, abilityRate: 0.60 }
  };

  function evaluate(grid) {
    var heights = [], holes = 0, agg = 0, bump = 0;
    for (var x = 0; x < COLS; x++) {
      var h = 0, seen = false;
      for (var y = 0; y < ROWS; y++) {
        if (grid[y][x]) { if (!seen) { h = ROWS - y; seen = true; } }
        else if (seen) holes++;
      }
      heights.push(h); agg += h;
    }
    for (var i = 0; i < COLS - 1; i++) bump += Math.abs(heights[i] - heights[i + 1]);
    var maxH = Math.max.apply(null, heights);
    return { agg: agg, holes: holes, bump: bump, maxH: maxH };
  }

  function placements(player) {
    var p = player.piece, out = [];
    var rots = p.type === 'O' ? [0] : [0, 1, 2, 3];
    rots.forEach(function (rot) {
      for (var x = -3; x < COLS; x++) {
        if (player.collides(p.type, rot, x, p.y)) continue;
        var y = p.y;
        while (!player.collides(p.type, rot, x, y + 1)) y++;
        var grid = player.grid.map(function (r) { return r.slice(); });
        var above = true;
        player.cells(p.type, rot, x, y).forEach(function (c) {
          if (c[1] >= 0) grid[c[1]][c[0]] = p.type;
          if (c[1] >= G.HIDDEN) above = false;
        });
        if (above) continue;
        var lines = 0;
        for (var yy = ROWS - 1; yy >= 0; yy--) {
          if (grid[yy].every(function (c) { return c; })) {
            grid.splice(yy, 1); grid.unshift(new Array(COLS).fill(null)); lines++; yy++;
          }
        }
        var e = evaluate(grid);
        var danger = e.maxH > 14 ? 2 : 1;
        var score = -0.51 * e.agg + 0.76 * lines * danger - 0.36 * e.holes - 0.18 * e.bump;
        out.push({ rot: rot, x: x, score: score });
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  function CPU(player, level) {
    this.p = player;
    this.cfg = LEVELS[level] || LEVELS[2];
    this.lastPiece = -1;
    this.timer = 0;
    this.target = null;
    this.fails = 0;
    this.abilityTimer = 0;
  }

  CPU.prototype.update = function (dt) {
    var p = this.p;
    if (!p.alive || p.won) return;
    if (p.pieceId !== this.lastPiece) {
      this.lastPiece = p.pieceId;
      this.target = null;
      this.timer = -this.cfg.think;
      this.fails = 0;
      p.softDrop = false;
    }
    this.timer += dt;

    // Occasionally fire a card ability when affordable.
    this.abilityTimer += dt;
    if (this.abilityTimer > 1000) {
      this.abilityTimer = 0;
      var self = this;
      var ready = G.DIRS.filter(function (d) { return p.canFire(d); });
      if (ready.length && p.rng() < this.cfg.abilityRate) {
        p.fire(ready[Math.floor(p.rng() * ready.length)]);
      }
    }

    if (this.timer < 0) return;
    if (!this.target) {
      var opts = placements(p);
      if (!opts.length) { p.softDrop = true; return; }
      var pick = opts[0];
      if (p.rng() < this.cfg.mistake) pick = opts[Math.min(opts.length - 1, 1 + Math.floor(p.rng() * 5))];
      this.target = pick;
    }
    if (this.timer < this.cfg.step) return;
    this.timer = 0;

    var t = this.target, pc = p.piece, ok = true;
    if (pc.rot !== t.rot && this.fails < 3) ok = p.rotate(1);
    else if (pc.x < t.x && this.fails < 6) ok = p.move(1);
    else if (pc.x > t.x && this.fails < 6) ok = p.move(-1);
    else {
      if (p.features.hardDrop) p.hardDrop();
      else p.softDrop = true;
      return;
    }
    if (!ok) this.fails++;
  };

  G.CPU = CPU;
  G.aiPlacements = placements;
})(globalThis.G = globalThis.G || {});
