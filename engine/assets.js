// engine/assets.js — Sprite generation (procedural pixel art + PNG sprite sheet)

import { PALETTE } from '../config.js';

const P = PALETTE;

// ─── PLAYER PNG SPRITE SHEET ──────────────────────────────────────────────────
// Sheet: 3426×313 px.  All x/y/w/h measured from pixel content in the PNG.
// Frames 1-3: walk LEFT  | 4-6: fight-hurt LEFT (level 1 only)
// Frames 7-9: punch+hurt LEFT | gap | 10-12: walk RIGHT (new additions)
// All frames 1-9 face left; frames 10-12 face right.
// → walk/idle/jump RIGHT use frames 10-12 (no flip).
// → punch/hurt RIGHT flip frames 7-9 (left→right).

const PLAYER_SHEET_FRAMES = {
  // walk facing LEFT, no flip needed for leftward movement (frames 1-3)
  walkL1:      { x:  112, y: 40, w: 127, h: 249 },
  walkL2:      { x:  350, y: 40, w: 135, h: 249 },
  walkL3:      { x:  594, y: 40, w: 125, h: 249 },
  // fight-hurt cycle, left-facing — ONLY used in Level 1 when player is hit (frames 4-6)
  fightHurt1:  { x:  963, y: 44, w: 127, h: 256 },
  fightHurt2:  { x: 1218, y: 44, w: 126, h: 255 },
  fightHurt3:  { x: 1458, y: 44, w: 126, h: 256 },
  // punch + generic hurt, left-facing — flip to get right-facing (frames 7-9)
  punchL1:     { x: 1896, y: 31, w: 201, h: 240 },
  punchL2:     { x: 2102, y: 31, w: 198, h: 239 },
  hurtL:       { x: 2406, y: 31, w: 121, h: 243 },
  // walk facing RIGHT, no flip needed for rightward movement (frames 10-12)
  walkR1:      { x: 2707, y: 40, w: 125, h: 249 },
  walkR2:      { x: 2941, y: 40, w: 135, h: 249 },
  walkR3:      { x: 3187, y: 40, w: 127, h: 249 },
};

// Direction-specific animation sequences.
// Left states use frames 1-3 (walkL)  → no flip.
// Right states use frames 10-12 (walkR) → no flip.
// fight_hurt RIGHT uses left frames 4-6 → flipped in drawPlayerAnim (level 1 only).
const PLAYER_ANIM_SEQ = {
  idle_left:        ['walkL1'],
  walk_left:        ['walkL1', 'walkL2', 'walkL3'],
  punch_left:       ['punchL1', 'punchL2'],
  hurt_left:        ['walkL1'],
  fight_hurt_left:  ['fightHurt1', 'fightHurt2', 'fightHurt3'],
  jump_left:        ['walkL1'],

  idle_right:       ['walkR1'],
  walk_right:       ['walkR1', 'walkR2', 'walkR3'],
  punch_right:      ['punchL1', 'punchL2'],
  hurt_right:       ['walkR1'],
  fight_hurt_right: ['fightHurt1', 'fightHurt2', 'fightHurt3'],  // flipped in drawPlayerAnim
  jump_right:       ['walkR1'],
};

// Playback speed in animation-frames per second (0 = hold first frame).
const PLAYER_ANIM_FPS = {
  idle_left: 0,  walk_left: 10,  punch_left: 10, hurt_left: 0,  fight_hurt_left: 8,  jump_left: 0,
  idle_right: 0, walk_right: 10, punch_right: 10, hurt_right: 0, fight_hurt_right: 8, jump_right: 0,
};

// Display height on canvas (px).  Width scales proportionally per frame.
const SPRITE_DISPLAY_H = 72;

// Load the sheet immediately so it's ready well before the first PLAYING frame.
const _playerSheet = new Image();
_playerSheet.src = 'assets/sprites/player.png';

/**
 * Draw the player using the PNG sprite sheet.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {'idle'|'walk'|'punch'|'hurt'|'jump'} animState
 * @param {number} animTimer   – frames elapsed in this state (or G.frame for cycling)
 * @param {number} cx          – horizontal centre of the collision box
 * @param {number} bottomY     – bottom edge of the collision box (f.y + f.h)
 * @param {boolean} facingRight – true = right (source orientation), false = left
 */
