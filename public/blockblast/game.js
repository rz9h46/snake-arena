// ==================== Block Blast ====================
// Tablero 8x8. Tres piezas en bandeja. Drag & drop o teclado para colocar.
// Llenar fila o columna entera = revienta. Combo si caen varias en un turno.

const SIZE = 8;
const COLORS = ['#ff5e7a', '#ffb35e', '#ffd75e', '#9aff5e', '#5effb6', '#5ee0ff', '#5e8eff', '#b65eff', '#ff5edc'];

// Set de piezas (catalogo). Cada pieza es array de [x, y].
const PIECE_LIB = [
  // 1
  [[0,0]],
  // 2 horizontal/vertical
  [[0,0],[1,0]], [[0,0],[0,1]],
  // 3 horizontal/vertical
  [[0,0],[1,0],[2,0]], [[0,0],[0,1],[0,2]],
  // 4 horizontal/vertical
  [[0,0],[1,0],[2,0],[3,0]], [[0,0],[0,1],[0,2],[0,3]],
  // 5 horizontal/vertical
  [[0,0],[1,0],[2,0],[3,0],[4,0]], [[0,0],[0,1],[0,2],[0,3],[0,4]],
  // square 2x2
  [[0,0],[1,0],[0,1],[1,1]],
  // square 3x3
  [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]],
  // L 2x2
  [[0,0],[1,0],[0,1]], [[0,0],[1,0],[1,1]], [[0,0],[0,1],[1,1]], [[1,0],[0,1],[1,1]],
  // L 3
  [[0,0],[0,1],[0,2],[1,2],[2,2]], [[2,0],[0,1],[1,1],[2,1],[2,2]],
  [[0,0],[1,0],[2,0],[0,1],[0,2]], [[0,0],[0,1],[0,2],[1,0],[2,0]],
  [[0,0],[1,0],[0,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]],
  // T
  [[0,0],[1,0],[2,0],[1,1]], [[1,0],[0,1],[1,1],[1,2]], [[1,0],[0,1],[1,1],[2,1]], [[0,0],[0,1],[0,2],[1,1]],
  // S/Z
  [[1,0],[2,0],[0,1],[1,1]], [[0,0],[1,0],[1,1],[2,1]],
  [[0,0],[0,1],[1,1],[1,2]], [[1,0],[0,1],[1,1],[0,2]],
  // diag 2
  [[0,0],[1,1]], [[1,0],[0,1]]
];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const tray = document.getElementById('tray');

let CELL = 50;
function resize() {
  const maxW = Math.min(560, window.innerWidth - 40);
  CELL = Math.floor(maxW / SIZE);
  canvas.width = CELL * SIZE;
  canvas.height = CELL * SIZE;
}
window.addEventListener('resize', resize);
resize();

const state = {
  grid: makeGrid(),
  pieces: [],            // tray pieces
  selected: 0,
  cursor: { x: 3, y: 3 },// teclado
  dragging: null,        // {pieceIdx, color, cells, mouseX, mouseY}
  score: 0,
  combo: 1,
  best: parseInt(localStorage.getItem('bb-best') || '0', 10),
  alive: true,
  flashTime: 0,
  flashCells: []         // {x,y,t}
};

function makeGrid() {
  const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  return g;
}

function rand(a, b) { return Math.random() * (b - a) + a; }

