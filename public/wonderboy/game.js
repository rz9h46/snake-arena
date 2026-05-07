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
  vitalityDecay: 1.5,
  lives: 3,
  ground: [],
  pits: [],
  enemies: [],
  fruits: [],
  particles: [],
  worldEnd: 0,
  axes: [],            // hachas en vuelo {x, y, vx, vy, rot, alive}
  skateboards: [],     // patinetas pickup en el mundo {x, y, taken}
  skating: false,
  skateTimer: 0
};
const SKATE_DUR = 12;       // segundos de patineta

// FRUIT_KINDS se define más abajo como FRUIT_LIST (con sprites)
const FRUIT_KINDS_NAMES = ['apple', 'banana', 'grape', 'peach', 'cherry'];
const FRUIT_DATA = {
  apple:  { name: 'apple',  score: 50, vit: 8 },
  banana: { name: 'banana', score: 50, vit: 8 },
  grape:  { name: 'grape',  score: 80, vit: 10 },
  peach:  { name: 'peach',  score: 100, vit: 14 },
  cherry: { name: 'cherry', score: 30, vit: 5 }
};
function pickFruitKind() {
  return FRUIT_DATA[FRUIT_KINDS_NAMES[randInt(0, FRUIT_KINDS_NAMES.length - 1)]];
}
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
  state.axes = [];
  state.skateboards = [];
  state.skating = false;
  state.skateTimer = 0;
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
            kind: pickFruitKind(),
            taken: false
          });
        }
      }
      // patineta ocasional (solo si no hay skating activo, raro pero buenísimo)
      if (!state.skating && Math.random() < 0.08 && state.distance > 400) {
        state.skateboards.push({
          x: startX + groundW * 0.5,
          y: floorY() - 8,
          taken: false
        });
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
    kind: pickFruitKind(),
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
  state.player.attackTimer = 0.25;
  beep('hit');
  // tirar hacha de piedra con arco
  state.axes.push({
    x: state.scrollX + state.player.x + 14,
    y: state.player.y - 4,
    vx: 460,
    vy: -180,
    rot: 0,
    alive: true
  });
}

