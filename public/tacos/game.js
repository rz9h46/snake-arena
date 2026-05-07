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
  const maxPatience = Math.max(6, 14 - (state.level - 1) * 0.6) * 1000;
  state.customer = {
    ico: c.ico,
    name: c.name,
    order,
    patience: maxPatience,
    maxPatience,
    served: false
  };
  state.taco = [];
  clearTaco3D();
  spawnShell();           // 🌮 la fajita aparece con drop-in cuando llega el cliente
  renderCustomer(true);
  renderTaco();
  renderIngredients();
}

function addIngredient(id) {
  if (!state.alive || state.paused || !state.customer || state.customer.served) return;
  if (state.taco.includes(id)) return;
  state.taco.push(id);
  beep('add');
  // si NO está en la orden: penalización
  if (!state.customer.order.includes(id)) {
    state.score = Math.max(0, state.score - 5);
    state.combo = 1;
    flashFeedback('😬 No pidió eso!', '#ff5e7a');
    beep('wrong');
    // saca el ingrediente erróneo después de un toque
    setTimeout(() => {
      if (state.customer && !state.customer.served) {
        state.taco = state.taco.filter(i => i !== id);
        renderTaco();
        renderIngredients();
      }
    }, 700);
  }
  renderTaco();
  renderIngredients();
  // auto-servir si coincide exactamente
  if (matchesOrder()) {
    setTimeout(() => { if (!state.customer.served) serve(); }, 250);
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
  const orderSet = new Set(state.customer.order);
  const tacoSet = new Set(state.taco);
  if (state.taco.length !== state.customer.order.length) return false;
  for (const i of state.customer.order) if (!tacoSet.has(i)) return false;
  for (const i of state.taco) if (!orderSet.has(i)) return false;
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
  camera3d = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
  camera3d.position.set(0, 2.6, 5.4);
  camera3d.lookAt(0, -0.5, 0);

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

function spawnShell() {
  if (!scene3d) return;
  // si quedó uno por error, removerlo
  if (tacoShellMesh) {
    scene3d.remove(tacoShellMesh);
    disposeMesh(tacoShellMesh);
    tacoShellMesh = null;
  }
  tacoShellMesh = buildTacoShell();
  tacoShellMesh.position.y = 3.5;            // empieza arriba
  tacoShellMesh.userData.dropping = true;
  tacoShellMesh.userData.targetY = -0.55;
  tacoShellMesh.userData.vy = 0;
  scene3d.add(tacoShellMesh);
  // pulso de luz cuando aterriza? lo dejamos solo el bounce
}

function flyAwayTaco() {
  if (!scene3d) return;
  // chispas en la posición del shell
  spawnSparkles(0, -0.1, 0);
  // empezar fly-away del shell + ingredientes
  const items = [];
  if (tacoShellMesh) items.push(tacoShellMesh);
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

function resize3D() {
  if (!renderer3d) return;
  const canvas = document.getElementById('taco-3d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camera3d.aspect = w / h;
  camera3d.updateProjectionMatrix();
  renderer3d.setSize(w, h, false);
}

function buildTacoShell() {
  const group = new THREE.Group();
  const r = 1.2;
  const length = 2.4;
  const geom = new THREE.CylinderGeometry(r, r, length, 48, 1, true, 0, Math.PI);
  geom.rotateZ(Math.PI / 2);
  geom.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xfcd896,
    roughness: 0.7,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const shell = new THREE.Mesh(geom, mat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  group.add(shell);
  // borde dorado en los extremos
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0xd4a050, roughness: 0.6 });
  for (const ex of [length / 2, -length / 2]) {
    const ringGeom = new THREE.TorusGeometry(r, 0.06, 6, 16, Math.PI);
    const ring = new THREE.Mesh(ringGeom, edgeMat);
    ring.position.x = ex;
    ring.rotation.y = Math.PI / 2;
    ring.rotation.x = Math.PI;
    ring.castShadow = true;
    group.add(ring);
  }
  // pequeñas manchitas tostadas
  for (let i = 0; i < 8; i++) {
    const sp = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xb47020, roughness: 0.6 })
    );
    sp.scale.set(1.5, 0.2, 1);
    const angle = Math.PI + 0.3 + (Math.random() * (Math.PI - 0.6));
    sp.position.set(
      (Math.random() - 0.5) * length * 0.85,
      Math.sin(angle) * (r - 0.01),
      Math.cos(angle) * (r - 0.01)
    );
    sp.rotation.x = -angle + Math.PI / 2;
    group.add(sp);
  }
  group.position.y = -0.55;
  return group;
}

function buildIngredient(id) {
  const group = new THREE.Group();
  group.userData.id = id;
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
    case 'tomato':
      addMesh(new THREE.SphereGeometry(0.14, 16, 12), 0xe63946, { roughness: 0.35 });
      addMesh(new THREE.SphereGeometry(0.14, 16, 12), 0xc62838, {
        scale: [0.9, 0.9, 0.9], position: [0.04, -0.02, 0.02], roughness: 0.5
      });
      break;
    case 'cheese':
      addMesh(new THREE.BoxGeometry(0.36, 0.08, 0.28), 0xfcd820, { roughness: 0.4 });
      // hoyitos del queso
      for (let i = 0; i < 3; i++) {
        addMesh(new THREE.SphereGeometry(0.025, 6, 6), 0xeac010, {
          position: [(Math.random() - 0.5) * 0.25, 0.05, (Math.random() - 0.5) * 0.18]
        });
      }
      break;
    case 'onion':
      addMesh(new THREE.SphereGeometry(0.1, 14, 10), 0xf4ecd8, {
        scale: [1, 0.55, 1], roughness: 0.4
      });
      addMesh(new THREE.SphereGeometry(0.06, 8, 6), 0xc8b890, {
        scale: [1, 0.4, 1], position: [0, 0.04, 0]
      });
      break;
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

function placeIngredient3D(id, slotIdx, total) {
  if (!scene3d) return;
  const mesh = buildIngredient(id);
  // posición a lo largo del shell
  const length = 2.4;
  const span = length - 0.5;
  const x = -span / 2 + (span * (slotIdx + 0.5) / Math.max(1, total));
  const z = (Math.random() - 0.5) * 0.4;
  const targetY = -0.55 + 0.05 + slotIdx * 0.02;
  mesh.position.set(x + (Math.random() - 0.5) * 0.15, 2.5, z);
  mesh.userData.targetY = targetY;
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
const tacoEmptyHint = document.getElementById('taco-empty-hint');

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
}

function renderTaco() {
  // Sync 3D scene con state.taco
  const tacoSet = new Set(state.taco);
  // remover los que ya no están
  for (const id of [...ingredientMeshes.keys()]) {
    if (!tacoSet.has(id)) removeIngredient3D(id);
  }
  // agregar nuevos
  state.taco.forEach((id, idx) => {
    if (!ingredientMeshes.has(id)) {
      placeIngredient3D(id, idx, state.taco.length);
    }
  });
  // hint visible solo si vacío
  if (tacoEmptyHint) tacoEmptyHint.classList.toggle('hidden', state.taco.length > 0);
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
