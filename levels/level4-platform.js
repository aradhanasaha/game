// levels/level4-platform.js — GURGAON (Side-scrolling platformer)

import { CONFIG, PALETTE as P } from '../config.js';
import { applyGravity, resolvePlatforms, aabbOverlap } from '../engine/physics.js';
import { drawText, W, H } from '../engine/renderer.js';
import { drawSprite, Sprites, drawPlayerAnim } from '../engine/assets.js';
import { SFX } from '../engine/audio.js';
import { isLeft, isRight, isUp } from '../engine/input.js';

// ── Background image ──
const _bgImg = new Image();
_bgImg.src = 'assets/background/level4bg.jpg';

// ── Rock tile canvases (generated once) ──
let _rockTop = null, _rockFront = null;

function makeRockTiles() {
  if (_rockTop) return;

  // Top surface tile: 16×8 px
  const t = document.createElement('canvas');
  t.width = 16; t.height = 8;
  const tc = t.getContext('2d');
  tc.fillStyle = '#5a5248';
  tc.fillRect(0, 0, 16, 8);
  tc.fillStyle = '#7c6e66';
  tc.fillRect(0, 0, 16, 2);
  tc.fillStyle = '#453d38';
  tc.fillRect(0, 5, 16, 3);
  [
    [1, 3, '#8c7e76'], [4, 2, '#6a5e58'], [7, 4, '#7a706a'],
    [10, 3, '#5e5450'], [13, 2, '#8a7e78'], [3, 6, '#3e3830'],
    [9,  5, '#4a4438'], [12, 6, '#625850'],
  ].forEach(([px, py, c]) => {
    tc.fillStyle = c; tc.fillRect(px, py, 2, 1);
    tc.fillStyle = '#2a2018'; tc.fillRect(px + 1, py + 1, 1, 1);
  });
  tc.fillStyle = '#1a1510'; tc.fillRect(0, 0, 16, 1);
  _rockTop = t;

  // Front face tile: 16×8 px
  const f = document.createElement('canvas');
  f.width = 16; f.height = 8;
  const fc = f.getContext('2d');
  fc.fillStyle = '#3c3028'; fc.fillRect(0, 0, 16, 8);
  fc.fillStyle = '#2c221a'; fc.fillRect(0, 4, 16, 4);
  fc.fillStyle = '#1a1008'; fc.fillRect(0, 7, 16, 1);
  fc.fillStyle = '#1a1008';
  fc.fillRect(4, 1, 1, 3); fc.fillRect(10, 4, 1, 2); fc.fillRect(13, 1, 1, 2);
  fc.fillStyle = '#504438'; fc.fillRect(0, 0, 16, 1);
  _rockFront = f;
}

// ── Rain (screen-space, persists between frames) ──
let _rain = [];

function initRain() {
  _rain = [];
  for (let i = 0; i < 150; i++) {
    _rain.push({
      x:     Math.random() * W,
      y:     HUD_H + Math.random() * (H - HUD_H),
      len:   9  + Math.random() * 16,
      speed: 13 + Math.random() * 10,
      alpha: 0.18 + Math.random() * 0.42,
    });
  }
}

function updateRainDrops() {
  for (const d of _rain) {
    d.y += d.speed;
    d.x -= d.speed * 0.22;
    if (d.y > H + 12) { d.y = HUD_H - d.len; d.x = Math.random() * (W + 60) - 30; }
    if (d.x < -30)    { d.x = W + 20; d.y = HUD_H + Math.random() * (H - HUD_H) * 0.6; }
  }
}

