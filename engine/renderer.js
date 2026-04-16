// engine/renderer.js — Drawing utilities

import { PALETTE, CONFIG } from '../config.js';

const W = 700, H = 420;

// Draw outlined text (Press Start 2P style)
export function drawText(ctx, text, x, y, opts = {}) {
  const {
    size      = 12,
    color     = PALETTE.cream,
    outline   = PALETTE.darkOutline,
    align     = 'left',
    baseline  = 'alphabetic',
    maxWidth,
    shadow    = false,
  } = opts;

  ctx.font = `${size}px 'Press Start 2P', monospace`;
  ctx.textAlign    = align;
  ctx.textBaseline = baseline;

  if (shadow) {
    ctx.fillStyle = outline;
    ctx.fillText(text, x + 3, y + 3, maxWidth);
  }

  // Outline
  ctx.strokeStyle = outline;
  ctx.lineWidth   = size * 0.22;
  ctx.lineJoin    = 'round';
  ctx.strokeText(text, x, y, maxWidth);

  // Fill
  ctx.fillStyle = color;
  ctx.fillText(text, x, y, maxWidth);
}

// Draw a chunky pixel-style bar (HP, progress, etc.)
export function drawBar(ctx, x, y, w, h, pct, fillColor, bgColor = '#1a0a1a', borderColor = '#1a0a1a') {
  // Border
  ctx.fillStyle = borderColor;
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

  // Background
  ctx.fillStyle = bgColor;
  ctx.fillRect(x, y, w, h);

  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, Math.max(0, w * pct), h);

  // Inner shine
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x, y, Math.max(0, w * pct), Math.ceil(h / 3));
}

// Bar with color shift based on value (HP style)
export function hpBarColor(pct) {
  if (pct > 0.5) return PALETTE.mint;
  if (pct > 0.25) return PALETTE.butter;
  return PALETTE.coral;
}

// Chunky Habbo-style panel with 3D bevel
export function drawPanel(ctx, x, y, w, h, fillColor = PALETTE.pinkMid, opts = {}) {
  const {
    bevel  = 4,
    border = PALETTE.darkOutline,
    shine  = '#ffffff',
    shadow = PALETTE.pinkDeep,
    radius = 4,
  } = opts;

  // Drop shadow
  ctx.fillStyle = 'rgba(26,10,26,0.5)';
  ctx.fillRect(x + 4, y + 4, w, h);

  // Shadow bevel (bottom/right)
  ctx.fillStyle = shadow;
  ctx.fillRect(x, y + h - bevel, w, bevel);
  ctx.fillRect(x + w - bevel, y, bevel, h);

  // Main fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, w - bevel, h - bevel);

  // Shine bevel (top/left)
  ctx.fillStyle = shine;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(x, y, w - bevel, bevel);
  ctx.fillRect(x, y, bevel, h - bevel);
  ctx.globalAlpha = 1;

  // Border
  ctx.strokeStyle = border;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

// Draw a pixel-art heart icon (full or empty)
export function drawHeart(ctx, x, y, size = 10, full = true) {
  ctx.fillStyle = full ? PALETTE.hotMagenta : '#333';
  ctx.strokeStyle = PALETTE.darkOutline;
  ctx.lineWidth = 1.5;
  const s = size;
  ctx.beginPath();
  ctx.moveTo(x + s / 2, y + s * 0.4);
  ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.35);
  ctx.bezierCurveTo(x, y + s * 0.7, x + s / 2, y + s, x + s / 2, y + s);
  ctx.bezierCurveTo(x + s / 2, y + s, x + s, y + s * 0.7, x + s, y + s * 0.35);
  ctx.bezierCurveTo(x + s, y, x + s / 2, y, x + s / 2, y + s * 0.4);
  ctx.fill();
  ctx.stroke();
}

function drawBubble(ctx, x, y, size = 14, full = true) {
  ctx.globalAlpha = full ? 1 : 0.28;
  ctx.fillStyle = full ? 'rgba(135,206,235,0.42)' : 'rgba(135,206,235,0.18)';
  ctx.strokeStyle = full ? PALETTE.skyBlue : '#335566';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(x + size * 0.35, y + size * 0.32, size * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

// Draw HUD (lives + level label + score)
export function drawHUD(ctx, G) {
  // HUD bar background
  ctx.fillStyle = 'rgba(194,24,91,0.85)';
  ctx.fillRect(0, 0, W, 36);
  ctx.strokeStyle = PALETTE.darkOutline;
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, W, 36);

  // Lives
  for (let i = 0; i < CONFIG.starting_lives; i++) {
    if (G.level === 2) {
      drawBubble(ctx, 10 + i * 22, 11, 16, i < G.lives);
    } else {
      drawHeart(ctx, 10 + i * 22, 13, 14, i < G.lives);
    }
  }

  // Level label
  const labels = ['','THE ARENA','THE DEEP','THE STUDIO','GURGAON'];
  const label = labels[G.level] || '';
  drawText(ctx, `LV ${G.level} — ${label}`, W / 2, 24, {
    size: 8, align: 'center', color: PALETTE.pinkBlush,
  });

  // Score
  drawText(ctx, `${G.score}`, W - 10, 24, {
    size: 9, align: 'right', color: PALETTE.butter,
  });
}

// Level intro banner
export function drawLevelIntro(ctx, G) {
  const labels = ['','THE ARENA','THE DEEP','THE STUDIO','GURGAON'];
  const tag = `LEVEL ${G.level} — ${labels[G.level]}`;

  const bannerH = 60;
  const bannerY = H / 2 - bannerH / 2;

  // Slide in/out animation using G.introTimer
  const t = G.introTimer;
  let offsetY = 0;
  if (t < 20)  offsetY = -(bannerH + 10) * (1 - t / 20);
  if (t > 100) offsetY = -(bannerH + 10) * ((t - 100) / 20);

  ctx.save();
  ctx.translate(0, offsetY);
  drawPanel(ctx, 0, bannerY, W, bannerH, PALETTE.pinkMid, { bevel: 6 });
  drawText(ctx, tag, W / 2, bannerY + 36, {
    size: 14, align: 'center', color: PALETTE.cream, shadow: true,
  });
  ctx.restore();
}

export { W, H };
