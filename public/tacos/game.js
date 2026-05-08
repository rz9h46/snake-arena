// ==================== Taco Master ====================
// El cliente pide un taco con N ingredientes. Vos lo armás antes de que se le acabe la paciencia.

const INGREDIENTS = [
  { id: 'meat',    ico: '🥩', name: 'Carne' },
  { id: 'chicken', ico: '🍗', name: 'Pollo' },
  { id: 'lettuce', ico: '🥬', name: 'Lechuga' },
  { id: 'tomato',  ico: '🍅', name: 'Tomate' },
  { id: 'cheese',  ico: '🧀', name: 'Queso' },
  { id: 'onion',   ico: '🧅', name: 'Cebolla' },
  { id: 'salsa',   ico: '🌶️', name: 'Salsa' },
  { id: 'guac',    ico: '🥑', name: 'Guacamole' },
  { id: 'corn',    ico: '🌽', name: 'Choclo' },
  { id: 'beans',   ico: '🫘', name: 'Frijoles' }
];
const ING_BY_ID = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

const DRINKS = [
  { id: 'horchata', ico: '🥛', name: 'Horchata',  color: 0xf4e8d0 },
  { id: 'cola',     ico: '🥤', name: 'Refresco',  color: 0x3a1810 },
  { id: 'limonada', ico: '🍋', name: 'Limonada',  color: 0xfae040 },
  { id: 'jugo',     ico: '🧃', name: 'Jugo',      color: 0xff8838 },
  { id: 'agua',     ico: '💧', name: 'Agua',      color: 0xa8d6e6 },
  { id: 'cerveza',  ico: '🍺', name: 'Cerveza',   color: 0xf4c020 }
];
const DRINK_BY_ID = Object.fromEntries(DRINKS.map(d => [d.id, d]));

const CUSTOMERS = [
  { ico: '👨', name: 'Carlos' },
  { ico: '👩', name: 'María' },
  { ico: '🧑', name: 'Alex' },
  { ico: '👴', name: 'Don Pepe' },
  { ico: '👵', name: 'Doña Rosa' },
  { ico: '🧒', name: 'Ramoncito' },
  { ico: '👨‍🦰', name: 'Pedro' },
  { ico: '👩‍🦱', name: 'Laura' },
  { ico: '🧔', name: 'Juancho' },
  { ico: '👩‍🦳', name: 'Abuela Tina' },
  { ico: '🧑‍🎤', name: 'Rocco' },
  { ico: '👨‍💼', name: 'El Jefe' }
];

const state = {
  customer: null,
  taco: [],
  tacoDrink: null,    // id de la bebida que servís actualmente
  score: 0,
  combo: 1,
  level: 1,
  served: 0,
  lives: 3,
  alive: true,
  paused: false,
  best: parseInt(localStorage.getItem('tacos-best') || '0', 10),
  swapTimer: 0
};

// ==================== Helpers ====================
function rand(a, b) { return Math.random() * (b - a) + a; }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }

function makeOrder(level) {
  // wave 1: 2 ingredientes, +1 cada 2 niveles, max 5
  const num = Math.min(2 + Math.floor((level - 1) / 2), 5);
  const pool = INGREDIENTS.slice();
  const order = [];
  for (let i = 0; i < num; i++) {
    const idx = randInt(0, pool.length - 1);
    order.push(pool[idx].id);
    pool.splice(idx, 1);
  }
  return order;
}

function newCustomer() {
  const c = CUSTOMERS[randInt(0, CUSTOMERS.length - 1)];
  const order = makeOrder(state.level);
  // 75% de chance de pedir bebida (sube con el nivel)
  const drinkChance = Math.min(0.95, 0.65 + state.level * 0.04);
  const drink = Math.random() < drinkChance ? DRINKS[randInt(0, DRINKS.length - 1)].id : null;
  const maxPatience = Math.max(6, 14 - (state.level - 1) * 0.6) * 1000;
  state.customer = {
    ico: c.ico,
    name: c.name,
    order,
    drink,
    patience: maxPatience,
    maxPatience,
    served: false
  };
  state.taco = [];
  state.tacoDrink = null;
  clearTaco3D();
  removeDrink3D();
  spawnShell();
  renderCustomer(true);
  renderTaco();
  renderIngredients();
}

function addIngredient(id) {
  if (!state.alive || state.paused || !state.customer || state.customer.served) return;
  if (state.taco.includes(id)) return;
  // si NO está en la orden: rechazar inmediatamente (no se agrega)
  if (!state.customer.order.includes(id)) {
    state.score = Math.max(0, state.score - 5);
    state.combo = 1;
    flashFeedback('😬 No pidió eso!', '#ff5e7a');
    beep('wrong');
    return;
  }
  state.taco.push(id);
  beep('add');
  renderTaco();
  renderIngredients();
  if (matchesOrder()) {
    setTimeout(() => { if (!state.customer.served) serve(); }, 350);
  }
}

