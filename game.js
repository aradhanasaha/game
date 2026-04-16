// game.js — Main loop, state machine, menus, HUD, win screen

import { CONFIG, PALETTE as P } from './config.js';
import { initInput } from './engine/input.js';
import { ParticleSystem } from './engine/particles.js';
import { generateSprites, Sprites } from './engine/assets.js';
import { drawText, drawPanel, drawHUD, drawLevelIntro, drawHeart, W, H } from './engine/renderer.js';
import { initAudio, resumeAudio, playBGM, stopBGM, SFX, toggleMute, isMuted } from './engine/audio.js';
import { CutscenePlayer, drawHearteyes } from './engine/cutscene.js';

import Level1 from './levels/level1-fight.js';
import Level2 from './levels/level2-swim.js';
import Level3 from './levels/level3-art.js';
import Level4 from './levels/level4-platform.js';

const LEVELS = [null, Level1, Level2, Level3, Level4];
const BGM_NAMES = ['', 'fight', 'swim', 'art', 'platform'];

// Global state
const G = {
  state: 'LOADING',
  level: 1,
  score: 0,
  scoreAtLevelStart: 0,
  lives: CONFIG.starting_lives,
  frame: 0,
  canvas: null,
  ctx: null,
  keys: {},
  activeLevel: null,
  particles: null,
  pausePressed: false,
  paused: false,
  introTimer: 0,
  loadProgress: 0,
  noBtn: { x: 460, y: 310 },
  yesClicked: false,
  cloudX: 0,
  menuCoins: [],
  cutscenePlayer: null,
  _csClick: false,         // set by click handler when state === 'CUTSCENE'
};

// Initialize
const canvas = document.getElementById('game-canvas');
G.canvas = canvas;
G.ctx    = canvas.getContext('2d');
G.particles    = new ParticleSystem();
G.cutscenePlayer = new CutscenePlayer();

initInput(G);
initAudio();

// Fake loading bar
let loadStep = 0;
const LOAD_STEPS = 60;

function tick() {
  requestAnimationFrame(tick);
  const ctx = G.ctx;
  ctx.clearRect(0, 0, W, H);

  switch (G.state) {
    case 'LOADING':        updateLoading(ctx);    break;
    case 'MENU':           updateMenu(ctx);       break;
    case 'CUTSCENE':       updateCutscene(ctx);   break;
    case 'LEVEL_INTRO':    updateIntro(ctx);      break;
    case 'PLAYING':        updatePlaying(ctx);    break;
    case 'LEVEL_COMPLETE': updateComplete(ctx);   break;
    case 'GAME_OVER':      updateGameOver(ctx);   break;
    case 'WIN_SCREEN':     updateWin(ctx);        break;
    case 'PAUSED':         updatePaused(ctx);     break;
  }

  G.frame++;
}

// ─── LOADING ──────────────────────────────────────────────────────────────────
function updateLoading(ctx) {
  ctx.fillStyle = P.pinkBlush;
  ctx.fillRect(0, 0, W, H);

  if (loadStep === 10) generateSprites();
  loadStep++;
  G.loadProgress = Math.min(loadStep / LOAD_STEPS, 1);

  drawText(ctx, 'THE QUEST', W/2, 160, { size: 28, align: 'center', color: P.pinkMid, shadow: true });

  const bw = 300, bh = 20, bx = W/2 - bw/2, by = 230;
  ctx.fillStyle = P.darkOutline;
  ctx.fillRect(bx-2, by-2, bw+4, bh+4);
  ctx.fillStyle = '#330a1a';
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = P.pinkMid;
  ctx.fillRect(bx, by, bw * G.loadProgress, bh);
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(bx, by, bw * G.loadProgress, bh/3);

  drawText(ctx, 'loading...', W/2, 280, { size: 10, align: 'center', color: P.pinkDeep });

  if (G.loadProgress >= 1) {
    G.state = 'MENU';
    initMenu();
    playBGM('menu');
  }
}

