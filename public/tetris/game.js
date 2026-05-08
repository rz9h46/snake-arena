// ==================== Tetris Clásico (1P + 2P) ====================
const COLS = 10, ROWS = 20;

const CELL_SIZE = () => parseInt(getComputedStyle(document.documentElement).getPropertyValue('--cell')) || 28;

// Definiciones de piezas (4 rotaciones cada una). Coordenadas relativas.
const PIECES = {
  I: { color: '#5ee0ff', rots: [
    [[0,1],[1,1],[2,1],[3,1]],
    [[2,0],[2,1],[2,2],[2,3]],
    [[0,2],[1,2],[2,2],[3,2]],
    [[1,0],[1,1],[1,2],[1,3]]
  ]},
  O: { color: '#ffd75e', rots: [
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[2,1]]
  ]},
  T: { color: '#b65eff', rots: [
    [[1,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[2,1],[1,2]],
    [[1,0],[0,1],[1,1],[1,2]]
  ]},
  S: { color: '#5effb6', rots: [
    [[1,0],[2,0],[0,1],[1,1]],
    [[1,0],[1,1],[2,1],[2,2]],
    [[1,1],[2,1],[0,2],[1,2]],
    [[0,0],[0,1],[1,1],[1,2]]
  ]},
  Z: { color: '#ff5e7a', rots: [
    [[0,0],[1,0],[1,1],[2,1]],
    [[2,0],[1,1],[2,1],[1,2]],
    [[0,1],[1,1],[1,2],[2,2]],
    [[1,0],[0,1],[1,1],[0,2]]
  ]},
  J: { color: '#5e8eff', rots: [
    [[0,0],[0,1],[1,1],[2,1]],
    [[1,0],[2,0],[1,1],[1,2]],
    [[0,1],[1,1],[2,1],[2,2]],
    [[1,0],[1,1],[0,2],[1,2]]
  ]},
  L: { color: '#ffb35e', rots: [
    [[2,0],[0,1],[1,1],[2,1]],
    [[1,0],[1,1],[1,2],[2,2]],
    [[0,1],[1,1],[2,1],[0,2]],
    [[0,0],[1,0],[1,1],[1,2]]
  ]}
};

const PIECE_NAMES = Object.keys(PIECES);