function toggleDrink(id) {
  if (!state.alive || state.paused || !state.customer || state.customer.served) return;
  // si pidió otra bebida, advertir
  if (state.customer.drink && state.customer.drink !== id) {
    if (!state.tacoDrink) {
      // marca de penalización suave (no resta hasta servir)
      flashFeedback('🥤 No es esa bebida', '#ff5e7a');
      beep('wrong');
    }
  }
  if (state.tacoDrink === id) {
    state.tacoDrink = null;
    removeDrink3D();
  } else {
    state.tacoDrink = id;
    placeDrink3D(id);
  }
  beep('add');
  renderCustomer();
  renderIngredients();
  if (matchesOrder()) {
    setTimeout(() => { if (!state.customer.served) serve(); }, 350);
  }
}

function removeIngredient(id) {
  if (!state.customer || state.customer.served) return;
  state.taco = state.taco.filter(i => i !== id);
  renderTaco();
  renderIngredients();
}

function clearTaco() {
  if (!state.customer || state.customer.served) return;
  state.taco = [];
  renderTaco();
  renderIngredients();
}

function matchesOrder() {
  if (!state.customer) return false;
  // ingredientes
  const orderSet = new Set(state.customer.order);
  const tacoSet = new Set(state.taco);
  if (state.taco.length !== state.customer.order.length) return false;
  for (const i of state.customer.order) if (!tacoSet.has(i)) return false;
  for (const i of state.taco) if (!orderSet.has(i)) return false;
  // bebida
  if ((state.customer.drink || null) !== (state.tacoDrink || null)) return false;
  return true;
}

function serve() {
  if (!state.customer || state.customer.served) return;
  const ok = matchesOrder();
  state.customer.served = true;
  if (ok) {
    const speedRatio = state.customer.patience / state.customer.maxPatience;
    const speedBonus = Math.floor(speedRatio * 80);
    const basePoints = 50 + state.customer.order.length * 10;
    const points = (basePoints + speedBonus) * state.combo;
    state.score += points;
    state.combo++;
    state.served++;
    flashFeedback(`+${points}  ${state.combo > 2 ? '🔥×' + (state.combo - 1) + '!' : '😋 Bueno!'}`, '#5fbb40');
    beep('happy');
    setHappyFace();
    flyAwayTaco();          // ✨ taco vuela con chispas hacia el cliente
    // sube nivel cada 5 servidos
    if (state.served % 5 === 0) state.level++;
  } else {
    state.combo = 1;
    state.lives--;
    flashFeedback('🤬 ¡No era así!', '#ff5e7a');
    beep('wrong');
    setSadFace();
  }
  // siguiente cliente luego de breve pausa
  setTimeout(() => {
    if (!state.alive) { gameOver(); return; }
    if (state.lives <= 0) { state.alive = false; gameOver(); return; }
    newCustomer();
  }, 900);
}

function customerLeft() {
  if (!state.customer || state.customer.served) return;
  state.customer.served = true;
  state.lives--;
  state.combo = 1;
  flashFeedback('💢 Se fue enojado', '#ff5e7a');
  beep('angry');
  setSadFace();
  setTimeout(() => {
    if (state.lives <= 0) { state.alive = false; gameOver(); return; }
    newCustomer();
  }, 900);
}

function gameOver() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('tacos-best', state.best);
  }
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-served').textContent = state.served;
  document.getElementById('go-level').textContent = state.level;
  document.getElementById('go-best').textContent = state.best;
  document.getElementById('go-title').textContent = state.served > 20 ? '🏆 Gran turno' : (state.served > 10 ? '👍 Bien' : 'Cerró el local 🪦');
  document.getElementById('gameover').classList.remove('hidden');
}

// ==================== Three.js 3D scene ====================
let scene3d, camera3d, renderer3d;
let tacoShellMesh = null;
const ingredientMeshes = new Map(); // id -> Group
const meshPool = [];                // mallas en remoción/animación

function init3D() {
  if (typeof THREE === 'undefined') { console.warn('Three.js no cargó'); return; }
  const canvas = document.getElementById('taco-3d');
  scene3d = new THREE.Scene();
  scene3d.background = new THREE.Color(0x1a0e08);
  scene3d.fog = new THREE.Fog(0x1a0e08, 8, 16);

  const w = canvas.clientWidth || 600;
  const h = canvas.clientHeight || 260;
  camera3d = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
  // ángulo más cenital para ver la tortilla flat con todo arriba (estilo Cooking Fever)
  camera3d.position.set(0, 4.2, 3.4);
  camera3d.lookAt(0, -0.95, 0);

  renderer3d = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer3d.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer3d.setSize(w, h, false);
  renderer3d.shadowMap.enabled = true;
  renderer3d.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer3d.outputEncoding = THREE.sRGBEncoding || 3001;

  // Luces cálidas estilo cocina mexicana
  scene3d.add(new THREE.AmbientLight(0xfff5d6, 0.55));
  const key = new THREE.DirectionalLight(0xfff0bb, 1.4);
  key.position.set(3, 6, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 4;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
  key.shadow.radius = 4;
  scene3d.add(key);
  const fill = new THREE.PointLight(0xff8c1a, 0.6, 14, 2);
  fill.position.set(-3, 2, 1);
  scene3d.add(fill);
  const rim = new THREE.PointLight(0xffce5a, 0.4, 12, 2);
  rim.position.set(2, 1, -3);
  scene3d.add(rim);

  // Mesa de madera
  const tableGeom = new THREE.CircleGeometry(8, 36);
  const tableMat = new THREE.MeshStandardMaterial({ color: 0x6a3818, roughness: 0.85, metalness: 0 });
  const table = new THREE.Mesh(tableGeom, tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -1.25;
  table.receiveShadow = true;
  scene3d.add(table);
  // mantel circular (para diferenciar)
  const matGeom = new THREE.RingGeometry(2.6, 3.2, 32);
  const matMat = new THREE.MeshStandardMaterial({ color: 0xcc4828, roughness: 0.7, side: THREE.DoubleSide });
  const tableMatRing = new THREE.Mesh(matGeom, matMat);
  tableMatRing.rotation.x = -Math.PI / 2;
  tableMatRing.position.y = -1.249;
  tableMatRing.receiveShadow = true;
  scene3d.add(tableMatRing);

  // Plato blanco
  const plateGeom = new THREE.CylinderGeometry(2.0, 2.1, 0.12, 36);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xefefef, roughness: 0.4, metalness: 0.05 });
  const plate = new THREE.Mesh(plateGeom, plateMat);
  plate.position.y = -1.18;
  plate.receiveShadow = true;
  plate.castShadow = true;
  scene3d.add(plate);

  // Borde del plato
  const plateRim = new THREE.Mesh(
    new THREE.TorusGeometry(2.0, 0.08, 8, 32),
    new THREE.MeshStandardMaterial({ color: 0xdadada, roughness: 0.4 })
  );
  plateRim.rotation.x = Math.PI / 2;
  plateRim.position.y = -1.12;
  scene3d.add(plateRim);

  // El shell aparece cuando llega cada cliente (spawnShell)

  window.addEventListener('resize', resize3D);
  resize3D();
}

