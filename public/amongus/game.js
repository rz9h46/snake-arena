// ==================== Among Us — Vos sos el impostor ====================
// Top-down. 6 bots crewmates con tareas. Vos matás, te metés en vents,
// reportás cuerpos. Los bots votan en meetings según sospecha.

const COLORS = ['#e0212f', '#1a48d4', '#5fbb40', '#ff85c2', '#ff8838', '#fcd820', '#cccccc', '#5ed8e6'];
const NAMES = ['Rojo', 'Azul', 'Verde', 'Rosa', 'Naranja', 'Amarillo', 'Blanco', 'Cian'];

// Mapa: rooms (rectángulos caminables)
const MAP = {
  rooms: [
    { id: 'caf',  name: 'Cafetería',     x: 380, y: 290, w: 380, h: 200, color: '#3a4a5a' },
    { id: 'rea',  name: 'Reactor',       x: 50,  y: 70,  w: 240, h: 200, color: '#7a3a3a' },
    { id: 'ele',  name: 'Electricidad',  x: 50,  y: 480, w: 240, h: 200, color: '#5a4a2a' },
    { id: 'med',  name: 'Médica',        x: 850, y: 70,  w: 240, h: 200, color: '#3a5a4a' },
    { id: 'sto',  name: 'Almacén',       x: 850, y: 480, w: 240, h: 200, color: '#4a3a5a' },
    { id: 'adm',  name: 'Admin',         x: 480, y: 70,  w: 180, h: 150, color: '#3a3a5a' },
    { id: 'nav',  name: 'Navegación',    x: 660, y: 70,  w: 180, h: 150, color: '#2a3a5a' }
  ],
  hallways: [
    // corredores (caminables)
    { x: 290, y: 340, w: 90, h: 100 },     // reactor → cafe
    { x: 290, y: 540, w: 90, h: 80 },      // electricidad → ?
    { x: 760, y: 340, w: 90, h: 100 },     // cafe → médica/almacén
    { x: 290, y: 540, w: 560, h: 50 },     // pasillo inferior largo
    { x: 290, y: 130, w: 190, h: 50 },     // reactor → admin
    { x: 660, y: 130, w: 190, h: 50 },     // nav → médica
    { x: 480, y: 220, w: 360, h: 70 }      // admin/nav → cafe
  ],
  vents: [
    { x: 150, y: 150, room: 'rea' },
    { x: 150, y: 580, room: 'ele' },
    { x: 950, y: 150, room: 'med' },
    { x: 950, y: 580, room: 'sto' },
    { x: 570, y: 380, room: 'caf' }
  ],
  taskSpots: [
    { x: 100, y: 130, room: 'rea', name: 'Iniciar reactor' },
    { x: 220, y: 220, room: 'rea', name: 'Calibrar barras' },
    { x: 100, y: 580, room: 'ele', name: 'Cables eléctricos' },
    { x: 220, y: 600, room: 'ele', name: 'Distribuir energía' },
    { x: 900, y: 130, room: 'med', name: 'Examen médico' },
    { x: 1020, y: 220, room: 'med', name: 'Procesar muestra' },
    { x: 900, y: 580, room: 'sto', name: 'Llenar combustible' },
    { x: 1020, y: 600, room: 'sto', name: 'Sacar basura' },
    { x: 530, y: 130, room: 'adm', name: 'Tarjeta de Admin' },
    { x: 720, y: 130, room: 'nav', name: 'Trazar curso' },
    { x: 540, y: 380, room: 'caf', name: 'Buffet de comida' },
    { x: 700, y: 440, room: 'caf', name: 'Ordenar mesas' }
  ],
  emergencyButton: { x: 580, y: 390, room: 'caf' }
};

const KILL_RANGE = 36;
const KILL_COOLDOWN = 25;
const VENT_RANGE = 30;
const TASK_DURATION = 4.5;
const REPORT_RANGE = 40;
const PLAYER_SPEED = 130;
const BOT_SPEED = 110;
const TASKS_PER_BOT = 3;

let canvas, ctx;
const camera = { x: 0, y: 0 };
const viewport = { w: 0, h: 0 };

const state = {
  playing: false,
  paused: false,
  meeting: false,
  ended: false,
  startedAt: 0,
  player: null,        // {x, y, color, name, alive, role, killCd}
  bots: [],            // crewmates
  bodies: [],          // {x, y, color, name, reportedBy: null}
  reportedBodies: new Set(),
  tasksDone: 0,
  tasksTotal: 0,
  suspicion: 0,        // sospecha que tienen los bots de vos
  kills: 0,
  ventCooldown: 0,
  inputDirX: 0,
  inputDirY: 0,
  keys: {},
  taskInProgress: null,
  best: parseFloat(localStorage.getItem('amongus-best') || '999999')
};

