// ==================== Merge Fruit ====================
// Caen frutas en un contenedor. Frutas iguales que se tocan se fusionan
// en la siguiente del orden. Llegar a la sandía = puntazo.

const FRUITS = [
  { ico: '🍒', name: 'Cherry',     r: 14, color: '#7a1414', border: '#3a0808' },  // borgoña oscuro
  { ico: '🍓', name: 'Strawberry', r: 19, color: '#ff3477', border: '#8a1840' },  // rosa-rojo bien pink
  { ico: '🍇', name: 'Grape',      r: 25, color: '#7e3ec8', border: '#3a1058' },  // morado profundo
  { ico: '🍋', name: 'Lemon',      r: 32, color: '#ffe61c', border: '#aa9008' },  // amarillo limón
  { ico: '🍊', name: 'Orange',     r: 40, color: '#ff8c1a', border: '#a04808' },  // naranja puro
  { ico: '🍎', name: 'Apple',      r: 48, color: '#dc143c', border: '#700818' },  // crimson clásico
  { ico: '🍐', name: 'Pear',       r: 56, color: '#a4d639', border: '#4a6a18' },  // amarillo-verde
  { ico: '🍑', name: 'Peach',      r: 64, color: '#ffb088', border: '#a05848' },  // durazno
  { ico: '🍍', name: 'Pineapple',  r: 72, color: '#f4a800', border: '#8a4800' },  // dorado
  { ico: '🍈', name: 'Melon',      r: 84, color: '#bee557', border: '#5a8030' },  // verde melón claro
  { ico: '🍉', name: 'Watermelon', r: 96, color: '#ff5b76', border: '#7a2030' }   // rosa sandía
];
// Solo se spawnean los 4 más chicos. El resto sale de fusiones.
const SPAWN_LEVELS = [0, 0, 0, 1, 1, 2, 2, 3];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const BOARD = { w: 420, h: 600 };
function resize() {
  const maxW = Math.min(420, window.innerWidth - 30);
  const ratio = BOARD.h / BOARD.w;
  BOARD.w = Math.max(280, Math.floor(maxW));
  BOARD.h = Math.floor(BOARD.w * ratio);
  canvas.width = BOARD.w;
  canvas.height = BOARD.h;
}
window.addEventListener('resize', resize);
// fix initial ratio
BOARD.w = 420; BOARD.h = 600;
resize();

const state = {
  fruits: [],     // {x, y, vx, vy, level, id, mergedWith}
  next: null,     // {level, x}
  pendingNext: null,
  score: 0,
  best: parseInt(localStorage.getItem('mf-best') || '0', 10),
  bestFruitReached: 0,
  alive: true,
  paused: false,
  dropCooldown: 0,
  nextSeq: 1,
  dangerY: 80,    // linea de game over
  overTimer: 0,   // tiempo continuo de fruta sobre la linea
  pointer: { x: BOARD.w / 2, active: false }
};

const GRAVITY = 1100;
const FRICTION = 0.985;
const RESTITUTION = 0.05;

function rand(a, b) { return Math.random() * (b - a) + a; }

function nextLevel() {
  return SPAWN_LEVELS[Math.floor(Math.random() * SPAWN_LEVELS.length)];
}

function spawnNextFruit() {
  state.next = { level: nextLevel(), x: state.pointer.x };
  document.getElementById('hud-next').textContent = FRUITS[state.next.level].ico;
}