// Lista de objetos en animación de salida (fly-away al servir)
const flyingItems = [];
// Chispas al servir
const sparkles = [];
// Vaso de bebida actualmente servido (si hay)
let drinkMesh = null;

function spawnShell() {
  if (!scene3d) return;
  // si quedó uno por error, removerlo
  if (tacoShellMesh) {
    scene3d.remove(tacoShellMesh);
    disposeMesh(tacoShellMesh);
    tacoShellMesh = null;
  }
  tacoShellMesh = buildTacoShell();
  tacoShellMesh.position.y = 3.5;
  tacoShellMesh.userData.dropping = true;
  tacoShellMesh.userData.targetY = -0.95;   // tortilla plana sobre el plato
  tacoShellMesh.userData.vy = 0;
  scene3d.add(tacoShellMesh);
  // pulso de luz cuando aterriza? lo dejamos solo el bounce
}

function flyAwayTaco() {
  if (!scene3d) return;
  // chispas en la posición del shell
  spawnSparkles(0, -0.1, 0);
  // empezar fly-away del shell + ingredientes + bebida
  const items = [];
  if (tacoShellMesh) items.push(tacoShellMesh);
  if (drinkMesh) items.push(drinkMesh);
  for (const m of ingredientMeshes.values()) items.push(m);
  for (const m of items) {
    m.userData.flying = true;
    m.userData.flyT = 0;
    m.userData.flyDur = 0.75;
    m.userData.startX = m.position.x;
    m.userData.startY = m.position.y;
    m.userData.startZ = m.position.z;
    m.userData.flyDir = 1; // a la derecha
    m.userData.flySpinX = (Math.random() - 0.5) * 8;
    m.userData.flySpinY = (Math.random() - 0.5) * 6;
    m.userData.flySpinZ = 4 + Math.random() * 4;
    flyingItems.push(m);
  }
  tacoShellMesh = null;
  drinkMesh = null;
  ingredientMeshes.clear();
}

function spawnSparkles(cx, cy, cz) {
  if (!scene3d) return;
  const colors = [0xffd75e, 0xfff5a8, 0xffb35e, 0xff5e7a];
  for (let i = 0; i < 26; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.05 + Math.random() * 0.05, 6, 5),
      new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 1
      })
    );
    m.position.set(cx + (Math.random() - 0.5) * 0.6, cy, cz + (Math.random() - 0.5) * 0.6);
    const ang = Math.random() * Math.PI * 2;
    const elev = Math.random() * Math.PI * 0.6 + 0.2;  // hacia arriba
    const speed = 3 + Math.random() * 3;
    m.userData.vx = Math.cos(ang) * Math.cos(elev) * speed;
    m.userData.vy = Math.sin(elev) * speed + 1.5;
    m.userData.vz = Math.sin(ang) * Math.cos(elev) * speed;
    m.userData.life = 0.7 + Math.random() * 0.3;
    m.userData.maxLife = m.userData.life;
    sparkles.push(m);
    scene3d.add(m);
  }
}

