// levels/level3-art.js — The Studio (pixel-art region coloring)

import { CONFIG, PALETTE as P } from '../config.js';
import { drawText, drawPanel, W, H } from '../engine/renderer.js';
import { SFX } from '../engine/audio.js';

// ── Layout ────────────────────────────────────────────────────────────────────
const HUD_H    = 36;
const CANVAS_X = 52;
const CANVAS_Y = HUD_H + 16;
const CANVAS_W = 400;
const CANVAS_H = H - HUD_H - 52;    // ≈316px

const PANEL_X  = CANVAS_X + CANVAS_W + 10;  // 462
const PANEL_W  = W - PANEL_X - 6;            // ≈232px

// ── Background ────────────────────────────────────────────────────────────────
const level3Bg = new Image();
level3Bg.src = 'assets/background/level3bg.jpg';

// ── Art images ────────────────────────────────────────────────────────────────
const LEVEL3_ART_IMAGES = [
  { name: 'butterfly', path: 'assets/level3art/butterfly.jpg' },
  { name: 'heart',     path: 'assets/level3art/heart.jpg'     },
];

// ── Base diverse palette (always included, deduplicated with image colors) ────
const BASE_PALETTE = [
  '#ff1744', '#ff6d00', '#ffd600', '#76ff03',
  '#00c853', '#00bcd4', '#2979ff', '#aa00ff',
  '#ff80ab', '#ffffff', '#9e9e9e', '#1a0a1a',
];

// ── Brush cursor ──────────────────────────────────────────────────────────────
const BRUSH_CURSOR = (() => {
  const s = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>
    <!-- Handle: long thin rectangle, top-right to mid -->
    <rect x='17' y='1' width='5' height='16' rx='1.5'
          fill='%238b5e3c' stroke='%231a0a1a' stroke-width='1'/>
    <!-- Metal ferrule (band where handle meets bristles) -->
    <rect x='16' y='15' width='7' height='4' rx='0.5'
          fill='%23aaaaaa' stroke='%231a0a1a' stroke-width='1'/>
    <!-- Bristles: tapered wedge, pointing down-left -->
    <path d='M16 19 L23 19 L20 30 Q19.5 31.5 18.5 31 L15 29 Q13.5 28 14 26 Z'
          fill='%23e91e8c' stroke='%231a0a1a' stroke-width='1'/>
    <!-- Bristle highlight -->
    <line x1='18' y1='20' x2='16.5' y2='28'
          stroke='%23ff80ab' stroke-width='0.8' stroke-linecap='round'/>
  </svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(s)}") 20 31, crosshair`;
})();

const MATCH_THRESHOLD = 0.75;
const SWATCH = 26, SWATCH_G = 4, PAL_COLS = 4;

// ── State ─────────────────────────────────────────────────────────────────────
let state = {};

// ═════════════════════════════════════════════════════════════════════════════
const Level3 = {
  init(G) {
    const randomIndex = Math.floor(Math.random() * LEVEL3_ART_IMAGES.length);
    state = {
      artIndex: randomIndex, art: null,
      loading: true, loadError: null,
      selectedColor: '#ffd600',
      timer: CONFIG.l3_timer_seconds * 60,
      undoStack: [], submitted: false,
      showResult: false, resultTimer: 0,
      completionPct: 0, accuracyPct: 0, matchPct: 0,
      score: 0, passed: false,
      showHint: false, hoverRegionId: 0,
      hintBob: 0, frameCount: 0,
    };
    const canvas = document.getElementById('game-canvas');
    canvas.style.cursor = BRUSH_CURSOR;
    state._onClick = e => handleCanvasClick(e, canvas, G);
    state._onMove  = e => handleCanvasHover(e, canvas);
    state._onTouch = e => { e.preventDefault(); handleCanvasClick(e.touches[0], canvas, G); };
    canvas.addEventListener('click',      state._onClick);
    canvas.addEventListener('mousemove',  state._onMove);
    canvas.addEventListener('touchstart', state._onTouch, { passive: false });
    loadArtLevel(randomIndex);
  },

  update(G) {
    state.frameCount++;
    state.hintBob += 0.05;
    if (state.loading || state.loadError) return;
    if (state.submitted || state.showResult) {
      if (++state.resultTimer > 100) G.levelComplete(state.score);
      return;
    }
    if (--state.timer <= 0) { state.timer = 0; submitArt(G); return; }
    updateRegionStats();
    if (state.matchPct >= 1) submitArt(G);
    if (state.frameCount % 60 === 0) G.particles.petals(PANEL_X + 60, H / 2, 2);
  },

  draw(G, ctx) {
    drawStudioBg(ctx);
    drawArtCanvas(ctx);
    drawRightPanel(ctx);
    drawCustomer(ctx);
    G.particles.draw(ctx);
    if (state.showResult) drawResultOverlay(ctx);
    if (state.frameCount < 300 && !state.showResult) {
      drawText(ctx, 'click a region to fill it', CANVAS_X + CANVAS_W / 2, H - 8,
        { size: 6, align: 'center', color: P.pinkDeep });
    }
  },

  destroy() {
    const canvas = document.getElementById('game-canvas');
    canvas.style.cursor = '';
    canvas.removeEventListener('click',      state._onClick);
    canvas.removeEventListener('mousemove',  state._onMove);
    canvas.removeEventListener('touchstart', state._onTouch);
  },

  onComplete() {},
};