function bagGenerator() {
  let bag = [];
  return () => {
    if (bag.length === 0) {
      bag = PIECE_NAMES.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.shift();
  };
}

class TetrisBoard {
  constructor(label, controls) {
    this.label = label;
    this.controls = controls;
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.bag = bagGenerator();
    this.next = [this.bag(), this.bag(), this.bag()];
    this.hold = null;
    this.canHold = true;
    this.piece = null;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gravityCounter = 0;
    this.alive = true;
    this.lastClearWasTetris = false;
    this.flashRows = []; // filas que parpadean al despejar
    this.flashTime = 0;
    this.dropAnim = 0; // intensidad del flash post hard drop
    this.pendingClears = 0;
    this.spawnPiece();
  }

  reset() {
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    this.bag = bagGenerator();
    this.next = [this.bag(), this.bag(), this.bag()];
    this.hold = null;
    this.canHold = true;
    this.score = 0;
    this.lines = 0;
    this.level = 1;
    this.gravityCounter = 0;
    this.alive = true;
    this.lastClearWasTetris = false;
    this.flashRows = [];
    this.flashTime = 0;
    this.dropAnim = 0;
    this.pendingClears = 0;
    this.spawnPiece();
  }

  spawnPiece(forceName) {
    const name = forceName || this.next.shift();
    if (!forceName) this.next.push(this.bag());
    this.piece = {
      name,
      rot: 0,
      x: 3,
      y: name === 'I' ? -1 : 0
    };
    if (this.collides(this.piece.x, this.piece.y, this.piece.rot)) {
      this.alive = false;
    }
    this.canHold = true;
  }

  cells(p = this.piece) {
    return PIECES[p.name].rots[p.rot];
  }

  collides(x, y, rot) {
    const cells = PIECES[this.piece.name].rots[rot];
    for (const [cx, cy] of cells) {
      const nx = x + cx;
      const ny = y + cy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && this.grid[ny][nx]) return true;
    }
    return false;
  }

  move(dx) {
    if (!this.alive || !this.piece) return false;
    if (!this.collides(this.piece.x + dx, this.piece.y, this.piece.rot)) {
      this.piece.x += dx;
      return true;
    }
    return false;
  }

  rotate(dir) {
    if (!this.alive || !this.piece) return;
    const newRot = (this.piece.rot + dir + 4) % 4;
    const kicks = [0, -1, 1, -2, 2];
    for (const k of kicks) {
      if (!this.collides(this.piece.x + k, this.piece.y, newRot)) {
        this.piece.x += k;
        this.piece.rot = newRot;
        return;
      }
    }
  }

  softDrop() {
    if (!this.alive || !this.piece) return;
    if (!this.collides(this.piece.x, this.piece.y + 1, this.piece.rot)) {
      this.piece.y++;
      this.score += 1;
    } else {
      this.lockPiece();
    }
  }

  hardDrop() {
    if (!this.alive || !this.piece) return;
    let dist = 0;
    while (!this.collides(this.piece.x, this.piece.y + 1, this.piece.rot)) {
      this.piece.y++;
      dist++;
    }
    this.score += dist * 2;
    this.dropAnim = 1;
    this.lockPiece();
  }

  ghostY() {
    if (!this.piece) return 0;
    let y = this.piece.y;
    while (!this.collides(this.piece.x, y + 1, this.piece.rot)) y++;
    return y;
  }

  doHold() {
    if (!this.alive || !this.canHold) return;
    const oldHold = this.hold;
    this.hold = this.piece.name;
    if (oldHold) {
      this.spawnPiece(oldHold);
    } else {
      this.spawnPiece();
    }
    this.canHold = false;
  }

  lockPiece() {
    const color = PIECES[this.piece.name].color;
    for (const [cx, cy] of this.cells()) {
      const nx = this.piece.x + cx;
      const ny = this.piece.y + cy;
      if (ny >= 0 && ny < ROWS) this.grid[ny][nx] = color;
    }
    const cleared = this.clearLines();
    // pendingClears: el loop lee y resetea esto cada frame, así
    // tanto las clears por gravedad como por hard drop disparan
    // el envío de basura al rival (antes solo gravedad lo hacía).
    if (cleared > 0) this.pendingClears = (this.pendingClears || 0) + cleared;
    this.spawnPiece();
    return cleared;
  }

  clearLines() {
    const cleared = [];
    for (let y = ROWS - 1; y >= 0; y--) {
      if (this.grid[y].every(c => c !== 0)) cleared.push(y);
    }
    if (cleared.length === 0) {
      this.lastClearWasTetris = false;
      return 0;
    }
    // flash rows
    this.flashRows = cleared.slice();
    this.flashTime = 0.18;
    // remover filas
    for (const y of cleared) {
      this.grid.splice(y, 1);
      this.grid.unshift(Array(COLS).fill(0));
    }
    const points = [0, 100, 300, 500, 800][cleared.length] || 1000;
    this.score += points * this.level;
    this.lines += cleared.length;
    const newLevel = Math.floor(this.lines / 10) + 1;
    if (newLevel > this.level) this.level = newLevel;
    this.lastClearWasTetris = cleared.length === 4;
    return cleared.length;
  }

  receiveGarbage(rows) {
    if (!this.alive) return;
    // sube las filas existentes hacia arriba
    for (let r = 0; r < rows; r++) {
      this.grid.shift();
      const hole = Math.floor(Math.random() * COLS);
      const row = Array(COLS).fill('#3a3f55');
      row[hole] = 0;
      this.grid.push(row);
    }
    // si la pieza queda atrapada, kill
    if (this.piece && this.collides(this.piece.x, this.piece.y, this.piece.rot)) {
      this.alive = false;
    }
  }

  gravityInterval() {
    return Math.max(0.05, Math.pow(0.85, this.level - 1) * 1.0);
  }

  update(dt, isSoftDropping) {
    if (!this.alive) return 0;
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) this.flashRows = [];
    }
    if (this.dropAnim > 0) this.dropAnim = Math.max(0, this.dropAnim - dt * 4);
    // soft drop = 6x más rápido que la gravedad normal, mínimo 0.10s
    // (lo suficientemente lento para que se pueda soltar la tecla a media altura)
    const interval = isSoftDropping
      ? Math.max(0.10, this.gravityInterval() / 6)
      : this.gravityInterval();
    this.gravityCounter += dt;
    while (this.gravityCounter >= interval) {
      this.gravityCounter -= interval;
      if (!this.alive) break;
      if (!this.collides(this.piece.x, this.piece.y + 1, this.piece.rot)) {
        this.piece.y++;
        if (isSoftDropping) this.score += 1;
      } else {
        this.lockPiece();
        return;
      }
    }
  }
}