export function drawPlayerAnim(ctx, animState, animTimer, cx, bottomY, facingRight) {
  if (!_playerSheet.complete || !_playerSheet.naturalWidth) return;

  const dir    = facingRight ? 'right' : 'left';
  const seqKey = `${animState}_${dir}`;

  // All LEFT states use frames 1-3 (walkL) → no flip.
  // All RIGHT states use frames 10-12 (walkR) → no flip.
  // Exception: fight_hurt RIGHT uses frames 4-6 (left-facing) → flip.
  const needsFlip = facingRight && (animState === 'fight_hurt' || animState === 'punch');

  const seq = PLAYER_ANIM_SEQ[seqKey] ?? PLAYER_ANIM_SEQ.idle_right;
  const fps = PLAYER_ANIM_FPS[seqKey] ?? 8;

  let frameIdx = 0;
  if (fps > 0) {
    const period = Math.round(60 / fps);   // game-frames per anim-frame
    frameIdx = Math.floor(animTimer / period) % seq.length;
  }

  const f = PLAYER_SHEET_FRAMES[seq[frameIdx]];
  if (!f) return;

  const scale = SPRITE_DISPLAY_H / f.h;
  const dw    = f.w * scale;
  const dh    = SPRITE_DISPLAY_H;

  ctx.save();
  ctx.imageSmoothingEnabled = false;   // keep pixel art crisp when scaling
  ctx.translate(cx, bottomY);
  if (needsFlip) ctx.scale(-1, 1);
  // Anchor: bottom-centre of collision box = canvas origin after translate
  ctx.drawImage(_playerSheet, f.x, f.y, f.w, f.h, -dw / 2, -dh, dw, dh);
  ctx.restore();
}

// Helper: draw a pixel grid sprite
// pixels = 2D array of color strings (null = transparent)
// returns HTMLCanvasElement
function pixelCanvas(pixels, scale = 2) {
  const rows = pixels.length;
  const cols = pixels[0].length;
  const c = document.createElement('canvas');
  c.width  = cols * scale;
  c.height = rows * scale;
  const ctx = c.getContext('2d');
  for (let r = 0; r < rows; r++) {
    for (let cc = 0; cc < cols; cc++) {
      const color = pixels[r][cc];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(cc * scale, r * scale, scale, scale);
    }
  }
  return c;
}

function recolorPixels(pixels, colors) {
  return pixels.map(row => row.map(color => colors[color] || color));
}

// Short color aliases
const B = P.darkOutline, PM = P.pinkMid, PB = P.pinkBright, PD = P.pinkDeep,
      PP = P.pinkPale, SK = P.pinkBlush, HM = P.hotMagenta, Y = P.butter,
      W = P.white, CR = P.coral, MT = P.mint, TK = P.tilePink, TS = P.tileShadow,
      BR = P.midBrown, _ = null;

// ─── PLAYER SPRITE SHEET ─────────────────────────────────────────────────────
// 14×18 per frame, 2px scale → 28×36 per frame
// Frames: 0=idle, 1=walk1, 2=walk2, 3=jump, 4=punch, 5=kick, 6=hurt, 7=block

const PLAYER_FRAMES = [
  // Frame 0: Idle
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,B,PM,PM,PM,PM,PM,PM,PM,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,_,B,B,PM,PM,PM,B,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,B,PM,PM,B,_,B,PM,PM,B,_,_,_,_],
    [_,B,B,B,B,_,B,B,B,B,_,_,_,_],
  ],
  // Frame 1: Walk1 (right leg forward)
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,B,PM,PM,PM,PM,PM,PM,PM,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,_,B,B,PM,PM,PM,B,B,_,_,_,_,_],
    [_,B,PM,PM,B,_,_,B,PM,B,_,_,_,_],
    [_,B,PM,B,_,_,_,B,PM,B,_,_,_,_],
    [B,PM,PM,B,_,_,_,_,B,PM,B,_,_,_],
    [B,PM,B,_,_,_,_,_,B,PM,B,_,_,_],
    [B,PM,PM,B,_,_,_,B,PM,PM,B,_,_,_],
    [B,B,B,B,_,_,_,B,B,B,B,_,_,_],
  ],
  // Frame 2: Walk2 (left leg forward)
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,B,PM,PM,PM,PM,PM,PM,PM,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,B,PD,PM,PM,PM,PM,PM,PD,B,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,_,B,B,PM,PM,PM,B,B,_,_,_,_,_],
    [B,PM,B,_,_,B,PM,PM,B,_,_,_,_,_],
    [B,PM,B,_,_,_,B,PM,B,_,_,_,_,_],
    [_,B,PM,B,_,_,B,PM,PM,B,_,_,_,_],
    [_,B,PM,B,_,_,_,B,PM,B,_,_,_,_],
    [_,B,PM,PM,B,_,B,PM,PM,B,_,_,_,_],
    [_,B,B,B,B,_,B,B,B,B,_,_,_,_],
  ],
  // Frame 3: Jump
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [B,PM,B,PM,PM,PM,PM,PM,B,PM,B,_,_,_],
    [B,PM,PM,PM,PM,PM,PM,PM,PM,PM,B,_,_,_],
    [B,PD,PM,PM,PM,PM,PM,PM,PM,PD,B,_,_,_],
    [_,B,PM,PM,PM,PM,PM,PM,PM,B,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,_,B,B,PM,PM,PM,B,B,_,_,_,_,_],
    [_,_,_,B,PM,_,PM,B,_,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,B,PM,B,_,_,_,B,PM,B,_,_,_,_],
    [_,B,B,_,_,_,_,_,B,B,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
    [_,_,_,_,_,_,_,_,_,_,_,_,_,_],
  ],
  // Frame 4: Punch
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,B,PM,PM,PM,PM,PM,PM,B,SK,B,B,B,_],
    [_,B,PD,PM,PM,PM,PM,B,SK,SK,SK,SK,B],
    [_,B,PD,PM,PM,PM,PM,PM,B,B,B,B,_,_],
    [_,_,B,PM,PM,PM,PM,PM,B,_,_,_,_,_],
    [_,_,B,B,PM,PM,PM,B,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,_,B,PM,B,_,B,PM,B,_,_,_,_,_],
    [_,B,PM,PM,B,_,B,PM,PM,B,_,_,_,_],
    [_,B,B,B,B,_,B,B,B,B,_,_,_,_],
  ],
];

