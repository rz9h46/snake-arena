// ==================== Snake Arena v2 - Client ====================
// SP: simulacion local con bots IA, power-ups, habilidades.
// MP: cliente envia input, servidor manda snapshots e interpola.

const COLORS = ['#ff5e5e', '#ffb35e', '#ffe65e', '#9aff5e', '#5effb6',
                '#5ee0ff', '#5e8eff', '#b65eff', '#ff5ee0', '#ff5e9a'];

const SKINS = ['solid', 'stripes', 'gradient', 'dots', 'rainbow', 'neon'];

const CLASSES = {
  classic:   { name: 'Clásico',   ico: '🐍', desc: 'Sin habilidad, balanceado',     speedMul: 1.0,  ab: null,         cd: 0,  passive: null },
  speedster: { name: 'Speedster', ico: '⚡', desc: '+12% velocidad · Dash teleport', speedMul: 1.12, ab: 'dash',       cd: 6,  passive: null },
  phantom:   { name: 'Phantom',   ico: '👻', desc: 'Vuelvete intangible 3s',        speedMul: 1.0,  ab: 'intangible', cd: 14, passive: null },
  magnet:    { name: 'Magnet',    ico: '🧲', desc: 'Imán pasivo · Vacuum AOE',      speedMul: 1.0,  ab: 'vacuum',     cd: 12, passive: 'magnet_small' },
  bomber:    { name: 'Bomber',    ico: '💣', desc: 'Suelta una bomba de comida',    speedMul: 1.0,  ab: 'bomb',       cd: 10, passive: null },
  hunter:    { name: 'Hunter',    ico: '🎯', desc: '+5% vel · Frenzy 5s + revelar', speedMul: 1.05, ab: 'reveal',     cd: 18, passive: null }
};

const POWERUPS = {
  shield:  { ico: '🛡', color: '#ffd75e', dur: 10, name: 'Shield',   instant: false },
  magnet:  { ico: '🧲', color: '#5ee0ff', dur: 10, name: 'Magnet',   instant: false },
  phantom: { ico: '👻', color: '#b65eff', dur: 5,  name: 'Phantom',  instant: false },
  frost:   { ico: '❄', color: '#a8e6ff', dur: 5,  name: 'Frost',    instant: false },
  frenzy:  { ico: '🔥', color: '#ff5e7a', dur: 7,  name: 'Frenzy',   instant: false },
  mega:    { ico: '★', color: '#fff5a8', dur: 9,  name: 'Mega-Eat', instant: false },
  // nuevos
  crystal: { ico: '💎', color: '#a8ffd5', dur: 0,  name: 'Crystal',  instant: true,  desc: '+30 largo' },
  bolt:    { ico: '⚡', color: '#fff45e', dur: 0,  name: 'Bolt',     instant: true,  desc: 'Mata enemigo cercano' },
  stealth: { ico: '🌑', color: '#5e6e9a', dur: 6,  name: 'Stealth',  instant: false },
  freeze:  { ico: '🧊', color: '#7ad8ff', dur: 0,  name: 'Freeze',   instant: true,  desc: 'Congela enemigos cercanos' },
  turbo:   { ico: '🚀', color: '#ff7e3a', dur: 6,  name: 'Turbo',    instant: false },
  hypno:   { ico: '🌀', color: '#ff5edc', dur: 0,  name: 'Hypno',    instant: true,  desc: 'Invierte controles enemigos' },
  heart:   { ico: '❤️', color: '#ff5e7a', dur: 0,  name: 'Heart',    instant: true,  desc: 'Restaura largo' },
  godmode: { ico: '😇', color: '#fff8c0', dur: 10, name: 'Godmode',  instant: false, desc: '10s inmortal' },
  // efectos derivados (no se spawnean)
  frozen:  { ico: '🥶', color: '#7ad8ff', dur: 3,  name: 'Frozen',   instant: false },
  reversed:{ ico: '😵', color: '#ff5edc', dur: 5,  name: 'Hipnotizado', instant: false }
};
// solo estos aparecen como pickups por azar
const POWERUP_SPAWN_TYPES = [
  'magnet', 'phantom', 'frost', 'frenzy', 'mega',
  'crystal', 'bolt', 'stealth', 'freeze', 'turbo',
  'hypno', 'heart', 'godmode'
];

const EMOTES = { '1': '👍', '2': '😂', '3': '😱', '4': '🔥', '5': '👋' };

const DIFFICULTIES = {
  easy:   { bots: 6,  reactionMul: 1.6, abilityChance: 0.10, evadeBoostChance: 0.15, hazardMul: 0.5, name: 'Fácil',   ico: '🌱', desc: '6 bots tranquilos · pocos peligros' },
  medium: { bots: 12, reactionMul: 1.0, abilityChance: 0.30, evadeBoostChance: 0.40, hazardMul: 1.0, name: 'Medio',   ico: '⚖️', desc: '12 bots normales · peligros estándar' },
  hard:   { bots: 18, reactionMul: 0.7, abilityChance: 0.50, evadeBoostChance: 0.70, hazardMul: 1.4, name: 'Difícil', ico: '🔥', desc: '18 bots rápidos · más bombas' },
  insane: { bots: 25, reactionMul: 0.5, abilityChance: 0.80, evadeBoostChance: 0.95, hazardMul: 1.8, name: 'Insano',  ico: '💀', desc: '25 bots brutales · campo minado' }
};

const CFG = {
  WORLD_CLASSIC: 4000,
  WORLD_BR: 3500,
  START_LENGTH: 10,
  SEGMENT_SPACING: 6,
  BASE_SPEED: 2.6,
  BOOST_SPEED: 4.6,
  BOOST_COST_PER_SEC: 4,
  MAX_TURN_RATE: 0.12,
  TICK_HZ: 60,
  FOOD_TARGET: 350,
  POWERUP_TARGET: 14,
  SHIELD_TARGET: 25,
  BOTS: 12
};

// ==================== Canvas ====================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const fxCanvas = document.getElementById('fx');
const fxCtx = fxCanvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');

let viewport = { w: window.innerWidth, h: window.innerHeight };
function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.w = window.innerWidth;
  viewport.h = window.innerHeight;
  for (const c of [canvas, fxCanvas]) {
    c.width = viewport.w * dpr;
    c.height = viewport.h * dpr;
    c.style.width = viewport.w + 'px';
    c.style.height = viewport.h + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ==================== Estado global ====================
const state = {
  mode: null,        // 'single' | 'multi'
  room: 'classic',   // 'classic' | 'br'
  running: false,
  player: null,
  myId: null,
  world: null,
  remote: null,
  input: { angle: 0, boost: false },
  mouse: { x: viewport.w / 2, y: viewport.h / 2 },
  camera: { x: 0, y: 0, shake: 0 },
  socket: null,
  name: 'Anon',
  color: COLORS[5],
  skin: 'solid',
  klass: 'classic',
  best: parseInt(localStorage.getItem('snake-best') || '0', 10),
  xp: parseInt(localStorage.getItem('snake-xp') || '0', 10),
  level: parseInt(localStorage.getItem('snake-level') || '1', 10),
  particles: [],
  killfeed: [],
  emotes: [], // {x,y,emoji,t,id}
  abilityCdEnd: 0,
  audioOn: localStorage.getItem('snake-audio') !== '0',
  paused: false,
  difficulty: localStorage.getItem('snake-difficulty') || 'medium',
  joystickAngle: null,    // angulo activo del stick izquierdo o null
  arrows: { up: false, down: false, left: false, right: false },
  lives: 3,
  startingLives: 3
};

// ==================== Audio (Web Audio API) ====================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playSound(type) {
  if (!state.audioOn) return;
  ensureAudio();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.connect(g); g.connect(audioCtx.destination);
  let dur = 0.1;
  switch (type) {
    case 'eat':
      o.type = 'sine'; o.frequency.value = 880;
      o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.08);
      g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
      dur = 0.1; break;
    case 'powerup':
      o.type = 'sawtooth'; o.frequency.value = 220;
      o.frequency.exponentialRampToValueAtTime(880, t0 + 0.25);
      g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
      dur = 0.3; break;
    case 'boost':
      o.type = 'square'; o.frequency.value = 110;
      g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15);
      dur = 0.15; break;
    case 'death':
      o.type = 'triangle'; o.frequency.value = 440;
      o.frequency.exponentialRampToValueAtTime(110, t0 + 0.5);
      g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
      dur = 0.5; break;
    case 'kill':
      o.type = 'sawtooth'; o.frequency.value = 660;
      o.frequency.exponentialRampToValueAtTime(220, t0 + 0.2);
      g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2);
      dur = 0.2; break;
    case 'ability':
      o.type = 'triangle'; o.frequency.value = 330;
      o.frequency.exponentialRampToValueAtTime(990, t0 + 0.2);
      g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      dur = 0.25; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.05);
}

// ==================== Utils ====================
function rand(a, b) { return Math.random() * (b - a) + a; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function radiusFor(length) { return 10 + Math.min(32, Math.sqrt(length) * 0.85); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function worldSize() {
  if (state.mode === 'multi' && state.remote && state.remote.curr) return state.remote.curr.ws;
  return state.room === 'br' ? CFG.WORLD_BR : CFG.WORLD_CLASSIC;
}

// ==================== Particulas ====================
function spawnParticles(x, y, count, color, opts = {}) {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      x, y,
      vx: rand(-1, 1) * (opts.speed || 3),
      vy: rand(-1, 1) * (opts.speed || 3),
      life: 1,
      decay: opts.decay || 0.04,
      size: opts.size || rand(2, 5),
      color: color || '#fff',
      kind: opts.kind || 'circle'
    });
  }
}

function updateParticles(dt) {
  const list = state.particles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.94; p.vy *= 0.94;
    p.life -= p.decay;
    if (p.life <= 0) list.splice(i, 1);
  }
}

function renderParticles() {
  fxCtx.clearRect(0, 0, viewport.w, viewport.h);
  for (const p of state.particles) {
    const s = worldToScreen(p.x, p.y);
    if (s.x < -20 || s.x > viewport.w + 20 || s.y < -20 || s.y > viewport.h + 20) continue;
    fxCtx.globalAlpha = clamp(p.life, 0, 1);
    fxCtx.fillStyle = p.color;
    fxCtx.beginPath();
    fxCtx.arc(s.x, s.y, p.size * p.life, 0, Math.PI * 2);
    fxCtx.fill();
  }
  fxCtx.globalAlpha = 1;
}

function shake(amount) { state.camera.shake = Math.max(state.camera.shake, amount); }

