// ==================== Puzzle Cats ====================
// Jigsaw puzzle: gato dibujado proceduralmente en canvas, dividido en NxN
// piezas con clavijas (tabs) y ranuras (blanks). Drag & drop con snap.

const CATS = [
  { id: 'tabby',   name: 'Tabby',     body: '#e8a050', stripes: '#a06030', eye: '#5fbb40', bg: '#a8e0ff' },
  { id: 'black',   name: 'Pantera',   body: '#2a2018', stripes: null,      eye: '#fcd820', bg: '#7a5fbb' },
  { id: 'gray',    name: 'Gris',      body: '#8a8a8a', stripes: '#5a5a5a', eye: '#5e8eff', bg: '#ffe0a0' },
  { id: 'white',   name: 'Blanco',    body: '#f4f4f4', stripes: null,      eye: '#ff5e7a', bg: '#a8ffd5' },
  { id: 'orange',  name: 'Naranja',   body: '#ff8838', stripes: '#cc5018', eye: '#5fbb40', bg: '#ffd0e0' },
  { id: 'calico',  name: 'Calico',    body: '#f0e0c0', stripes: '#7a3018', eye: '#5fbb40', bg: '#ffaecf', patches: ['#7a3018', '#2a2018'] },
  { id: 'siamese', name: 'Siamés',    body: '#e6d8b8', stripes: null,      eye: '#5e8eff', bg: '#ffe6c0', face: '#7a5a3a' },
  { id: 'pink',    name: 'Rosita',    body: '#ffbacc', stripes: '#ff7090', eye: '#b65eff', bg: '#fff5a8' }
];

const DIFFICULTIES = [
  { id: 'easy',   grid: 3, ico: '😺', name: 'Fácil',   ds: '3×3 piezas' },
  { id: 'med',    grid: 4, ico: '😼', name: 'Medio',   ds: '4×4 piezas' },
  { id: 'hard',   grid: 5, ico: '😾', name: 'Difícil', ds: '5×5 piezas' },
  { id: 'pro',    grid: 6, ico: '🦁', name: 'Pro',     ds: '6×6 piezas' }
];

const state = {
  cat: CATS[0],
  difficulty: DIFFICULTIES[1],
  grid: 4,
  cellSize: 80,
  tabSize: 14,
  pieces: [],
  draggingPiece: null,
  dragOffset: { x: 0, y: 0 },
  catCanvas: null,         // offscreen con la imagen del gato (frameSize x frameSize)
  frame: { x: 0, y: 0, w: 0, h: 0 },
  trayY: 0,
  startTime: 0,
  moves: 0,
  alive: false,
  won: false
};

