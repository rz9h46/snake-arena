const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ----- Persistencia ranking + perfil -----
const LEADERBOARD_FILE = process.env.LEADERBOARD_PATH || path.join(__dirname, 'leaderboard.json');
try {
  const dir = path.dirname(LEADERBOARD_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
} catch (e) { console.error('No se pudo crear dir de ranking:', e.message); }
let leaderboard = { single: [], multi: [], br: [] };
try {
  if (fs.existsSync(LEADERBOARD_FILE)) {
    const parsed = JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
    for (const k of ['single', 'multi', 'br']) leaderboard[k] = parsed[k] || [];
  }
} catch (e) { console.error('No se pudo cargar leaderboard:', e.message); }

let saveTimer = null;
function saveLeaderboard() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.writeFile(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2), () => {});
  }, 500);
}

function pushScore(mode, entry) {
  if (!leaderboard[mode]) leaderboard[mode] = [];
  const list = leaderboard[mode];
  list.push(entry);
  list.sort((a, b) => b.length - a.length);
  leaderboard[mode] = list.slice(0, 50);
  saveLeaderboard();
}

app.get('/api/leaderboard', (req, res) => {
  res.json({
    single: leaderboard.single.slice(0, 25),
    multi: leaderboard.multi.slice(0, 25),
    br: leaderboard.br.slice(0, 25)
  });
});

app.post('/api/score', (req, res) => {
  const { name, length, kills, mode, klass, skin, xp } = req.body || {};
  if (!name || typeof length !== 'number' || !['single', 'multi', 'br'].includes(mode)) {
    return res.status(400).json({ ok: false });
  }
  pushScore(mode, {
    name: String(name).slice(0, 16),
    length: Math.floor(length),
    kills: Math.floor(kills || 0),
    klass: String(klass || 'classic').slice(0, 16),
    skin: String(skin || 'solid').slice(0, 16),
    date: Date.now()
  });
  res.json({ ok: true });
});

// ===========================================================
// Config
// ===========================================================
const TICK_RATE = 30;
const BROADCAST_RATE = 20;
const START_LENGTH = 10;
const SEGMENT_SPACING = 6;
const BASE_SPEED = 2.6;
const BOOST_SPEED = 4.6;
const BOOST_COST_PER_SEC = 4;
const MAX_TURN_RATE = 0.12;

// world settings per mode
const MODES = {
  classic: { worldSize: 4000, foodTarget: 600, powerupTarget: 18, shieldTarget: 30, bombTarget: 8, mineTarget: 25, laserCount: 6, brShrink: false },
  br: { worldSize: 3500, foodTarget: 450, powerupTarget: 24, shieldTarget: 25, bombTarget: 12, mineTarget: 35, laserCount: 8, brShrink: true }
};

// power-ups por azar (shield se spawnea aparte para que abunden)
const POWERUP_TYPES = [
  'magnet', 'phantom', 'frost', 'frenzy', 'mega',
  'crystal', 'bolt', 'stealth', 'freeze', 'turbo',
  'hypno', 'heart', 'godmode'
];
const POWERUP_DURATION = {
  shield: 10, magnet: 10, phantom: 5, frost: 5, frenzy: 7, mega: 9,
  crystal: 0, bolt: 0, stealth: 6, freeze: 0, turbo: 6, frozen: 3,
  hypno: 0, heart: 0, godmode: 10, reversed: 5
};
// efectos instantaneos (no se guardan en effects, se aplican al recoger)
const INSTANT_POWERUPS = new Set(['crystal', 'bolt', 'freeze', 'hypno', 'heart']);

const CLASSES = {
  classic:   { speedMul: 1.0,  abilityKey: null,        cd: 0,  passive: null },
  speedster: { speedMul: 1.12, abilityKey: 'dash',      cd: 6,  passive: null },
  phantom:   { speedMul: 1.0,  abilityKey: 'intangible', cd: 14, passive: null },
  magnet:    { speedMul: 1.0,  abilityKey: 'vacuum',    cd: 12, passive: 'magnet_small' },
  bomber:    { speedMul: 1.0,  abilityKey: 'bomb',      cd: 10, passive: null },
  hunter:    { speedMul: 1.05, abilityKey: 'reveal',    cd: 18, passive: null }
};