// ─── ENEMY FIGHTER ───────────────────────────────────────────────────────────
// Mirrored colors: coral body, dark hair
const ENEMY_FRAMES = [
  // Frame 0: Idle
  [
    [_,_,_,B,B,B,B,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,B,SK,B,SK,SK,B,B,_,_,_,_,_],
    [_,_,B,SK,SK,SK,SK,SK,B,_,_,_,_,_],
    [_,_,_,B,SK,SK,SK,B,_,_,_,_,_,_],
    [_,_,_,B,B,B,B,B,_,_,_,_,_,_],
    [_,_,B,CR,CR,CR,CR,CR,B,_,_,_,_,_],
    [_,B,CR,CR,CR,CR,CR,CR,CR,B,_,_,_,_],
    [_,B,PD,CR,CR,CR,CR,CR,PD,B,_,_,_,_],
    [_,B,PD,CR,CR,CR,CR,CR,PD,B,_,_,_,_],
    [_,_,B,CR,CR,CR,CR,CR,B,_,_,_,_,_],
    [_,_,B,B,CR,CR,CR,B,B,_,_,_,_,_],
    [_,_,B,CR,B,_,B,CR,B,_,_,_,_,_],
    [_,_,B,CR,B,_,B,CR,B,_,_,_,_,_],
    [_,_,B,CR,B,_,B,CR,B,_,_,_,_,_],
    [_,_,B,CR,B,_,B,CR,B,_,_,_,_,_],
    [_,B,CR,CR,B,_,B,CR,CR,B,_,_,_,_],
    [_,B,B,B,B,_,B,B,B,B,_,_,_,_],
  ],
];

// ─── PUFFBALL ENEMY ──────────────────────────────────────────────────────────
const PUFFBALL = [
  [_,B,B,B,B,B,B,_],
  [B,PB,PB,PB,PB,PB,PB,B],
  [B,PB,W,PB,PB,W,PB,B],
  [B,PB,PB,PB,PB,PB,PB,B],
  [B,PD,PB,PB,PB,PB,PD,B],
  [B,PD,PD,PB,PB,PD,PD,B],
  [_,B,PM,B,B,PM,B,_],
  [_,_,B,B,B,B,_,_],
];

// ─── HOPPER ENEMY ────────────────────────────────────────────────────────────
const HOPPER = [
  [_,B,B,B,B,B,B,_],
  [B,MT,MT,MT,MT,MT,MT,B],
  [B,MT,W,MT,MT,W,MT,B],
  [B,MT,MT,MT,MT,MT,MT,B],
  [B,MT,Y,MT,MT,Y,MT,B],
  [B,MT,MT,MT,MT,MT,MT,B],
  [B,B,MT,B,B,MT,B,B],
  [B,MT,B,_,_,B,MT,B],
];