// ==================== Single Player World ====================
function createSnake({ id, name, color, skin, klass, isBot, x, y, angle }) {
  const ws = worldSize();
  x = x ?? rand(200, ws - 200);
  y = y ?? rand(200, ws - 200);
  angle = angle ?? rand(0, Math.PI * 2);
  const segs = [];
  for (let i = 0; i < CFG.START_LENGTH; i++) {
    segs.push({ x: x - Math.cos(angle) * i * CFG.SEGMENT_SPACING, y: y - Math.sin(angle) * i * CFG.SEGMENT_SPACING });
  }
  return {
    id, name, color, skin: skin || 'solid', klass: klass || 'classic', isBot: !!isBot,
    x, y, angle, targetAngle: angle,
    segments: segs,
    length: CFG.START_LENGTH,
    peakLength: CFG.START_LENGTH,
    boosting: false,
    boostCarry: 0,
    alive: true,
    kills: 0,
    streak: 0,
    botCooldown: 0,
    botGoal: null,
    effects: {},
    abilityCdEnd: 0,
    abilityActiveUntil: 0,
    activeAbility: null,
    botAbilityCooldown: rand(4, 12)
  };
}

function spawnWorld() {
  const ws = state.room === 'br' ? CFG.WORLD_BR : CFG.WORLD_CLASSIC;
  const w = {
    snakes: new Map(),
    food: [],
    powerups: [],
    bombs: [],
    mines: [],
    lasers: [],
    foodSeq: 1,
    puSeq: 1,
    bombSeq: 1,
    mineSeq: 1,
    zone: state.room === 'br' ? { x: ws / 2, y: ws / 2, r: ws * 0.7 } : null,
    zoneTimer: 0
  };
  // bombs y mines iniciales (escalan con dificultad)
  const diffMul = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium).hazardMul;
  const bombTarget = Math.round((state.room === 'br' ? 12 : 8) * diffMul);
  const mineTarget = Math.round((state.room === 'br' ? 35 : 25) * diffMul);
  for (let i = 0; i < bombTarget; i++) {
    w.bombs.push({ id: w.bombSeq++, x: rand(150, ws - 150), y: rand(150, ws - 150), bornAt: Date.now() });
  }
  for (let i = 0; i < mineTarget; i++) {
    w.mines.push({ id: w.mineSeq++, x: rand(80, ws - 80), y: rand(80, ws - 80), bornAt: Date.now() });
  }
  // lasers
  const laserCount = state.room === 'br' ? 8 : 6;
  for (let i = 0; i < laserCount; i++) {
    const wall = i % 4;
    let ox, oy;
    const t = (Math.floor(i / 4) + 0.5) / Math.ceil(laserCount / 4);
    if (wall === 0) { ox = ws * t; oy = 0; }
    else if (wall === 1) { ox = ws; oy = ws * t; }
    else if (wall === 2) { ox = ws * t; oy = ws; }
    else { ox = 0; oy = ws * t; }
    w.lasers.push({
      id: i, ox, oy,
      angle: Math.atan2(ws / 2 - oy, ws / 2 - ox),
      rotSpeed: rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1),
      period: rand(3.5, 5.5),
      phase: Math.random() * 5,
      active: false,
      warming: false
    });
  }
  // jugador
  const player = createSnake({
    id: 'me', name: state.name, color: state.color, skin: state.skin,
    klass: state.klass, isBot: false
  });
  w.snakes.set(player.id, player);
  state.player = player;
  // bots (cantidad segun dificultad)
  const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium;
  const botNames = ['Dante', 'Lucia', 'Rex', 'Mila', 'Zeus', 'Nina', 'Kai', 'Lola', 'Tito', 'Vera', 'Otto', 'Sasha', 'Elsa', 'Bruno', 'Ari', 'Toni', 'Ema', 'Nico', 'Lupe', 'Bea', 'Hugo', 'Leo', 'Ire', 'Pia', 'Tom'];
  const klassKeys = Object.keys(CLASSES);
  const skinKeys = SKINS;
  for (let i = 0; i < diff.bots; i++) {
    const id = 'bot_' + i;
    const c = COLORS[Math.floor(Math.random() * COLORS.length)];
    const k = klassKeys[Math.floor(Math.random() * klassKeys.length)];
    const sk = skinKeys[Math.floor(Math.random() * skinKeys.length)];
    w.snakes.set(id, createSnake({
      id, name: botNames[i % botNames.length] + (i >= botNames.length ? ' ' + i : ''),
      color: c, skin: sk, klass: k, isBot: true
    }));
  }
  for (let i = 0; i < CFG.FOOD_TARGET; i++) spawnFood(w);
  for (let i = 0; i < CFG.POWERUP_TARGET; i++) spawnPowerup(w);
  ensureShields(w);
  return w;
}

function spawnFood(w, x, y, value = 1, color) {
  const ws = worldSize();
  w.food.push({
    id: w.foodSeq++,
    x: x ?? rand(40, ws - 40),
    y: y ?? rand(40, ws - 40),
    v: value,
    c: color || (value > 1 ? '#fff5a8' : ['#ff8c8c', '#8cffd1', '#8cb8ff', '#f5d68c'][Math.floor(Math.random() * 4)])
  });
}

function spawnPowerup(w, x, y, type) {
  const ws = worldSize();
  w.powerups.push({
    id: w.puSeq++,
    type: type || POWERUP_SPAWN_TYPES[Math.floor(Math.random() * POWERUP_SPAWN_TYPES.length)],
    x: x ?? rand(80, ws - 80),
    y: y ?? rand(80, ws - 80),
    bornAt: Date.now()
  });
}

function ensureFood(w) { while (w.food.length < CFG.FOOD_TARGET) spawnFood(w); }
function ensurePowerups(w) { while (w.powerups.length < CFG.POWERUP_TARGET) spawnPowerup(w); }
function ensureShields(w) {
  let count = 0;
  for (const pu of w.powerups) if (pu.type === 'shield') count++;
  while (count < CFG.SHIELD_TARGET) {
    spawnPowerup(w, undefined, undefined, 'shield');
    count++;
  }
}
function ensureBombs(w) {
  const diffMul = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium).hazardMul;
  const bombTarget = Math.round((state.room === 'br' ? 12 : 8) * diffMul);
  const ws = worldSize();
  while (w.bombs.length < bombTarget) {
    w.bombs.push({ id: w.bombSeq++, x: rand(150, ws - 150), y: rand(150, ws - 150), bornAt: Date.now() });
  }
}
function ensureMines(w) {
  const diffMul = (DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium).hazardMul;
  const mineTarget = Math.round((state.room === 'br' ? 35 : 25) * diffMul);
  const ws = worldSize();
  while (w.mines.length < mineTarget) {
    w.mines.push({ id: w.mineSeq++, x: rand(80, ws - 80), y: rand(80, ws - 80), bornAt: Date.now() });
  }
}

function updateLasersSP(w, dt) {
  const now = Date.now() / 1000;
  for (const l of w.lasers) {
    l.angle += l.rotSpeed * dt;
    const phaseT = ((now + l.phase) % l.period);
    l.active = phaseT < 1.2;
    l.warming = phaseT >= 1.2 && phaseT < 1.6;
  }
}

function checkHazardsSP(w) {
  for (const s of w.snakes.values()) {
    if (!s.alive) continue;
    if (hasEffect(s, 'godmode')) continue;
    const r = radiusFor(s.length);
    // bombas
    for (let i = w.bombs.length - 1; i >= 0; i--) {
      const b = w.bombs[i];
      const dx = b.x - s.x, dy = b.y - s.y;
      const hit = r + 12;
      if (dx * dx + dy * dy < hit * hit) {
        s.length -= 30;
        for (let k = 0; k < 25; k++) spawnFood(w, b.x + rand(-60, 60), b.y + rand(-60, 60), Math.random() < 0.2 ? 3 : 1);
        spawnParticles(b.x, b.y, 50, '#ff7e3a', { speed: 8, size: rand(3, 8) });
        if (s === state.player) { shake(20); playSound('death'); }
        // damage area a otros
        for (const o of w.snakes.values()) {
          if (o === s || !o.alive) continue;
          if (hasEffect(o, 'godmode')) continue;
          const dx2 = o.x - b.x, dy2 = o.y - b.y;
          if (dx2 * dx2 + dy2 * dy2 < 90 * 90) {
            o.length -= 15;
            if (o.length <= 1) killSnake(w, o, s);
          }
        }
        if (s.length <= 1) killSnake(w, s, null);
        w.bombs.splice(i, 1);
      }
    }
    if (!s.alive) continue;
    // minas
    for (let i = w.mines.length - 1; i >= 0; i--) {
      const m = w.mines[i];
      const dx = m.x - s.x, dy = m.y - s.y;
      const hit = r + 6;
      if (dx * dx + dy * dy < hit * hit) {
        s.length -= 15;
        for (let k = 0; k < 10; k++) spawnFood(w, m.x + rand(-30, 30), m.y + rand(-30, 30));
        spawnParticles(m.x, m.y, 25, '#ffb35e', { speed: 5, size: rand(2, 5) });
        if (s === state.player) { shake(10); playSound('boost'); }
        if (s.length <= 1) killSnake(w, s, null);
        w.mines.splice(i, 1);
      }
    }
    if (!s.alive) continue;
    // lasers
    for (const l of w.lasers) {
      if (!l.active) continue;
      if (pointNearLaserClient(s, l, r)) {
        s.length -= 3 / CFG.TICK_HZ * (CFG.TICK_HZ / 60); // depende del dt; se aplica por tick
        if (s === state.player && Math.random() < 0.2) spawnParticles(s.x, s.y, 1, '#ff5e7a', { speed: 1, size: 2 });
        if (s.length <= 1) { killSnake(w, s, null); break; }
      }
    }
  }
}

