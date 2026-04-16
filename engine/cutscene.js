// engine/cutscene.js — Full cutscene / dialogue system

import { W, H } from './renderer.js';

// ─────────────────────────────────────────────────────────────
// CHARACTER DEFINITIONS
// ─────────────────────────────────────────────────────────────
const CHARACTERS = {
  mahi: {
    name: 'mahi',
    nameColor: '#e91e8c',
    avatar: 'assets/sprites/player.png',
    isSprite: true,
    // Idle frame from PNG sheet (walkR1)
    frameX: 2707, frameY: 40, frameW: 125, frameH: 249,
  },
  rk: {
    name: 'raja katori',
    nameColor: '#f0a030',
    avatar: 'assets/cutscene/rk.png',
    isSprite: false,
  },
  b2_bawl: {
    name: 'b2',
    nameColor: '#ffe066',
    avatar: 'assets/cutscene/b2bawl.png',
    isSprite: false,
  },
  b2_sad: {
    name: 'b2',
    nameColor: '#ffe066',
    avatar: 'assets/cutscene/b2sad.png',
    isSprite: false,
  },
  b2_guilty: {
    name: 'b2',
    nameColor: '#ffe066',
    avatar: 'assets/cutscene/b2guilty.png',
    isSprite: false,
  },
  villain: {
    name: '???',
    nameColor: '#cc0000',
    avatar: 'assets/cutscene/villain.png',
    isSprite: false,
  },
  radish: {
    name: 'the radish',
    nameColor: '#7bc67e',
    avatar: 'assets/cutscene/radish.png',
    isSprite: false,
  },
  narrator: {
    name: '',
    nameColor: '#b0bec5',
    avatar: null,
    isSprite: false,
  },
};

// ─────────────────────────────────────────────────────────────
// CUTSCENE DIALOGUE DATA
// ─────────────────────────────────────────────────────────────
const CUTSCENES = {
  pre1: [
    { char: 'mahi',    text: 'omg is that u raja katori',                             side: 'left'  },
    { char: 'rk',      text: "i come bearing bad news. they got b2's ass",             side: 'right' },
    { char: 'mahi',    text: 'who?',                                                   side: 'left'  },
    { char: 'rk',      text: 'idk some random opps. wait here they come!',             side: 'right' },
    { char: 'rk',      text: 'i hope you still remember your taekwondo drills!!',      side: 'right' },
  ],
  pre2: [
    { char: 'mahi',    text: 'pfftt that was easy',                                    side: 'left'  },
    { char: 'rk',      text: "it sure was for you! well they dragged b2's ass down a damn delhi gutter", side: 'right' },
    { char: 'mahi',    text: '...',                                                    side: 'left'  },
    { char: 'rk',      text: '... i guess u better follow',                            side: 'right' },
  ],
  pre3: [
    { char: 'mahi',    text: 'um that was weird. why were there bombs and spikes in a delhi gutter', side: 'left' },
    { char: 'rk',      text: 'thats normal',                                           side: 'right' },
    { char: 'mahi',    text: '???',                                                    side: 'left'  },
    { char: 'rk',      text: 'i think you should take a break and relax before we finally get going...', side: 'right' },
    { char: 'rk',      text: 'to GURGAON',                                             side: 'right' },
    { char: 'mahi',    text: 'omg',                                                    side: 'left'  },
  ],
  pre4: [
    { char: 'mahi',    text: 'that was chill',                                         side: 'left'  },
    { char: 'rk',      text: "almost made you forget that we had to save b2 didn't it?", side: 'right' },
    { char: 'mahi',    text: 'omg it did',                                             side: 'left'  },
    { char: 'b2_bawl', text: 'help!!!',                                                side: 'right' },
    { char: 'villain', text: "go away. you don't want to risk your life for this",     side: 'right' },
    { char: 'mahi',    text: "you don't tell me what to do!!",                         side: 'left'  },
  ],
  final: [
    { char: 'narrator', text: 'the shadowy villain is defeated. the hood falls...'                   },
    { char: 'mahi',     text: 'YOU? i made YOU!!',                                     side: 'left'  },
    { char: 'radish',   text: 'yes u did. sorry, father',                              side: 'right' },
    { char: 'b2_sad',   text: 'why was i involved in this mess',                       side: 'left'  },
    { char: 'radish',   text: "honestly i didn't even beat her up. i literally found her in that condition", side: 'right' },
    { char: 'mahi',     text: '..',                                                    side: 'left'  },
    { char: 'rk',       text: '...',                                                   side: 'right' },
    { char: 'b2_guilty', text: 'thats true',                                           side: 'left'  },
    { char: 'radish',   text: 'anyway i should leave. but b2 has something to ask..', side: 'right' },
    { char: null,        special: 'letter_transition'                                               },
  ],
};

