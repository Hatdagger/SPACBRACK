// A versus match: two Players, human/CPU controllers, drawing.
(function (G) {
  'use strict';

  var DAS = 160, ARR = 40;
  var CELL = 26;

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

  // ---------- drawing ----------
  function drawBlock(ctx, x, y, s, color, alpha) {
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    G.roundRect(ctx, x + 1, y + 1, s - 2, s - 2, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    G.roundRect(ctx, x + 3, y + 3, s - 6, (s - 6) * 0.38, 3); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(x + s - 7, y + s - 7, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  G.drawBlock = drawBlock;

  function drawMini(ctx, type, cx, cy, s) {
    if (!type) return;
    var cells = G.SHAPES[type][0];
    var minX = 9, maxX = -1, minY = 9, maxY = -1;
    cells.forEach(function (c) { minX = Math.min(minX, c[0]); maxX = Math.max(maxX, c[0]); minY = Math.min(minY, c[1]); maxY = Math.max(maxY, c[1]); });
    var w = (maxX - minX + 1) * s, h = (maxY - minY + 1) * s;
    cells.forEach(function (c) {
      drawBlock(ctx, cx - w / 2 + (c[0] - minX) * s, cy - h / 2 + (c[1] - minY) * s, s, G.BLOCK_COLORS[type]);
    });
  }

  Battle.prototype.drawBoard = function (ctx, p, ox, oy, ctrl, label) {
    var W = G.COLS * CELL, H = (G.ROWS - G.HIDDEN) * CELL;
    var accent = p.card.color;

    // Frame: chunky console panel
    ctx.fillStyle = '#1b2436';
    G.roundRect(ctx, ox - 14, oy - 14, W + 28, H + 28, 14); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    G.roundRect(ctx, ox - 14, oy - 14, W + 28, H + 28, 14); ctx.stroke();
    ctx.fillStyle = '#0b1020'; ctx.fillRect(ox, oy, W, H);
    ctx.strokeStyle = 'rgba(120,160,220,0.07)'; ctx.lineWidth = 1;
    for (var gx = 1; gx < G.COLS; gx++) { ctx.beginPath(); ctx.moveTo(ox + gx * CELL, oy); ctx.lineTo(ox + gx * CELL, oy + H); ctx.stroke(); }
    for (var gy = 1; gy < G.ROWS - G.HIDDEN; gy++) { ctx.beginPath(); ctx.moveTo(ox, oy + gy * CELL); ctx.lineTo(ox + W, oy + gy * CELL); ctx.stroke(); }

    for (var y = G.HIDDEN; y < G.ROWS; y++) for (var x = 0; x < G.COLS; x++) {
      var c = p.grid[y][x];
      if (c) drawBlock(ctx, ox + x * CELL, oy + (y - G.HIDDEN) * CELL, CELL, c === 'G' ? G.shade(accent, -0.45) : G.BLOCK_COLORS[c]);
    }

    if (p.alive && !p.won) {
      var pc = p.piece, col = G.BLOCK_COLORS[pc.type];
      if (p.showGhost()) {
        var gyy = p.ghostY();
        p.cells(pc.type, pc.rot, pc.x, gyy).forEach(function (c) {
          if (c[1] >= G.HIDDEN) {
            ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.55;
            G.roundRect(ctx, ox + c[0] * CELL + 3, oy + (c[1] - G.HIDDEN) * CELL + 3, CELL - 6, CELL - 6, 4); ctx.stroke();
            ctx.globalAlpha = 1;
          }
        });
      }
      p.cells(pc.type, pc.rot, pc.x, pc.y).forEach(function (c) {
        if (c[1] >= G.HIDDEN) drawBlock(ctx, ox + c[0] * CELL, oy + (c[1] - G.HIDDEN) * CELL, CELL, col);
      });
    }

    if (p.effects.dark) { ctx.fillStyle = 'rgba(5,5,15,0.82)'; ctx.fillRect(ox, oy, W, H * 0.7); }
    if (p.clearAnim) { ctx.fillStyle = 'rgba(255,255,230,' + (p.clearAnim / 180 * 0.25) + ')'; ctx.fillRect(ox, oy, W, H); }
    if (p.kickFlash) { ctx.fillStyle = '#e8763a'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('THRUST!', ox + W / 2, oy + 18); }

    // Incoming garbage gauge
    var pend = p.pendingRows();
    ctx.fillStyle = '#2a1414'; ctx.fillRect(ox - 10, oy, 6, H);
    if (pend) { ctx.fillStyle = '#ff5544'; var gh = Math.min(H, pend * CELL); ctx.fillRect(ox - 10, oy + H - gh, 6, gh); }

    // Side panel: hold + next
    var side = label === 'left' ? ox - 120 : ox + W + 22;
    ctx.textAlign = 'left'; ctx.font = 'bold 13px monospace';
    if (p.features.hold) {
      ctx.fillStyle = '#9fb3d1'; ctx.fillText('HOLD', side, oy + 10);
      ctx.fillStyle = '#141c2c'; G.roundRect(ctx, side, oy + 16, 96, 64, 8); ctx.fill();
      ctx.globalAlpha = p.holdUsed ? 0.4 : 1;
      drawMini(ctx, p.holdType, side + 48, oy + 48, 18);
      ctx.globalAlpha = 1;
    }
    var n = p.previewCount();
    if (n) {
      var ny = oy + 100;
      ctx.fillStyle = '#9fb3d1'; ctx.fillText('NEXT', side, ny);
      ctx.fillStyle = '#141c2c'; G.roundRect(ctx, side, ny + 6, 96, n * 52 + 8, 8); ctx.fill();
      for (var i = 0; i < n; i++) drawMini(ctx, p.queue[i], side + 48, ny + 36 + i * 52, i === 0 ? 18 : 15);
    }
    if (p.features.bag) {
      // Lucky Seven reel: shapes still left in the current bag light up.
      var ry = oy + H - 40;
      ctx.fillStyle = '#9fb3d1'; ctx.fillText('LUCKY 7', side, ry - 6);
      G.PIECE_TYPES.forEach(function (t, k) {
        var lit = p.bagPool.indexOf(t) >= 0;
        ctx.fillStyle = lit ? G.BLOCK_COLORS[t] : '#20283a';
        G.roundRect(ctx, side + k * 14, ry, 12, 18, 3); ctx.fill();
      });
    }

    // Bottom HUD: name, card, lines, meter
    var by = oy + H + 24;
    ctx.textAlign = 'left'; ctx.fillStyle = '#f4ecd8'; ctx.font = 'bold 16px monospace';
    ctx.fillText(p.name, ox, by);
    ctx.textAlign = 'right'; ctx.fillStyle = '#f2d16b';
    ctx.fillText(Math.min(p.lines, G.WIN_LINES) + '/' + G.WIN_LINES, ox + W, by);
    ctx.textAlign = 'left'; ctx.font = '13px monospace'; ctx.fillStyle = accent;
    ctx.fillText(p.card.name + ' R' + p.rank, ox, by + 18);
    // meter
    var mx = ox, my = by + 26, mw = W;
    ctx.fillStyle = '#2a3550'; G.roundRect(ctx, mx, my, mw, 10, 5); ctx.fill();
    ctx.fillStyle = accent; G.roundRect(ctx, mx, my, mw * p.meter / p.meterMax, 10, 5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (var m = 1; m < p.meterMax; m++) ctx.fillRect(mx + mw * m / p.meterMax, my, 1, 10);

    // Floating flash messages
    ctx.textAlign = 'center'; ctx.font = 'bold 22px monospace';
    p.flash.forEach(function (f, k) {
      ctx.globalAlpha = Math.min(1, f.t / 400);
      ctx.fillStyle = '#fff3c4'; ctx.fillText(f.text, ox + W / 2, oy + H / 2 - 60 - k * 26 - (1200 - f.t) / 30);
      ctx.globalAlpha = 1;
    });

    if (ctrl && ctrl.cardMode) this.drawCardOverlay(ctx, p, ctrl, ox + W / 2, oy + H / 2);
    if (!p.alive) { this.banner(ctx, ox + W / 2, oy + H / 2, 'BRICKED UP!', '#d9534f'); }
  };

  Battle.prototype.drawCardOverlay = function (ctx, p, ctrl, cx, cy) {
    ctx.fillStyle = 'rgba(8,12,24,0.8)';
    ctx.fillRect(cx - 130, cy - 130, 260, 260);
    ctx.textAlign = 'center';
    if (!Object.keys(p.card.actives).length) {
      ctx.font = 'bold 14px monospace'; ctx.fillStyle = '#9fb3d1';
      ctx.fillText('No abilities', cx, cy - 6); ctx.fillText('on ' + p.card.name, cx, cy + 14);
      return;
    }
    var pos = { up: [0, -80], down: [0, 80], left: [-86, 0], right: [86, 0] };
    ctx.font = 'bold 10px monospace'; ctx.fillStyle = p.card.color;
    ctx.fillText(p.card.passive.name, cx, cy - 2);
    ctx.font = '9px monospace'; ctx.fillStyle = '#9fb3d1'; ctx.fillText('passive', cx, cy + 10);
    G.DIRS.forEach(function (d) {
      var a = p.card.actives[d], x = cx + pos[d][0], y = cy + pos[d][1];
      var unlocked = p.unlocked(d), afford = p.canFire(d);
      var sel = ctrl.cardDir === d;
      ctx.fillStyle = sel ? p.card.color : '#1b2436';
      G.roundRect(ctx, x - 42, y - 22, 84, 44, 8); ctx.fill();
      ctx.fillStyle = sel ? '#0b1020' : (afford ? '#f4ecd8' : '#5d6880');
      ctx.font = 'bold 11px monospace';
      ctx.fillText(unlocked ? a.name : '?', x, y - 2);
      ctx.font = '10px monospace';
      ctx.fillText(unlocked ? 'cost ' + a.cost : 'Rank ' + G.DIR_RANK[d], x, y + 13);
    });
  };

  Battle.prototype.banner = function (ctx, x, y, text, color) {
    ctx.fillStyle = 'rgba(8,12,24,0.85)'; ctx.fillRect(x - 140, y - 30, 280, 60);
    ctx.fillStyle = color; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center';
    ctx.fillText(text, x, y + 10);
  };

  Battle.prototype.draw = function (ctx) {
    G.drawBackdrop(ctx, this.cfg.color || '#4fd1c5');
    var W = G.COLS * CELL;
    var lx = 230, rx = 1280 - 230 - W, oy = 70;
    this.drawBoard(ctx, this.a, lx, oy, this.ctrl[0] instanceof Human ? this.ctrl[0] : null, 'left');
    this.drawBoard(ctx, this.b, rx, oy, this.ctrl[1] instanceof Human ? this.ctrl[1] : null, 'right');

    ctx.textAlign = 'center'; ctx.fillStyle = '#f4ecd8'; ctx.font = 'bold 18px monospace';
    ctx.fillText(this.cfg.title || 'VERSUS', 640, 36);
    ctx.font = '12px monospace'; ctx.fillStyle = '#9fb3d1';
    if (this.cfg.subtitle) ctx.fillText(this.cfg.subtitle, 640, 56);
    ctx.font = 'bold 15px monospace'; ctx.fillStyle = '#f2d16b';
    var secs = Math.floor(this.time / 1000);
    ctx.fillText(Math.floor(secs / 60) + ':' + ('0' + secs % 60).slice(-2), 640, 360);
    ctx.font = 'bold 40px monospace'; ctx.fillStyle = '#e8763a'; ctx.fillText('VS', 640, 320);

    if (this.countdown > 0) {
      var n = Math.ceil(this.countdown / 800);
      ctx.fillStyle = 'rgba(8,12,24,0.6)'; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#f2d16b'; ctx.font = 'bold 96px monospace';
      ctx.fillText(n > 0 ? String(n) : 'GO', 640, 400);
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(8,12,24,0.8)'; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#f4ecd8'; ctx.font = 'bold 48px monospace'; ctx.fillText('PAUSED', 640, 340);
      ctx.font = '16px monospace'; ctx.fillText('Start / Esc: resume    B / Backspace: quit match', 640, 380);
    }
    if (this.over) {
      var win = this.winner === 'a' ? this.a : this.b, lose = this.winner === 'a' ? this.b : this.a;
      var youLost = lose.name === 'YOU' || (lose === this.a && this.ctrl[1] instanceof G.CPU);
      ctx.fillStyle = 'rgba(8,12,24,0.7)'; ctx.fillRect(0, 290, 1280, 120);
      ctx.font = 'bold 44px monospace';
      if (youLost) { ctx.fillStyle = '#d9534f'; ctx.fillText('YOU GOT BRICKED UP!', 640, 350); }
      else {
        ctx.fillStyle = '#f2d16b'; ctx.fillText(win.name + ' WINS', 640, 342);
        ctx.font = 'bold 18px monospace'; ctx.fillStyle = '#d9534f';
        ctx.fillText(lose.name + ' got bricked up!', 640, 366);
      }
      if (this.endT > 800) { ctx.font = '16px monospace'; ctx.fillStyle = '#f4ecd8'; ctx.fillText('Press A / Enter', 640, 395); }
    }
  };

  G.Battle = Battle;
})(globalThis.G = globalThis.G || {});