function pointNearLaserClient(p, l, r) {
  const len = 5000;
  const ex = l.ox + Math.cos(l.angle) * len;
  const ey = l.oy + Math.sin(l.angle) * len;
  const dx = ex - l.ox, dy = ey - l.oy;
  const t = clamp(((p.x - l.ox) * dx + (p.y - l.oy) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  const px = l.ox + dx * t, py = l.oy + dy * t;
  const ddx = p.x - px, ddy = p.y - py;
  const beam = 8 + r * 0.4;
  return ddx * ddx + ddy * ddy < beam * beam;
}

function applyEffect(s, type, durSec) { s.effects[type] = Date.now() + durSec * 1000; }
function hasEffect(s, type) { return (s.effects[type] || 0) > Date.now(); }

function botThink(s, w, dt) {
  const diff = DIFFICULTIES[state.difficulty] || DIFFICULTIES.medium;
  s.botCooldown -= dt;
  s.botAbilityCooldown -= dt;

  // intentar habilidad segun dificultad
  if (s.botAbilityCooldown <= 0 && Date.now() > s.abilityCdEnd) {
    if (Math.random() < diff.abilityChance) executeAbilitySP(w, s);
    s.botAbilityCooldown = rand(8, 18) * diff.reactionMul;
  }

  // evasion (radio mayor en niveles altos)
  const evadeRadius = 90 / Math.max(0.6, diff.reactionMul);
  let evade = null, evadeDist = 1e9;
  for (const o of w.snakes.values()) {
    if (o === s || !o.alive) continue;
    if (hasEffect(s, 'phantom')) continue;
    const dx = o.x - s.x, dy = o.y - s.y;
    const d2 = dx * dx + dy * dy;
    const danger = evadeRadius + radiusFor(o.length);
    if (d2 < danger * danger) {
      const facing = Math.cos(o.angle) * (-dx) + Math.sin(o.angle) * (-dy);
      if (facing > 0 && d2 < evadeDist) { evadeDist = d2; evade = o; }
    }
  }
  if (evade) {
    const away = Math.atan2(s.y - evade.y, s.x - evade.x);
    s.targetAngle = away + (Math.random() - 0.5) * 0.6;
    s.boosting = Math.random() < diff.evadeBoostChance && (s.length > CFG.START_LENGTH + 4 || hasEffect(s, 'frenzy'));
    return;
  }

  // borde
  const ws = worldSize();
  const margin = 200;
  if (s.x < margin || s.x > ws - margin || s.y < margin || s.y > ws - margin) {
    s.targetAngle = Math.atan2(ws / 2 - s.y, ws / 2 - s.x);
    s.boosting = false;
    return;
  }

  // BR zone
  if (w.zone) {
    const dx = s.x - w.zone.x, dy = s.y - w.zone.y;
    if (dx * dx + dy * dy > w.zone.r * w.zone.r * 0.9) {
      s.targetAngle = Math.atan2(w.zone.y - s.y, w.zone.x - s.x);
      s.boosting = true;
      return;
    }
  }

  // power-ups cercanos
  let bestPu = null, bestPuD = 1e9;
  for (const pu of w.powerups) {
    const dx = pu.x - s.x, dy = pu.y - s.y;
    const d = dx * dx + dy * dy;
    if (d < 250 * 250 && d < bestPuD) { bestPuD = d; bestPu = pu; }
  }
  if (bestPu) {
    s.targetAngle = Math.atan2(bestPu.y - s.y, bestPu.x - s.x);
    s.boosting = false;
    return;
  }

  // comida (cooldown de busqueda escala con dificultad)
  if (s.botCooldown <= 0 || !s.botGoal) {
    let best = null, bestD = 1e9;
    for (let i = 0; i < w.food.length; i += 3) {
      const f = w.food[i];
      const dx = f.x - s.x, dy = f.y - s.y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = f; }
    }
    s.botGoal = best;
    s.botCooldown = (0.3 + Math.random() * 0.5) * diff.reactionMul;
  }
  if (s.botGoal) {
    s.targetAngle = Math.atan2(s.botGoal.y - s.y, s.botGoal.x - s.x) + (Math.random() - 0.5) * 0.1;
  }
  s.boosting = false;
}

function killSnake(w, s, killer) {
  if (!s.alive) return;
  if (hasEffect(s, 'godmode')) return;
  if (hasEffect(s, 'shield')) {
    s.effects.shield = 0;
    spawnParticles(s.x, s.y, 30, '#ffd75e', { speed: 4, decay: 0.05 });
    if (s === state.player) playSound('powerup');
    return;
  }

  // Sistema de vidas en SP: si al jugador le quedan vidas, respawnea sin morir del todo
  if (s === state.player && state.mode === 'single' && state.lives > 1) {
    state.lives -= 1;
    // explosion en el lugar
    spawnParticles(s.x, s.y, 40, s.color, { speed: 6, decay: 0.03, size: rand(3, 8) });
    // dropea un poco de comida (el "cuerpo" se desparrama parcial)
    const drops = Math.min(50, Math.floor(s.length * 0.6));
    for (let i = 0; i < drops; i++) {
      const seg = s.segments[Math.floor(Math.random() * s.segments.length)];
      if (!seg) continue;
      spawnFood(w, seg.x + rand(-10, 10), seg.y + rand(-10, 10), Math.random() < 0.18 ? 3 : 1, s.color);
    }
    // crear nueva serpiente conservando algo de progreso
    const oldKills = s.kills;
    const newLen = Math.max(CFG.START_LENGTH, Math.floor(s.length * 0.5));
    w.snakes.delete(s.id);
    const fresh = createSnake({
      id: 'me', name: state.name, color: state.color, skin: state.skin,
      klass: state.klass, isBot: false
    });
    fresh.length = newLen;
    fresh.kills = oldKills;
    applyEffect(fresh, 'godmode', 2.5);
    w.snakes.set(fresh.id, fresh);
    state.player = fresh;
    state.camera.x = fresh.x - viewport.w / 2;
    state.camera.y = fresh.y - viewport.h / 2;
    playSound('death');
    shake(18);
    flashLifeLost();
    return;
  }

  s.alive = false;
  if (killer && killer !== s) {
    killer.kills += 1;
    killer.streak += 1;
    if (killer === state.player) {
      onKill(s);
    }
  }
  // explosion
  spawnParticles(s.x, s.y, 40, s.color, { speed: 6, decay: 0.03, size: rand(3, 8) });
  if (s === state.player) {
    playSound('death');
    shake(20);
    onPlayerDied();
  } else {
    if (state.player && distSq(s, state.player) < 600 * 600) playSound('kill');
    showKillfeed(killer ? killer.name : 'world', s.name);
  }
  const drops = Math.min(120, Math.floor(s.length));
  for (let i = 0; i < drops; i++) {
    const seg = s.segments[Math.floor(Math.random() * s.segments.length)];
    if (!seg) continue;
    spawnFood(w, seg.x + rand(-10, 10), seg.y + rand(-10, 10), Math.random() < 0.18 ? 3 : 1, s.color);
  }
  if (Math.random() < 0.5) spawnPowerup(w, s.x + rand(-30, 30), s.y + rand(-30, 30));
  ensureFood(w);

  if (s.isBot) {
    setTimeout(() => {
      if (!state.world) return;
      const fresh = createSnake({
        id: s.id, name: s.name, color: s.color, skin: s.skin, klass: s.klass, isBot: true
      });
      w.snakes.set(s.id, fresh);
    }, 2000);
  }
}

function distSq(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }

function executeAbilitySP(w, s) {
  const klass = CLASSES[s.klass];
  if (!klass.ab || !s.alive) return false;
  if (Date.now() < s.abilityCdEnd) return false;
  switch (klass.ab) {
    case 'dash': {
      const dist = 100;
      s.x += Math.cos(s.angle) * dist;
      s.y += Math.sin(s.angle) * dist;
      const ws = worldSize();
      s.x = clamp(s.x, 20, ws - 20);
      s.y = clamp(s.y, 20, ws - 20);
      spawnParticles(s.x, s.y, 20, s.color, { speed: 5, size: rand(2, 4) });
      s.activeAbility = 'dash'; s.abilityActiveUntil = Date.now() + 250;
      break;
    }
    case 'intangible':
      applyEffect(s, 'phantom', 3);
      s.activeAbility = 'intangible'; s.abilityActiveUntil = Date.now() + 3000;
      break;
    case 'vacuum': {
      const radius = 350;
      for (const f of w.food) {
        const dx = s.x - f.x, dy = s.y - f.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius) { f.x += (dx / d) * 80; f.y += (dy / d) * 80; }
      }
      spawnParticles(s.x, s.y, 30, '#5ee0ff', { speed: 8, decay: 0.04 });
      s.activeAbility = 'vacuum'; s.abilityActiveUntil = Date.now() + 600;
      break;
    }
    case 'bomb': {
      if (s.length > CFG.START_LENGTH + 8) {
        s.length -= 8;
        const bx = s.x - Math.cos(s.angle) * 60;
        const by = s.y - Math.sin(s.angle) * 60;
        for (let i = 0; i < 30; i++) {
          spawnFood(w, bx + rand(-50, 50), by + rand(-50, 50), Math.random() < 0.2 ? 3 : 1, s.color);
        }
        spawnParticles(bx, by, 40, '#ff9c5e', { speed: 8, size: rand(3, 6) });
        s.activeAbility = 'bomb'; s.abilityActiveUntil = Date.now() + 400;
      } else { return false; }
      break;
    }
    case 'reveal':
      applyEffect(s, 'frenzy', 5);
      s.activeAbility = 'reveal'; s.abilityActiveUntil = Date.now() + 5000;
      break;
  }
  s.abilityCdEnd = Date.now() + klass.cd * 1000;
  if (s === state.player) playSound('ability');
  return true;
}

function updateSnakeSP(s, w, dt) {
  if (!s.alive) return;
  if (s.isBot) botThink(s, w, dt);

  let target = s.targetAngle;
  if (hasEffect(s, 'reversed')) target = s.targetAngle + Math.PI;
  let diff = target - s.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  diff = clamp(diff, -CFG.MAX_TURN_RATE, CFG.MAX_TURN_RATE);
  s.angle += diff;
  if (s.length > s.peakLength) s.peakLength = s.length;

  const klass = CLASSES[s.klass];
  let speedMul = klass.speedMul;
  if (hasEffect(s, 'frenzy')) speedMul *= 1.25;
  if (hasEffect(s, 'turbo')) speedMul *= 1.7;
  if (hasEffect(s, 'frozen')) speedMul = 0;
  for (const o of w.snakes.values()) {
    if (o === s || !o.alive) continue;
    if (hasEffect(o, 'frost')) {
      const dx = o.x - s.x, dy = o.y - s.y;
      if (dx * dx + dy * dy < 400 * 400) speedMul *= 0.6;
    }
  }

  const canBoost = (s.boosting && !hasEffect(s, 'frozen') && (s.length > CFG.START_LENGTH + 1 || hasEffect(s, 'frenzy') || hasEffect(s, 'turbo')));
  const speed = (canBoost ? CFG.BOOST_SPEED : CFG.BASE_SPEED) * speedMul * dt * 60;
  s.x += Math.cos(s.angle) * speed;
  s.y += Math.sin(s.angle) * speed;

  // BR zone damage
  if (w.zone) {
    const dx = s.x - w.zone.x, dy = s.y - w.zone.y;
    if (dx * dx + dy * dy > w.zone.r * w.zone.r) {
      s.length -= 8 * dt;
      if (s === state.player && Math.random() < 0.3) {
        spawnParticles(s.x, s.y, 1, '#ff5e7a', { speed: 1, size: 3 });
      }
      if (s.length <= 1) { killSnake(w, s, null); return; }
    }
  }

  const r = radiusFor(s.length);
  const ws = worldSize();
  if (s.x < r || s.x > ws - r || s.y < r || s.y > ws - r) {
    killSnake(w, s, null);
    return;
  }

  s.segments.unshift({ x: s.x, y: s.y });
  const desired = Math.max(2, Math.floor(s.length));
  while (s.segments.length > desired) s.segments.pop();

  if (canBoost && !hasEffect(s, 'frenzy')) {
    s.boostCarry += CFG.BOOST_COST_PER_SEC * dt;
    while (s.boostCarry >= 1 && s.length > CFG.START_LENGTH) {
      s.boostCarry -= 1;
      s.length -= 1;
      const tail = s.segments[s.segments.length - 1];
      if (tail) spawnFood(w, tail.x + rand(-3, 3), tail.y + rand(-3, 3), 1, s.color);
    }
  }

  // magnet
  let magnetRadius = 0;
  if (klass.passive === 'magnet_small') magnetRadius = Math.max(magnetRadius, 70);
  if (hasEffect(s, 'magnet')) magnetRadius = Math.max(magnetRadius, 220);
  if (magnetRadius > 0) {
    for (const f of w.food) {
      const dx = s.x - f.x, dy = s.y - f.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < magnetRadius * magnetRadius && d2 > 1) {
        const d = Math.sqrt(d2);
        const force = 6 * (1 - d / magnetRadius);
        f.x += (dx / d) * force;
        f.y += (dy / d) * force;
      }
    }
  }

  // comer
  const eatR = r + 4;
  const megaMul = hasEffect(s, 'mega') ? 3 : 1;
  for (let i = w.food.length - 1; i >= 0; i--) {
    const f = w.food[i];
    const dx = f.x - s.x, dy = f.y - s.y;
    if (dx * dx + dy * dy < eatR * eatR) {
      s.length += f.v * megaMul;
      if (s === state.player) {
        playSound('eat');
        spawnParticles(f.x, f.y, 4, f.c, { speed: 1.5, decay: 0.06, size: 2 });
      }
      w.food.splice(i, 1);
    }
  }

  // power-ups
  for (let i = w.powerups.length - 1; i >= 0; i--) {
    const pu = w.powerups[i];
    const dx = pu.x - s.x, dy = pu.y - s.y;
    if (dx * dx + dy * dy < (eatR + 8) * (eatR + 8)) {
      handlePowerupPickupSP(w, s, pu);
      w.powerups.splice(i, 1);
    }
  }
}