// ===========================================================
// Salas / mundos por modo
// ===========================================================
class World {
  constructor(mode) {
    this.mode = mode;
    this.cfg = MODES[mode];
    this.worldSize = this.cfg.worldSize;
    this.players = new Map();
    this.food = [];
    this.powerups = [];
    this.bombs = [];
    this.mines = [];
    this.lasers = [];
    this.foodSeq = 1;
    this.puSeq = 1;
    this.bombSeq = 1;
    this.mineSeq = 1;
    // Battle Royale shrinking circle
    this.zoneCenter = { x: this.worldSize / 2, y: this.worldSize / 2 };
    this.zoneRadius = this.worldSize * 0.7;
    this.zoneShrinkRate = 8;
    this.zoneMinRadius = 400;
    this.brStartedAt = Date.now();

    // Lasers: lineas que cruzan el mundo de borde a borde, rotando
    for (let i = 0; i < this.cfg.laserCount; i++) {
      // origen en uno de los 4 muros
      const wall = i % 4;
      let ox, oy;
      const t = (Math.floor(i / 4) + 0.5) / Math.ceil(this.cfg.laserCount / 4);
      if (wall === 0) { ox = this.worldSize * t; oy = 0; }
      else if (wall === 1) { ox = this.worldSize; oy = this.worldSize * t; }
      else if (wall === 2) { ox = this.worldSize * t; oy = this.worldSize; }
      else { ox = 0; oy = this.worldSize * t; }
      this.lasers.push({
        id: i,
        ox, oy,
        angle: Math.atan2(this.worldSize / 2 - oy, this.worldSize / 2 - ox),
        rotSpeed: rand(0.15, 0.35) * (Math.random() < 0.5 ? -1 : 1),
        period: rand(3.5, 5.5),
        phase: Math.random() * 5,
        active: false
      });
    }
  }

  ensureFood() {
    while (this.food.length < this.cfg.foodTarget) this.spawnFood();
  }
  ensurePowerups() {
    while (this.powerups.length < this.cfg.powerupTarget) this.spawnPowerup();
  }
  ensureShields() {
    let shieldCount = 0;
    for (const pu of this.powerups) if (pu.type === 'shield') shieldCount++;
    while (shieldCount < this.cfg.shieldTarget) {
      this.spawnPowerup(undefined, undefined, 'shield');
      shieldCount++;
    }
  }

  ensureBombs() {
    while (this.bombs.length < this.cfg.bombTarget) {
      this.bombs.push({
        id: this.bombSeq++,
        x: rand(150, this.worldSize - 150),
        y: rand(150, this.worldSize - 150),
        bornAt: Date.now()
      });
    }
  }
  ensureMines() {
    while (this.mines.length < this.cfg.mineTarget) {
      this.mines.push({
        id: this.mineSeq++,
        x: rand(80, this.worldSize - 80),
        y: rand(80, this.worldSize - 80),
        bornAt: Date.now()
      });
    }
  }

  updateLasers(dt) {
    const now = Date.now() / 1000;
    for (const l of this.lasers) {
      l.angle += l.rotSpeed * dt;
      // ciclo: 1.2s active, 1.5s warm-up off, period restante off
      const phaseT = ((now + l.phase) % l.period);
      l.active = phaseT < 1.2;
      l.warming = phaseT >= 1.2 && phaseT < 1.6;
    }
  }

  spawnFood(x, y, value = 1, color) {
    this.food.push({
      id: this.foodSeq++,
      x: x ?? rand(40, this.worldSize - 40),
      y: y ?? rand(40, this.worldSize - 40),
      v: value,
      c: color || (value > 1 ? '#fff5a8' : ['#ff8c8c', '#8cffd1', '#8cb8ff', '#f5d68c'][Math.floor(Math.random() * 4)])
    });
  }

  spawnPowerup(x, y, type) {
    this.powerups.push({
      id: this.puSeq++,
      type: type || POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)],
      x: x ?? rand(80, this.worldSize - 80),
      y: y ?? rand(80, this.worldSize - 80),
      bornAt: Date.now()
    });
  }
}

const worlds = {
  classic: new World('classic'),
  br: new World('br')
};
for (const w of Object.values(worlds)) {
  w.ensureFood();
  w.ensurePowerups();
  w.ensureShields();
  w.ensureBombs();
  w.ensureMines();
}