// ==================== Render ====================
function makePlayerArea(label, controls) {
  const area = document.createElement('div');
  area.className = 'player-area';

  const sideLeft = document.createElement('div');
  sideLeft.className = 'side-col';

  const holdBox = document.createElement('div');
  holdBox.className = 'side-box';
  holdBox.innerHTML = `<h3>Hold</h3><canvas class="canvas-mini hold-canvas" width="80" height="80"></canvas>`;
  sideLeft.appendChild(holdBox);

  const scoreBox = document.createElement('div');
  scoreBox.className = 'side-box';
  scoreBox.innerHTML = `<h3>Score</h3><div class="big score-val">0</div>
    <h3 style="margin-top:8px">Líneas</h3><div class="big lines-val">0</div>
    <h3 style="margin-top:8px">Nivel</h3><div class="big level-val">1</div>`;
  sideLeft.appendChild(scoreBox);

  area.appendChild(sideLeft);

  const center = document.createElement('div');
  center.style.display = 'flex';
  center.style.flexDirection = 'column';
  center.style.alignItems = 'center';
  const boardWrap = document.createElement('div');
  boardWrap.className = 'board-wrap';
  const lbl = document.createElement('div');
  lbl.className = 'board-label';
  lbl.textContent = label;
  boardWrap.appendChild(lbl);
  const canvas = document.createElement('canvas');
  boardWrap.appendChild(canvas);
  const overlay = document.createElement('div');
  overlay.className = 'board-overlay';
  overlay.textContent = 'GAME OVER';
  boardWrap.appendChild(overlay);
  center.appendChild(boardWrap);

  const touchControls = document.createElement('div');
  touchControls.id = `touch-${controls.id}`;
  touchControls.className = 'touch-controls';
  touchControls.style.display = 'none';
  touchControls.innerHTML = `
    <button class="touch-btn" data-act="left">◀</button>
    <button class="touch-btn" data-act="rotL">↺</button>
    <button class="touch-btn primary" data-act="hardDrop">⤓</button>
    <button class="touch-btn" data-act="rotR">↻</button>
    <button class="touch-btn" data-act="right">▶</button>
    <button class="touch-btn wide" data-act="softDrop">▼ SUAVE</button>
    <button class="touch-btn wide" data-act="hold">HOLD</button>
  `;
  center.appendChild(touchControls);
  area.appendChild(center);

  const sideRight = document.createElement('div');
  sideRight.className = 'side-col';
  const nextBox = document.createElement('div');
  nextBox.className = 'side-box';
  nextBox.innerHTML = `<h3>Próxima</h3><canvas class="canvas-mini next-canvas" width="80" height="220"></canvas>`;
  sideRight.appendChild(nextBox);
  area.appendChild(sideRight);

  return {
    area,
    canvas,
    overlay,
    holdCanvas: holdBox.querySelector('.hold-canvas'),
    nextCanvas: nextBox.querySelector('.next-canvas'),
    scoreEl: scoreBox.querySelector('.score-val'),
    linesEl: scoreBox.querySelector('.lines-val'),
    levelEl: scoreBox.querySelector('.level-val'),
    touchControls
  };
}

