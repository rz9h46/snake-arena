// ==================== Wonderboy ====================
// Auto-runner platformer. Saltá pozos, esquivá enemigos, juntá frutas.
// Inspirado en Wonder Boy clasico de los 80s.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let viewport = { w: 0, h: 0 };
let dpr = 1;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.w = canvas.clientWidth || window.innerWidth;
  viewport.h = canvas.clientHeight || (window.innerHeight - 56);
  canvas.width = viewport.w * dpr;
  canvas.height = viewport.h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);

// Constantes del mundo
const TILE = 40;
const GRAVITY = 1900;
const JUMP_VEL = -640;
const RUN_SPEED = 240;     // px/s
const ATTACK_RANGE = 50;
const FLOOR_Y_RATIO = 0.78; // y del piso = ratio * viewport.h

const state = {
  running: false,
  paused: false,
  alive: true,
  player: {
    x: 0,
    y: 0,
    vy: 0,
    onGround: true,
    jumps: 0,
    attackTimer: 0,
    invul: 0,
    width: 28, height: 36
  },
  scrollX: 0,
  speed: RUN_SPEED,
  distance: 0,
  score: 0,
  best: parseInt(localStorage.getItem('wb-best') || '0', 10),
  vitality: 100,
  vitalityDecay: 1.5,    // /seg
  lives: 3,
  // mundo: chunks con suelo, pozos, enemigos, frutas
  ground: [],            // segments [x1, x2] de piso
  pits: [],              // segments [x1, x2] de pozo
  enemies: [],           // {x, y, kind, vy, alive}
  fruits: [],            // {x, y, kind, taken}
  particles: [],
  worldEnd: 0            // x mas lejano generado
};

const FRUIT_KINDS = [
  { ico: '🍎', score: 50, vit: 8 },
  { ico: '🍌', score: 50, vit: 8 },
  { ico: '🍇', score: 80, vit: 10 },
  { ico: '🍑', score: 100, vit: 14 },
  { ico: '🍒', score: 30, vit: 5 }
];
const ENEMY_KINDS = [
  { ico: '🐌', name: 'snail',  speed: 30, jump: false },
  { ico: '🐝', name: 'bee',    speed: 70, jump: true, hover: true },
  { ico: '🦂', name: 'scorp',  speed: 50, jump: false },
  { ico: '🦀', name: 'crab',   speed: 40, jump: false }
];

function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function floorY() { return viewport.h * FLOOR_Y_RATIO; }

// ==================== Mundo procedural ====================
function resetWorld() {
  state.ground = [];
  state.pits = [];
  state.enemies = [];
  state.fruits = [];
  state.particles = [];
  state.scrollX = 0;
  state.distance = 0;
  state.score = 0;
  state.vitality = 100;
  state.lives = 3;
  state.speed = RUN_SPEED;
  state.player.x = viewport.w * 0.2;
  state.player.y = floorY() - state.player.height / 2;
  state.player.vy = 0;
  state.player.onGround = true;
  state.player.jumps = 0;
  state.player.attackTimer = 0;
  state.player.invul = 0;
  state.alive = true;
  state.worldEnd = 0;
  // primer chunk de suelo seguro
  state.ground.push([0, viewport.w * 1.5]);
  state.worldEnd = viewport.w * 1.5;
  generateAhead();
}

