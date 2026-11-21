// CPU opponent: picks a placement with a simple board-evaluation heuristic,
// then steers the piece there with human-like delays.
(function (G) {
  'use strict';

  var COLS = G.COLS, ROWS = G.ROWS;

  // Difficulty 1..8. think = pause before acting on a new brick, step = ms per move/rotate,
  // settle = pause once lined up before soft-dropping, mistake = chance of a worse spot,
  // slop = how far down the list a mistake can reach (kept small so CPUs don't bury themselves),
  // abilityRate = chance per second to fire an affordable card ability.
  var LEVELS = {
    1: { think: 660, step: 160, settle: 540, mistake: 0.30, slop: 3, abilityRate: 0.05 },
    2: { think: 560, step: 140, settle: 400, mistake: 0.25, slop: 3, abilityRate: 0.10 },
    3: { think: 430, step: 120, settle: 250, mistake: 0.20, slop: 3, abilityRate: 0.15 },
    4: { think: 390, step: 100, settle: 210, mistake: 0.15, slop: 3, abilityRate: 0.20 },
    5: { think: 320, step: 90, settle: 130, mistake: 0.10, slop: 3, abilityRate: 0.30 },
    6: { think: 260, step: 80, settle: 70, mistake: 0.07, slop: 2, abilityRate: 0.40 },
    7: { think: 200, step: 60, settle: 20, mistake: 0.04, slop: 2, abilityRate: 0.50 },
    8: { think: 130, step: 50, settle: 0, mistake: 0.02, slop: 2, abilityRate: 0.60 }
  };
  G.CPU_MAX_LEVEL = 8;
  // Measured median seconds for each level to clear 40 lines alone (no features, no garbage).
  var SOLO_40L = [0, 355, 306, 294, 270, 240, 214, 200, 185];
  // Launch Complex time limit: 1.5x the CPU's own 40-line time, rounded to 30 s.
  G.launchTimeLimit = function (level) {
    var s = SOLO_40L[Math.max(1, Math.min(8, level | 0))] * 1.5;
    return Math.round(s / 30) * 30 * 1000;
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

  function stackHeight(grid) {
    for (var y = 0; y < ROWS; y++) if (grid[y].some(function (c) { return c; })) return ROWS - y;
    return 0;
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
        var lineW = 0.76 * danger;
        // During its own Launch Countdown the CPU builds without clearing (unless it's in danger).
        if (player.avoidClears && e.maxH <= 14) lineW = -6;
        var score = -0.51 * e.agg + lineW * lines - 0.36 * e.holes - 0.18 * e.bump;
        out.push({ rot: rot, x: x, score: score });
      }
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  var HARD_DROP_RATE = 0.25;  // share of bricks a CPU with hard drop actually hard-drops

  function CPU(player, level) {
    this.p = player;
    this.level = level;
    this.cfg = LEVELS[Math.max(1, Math.min(8, level | 0))] || LEVELS[2];
    this.lastPiece = -1;
    this.timer = 0;
    this.target = null;
    this.fails = 0;
    this.abilityTimer = 0;
  }

  CPU.prototype.update = function (dt) {
    var p = this.p;
    if (!p.alive || p.won) return;
    if (p.foldLock > 0) { p.softDrop = false; return; }   // fold playing: input locked
    if (p.chronoOn) this.chrono(dt);
    if (p.foldOn) this.fold(dt);
    if (p.bankOn) this.bank(dt);
    if (p.leverOn) this.lever(dt);
    if (p.pieceId !== this.lastPiece || p.fieldVersion !== this.lastField) {
      this.lastPiece = p.pieceId; this.lastField = p.fieldVersion;
      this.target = null;
      this.timer = -this.cfg.think;
      this.fails = 0;
      this.settle = 0;
      p.softDrop = false;
      // Bosses use hard drop sparingly: only on some bricks.
      this.useHard = p.features.hardDrop && p.rng() < HARD_DROP_RATE;
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

    // Stage perk (Launch Countdown): when comfortably ahead, sometimes start the count.
    var bt = p.battle;
    if (bt && bt.canLaunch(p)) {
      this.perkTimer = (this.perkTimer || 0) + dt;
      if (this.perkTimer > 1000) {
        this.perkTimer = 0;
        // Weaker CPUs wait for a bigger lead and are slower to pull the trigger.
        var lead = p.lines - p.opponent.lines, need = this.level <= 3 ? 3 : 2;
        if (p.lines >= 8 && lead >= need && p.rng() < 0.03 * this.level) bt.tryLaunch(p);
      }
    }

    if (this.timer < 0) return;
    if (!this.target) {
      var opts = placements(p);
      if (!opts.length) { p.softDrop = true; return; }
      var pick = opts[0];
      // Mistakes pick a nearby-but-worse spot, never one that is much worse than the best.
      // ...and stop making them once the stack gets tall.
      if (stackHeight(p.grid) < 9 && p.rng() < this.cfg.mistake) {
        var alt = opts[Math.min(opts.length - 1, 1 + Math.floor(p.rng() * this.cfg.slop))];
        if (alt.score > pick.score - 3) pick = alt;
      }
      this.target = pick;
    }
    if (this.timer < this.cfg.step) return;
    this.timer = 0;

    var t = this.target, pc = p.piece, ok = true;
    if (pc.rot !== t.rot && this.fails < 3) ok = p.rotate(1);
    else if (pc.x < t.x && this.fails < 6) ok = p.move(1);
    else if (pc.x > t.x && this.fails < 6) ok = p.move(-1);
    else {
      // Lined up: slower CPUs pause a moment before dropping, like a person double-checking.
      if (this.settle < this.cfg.settle) { this.settle += this.cfg.step; return; }
      if (this.useHard) p.hardDrop();
      else p.softDrop = true;
      return;
    }
    if (!ok) this.fails++;
  };

  // Chrono Station save states: mark a clean, low field; jump back when the stack gets bad.
  CPU.prototype.chrono = function (dt) {
    var p = this.p;
    this.chronoT = (this.chronoT || 0) + dt;
    if (this.chronoT < 600) return;
    this.chronoT = 0;
    if (!p.canMark() || p.rng() > 0.25 + 0.08 * this.level) return;
    var e = evaluate(p.grid);
    if (e.holes === 0 && e.maxH >= 2 && e.maxH <= 7 && (!this.markE || e.agg > this.markE.agg || this.markE.maxH > 7)) {
      p.mark(); this.markE = e; return;
    }
    if (this.markE && p.markGrid && p.jumpsLeft() > 0 && (e.maxH >= 13 || e.holes >= this.markE.holes + 5) && this.markE.maxH < e.maxH - 3) {
      if (p.jump()) this.markE = null;
    }
  };

  // Fold Lab Early Fold: send held garbage when there's a decent pile and the next fold is far off,
  // or when the opponent's stack is already tall. Weaker CPUs wait for more and are slower to act.
  CPU.prototype.fold = function (dt) {
    var p = this.p;
    this.foldT = (this.foldT || 0) + dt;
    if (this.foldT < 1000) return;
    this.foldT = 0;
    if (p.earlyFoldBlock() !== null) return;
    var need = this.level <= 3 ? 3 : 2, far = p.foldInLines() >= 3;
    var foeTall = p.opponent && p.opponent.stackHeight() >= 12;
    if ((p.heldRows() >= need && far) || (foeTall && p.heldRows() >= 2)) {
      if (p.rng() < 0.05 * this.level + 0.1) p.earlyFold();
    }
  };

  // Space Bank Withdraw: cash out around 5 rows (stronger CPUs wait a little longer for interest),
  // right away at the cap, or early when the opponent's stack is tall.
  CPU.prototype.bank = function (dt) {
    var p = this.p;
    this.bankT = (this.bankT || 0) + dt;
    if (this.bankT < 1000) return;
    this.bankT = 0;
    if (!p.bank) return;
    var target = 5 + Math.max(0, Math.floor((this.level - 3) / 2));   // L1-4: 5, L5-6: 6, L7-8: 7
    var foeTall = p.opponent && p.opponent.stackHeight() >= 12;
    if (p.bank >= G.BANK_CAP || p.bank >= target || (foeTall && p.bank >= 2)) {
      if (p.rng() < 0.3 + 0.08 * this.level) p.withdraw();
    }
  };

  // Space Casino: pull the lever now and then when a spin is ready; more eager when the stack is tall
  // (cherries help), and stronger CPUs pull sooner.
  CPU.prototype.lever = function (dt) {
    var p = this.p;
    this.leverT = (this.leverT || 0) + dt;
    if (this.leverT < 1000) return;
    this.leverT = 0;
    if (p.spin || p.spinsLeft() <= 0) return;
    var chance = 0.06 + 0.03 * this.level + (p.stackHeight() >= 10 ? 0.2 : 0);
    if (p.rng() < chance) p.pullLever();
  };

  G.CPU = CPU;
  G.aiPlacements = placements;
})(globalThis.G = globalThis.G || {});