function rerollPieces() {
  state.pieces = [];
  for (let i = 0; i < 3; i++) {
    const cells = PIECE_LIB[Math.floor(Math.random() * PIECE_LIB.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    state.pieces.push({ cells, color, used: false });
  }
  state.selected = 0;
  renderTray();
}

function pieceFitsAt(cells, gx, gy) {
  for (const [cx, cy] of cells) {
    const x = gx + cx, y = gy + cy;
    if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return false;
    if (state.grid[y][x]) return false;
  }
  return true;
}

function pieceFitsAnywhere(cells) {
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (pieceFitsAt(cells, x, y)) return true;
  return false;
}

function placePiece(pieceIdx, gx, gy) {
  const piece = state.pieces[pieceIdx];
  if (!piece || piece.used) return false;
  if (!pieceFitsAt(piece.cells, gx, gy)) return false;
  for (const [cx, cy] of piece.cells) {
    state.grid[gy + cy][gx + cx] = piece.color;
  }
  piece.used = true;
  state.score += piece.cells.length;
  // chequear y reventar lineas
  const cleared = clearLines();
  if (cleared > 0) {
    state.combo++;
    const points = cleared * SIZE * 10 * state.combo;
    state.score += points;
    beep('clear');
  } else {
    state.combo = 1;
    beep('place');
  }
  // si todas usadas, regenerar
  if (state.pieces.every(p => p.used)) {
    rerollPieces();
  }
  // chequear game over
  if (!state.pieces.some(p => !p.used && pieceFitsAnywhere(p.cells))) {
    setTimeout(checkGameOver, 100);
  }
  // seleccionar la siguiente disponible
  for (let i = 0; i < state.pieces.length; i++) {
    if (!state.pieces[i].used) { state.selected = i; break; }
  }
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem('bb-best', state.best);
  }
  renderTray();
  return true;
}

function clearLines() {
  const fullRows = [];
  const fullCols = [];
  for (let y = 0; y < SIZE; y++) if (state.grid[y].every(c => c)) fullRows.push(y);
  for (let x = 0; x < SIZE; x++) {
    let full = true;
    for (let y = 0; y < SIZE; y++) if (!state.grid[y][x]) { full = false; break; }
    if (full) fullCols.push(x);
  }
  // marcar para flash
  for (const y of fullRows) for (let x = 0; x < SIZE; x++) state.flashCells.push({ x, y, t: 0.3 });
  for (const x of fullCols) for (let y = 0; y < SIZE; y++) state.flashCells.push({ x, y, t: 0.3 });
  // limpiar
  for (const y of fullRows) for (let x = 0; x < SIZE; x++) state.grid[y][x] = null;
  for (const x of fullCols) for (let y = 0; y < SIZE; y++) state.grid[y][x] = null;
  return fullRows.length + fullCols.length;
}

function checkGameOver() {
  for (const p of state.pieces) {
    if (!p.used && pieceFitsAnywhere(p.cells)) return;
  }
  state.alive = false;
  beep('over');
  document.getElementById('go-score').textContent = state.score;
  document.getElementById('go-best').textContent = state.best;
  document.getElementById('gameover').classList.remove('hidden');
}

// ==================== Render ====================
function renderTray() {
  tray.innerHTML = '';
  state.pieces.forEach((p, i) => {
    const el = document.createElement('div');
    el.className = 'tray-piece' + (p.used ? ' used' : '') + (i === state.selected && !p.used ? ' selected' : '');
    const cv = document.createElement('canvas');
    let maxX = 0, maxY = 0;
    for (const [x, y] of p.cells) { maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    const cs = 22;
    cv.width = (maxX + 1) * cs;
    cv.height = (maxY + 1) * cs;
    const c = cv.getContext('2d');
    for (const [x, y] of p.cells) drawTile(c, x, y, cs, p.color);
    el.appendChild(cv);

    // Touch: drag and drop
    el.addEventListener('touchstart', (e) => {
      if (p.used) return;
      e.preventDefault();
      const t = e.touches[0];
      state.dragging = { pieceIdx: i, mouseX: t.clientX, mouseY: t.clientY, source: 'touch' };
      state.selected = i;
      document.body.classList.add('dragging');
      renderTray();
    }, { passive: false });

    // Mouse: click-to-grab / click-to-drop
    el.addEventListener('click', () => {
      if (p.used) return;
      // si estaba agarrando esta misma pieza, soltala (cancelar)
      if (state.dragging && state.dragging.source === 'mouse' && state.dragging.pieceIdx === i) {
        state.dragging = null;
        document.body.classList.remove('dragging');
        renderTray();
        return;
      }
      // agarrar (o cambiar a esta pieza)
      state.selected = i;
      state.dragging = { pieceIdx: i, mouseX: 0, mouseY: 0, source: 'mouse' };
      document.body.classList.add('dragging');
      renderTray();
    });
    tray.appendChild(el);
  });
}

function drawTile(c, x, y, size, color) {
  const px = x * size, py = y * size;
  c.fillStyle = color;
  c.fillRect(px + 1, py + 1, size - 2, size - 2);
  c.fillStyle = 'rgba(255,255,255,0.22)';
  c.fillRect(px + 2, py + 2, size - 4, 4);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(px + 2, py + size - 6, size - 4, 4);
}

function drawBoard(dt) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // grid
  ctx.fillStyle = '#0e1426';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(255, 179, 94, 0.07)';
  for (let i = 1; i < SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, canvas.height); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i * CELL); ctx.lineTo(canvas.width, i * CELL); ctx.stroke();
  }
  // celdas fijas
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (state.grid[y][x]) drawTile(ctx, x, y, CELL, state.grid[y][x]);
    }
  }
  // flash
  if (state.flashCells.length > 0) {
    for (let i = state.flashCells.length - 1; i >= 0; i--) {
      const f = state.flashCells[i];
      f.t -= dt;
      if (f.t <= 0) { state.flashCells.splice(i, 1); continue; }
      ctx.globalAlpha = f.t / 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(f.x * CELL + 2, f.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.globalAlpha = 1;
    }
  }
  // ghost
  let ghostPiece = null;
  let gx = -1, gy = -1;
  if (state.dragging) {
    const rect = canvas.getBoundingClientRect();
    let cx = state.dragging.mouseX - rect.left;
    let cy = state.dragging.mouseY - rect.top;
    // si el mouse aun no se movio (recien agarrado) usar centro del board
    if (state.dragging.source === 'mouse' && state.dragging.mouseX === 0) {
      cx = canvas.width / 2; cy = canvas.height / 2;
    }
    if (cx >= 0 && cy >= 0 && cx < canvas.width && cy < canvas.height) {
      gx = Math.floor(cx / CELL);
      gy = Math.floor(cy / CELL);
      ghostPiece = state.pieces[state.dragging.pieceIdx];
    }
  } else {
    const p = state.pieces[state.selected];
    if (p && !p.used) {
      ghostPiece = p;
      gx = state.cursor.x;
      gy = state.cursor.y;
    }
  }
  if (ghostPiece) {
    const ok = pieceFitsAt(ghostPiece.cells, gx, gy);
    ctx.globalAlpha = ok ? 0.5 : 0.25;
    for (const [cx, cy] of ghostPiece.cells) {
      const x = gx + cx, y = gy + cy;
      if (x >= 0 && y >= 0 && x < SIZE && y < SIZE) {
        drawTile(ctx, x, y, CELL, ok ? ghostPiece.color : '#ff5e7a');
      }
    }
    ctx.globalAlpha = 1;
    if (!state.dragging) {
      // marcar el cursor actual
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(gx * CELL + 1, gy * CELL + 1, CELL - 2, CELL - 2);
    }
  }
}