// ─── SHADOW SPRITE ENEMY ─────────────────────────────────────────────────────
const SHADOW_SPR = [
  [_,_,B,B,B,B,_,_],
  [_,B,'#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a',B,_],
  [B,'#2a1a3a',HM,'#2a1a3a','#2a1a3a',HM,'#2a1a3a',B],
  [B,'#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a',B],
  [_,B,'#2a1a3a','#2a1a3a','#2a1a3a','#2a1a3a',B,_],
  [_,_,B,'#2a1a3a','#2a1a3a',B,_,_],
  [_,_,B,'#2a1a3a','#2a1a3a',B,_,_],
  [_,B,'#2a1a3a',B,B,'#2a1a3a',B,_],
];

// ─── COIN FLOWER ─────────────────────────────────────────────────────────────
const COIN = [
  [_,B,B,B,_],
  [B,Y,Y,Y,B],
  [B,Y,W,Y,B],
  [B,Y,Y,Y,B],
  [_,B,B,B,_],
];

// ─── PRINCESS ────────────────────────────────────────────────────────────────
const PRINCESS = [
  [_,_,B,Y,Y,Y,B,_,_],
  [_,B,Y,Y,Y,Y,Y,B,_],
  [_,B,SK,SK,SK,SK,SK,B,_],
  [_,B,SK,B,SK,B,SK,B,_],
  [_,B,SK,SK,SK,SK,SK,B,_],
  [_,_,B,SK,SK,SK,B,_,_],
  [_,B,PB,PB,PB,PB,PB,B,_],
  [B,PB,PB,PB,PB,PB,PB,PB,B],
  [B,PD,PB,PB,PB,PB,PB,PD,B],
  [B,PD,PB,PB,PB,PB,PB,PD,B],
  [_,B,PB,PB,PB,PB,PB,B,_],
  [_,_,B,B,PB,PB,B,B,_],
  [_,_,_,B,PB,PB,B,_,_],
  [_,_,_,B,PB,PB,B,_,_],
];

// ─── TILES ───────────────────────────────────────────────────────────────────
const TILE_TOP = [
  [TK,TK,TK,TK,TK,TK,TK,TK],
  [TK,PB,PB,TK,TK,PB,PB,TK],
  [TK,PB,TK,TK,TK,TK,PB,TK],
  [TK,TK,TK,TK,TK,TK,TK,TK],
];

const TILE_FRONT = [
  [TS,TS,TS,TS,TS,TS,TS,TS],
  [TS,PD,PD,TS,TS,PD,PD,TS],
  [TS,PD,TS,TS,TS,TS,PD,TS],
  [TS,TS,TS,TS,TS,TS,TS,TS],
  [TS,TS,TS,TS,TS,TS,TS,TS],
  [TS,PD,PD,TS,TS,PD,PD,TS],
  [TS,PD,TS,TS,TS,TS,PD,TS],
  [TS,TS,TS,TS,TS,TS,TS,TS],
];

// ─── HEART ICON (UI) ─────────────────────────────────────────────────────────
const HEART_ICON = [
  [_,B,B,_,_,B,B,_],
  [B,HM,HM,B,B,HM,HM,B],
  [B,HM,HM,HM,HM,HM,HM,B],
  [B,HM,HM,HM,HM,HM,HM,B],
  [_,B,HM,HM,HM,HM,B,_],
  [_,_,B,HM,HM,B,_,_],
  [_,_,_,B,B,_,_,_],
];

// ─── FISH / SWIM PLAYER ──────────────────────────────────────────────────────
const FISH = [
  [_,_,_,_,B,B,_,_],
  [_,B,B,B,PM,PM,B,_],
  [B,PM,PM,PM,PM,W,PM,B],
  [B,PB,PM,PM,PM,PM,PM,B],
  [B,PM,PM,PM,PM,W,PM,B],
  [_,B,B,B,PM,PM,B,_],
  [_,_,_,_,B,B,_,_],
];

// ─── JELLYFISH ────────────────────────────────────────────────────────────────
const SWIMMER = [
  [_,_,_,_,_,_,_,B,B,B,_,_,_],
  [_,_,_,_,_,_,B,SK,SK,SK,B,_,_],
  [_,_,_,_,_,_,B,SK,B,SK,B,_,_],
  [_,_,_,_,_,_,B,SK,SK,SK,B,_,_],
  [_,_,B,B,B,B,B,B,SK,B,_,_,_],
  [_,B,PB,PB,PB,PB,PB,PB,B,B,B,_,_],
  [B,PB,PB,PB,PB,PB,PB,PB,PB,PB,PB,B,_],
  [_,B,B,B,PB,PB,PB,PB,B,B,B,_,_],
  [_,_,_,B,PM,B,_,B,PM,B,_,_,_],
  [_,_,B,PM,B,_,_,_,B,PM,B,_,_],
  [_,B,PM,B,_,_,_,_,_,B,PM,B,_],
  [B,PM,B,_,_,_,_,_,_,_,B,PM,B],
];