// ==================== Bebida 3D (vaso al lado del taco) ====================
function buildDrink(drinkId) {
  const drink = DRINK_BY_ID[drinkId];
  if (!drink) return null;
  const group = new THREE.Group();
  // vaso (transparente con tinte)
  const glassGeom = new THREE.CylinderGeometry(0.18, 0.16, 0.55, 18, 1, true);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xeaf6ff, transparent: true, opacity: 0.4,
    roughness: 0.1, metalness: 0.1, side: THREE.DoubleSide
  });
  const glass = new THREE.Mesh(glassGeom, glassMat);
  glass.castShadow = true;
  group.add(glass);
  // borde superior del vaso
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.18, 0.012, 6, 18),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.275;
  group.add(rim);
  // base del vaso
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18),
    new THREE.MeshStandardMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.5 })
  );
  base.position.y = -0.275;
  group.add(base);
  // líquido (cilindro coloreado dentro)
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.165, 0.148, 0.45, 18),
    new THREE.MeshStandardMaterial({ color: drink.color, roughness: 0.4, metalness: 0 })
  );
  liquid.position.y = -0.04;
  liquid.castShadow = true;
  group.add(liquid);
  // burbujitas si es cola/cerveza/limonada
  if (drinkId === 'cola' || drinkId === 'cerveza' || drinkId === 'limonada') {
    for (let i = 0; i < 5; i++) {
      const bub = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 6, 4),
        new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      bub.position.set(
        (Math.random() - 0.5) * 0.2, rand(-0.15, 0.15), (Math.random() - 0.5) * 0.2
      );
      group.add(bub);
    }
  }
  // pajita roja
  const straw = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.02, 0.85, 6),
    new THREE.MeshStandardMaterial({ color: 0xff5e7a, roughness: 0.4 })
  );
  straw.position.set(0.08, 0.18, 0);
  straw.rotation.z = 0.18;
  straw.castShadow = true;
  group.add(straw);
  // hielo si agua/limonada/jugo
  if (drinkId === 'agua' || drinkId === 'limonada' || drinkId === 'jugo') {
    for (let i = 0; i < 3; i++) {
      const ice = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, 0.07),
        new THREE.MeshStandardMaterial({
          color: 0xddf0ff, transparent: true, opacity: 0.7, roughness: 0.2
        })
      );
      ice.position.set(rand(-0.08, 0.08), 0.1 + i * 0.02, rand(-0.08, 0.08));
      ice.rotation.set(Math.random(), Math.random(), Math.random());
      group.add(ice);
    }
  }
  return group;
}

function rand(a, b) { return Math.random() * (b - a) + a; }

function placeDrink3D(drinkId) {
  if (!scene3d) return;
  removeDrink3D(true);
  drinkMesh = buildDrink(drinkId);
  if (!drinkMesh) return;
  // a la derecha de la tortilla, sentado en el plato
  drinkMesh.position.set(1.95, 2.5, 0.1);
  drinkMesh.userData.targetY = -0.6;
  drinkMesh.userData.dropping = true;
  drinkMesh.userData.vy = 0;
  scene3d.add(drinkMesh);
}

function removeDrink3D(immediate = false) {
  if (!drinkMesh) return;
  if (immediate) {
    scene3d.remove(drinkMesh);
    disposeMesh(drinkMesh);
  } else {
    drinkMesh.userData.removing = true;
    drinkMesh.userData.vy = 4;
    drinkMesh.userData.life = 0.6;
    meshPool.push(drinkMesh);
  }
  drinkMesh = null;
}

function resize3D() {
  if (!renderer3d) return;
  const canvas = document.getElementById('taco-3d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
  renderer3d.setSize(w, h, false);
}

function buildTacoShell() {
  // Tortilla PLANA estilo Cooking Fever: disco delgado, dorada con manchitas tostadas
  const group = new THREE.Group();
  const r = 1.6;
  const thickness = 0.08;
  // disco principal
  const geom = new THREE.CylinderGeometry(r, r, thickness, 36);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfcd896,
    roughness: 0.75,
    metalness: 0
  });
  const tortilla = new THREE.Mesh(geom, mat);
  tortilla.castShadow = true;
  tortilla.receiveShadow = true;
  group.add(tortilla);
  // borde dorado tostado
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.05, 6, 32),
    new THREE.MeshStandardMaterial({ color: 0xd4a050, roughness: 0.65 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = thickness / 2 - 0.005;
  group.add(ring);
  // manchitas tostadas arriba (puntos oscuros tipo "burned spots")
  for (let i = 0; i < 14; i++) {
    const spotR = 0.06 + Math.random() * 0.05;
    const sp = new THREE.Mesh(
      new THREE.CircleGeometry(spotR, 8),
      new THREE.MeshStandardMaterial({ color: 0xb47020, roughness: 0.7 })
    );
    sp.rotation.x = -Math.PI / 2;
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * (r - 0.15);
    sp.position.set(Math.cos(ang) * dist, thickness / 2 + 0.001, Math.sin(ang) * dist);
    group.add(sp);
  }
  // pequeñas burbujas en la masa
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Mesh(
      new THREE.SphereGeometry(0.04, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xfae5b0, roughness: 0.6 })
    );
    const ang = Math.random() * Math.PI * 2;
    const dist = Math.random() * (r - 0.2);
    sp.position.set(Math.cos(ang) * dist, thickness / 2, Math.sin(ang) * dist);
    sp.scale.set(1, 0.4, 1);
    group.add(sp);
  }
  group.position.y = -0.95;   // sentada en el plato
  return group;
}