function rand(a, b) { return Math.random() * (b - a) + a; }
function radiusFor(length, mul = 1) { return (6 + Math.min(20, Math.sqrt(length) * 0.5)) * mul; }
function randomColor() {
  const palette = ['#ff5e5e', '#ffb35e', '#ffe65e', '#9aff5e', '#5effb6',
                   '#5ee0ff', '#5e8eff', '#b65eff', '#ff5ee0', '#ff5e9a'];
  return palette[Math.floor(Math.random() * palette.length)];
}

function spawnPlayer(socket, opts) {
  const mode = opts?.mode === 'br' ? 'br' : 'classic';
  const world = worlds[mode];
  const klassKey = CLASSES[opts?.klass] ? opts.klass : 'classic';
  const skin = String(opts?.skin || 'solid').slice(0, 16);
  const x = rand(200, world.worldSize - 200);
  const y = rand(200, world.worldSize - 200);
  const angle = rand(0, Math.PI * 2);
  const segments = [];
  for (let i = 0; i < START_LENGTH; i++) {
    segments.push({ x: x - Math.cos(angle) * i * SEGMENT_SPACING, y: y - Math.sin(angle) * i * SEGMENT_SPACING });
  }
  const player = {
    id: socket.id,
    name: (opts?.name || 'Anon').slice(0, 16),
    color: opts?.color || randomColor(),
    skin,
    klass: klassKey,
    mode,
    x, y, angle,
    targetAngle: angle,
    segments,
    length: START_LENGTH,
    boosting: false,
    alive: true,
    kills: 0,
    streak: 0,
    boostCarry: 0,
    spawnedAt: Date.now(),
    effects: {},
    abilityCdEnd: 0,
    abilityActiveUntil: 0,
    activeAbility: null,
    peakLength: START_LENGTH
  };
  world.players.set(socket.id, player);
  return player;
}

function applyEffect(p, type, durSec) {
  p.effects[type] = Date.now() + durSec * 1000;
}
function hasEffect(p, type) {
  return (p.effects[type] || 0) > Date.now();
}

function killPlayer(world, p, killer) {
  if (!p.alive) return;
  if (hasEffect(p, 'godmode')) return; // 100% inmune
  if (hasEffect(p, 'shield')) {
    // proteger un golpe y consumir shield
    p.effects.shield = 0;
    return;
  }
  p.alive = false;
  if (killer && killer !== p) {
    killer.kills += 1;
    killer.streak += 1;
  }
  const drops = Math.min(140, Math.floor(p.length));
  for (let i = 0; i < drops; i++) {
    const seg = p.segments[Math.floor(Math.random() * p.segments.length)];
    if (!seg) continue;
    world.spawnFood(seg.x + rand(-10, 10), seg.y + rand(-10, 10), Math.random() < 0.18 ? 3 : 1, p.color);
  }
  // 50% chance de soltar power-up
  if (Math.random() < 0.5) {
    world.spawnPowerup(p.x + rand(-30, 30), p.y + rand(-30, 30));
  }
  world.ensureFood();
  pushScore(p.mode === 'br' ? 'br' : 'multi', {
    name: p.name, length: Math.floor(p.length), kills: p.kills,
    klass: p.klass, skin: p.skin, date: Date.now()
  });
  io.to(p.id).emit('died', {
    length: Math.floor(p.length),
    kills: p.kills,
    streak: p.streak
  });
}