function generateAhead() {
  // genera chunks hasta tener mucho mundo por delante
  const target = state.scrollX + viewport.w * 3;
  while (state.worldEnd < target) {
    const choice = Math.random();
    const startX = state.worldEnd;
    if (choice < 0.18 && state.distance > 200) {
      // pozo
      const pitW = rand(60, 130);
      state.pits.push([startX, startX + pitW]);
      state.worldEnd = startX + pitW;
      // suelo despues
      const groundW = rand(220, 380);
      state.ground.push([state.worldEnd, state.worldEnd + groundW]);
      state.worldEnd += groundW;
      // enemigo o fruta despues del pozo
      if (Math.random() < 0.5) spawnEnemyOnGround(startX + pitW + 80);
      if (Math.random() < 0.7) spawnFruitFly(startX + pitW + 50);
    } else {
      // tramo de suelo con cosas
      const groundW = rand(280, 500);
      state.ground.push([startX, startX + groundW]);
      state.worldEnd = startX + groundW;
      // poblar el tramo
      const items = randInt(1, 3);
      for (let i = 0; i < items; i++) {
        const x = startX + (groundW * (i + 0.5) / items) + rand(-30, 30);
        if (Math.random() < 0.55) spawnEnemyOnGround(x);
        else spawnFruitFly(x);
      }
      // a veces un grupo de frutas en el aire
      if (Math.random() < 0.25) {
        const baseX = startX + groundW * rand(0.3, 0.8);
        const baseY = floorY() - rand(80, 180);
        for (let k = 0; k < 3; k++) {
          state.fruits.push({
            x: baseX + k * 28, y: baseY,
            kind: FRUIT_KINDS[randInt(0, FRUIT_KINDS.length - 1)],
            taken: false
          });
        }
      }
    }
  }
}

function spawnEnemyOnGround(x) {
  const kind = ENEMY_KINDS[randInt(0, ENEMY_KINDS.length - 1)];
  state.enemies.push({
    x, y: floorY() - (kind.hover ? rand(60, 100) : 18),
    vy: kind.hover ? rand(-30, 30) : 0,
    kind, alive: true
  });
}

function spawnFruitFly(x) {
  state.fruits.push({
    x, y: floorY() - rand(40, 110),
    kind: FRUIT_KINDS[randInt(0, FRUIT_KINDS.length - 1)],
    taken: false
  });
}

function isOverGround(x) {
  for (const [a, b] of state.ground) if (x >= a && x <= b) return true;
  return false;
}

// ==================== Inputs ====================
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.key === 'Escape') { backToMenu(); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (!state.running || state.paused || !state.alive) return;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
    e.preventDefault();
    tryJump();
  }
  if (e.key === 'x' || e.key === 'X' || e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    tryAttack();
  }
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

canvas.addEventListener('click', () => {
  if (!state.running || state.paused || !state.alive) return;
  tryJump();
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!state.running || state.paused || !state.alive) return;
  tryJump();
}, { passive: false });

document.getElementById('btn-jump').addEventListener('click', tryJump);
document.getElementById('btn-attack').addEventListener('click', tryAttack);
['btn-jump', 'btn-attack'].forEach(id => {
  document.getElementById(id).addEventListener('touchstart', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (id === 'btn-jump') tryJump(); else tryAttack();
  }, { passive: false });
});

function tryJump() {
  if (state.player.jumps < 2) {
    state.player.vy = JUMP_VEL * (state.player.jumps === 0 ? 1 : 0.85);
    state.player.onGround = false;
    state.player.jumps++;
    beep('jump');
  }
}

function tryAttack() {
  if (state.player.attackTimer > 0) return;
  state.player.attackTimer = 0.3;
  beep('hit');
  // aniquilar enemigos al alcance al frente
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.player.x;
    const dy = e.y - state.player.y;
    if (dx > -10 && dx < ATTACK_RANGE && Math.abs(dy) < 50) {
      e.alive = false;
      state.score += 100;
      spawnParticles(e.x, e.y, 14, '#ffd75e');
    }
  }
}