function buildIngredient(id) {
  const group = new THREE.Group();
  group.userData.id = id;
  // Escala global para que los ingredientes se vean prominentes desde la cámara cenital
  group.scale.set(1.55, 1.55, 1.55);
  const addMesh = (geom, color, opts = {}) => {
    const mat = new THREE.MeshStandardMaterial({
      color, roughness: opts.roughness ?? 0.55, metalness: opts.metalness ?? 0,
      flatShading: opts.flatShading ?? false
    });
    const m = new THREE.Mesh(geom, mat);
    m.castShadow = true;
    if (opts.position) m.position.set(...opts.position);
    if (opts.rotation) m.rotation.set(...opts.rotation);
    if (opts.scale) m.scale.set(...opts.scale);
    group.add(m);
    return m;
  };
  switch (id) {
    case 'meat':
      addMesh(new THREE.BoxGeometry(0.42, 0.18, 0.32), 0x8a3a18, { roughness: 0.6 });
      addMesh(new THREE.BoxGeometry(0.36, 0.06, 0.26), 0x6a2810, { position: [0, 0.11, 0] });
      // chunks chiquitos
      for (let i = 0; i < 3; i++) {
        addMesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), 0x5a2008, {
          position: [(Math.random() - 0.5) * 0.3, 0.13, (Math.random() - 0.5) * 0.2]
        });
      }
      break;
    case 'chicken':
      addMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.34, 14), 0xd8a050, {
        roughness: 0.55, rotation: [0, 0, Math.PI / 2]
      });
      addMesh(new THREE.SphereGeometry(0.05, 6, 4), 0xc88040, {
        position: [0.1, 0.07, 0.05]
      });
      break;
    case 'lettuce': {
      const geom = new THREE.IcosahedronGeometry(0.24, 1);
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const v = new THREE.Vector3(x, y, z);
        const noise = 0.07 * Math.sin(v.x * 8 + v.y * 5) * Math.cos(v.y * 7 + v.z * 4);
        v.normalize().multiplyScalar(0.24 + noise);
        pos.setXYZ(i, v.x, v.y * 0.7, v.z);
      }
      geom.computeVertexNormals();
      addMesh(geom, 0x5fbb40, { roughness: 0.6, flatShading: true });
      // un par de hojitas más
      for (let i = 0; i < 2; i++) {
        const g2 = new THREE.IcosahedronGeometry(0.1, 0);
        addMesh(g2, 0x7fd550, {
          position: [(Math.random() - 0.5) * 0.3, 0.05 + Math.random() * 0.05, (Math.random() - 0.5) * 0.2],
          flatShading: true
        });
      }
      break;
    }
    case 'tomato': {
      // 2 rodajas de tomate (slices) — se ven mucho mejor desde arriba
      for (let s = 0; s < 2; s++) {
        const ox = s === 0 ? -0.08 : 0.08;
        const oz = s === 0 ? 0.05 : -0.05;
        addMesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 16), 0xe63946, {
          position: [ox, s * 0.06, oz], roughness: 0.4
        });
        addMesh(new THREE.CylinderGeometry(0.10, 0.10, 0.04, 16), 0xff7a87, {
          position: [ox, s * 0.06 + 0.04, oz]
        });
        // semillitas
        for (let i = 0; i < 5; i++) {
          const ang = (i / 5) * Math.PI * 2;
          addMesh(new THREE.SphereGeometry(0.012, 4, 3), 0xfae8a8, {
            position: [ox + Math.cos(ang) * 0.06, s * 0.06 + 0.05, oz + Math.sin(ang) * 0.06]
          });
        }
      }
      break;
    }
    case 'cheese': {
      // queso rallado: tiritas amarillas
      for (let i = 0; i < 8; i++) {
        const ang = Math.random() * Math.PI * 2;
        addMesh(new THREE.BoxGeometry(0.04, 0.025, 0.18 + Math.random() * 0.08), 0xfcd820, {
          position: [(Math.random() - 0.5) * 0.3, 0.02 + Math.random() * 0.04, (Math.random() - 0.5) * 0.3],
          rotation: [0, ang, 0], roughness: 0.45
        });
      }
      // un par de tiritas mas claras
      for (let i = 0; i < 3; i++) {
        addMesh(new THREE.BoxGeometry(0.04, 0.022, 0.16), 0xffe65e, {
          position: [(Math.random() - 0.5) * 0.3, 0.04, (Math.random() - 0.5) * 0.3],
          rotation: [0, Math.random() * Math.PI * 2, 0]
        });
      }
      break;
    }
    case 'onion': {
      // 2 anillos de cebolla (tipo torus) — se reconocen al toque
      for (let i = 0; i < 2; i++) {
        addMesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), 0xf4ecd8, {
          position: [(i - 0.5) * 0.2, 0.04, (i - 0.5) * 0.1],
          rotation: [Math.PI / 2 + (i * 0.2), 0, 0],
          roughness: 0.45
        });
        addMesh(new THREE.TorusGeometry(0.09, 0.022, 6, 14), 0xfff5e0, {
          position: [(i - 0.5) * 0.2, 0.045, (i - 0.5) * 0.1],
          rotation: [Math.PI / 2 + (i * 0.2), 0, 0]
        });
      }
      break;
    }
    case 'salsa':
      addMesh(new THREE.SphereGeometry(0.22, 14, 10), 0xcc1818, {
        scale: [1, 0.22, 1], roughness: 0.25
      });
      // brillo / chispa
      addMesh(new THREE.SphereGeometry(0.04, 6, 5), 0xff5050, {
        position: [0.1, 0.02, 0.05], roughness: 0.2
      });
      break;
    case 'guac':
      addMesh(new THREE.SphereGeometry(0.18, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0x6a8a30, {
        roughness: 0.45
      });
      addMesh(new THREE.SphereGeometry(0.06, 6, 4), 0x8aaa50, {
        position: [-0.05, 0.04, 0.06]
      });
      break;
    case 'corn':
      addMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.32, 14), 0xfcd820, {
        rotation: [0, 0, Math.PI / 2]
      });
      // granitos
      for (let i = 0; i < 4; i++) {
        addMesh(new THREE.SphereGeometry(0.025, 6, 4), 0xfff060, {
          position: [(i - 1.5) * 0.07, 0.07, 0]
        });
      }
      break;
    case 'beans':
      for (let i = 0; i < 6; i++) {
        addMesh(new THREE.SphereGeometry(0.06, 8, 6), 0x5a3010, {
          scale: [1, 0.6, 1.5],
          position: [(Math.random() - 0.5) * 0.3, 0.04, (Math.random() - 0.5) * 0.2],
          rotation: [0, Math.random() * Math.PI, 0],
          roughness: 0.5
        });
      }
      break;
  }
  return group;
}

