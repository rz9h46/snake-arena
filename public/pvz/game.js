// ==================== Plants vs Zombies ====================
// Lawn 5x9, sun economy, plants attack zombies, zombies advance.

const ROWS = 5;
const COLS = 9;

const PLANTS = {
  sunflower: { ico: '🌻', name: 'Sunflower',  cost: 50,  hp: 50,  cd: 5, sunInterval: 12, ability: 'sun' },
  peashooter:{ ico: '🌱', name: 'Peashooter', cost: 100, hp: 80,  cd: 5, fireRate: 1.5, dmg: 25, ability: 'shoot' },
  wallnut:   { ico: '🌰', name: 'Wallnut',    cost: 50,  hp: 350, cd: 20, ability: 'block' },
  snowpea:   { ico: '❄️', name: 'Snow Pea',   cost: 175, hp: 80,  cd: 8, fireRate: 1.5, dmg: 25, ability: 'freezeShot' },
  cherry:    { ico: '💣', name: 'Cherry Bomb',cost: 150, hp: 1,   cd: 30, ability: 'bomb', fuse: 1.5, dmg: 1800 }
};

const ZOMBIE_TYPES = {
  normal: { ico: '🧟', hp: 80,  speed: 12, dmg: 12, name: 'Normal' },
  cone:   { ico: '🧟', hp: 200, speed: 12, dmg: 12, name: 'Cono', accIco: '🦺' },
  bucket: { ico: '🧟', hp: 400, speed: 11, dmg: 12, name: 'Balde', accIco: '🪣' }
};

const PLANT_KEYS = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'cherry'];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let CELL_W = 100, CELL_H = 90;
function resize() {
  const maxW = Math.min(900, window.innerWidth - 30);
  CELL_W = Math.floor(maxW / COLS);
  CELL_H = Math.floor(CELL_W * 0.9);
  canvas.width = CELL_W * COLS;
  canvas.height = CELL_H * ROWS + 50; // +50 para indicador inferior
}
window.addEventListener('resize', resize);
resize();

const state = {
  sun: 100,
  plants: [],     // {row, col, kind, hp, lastAction, fuse}
  zombies: [],    // {row, x, kind, hp, slowUntil, eatTimer}
  projectiles: [],// {row, x, vx, dmg, kind, color}
  suns: [],       // {x, y, vy, target, kind}
  selected: null,
  cursor: { row: 2, col: 4 },
  alive: true,
  paused: false,
  wave: 1,
  waveTimer: 0,
  zombiesInWave: 0,
  zombiesSpawned: 0,
  zombiesKilled: 0,
  spawnQueue: [],
  cooldowns: {},
  best: parseInt(localStorage.getItem('pvz-best') || '0', 10),
  effects: []     // {x,y,t,color,kind} pequenos FX
};

function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// ==================== Shop UI ====================
const shop = document.getElementById('shop');
function renderShop() {
  shop.innerHTML = '';
  PLANT_KEYS.forEach((k, i) => {
    const p = PLANTS[k];
    const card = document.createElement('div');
    card.className = 'shop-card';
    if (state.selected === k) card.classList.add('selected');
    if (state.sun < p.cost) card.classList.add('disabled');
    if ((state.cooldowns[k] || 0) > 0) card.classList.add('cooldown');
    card.innerHTML = `
      <span class="num">${i + 1}</span>
      <div class="ico">${p.ico}</div>
      <div class="name">${p.name}</div>
      <span class="cost">☀️${p.cost}</span>
    `;
    card.addEventListener('click', () => trySelect(k));
    shop.appendChild(card);
  });
}

function trySelect(k) {
  const p = PLANTS[k];
  if (state.sun < p.cost) return;
  if ((state.cooldowns[k] || 0) > 0) return;
  state.selected = (state.selected === k) ? null : k;
  renderShop();
}

// ==================== Plantar ====================
function plantAt(row, col) {
  if (!state.selected) return;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return;
  if (state.plants.some(pl => pl.row === row && pl.col === col)) return;
  const k = state.selected;
  const def = PLANTS[k];
  if (state.sun < def.cost) return;
  state.sun -= def.cost;
  state.plants.push({
    row, col, kind: k,
    hp: def.hp,
    lastAction: 0,
    fuse: def.ability === 'bomb' ? def.fuse : 0
  });
  state.cooldowns[k] = def.cd;
  state.selected = null;
  renderShop();
  beep('plant');
}