// ==================== Update ====================
function update(dt) {
  // scroll
  state.scrollX += state.speed * dt;
  state.distance += state.speed * dt;
  state.speed = Math.min(RUN_SPEED * 1.7, RUN_SPEED + state.distance * 0.02);
  // generar mas mundo si hace falta
  generateAhead();
  // limpiar lo que ya quedo lejos detras
  state.ground = state.ground.filter(([a, b]) => b > state.scrollX - 200);
  state.pits = state.pits.filter(([a, b]) => b > state.scrollX - 200);
  state.enemies = state.enemies.filter(e => e.x > state.scrollX - 200 && e.alive);
  state.fruits = state.fruits.filter(f => f.x > state.scrollX - 200 && !f.taken);

  // jugador
  const p = state.player;
  p.attackTimer = Math.max(0, p.attackTimer - dt);
  p.invul = Math.max(0, p.invul - dt);
  // gravedad
  p.vy += GRAVITY * dt;
  p.y += p.vy * dt;
  // detectar suelo bajo el jugador (centro)
  const playerWorldX = state.scrollX + p.x;
  const overGround = isOverGround(playerWorldX);
  const fy = floorY() - p.height / 2;
  if (p.y >= fy && overGround) {
    p.y = fy;
    p.vy = 0;
    p.onGround = true;
    p.jumps = 0;
  } else {
    p.onGround = false;
  }
  // si cae al pozo (pasa el piso y no hay suelo abajo)
  if (p.y > viewport.h + 60) {
    loseLife('caida');
  }

  // vitalidad
  state.vitality = Math.max(0, state.vitality - state.vitalityDecay * dt);
  if (state.vitality <= 0 && state.alive) {
    loseLife('vitalidad');
  }

  // enemigos
  for (const e of state.enemies) {
    if (!e.alive) continue;
    if (e.kind.hover) {
      e.y += e.vy * dt;
      e.x -= e.kind.speed * 0.3 * dt;
      if (e.y < floorY() - 160 || e.y > floorY() - 40) e.vy = -e.vy;
    } else {
      e.x -= e.kind.speed * dt;
    }
  }

  // colisiones jugador vs enemigos
  if (p.invul <= 0) {
    for (const e of state.enemies) {
      if (!e.alive) continue;
      const ex = e.x - state.scrollX;
      const dx = Math.abs(ex - p.x);
      const dy = Math.abs(e.y - p.y);
      if (dx < 28 && dy < 30) {
        // si cae encima del enemigo (pisa), lo mata
        if (p.vy > 100 && p.y < e.y - 4) {
          e.alive = false;
          state.score += 80;
          p.vy = JUMP_VEL * 0.6;
          spawnParticles(e.x - state.scrollX, e.y, 12, '#ffd75e');
          beep('stomp');
        } else {
          loseLife('enemigo');
          break;
        }
      }
    }
  }

  // recolectar frutas
  for (const f of state.fruits) {
    if (f.taken) continue;
    const fx = f.x - state.scrollX;
    if (Math.abs(fx - p.x) < 26 && Math.abs(f.y - p.y) < 30) {
      f.taken = true;
      state.score += f.kind.score;
      state.vitality = Math.min(100, state.vitality + f.kind.vit);
      spawnParticles(fx, f.y, 10, '#5effb6');
      beep('fruit');
    }
  }

  // particulas
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += 600 * dt;
    pt.vx *= 0.95;
    pt.life -= dt;
    if (pt.life <= 0) state.particles.splice(i, 1);
  }
}

function loseLife(reason) {
  state.lives--;
  state.player.invul = 1.5;
  state.vitality = 100;
  spawnParticles(state.player.x, state.player.y, 30, '#ff5e7a');
  beep('hurt');
  if (state.lives <= 0) {
    gameOver();
    return;
  }
  // empujar atras y arriba
  state.player.vy = JUMP_VEL * 0.7;
  state.player.y = floorY() - state.player.height / 2;
  state.scrollX = Math.max(0, state.scrollX - 80);
}

function spawnParticles(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x, y,
      vx: rand(-1, 1) * 200,
      vy: rand(-1, 0.2) * 300,
      life: rand(0.4, 0.8),
      color, size: rand(2, 5)
    });
  }
}

function gameOver() {
  state.alive = false;
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('wb-best', state.best);
  }
  document.getElementById('go-dist').textContent = Math.floor(state.distance / 10) + 'm';
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-best').textContent = state.best;
  document.getElementById('gameover').classList.remove('hidden');
  beep('over');
}

