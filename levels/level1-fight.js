// levels/level1-fight.js — The Arena (Street Fighter style 1v1)

import { CONFIG, PALETTE as P } from '../config.js';
import { drawText, drawPanel, drawBar, hpBarColor, W, H } from '../engine/renderer.js';
import { drawPlayerAnim } from '../engine/assets.js';
import { SFX } from '../engine/audio.js';
import { isLeft, isRight, isUp, isDown_, isZ, isX, isC } from '../engine/input.js';

const GROUND_Y  = 360;
const FIGHTER_W = 24;
const FIGHTER_H = 60;
const GRAVITY   = 0.7;
const JUMP_FORCE = -9.5;

// ── Henchman spritesheet ──────────────────────────────────────────────────────
// Sheet: 1496×167px. Frames are NOT uniformly 124px — each frame has its own
// measured x/w based on actual pixel-content boundaries (scanned per-cluster).
const HM_SCALE = 0.75;
const HM_FH    = Math.round(167 * HM_SCALE);  // 125px rendered height
const FRAME_H  = 167;

const HENCHMAN_FRAMES = {
  // x/w measured from actual content clusters on the sheet; y/h cover full height.
  idle1:     { x:   0, y: 0, w: 124, h: FRAME_H },  // content x=29–115
  idle2:     { x: 124, y: 0, w: 124, h: FRAME_H },  // content x=139–238
  walk1:     { x: 248, y: 0, w: 148, h: FRAME_H },  // content x=295–381 (was cut off at 371)
  walk2:     { x: 396, y: 0, w: 115, h: FRAME_H },  // content x=411–496 (ghost bleed fixed)
  kick:      { x: 511, y: 0, w: 128, h: FRAME_H },  // content x=526–626
  jump_kick: { x: 639, y: 0, w: 115, h: FRAME_H },  // content x=652–753
  jump:      { x: 754, y: 0, w: 131, h: FRAME_H },  // content x=755–869
  punch:     { x: 885, y: 0, w: 130, h: FRAME_H },  // content x=900–1013 (was cut by 22px)
  heavy:     { x:1015, y: 0, w: 115, h: FRAME_H },  // content x=1016–1117
  walk3:     { x:1130, y: 0, w: 127, h: FRAME_H },  // content x=1142–1242
  walk4:     { x:1257, y: 0, w: 115, h: FRAME_H },  // content x=1272–1357
  hurt:      { x:1372, y: 0, w: 124, h: FRAME_H },  // content x=1387–1473
};

const HENCHMAN_ANIMATIONS = {
  idle:      { frames: ['idle1','idle2'],                  fps: 4 },
  walk:      { frames: ['walk1','walk2','walk3','walk4'],   fps: 8 },
  punch:     { frames: ['punch'],                          fps: 0 },
  heavy:     { frames: ['heavy'],                          fps: 0 },
  kick:      { frames: ['kick'],                           fps: 0 },
  jump_kick: { frames: ['jump_kick'],                      fps: 0 },
  jump:      { frames: ['jump'],                           fps: 0 },
  hurt:      { frames: ['hurt'],                           fps: 0 },
  taunt:     { frames: ['idle1','idle2'],                  fps: 6 },
};

function getHenchmanFrame(action, onGround, globalFrame) {
  let key = 'idle';
  if (!onGround && action !== 'jump_kick')               key = 'jump';
  else if (action === 'walk')                            key = 'walk';
  else if (action === 'punch_l')                         key = 'punch';
  else if (action === 'punch_h' || action === 'special') key = 'heavy';
  else if (action === 'kick')                            key = 'kick';
  else if (action === 'jump_kick')                       key = 'jump_kick';
  else if (action === 'block')                           key = 'hurt';
  else if (action === 'taunt')                           key = 'taunt';

  const anim = HENCHMAN_ANIMATIONS[key] || HENCHMAN_ANIMATIONS.idle;
  let idx = 0;
  if (anim.fps > 0) {
    const period = Math.round(60 / anim.fps);
    idx = Math.floor(globalFrame / period) % anim.frames.length;
  }
  return HENCHMAN_FRAMES[anim.frames[idx]];
}