function dropFruit() {
  if (!state.alive || state.paused) return;
  if (!state.next || state.dropCooldown > 0) return;
  const lvl = state.next.level;
  const r = FRUITS[lvl].r;
  const x = clamp(state.pointer.x, r + 4, BOARD.w - r - 4);
  state.fruits.push({
    id: state.nextSeq++,
    level: lvl,
    x, y: 40 + r * 0.5,
    vx: 0, vy: 0,
    mergedWith: null,
    bornAt: Date.now()
  });
  state.dropCooldown = 0.45;
  state.next = null;
  beep('drop');
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ==================== Fisica ====================
function update(dt) {
  if (state.dropCooldown > 0) {
    state.dropCooldown -= dt;
    if (state.dropCooldown <= 0) spawnNextFruit();
  }
  // integrar
  for (const f of state.fruits) {
    if (f.mergedWith) continue;
    f.vy += GRAVITY * dt;
    f.vx *= FRICTION;
    f.vy *= FRICTION;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    const r = FRUITS[f.level].r;
    // walls
    if (f.x < r) { f.x = r; f.vx = -f.vx * RESTITUTION; }
    if (f.x > BOARD.w - r) { f.x = BOARD.w - r; f.vx = -f.vx * RESTITUTION; }
    // floor
    if (f.y > BOARD.h - r) { f.y = BOARD.h - r; f.vy = -f.vy * RESTITUTION; if (Math.abs(f.vy) < 30) f.vy = 0; }
  }
  // colisiones (varias iteraciones para estabilidad)
  for (let iter = 0; iter < 5; iter++) {
    for (let i = 0; i < state.fruits.length; i++) {
      const a = state.fruits[i]; if (a.mergedWith) continue;
      const ra = FRUITS[a.level].r;
      for (let j = i + 1; j < state.fruits.length; j++) {
        const b = state.fruits[j]; if (b.mergedWith) continue;
        const rb = FRUITS[b.level].r;
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        const overlap = ra + rb - dist;
        if (overlap > 0) {
          // si son del mismo nivel y estan muy cerca: fusionar
          if (a.level === b.level && a.level < FRUITS.length - 1) {
            mergeFruits(a, b);
            continue;
          }
          const nx = dx / dist, ny = dy / dist;
          const totalR = ra + rb;
          const aw = rb / totalR;
          const bw = ra / totalR;
          a.x -= nx * overlap * aw;
          a.y -= ny * overlap * aw;
          b.x += nx * overlap * bw;
          b.y += ny * overlap * bw;
          // velocidad: rebote suave
          const dvx = b.vx - a.vx, dvy = b.vy - a.vy;
          const sep = dvx * nx + dvy * ny;
          if (sep < 0) {
            const e = 0.15;
            const imp = -(1 + e) * sep / 2;
            a.vx -= imp * nx; a.vy -= imp * ny;
            b.vx += imp * nx; b.vy += imp * ny;
          }
        }
      }
    }
  }
  // limpiar mergedWith
  state.fruits = state.fruits.filter(f => !f.mergedWith);

  // detectar game over: alguna fruta con centro arriba de la danger line
  let inDanger = false;
  for (const f of state.fruits) {
    if (Date.now() - f.bornAt < 1200) continue; // gracia para frutas recien soltadas
    const r = FRUITS[f.level].r;
    if (f.y - r * 0.3 < state.dangerY && Math.abs(f.vy) < 60) {
      inDanger = true; break;
    }
  }
  if (inDanger) {
    state.overTimer += dt;
    if (state.overTimer > 2.0) gameOver();
  } else {
    state.overTimer = Math.max(0, state.overTimer - dt * 2);
  }
}

let mergeId = 1;
function mergeFruits(a, b) {
  const newLvl = a.level + 1;
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const cvx = (a.vx + b.vx) / 2;
  const cvy = (a.vy + b.vy) / 2;
  a.mergedWith = b.id;
  b.mergedWith = a.id;
  // bonus segun nivel resultante (Suika scoring approx)
  const points = [10, 30, 60, 100, 150, 220, 320, 450, 620, 850, 1200][newLvl] || 1500;
  state.score += points;
  if (newLvl > state.bestFruitReached) state.bestFruitReached = newLvl;
  state.fruits.push({
    id: state.nextSeq++,
    level: newLvl,
    x: cx, y: cy,
    vx: cvx, vy: cvy - 60,
    mergedWith: null,
    bornAt: Date.now() - 1500 // sin gracia, ya estaba ahi
  });
  spawnEffect(cx, cy, FRUITS[newLvl].color, newLvl >= FRUITS.length - 1 ? 50 : 18);
  beep(newLvl >= FRUITS.length - 1 ? 'mega' : 'merge');
}

const effects = [];
function spawnEffect(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    effects.push({
      x, y,
      vx: rand(-1, 1) * 200, vy: rand(-1, 1) * 200,
      life: 1, decay: 2.5, color, size: rand(2, 5)
    });
  }
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const p = effects[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
    p.life -= p.decay * dt;
    if (p.life <= 0) effects.splice(i, 1);
  }
}