function drawRain(ctx) {
  ctx.save();
  ctx.lineWidth = 1;
  for (const d of _rain) {
    ctx.globalAlpha = d.alpha;
    ctx.strokeStyle = '#c0d8f4';
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - d.speed * 0.22, d.y + d.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Constants ──
const GROUND_Y   = 370;
const PLAYER_W   = 24;
const PLAYER_H   = 34;
const WORLD_W    = CONFIG.l4_world_width;   // 4500
const JUMP_FORCE = CONFIG.l4_jump_force;
const SPEED      = CONFIG.l4_player_speed;
const HUD_H      = 36;

// ── Toxic waste pits — instant-death zones ──
const TOXIC_PITS = [
  { x:  600, width: 180 },
  { x:  980, width: 220 },
  { x: 1400, width: 160 },
  { x: 1900, width: 260 },
  { x: 2400, width: 200 },
  { x: 3100, width: 300 },
  { x: 3700, width: 240 },
  // Zone 5 pits
  { x: 4700, width: 220 },
  { x: 5100, width: 260 },
];

// ── Checkpoint definitions ──
const CHECKPOINT_DEFS = [
  { x: 1200 },
  { x: 2500 },
  { x: 3600 },
  { x: 4550 },
];

let state = {};

function rand(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

// ─────────────────────────────────────────────────────────────
// DATA BUILDERS
// ─────────────────────────────────────────────────────────────
function makePlatforms() {
  const plats = [];

  // ── Ground segments — interrupted by toxic pits ──
  let gx = 0;
  for (const pit of TOXIC_PITS) {
    if (pit.x > gx) {
      plats.push({ x: gx, y: GROUND_Y, w: pit.x - gx, h: 60, type: 'solid',
        origX: gx, moveDir: 1, moveRange: 0, moveSpeed: 0,
        triggered: false, crumbleTimer: 0, broken: false });
    }
    gx = pit.x + pit.width;
  }
  if (gx < WORLD_W) {
    plats.push({ x: gx, y: GROUND_Y, w: WORLD_W - gx, h: 60, type: 'solid',
      origX: gx, moveDir: 1, moveRange: 0, moveSpeed: 0,
      triggered: false, crumbleTimer: 0, broken: false });
  }

  // ── Moving platforms over wide pits (>200px) ──
  // Speed increases by 0.3 for each successive wide pit
  const widePits = TOXIC_PITS.filter(p => p.width > 200);
  widePits.forEach((pit, idx) => {
    const spd     = 1.8 + idx * 0.3;
    const originX = pit.x + 20;
    const range   = pit.width - 40;
    plats.push({
      x: originX, y: 280, w: 64, h: 14, type: 'moving',
      origX: originX, moveDir: 1, moveRange: range, moveSpeed: spd,
      triggered: false, crumbleTimer: 0, broken: false,
    });
  });

  // ── Aerial platforms ─────────────────────────────────────
  // [x, y, w, h, type]
  const defs = [

    // ══ ZONE 1: Intro clusters (0–1000) ══════════════════════

    // Low-tier cluster A — before pit 1
    [140,  330, 64, 16, 'solid'],
    [250,  318, 80, 16, 'solid'],
    [370,  322, 40, 16, 'solid'],  // narrow
    [445,  315, 64, 16, 'solid'],
    [540,  330, 80, 16, 'solid'],
    [640,  310, 36, 16, 'solid'],  // narrow ledge at pit edge

    // Staircase 1 — 4 steps ascending toward high reward path
    [200,  285, 80, 16, 'solid'],
    [320,  245, 80, 16, 'solid'],
    [440,  210, 80, 16, 'solid'],
    [560,  175, 80, 16, 'solid'],  // top step

    // Low ceiling slab (overhead blocker, forces player to crouch-jump)
    [295,  238, 120, 14, 'solid'],

    // After pit 1 (x=780) — narrow landing then cluster B
    [780,  335, 36, 16, 'solid'],  // must be precise
    [840,  318, 64, 16, 'solid'],
    [920,  305, 80, 16, 'crumble'],
    [945,  228, 80, 16, 'solid'],  // upper route

    // ══ ZONE 2: Swamp Crossing (1000–2000) ═══════════════════

    // Cluster C — after pit 2 (x=1200)
    [1240, 318, 48, 16, 'solid'],  // narrow landing (shifted clear of CP1 spawn)
    [1310, 302, 80, 16, 'solid'],
    [1362, 318, 64, 16, 'solid'],
    [1382, 230, 64, 16, 'solid'],  // upper route

    // Staircase 2 — 4 steps ascending through zone 2 centre
    [1565, 330, 80, 16, 'solid'],
    [1645, 295, 80, 16, 'solid'],
    [1725, 260, 80, 16, 'solid'],
    [1805, 230, 80, 16, 'solid'],

    // Narrow ledges approaching pit 4 (x=1900)
    [1882, 248, 40, 16, 'solid'],  // narrow — right at the edge
    [1908, 195, 64, 16, 'solid'],  // high route over pit 4

    // Upper path Zone 2 (y ≈ 182–198) — thinned
    [1062, 198, 64, 16, 'solid'],
    [1272, 193, 64, 16, 'moving'],
    [1622, 195, 64, 16, 'solid'],

    // ══ ZONE 3: Bomb Gauntlet (2000–3200) ════════════════════

    // Cluster D — after pit 4 (x=2160)
    [2162, 318, 64, 16, 'solid'],
    [2252, 300, 48, 16, 'solid'],  // narrow
    [2332, 315, 64, 16, 'crumble'],
    [2362, 292, 40, 16, 'solid'],  // narrow approach to pit 5

    // Cluster E — after pit 5 (x=2600)
    [2602, 322, 80, 16, 'solid'],
    [2692, 302, 80, 16, 'solid'],
    [2782, 282, 64, 16, 'moving'],
    [2862, 300, 64, 16, 'crumble'],
    [2952, 318, 80, 16, 'solid'],
    [3048, 308, 48, 16, 'solid'],  // narrow cluster end
    [3082, 295, 40, 16, 'solid'],  // very narrow — right at pit 6 edge

    // High reward path Zone 3 (y ≈ 160–185) — thinned
    [2062, 182, 80, 16, 'solid'],
    [2332, 172, 80, 16, 'moving'],
    [2642, 168, 80, 16, 'solid'],
    [2962, 180, 80, 16, 'solid'],

    // Low ceiling section Zone 3 — overhead slab at y=242
    [2652, 242, 140, 14, 'solid'],

    // ══ ZONE 4: Brutal Final Stretch (3200–4500) ══════════════

    // Cluster F — after pit 6 (x=3400)
    [3402, 322, 64, 16, 'solid'],
    [3486, 305, 48, 16, 'solid'],  // narrow
    [3630, 320, 80, 16, 'crumble'],  // shifted clear of CP3 spawn (x=3600)
    [3720, 305, 64, 16, 'solid'],
    [3684, 288, 36, 16, 'solid'],  // very narrow — right at pit 7 edge

    // Staircase 3 — 4 steps after pit 7 (x=3940), final ascent
    [3942, 335, 80, 16, 'solid'],
    [4022, 298, 80, 16, 'solid'],
    [4102, 265, 80, 16, 'solid'],
    [4182, 235, 80, 16, 'solid'],

    // Final cluster approaching tower (x=4420)
    [4262, 258, 64, 16, 'solid'],
    [4342, 278, 48, 16, 'solid'],  // narrow
    [4402, 310, 80, 16, 'crumble'],

    // Upper path Zone 4 (y ≈ 175–200) — thinned
    [3262, 195, 80, 16, 'solid'],
    [3492, 175, 80, 16, 'solid'],
    [3732, 178, 80, 16, 'solid'],
    [4002, 192, 80, 16, 'moving'],
    [4252, 188, 80, 16, 'solid'],

    // Low ceiling section Zone 4 — overhead slab at y=235
    [4062, 235, 120, 14, 'solid'],

    // ══ ZONE 5: GURGAON Finale (4500–5500) ══════════════════════

    // Lower approach to pit 8 (x=4700)
    [4580, 330, 64, 16, 'solid'],  // shifted clear of CP4 spawn (x=4550)
    [4622, 312, 48, 16, 'crumble'],
    [4660, 300, 40, 16, 'solid'],  // narrow — right at pit edge

    // After pit 8 (x=4920) — moving platform over wide gap
    [4922, 320, 64, 16, 'solid'],
    [5002, 302, 80, 16, 'solid'],
    [5060, 285, 48, 16, 'crumble'],

    // Approach to pit 9 (x=5100)
    [5085, 300, 36, 16, 'solid'],  // very narrow

    // After pit 9 (x=5360) — final approach to skyscraper
    [5362, 330, 80, 16, 'solid'],
    [5442, 310, 64, 16, 'solid'],
  ];

  for (const [x, y, w, h, type] of defs) {
    plats.push({ x, y, w, h, type,
      origX: x, moveDir: 1, moveRange: 60, moveSpeed: 0.8,
      triggered: false, crumbleTimer: 0, broken: false,
    });
  }
  return plats;
}

function makeEnemies() {
  const GY = GROUND_Y;
  // All enemies carry trail[] for shadow trail rendering
  const mk = (x, type, overrides) => ({
    x, y: GY - 30, w: 24, h: 30, type,
    vx: 0, vy: 0, alive: true,
    dir: 1, hopTimer: 0, chargeTimer: 0,
    chargeSpeed: 4.5, charging: false, trail: [],
    ...overrides,
  });
  return [
    // ── ZONE 1 (0–1000) — intro, moderate ──
    mk(  320, 'puffball', { vx: -1, dir:  1 }),
    mk(  500, 'puffball', { vx: -1, dir: -1 }),
    mk(  780, 'hopper',   { hopTimer: 90 }),
    mk(  920, 'puffball', { vx: -1, dir:  1 }),

    // ── ZONE 2 (1000–2000) — ramps up ──
    mk( 1100, 'hopper',   { hopTimer: 70 }),
    mk( 1280, 'shadow',   { chargeSpeed: 3.5 }),
    mk( 1450, 'puffball', { vx: -1, dir:  1 }),
    mk( 1600, 'puffball', { vx: -1, dir: -1 }),
    mk( 1850, 'hopper',   { hopTimer: 60 }),
    mk( 1980, 'shadow',   { chargeSpeed: 4.0 }),

    // ── ZONE 3 (2000–3200) — hard ──
    mk( 2100, 'shadow',   { chargeSpeed: 4.0 }),
    mk( 2300, 'puffball', { vx: -1, dir:  1 }),
    mk( 2500, 'hopper',   { hopTimer: 50 }),
    mk( 2600, 'shadow',   { chargeSpeed: 4.5 }),
    mk( 2800, 'puffball', { vx: -1, dir:  1 }),
    mk( 2900, 'puffball', { vx: -1, dir: -1 }),
    mk( 3100, 'shadow',   { chargeSpeed: 5.0 }),

    // ── ZONE 4 (3200–4500) — brutal ──
    mk( 3300, 'shadow',   { chargeSpeed: 5.0 }),
    mk( 3450, 'hopper',   { hopTimer: 40 }),
    mk( 3550, 'puffball', { vx: -1, dir:  1 }),
    mk( 3700, 'shadow',   { chargeSpeed: 5.5 }),
    mk( 3900, 'puffball', { vx: -1, dir: -1 }),
    mk( 4000, 'hopper',   { hopTimer: 35 }),
    mk( 4100, 'shadow',   { chargeSpeed: 6.0 }),
    mk( 4250, 'puffball', { vx: -1, dir:  1 }),

    // ── ZONE 5 (4500–5500) — finale ──
    mk( 4540, 'shadow',   { chargeSpeed: 6.0 }),
    mk( 4640, 'hopper',   { hopTimer: 28 }),
    mk( 4940, 'shadow',   { chargeSpeed: 6.5 }),
    mk( 5010, 'puffball', { vx: -1, dir: -1 }),
    mk( 5090, 'shadow',   { chargeSpeed: 6.5 }),
    mk( 5380, 'puffball', { vx: -1, dir:  1 }),
    mk( 5450, 'shadow',   { chargeSpeed: 7.0 }),
  ];
}

function makeStaticBombs() {
  // Pre-placed bombs on ground and platforms (~3 per 400px)
  // [x, y, fuseTime]
  const GY = GROUND_Y - 22;
  const defs = [
    // Zone 1
    [ 420,  GY,  180],
    [ 560,  GY,  150],
    [ 740,  GY,  180],
    [ 880,  GY,  160],
    // Zone 2
    [1050,  GY,  180],
    [1240,  GY,  150],
    [1390,  GY,  180],
    [1582,  314, 180],  // on staircase step
    [1732,  244, 150],  // on staircase top
    [1862,  232, 180],  // on narrow ledge
    // Zone 3
    [2055,  GY,  180],
    [2250,  GY,  150],
    [2385,  276, 180],  // on platform
    [2660,  GY,  160],
    [2795,  266, 150],
    [2945,  GY,  180],
    [3062,  292, 150],
    // Zone 4
    [3365,  GY,  180],
    [3505,  GY,  150],
    [3582,  304, 180],
    [3825,  GY,  160],
    [3985,  282, 150],
    [4085,  GY,  180],
    [4205,  219, 150],  // on high staircase
    [4362,  262, 180],
    // Zone 5
    [4560,  GY,  180],
    [4650,  284, 150],
    [4960,  GY,  180],
    [5030,  269, 150],
    [5400,  GY,  180],
  ];
  return defs.map(([x, y, fuseTime]) => ({
    x, y, r: 9,
    fuseTime,
    fuseCountdown: fuseTime,
    triggered: false,
    exploding: false,
    explodeTimer: 0,
    alive: true,
  }));
}

function makeCollectibles() {
  const items = [];

  // Coin flowers (~2 per 400px, placed on reward paths)
  const flowers = [
    // Zone 1
    [262,  267], [458,  192], [652,  157],
    // Zone 2
    [1092, 180], [1302, 285], [1502, 170],
    [1748, 244], [1912, 177],
    // Zone 3
    [2202, 282], [2408, 285], [2658, 150],
    [2818, 157], [2975, 162], [3142, 167],
    // Zone 4
    [3272, 177], [3502, 157], [3652, 160],
    [3895, 167], [4045, 174], [4142, 164],
    [4265, 240], [4352, 260],
    // Zone 5
    [4565, 312], [4955, 267], [5045, 280],
    [5375, 312], [5455, 292],
  ];
  flowers.forEach(([x, y]) => items.push({
    x, y, w: 14, h: 14, type: 'coin', collected: false,
    bobPhase: Math.random() * Math.PI * 2,
  }));

  // Life hearts — rare, only after the hardest sections
  [
    [  922, GROUND_Y - 60],  // end of zone 1 reward route
    [ 2492, 142          ],  // top of zone 3 high reward path
    [ 4185, 217          ],  // top of final staircase
  ].forEach(([x, y]) => items.push({
    x, y, w: 18, h: 18, type: 'life', collected: false, bobPhase: 0,
  }));

  return items;
}

function makeDecorations() {
  const decos = [];
  for (let x = 50; x < WORLD_W - 100; x += 118 + Math.floor(Math.random() * 82)) {
    const inPit = TOXIC_PITS.some(p => x > p.x - 20 && x < p.x + p.width + 20);
    if (!inPit) decos.push({ type: 'bush', x, y: GROUND_Y - 18 });
  }
  return decos;
}

// ─────────────────────────────────────────────────────────────
// LEVEL OBJECT
// ─────────────────────────────────────────────────────────────
const Level4 = {
  init(G) {
    state = {
      player: {
        x: 80, y: GROUND_Y - PLAYER_H,
        w: PLAYER_W, h: PLAYER_H,
        vx: 0, vy: 0,
        onGround: false,
        facing: 1,
        jumpCount: 0,
        canDoubleJump: false,
        starTimer: 0,
        walkFrame: 0,
        walkTimer: 0,
        hurtFlash: 0,
      },
      camera: { x: 0 },
      platforms:    makePlatforms(),
      enemies:      makeEnemies(),
      collectibles: makeCollectibles(),
      decorations:  makeDecorations(),
      checkpoints:  CHECKPOINT_DEFS.map(c => ({ x: c.x, activated: false, waveTimer: 0 })),
      lastCheckpointX: null,
      bombs:        makeStaticBombs(),
      scorchMarks:  [],
      won:              false,
      winTimer:         0,
      lightningTimer:   rand(180, 420),
      lightningFlash:   0,
    };
    G._l4_jumpPressed = false;
    G._l4_prevUp      = false;
    makeRockTiles();
    initRain();
  },

  update(G) {
    if (state.won) {
      state.winTimer++;
      G.particles.update();
      if (state.winTimer === 60) G.levelComplete(600);
      return;
    }

    const pl = state.player;

    // ── Input ──
    if (isLeft(G))       pl.vx = -SPEED;
    else if (isRight(G)) pl.vx =  SPEED;
    else                 pl.vx *= 0.7;

    if (pl.vx > 0) pl.facing =  1;
    if (pl.vx < 0) pl.facing = -1;

    if (Math.abs(pl.vx) > 0.5 && pl.onGround) {
      pl.walkTimer++;
      if (pl.walkTimer > 8) { pl.walkFrame = (pl.walkFrame + 1) % 2; pl.walkTimer = 0; }
    } else pl.walkFrame = 0;

    // ── Jump ──
    const upNow = isUp(G);
    if (upNow && !G._l4_prevUp) {
      if (pl.onGround) {
        pl.vy = JUMP_FORCE; pl.jumpCount = 1; SFX.jump();
      } else if (pl.canDoubleJump && pl.jumpCount < 2) {
        pl.vy = JUMP_FORCE * 0.85; pl.jumpCount = 2;
        G.particles.stars(pl.x + pl.w / 2, pl.y + pl.h, 4); SFX.jump();
      }
    }
    G._l4_prevUp = upNow;

    // ── Physics ──
    applyGravity(pl);

    const solidPlats = state.platforms.filter(p => p.type !== 'cloud' && !p.broken);
    resolvePlatforms(pl, solidPlats);

    // Cloud platforms (one-way from top)
    if (pl.vy >= 0) {
      for (const c of state.platforms.filter(p => p.type === 'cloud')) {
        const feetY = pl.y + pl.h, prevFeetY = feetY - pl.vy;
        if (prevFeetY <= c.y && feetY >= c.y && pl.x + pl.w > c.x && pl.x < c.x + c.w) {
          pl.y = c.y - pl.h; pl.vy = 0; pl.onGround = true;
        }
      }
    }

    if (pl.onGround) { pl.jumpCount = 0; pl.canDoubleJump = true; }

    // ── Platform logic ──
    for (const plat of state.platforms) {
      if (plat.type === 'moving') {
        const spd = plat.moveSpeed > 0 ? plat.moveSpeed : 0.8;
        plat.x += plat.moveDir * spd;
        if (plat.x > plat.origX + plat.moveRange || plat.x < plat.origX)
          plat.moveDir *= -1;
        if (pl.onGround &&
            pl.y + pl.h >= plat.y && pl.y + pl.h <= plat.y + 4 &&
            pl.x + pl.w > plat.x && pl.x < plat.x + plat.w)
          pl.x += plat.moveDir * spd;
      }

      // Crumble: trigger on player contact, then count down
      if (plat.type === 'crumble' && !plat.triggered && !plat.broken) {
        if (pl.onGround &&
            pl.y + pl.h >= plat.y && pl.y + pl.h <= plat.y + 6 &&
            pl.x + pl.w > plat.x && pl.x < plat.x + plat.w) {
          plat.triggered = true;
          plat.crumbleTimer = 55;
        }
      }
      if (plat.type === 'crumble' && plat.triggered) {
        plat.crumbleTimer--;
        if (plat.crumbleTimer <= 0) {
          plat.broken = true;
          G.particles.confetti(plat.x + plat.w / 2, plat.y);
        }
      }
    }

    // ── Camera ──
    state.camera.x = Math.min(WORLD_W - W, Math.max(0, pl.x - W * 0.35));

    // ── Enemies ──
    for (const en of state.enemies) {
      if (!en.alive) continue;
      updateEnemy(en, pl, G, state.platforms);
    }

    // ── Collectibles ──
    for (const item of state.collectibles) {
      if (item.collected) continue;
      item.bobPhase = (item.bobPhase || 0) + 0.06;
      if (aabbOverlap(pl, { x: item.x, y: item.y + Math.sin(item.bobPhase) * 4, w: item.w, h: item.h })) {
        item.collected = true;
        if      (item.type === 'coin') { G.score += 10; SFX.coin(); G.particles.coins(item.x, item.y); }
        else if (item.type === 'life') { if (G.lives < 5) G.lives++; SFX.coin(); G.particles.hearts(item.x, item.y, 5); }
        else if (item.type === 'star') { pl.starTimer = 300; SFX.heartBurst(); G.particles.stars(item.x, item.y, 8); }
      }
    }

    // ── Toxic pit collision — instant death, no invincibility frames ──
    for (const pit of TOXIC_PITS) {
      if (pl.x + pl.w > pit.x && pl.x < pit.x + pit.width && pl.y + pl.h >= GROUND_Y) {
        G.playerDied();
        pl.hurtFlash = 0;  // no invincibility after pit death
        pl.x = state.lastCheckpointX ?? 80;
        pl.y = GROUND_Y - PLAYER_H;
        pl.vx = 0; pl.vy = 0;
        G.particles.confetti(pl.x, pl.y - 20);
        break;
      }
    }

    // ── Static bombs ──
    updateStaticBombs(state.bombs, state.scorchMarks, pl, G);

    // Update scorch mark fade (300 frames = 5 seconds)
    for (let i = state.scorchMarks.length - 1; i >= 0; i--) {
      state.scorchMarks[i].timer--;
      if (state.scorchMarks[i].timer <= 0) state.scorchMarks.splice(i, 1);
    }

    // ── Timers ──
    if (pl.starTimer > 0) pl.starTimer--;
    if (pl.hurtFlash  > 0) pl.hurtFlash--;

    updateRainDrops();

    // ── Fall / world bounds ──
    if (pl.y > H + 100) {
      pl.x = state.lastCheckpointX ?? 80;
      pl.y = GROUND_Y - PLAYER_H;
      pl.vx = 0; pl.vy = 0;
      G.playerDied();
    }
    if (pl.x < 0)              { pl.x = 0;             pl.vx = 0; }
    if (pl.x + pl.w > WORLD_W) { pl.x = WORLD_W - pl.w; pl.vx = 0; }

    // ── Checkpoints ──
    for (const cp of state.checkpoints) {
      if (!cp.activated && pl.x > cp.x) {
        cp.activated  = true;
        cp.waveTimer  = 0;
        state.lastCheckpointX = cp.x;
        G.particles.stars(cp.x, GROUND_Y - 30, 8);
        SFX.coin();
      }
      if (cp.activated) cp.waveTimer++;
    }

    // ── Win condition — skyscraper entrance at x ≈ 5400 ──
    if (pl.x + pl.w > 5400 && !state.won) {
      state.won      = true;
      state.winTimer = 0;
      G.particles.confetti(W / 2 + state.camera.x, GROUND_Y - 40);
      G.particles.hearts(5440, GROUND_Y - 100, 10);
    }

    // ── Lightning ──
    state.lightningTimer--;
    if (state.lightningFlash > 0) state.lightningFlash--;
    if (state.lightningTimer <= 0) {
      SFX.lightning();
      state.lightningFlash   = 6;
      state.lightningTimer   = rand(180, 480);
    }
  },

  draw(G, ctx) {
    const cam = state.camera.x;

    // ── Background + pit depth cutouts + rain (all screen-space) ──
    drawBg(ctx, cam);

    // ── Lightning flash ──
    if (state.lightningFlash > 0) {
      ctx.globalAlpha = state.lightningFlash / 6 * 0.45;
      ctx.fillStyle   = '#d0e8ff';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.translate(-cam, 0);

    // ── Toxic waste pits (below platforms) ──
    drawToxicPits(ctx, cam, G.frame);

    // ── Ground decor ──
    for (const d of state.decorations) {
      if (d.x - cam > W + 80 || d.x - cam < -80) continue;
      if (d.type === 'bush' && Sprites.bush) ctx.drawImage(Sprites.bush, d.x, d.y);
    }

    // ── Scorch marks (behind platforms) ──
    drawScorchMarks(ctx, state.scorchMarks);

    // ── Platforms ──
    for (const plat of state.platforms) {
      if (plat.x - cam > W + 64 || plat.x + plat.w - cam < 0) continue;
      if (plat.broken) continue;
      drawPlatform(ctx, plat, G.frame);
    }

    // ── Skyscraper ──
    drawTower(ctx, 5400, GROUND_Y);

    // ── Bombs ──
    drawBombs(ctx, state.bombs, G.frame);

    // ── Collectibles ──
    for (const item of state.collectibles) {
      if (item.collected) continue;
      const iy = item.y + Math.sin((item.bobPhase || 0)) * 4;
      if      (item.type === 'coin' && Sprites.coinFlower) ctx.drawImage(Sprites.coinFlower, item.x, iy);
      else if (item.type === 'life')                       drawHeartItem(ctx, item.x, iy);
      else if (item.type === 'star' && Sprites.starPower)  ctx.drawImage(Sprites.starPower, item.x, iy);
    }

    // ── Enemies ──
    for (const en of state.enemies) {
      if (!en.alive) continue;
      drawEnemy(ctx, en);
    }

    // ── Player ──
    const pl = state.player;
    ctx.save();
    if (pl.hurtFlash > 0) ctx.globalAlpha = G.frame % 8 < 4 ? 1.0 : 0.3;
    drawPlayer(ctx, pl, G.frame);
    ctx.restore();

    if (pl.starTimer > 0 && G.frame % 4 < 2) {
      ctx.strokeStyle = P.butter; ctx.lineWidth = 2;
      ctx.strokeRect(pl.x - 3, pl.y - 3, pl.w + 6, pl.h + 6);
    }

    ctx.restore();

    // ── Checkpoint flags ──
    ctx.save();
    ctx.translate(-cam, 0);
    for (let ci = 0; ci < state.checkpoints.length; ci++) {
      const cp = state.checkpoints[ci];
      const fx = cp.x;
      if (fx - cam < -60 || fx - cam > W + 60) continue;

      // Pole
      ctx.fillStyle = '#2a1a10';
      ctx.fillRect(fx, GROUND_Y - 72, 3, 72);

      if (cp.activated) {
        // Waving pink flag
        const wt  = cp.waveTimer;
        const amp = 5 * Math.max(0, 1 - wt / 120);  // settles after 2 s
        const wave = Math.sin(wt * 0.18) * amp;
        ctx.fillStyle = '#ff69b4';
        ctx.beginPath();
        ctx.moveTo(fx + 3,      GROUND_Y - 72);
        ctx.lineTo(fx + 3 + 28, GROUND_Y - 72 + wave);
        ctx.lineTo(fx + 3 + 28, GROUND_Y - 72 + 18 + wave * 0.6);
        ctx.lineTo(fx + 3,      GROUND_Y - 72 + 18);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillStyle = '#e91e8c';
        ctx.fillRect(fx + 3, GROUND_Y - 72, 28, 18);
        drawText(ctx, `CP${ci + 1}`, fx + 17, GROUND_Y - 57,
          { size: 6, align: 'center', color: '#fff8f0' });
      }
    }
    ctx.restore();

    // ── Win overlay ──
    if (state.won && state.winTimer < 60) {
      ctx.globalAlpha = state.winTimer / 60 * 0.5;
      ctx.fillStyle = P.pinkPale;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  },

  destroy() {},
  onComplete() {},
};

// ─────────────────────────────────────────────────────────────
// ENEMY UPDATE
// ─────────────────────────────────────────────────────────────
function updateEnemy(en, pl, G, platforms) {
  const solidPlats = platforms.filter(p => p.type !== 'cloud' && !p.broken);

  if (en.type === 'puffball') {
    en.vx = -en.dir * 1.2;
    applyGravity(en);
    resolvePlatforms(en, solidPlats);
    const aheadX = en.x + en.w * en.dir;
    const onEdge = !solidPlats.some(p =>
      aheadX > p.x && aheadX < p.x + p.w && en.y + en.h >= p.y && en.y + en.h <= p.y + 20
    );
    if ((en.onGround && onEdge) || en.x < 0 || en.x + en.w > WORLD_W) en.dir *= -1;

  } else if (en.type === 'hopper') {
    applyGravity(en);
    resolvePlatforms(en, solidPlats);
    en.hopTimer++;
    if (en.onGround && en.hopTimer > 60) {
      en.vy = -10; en.vx = (pl.x > en.x ? 1 : -1) * 2.4;
      en.hopTimer = 0; G.particles.bubbles(en.x + 12, en.y, 2);
    }

  } else if (en.type === 'shadow') {
    en.chargeTimer++;
    const dist      = Math.abs(pl.x - en.x);
    const inZone34  = en.x > 2000;

    if (dist < 220 && en.chargeTimer > 70) {
      en.vx = (pl.x > en.x ? 1 : -1) * (en.chargeSpeed ?? 4.5);
      en.chargeTimer = 0;
      en.charging    = true;
    } else {
      en.vx *= 0.88;
      if (Math.abs(en.vx) < 0.5) en.charging = false;
    }

    // Dark trail particles for Zone 3+ shadows while charging
    if (en.charging && inZone34 && Math.abs(en.vx) > 1) {
      en.trail.push({ x: en.x, y: en.y, alpha: 0.55 });
    }
    for (const t of en.trail) t.alpha -= 0.045;
    en.trail = en.trail.filter(t => t.alpha > 0);

    applyGravity(en);
    resolvePlatforms(en, solidPlats);
  }

  if (!aabbOverlap(pl, en)) return;

  if (en.type === 'shadow') {
    if (pl.starTimer > 0) { en.alive = false; G.score += 50; SFX.stomp(); return; }
    if (pl.hurtFlash === 0) { G.playerDied(); pl.hurtFlash = 60; pl.vy = -6; }
    return;
  }

  if (pl.vy > 0 && pl.y + pl.h < en.y + en.h * 0.6) {
    en.alive = false; pl.vy = JUMP_FORCE * 0.5; G.score += 50; SFX.stomp();
    G.particles.stars(en.x + en.w / 2, en.y, 5);
  } else if (pl.starTimer > 0) {
    en.alive = false; G.score += 50; SFX.stomp();
  } else if (pl.hurtFlash === 0) {
    G.playerDied(); pl.hurtFlash = 60; pl.vy = -6; pl.vx = -(pl.vx) * 2;
  }
}

// ─────────────────────────────────────────────────────────────
// STATIC BOMB UPDATE
// ─────────────────────────────────────────────────────────────
function updateStaticBombs(bombs, scorchMarks, pl, G) {
  for (const b of bombs) {
    if (!b.alive) continue;

    if (b.exploding) {
      b.explodeTimer++;
      if (b.explodeTimer > 28) {
        b.alive = false;
        scorchMarks.push({ x: b.x, y: b.y, r: 18, timer: 300 });
      }
      continue;
    }

    const dx = pl.x + pl.w / 2 - b.x;
    const dy = pl.y + pl.h / 2 - b.y;

    // Trigger fuse when player enters 80px radius
    if (!b.triggered && Math.hypot(dx, dy) < 80) {
      b.triggered = true;
    }

    if (b.triggered) {
      b.fuseCountdown--;
      if (b.fuseCountdown <= 0) {
        b.exploding    = true;
        b.explodeTimer = 0;
        G.particles.confetti(b.x, b.y);
        G.particles.stars(b.x, b.y, 4);
        // Explosion deals 1 life within 60px radius
        if (Math.hypot(dx, dy) < 60 && pl.hurtFlash === 0 && pl.starTimer === 0) {
          G.playerDied();
          pl.hurtFlash = 60;
          pl.vy = -8;
          pl.vx = (dx < 0 ? -1 : 1) * 4;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// DRAW HELPERS
// ─────────────────────────────────────────────────────────────
function drawBg(ctx, cam) {
  if (_bgImg.complete && _bgImg.naturalWidth) {
    const scale    = (H - HUD_H) / _bgImg.naturalHeight;
    const scaledW  = Math.ceil(_bgImg.naturalWidth * scale);
    const parallaxX = (cam * 0.35) % scaledW;
    for (let sx = -parallaxX; sx < W + scaledW; sx += scaledW)
      ctx.drawImage(_bgImg, sx, HUD_H, scaledW, H - HUD_H);
  } else {
    const grad = ctx.createLinearGradient(0, HUD_H, 0, H);
    grad.addColorStop(0, '#0d1117'); grad.addColorStop(0.6, '#1a2030'); grad.addColorStop(1, '#1f1a10');
    ctx.fillStyle = grad; ctx.fillRect(0, HUD_H, W, H - HUD_H);
  }
  ctx.fillStyle = 'rgba(8,12,22,0.20)'; ctx.fillRect(0, HUD_H, W, H - HUD_H);

  // Near background layer — dark abyss cutouts aligned with pit openings
  for (const pit of TOXIC_PITS) {
    const pitBgX = pit.x - cam * 0.82;
    ctx.fillStyle = '#05020a';
    ctx.fillRect(pitBgX, GROUND_Y - 12, pit.width, H - GROUND_Y + 20);
  }

  drawRain(ctx);
}

function drawToxicPits(ctx, cam, frame) {
  for (const pit of TOXIC_PITS) {
    const px = pit.x;
    const pw = pit.width;
    const py = GROUND_Y;
    const depth = H - py + 10;

    // Pit side walls
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px - 6, py, 6, depth);
    ctx.fillRect(px + pw, py, 6, depth);

    // Warning stripes on both edges (diagonal, 8px wide)
    drawWarningStripes(ctx, px - 8, py, 16, 10);
    drawWarningStripes(ctx, px + pw - 8, py, 16, 10);

    // Toxic liquid gradient fill
    const grd = ctx.createLinearGradient(px, py, px, py + depth);
    grd.addColorStop(0,    '#39ff14');
    grd.addColorStop(0.25, '#2de00f');
    grd.addColorStop(1,    '#0a4002');
    ctx.fillStyle = grd;
    ctx.fillRect(px, py, pw, depth);

    // Glowing surface shimmer
    ctx.fillStyle = 'rgba(57,255,20,0.40)';
    ctx.fillRect(px, py, pw, 6);
    ctx.fillStyle = 'rgba(204,255,0,0.22)';
    ctx.fillRect(px, py + 2, pw, 3);

    // Animated bubbles (3–4 per pit depending on width)
    const nBubbles = Math.min(4, Math.max(3, Math.floor(pw / 50)));
    for (let i = 0; i < nBubbles; i++) {
      const bx   = px + (i + 0.5) * (pw / nBubbles) + Math.sin(frame * 0.022 + i * 1.8) * 5;
      const rise = (frame * (0.55 + i * 0.18) + i * 22) % 40;
      const by   = py + 38 - rise;
      if (by < py) continue;
      ctx.globalAlpha = Math.max(0, 0.72 - rise / 52);
      ctx.fillStyle   = '#ccff00';
      ctx.beginPath();
      ctx.arc(bx, by, 1.5 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function drawWarningStripes(ctx, x, y, w, h) {
  const sw = 8;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  for (let s = x - h; s < x + w + h; s += sw * 2) {
    ctx.fillStyle = '#ffe066';
    ctx.beginPath();
    ctx.moveTo(s,          y);
    ctx.lineTo(s + sw,     y);
    ctx.lineTo(s + sw + h, y + h);
    ctx.lineTo(s      + h, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1a0a1a';
    ctx.beginPath();
    ctx.moveTo(s + sw,          y);
    ctx.lineTo(s + sw * 2,      y);
    ctx.lineTo(s + sw * 2 + h,  y + h);
    ctx.lineTo(s + sw      + h, y + h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawScorchMarks(ctx, scorchMarks) {
  for (const s of scorchMarks) {
    const alpha = Math.min(0.65, s.timer / 80);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#120500';
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBombs(ctx, bombs, frame) {
  for (const b of bombs) {
    if (!b.alive) continue;

    if (b.exploding) {
      const t  = b.explodeTimer / 28;
      const r  = b.r * (1 + t * 4.5);
      const eg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      eg.addColorStop(0,   `rgba(255,240,100,${1 - t})`);
      eg.addColorStop(0.4, `rgba(255,100,20,${(1 - t) * 0.8})`);
      eg.addColorStop(1,   `rgba(80,20,0,0)`);
      ctx.fillStyle = eg;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.fill();
      // Visible explosion radius hint
      ctx.strokeStyle = `rgba(255,160,20,${(1 - t) * 0.4})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(b.x, b.y, 60, 0, Math.PI * 2); ctx.stroke();
      continue;
    }

    const shakeX = b.triggered
      ? Math.sin(frame * 0.85) * (b.fuseCountdown < 60 ? 2.5 : 1.2)
      : 0;

    // Drop shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(b.x + shakeX, b.y + b.r + 1, b.r * 0.9, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bg = ctx.createRadialGradient(b.x + shakeX - 2, b.y - 2, 1, b.x + shakeX, b.y, b.r);
    bg.addColorStop(0, '#555'); bg.addColorStop(1, '#111');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(b.x + shakeX, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();

    // Fuse cord — shorter and faster when triggered
    const fuseLen   = b.triggered ? 5 + (b.fuseCountdown / b.fuseTime) * 5 : 10;
    const wigSpeed  = b.triggered ? 1.3 : 0.6;
    const wig       = Math.sin(frame * wigSpeed) * 2.5;
    ctx.strokeStyle = '#7a5c20'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(b.x + shakeX, b.y - b.r);
    ctx.quadraticCurveTo(
      b.x + shakeX + wig * 1.5, b.y - b.r - fuseLen * 0.5,
      b.x + shakeX + wig,       b.y - b.r - fuseLen
    );
    ctx.stroke();

    // Spark — faster flicker and orange when triggered
    const sparkRate  = b.triggered ? 2 : 4;
    const sparkColor = b.triggered ? '#ff6600' : '#ffcc00';
    if (frame % sparkRate < Math.ceil(sparkRate / 2)) {
      ctx.fillStyle = sparkColor;
      ctx.beginPath();
      ctx.arc(b.x + shakeX + wig, b.y - b.r - fuseLen, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(b.x + shakeX + wig, b.y - b.r - fuseLen, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawPlatform(ctx, plat, frame) {
  const { x, y, w, h, type, crumbleTimer, triggered } = plat;

  if (type === 'cloud') {
    ctx.fillStyle   = 'rgba(220,235,255,0.82)';
    ctx.strokeStyle = 'rgba(180,210,255,0.60)';
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 8); ctx.fill(); ctx.stroke();
    return;
  }

  let ox = 0;
  if (type === 'crumble' && triggered)
    ox = Math.sin(frame * 1.5) * (crumbleTimer < 20 ? 2 : 0);

  // Rock top
  if (_rockTop) {
    const tw = _rockTop.width;
    for (let tx = x + ox; tx < x + ox + w; tx += tw) ctx.drawImage(_rockTop, tx, y);
  } else {
    ctx.fillStyle = '#5a5248'; ctx.fillRect(x + ox, y, w, 8);
  }
  // Rock front
  const frontH = h - 8;
  if (_rockFront && frontH > 0) {
    const tw = _rockFront.width, fh = _rockFront.height;
    for (let ty = y + 8; ty < y + h; ty += fh)
      for (let tx = x + ox; tx < x + ox + w; tx += tw) ctx.drawImage(_rockFront, tx, ty);
  } else {
    ctx.fillStyle = '#3c3028'; ctx.fillRect(x + ox, y + 8, w, frontH);
  }

  ctx.strokeStyle = '#12100c'; ctx.lineWidth = 1;
  ctx.strokeRect(x + ox + 0.5, y + 0.5, w - 1, h - 1);

  if (type === 'moving') {
    ctx.fillStyle = 'rgba(255,160,50,0.75)'; ctx.fillRect(x + ox + 2, y + 1, w - 4, 2);
    ctx.fillStyle = 'rgba(255,200,100,0.4)'; ctx.fillRect(x + ox + 4, y,     w - 8, 1);
  }
  if (type === 'crumble' && triggered && crumbleTimer < 50) {
    ctx.fillStyle = `rgba(255,200,100,${(1 - crumbleTimer / 50) * 0.85})`;
    ctx.fillRect(x + ox, y, w, h);
  }
}

function drawPlayer(ctx, pl, frame) {
  let animState;
  if      (pl.hurtFlash > 40)    animState = 'hurt';
  else if (!pl.onGround)          animState = 'jump';
  else if (Math.abs(pl.vx) > 0.5) animState = 'walk';
  else                             animState = 'idle';
  drawPlayerAnim(ctx, animState, frame, pl.x + pl.w / 2, pl.y + pl.h, pl.facing === 1);
}

function drawEnemy(ctx, en) {
  // Shadow trail for Zone 3+ shadow enemies
  if (en.trail && en.trail.length > 0) {
    ctx.save();
    for (const t of en.trail) {
      ctx.globalAlpha = t.alpha;
      ctx.fillStyle   = '#1a0a2e';
      ctx.fillRect(t.x, t.y, en.w, en.h);
    }
    ctx.restore();
  }
  const flipX = en.type === 'shadow' ? en.vx < 0 : (en.vx || en.dir) > 0;
  drawSprite(ctx, en.type, en.x + en.w / 2, en.y + en.h / 2, flipX);
}

function drawHeartItem(ctx, x, y) {
  ctx.fillStyle = P.hotMagenta; ctx.strokeStyle = P.darkOutline; ctx.lineWidth = 2;
  const s = 8;
  ctx.beginPath();
  ctx.moveTo(x + s, y + s * 0.4);
  ctx.bezierCurveTo(x + s, y,       x,     y,       x,     y + s * 0.4);
  ctx.bezierCurveTo(x,     y + s * 0.8, x + s, y + s * 1.3, x + s, y + s * 1.3);
  ctx.bezierCurveTo(x + s, y + s * 1.3, x + s * 2, y + s * 0.8, x + s * 2, y + s * 0.4);
  ctx.bezierCurveTo(x + s * 2, y,    x + s, y,       x + s, y + s * 0.4);
  ctx.fill(); ctx.stroke();
}

function drawTower(ctx, x, groundY) {
  // GURGAON skyscraper — tall glass office tower
  const tw = 90;
  const th = 420;
  const flH = 13;   // floor height
  const mid = x + tw / 2;

  // Foundation slab
  ctx.fillStyle = '#1a1a20';
  ctx.fillRect(x - 8, groundY - 8, tw + 16, 8);

  // Main tower body (dark glass tint)
  ctx.fillStyle = '#121824';
  ctx.fillRect(x, groundY - th, tw, th);

  // Floor-by-floor windows
  const floors = Math.floor(th / flH);
  for (let i = 0; i < floors; i++) {
    const fy = groundY - th + i * flH;
    // Spandrel (structural band)
    ctx.fillStyle = '#1e2a3a';
    ctx.fillRect(x + 2, fy, tw - 4, 3);
    // Glass pane — every 4th floor slightly brighter (lit office)
    const lit = i % 4 === 1;
    ctx.fillStyle = lit ? 'rgba(140,200,255,0.32)' : 'rgba(90,150,220,0.18)';
    ctx.fillRect(x + 4, fy + 3, tw - 8, flH - 4);
    // Mullion dividers
    ctx.fillStyle = '#1a2535';
    ctx.fillRect(x + tw / 3 | 0, fy + 3, 2, flH - 4);
    ctx.fillRect(x + (tw * 2 / 3) | 0, fy + 3, 2, flH - 4);
  }

  // Structural steel columns on each edge + center
  ctx.fillStyle = '#1c2d40';
  ctx.fillRect(x,           groundY - th, 7, th);
  ctx.fillRect(x + tw - 7,  groundY - th, 7, th);
  ctx.fillRect(mid - 3,     groundY - th, 6, th);

  // Entrance arch
  ctx.fillStyle = '#080d14';
  ctx.fillRect(mid - 16, groundY - 42, 32, 42);
  ctx.fillStyle = 'rgba(120,180,255,0.22)';
  ctx.fillRect(mid - 14, groundY - 40, 28, 38);

  // Mechanical floor setback near top
  const setY = groundY - th + 55;
  ctx.fillStyle = '#1c2d40';
  ctx.fillRect(x - 4, setY, tw + 8, 8);
  ctx.fillStyle = '#0f1a28';
  ctx.fillRect(x - 4, setY, tw + 8, 3);

  // Rooftop equipment box
  ctx.fillStyle = '#1a2535';
  ctx.fillRect(mid - 12, groundY - th - 18, 24, 18);
  ctx.fillStyle = 'rgba(90,150,220,0.25)';
  ctx.fillRect(mid - 10, groundY - th - 16, 20, 14);

  // Antenna spire
  ctx.fillStyle = '#8a8a9a';
  ctx.fillRect(mid - 2, groundY - th - 75, 4, 57);
  // Aircraft warning light (red, blinks via draw call will just be static)
  ctx.fillStyle = '#dd2200';
  ctx.beginPath();
  ctx.arc(mid, groundY - th - 75, 4, 0, Math.PI * 2);
  ctx.fill();

  // Tower outline
  ctx.strokeStyle = '#0a0f1a';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, groundY - th, tw, th);
}

export default Level4;