// ── Image loading ─────────────────────────────────────────────────────────────
function loadImageFromAssets(path) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed: ${path}`));
    img.src = path;
  });
}

async function loadArtLevel(index) {
  const i = ((index % LEVEL3_ART_IMAGES.length) + LEVEL3_ART_IMAGES.length) % LEVEL3_ART_IMAGES.length;
  Object.assign(state, {
    loading: true, loadError: null, artIndex: i,
    hoverRegionId: 0, undoStack: [],
    completionPct: 0, accuracyPct: 0, matchPct: 0,
    submitted: false, showResult: false,
    timer: CONFIG.l3_timer_seconds * 60,
  });
  try {
    const image = await loadImageFromAssets(LEVEL3_ART_IMAGES[i].path);
    state.art     = extractRegionsFromImage(image, LEVEL3_ART_IMAGES[i]);
    state.loading = false;
    // Start selected color as first image-extracted color
    if (state.art.palette.length) state.selectedColor = state.art.palette[0];
    updateRegionStats();
  } catch (err) {
    state.loadError = err.message;
    state.loading   = false;
  }
}

// ── Region extraction ─────────────────────────────────────────────────────────
/**
 * Extracts clickable color regions from a JPEG image.
 *
 * Strategy:
 *  1. Downsample the image to a coarse grid (maxCells=40) using SMOOTH scaling
 *     so JPEG artifacts average out — fewer, cleaner color regions.
 *  2. BFS flood-fill with generous color-distance threshold (60) to merge
 *     nearby shades into single regions.
 *  3. Discard noise (< 10px), merge orphan pixels into neighbours.
 *  4. Build a per-image dynamic palette: dominant image colors + diverse base.
 *  5. Create a HIGH-RES greyscale silhouette (full display resolution, smooth).
 *  6. Paint canvas starts fully transparent — silhouette shows through unfilled.
 */
function extractRegionsFromImage(image, info) {
  // ── 1. Grid dimensions ──
  const MAX_CELLS = 30;
  const scl   = Math.min(MAX_CELLS / image.naturalWidth, MAX_CELLS / image.naturalHeight, 1);
  const gridW = Math.max(8,  Math.floor(image.naturalWidth  * scl));
  const gridH = Math.max(8,  Math.floor(image.naturalHeight * scl));
  const cell  = Math.max(4,  Math.floor(Math.min(CANVAS_W / gridW, CANVAS_H / gridH)));
  const drawW = gridW * cell;
  const drawH = gridH * cell;
  const drawX = CANVAS_X + Math.floor((CANVAS_W - drawW) / 2);
  const drawY = CANVAS_Y + Math.floor((CANVAS_H - drawH) / 2);

  // ── 2. Sample at grid resolution WITH smoothing (averages JPEG artifacts) ──
  const smp    = makeCanvas(gridW, gridH);
  const smpCtx = smp.getContext('2d', { willReadFrequently: true });
  smpCtx.imageSmoothingEnabled = true;
  smpCtx.imageSmoothingQuality = 'high';
  smpCtx.drawImage(image, 0, 0, gridW, gridH);
  const { data } = smpCtx.getImageData(0, 0, gridW, gridH);

  // Detect background: sample all four corners, take the most common
  const corners = [
    getPixelColor(data, gridW, 0, 0),
    getPixelColor(data, gridW, gridW-1, 0),
    getPixelColor(data, gridW, 0, gridH-1),
    getPixelColor(data, gridW, gridW-1, gridH-1),
  ];
  // Use the lightest corner as background (most images have light/white bg)
  const bgColor = corners.reduce((a, b) => (a.r + a.g + a.b > b.r + b.g + b.b ? a : b));

  const cells = Array.from({ length: gridH }, (_, y) =>
    Array.from({ length: gridW }, (_, x) => {
      const c = getPixelColor(data, gridW, x, y);
      // Skip transparent, near-background, or near-white pixels
      if (c.a < 40) return null;
      if (colorDist(c, bgColor) < 24) return null;
      return c;
    })
  );

  // ── 3. BFS flood-fill ──
  const regionMap = Array.from({ length: gridH }, () => new Array(gridW).fill(0));
  const regions   = [];
  let nextId      = 1;

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (!cells[y][x] || regionMap[y][x]) continue;
      const seed   = cells[y][x];
      const pixels = [];
      const queue  = [[x, y]];
      regionMap[y][x] = nextId;
      let rS = 0, gS = 0, bS = 0;

      while (queue.length) {
        const [px, py] = queue.pop();
        pixels.push({ x: px, y: py });
        const c = cells[py][px];
        rS += c.r; gS += c.g; bS += c.b;
        for (const [nx, ny] of [[px+1,py],[px-1,py],[px,py+1],[px,py-1]]) {
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
          if (regionMap[ny][nx] || !cells[ny][nx]) continue;
          // Threshold — tight enough to keep distinct colors separate, loose enough to merge JPEG noise
          if (colorDist(seed, cells[ny][nx]) > 45) continue;
          regionMap[ny][nx] = nextId;
          queue.push([nx, ny]);
        }
      }

      // Discard noise (small enough not to lose real detail at 30-cell grid)
      if (pixels.length < 6) {
        pixels.forEach(p => { regionMap[p.y][p.x] = 0; });
        continue;
      }

      const n = pixels.length;
      const avg = { r: Math.round(rS/n), g: Math.round(gS/n), b: Math.round(bS/n), a: 255 };
      regions.push({ id: nextId, pixels, originalColor: rgbToHex(avg), correctColor: '', currentColor: 'transparent', filled: false });
      nextId++;
    }
  }

  // ── 4. Dynamic palette: dominant image colors + diverse base ──
  const palette = buildPalette(regions);

  // Assign correctColor using the full combined palette
  for (const r of regions) {
    r.correctColor  = nearestFrom(r.originalColor, palette);
    r.currentColor  = 'transparent';  // unfilled = silhouette shows through
  }

  // ── 5. High-res greyscale silhouette (smooth, at display resolution) ──
  const silCanvas = makeCanvas(drawW, drawH);
  const silCtx    = silCanvas.getContext('2d', { willReadFrequently: true });
  silCtx.imageSmoothingEnabled = true;
  silCtx.imageSmoothingQuality = 'high';
  silCtx.drawImage(image, 0, 0, drawW, drawH);
  const silData = silCtx.getImageData(0, 0, drawW, drawH);
  const sd = silData.data;
  for (let i = 0; i < sd.length; i += 4) {
    // Luminance-weighted greyscale
    const g = 0.299 * sd[i] + 0.587 * sd[i+1] + 0.114 * sd[i+2];
    // Blend toward the cream canvas background (makes it feel like pencil sketch)
    sd[i]   = Math.round(g * 0.38 + 245 * 0.62);
    sd[i+1] = Math.round(g * 0.38 + 240 * 0.62);
    sd[i+2] = Math.round(g * 0.38 + 232 * 0.62);
  }
  silCtx.putImageData(silData, 0, 0);

  // ── 6. Small reference thumbnail ──
  const refScale  = Math.min((PANEL_W - 8) / image.naturalWidth, 64 / image.naturalHeight);
  const refW      = Math.round(image.naturalWidth  * refScale);
  const refH      = Math.round(image.naturalHeight * refScale);
  const refCanvas = makeCanvas(refW, refH);
  const refCtx    = refCanvas.getContext('2d');
  refCtx.imageSmoothingEnabled = true;
  refCtx.imageSmoothingQuality = 'high';
  refCtx.drawImage(image, 0, 0, refW, refH);

  // ── 7. Paint canvas (transparent — only filled regions are drawn) ──
  const paintCanvas = makeCanvas(drawW, drawH);
  const paintCtx    = paintCanvas.getContext('2d');
  paintCtx.imageSmoothingEnabled = false;

  const art = {
    name: info.name,
    image, gridW, gridH, cellSize: cell,
    drawX, drawY, drawW, drawH,
    regionMap, regions,
    regionById:       new Map(regions.map(r => [r.id, r])),
    palette,          // dynamic per-image palette
    silhouetteCanvas: silCanvas,
    refCanvas, refW, refH,
    paintCanvas, paintCtx,
  };
  return art;
}

// ── Dynamic palette builder ───────────────────────────────────────────────────
/**
 * Extract the dominant colors from the image's regions (weighted by area),
 * then merge with a diverse base palette and deduplicate close colors.
 */
function buildPalette(regions) {
  // Sort by pixel count descending
  const sorted = [...regions].sort((a, b) => b.pixels.length - a.pixels.length);

  const imageCols = [];
  for (const r of sorted) {
    if (imageCols.length >= 10) break;
    const rgb = hexToRgb(r.originalColor);
    // Skip near-white / near-background
    if (rgb.r > 230 && rgb.g > 225 && rgb.b > 215) continue;
    // Skip near-black
    if (rgb.r < 30 && rgb.g < 30 && rgb.b < 30) continue;
    // Deduplicate: skip if too close to an already-added image color
    if (imageCols.some(c => colorDist(hexToRgb(c), rgb) < 30)) continue;
    imageCols.push(r.originalColor);
  }

  // Add base palette colors that are not too close to any image color
  const combined = [...imageCols];
  for (const bc of BASE_PALETTE) {
    const bcRgb = hexToRgb(bc);
    if (!combined.some(c => colorDist(hexToRgb(c), bcRgb) < 22)) {
      combined.push(bc);
    }
  }

  // Always include white and black
  if (!combined.includes('#ffffff')) combined.push('#ffffff');
  if (!combined.includes('#1a0a1a')) combined.push('#1a0a1a');

  return combined.slice(0, 24);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function renderCanvas(ctx) {
  // Canvas bg
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);

  if (state.loading) {
    drawText(ctx, 'loading...', CANVAS_X + CANVAS_W/2, CANVAS_Y + CANVAS_H/2,
      { size: 9, align: 'center', color: P.pinkDeep });
    return;
  }
  if (state.loadError || !state.art) {
    drawText(ctx, 'image load error', CANVAS_X + CANVAS_W/2, CANVAS_Y + CANVAS_H/2,
      { size: 8, align: 'center', color: P.coral });
    return;
  }

  const art = state.art;
  ctx.save();

  // 1. Greyscale silhouette — smooth, high-res, acts as the pencil-sketch guide
  ctx.imageSmoothingEnabled = false;    // we pre-smoothed it; keep crisp at display size
  ctx.drawImage(art.silhouetteCanvas, art.drawX, art.drawY);

  // 2. Hint layer (faint correct palette colors — toggled)
  if (state.showHint) {
    ctx.globalAlpha = 0.30;
    for (const r of art.regions) {
      ctx.fillStyle = r.correctColor;
      for (const { x, y } of r.pixels) {
        ctx.fillRect(art.drawX + x*art.cellSize, art.drawY + y*art.cellSize, art.cellSize, art.cellSize);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 3. Player fills (transparent paint canvas — only colored regions show)
  ctx.drawImage(art.paintCanvas, art.drawX, art.drawY);

  // 4. Coloring-book borders — only draw edges between DIFFERENT region IDs
  //    (far fewer lines than drawing every cell boundary)
  ctx.strokeStyle = 'rgba(40,20,40,0.45)';
  ctx.lineWidth   = 1;
  const cs = art.cellSize;
  for (let y = 0; y < art.gridH; y++) {
    for (let x = 0; x < art.gridW; x++) {
      const id = art.regionMap[y][x];
      if (!id) continue;
      const px = art.drawX + x * cs, py2 = art.drawY + y * cs;
      // Right edge
      if (x === art.gridW-1 || art.regionMap[y][x+1] !== id) {
        ctx.beginPath(); ctx.moveTo(px+cs, py2); ctx.lineTo(px+cs, py2+cs); ctx.stroke();
      }
      // Bottom edge
      if (y === art.gridH-1 || art.regionMap[y+1]?.[x] !== id) {
        ctx.beginPath(); ctx.moveTo(px, py2+cs); ctx.lineTo(px+cs, py2+cs); ctx.stroke();
      }
      // Left edge (outer boundary)
      if (x === 0 || !art.regionMap[y][x-1]) {
        ctx.beginPath(); ctx.moveTo(px, py2); ctx.lineTo(px, py2+cs); ctx.stroke();
      }
      // Top edge (outer boundary)
      if (y === 0 || !art.regionMap[y-1]?.[x]) {
        ctx.beginPath(); ctx.moveTo(px, py2); ctx.lineTo(px+cs, py2); ctx.stroke();
      }
    }
  }

  // 5. Hover highlight
  if (state.hoverRegionId) {
    const hr = art.regionById.get(state.hoverRegionId);
    if (hr) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      for (const { x, y } of hr.pixels) {
        ctx.fillRect(art.drawX + x*cs, art.drawY + y*cs, cs, cs);
      }
    }
  }

  ctx.restore();
}

function redrawRegion(art, region) {
  const ctx = art.paintCtx;
  const cs  = art.cellSize;
  if (!region.filled) {
    // Clear to transparent so the silhouette shows through
    for (const { x, y } of region.pixels) ctx.clearRect(x*cs, y*cs, cs, cs);
  } else {
    ctx.fillStyle = region.currentColor;
    for (const { x, y } of region.pixels) ctx.fillRect(x*cs, y*cs, cs, cs);
  }
}

// ── Interaction ───────────────────────────────────────────────────────────────
function handleCanvasClick(e, canvas, G) {
  if (state.loading || state.loadError || !state.art || state.submitted || state.showResult) return;
  const { sx, sy } = canvasCoords(e, canvas);
  if (handlePanelClick(sx, sy, G)) return;
  const rid = regionAt(sx, sy);
  if (rid) { fillRegionById(rid, state.selectedColor); SFX.paint(); }
}

function handleCanvasHover(e, canvas) {
  if (!state.art || state.submitted || state.showResult) return;
  state.hoverRegionId = regionAt(...Object.values(canvasCoords(e, canvas)));
}

function fillRegionById(regionId, color) {
  const region = state.art?.regionById.get(regionId);
  if (!region || region.currentColor === color) return;
  state.undoStack.push({ regionId, prev: region.currentColor, prevFilled: region.filled });
  if (state.undoStack.length > 15) state.undoStack.shift();
  region.currentColor = color;
  region.filled       = true;
  redrawRegion(state.art, region);
  updateRegionStats();
}

function undoFill() {
  const last = state.undoStack.pop();
  if (!last || !state.art) return;
  const region = state.art.regionById.get(last.regionId);
  if (!region) return;
  region.currentColor = last.prev;
  region.filled       = last.prevFilled;
  redrawRegion(state.art, region);
  updateRegionStats();
}

// ── Stats & scoring ───────────────────────────────────────────────────────────
// Color is "correct" if within distance 75 of the region's original sampled color.
// This avoids penalising the player for picking a visually matching shade that
// doesn't exactly equal the auto-assigned correctColor hex.
const CORRECT_DIST = 75;

function updateRegionStats() {
  const art = state.art;
  if (!art || !art.regions.length) { state.completionPct = state.accuracyPct = state.matchPct = 0; return; }
  let filled = 0, correct = 0;
  for (const r of art.regions) {
    if (!r.filled) continue;
    filled++;
    if (colorDist(hexToRgb(r.currentColor), hexToRgb(r.originalColor)) < CORRECT_DIST) correct++;
  }
  state.completionPct = filled  / art.regions.length;
  state.accuracyPct   = filled  > 0 ? correct / filled : 0;
  state.matchPct      = correct / art.regions.length;
}

function submitArt(G) {
  if (state.submitted || !state.art) return;
  updateRegionStats();
  const passed  = state.matchPct >= MATCH_THRESHOLD;
  state.submitted  = true;
  state.showResult = true;
  state.resultTimer = 0;
  state.passed  = passed;
  state.score   = passed
    ? Math.floor(state.matchPct * 280) + Math.floor(state.accuracyPct * 120)
      + (state.timer > CONFIG.l3_timer_seconds * 60 * 0.5 ? 60 : 0)
    : Math.floor(state.matchPct * 80);
  SFX[passed ? 'complete' : 'hurt']();
  if (passed) {
    G.particles.confetti(CANVAS_X + CANVAS_W/2, CANVAS_Y + CANVAS_H/2);
    G.particles.hearts(CANVAS_X + CANVAS_W/2, CANVAS_Y + CANVAS_H/2, 10);
  }
}

// ── Draw helpers ──────────────────────────────────────────────────────────────
function drawStudioBg(ctx) {
  if (level3Bg.complete && level3Bg.naturalWidth) {
    coverImage(ctx, level3Bg, 0, HUD_H, W, H - HUD_H); return;
  }
  ctx.fillStyle = P.pinkBlush; ctx.fillRect(0, HUD_H, W, H - HUD_H);
  ctx.fillStyle = P.midBrown;  ctx.fillRect(0, H - 34, W, 34);
}

function drawArtCanvas(ctx) {
  // Easel legs
  ctx.fillStyle = P.midBrown;
  ctx.fillRect(CANVAS_X - 4, CANVAS_Y + CANVAS_H, 8, 32);
  ctx.fillRect(CANVAS_X + CANVAS_W - 4, CANVAS_Y + CANVAS_H, 8, 32);
  ctx.strokeStyle = P.darkOutline; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_X + CANVAS_W/2, CANVAS_Y + CANVAS_H);
  ctx.lineTo(CANVAS_X + CANVAS_W/2 + 14, CANVAS_Y + CANVAS_H + 32);
  ctx.stroke();
  // Frame
  ctx.fillStyle = '#fff';
  ctx.fillRect(CANVAS_X - 8, CANVAS_Y - 8, CANVAS_W + 16, CANVAS_H + 16);
  ctx.strokeStyle = P.darkOutline; ctx.lineWidth = 3;
  ctx.strokeRect(CANVAS_X - 8, CANVAS_Y - 8, CANVAS_W + 16, CANVAS_H + 16);
  renderCanvas(ctx);
  ctx.strokeStyle = 'rgba(0,0,0,0.10)'; ctx.lineWidth = 5;
  ctx.strokeRect(CANVAS_X, CANVAS_Y, CANVAS_W, CANVAS_H);
}

function drawRightPanel(ctx) {
  const px = PANEL_X;

  // ── Reference thumbnail ──
  const refBoxY = CANVAS_Y, refBoxH = 72;
  drawPanel(ctx, px, refBoxY, PANEL_W, refBoxH, '#fff9f0', { bevel: 3, border: P.pinkDeep });
  drawText(ctx, 'REFERENCE', px + PANEL_W/2, refBoxY + 10,
    { size: 5, align: 'center', color: P.pinkDeep });
  const art = state.art;
  if (art?.refCanvas) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(art.refCanvas,
      px + Math.floor((PANEL_W - art.refW) / 2),
      refBoxY + 13);
  }

  // ── Timer & match % ──
  const infoY = refBoxY + refBoxH + 4;
  const sec  = Math.ceil(state.timer / 60);
  drawText(ctx, `${sec}s`, px + 26, infoY + 14,
    { size: 11, align: 'center', color: sec < 10 ? P.coral : P.butter, shadow: true });
  const mPct = Math.floor(state.matchPct * 100);
  drawText(ctx, `${mPct}%`, px + PANEL_W - 26, infoY + 14,
    { size: 11, align: 'center', color: mPct >= 75 ? P.mint : mPct >= 40 ? P.butter : P.coral, shadow: true });
  drawText(ctx, 'time',  px + 26,          infoY + 24, { size: 5, align: 'center', color: P.pinkBlush });
  drawText(ctx, 'match', px + PANEL_W - 26, infoY + 24, { size: 5, align: 'center', color: P.pinkBlush });

  // ── Dynamic palette ──
  const palette = art?.palette ?? BASE_PALETTE;
  const palCols = PAL_COLS;
  const palRows = Math.ceil(palette.length / palCols);
  const palY    = infoY + 34;
  const palPanH = palRows * (SWATCH + SWATCH_G) + 10;
  drawPanel(ctx, px - 2, palY - 6, PANEL_W + 4, palPanH, '#fce4ec', { bevel: 3, border: P.pinkDeep });

  for (let i = 0; i < palette.length; i++) {
    const col = i % palCols, row = Math.floor(i / palCols);
    const sw  = Math.floor((PANEL_W - (palCols - 1) * SWATCH_G) / palCols);
    const sx  = px + col * (sw + SWATCH_G);
    const sy  = palY + row * (SWATCH + SWATCH_G);
    ctx.fillStyle   = palette[i];
    ctx.fillRect(sx, sy, sw, SWATCH);
    const sel = palette[i] === state.selectedColor;
    ctx.strokeStyle = sel ? '#ffffff' : P.darkOutline;
    ctx.lineWidth   = sel ? 3 : 1;
    ctx.strokeRect(sx, sy, sw, SWATCH);
  }

  const btnBase = palY + palPanH + 4;

  // Hint
  drawPanel(ctx, px, btnBase,      PANEL_W, 22, state.showHint ? P.pinkMid : '#ccc', { bevel: 2 });
  drawText(ctx, 'HINT', px + PANEL_W/2, btnBase + 15,
    { size: 5, align: 'center', color: state.showHint ? P.cream : P.darkOutline });

  // Undo
  drawPanel(ctx, px, btnBase + 28, PANEL_W, 22, P.pinkDeep, { bevel: 2 });
  drawText(ctx, `UNDO (${state.undoStack.length})`, px + PANEL_W/2, btnBase + 43,
    { size: 5, align: 'center', color: P.cream });

  // Submit
  if (state.matchPct >= MATCH_THRESHOLD && !state.submitted) {
    drawPanel(ctx, px, btnBase + 56, PANEL_W, 30, P.hotMagenta, { bevel: 3 });
    drawText(ctx, 'SUBMIT!', px + PANEL_W/2, btnBase + 76,
      { size: 7, align: 'center', color: P.cream, shadow: true });
  }
}

function drawCustomer(ctx) {
  const cx  = CANVAS_X + CANVAS_W + 22, cy = H - 40;
  const bob = Math.sin(state.hintBob) * 2;
  ctx.fillStyle = P.pinkMid; ctx.strokeStyle = P.darkOutline; ctx.lineWidth = 2;
  ctx.fillRect(cx-10, cy-26+bob, 20, 22); ctx.strokeRect(cx-10, cy-26+bob, 20, 22);
  ctx.fillStyle = P.pinkBlush;
  ctx.fillRect(cx-8, cy-40+bob, 16, 16); ctx.strokeRect(cx-8, cy-40+bob, 16, 16);
  ctx.fillStyle = P.darkOutline;
  ctx.fillRect(cx-4, cy-34+bob, 2, 2); ctx.fillRect(cx+2, cy-34+bob, 2, 2);

  const hint = state.matchPct >= MATCH_THRESHOLD ? 'submit!!'
    : state.matchPct > 0.4 ? 'great colors!'
    : state.completionPct > 0.15 ? 'keep going!' : 'paint me!';
  const bx = cx - 52, by = cy - 64 + bob;
  drawPanel(ctx, bx, by, 84, 20, P.cream, { bevel: 2, border: P.pinkDeep });
  drawText(ctx, hint, bx + 42, by + 13, { size: 5, align: 'center', color: P.pinkDeep });
  ctx.fillStyle = P.cream;
  ctx.beginPath();
  ctx.moveTo(cx-10, by+20); ctx.lineTo(cx-6, by+30); ctx.lineTo(cx-2, by+20); ctx.fill();
}

function drawResultOverlay(ctx) {
  ctx.fillStyle = 'rgba(26,10,26,0.65)'; ctx.fillRect(0, 0, W, H);
  drawPanel(ctx, W/2-170, H/2-76, 340, 152, P.pinkMid, { bevel: 6 });
  drawText(ctx, state.passed ? 'NICE WORK!' : "TIME'S UP!", W/2, H/2-38,
    { size: 16, align: 'center', color: P.cream, shadow: true });
  const pct = Math.floor(state.matchPct * 100);
  drawText(ctx, `${pct}% color match`, W/2, H/2,
    { size: 9, align: 'center', color: pct >= 75 ? P.mint : P.butter });
  drawText(ctx, state.passed ? `+${state.score} pts  ✓ level clear!` : 'need 75% — keep painting!',
    W/2, H/2+28, { size: 7, align: 'center', color: state.passed ? P.butter : P.coral });
}

// ── Panel click handler ───────────────────────────────────────────────────────
function handlePanelClick(mx, my, G) {
  const px      = PANEL_X;
  const art     = state.art;
  const palette = art?.palette ?? BASE_PALETTE;
  const palCols = PAL_COLS;
  const palRows = Math.ceil(palette.length / palCols);
  const sw      = art ? Math.floor((PANEL_W - (palCols - 1) * SWATCH_G) / palCols) : SWATCH;
  const infoY   = CANVAS_Y + 72 + 4;
  const palY    = infoY + 34;
  const palPanH = palRows * (SWATCH + SWATCH_G) + 10;
  const btnBase = palY + palPanH + 4;

  for (let i = 0; i < palette.length; i++) {
    const col = i % palCols, row = Math.floor(i / palCols);
    const sx = px + col * (sw + SWATCH_G), sy = palY + row * (SWATCH + SWATCH_G);
    if (inBox(mx, my, sx, sy, sw, SWATCH)) { state.selectedColor = palette[i]; return true; }
  }

  if (inBox(mx, my, px, btnBase,      PANEL_W, 22)) { state.showHint = !state.showHint; return true; }
  if (inBox(mx, my, px, btnBase + 28, PANEL_W, 22)) { undoFill(); return true; }

  if (state.matchPct >= MATCH_THRESHOLD && !state.submitted &&
      inBox(mx, my, px, btnBase + 56, PANEL_W, 30)) {
    submitArt(G); return true;
  }
  return false;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function canvasCoords(e, canvas) {
  const r = canvas.getBoundingClientRect(), s = W / r.width;
  return { sx: (e.clientX - r.left) * s, sy: (e.clientY - r.top) * s };
}

function regionAt(sx, sy) {
  const art = state.art;
  if (!art) return 0;
  const gx = Math.floor((sx - art.drawX) / art.cellSize);
  const gy = Math.floor((sy - art.drawY) / art.cellSize);
  if (gx < 0 || gx >= art.gridW || gy < 0 || gy >= art.gridH) return 0;
  return art.regionMap[gy][gx] || 0;
}

function inBox(mx, my, x, y, w, h) { return mx >= x && mx < x+w && my >= y && my < y+h; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width=w; c.height=h; return c; }

function getPixelColor(data, width, x, y) {
  const i = (y * width + x) * 4;
  return { r: data[i], g: data[i+1], b: data[i+2], a: data[i+3] };
}
function colorDist(a, b) {
  return Math.sqrt((a.r-b.r)**2 + (a.g-b.g)**2 + (a.b-b.b)**2);
}
function rgbToHex({ r, g, b }) { return `#${h2(r)}${h2(g)}${h2(b)}`; }
function h2(v) { return Math.max(0, Math.min(255, v)).toString(16).padStart(2,'0'); }
function normalizeHex(h) { return (h||'').toLowerCase(); }
function hexToRgb(hex) {
  const h = normalizeHex(hex).replace('#','');
  return { r: parseInt(h.slice(0,2),16)||0, g: parseInt(h.slice(2,4),16)||0, b: parseInt(h.slice(4,6),16)||0, a: 255 };
}
function nearestFrom(hex, palette) {
  const rgb = hexToRgb(hex);
  let best = palette[0], bd = Infinity;
  for (const c of palette) { const d = colorDist(rgb, hexToRgb(c)); if (d < bd) { best = c; bd = d; } }
  return best;
}
function coverImage(ctx, img, x, y, w, h) {
  const s = Math.max(w/img.naturalWidth, h/img.naturalHeight);
  ctx.drawImage(img, (img.naturalWidth - w/s)/2, (img.naturalHeight - h/s)/2, w/s, h/s, x, y, w, h);
}

export default Level3;