// ─── MENU ─────────────────────────────────────────────────────────────────────
function initMenu() {
  G.cloudX = 0;
  G.menuCoins = [];
  for (let i = 0; i < 5; i++) {
    G.menuCoins.push({
      x: 60 + i * 130,
      y: 300 + Math.sin(i * 1.3) * 20,
      phase: i * 1.2,
    });
  }
}

let _startHover = false;

function updateMenu(ctx) {
  G.cloudX = (G.cloudX + 0.3) % W;
  drawMenuBg(ctx);

  drawText(ctx, 'THE QUEST', W/2, 95, { size: 26, align: 'center', color: P.cream, shadow: true });

  G.menuCoins.forEach(c => {
    c.y += Math.sin(G.frame * 0.05 + c.phase) * 0.5 - 0.25;
    if (Sprites.coinFlower) {
      ctx.drawImage(Sprites.coinFlower, c.x - 8, c.y - 8);
    }
  });

  const sx = W/2-80, sy=250, sw=160, sh=44;
  drawPanel(ctx, sx, sy, sw, sh, P.pinkMid, { bevel: 5 });
  drawText(ctx, 'START', W/2, sy+28, { size: 14, align:'center', color:P.cream, shadow:true });


  const muteLabel = isMuted() ? '🔇' : '🔊';
  drawPanel(ctx, W-50, 8, 40, 26, P.pinkDeep, { bevel: 3 });
  ctx.font = '14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(muteLabel, W-30, 21);

  drawText(ctx, 'made with \u2665', W/2, H-12, { size: 7, align:'center', color:P.pinkMid });
}

function drawMenuBg(ctx) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#4d2b7f');
  grad.addColorStop(0.38, '#d85f83');
  grad.addColorStop(0.72, '#ffad70');
  grad.addColorStop(1, '#ffd39a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const sunX = W * 0.72, sunY = H - 92;
  const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 112);
  glow.addColorStop(0, 'rgba(255, 245, 170, 0.9)');
  glow.addColorStop(0.38, 'rgba(255, 177, 96, 0.42)');
  glow.addColorStop(1, 'rgba(255, 122, 112, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 112, sunY - 112, 224, 224);

  ctx.fillStyle = '#ffe58f';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 34, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 228, 160, 0.32)';
  ctx.fillRect(0, H - 122, W, 4);
  ctx.fillStyle = 'rgba(123, 54, 103, 0.28)';
  ctx.fillRect(0, H - 96, W, 5);

  if (Sprites.cloud) {
    for (let i = 0; i < 3; i++) {
      const cx = ((G.cloudX + i * 230) % (W + 100)) - 50;
      ctx.drawImage(Sprites.cloud, cx, 40 + i * 30);
    }
  }

  ctx.fillStyle = P.tilePink;
  ctx.fillRect(0, H-40, W, 40);
  ctx.fillStyle = P.tileShadow;
  ctx.fillRect(0, H-30, W, 30);
  ctx.fillStyle = P.darkOutline;
  ctx.fillRect(0, H-40, W, 2);
}