function drawBoard(ctx, board) {
  const cs = CELL_SIZE();
  ctx.canvas.width = COLS * cs;
  ctx.canvas.height = ROWS * cs;
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // background grid
  ctx.fillStyle = '#0e1426';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.strokeStyle = 'rgba(94, 142, 255, 0.06)';
  ctx.lineWidth = 1;
  for (let x = 1; x < COLS; x++) {
    ctx.beginPath();
    ctx.moveTo(x * cs, 0);
    ctx.lineTo(x * cs, ROWS * cs);
    ctx.stroke();
  }
  for (let y = 1; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * cs);
    ctx.lineTo(COLS * cs, y * cs);
    ctx.stroke();
  }

  // celdas fijas
  for (let y = 0; y < ROWS; y++) {
    const flashing = board.flashRows.includes(y);
    for (let x = 0; x < COLS; x++) {
      const c = board.grid[y][x];
      if (c) {
        const color = flashing ? '#ffffff' : c;
        drawCell(ctx, x, y, color, flashing ? 1 : 0.9);
      }
    }
  }

  // ghost (donde caería si bajás ya)
  if (board.alive && board.piece && state.ghostOn) {
    const gy = board.ghostY();
    const color = PIECES[board.piece.name].color;
    for (const [cx, cy] of board.cells()) {
      const x = board.piece.x + cx;
      const y = gy + cy;
      if (y >= 0 && x >= 0 && x < COLS && y < ROWS) {
        // relleno semi
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = color;
        ctx.fillRect(x * CELL_SIZE() + 2, y * CELL_SIZE() + 2, CELL_SIZE() - 4, CELL_SIZE() - 4);
        ctx.globalAlpha = 1;
        // contorno claro
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(x * CELL_SIZE() + 2, y * CELL_SIZE() + 2, CELL_SIZE() - 4, CELL_SIZE() - 4);
        ctx.setLineDash([]);
      }
    }
    // pieza activa
    for (const [cx, cy] of board.cells()) {
      const x = board.piece.x + cx;
      const y = board.piece.y + cy;
      if (y >= 0 && x >= 0 && x < COLS && y < ROWS) {
        drawCell(ctx, x, y, PIECES[board.piece.name].color, 1);
      }
    }
  }

  // flash post hard drop
  if (board.dropAnim > 0) {
    ctx.fillStyle = `rgba(255,255,255,${board.dropAnim * 0.18})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
}

function drawCell(ctx, x, y, color, alpha = 1) {
  const cs = CELL_SIZE();
  const px = x * cs, py = y * cs;
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha;
  ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
  // brillo
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(px + 2, py + 2, cs - 4, 4);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px + 2, py + cs - 6, cs - 4, 4);
  ctx.globalAlpha = 1;
}

function drawHold(canvas, name) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!name) return;
  drawPieceCentered(ctx, canvas.width, canvas.height, name);
}

function drawNext(canvas, names) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const slot = canvas.height / names.length;
  names.forEach((name, i) => {
    drawPieceCentered(ctx, canvas.width, slot, name, i * slot);
  });
}

function drawPieceCentered(ctx, w, h, name, yOffset = 0) {
  const piece = PIECES[name];
  const cells = piece.rots[0];
  let minX = 99, maxX = -99, minY = 99, maxY = -99;
  for (const [x, y] of cells) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const pw = maxX - minX + 1;
  const ph = maxY - minY + 1;
  const size = Math.min(w / (pw + 0.5), h / (ph + 0.5));
  const offX = (w - pw * size) / 2 - minX * size;
  const offY = yOffset + (h - ph * size) / 2 - minY * size;
  ctx.fillStyle = piece.color;
  for (const [x, y] of cells) {
    const px = offX + x * size;
    const py = offY + y * size;
    ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(px + 1, py + 1, size - 2, 3);
    ctx.fillStyle = piece.color;
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
    case 'move': o.type = 'square'; o.frequency.value = 600; g.gain.setValueAtTime(0.025, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05); dur = 0.05; break;
    case 'rotate': o.type = 'square'; o.frequency.value = 800; g.gain.setValueAtTime(0.025, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05); dur = 0.05; break;
    case 'lock': o.type = 'sine'; o.frequency.value = 220; g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'clear': o.type = 'sawtooth'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(880, t0 + 0.18); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.2); dur = 0.2; break;
    case 'tetris': o.type = 'sawtooth'; o.frequency.value = 330; o.frequency.exponentialRampToValueAtTime(1100, t0 + 0.4); g.gain.setValueAtTime(0.08, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.45); dur = 0.45; break;
    case 'gameover': o.type = 'triangle'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(110, t0 + 0.6); g.gain.setValueAtTime(0.1, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6); dur = 0.6; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.02);
}

// ==================== Estado de la app ====================
const state = {
  players: 1,
  boards: [],
  uis: [],
  running: false,
  paused: false,
  softDrops: [false, false],
  ghostOn: localStorage.getItem('tetris-ghost') !== '0',
  garbageOn: localStorage.getItem('tetris-garbage') !== '0'
};

const stage = document.getElementById('stage');
const menu = document.getElementById('menu');
const gameOverEl = document.getElementById('gameover');
const pauseEl = document.getElementById('pause-overlay');
const helpModal = document.getElementById('help-modal');
const rankModal = document.getElementById('rank-modal');

document.querySelectorAll('#menu .mode-card').forEach(b => {
  b.addEventListener('click', () => startGame(parseInt(b.dataset.players, 10)));
});
document.getElementById('btn-help').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('btn-help-open').addEventListener('click', () => helpModal.classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => helpModal.classList.add('hidden'));
document.getElementById('btn-rank-open').addEventListener('click', () => openRanking());
document.getElementById('rank-close').addEventListener('click', () => rankModal.classList.add('hidden'));
document.getElementById('go-replay').addEventListener('click', () => {
  gameOverEl.classList.add('hidden');
  startGame(state.players);
});
document.getElementById('go-menu').addEventListener('click', () => {
  gameOverEl.classList.add('hidden');
  state.running = false;
  stage.innerHTML = '';
  menu.classList.remove('hidden');
});
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-pause-menu').addEventListener('click', () => {
  pauseEl.classList.add('hidden');
  state.running = false;
  stage.innerHTML = '';
  menu.classList.remove('hidden');
});

// Auto-help la primera vez
if (!localStorage.getItem('tetris-seen-help')) {
  helpModal.classList.remove('hidden');
  localStorage.setItem('tetris-seen-help', '1');
}

// Toggles del menú
const toggleGhost = document.getElementById('toggle-ghost');
const toggleGarbage = document.getElementById('toggle-garbage');
toggleGhost.checked = state.ghostOn;
toggleGarbage.checked = state.garbageOn;
toggleGhost.addEventListener('change', () => {
  state.ghostOn = toggleGhost.checked;
  localStorage.setItem('tetris-ghost', state.ghostOn ? '1' : '0');
});
toggleGarbage.addEventListener('change', () => {
  state.garbageOn = toggleGarbage.checked;
  localStorage.setItem('tetris-garbage', state.garbageOn ? '1' : '0');
});

function syncTogglesUI() {
  toggleGhost.checked = state.ghostOn;
  toggleGarbage.checked = state.garbageOn;
}

function openRanking() {
  rankModal.classList.remove('hidden');
  const list = document.getElementById('rank-list');
  list.innerHTML = '';
  const ranks = JSON.parse(localStorage.getItem('tetris-ranks') || '[]');
  if (ranks.length === 0) {
    list.innerHTML = '<li style="opacity:.6">Sin partidas todavía</li>';
    return;
  }
  ranks.forEach((r, i) => {
    const li = document.createElement('li');
    if (i === 0) li.classList.add('top1');
    li.innerHTML = `<span class="pos">#${i+1}</span><span>${escapeHtml(r.name||'-')}</span><span class="score">${r.score}</span>`;
    list.appendChild(li);
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

function showSendPopup(ui, lines) {
  showFloatingText(ui, `📤 +${lines} línea${lines > 1 ? 's' : ''}`, '#5fbb40');
}
function showReceivePopup(ui, lines) {
  showFloatingText(ui, `📥 +${lines} línea${lines > 1 ? 's' : ''}`, '#ff5e7a');
}
function showFloatingText(ui, text, color) {
  if (!ui || !ui.canvas) return;
  const wrap = ui.canvas.parentElement;
  if (!wrap) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `
    position:absolute; left:50%; top:30%; transform:translate(-50%, -50%);
    color:${color}; font-weight:800; font-size:18px; letter-spacing:1px;
    text-shadow:0 0 14px ${color}, 0 4px 8px rgba(0,0,0,0.85);
    pointer-events:none; z-index:10;
    animation: tetrisFloat 1.1s ease-out forwards;
  `;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

function pushScore(score, lines, level) {
  const ranks = JSON.parse(localStorage.getItem('tetris-ranks') || '[]');
  ranks.push({ name: 'Tú', score, lines, level, date: Date.now() });
  ranks.sort((a, b) => b.score - a.score);
  localStorage.setItem('tetris-ranks', JSON.stringify(ranks.slice(0, 20)));
}

// ==================== Controles ====================
const KEYBINDS = [
  // Player 1
  { left: ['ArrowLeft'], right: ['ArrowRight'], soft: ['ArrowDown'], rotR: ['ArrowUp', 'x', 'X'], rotL: ['z', 'Z'], hard: [' ', 'Spacebar'], hold: ['c', 'C'] },
  // Player 2
  { left: ['a', 'A'], right: ['d', 'D'], soft: ['s', 'S'], rotR: ['w', 'W'], rotL: ['q', 'Q'], hard: ['f', 'F'], hold: ['e', 'E'] }
];

function dispatchAction(playerIdx, action) {
  const b = state.boards[playerIdx];
  if (!b || !b.alive || state.paused) return;
  switch (action) {
    case 'left':  if (b.move(-1)) beep('move'); break;
    case 'right': if (b.move(1)) beep('move'); break;
    case 'rotR': b.rotate(1); beep('rotate'); break;
    case 'rotL': b.rotate(-1); beep('rotate'); break;
    case 'softDrop': b.softDrop(); break;
    case 'hardDrop': b.hardDrop(); beep('lock'); break;
    case 'hold': b.doHold(); break;
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.running) {
    state.running = false;
    stage.innerHTML = '';
    menu.classList.remove('hidden');
    return;
  }
  if ((e.key === 'p' || e.key === 'P') && state.running) {
    e.preventDefault();
    togglePause();
    return;
  }
  if (e.key === 'g' || e.key === 'G') {
    e.preventDefault();
    state.ghostOn = !state.ghostOn;
    localStorage.setItem('tetris-ghost', state.ghostOn ? '1' : '0');
    syncTogglesUI();
    return;
  }
  if (!state.running || state.paused) return;
  for (let p = 0; p < state.players; p++) {
    const kb = KEYBINDS[p];
    if (kb.left.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'left'); }
    else if (kb.right.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'right'); }
    else if (kb.rotR.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'rotR'); }
    else if (kb.rotL.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'rotL'); }
    else if (kb.hard.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'hardDrop'); }
    else if (kb.hold.includes(e.key)) { e.preventDefault(); dispatchAction(p, 'hold'); }
    else if (kb.soft.includes(e.key)) { e.preventDefault(); state.softDrops[p] = true; }
  }
});
window.addEventListener('keyup', (e) => {
  for (let p = 0; p < state.players; p++) {
    if (KEYBINDS[p].soft.includes(e.key)) state.softDrops[p] = false;
  }
});