// ==================== Map utils ====================
function isWalkable(x, y) {
  for (const r of MAP.rooms) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  for (const r of MAP.hallways) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  return false;
}

function clampToMap(x, y, prevX, prevY) {
  if (isWalkable(x, y)) return { x, y };
  if (isWalkable(x, prevY)) return { x, y: prevY };
  if (isWalkable(prevX, y)) return { x: prevX, y };
  return { x: prevX, y: prevY };
}

function findRoomAt(x, y) {
  for (const r of MAP.rooms) if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return r;
  return null;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

// ==================== Pathfinding simplificado ====================
// Para que los bots vayan de A a B, usamos waypoints fijos en el centro de cada room/hallway
const WAYPOINTS = [
  { id: 'caf-c',   x: 570, y: 390, room: 'caf' },
  { id: 'caf-w',   x: 410, y: 390, room: 'caf' },
  { id: 'caf-e',   x: 730, y: 390, room: 'caf' },
  { id: 'caf-n',   x: 570, y: 320, room: 'caf' },
  { id: 'caf-s',   x: 570, y: 460, room: 'caf' },
  { id: 'rea-c',   x: 170, y: 170, room: 'rea' },
  { id: 'rea-e',   x: 270, y: 170, room: 'rea' },
  { id: 'ele-c',   x: 170, y: 580, room: 'ele' },
  { id: 'ele-e',   x: 270, y: 580, room: 'ele' },
  { id: 'med-c',   x: 970, y: 170, room: 'med' },
  { id: 'med-w',   x: 870, y: 170, room: 'med' },
  { id: 'sto-c',   x: 970, y: 580, room: 'sto' },
  { id: 'sto-w',   x: 870, y: 580, room: 'sto' },
  { id: 'adm-c',   x: 570, y: 145, room: 'adm' },
  { id: 'nav-c',   x: 750, y: 145, room: 'nav' },
  { id: 'h-rl-w',  x: 320, y: 380 },   // pasillo reactor-cafe
  { id: 'h-er-w',  x: 320, y: 565 },   // pasillo electricidad-pasillo
  { id: 'h-er-e',  x: 800, y: 565 },   // pasillo derecha
  { id: 'h-rs-e',  x: 800, y: 380 },   // pasillo cafe-médica
  { id: 'h-cn',    x: 570, y: 240 },   // pasillo norte cafe
  { id: 'h-an',    x: 380, y: 145 },   // arriba reactor-admin
  { id: 'h-nm',    x: 850, y: 145 }    // arriba nav-médica
];

const NEIGHBORS = {
  'caf-c':   ['caf-w', 'caf-e', 'caf-n', 'caf-s'],
  'caf-w':   ['caf-c', 'h-rl-w'],
  'caf-e':   ['caf-c', 'h-rs-e'],
  'caf-n':   ['caf-c', 'h-cn'],
  'caf-s':   ['caf-c', 'h-er-w', 'h-er-e'],
  'rea-c':   ['rea-e', 'h-rl-w', 'h-an'],
  'rea-e':   ['rea-c'],
  'ele-c':   ['ele-e', 'h-er-w'],
  'ele-e':   ['ele-c'],
  'med-c':   ['med-w', 'h-rs-e', 'h-nm'],
  'med-w':   ['med-c'],
  'sto-c':   ['sto-w', 'h-er-e'],
  'sto-w':   ['sto-c'],
  'adm-c':   ['h-an', 'h-cn'],
  'nav-c':   ['h-cn', 'h-nm'],
  'h-rl-w':  ['caf-w', 'rea-c'],
  'h-er-w':  ['caf-s', 'ele-c'],
  'h-er-e':  ['caf-s', 'sto-c'],
  'h-rs-e':  ['caf-e', 'med-c'],
  'h-cn':    ['caf-n', 'adm-c', 'nav-c'],
  'h-an':    ['rea-c', 'adm-c'],
  'h-nm':    ['med-c', 'nav-c']
};

function findNearestWaypoint(p) {
  let best = null, bestD = 1e9;
  for (const wp of WAYPOINTS) {
    const d = (wp.x - p.x) ** 2 + (wp.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = wp; }
  }
  return best;
}

function getWaypoint(id) {
  return WAYPOINTS.find(wp => wp.id === id);
}

function pathTo(startWpId, goalWpId) {
  // BFS shortest path
  if (startWpId === goalWpId) return [startWpId];
  const visited = new Set([startWpId]);
  const queue = [[startWpId]];
  while (queue.length > 0) {
    const path = queue.shift();
    const last = path[path.length - 1];
    for (const n of (NEIGHBORS[last] || [])) {
      if (visited.has(n)) continue;
      const newPath = [...path, n];
      if (n === goalWpId) return newPath;
      visited.add(n);
      queue.push(newPath);
    }
  }
  return null;
}

// ==================== Init ====================
function setupCanvas() {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viewport.w = canvas.clientWidth;
  viewport.h = canvas.clientHeight;
  canvas.width = viewport.w * dpr;
  canvas.height = viewport.h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startGame() {
  // Player (impostor)
  state.player = {
    x: 570, y: 390, vx: 0, vy: 0,
    color: COLORS[0], name: NAMES[0],
    alive: true, role: 'impostor',
    killCd: 0,
    inVent: false,
    facing: 1
  };
  // Bots
  state.bots = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    state.bots.push({
      x: 570 + Math.cos(angle) * 70,
      y: 390 + Math.sin(angle) * 50,
      color: COLORS[i + 1],
      name: NAMES[i + 1],
      alive: true, role: 'crew',
      task: null,           // {spot, progress}
      tasksLeft: TASKS_PER_BOT,
      tasksDone: 0,
      path: [],
      target: null,
      idleTime: 0,
      facing: 1,
      lastSeenWith: new Map()  // playerName → ts cuando lo vimos cerca
    });
  }
  state.bodies = [];
  state.reportedBodies = new Set();
  state.tasksDone = 0;
  state.tasksTotal = 6 * TASKS_PER_BOT;
  state.suspicion = 0;
  state.kills = 0;
  state.ventCooldown = 0;
  state.startedAt = performance.now();
  state.playing = true;
  state.ended = false;
  state.meeting = false;
  state.taskInProgress = null;

  document.getElementById('menu').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('actions').classList.remove('hidden');
}

// ==================== Input ====================
function setupInput() {
  window.addEventListener('keydown', (e) => {
    state.keys[e.key.toLowerCase()] = true;
    if (e.key === 'Escape') {
      if (state.playing) { showMenu(); }
    }
    if (!state.playing || state.meeting || state.ended) return;
    if (e.key === ' ') { e.preventDefault(); tryKill(); }
    if (e.key.toLowerCase() === 'e') tryVent();
    if (e.key.toLowerCase() === 'r') tryReport();
    if (e.key.toLowerCase() === 'q') tryEmergency();
  });
  window.addEventListener('keyup', (e) => {
    state.keys[e.key.toLowerCase()] = false;
  });

  // Touch joystick (left half of screen drag)
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    if (!state.playing || state.meeting) return;
    e.preventDefault();
    const t = e.touches[0];
    if (t.clientX < window.innerWidth * 0.6) {
      touchStart = { x: t.clientX, y: t.clientY };
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!touchStart) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const d = Math.hypot(dx, dy);
    if (d > 8) {
      state.inputDirX = dx / d;
      state.inputDirY = dy / d;
    } else {
      state.inputDirX = 0;
      state.inputDirY = 0;
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    touchStart = null;
    state.inputDirX = 0;
    state.inputDirY = 0;
  });

  // Action buttons
  document.getElementById('btn-kill').addEventListener('click', tryKill);
  document.getElementById('btn-vent').addEventListener('click', tryVent);
  document.getElementById('btn-report').addEventListener('click', tryReport);
  document.getElementById('btn-emerg').addEventListener('click', tryEmergency);
}

