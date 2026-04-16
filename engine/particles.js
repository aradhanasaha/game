// engine/particles.js — Reusable particle system

const MAX_PARTICLES = 200;

class Particle {
  constructor(x, y, opts) {
    this.x      = x;
    this.y      = y;
    this.vx     = opts.vx     ?? (Math.random() - 0.5) * 4;
    this.vy     = opts.vy     ?? (Math.random() - 0.5) * 4;
    this.life   = 0;
    this.maxLife= opts.life   ?? 60;
    this.color  = opts.color  ?? '#ff1493';
    this.color2 = opts.color2 ?? null;
    this.size   = opts.size   ?? 4;
    this.shape  = opts.shape  ?? 'circle';
    this.gravity= opts.gravity?? 0.08;
    this.alpha  = 1;
    this.rot    = Math.random() * Math.PI * 2;
    this.rotV   = (Math.random() - 0.5) * 0.2;
  }

  update() {
    this.vy  += this.gravity;
    this.x   += this.vx;
    this.y   += this.vy;
    this.rot += this.rotV;
    this.life++;
    this.alpha = 1 - this.life / this.maxLife;
    return this.life < this.maxLife;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.fillStyle = this.color2
      ? (this.life / this.maxLife < 0.5 ? this.color : this.color2)
      : this.color;

    const s = this.size;
    switch (this.shape) {
      case 'heart':
        drawHeart(ctx, 0, 0, s);
        break;
      case 'star':
        drawStar(ctx, 0, 0, s);
        break;
      case 'coin':
        ctx.strokeStyle = '#ffe066';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'confetti':
        ctx.fillRect(-s, -s / 2, s * 2, s);
        break;
      case 'petal':
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.7, s * 1.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bubble':
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = Math.max(0, this.alpha) * 0.6;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'spark':
        ctx.fillRect(-s/2, -s/2, s, s);
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
  }
}

function drawHeart(ctx, x, y, r) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.3);
  ctx.bezierCurveTo(x, y - r * 0.3, x - r, y - r * 0.3, x - r, y + r * 0.1);
  ctx.bezierCurveTo(x - r, y + r * 0.6, x, y + r, x, y + r);
  ctx.bezierCurveTo(x, y + r, x + r, y + r * 0.6, x + r, y + r * 0.1);
  ctx.bezierCurveTo(x + r, y - r * 0.3, x, y - r * 0.3, x, y + r * 0.3);
  ctx.fill();
}

function drawStar(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
    const ax = Math.cos(a) * r;
    const ay = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x + ax, y + ay);
    else         ctx.lineTo(x + ax, y + ay);
    const a2 = a + Math.PI / 4;
    ctx.lineTo(x + Math.cos(a2) * r * 0.4, y + Math.sin(a2) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}

export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, count, opts = {}) {
    const available = MAX_PARTICLES - this.particles.length;
    const toSpawn = Math.min(count, available);
    for (let i = 0; i < toSpawn; i++) {
      this.particles.push(new Particle(x, y, {
        ...opts,
        vx: opts.vx !== undefined ? opts.vx + (Math.random() - 0.5) * (opts.spread ?? 4)
                                  : (Math.random() - 0.5) * (opts.spread ?? 4),
        vy: opts.vy !== undefined ? opts.vy + (Math.random() - 0.5) * (opts.spread ?? 4)
                                  : (Math.random() - 0.5) * (opts.spread ?? 4),
      }));
    }
  }

  // Burst helpers
  hearts(x, y, count = 8) {
    this.emit(x, y, count, {
      shape: 'heart', color: '#ff1493', color2: '#f06292',
      life: 80, size: 5, gravity: -0.05, spread: 5,
      vy: -3,
    });
  }

  stars(x, y, count = 10) {
    this.emit(x, y, count, {
      shape: 'star', color: '#ffe066', color2: '#ffffff',
      life: 50, size: 5, gravity: 0.1, spread: 6,
    });
  }

  coins(x, y, count = 6) {
    this.emit(x, y, count, {
      shape: 'coin', color: '#ffe066',
      life: 50, size: 4, gravity: 0.15, spread: 5,
    });
  }

  confetti(x, y, count = 20) {
    const colors = ['#ff1493','#ffe066','#a8e6cf','#f06292','#ffffff','#c2185b'];
    for (let i = 0; i < count; i++) {
      this.emit(x, y, 1, {
        shape: 'confetti',
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 120, size: 4,
        gravity: 0.12,
        vx: (Math.random() - 0.5) * 8,
        vy: -Math.random() * 6 - 1,
        spread: 0,
      });
    }
  }

  petals(x, y, count = 10) {
    this.emit(x, y, count, {
      shape: 'petal', color: '#f8bbd0', color2: '#f06292',
      life: 100, size: 4, gravity: 0.04, spread: 3,
      vy: -1,
    });
  }

  bubbles(x, y, count = 3) {
    this.emit(x, y, count, {
      shape: 'bubble', color: '#a8e6cf',
      life: 60, size: 3 + Math.random() * 3, gravity: -0.08, spread: 1,
      vy: -1,
    });
  }

  sparks(x, y, count = 8, color = '#ffe066') {
    this.emit(x, y, count, {
      shape: 'spark', color,
      life: 30, size: 3, gravity: 0.2, spread: 7,
    });
  }

  update() {
    this.particles = this.particles.filter(p => p.update());
  }

  draw(ctx) {
    this.particles.forEach(p => p.draw(ctx));
  }

  clear() {
    this.particles = [];
  }
}