// ==================== Update ====================
function update(dt) {
  // skating boost + timer
  let speedMul = 1;
  if (state.skating) {
    state.skateTimer -= dt;
    speedMul = 1.55;
    if (state.skateTimer <= 0) state.skating = false;
  }
  // scroll
  state.scrollX += state.speed * speedMul * dt;
  state.distance += state.speed * speedMul * dt;
  state.speed = Math.min(RUN_SPEED * 1.7, RUN_SPEED + state.distance * 0.02);
  // generar mas mundo si hace falta
  generateAhead();
  // limpiar lo que ya quedo lejos detras
  state.ground = state.ground.filter(([a, b]) => b > state.scrollX - 200);
  state.pits = state.pits.filter(([a, b]) => b > state.scrollX - 200);
  state.enemies = state.enemies.filter(e => e.x > state.scrollX - 200 && e.alive);
  state.fruits = state.fruits.filter(f => f.x > state.scrollX - 200 && !f.taken);
  state.skateboards = state.skateboards.filter(sb => sb.x > state.scrollX - 200 && !sb.taken);
  state.axes = state.axes.filter(a => a.alive && a.x < state.scrollX + viewport.w + 80 && a.y < floorY() + 30);

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
        } else if (state.skating) {
          // la patineta absorbe el golpe: se rompe + matas al enemigo + brief invul
          state.skating = false;
          state.skateTimer = 0;
          e.alive = false;
          p.invul = 1.2;
          spawnParticles(p.x, p.y, 25, '#ffd75e');
          spawnParticles(p.x, p.y + 10, 10, '#cc2222');
          beep('hurt');
          break;
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

  // recolectar patinetas
  for (const sb of state.skateboards) {
    if (sb.taken) continue;
    const sx = sb.x - state.scrollX;
    if (Math.abs(sx - p.x) < 28 && Math.abs(sb.y - p.y) < 32) {
      sb.taken = true;
      state.skating = true;
      state.skateTimer = SKATE_DUR;
      spawnParticles(sx, sb.y, 24, '#ffd75e');
      beep('fruit');
    }
  }

  // mover hachas y detectar hits
  for (const a of state.axes) {
    if (!a.alive) continue;
    a.vy += GRAVITY * 0.55 * dt;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.rot += dt * 18;
    if (a.y > floorY() + 10) { a.alive = false; continue; }
    // hit enemies
    for (const e of state.enemies) {
      if (!e.alive) continue;
      if (Math.abs(a.x - e.x) < 16 && Math.abs(a.y - e.y) < 22) {
        e.alive = false;
        state.score += 100;
        spawnParticles(e.x - state.scrollX, e.y, 14, '#ffd75e');
        a.alive = false;
        beep('stomp');
        break;
      }
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

// ==================== Pixel art helpers ====================
const PIX = 3;  // tamaño base de cada "pixel" del sprite

function drawSprite(sprite, palette, x, y, scale = PIX, flipX = false) {
  // sprite: array de strings, palette: { 'k': '#000', ... }
  for (let row = 0; row < sprite.length; row++) {
    const line = sprite[row];
    for (let col = 0; col < line.length; col++) {
      const c = line[col];
      const color = palette[c];
      if (!color) continue;
      const px = flipX ? (line.length - 1 - col) : col;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * scale, y + row * scale, scale, scale);
    }
  }
}

// Paleta del héroe estilo Wonder Boy / Tom Tom
const HERO_PAL = {
  '.': null,
  'k': '#1a1208',     // outline
  'h': '#5a2010',     // pelo oscuro
  'H': '#c46818',     // pelo
  'r': '#8a1818',     // rojo oscuro (banda/short)
  'R': '#ee2828',     // rojo brillante
  's': '#fdc89a',     // piel clara
  'S': '#d68850',     // piel sombra
  'g': '#1a6010',     // verde oscuro
  'G': '#3aa028',     // verde
  'b': '#2030a0',     // azul oscuro
  'B': '#3868d8',     // azul brillante
  'y': '#fcd820',     // amarillo (taparrabos detalle)
  'w': '#ffffff'
};

// Hero en perfil lateral (mirando a la derecha). Wonderboy clásico.
// 14x18, paleta: H=pelo, r=rojo banda/oscuro, R=rojo brillante,
// s=piel, S=piel sombra, b=azul oscuro short, B=azul brillante,
// y=amarillo cinto, k=outline.

// Frame A: pie derecho adelante, brazo derecho atrás (corriendo)
const HERO_RUN_A = [
  "....HHHHHHk...",   // 0  pelo arriba
  "...HHHHHHHk...",   // 1
  "..krrrrrrHk...",   // 2  banda roja en la frente
  "...kssssss....",   // 3  cara - frente
  "....sksss.....",   // 4  ojo (k)
  "....sssss.....",   // 5  nariz
  "....k.ss......",   // 6  boca + chin
  "....ssss......",   // 7
  "...RRRRRs.....",   // 8  hombro y brazo delantero (s = mano)
  "..RRRRRRRs....",   // 9  torso
  ".sRRRRyRRR....",   // 10 brazo trasero atrás (s en izquierda) + cinturón
  ".sRRRRyRRR....",   // 11
  "..RRRRyRRR....",   // 12
  "...bbbbbb.....",   // 13 short
  "...bBBBBb.....",   // 14
  "....ss.ssss...",   // 15 piernas: derecha adelante extendida
  "....s..ss.s...",   // 16
  "....k.kk..k...",   // 17 pies
];

// Frame B: pie izquierdo adelante, brazo izquierdo atrás
const HERO_RUN_B = [
  "....HHHHHHk...",
  "...HHHHHHHk...",
  "..krrrrrrHk...",
  "...kssssss....",
  "....sksss.....",
  "....sssss.....",
  "....k.ss......",
  "....ssss......",
  "..sRRRRR......",   // brazo trasero (a la izquierda)
  ".sRRRRRRR.....",
  ".RRRRRyRRRRs..",   // brazo delantero adelante
  ".RRRRRyRRRRs..",
  "..RRRRyRRR....",
  "...bbbbbb.....",
  "...bBBBBb.....",
  "....ssss.ss...",   // pie izquierdo adelante
  "...ss.s..s....",
  "...kk..k.k....",
];

// Salto: ovillado, brazos arriba
const HERO_JUMP = [
  "....HHHHHHk...",
  "...HHHHHHHk...",
  "..krrrrrrHk...",
  "...kssssss....",
  "....sksss.....",
  "....sssss.....",
  "....k.ss......",
  "....sssss.....",
  "..sssssssss...",   // brazos extendidos hacia atrás y arriba
  "..RRRRRRRRRs..",
  ".RRRRRRyRRRRs.",
  ".RRRRRRyRRRRs.",
  "..RRRRRyRRR...",
  "...bbbbbb.....",
  "...bBBBBb.....",
  "....sssss.....",   // piernas dobladas
  ".....sss......",
  ".....kkk......",
];

// Ataque con hacha: brazo extendido hacia adelante con stone axe
const HERO_ATTACK = [
  "....HHHHHHk...",
  "...HHHHHHHk...",
  "..krrrrrrHk...",
  "...kssssss....",
  "....sksss.....",
  "....sssss.....",
  "....k.ss......",
  "....ssss......",
  "..RRRRRRs.....",
  ".RRRRRRRRsHHHH",  // brazo adelante + mango del hacha (HHHH)
  "RRRRRRyRRRsHHkk",// hacha al frente: H mango + kk piedra
  "RRRRRRyRRRsHkkk",
  ".RRRRRyRRR.kkk.",
  "..bbbbbb......",
  "..bBBBBb......",
  "...sssss......",
  "...ss..s......",
  "..kk...k......",
];

// Proyectil hacha (en vuelo)
const AXE_PROJECTILE = [
  "..k.....",
  ".HHk....",
  "HHkk....",
  ".HHkkkk.",
  ".HHk.kk.",
  "HHk..kk.",
  "kHHk....",
  "..kk....",
];
const AXE_PAL = {
  '.': null,
  'k': '#3a3a3a',     // piedra oscura (cabezal)
  'H': '#7a4828'      // mango madera
};

// ==================== Sprites de enemigos ====================
const ENEMY_PALETTES = {
  snail: { '.': null, 'k': '#1a1208', 'p': '#7a3a8a', 'P': '#b85ec8', 'y': '#fcd820', 'g': '#5a8030' },
  bee:   { '.': null, 'k': '#1a1208', 'y': '#fcd820', 'Y': '#fff860', 'w': '#ffffff', 'b': '#2030a0' },
  scorp: { '.': null, 'k': '#1a1208', 'r': '#8a1818', 'R': '#cc3030', 'y': '#fcd820' },
  crab:  { '.': null, 'k': '#1a1208', 'o': '#cc4818', 'O': '#ff8838', 'y': '#fcd820' }
};

const SNAIL_A = [
  "...........",
  "...kkk.....",
  "..kPPk.....",
  "..kPPk.....",
  "..kkk......",
  "kkkkkkkkk..",
  "kPPPPPPPk..",
  "kPpppppPk..",
  "kPpgggpPk..",
  "kPpgggpPk..",
  "kPppppPk...",
  ".kkkkkk....",
];

const SNAIL_B = [
  "...........",
  "....kkk....",
  "...kPPk....",
  "...kPPk....",
  "...kkk.....",
  ".kkkkkkkkk.",
  ".kPPPPPPPk.",
  ".kPpppppPk.",
  ".kPpgggpPk.",
  ".kPpgggpPk.",
  ".kPppppPk..",
  "..kkkkkk...",
];

const BEE_A = [
  "...kkkk....",
  "..kyyyyk...",
  ".kywwywwk..",
  "kyykyykyk..",  // ojos
  "kyyyyyyyk..",
  "kkkkkkkk...",
  ".kbbbbk....",
  ".kkkkk.....",
  "...kk......",
];

const BEE_B = [
  "...kkkk....",
  "..kyyyyk...",
  ".kywwywwk..",
  "kyykyykyk..",
  "kyyyyyyyk..",
  "kkkkkkkk...",
  ".kybybyk...",
  "..kkkk.....",
  "...kk......",
];

const SCORP = [
  "...........",
  "..k.....k..",
  ".kk.....kk.",
  "kkk.....kkk",
  "kRrkkkkkrRk",
  "kRRRRRRRRRk",
  "kRrrkrrkrRk",
  "kRRkRRRkRRk",
  "kkk.kkk.kkk",
  "k.k.....k.k",
  "k.k.....k.k",
];

const CRAB = [
  "...........",
  "...........",
  "kk.......kk",
  "kOk.....kOk",
  "kOOOOOOOOOk",
  "kOoooooooOk",
  "kOoyooooyOk",  // ojos amarillos
  "kOoooooooOk",
  "kOOOOOOOOOk",
  "kk.k.k.k.kk",
  ".k.k.k.k.k.",
];

// Frutas pixeladas
const FRUIT_PALS = {
  apple:  { '.': null, 'k': '#1a1208', 'r': '#8a1818', 'R': '#ee2828', 'g': '#1a6010', 'G': '#3aa028', 'w': '#ffffff' },
  banana: { '.': null, 'k': '#1a1208', 'y': '#cc8810', 'Y': '#fcd820', 'g': '#1a6010' },
  grape:  { '.': null, 'k': '#1a1208', 'p': '#5a2080', 'P': '#9450c8', 'g': '#1a6010' },
  peach:  { '.': null, 'k': '#1a1208', 'p': '#cc6868', 'P': '#ff9090', 'g': '#1a6010', 'G': '#3aa028' },
  cherry: { '.': null, 'k': '#1a1208', 'r': '#8a1818', 'R': '#ee2828', 'g': '#5a3010' }
};
const FRUIT_SPRITES = {
  apple: [
    "....g....",
    "....G....",
    "..kkkkk..",
    ".kRRRRRk.",
    "kRRRwRRRk",
    "kRRRRRRRk",
    "kRRrrRRRk",
    ".kRrrRRk.",
    "..kkkkk..",
  ],
  banana: [
    "...kkk...",
    "..kYYYk..",
    "..kYYYk..",
    ".kYYYY.k.",
    ".kyYYYy.k",
    ".kyyyyyk.",
    "..kkkkk..",
  ],
  grape: [
    "....g....",
    "...kPk...",
    "..kPPPk..",
    ".kPpPpPk.",
    "kPpPpPpPk",
    ".kPpPpk..",
    "..kPpk...",
    "...kk....",
  ],
  peach: [
    "...G.....",
    "..g......",
    ".kkkkk...",
    "kPPPPPk..",
    "kPpppPk..",
    "kPppPPk..",
    ".kPPPk...",
    "..kkk....",
  ],
  cherry: [
    "....g.g..",
    "...gg.g..",
    "..gkk.g..",
    ".kRRkkk..",
    "kRRRkRRk.",
    "kRrRkRRk.",
    ".kkkkRk..",
    "...kkkk..",
  ]
};

// ==================== Fondo tropical ====================
const palmTrees = [];
for (let i = 0; i < 10; i++) palmTrees.push({ x: rand(0, 4000), s: rand(0.7, 1.2), layer: rand() > 0.5 ? 1 : 2 });
function rand() { return Math.random(); }

const PALM_PAL = {
  '.': null,
  'k': '#1a1208',
  't': '#3a2010',
  'T': '#5a3010',
  'g': '#1a6010',
  'G': '#3aa028'
};
const PALM_SPRITE = [
  "....GGGGGGGGGGG....",
  "..GGggggggggggGG..",
  "GggggGGGGGGGGggggG",
  "GgggGGttttttGGgggG",
  ".GGgttTTTTTTtttGG.",
  "...GttTTTTTTtg....",
  "....ttTTTTTTtt....",
  "....tttTTtttt.....",
  "....TTttttTT......",
  ".....tTTtt........",
  ".....tTTtt........",
  ".....tTTTt........",
  ".....TTTTt........",
  ".....tTTTT........",
  ".....TTTTt........",
  ".....tTTTt........",
  ".....TTTTt........",
];

// ==================== Render ====================
function render() {
  ctx.clearRect(0, 0, viewport.w, viewport.h);
  drawSky();
  drawSun();
  drawMountainsParallax();
  drawPalmsParallax();
  drawTerrain();
  drawSkateboardPickups();
  drawFruits();
  drawEnemies();
  drawPlayer();
  drawAxes();
  drawParticles();
  drawSkateHud();
}

function drawSkateboardSprite(x, y, scale = 1) {
  // deck rojo con franjas
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x - 16 * scale, y - 4 * scale, 32 * scale, 5 * scale);
  ctx.fillStyle = '#ee3838';
  ctx.fillRect(x - 16 * scale, y - 4 * scale, 32 * scale, 1 * scale);
  ctx.fillStyle = '#a01a1a';
  ctx.fillRect(x - 16 * scale, y, 32 * scale, 1 * scale);
  // detalle: rayo amarillo en el centro
  ctx.fillStyle = '#fcd820';
  ctx.fillRect(x - 4 * scale, y - 3 * scale, 8 * scale, 2 * scale);
  // ruedas
  ctx.fillStyle = '#fcd820';
  ctx.beginPath();
  ctx.arc(x - 11 * scale, y + 4 * scale, 3.5 * scale, 0, Math.PI * 2);
  ctx.arc(x + 11 * scale, y + 4 * scale, 3.5 * scale, 0, Math.PI * 2);
  ctx.fill();
  // ejes
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(x - 12 * scale, y + 1 * scale, 4 * scale, 2 * scale);
  ctx.fillRect(x + 8 * scale, y + 1 * scale, 4 * scale, 2 * scale);
}

function drawSkateboardPickups() {
  for (const sb of state.skateboards) {
    if (sb.taken) continue;
    const x = sb.x - state.scrollX;
    if (x < -50 || x > viewport.w + 50) continue;
    const bob = Math.sin(performance.now() * 0.006 + sb.x * 0.02) * 3;
    // brillo
    if (Math.floor(performance.now() / 240) % 2 === 0) {
      ctx.fillStyle = 'rgba(255, 215, 94, 0.4)';
      ctx.beginPath();
      ctx.arc(x, sb.y + bob, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSkateboardSprite(x, sb.y + bob, 1);
    // estrella indicando que es pickup
    if (Math.floor(performance.now() / 200) % 2 === 0) {
      ctx.fillStyle = '#ffd75e';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('★', x, sb.y - 14 + bob);
    }
  }
}

function drawAxes() {
  for (const a of state.axes) {
    if (!a.alive) continue;
    const x = a.x - state.scrollX;
    const y = a.y;
    if (x < -20 || x > viewport.w + 20) continue;
    const sw = AXE_PROJECTILE[0].length * 2;
    const sh = AXE_PROJECTILE.length * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a.rot);
    drawSprite(AXE_PROJECTILE, AXE_PAL, -sw / 2, -sh / 2, 2);
    ctx.restore();
  }
}

function drawSkateHud() {
  if (!state.skating) return;
  // barra arriba a la izquierda mostrando tiempo restante
  const ratio = clamp(state.skateTimer / SKATE_DUR, 0, 1);
  const x = viewport.w / 2 - 60;
  const y = 12;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x, y, 120, 14);
  ctx.fillStyle = '#cc2222';
  ctx.fillRect(x + 1, y + 1, 118 * ratio, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('🛹 PATINETA', x + 60, y + 11);
}

function drawSky() {
  const grad = ctx.createLinearGradient(0, 0, 0, viewport.h);
  grad.addColorStop(0, '#ffb060');
  grad.addColorStop(0.4, '#ff8c64');
  grad.addColorStop(0.7, '#5ecdd8');
  grad.addColorStop(1, '#3a8aa0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewport.w, viewport.h * FLOOR_Y_RATIO);
}

function drawSun() {
  const t = performance.now() * 0.0005;
  const cx = viewport.w * 0.78;
  const cy = viewport.h * 0.22;
  const r = Math.min(viewport.w, viewport.h) * 0.13;
  // halo
  const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 2);
  halo.addColorStop(0, 'rgba(255, 240, 120, 0.5)');
  halo.addColorStop(1, 'rgba(255, 240, 120, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
  // sol con bandas (estilo retro)
  ctx.fillStyle = '#ffd820';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffaa20';
  for (let i = 0; i < 4; i++) {
    const y = cy + r * 0.2 + i * (r * 0.18);
    ctx.fillRect(cx - r * 0.95 + Math.abs(y - cy) * 0.1, y, r * 1.9 - Math.abs(y - cy) * 0.2, 4);
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountainsParallax() {
  ctx.fillStyle = 'rgba(122, 80, 110, 0.55)';
  const peaks = 5;
  const off = (state.scrollX * 0.15) % (viewport.w / peaks * 2);
  ctx.beginPath();
  ctx.moveTo(-100, viewport.h * FLOOR_Y_RATIO);
  for (let i = -1; i <= peaks + 1; i++) {
    const x = (i / peaks) * viewport.w * 1.6 - off;
    ctx.lineTo(x, viewport.h * 0.45);
    ctx.lineTo(x + viewport.w / peaks / 2, viewport.h * 0.32);
  }
  ctx.lineTo(viewport.w + 200, viewport.h * FLOOR_Y_RATIO);
  ctx.fill();
  // capa más cercana, más opaca y verde
  ctx.fillStyle = 'rgba(40, 90, 60, 0.7)';
  const peaks2 = 7;
  const off2 = (state.scrollX * 0.35) % (viewport.w / peaks2 * 2);
  ctx.beginPath();
  ctx.moveTo(-100, viewport.h * FLOOR_Y_RATIO);
  for (let i = -1; i <= peaks2 + 1; i++) {
    const x = (i / peaks2) * viewport.w * 1.4 - off2;
    ctx.lineTo(x, viewport.h * 0.6);
    ctx.lineTo(x + viewport.w / peaks2 / 2, viewport.h * 0.5);
  }
  ctx.lineTo(viewport.w + 200, viewport.h * FLOOR_Y_RATIO);
  ctx.fill();
}

function drawPalmsParallax() {
  const palmW = PALM_SPRITE[0].length * 4;
  const totalW = viewport.w * 1.5;
  for (const palm of palmTrees) {
    const speed = palm.layer === 1 ? 0.4 : 0.7;
    const sx = ((palm.x - state.scrollX * speed) % totalW + totalW) % totalW - palmW;
    if (sx < -palmW || sx > viewport.w + palmW) continue;
    const sy = viewport.h * FLOOR_Y_RATIO - PALM_SPRITE.length * 4 * palm.s + 8;
    drawSprite(PALM_SPRITE, PALM_PAL, sx, sy, 4 * palm.s);
  }
}

function drawTerrain() {
  const fy = floorY();
  // suelo principal
  const groundGrad = ctx.createLinearGradient(0, fy, 0, viewport.h);
  groundGrad.addColorStop(0, '#5a8030');
  groundGrad.addColorStop(0.3, '#3a5a20');
  groundGrad.addColorStop(1, '#2a3a18');
  for (const [a, b] of state.ground) {
    const x1 = a - state.scrollX;
    const x2 = b - state.scrollX;
    if (x2 < -20 || x1 > viewport.w + 20) continue;
    ctx.fillStyle = groundGrad;
    ctx.fillRect(x1, fy, x2 - x1, viewport.h - fy);
    // tope de pasto: bandas pixeladas
    ctx.fillStyle = '#7ac030';
    ctx.fillRect(x1, fy - 6, x2 - x1, 6);
    ctx.fillStyle = '#ade050';
    ctx.fillRect(x1, fy - 6, x2 - x1, 2);
    // tufos de pasto
    for (let gx = x1; gx < x2; gx += 28) {
      const gxw = gx + (state.scrollX * 0.0001 % 1) * 20;
      ctx.fillStyle = '#7ac030';
      ctx.fillRect(gxw + 4, fy - 10, 2, 4);
      ctx.fillRect(gxw + 6, fy - 8, 2, 2);
      ctx.fillRect(gxw + 8, fy - 10, 2, 4);
    }
    // piedras
    ctx.fillStyle = '#3a3a3a';
    for (let i = 0; i < 3; i++) {
      const rx = x1 + ((i * 80 + Math.floor(a / 50)) % (x2 - x1));
      if (rx > x1 + 20 && rx < x2 - 20) {
        ctx.fillRect(rx, fy + 12 + (i * 4), 8, 4);
        ctx.fillStyle = '#5a5a5a';
        ctx.fillRect(rx + 1, fy + 12 + (i * 4), 4, 2);
        ctx.fillStyle = '#3a3a3a';
      }
    }
  }
  // pozos
  for (const [a, b] of state.pits) {
    const x1 = a - state.scrollX;
    const x2 = b - state.scrollX;
    if (x2 < -20 || x1 > viewport.w + 20) continue;
    // gradiente oscuro hacia abajo
    const pitGrad = ctx.createLinearGradient(0, fy, 0, viewport.h);
    pitGrad.addColorStop(0, '#1a0a08');
    pitGrad.addColorStop(1, '#000000');
    ctx.fillStyle = pitGrad;
    ctx.fillRect(x1, fy, x2 - x1, viewport.h - fy);
    // bordes de tierra rocosa
    ctx.fillStyle = '#5a3018';
    ctx.fillRect(x1, fy, 6, 16);
    ctx.fillRect(x2 - 6, fy, 6, 16);
    ctx.fillStyle = '#7a4828';
    ctx.fillRect(x1, fy, 6, 4);
    ctx.fillRect(x2 - 6, fy, 6, 4);
  }
}

function drawFruits() {
  for (const f of state.fruits) {
    if (f.taken) continue;
    const fx = f.x - state.scrollX;
    if (fx < -40 || fx > viewport.w + 40) continue;
    const bob = Math.sin(performance.now() * 0.005 + f.x * 0.02) * 4;
    const sprite = FRUIT_SPRITES[f.kind.name];
    const pal = FRUIT_PALS[f.kind.name];
    if (sprite && pal) {
      const w = sprite[0].length * 4, h = sprite.length * 4;
      drawSprite(sprite, pal, fx - w / 2, f.y + bob - h / 2, 4);
    }
  }
}

function drawEnemies() {
  const t = performance.now() * 0.006;
  const fy = floorY();
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const ex = e.x - state.scrollX;
    if (ex < -40 || ex > viewport.w + 40) continue;
    // sombra
    if (!e.kind.hover) {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(ex, fy - 1, 22, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    let sprite, pal, scale = 3;
    const animTick = Math.floor(t + e.x * 0.01) % 2;
    switch (e.kind.name) {
      case 'snail':
        sprite = animTick ? SNAIL_A : SNAIL_B;
        pal = ENEMY_PALETTES.snail;
        break;
      case 'bee':
        sprite = animTick ? BEE_A : BEE_B;
        pal = ENEMY_PALETTES.bee;
        scale = 3;
        break;
      case 'scorp':
        sprite = SCORP;
        pal = ENEMY_PALETTES.scorp;
        break;
      case 'crab':
        sprite = CRAB;
        pal = ENEMY_PALETTES.crab;
        break;
    }
    if (sprite) {
      const w = sprite[0].length * scale, h = sprite.length * scale;
      drawSprite(sprite, pal, ex - w / 2, e.y - h / 2, scale, true);
    }
  }
}

function drawPlayer() {
  const p = state.player;
  const blink = p.invul > 0 && Math.floor(performance.now() / 80) % 2 === 0;
  if (blink) return;
  // sombra
  if (p.onGround) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, floorY() - 2, 16, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // elegir sprite
  let sprite;
  if (state.skating) {
    // En patineta: pose con piernas semi-flexionadas (uso JUMP que tiene piernas dobladas)
    sprite = HERO_JUMP;
  } else if (p.attackTimer > 0) {
    sprite = HERO_ATTACK;
  } else if (!p.onGround) {
    sprite = HERO_JUMP;
  } else {
    const tick = Math.floor(performance.now() * 0.012 * (state.speed / RUN_SPEED)) % 2;
    sprite = tick ? HERO_RUN_A : HERO_RUN_B;
  }
  const w = sprite[0].length * PIX, h = sprite.length * PIX;
  // si está en patineta, dibujamos primero la patineta y subimos al nene
  let yOffset = -6;
  if (state.skating) {
    drawSkateboardSprite(p.x, floorY() - 4, 1);
    yOffset = -16; // subimos al pibe encima de la deck
    // halo de velocidad detrás
    ctx.fillStyle = 'rgba(255, 215, 94, 0.4)';
    for (let i = 0; i < 3; i++) {
      const t = (performance.now() * 0.01 + i * 0.3) % 1;
      ctx.fillRect(p.x - 30 - t * 30, p.y - 8 + i * 6, 16, 2);
    }
  }
  drawSprite(sprite, HERO_PAL, p.x - w / 2, p.y - h / 2 + yOffset, PIX);
}

function drawParticles() {
  for (const pt of state.particles) {
    ctx.globalAlpha = clamp(pt.life * 1.5, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size, pt.y - pt.size, pt.size * 2, pt.size * 2);
  }
  ctx.globalAlpha = 1;
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
