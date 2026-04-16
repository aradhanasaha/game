// levels/level2-swim.js — The Deep  (Flappy-Bird style swim)

import { CONFIG, PALETTE as P } from '../config.js';
import { drawText, W, H } from '../engine/renderer.js';
import { Sprites } from '../engine/assets.js';
import { SFX } from '../engine/audio.js';
import { isUp } from '../engine/input.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const PLAY_Y1 = 36;           // top of playfield (below HUD)
const PLAY_H  = H - PLAY_Y1;  // height of playfield
const PL_W    = 30;
const PL_H    = 24;
const PL_X    = 110;          // fixed horizontal position

const SWIM_DRAW_W = 56;
const SWIM_DRAW_H = 72;

const GRAVITY   = 0.33;
const FLAP_VY   = -6.3;       // upward impulse on each tap
const FALL_CAP  = 9;          // terminal downward velocity

const SPD_INIT  = 3.0;
const SPD_MAX   = 5.5;   // capped lower so end isn't as frantic

const SWIM_FRAMES = {
  swim1: { x: 77,  y: 17, w: 274, h: 344 },
  swim2: { x: 393, y: 5,  w: 269, h: 367 },
  swim3: { x: 703, y: 3,  w: 263, h: 358 },
};

const SWIM_ANIMATION = ['swim1', 'swim2', 'swim3'];
const SWIM_ANIM_FPS = 6;

const swimSheet = new Image();
swimSheet.src = 'assets/sprites/player-swim.png';

// Stop spawning pillars near the finish, but keep smaller hazards into the final stretch.
const CLEAR_MARGIN = Math.round(W * 0.5);  // pillars stop a bit earlier
const HAZARD_CLEAR_MARGIN = 80;
const FINAL_STRETCH_AT = 0.84;  // intensification kicks in later (was 0.72)

let state = {};

function rand(a, b) {
  return a + Math.floor(Math.random() * (b - a + 1));
}