// ==================== Render del gato (fondo) ====================
function shade(hex, amt) {
  const c = parseInt(hex.slice(1), 16);
  let r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
  if (amt < 0) {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  } else {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  }
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function drawCat(ctx, w, h, cat) {
  // fondo con gradient suave
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, cat.bg);
  grad.addColorStop(1, shade(cat.bg, -0.18));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // viñeta
  const vig = ctx.createRadialGradient(w/2, h/2, h*0.3, w/2, h/2, h*0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  // suelo (sombra elíptica)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.beginPath();
  ctx.ellipse(w/2, h*0.86, w*0.4, h*0.04, 0, 0, Math.PI*2);
  ctx.fill();

  // estrellitas decorativas
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 8; i++) {
    const sx = (i * 137 % (w - 30)) + 15;
    const sy = (h * 0.1) + (i * 47 % (h * 0.3));
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI*2);
    ctx.fill();
  }

  // cola
  ctx.strokeStyle = cat.body;
  ctx.lineWidth = w * 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w*0.66, h*0.78);
  ctx.bezierCurveTo(w*0.85, h*0.62, w*0.95, h*0.55, w*0.86, h*0.42);
  ctx.stroke();
  if (cat.stripes) {
    ctx.strokeStyle = cat.stripes;
    ctx.lineWidth = w * 0.025;
    [0.2, 0.4, 0.6, 0.8].forEach(t => {
      ctx.beginPath();
      const tx = w*0.66 + (w*0.86 - w*0.66) * t + Math.sin(t*Math.PI) * 8;
      const ty = h*0.78 + (h*0.42 - h*0.78) * t - Math.sin(t*Math.PI*1.5) * 12;
      ctx.arc(tx, ty, w*0.018, 0, Math.PI*2);
      ctx.fillStyle = cat.stripes;
      ctx.fill();
    });
  }

  // cuerpo
  ctx.fillStyle = cat.body;
  ctx.beginPath();
  ctx.ellipse(w*0.5, h*0.74, w*0.27, h*0.2, 0, 0, Math.PI*2);
  ctx.fill();
  // sombra en cuerpo
  ctx.fillStyle = shade(cat.body, -0.15);
  ctx.beginPath();
  ctx.ellipse(w*0.58, h*0.78, w*0.16, h*0.1, 0, 0, Math.PI*2);
  ctx.fill();

  // patches calico
  if (cat.patches) {
    cat.patches.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(w*(0.42 + i*0.18), h*(0.7 + i*0.04), w*0.08, h*0.06, i, 0, Math.PI*2);
      ctx.fill();
    });
  }

  // patas
  ctx.fillStyle = cat.body;
  ctx.fillRect(w*0.4, h*0.82, w*0.07, h*0.08);
  ctx.fillRect(w*0.53, h*0.82, w*0.07, h*0.08);
  // sombra de patas
  ctx.fillStyle = shade(cat.body, -0.2);
  ctx.fillRect(w*0.4, h*0.88, w*0.07, h*0.02);
  ctx.fillRect(w*0.53, h*0.88, w*0.07, h*0.02);

  // cabeza
  ctx.fillStyle = cat.body;
  ctx.beginPath();
  ctx.arc(w*0.5, h*0.45, w*0.21, 0, Math.PI*2);
  ctx.fill();
  // máscara facial siamés
  if (cat.face) {
    ctx.fillStyle = cat.face;
    ctx.beginPath();
    ctx.ellipse(w*0.5, h*0.5, w*0.13, h*0.09, 0, 0, Math.PI*2);
    ctx.fill();
  }

  // orejas
  ctx.fillStyle = cat.body;
  ctx.beginPath();
  ctx.moveTo(w*0.34, h*0.34);
  ctx.lineTo(w*0.4, h*0.22);
  ctx.lineTo(w*0.46, h*0.36);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.66, h*0.34);
  ctx.lineTo(w*0.6, h*0.22);
  ctx.lineTo(w*0.54, h*0.36);
  ctx.closePath();
  ctx.fill();
  // orejas internas
  ctx.fillStyle = '#ff9eb6';
  ctx.beginPath();
  ctx.moveTo(w*0.385, h*0.32);
  ctx.lineTo(w*0.4, h*0.26);
  ctx.lineTo(w*0.435, h*0.34);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w*0.615, h*0.32);
  ctx.lineTo(w*0.6, h*0.26);
  ctx.lineTo(w*0.565, h*0.34);
  ctx.closePath();
  ctx.fill();

  // rayas en frente y cuerpo (tabby)
  if (cat.stripes) {
    ctx.fillStyle = cat.stripes;
    // frente
    ctx.fillRect(w*0.46, h*0.32, w*0.015, h*0.08);
    ctx.fillRect(w*0.49, h*0.30, w*0.015, h*0.10);
    ctx.fillRect(w*0.52, h*0.32, w*0.015, h*0.08);
    // cuerpo (rayas tipo gato)
    [0.45, 0.5, 0.55, 0.6].forEach((t, i) => {
      ctx.fillRect(w*t, h*(0.62 + Math.sin(i)*0.02), w*0.025, h*0.18);
    });
    // mejillas
    ctx.fillRect(w*0.36, h*0.5, w*0.05, w*0.012);
    ctx.fillRect(w*0.59, h*0.5, w*0.05, w*0.012);
  }

  // ojos: blanco
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(w*0.435, h*0.45, w*0.035, 0, Math.PI*2);
  ctx.arc(w*0.565, h*0.45, w*0.035, 0, Math.PI*2);
  ctx.fill();
  // iris
  ctx.fillStyle = cat.eye;
  ctx.beginPath();
  ctx.arc(w*0.435, h*0.45, w*0.025, 0, Math.PI*2);
  ctx.arc(w*0.565, h*0.45, w*0.025, 0, Math.PI*2);
  ctx.fill();
  // pupila vertical
  ctx.fillStyle = '#000';
  ctx.fillRect(w*0.432, h*0.43, w*0.006, w*0.04);
  ctx.fillRect(w*0.562, h*0.43, w*0.006, w*0.04);
  // brillo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(w*0.43, h*0.44, w*0.008, 0, Math.PI*2);
  ctx.arc(w*0.56, h*0.44, w*0.008, 0, Math.PI*2);
  ctx.fill();

  // nariz
  ctx.fillStyle = '#ff6080';
  ctx.beginPath();
  ctx.moveTo(w*0.5, h*0.5);
  ctx.lineTo(w*0.485, h*0.52);
  ctx.lineTo(w*0.515, h*0.52);
  ctx.closePath();
  ctx.fill();

  // boca
  ctx.strokeStyle = '#000';
  ctx.lineWidth = Math.max(1.5, w*0.005);
  ctx.beginPath();
  ctx.moveTo(w*0.5, h*0.52);
  ctx.lineTo(w*0.5, h*0.55);
  ctx.bezierCurveTo(w*0.495, h*0.57, w*0.475, h*0.56, w*0.46, h*0.555);
  ctx.moveTo(w*0.5, h*0.55);
  ctx.bezierCurveTo(w*0.505, h*0.57, w*0.525, h*0.56, w*0.54, h*0.555);
  ctx.stroke();

  // bigotes
  ctx.lineWidth = Math.max(1, w*0.0035);
  ctx.beginPath();
  for (let s of [-1, 1]) {
    ctx.moveTo(w*(0.5 + s*0.08), h*0.51);
    ctx.lineTo(w*(0.5 + s*0.18), h*0.49);
    ctx.moveTo(w*(0.5 + s*0.08), h*0.52);
    ctx.lineTo(w*(0.5 + s*0.19), h*0.52);
    ctx.moveTo(w*(0.5 + s*0.08), h*0.53);
    ctx.lineTo(w*(0.5 + s*0.18), h*0.55);
  }
  ctx.stroke();
}