// ==================== Sun ====================
function spawnSun(x, y, target) {
  state.suns.push({ x, y, vy: 50, target: target || (rand(0.4, 0.85) * (CELL_H * ROWS)) });
}

// ==================== Zombies / oleadas ====================
function buildWave(n) {
  const queue = [];
  const baseCount = 4 + Math.floor(n * 1.5);
  for (let i = 0; i < baseCount; i++) {
    let kind = 'normal';
    if (n >= 3 && Math.random() < 0.3) kind = 'cone';
    if (n >= 5 && Math.random() < 0.2) kind = 'bucket';
    queue.push({ kind, delay: rand(1.5, 4) });
  }
  state.spawnQueue = queue;
  state.zombiesInWave = baseCount;
  state.zombiesSpawned = 0;
  state.waveTimer = 0;
}

function spawnZombie(kind) {
  const def = ZOMBIE_TYPES[kind];
  state.zombies.push({
    row: randInt(0, ROWS - 1),
    x: COLS * CELL_W + 10,
    kind, hp: def.hp,
    slowUntil: 0,
    eatTimer: 0
  });
  state.zombiesSpawned++;
}

function checkWaveEnd() {
  if (state.spawnQueue.length === 0 && state.zombies.length === 0 && state.zombiesSpawned >= state.zombiesInWave) {
    state.wave++;
    state.sun = Math.min(state.sun + 75, 9999);
    buildWave(state.wave);
    document.getElementById('wave-num').textContent = state.wave;
    beep('wave');
  }
}

// ==================== Update ====================
function updatePlants(dt) {
  for (let i = state.plants.length - 1; i >= 0; i--) {
    const pl = state.plants[i];
    const def = PLANTS[pl.kind];
    pl.lastAction += dt;
    if (def.ability === 'sun') {
      if (pl.lastAction >= def.sunInterval) {
        pl.lastAction = 0;
        const px = pl.col * CELL_W + CELL_W / 2;
        const py = pl.row * CELL_H + CELL_H / 2;
        state.suns.push({ x: px, y: py - 30, vy: 0, target: py - 10, fromPlant: true, lifeUntilCollect: 8 });
      }
    } else if (def.ability === 'shoot' || def.ability === 'freezeShot') {
      // dispara solo si hay zombie en su fila adelante
      const zHere = state.zombies.some(z => z.row === pl.row && z.x > pl.col * CELL_W);
      if (zHere && pl.lastAction >= def.fireRate) {
        pl.lastAction = 0;
        const px = pl.col * CELL_W + CELL_W * 0.7;
        const py = pl.row * CELL_H + CELL_H / 2;
        state.projectiles.push({
          row: pl.row, x: px, y: py, vx: 320,
          dmg: def.dmg, kind: def.ability === 'freezeShot' ? 'snow' : 'pea',
          color: def.ability === 'freezeShot' ? '#a8e6ff' : '#5effb6'
        });
        beep('shoot');
      }
    } else if (def.ability === 'bomb') {
      pl.fuse -= dt;
      if (pl.fuse <= 0) {
        const cx = pl.col * CELL_W + CELL_W / 2;
        const cy = pl.row * CELL_H + CELL_H / 2;
        state.effects.push({ x: cx, y: cy, t: 0.5, color: '#ff5e7a', kind: 'explosion', radius: CELL_W * 1.4 });
        beep('boom');
        // dañar zombies en area 3x3
        for (const z of state.zombies) {
          if (Math.abs(z.row - pl.row) <= 1) {
            const zx = z.x + CELL_W / 2;
            if (Math.abs(zx - cx) < CELL_W * 1.4) z.hp -= def.dmg;
          }
        }
        state.plants.splice(i, 1);
      }
    }
    if (pl.hp <= 0) state.plants.splice(i, 1);
  }
}