// ==================== Player actions ====================
function tryKill() {
  if (!state.playing || state.meeting || state.ended) return;
  if (state.player.killCd > 0) return;
  // Crewmate más cercano vivo
  let target = null, bestD = KILL_RANGE;
  for (const b of state.bots) {
    if (!b.alive) continue;
    const d = dist(state.player, b);
    if (d < bestD) { bestD = d; target = b; }
  }
  if (!target) return;
  killBot(target);
}

function killBot(bot) {
  bot.alive = false;
  state.bodies.push({
    x: bot.x, y: bot.y,
    color: bot.color, name: bot.name,
    foundBy: null
  });
  state.kills++;
  state.player.killCd = KILL_COOLDOWN;
  // Si algún crewmate vio a vos cerca de la víctima, sube sospecha
  for (const other of state.bots) {
    if (!other.alive) continue;
    if (dist(other, bot) < 200) {
      state.suspicion += 25;
      other.lastSeenWith.set('Rojo', performance.now());
    }
  }
  // teleport corto al lado del cuerpo (efecto de "kill cinemático")
  const angle = Math.atan2(bot.y - state.player.y, bot.x - state.player.x);
  state.player.x = bot.x - Math.cos(angle) * 8;
  state.player.y = bot.y - Math.sin(angle) * 8;
  flashScreen('rgba(255, 94, 122, 0.4)', 200);
  beep('kill');
  checkWinCondition();
}