// Menu + other state click handler
canvas.addEventListener('click', e => {
  resumeAudio();
  const rect   = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleX;

  if (G.state === 'CUTSCENE') {
    G._csClick = true;
    return;
  }

  if (G.state === 'MENU') {
    if (mx > W/2-80 && mx < W/2+80 && my > 250 && my < 294) {
      SFX.complete();
      startLevel(1);
    }

    if (mx > W-50 && mx < W-10 && my > 8 && my < 34) {
      const m = toggleMute();
      if (!m) playBGM('menu');
    }
  }

  if (G.state === 'GAME_OVER') {
    if (mx > W/2-100 && mx < W/2+100 && my > 225 && my < 269) {
      SFX.complete();
      G.lives = CONFIG.starting_lives;
      G.score = G.scoreAtLevelStart;
      _doStartLevel(G.level);  // retry: skip cutscene, go straight to level
    }
    if (mx > W/2-100 && mx < W/2+100 && my > 285 && my < 329) {
      SFX.complete();
      G.lives = CONFIG.starting_lives;
      G.score = 0;
      G.scoreAtLevelStart = 0;
      if (G.activeLevel && G.activeLevel.destroy) G.activeLevel.destroy(G);
      G.activeLevel = null;
      G.state = 'MENU';
      playBGM('menu');
    }
  }

  if (G.state === 'WIN_SCREEN') {
    handleWinClick(mx, my);
  }

  if (G.state === 'PAUSED') {
    if (mx > W/2-80 && mx < W/2+80 && my > 200 && my < 238) {
      G.state = 'PLAYING';
    }
    if (mx > W/2-80 && mx < W/2+80 && my > 254 && my < 292) {
      G.activeLevel && G.activeLevel.destroy && G.activeLevel.destroy(G);
      G.activeLevel = null;
      stopBGM();
      G.state = 'MENU';
      playBGM('menu');
    }
  }
});

// Touch → click
canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const touch = e.changedTouches[0];
  canvas.dispatchEvent(new MouseEvent('click', {
    clientX: touch.clientX, clientY: touch.clientY
  }));
}, { passive: false });

// ─── CUTSCENE ─────────────────────────────────────────────────────────────────
function updateCutscene(ctx) {
  G.cutscenePlayer.update(ctx, G.frame, G);
}

// ─── LEVEL START ──────────────────────────────────────────────────────────────

// Internal: actually initialise and enter LEVEL_INTRO (no cutscene).
function _doStartLevel(n) {
  G.scoreAtLevelStart = G.score;
  G.level   = n;
  G.state   = 'LEVEL_INTRO';
  G.introTimer = 0;
  G.paused  = false;
  G.particles.clear();
  stopBGM();

  if (G.activeLevel && G.activeLevel.destroy) G.activeLevel.destroy(G);
  const LevelClass = LEVELS[n];
  if (!LevelClass) { G.state = 'WIN_SCREEN'; initWin(); return; }
  G.activeLevel = LevelClass;
  G.activeLevel.init(G);
}

// Public: play pre-cutscene if one exists, then start the level.
function startLevel(n) {
  const csName = `pre${n}`;
  // Check cutscene data exists (imported inside cutscene.js — we check by name)
  const hasCutscene = ['pre1','pre2','pre3','pre4'].includes(csName);
  if (hasCutscene) {
    stopBGM();
    G.state = 'CUTSCENE';
    G.cutscenePlayer.start(csName, () => _doStartLevel(n));
  } else {
    _doStartLevel(n);
  }
}

// ─── LEVEL INTRO ─────────────────────────────────────────────────────────────
function updateIntro(ctx) {
  if (G.activeLevel && G.activeLevel.draw) G.activeLevel.draw(G, ctx);
  drawLevelIntro(ctx, G);
  G.introTimer++;
  if (G.introTimer > 120) {
    G.state = 'PLAYING';
    playBGM(BGM_NAMES[G.level] || 'platform');
  }
}

// ─── PLAYING ─────────────────────────────────────────────────────────────────
function updatePlaying(ctx) {
  if (G.pausePressed) {
    G.pausePressed = false;
    G.state = 'PAUSED';
    return;
  }

  G.activeLevel.update(G);
  G.particles.update();
  G.activeLevel.draw(G, ctx);
  G.particles.draw(ctx);
  drawHUD(ctx, G);
}