function updateZombies(dt) {
  for (let i = state.zombies.length - 1; i >= 0; i--) {
    const z = state.zombies[i];
    const def = ZOMBIE_TYPES[z.kind];
    const slowed = z.slowUntil > 0;
    if (slowed) z.slowUntil -= dt;
    const speed = def.speed * (slowed ? 0.5 : 1);
    // intentar comer planta en su celda
    const targetCol = Math.floor((z.x - 6) / CELL_W);
    const eating = state.plants.find(pl => pl.row === z.row && pl.col === targetCol);
    if (eating) {
      z.eatTimer += dt;
      if (z.eatTimer >= 0.5) {
        eating.hp -= def.dmg;
        z.eatTimer = 0;
        beep('chomp');
      }
    } else {
      z.eatTimer = 0;
      z.x -= speed * dt;
    }
    if (z.x < -CELL_W * 0.6) {
      state.alive = false;
    }
    if (z.hp <= 0) {
      state.zombies.splice(i, 1);
      state.zombiesKilled++;
      state.effects.push({ x: z.x + CELL_W / 2, y: z.row * CELL_H + CELL_H / 2, t: 0.4, color: '#ff5e7a', kind: 'death' });
      // a veces deja sol
      if (Math.random() < 0.15) spawnSun(z.x + CELL_W / 2, z.row * CELL_H + CELL_H / 2, z.row * CELL_H + CELL_H);
    }
  }
}

function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    p.x += p.vx * dt;
    if (p.x > COLS * CELL_W + 20) { state.projectiles.splice(i, 1); continue; }
    // chequear hits
    for (const z of state.zombies) {
      if (z.row !== p.row) continue;
      if (p.x >= z.x && p.x <= z.x + CELL_W * 0.6) {
        z.hp -= p.dmg;
        if (p.kind === 'snow') z.slowUntil = 4;
        state.projectiles.splice(i, 1);
        state.effects.push({ x: p.x, y: p.y, t: 0.2, color: p.color, kind: 'hit' });
        break;
      }
    }
  }
}

function updateSuns(dt) {
  for (let i = state.suns.length - 1; i >= 0; i--) {
    const s = state.suns[i];
    if (s.target !== undefined && s.y < s.target) {
      s.y += s.vy * dt;
      if (s.y >= s.target) s.y = s.target;
    }
    if (s.lifeUntilCollect !== undefined) {
      s.lifeUntilCollect -= dt;
      if (s.lifeUntilCollect <= 0) state.suns.splice(i, 1);
    }
  }
}

function updateEffects(dt) {
  for (let i = state.effects.length - 1; i >= 0; i--) {
    state.effects[i].t -= dt;
    if (state.effects[i].t <= 0) state.effects.splice(i, 1);
  }
}

function updateCooldowns(dt) {
  for (const k of Object.keys(state.cooldowns)) {
    if (state.cooldowns[k] > 0) {
      state.cooldowns[k] = Math.max(0, state.cooldowns[k] - dt);
      if (state.cooldowns[k] === 0) renderShop();
    }
  }
}

let skySunTimer = 8;
function updateSkySun(dt) {
  skySunTimer -= dt;
  if (skySunTimer <= 0) {
    skySunTimer = 8 + Math.random() * 4;
    spawnSun(rand(50, COLS * CELL_W - 50), -20, rand(CELL_H, ROWS * CELL_H - CELL_H));
  }
}

function updateSpawn(dt) {
  state.waveTimer += dt;
  if (state.spawnQueue.length > 0) {
    const next = state.spawnQueue[0];
    if (state.waveTimer >= next.delay) {
      spawnZombie(next.kind);
      state.waveTimer = 0;
      state.spawnQueue.shift();
    }
  }
}

