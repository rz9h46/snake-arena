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
  normal: { ico: '🧟', hp: 80,  speed: 9,  dmg: 12, name: 'Normal' },
  cone:   { ico: '🧟', hp: 200, speed: 9,  dmg: 12, name: 'Cono', accIco: '🦺' },
  bucket: { ico: '🧟', hp: 400, speed: 8,  dmg: 12, name: 'Balde', accIco: '🪣' }
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
  canvas.height = CELL_H * ROWS + 50;
}
window.addEventListener('resize', resize);
resize();

const state = {
  sun: 100,
  plants: [],
  zombies: [],
  projectiles: [],
  suns: [],
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
  effects: [],
  lawnmowers: [],   // {row, triggered, x}
  waveAnnounce: 0   // segundos restantes mostrando "WAVE N"
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
  // wave 1 más liviana, después escala
  const baseCount = n === 1 ? 3 : Math.floor(2 + n * 1.3);
  // primer zombie tarda mucho en wave 1 (25s prep), después 6s entre waves
  const firstDelay = n === 1 ? 25 : 6;
  for (let i = 0; i < baseCount; i++) {
    let kind = 'normal';
    if (n >= 3 && Math.random() < 0.3) kind = 'cone';
    if (n >= 5 && Math.random() < 0.2) kind = 'bucket';
    // delay entre zombies: lento al principio del juego, se acelera con waves
    const baseDelay = n === 1 ? 8 : Math.max(3, 7 - n * 0.3);
    const delay = i === 0 ? firstDelay : rand(baseDelay - 1.5, baseDelay + 1.5);
    queue.push({ kind, delay });
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
    state.waveAnnounce = 3;
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
    if (z.x < -CELL_W * 0.4) {
      // chequear si la lawnmower de esa fila esta disponible
      const mower = state.lawnmowers.find(m => m.row === z.row && !m.triggered);
      if (mower) {
        mower.triggered = true;
        beep('boom');
      } else {
        state.alive = false;
      }
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

function updateLawnmowers(dt) {
  for (let i = state.lawnmowers.length - 1; i >= 0; i--) {
    const m = state.lawnmowers[i];
    if (m.triggered) {
      m.x += 380 * dt;
      const cy = m.row * CELL_H + CELL_H * 0.65;
      // arrasar zombies en la fila
      for (let j = state.zombies.length - 1; j >= 0; j--) {
        const z = state.zombies[j];
        if (z.row !== m.row) continue;
        if (Math.abs(z.x + CELL_W / 2 - m.x) < 30) {
          state.zombies.splice(j, 1);
          state.zombiesKilled++;
          state.effects.push({ x: z.x + CELL_W / 2, y: cy, t: 0.3, color: '#ff5e7a', kind: 'death' });
        }
      }
      if (m.x > COLS * CELL_W + 40) state.lawnmowers.splice(i, 1);
    }
  }
}

// ==================== Render ====================
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawLawn();
  drawLawnmowers();

  // ghost del cursor
  if (state.selected) {
    const def = PLANTS[state.selected];
    let row = state.cursor.row, col = state.cursor.col;
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = state.sun >= def.cost ? '#aaff77' : '#ff5e7a';
    ctx.fillRect(col * CELL_W + 4, row * CELL_H + 4, CELL_W - 8, CELL_H - 8);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(col * CELL_W + 2, row * CELL_H + 2, CELL_W - 4, CELL_H - 4);
    ctx.setLineDash([]);
    drawPlantSprite(state.selected, col * CELL_W + CELL_W / 2, row * CELL_H + CELL_H * 0.92, 0.7);
  }

  // plantas
  for (const pl of state.plants) {
    const def = PLANTS[pl.kind];
    const cx = pl.col * CELL_W + CELL_W / 2;
    const groundY = pl.row * CELL_H + CELL_H * 0.92;
    drawPlantSprite(pl.kind, cx, groundY, 1, pl);
    // hp bar si esta dañado
    if (pl.hp < def.hp) {
      const ratio = pl.hp / def.hp;
      const barY = pl.row * CELL_H + CELL_H * 0.18;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - 20, barY, 40, 5);
      ctx.fillStyle = ratio > 0.4 ? '#9aff5e' : '#ff5e7a';
      ctx.fillRect(cx - 20, barY, 40 * ratio, 5);
    }
    // pulso de bomba
    if (def.ability === 'bomb') {
      const r = CELL_W * 0.35 + Math.sin(performance.now() * 0.012) * 4;
      ctx.strokeStyle = '#ff5e7a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, pl.row * CELL_H + CELL_H / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // proyectiles (guisantes)
  for (const p of state.projectiles) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0a0d18';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.stroke ? ctx.stroke() : null;
    // brillo
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.arc(p.x - 2, p.y - 2, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // zombies dibujados como sprites
  for (const z of state.zombies) {
    drawZombieSprite(z);
  }

  // suns con rayos
  for (const s of state.suns) {
    drawSunSprite(s.x, s.y);
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

// ==================== Sprites de plantas ====================
function drawLawn() {
  // borde casa (camino marrón)
  const houseW = 6;
  ctx.fillStyle = '#5a3a1a';
  ctx.fillRect(0, 0, houseW, ROWS * CELL_H);
  // alternar 2 tonos verdes por celda (estilo ajedrez)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = c * CELL_W;
      const y = r * CELL_H;
      const isEven = (r + c) % 2 === 0;
      ctx.fillStyle = isEven ? '#5a8c2a' : '#477820';
      ctx.fillRect(x, y, CELL_W, CELL_H);
      // tufos de pasto sutiles
      ctx.fillStyle = isEven ? '#6a9c3a' : '#557a25';
      for (let i = 0; i < 5; i++) {
        const tx = x + ((i * 13 + r * 7 + c * 11) % CELL_W);
        const ty = y + ((i * 19 + r * 11) % CELL_H);
        ctx.fillRect(tx, ty, 2, 4);
      }
    }
  }
  // gradiente sutil arriba (cielo)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, 30);
  skyGrad.addColorStop(0, 'rgba(94, 142, 255, 0.15)');
  skyGrad.addColorStop(1, 'rgba(94, 142, 255, 0)');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, canvas.width, 30);
}

function drawLawnmowers() {
  for (const m of state.lawnmowers) {
    const cy = m.row * CELL_H + CELL_H * 0.7;
    const x = m.x;
    // sombra
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.ellipse(x, cy + 12, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // cuerpo rojo
    ctx.fillStyle = '#cc2222';
    ctx.fillRect(x - 14, cy - 10, 28, 18);
    ctx.fillStyle = '#aa1818';
    ctx.fillRect(x - 14, cy - 10, 28, 4);
    // ruedas
    ctx.fillStyle = '#1a1208';
    ctx.beginPath(); ctx.arc(x - 9, cy + 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 9, cy + 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath(); ctx.arc(x - 9, cy + 8, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 9, cy + 8, 2, 0, Math.PI * 2); ctx.fill();
    // hojas/cuchillas spinning (cuando triggered)
    if (m.triggered) {
      const spin = performance.now() * 0.04;
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 2;
      for (let a = 0; a < 4; a++) {
        const ang = spin + a * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(x, cy);
        ctx.lineTo(x + Math.cos(ang) * 14, cy + Math.sin(ang) * 6);
        ctx.stroke();
      }
    }
    // mango
    ctx.strokeStyle = '#3a3a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 12, cy - 10);
    ctx.lineTo(x - 22, cy - 22);
    ctx.stroke();
  }
}

function drawSunSprite(x, y) {
  const t = performance.now() * 0.003;
  const r = 16 + Math.sin(performance.now() * 0.005) * 2;
  // rayos
  ctx.fillStyle = '#ffd75e';
  for (let i = 0; i < 8; i++) {
    const ang = t + i * Math.PI / 4;
    const r1 = r + 2;
    const r2 = r + 8;
    const a1 = ang - 0.18;
    const a2 = ang + 0.18;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1);
    ctx.lineTo(x + Math.cos(ang) * r2, y + Math.sin(ang) * r2);
    ctx.lineTo(x + Math.cos(a2) * r1, y + Math.sin(a2) * r1);
    ctx.closePath();
    ctx.fill();
  }
  // disco
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ffd75e';
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  // cara feliz
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(x - 4, y - 2, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 4, y - 2, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0a0d18';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y + 1, 4, 0, Math.PI);
  ctx.stroke();
  // brillo
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x - 5, y - 6, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlantSprite(kind, cx, groundY, alpha = 1, plantData = null) {
  ctx.globalAlpha = alpha;
  // sombra
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, groundY, CELL_W * 0.3, CELL_H * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();
  const t = performance.now() * 0.004;
  switch (kind) {
    case 'sunflower': drawSunflower(cx, groundY, t); break;
    case 'peashooter': drawPeashooter(cx, groundY, t, plantData); break;
    case 'wallnut': drawWallnut(cx, groundY, t, plantData); break;
    case 'snowpea': drawSnowpea(cx, groundY, t, plantData); break;
    case 'cherry': drawCherry(cx, groundY, t); break;
  }
  ctx.globalAlpha = 1;
}

function drawSunflower(cx, gy, t) {
  const stemH = CELL_H * 0.34;
  const headR = CELL_W * 0.22;
  const bob = Math.sin(t) * 1.5;
  // stem
  ctx.fillStyle = '#3a8a30';
  ctx.fillRect(cx - 3, gy - stemH, 6, stemH);
  // hoja
  ctx.fillStyle = '#5fbb40';
  ctx.beginPath();
  ctx.ellipse(cx - 12, gy - stemH * 0.4, 9, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // pétalos
  const petalY = gy - stemH - headR + bob;
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 + Math.sin(t * 0.5) * 0.05;
    ctx.fillStyle = '#ffd420';
    ctx.beginPath();
    ctx.ellipse(
      cx + Math.cos(ang) * headR * 0.85,
      petalY + Math.sin(ang) * headR * 0.85,
      headR * 0.5, headR * 0.3,
      ang, 0, Math.PI * 2
    );
    ctx.fill();
  }
  // centro
  ctx.fillStyle = '#7a4818';
  ctx.beginPath();
  ctx.arc(cx, petalY, headR * 0.55, 0, Math.PI * 2);
  ctx.fill();
  // semillas (puntos)
  ctx.fillStyle = '#3a2010';
  for (let i = 0; i < 6; i++) {
    const ang = i * Math.PI / 3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * 4, petalY + Math.sin(ang) * 4, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // ojos felices
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx - 3, petalY - 1, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + 3, petalY - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPeashooter(cx, gy, t, p) {
  const stemH = CELL_H * 0.38;
  const headR = CELL_W * 0.22;
  const shoot = p && p.lastAction < 0.15 ? Math.sin(p.lastAction * 30) * 3 : 0;
  // stem
  ctx.fillStyle = '#3a8a30';
  ctx.fillRect(cx - 3, gy - stemH, 6, stemH);
  // hojas en stem
  ctx.fillStyle = '#5fbb40';
  ctx.beginPath();
  ctx.ellipse(cx - 10, gy - stemH * 0.5, 8, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(cx + 10, gy - stemH * 0.7, 8, 4, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // cabeza
  const headY = gy - stemH - headR + Math.sin(t) * 1.5;
  ctx.fillStyle = '#3a8a30';
  ctx.beginPath();
  ctx.arc(cx + shoot, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // brillo
  ctx.fillStyle = '#5fbb40';
  ctx.beginPath();
  ctx.arc(cx - headR * 0.3 + shoot, headY - headR * 0.3, headR * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // boca tubo (apunta derecha)
  ctx.fillStyle = '#2a6a20';
  ctx.beginPath();
  ctx.ellipse(cx + headR + shoot, headY, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1a3010';
  ctx.beginPath();
  ctx.arc(cx + headR + 4 + shoot, headY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  // ojo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - 3 + shoot, headY - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx - 2 + shoot, headY - 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawWallnut(cx, gy, t, p) {
  const headR = CELL_W * 0.25;
  const headY = gy - headR;
  // cuerpo
  ctx.fillStyle = '#9a5818';
  ctx.beginPath();
  ctx.ellipse(cx, headY, headR, headR * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7a4010';
  ctx.beginPath();
  ctx.ellipse(cx, headY + headR * 0.4, headR * 0.85, headR * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // textura de madera
  ctx.strokeStyle = '#6a3818';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.6, headY - headR * 0.3);
  ctx.quadraticCurveTo(cx, headY, cx + headR * 0.6, headY - headR * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.5, headY + headR * 0.3);
  ctx.quadraticCurveTo(cx, headY + headR * 0.5, cx + headR * 0.5, headY + headR * 0.3);
  ctx.stroke();
  // ojos
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - 6, headY - 4, 4, 0, Math.PI * 2);
  ctx.arc(cx + 6, headY - 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx - 6, headY - 4, 2, 0, Math.PI * 2);
  ctx.arc(cx + 6, headY - 4, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSnowpea(cx, gy, t, p) {
  // similar a peashooter pero azul/blanco
  const stemH = CELL_H * 0.38;
  const headR = CELL_W * 0.22;
  ctx.fillStyle = '#3a8a30';
  ctx.fillRect(cx - 3, gy - stemH, 6, stemH);
  ctx.fillStyle = '#5fbb40';
  ctx.beginPath();
  ctx.ellipse(cx - 10, gy - stemH * 0.5, 8, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  const headY = gy - stemH - headR + Math.sin(t) * 1.5;
  ctx.fillStyle = '#5ed8e6';
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#a8e6f5';
  ctx.beginPath();
  ctx.arc(cx - headR * 0.3, headY - headR * 0.3, headR * 0.5, 0, Math.PI * 2);
  ctx.fill();
  // copitos
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2 + t * 0.3;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang) * (headR + 6), headY + Math.sin(ang) * (headR + 6), 2, 0, Math.PI * 2);
    ctx.fill();
  }
  // boca
  ctx.fillStyle = '#3aa8c0';
  ctx.beginPath();
  ctx.ellipse(cx + headR, headY, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // ojo enojado
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx - 3, headY - 2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx - 2, headY - 1, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCherry(cx, gy, t) {
  const r = CELL_W * 0.17;
  const y = gy - r * 1.6;
  const pulse = 1 + Math.sin(t * 4) * 0.08;
  // dos cerezas
  for (const ox of [-r * 0.7, r * 0.7]) {
    ctx.fillStyle = '#c41818';
    ctx.beginPath();
    ctx.arc(cx + ox, y, r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff5e5e';
    ctx.beginPath();
    ctx.arc(cx + ox - r * 0.3, y - r * 0.3, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
    // mecha encendida
    ctx.fillStyle = '#3a8a30';
    ctx.fillRect(cx + ox - 1, y - r - 5, 2, 5);
  }
  // ojos enojados (en la cereza derecha)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(cx + r * 0.7 - 3, y - 2, 3, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.7 + 3, y - 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0a0d18';
  ctx.beginPath();
  ctx.arc(cx + r * 0.7 - 3, y - 1, 1.5, 0, Math.PI * 2);
  ctx.arc(cx + r * 0.7 + 3, y - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  // chispa (mecha animada)
  if (Math.floor(t * 10) % 2 === 0) {
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.arc(cx + r * 0.7, y - r - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ==================== Sprites de zombies ====================
// Estilo PvZ original: piel gris-tan pálida, camisa gris con corbata roja,
// calvo con un mechón, expresión zombie boba/dazed (no enojado).
// Andar lurch: un pie planta, el otro arrastra.
function drawZombieSprite(z) {
  const def = ZOMBIE_TYPES[z.kind];
  const cx = z.x + CELL_W / 2;
  const groundY = z.row * CELL_H + CELL_H * 0.96;
  const time = performance.now() * 0.001;
  const isEating = state.plants.some(pl => pl.row === z.row && pl.col === Math.floor((z.x - 6) / CELL_W));
  const cycle = isEating ? 0 : ((time * 1.0 + z.x * 0.005) % 1);
  let leftFootX, rightFootX, leanY;
  if (cycle < 0.5) {
    const p = cycle / 0.5;
    rightFootX = -2 + p * 8;
    leftFootX = 2;
    leanY = 1 + Math.sin(p * Math.PI) * 1.4;
  } else {
    const p = (cycle - 0.5) / 0.5;
    leftFootX = 2 - p * 6;
    rightFootX = 6;
    leanY = 1 + Math.sin(p * Math.PI) * 0.8;
  }
  const headLean = Math.sin(time * 1.0 + z.x * 0.005) * 1.0;

  const headR = 13;
  const bodyW = 24;
  const bodyH = 22;
  const legH = 20;
  const bodyTop = groundY - legH - bodyH - leanY;
  const headY = bodyTop - headR - 1;

  // paleta PvZ
  const SKIN = '#c4d0a8';
  const SKIN_DARK = '#9aa888';
  const SHIRT = '#a8a8a0';
  const SHIRT_DARK = '#7a7a72';
  const COLLAR = '#dcdcd0';
  const TIE = '#7a1818';
  const TIE_HI = '#a82828';
  const PANTS = '#5a4830';
  const PANTS_DARK = '#3a2c18';
  const SHOES = '#3a2010';
  const HAIR = '#3a2010';
  const OUT = '#1a1208';

  // sombra (no se mirroriza, va antes del flip)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(cx - 2, groundY, 22, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Flip horizontal alrededor de cx — los zombies miran a la izquierda
  // (hacia donde caminan, hacia tu casa). Sin esto, los brazos extendidos
  // quedaban hacia atrás y parecía que caminaban en reversa.
  ctx.save();
  ctx.translate(cx, 0);
  ctx.scale(-1, 1);
  ctx.translate(-cx, 0);

  // ===== piernas (pantalón + zapatos) =====
  ctx.strokeStyle = PANTS;
  ctx.lineWidth = 7;
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(cx - 6, bodyTop + bodyH - 2);
  ctx.lineTo(cx - 6 + leftFootX, groundY - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 6, bodyTop + bodyH - 2);
  ctx.lineTo(cx + 6 + rightFootX, groundY - 4);
  ctx.stroke();
  // sombra lateral en pantalón
  ctx.strokeStyle = PANTS_DARK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 4, bodyTop + bodyH - 2);
  ctx.lineTo(cx - 4 + leftFootX, groundY - 4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 8, bodyTop + bodyH - 2);
  ctx.lineTo(cx + 8 + rightFootX, groundY - 4);
  ctx.stroke();
  // zapatos marrones
  ctx.fillStyle = SHOES;
  ctx.fillRect(cx - 9 + leftFootX, groundY - 4, 7, 4);
  ctx.fillRect(cx + 3 + rightFootX, groundY - 4, 7, 4);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 9 + leftFootX, groundY - 1, 7, 1);
  ctx.fillRect(cx + 3 + rightFootX, groundY - 1, 7, 1);
  // cintura
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 12, bodyTop + bodyH - 4, 24, 2);
  ctx.fillStyle = PANTS;
  ctx.fillRect(cx - 12, bodyTop + bodyH - 2, 24, 4);

  // ===== torso (camisa gris) =====
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - bodyW / 2 - 1, bodyTop - 1, bodyW + 2, bodyH);
  ctx.fillStyle = SHIRT;
  ctx.fillRect(cx - bodyW / 2, bodyTop, bodyW, bodyH - 2);
  ctx.fillStyle = SHIRT_DARK;
  ctx.fillRect(cx + bodyW / 2 - 5, bodyTop, 5, bodyH - 2);
  // botones
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 1, bodyTop + 3, 1, 1);
  ctx.fillRect(cx - 1, bodyTop + 9, 1, 1);
  ctx.fillRect(cx - 1, bodyTop + 15, 1, 1);
  // cuello en V
  ctx.fillStyle = COLLAR;
  ctx.beginPath();
  ctx.moveTo(cx - 6, bodyTop);
  ctx.lineTo(cx, bodyTop + 5);
  ctx.lineTo(cx + 6, bodyTop);
  ctx.lineTo(cx + 4, bodyTop - 1);
  ctx.lineTo(cx, bodyTop + 3);
  ctx.lineTo(cx - 4, bodyTop - 1);
  ctx.closePath();
  ctx.fill();

  // ===== corbata roja icónica =====
  // nudo
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 3, bodyTop + 1, 6, 4);
  ctx.fillStyle = TIE;
  ctx.fillRect(cx - 2, bodyTop + 2, 4, 3);
  ctx.fillStyle = TIE_HI;
  ctx.fillRect(cx - 2, bodyTop + 2, 4, 1);
  // cuerpo de la corbata
  ctx.fillStyle = OUT;
  ctx.fillRect(cx - 3, bodyTop + 5, 6, 14);
  ctx.fillStyle = TIE;
  ctx.fillRect(cx - 2, bodyTop + 5, 4, 13);
  ctx.fillStyle = TIE_HI;
  ctx.fillRect(cx - 2, bodyTop + 5, 1, 13);
  // punta triangular
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.moveTo(cx - 3, bodyTop + 18);
  ctx.lineTo(cx, bodyTop + 22);
  ctx.lineTo(cx + 3, bodyTop + 18);
  ctx.fill();
  ctx.fillStyle = TIE;
  ctx.beginPath();
  ctx.moveTo(cx - 2, bodyTop + 18);
  ctx.lineTo(cx, bodyTop + 21);
  ctx.lineTo(cx + 2, bodyTop + 18);
  ctx.fill();

  // ===== brazos al frente (mangas grises + manos piel) =====
  // brazo trasero
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 4, bodyTop + 3, 16, 7);
  ctx.fillStyle = SHIRT;
  ctx.fillRect(cx + 5, bodyTop + 4, 14, 5);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 19, bodyTop + 3, 5, 8);
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx + 20, bodyTop + 4, 4, 6);
  // brazo delantero
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 5, bodyTop + 11, 18, 7);
  ctx.fillStyle = SHIRT;
  ctx.fillRect(cx + 6, bodyTop + 12, 17, 5);
  ctx.fillStyle = SHIRT_DARK;
  ctx.fillRect(cx + 6, bodyTop + 16, 17, 1);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + 23, bodyTop + 11, 5, 9);
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx + 24, bodyTop + 12, 4, 7);

  // ===== cabeza =====
  ctx.fillStyle = OUT;
  ctx.beginPath();
  ctx.arc(cx + headLean, headY, headR + 1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SKIN;
  ctx.beginPath();
  ctx.arc(cx + headLean, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SKIN_DARK;
  ctx.beginPath();
  ctx.ellipse(cx + headLean + 1, headY + 5, headR * 0.7, headR * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // calvo con un mechón al medio (clásico PvZ)
  ctx.fillStyle = HAIR;
  ctx.fillRect(cx + headLean - 1, headY - headR - 4, 3, 6);
  ctx.fillRect(cx + headLean + 2, headY - headR - 2, 2, 4);
  ctx.fillRect(cx + headLean - 6, headY - headR + 1, 2, 3);

  // oreja
  ctx.fillStyle = SKIN;
  ctx.fillRect(cx + headLean + headR - 1, headY, 3, 4);
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(cx + headLean + headR, headY + 1, 2, 2);

  // ojos blancos saltones, pupilas oscuras (look bobo)
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx + headLean - 7, headY - 3, 5, 5);
  ctx.fillRect(cx + headLean + 2, headY - 3, 5, 5);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + headLean - 7, headY - 3, 5, 1);
  ctx.fillRect(cx + headLean + 2, headY - 3, 5, 1);
  ctx.fillStyle = OUT;
  ctx.fillRect(cx + headLean - 5, headY - 1, 2, 2);
  ctx.fillRect(cx + headLean + 4, headY - 1, 2, 2);
  ctx.fillStyle = '#fff';
  ctx.fillRect(cx + headLean - 5, headY - 1, 1, 1);
  ctx.fillRect(cx + headLean + 4, headY - 1, 1, 1);
  // ojeras
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(cx + headLean - 7, headY + 2, 5, 1);
  ctx.fillRect(cx + headLean + 2, headY + 2, 5, 1);
  // nariz
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(cx + headLean - 1, headY + 1, 2, 3);

  // ===== boca: bobamente abierta con un diente sobresaliendo =====
  if (isEating) {
    const chomp = Math.abs(Math.sin(time * 14)) * 4;
    ctx.fillStyle = OUT;
    ctx.fillRect(cx + headLean - 6, headY + 5, 12, 5 + chomp);
    ctx.fillStyle = '#fae8a8';
    ctx.fillRect(cx + headLean - 5, headY + 5, 2, 3);
    ctx.fillRect(cx + headLean + 3, headY + 5, 2, 3);
  } else {
    ctx.fillStyle = OUT;
    ctx.fillRect(cx + headLean - 5, headY + 5, 10, 3);
    // único diente sobresaliendo (clásico zombie tonto)
    ctx.fillStyle = '#fae8a8';
    ctx.fillRect(cx + headLean - 2, headY + 5, 2, 3);
  }
  // labio inferior caído
  ctx.fillStyle = SKIN_DARK;
  ctx.fillRect(cx + headLean - 5, headY + 8, 10, 1);

  // ===== accesorios =====
  if (z.kind === 'cone') {
    // cono naranja con outline
    ctx.fillStyle = '#1a1208';
    ctx.beginPath();
    ctx.moveTo(cx + headLean - 13, headY - headR);
    ctx.lineTo(cx + headLean + 13, headY - headR);
    ctx.lineTo(cx + headLean, headY - headR - 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ee6818';
    ctx.beginPath();
    ctx.moveTo(cx + headLean - 11, headY - headR + 0.5);
    ctx.lineTo(cx + headLean + 11, headY - headR + 0.5);
    ctx.lineTo(cx + headLean, headY - headR - 23);
    ctx.closePath();
    ctx.fill();
    // bandas blancas
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx + headLean - 8, headY - headR - 8, 16, 3);
    ctx.fillRect(cx + headLean - 5, headY - headR - 16, 10, 2);
    // sombra lateral
    ctx.fillStyle = '#a04818';
    ctx.beginPath();
    ctx.moveTo(cx + headLean + 4, headY - headR);
    ctx.lineTo(cx + headLean + 11, headY - headR);
    ctx.lineTo(cx + headLean + 1, headY - headR - 22);
    ctx.closePath();
    ctx.fill();
  }
  if (z.kind === 'bucket') {
    ctx.fillStyle = '#1a1208';
    ctx.fillRect(cx + headLean - 13, headY - headR - 18, 26, 18);
    ctx.fillStyle = '#888';
    ctx.fillRect(cx + headLean - 12, headY - headR - 17, 24, 16);
    // brillo metálico
    ctx.fillStyle = '#bbb';
    ctx.fillRect(cx + headLean - 11, headY - headR - 16, 4, 14);
    // sombra
    ctx.fillStyle = '#5a5a5a';
    ctx.fillRect(cx + headLean + 6, headY - headR - 17, 6, 16);
    // bordes
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(cx + headLean - 12, headY - headR - 17, 24, 2);
    ctx.fillRect(cx + headLean - 12, headY - headR - 4, 24, 3);
    // mango
    ctx.strokeStyle = '#1a1208';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx + headLean, headY - headR - 19, 9, Math.PI, 2 * Math.PI);
    ctx.stroke();
  }

  // cerrar el flip — el resto (slow marker, hp bar) en orientación normal
  ctx.restore();

  // marcador slow
  if (z.slowUntil > 0) {
    ctx.fillStyle = 'rgba(168, 230, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(cx, bodyTop + bodyH / 2, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a8e6ff';
    ctx.font = 'bold 14px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('❄', cx - 18, headY - 6);
  }

  // hp bar arriba
  if (z.hp < def.hp) {
    const ratio = Math.max(0, z.hp / def.hp);
    const offsetUp = z.kind === 'cone' ? 30 : (z.kind === 'bucket' ? 24 : 8);
    const barY = headY - headR - offsetUp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - 18, barY, 36, 4);
    ctx.fillStyle = ratio > 0.4 ? '#9aff5e' : '#ff5e7a';
    ctx.fillRect(cx - 18, barY, 36 * ratio, 4);
  }
}

// ==================== Anuncio de wave ====================
function drawWaveAnnounce() {
  // banner de oleada
  if (state.waveAnnounce > 0) {
    const a = clamp(state.waveAnnounce / 3, 0, 1);
    const isHuge = state.wave % 5 === 0 && state.wave > 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, ROWS * CELL_H * 0.35, canvas.width, 80);
    ctx.font = `bold ${isHuge ? 38 : 32}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isHuge ? '#ff5e7a' : '#9aff5e';
    ctx.shadowBlur = 16;
    ctx.shadowColor = isHuge ? '#ff5e7a' : '#9aff5e';
    ctx.fillText(isHuge ? `¡HUGE WAVE ${state.wave}!` : `OLEADA ${state.wave}`, canvas.width / 2, ROWS * CELL_H * 0.35 + 40);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // indicador "preparate" antes del primer zombie en wave 1
  const noZombiesYet = state.wave === 1 && state.zombiesSpawned === 0 && state.spawnQueue.length > 0;
  if (noZombiesYet) {
    const next = state.spawnQueue[0];
    const remaining = Math.max(0, next.delay - state.waveTimer);
    if (remaining > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(canvas.width / 2 - 140, 8, 280, 38);
      ctx.fillStyle = '#5effb6';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`🌻 Preparate · ${Math.ceil(remaining)}s`, canvas.width / 2, 22);
      ctx.font = '11px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText('Plantá girasoles primero, después peashooters', canvas.width / 2, 38);
      ctx.restore();
    }
  }
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
    updateLawnmowers(dt);
    if (state.waveAnnounce > 0) state.waveAnnounce -= dt;
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
  drawWaveAnnounce();
  document.getElementById('sun-amount').textContent = state.sun;
  requestAnimationFrame(loop);
}

// inicializar lawnmowers (1 por fila al inicio del jardin)
for (let r = 0; r < ROWS; r++) {
  state.lawnmowers.push({ row: r, x: -25, triggered: false });
}
buildWave(1);
state.waveAnnounce = 3.5;
renderShop();
requestAnimationFrame(loop);