function tryVent() {
  if (!state.playing || state.meeting || state.ended) return;
  if (state.ventCooldown > 0) return;
  // Encontrar vent cerca
  let nearVent = null;
  for (const v of MAP.vents) {
    if (dist(state.player, v) < VENT_RANGE) { nearVent = v; break; }
  }
  if (!nearVent) return;
  // Lista de vents excepto este
  const others = MAP.vents.filter(v => v !== nearVent);
  // Elegir uno aleatoriamente para simplificar (o dejar al usuario elegir)
  const target = others[randInt(0, others.length - 1)];
  state.player.x = target.x;
  state.player.y = target.y;
  state.player.inVent = true;
  state.ventCooldown = 1.5;
  // Si algún crewmate vio el vent, sospecha sube fuerte
  for (const b of state.bots) {
    if (!b.alive) continue;
    if (dist(b, nearVent) < 200) state.suspicion += 40;
  }
  flashScreen('rgba(255, 140, 186, 0.4)', 250);
  beep('vent');
  setTimeout(() => { state.player.inVent = false; }, 600);
}

function tryReport() {
  if (!state.playing || state.meeting || state.ended) return;
  for (const body of state.bodies) {
    if (state.reportedBodies.has(body.name)) continue;
    if (dist(state.player, body) < REPORT_RANGE) {
      state.reportedBodies.add(body.name);
      callMeeting('reported', body, 'Rojo');
      return;
    }
  }
}

function tryEmergency() {
  if (!state.playing || state.meeting || state.ended) return;
  if (dist(state.player, MAP.emergencyButton) > 50) return;
  callMeeting('emergency', null, 'Rojo');
}

// ==================== Bot AI ====================
function botAssignTask(bot) {
  const room = MAP.rooms[randInt(0, MAP.rooms.length - 1)];
  const spotsInRoom = MAP.taskSpots.filter(t => t.room === room.id);
  if (spotsInRoom.length === 0) return botAssignTask(bot);
  const spot = spotsInRoom[randInt(0, spotsInRoom.length - 1)];
  bot.task = { spot, progress: 0 };
  // Path
  const startWp = findNearestWaypoint(bot);
  const goalWp = findNearestWaypoint(spot);
  bot.path = pathTo(startWp.id, goalWp.id) || [startWp.id];
  bot.target = bot.path.length > 0 ? getWaypoint(bot.path[0]) : null;
}

function botUpdate(bot, dt) {
  if (!bot.alive) return;
  // Si está haciendo tarea
  if (bot.task && bot.target === null) {
    bot.task.progress += dt;
    if (bot.task.progress >= TASK_DURATION) {
      state.tasksDone++;
      bot.tasksDone++;
      bot.tasksLeft--;
      bot.task = null;
      if (bot.tasksLeft > 0) botAssignTask(bot);
      else botIdleWander(bot);
    }
    return;
  }
  // Si no tiene path y no está en tarea
  if (!bot.task && (!bot.path || bot.path.length === 0)) {
    if (bot.tasksLeft > 0) botAssignTask(bot);
    else botIdleWander(bot);
    return;
  }
  // Caminar al target actual
  if (bot.target) {
    const dx = bot.target.x - bot.x;
    const dy = bot.target.y - bot.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      // llegó a este waypoint
      bot.path.shift();
      if (bot.path.length === 0) {
        // llegó al destino final
        if (bot.task) {
          // ir al spot exacto
          const dxs = bot.task.spot.x - bot.x;
          const dys = bot.task.spot.y - bot.y;
          const ds = Math.hypot(dxs, dys);
          if (ds < 8) {
            bot.target = null;  // empezar tarea
          } else {
            // movimiento directo al spot
            bot.x += (dxs / ds) * BOT_SPEED * dt;
            bot.y += (dys / ds) * BOT_SPEED * dt;
            bot.facing = dxs >= 0 ? 1 : -1;
          }
        } else {
          bot.target = null;
        }
      } else {
        bot.target = getWaypoint(bot.path[0]);
      }
    } else {
      const vx = (dx / d) * BOT_SPEED;
      const vy = (dy / d) * BOT_SPEED;
      const newX = bot.x + vx * dt;
      const newY = bot.y + vy * dt;
      const c = clampToMap(newX, newY, bot.x, bot.y);
      bot.x = c.x; bot.y = c.y;
      bot.facing = vx >= 0 ? 1 : -1;
    }
  }
  // Detectar cuerpos (auto report)
  for (const body of state.bodies) {
    if (state.reportedBodies.has(body.name)) continue;
    if (dist(bot, body) < REPORT_RANGE) {
      state.reportedBodies.add(body.name);
      callMeeting('found', body, bot.name);
      return;
    }
  }
  // Registrar quién está cerca de mí (para sospecha luego)
  if (dist(bot, state.player) < 90) {
    bot.lastSeenWith.set('Rojo', performance.now());
  }
}