// ==================== Drag & drop ====================
document.addEventListener('mousemove', (e) => {
  if (state.dragging) {
    state.dragging.mouseX = e.clientX;
    state.dragging.mouseY = e.clientY;
  }
});

document.addEventListener('touchmove', (e) => {
  if (!state.dragging || state.dragging.source !== 'touch') return;
  if (e.touches.length === 0) return;
  e.preventDefault();
  state.dragging.mouseX = e.touches[0].clientX;
  state.dragging.mouseY = e.touches[0].clientY;
}, { passive: false });

// Touch: al soltar el dedo se intenta colocar
document.addEventListener('touchend', () => {
  if (!state.dragging || state.dragging.source !== 'touch') return;
  const rect = canvas.getBoundingClientRect();
  const cx = state.dragging.mouseX - rect.left;
  const cy = state.dragging.mouseY - rect.top;
  if (cx >= 0 && cy >= 0 && cx < canvas.width && cy < canvas.height) {
    const gx = Math.floor(cx / CELL);
    const gy = Math.floor(cy / CELL);
    placePiece(state.dragging.pieceIdx, gx, gy);
  }
  state.dragging = null;
  document.body.classList.remove('dragging');
  renderTray();
});

// Mouse: click sobre el board coloca la pieza agarrada
canvas.addEventListener('click', (e) => {
  if (!state.dragging || state.dragging.source !== 'mouse') return;
  const rect = canvas.getBoundingClientRect();
  const cx = e.clientX - rect.left;
  const cy = e.clientY - rect.top;
  const gx = Math.floor(cx / CELL);
  const gy = Math.floor(cy / CELL);
  if (placePiece(state.dragging.pieceIdx, gx, gy)) {
    state.dragging = null;
    document.body.classList.remove('dragging');
    renderTray();
  }
  // si no entra, mantenemos la pieza agarrada
});