function executeAbility(world, p) {
  const klass = CLASSES[p.klass];
  if (!klass.abilityKey) return false;
  if (Date.now() < p.abilityCdEnd) return false;
  if (!p.alive) return false;

  switch (klass.abilityKey) {
    case 'dash': {
      // teleport corto en la direccion actual
      const dist = 100;
      p.x += Math.cos(p.angle) * dist;
      p.y += Math.sin(p.angle) * dist;
      p.x = Math.max(20, Math.min(world.worldSize - 20, p.x));
      p.y = Math.max(20, Math.min(world.worldSize - 20, p.y));
      p.activeAbility = 'dash';
      p.abilityActiveUntil = Date.now() + 250;
      break;
    }
    case 'intangible': {
      applyEffect(p, 'phantom', 3);
      p.activeAbility = 'intangible';
      p.abilityActiveUntil = Date.now() + 3000;
      break;
    }
    case 'vacuum': {
      // atraer comida cercana (radio 350)
      const radius = 350;
      for (const f of world.food) {
        const dx = p.x - f.x, dy = p.y - f.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < radius) {
          f.x += (dx / d) * 80;
          f.y += (dy / d) * 80;
        }
      }
      p.activeAbility = 'vacuum';
      p.abilityActiveUntil = Date.now() + 600;
      break;
    }
    case 'bomb': {
      // tirar comida en racimo detras (cuesta 8 length)
      if (p.length > START_LENGTH + 8) {
        p.length -= 8;
        const bx = p.x - Math.cos(p.angle) * 60;
        const by = p.y - Math.sin(p.angle) * 60;
        for (let i = 0; i < 30; i++) {
          world.spawnFood(bx + rand(-50, 50), by + rand(-50, 50), Math.random() < 0.2 ? 3 : 1, p.color);
        }
        p.activeAbility = 'bomb';
        p.abilityActiveUntil = Date.now() + 400;
      } else {
        return false;
      }
      break;
    }
    case 'reveal': {
      // efecto: 5s velocidad extra y revelar mapa (cliente lo dibuja)
      applyEffect(p, 'frenzy', 5);
      p.activeAbility = 'reveal';
      p.abilityActiveUntil = Date.now() + 5000;
      break;
    }
    default: return false;
  }
  p.abilityCdEnd = Date.now() + klass.cd * 1000;
  return true;
}

function updatePlayer(world, p, dt) {
  if (!p.alive) return;
  // controles invertidos por hipnosis
  let target = p.targetAngle;
  if (hasEffect(p, 'reversed')) target = p.targetAngle + Math.PI;
  let diff = target - p.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxStep = MAX_TURN_RATE;
  if (diff > maxStep) diff = maxStep;
  if (diff < -maxStep) diff = -maxStep;
  p.angle += diff;
  if (p.length > p.peakLength) p.peakLength = p.length;

  const klass = CLASSES[p.klass];
  let speedMul = klass.speedMul;
  if (hasEffect(p, 'frenzy')) speedMul *= 1.25;
  if (hasEffect(p, 'turbo')) speedMul *= 1.7;
  if (hasEffect(p, 'frozen')) speedMul = 0; // congelado: no se mueve

  // frost de otros: si un enemigo cercano tiene frost, frenamos
  for (const o of world.players.values()) {
    if (o === p || !o.alive) continue;
    if (hasEffect(o, 'frost')) {
      const dx = o.x - p.x, dy = o.y - p.y;
      if (dx * dx + dy * dy < 400 * 400) speedMul *= 0.6;
    }
  }

  const canBoost = (p.boosting && !hasEffect(p, 'frozen') && (p.length > START_LENGTH + 1 || hasEffect(p, 'frenzy') || hasEffect(p, 'turbo')));
  const baseSpeed = canBoost ? BOOST_SPEED : BASE_SPEED;
  const speed = baseSpeed * speedMul * (dt * TICK_RATE);
  p.x += Math.cos(p.angle) * speed;
  p.y += Math.sin(p.angle) * speed;

  // Battle Royale zone damage
  if (world.mode === 'br') {
    const dx = p.x - world.zoneCenter.x;
    const dy = p.y - world.zoneCenter.y;
    if (dx * dx + dy * dy > world.zoneRadius * world.zoneRadius) {
      p.length -= 8 * dt; // dano por estar afuera
      if (p.length <= 1) { killPlayer(world, p, null); return; }
    }
  }

  // Limites del mundo
  const r = radiusFor(p.length);
  if (p.x < r || p.x > world.worldSize - r || p.y < r || p.y > world.worldSize - r) {
    killPlayer(world, p, null);
    return;
  }

  p.segments.unshift({ x: p.x, y: p.y });
  const desired = Math.max(2, Math.floor(p.length));
  while (p.segments.length > desired) p.segments.pop();

  // Boost (no consume si tiene frenzy)
  if (canBoost && !hasEffect(p, 'frenzy')) {
    p.boostCarry += BOOST_COST_PER_SEC * dt;
    while (p.boostCarry >= 1 && p.length > START_LENGTH) {
      p.boostCarry -= 1;
      p.length -= 1;
      const tail = p.segments[p.segments.length - 1];
      if (tail) world.spawnFood(tail.x + rand(-4, 4), tail.y + rand(-4, 4), 1, p.color);
    }
  }

  // Magnet pasivo + activo
  let magnetRadius = 0;
  if (klass.passive === 'magnet_small') magnetRadius = Math.max(magnetRadius, 70);
  if (hasEffect(p, 'magnet')) magnetRadius = Math.max(magnetRadius, 220);
  if (magnetRadius > 0) {
    for (const f of world.food) {
      const dx = p.x - f.x, dy = p.y - f.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < magnetRadius * magnetRadius && d2 > 1) {
        const d = Math.sqrt(d2);
        const force = 6 * (1 - d / magnetRadius);
        f.x += (dx / d) * force;
        f.y += (dy / d) * force;
      }
    }
  }

  // Comer comida
  const eatR = r + 4;
  const megaMul = hasEffect(p, 'mega') ? 3 : 1;
  for (let i = world.food.length - 1; i >= 0; i--) {
    const f = world.food[i];
    const dx = f.x - p.x, dy = f.y - p.y;
    if (dx * dx + dy * dy < eatR * eatR) {
      p.length += f.v * megaMul;
      world.food.splice(i, 1);
    }
  }

  // Recoger power-ups
  for (let i = world.powerups.length - 1; i >= 0; i--) {
    const pu = world.powerups[i];
    const dx = pu.x - p.x, dy = pu.y - p.y;
    if (dx * dx + dy * dy < (eatR + 8) * (eatR + 8)) {
      handlePowerupPickup(world, p, pu);
      world.powerups.splice(i, 1);
      io.to(p.id).emit('powerup', { type: pu.type, dur: POWERUP_DURATION[pu.type] || 0 });
    }
  }
}