// ─── LEVEL COMPLETE ───────────────────────────────────────────────────────────
let completeTimer = 0;
function updateComplete(ctx) {
  if (G.activeLevel && G.activeLevel.draw) G.activeLevel.draw(G, ctx);
  G.particles.update();
  G.particles.draw(ctx);

  drawPanel(ctx, W/2-160, H/2-40, 320, 80, P.pinkMid, { bevel: 6 });
  drawText(ctx, 'LEVEL CLEAR!', W/2, H/2-5,  { size: 14, align:'center', color:P.cream, shadow:true });
  drawText(ctx, `+${G.levelBonus || 0} pts`, W/2, H/2+22, { size: 10, align:'center', color:P.butter });

  completeTimer++;
  if (completeTimer > 90) {
    completeTimer = 0;
    if (G.level < 4) {
      // Play pre-cutscene for the next level
      startLevel(G.level + 1);
    } else {
      // After level 4: play the final cutscene → WIN_SCREEN
      stopBGM();
      G.state = 'CUTSCENE';
      G.cutscenePlayer.start('final', () => {
        G.state = 'WIN_SCREEN';
        initWin();
      });
    }
  }
}

// ─── GAME OVER ────────────────────────────────────────────────────────────────
function updateGameOver(ctx) {
  ctx.fillStyle = '#1a0a1a';
  ctx.fillRect(0, 0, W, H);

  G.particles.update();
  G.particles.draw(ctx);

  drawText(ctx, 'GAME OVER', W/2, 130, { size: 22, align:'center', color:P.coral, shadow:true });
  drawText(ctx, `score: ${G.score}`, W/2, 188, { size: 12, align:'center', color:P.butter });

  drawPanel(ctx, W/2-100, 225, 200, 44, P.pinkMid, { bevel:4 });
  drawText(ctx, 'RETRY LEVEL', W/2, 253, { size: 9, align:'center', color:P.cream });

  drawPanel(ctx, W/2-100, 285, 200, 44, P.pinkDeep, { bevel:4 });
  drawText(ctx, 'MENU', W/2, 313, { size: 9, align:'center', color:P.cream });
}

// ─── PAUSE ────────────────────────────────────────────────────────────────────
function updatePaused(ctx) {
  if (G.activeLevel && G.activeLevel.draw) G.activeLevel.draw(G, ctx);

  ctx.fillStyle = 'rgba(26,10,26,0.7)';
  ctx.fillRect(0, 0, W, H);

  drawText(ctx, 'PAUSED', W/2, 160, { size: 20, align:'center', color:P.cream, shadow:true });

  drawPanel(ctx, W/2-80, 200, 160, 38, P.pinkMid, { bevel:4 });
  drawText(ctx, 'RESUME', W/2, 224, { size: 10, align:'center', color:P.cream });

  drawPanel(ctx, W/2-80, 254, 160, 38, P.pinkDeep, { bevel:4 });
  drawText(ctx, 'QUIT', W/2, 278, { size: 10, align:'center', color:P.cream });
}

// ─── WIN SCREEN ───────────────────────────────────────────────────────────────
let winTimer = 0;

function initWin() {
  winTimer     = 0;
  G.noBtn      = { x: 460, y: 310 };
  G.yesClicked = false;
  G.particles.clear();
  stopBGM();
  SFX.propose();
}