// Slots fijos sobre la tortilla (vista cenital). Cada ingrediente que
// entra ocupa el primer slot vacío, cuando se va el slot queda libre.
// Distribuidos en círculo + uno al centro para que se vean todos.
const TACO_SLOTS = [
  { x:  0.0,   z:  0.0  },   // centro
  { x: -0.75,  z: -0.15 },   // izquierda
  { x:  0.75,  z: -0.15 },   // derecha
  { x: -0.45,  z:  0.55 },   // abajo izq
  { x:  0.45,  z:  0.55 },   // abajo der
  { x:  0.0,   z: -0.7  },   // arriba
  { x: -0.7,   z:  0.7  },   // extra
  { x:  0.7,   z:  0.7  }
];

function findFreeSlot() {
  const used = new Set();
  for (const m of ingredientMeshes.values()) {
    if (m.userData.slotIdx !== undefined) used.add(m.userData.slotIdx);
  }
  for (let i = 0; i < TACO_SLOTS.length; i++) {
    if (!used.has(i)) return i;
  }
  return 0;
}

function placeIngredient3D(id) {
  if (!scene3d) return;
  const slotIdx = findFreeSlot();
  const slot = TACO_SLOTS[slotIdx];
  const mesh = buildIngredient(id);
  mesh.userData.slotIdx = slotIdx;
  // empieza arriba, cae al slot
  mesh.position.set(slot.x, 2.5, slot.z);
  mesh.userData.targetY = -0.78;     // sentado prominente encima de la tortilla
  mesh.userData.dropping = true;
  mesh.userData.vy = 0;
  mesh.rotation.y = Math.random() * Math.PI * 2;
  scene3d.add(mesh);
  ingredientMeshes.set(id, mesh);
}

function removeIngredient3D(id) {
  const mesh = ingredientMeshes.get(id);
  if (!mesh) return;
  ingredientMeshes.delete(id);
  mesh.userData.removing = true;
  mesh.userData.vy = 4;
  mesh.userData.life = 0.6;
  meshPool.push(mesh);
}

function clearTaco3D() {
  for (const [id, mesh] of ingredientMeshes) {
    mesh.userData.removing = true;
    mesh.userData.vy = 5 + Math.random() * 2;
    mesh.userData.life = 0.5;
    mesh.userData.spinAxis = new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize();
    meshPool.push(mesh);
  }
  ingredientMeshes.clear();
}