function handlePowerupPickupSP(w, s, pu) {
  const def = POWERUPS[pu.type];
  if (!def) return;
  if (s === state.player) {
    playSound('powerup');
    spawnParticles(pu.x, pu.y, 25, def.color, { speed: 5, size: rand(3, 6) });
  }
  if (def.instant) {
    if (pu.type === 'crystal') {
      s.length += 30;
    } else if (pu.type === 'bolt') {
      // matar al enemigo mas cercano (radio 350) que no sea mucho mas grande
      let target = null, bestD = 350 * 350;
      for (const o of w.snakes.values()) {
        if (o === s || !o.alive || hasEffect(o, 'phantom')) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        const d = dx * dx + dy * dy;
        if (d < bestD && o.length < s.length * 1.5) { bestD = d; target = o; }
      }
      if (target) {
        // efecto visual de rayo
        if (s === state.player || target === state.player) {
          drawLightning(s.x, s.y, target.x, target.y);
          shake(12);
        }
        killSnake(w, target, s);
      }
    } else if (pu.type === 'freeze') {
      for (const o of w.snakes.values()) {
        if (o === s || !o.alive) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        if (dx * dx + dy * dy < 500 * 500) {
          applyEffect(o, 'frozen', 3);
          spawnParticles(o.x, o.y, 12, '#7ad8ff', { speed: 3, size: 3 });
        }
      }
      spawnFreezeShockwave(s.x, s.y);
    } else if (pu.type === 'hypno') {
      for (const o of w.snakes.values()) {
        if (o === s || !o.alive) continue;
        const dx = o.x - s.x, dy = o.y - s.y;
        if (dx * dx + dy * dy < 500 * 500) {
          applyEffect(o, 'reversed', 5);
          spawnParticles(o.x, o.y, 14, '#ff5edc', { speed: 4, size: 3 });
        }
      }
      spawnHypnoShockwave(s.x, s.y);
    } else if (pu.type === 'heart') {
      const peak = s.peakLength || s.length;
      const lost = Math.max(0, peak - s.length);
      const heal = Math.max(50, lost * 0.5);
      s.length += heal;
      if (s === state.player) {
        spawnParticles(s.x, s.y, 30, '#ff5e7a', { speed: 5, size: 4 });
      }
    }
  } else {
    applyEffect(s, pu.type, def.dur);
  }
}

function spawnHypnoShockwave(x, y) {
  shockwaves.push({ x, y, r: 0, color: '#ff5edc', t: Date.now() });
}

const lightningBolts = [];
function drawLightning(x1, y1, x2, y2) {
  lightningBolts.push({ x1, y1, x2, y2, t: Date.now() });
}
const shockwaves = [];
function spawnFreezeShockwave(x, y) {
  shockwaves.push({ x, y, r: 0, color: '#7ad8ff', t: Date.now() });
}

function checkCollisionsSP(w) {
  const list = Array.from(w.snakes.values()).filter(s => s.alive);
  for (const s of list) {
    if (hasEffect(s, 'phantom')) continue;
    const r = radiusFor(s.length);
    for (const o of list) {
      if (o === s) continue;
      const orad = radiusFor(o.length);
      for (let i = 1; i < o.segments.length; i++) {
        const seg = o.segments[i];
        const dx = seg.x - s.x, dy = seg.y - s.y;
        const hit = r + orad * 0.6;
        if (dx * dx + dy * dy < hit * hit) {
          killSnake(w, s, o);
          break;
        }
      }
      if (!s.alive) break;
    }
  }
}

function updateZoneSP(w, dt) {
  if (!w.zone) return;
  const minR = 400;
  if (w.zone.r > minR) w.zone.r = Math.max(minR, w.zone.r - 8 * dt);
}

// ==================== Multijugador ====================
function connectMultiplayer() {
  if (state.socket && state.socket.connected) {
    state.socket.emit('join', { name: state.name, color: state.color, skin: state.skin, klass: state.klass, mode: state.room });
    return;
  }
  state.socket = io({ transports: ['websocket'] });
  state.remote = { prev: null, curr: null, foodMap: new Map(), prevPlayers: new Map() };

  state.socket.on('connect', () => {
    state.socket.emit('join', { name: state.name, color: state.color, skin: state.skin, klass: state.klass, mode: state.room });
  });
  state.socket.on('joined', (d) => { state.myId = d.id; });
  state.socket.on('state', (snap) => {
    state.remote.prev = state.remote.curr;
    state.remote.curr = snap;
    state.remote.foodMap.clear();
    for (const f of snap.food) state.remote.foodMap.set(f[0], { id: f[0], x: f[1], y: f[2], v: f[3], c: f[4] });
  });
  state.socket.on('powerup', (d) => {
    const def = POWERUPS[d.type];
    if (!def) return;
    playSound('powerup');
    const me = getMyEntity();
    if (!me) return;
    spawnParticles(me.x, me.y, 25, def.color, { speed: 5, size: rand(3, 6) });
    if (d.type === 'freeze') { spawnFreezeShockwave(me.x, me.y); shake(8); }
    if (d.type === 'bolt') shake(12);
    if (d.type === 'crystal') shake(4);
  });
  state.socket.on('struckByBolt', () => {
    playSound('death');
    shake(18);
  });
  state.socket.on('frozenByPlayer', () => {
    playSound('powerup');
    shake(8);
  });
  state.socket.on('hypnotizedBy', () => {
    playSound('powerup');
    shake(6);
  });
  state.socket.on('hazardHit', (d) => {
    playSound('death');
    shake(d.type === 'bomb' ? 18 : 10);
    spawnParticles(d.x, d.y, 40, d.type === 'bomb' ? '#ff7e3a' : '#ffb35e', { speed: 7, size: rand(3, 6) });
  });
  state.socket.on('died', (d) => { onPlayerDied(d); });
  state.socket.on('abilityFired', (d) => {
    state.abilityCdEnd = Date.now() + d.cd * 1000;
    playSound('ability');
  });
  state.socket.on('emote', (d) => {
    state.emotes.push({ playerId: d.id, e: d.e, t: Date.now() });
  });
}

function sendInputMP() {
  if (!state.socket || !state.socket.connected) return;
  state.socket.emit('input', { angle: state.input.angle, boost: state.input.boost });
}

let mpInputTimer = null;

// ==================== Bucle principal ====================
let lastFrame = performance.now();
let acc = 0;
const TICK_DT = 1 / CFG.TICK_HZ;