// ==================== Render ====================
function render() {
  ctx.clearRect(0, 0, BOARD.w, BOARD.h);
  // fondo con gradient
  const grad = ctx.createLinearGradient(0, 0, 0, BOARD.h);
  grad.addColorStop(0, '#1f1530');
  grad.addColorStop(1, '#0a0d18');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, BOARD.w, BOARD.h);

  // danger line
  ctx.strokeStyle = `rgba(255, 94, 122, ${0.4 + Math.sin(performance.now() * 0.005) * 0.2})`;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(0, state.dangerY);
  ctx.lineTo(BOARD.w, state.dangerY);
  ctx.stroke();
  ctx.setLineDash([]);

  // proxima fruta arriba
  if (state.next) {
    const r = FRUITS[state.next.level].r;
    const x = clamp(state.pointer.x, r + 4, BOARD.w - r - 4);
    state.next.x = x;
    // guia vertical
    ctx.strokeStyle = 'rgba(255, 215, 94, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 40 + r); ctx.lineTo(x, BOARD.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // fruta arriba
    drawFruit(x, 36, state.next.level, 0.7);
  }

  // frutas
  for (const f of state.fruits) {
    if (f.mergedWith) continue;
    drawFruit(f.x, f.y, f.level, 1);
  }

  // efectos
  for (const p of effects) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // overlay rojo si en peligro
  if (state.overTimer > 0.3) {
    ctx.fillStyle = `rgba(255, 94, 122, ${state.overTimer * 0.18})`;
    ctx.fillRect(0, 0, BOARD.w, BOARD.h);
  }
}

function drawFruit(x, y, level, alpha) {
  const def = FRUITS[level];
  const r = def.r;
  ctx.globalAlpha = alpha;
  // sombra circular
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(x, y + 3, r, 0, Math.PI * 2);
  ctx.fill();
  // cuerpo de la fruta
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // borde oscuro distintivo
  ctx.strokeStyle = def.border;
  ctx.lineWidth = Math.max(2, r * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, r - 1, 0, Math.PI * 2);
  ctx.stroke();
  // brillo
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  // emoji centrado
  ctx.font = `${r * 1.3}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.ico, x, y + 2);
  ctx.globalAlpha = 1;
}

// ==================== Input ====================
function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();
  let cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  return clamp(cx * (BOARD.w / rect.width), 0, BOARD.w);
}

canvas.addEventListener('mousemove', (e) => {
  state.pointer.x = getCanvasPos(e);
});
canvas.addEventListener('mousedown', (e) => {
  state.pointer.x = getCanvasPos(e);
  dropFruit();
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  state.pointer.x = getCanvasPos(e);
  state.pointer.active = true;
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  state.pointer.x = getCanvasPos(e);
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (state.pointer.active) {
    dropFruit();
    state.pointer.active = false;
  }
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.location.href = '/'; return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (!state.alive || state.paused) return;
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
    e.preventDefault();
    dropFruit();
  }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    state.pointer.x = clamp(state.pointer.x - 16, 0, BOARD.w);
  }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    state.pointer.x = clamp(state.pointer.x + 16, 0, BOARD.w);
  }
});

// ==================== Audio ====================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}
function beep(type) {
  ensureAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  let dur = 0.08;
  switch (type) {
    case 'drop': o.type = 'triangle'; o.frequency.value = 220; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.1); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'merge': o.type = 'sine'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(880, t0 + 0.18); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); dur = 0.2; break;
    case 'mega': o.type = 'sawtooth'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(1760, t0 + 0.6); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6); dur = 0.6; break;
    case 'over': o.type = 'triangle'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.6); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6); dur = 0.6; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== HUD ====================
function renderLadder() {
  const ladder = document.getElementById('ladder');
  ladder.innerHTML = '';
  FRUITS.forEach((f, i) => {
    const el = document.createElement('div');
    el.className = 'fr' + (i <= state.bestFruitReached ? ' passed' : '');
    el.title = f.name;
    el.textContent = f.ico;
    ladder.appendChild(el);
  });
}

function updateHUD() {
  document.getElementById('hud-score').textContent = state.score;
  document.getElementById('hud-best').textContent = state.best;
  document.getElementById('hud-bigfruit').textContent = FRUITS[state.bestFruitReached].ico;
}

// ==================== Game over / pause ====================
function gameOver() {
  if (!state.alive) return;
  state.alive = false;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('mf-best', state.best);
  }
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-best').textContent = state.best;
  document.getElementById('go-fruit').textContent = FRUITS[state.bestFruitReached].ico;
  document.getElementById('gameover').classList.remove('hidden');
  beep('over');
}

function togglePause() {
  if (!state.alive) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
}

document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('go-replay').addEventListener('click', () => location.reload());
document.getElementById('go-menu').addEventListener('click', () => { window.location.href = '/'; });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-menu').addEventListener('click', () => { window.location.href = '/'; });

if (!localStorage.getItem('mf-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('mf-seen-help', '1');
}

// ==================== Loop ====================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.alive && !state.paused) {
    update(dt);
    updateEffects(dt);
  }
  render();
  updateHUD();
  renderLadder();
  requestAnimationFrame(loop);
}

spawnNextFruit();
state.pointer.x = BOARD.w / 2;
requestAnimationFrame(loop);