function buildCatCanvas(cat, size) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  drawCat(ctx, size, size, cat);
  return off;
}

// ==================== Generación de bordes (tabs/blanks) ====================
function generateEdges(grid) {
  // horizontal[r][c]: edge entre fila r y fila r+1, columna c. +1 = pieza r tiene tab abajo (pieza r+1 tiene blank arriba), -1 = al revés
  // vertical[r][c]: edge entre col c y col c+1, fila r. +1 = pieza c tiene tab a la derecha
  const horizontal = [];
  for (let r = 0; r < grid - 1; r++) {
    horizontal.push([]);
    for (let c = 0; c < grid; c++) {
      horizontal[r].push(Math.random() < 0.5 ? 1 : -1);
    }
  }
  const vertical = [];
  for (let r = 0; r < grid; r++) {
    vertical.push([]);
    for (let c = 0; c < grid - 1; c++) {
      vertical[r].push(Math.random() < 0.5 ? 1 : -1);
    }
  }
  return { horizontal, vertical };
}

function getPieceEdges(edges, r, c, grid) {
  // top, right, bottom, left: 0 (flat), 1 (tab outward), -1 (blank inward)
  const top = r === 0 ? 0 : -edges.horizontal[r - 1][c];   // si la edge horizontal r-1 es +1 (pieza r-1 tab abajo), pieza r tiene blank arriba (-1)
  const bottom = r === grid - 1 ? 0 : edges.horizontal[r][c];
  const left = c === 0 ? 0 : -edges.vertical[r][c - 1];
  const right = c === grid - 1 ? 0 : edges.vertical[r][c];
  return { top, right, bottom, left };
}

// ==================== Path de la pieza (jigsaw) ====================
function buildPiecePath(ctx, x, y, size, edges, tabSize) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  // top: hacia la derecha
  drawSide(ctx, x, y, x + size, y, edges.top, tabSize, 'top');
  // right: hacia abajo
  drawSide(ctx, x + size, y, x + size, y + size, edges.right, tabSize, 'right');
  // bottom: hacia la izquierda
  drawSide(ctx, x + size, y + size, x, y + size, edges.bottom, tabSize, 'bottom');
  // left: hacia arriba
  drawSide(ctx, x, y + size, x, y, edges.left, tabSize, 'left');
  ctx.closePath();
}

