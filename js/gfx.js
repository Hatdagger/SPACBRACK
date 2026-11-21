// Pixel renderer kit: 320x224 (Neo Geo resolution), bitmap fonts, brick sprites,
// VHS-box stripes, cassette-hardware panels, LED readouts, VU meters, sprites.
(function (G) {
  'use strict';

  G.SW = 320; G.SH = 224;

  // ---------- palette ----------
  G.PAL = {
    black: '#07060b', ink: '#16131f', night: '#0e0c1a',
    beige: '#d9ccab', beigeHi: '#f2e8cc', beigeLo: '#9c8f70', beigeInk: '#2b2418',
    steel: '#3a3f52', steelHi: '#5d6580', steelLo: '#1d2030',
    amber: '#ffb21e', amberDim: '#3d2a06', green: '#5cff7a', greenDim: '#0f3318',
    white: '#fff8ec', grey: '#8c8aa0',
    red: '#ff3b47', orange: '#ff8a1e', yellow: '#ffdc2e', lime: '#a6ff3a', cyan: '#2fe0ff', blue: '#3b6bff', violet: '#9d4dff', pink: '#ff3fa4'
  };
  // Blank-VHS-box stripe set
  G.STRIPES = ['#ff3b47', '#ff8a1e', '#ffdc2e', '#2fe0ff', '#9d4dff'];

  G.shade = function (hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(v) { return Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt))); }
    return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
  };

  // ---------- fonts ----------
  var BIG = { w: 5, h: 7, adv: 6, g: {
    "A": ".###.#...##...#######...##...##...#",
    "B": "####.#...##...#####.#...##...#####.",
    "C": ".###.#...##....#....#....#...#.###.",
    "D": "####.#...##...##...##...##...#####.",
    "E": "######....#....####.#....#....#####",
    "F": "######....#....####.#....#....#....",
    "G": ".###.#...##....#.####...##...#.####",
    "H": "#...##...##...#######...##...##...#",
    "I": ".###...#....#....#....#....#...###.",
    "J": "..###...#....#....#....#.#..#..##..",
    "K": "#...##..#.#.#..##...#.#..#..#.#...#",
    "L": "#....#....#....#....#....#....#####",
    "M": "#...###.###.#.##.#.##...##...##...#",
    "N": "#...##...###..##.#.##..###...##...#",
    "O": ".###.#...##...##...##...##...#.###.",
    "P": "####.#...##...#####.#....#....#....",
    "Q": ".###.#...##...##...##.#.##..#..##.#",
    "R": "####.#...##...#####.#.#..#..#.#...#",
    "S": ".#####....#.....###.....#....#####.",
    "T": "#####..#....#....#....#....#....#..",
    "U": "#...##...##...##...##...##...#.###.",
    "V": "#...##...##...##...##...#.#.#...#..",
    "W": "#...##...##...##.#.##.#.##.#.#.#.#.",
    "X": "#...##...#.#.#...#...#.#.#...##...#",
    "Y": "#...##...#.#.#...#....#....#....#..",
    "Z": "#####....#...#...#...#...#....#####",
    "0": ".###.#...##..###.#.###..##...#.###.",
    "1": "..#...##....#....#....#....#...###.",
    "2": ".###.#...#....#...#...#...#...#####",
    "3": "####.....#....#.###.....#....#####.",
    "4": "...#...##..#.#.#..#.#####...#....#.",
    "5": "######....####.....#....##...#.###.",
    "6": "..##..#...#....####.#...##...#.###.",
    "7": "#####....#...#...#...#....#....#...",
    "8": ".###.#...##...#.###.#...##...#.###.",
    "9": ".###.#...##...#.####....#...#..##..",
    " ": "...................................",
    "!": "..#....#....#....#....#.........#..",
    "?": ".###.#...#....#...#...#.........#..",
    ".": "..........................##...##..",
    ",": ".....................##....#...#...",
    ":": "......##...##........##...##.......",
    "-": "................###................",
    "/": "....#....#...#...#...#...#....#....",
    "'": "..#....#...#.......................",
    "(": "...#...#...#....#....#.....#.....#.",
    ")": ".#.....#.....#....#....#...#...#...",
    "+": ".......#....#..#####..#....#.......",
    ">": ".#.....#.....#.....#...#...#...#...",
    "<": "...#...#...#...#.....#.....#.....#.",
    "|": "..#....#....#....#....#....#....#..",
    "*": ".......#..#.#.#.###.#.#.#..#.......",
    "[": ".###..#....#....#....#....#....###.",
    "]": ".###....#....#....#....#....#..###.",
    "%": "##..###..#...#...#...#...#..###..##",
    ";": "......##...##........##....#...#...",
    "=": "..........#####.....#####..........",
    "#": ".#.#..#.#.#####.#.#.#####.#.#..#.#.",
    "&": ".##..#..#.#.#...#...#.#.##..#..##.#",
    "\"": ".#.#..#.#..........................",
    "_": "..............................#####"
  } };
  var SMALL = { w: 3, h: 5, adv: 4, g: {
    "A": ".#.#.#####.##.#",
    "B": "##.#.###.#.###.",
    "C": ".###..#..#...##",
    "D": "##.#.##.##.###.",
    "E": "####..##.#..###",
    "F": "####..##.#..#..",
    "G": ".###..#.##.#.##",
    "H": "#.##.#####.##.#",
    "I": "###.#..#..#.###",
    "J": "..#..#..##.#.#.",
    "K": "#.##.###.#.##.#",
    "L": "#..#..#..#..###",
    "M": "#.########.##.#",
    "N": "##.#.##.##.##.#",
    "O": ".#.#.##.##.#.#.",
    "P": "##.#.###.#..#..",
    "Q": ".#.#.##.###..##",
    "R": "##.#.###.#.##.#",
    "S": ".###...#...###.",
    "T": "###.#..#..#..#.",
    "U": "#.##.##.##.####",
    "V": "#.##.##.##.#.#.",
    "W": "#.##.########.#",
    "X": "#.##.#.#.#.##.#",
    "Y": "#.##.#.#..#..#.",
    "Z": "###..#.#.#..###",
    "0": "####.##.##.####",
    "1": ".#.##..#..#.###",
    "2": "##...#.#.#..###",
    "3": "##...#.#...###.",
    "4": "#.##.####..#..#",
    "5": "####..##...###.",
    "6": ".###..####.####",
    "7": "###..#.#..#..#.",
    "8": "####.#####.####",
    "9": "####.####..###.",
    " ": "...............",
    "!": ".#..#..#.....#.",
    "?": "##...#.#.....#.",
    ".": ".............#.",
    ",": "..........#.#..",
    ":": "....#.....#....",
    "-": "......###......",
    "/": "..#..#.#.#..#..",
    "'": ".#..#..........",
    "(": ".#.#..#..#...#.",
    ")": ".#...#..#..#.#.",
    "+": "....#.###.#....",
    ">": "#...#...#.#.#..",
    "<": "..#.#.#...#...#",
    "|": ".#..#..#..#..#.",
    "*": "...#.#.#.#.#...",
    "[": "##.#..#..#..##.",
    "]": ".##..#..#..#.##",
    "%": "#.#..#.#.#..#.#",
    ";": "....#.....#.#..",
    "=": "...###...###...",
    "#": "#.#####.#####.#",
    "&": ".#.#.#.#.#.#.##",
    "\"": "#.##.#.........",
    "_": "............###"
  } };
  // Pad / clip glyph strings to exact size so the data above can't break rendering.
  [BIG, SMALL].forEach(function (F) {
    var n = F.w * F.h;
    for (var k in F.g) { var s = F.g[k]; F.g[k] = (s + '.'.repeat(n)).slice(0, n); }
  });
  G.FONTS = { big: BIG, small: SMALL };

  var sheets = {};
  function sheet(fontName, color) {
    var key = fontName + color;
    if (sheets[key]) return sheets[key];
    var F = G.FONTS[fontName], chars = Object.keys(F.g);
    var c = document.createElement('canvas');
    c.width = chars.length * F.w; c.height = F.h;
    var x = c.getContext('2d'); x.fillStyle = color;
    var idx = {};
    chars.forEach(function (ch, i) {
      idx[ch] = i;
      var g = F.g[ch];
      for (var p = 0; p < g.length; p++) if (g[p] === '#') x.fillRect(i * F.w + (p % F.w), Math.floor(p / F.w), 1, 1);
    });
    return (sheets[key] = { canvas: c, idx: idx, F: F });
  }

  var ctx;
  G.gfxInit = function (c) { ctx = c; ctx.imageSmoothingEnabled = false; };

  G.rect = function (x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); };
  G.px = function (x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); };

  G.textWidth = function (s, font, scale) {
    var F = G.FONTS[font || 'big']; scale = scale || 1;
    return Math.max(0, String(s).length * F.adv - (F.adv - F.w)) * scale;
  };
  // opts: font, color, align, shadow, scale
  G.text = function (s, x, y, color, opts) {
    opts = opts || {};
    s = String(s).toUpperCase();
    var font = opts.font || 'big', scale = opts.scale || 1, F = G.FONTS[font];
    var w = G.textWidth(s, font, scale);
    if (opts.align === 'center') x -= Math.floor(w / 2);
    else if (opts.align === 'right') x -= w;
    x |= 0; y |= 0;
    if (opts.shadow) G.text(s, x + scale, y + scale, opts.shadow, { font: font, scale: scale });
    var sh = sheet(font, color || G.PAL.white);
    for (var i = 0; i < s.length; i++) {
      var k = sh.idx[s[i]]; if (k == null) k = sh.idx['?'];
      ctx.drawImage(sh.canvas, k * F.w, 0, F.w, F.h, x + i * F.adv * scale, y, F.w * scale, F.h * scale);
    }
    return w;
  };

  // Chrome logo lettering: banded gradient + dark outline + drop shadow.
  G.chrome = function (s, x, y, scale, align, bands) {
    s = String(s).toUpperCase();
    bands = bands || ['#fff8ec', '#ffe98a', '#ffdc2e', '#ff8a1e', '#ff3b47', '#c0207a', '#7a1a8a'];
    var F = BIG, w = G.textWidth(s, 'big', scale);
    if (align === 'center') x -= Math.floor(w / 2);
    x |= 0; y |= 0;
    function glyphs(ox, oy, colorFn) {
      for (var i = 0; i < s.length; i++) {
        var g = F.g[s[i]] || F.g['?'];
        for (var p = 0; p < g.length; p++) if (g[p] === '#') {
          var gx = p % F.w, gy = Math.floor(p / F.w);
          for (var sy = 0; sy < scale; sy++) {
            ctx.fillStyle = colorFn(gy * scale + sy);
            ctx.fillRect(ox + i * F.adv * scale + gx * scale, oy + gy * scale + sy, scale, 1);
          }
        }
      }
    }
    var H = F.h * scale;
    glyphs(x + 2, y + 2, function () { return '#000000'; });
    [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (o) { glyphs(x + o[0], y + o[1], function () { return '#1a0a2a'; }); });
    glyphs(x, y, function (row) { return bands[Math.min(bands.length - 1, Math.floor(row / H * bands.length))]; });
    return w;
  };

  // Bevelled box (hardware look). style: {base, hi, lo, line}
  G.bevel = function (x, y, w, h, base, hi, lo, line) {
    if (line) G.rect(x - 1, y - 1, w + 2, h + 2, line);
    G.rect(x, y, w, h, base);
    G.rect(x, y, w, 1, hi); G.rect(x, y, 1, h, hi);
    G.rect(x, y + h - 1, w, 1, lo); G.rect(x + w - 1, y, 1, h, lo);
  };
  // Dark grey cassette-deck panel with screws.
  G.deck = function (x, y, w, h) {
    G.bevel(x, y, w, h, G.PAL.steel, G.PAL.steelHi, G.PAL.steelLo, '#000');
    [[2, 2], [w - 4, 2], [2, h - 4], [w - 4, h - 4]].forEach(function (s) {
      G.rect(x + s[0], y + s[1], 2, 2, G.PAL.steelLo); G.px(x + s[0], y + s[1], G.PAL.steelHi);
    });
  };
  // Beige cassette label panel; optional coloured stripe band on top.
  G.label = function (x, y, w, h, accent) {
    G.bevel(x, y, w, h, G.PAL.beige, G.PAL.beigeHi, G.PAL.beigeLo, '#000');
    if (accent) {
      G.rect(x + 1, y + 1, w - 2, 3, accent);
      G.rect(x + 1, y + 4, w - 2, 1, G.shade(accent, -0.4));
    }
  };
  // Recessed screen
  G.inset = function (x, y, w, h, bg) {
    G.rect(x - 1, y - 1, w + 2, h + 2, '#000');
    G.rect(x, y, w, h, bg || '#0a0d14');
    G.rect(x, y, w, 1, '#000');
  };
  // LED readout with dim "8" ghost segments behind it.
  G.led = function (s, x, y, color, align, dim) {
    s = String(s);
    var ghost = s.replace(/[0-9]/g, '8');
    G.text(ghost, x, y, dim || G.PAL.amberDim, { align: align });
    return G.text(s, x, y, color || G.PAL.amber, { align: align });
  };
  // VU meter: n segments, `lit` of them on.
  G.vu = function (x, y, n, lit, segW, segH) {
    segW = segW || 7; segH = segH || 4;
    for (var i = 0; i < n; i++) {
      var f = i / n, c = f < 0.6 ? G.PAL.green : f < 0.8 ? G.PAL.yellow : G.PAL.red;
      G.rect(x + i * (segW + 1), y, segW, segH, i < lit ? c : G.shade(c, -0.78));
      if (i < lit) G.rect(x + i * (segW + 1), y, segW, 1, G.shade(c, 0.5));
    }
  };
  // Blank-VHS-box racing stripes: horizontal bands with a slanted leading edge.
  G.stripes = function (x0, y0, w, bandH, colors, slant, dir) {
    colors = colors || G.STRIPES;
    for (var k = 0; k < colors.length; k++) for (var r = 0; r < bandH; r++) {
      var row = k * bandH + r, off = Math.floor(row * (slant || 1));
      if (dir === 'right') G.rect(x0, y0 + row, w - off, 1, colors[k]);
      else G.rect(x0 + off, y0 + row, w - off, 1, colors[k]);
    }
  };
  // Perspective floor grid (synth/VHS-cover style).
  G.floor = function (y0, h, color, t) {
    G.rect(0, y0, G.SW, h, '#0b0618');
    ctx.fillStyle = color;
    var cx = G.SW / 2;
    for (var i = -12; i <= 12; i++) {
      var xb = cx + i * 40;
      for (var r = 0; r < h; r++) {
        var x = cx + (xb - cx) * (r / h);
        ctx.fillRect(x | 0, y0 + r, 1, 1);
      }
    }
    var phase = ((t || 0) / 60) % 1;
    for (var j = 0; j < 8; j++) {
      var p = (j + phase) / 8, y = y0 + Math.floor(p * p * h);
      ctx.fillRect(0, y, G.SW, 1);
    }
  };

  // ---------- bricks ----------
  var brickCache = {};
  G.brick = function (x, y, size, color) {
    var key = size + color;
    var c = brickCache[key];
    if (!c) {
      c = document.createElement('canvas'); c.width = size; c.height = size;
      var b = c.getContext('2d');
      var hi = G.shade(color, 0.55), lo = G.shade(color, -0.5), mid = G.shade(color, -0.2);
      b.fillStyle = color; b.fillRect(0, 0, size, size);
      b.fillStyle = lo; b.fillRect(0, size - 1, size, 1); b.fillRect(size - 1, 0, 1, size);
      b.fillStyle = hi; b.fillRect(0, 0, size - 1, 1); b.fillRect(0, 0, 1, size - 1);
      if (size >= 6) {
        b.fillStyle = mid; b.fillRect(2, size - 2, size - 3, 1); b.fillRect(size - 2, 2, 1, size - 3);
        b.fillStyle = '#ffffff'; b.fillRect(1, 1, 2, 1); b.fillRect(1, 2, 1, 1);
      }
      brickCache[key] = c;
    }
    ctx.drawImage(c, x | 0, y | 0);
  };

  // ---------- sprites from string maps ----------
  var spriteCache = {};
  G.sprite = function (rows, x, y, pal, key, flip) {
    var ck = key && (key + (flip ? 'f' : ''));
    var c = ck && spriteCache[ck];
    if (!c) {
      c = document.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
      var s = c.getContext('2d');
      rows.forEach(function (row, ry) {
        for (var rx = 0; rx < row.length; rx++) {
          var col = pal[row[rx]];
          if (col) { s.fillStyle = col; s.fillRect(flip ? row.length - 1 - rx : rx, ry, 1, 1); }
        }
      });
      if (ck) spriteCache[ck] = c;
    }
    ctx.drawImage(c, x | 0, y | 0);
  };

  G.ASTRO = [
    '................',
    '.....kkkkkk.....',
    '....kwwwwwwk....',
    '...kwwvvvvwwk...',
    '...kwvlvvvvwk...',
    '...kwvvvvvvwk...',
    '...kwwvvvvwwk...',
    '....kwwwwwwk....',
    '...kccwwwwcck...',
    '..kwccwwwwccwk..',
    '..kwwkwddwkwwk..',
    '..kggkwwwwkggk..',
    '...kkkwwwwkkk...',
    '....kwwkkwwk....',
    '....kggk.kggk...',
    '....kkkk.kkkk...'
  ];
})(globalThis.G = globalThis.G || {});