// ==================== Render ====================
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // gradient lawn
  for (let r = 0; r < ROWS; r++) {
    const y = r * CELL_H;
    ctx.fillStyle = (r % 2 === 0) ? '#2a4a2a' : '#244422';
    ctx.fillRect(0, y, canvas.width, CELL_H);
  }
  // grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * CELL_W, 0); ctx.lineTo(c * CELL_W, ROWS * CELL_H); ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * CELL_H); ctx.lineTo(COLS * CELL_W, r * CELL_H); ctx.stroke();
  }
  // borde casa
  ctx.fillStyle = 'rgba(150, 100, 50, 0.6)';
  ctx.fillRect(0, 0, 4, ROWS * CELL_H);

  // ghost del cursor
  if (state.selected) {
    const def = PLANTS[state.selected];
    let row = state.cursor.row, col = state.cursor.col;
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = state.sun >= def.cost ? '#9aff5e' : '#ff5e7a';
    ctx.fillRect(col * CELL_W + 4, row * CELL_H + 4, CELL_W - 8, CELL_H - 8);
    ctx.globalAlpha = 1;
    ctx.font = `${CELL_H * 0.55}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(def.ico, col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H / 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(col * CELL_W + 2, row * CELL_H + 2, CELL_W - 4, CELL_H - 4);
  }

  // plantas
  ctx.font = `${CELL_H * 0.55}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const pl of state.plants) {
    const def = PLANTS[pl.kind];
    const cx = pl.col * CELL_W + CELL_W / 2;
    const cy = pl.row * CELL_H + CELL_H / 2;
    // bg
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_W * 0.32, 0, Math.PI * 2);
    ctx.fill();
    // ico
    ctx.fillText(def.ico, cx, cy);
    // hp bar si esta dañado
    if (pl.hp < def.hp) {
      const ratio = pl.hp / def.hp;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 18, cy + CELL_H * 0.3 - 4, 36, 4);
      ctx.fillStyle = ratio > 0.4 ? '#9aff5e' : '#ff5e7a';
      ctx.fillRect(cx - 18, cy + CELL_H * 0.3 - 4, 36 * ratio, 4);
    }
    // bomb pulse
    if (def.ability === 'bomb') {
      const r = CELL_W * 0.35 + Math.sin(performance.now() * 0.012) * 4;
      ctx.strokeStyle = '#ff5e7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // proyectiles
  for (const p of state.projectiles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // zombies
  for (const z of state.zombies) {
    const def = ZOMBIE_TYPES[z.kind];
    const cx = z.x + CELL_W / 2;
    const cy = z.row * CELL_H + CELL_H / 2;
    ctx.font = `${CELL_H * 0.6}px serif`;
    if (z.slowUntil > 0) {
      ctx.fillStyle = 'rgba(168, 230, 255, 0.4)';
      ctx.beginPath();
      ctx.arc(cx, cy, CELL_W * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillText(def.ico, cx, cy);
    if (def.accIco) {
      ctx.font = `${CELL_H * 0.35}px serif`;
      ctx.fillText(def.accIco, cx, cy - CELL_H * 0.32);
    }
    // hp bar
    if (z.hp < def.hp) {
      const ratio = Math.max(0, z.hp / def.hp);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 18, cy + CELL_H * 0.32, 36, 4);
      ctx.fillStyle = ratio > 0.4 ? '#9aff5e' : '#ff5e7a';
      ctx.fillRect(cx - 18, cy + CELL_H * 0.32, 36 * ratio, 4);
    }
  }

  // suns
  for (const s of state.suns) {
    const r = 18 + Math.sin(performance.now() * 0.005) * 2;
    ctx.shadowBlur = 22;
    ctx.shadowColor = '#ffd75e';
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff5a8';
    ctx.beginPath();
    ctx.arc(s.x - 4, s.y - 4, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '16px serif';
    ctx.fillStyle = '#0a0d18';
    ctx.fillText('☀', s.x, s.y);
  }

  // efectos
  for (const fx of state.effects) {
    const a = fx.t / 0.5;
    if (fx.kind === 'explosion') {
      ctx.globalAlpha = a;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.radius * (1 - a), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'death') {
      ctx.globalAlpha = a;
      ctx.fillStyle = fx.color;
      ctx.font = '20px serif';
      ctx.fillText('💀', fx.x, fx.y - 20 * (1 - a));
      ctx.globalAlpha = 1;
    } else if (fx.kind === 'hit') {
      ctx.globalAlpha = a;
      ctx.fillStyle = fx.color;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 8 * (1 - a), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // indicador de progreso de oleada abajo
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(0, ROWS * CELL_H, canvas.width, 50);
  ctx.fillStyle = '#5effb6';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`Oleada ${state.wave}`, 12, ROWS * CELL_H + 24);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText(`Zombies derrotados: ${state.zombiesKilled}`, canvas.width - 12, ROWS * CELL_H + 24);
  // barra progreso
  const remaining = state.spawnQueue.length + state.zombies.length;
  const total = Math.max(state.zombiesInWave, 1);
  const done = (state.zombiesInWave - remaining) / total;
  ctx.fillStyle = 'rgba(255, 215, 94, 0.25)';
  ctx.fillRect(12, ROWS * CELL_H + 32, canvas.width - 24, 8);
  ctx.fillStyle = '#ffd75e';
  ctx.fillRect(12, ROWS * CELL_H + 32, (canvas.width - 24) * Math.min(1, Math.max(0, done)), 8);
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
  let dur = 0.08;
  switch (type) {
    case 'plant': o.type = 'triangle'; o.frequency.value = 280; o.frequency.exponentialRampToValueAtTime(440, t0 + 0.1); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'shoot': o.type = 'square'; o.frequency.value = 880; g.gain.setValueAtTime(0.02, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.04); dur = 0.04; break;
    case 'sun': o.type = 'sine'; o.frequency.value = 660; o.frequency.exponentialRampToValueAtTime(990, t0 + 0.12); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.15); dur = 0.15; break;
    case 'chomp': o.type = 'square'; o.frequency.value = 110; g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.06); dur = 0.06; break;
    case 'boom': o.type = 'sawtooth'; o.frequency.value = 110; o.frequency.exponentialRampToValueAtTime(40, t0 + 0.4); g.gain.setValueAtTime(0.12, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); dur = 0.4; break;
    case 'wave': o.type = 'sawtooth'; o.frequency.value = 220; o.frequency.exponentialRampToValueAtTime(660, t0 + 0.5); g.gain.setValueAtTime(0.07, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5); dur = 0.5; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// ==================== Input ====================
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  // primero, ¿clickearon un sol?
  for (let i = state.suns.length - 1; i >= 0; i--) {
    const s = state.suns[i];
    const dx = x - s.x, dy = y - s.y;
    if (dx * dx + dy * dy < 22 * 22) {
      state.sun += 25;
      state.suns.splice(i, 1);
      beep('sun');
      renderShop();
      return;
    }
  }
  // sino, plantar
  if (state.selected && y < ROWS * CELL_H) {
    const col = Math.floor(x / CELL_W);
    const row = Math.floor(y / CELL_H);
    state.cursor = { row, col };
    plantAt(row, col);
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.location.href = '/';
    return;
  }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (!state.alive || state.paused) return;
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= 5) {
    trySelect(PLANT_KEYS[num - 1]);
    return;
  }
  if (e.key === 'ArrowUp')    { state.cursor.row = clamp(state.cursor.row - 1, 0, ROWS - 1); e.preventDefault(); }
  if (e.key === 'ArrowDown')  { state.cursor.row = clamp(state.cursor.row + 1, 0, ROWS - 1); e.preventDefault(); }
  if (e.key === 'ArrowLeft')  { state.cursor.col = clamp(state.cursor.col - 1, 0, COLS - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { state.cursor.col = clamp(state.cursor.col + 1, 0, COLS - 1); e.preventDefault(); }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (state.selected) plantAt(state.cursor.row, state.cursor.col);
  }
});

// ==================== Pause / Help / Game over ====================
function togglePause() {
  if (!state.alive) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
}
document.getElementById('btn-pause').addEventListener('click', togglePause);
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-menu').addEventListener('click', () => { window.location.href = '/'; });
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('go-replay').addEventListener('click', () => location.reload());
document.getElementById('go-menu').addEventListener('click', () => { window.location.href = '/'; });

if (!localStorage.getItem('pvz-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('pvz-seen-help', '1');
}

// ==================== Loop ====================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (state.alive && !state.paused) {
    updateSkySun(dt);
    updatePlants(dt);
    updateZombies(dt);
    updateProjectiles(dt);
    updateSuns(dt);
    updateEffects(dt);
    updateCooldowns(dt);
    updateSpawn(dt);
    checkWaveEnd();
    if (!state.alive) {
      if (state.zombiesKilled > state.best) {
        state.best = state.zombiesKilled;
        localStorage.setItem('pvz-best', state.best);
      }
      document.getElementById('go-wave').textContent = state.wave;
      document.getElementById('go-zombies').textContent = state.zombiesKilled;
      document.getElementById('go-best').textContent = state.best;
      document.getElementById('gameover').classList.remove('hidden');
    }
  }
  drawBoard();
  document.getElementById('sun-amount').textContent = state.sun;
  requestAnimationFrame(loop);
}

buildWave(1);
renderShop();
requestAnimationFrame(loop);