// ── Images ────────────────────────────────────────────────────────────────────
const level1Bg    = new Image();  level1Bg.src    = 'assets/background/level1bg.jpg';
const henchmanImg = new Image();  henchmanImg.src = 'assets/sprites/henchman.png';

let state = {};

// ── Fighter factory ───────────────────────────────────────────────────────────
function makeFighter(x, dir, isPlayer) {
  return {
    x, y: GROUND_Y - FIGHTER_H,
    w: FIGHTER_W, h: FIGHTER_H,
    vx: 0, vy: 0,
    onGround: true,
    facing: dir,
    hp: isPlayer ? CONFIG.l1_player_hp : CONFIG.l1_enemy_hp,
    maxHp: isPlayer ? CONFIG.l1_player_hp : CONFIG.l1_enemy_hp,
    action: 'idle',
    actionTimer: 0,
    blockCount: 0,
    hurtFlash: 0,
    hitFlash: 0,           // enemy: red flash on hit (6 frames)
    isPlayer,
    tauntVulnerable: false, // enemy: 1.5× damage window during taunt
    // AI
    aiState: 'approach',
    aiTimer: 0,
    aiDir: dir,
    attackInterval: rand(20, 55),
    consecutiveBlocks: 0,
    jumpKickPrimed: false,
    justHit: false,        // scramble trigger
    scrambleJumps: 0,
  };
}

function rand(a, b) { return a + Math.floor(Math.random() * (b - a)); }

// ── Attack definitions ────────────────────────────────────────────────────────
const ATTACKS = {
  punch_l:   { duration: 18, range: 68, dmgMin: 8,  dmgMax: 14, kb: 2, startup: 6,  sfx: 'punch',      hitPause: 3 },
  punch_h:   { duration: 28, range: 78, dmgMin: 16, dmgMax: 22, kb: 5, startup: 12, sfx: 'punch',      hitPause: 3 },
  kick:      { duration: 24, range: 84, dmgMin: 14, dmgMax: 20, kb: 3, startup: 8,  sfx: 'kick',       hitPause: 6 },
  jump_kick: { duration: 22, range: 86, dmgMin: 16, dmgMax: 24, kb: 4, startup: 7,  sfx: 'kick',       hitPause: 6 },
  special:   { duration: 40, range: 80, dmgMin: 30, dmgMax: 30, kb: 7, startup: 10, sfx: 'heartBurst', hitPause: 6, once: true },
};

// ── Floating damage numbers ───────────────────────────────────────────────────
let dmgNums = [];
function spawnDmg(x, y, dmg, blocked) {
  dmgNums.push({ x, y, dmg, blocked, life: 50, vy: -1.5,
    color: blocked ? P.cream : (dmg >= 14 ? P.coral : P.butter) });
}

