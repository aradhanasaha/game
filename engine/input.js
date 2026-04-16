// engine/input.js — Keyboard + touch input, writes into G.keys

export function initInput(G) {
  const keys = G.keys;

  // Keyboard
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    keys[e.key]  = true;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) {
      e.preventDefault();
    }
    if (e.code === 'Escape') {
      G.pausePressed = true;
    }
  });

  window.addEventListener('keyup', e => {
    keys[e.code] = false;
    keys[e.key]  = false;
  });

  // Touch controls
  const container = document.getElementById('touch-controls');
  if (!container) return;

  const BTN_DEFS = [
    // Left cluster
    { key: 'ArrowLeft',  label: '◀', left:  8, bottom: 70 },
    { key: 'ArrowRight', label: '▶', left: 64, bottom: 70 },
    { key: 'ArrowUp',    label: '▲', left: 36, bottom:118 },
    { key: 'ArrowDown',  label: '▼', left: 36, bottom: 22 },
    // Right cluster
    { key: 'KeyZ',  label: 'Z', right: 64, bottom: 70 },
    { key: 'KeyX',  label: 'X', right:  8, bottom: 70 },
    { key: 'Space', label: '↑', right: 36, bottom:118 },
  ];

  BTN_DEFS.forEach(def => {
    const btn = document.createElement('div');
    btn.className = 'touch-btn';
    btn.textContent = def.label;
    btn.style.bottom = def.bottom + 'px';
    if (def.left  !== undefined) btn.style.left  = def.left  + 'px';
    if (def.right !== undefined) btn.style.right = def.right + 'px';

    const press   = e => { e.preventDefault(); keys[def.key] = true;  };
    const release = e => { e.preventDefault(); keys[def.key] = false; };

    btn.addEventListener('touchstart',  press,   { passive: false });
    btn.addEventListener('touchend',    release, { passive: false });
    btn.addEventListener('touchcancel', release, { passive: false });
    container.appendChild(btn);
  });
}

// Helper: check if a key is held (accepts multiple aliases)
export function isDown(G, ...codes) {
  return codes.some(c => G.keys[c]);
}

export function isLeft(G)  { return isDown(G, 'ArrowLeft',  'KeyA'); }
export function isRight(G) { return isDown(G, 'ArrowRight', 'KeyD'); }
export function isUp(G)    { return isDown(G, 'ArrowUp',    'KeyW', 'Space'); }
export function isDown_(G) { return isDown(G, 'ArrowDown',  'KeyS'); }
export function isZ(G)     { return isDown(G, 'KeyZ'); }
export function isX(G)     { return isDown(G, 'KeyX'); }
export function isC(G)     { return isDown(G, 'KeyC'); }
