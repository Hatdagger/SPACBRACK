// Placeholder art for the over-the-shoulder explore screens, talk close-ups and the station map.
// Everything is rasterised pixel-by-pixel (no anti-aliasing) into cached canvases, sized to the
// Art Asset Guide: panorama 640x176, hero 112x160, crew 48x112, boss 64x128, close-up 320x176, map 320x224.
// Real art from the pixel artist replaces these one by one.
(function (G) {
  'use strict';

  // ---------- tiny crisp rasteriser ----------
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  function Raster(w, h) {
    this.w = w; this.h = h;
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.x = this.c.getContext('2d');
    this.img = this.x.createImageData(w, h); this.d = this.img.data;
  }
  Raster.prototype.px = function (x, y, c) {
    x |= 0; y |= 0; if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = (y * this.w + x) * 4; this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  };
  Raster.prototype.rect = function (x0, y0, x1, y1, hex) { // inclusive
    var c = rgb(hex);
    for (var y = Math.max(0, y0 | 0); y <= Math.min(this.h - 1, y1 | 0); y++) for (var x = Math.max(0, x0 | 0); x <= Math.min(this.w - 1, x1 | 0); x++) this.px(x, y, c);
  };
  Raster.prototype.poly = function (pts, hex) {
    var c = rgb(hex), minY = 1e9, maxY = -1e9, n = pts.length;
    pts.forEach(function (p) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    for (var y = Math.max(0, Math.floor(minY)); y <= Math.min(this.h - 1, Math.ceil(maxY)); y++) {
      var yc = y + 0.5, xs = [];
      for (var i = 0, j = n - 1; i < n; j = i++) {
        var a = pts[i], b = pts[j];
        if ((a[1] > yc) !== (b[1] > yc)) xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      xs.sort(function (p, q) { return p - q; });
      for (var k = 0; k + 1 < xs.length; k += 2) for (var x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) this.px(x, y, c);
    }
  };
  Raster.prototype.ell = function (x0, y0, x1, y1, hex) { // bbox, inclusive
    var c = rgb(hex), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, rx = (x1 - x0 + 1) / 2, ry = (y1 - y0 + 1) / 2;
    for (var y = Math.floor(y0); y <= y1; y++) for (var x = Math.floor(x0); x <= x1; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.px(x, y, c);
    }
  };
  Raster.prototype.line = function (x0, y0, x1, y1, hex) {
    var c = rgb(hex); x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, e = dx + dy;
    for (;;) { this.px(x0, y0, c); if (x0 === x1 && y0 === y1) break; var e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  };
  Raster.prototype.done = function () { this.x.putImageData(this.img, 0, 0); return this.c; };

  var S = function (c, a) { return G.shade(c, a); };
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pick(arr, h) { return arr[h % arr.length]; }
  var cache = {};
  function cached(key, fn) { return cache[key] || (cache[key] = fn()); }

  // ---------- exploration panoramas (640 x 176) ----------
  G.PANO_W = 640; G.PANO_H = 176; G.FLOOR_Y = 140;
  // Hotspots per scene: x = centre in panorama pixels.
  G.SCENES = {
    hall: { name: 'HALL', spots: [
      { kind: 'exit', x: 168, w: 48, h: 96, label: 'EXIT TO MAP' },
      { kind: 'npc', x: 262, idx: 0 },
      { kind: 'door', x: 360, w: 48, h: 64, to: 'boss', label: 'INNER ROOM' },
      { kind: 'npc', x: 476, idx: 1 }
    ] },
    boss: { name: 'INNER ROOM', spots: [
      { kind: 'door', x: 168, w: 48, h: 96, to: 'hall', label: 'BACK TO HALL' },
      { kind: 'npc', x: 360, idx: 2 }
    ] }
  };

  function drawProp(r, kind, x, y, c) { // a big location prop on the back wall, ~64x64
    var d = S(c, -0.55), l = S(c, 0.4), k = '#07060b';
    switch (kind) {
      case 'gantry':
        r.rect(x, y, x + 6, y + 70, d); r.rect(x + 40, y, x + 46, y + 70, d);
        for (var i = 0; i < 7; i++) { r.line(x, y + i * 10, x + 46, y + i * 10 + 10, c); r.rect(x, y + i * 10, x + 46, y + i * 10 + 1, d); }
        r.poly([[x + 14, y + 70], [x + 23, y - 10], [x + 32, y + 70]], '#d8d4e8'); r.rect(x + 20, y + 4, x + 26, y + 10, '#ff3b47'); break;
      case 'pillar':
        for (var p = 0; p < 3; p++) { var px = x + p * 22; r.rect(px, y, px + 12, y + 70, d); for (var j = 0; j < 70; j += 6) r.rect(px + 2, y + j, px + 10, y + j + 2, (j / 6 + p) % 3 ? c : l); } break;
      case 'vat':
        for (var v = 0; v < 2; v++) { var vx = x + v * 34; r.rect(vx, y + 10, vx + 26, y + 70, d); r.rect(vx + 3, y + 26, vx + 23, y + 66, c); r.rect(vx + 3, y + 26, vx + 23, y + 28, l); r.ell(vx + 8, y + 40, vx + 12, y + 44, l); r.rect(vx - 2, y + 6, vx + 28, y + 10, '#5d6580'); } break;
      case 'vault':
        r.rect(x, y, x + 64, y + 70, '#3a3f52'); r.ell(x + 8, y + 6, x + 56, y + 62, d); r.ell(x + 14, y + 12, x + 50, y + 56, c); r.ell(x + 26, y + 24, x + 38, y + 44, l);
        for (var s = 0; s < 6; s++) { var a = s * Math.PI / 3; r.line(x + 32, y + 34, x + 32 + Math.cos(a) * 16, y + 34 + Math.sin(a) * 16, d); } break;
      case 'clock':
        r.ell(x, y, x + 64, y + 64, d); r.ell(x + 4, y + 4, x + 60, y + 60, '#f2e8cc'); r.line(x + 32, y + 32, x + 32, y + 10, k); r.line(x + 32, y + 32, x + 48, y + 38, k);
        for (var t = 0; t < 12; t++) { var b = t * Math.PI / 6; r.rect(x + 31 + Math.cos(b) * 24, y + 31 + Math.sin(b) * 24, x + 33 + Math.cos(b) * 24, y + 33 + Math.sin(b) * 24, c); } break;
      case 'slots':
        for (var m = 0; m < 2; m++) { var sx = x + m * 34; r.rect(sx, y + 4, sx + 28, y + 70, c); r.rect(sx + 3, y + 16, sx + 25, y + 34, '#fff8ec');
          for (var q = 0; q < 3; q++) r.rect(sx + 5 + q * 7, y + 22, sx + 9 + q * 7, y + 28, ['#ff3b47', '#ffdc2e', '#2fe0ff'][(q + m) % 3]);
          r.rect(sx + 30, y + 14, sx + 31, y + 30, '#c0c0d0'); r.ell(sx + 28, y + 8, sx + 33, y + 14, '#ff3b47'); r.rect(sx, y + 4, sx + 28, y + 8, l); } break;
    }
  }

  G.panorama = function (loc, scene) {
    return cached('pano_' + loc.id + scene, function () {
      var W = 640, H = 176, c = loc.color, r = new Raster(W, H), boss = scene === 'boss';
      var wall0 = '#100e1a', wall1 = boss ? S(c, -0.75) : '#1e1b2c', wall2 = boss ? S(c, -0.6) : '#2c2840', wall3 = '#3c3856', wall4 = '#56527a';
      var bw = boss ? [200, 456] : [250, 410], by = boss ? [30, 140] : [50, 140];
      r.rect(0, 0, W - 1, H - 1, wall0);
      r.rect(bw[0], by[0], bw[1], by[1], wall1);                                   // back wall
      r.poly([[0, 0], [W, 0], [bw[1], by[0]], [bw[0], by[0]]], wall0);               // ceiling
      r.poly([[0, H], [W, H], [bw[1], by[1]], [bw[0], by[1]]], '#14121c');           // floor
      for (var i = 0; i < 12; i++) { var fy = by[1] + Math.round(Math.pow(i / 12, 1.6) * 36); r.line(0, fy, W - 1, fy, '#1e1b28'); }
      for (var f = -8; f <= 8; f++) r.line(320 + f * 12, by[1], 320 + f * 70, H - 1, '#1e1b28');
      r.poly([[0, 0], [bw[0], by[0]], [bw[0], by[1]], [0, H]], wall2);              // side walls
      r.poly([[W, 0], [bw[1], by[0]], [bw[1], by[1]], [W, H]], wall2);
      for (var x = 20; x < bw[0]; x += 46) { var t = x / bw[0], y1 = Math.round(by[0] * t), y2 = Math.round(H - (H - by[1]) * t); r.line(x, y1 + 6, x, y2 - 6, wall3); r.line(x + 2, y1 + 8, x + 2, y2 - 8, wall4); }
      for (x = W - 20; x > bw[1]; x -= 46) { t = (W - x) / (W - bw[1]); y1 = Math.round(by[0] * t); y2 = Math.round(H - (H - by[1]) * t); r.line(x, y1 + 6, x, y2 - 6, wall3); r.line(x - 2, y1 + 8, x - 2, y2 - 8, wall4); }
      // racing stripes in the location colour
      var band = [S(c, 0.35), c, S(c, -0.25), S(c, -0.5)];
      for (var k = 0; k < 4; k++) {
        r.poly([[0, 70 + k * 6], [bw[0], 92 + k * 3], [bw[0], 95 + k * 3], [0, 75 + k * 6]], band[k]);
        r.poly([[W, 70 + k * 6], [bw[1], 92 + k * 3], [bw[1], 95 + k * 3], [W, 75 + k * 6]], band[k]);
        r.rect(bw[0], 96 + k * 3, bw[1], 97 + k * 3, band[k]);
      }
      for (var lx = bw[0] + 10; lx < bw[1] - 10; lx += 30) r.rect(lx, by[0] + 2, lx + 12, by[0] + 4, '#fff8ec');  // ceiling lights
      // prop on the back wall (hall: right of centre door; boss: either side)
      if (!boss) drawProp(r, loc.prop, 548, 52, c);
      else { drawProp(r, loc.prop, 220, 50, c); drawProp(r, loc.prop, 380, 50, c); r.poly([[300, by[0]], [420, by[0]], [460, by[1]], [260, by[1]]], S(c, -0.45)); }
      // doors
      G.SCENES[scene].spots.forEach(function (sp) {
        if (sp.kind === 'npc') return;
        var dx = sp.x - sp.w / 2, dy = G.FLOOR_Y - sp.h + (sp.h === 64 ? 4 : 12);
        r.rect(dx - 2, dy - 2, dx + sp.w + 1, dy + sp.h + 1, S(c, -0.2));
        r.rect(dx, dy, dx + sp.w - 1, dy + sp.h - 1, '#0b0a12');
        r.rect(dx + 3, dy + 3, dx + sp.w / 2 - 2, dy + sp.h - 3, '#2a2638');
        r.rect(dx + sp.w / 2 + 1, dy + 3, dx + sp.w - 4, dy + sp.h - 3, '#24202f');
        r.rect(dx + sp.w / 2 - 1, dy + 3, dx + sp.w / 2, dy + sp.h - 3, c);
        r.rect(dx + 5, dy + 6, dx + 12, dy + 9, sp.kind === 'exit' ? '#5cff7a' : '#ff3b47');
        for (var s = 0; s < sp.w - 4; s += 8) r.rect(dx + 2 + s, dy - 8, dx + 5 + s, dy - 6, (s / 8) % 2 ? '#ffdc2e' : '#16131f');
      });
      return r.done();
    });
  };

  // ---------- hero: back view, flight jacket (112 x 160) ----------
  var J = ['#140c08', '#2c1810', '#4a2a18', '#6e4024', '#9a6034', '#c8884c'];
  var FL = ['#a89070', '#e0d0b0', '#f8f0e0'], HR = ['#181420', '#302838'], SK = ['#a05838', '#e09870'];
  G.heroBack = function (bob, look, rim) {
    return cached('hero' + bob + '_' + look + rim, function () {
      var r = new Raster(112, 160), y = bob, o = 0;
      r.poly([[8, 160], [6, y + 108], [16, y + 84], [40, y + 74], [72, y + 74], [96, y + 84], [106, y + 108], [104, 160]], J[0]);
      r.poly([[10, 160], [9, y + 108], [18, y + 86], [40, y + 77], [72, y + 77], [94, y + 86], [103, y + 108], [102, 160]], J[2]);
      r.poly([[80, y + 80], [94, y + 86], [103, y + 108], [102, 160], [90, 160], [92, y + 110]], J[3]);
      r.poly([[96, y + 92], [103, y + 108], [102, 160], [99, 160], [99, y + 108]], rim || J[5]);
      r.poly([[10, y + 110], [20, y + 90], [26, y + 100], [22, 160], [10, 160]], J[1]);
      r.line(28, y + 90, 32, 159, J[1]); r.line(84, y + 90, 80, 159, J[1]); r.line(40, y + 120, 56, y + 128, J[1]); r.line(60, y + 128, 76, y + 120, J[4]);
      for (var x = 12; x < 100; x += 3) r.line(x, 148, x, 159, (x / 3) % 2 ? J[1] : J[0]);
      r.ell(40, y + 96, 72, y + 124, J[0]); r.ell(41, y + 97, 71, y + 123, '#e8763a'); r.ell(47, y + 103, 65, y + 117, '#f8d048');
      r.rect(86, y + 90, 96, y + 100, '#e8763a');
      r.poly([[30, y + 80], [40, y + 66], [72, y + 66], [82, y + 80], [56, y + 84]], FL[0]);
      r.poly([[34, y + 78], [42, y + 68], [70, y + 68], [78, y + 78], [56, y + 80]], FL[1]);
      r.line(60, y + 69, 74, y + 76, FL[2]);
      r.rect(46, y + 54, 66, y + 68, SK[0]); r.rect(60 + look, y + 56, 64 + look, y + 66, SK[1]);
      r.ell(34 + look, y + 8, 78 + look, y + 62, HR[0]); r.ell(40 + look, y + 12, 76 + look, y + 54, HR[1]);
      r.line(70 + look, y + 18, 74 + look, y + 44, rim || '#e8763a');
      r.ell(74 + look, y + 32, 80 + look, y + 44, look > 0 ? SK[1] : SK[0]);
      if (look < 0) r.ell(30 + look, y + 32, 36 + look, y + 44, SK[0]);
      return r.done();
    });
  };

  // ---------- NPC full body (48 x 112 crew, 64 x 128 boss) ----------
  var SKINS = [['#5a3020', '#8a5030'], ['#a05838', '#e09870'], ['#c07858', '#f0b898'], ['#704028', '#b07048']];
  var HAIRS = ['#181420', '#5a3418', '#d8b048', '#c0c0c8', '#a02828', '#30d8c8'];
  G.npcLook = function (n, loc) {
    var h = hash(n.name), main = n.mirror ? '#4a2a18' : n.boss ? S(loc.color, -0.1) : pick(['#3c5878', '#5a3c78', '#3c6c50', '#784a3c', '#606070', '#2c4c8c', '#8c2c4c'], h);
    return {
      skin: n.mirror ? SKINS[1] : pick(SKINS, h >>> 3), hair: n.mirror ? '#181420' : pick(HAIRS, h >>> 6),
      main: main, trim: n.mirror ? '#e0d0b0' : n.boss ? '#ffdc2e' : pick(['#ffdc2e', '#fff8ec', '#ff8a1e', '#2fe0ff', '#ff3fa4'], h >>> 9),
      hat: (h >>> 12) % 3 === 0 && !n.mirror, glasses: (h >>> 14) % 4 === 0
    };
  };
  G.npcSprite = function (n, loc, frame) {
    return cached('npc' + n.name + frame, function () {
      var L = G.npcLook(n, loc), W = n.boss ? 64 : 48, H = n.boss ? 128 : 112, r = new Raster(W, H), cx = W >> 1;
      var b = frame ? 1 : 0, m = [S(L.main, -0.6), S(L.main, -0.3), L.main, S(L.main, 0.25), S(L.main, 0.5)];
      var hy = 4 + b, hr = n.boss ? 9 : 7;
      // legs
      r.rect(cx - 12, H * 0.55, cx - 2, H - 7, m[2]); r.rect(cx + 2, H * 0.55, cx + 12, H - 7, m[3]);
      r.rect(cx - 13, H - 6, cx - 2, H - 1, '#07060b'); r.rect(cx + 2, H - 6, cx + 13, H - 1, '#07060b');
      // torso + arms
      r.poly([[cx - 16, hy + 2 * hr + 6], [cx + 16, hy + 2 * hr + 6], [cx + 14, H * 0.58], [cx - 14, H * 0.58]], m[2]);
      r.poly([[cx + 6, hy + 2 * hr + 6], [cx + 16, hy + 2 * hr + 6], [cx + 14, H * 0.58], [cx + 8, H * 0.58]], m[3]);
      r.rect(cx - 21, hy + 2 * hr + 8, cx - 16, H * 0.5 + b, m[1]); r.rect(cx + 16, hy + 2 * hr + 8, cx + 21, H * 0.5 - b, m[4]);
      r.rect(cx - 21, H * 0.5 + b, cx - 16, H * 0.5 + b + 5, L.skin[0]); r.rect(cx + 16, H * 0.5 - b, cx + 21, H * 0.5 - b + 5, L.skin[1]);
      r.rect(cx - 14, H * 0.45, cx + 14, H * 0.45 + 3, L.trim);                     // belt / sash
      r.poly([[cx - 6, hy + 2 * hr + 6], [cx, hy + 2 * hr + 14], [cx + 6, hy + 2 * hr + 6]], L.trim); // collar
      if (n.boss) { r.poly([[cx - 18, hy + 2 * hr + 6], [cx - 26, hy + 2 * hr + 2], [cx - 14, hy + 2 * hr + 12]], L.trim); r.poly([[cx + 18, hy + 2 * hr + 6], [cx + 26, hy + 2 * hr + 2], [cx + 14, hy + 2 * hr + 12]], L.trim); }
      // head
      r.rect(cx - 3, hy + 2 * hr - 1, cx + 3, hy + 2 * hr + 6, L.skin[0]);
      r.ell(cx - hr, hy, cx + hr, hy + 2 * hr + 2, L.skin[0]); r.ell(cx - hr + 2, hy + 1, cx + hr - 1, hy + 2 * hr, L.skin[1]);
      r.ell(cx - hr - 1, hy - 2, cx + hr + 1, hy + hr - 1, L.hair);
      if (L.hat) { r.rect(cx - hr - 1, hy - 3, cx + hr + 1, hy + 2, m[1]); r.rect(cx - hr - 3, hy + 2, cx + hr + 3, hy + 3, m[0]); }
      r.rect(cx - 4, hy + hr + 1, cx - 3, hy + hr + 2, '#07060b'); r.rect(cx + 3, hy + hr + 1, cx + 4, hy + hr + 2, '#07060b');
      if (L.glasses) r.rect(cx - 6, hy + hr, cx + 6, hy + hr + 1, L.trim);
      return r.done();
    });
  };

  // ---------- talk close-up (320 x 176) ----------
  G.closeup = function (n, loc, mouth, blink) {
    var base = cached('face' + n.name, function () {
      var L = G.npcLook(n, loc), r = new Raster(320, 176), c = loc.color;
      for (var y = 0; y < 176; y++) r.rect(0, y, 319, y, S(c, -0.85 + 0.5 * Math.min(1, y / 176)));
      G.STRIPES.forEach(function (s, k) { r.rect(0, 120 + k * 6, 319, 123 + k * 6, s); });
      var m = [S(L.main, -0.5), L.main, S(L.main, 0.3)], sk = [S(L.skin[0], -0.35), L.skin[0], L.skin[1], S(L.skin[1], 0.3)];
      r.poly([[50, 176], [86, 128], [234, 128], [270, 176]], m[0]);
      r.poly([[60, 176], [92, 132], [228, 132], [262, 176]], m[1]);
      r.poly([[200, 132], [228, 132], [262, 176], [222, 176]], m[2]);
      r.poly([[140, 128], [160, 150], [180, 128]], L.trim);
      if (n.boss) { r.poly([[86, 130], [60, 120], [100, 146]], L.trim); r.poly([[234, 130], [260, 120], [220, 146]], L.trim); }
      r.rect(140, 104, 180, 134, sk[1]);
      r.ell(104, 20, 216, 136, sk[1]); r.ell(112, 24, 208, 128, sk[2]); r.ell(150, 32, 204, 108, sk[3]);
      r.ell(96, 56, 112, 84, sk[1]); r.ell(208, 56, 224, 84, sk[2]);                // ears
      // hair
      r.poly([[100, 76], [102, 22], [160, 4], [220, 20], [222, 76], [206, 40], [160, 30], [114, 44]], L.hair);
      r.poly([[150, 10], [200, 16], [214, 40], [180, 26]], S(L.hair, 0.3));
      if (L.hat) { r.rect(100, 4, 220, 24, m[1]); r.rect(90, 22, 230, 28, m[0]); r.rect(150, 8, 170, 18, L.trim); }
      if (n.mirror) { for (var g = 0; g < 176; g += 7) r.rect(0, g, 319, g, '#2fe0ff'); }
      // eyes (open) + nose
      [132, 172].forEach(function (ex) {
        r.rect(ex, 64, ex + 17, 71, '#fff8ec'); r.rect(ex + 6, 64, ex + 11, 71, '#16131f'); r.rect(ex + 7, 65, ex + 8, 66, '#fff8ec');
        r.rect(ex - 2, 57, ex + 19, 59, S(L.hair, -0.2));
        if (L.glasses) { r.rect(ex - 3, 61, ex + 20, 62, L.trim); r.rect(ex - 3, 74, ex + 20, 75, L.trim); r.rect(ex - 3, 61, ex - 2, 75, L.trim); r.rect(ex + 19, 61, ex + 20, 75, L.trim); }
      });
      r.line(160, 78, 155, 97, sk[0]); r.line(155, 97, 163, 99, sk[0]);
      return r.done();
    });
    var cx = G.ctxRef();
    cx.drawImage(base, 0, 16);
    var L = G.npcLook(n, loc), sk = S(L.skin[0], -0.35);
    // blink patch
    if (blink) [132, 172].forEach(function (ex) { G.rect(ex, 16 + 64, 18, 8, L.skin[1]); G.rect(ex, 16 + 70, 18, 2, sk); });
    // mouth patch: 0 closed, 1 half, 2 open
    if (mouth === 0) G.rect(146, 16 + 110, 32, 3, sk);
    else { var h = mouth === 1 ? 5 : 10; G.rect(148, 16 + 108, 28, h, '#3a0a14'); G.rect(150, 16 + 108, 24, 2, '#fff8ec'); }
  };

  // ---------- station cutaway map (320 x 224) ----------
  G.MAP_ROOMS = [[32, 32], [128, 32], [224, 32], [32, 96], [128, 96], [224, 96]];
  G.stationMap = function () {
    return cached('station', function () {
      var r = new Raster(320, 224), seed = 7;
      r.rect(0, 0, 319, 223, '#080818');
      for (var i = 0; i < 110; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; var x = seed % 320; seed = (seed * 1103515245 + 12345) & 0x7fffffff; r.rect(x, seed % 176, x, seed % 176, i % 4 ? '#5a5a7a' : '#fff8ec'); }
      r.ell(10, 10, 309, 165, '#24223a');
      r.rect(16, 16, 303, 159, '#3c3a56'); r.rect(18, 18, 301, 157, '#4a4866');
      r.rect(150, 2, 170, 16, '#5a5878'); r.rect(159, 0, 160, 2, '#a0a0c0');
      r.rect(0, 80, 16, 95, '#5a5878'); r.rect(303, 80, 319, 95, '#5a5878');
      r.rect(16, 80, 303, 95, '#24223a');
      for (var d = 24; d < 300; d += 12) r.rect(d, 87, d + 1, 88, '#ffdc2e');
      for (var w = 20; w < 300; w += 24) { r.rect(w, 20, w + 8, 24, '#2fe0ff'); r.rect(w, 150, w + 8, 154, '#2fe0ff'); }
      G.LOCATIONS.forEach(function (loc, k) {
        var p = G.MAP_ROOMS[k], c = loc.color;
        r.rect(p[0] - 1, p[1] - 1, p[0] + 80, p[1] + 48, '#7a7896');
        r.rect(p[0], p[1], p[0] + 79, p[1] + 47, S(c, -0.75));
        r.rect(p[0] + 4, p[1] + 32, p[0] + 75, p[1] + 43, S(c, -0.5));
        r.rect(p[0] + 4, p[1] + 31, p[0] + 75, p[1] + 31, c);
        drawMini(r, loc.prop, p[0] + 26, p[1] + 6, c);
      });
      r.rect(0, 176, 319, 223, '#0e0c1a');
      return r.done();
    });
  };
  function drawMini(r, kind, x, y, c) { // 28x24 prop silhouette inside a map room
    var d = S(c, -0.3), l = S(c, 0.4);
    switch (kind) {
      case 'gantry': r.rect(x + 2, y, x + 4, y + 24, d); r.rect(x + 20, y, x + 22, y + 24, d); r.poly([[x + 8, y + 24], [x + 12, y - 2], [x + 16, y + 24]], '#d8d4e8'); break;
      case 'pillar': for (var i = 0; i < 3; i++) r.rect(x + i * 10, y + 2, x + i * 10 + 5, y + 24, i === 1 ? l : c); break;
      case 'vat': r.rect(x, y + 4, x + 12, y + 24, d); r.rect(x + 2, y + 10, x + 10, y + 22, c); r.rect(x + 16, y + 4, x + 28, y + 24, d); r.rect(x + 18, y + 10, x + 26, y + 22, l); break;
      case 'vault': r.ell(x + 2, y, x + 26, y + 24, d); r.ell(x + 7, y + 5, x + 21, y + 19, c); r.ell(x + 12, y + 10, x + 16, y + 14, l); break;
      case 'clock': r.ell(x + 2, y, x + 26, y + 24, c); r.ell(x + 4, y + 2, x + 24, y + 22, '#f2e8cc'); r.line(x + 14, y + 12, x + 14, y + 4, '#000'); r.line(x + 14, y + 12, x + 20, y + 14, '#000'); break;
      case 'slots': r.rect(x, y + 2, x + 12, y + 24, c); r.rect(x + 16, y + 2, x + 28, y + 24, c); r.rect(x + 2, y + 8, x + 10, y + 14, '#fff8ec'); r.rect(x + 18, y + 8, x + 26, y + 14, '#fff8ec'); break;
    }
  }
})(globalThis.G = globalThis.G || {});