function updateWin(ctx) {
  winTimer++;

  // Background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, P.pinkPale);
  grad.addColorStop(1, P.pinkBlush);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (!G.yesClicked) {
    if (winTimer % 20 === 0) G.particles.confetti(Math.random()*W, -10);
    if (winTimer % 30 === 0) G.particles.hearts(Math.random()*W, -10);
  } else {
    if (winTimer % 3 === 0)  G.particles.hearts(Math.random()*W, Math.random()*H);
    if (winTimer % 5 === 0)  G.particles.confetti(Math.random()*W, -10);
    if (winTimer % 7 === 0)  G.particles.petals(Math.random()*W, Math.random()*H);
  }

  G.particles.update();
  G.particles.draw(ctx);

  if (G.yesClicked) {
    // Yes response panel with b2 hearteyes
    drawPanel(ctx, W/2-200, H/2-80, 400, 160, P.pinkMid, { bevel:6 });
    drawText(ctx, CONFIG.yes_message.split('\n')[0], W/2, H/2-30,
      { size: 12, align:'center', color:P.cream, shadow:true });
    drawText(ctx, CONFIG.yes_message.split('\n')[1] || '', W/2, H/2+10,
      { size: 10, align:'center', color:P.butter });

    // b2 hearteyes reacting with joy
    drawHearteyes(ctx, W/2 + 220, H/2 - 20, 36);

    if (winTimer % 4 === 0) G.particles.hearts(W/2, H/2, 3);
    return;
  }

  // "YOU DID IT!" panel
  drawPanel(ctx, W/2-220, 60, 440, 100, P.pinkMid, { bevel:6 });
  drawText(ctx, 'YOU DID IT!', W/2, 105, { size: 18, align:'center', color:P.cream, shadow:true });
  drawText(ctx, `score: ${G.score}`, W/2, 135, { size: 9, align:'center', color:P.butter });

  // b2 hearteyes avatar alongside the proposal question
  drawHearteyes(ctx, W/2 + 205, 235, 32);

  // Proposal box
  drawPanel(ctx, W/2-180, 190, 360, 70, P.pinkBlush, { bevel:4, border: P.pinkDeep });
  drawText(ctx, CONFIG.proposal_question, W/2, 228,
    { size: 10, align:'center', color:P.pinkDeep, shadow:false });

  // YES button
  drawPanel(ctx, W/2-170, 285, 130, 40, P.pinkMid, { bevel:5 });
  drawText(ctx, 'YES!!', W/2-105, 311, { size: 11, color:P.cream });

  // NO button — moves away on hover/click
  const nb = G.noBtn;
  drawPanel(ctx, nb.x, nb.y, 100, 38, P.pinkDeep, { bevel:4 });
  drawText(ctx, 'hmm...', nb.x+50, nb.y+24, { size: 9, align:'center', color:P.cream });
}

function handleWinClick(mx, my) {
  if (G.yesClicked) return;

  if (mx > W/2-170 && mx < W/2-40 && my > 285 && my < 325) {
    G.yesClicked = true;
    SFX.heartBurst();
    G.particles.confetti(W/2, H/2);
    for (let i = 0; i < 5; i++) setTimeout(() => G.particles.hearts(W/2, H/2, 12), i * 150);
    return;
  }

  const nb = G.noBtn;
  if (mx > nb.x && mx < nb.x+100 && my > nb.y && my < nb.y+38) {
    nb.x = 20 + Math.random() * (W - 120);
    nb.y = 100 + Math.random() * (H - 160);
  }
}

// Mousemove makes NO button run away
canvas.addEventListener('mousemove', e => {
  if (G.state !== 'WIN_SCREEN' || G.yesClicked) return;
  const rect   = canvas.getBoundingClientRect();
  const scaleX = W / rect.width;
  const mx = (e.clientX - rect.left) * scaleX;
  const my = (e.clientY - rect.top) * scaleX;
  const nb = G.noBtn;
  if (mx > nb.x - 20 && mx < nb.x+120 && my > nb.y - 20 && my < nb.y+58) {
    nb.x = 20 + Math.random() * (W - 120);
    nb.y = 100 + Math.random() * (H - 160);
  }
});

// ─── LEVEL CALLBACKS (called by level modules) ───────────────────────────────
G.levelComplete = function(bonus = 0) {
  G.levelBonus = bonus;
  G.score += bonus;
  G.state = 'LEVEL_COMPLETE';
  completeTimer = 0;
  SFX.complete();
  G.particles.confetti(W/2, H/2);
  G.particles.stars(W/2, H/2, 15);
};

G.playerDied = function() {
  G.lives--;
  SFX.hurt();
  if (G.lives <= 0) {
    G.lives = 0;
    G.state = 'GAME_OVER';
    SFX.gameOver();
    stopBGM();
  }
};

// Start the loop
requestAnimationFrame(tick);