// ── Crowd reactions ───────────────────────────────────────────────────────────
let crowdReactions = [];
function spawnCrowdReaction(text) {
  crowdReactions.push({
    text,
    x: 60 + Math.random() * (W - 120),
    y: 175 + Math.random() * 35,
    life: 60,
    vy: -(40 / 60),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
const Level1 = {
  init(G) {
    state = {
      player:          makeFighter(150,  1, true),
      enemy:           makeFighter(520, -1, false),
      specialUsed:     false,
      roundOver:       false,
      roundTimer:      0,
      winBanner:       null,
      checkeredOffset: 0,
      screenShake:     { intensity: 0, duration: 0 },
      hitPauseFrames:  0,
      roundIntroTimer: 0,   // <70 = intro playing; >=70 = player in control
    };
    dmgNums        = [];
    crowdReactions = [];
    G._l1_prevZ = false;
    G._l1_prevX = false;
    G._l1_prevC = false;
  },

  update(G) {
    if (state.roundOver) {
      state.roundTimer++;
      if (state.roundTimer > 80) G.levelComplete(300);
      return;
    }

    // Hit pause — freeze all game logic
    if (state.hitPauseFrames > 0) { state.hitPauseFrames--; return; }

    state.roundIntroTimer++;

    const pl = state.player;
    const en = state.enemy;

    // ── Player input (only after intro ends at frame 70) ──
    if (state.roundIntroTimer >= 70) {
      if (pl.action === 'idle' || pl.action === 'walk') {
        if (isLeft(G))       { pl.vx = -3.5; pl.facing = -1; pl.action = 'walk'; }
        else if (isRight(G)) { pl.vx =  3.5; pl.facing =  1; pl.action = 'walk'; }
        else                 { pl.vx = 0;    pl.action = 'idle'; }

        if (isUp(G) && pl.onGround) {
          pl.vy = JUMP_FORCE; pl.onGround = false; pl.action = 'jump'; SFX.jump();
        }
        const block = isDown_(G);
        if (block) { pl.action = 'block'; pl.blockCount++; }
        else pl.blockCount = 0;

        const zNow = isZ(G), xNow = isX(G), cNow = isC(G);
        if (zNow && xNow && !state.specialUsed) {
          startAttack(pl, 'special'); state.specialUsed = true;
        } else if (zNow && !G._l1_prevZ && !xNow) {
          startAttack(pl, 'punch_l');
        } else if (xNow && !G._l1_prevX && !zNow) {
          startAttack(pl, 'punch_h');
        } else if (cNow && !G._l1_prevC) {
          startAttack(pl, 'kick');
        }
        G._l1_prevZ = zNow; G._l1_prevX = xNow; G._l1_prevC = cNow;
      }
    }

    // ── Physics ──
    [pl, en].forEach(f => {
      f.vy += GRAVITY;
      f.x  += f.vx;
      f.y  += f.vy;
      if (f.y + f.h >= GROUND_Y) { f.y = GROUND_Y - f.h; f.vy = 0; f.onGround = true; }
      if (f.x < 0)       { f.x = 0;       f.vx = 0; }
      if (f.x + f.w > W) { f.x = W - f.w; f.vx = 0; }
      f.vx *= 0.75;
    });

    // ── Action tick ──
    updateAction(pl, en, G);
    updateAction(en, pl, G);

    // ── Enemy AI (starts at intro frame 50 so enemy is already moving as FIGHT! appears) ──
    if (state.roundIntroTimer >= 50) updateHenchmanAI(en, pl, G);

    // ── Facing ──
    if (en.action === 'idle' || en.action === 'walk' || en.action === 'taunt') {
      en.facing = (pl.x > en.x) ? 1 : -1;
    }

    // ── Timers ──
    if (pl.hurtFlash > 0) pl.hurtFlash--;
    if (en.hurtFlash > 0) en.hurtFlash--;
    if (en.hitFlash  > 0) en.hitFlash--;

    dmgNums        = dmgNums.filter(d => { d.y += d.vy; d.life--; return d.life > 0; });
    crowdReactions = crowdReactions.filter(r => { r.y += r.vy; r.life--; return r.life > 0; });

    if (state.screenShake.duration > 0) {
      state.screenShake.duration--;
      if (state.screenShake.duration <= 0) state.screenShake.intensity = 0;
    }

    // ── Win / loss ──
    if (en.hp <= 0 && !state.roundOver) {
      state.roundOver = true; state.roundTimer = 0;
      state.winBanner = { text: 'K.O.!', timer: 0 };
      G.particles.confetti(en.x + en.w / 2, en.y);
      G.particles.stars(en.x + en.w / 2, en.y, 10);
    }
    if (pl.hp <= 0 && !state.roundOver) {
      G.playerDied();
      pl.hp = pl.maxHp; en.hp = en.maxHp;
      pl.x = 150; en.x = 520;
      pl.y = en.y = GROUND_Y - FIGHTER_H;
      state.roundIntroTimer = 0;
      state.specialUsed     = false;
      en.aiState = 'approach'; en.aiTimer = 0;
    }

    state.checkeredOffset = (state.checkeredOffset + 0.5) % 64;
  },

  draw(G, ctx) {
    // ── Screen shake offset ──
    const sk = state.screenShake;
    const shakeX = sk.duration > 0 ? Math.sin(G.frame * 1.8) * sk.intensity : 0;
    const shakeY = sk.duration > 0 ? Math.cos(G.frame * 2.3) * sk.intensity * 0.5 : 0;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawArena(ctx, G.frame, state.checkeredOffset);

    const pl = state.player, en = state.enemy;

    // Player (invincibility flash)
    ctx.save();
    if (pl.hurtFlash > 0 && pl.hurtFlash <= 60) {
      ctx.globalAlpha = G.frame % 8 < 4 ? 1.0 : 0.3;
    }
    drawFighter(ctx, pl, G.frame);
    ctx.restore();

    drawFighter(ctx, en, G.frame);

    // Special heart burst
    if (pl.action === 'special' && pl.actionTimer === ATTACKS.special.startup) {
      for (let i = 0; i < 3; i++) G.particles.hearts(pl.x + pl.w / 2, pl.y + pl.h / 2, 6);
    }

    G.particles.draw(ctx);
    drawHPBars(ctx, pl, en);

    // Floating damage numbers
    dmgNums.forEach(d => {
      ctx.globalAlpha = d.life / 50;
      drawText(ctx, d.blocked ? 'BLOCK' : String(d.dmg), d.x, d.y,
        { size: d.blocked ? 7 : 9, align: 'center', color: d.color });
      ctx.globalAlpha = 1;
    });

    // Crowd reactions (bleacher area)
    crowdReactions.forEach(r => {
      ctx.globalAlpha = r.life / 60;
      drawText(ctx, r.text, r.x, r.y, { size: 7, align: 'center', color: P.pinkPale });
      ctx.globalAlpha = 1;
    });

    // "NOW!" taunt indicator
    if (en.tauntVulnerable && en.aiTimer <= 10) {
      ctx.globalAlpha = 0.85 + Math.abs(Math.sin(en.aiTimer * 0.5)) * 0.15;
      drawText(ctx, 'NOW!', en.x + en.w / 2, en.y - 22,
        { size: 11, align: 'center', color: P.butter, shadow: true });
      ctx.globalAlpha = 1;
    }

    ctx.restore(); // end screen shake

    // Round intro drawn outside shake for stability
    drawRoundIntro(ctx, state.roundIntroTimer);

    // KO banner
    if (state.winBanner) {
      state.winBanner.timer++;
      const scl = Math.min(1, state.winBanner.timer / 8);
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scl, scl);
      drawText(ctx, state.winBanner.text, 0, 0, { size: 32, align: 'center', color: P.butter, shadow: true });
      ctx.restore();
    }

    // Controls hint
    if (G.frame < 240) {
      const alpha = G.frame < 180 ? 1 : 1 - (G.frame - 180) / 60;
      ctx.save();
      ctx.globalAlpha = alpha * 0.72;
      ctx.fillStyle = '#1a0a1a';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 160, H - 52, 320, 42, 8);
      ctx.fill();
      ctx.globalAlpha = alpha;
      drawText(ctx, 'press Z to punch', W / 2, H - 32,
        { size: 7, align: 'center', color: P.butter, shadow: true });
      drawText(ctx, 'X: heavy   C: kick   Z+X: special', W / 2, H - 16,
        { size: 5, align: 'center', color: P.pinkPale });
      ctx.restore();
    }
  },

  destroy(G) {},
  onComplete(G) {},
};

// ── Round intro sequence ──────────────────────────────────────────────────────
function drawRoundIntro(ctx, t) {
  if (t >= 90) return;
  ctx.save();

  // "ROUND 1" — slams from top, frames 0–49, fades 45–65
  if (t < 70) {
    let y = H / 2 - 55;
    if (t < 15) y = -60 + (H / 2 - 55 + 60) * (t / 15);
    const alpha = t < 45 ? 1 : Math.max(0, 1 - (t - 45) / 20);
    ctx.globalAlpha = alpha;
    drawText(ctx, 'ROUND 1', W / 2, y, { size: 22, align: 'center', color: P.hotMagenta, shadow: true });
    ctx.globalAlpha = 1;
  }

  // "FIGHT!" — slams from left, frames 50–89, fades 75–89
  if (t >= 50) {
    const ft = t - 50;
    let x = W / 2;
    if (ft < 14) x = -140 + (W / 2 + 140) * (ft / 14);
    const alpha = ft < 25 ? 1 : Math.max(0, 1 - (ft - 25) / 14);
    ctx.globalAlpha = alpha;
    drawText(ctx, 'FIGHT!', x, H / 2, { size: 28, align: 'center', color: P.butter, shadow: true });
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function startAttack(fighter, type) {
  fighter.action      = type;
  fighter.actionTimer = 0;
}

function updateAction(f, opp, G) {
  if (f.action === 'idle' || f.action === 'walk' ||
      f.action === 'block' || f.action === 'taunt') return;

  f.actionTimer++;
  const atk = ATTACKS[f.action];
  if (!atk) { f.action = 'idle'; return; }

  if (f.actionTimer === atk.startup) {
    const dist      = Math.abs((f.x + f.w / 2) - (opp.x + opp.w / 2));
    const invincible = opp.isPlayer && opp.hurtFlash > 0;

    if (dist < atk.range && !invincible) {
      let dmg = rand(atk.dmgMin, atk.dmgMax + 1);
      const blocked = opp.action === 'block';

      // Taunt vulnerability: player hits taunting henchman → 1.5× damage
      if (f.isPlayer && opp.tauntVulnerable) dmg = Math.round(dmg * 1.5);

      if (blocked) dmg = Math.ceil(dmg * 0.4);
      opp.hp = Math.max(0, opp.hp - dmg);

      opp.vx = (opp.x > f.x ? 1 : -1) * atk.kb;
      opp.vy = -3;

      opp.hurtFlash = opp.isPlayer ? (blocked ? 10 : 80) : (blocked ? 10 : 30);

      // Red hit flash on henchman (6 frames) + scramble trigger
      if (!opp.isPlayer) { opp.hitFlash = 6; opp.justHit = true; }

      spawnDmg(opp.x + opp.w / 2, opp.y - 10, dmg, blocked);
      G.particles.sparks(opp.x + opp.w / 2, opp.y + opp.h * 0.3, 6, blocked ? P.cream : P.coral);
      SFX[atk.sfx]();
      if (blocked) SFX.block();
      if (f.action === 'special') G.particles.hearts(opp.x + opp.w / 2, opp.y, 10);

      if (!f.isPlayer && blocked) opp.consecutiveBlocks = (opp.consecutiveBlocks || 0) + 1;

      // Screen shake
      if (!blocked) {
        state.screenShake.intensity = Math.min(dmg * 0.4, 8);
        state.screenShake.duration  = 8;
      }

      // Crowd reactions
      if (!blocked) {
        if (f.isPlayer  && dmg >= 14) spawnCrowdReaction('CHEER!');
        if (!f.isPlayer && dmg >= 14) spawnCrowdReaction('OOH!');
        if (!f.isPlayer && opp.hp / opp.maxHp < 0.3) spawnCrowdReaction('GASP!');
      } else if (f.isPlayer) {
        spawnCrowdReaction('BOO!');
      }

      // Hit pause
      if (!blocked) state.hitPauseFrames = atk.hitPause || 3;
    }
  }

  if (f.actionTimer >= atk.duration) { f.action = 'idle'; f.actionTimer = 0; }
}

// ── Henchman AI — 7-state machine ────────────────────────────────────────────
function updateHenchmanAI(en, pl, G) {
  // Being hit interrupts idle/walk/taunt → scramble
  if (en.justHit &&
      (en.action === 'idle' || en.action === 'walk' || en.action === 'taunt')) {
    en.justHit       = false;
    en.aiState       = 'scramble';
    en.aiTimer       = 0;
    en.scrambleJumps = 0;
  } else {
    en.justHit = false;
  }

  if (en.action !== 'idle' && en.action !== 'walk' &&
      en.action !== 'block' && en.action !== 'taunt') return;

  en.aiTimer++;
  const dist     = pl.x - en.x;
  const absDist  = Math.abs(dist);
  const toward   = dist > 0 ? 1 : -1;
  const roomLeft  = en.x > 45;
  const roomRight = en.x + en.w < W - 45;

  en.tauntVulnerable = (en.aiState === 'taunt');

  switch (en.aiState) {

    case 'approach':
      en.vx = toward * 3.0;
      en.action = 'walk';
      if (absDist < 110) {
        en.aiState = 'circle';
        en.aiTimer = 0;
        en.aiDir   = Math.random() > 0.5 ? 1 : -1;
      }
      if (en.aiTimer > 40) { en.aiState = 'attack_punch'; en.aiTimer = 0; }
      break;

    case 'circle':
      if ((!roomLeft && en.aiDir < 0) || (!roomRight && en.aiDir > 0)) en.aiDir *= -1;
      en.vx     = en.aiDir * 2.8;
      en.action = Math.abs(en.vx) > 0.2 ? 'walk' : 'idle';
      if (en.aiTimer > 15 + Math.floor(Math.random() * 15)) {
        const roll = Math.random();
        if      (roll < 0.45) { en.aiState = 'attack_punch';     en.aiTimer = 0; }
        else if (roll < 0.72) { en.aiState = 'attack_kick';      en.aiTimer = 0; }
        else if (roll < 0.88) { en.aiState = 'attack_jump_kick'; en.aiTimer = 0; }
        else                  { en.aiState = 'taunt';            en.aiTimer = 0; }
      }
      if (absDist > 160) { en.aiState = 'approach'; en.aiTimer = 0; }
      break;

    case 'attack_punch':
      // Stop at 55px — well within the 68px punch range so hits actually land
      if (absDist > 55) {
        en.vx = toward * 3.2; en.action = 'walk';
      } else {
        en.vx = 0; en.action = 'idle';
        if (en.aiTimer > en.attackInterval) {
          en.aiTimer = 0;
          en.attackInterval = rand(20, 55);
          const moves = pl.consecutiveBlocks >= 3 ? ['punch_h'] : ['punch_l', 'punch_h'];
          startAttack(en, moves[Math.floor(Math.random() * moves.length)]);
          if (pl.consecutiveBlocks >= 3) pl.consecutiveBlocks = 0;
        }
      }
      if (en.aiTimer > 50 || absDist > 190) { en.aiState = 'retreat'; en.aiTimer = 0; }
      break;

    case 'attack_kick':
      // Stop at 70px — within the 84px kick range
      if (absDist > 70) {
        en.vx = toward * 3.2; en.action = 'walk';
      } else {
        en.vx = 0; en.action = 'idle';
        if (en.aiTimer > Math.round(en.attackInterval * 0.75)) {
          en.aiTimer = 0;
          en.attackInterval = rand(20, 55);
          startAttack(en, 'kick');
        }
      }
      if (en.aiTimer > 45) { en.aiState = 'circle'; en.aiTimer = 0; en.aiDir = Math.random() > 0.5 ? 1 : -1; }
      break;

    case 'attack_jump_kick':
      // Phase 1: close distance
      if (absDist > 80) { en.vx = toward * 3; en.action = 'walk'; }
      // Phase 2: jump on frame 14
      if (en.aiTimer === 14 && en.onGround) {
        en.vy = JUMP_FORCE;
        en.onGround = false;
        en.jumpKickPrimed = true;
      }
      // Phase 3: kick at apex (vy >= 0 = peak or descending)
      if (en.jumpKickPrimed && !en.onGround && en.vy >= 0) {
        en.jumpKickPrimed = false;
        startAttack(en, 'jump_kick');
      }
      // Phase 4: return to retreat after landing
      if (en.onGround && en.aiTimer > 28) {
        en.aiState = 'retreat'; en.aiTimer = 0; en.jumpKickPrimed = false;
      }
      break;

    case 'retreat':
      en.vx = -toward * 3.2;
      en.action = 'walk';
      if ((!roomLeft && en.vx < 0) || (!roomRight && en.vx > 0)) en.vx *= -1;
      if (en.aiTimer > 28) {
        en.aiState = 'circle'; en.aiTimer = 0; en.aiDir = Math.random() > 0.5 ? 1 : -1;
      }
      break;

    case 'taunt':
      en.vx     = 0;
      en.action = 'taunt';
      // Taunt lasts 32 frames; first 10 show "NOW!" indicator (drawn in draw())
      if (en.aiTimer > 32) {
        en.tauntVulnerable = false;
        en.aiState = 'attack_punch'; en.aiTimer = 0;
      }
      break;

    case 'scramble': {
      // Erratic evasion after being hit — zigzags and jumps chaotically
      const zigzag = Math.sin(en.aiTimer * 0.55) > 0 ? 1 : -1;
      en.vx    = zigzag * 5.5;
      en.action = 'walk';
      if ((!roomLeft && en.vx < 0) || (!roomRight && en.vx > 0)) en.vx *= -1;

      // Jump up to 3 times, one every ~18 frames
      if (en.onGround && en.scrambleJumps < 3 && en.aiTimer > 0 && en.aiTimer % 18 === 0) {
        en.vy = JUMP_FORCE * 1.1;
        en.onGround  = false;
        en.scrambleJumps++;
        // Random horizontal burst mid-jump
        en.vx = (Math.random() > 0.5 ? 1 : -1) * 6;
      }

      if (en.aiTimer > 80) {
        en.scrambleJumps = 0;
        en.aiState = Math.random() < 0.5 ? 'approach' : 'circle';
        en.aiTimer = 0;
        en.aiDir   = Math.random() > 0.5 ? 1 : -1;
      }
      break;
    }
  }
}

// ── Draw arena background ─────────────────────────────────────────────────────
function drawArena(ctx, frame, offset) {
  if (level1Bg.complete && level1Bg.naturalWidth) {
    drawCoverImage(ctx, level1Bg, 0, 0, W, H);
    return;
  }

  ctx.fillStyle = '#f6ead8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff6e6';
  ctx.fillRect(0, 36, W, 230);
  ctx.strokeStyle = '#cfa56a';
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += 70) ctx.strokeRect(x, 36, 70, 70);

  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(0, 36, W, 12);
  ctx.fillRect(0, 248, W, 12);
  for (let x = 46; x < W; x += 152) {
    ctx.fillStyle = '#70451f';
    ctx.fillRect(x, 36, 10, 224);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x + 2, 40, 2, 206);
  }

  drawPanel(ctx, W / 2 - 122, 56, 244, 42, '#ffffff', { bevel: 3, border: '#1b1b1b' });
  drawText(ctx, 'TAEKWONDO DOJANG', W / 2, 82, { size: 10, align: 'center', color: '#1b1b1b' });

  drawPanel(ctx, 86, 78, 80, 48, '#ffffff', { bevel: 2, border: '#1b1b1b' });
  ctx.fillStyle = '#d7263d';
  ctx.beginPath(); ctx.arc(126, 102, 12, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#2056a7';
  ctx.beginPath(); ctx.arc(126, 102, 12, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#1b1b1b';
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(96 + i * 5, 88, 3, 16);
    ctx.fillRect(146 + i * 5, 100, 3, 16);
  }

  ctx.fillStyle = '#5b3719';
  ctx.fillRect(W - 170, 84, 118, 8);
  const belts = ['#ffffff', '#ffe066', '#3bb273', '#2056a7', '#d7263d', '#111111'];
  for (let i = 0; i < belts.length; i++) {
    ctx.fillStyle = belts[i];
    ctx.fillRect(W - 160 + i * 18, 96, 12, 42);
    ctx.strokeStyle = '#1b1b1b'; ctx.lineWidth = 1;
    ctx.strokeRect(W - 160 + i * 18, 96, 12, 42);
  }

  const floorY = GROUND_Y;
  ctx.fillStyle = '#5a7f9f';
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = '#4b6f8d';
  for (let x = -offset; x < W; x += 32)
    for (let y = floorY; y < H; y += 32)
      if (Math.floor((x / 32) + (y / 32)) % 2 === 0) ctx.fillRect(x, y, 32, 32);

  ctx.fillStyle = '#d7263d'; ctx.fillRect(0, floorY + 32, W, 4);
  ctx.fillStyle = '#f6ead8'; ctx.fillRect(0, floorY + 68, W, 4);
  ctx.fillStyle = '#1b1b1b'; ctx.fillRect(0, floorY, W, 3);
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

// ── Draw henchman from spritesheet ────────────────────────────────────────────
function drawHenchman(ctx, f, globalFrame) {
  const src  = getHenchmanFrame(f.action, f.onGround, globalFrame);
  // Scale each frame proportionally to HM_FH (height) so variable-width frames
  // don't stretch or squish the sprite.
  const scale = HM_FH / src.h;
  const dw    = Math.round(src.w * scale);
  const dh    = HM_FH;
  const cx    = f.x + f.w / 2;
  const botY  = f.y + f.h;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, botY);
  if (f.facing === -1) ctx.scale(-1, 1);
  ctx.drawImage(henchmanImg, src.x, src.y, src.w, src.h, -dw / 2, -dh, dw, dh);
  if (f.hitFlash > 0) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle   = '#ff0000';
    ctx.fillRect(-dw / 2, -dh, dw, dh);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ── Draw fighter (dispatches player vs enemy) ─────────────────────────────────
function drawFighter(ctx, f, frame) {
  if (f.isPlayer) {
    let animState, animTimer = frame;
    const isPunching = f.action === 'punch_l' || f.action === 'punch_h' || f.action === 'special';
    if (f.hurtFlash > 60 && !isPunching) {
      animState = 'fight_hurt';
    } else if (isPunching) {
      animState = 'punch'; animTimer = f.actionTimer;
    } else if (!f.onGround || f.action === 'jump') {
      animState = 'jump';
    } else if (f.action === 'walk') {
      animState = 'walk';
    } else {
      animState = 'idle';
    }
    drawPlayerAnim(ctx, animState, animTimer, f.x + f.w / 2, f.y + f.h, f.facing === 1);
  } else {
    drawHenchman(ctx, f, frame);
  }

  // Block shield (both fighters)
  if (f.action === 'block') {
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    ctx.strokeStyle  = P.skyBlue;
    ctx.lineWidth    = 3;
    ctx.globalAlpha  = 0.7;
    ctx.beginPath(); ctx.arc(cx, cy, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha  = 1;
  }
}

// ── Draw HP bars ──────────────────────────────────────────────────────────────
function drawHPBars(ctx, pl, en) {
  const barW = 220, barH = 16, barY = 46;
  drawBar(ctx, 10, barY, barW, barH, pl.hp / pl.maxHp, hpBarColor(pl.hp / pl.maxHp), '#1a0a1a');
  drawText(ctx, 'YOU', 10, barY - 4, { size: 6, color: P.cream });
  const ep = en.hp / en.maxHp;
  drawBar(ctx, W - 10 - barW, barY, barW, barH, ep, hpBarColor(ep), '#1a0a1a');
  drawText(ctx, 'FOE', W - 10, barY - 4, { size: 6, align: 'right', color: P.coral });
}

export default Level1;