function drawSide(ctx, x1, y1, x2, y2, type, tab, dir) {
  if (type === 0) {
    ctx.lineTo(x2, y2);
    return;
  }
  // Outward direction (perpendicular to side, pointing away from the piece interior)
  let ox = 0, oy = 0;
  if (dir === 'top')    oy = -1;
  if (dir === 'right')  ox = 1;
  if (dir === 'bottom') oy = 1;
  if (dir === 'left')   ox = -1;
  // sign: type=+1 (tab) = bump outward; type=-1 (blank) = bump inward
  const s = type;
  // Forward unit vector
  const fx = (x2 - x1);
  const fy = (y2 - y1);
  const len = Math.sqrt(fx * fx + fy * fy);
  const ux = fx / len, uy = fy / len;

  // Punto a lo largo del lado
  const pt = (t) => ({ x: x1 + ux * len * t, y: y1 + uy * len * t });

  const a = pt(0.35);
  const b = pt(0.65);
  const m = pt(0.5);
  // Punto pico de la clavija
  const peak = { x: m.x + ox * tab * s, y: m.y + oy * tab * s };

  // Líneas + bezier
  ctx.lineTo(a.x, a.y);
  // Control points: perpendicular bump
  const c1 = { x: a.x + ox * tab * s * 1.3 - ux * len * 0.06, y: a.y + oy * tab * s * 1.3 - uy * len * 0.06 };
  const c2 = { x: b.x + ox * tab * s * 1.3 + ux * len * 0.06, y: b.y + oy * tab * s * 1.3 + uy * len * 0.06 };
  ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y);
  ctx.lineTo(x2, y2);
}

// ==================== Estado de las piezas ====================
function buildPieces() {
  const grid = state.grid;
  const cellSize = state.cellSize;
  const tabSize = state.tabSize;
  const edges = generateEdges(grid);
  state.pieces = [];
  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      const e = getPieceEdges(edges, r, c, grid);
      const targetX = state.frame.x + c * cellSize;
      const targetY = state.frame.y + r * cellSize;
      state.pieces.push({
        id: r * grid + c,
        row: r, col: c,
        edges: e,
        targetX, targetY,
        x: targetX, y: targetY,        // se mezclan abajo
        placed: false,
        zOrder: 0
      });
    }
  }
}

function shufflePieces() {
  const grid = state.grid;
  const cellSize = state.cellSize;
  const trayTop = state.trayY + 10;
  const trayLeft = 12;
  const trayRight = canvas.width - cellSize - 12;
  // colocar piezas en grilla relajada en la bandeja
  const placed = [];
  for (const p of state.pieces) {
    p.placed = false;
    let attempts = 80, x = 0, y = 0;
    while (attempts-- > 0) {
      x = trayLeft + Math.random() * (trayRight - trayLeft);
      y = trayTop + Math.random() * (canvas.height - trayTop - cellSize - 12);
      let ok = true;
      for (const q of placed) {
        if (Math.abs(q.x - x) < cellSize * 0.78 && Math.abs(q.y - y) < cellSize * 0.78) { ok = false; break; }
      }
      if (ok) break;
    }
    p.x = x; p.y = y;
    placed.push(p);
  }
  state.moves = 0;
  state.startTime = performance.now();
  state.alive = true;
  state.won = false;
}

// ==================== Layout ====================
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function setupLayout() {
  const wrapWidth = Math.min(window.innerWidth - 32, 920);
  const wrapHeight = Math.min(window.innerHeight - 230, 720);
  // Frame ocupa la mitad de la altura, tray la otra
  const isWide = wrapWidth > 720;
  let frameSize;
  if (isWide) {
    frameSize = Math.min(420, wrapHeight - 30);
  } else {
    frameSize = Math.min(wrapWidth - 30, wrapHeight * 0.55);
  }
  // múltiplo del grid
  state.grid = state.difficulty.grid;
  state.cellSize = Math.floor(frameSize / state.grid);
  frameSize = state.cellSize * state.grid;
  state.tabSize = Math.max(8, Math.floor(state.cellSize * 0.18));
  // canvas total: frame en arriba, tray abajo
  const trayHeight = state.cellSize * Math.ceil(state.pieces.length / Math.max(1, Math.floor(wrapWidth / state.cellSize))) + 60;
  canvas.style.width = Math.min(wrapWidth, 720) + 'px';
  canvas.width = Math.min(wrapWidth, 720);
  // altura del canvas: frame + 30 padding + tray
  const trayRows = Math.ceil(state.grid * state.grid / Math.max(2, Math.floor(canvas.width / state.cellSize)));
  canvas.height = frameSize + 40 + state.cellSize * Math.max(2, trayRows) + 30;
  // posiciones
  state.frame.x = (canvas.width - frameSize) / 2;
  state.frame.y = 20;
  state.frame.w = frameSize;
  state.frame.h = frameSize;
  state.trayY = state.frame.y + frameSize + 24;
}

