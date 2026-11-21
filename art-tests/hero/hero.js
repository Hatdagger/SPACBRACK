// High-effort hero render: back view, waist up, satin tour jacket.
// Shapes -> per-part height fields (+ folds) -> lighting -> quantised to ONE 15-colour palette.
'use strict';
(function () {
  const W = 168, H = 208;

  // ---- the single Neo Geo palette (15 colours + transparent) ----
  const PAL = {
    out: '#0a0a14',
    j0: '#0b1024', j1: '#16244a', j2: '#22407a', j3: '#3a6ab0', j4: '#8ec8ff',   // satin jacket
    r0: '#c0203a', r1: '#ff6a3a',                                              // rib knit / patch red
    g0: '#ffcf4a', c0: '#f4e6c0',                                              // patch gold, cream
    h1: '#2a2440', h2: '#4a4a7a',                                              // hair (darkest = out)
    rim: '#8ef0ff',                                                            // sunset rim light
    s0: '#c0704a', s1: '#f0a878'                                               // skin
  };
  const RAMP = { jacket: ['j0', 'j1', 'j2', 'j3', 'j4'], hair: ['out', 'h1', 'h2'], skin: ['s0', 's1'] };

  function mask(draw) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; draw(x);
    const d = x.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }
  const poly = pts => x => { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => x.lineTo(p[0], p[1])); x.closePath(); x.fill(); };
  const ell = (cx, cy, rx, ry, rot) => x => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot || 0, 0, Math.PI * 2); x.fill(); };
  const both = (...fs) => x => fs.forEach(f => f(x));
  const curve = (pts) => x => { // smooth closed shape through points
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; x.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
    x.closePath(); x.fill();
  };

  // ---- parts (back view; he looks slightly to his right, toward the scene) ----
  const parts = {
    armL: mask(curve([[2, 208], [0, 150], [6, 118], [22, 102], [40, 108], [44, 150], [40, 208]])),
    armR: mask(curve([[128, 208], [124, 150], [128, 108], [146, 102], [162, 118], [168, 150], [166, 208]])),
    body: mask(curve([[22, 208], [18, 150], [20, 116], [34, 98], [58, 90], [84, 88], [110, 90], [134, 98], [148, 116], [150, 150], [146, 208]])),
    collar: mask(curve([[44, 100], [48, 86], [64, 80], [84, 78], [104, 80], [120, 86], [124, 100], [104, 96], [84, 95], [64, 96]])),
    waist: mask(poly([[22, 192], [146, 192], [146, 208], [22, 208]])),
    cuffL: mask(poly([[0, 198], [40, 198], [40, 208], [0, 208]])),
    cuffR: mask(poly([[128, 198], [168, 198], [168, 208], [128, 208]])),
    neck: mask(poly([[70, 62], [100, 62], [102, 84], [68, 84]])),
    ear: mask(ell(119, 50, 4, 7, -0.25)),
    hair: mask(both(
      curve([[50, 56], [48, 30], [60, 12], [84, 6], [108, 10], [120, 28], [120, 54], [112, 72], [86, 78], [60, 72]]),
      curve([[70, 8], [92, 0], [118, 6], [128, 18], [112, 14]]), curve([[56, 16], [50, 22], [58, 12]]),
      curve([[48, 44], [40, 58], [46, 64], [54, 58]]), curve([[120, 40], [128, 56], [122, 66], [116, 56]]),
      curve([[58, 64], [56, 82], [62, 88], [70, 74]]), curve([[70, 72], [72, 90], [80, 94], [84, 76]]),
      curve([[84, 74], [92, 92], [98, 88], [98, 72]]), curve([[98, 70], [108, 86], [112, 80], [110, 64]])
    ))
  };
  // folds: [x1,y1,x2,y2,width,amp]  (negative amp = crease)
  const FOLDS = {
    body: [[40, 120, 62, 176, 4, -1.4], [128, 120, 106, 176, 4, -1.4], [84, 100, 84, 120, 5, 0.8], [56, 182, 112, 184, 3, -1.0],
      [30, 140, 44, 190, 3, 0.9], [138, 140, 124, 190, 3, 0.9], [70, 104, 50, 116, 3, -0.8], [98, 104, 118, 116, 3, -0.8]],
    armL: [[10, 140, 30, 150, 3, -1.2], [6, 170, 34, 176, 3, -1.0], [20, 112, 14, 196, 3, 0.8]],
    armR: [[158, 140, 138, 150, 3, -1.2], [162, 170, 134, 176, 3, -1.0], [148, 112, 154, 196, 3, 0.8]],
    hair: [[64, 20, 58, 60, 2, 1], [80, 12, 76, 64, 2, 1], [96, 12, 100, 62, 2, 1], [110, 24, 112, 56, 2, 1], [70, 30, 66, 68, 1.5, -0.8], [88, 24, 90, 70, 1.5, -0.8], [104, 30, 106, 62, 1.5, -0.8]]
  };

  function blur(m, r, passes) {
    let a = Float32Array.from(m), b = new Float32Array(W * H);
    for (let p = 0; p < passes; p++) {
      for (let y = 0; y < H; y++) { let s = 0; for (let x = -r; x <= r; x++) s += a[y * W + Math.min(W - 1, Math.max(0, x))];
        for (let x = 0; x < W; x++) { b[y * W + x] = s / (2 * r + 1); s += a[y * W + Math.min(W - 1, x + r + 1)] - a[y * W + Math.max(0, x - r)]; } }
      for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += b[Math.min(H - 1, Math.max(0, y)) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s / (2 * r + 1); s += b[Math.min(H - 1, y + r + 1) * W + x] - b[Math.max(0, y - r) * W + x]; } }
    }
    return a;
  }
  function segDist(px, py, f) {
    const [x1, y1, x2, y2] = f, dx = x2 - x1, dy = y2 - y1, t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }
  function heightField(name, r) {
    const h = blur(parts[name], r, 3), folds = FOLDS[name] || [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!parts[name][i]) continue;
      folds.forEach(f => { const d = segDist(x, y, f); h[i] += f[5] * 0.2 * Math.exp(-(d * d) / (f[4] * f[4])); });
    }
    return h;
  }

  // draw order (later wins)
  const ORDER = [['armL', 'jacket', 7], ['armR', 'jacket', 7], ['body', 'jacket', 9], ['neck', 'skin', 4], ['collar', 'rib', 3], ['hair', 'hair', 4], ['ear', 'skin', 2], ['waist', 'rib', 3], ['cuffL', 'rib', 3], ['cuffR', 'rib', 3]];
  const L = (() => { const v = [-0.55, -0.75, 0.55], n = Math.hypot(...v); return v.map(a => a / n); })();
  const BAYER = [[0, 2], [3, 1]];

  function render() {
    const out = new Array(W * H).fill(null), owner = new Array(W * H).fill(-1);
    const union = new Uint8Array(W * H);
    ORDER.forEach(([name, mat, r], oi) => {
      const m = parts[name], h = heightField(name, r);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!m[i]) continue;
        union[i] = 1; owner[i] = oi;
        const gx = (h[i + 1] - h[i - 1]) * 4, gy = (h[i + W] - h[i - W]) * 4;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        let v = 0.18 + 0.95 * Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
        v += (BAYER[y & 1][x & 1] / 4 - 0.375) * (mat === 'hair' ? 0.04 : 0.07);       // light ordered dither on ramp edges
        const hv = [L[0], L[1] - 0.2, L[2] + 1], hn = Math.hypot(...hv);
        const spec = Math.pow(Math.max(0, (nx * hv[0] + ny * hv[1] + nz * hv[2]) / hn), 40);
        let col;
        if (mat === 'jacket') { const ramp = RAMP.jacket; let k = Math.max(0, Math.min(3, Math.floor(v * 3.4))); if (spec > 0.55) k = 4; col = ramp[k]; }
        else if (mat === 'hair') { const k = Math.max(0, Math.min(2, Math.floor(v * 2.7))); col = RAMP.hair[k];
          if (y > 20 && y < 27 && v > 0.5) col = 'h2'; }               // anime hair shine band
        else if (mat === 'skin') col = v > 0.62 ? 's1' : 's0';
        else if (mat === 'rib') { const band = (y >> 1) % 3; col = band === 1 ? 'g0' : (v > 0.6 ? 'r1' : 'r0'); if ((x & 1) && (y & 1) && v < 0.45) col = 'j0'; }
        out[i] = col;
      }
    });
    // back patch: embroidered rocket in a ring (sukajan style)
    const pcx = 84, pcy = 146;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (ORDER[owner[i]] === undefined || ORDER[owner[i]][0] !== 'body') continue;
      const dx = x - pcx, dy = (y - pcy) * 1.05, d = Math.hypot(dx, dy);
      if (d < 27) {
        let col = 'r0';
        if (d > 23) col = 'g0'; else if (d > 21.5) col = ((Math.atan2(dy, dx) * 14 | 0) % 2) ? 'c0' : 'r0';   // stitched edge
        // rocket body
        const ry = y - pcy, rx = x - pcx;
        if (Math.abs(rx) <= 4 - Math.max(0, (-ry - 8) / 3) && ry > -16 && ry < 8) col = rx > 1 ? 'j4' : 'c0';
        if (ry >= -3 && ry <= 1 && Math.abs(rx) <= 1) col = 'j2';                                            // porthole
        if (ry >= 4 && ry <= 10 && Math.abs(rx) >= 4 && Math.abs(rx) <= 8 && Math.abs(rx) - 4 <= ry - 4) col = 'r1'; // fins
        if (ry > 8 && ry < 17 && Math.abs(rx) <= (17 - ry) / 3) col = (ry + x) % 2 ? 'g0' : 'r1';            // flame
        // orbit swoosh
        const e = Math.abs(Math.hypot(rx / 1.9, (ry + 2)) - 9);
        if (e < 0.7 && !(Math.abs(rx) <= 4 && ry > -16 && ry < 8)) col = 'g0';
        // shade the patch with the jacket's folds: darker on the shadowed half
        if (d < 21.5 && dx > 10 && dy > 4 && (x + y) % 2) col = col === 'r0' ? 'j1' : col;
        out[i] = col;
      }
      // racing stripes across the shoulder yoke
      const yoke = 112 + Math.pow((x - 84) / 60, 2) * -8;
      if (y > yoke && y < yoke + 3 && out[i] && out[i][0] === 'j') out[i] = 'r0';
      if (y >= yoke + 3 && y < yoke + 5 && out[i] && out[i][0] === 'j') out[i] = 'g0';
    }
    // rim light from the sunset ahead (top/right outer edges), then selective outline
    const res = out.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (union[i]) {
        const ox = (union[i - 1] ? 0 : -1) + (union[i + 1] ? 0 : 1), oy = (union[i - W] ? 0 : -1) + (union[i + W] ? 0 : 1);
        if ((ox || oy) && (ox * 0.75 - oy * 0.65) > 0.3) res[i] = 'rim';
        else if ((ox || oy) && (ox * 0.75 - oy * 0.65) > -0.2 && x > 60 && (x + y) % 2) res[i] = 'rim';
        // interior seams between parts get the darkest tone of the jacket
        else if (owner[i] >= 0 && ORDER[owner[i]][1] === 'jacket' && [i - 1, i + 1].some(j => owner[j] >= 0 && owner[j] !== owner[i] && ORDER[owner[j]][1] === 'jacket')) res[i] = 'j0';
      } else if (union[i - 1] || union[i + 1] || union[i - W] || union[i + W]) res[i] = 'out';
    }
    return res;
  }

  window.HERO = { W, H, PAL, pixels: render() };
})();