// ==================== Render ====================
function render() {
  // cielo (gradient ya en CSS, pero limpiar canvas)
  ctx.clearRect(0, 0, viewport.w, viewport.h);

  // parallax montañas detrás
  drawMountains();
  drawClouds();

  // suelo verde
  const fy = floorY();
  // dibujar tramos de suelo
  ctx.fillStyle = '#2a7a3a';
  for (const [a, b] of state.ground) {
    const x1 = a - state.scrollX;
    const x2 = b - state.scrollX;
    if (x2 < -20 || x1 > viewport.w + 20) continue;
    ctx.fillRect(x1, fy, x2 - x1, viewport.h - fy);
    // tope de pasto
    ctx.fillStyle = '#5effb6';
    ctx.fillRect(x1, fy - 4, x2 - x1, 4);
    ctx.fillStyle = '#2a7a3a';
  }
  // pozos: dibujar fondo profundo
  ctx.fillStyle = '#0a0d18';
  for (const [a, b] of state.pits) {
    const x1 = a - state.scrollX;
    const x2 = b - state.scrollX;
    if (x2 < -20 || x1 > viewport.w + 20) continue;
    ctx.fillRect(x1, fy, x2 - x1, viewport.h - fy);
    // borde de tierra
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x1, fy, 4, 16);
    ctx.fillRect(x2 - 4, fy, 4, 16);
    ctx.fillStyle = '#0a0d18';
  }

  // frutas
  ctx.font = '28px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of state.fruits) {
    if (f.taken) continue;
    const fx = f.x - state.scrollX;
    if (fx < -30 || fx > viewport.w + 30) continue;
    const bob = Math.sin(performance.now() * 0.005 + f.x * 0.02) * 4;
    ctx.fillText(f.kind.ico, fx, f.y + bob);
  }

  // enemigos
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ex = e.x - state.scrollX;
    if (ex < -40 || ex > viewport.w + 40) continue;
    // sombra
    if (!e.kind.hover) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(ex, fy - 2, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = '34px serif';
    ctx.fillStyle = '#000';
    ctx.fillText(e.kind.ico, ex, e.y);
  }

  // jugador
  drawPlayer();

  // partículas
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life * 1.5, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMountains() {
  // 2 capas de parallax
  const layers = [
    { speed: 0.2, color: '#3a5a7a', base: 0.5, peaks: 5, h: 0.32 },
    { speed: 0.45, color: '#2a4a6a', base: 0.62, peaks: 7, h: 0.22 }
  ];
  for (const L of layers) {
    ctx.fillStyle = L.color;
    ctx.beginPath();
    ctx.moveTo(0, viewport.h);
    const off = (state.scrollX * L.speed) % (viewport.w / L.peaks * 2);
    const baseY = viewport.h * L.base;
    for (let i = -1; i <= L.peaks + 1; i++) {
      const x = (i / L.peaks) * viewport.w - off;
      const peakY = baseY - viewport.h * L.h;
      const valleyY = baseY;
      ctx.lineTo(x, valleyY);
      ctx.lineTo(x + viewport.w / L.peaks / 2, peakY);
    }
    ctx.lineTo(viewport.w + 100, viewport.h);
    ctx.lineTo(0, viewport.h);
    ctx.closePath();
    ctx.fill();
  }
}