// ==================== Render ====================
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // fondo del tablero
  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#1a1030');
  bg.addColorStop(1, '#07090f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // marco
  ctx.fillStyle = 'rgba(255, 140, 186, 0.06)';
  ctx.fillRect(state.frame.x, state.frame.y, state.frame.w, state.frame.h);
  ctx.strokeStyle = 'rgba(255, 140, 186, 0.4)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.strokeRect(state.frame.x, state.frame.y, state.frame.w, state.frame.h);
  ctx.setLineDash([]);
  // grid sutil dentro del marco
  ctx.strokeStyle = 'rgba(255, 140, 186, 0.08)';
  for (let i = 1; i < state.grid; i++) {
    const px = state.frame.x + i * state.cellSize;
    const py = state.frame.y + i * state.cellSize;
    ctx.beginPath(); ctx.moveTo(px, state.frame.y); ctx.lineTo(px, state.frame.y + state.frame.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(state.frame.x, py); ctx.lineTo(state.frame.x + state.frame.w, py); ctx.stroke();
  }

  // separación tray
  ctx.strokeStyle = 'rgba(255, 215, 94, 0.18)';
  ctx.setLineDash([10, 6]);
  ctx.beginPath();
  ctx.moveTo(20, state.trayY - 10);
  ctx.lineTo(canvas.width - 20, state.trayY - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // dibujar piezas (placed primero, después tray, después dragging arriba)
  const sorted = state.pieces.slice().sort((a, b) => {
    if (a === state.draggingPiece) return 1;
    if (b === state.draggingPiece) return -1;
    if (a.placed !== b.placed) return a.placed ? -1 : 1;
    return 0;
  });
  for (const p of sorted) {
    drawPiece(p);
  }

  // texto de "armando..."
  if (state.alive && !state.won) {
    const placed = state.pieces.filter(p => p.placed).length;
    const total = state.pieces.length;
    document.getElementById('hud-pieces').textContent = `${placed}/${total}`;
  }
}

function drawPiece(p) {
  const { x, y } = p;
  const size = state.cellSize;
  const isDragging = (p === state.draggingPiece);

  ctx.save();
  // sombra
  if (!p.placed) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = isDragging ? 22 : 10;
    ctx.shadowOffsetY = isDragging ? 10 : 5;
  }
  // dibujar la silueta primero (para que se vea la sombra)
  buildPiecePath(ctx, x, y, size, p.edges, state.tabSize);
  ctx.fillStyle = '#000';
  ctx.fill();
  ctx.restore();

  // dibujar la imagen con clip
  ctx.save();
  buildPiecePath(ctx, x, y, size, p.edges, state.tabSize);
  ctx.clip();
  // mover el catCanvas para que la celda alinee
  const dx = x - p.col * size;
  const dy = y - p.row * size;
  ctx.drawImage(state.catCanvas, 0, 0, state.frame.w, state.frame.h, dx, dy, state.frame.w, state.frame.h);
  ctx.restore();

  // borde fino
  ctx.save();
  buildPiecePath(ctx, x, y, size, p.edges, state.tabSize);
  ctx.strokeStyle = p.placed ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // si la pieza está en la celda correcta, brillito verde
  if (p.placed) {
    ctx.save();
    buildPiecePath(ctx, x, y, size, p.edges, state.tabSize);
    ctx.strokeStyle = 'rgba(95, 187, 64, 0.0)';
    ctx.stroke();
    ctx.restore();
  }
}

// ==================== Hit testing ====================
function findPieceAt(mx, my) {
  // iterar de adelante (no placed) hacia atras (placed)
  for (let i = state.pieces.length - 1; i >= 0; i--) {
    const p = state.pieces[i];
    if (p.placed) continue;
    // bounding box con tabs
    const left = p.x - state.tabSize;
    const right = p.x + state.cellSize + state.tabSize;
    const top = p.y - state.tabSize;
    const bottom = p.y + state.cellSize + state.tabSize;
    if (mx >= left && mx <= right && my >= top && my <= bottom) {
      return p;
    }
  }
  return null;
}

// ==================== Input ====================
function getMouse(e) {
  const rect = canvas.getBoundingClientRect();
  let cx, cy;
  if (e.touches && e.touches[0]) {
    cx = e.touches[0].clientX; cy = e.touches[0].clientY;
  } else if (e.changedTouches && e.changedTouches[0]) {
    cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY;
  } else {
    cx = e.clientX; cy = e.clientY;
  }
  return {
    x: (cx - rect.left) * (canvas.width / rect.width),
    y: (cy - rect.top) * (canvas.height / rect.height)
  };
}

function onPointerDown(e) {
  if (!state.alive || state.won) return;
  e.preventDefault();
  const m = getMouse(e);
  const piece = findPieceAt(m.x, m.y);
  if (piece) {
    state.draggingPiece = piece;
    state.dragOffset.x = m.x - piece.x;
    state.dragOffset.y = m.y - piece.y;
    canvas.classList.add('dragging');
  }
}

function onPointerMove(e) {
  if (!state.draggingPiece) return;
  e.preventDefault();
  const m = getMouse(e);
  state.draggingPiece.x = m.x - state.dragOffset.x;
  state.draggingPiece.y = m.y - state.dragOffset.y;
}

function onPointerUp(e) {
  if (!state.draggingPiece) return;
  e.preventDefault();
  const p = state.draggingPiece;
  state.draggingPiece = null;
  canvas.classList.remove('dragging');
  // chequear snap
  const dx = p.x - p.targetX;
  const dy = p.y - p.targetY;
  const snap = state.cellSize * 0.4;
  if (Math.abs(dx) < snap && Math.abs(dy) < snap) {
    p.x = p.targetX;
    p.y = p.targetY;
    p.placed = true;
    state.moves++;
    beep('snap');
    checkWin();
  } else {
    state.moves++;
  }
}

canvas.addEventListener('mousedown', onPointerDown);
canvas.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
canvas.addEventListener('touchstart', onPointerDown, { passive: false });
canvas.addEventListener('touchmove', onPointerMove, { passive: false });
canvas.addEventListener('touchend', onPointerUp, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { showMenu(); return; }
  if (e.key === 'p' || e.key === 'P') { showPreview(); return; }
  if (e.key === 'r' || e.key === 'R') { shufflePieces(); return; }
});