function handlePowerupPickup(world, p, pu) {
  const t = pu.type;
  if (INSTANT_POWERUPS.has(t)) {
    if (t === 'crystal') {
      p.length += 30;
    } else if (t === 'bolt') {
      // matar al enemigo mas cercano (radio 350) que no sea mas grande
      let target = null, bestD = 350 * 350;
      for (const o of world.players.values()) {
        if (o === p || !o.alive || hasEffect(o, 'phantom')) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD && o.length < p.length * 1.5) {
          bestD = d; target = o;
        }
      }
      if (target) {
        io.to(target.id).emit('struckByBolt', { attacker: p.name });
        killPlayer(world, target, p);
      }
    } else if (t === 'freeze') {
      for (const o of world.players.values()) {
        if (o === p || !o.alive) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        if (dx * dx + dy * dy < 500 * 500) {
          applyEffect(o, 'frozen', 3);
          io.to(o.id).emit('frozenByPlayer', { attacker: p.name });
        }
      }
    } else if (t === 'hypno') {
      // invertir controles a enemigos en 500px durante 5s
      for (const o of world.players.values()) {
        if (o === p || !o.alive) continue;
        const dx = o.x - p.x, dy = o.y - p.y;
        if (dx * dx + dy * dy < 500 * 500) {
          applyEffect(o, 'reversed', 5);
          io.to(o.id).emit('hypnotizedBy', { attacker: p.name });
        }
      }
    } else if (t === 'heart') {
      // restaurar la mitad del largo perdido (o +50 minimo)
      const lost = Math.max(0, p.peakLength - p.length);
      const heal = Math.max(50, lost * 0.5);
      p.length += heal;
    }
  } else {
    applyEffect(p, t, POWERUP_DURATION[t] || 5);
  }
}

function checkHazards(world) {
  for (const p of world.players.values()) {
    if (!p.alive) continue;
    if (hasEffect(p, 'godmode')) continue;
    const r = radiusFor(p.length);

    // bombas: explosion grande, -30 largo
    for (let i = world.bombs.length - 1; i >= 0; i--) {
      const b = world.bombs[i];
      const dx = b.x - p.x, dy = b.y - p.y;
      const hit = r + 12;
      if (dx * dx + dy * dy < hit * hit) {
        explodeBomb(world, b, p);
        world.bombs.splice(i, 1);
      }
    }
    // minas: -15 largo
    for (let i = world.mines.length - 1; i >= 0; i--) {
      const m = world.mines[i];
      const dx = m.x - p.x, dy = m.y - p.y;
      const hit = r + 6;
      if (dx * dx + dy * dy < hit * hit) {
        triggerMine(world, m, p);
        world.mines.splice(i, 1);
      }
    }
    // lasers: -3 largo/seg si esta en el haz
    for (const l of world.lasers) {
      if (!l.active) continue;
      if (pointNearLaser(p, l, r)) {
        p.length -= 3 * (1 / TICK_RATE);
        if (p.length <= 1) { killPlayer(world, p, null); break; }
      }
    }
  }
}