// ── Level module ──────────────────────────────────────────────────────────────
const Level2 = {
  init(G) {
    G._l2_prevFlap = false;

    const raceLen = CONFIG.l2_progress_goal * 12 + 7200; // ~4800 + 7200 ≈ 38–42 s (20 s longer)

    state = {
      pl: {
        x: PL_X,
        y: PLAY_Y1 + PLAY_H / 2 - PL_H / 2,
        w: PL_W, h: PL_H,
        vy: 0,
      },
      speed:         SPD_INIT,
      gap:           CONFIG.l2_initial_gap + 30,  // start a bit wider (170 px)
      spawnInterval: 72,
      spawnTimer:    62,   // delay the very first pillar
      obstacles:     [],
      hazardTimer:   92,
      hazards:       [],
      progress:      0,
      raceLen,
      hitCooldown:   0,
      fc:            0,
      bgOff:         0,
      seaweedOff:    0,
      bio:           [],
      lifeItems:     [],
      pillarCount:   0,
    };

    // Seed bioluminescent background dots
    for (let i = 0; i < 55; i++) {
      state.bio.push({
        x:     Math.random() * W,
        y:     PLAY_Y1 + Math.random() * PLAY_H,
        r:     1 + Math.random() * 2.5,
        phase: Math.random() * Math.PI * 2,
        sf:    0.15 + Math.random() * 0.45,  // parallax scroll factor
      });
    }
  },

  // ── Update ──────────────────────────────────────────────────────────────────
  update(G) {
    const fc = ++state.fc;
    const pl  = state.pl;

    // Difficulty ramp (gentler curve)
    state.speed         = Math.min(SPD_MAX, SPD_INIT + fc * 0.0013);
    state.gap           = Math.max(CONFIG.l2_min_gap + 14,
                            (CONFIG.l2_initial_gap + 20) - fc * 0.026);
    const _pct = state.progress / state.raceLen;
    const _spawnFloor = _pct > 0.55 ? 42 + (_pct - 0.55) * 240 : 42;
    state.spawnInterval = Math.max(_spawnFloor, 80 - fc * 0.022);

    // Flappy-Bird physics (edge-triggered).
    const flapNow = isUp(G);
    if (flapNow && !G._l2_prevFlap) {
      pl.vy = FLAP_VY;
      G.particles.bubbles(pl.x + pl.w / 2, pl.y + pl.h / 2, 3);
    }
    G._l2_prevFlap = flapNow;

    pl.vy = Math.min(pl.vy + GRAVITY, FALL_CAP);
    pl.y += pl.vy;

    // ── Wall collision (top / bottom) ─────────────────────────────────────
    if (state.hitCooldown === 0) {
      if (pl.y < PLAY_Y1 || pl.y + pl.h > H) {
        triggerHit(G, pl);
        if (G.state === 'GAME_OVER') return;
      }
    }
    // Always clamp so the sprite can't leave the screen
    pl.y = Math.max(PLAY_Y1, Math.min(H - pl.h, pl.y));

    // ── Spawn pillars (only while far from finish) ────────────────────────
    if (state.raceLen - state.progress > CLEAR_MARGIN) {
      if (--state.spawnTimer <= 0) {
        state.spawnTimer = state.spawnInterval;
        spawnPillar();
      }
    }

    if (state.raceLen - state.progress > HAZARD_CLEAR_MARGIN) {
      if (--state.hazardTimer <= 0) {
        const finalStretch = state.progress / state.raceLen > FINAL_STRETCH_AT;
        state.hazardTimer = finalStretch ? rand(50, 80) : rand(58, 94);
        spawnHazard(finalStretch);
      }
    }

    // ── Move + cull pillars ───────────────────────────────────────────────
    state.obstacles = state.obstacles.filter(ob => {
      ob.x -= state.speed;
      if (ob.drift) {
        ob.gapY = Math.max(PLAY_Y1 + 20,
                  Math.min(H - ob.gap - 20,
                           ob.gapY + ob.drift));
      }
      return ob.x + ob.w > -10;
    });

    state.hazards = state.hazards.filter(hz => {
      hz.x -= state.speed * hz.speedMul;
      hz.phase += 0.08;
      return hz.x + hz.w > -20;
    });

    // ── Life bubbles ──────────────────────────────────────────────────────
    state.lifeItems = state.lifeItems.filter(b => {
      b.x    -= state.speed;
      b.phase = (b.phase || 0) + 0.07;
      if (!b.collected) {
        const by = b.y + Math.sin(b.phase) * 4;
        const cx = b.x + b.r, cy = by + b.r;
        const pcx = pl.x + pl.w / 2, pcy = pl.y + pl.h / 2;
        if (Math.hypot(cx - pcx, cy - pcy) < b.r + 14) {
          b.collected = true;
          if (G.lives < 5) G.lives++;
          SFX.coin();
          G.particles.hearts(cx, cy, 5);
        }
      }
      return b.x + b.r * 2 > -10 && !b.collected;
    });

    // ── Pillar collision ──────────────────────────────────────────────────
    if (state.hitCooldown > 0) {
      state.hitCooldown--;
    } else {
      let hitThisFrame = false;
      for (const ob of state.obstacles) {
        if (pillarHit(pl, ob)) {
          triggerHit(G, pl);
          if (G.state === 'GAME_OVER') return;
          hitThisFrame = true;
          break;
        }
      }
      if (!hitThisFrame) {
        for (const hz of state.hazards) {
          if (hazardHit(pl, hz)) {
            triggerHit(G, pl);
            if (G.state === 'GAME_OVER') return;
            break;
          }
        }
      }
    }

    // ── Progress & win ────────────────────────────────────────────────────
    state.progress += state.speed;
    if (state.progress >= state.raceLen) {
      G.levelComplete(250);
      return;
    }

    // ── Parallax ──────────────────────────────────────────────────────────
    state.bgOff      = (state.bgOff      + state.speed * 0.18) % W;
    state.seaweedOff = (state.seaweedOff + state.speed * 0.85) % 64;
    for (const bp of state.bio) {
      bp.x -= bp.sf * state.speed;
      if (bp.x < -6) bp.x = W + 6;
    }

    // Bubble trail behind player
    if (fc % 10 === 0) G.particles.bubbles(pl.x + pl.w, pl.y + pl.h / 2, 1);
  },

  // ── Draw ────────────────────────────────────────────────────────────────────
  draw(G, ctx) {
    drawBg(ctx, state);

    // Obstacles and hazards vanish at/past the finish line
    const finishScreenX = PL_X + (state.raceLen - state.progress);
    for (const ob of state.obstacles) {
      if (ob.x >= finishScreenX) continue;
      drawPillar(ctx, ob, G.frame);
    }
    for (const hz of state.hazards) {
      if (hz.x >= finishScreenX) continue;
      drawHazard(ctx, hz, G.frame);
    }

    drawFinish(ctx, state);

    // Life bubbles
    for (const b of state.lifeItems) drawLifeBubble(ctx, b, G.frame);

    // Player — flash every 4 frames during invincibility window
    const pl    = state.pl;
    const flash = state.hitCooldown > 0 && Math.floor(G.frame / 4) % 2 === 1;
    if (!flash) {
      if (swimSheet.complete && swimSheet.naturalWidth) {
        drawSwimPlayer(ctx, pl, state.fc);
      } else {
        ctx.save();
        ctx.translate(pl.x + pl.w / 2, pl.y + pl.h / 2);
        ctx.fillStyle   = P.pinkMid;
        ctx.strokeStyle = P.darkOutline;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, pl.w / 2, pl.h / 2, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        ctx.restore();
      }
    }

    // Control hint
    if (state.fc < 180) {
      drawText(ctx, 'TAP \u2191 / SPACE TO SWIM', W / 2, H - 18, {
        size: 7, align: 'center', color: P.mint,
      });
    }

    drawGauge(ctx, state);
  },

  destroy(G) { G._l2_prevFlap = false; },
  onComplete(G) {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function drawSwimPlayer(ctx, pl, frameCount) {
  const period = Math.round(60 / SWIM_ANIM_FPS);
  const frameKey = SWIM_ANIMATION[Math.floor(frameCount / period) % SWIM_ANIMATION.length];
  const f = SWIM_FRAMES[frameKey];

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(pl.x + pl.w / 2, pl.y + pl.h / 2);
  ctx.rotate(Math.max(-0.18, Math.min(0.18, pl.vy * 0.035)));
  ctx.drawImage(
    swimSheet,
    f.x, f.y, f.w, f.h,
    -SWIM_DRAW_W / 2, -SWIM_DRAW_H / 2,
    SWIM_DRAW_W, SWIM_DRAW_H
  );
  ctx.restore();
}

function triggerHit(G, pl) {
  state.hitCooldown = 90;
  state.progress    = Math.max(0, Math.floor(state.progress * 0.92));
  // Reset to center so the player can recover
  pl.y  = PLAY_Y1 + PLAY_H / 2 - pl.h / 2;
  pl.vy = -1.5;  // small upward nudge so gravity doesn't immediately re-kill
  SFX.splash();
  G.particles.bubbles(pl.x + pl.w / 2, pl.y + pl.h / 2, 8);
  G.playerDied();
}

function spawnPillar() {
  const gap = state.gap;
  const minY = PLAY_Y1 + 26;
  const maxY = H - gap - 26;
  const gapY = minY + Math.random() * (maxY - minY);

  // Drifting gap kicks in later and more gently
  const drift = state.fc > 650 && Math.random() < 0.12
    ? (Math.random() - 0.5) * 0.9
    : 0;

  state.obstacles.push({
    x:    W + 48,
    w:    48,
    gapY,
    gap,
    drift,
    coral: Math.random() < 0.38,
  });

  // Life bubble: spawn one inside this gap every 5 pillars
  state.pillarCount = (state.pillarCount || 0) + 1;
  if (state.pillarCount % 5 === 0) {
    const bx = W + 48 + 24 - 9;  // centred in pipe
    const by = gapY + gap / 2 - 9;
    state.lifeItems.push({ x: bx, y: by, r: 9, collected: false, phase: Math.random() * Math.PI * 2 });
  }

}

function spawnHazard(finalStretch) {
  const roll = Math.random();
  if (finalStretch && roll < 0.25) {
    spawnMineField();
  } else if (roll < 0.55) {
    spawnBomb(W + 54, PLAY_Y1 + 48 + Math.random() * (PLAY_H - 96));
  } else {
    spawnSpike(W + 54, Math.random() < 0.5 ? 'top' : 'bottom');
  }
}

function spawnMineField() {
  const baseX = W + 60;
  const laneTop = PLAY_Y1 + 58;
  const laneMid = PLAY_Y1 + PLAY_H * 0.5;
  const laneBot = H - 62;
  const pattern = Math.random() < 0.5
    ? [laneTop, laneBot, laneMid]
    : [laneMid - 54, laneMid + 54, Math.random() < 0.5 ? laneTop : laneBot];

  pattern.forEach((y, i) => {
    if (i === 2 && Math.random() < 0.45) {
      spawnSpike(baseX + i * 78, y < laneMid ? 'top' : 'bottom');
    } else {
      spawnBomb(baseX + i * 78, y);
    }
  });
}

function spawnBomb(x, y) {
  state.hazards.push({
    type: 'bomb',
    x,
    y,
    w: 30,
    h: 30,
    r: 13,
    speedMul: 1.05,
    phase: Math.random() * Math.PI * 2,
  });
}

function spawnSpike(x, side) {
  const h = rand(42, 68);
  state.hazards.push({
    type: 'spike',
    x,
    y: side === 'top' ? PLAY_Y1 : H - h,
    w: 42,
    h,
    side,
    speedMul: 1,
    phase: Math.random() * Math.PI * 2,
  });
}

function pillarHit(pl, ob) {
  if (pl.x + pl.w <= ob.x || pl.x >= ob.x + ob.w) return false;
  if (pl.y          < ob.gapY)            return true;  // top block
  if (pl.y + pl.h   > ob.gapY + ob.gap)   return true;  // bottom block
  return false;
}

function hazardHit(pl, hz) {
  if (hz.type === 'bomb') {
    const cx = hz.x + hz.w / 2;
    const cy = hz.y + Math.sin(hz.phase) * 5;
    const closestX = Math.max(pl.x, Math.min(cx, pl.x + pl.w));
    const closestY = Math.max(pl.y, Math.min(cy, pl.y + pl.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy < hz.r * hz.r;
  }

  const inset = 8;
  return !(
    pl.x + pl.w < hz.x + inset ||
    pl.x > hz.x + hz.w - inset ||
    pl.y + pl.h < hz.y + inset ||
    pl.y > hz.y + hz.h - inset
  );
}

// ── Background ────────────────────────────────────────────────────────────────
function drawBg(ctx, s) {
  ctx.fillStyle = '#06121e';
  ctx.fillRect(0, PLAY_Y1, W, PLAY_H);

  const grad = ctx.createLinearGradient(0, PLAY_Y1, 0, H);
  grad.addColorStop(0,   'rgba(10,45,65,0.88)');
  grad.addColorStop(0.6, 'rgba(0,70,80,0.72)');
  grad.addColorStop(1,   'rgba(0,30,45,0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, PLAY_Y1, W, PLAY_H);

  // Seaweed (near layer)
  ctx.fillStyle = '#185c38';
  for (let x = -(s.seaweedOff | 0); x < W + 64; x += 64) {
    for (let hh = 28; hh < 80; hh += 12) {
      ctx.fillRect(x + hh * 0.28, H - hh, 5, hh);
    }
  }

  // Surface shimmer
  ctx.fillStyle = 'rgba(135,206,235,0.12)';
  for (let x = -(s.bgOff | 0); x < W; x += 80) ctx.fillRect(x, PLAY_Y1, 50, 5);
  ctx.fillStyle = P.skyBlue;
  ctx.fillRect(0, PLAY_Y1, W, 3);

  // Bioluminescent dots
  for (const bp of s.bio) {
    const alpha = 0.22 + Math.sin(bp.phase + s.fc * 0.027) * 0.18;
    ctx.fillStyle = `rgba(168,230,207,${alpha.toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Pillar ─────────────────────────────────────────────────────────────────────
// All obstacles render as realistic pixel-art pipes.
function drawPillar(ctx, ob, _frame) {
  const { x, w, gapY, gap } = ob;
  const topH = gapY - PLAY_Y1;
  const botY = gapY + gap;
  const botH = H - botY;

  drawPipeSegment(ctx, x, w, PLAY_Y1, topH, true);
  drawPipeSegment(ctx, x, w, botY,    botH, false);

  // Subtle gap glow
  ctx.fillStyle = 'rgba(100,200,255,0.04)';
  ctx.fillRect(x, gapY, w, gap);
}

// Draws one pipe segment (top or bottom pillar half).
// fromTop=true → cap at bottom (opening faces gap); fromTop=false → cap at top.
function drawPipeSegment(ctx, x, w, y, h, fromTop) {
  if (h <= 0) return;

  const capH  = 18;          // height of the lip ring
  const capX  = x - 2;      // lip just barely wider than the body
  const capW  = w + 4;

  // ── Pipe body colors (industrial green, cylinder-shaded) ──
  const bodyBase = '#1a5c22';
  const bodyDark = '#0d3314';
  const bodyLit  = '#2e8c3a';
  const bodyShine= '#3aaa46';

  // ── Cap (lip ring) colors ──
  const capBase  = '#256b2e';
  const capDark  = '#0d3314';
  const capLit   = '#35a040';

  if (fromTop) {
    // Body occupies y → (y + h - capH)
    const bodyH = h - capH;
    if (bodyH > 0) {
      ctx.fillStyle = bodyBase;
      ctx.fillRect(x, y, w, bodyH);
      // Left shadow column
      ctx.fillStyle = bodyDark;
      ctx.fillRect(x, y, 7, bodyH);
      // Right shadow column
      ctx.fillRect(x + w - 7, y, 7, bodyH);
      // Centre highlight stripe
      ctx.fillStyle = bodyLit;
      ctx.fillRect(x + 9, y, 9, bodyH);
      ctx.fillStyle = bodyShine;
      ctx.fillRect(x + 11, y, 4, bodyH);
      // Horizontal seam lines every 24px (pipe sections)
      ctx.fillStyle = bodyDark;
      for (let sy = y + 20; sy < y + bodyH; sy += 24)
        ctx.fillRect(x, sy, w, 2);
    }

    // Cap at bottom (gap-facing end)
    const capY = y + bodyH;
    ctx.fillStyle = capBase;
    ctx.fillRect(capX, capY, capW, capH);
    ctx.fillStyle = capDark;
    ctx.fillRect(capX, capY, 7, capH);
    ctx.fillRect(capX + capW - 7, capY, 7, capH);
    ctx.fillStyle = capLit;
    ctx.fillRect(capX + 9, capY, 10, capH);
    // Opening rim — dark band at bottom of cap
    ctx.fillStyle = '#071a0a';
    ctx.fillRect(capX + 4, capY + capH - 5, capW - 8, 5);
    // Cap top edge highlight
    ctx.fillStyle = '#3aaa46';
    ctx.fillRect(capX, capY, capW, 2);

    // Outline
    ctx.strokeStyle = '#071a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, bodyH > 0 ? bodyH : 0);
    ctx.strokeRect(capX, capY, capW, capH);

  } else {
    // Cap at top (gap-facing end)
    ctx.fillStyle = capBase;
    ctx.fillRect(capX, y, capW, capH);
    ctx.fillStyle = capDark;
    ctx.fillRect(capX, y, 7, capH);
    ctx.fillRect(capX + capW - 7, y, 7, capH);
    ctx.fillStyle = capLit;
    ctx.fillRect(capX + 9, y, 10, capH);
    // Opening rim — dark band at top of cap
    ctx.fillStyle = '#071a0a';
    ctx.fillRect(capX + 4, y, capW - 8, 5);
    // Cap bottom edge highlight
    ctx.fillStyle = '#3aaa46';
    ctx.fillRect(capX, y + capH - 2, capW, 2);

    // Body occupies (y + capH) → (y + h)
    const bodyY = y + capH;
    const bodyH = h - capH;
    if (bodyH > 0) {
      ctx.fillStyle = bodyBase;
      ctx.fillRect(x, bodyY, w, bodyH);
      ctx.fillStyle = bodyDark;
      ctx.fillRect(x, bodyY, 7, bodyH);
      ctx.fillRect(x + w - 7, bodyY, 7, bodyH);
      ctx.fillStyle = bodyLit;
      ctx.fillRect(x + 9, bodyY, 9, bodyH);
      ctx.fillStyle = bodyShine;
      ctx.fillRect(x + 11, bodyY, 4, bodyH);
      ctx.fillStyle = bodyDark;
      for (let sy = bodyY + 20; sy < bodyY + bodyH; sy += 24)
        ctx.fillRect(x, sy, w, 2);
    }

    // Outline
    ctx.strokeStyle = '#071a0a';
    ctx.lineWidth = 2;
    ctx.strokeRect(capX, y, capW, capH);
    if (bodyH > 0) ctx.strokeRect(x, bodyY, w, bodyH);
  }
}

// ── Finish line ───────────────────────────────────────────────────────────────
function drawHazard(ctx, hz, frame) {
  if (hz.type === 'bomb') {
    drawBomb(ctx, hz, frame);
  } else if (hz.type === 'spike') {
    drawSpike(ctx, hz);
  }
}

function drawBomb(ctx, hz, frame) {
  const cx = hz.x + hz.w / 2;
  const cy = hz.y + Math.sin(hz.phase) * 5;
  const pulse = 0.82 + Math.sin(frame * 0.18 + hz.phase) * 0.18;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#151923';
  ctx.strokeStyle = P.darkOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, hz.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#3c4458';
  ctx.fillRect(-3, -hz.r - 5, 8, 7);
  ctx.strokeRect(-3, -hz.r - 5, 8, 7);

  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, -hz.r - 5);
  ctx.quadraticCurveTo(12, -hz.r - 13, 18, -hz.r - 8);
  ctx.stroke();

  ctx.fillStyle = `rgba(255,224,102,${pulse.toFixed(2)})`;
  ctx.fillRect(16, -hz.r - 11, 5, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(-7, -7, 6, 5);
  ctx.restore();
}

function drawSpike(ctx, hz) {
  const points = 4;
  ctx.fillStyle = '#d9dde8';
  ctx.strokeStyle = P.darkOutline;
  ctx.lineWidth = 2;
  ctx.beginPath();

  if (hz.side === 'top') {
    ctx.moveTo(hz.x, hz.y);
    for (let i = 0; i < points; i++) {
      const x0 = hz.x + i * (hz.w / points);
      ctx.lineTo(x0 + hz.w / (points * 2), hz.y + hz.h);
      ctx.lineTo(x0 + hz.w / points, hz.y);
    }
  } else {
    ctx.moveTo(hz.x, hz.y + hz.h);
    for (let i = 0; i < points; i++) {
      const x0 = hz.x + i * (hz.w / points);
      ctx.lineTo(x0 + hz.w / (points * 2), hz.y);
      ctx.lineTo(x0 + hz.w / points, hz.y + hz.h);
    }
  }

  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

// ── Life bubble ───────────────────────────────────────────────────────────────
function drawLifeBubble(ctx, b, frame) {
  const bob = Math.sin(b.phase) * 4;
  const cx  = b.x + b.r;
  const cy  = b.y + b.r + bob;
  const r   = b.r;

  ctx.save();

  // Outer glow
  const pulse = 0.28 + Math.sin(frame * 0.12 + b.phase) * 0.12;
  const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r + 6);
  grd.addColorStop(0, `rgba(100,230,255,${pulse.toFixed(2)})`);
  grd.addColorStop(1, 'rgba(100,230,255,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
  ctx.fill();

  // Bubble body
  ctx.fillStyle = 'rgba(180,240,255,0.82)';
  ctx.strokeStyle = 'rgba(100,220,255,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Shine highlight
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.28, cy - r * 0.28, r * 0.32, r * 0.22, -0.6, 0, Math.PI * 2);
  ctx.fill();

  // Heart icon inside
  const hs = r * 0.38;
  ctx.fillStyle = '#e91e8c';
  ctx.beginPath();
  ctx.moveTo(cx,      cy + hs * 0.38);
  ctx.bezierCurveTo(cx, cy,         cx - hs, cy,         cx - hs, cy + hs * 0.38);
  ctx.bezierCurveTo(cx - hs, cy + hs * 0.8, cx, cy + hs * 1.3, cx, cy + hs * 1.3);
  ctx.bezierCurveTo(cx, cy + hs * 1.3, cx + hs, cy + hs * 0.8, cx + hs, cy + hs * 0.38);
  ctx.bezierCurveTo(cx + hs, cy,     cx, cy,         cx, cy + hs * 0.38);
  ctx.fill();

  ctx.restore();
}

function drawFinish(ctx, s) {
  const ahead = s.raceLen - s.progress;
  const fx    = PL_X + ahead;          // screen x of the finish line
  if (fx > W + 60 || fx < -60) return;

  // Checkerboard
  const tile = 18;
  for (let y = PLAY_Y1; y < H; y += tile) {
    const row = Math.floor((y - PLAY_Y1) / tile);
    ctx.fillStyle = row % 2 === 0 ? '#ffffff' : '#111111';
    ctx.fillRect(fx - 10, y, 18, tile);
    ctx.fillStyle = row % 2 === 0 ? '#111111' : '#ffffff';
    ctx.fillRect(fx + 8,  y, 18, tile);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(fx, PLAY_Y1, 8, PLAY_H);

  drawText(ctx, 'FINISH', fx + 8, PLAY_Y1 + 22, {
    size: 7, align: 'center', color: P.butter, shadow: true,
  });
}

// ── Dive gauge ────────────────────────────────────────────────────────────────
function drawGauge(ctx, s) {
  const pct = Math.min(s.progress / s.raceLen, 1);
  const gx = W - 28, gy = PLAY_Y1 + 10, gw = 20, gh = PLAY_H - 20;

  ctx.fillStyle = P.darkOutline;
  ctx.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
  ctx.fillStyle = '#06121e';
  ctx.fillRect(gx, gy, gw, gh);

  const fillH = gh * pct;
  ctx.fillStyle = P.mint;
  ctx.fillRect(gx, gy + gh - fillH, gw, fillH);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(gx, gy + gh - fillH, 8, fillH);

  drawText(ctx, `${Math.floor(pct * 100)}%`, gx + gw / 2, gy + gh + 14, {
    size: 6, align: 'center', color: P.mint,
  });
  drawText(ctx, 'DEPTH', gx + gw / 2, gy - 6, {
    size: 5, align: 'center', color: P.mint,
  });
}

export default Level2;