// ==================== Win / preview ====================
function checkWin() {
  const allPlaced = state.pieces.every(p => p.placed);
  if (allPlaced && !state.won) {
    state.won = true;
    state.alive = false;
    const elapsed = (performance.now() - state.startTime) / 1000;
    const key = `cats-best-${state.cat.id}-${state.difficulty.id}`;
    const prevBest = parseFloat(localStorage.getItem(key) || '999999');
    const isBest = elapsed < prevBest;
    if (isBest) localStorage.setItem(key, elapsed.toFixed(2));
    showWonOverlay(elapsed, prevBest, isBest);
    beep('win');
  }
}

function showWonOverlay(elapsed, prevBest, isBest) {
  document.getElementById('won-cat-name').textContent = `${state.cat.name} · ${state.difficulty.name}`;
  document.getElementById('won-time').textContent = formatTime(elapsed);
  document.getElementById('won-moves').textContent = state.moves;
  const bestVal = isBest ? formatTime(elapsed) + ' 🏆' : (prevBest < 999999 ? formatTime(prevBest) : '—');
  document.getElementById('won-best').textContent = bestVal;
  document.getElementById('won-title').textContent = isBest ? '🏆 ¡Récord!' : '🎉 ¡Lo armaste!';
  document.getElementById('won').classList.remove('hidden');
}

function showPreview() {
  const pv = document.getElementById('preview-overlay');
  const pc = document.getElementById('preview-canvas');
  pc.width = state.frame.w;
  pc.height = state.frame.h;
  pc.getContext('2d').drawImage(state.catCanvas, 0, 0);
  pv.classList.remove('hidden');
  setTimeout(() => pv.classList.add('hidden'), 2200);
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + (sec < 10 ? '0' + sec : sec);
}

// ==================== HUD loop ====================
function loop() {
  render();
  if (state.alive && !state.won) {
    const elapsed = (performance.now() - state.startTime) / 1000;
    document.getElementById('hud-time').textContent = formatTime(elapsed);
    document.getElementById('hud-moves').textContent = state.moves;
  }
  requestAnimationFrame(loop);
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
    case 'snap': o.type = 'triangle'; o.frequency.value = 660; o.frequency.exponentialRampToValueAtTime(990, t0 + 0.08); g.gain.setValueAtTime(0.05, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12); dur = 0.12; break;
    case 'win': o.type = 'sine'; o.frequency.value = 440; o.frequency.exponentialRampToValueAtTime(880, t0 + 0.4); g.gain.setValueAtTime(0.07, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5); dur = 0.5; break;
  }
  o.start(t0); o.stop(t0 + dur + 0.03);
}