function botIdleWander(bot) {
  // ir a la cafetería a vagar
  const startWp = findNearestWaypoint(bot);
  const goalWp = WAYPOINTS[randInt(0, 4)];  // cafe waypoints
  bot.path = pathTo(startWp.id, goalWp.id) || [];
  bot.target = bot.path.length > 0 ? getWaypoint(bot.path[0]) : null;
}

// ==================== Update loop ====================
let lastFrame = performance.now();
function loop(now) {
  try {
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (state.playing && !state.paused && !state.meeting && !state.ended) {
      update(dt);
    }
    render();
  } catch (err) {
    console.error('Among Us loop error:', err);
  }
  requestAnimationFrame(loop);
}

function update(dt) {
  // input
  let dx = 0, dy = 0;
  if (state.keys['w'] || state.keys['arrowup']) dy -= 1;
  if (state.keys['s'] || state.keys['arrowdown']) dy += 1;
  if (state.keys['a'] || state.keys['arrowleft']) dx -= 1;
  if (state.keys['d'] || state.keys['arrowright']) dx += 1;
  if (state.inputDirX !== 0 || state.inputDirY !== 0) {
    dx = state.inputDirX;
    dy = state.inputDirY;
  }
  if (dx !== 0 || dy !== 0) {
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    const newX = state.player.x + dx * PLAYER_SPEED * dt;
    const newY = state.player.y + dy * PLAYER_SPEED * dt;
    const c = clampToMap(newX, newY, state.player.x, state.player.y);
    state.player.x = c.x;
    state.player.y = c.y;
    state.player.facing = dx >= 0 ? 1 : -1;
  }
  // cooldowns
  state.player.killCd = Math.max(0, state.player.killCd - dt);
  state.ventCooldown = Math.max(0, state.ventCooldown - dt);
  // suspicion decay
  state.suspicion = Math.max(0, state.suspicion - 1.5 * dt);
  // bots
  for (const bot of state.bots) botUpdate(bot, dt);
  // camera follow
  camera.x = state.player.x - viewport.w / 2;
  camera.y = state.player.y - viewport.h / 2;
  // HUD
  document.getElementById('hud-alive').textContent = state.bots.filter(b => b.alive).length + 1;
  document.getElementById('hud-tasks').textContent = Math.floor((state.tasksDone / state.tasksTotal) * 100) + '%';
  document.getElementById('hud-sus').textContent = Math.floor(state.suspicion);
  const cd = state.player.killCd;
  const killPill = document.getElementById('kill-pill');
  if (cd > 0) {
    document.getElementById('hud-kill-cd').textContent = cd.toFixed(1) + 's';
    killPill.classList.add('cooling');
  } else {
    document.getElementById('hud-kill-cd').textContent = 'LISTO';
    killPill.classList.remove('cooling');
  }
  document.getElementById('btn-kill').classList.toggle('cooling', cd > 0);
  // win/lose
  if (state.tasksDone >= state.tasksTotal) {
    endGame(false, 'Los crewmates terminaron todas las tareas');
  } else if (state.bots.filter(b => b.alive).length <= 1) {
    endGame(true, 'Los mataste a casi todos. ¡Ganaste!');
  }
}

function checkWinCondition() {
  const alive = state.bots.filter(b => b.alive).length;
  if (alive <= 1) endGame(true, 'Eliminaste a casi todos. ¡Ganaste!');
}

// ==================== Render ====================
function render() {
  ctx.clearRect(0, 0, viewport.w, viewport.h);
  // bg
  ctx.fillStyle = '#0d0e1c';
  ctx.fillRect(0, 0, viewport.w, viewport.h);
  // map (rooms + hallways)
  for (const r of MAP.hallways) drawRoom(r, '#2a2a3a');
  for (const r of MAP.rooms) drawRoom(r, r.color, r.name);
  // emergency button
  drawEmergencyButton(MAP.emergencyButton);
  // vents
  for (const v of MAP.vents) drawVent(v);
  // task spots
  for (const t of MAP.taskSpots) drawTaskSpot(t);
  // bodies
  for (const body of state.bodies) drawBody(body);
  // bots
  for (const bot of state.bots) {
    if (bot.alive) drawCrewmate(bot);
  }
  // player (last so it's on top) — solo si ya empezó el juego
  if (state.player) {
    drawCrewmate(state.player, true);
    if (state.player.killCd <= 0) drawKillRange();
  }
}

function w2sX(x) { return x - camera.x; }
function w2sY(y) { return y - camera.y; }

function drawRoom(r, color, name) {
  const x = w2sX(r.x), y = w2sY(r.y);
  if (x + r.w < -50 || x > viewport.w + 50 || y + r.h < -50 || y > viewport.h + 50) return;
  // floor
  ctx.fillStyle = color;
  ctx.fillRect(x, y, r.w, r.h);
  // grid
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  for (let i = 1; i < r.w / 40; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * 40, y); ctx.lineTo(x + i * 40, y + r.h);
    ctx.stroke();
  }
  for (let i = 1; i < r.h / 40; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y + i * 40); ctx.lineTo(x + r.w, y + i * 40);
    ctx.stroke();
  }
  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, r.w, r.h);
  // label
  if (name) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(name.toUpperCase(), x + r.w / 2, y + 6);
  }
}