function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  pauseEl.classList.toggle('hidden', !state.paused);
}

// ==================== Game loop ====================
function startGame(players) {
  state.players = players;
  state.boards = [];
  state.uis = [];
  state.softDrops = [false, false];
  state.running = true;
  state.paused = false;
  menu.classList.add('hidden');
  stage.innerHTML = '';

  const labels = players === 2 ? ['JUGADOR 1', 'JUGADOR 2'] : ['CAMPO'];
  for (let i = 0; i < players; i++) {
    const ui = makePlayerArea(labels[i], { id: i });
    stage.appendChild(ui.area);
    state.uis.push(ui);
    state.boards.push(new TetrisBoard(labels[i], { id: i }));
    bindTouch(ui.touchControls, i);
  }
  // mostrar touch en mobile
  state.uis.forEach(ui => {
    if (window.matchMedia('(max-width: 720px)').matches || ('ontouchstart' in window)) {
      ui.touchControls.style.display = 'flex';
      ui.touchControls.classList.add('show');
    }
  });
  ensureAudio();
  lastFrame = performance.now();
  requestAnimationFrame(loop);
}

function bindTouch(container, playerIdx) {
  container.querySelectorAll('button[data-act]').forEach(btn => {
    const act = btn.dataset.act;
    if (act === 'softDrop') {
      const start = (e) => { e.preventDefault(); state.softDrops[playerIdx] = true; };
      const end = (e) => { e.preventDefault(); state.softDrops[playerIdx] = false; };
      btn.addEventListener('touchstart', start, { passive: false });
      btn.addEventListener('touchend', end);
      btn.addEventListener('mousedown', start);
      btn.addEventListener('mouseup', end);
      btn.addEventListener('mouseleave', end);
    } else {
      const trigger = (e) => { e.preventDefault(); dispatchAction(playerIdx, act); };
      btn.addEventListener('touchstart', trigger, { passive: false });
      btn.addEventListener('click', trigger);
    }
  });
}