const JELLY = [
  [_,B,B,B,B,_],
  [B,MT,MT,MT,MT,B],
  [B,W,MT,MT,W,B],
  [B,MT,MT,MT,MT,B],
  [_,B,MT,MT,B,_],
  [_,_,B,B,_,_],
];

// ─── STAR COLLECTIBLE ────────────────────────────────────────────────────────
const STAR = [
  [_,_,_,B,B,_,_,_],
  [_,_,B,Y,Y,B,_,_],
  [_,B,Y,Y,Y,Y,B,_],
  [B,Y,Y,Y,Y,Y,Y,B],
  [_,B,Y,Y,Y,Y,B,_],
  [_,_,B,Y,Y,B,_,_],
  [_,_,_,B,B,_,_,_],
];

// ─── BUSH DECORATION ─────────────────────────────────────────────────────────
const BUSH = [
  [_,_,B,B,B,B,_,_],
  [_,B,MT,MT,MT,MT,B,_],
  [B,MT,MT,W,MT,MT,MT,B],
  [B,MT,MT,MT,MT,MT,MT,B],
  [B,MT,MT,MT,MT,MT,MT,B],
  [_,B,BR,BR,BR,BR,B,_],
];

// ─── CLOUD ────────────────────────────────────────────────────────────────────
const CLOUD = [
  [_,_,B,B,B,B,_,_,_,_,_,_],
  [_,B,W,W,W,W,B,B,B,B,_,_],
  [B,W,W,W,W,W,W,W,W,W,B,_],
  [B,W,W,W,W,W,W,W,W,W,W,B],
  [B,W,W,W,W,W,W,W,W,W,W,B],
  [_,B,B,B,B,B,B,B,B,B,B,B],
];

// ─── EXPORT ──────────────────────────────────────────────────────────────────
export const Sprites = {};

export function generateSprites() {
  const playerDobok = {
    [PM]: '#f7f4e8',
    [PD]: '#111111',
    [PB]: '#e8e1d2',
  };
  const enemyDobok = {
    [CR]: '#f7f4e8',
    [PD]: '#d7263d',
    [PM]: '#e8e1d2',
  };

  Sprites.playerIdle  = pixelCanvas(recolorPixels(PLAYER_FRAMES[0], playerDobok), 2);
  Sprites.playerWalk1 = pixelCanvas(recolorPixels(PLAYER_FRAMES[1], playerDobok), 2);
  Sprites.playerWalk2 = pixelCanvas(recolorPixels(PLAYER_FRAMES[2], playerDobok), 2);
  Sprites.playerJump  = pixelCanvas(recolorPixels(PLAYER_FRAMES[3], playerDobok), 2);
  Sprites.playerPunch = pixelCanvas(recolorPixels(PLAYER_FRAMES[4], playerDobok), 2);
  Sprites.playerHurt  = pixelCanvas(recolorPixels(PLAYER_FRAMES[0], playerDobok), 2); // reuse idle, tinted

  Sprites.enemyIdle   = pixelCanvas(recolorPixels(ENEMY_FRAMES[0], enemyDobok), 2);

  Sprites.puffball    = pixelCanvas(PUFFBALL, 3);
  Sprites.hopper      = pixelCanvas(HOPPER,   3);
  Sprites.shadow      = pixelCanvas(SHADOW_SPR, 3);

  Sprites.coinFlower  = pixelCanvas(COIN, 3);
  Sprites.starPower   = pixelCanvas(STAR, 3);
  Sprites.princess    = pixelCanvas(PRINCESS, 2);

  Sprites.tileTop     = pixelCanvas(TILE_TOP,   4);
  Sprites.tileFront   = pixelCanvas(TILE_FRONT, 4);

  Sprites.heartIcon   = pixelCanvas(HEART_ICON, 2);
  Sprites.fish        = pixelCanvas(FISH, 3);
  Sprites.swimmer     = pixelCanvas(SWIMMER, 3);
  Sprites.jelly       = pixelCanvas(JELLY, 3);
  Sprites.cloud       = pixelCanvas(CLOUD, 4);
  Sprites.bush        = pixelCanvas(BUSH, 3);
}

// Draw sprite centered at (cx, cy), optionally flipped
export function drawSprite(ctx, key, cx, cy, flipX = false) {
  const spr = Sprites[key];
  if (!spr) return;
  ctx.save();
  ctx.translate(cx, cy);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(spr, -spr.width / 2, -spr.height / 2);
  ctx.restore();
}
