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
  // paciencia: 14s nivel 1, baja 0.6s por nivel, mínimo 6s
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

// ==================== Render ====================
const customerFace = document.getElementById('customer-face');
const customerName = document.getElementById('customer-name');
const customerOrderEl = document.getElementById('customer-order');
const patienceFill = document.getElementById('patience-fill');
const tacoShell = document.getElementById('taco-shell');
const ingredientsGrid = document.getElementById('ingredients-grid');

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
  tacoShell.innerHTML = '';
  if (state.taco.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'taco-empty';
    placeholder.textContent = 'Sumá ingredientes...';
    tacoShell.appendChild(placeholder);
    return;
  }
  for (const id of state.taco) {
    const ing = ING_BY_ID[id];
    const span = document.createElement('span');
    span.className = 'taco-ing';
    span.textContent = ing.ico;
    span.title = 'Click para quitar';
    span.addEventListener('click', () => removeIngredient(id));
    tacoShell.appendChild(span);
  }
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
  const dt = now - last;
  last = now;
  if (state.alive && !state.paused && state.customer && !state.customer.served) {
    state.customer.patience -= dt;
    if (state.customer.patience <= 0) customerLeft();
  }
  if (state.customer) {
    const ratio = Math.max(0, state.customer.patience / state.customer.maxPatience);
    patienceFill.style.width = (ratio * 100) + '%';
    patienceFill.classList.toggle('warning', ratio < 0.5 && ratio >= 0.25);
    patienceFill.classList.toggle('danger', ratio < 0.25);
  }
  updateHUD();
  requestAnimationFrame(loop);
}

newCustomer();
requestAnimationFrame(loop);