let lastFrame = performance.now();
function loop(now) {
  if (!state.running) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (!state.paused) {
    let pendingGarbage = [0, 0];
    for (let i = 0; i < state.boards.length; i++) {
      const b = state.boards[i];
      b.update(dt, state.softDrops[i]);
      // pendingClears: número real de líneas despejadas en este frame
      // (gravity-lock o hard-drop). update() retornaba 1 antes, no servía.
      if ((b.pendingClears || 0) > 0) {
        const cleared = b.pendingClears;
        b.pendingClears = 0;
        beep(cleared >= 4 ? 'tetris' : 'clear');
        if (state.players === 2 && state.garbageOn) {
          const send = cleared === 2 ? 1 : cleared === 3 ? 2 : cleared === 4 ? 4 : 0;
          if (send > 0) {
            pendingGarbage[1 - i] += send;
            // popup visual de envío
            showSendPopup(state.uis[i], send);
          }
        }
      }
    }
    if (state.players === 2) {
      pendingGarbage.forEach((g, i) => {
        if (g > 0) {
          state.boards[i].receiveGarbage(g);
          showReceivePopup(state.uis[i], g);
        }
      });
    }
    // detectar game over
    for (let i = 0; i < state.boards.length; i++) {
      if (!state.boards[i].alive && !state.uis[i].overlay.classList.contains('show')) {
        state.uis[i].overlay.classList.add('show');
        beep('gameover');
      }
    }
    // si todos murieron, abrir game over
    if (state.boards.every(b => !b.alive)) {
      finishGame();
      return;
    }
  }
  // render todos
  for (let i = 0; i < state.boards.length; i++) {
    const b = state.boards[i];
    const ui = state.uis[i];
    drawBoard(ui.canvas.getContext('2d'), b);
    drawHold(ui.holdCanvas, b.hold);
    drawNext(ui.nextCanvas, b.next);
    ui.scoreEl.textContent = b.score;
    ui.linesEl.textContent = b.lines;
    ui.levelEl.textContent = b.level;
  }
  requestAnimationFrame(loop);
}