const cloudPositions = [];
for (let i = 0; i < 8; i++) cloudPositions.push({ x: rand(0, 4000), y: rand(40, 200), s: rand(0.7, 1.3) });
function drawClouds() {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  for (const c of cloudPositions) {
    const x = ((c.x - state.scrollX * 0.1) % (viewport.w + 200) + (viewport.w + 200)) % (viewport.w + 200) - 100;
    const y = c.y;
    const r = 18 * c.s;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.arc(x + r, y - r * 0.3, r * 0.85, 0, Math.PI * 2);
    ctx.arc(x + r * 2, y, r, 0, Math.PI * 2);
    ctx.arc(x + r * 1.5, y + r * 0.4, r * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer() {
  const p = state.player;
  const blink = p.invul > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;
  // sombra
  if (p.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, floorY() - 2, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // cuerpo
  const bodyColor = '#ffb35e';
  const skinColor = '#ffd6a8';
  const hairColor = '#5e3a1a';
  // pies (animados)
  const t = performance.now() * 0.018;
  const stride = p.onGround ? Math.sin(t * (state.speed / 100)) * 6 : 0;
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(p.x - 8 + stride, p.y + 14, 6, 6);
  ctx.fillRect(p.x + 2 - stride, p.y + 14, 6, 6);
  // cuerpo principal
  ctx.fillStyle = bodyColor;
  ctx.fillRect(p.x - 9, p.y - 6, 18, 22);
  // brazo
  ctx.fillStyle = skinColor;
  const armSwing = p.attackTimer > 0 ? 12 : Math.sin(t * (state.speed / 100)) * 4;
  ctx.fillRect(p.x + 6 + armSwing, p.y - 2, 6, 12);
  // arma si está atacando
  if (p.attackTimer > 0) {
    ctx.fillStyle = '#aaa';
    ctx.fillRect(p.x + 14, p.y - 6, 24, 4);
    ctx.fillStyle = '#ffd75e';
    ctx.fillRect(p.x + 36, p.y - 8, 4, 8);
  }
  // cabeza
  ctx.fillStyle = skinColor;
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12, 9, 0, Math.PI * 2);
  ctx.fill();
  // pelo
  ctx.fillStyle = hairColor;
  ctx.fillRect(p.x - 9, p.y - 20, 18, 6);
  ctx.beginPath();
  ctx.arc(p.x, p.y - 20, 9, Math.PI, Math.PI * 2);
  ctx.fill();
  // ojos
  ctx.fillStyle = '#000';
  ctx.fillRect(p.x + 3, p.y - 13, 2, 2);
  ctx.fillRect(p.x - 1, p.y - 13, 2, 2);
}

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
  let dur = 0.1;
  switch (type) {
    case 'jump': o.type = 'square'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(880, t0 + 0.15); g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15); dur = 0.15; break;
    case 'fruit': o.type = 'sine'; o.frequency.value = 660; o.frequency.exponentialRampToValueAtTime(990, t0 + 0.1); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'hit': o.type = 'square'; o.frequency.value = 220; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.1); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'stomp': o.type = 'sine'; o.frequency.value = 880; o.frequency.exponentialRampToValueAtTime(220, t0 + 0.15); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18); dur = 0.18; break;
    case 'hurt': o.type = 'sawtooth'; o.frequency.value = 330; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.3); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3); dur = 0.3; break;
    case 'over': o.type = 'triangle'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.7); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7); dur = 0.7; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== HUD ====================
function updateHUD() {
  document.getElementById('hud-dist').textContent = Math.floor(state.distance / 10) + 'm';
  document.getElementById('hud-score').textContent = state.score;
  document.getElementById('hud-best').textContent = state.best;
  document.getElementById('hud-lives').textContent = state.lives > 0 ? '❤️'.repeat(state.lives) : '💀';
  document.getElementById('hud-vitality').textContent = Math.floor(state.vitality);
}

// ==================== Pause / menu ====================
function togglePause() {
  if (!state.alive || !state.running) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
}
function backToMenu() {
  state.running = false;
  state.paused = false;
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
}

document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-menu').addEventListener('click', backToMenu);
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('btn-help-open').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('go-replay').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  startGame();
});
document.getElementById('go-menu').addEventListener('click', backToMenu);

if (!localStorage.getItem('wb-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('wb-seen-help', '1');
}

function startGame() {
  resize();
  resetWorld();
  state.running = true;
  state.paused = false;
  document.getElementById('menu').classList.add('hidden');
  ensureAudio();
}

// ==================== Loop ====================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state.running && !state.paused && state.alive) {
    update(dt);
  }
  render();
  updateHUD();
  requestAnimationFrame(loop);
}

resize();
state.player.x = viewport.w * 0.2;
state.player.y = floorY() - state.player.height / 2;
requestAnimationFrame(loop);