function disposeMesh(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

function update3D(dt) {
  if (!scene3d) return;
  // rotación sutil del shell mientras está quieto
  if (tacoShellMesh && !tacoShellMesh.userData.dropping) {
    tacoShellMesh.rotation.y = Math.sin(performance.now() * 0.0006) * 0.04;
  }

  // drop-in del shell
  if (tacoShellMesh && tacoShellMesh.userData.dropping) {
    const m = tacoShellMesh;
    m.userData.vy = (m.userData.vy || 0) - 18 * dt;
    m.position.y += m.userData.vy * dt;
    m.rotation.y += dt * 1.2;
    if (m.position.y <= m.userData.targetY) {
      m.position.y = m.userData.targetY;
      if (Math.abs(m.userData.vy) < 1.5) {
        m.userData.dropping = false;
        m.userData.vy = 0;
        m.rotation.y = 0;
      } else {
        m.userData.vy = -m.userData.vy * 0.4;
      }
    }
  }

  // drop-in del vaso de bebida
  if (drinkMesh && drinkMesh.userData.dropping) {
    const m = drinkMesh;
    m.userData.vy = (m.userData.vy || 0) - 18 * dt;
    m.position.y += m.userData.vy * dt;
    if (m.position.y <= m.userData.targetY) {
      m.position.y = m.userData.targetY;
      if (Math.abs(m.userData.vy) < 1.5) {
        m.userData.dropping = false;
        m.userData.vy = 0;
      } else {
        m.userData.vy = -m.userData.vy * 0.4;
      }
    }
  }

  // dropping de ingredientes
  for (const [, mesh] of ingredientMeshes) {
    if (mesh.userData.dropping) {
      const dy = (mesh.userData.targetY - mesh.position.y);
      mesh.userData.vy = (mesh.userData.vy || 0) - 18 * dt;
      mesh.position.y += mesh.userData.vy * dt;
      mesh.rotation.y += dt * 2;
      if (mesh.position.y <= mesh.userData.targetY) {
        mesh.position.y = mesh.userData.targetY;
        if (Math.abs(mesh.userData.vy) < 1.5) {
          mesh.userData.dropping = false;
          mesh.userData.vy = 0;
        } else {
          mesh.userData.vy = -mesh.userData.vy * 0.35;
        }
      }
    }
  }

  // remoción individual de ingredientes (al sacar uno equivocado)
  for (let i = meshPool.length - 1; i >= 0; i--) {
    const m = meshPool[i];
    m.userData.life -= dt;
    m.position.y += (m.userData.vy || 4) * dt;
    m.userData.vy = (m.userData.vy || 4) - 18 * dt;
    if (m.userData.spinAxis) m.rotateOnAxis(m.userData.spinAxis, dt * 8);
    else { m.rotation.y += dt * 6; m.rotation.x += dt * 4; }
    if (m.userData.life <= 0) {
      scene3d.remove(m);
      disposeMesh(m);
      meshPool.splice(i, 1);
    }
  }

  // fly-away del taco completo (al servir bien)
  for (let i = flyingItems.length - 1; i >= 0; i--) {
    const m = flyingItems[i];
    m.userData.flyT += dt;
    const t = m.userData.flyT / m.userData.flyDur;
    if (t >= 1) {
      scene3d.remove(m);
      disposeMesh(m);
      flyingItems.splice(i, 1);
      continue;
    }
    // arco hacia la derecha y arriba, después cae afuera de pantalla
    m.position.x = m.userData.startX + m.userData.flyDir * t * 9;
    m.position.y = m.userData.startY + Math.sin(t * Math.PI * 0.85) * 2.2 - t * 1.5;
    m.position.z = m.userData.startZ;
    m.rotation.x += m.userData.flySpinX * dt;
    m.rotation.y += m.userData.flySpinY * dt;
    m.rotation.z += m.userData.flySpinZ * dt;
    const scale = Math.max(0.2, 1 - t * 0.5);
    m.scale.set(scale, scale, scale);
  }

  // chispas
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    s.position.x += s.userData.vx * dt;
    s.position.y += s.userData.vy * dt;
    s.position.z += s.userData.vz * dt;
    s.userData.vy -= 8 * dt;
    s.userData.vx *= 0.96;
    s.userData.vz *= 0.96;
    s.userData.life -= dt;
    if (s.material && s.material.opacity !== undefined) {
      s.material.opacity = Math.max(0, s.userData.life / s.userData.maxLife);
    }
    if (s.userData.life <= 0) {
      scene3d.remove(s);
      disposeMesh(s);
      sparkles.splice(i, 1);
    }
  }
}

function render3D() {
  if (!renderer3d) return;
  renderer3d.render(scene3d, camera3d);
}

// ==================== Render ====================
const customerFace = document.getElementById('customer-face');
const customerName = document.getElementById('customer-name');
const customerOrderEl = document.getElementById('customer-order');
const patienceFill = document.getElementById('patience-fill');
const ingredientsGrid = document.getElementById('ingredients-grid');
const drinksGrid = document.getElementById('drinks-grid');

function renderCustomer(animate = false) {
  if (!state.customer) {
    customerFace.textContent = '🚪';
    customerName.textContent = '...';
    customerOrderEl.innerHTML = '';
    patienceFill.style.width = '0%';
    return;
  }
  customerFace.textContent = state.customer.ico;
  customerName.textContent = state.customer.name;
  if (animate) {
    customerFace.classList.remove('happy', 'sad', 'entering');
    void customerFace.offsetWidth;
    customerFace.classList.add('entering');
  }
  customerOrderEl.innerHTML = '';
  for (const id of state.customer.order) {
    const ing = ING_BY_ID[id];
    const div = document.createElement('div');
    div.className = 'order-ing' + (state.taco.includes(id) ? ' have' : '');
    div.textContent = ing.ico;
    div.title = ing.name;
    customerOrderEl.appendChild(div);
  }
  // bebida pedida (si hay)
  if (state.customer.drink) {
    const sep = document.createElement('span');
    sep.className = 'order-plus';
    sep.textContent = '+';
    customerOrderEl.appendChild(sep);
    const d = DRINK_BY_ID[state.customer.drink];
    const div = document.createElement('div');
    div.className = 'order-ing' + (state.tacoDrink === d.id ? ' have' : '');
    div.textContent = d.ico;
    div.title = d.name;
    customerOrderEl.appendChild(div);
  }
}

function renderDrinks() {
  drinksGrid.innerHTML = '';
  DRINKS.forEach((drink) => {
    const btn = document.createElement('button');
    btn.className = 'drink-btn' + (state.tacoDrink === drink.id ? ' added' : '');
    btn.innerHTML = `<span class="ico">${drink.ico}</span><span class="nm">${drink.name}</span>`;
    btn.addEventListener('click', () => toggleDrink(drink.id));
    drinksGrid.appendChild(btn);
  });
}