function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  if (state.running && !state.paused) {
    updateInputAngle();
    if (state.mode === 'single') {
      acc += dt;
      while (acc >= TICK_DT) {
        if (state.player && state.player.alive) {
          state.player.targetAngle = state.input.angle;
          state.player.boosting = state.input.boost;
        }
        updateLasersSP(state.world, TICK_DT);
        for (const s of state.world.snakes.values()) updateSnakeSP(s, state.world, TICK_DT);
        checkCollisionsSP(state.world);
        checkHazardsSP(state.world);
        updateZoneSP(state.world, TICK_DT);
        ensureFood(state.world);
        ensurePowerups(state.world);
        ensureShields(state.world);
        ensureBombs(state.world);
        ensureMines(state.world);
        acc -= TICK_DT;
      }
    }
    updateParticles(dt);
    render();
    updateHUD();
  } else if (state.running && state.paused) {
    // mantener render para mostrar el mundo congelado
    render();
    updateHUD();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function updateInputAngle() {
  // prioridad: joystick > flechas/WASD > mouse
  if (state.joystickAngle !== null) {
    state.input.angle = state.joystickAngle;
    return;
  }
  let dx = 0, dy = 0;
  if (state.arrows.up) dy -= 1;
  if (state.arrows.down) dy += 1;
  if (state.arrows.left) dx -= 1;
  if (state.arrows.right) dx += 1;
  if (dx !== 0 || dy !== 0) {
    state.input.angle = Math.atan2(dy, dx);
    return;
  }
  const cx = viewport.w / 2;
  const cy = viewport.h / 2;
  state.input.angle = Math.atan2(state.mouse.y - cy, state.mouse.x - cx);
}

// ==================== Render ====================
function getMyEntity() {
  if (state.mode === 'single') return state.player;
  if (state.mode === 'multi' && state.remote && state.remote.curr) {
    return state.remote.curr.players.find(p => p.id === state.myId) || null;
  }
  return null;
}

function getAllSnakesForRender(alphaT) {
  if (state.mode === 'single') {
    return Array.from(state.world.snakes.values()).map(s => ({
      ...s, isMe: s === state.player
    }));
  }
  const r = state.remote;
  if (!r.curr) return [];
  const out = [];
  const prev = r.prev;
  for (const cp of r.curr.players) {
    let pp = prev ? prev.players.find(p => p.id === cp.id) : null;
    let segs;
    if (pp && pp.seg.length === cp.seg.length) {
      segs = cp.seg.map((s, i) => ({ x: lerp(pp.seg[i][0], s[0], alphaT), y: lerp(pp.seg[i][1], s[1], alphaT) }));
    } else {
      segs = cp.seg.map(s => ({ x: s[0], y: s[1] }));
    }
    let x = cp.x, y = cp.y, a = cp.a;
    if (pp) {
      x = lerp(pp.x, cp.x, alphaT);
      y = lerp(pp.y, cp.y, alphaT);
      a = angleLerp(pp.a, cp.a, alphaT);
    }
    out.push({
      id: cp.id, name: cp.n, color: cp.c, skin: cp.sk, klass: cp.kl,
      x, y, angle: a, length: cp.l, alive: cp.al, kills: cp.ki, streak: cp.st,
      segments: segs, effects: cp.ef || {},
      activeAbility: cp.ab, isMe: cp.id === state.myId
    });
  }
  return out;
}

function getFoodForRender() {
  if (state.mode === 'single') return state.world.food;
  if (state.remote && state.remote.curr) return Array.from(state.remote.foodMap.values());
  return [];
}

function getPowerupsForRender() {
  if (state.mode === 'single') return state.world.powerups;
  if (state.remote && state.remote.curr) return state.remote.curr.pu.map(p => ({ id: p[0], x: p[1], y: p[2], type: p[3] }));
  return [];
}

function getZoneForRender() {
  if (state.mode === 'single') return state.world ? state.world.zone : null;
  if (state.remote && state.remote.curr) return state.remote.curr.zone;
  return null;
}

function getBombsForRender() {
  if (state.mode === 'single') return state.world ? state.world.bombs : [];
  if (state.remote && state.remote.curr && state.remote.curr.bombs) {
    return state.remote.curr.bombs.map(b => ({ id: b[0], x: b[1], y: b[2] }));
  }
  return [];
}
function getMinesForRender() {
  if (state.mode === 'single') return state.world ? state.world.mines : [];
  if (state.remote && state.remote.curr && state.remote.curr.mines) {
    return state.remote.curr.mines.map(m => ({ id: m[0], x: m[1], y: m[2] }));
  }
  return [];
}
function getLasersForRender() {
  if (state.mode === 'single') return state.world ? state.world.lasers : [];
  if (state.remote && state.remote.curr && state.remote.curr.lasers) {
    return state.remote.curr.lasers.map(l => ({
      id: l[0], ox: l[1], oy: l[2], angle: parseFloat(l[3]),
      active: l[4] === 1, warming: l[5] === 1
    }));
  }
  return [];
}

let renderClock = 0;
function render() {
  renderClock += 0.02;
  let alphaT = 1;
  if (state.mode === 'multi' && state.remote.curr && state.remote.prev) {
    const elapsed = (Date.now() - state.remote.curr.t) / (1000 / 20);
    alphaT = clamp(elapsed, 0, 1.5);
  }

  const me = getMyEntity();
  const meScreen = me ? me : { x: worldSize() / 2, y: worldSize() / 2 };
  state.camera.x = lerp(state.camera.x, meScreen.x - viewport.w / 2, 0.2);
  state.camera.y = lerp(state.camera.y, meScreen.y - viewport.h / 2, 0.2);

  // shake
  let shakeX = 0, shakeY = 0;
  if (state.camera.shake > 0.1) {
    shakeX = rand(-1, 1) * state.camera.shake;
    shakeY = rand(-1, 1) * state.camera.shake;
    state.camera.shake *= 0.85;
  }

  ctx.save();
  ctx.clearRect(0, 0, viewport.w, viewport.h);
  ctx.translate(shakeX, shakeY);
  drawBackground();

  const snakes = getAllSnakesForRender(alphaT);
  const food = getFoodForRender();
  const powerups = getPowerupsForRender();
  const zone = getZoneForRender();

  drawZone(zone);
  drawFood(food);
  drawPowerups(powerups);
  drawHazards(getBombsForRender(), getMinesForRender(), getLasersForRender());

  snakes.sort((a, b) => (a.isMe ? 1 : 0) - (b.isMe ? 1 : 0));
  for (const s of snakes) drawSnake(s);

  drawWorldBorder();
  drawEmotes(snakes);
  drawLightnings();
  drawShockwaves();
  ctx.restore();

  renderParticles();
  drawMinimap(snakes, me, zone);
}

function drawLightnings() {
  const now = Date.now();
  for (let i = lightningBolts.length - 1; i >= 0; i--) {
    const b = lightningBolts[i];
    const age = now - b.t;
    if (age > 350) { lightningBolts.splice(i, 1); continue; }
    const alpha = 1 - age / 350;
    const a = worldToScreen(b.x1, b.y1);
    const c = worldToScreen(b.x2, b.y2);
    ctx.strokeStyle = `rgba(255,244,94,${alpha})`;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#fff45e';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    // zigzag
    const segs = 6;
    for (let s = 1; s < segs; s++) {
      const t = s / segs;
      const px = lerp(a.x, c.x, t) + rand(-15, 15);
      const py = lerp(a.y, c.y, t) + rand(-15, 15);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawHazards(bombs, mines, lasers) {
  // lasers (primero, atras)
  for (const l of lasers) {
    const a = worldToScreen(l.ox, l.oy);
    const len = 5000;
    const ex = l.ox + Math.cos(l.angle) * len;
    const ey = l.oy + Math.sin(l.angle) * len;
    const b = worldToScreen(ex, ey);
    if (l.warming) {
      ctx.strokeStyle = 'rgba(255, 200, 100, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    } else if (l.active) {
      ctx.strokeStyle = 'rgba(255, 94, 122, 0.95)';
      ctx.lineWidth = 5 + Math.sin(renderClock * 8) * 1.5;
      ctx.shadowBlur = 26;
      ctx.shadowColor = '#ff5e7a';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      // brillo interior
      ctx.strokeStyle = 'rgba(255, 200, 220, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  // minas (chicas)
  for (const m of mines) {
    const s = worldToScreen(m.x, m.y);
    if (s.x < -30 || s.x > viewport.w + 30 || s.y < -30 || s.y > viewport.h + 30) continue;
    const pulse = 1 + Math.sin(renderClock * 4 + m.id) * 0.2;
    ctx.fillStyle = '#ffb35e';
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ff7e3a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 5 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0d18';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // bombas (grandes)
  for (const b of bombs) {
    const s = worldToScreen(b.x, b.y);
    if (s.x < -50 || s.x > viewport.w + 50 || s.y < -50 || s.y > viewport.h + 50) continue;
    const pulse = 1 + Math.sin(renderClock * 6 + b.id) * 0.15;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ff5e7a';
    ctx.fillStyle = '#3a1a1a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 14 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff5e7a';
    ctx.beginPath();
    ctx.arc(s.x, s.y - 14, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💣', s.x, s.y);
    ctx.textBaseline = 'alphabetic';
  }
}

function drawShockwaves() {
  const now = Date.now();
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    const age = (now - sw.t) / 1000;
    if (age > 0.6) { shockwaves.splice(i, 1); continue; }
    const r = age * 800;
    const alpha = 1 - age / 0.6;
    const sc = worldToScreen(sw.x, sw.y);
    ctx.strokeStyle = `rgba(122,216,255,${alpha})`;
    ctx.lineWidth = 6;
    ctx.shadowBlur = 24;
    ctx.shadowColor = sw.color;
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function worldToScreen(x, y) {
  return { x: x - state.camera.x, y: y - state.camera.y };
}

function drawBackground() {
  const grid = 80;
  const ox = -state.camera.x % grid;
  const oy = -state.camera.y % grid;
  ctx.strokeStyle = 'rgba(94, 142, 255, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = ox; x < viewport.w; x += grid) { ctx.moveTo(x, 0); ctx.lineTo(x, viewport.h); }
  for (let y = oy; y < viewport.h; y += grid) { ctx.moveTo(0, y); ctx.lineTo(viewport.w, y); }
  ctx.stroke();
}

function drawWorldBorder() {
  const ws = worldSize();
  const tl = worldToScreen(0, 0);
  const br = worldToScreen(ws, ws);
  ctx.strokeStyle = 'rgba(255, 94, 122, 0.6)';
  ctx.lineWidth = 4;
  ctx.shadowBlur = 18;
  ctx.shadowColor = 'rgba(255, 94, 122, 0.5)';
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.shadowBlur = 0;
}

function drawZone(zone) {
  if (!zone) return;
  const c = worldToScreen(zone.x, zone.y);
  // zona segura: anillo claro
  ctx.strokeStyle = 'rgba(94, 255, 182, 0.45)';
  ctx.lineWidth = 5;
  ctx.shadowBlur = 24;
  ctx.shadowColor = 'rgba(94, 255, 182, 0.6)';
  ctx.beginPath();
  ctx.arc(c.x, c.y, zone.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // afuera del area: tinte rojo
  ctx.save();
  ctx.beginPath();
  ctx.arc(c.x, c.y, zone.r, 0, Math.PI * 2);
  ctx.rect(viewport.w + 100, -100, -viewport.w - 200, viewport.h + 200);
  ctx.fillStyle = 'rgba(255, 94, 122, 0.08)';
  ctx.fill('evenodd');
  ctx.restore();
}

function drawFood(food) {
  for (const f of food) {
    const s = worldToScreen(f.x, f.y);
    if (s.x < -20 || s.x > viewport.w + 20 || s.y < -20 || s.y > viewport.h + 20) continue;
    const r = 3 + (f.v > 1 ? 2 : 0);
    const pulse = 1 + Math.sin(renderClock * 4 + f.x) * 0.15;
    ctx.fillStyle = f.c;
    ctx.shadowBlur = 8;
    ctx.shadowColor = f.c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

const PU_GLYPHS = {
  shield: '🛡', magnet: '🧲', phantom: '👻',
  frost: '❄', frenzy: '🔥', mega: '★'
};

function drawPowerups(powerups) {
  for (const pu of powerups) {
    const s = worldToScreen(pu.x, pu.y);
    if (s.x < -40 || s.x > viewport.w + 40 || s.y < -40 || s.y > viewport.h + 40) continue;
    const def = POWERUPS[pu.type];
    if (!def) continue;
    const pulse = 1 + Math.sin(renderClock * 3 + pu.id) * 0.2;
    const r = 16 * pulse;
    // halo
    ctx.shadowBlur = 22;
    ctx.shadowColor = def.color;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // anillo rotando
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const rot = renderClock * 1.5 + pu.id;
    ctx.arc(s.x, s.y, r + 4, rot, rot + Math.PI * 1.4);
    ctx.stroke();
    // glyph
    ctx.fillStyle = '#0a0d18';
    ctx.font = 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.ico, s.x, s.y);
    ctx.textBaseline = 'alphabetic';
  }
}

function getSegmentColor(s, idx, total) {
  const skin = s.skin || 'solid';
  switch (skin) {
    case 'solid': return s.color;
    case 'stripes': return idx % 4 < 2 ? s.color : shadeColor(s.color, -0.4);
    case 'gradient': {
      const t = idx / Math.max(1, total - 1);
      return mixColor(s.color, '#1a1f3a', t * 0.7);
    }
    case 'dots': return idx % 3 === 0 ? '#fff' : s.color;
    case 'rainbow': {
      const hue = (renderClock * 30 + idx * 12) % 360;
      return `hsl(${hue}, 90%, 60%)`;
    }
    case 'neon': return idx % 2 === 0 ? s.color : shadeColor(s.color, 0.5);
    default: return s.color;
  }
}

function shadeColor(hex, amt) {
  const c = parseHex(hex);
  const f = amt < 0 ? 0 : 255;
  const t = Math.abs(amt);
  return `rgb(${Math.round(c.r + (f - c.r) * t)},${Math.round(c.g + (f - c.g) * t)},${Math.round(c.b + (f - c.b) * t)})`;
}
function mixColor(a, b, t) {
  const ca = parseHex(a), cb = parseHex(b);
  return `rgb(${Math.round(ca.r + (cb.r - ca.r) * t)},${Math.round(ca.g + (cb.g - ca.g) * t)},${Math.round(ca.b + (cb.b - ca.b) * t)})`;
}
function parseHex(hex) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
}

function drawSnake(s) {
  if (!s.alive) return;
  const r = radiusFor(s.length);
  const phantom = (s.effects && s.effects.phantom > 0);
  const shield = (s.effects && s.effects.shield > 0);
  const frenzy = (s.effects && s.effects.frenzy > 0);
  const frost = (s.effects && s.effects.frost > 0);
  const mega = (s.effects && s.effects.mega > 0);
  const stealth = (s.effects && s.effects.stealth > 0);
  const frozen = (s.effects && s.effects.frozen > 0);
  const turbo = (s.effects && s.effects.turbo > 0);

  let alpha = 1;
  if (phantom) alpha = 0.5;
  if (stealth && !s.isMe) alpha = 0.18;
  else if (stealth) alpha = 0.55;
  ctx.globalAlpha = alpha;

  // boost / turbo trail
  if (s.boosting || frenzy || turbo) {
    ctx.shadowBlur = turbo ? 32 : 26;
    ctx.shadowColor = turbo ? '#ff7e3a' : (frenzy ? '#ff5e7a' : s.color);
  } else {
    ctx.shadowBlur = 0;
  }

  for (let i = s.segments.length - 1; i >= 0; i--) {
    const seg = s.segments[i];
    const sc = worldToScreen(seg.x, seg.y);
    if (sc.x < -50 || sc.x > viewport.w + 50 || sc.y < -50 || sc.y > viewport.h + 50) continue;
    const t = i / Math.max(1, s.segments.length - 1);
    const radius = r * (1 - t * 0.05);
    ctx.fillStyle = getSegmentColor(s, i, s.segments.length);
    ctx.beginPath();
    ctx.arc(sc.x, sc.y, radius, 0, Math.PI * 2);
    ctx.fill();
    if (i % 4 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(sc.x - radius * 0.3, sc.y - radius * 0.3, radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;

  // efectos visuales en cabeza
  const head = worldToScreen(s.x, s.y);
  if (shield) {
    ctx.strokeStyle = '#ffd75e';
    ctx.lineWidth = 3;
    ctx.shadowBlur = 18;
    ctx.shadowColor = '#ffd75e';
    ctx.beginPath();
    ctx.arc(head.x, head.y, r + 6 + Math.sin(renderClock * 4) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (frost) {
    ctx.strokeStyle = '#a8e6ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#a8e6ff';
    ctx.beginPath();
    ctx.arc(head.x, head.y, r + 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  if (mega) {
    ctx.fillStyle = '#fff5a8';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('★', head.x, head.y - r - 18);
  }
  if (frozen) {
    // hielo
    ctx.fillStyle = 'rgba(122, 216, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(head.x, head.y, r + 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7ad8ff';
    ctx.lineWidth = 2;
    for (let k = 0; k < 6; k++) {
      const ang = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(head.x, head.y);
      ctx.lineTo(head.x + Math.cos(ang) * (r + 12), head.y + Math.sin(ang) * (r + 12));
      ctx.stroke();
    }
  }
  if (turbo) {
    ctx.fillStyle = '#ff7e3a';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('🚀', head.x + r + 6, head.y - r);
  }
  // godmode: aura dorada
  if (s.effects && s.effects.godmode > 0) {
    ctx.strokeStyle = '#fff8c0';
    ctx.lineWidth = 4;
    ctx.shadowBlur = 32;
    ctx.shadowColor = '#fff8c0';
    ctx.beginPath();
    ctx.arc(head.x, head.y, r + 14 + Math.sin(renderClock * 5) * 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // halo extra
    ctx.fillStyle = 'rgba(255, 248, 192, 0.15)';
    ctx.beginPath();
    ctx.arc(head.x, head.y, r + 24, 0, Math.PI * 2);
    ctx.fill();
  }
  // reversed (hipnotizado): swirl encima
  if (s.effects && s.effects.reversed > 0) {
    ctx.fillStyle = '#ff5edc';
    ctx.font = '18px system-ui';
    ctx.textAlign = 'center';
    const a = renderClock * 6;
    ctx.fillText('🌀', head.x + Math.cos(a) * 4, head.y - r - 22 + Math.sin(a) * 3);
  }

  // ojos
  const eyeAngle = s.angle;
  const eyeOffset = r * 0.4;
  const eyeR = r * 0.32;
  for (const side of [-1, 1]) {
    const ex = head.x + Math.cos(eyeAngle + side * 0.6) * eyeOffset;
    const ey = head.y + Math.sin(eyeAngle + side * 0.6) * eyeOffset;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(eyeAngle) * eyeR * 0.4, ey + Math.sin(eyeAngle) * eyeR * 0.4, eyeR * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  // nombre + clase
  ctx.fillStyle = s.isMe ? '#5effb6' : 'rgba(255,255,255,0.78)';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'center';
  const cIco = CLASSES[s.klass] ? CLASSES[s.klass].ico : '';
  ctx.fillText(`${cIco} ${s.name}`, head.x, head.y - r - 8);

  ctx.globalAlpha = 1;
}

function drawEmotes(snakes) {
  const now = Date.now();
  state.emotes = state.emotes.filter(e => now - e.t < 2500);
  for (const e of state.emotes) {
    const target = snakes.find(s => s.id === e.playerId);
    if (!target) continue;
    const head = worldToScreen(target.x, target.y);
    const age = (now - e.t) / 2500;
    const offset = -50 - age * 30;
    ctx.globalAlpha = 1 - age;
    ctx.font = '36px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(e.e, head.x, head.y + offset);
    ctx.globalAlpha = 1;
  }
}

function drawMinimap(snakes, me, zone) {
  const W = minimap.width, H = minimap.height;
  const ws = worldSize();
  mctx.clearRect(0, 0, W, H);
  mctx.fillStyle = 'rgba(94, 142, 255, 0.05)';
  mctx.fillRect(0, 0, W, H);
  mctx.strokeStyle = 'rgba(255, 94, 122, 0.5)';
  mctx.strokeRect(0, 0, W, H);

  if (zone) {
    mctx.strokeStyle = 'rgba(94, 255, 182, 0.6)';
    mctx.lineWidth = 1.5;
    mctx.beginPath();
    mctx.arc((zone.x / ws) * W, (zone.y / ws) * H, (zone.r / ws) * W, 0, Math.PI * 2);
    mctx.stroke();
  }

  // power-ups mini
  const powerups = getPowerupsForRender();
  for (const pu of powerups) {
    const def = POWERUPS[pu.type];
    if (!def) continue;
    mctx.fillStyle = def.color;
    mctx.beginPath();
    mctx.arc((pu.x / ws) * W, (pu.y / ws) * H, 1.8, 0, Math.PI * 2);
    mctx.fill();
  }

  for (const s of snakes) {
    if (!s.alive) continue;
    const x = (s.x / ws) * W;
    const y = (s.y / ws) * H;
    mctx.fillStyle = s.isMe ? '#5effb6' : s.color;
    mctx.beginPath();
    mctx.arc(x, y, s.isMe ? 3.5 : 2, 0, Math.PI * 2);
    mctx.fill();
  }
}

// ==================== HUD ====================
const hudLength = document.getElementById('hud-length');
const hudKills = document.getElementById('hud-kills');
const hudStreak = document.getElementById('hud-streak');
const hudStreakPill = document.getElementById('hud-streak-pill');
const hudPos = document.getElementById('hud-pos');
const hudMode = document.getElementById('hud-mode');
const hudLevel = document.getElementById('hud-level');
const xpFill = document.getElementById('xp-fill');
const lbList = document.getElementById('lb-list');
const effectsStack = document.getElementById('effects-stack');
const abilityCircle = document.getElementById('ability-circle');
const abFill = document.getElementById('ab-fill');
const abilityIcon = document.getElementById('ability-icon');
const abilityName = document.getElementById('ability-name');

function updateHUD() {
  const me = getMyEntity();
  let snakes;
  if (state.mode === 'single') {
    snakes = Array.from(state.world.snakes.values()).filter(s => s.alive).map(s => ({ ...s, isMe: s === state.player }));
  } else {
    snakes = state.remote && state.remote.curr ? state.remote.curr.players.filter(p => p.al).map(p => ({
      name: p.n, length: p.l, id: p.id, kills: p.ki, streak: p.st, klass: p.kl,
      isMe: p.id === state.myId
    })) : [];
  }

  if (me) {
    hudLength.textContent = Math.floor(me.length);
    hudKills.textContent = me.kills || 0;
    const streak = me.streak || 0;
    hudStreak.textContent = streak;
    hudStreakPill.classList.toggle('hot', streak >= 3);
    hudStreakPill.classList.toggle('fire', streak >= 6);
  }

  // Vidas (solo SP). En MP ocultamos la pill.
  const livesPill = document.getElementById('hud-lives-pill');
  const livesEl = document.getElementById('hud-lives');
  if (state.mode === 'single') {
    livesPill.style.display = '';
    livesEl.textContent = state.lives > 0 ? '❤️'.repeat(state.lives) : '💀';
  } else {
    livesPill.style.display = 'none';
  }

  snakes.sort((a, b) => b.length - a.length);
  const myIdx = snakes.findIndex(s => s.isMe);
  hudPos.textContent = (myIdx === -1 ? '-' : (myIdx + 1)) + '/' + snakes.length;
  hudMode.textContent = state.mode === 'single' ? 'SP' : (state.room === 'br' ? 'BR' : 'MP');

  // top 8
  lbList.innerHTML = '';
  for (let i = 0; i < Math.min(8, snakes.length); i++) {
    const s = snakes[i];
    const li = document.createElement('li');
    if (s.isMe) li.classList.add('me');
    const cIco = s.klass && CLASSES[s.klass] ? CLASSES[s.klass].ico : '';
    li.innerHTML = `<span class="lb-name">${i + 1}. <span class="lb-class">${cIco}</span>${escapeHtml(s.name)}</span><span class="lb-len">${Math.floor(s.length)}</span>`;
    lbList.appendChild(li);
  }

  // efectos activos
  let effects = {};
  if (me) effects = me.effects || {};
  renderEffectsStack(effects);

  // habilidad
  renderAbility(me);

  // XP / level
  const xpCurrent = state.xp;
  const lv = state.level;
  const need = lv * 200;
  hudLevel.textContent = lv;
  xpFill.style.width = Math.min(100, (xpCurrent / need) * 100) + '%';
}

function renderEffectsStack(effects) {
  effectsStack.innerHTML = '';
  for (const k of Object.keys(effects)) {
    const remaining = effects[k];
    if (!remaining || remaining <= 0) continue;
    const def = POWERUPS[k];
    if (!def) continue;
    // SP guarda timestamp absoluto; MP envia ms restantes
    const secReal = state.mode === 'single'
      ? Math.ceil((remaining - Date.now()) / 1000)
      : Math.ceil(remaining / 1000);
    if (secReal <= 0) continue;
    const div = document.createElement('div');
    div.className = 'effect-pill';
    div.style.borderColor = def.color;
    div.innerHTML = `<span class="ico">${def.ico}</span><span>${def.name}</span><span class="timer">${secReal}s</span>`;
    effectsStack.appendChild(div);
  }
}

function renderAbility(me) {
  const klassKey = state.mode === 'single' ? state.klass : (me ? me.klass : state.klass);
  const klass = CLASSES[klassKey] || CLASSES.classic;
  if (!klass.ab) {
    abilityCircle.style.display = 'none';
    abilityName.style.display = 'none';
    return;
  }
  abilityCircle.style.display = '';
  abilityName.style.display = '';
  abilityName.textContent = klass.name;
  const icoMap = { dash: '⚡', intangible: '👻', vacuum: '🧲', bomb: '💣', reveal: '🎯' };
  abilityIcon.textContent = icoMap[klass.ab] || '⚡';

  let cdEnd = state.mode === 'single' ? (state.player ? state.player.abilityCdEnd : 0) : state.abilityCdEnd;
  const remaining = Math.max(0, cdEnd - Date.now());
  const total = klass.cd * 1000;
  const ratio = total > 0 ? remaining / total : 0;
  abFill.style.strokeDashoffset = (283 * ratio).toFixed(0);
  abilityCircle.classList.toggle('cooldown', remaining > 50);
}

// ==================== Combo / Kill / XP ====================
function onKill(victim) {
  const streak = state.player.streak;
  const xp = 50 + streak * 25;
  addXP(xp);
  showCombo(streak);
  showKillfeed(state.player.name, victim.name);
  shake(8);
  spawnParticles(victim.x, victim.y, 30, '#ff5e7a', { speed: 7, size: rand(3, 6) });
}

function addXP(amount) {
  state.xp += amount;
  const need = state.level * 200;
  if (state.xp >= need) {
    state.xp -= need;
    state.level++;
    flashLevelUp();
  }
  localStorage.setItem('snake-xp', String(state.xp));
  localStorage.setItem('snake-level', String(state.level));
}

function flashLevelUp() {
  const burst = document.getElementById('combo-burst');
  burst.classList.remove('hidden', 'show');
  burst.textContent = `LV ${state.level}!`;
  burst.style.color = '#5effb6';
  burst.style.textShadow = '0 0 32px #5effb6, 0 4px 12px rgba(0,0,0,0.8)';
  void burst.offsetWidth;
  burst.classList.add('show');
  setTimeout(() => burst.classList.remove('show'), 800);
  setTimeout(() => burst.classList.add('hidden'), 1200);
}

function flashLifeLost() {
  const pill = document.getElementById('hud-lives-pill');
  pill.classList.remove('flash');
  void pill.offsetWidth;
  pill.classList.add('flash');
  setTimeout(() => pill.classList.remove('flash'), 600);

  const burst = document.getElementById('combo-burst');
  burst.classList.remove('hidden', 'show');
  burst.textContent = state.lives === 1 ? 'ÚLTIMA VIDA!' : `-1 VIDA · QUEDAN ${state.lives}`;
  burst.style.color = state.lives === 1 ? '#ff5e7a' : '#ffb35e';
  burst.style.textShadow = `0 0 28px ${state.lives === 1 ? '#ff5e7a' : '#ffb35e'}, 0 4px 12px rgba(0,0,0,0.8)`;
  void burst.offsetWidth;
  burst.classList.add('show');
  setTimeout(() => burst.classList.remove('show'), 700);
  setTimeout(() => burst.classList.add('hidden'), 1100);
}

function showCombo(streak) {
  if (streak < 2) return;
  const burst = document.getElementById('combo-burst');
  burst.classList.remove('hidden', 'show');
  const labels = { 2: 'DOUBLE!', 3: 'TRIPLE!', 4: 'QUADRA!', 5: 'PENTA!', 6: 'RAMPAGE!', 7: 'GODLIKE!' };
  burst.textContent = labels[streak] || `${streak}× COMBO!`;
  burst.style.color = streak >= 5 ? '#ff5e7a' : '#ffd75e';
  burst.style.textShadow = `0 0 32px ${streak >= 5 ? '#ff5e7a' : '#ffd75e'}, 0 4px 12px rgba(0,0,0,0.8)`;
  void burst.offsetWidth;
  burst.classList.add('show');
  setTimeout(() => burst.classList.remove('show'), 700);
  setTimeout(() => burst.classList.add('hidden'), 1100);
}

const killfeedEl = document.getElementById('killfeed');
function showKillfeed(killer, victim) {
  const div = document.createElement('div');
  div.className = 'killfeed-item';
  div.innerHTML = `<strong>${escapeHtml(killer)}</strong> 🐍→ <span style="color:#ff5e7a">${escapeHtml(victim)}</span>`;
  killfeedEl.appendChild(div);
  setTimeout(() => { div.style.opacity = '0'; div.style.transition = 'opacity .4s'; }, 4000);
  setTimeout(() => div.remove(), 4500);
  while (killfeedEl.children.length > 5) killfeedEl.firstChild.remove();
}

// ==================== Muerte / respawn ====================
const deathOverlay = document.getElementById('death');
const deathTitle = document.getElementById('death-title');
const deathLength = document.getElementById('death-length');
const deathKills = document.getElementById('death-kills');
const deathStreak = document.getElementById('death-streak');
const deathBest = document.getElementById('death-best');
const deathXp = document.getElementById('death-xp');

function onPlayerDied(serverData) {
  let myLen = 0, myKills = 0, myStreak = 0;
  if (state.mode === 'single' && state.player) {
    myLen = Math.floor(state.player.length);
    myKills = state.player.kills;
    myStreak = state.player.streak;
  } else if (serverData) {
    myLen = serverData.length;
    myKills = serverData.kills;
    myStreak = serverData.streak || 0;
  }
  if (myLen > state.best) {
    state.best = myLen;
    localStorage.setItem('snake-best', String(myLen));
  }
  const xpGained = myLen + myKills * 30;
  addXP(xpGained);
  deathLength.textContent = myLen;
  deathKills.textContent = myKills;
  deathStreak.textContent = myStreak;
  deathBest.textContent = state.best;
  deathXp.textContent = xpGained;
  deathTitle.textContent = myKills > 5 ? `Buena cacería 🩸` : (myLen > 100 ? 'Casi la rompiste 💀' : 'Te comieron 🪦');
  fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: state.name, length: myLen, kills: myKills,
      mode: state.mode === 'single' ? 'single' : (state.room === 'br' ? 'br' : 'multi'),
      klass: state.klass, skin: state.skin
    })
  }).catch(() => {});
  deathOverlay.classList.remove('hidden');
}

// Continuar = mismo mundo, jugador renace en posición aleatoria (en SP no resetea bots ni comida)
document.getElementById('death-continue').addEventListener('click', () => {
  deathOverlay.classList.add('hidden');
  state.lives = state.startingLives;
  if (state.mode === 'single') {
    if (!state.world) {
      state.world = spawnWorld();
    } else {
      const oldPlayer = state.player;
      if (oldPlayer) state.world.snakes.delete(oldPlayer.id);
      const fresh = createSnake({
        id: 'me', name: state.name, color: state.color, skin: state.skin,
        klass: state.klass, isBot: false
      });
      applyEffect(fresh, 'godmode', 2);
      state.world.snakes.set(fresh.id, fresh);
      state.player = fresh;
    }
    state.camera.x = state.player.x - viewport.w / 2;
    state.camera.y = state.player.y - viewport.h / 2;
    state.particles = [];
  } else {
    state.socket.emit('respawn', { name: state.name, color: state.color, skin: state.skin, klass: state.klass });
  }
});

// Nuevo juego = reset completo del mundo (en MP es lo mismo que respawn)
document.getElementById('death-newgame').addEventListener('click', () => {
  deathOverlay.classList.add('hidden');
  state.lives = state.startingLives;
  if (state.mode === 'single') {
    state.world = spawnWorld();
    state.camera.x = state.player.x - viewport.w / 2;
    state.camera.y = state.player.y - viewport.h / 2;
    state.particles = [];
  } else {
    state.socket.emit('respawn', { name: state.name, color: state.color, skin: state.skin, klass: state.klass });
  }
});

document.getElementById('death-menu').addEventListener('click', () => {
  deathOverlay.classList.add('hidden');
  stopGame();
  showMenu();
});

// ==================== Menu ====================
const menu = document.getElementById('menu');
const hud = document.getElementById('hud');
const nameInput = document.getElementById('name');
const colorsContainer = document.getElementById('colors');
const skinsContainer = document.getElementById('skins');
const classesContainer = document.getElementById('classes');
const rankModal = document.getElementById('rank-modal');
const rankList = document.getElementById('rank-list');
const helpModal = document.getElementById('help-modal');

nameInput.value = localStorage.getItem('snake-name') || '';
state.skin = localStorage.getItem('snake-skin') || 'solid';
state.klass = localStorage.getItem('snake-klass') || 'classic';
state.color = localStorage.getItem('snake-color') || COLORS[5];

COLORS.forEach((c) => {
  const chip = document.createElement('div');
  chip.className = 'color-chip' + (c === state.color ? ' active' : '');
  chip.style.background = c;
  chip.addEventListener('click', () => {
    state.color = c;
    localStorage.setItem('snake-color', c);
    document.querySelectorAll('.color-chip').forEach(el => el.classList.remove('active'));
    chip.classList.add('active');
  });
  colorsContainer.appendChild(chip);
});

SKINS.forEach((sk) => {
  const chip = document.createElement('div');
  chip.className = 'skin-chip' + (sk === state.skin ? ' active' : '');
  // muestra el patron como gradiente
  if (sk === 'rainbow') chip.style.background = 'linear-gradient(90deg,#ff5e5e,#ffe65e,#5effb6,#5e8eff,#b65eff)';
  else if (sk === 'gradient') chip.style.background = 'linear-gradient(90deg,#5effb6,#1a1f3a)';
  else if (sk === 'stripes') chip.style.background = 'repeating-linear-gradient(90deg,#5effb6 0 8px,#234 8px 14px)';
  else if (sk === 'dots') chip.style.background = 'radial-gradient(circle at 6px 6px,#fff 2px,#5effb6 3px)';
  else if (sk === 'neon') chip.style.background = 'linear-gradient(90deg,#5effb6,#a8ffd5,#5effb6)';
  else chip.style.background = '#5effb6';
  chip.textContent = sk;
  chip.addEventListener('click', () => {
    state.skin = sk;
    localStorage.setItem('snake-skin', sk);
    document.querySelectorAll('.skin-chip').forEach(el => el.classList.remove('active'));
    chip.classList.add('active');
  });
  skinsContainer.appendChild(chip);
});

Object.entries(CLASSES).forEach(([key, def]) => {
  const card = document.createElement('div');
  card.className = 'class-card' + (key === state.klass ? ' active' : '');
  card.innerHTML = `<div class="ico">${def.ico}</div><div class="nm">${def.name}</div><div class="ds">${def.desc}</div>`;
  card.addEventListener('click', () => {
    state.klass = key;
    localStorage.setItem('snake-klass', key);
    document.querySelectorAll('.class-card').forEach(el => el.classList.remove('active'));
    card.classList.add('active');
  });
  classesContainer.appendChild(card);
});

// Selector de dificultad
const diffContainer = document.getElementById('difficulty');
Object.entries(DIFFICULTIES).forEach(([key, def]) => {
  const card = document.createElement('div');
  card.className = 'diff-card' + (key === state.difficulty ? ' active' : '');
  card.dataset.d = key;
  card.innerHTML = `<div class="ico">${def.ico}</div><div class="nm">${def.name}</div><div class="ds">${def.desc}</div>`;
  card.addEventListener('click', () => {
    state.difficulty = key;
    localStorage.setItem('snake-difficulty', key);
    document.querySelectorAll('.diff-card').forEach(el => el.classList.remove('active'));
    card.classList.add('active');
  });
  diffContainer.appendChild(card);
});

// Boton de ayuda en juego
document.getElementById('btn-ingame-help').addEventListener('click', () => {
  helpModal.classList.remove('hidden');
});

// Mostrar ayuda automaticamente la primera vez que se entra
if (!localStorage.getItem('snake-seen-help')) {
  helpModal.classList.remove('hidden');
  localStorage.setItem('snake-seen-help', '1');
}

document.querySelectorAll('#menu .mode-card').forEach(btn => {
  btn.addEventListener('click', () => {
    state.room = btn.dataset.room;
    startGame(btn.dataset.mode);
  });
});

document.getElementById('btn-rank').addEventListener('click', () => openRanking('single'));
document.getElementById('rank-close').addEventListener('click', () => rankModal.classList.add('hidden'));
document.getElementById('btn-help').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => helpModal.classList.add('hidden'));
const sndBtn = document.getElementById('btn-sound');
sndBtn.textContent = state.audioOn ? '🔊 Sonido' : '🔇 Sonido';
sndBtn.addEventListener('click', () => {
  state.audioOn = !state.audioOn;
  localStorage.setItem('snake-audio', state.audioOn ? '1' : '0');
  sndBtn.textContent = state.audioOn ? '🔊 Sonido' : '🔇 Sonido';
});

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    openRanking(t.dataset.tab);
  });
});

async function openRanking(mode) {
  rankModal.classList.remove('hidden');
  rankList.innerHTML = '<li style="opacity:.6">Cargando...</li>';
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    const list = data[mode] || [];
    rankList.innerHTML = '';
    if (list.length === 0) {
      rankList.innerHTML = '<li style="opacity:.6">Sin resultados aún. Sé el primero 🐍</li>';
      return;
    }
    list.forEach((e, i) => {
      const li = document.createElement('li');
      if (i === 0) li.classList.add('top1');
      else if (i === 1) li.classList.add('top2');
      else if (i === 2) li.classList.add('top3');
      const cIco = e.klass && CLASSES[e.klass] ? CLASSES[e.klass].ico : '';
      li.innerHTML = `
        <span class="rank-pos">#${i + 1}</span>
        <span>${escapeHtml(e.name)}</span>
        <span class="rank-class">${cIco}</span>
        <span class="rank-len">${e.length}</span>
        <span class="rank-kills">${e.kills || 0} kills</span>
      `;
      rankList.appendChild(li);
    });
  } catch (e) {
    rankList.innerHTML = '<li style="opacity:.6">Error cargando ranking</li>';
  }
}

function showMenu() {
  menu.classList.remove('hidden');
  hud.classList.add('hidden');
}

function startGame(mode) {
  state.mode = mode;
  state.name = (nameInput.value || 'Anon').slice(0, 16) || 'Anon';
  localStorage.setItem('snake-name', state.name);
  state.lives = state.startingLives;
  menu.classList.add('hidden');
  hud.classList.remove('hidden');
  ensureAudio();

  if (mode === 'single') {
    if (state.socket) { state.socket.disconnect(); state.socket = null; }
    state.world = spawnWorld();
    state.camera.x = state.player.x - viewport.w / 2;
    state.camera.y = state.player.y - viewport.h / 2;
  } else {
    state.world = null;
    state.player = null;
    connectMultiplayer();
    if (mpInputTimer) clearInterval(mpInputTimer);
    mpInputTimer = setInterval(sendInputMP, 50);
  }
  state.running = true;
}

function stopGame() {
  state.running = false;
  state.paused = false;
  state.world = null;
  state.player = null;
  state.particles = [];
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  if (mpInputTimer) { clearInterval(mpInputTimer); mpInputTimer = null; }
  fxCtx.clearRect(0, 0, viewport.w, viewport.h);
  killfeedEl.innerHTML = '';
  effectsStack.innerHTML = '';
  document.getElementById('pause-overlay').classList.add('hidden');
}

function togglePause() {
  if (!state.running) return;
  if (state.mode === 'multi') {
    // online no se pausa el mundo; solo abrir el menu como una pausa local visible
    // (la serpiente sigue moviendose en el server)
    flashHint('No se puede pausar online');
    return;
  }
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
  document.getElementById('btn-pause').classList.toggle('paused', state.paused);
  document.getElementById('btn-pause').textContent = state.paused ? '▶ Reanudar' : '⏸ Pausa';
}

function flashHint(msg) {
  const burst = document.getElementById('combo-burst');
  burst.classList.remove('hidden', 'show');
  burst.textContent = msg;
  burst.style.color = '#ffb35e';
  burst.style.textShadow = '0 0 20px #ffb35e';
  void burst.offsetWidth;
  burst.classList.add('show');
  setTimeout(() => burst.classList.remove('show'), 700);
  setTimeout(() => burst.classList.add('hidden'), 1100);
}

document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-menu').addEventListener('click', () => {
  document.getElementById('pause-overlay').classList.add('hidden');
  stopGame();
  showMenu();
});

// ==================== Controles ====================
canvas.addEventListener('mousemove', (e) => {
  state.mouse.x = e.clientX;
  state.mouse.y = e.clientY;
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    state.input.boost = true;
    if (state.running) playSound('boost');
  }
});
window.addEventListener('mouseup', () => { state.input.boost = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    state.mouse.x = e.touches[0].clientX;
    state.mouse.y = e.touches[0].clientY;
  }
  if (e.touches.length >= 2) state.input.boost = true;
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (e.touches.length > 0) {
    state.mouse.x = e.touches[0].clientX;
    state.mouse.y = e.touches[0].clientY;
  }
}, { passive: false });
canvas.addEventListener('touchend', () => { state.input.boost = false; });

// Flechas y WASD
const ARROW_KEYS = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right'
};

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); state.input.boost = true; }
  if (e.key === 'Escape' && state.running) {
    stopGame();
    showMenu();
  }
  if (e.key.toLowerCase() === 'q' && state.running) {
    fireAbility();
  }
  if (e.key.toLowerCase() === 'p' && state.running) {
    e.preventDefault();
    togglePause();
  }
  if (state.running && EMOTES[e.key]) {
    sendEmote(EMOTES[e.key]);
  }
  // arrows / wasd
  if (ARROW_KEYS[e.key]) {
    e.preventDefault();
    state.arrows[ARROW_KEYS[e.key]] = true;
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') state.input.boost = false;
  if (ARROW_KEYS[e.key]) state.arrows[ARROW_KEYS[e.key]] = false;
});

// ==================== Joysticks virtuales ====================
function bindJoystick(elBase, options = {}) {
  const elThumb = elBase.querySelector('.joy-thumb');
  let pointerId = null;
  let centerX = 0, centerY = 0;
  let baseRadius = 0;
  let maxOffset = 0;

  function recalcBase() {
    const rect = elBase.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    baseRadius = rect.width / 2;
    maxOffset = baseRadius - elThumb.offsetWidth / 4;
  }

  function start(id, x, y) {
    if (pointerId !== null) return false;
    recalcBase();
    pointerId = id;
    elBase.classList.add('dragging', 'active');
    move(x, y, true);
    if (options.onStart) options.onStart();
    return true;
  }
  function move(x, y, isFirst = false) {
    let dx = x - centerX, dy = y - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > maxOffset) {
      dx = (dx / dist) * maxOffset;
      dy = (dy / dist) * maxOffset;
    }
    elThumb.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    if (options.onMove) options.onMove(dx, dy, dist, isFirst);
  }
  function end() {
    if (pointerId === null) return;
    pointerId = null;
    elBase.classList.remove('dragging', 'active');
    elThumb.style.transform = 'translate(-50%, -50%)';
    if (options.onEnd) options.onEnd();
  }

  elBase.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (start(t.identifier, t.clientX, t.clientY)) {
      e.stopPropagation();
    }
  }, { passive: false });

  document.addEventListener('touchmove', (e) => {
    if (pointerId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === pointerId) { move(t.clientX, t.clientY); break; }
    }
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (pointerId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier === pointerId) { end(); break; }
    }
  });

  elBase.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (start('mouse', e.clientX, e.clientY)) {
      const onMove = (ev) => move(ev.clientX, ev.clientY);
      const onUp = () => {
        end();
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
  });
}

// stick izquierdo: direccion
bindJoystick(document.getElementById('joy-left'), {
  onMove(dx, dy, dist) {
    if (dist > 8) state.joystickAngle = Math.atan2(dy, dx);
    else state.joystickAngle = null;
  },
  onEnd() { state.joystickAngle = null; }
});

// stick derecho: boost
bindJoystick(document.getElementById('joy-right'), {
  onStart() { state.input.boost = true; if (state.running) playSound('boost'); },
  onEnd() { state.input.boost = false; }
});

function fireAbility() {
  if (state.mode === 'single') {
    if (state.player && executeAbilitySP(state.world, state.player)) {
      // ok
    }
  } else if (state.socket) {
    state.socket.emit('ability');
  }
}

function sendEmote(e) {
  if (state.mode === 'multi' && state.socket) {
    state.socket.emit('emote', { e });
  }
  // mostrar sobre uno mismo en SP tambien
  const me = getMyEntity();
  if (me) state.emotes.push({ playerId: me.id || 'me', e, t: Date.now() });
}