function pointNearLaser(p, l, r) {
  // laser es una recta desde (l.ox, l.oy) en direccion l.angle, longitud = worldSize
  const len = 5000;
  const ex = l.ox + Math.cos(l.angle) * len;
  const ey = l.oy + Math.sin(l.angle) * len;
  // distancia punto-segmento
  const dx = ex - l.ox, dy = ey - l.oy;
  const t = clamp(((p.x - l.ox) * dx + (p.y - l.oy) * dy) / (dx * dx + dy * dy), 0, 1);
  const px = l.ox + dx * t, py = l.oy + dy * t;
  const ddx = p.x - px, ddy = p.y - py;
  const beam = 8 + r * 0.4;
  return ddx * ddx + ddy * ddy < beam * beam;
}

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function explodeBomb(world, b, victim) {
  // damage al primer impactado
  victim.length -= 30;
  // suelta comida en el area
  for (let i = 0; i < 25; i++) {
    world.spawnFood(b.x + rand(-60, 60), b.y + rand(-60, 60), Math.random() < 0.2 ? 3 : 1);
  }
  // damage en area a otros jugadores cercanos
  for (const o of world.players.values()) {
    if (o === victim || !o.alive) continue;
    if (hasEffect(o, 'godmode')) continue;
    const dx = o.x - b.x, dy = o.y - b.y;
    if (dx * dx + dy * dy < 90 * 90) {
      o.length -= 15;
      if (o.length <= 1) killPlayer(world, o, victim);
    }
  }
  if (victim.length <= 1) killPlayer(world, victim, null);
  io.to(victim.id).emit('hazardHit', { type: 'bomb', x: b.x, y: b.y });
}

function triggerMine(world, m, victim) {
  victim.length -= 15;
  for (let i = 0; i < 10; i++) {
    world.spawnFood(m.x + rand(-30, 30), m.y + rand(-30, 30));
  }
  if (victim.length <= 1) killPlayer(world, victim, null);
  io.to(victim.id).emit('hazardHit', { type: 'mine', x: m.x, y: m.y });
}

function checkCollisions(world) {
  const list = Array.from(world.players.values()).filter(p => p.alive);
  for (const p of list) {
    if (hasEffect(p, 'phantom')) continue; // intangible no choca
    const r = radiusFor(p.length);
    for (const other of list) {
      if (other === p) continue;
      const orad = radiusFor(other.length);
      for (let i = 1; i < other.segments.length; i++) {
        const s = other.segments[i];
        const dx = s.x - p.x, dy = s.y - p.y;
        const hit = r + orad * 0.6;
        if (dx * dx + dy * dy < hit * hit) {
          killPlayer(world, p, other);
          break;
        }
      }
      if (!p.alive) break;
    }
  }
}

function updateBattleRoyale(world, dt) {
  if (!world.cfg.brShrink) return;
  if (world.zoneRadius > world.zoneMinRadius) {
    world.zoneRadius = Math.max(world.zoneMinRadius, world.zoneRadius - world.zoneShrinkRate * dt);
  }
}

let lastTick = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;

  for (const world of Object.values(worlds)) {
    world.updateLasers(dt);
    for (const p of world.players.values()) updatePlayer(world, p, dt);
    checkCollisions(world);
    checkHazards(world);
    updateBattleRoyale(world, dt);
    world.ensureFood();
    world.ensurePowerups();
    world.ensureShields();
    world.ensureBombs();
    world.ensureMines();
  }
}, 1000 / TICK_RATE);