function drawVent(v) {
  const x = w2sX(v.x), y = w2sY(v.y);
  // base oscura
  ctx.fillStyle = '#3a2a3a';
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.fill();
  // grilla
  ctx.fillStyle = '#ff8cba';
  for (let i = -1; i <= 1; i++) {
    ctx.fillRect(x - 12, y + i * 4 - 1, 24, 2);
  }
  ctx.strokeStyle = 'rgba(255, 140, 186, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 16, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTaskSpot(t) {
  const x = w2sX(t.x), y = w2sY(t.y);
  // si el spot ya fue completado por algún bot, marca distinto
  ctx.fillStyle = 'rgba(255, 215, 94, 0.18)';
  ctx.strokeStyle = 'rgba(255, 215, 94, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.rect(x - 12, y - 12, 24, 24);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffd75e';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y);
}

function drawEmergencyButton(b) {
  const x = w2sX(b.x), y = w2sY(b.y);
  const t = performance.now() * 0.005;
  // base
  ctx.fillStyle = '#3a3a3a';
  ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill();
  // botón rojo pulsante
  const r = 16 + Math.sin(t) * 1.5;
  ctx.fillStyle = '#cc1818';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff5050';
  ctx.beginPath(); ctx.arc(x - 4, y - 4, r * 0.4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y + 1);
}

function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  if (amt < 0) { r = Math.round(r * (1 + amt)); g = Math.round(g * (1 + amt)); b = Math.round(b * (1 + amt)); }
  else { r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt); }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function drawCrewmate(c, isPlayer = false) {
  const x = w2sX(c.x), y = w2sY(c.y);
  drawCrewSprite(ctx, x, y, c.color, c.facing, c.name, c.task && c.target === null, isPlayer);
}

