// engine/audio.js — Web Audio API, procedural 8-bit sounds + BGM

let ctx = null;
let muted = false;
let bgmNode = null;
let bgmGain = null;
let masterGain = null;

export function initAudio() {
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.5;
    masterGain.connect(ctx.destination);
  } catch(e) {
    console.warn('Web Audio not available');
    ctx = null;
  }
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

export function toggleMute() {
  muted = !muted;
  if (masterGain) masterGain.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function isMuted() { return muted; }

// Low-level tone helper
function playTone(freq, type, duration, volume = 0.3, start = 0) {
  if (!ctx || muted) return;
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, ctx.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime + start);
  osc.stop(ctx.currentTime + start + duration);
}

function playNoise(duration, volume = 0.2) {
  if (!ctx || muted) return;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  source.connect(gain);
  gain.connect(masterGain);
  source.start();
}

// SFX definitions
export const SFX = {
  punch()    { playTone(200, 'square', 0.08, 0.4); playNoise(0.06, 0.15); },
  kick()     { playTone(150, 'square', 0.1, 0.4); playTone(80, 'sawtooth', 0.08, 0.2, 0.02); },
  block()    { playTone(400, 'square', 0.06, 0.3); playTone(300, 'square', 0.06, 0.3, 0.03); },
  jump()     { playTone(300, 'square', 0.15, 0.25); playTone(450, 'square', 0.1, 0.2, 0.05); },
  coin()     {
    [523,659,784].forEach((f,i) => playTone(f,'square',0.1,0.3,i*0.06));
  },
  stomp()    { playTone(150,'square',0.1,0.4); playNoise(0.05, 0.2); },
  hurt()     { playTone(180,'sawtooth',0.15,0.4); playTone(120,'sawtooth',0.1,0.3,0.05); },
  splash()   { playNoise(0.12, 0.3); playTone(200,'sine',0.1,0.2,0.02); },
  complete() {
    const notes=[523,659,784,1047];
    notes.forEach((f,i)=>playTone(f,'square',0.2,0.35,i*0.12));
  },
  gameOver() {
    [300,250,200,150].forEach((f,i)=>playTone(f,'sawtooth',0.3,0.3,i*0.15));
  },
  propose()  {
    [523,659,784,1047,1319].forEach((f,i)=>playTone(f,'square',0.25,0.4,i*0.1));
    setTimeout(()=>{
      [784,1047,1319,1568].forEach((f,i)=>playTone(f,'triangle',0.2,0.3,i*0.08));
    }, 700);
  },
  heartBurst() {
    playTone(784,'square',0.3,0.5);
    playTone(988,'square',0.2,0.3,0.1);
    playTone(1175,'triangle',0.3,0.4,0.15);
  },
  levelUp() {
    [392,523,659,784,1047].forEach((f,i)=>playTone(f,'square',0.18,0.4,i*0.09));
  },
  paint() { playTone(600,'sine',0.05,0.1); },
  lightning() {
    // Sharp crack + low rumble
    playNoise(0.07, 0.55);
    playTone(55, 'sawtooth', 0.45, 0.35, 0.05);
    playNoise(0.35, 0.18);
  },
};

// BGM patterns: array of [note_hz, duration_beats]
const BGM_PATTERNS = {
  menu: [
    [523,0.5],[659,0.5],[784,0.5],[1047,0.5],[784,0.5],[659,0.5],[523,1],
    [392,0.5],[523,0.5],[659,0.5],[784,0.5],[659,0.5],[523,0.5],[392,1],
  ],
  fight: [
    [220,0.25],[220,0.25],[330,0.5],[220,0.25],[220,0.25],[415,0.25],[220,0.25],[392,0.5],
    [220,0.25],[220,0.25],[330,0.5],[220,0.25],[330,0.25],[220,0.5],[165,1],
  ],
  swim: [
    [523,1],[587,0.5],[523,0.5],[440,1],[392,1],
    [349,0.5],[392,0.5],[440,0.5],[523,0.5],[587,0.5],[659,0.5],[698,1],
  ],
  art: [
    [784,0.5],[880,0.5],[988,0.5],[1047,1],[880,0.5],[784,0.5],[698,0.5],[659,1],
    [523,0.25],[587,0.25],[659,0.5],[784,0.5],[880,0.5],[988,0.5],[1047,1],
  ],
  platform: [
    [659,0.25],[784,0.25],[880,0.25],[784,0.25],[659,0.25],[523,0.5],
    [587,0.25],[659,0.25],[784,0.5],[880,0.25],[784,0.25],[659,1],
    [523,0.25],[587,0.25],[659,0.25],[523,0.25],[392,0.5],[440,0.5],[523,1],
  ],
};

export function playBGM(name) {
  stopBGM();
  if (!ctx || muted) return;

  const pattern = BGM_PATTERNS[name];
  if (!pattern) return;

  const bpm = 160;
  const beatLen = 60 / bpm;

  bgmGain = ctx.createGain();
  bgmGain.gain.value = 0.18;
  bgmGain.connect(masterGain);

  let time = ctx.currentTime + 0.1;
  const totalDur = pattern.reduce((s, [,d]) => s + d, 0) * beatLen;

  function scheduleLoop() {
    let t = time;
    for (const [freq, dur] of pattern) {
      const d = dur * beatLen;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.5, t);
      gain.gain.setValueAtTime(0.3, t + d * 0.6);
      gain.gain.setValueAtTime(0.001, t + d * 0.95);
      osc.connect(gain);
      gain.connect(bgmGain);
      osc.start(t);
      osc.stop(t + d);
      t += d;
    }
    time += totalDur;
  }

  // Schedule several loops ahead
  for (let i = 0; i < 4; i++) scheduleLoop();

  // Keep looping with a timer
  bgmNode = setInterval(() => {
    scheduleLoop();
  }, totalDur * 1000 - 200);
}

export function stopBGM() {
  if (bgmNode) { clearInterval(bgmNode); bgmNode = null; }
  if (bgmGain) { bgmGain.disconnect(); bgmGain = null; }
}