setInterval(() => {
  for (const [modeName, world] of Object.entries(worlds)) {
    const snapshot = {
      t: Date.now(),
      mode: modeName,
      ws: world.worldSize,
      zone: world.cfg.brShrink ? { x: world.zoneCenter.x, y: world.zoneCenter.y, r: Math.round(world.zoneRadius) } : null,
      players: Array.from(world.players.values()).map(p => ({
        id: p.id,
        n: p.name,
        c: p.color,
        sk: p.skin,
        kl: p.klass,
        x: p.x, y: p.y, a: p.angle,
        l: p.length,
        al: p.alive,
        ki: p.kills,
        st: p.streak,
        ef: serializeEffects(p),
        ab: p.activeAbility && Date.now() < p.abilityActiveUntil ? p.activeAbility : null,
        cd: Math.max(0, p.abilityCdEnd - Date.now()),
        seg: p.segments.map(s => [Math.round(s.x), Math.round(s.y)])
      })),
      food: world.food.map(f => [f.id, Math.round(f.x), Math.round(f.y), f.v, f.c]),
      pu: world.powerups.map(pu => [pu.id, Math.round(pu.x), Math.round(pu.y), pu.type]),
      bombs: world.bombs.map(b => [b.id, Math.round(b.x), Math.round(b.y)]),
      mines: world.mines.map(m => [m.id, Math.round(m.x), Math.round(m.y)]),
      lasers: world.lasers.map(l => [l.id, Math.round(l.ox), Math.round(l.oy), l.angle.toFixed(3), l.active ? 1 : 0, l.warming ? 1 : 0])
    };
    io.to(modeName).emit('state', snapshot);
  }
}, 1000 / BROADCAST_RATE);

function serializeEffects(p) {
  const out = {};
  const now = Date.now();
  for (const k of Object.keys(p.effects)) {
    const remaining = p.effects[k] - now;
    if (remaining > 0) out[k] = Math.round(remaining);
  }
  return out;
}

io.on('connection', (socket) => {
  let joinedMode = null;

  socket.on('join', (data) => {
    const mode = data?.mode === 'br' ? 'br' : 'classic';
    if (joinedMode && joinedMode !== mode) {
      socket.leave(joinedMode);
      const oldWorld = worlds[joinedMode];
      oldWorld.players.delete(socket.id);
    }
    joinedMode = mode;
    socket.join(mode);
    const p = spawnPlayer(socket, { ...data, mode });
    socket.emit('joined', {
      id: socket.id,
      world: worlds[mode].worldSize,
      mode,
      classes: CLASSES,
      powerupDur: POWERUP_DURATION
    });
  });

  socket.on('input', (data) => {
    if (!joinedMode) return;
    const world = worlds[joinedMode];
    const p = world.players.get(socket.id);
    if (!p || !p.alive) return;
    if (typeof data?.angle === 'number') p.targetAngle = data.angle;
    if (typeof data?.boost === 'boolean') p.boosting = data.boost;
  });

  socket.on('ability', () => {
    if (!joinedMode) return;
    const world = worlds[joinedMode];
    const p = world.players.get(socket.id);
    if (!p) return;
    const ok = executeAbility(world, p);
    if (ok) socket.emit('abilityFired', { cd: CLASSES[p.klass].cd });
  });

  socket.on('emote', (data) => {
    if (!joinedMode) return;
    const world = worlds[joinedMode];
    const p = world.players.get(socket.id);
    if (!p) return;
    const e = String(data?.e || '').slice(0, 4);
    if (!e) return;
    io.to(joinedMode).emit('emote', { id: socket.id, e, t: Date.now() });
  });

  socket.on('respawn', (data) => {
    if (!joinedMode) return;
    const world = worlds[joinedMode];
    world.players.delete(socket.id);
    spawnPlayer(socket, { ...data, mode: joinedMode });
    socket.emit('joined', {
      id: socket.id,
      world: world.worldSize,
      mode: joinedMode,
      classes: CLASSES,
      powerupDur: POWERUP_DURATION
    });
  });

  socket.on('disconnect', () => {
    if (!joinedMode) return;
    const world = worlds[joinedMode];
    const p = world.players.get(socket.id);
    if (p && p.alive) {
      pushScore(joinedMode === 'br' ? 'br' : 'multi', {
        name: p.name, length: Math.floor(p.length),
        kills: p.kills, klass: p.klass, skin: p.skin, date: Date.now()
      });
    }
    world.players.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Snake Arena en http://localhost:${PORT}`);
});