function renderTaco() {
  // Sync 3D scene con state.taco
  const tacoSet = new Set(state.taco);
  // remover los que ya no están
  for (const id of [...ingredientMeshes.keys()]) {
    if (!tacoSet.has(id)) removeIngredient3D(id);
  }
  // agregar nuevos
  state.taco.forEach((id) => {
    if (!ingredientMeshes.has(id)) {
      placeIngredient3D(id);
    }
  });
}

function renderIngredients() {
  ingredientsGrid.innerHTML = '';
  INGREDIENTS.forEach((ing, i) => {
    const btn = document.createElement('button');
    btn.className = 'ing-btn' + (state.taco.includes(ing.id) ? ' added' : '');
    btn.innerHTML = `<span class="num">${i + 1}</span><span class="ico">${ing.ico}</span><span class="nm">${ing.name}</span>`;
    btn.addEventListener('click', () => {
      if (state.taco.includes(ing.id)) removeIngredient(ing.id);
      else addIngredient(ing.id);
    });
    ingredientsGrid.appendChild(btn);
  });
  renderDrinks();
  // re-render order para actualizar "have"
  if (state.customer) {
    customerOrderEl.innerHTML = '';
    for (const id of state.customer.order) {
      const ing = ING_BY_ID[id];
      const div = document.createElement('div');
      div.className = 'order-ing' + (state.taco.includes(id) ? ' have' : '');
      div.textContent = ing.ico;
      customerOrderEl.appendChild(div);
    }
  }
}

function setHappyFace() {
  customerFace.classList.remove('entering', 'sad');
  void customerFace.offsetWidth;
  customerFace.classList.add('happy');
}
function setSadFace() {
  customerFace.classList.remove('entering', 'happy');
  void customerFace.offsetWidth;
  customerFace.classList.add('sad');
}

const feedbackEl = document.getElementById('feedback-burst');
function flashFeedback(text, color) {
  feedbackEl.textContent = text;
  feedbackEl.style.color = color || '#fff';
  feedbackEl.classList.remove('hidden', 'show');
  void feedbackEl.offsetWidth;
  feedbackEl.classList.add('show');
  setTimeout(() => feedbackEl.classList.remove('show'), 800);
  setTimeout(() => feedbackEl.classList.add('hidden'), 1100);
}

// ==================== HUD ====================
function updateHUD() {
  document.getElementById('hud-score').textContent = state.score;
  document.getElementById('hud-combo').textContent = '×' + state.combo;
  document.getElementById('hud-level').textContent = state.level;
  document.getElementById('hud-served').textContent = state.served;
  document.getElementById('hud-lives').textContent = state.lives > 0 ? '❤️'.repeat(state.lives) : '💀';
  document.getElementById('hud-best').textContent = state.best;
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
    case 'add':   o.type = 'sine';     o.frequency.value = 660;  o.frequency.exponentialRampToValueAtTime(880, t0 + 0.08); g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1); dur = 0.1; break;
    case 'wrong': o.type = 'square';   o.frequency.value = 220;  o.frequency.exponentialRampToValueAtTime(110, t0 + 0.18); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); dur = 0.2; break;
    case 'happy': o.type = 'triangle'; o.frequency.value = 440;  o.frequency.exponentialRampToValueAtTime(880, t0 + 0.15); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); dur = 0.2; break;
    case 'angry': o.type = 'sawtooth'; o.frequency.value = 220;  o.frequency.exponentialRampToValueAtTime(110, t0 + 0.4); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4); dur = 0.4; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== Input ====================
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { window.location.href = '/'; return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); return; }
  if (!state.alive || state.paused) return;
  // numéricos 1-9 o 0 para el décimo
  let idx = -1;
  if (e.key >= '1' && e.key <= '9') idx = parseInt(e.key, 10) - 1;
  else if (e.key === '0') idx = 9;
  if (idx >= 0 && idx < INGREDIENTS.length) {
    const ing = INGREDIENTS[idx];
    if (state.taco.includes(ing.id)) removeIngredient(ing.id);
    else addIngredient(ing.id);
    return;
  }
  if (e.key === 'Enter') { e.preventDefault(); serve(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); clearTaco(); return; }
});

// ==================== Pause / menu ====================
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
document.getElementById('btn-serve').addEventListener('click', serve);
document.getElementById('btn-clear').addEventListener('click', clearTaco);
document.getElementById('go-replay').addEventListener('click', () => location.reload());
document.getElementById('go-menu').addEventListener('click', () => { window.location.href = '/'; });

if (!localStorage.getItem('tacos-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('tacos-seen-help', '1');
}

// ==================== Loop ====================
let last = performance.now();
function loop(now) {
  const dtMs = now - last;
  const dt = dtMs / 1000;
  last = now;
  if (state.alive && !state.paused && state.customer && !state.customer.served) {
    state.customer.patience -= dtMs;
    if (state.customer.patience <= 0) customerLeft();
  }
  if (state.customer) {
    const ratio = Math.max(0, state.customer.patience / state.customer.maxPatience);
    patienceFill.style.width = (ratio * 100) + '%';
    patienceFill.classList.toggle('warning', ratio < 0.5 && ratio >= 0.25);
    patienceFill.classList.toggle('danger', ratio < 0.25);
  }
  update3D(dt);
  render3D();
  updateHUD();
  requestAnimationFrame(loop);
}

init3D();
newCustomer();
requestAnimationFrame(loop);
