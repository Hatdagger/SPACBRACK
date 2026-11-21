// Static game data: pieces, rotation kicks, cards, locations.
(function (G) {
  'use strict';

  // Working title lives here so a rename is a one-line change.
  G.TITLE = 'SPACBRACK';
  G.SUBTITLE = 'prototype v0.1';

  G.COLS = 10;
  G.ROWS = 22;      // 2 hidden rows on top
  G.HIDDEN = 2;
  G.WIN_LINES = 40;

  // Piece shapes in rotation state 0 (y grows downward), inside an n x n box.
  G.PIECES = {
    I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
    J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] },
    O: { n: 2, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
    Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }
  };
  G.PIECE_TYPES = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

  // Precompute the 4 rotation states of every piece.
  G.SHAPES = {};
  G.PIECE_TYPES.forEach(function (t) {
    var p = G.PIECES[t], states = [], cur = p.cells;
    for (var r = 0; r < 4; r++) {
      states.push(cur);
      cur = cur.map(function (c) { return [p.n - 1 - c[1], c[0]]; });
    }
    G.SHAPES[t] = states;
  });

  // Wall kick tables (standard rotation system), y-up values from the usual
  // tables; converted to y-down when used.
  var K = {
    '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
    '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  };
  var KI = {
    '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
    '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  };
  G.kicks = function (type, from, to) {
    var tbl = type === 'I' ? KI : K;
    return (tbl[from + '>' + to] || [[0, 0]]).map(function (k) { return [k[0], -k[1]]; });
  };

  // The six token features. Each location awards one.
  G.FEATURES = [
    { key: 'wallKick', name: 'Thrusters', desc: 'Wall kicks' },
    { key: 'ghost', name: 'Hologram', desc: 'Ghost piece' },
    { key: 'hardDrop', name: 'Fold Drive', desc: 'Hard drop' },
    { key: 'hold', name: 'Vault', desc: 'Hold' },
    { key: 'preview', name: 'Chrono Lens', desc: 'Next-piece preview' },
    { key: 'bag', name: 'Lucky Seven', desc: '7-bag randomizer' }
  ];
  G.noFeatures = function () {
    var f = {}; G.FEATURES.forEach(function (x) { f[x.key] = false; }); return f;
  };
  G.allFeatures = function () {
    var f = {}; G.FEATURES.forEach(function (x) { f[x.key] = true; }); return f;
  };

  // Card ranks: XP thresholds (XP = score from won matches).
  G.RANK_XP = [0, 0, 2000, 6000, 12000, 20000]; // index = rank
  G.rankForXp = function (xp) {
    var r = 1;
    for (var i = 2; i <= 5; i++) if (xp >= G.RANK_XP[i]) r = i;
    return r;
  };

  // Directions -> rank needed (proposal from the concept doc: one fixed role per direction).
  G.DIRS = ['left', 'right', 'down', 'up'];
  G.DIR_RANK = { left: 2, right: 3, down: 4, up: 5 };
  G.DIR_ROLE = { left: 'Attack', right: 'Defense', down: 'Timed', up: 'Super' };

  // Monster cards. Abilities are placeholders until the full sets are designed.
  G.CARDS = {
    starter: {
      id: 'starter', name: 'Cadet Badge', color: '#c9c2a8', pattern: 'standard',
      passive: { name: 'None', desc: 'Plain starter card' }, actives: {}
    },
    cyclops: {
      id: 'cyclops', name: 'Cyclops', color: '#d9a441', pattern: 'standard',
      passive: { name: 'Focus', desc: 'Ghost piece always on', id: 'focus' },
      actives: {
        left: { name: 'Boulder', cost: 3, id: 'boulder', desc: 'Drop a 2x2 rock on foe' },
        right: { name: 'Stare Down', cost: 3, id: 'staredown', desc: 'Cancel 3 incoming lines' },
        down: { name: 'Glare', cost: 4, id: 'glare', desc: 'Foe loses preview 8s' },
        up: { name: 'Rockslide', cost: 8, id: 'rockslide', desc: 'Three boulders' }
      }
    },
    skeleton: {
      id: 'skeleton', name: 'Skeleton', color: '#e8e1cf', pattern: 'ribs',
      passive: { name: 'Ribcage', desc: 'Your garbage has rib gaps', id: 'ribs' },
      actives: {
        left: { name: 'Rattle', cost: 2, id: 'rattle', desc: 'Shake foe piece 1 column' },
        right: { name: 'Bone Patch', cost: 4, id: 'bonepatch', desc: 'Fill 4 covered holes' },
        down: { name: 'Shiver', cost: 5, id: 'shiver', desc: 'Foe piece rattles 6s' },
        up: { name: 'Bone Storm', cost: 8, id: 'bonestorm', desc: 'Send 4 lines' }
      }
    },
    werewolf: {
      id: 'werewolf', name: 'Werewolf', color: '#8a6a4f', pattern: 'claw',
      passive: { name: 'Claw Marks', desc: 'Your garbage has slashed gaps', id: 'claw' },
      actives: {
        left: { name: 'Claw', cost: 4, id: 'claw3', desc: 'Send 3 slashed lines' },
        right: { name: 'Thick Fur', cost: 3, id: 'fur', desc: 'Block next garbage hit' },
        down: { name: 'Howl', cost: 5, id: 'howl', desc: 'Foe falls 3x faster 6s' },
        up: { name: 'Full Moon', cost: 7, id: 'fullmoon', desc: 'Next 3 pieces are I' }
      }
    },
    bat: {
      id: 'bat', name: 'Giant Bat', color: '#7b5ea7', pattern: 'stairs',
      passive: { name: 'Echolocation', desc: '+1 preview piece', id: 'echo' },
      actives: {
        left: { name: 'Nightfall', cost: 3, id: 'nightfall', desc: '1 line + darken foe 5s' },
        right: { name: 'Roost', cost: 3, id: 'roost', desc: 'Pause your gravity 4s' },
        down: { name: 'Sonar', cost: 2, id: 'sonar', desc: '5-piece preview 10s' },
        up: { name: 'Swarm', cost: 8, id: 'swarm', desc: '3 lines + darken foe 8s' }
      }
    }
  };
  G.MONSTERS = ['cyclops', 'skeleton', 'werewolf', 'bat'];

  // Six locations. House rules and stage perks are listed but not yet in the prototype.
  G.LOCATIONS = [
    {
      id: 'launch', name: 'Launch Complex', feature: 'wallKick', color: '#e8763a', prop: 'gantry',
      rule: 'Countdown race (coming later)',
      npcs: [
        { name: 'Ground Crew Gus', card: 'skeleton', rank: 1, level: 1, line: 'Fuel is loaded. Want a quick race?' },
        { name: 'Flight Tech Ida', card: 'bat', rank: 2, level: 1, line: 'Checklist done. Care to test your stacking?' },
        { name: 'Commander Vance', card: 'cyclops', rank: 2, level: 2, boss: true, line: 'T-minus ten. Show me you can fly.' }
      ]
    },
    {
      id: 'holo', name: 'Hologram Hall', feature: 'ghost', color: '#4fd1c5', prop: 'pillar',
      rule: 'Hologram decoys (coming later)',
      npcs: [
        { name: 'Usher Lumen', card: 'bat', rank: 2, level: 2, line: 'The show starts when the blocks drop.' },
        { name: 'Projectionist Rae', card: 'werewolf', rank: 2, level: 2, line: 'I see every frame. Do you?' },
        { name: 'The Phantom Host', card: 'bat', rank: 3, level: 3, boss: true, line: 'Nothing here is real... except defeat.' }
      ]
    },
    {
      id: 'fold', name: 'Fold Lab', feature: 'hardDrop', color: '#9ae66e', prop: 'vat',
      rule: 'Fold garbage (coming later)',
      npcs: [
        { name: 'Lab Intern Pip', card: 'skeleton', rank: 2, level: 2, line: 'Space folds. So will you.' },
        { name: 'Dr. Crease', card: 'cyclops', rank: 3, level: 3, line: 'An experiment! You are the control group.' },
        { name: 'Professor Origami', card: 'werewolf', rank: 3, level: 3, boss: true, line: 'Every fold has a purpose.' }
      ]
    },
    {
      id: 'bank', name: 'Space Bank', feature: 'hold', color: '#f2c94c', prop: 'vault',
      rule: 'Interest garbage (coming later)',
      npcs: [
        { name: 'Teller Penny', card: 'cyclops', rank: 2, level: 3, line: 'Deposits only. Garbage accepted.' },
        { name: 'Guard Brick', card: 'werewolf', rank: 3, level: 3, line: 'Nobody gets to the vault.' },
        { name: 'Director Ledger', card: 'skeleton', rank: 4, level: 4, boss: true, line: 'Your account is overdrawn.' }
      ]
    },
    {
      id: 'chrono', name: 'Chrono Station', feature: 'preview', color: '#6fa8ff', prop: 'clock',
      rule: 'Save states (coming later)',
      npcs: [
        { name: 'Timekeeper Tock', card: 'bat', rank: 3, level: 3, line: 'You are late. Or early. Battle?' },
        { name: 'Engineer Loop', card: 'skeleton', rank: 3, level: 4, line: 'I have seen this match before.' },
        { name: 'Past You', card: 'starter', rank: 1, level: 4, boss: true, mirror: true, line: 'Remember me?' }
      ]
    },
    {
      id: 'casino', name: 'Space Casino', feature: 'bag', color: '#ff5d8f', prop: 'slots',
      rule: 'Card bet (coming later)',
      npcs: [
        { name: 'Croupier Dex', card: 'werewolf', rank: 3, level: 4, line: 'Place your bets.' },
        { name: 'High Roller Sal', card: 'cyclops', rank: 4, level: 4, line: 'The house always stacks.' },
        { name: 'Lady Luck', card: 'bat', rank: 5, level: 5, boss: true, line: 'Luck runs out. Mine does not.' }
      ]
    }
  ];

  G.INVENTORY_CAP = 6;

  // Block colours: NASA-punk palette (deliberately not the familiar guideline colours).
  G.BLOCK_COLORS = {
    I: '#5ec8d8', J: '#3f6fb5', L: '#e8833a', O: '#f2d16b', S: '#7fbf6a', T: '#b06ab3', Z: '#d9534f',
    G: '#6d6a63', R: '#8c7b62', B: '#e8e1cf'
  };
})(globalThis.G = globalThis.G || {});