// ==================== Menú ====================
const menu = document.getElementById('menu');
const catsGrid = document.getElementById('cats-grid');
const diffGrid = document.getElementById('diff-grid');

function buildMenu() {
  // Cats
  catsGrid.innerHTML = '';
  CATS.forEach(c => {
    const card = document.createElement('button');
    card.className = 'cat-card' + (c.id === state.cat.id ? ' active' : '');
    const cv = document.createElement('canvas');
    cv.width = 80; cv.height = 80;
    drawCat(cv.getContext('2d'), 80, 80, c);
    card.appendChild(cv);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.textContent = c.name;
    card.appendChild(nm);
    card.addEventListener('click', () => {
      state.cat = c;
      document.querySelectorAll('.cat-card').forEach(el => el.classList.remove('active'));
      card.classList.add('active');
    });
    catsGrid.appendChild(card);
  });
  // Difficulties
  diffGrid.innerHTML = '';
  DIFFICULTIES.forEach(d => {
    const card = document.createElement('button');
    card.className = 'diff-card' + (d.id === state.difficulty.id ? ' active' : '');
    card.innerHTML = `<div class="ico">${d.ico}</div><div class="nm">${d.name}</div><div class="ds">${d.ds}</div>`;
    card.addEventListener('click', () => {
      state.difficulty = d;
      document.querySelectorAll('.diff-card').forEach(el => el.classList.remove('active'));
      card.classList.add('active');
    });
    diffGrid.appendChild(card);
  });
}

function startGame() {
  state.grid = state.difficulty.grid;
  // pre-build pieces vacías para que setupLayout calcule trayHeight
  state.pieces = new Array(state.grid * state.grid).fill(null).map((_, i) => ({}));
  setupLayout();
  state.catCanvas = buildCatCanvas(state.cat, state.frame.w);
  buildPieces();
  shufflePieces();
  // mostrar preview brevemente
  showPreview();
  // HUD
  document.getElementById('hud-cat').textContent = state.cat.name + ' · ' + state.difficulty.name;
  const key = `cats-best-${state.cat.id}-${state.difficulty.id}`;
  const prev = parseFloat(localStorage.getItem(key) || '999999');
  document.getElementById('hud-best').textContent = prev < 999999 ? formatTime(prev) : '—';
  menu.classList.add('hidden');
  document.getElementById('won').classList.add('hidden');
}

function showMenu() {
  state.alive = false;
  buildMenu();
  menu.classList.remove('hidden');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-help').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('btn-help-open').addEventListener('click', () => document.getElementById('help-modal').classList.remove('hidden'));
document.getElementById('help-close').addEventListener('click', () => document.getElementById('help-modal').classList.add('hidden'));
document.getElementById('btn-preview').addEventListener('click', showPreview);
document.getElementById('btn-shuffle').addEventListener('click', shufflePieces);
document.getElementById('btn-menu-mid').addEventListener('click', showMenu);
document.getElementById('won-next').addEventListener('click', () => {
  // pasar al siguiente gato del array
  const idx = CATS.findIndex(c => c.id === state.cat.id);
  state.cat = CATS[(idx + 1) % CATS.length];
  startGame();
});
document.getElementById('won-replay').addEventListener('click', startGame);
document.getElementById('won-menu').addEventListener('click', showMenu);

window.addEventListener('resize', () => {
  if (state.alive || state.won) {
    setupLayout();
    state.catCanvas = buildCatCanvas(state.cat, state.frame.w);
    // re-target pieces
    for (const p of state.pieces) {
      p.targetX = state.frame.x + p.col * state.cellSize;
      p.targetY = state.frame.y + p.row * state.cellSize;
      if (p.placed) {
        p.x = p.targetX;
        p.y = p.targetY;
      }
    }
  }
});

if (!localStorage.getItem('cats-seen-help')) {
  document.getElementById('help-modal').classList.remove('hidden');
  localStorage.setItem('cats-seen-help', '1');
}

buildMenu();
requestAnimationFrame(loop);