// ─────────────────────────────────────────────────────────────
// IMAGE CACHE + PRELOAD
// ─────────────────────────────────────────────────────────────
const _imgs = {};

function loadImg(src) {
  if (!src) return null;
  if (!_imgs[src]) {
    const img = new Image();
    img.src = src;
    _imgs[src] = img;
  }
  return _imgs[src];
}

// Preload all portrait images
for (const ch of Object.values(CHARACTERS)) {
  if (ch.avatar && !ch.isSprite) loadImg(ch.avatar);
}
// Also preload hearteyes (for WIN_SCREEN)
loadImg('assets/cutscene/hearteyes.jpg');

// Separate reference to player sheet (shared with assets.js via browser cache)
const _playerSheet = new Image();
_playerSheet.src = 'assets/sprites/player.png';

// ─────────────────────────────────────────────────────────────
// TEXT UTILITIES
// ─────────────────────────────────────────────────────────────

// Split text into lines that fit maxWidth (measures with current ctx font).
function wrapText(ctx, text, maxWidth) {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(test).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// Return the visible prefix of each wrapped line, truncated to typedChars total.
function getVisibleLines(ctx, fullText, typedChars, maxWidth) {
  const allLines = wrapText(ctx, fullText, maxWidth);
  const result = [];
  let remaining = typedChars;
  for (const line of allLines) {
    if (remaining <= 0) break;
    if (remaining >= line.length) {
      result.push(line);
      remaining -= line.length + 1; // +1 for the space stripped during wrap
    } else {
      result.push(line.slice(0, remaining));
      break;
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────
const BOX_H     = 110;
const BOX_Y     = H - BOX_H;           // 310
const AV_SIZE   = 80;
const AV_X      = 8;
const AV_Y      = BOX_Y + (BOX_H - AV_SIZE) / 2;  // 325
const AV_CX     = AV_X + AV_SIZE / 2;              // 48
const AV_CY     = AV_Y + AV_SIZE / 2;              // 365
const TEXT_X    = AV_X + AV_SIZE + 12;             // 100
const TEXT_W    = W - TEXT_X - 20;                 // 580
const FADE_DUR  = 15;   // frames for speaker-change fade
const CHARS_PER_FRAME = 0.5;  // 1 char per 2 frames

// ─────────────────────────────────────────────────────────────
// DRAW HELPERS
// ─────────────────────────────────────────────────────────────

function drawAvatar(ctx, char, bounceY, frame, isTyping) {
  const cx = AV_CX;
  const cy = AV_CY + bounceY;

  ctx.save();

  // Colored ring (drawn before clip — shows outside avatar circle)
  ctx.strokeStyle = char.nameColor;
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, AV_SIZE / 2 + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Clip to circle
  ctx.beginPath();
  ctx.arc(cx, cy, AV_SIZE / 2, 0, Math.PI * 2);
  ctx.clip();

  if (char.isSprite) {
    // Draw from player PNG sheet
    if (_playerSheet.complete && _playerSheet.naturalWidth) {
      const fx = char.frameX, fy = char.frameY, fw = char.frameW, fh = char.frameH;
      const scale = Math.min(AV_SIZE / fw, AV_SIZE / fh);
      const dw = fw * scale, dh = fh * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(_playerSheet, fx, fy, fw, fh,
        cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      ctx.fillStyle = char.nameColor;
      ctx.fillRect(AV_X, AV_Y + bounceY, AV_SIZE, AV_SIZE);
    }
  } else {
    const img = char.avatar ? loadImg(char.avatar) : null;
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.max(AV_SIZE / img.naturalWidth, AV_SIZE / img.naturalHeight);
      const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
      ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      // Fallback placeholder
      ctx.fillStyle = '#1a0a1a';
      ctx.fillRect(AV_X, AV_Y + bounceY, AV_SIZE, AV_SIZE);
      ctx.fillStyle = char.nameColor;
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(char.name[0]?.toUpperCase() || '?', cx, cy);
    }
  }

  ctx.restore();
}

function drawDialogueBox(ctx, slide, typedChars, frame, isTyping) {
  const charKey = slide.char;
  const char    = charKey ? CHARACTERS[charKey] : CHARACTERS.narrator;
  const isNarrator = !charKey || charKey === 'narrator';

  // ── Box background ──
  ctx.fillStyle = 'rgba(26,10,26,0.92)';
  ctx.fillRect(0, BOX_Y, W, BOX_H);

  // ── Top border ──
  ctx.fillStyle = '#e91e8c';
  ctx.fillRect(0, BOX_Y, W, 3);

  if (!isNarrator) {
    // ── Avatar with bounce while typing ──
    const bounceY = isTyping ? Math.sin(frame * 0.15) * 2 : 0;
    drawAvatar(ctx, char, bounceY, frame, isTyping);

    // ── Speaker name ──
    ctx.font = `9px 'Press Start 2P', monospace`;
    ctx.fillStyle   = char.nameColor;
    ctx.textAlign   = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(char.name, TEXT_X, BOX_Y + 24);
  }

  // ── Dialogue text ──
  const fullText = slide.text || '';
  ctx.font = isNarrator
    ? `italic 8px 'Press Start 2P', monospace`
    : `8px 'Press Start 2P', monospace`;

  const textX = isNarrator ? W / 2 : TEXT_X;
  const textW = isNarrator ? W - 80 : TEXT_W;
  ctx.textAlign = isNarrator ? 'center' : 'left';

  // Re-set font for measurement
  ctx.font = `8px 'Press Start 2P', monospace`;
  const lines = getVisibleLines(ctx, fullText, typedChars, textW);

  ctx.fillStyle = isNarrator ? '#b0bec5' : '#fff9f0';
  ctx.font = isNarrator
    ? `italic 8px 'Press Start 2P', monospace`
    : `8px 'Press Start 2P', monospace`;
  ctx.textBaseline = 'alphabetic';

  const lineY0 = isNarrator ? BOX_Y + 52 : BOX_Y + 44;
  lines.forEach((line, i) => {
    ctx.fillText(line, textX, lineY0 + i * 15);
  });

  // ── Advance indicator (▶ space) — blinks when done typing ──
  if (!isTyping) {
    const blink = Math.floor(frame / 30) % 2 === 0;
    if (blink) {
      ctx.font        = `8px 'Press Start 2P', monospace`;
      ctx.fillStyle   = '#f06292';
      ctx.textAlign   = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('▶ space', W - 12, BOX_Y + BOX_H - 8);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// ENVELOPE DRAWING (letter_transition)
// ─────────────────────────────────────────────────────────────
function drawEnvelope(ctx, cx, cy, flapT) {
  // flapT: 0 = flap closed (V pointing up), 1 = flap open (flat)
  const ew = 160, eh = 100;
  const ex = cx - ew / 2, ey = cy - eh / 2;

  // Drop shadow
  ctx.fillStyle = 'rgba(200,80,120,0.18)';
  ctx.fillRect(ex + 6, ey + 14, ew, eh);

  // Envelope body
  ctx.fillStyle = '#fff0f5';
  ctx.strokeStyle = '#e91e8c';
  ctx.lineWidth = 2;
  ctx.fillRect(ex, ey, ew, eh);
  ctx.strokeRect(ex, ey, ew, eh);

  // Interior fold lines (decorative V from bottom corners to center)
  ctx.strokeStyle = 'rgba(233,30,140,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ex,       ey + eh);
  ctx.lineTo(cx,       ey + eh * 0.55);
  ctx.lineTo(ex + ew,  ey + eh);
  ctx.stroke();

  // Left and right triangular fold shapes (seen when flap is open)
  if (flapT > 0.1) {
    const alpha = flapT * 0.35;
    ctx.fillStyle = `rgba(252,228,236,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(ex,      ey);
    ctx.lineTo(cx,      ey + eh * 0.5);
    ctx.lineTo(ex,      ey + eh);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(ex + ew, ey);
    ctx.lineTo(cx,      ey + eh * 0.5);
    ctx.lineTo(ex + ew, ey + eh);
    ctx.closePath();
    ctx.fill();
  }

  // The flap — triangle at top
  // Closed: apex at top-centre
  // Open: apex moves down to mid-envelope (flap lays flat)
  const apexY = ey + flapT * (eh * 0.5);
  ctx.fillStyle = '#fce4ec';
  ctx.strokeStyle = '#e91e8c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ex,      ey);
  ctx.lineTo(cx,      apexY);
  ctx.lineTo(ex + ew, ey);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Heart revealed as flap opens
  if (flapT > 0.5) {
    const hAlpha = (flapT - 0.5) * 2;
    ctx.globalAlpha = hAlpha;
    const hs = 22, hx = cx, hy = cy + 8;
    ctx.fillStyle = '#e91e8c';
    ctx.beginPath();
    ctx.moveTo(hx,       hy + hs * 0.35);
    ctx.bezierCurveTo(hx,       hy,          hx - hs, hy,          hx - hs, hy + hs * 0.35);
    ctx.bezierCurveTo(hx - hs,  hy + hs * 0.75, hx, hy + hs * 1.28, hx, hy + hs * 1.28);
    ctx.bezierCurveTo(hx,       hy + hs * 1.28, hx + hs, hy + hs * 0.75, hx + hs, hy + hs * 0.35);
    ctx.bezierCurveTo(hx + hs,  hy,          hx,       hy,          hx, hy + hs * 0.35);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ─────────────────────────────────────────────────────────────
// CUTSCENE PLAYER CLASS
// ─────────────────────────────────────────────────────────────
export class CutscenePlayer {
  constructor() {
    this.slides      = [];
    this.idx         = 0;
    this.onComplete  = null;
    this.done        = false;

    // Typewriter state
    this.typeTimer   = 0;
    this.typedChars  = 0;
    this.isTyping    = false;

    // Fade-transition state (speaker change)
    this.fading      = false;
    this.fadeDir     = 0;   // 1 = fading to black, -1 = fading in from black
    this.fadeAlpha   = 0;
    this.fadeTimer   = 0;

    // Special (letter_transition) state
    this.inSpecial   = false;
    this.specialTimer = 0;
    this.specialDone  = false;

    // Input state
    this._prevAdv    = false;
  }

  // ── Public API ──────────────────────────────────────────────

  start(name, onComplete) {
    this.slides     = CUTSCENES[name] ? [...CUTSCENES[name]] : [];
    this.idx        = 0;
    this.onComplete = onComplete;
    this.done       = false;
    this.fading     = false;
    this.fadeDir    = 0;
    this.fadeAlpha  = 0;
    this.inSpecial  = false;
    this.specialDone = false;
    this._prevAdv   = true; // start with prev=true to avoid auto-advance on first frame
    this._beginSlide();
  }

  // Called by game.js when space/enter/click is detected
  advance() {
    if (this.done || this.fading || this.inSpecial) return;

    const slide = this.slides[this.idx];
    if (!slide) return;

    if (this.isTyping) {
      // Skip typewriter — show full text immediately
      this.typedChars = (slide.text || '').length;
      this.isTyping   = false;
      return;
    }

    // Advance to next slide
    this._nextSlide();
  }

  // Called every game tick from CUTSCENE state
  update(ctx, frame, G) {
    if (this.done) return;

    // ── Key / click detection ──
    const advKey = !!(G.keys['Space'] || G.keys[' '] || G.keys['Enter']);
    if (advKey && !this._prevAdv) this.advance();
    this._prevAdv = advKey;

    if (G._csClick) { G._csClick = false; this.advance(); }

    // ── Draw scene background ──
    if (!this.inSpecial) {
      this._drawBackground(ctx, frame);
    }

    // ── Special transition (letter_transition) ──
    if (this.inSpecial) {
      this._updateLetterTransition(ctx, frame);
      return;
    }

    // ── Normal slide: typewriter ──
    const slide = this.slides[this.idx];
    if (!slide) { this._finish(); return; }

    if (this.isTyping) {
      this.typeTimer++;
      this.typedChars = Math.min(
        Math.floor(this.typeTimer / 2),
        (slide.text || '').length
      );
      if (this.typedChars >= (slide.text || '').length) {
        this.typedChars = (slide.text || '').length;
        this.isTyping   = false;
      }
    }

    // ── Draw dialogue box ──
    drawDialogueBox(ctx, slide, this.typedChars, frame, this.isTyping);

    // ── Fade overlay on top (for speaker-change transitions) ──
    if (this.fading) {
      if (this.fadeDir === 1) {
        // Fading to black
        this.fadeTimer++;
        this.fadeAlpha = this.fadeTimer / FADE_DUR;
        if (this.fadeTimer >= FADE_DUR) {
          // Black achieved → swap to new slide
          this.idx++;
          const next = this.slides[this.idx];
          if (!next) {
            this._finish();
            return;
          }
          if (next.special === 'letter_transition') {
            this.inSpecial    = true;
            this.specialTimer = 0;
            this.specialDone  = false;
            this.fading       = false;
            this.fadeAlpha    = 0;
            return;
          }
          this._initTypewriter();
          this.fadeDir   = -1;
          this.fadeTimer = 0;
          this.fadeAlpha = 1;
        }
      } else if (this.fadeDir === -1) {
        // Fading in from black
        this.fadeTimer++;
        this.fadeAlpha = 1 - this.fadeTimer / FADE_DUR;
        if (this.fadeTimer >= FADE_DUR) {
          this.fadeAlpha = 0;
          this.fading    = false;
          this.fadeDir   = 0;
        }
      }
      if (this.fadeAlpha > 0) {
        ctx.globalAlpha = Math.min(1, this.fadeAlpha);
        ctx.fillStyle   = '#000000';
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
    }
  }

  // ── Private methods ─────────────────────────────────────────

  _beginSlide() {
    if (this.idx >= this.slides.length) { this._finish(); return; }
    const slide = this.slides[this.idx];
    if (slide.special === 'letter_transition') {
      this.inSpecial    = true;
      this.specialTimer = 0;
      this.specialDone  = false;
    } else {
      this._initTypewriter();
    }
  }

  _initTypewriter() {
    const slide = this.slides[this.idx];
    this.typeTimer  = 0;
    this.typedChars = 0;
    this.isTyping   = (slide.text || '').length > 0;
  }

  _nextSlide() {
    const currentChar = this.slides[this.idx]?.char ?? null;
    const nextSlide   = this.slides[this.idx + 1];
    const nextChar    = nextSlide?.char ?? null;

    // Entering letter_transition → no speaker fade, just start immediately
    if (nextSlide?.special === 'letter_transition') {
      this.idx++;
      this.inSpecial    = true;
      this.specialTimer = 0;
      this.specialDone  = false;
      return;
    }

    // No next slide → finish
    if (!nextSlide) { this._finish(); return; }

    // Same speaker or narrator-to-narrator → instant transition
    if (nextChar === currentChar) {
      this.idx++;
      this._beginSlide();
      return;
    }

    // Different speaker → fade to black then reveal new slide
    this.fading    = true;
    this.fadeDir   = 1;
    this.fadeTimer = 0;
    this.fadeAlpha = 0;
  }

  _finish() {
    this.done = true;
    if (this.onComplete) this.onComplete();
  }

  _drawBackground(ctx, frame) {
    // Dark atmospheric background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#08050e');
    grad.addColorStop(0.7, '#0d0815');
    grad.addColorStop(1, '#160a10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle star field
    for (let i = 0; i < 40; i++) {
      // Deterministic "random" positions using prime-based hash
      const sx = ((i * 173 + 11) % W);
      const sy = ((i * 97  + 37) % (H - BOX_H - 20));
      const twinkle = 0.3 + 0.4 * Math.abs(Math.sin(frame * 0.02 + i * 0.8));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle   = '#ffffff';
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  // ── Letter transition ────────────────────────────────────────
  _updateLetterTransition(ctx, frame) {
    this.specialTimer++;
    const t = this.specialTimer;

    const PHASE1_END = 20;  // fade to pink
    const PHASE2_END = 50;  // envelope fly-in
    const PHASE3_END = 70;  // hold
    const PHASE4_END = 85;  // flap open
    // Phase 5: complete

    if (t <= PHASE1_END) {
      // Draw last slide's background, fade to pink
      this._drawBackground(ctx, frame);
      const alpha = t / PHASE1_END;
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = '#fce4ec';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;

    } else if (t <= PHASE2_END) {
      // Pink background + envelope flies from right to center
      ctx.fillStyle = '#fce4ec';
      ctx.fillRect(0, 0, W, H);

      const progress  = (t - PHASE1_END) / (PHASE2_END - PHASE1_END);
      const ease      = 1 - Math.pow(1 - progress, 3);  // ease-out cubic
      const startX    = W + 80;
      const envX      = startX + (W / 2 - startX) * ease;
      this._drawEnvelopeScene(ctx, envX, H / 2, 0);

    } else if (t <= PHASE3_END) {
      // Hold envelope centered
      ctx.fillStyle = '#fce4ec';
      ctx.fillRect(0, 0, W, H);
      this._drawEnvelopeScene(ctx, W / 2, H / 2, 0);

    } else if (t <= PHASE4_END) {
      // Flap opens
      ctx.fillStyle = '#fce4ec';
      ctx.fillRect(0, 0, W, H);
      const flapT = (t - PHASE3_END) / (PHASE4_END - PHASE3_END);
      this._drawEnvelopeScene(ctx, W / 2, H / 2, flapT);

    } else {
      // Final frame then complete
      ctx.fillStyle = '#fce4ec';
      ctx.fillRect(0, 0, W, H);
      this._drawEnvelopeScene(ctx, W / 2, H / 2, 1);

      if (!this.specialDone) {
        this.specialDone = true;
        // Short delay so the open envelope is visible one final moment
        setTimeout(() => this._finish(), 200);
      }
    }
  }

  _drawEnvelopeScene(ctx, cx, cy, flapT) {
    // Soft vignette
    const vig = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, W * 0.7);
    vig.addColorStop(0, 'rgba(252,228,236,0)');
    vig.addColorStop(1, 'rgba(193,80,120,0.18)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    drawEnvelope(ctx, cx, cy, flapT);

    // Flavour text below envelope
    ctx.font        = `8px 'Press Start 2P', monospace`;
    ctx.fillStyle   = '#c2185b';
    ctx.textAlign   = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('a letter...', cx, cy + 80);
  }
}

// ─────────────────────────────────────────────────────────────
// EXPORTS FOR WIN SCREEN
// ─────────────────────────────────────────────────────────────
export function getHearteyes() {
  return loadImg('assets/cutscene/hearteyes.jpg');
}

export function drawHearteyes(ctx, cx, cy, radius) {
  const img = loadImg('assets/cutscene/hearteyes.jpg');

  // Colored ring
  ctx.save();
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth   = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
  ctx.stroke();

  // Clipped image
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (img && img.complete && img.naturalWidth) {
    const scale = Math.min(radius * 2 / img.naturalWidth, radius * 2 / img.naturalHeight);
    const dw    = img.naturalWidth  * scale;
    const dh    = img.naturalHeight * scale;
    ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  } else {
    ctx.fillStyle = '#ffe066';
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}