// Sprite estilo Among Us (versión simplificada)
function drawCrewSprite(ctx, x, y, color, facing = 1, name, isTasking = false, isPlayer = false) {
  ctx.save();
  if (facing === -1) {
    ctx.translate(x * 2, 0);
    ctx.scale(-1, 1);
    x = x;
  }
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(x, y + 22, 14, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // backpack (atrás)
  ctx.fillStyle = shade(color, -0.25);
  ctx.fillRect(x - 16, y - 4, 6, 14);
  ctx.beginPath(); ctx.arc(x - 13, y - 4, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x - 13, y + 10, 3, 0, Math.PI * 2); ctx.fill();
  // body (forma bean)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // sombra cuerpo
  ctx.fillStyle = shade(color, -0.2);
  ctx.beginPath();
  ctx.ellipse(x + 4, y + 6, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 14, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  // dome (vidrio)
  ctx.fillStyle = '#a8d6e6';
  ctx.beginPath();
  ctx.ellipse(x + 3, y - 4, 9, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // sombra interna del vidrio
  ctx.fillStyle = '#7aaecc';
  ctx.beginPath();
  ctx.ellipse(x + 5, y - 2, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // brillo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + 6, y - 6, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // pies
  ctx.fillStyle = color;
  ctx.fillRect(x - 8, y + 18, 6, 6);
  ctx.fillRect(x + 2, y + 18, 6, 6);
  ctx.fillStyle = shade(color, -0.3);
  ctx.fillRect(x - 8, y + 22, 6, 2);
  ctx.fillRect(x + 2, y + 22, 6, 2);
  ctx.restore();

  // task progress bar arriba
  if (isTasking) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x - 16, y - 22, 32, 4);
    ctx.fillStyle = '#5fbb40';
    // approximación: si el bot esta haciendo tarea, mostrar 50%
    ctx.fillRect(x - 16, y - 22, 32 * 0.6, 4);
  }
  // nombre
  ctx.fillStyle = isPlayer ? '#ffd75e' : 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(name, x, y - 24);
}

function drawBody(b) {
  const x = w2sX(b.x), y = w2sY(b.y);
  // sombra
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  // medio cuerpo (cortado)
  ctx.fillStyle = b.color;
  ctx.beginPath();
  ctx.ellipse(x, y + 4, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // hueso visible (símbolo de muerte)
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 6, y - 2, 14, 3);
  ctx.beginPath();
  ctx.arc(x + 6, y, 2.5, 0, Math.PI * 2);
  ctx.arc(x + 20, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // sangre
  ctx.fillStyle = '#7a1818';
  ctx.beginPath();
  ctx.arc(x + 18, y + 6, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawKillRange() {
  // anillo sutil de rango de kill
  const x = w2sX(state.player.x), y = w2sY(state.player.y);
  ctx.strokeStyle = 'rgba(255, 94, 122, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(x, y, KILL_RANGE, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ==================== Meetings ====================
function callMeeting(reason, body, calledBy) {
  if (state.meeting || state.ended) return;
  state.meeting = true;
  // teleportar a todos a cafetería
  const positions = [
    {x: 460, y: 360}, {x: 510, y: 350}, {x: 560, y: 350},
    {x: 610, y: 350}, {x: 660, y: 350}, {x: 710, y: 360},
    {x: 580, y: 420}
  ];
  state.player.x = positions[0].x;
  state.player.y = positions[0].y;
  state.bots.forEach((b, i) => {
    if (b.alive) {
      b.x = positions[Math.min(i + 1, positions.length - 1)].x;
      b.y = positions[Math.min(i + 1, positions.length - 1)].y;
      b.path = []; b.target = null; b.task = null;
    }
  });
  showMeetingOverlay(reason, body, calledBy);
}

function showMeetingOverlay(reason, body, calledBy) {
  const overlay = document.getElementById('meeting-overlay');
  document.getElementById('meeting-title').textContent =
    reason === 'emergency' ? '🚨 EMERGENCY MEETING' : '📢 BODY REPORTED';
  const bodyArea = document.getElementById('meeting-body-area');
  bodyArea.innerHTML = '';
  if (body) {
    const cv = document.createElement('canvas');
    cv.width = 90; cv.height = 70;
    const cx = cv.getContext('2d');
    drawCrewSprite(cx, 45, 30, body.color, 1, body.name, false, false);
    bodyArea.appendChild(cv);
    document.getElementById('meeting-discussion').textContent =
      `${calledBy} encontró el cuerpo de ${body.name}. Discusión...`;
  } else {
    document.getElementById('meeting-discussion').textContent =
      `${calledBy} llamó a meeting de emergencia. Discusión...`;
  }
  // construir grid de votación (vacío al principio)
  buildVoteGrid();
  document.getElementById('vote-results').classList.add('hidden');
  document.getElementById('btn-skip-vote').classList.remove('hidden');
  document.getElementById('btn-meeting-continue').classList.add('hidden');
  overlay.classList.remove('hidden');
  // habilitar voto después de 4 seg
  state.voteEnabledAt = performance.now() + 4000;
  state.voted = null;
}

function buildVoteGrid() {
  const grid = document.getElementById('vote-grid');
  grid.innerHTML = '';
  const candidates = [state.player, ...state.bots];
  for (const c of candidates) {
    const card = document.createElement('button');
    card.className = 'vote-card' + (!c.alive ? ' dead' : '');
    const cv = document.createElement('canvas');
    cv.width = 70; cv.height = 56;
    const cx = cv.getContext('2d');
    if (c.alive) drawCrewSprite(cx, 35, 28, c.color, 1, c.name, false, false);
    else { cx.fillStyle = '#444'; cx.fillRect(0, 0, 70, 56); }
    card.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = c.name + (c === state.player ? ' (vos)' : '');
    card.appendChild(nm);
    if (c.alive) {
      card.addEventListener('click', () => {
        if (performance.now() < state.voteEnabledAt) return;
        if (state.voted) return;
        state.voted = c;
        document.querySelectorAll('.vote-card').forEach(el => el.classList.remove('voted'));
        card.classList.add('voted');
        finishVoting();
      });
    }
    grid.appendChild(card);
  }
}

document.getElementById('btn-skip-vote').addEventListener('click', () => {
  if (performance.now() < state.voteEnabledAt) return;
  if (state.voted) return;
  state.voted = 'skip';
  finishVoting();
});

function finishVoting() {
  // Bots votan según sospecha
  const candidates = [state.player, ...state.bots].filter(c => c.alive);
  const tally = new Map();   // candidate.name → votes
  candidates.forEach(c => tally.set(c.name, 0));
  tally.set('skip', 0);
  // voto del jugador
  if (state.voted === 'skip') tally.set('skip', tally.get('skip') + 1);
  else if (state.voted) tally.set(state.voted.name, tally.get(state.voted.name) + 1);
  // votos de bots
  for (const bot of state.bots) {
    if (!bot.alive) continue;
    const target = botVote(bot, candidates);
    if (target) tally.set(target.name, (tally.get(target.name) || 0) + 1);
    else tally.set('skip', tally.get('skip') + 1);
  }
  // Encontrar el más votado
  let max = 0, ejected = null;
  for (const [name, v] of tally) {
    if (v > max) { max = v; ejected = name; }
  }
  // empate o skip
  if (ejected === 'skip' || max === 0) ejected = null;

  showVoteResults(tally, ejected);
}

function botVote(bot, candidates) {
  // sospecha: si el bot vio a Rojo cerca recientemente → vota Rojo
  const now = performance.now();
  const seenWith = bot.lastSeenWith.get('Rojo') || 0;
  const recentlySeen = (now - seenWith) < 30000;
  let suspicion = 0;
  if (recentlySeen) suspicion += 50;
  suspicion += state.suspicion * 0.5;
  // si la sospecha global es alta, vota a Rojo
  if (suspicion > 30 + Math.random() * 30) {
    return state.player.alive ? state.player : null;
  }
  // Si no, vota a alguien random vivo (excluyéndose)
  const others = candidates.filter(c => c !== bot && c !== state.player && c.alive);
  if (others.length === 0) return null;
  // 60% chance de skip
  if (Math.random() < 0.55) return null;
  return others[randInt(0, others.length - 1)];
}

function showVoteResults(tally, ejectedName) {
  const res = document.getElementById('vote-results');
  res.classList.remove('hidden');
  document.getElementById('btn-skip-vote').classList.add('hidden');
  let html = '<strong>Resultados:</strong><br>';
  for (const [name, votes] of tally) {
    if (votes > 0) html += `${name === 'skip' ? '⏭ Skip' : name}: ${votes}<br>`;
  }
  if (ejectedName) {
    const ejected = ejectedName === 'Rojo' ? state.player : state.bots.find(b => b.name === ejectedName);
    html += `<br><strong style="color: var(--accent)">Eyectado: ${ejectedName}${ejected && ejected.role === 'impostor' ? ' (era el impostor)' : ' (era crewmate)'}</strong>`;
    if (ejected) {
      ejected.alive = false;
      if (ejected === state.player) {
        endGame(false, 'Te votaron y eyectaron del barco. ¡Eras el impostor!');
        res.innerHTML = html;
        return;
      } else {
        // bot eyectado, sigue el juego
        // remover sus tareas pendientes del total
        state.tasksTotal -= ejected.tasksLeft;
      }
    }
  } else {
    html += '<br><em>Nadie eyectado (skip o empate)</em>';
  }
  res.innerHTML = html;
  document.getElementById('btn-meeting-continue').classList.remove('hidden');
}

document.getElementById('btn-meeting-continue').addEventListener('click', () => {
  document.getElementById('meeting-overlay').classList.add('hidden');
  state.meeting = false;
  state.player.killCd = 8;  // pequeño cooldown post-meeting
  state.suspicion = Math.max(0, state.suspicion - 30);
  // bots reanudan tareas
  for (const b of state.bots) if (b.alive) botAssignTask(b);
  checkWinCondition();
});

// ==================== End game ====================
function endGame(won, reason) {
  if (state.ended) return;
  state.ended = true;
  state.playing = false;
  document.getElementById('go-title').textContent = won ? '🏆 GANASTE' : '💀 PERDISTE';
  document.getElementById('go-reason').textContent = reason;
  const elapsed = (performance.now() - state.startedAt) / 1000;
  document.getElementById('go-kills').textContent = state.kills;
  document.getElementById('go-time').textContent = formatTime(elapsed);
  if (won && elapsed < state.best) {
    state.best = elapsed;
    localStorage.setItem('amongus-best', elapsed.toFixed(2));
  }
  document.getElementById('go-best').textContent = state.best < 999999 ? formatTime(state.best) : '—';
  document.getElementById('gameover').classList.remove('hidden');
  document.getElementById('meeting-overlay').classList.add('hidden');
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' + sec : sec);
}

function showMenu() {
  state.playing = false;
  state.ended = false;
  document.getElementById('menu').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
  document.getElementById('actions').classList.add('hidden');
  document.getElementById('meeting-overlay').classList.add('hidden');
  document.getElementById('gameover').classList.add('hidden');
}

// ==================== FX ====================
function flashScreen(color, ms) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;inset:0;background:${color};z-index:99;pointer-events:none;transition:opacity ${ms}ms`;
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '0'; });
  setTimeout(() => el.remove(), ms);
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
    case 'kill':  o.type = 'sawtooth'; o.frequency.value = 220; o.frequency.exponentialRampToValueAtTime(80, t0 + 0.4); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); dur = 0.4; break;
    case 'vent':  o.type = 'square';   o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.2); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); dur = 0.2; break;
    case 'meeting':o.type = 'square';  o.frequency.value = 880; g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5); dur = 0.5; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== Bindings ====================
document.getElementById('btn-start').addEventListener('click', () => { ensureAudio(); startGame(); });
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('btn-help-open').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('go-replay').addEventListener('click', startGame);
document.getElementById('go-menu').addEventListener('click', showMenu);

if (!localStorage.getItem('amongus-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('amongus-seen-help', '1');
}

setupCanvas();
setupInput();
requestAnimationFrame(loop);