// ESC o click derecho cancelan el agarre
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.dragging) {
    state.dragging = null;
    document.body.classList.remove('dragging');
    renderTray();
  }
});
canvas.addEventListener('contextmenu', (e) => {
  if (state.dragging) {
    e.preventDefault();
    state.dragging = null;
    document.body.classList.remove('dragging');
    renderTray();
  }
});

// ==================== Teclado ====================
window.addEventListener('keydown', (e) => {
  if (!state.alive) return;
  if (e.key === '1') { state.selected = 0; renderTray(); return; }
  if (e.key === '2') { state.selected = 1; renderTray(); return; }
  if (e.key === '3') { state.selected = 2; renderTray(); return; }
  if (e.key === 'ArrowLeft')  { state.cursor.x = Math.max(0, state.cursor.x - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { state.cursor.x = Math.min(SIZE - 1, state.cursor.x + 1); e.preventDefault(); }
  if (e.key === 'ArrowUp')    { state.cursor.y = Math.max(0, state.cursor.y - 1); e.preventDefault(); }
  if (e.key === 'ArrowDown')  { state.cursor.y = Math.min(SIZE - 1, state.cursor.y + 1); e.preventDefault(); }
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    placePiece(state.selected, state.cursor.x, state.cursor.y);
  }
  if (e.key === 'r' || e.key === 'R') {
    // rotar pieza seleccionada 90° horario
    const p = state.pieces[state.selected];
    if (p && !p.used) {
      let maxY = 0;
      for (const [, y] of p.cells) maxY = Math.max(maxY, y);
      const rotated = p.cells.map(([x, y]) => [maxY - y, x]);
      // normalizar (mover a 0,0)
      let minX = 99, minY = 99;
      for (const [x, y] of rotated) { minX = Math.min(minX, x); minY = Math.min(minY, y); }
      p.cells = rotated.map(([x, y]) => [x - minX, y - minY]);
      renderTray();
    }
  }
});

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
    case 'place': o.type = 'sine'; o.frequency.value = 440; g.gain.setValueAtTime(0.04, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.08); dur = 0.08; break;
    case 'clear': o.type = 'sawtooth'; o.frequency.value = 660; o.frequency.exponentialRampToValueAtTime(1320, t0 + 0.2); g.gain.setValueAtTime(0.07, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25); dur = 0.25; break;
    case 'over': o.type = 'triangle'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.6); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6); dur = 0.6; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== Loop ====================
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  drawBoard(dt);
  document.getElementById('hud-score').textContent = state.score;
  document.getElementById('hud-combo').textContent = 'x' + state.combo;
  document.getElementById('hud-best').textContent = state.best;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function resetGame() {
  state.grid = makeGrid();
  state.score = 0;
  state.combo = 1;
  state.alive = true;
  state.flashCells = [];
  rerollPieces();
}

// ==================== Bindings ====================
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('go-replay').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  resetGame();
});
document.getElementById('go-menu').addEventListener('click', () => {
  window.location.href = '/';
});

// auto-help la primera vez
if (!localStorage.getItem('bb-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('bb-seen-help', '1');
}

rerollPieces();