function finishGame() {
  state.running = false;
  let bestBoard = state.boards[0];
  if (state.players === 2 && state.boards[1].score > bestBoard.score) bestBoard = state.boards[1];
  pushScore(bestBoard.score, bestBoard.lines, bestBoard.level);
  document.getElementById('go-score').textContent = bestBoard.score;
  document.getElementById('go-lines').textContent = bestBoard.lines;
  document.getElementById('go-level').textContent = bestBoard.level;
  const ranks = JSON.parse(localStorage.getItem('tetris-ranks') || '[]');
  document.getElementById('go-best').textContent = ranks[0]?.score || bestBoard.score;
  // titulo segun resultado
  if (state.players === 2) {
    const p1 = state.boards[0], p2 = state.boards[1];
    let title;
    if (p1.alive && !p2.alive) title = '🏆 Ganó Jugador 1';
    else if (!p1.alive && p2.alive) title = '🏆 Ganó Jugador 2';
    else title = p1.score === p2.score ? '🤝 Empate' : (p1.score > p2.score ? '🏆 Ganó Jugador 1' : '🏆 Ganó Jugador 2');
    document.getElementById('gameover-title').textContent = title;
  } else {
    document.getElementById('gameover-title').textContent = 'Fin del juego';
  }
  gameOverEl.classList.remove('hidden');
}
