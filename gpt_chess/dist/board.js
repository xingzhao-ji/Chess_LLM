import { perspective, tactical, squareAt, coordinates, SCENE } from './geometry.js';
import { PIECE_NAMES, COLOR_NAMES } from './game.js';
import { pieceIcon } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const element = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
};

export class BoardView {
  constructor(root, atlas, onSquare, onDrop) {
    this.root = root; this.atlas = atlas; this.onSquare = onSquare; this.onDrop = onDrop;
    this.svg = root.querySelector('.board-grid');
    this.pieces = root.querySelector('.piece-layer');
    this.focused = 'e2'; this.polygons = new Map(); this.drag = null;
    this.svg.addEventListener('keydown', event => this.keydown(event));
    root.addEventListener('pointerdown', event => this.pointerDown(event));
    root.addEventListener('pointermove', event => this.pointerMove(event));
    root.addEventListener('pointerup', event => this.pointerUp(event));
    root.addEventListener('pointercancel', () => this.cancelDrag());
    root.addEventListener('click', event => {
      if (this.suppressClick) { this.suppressClick = false; return; }
      const square = event.target.closest('[data-square]')?.dataset.square;
      if (square) { this.focused = square; this.onSquare(square); }
    });
  }
  render({ game, selected, targets, flipped, flat, guides, lastMove, animate = true }) {
    const focusInside = this.svg.contains(document.activeElement);
    const oldPositions = new Map([...this.pieces.children].map(el => [el.dataset.square, el.getBoundingClientRect()]));
    this.state = { game, selected, targets, flipped, flat, guides, lastMove };
    this.root.classList.toggle('flat', flat);
    this.projection = flat ? tactical : perspective;
    this.svg.setAttribute('viewBox', flat ? '0 0 1000 1000' : `0 0 1000 ${SCENE.height / SCENE.width * 1000}`);
    this.svg.replaceChildren(); this.pieces.replaceChildren(); this.polygons.clear();
    const H = flat ? 1000 : SCENE.height / SCENE.width * 1000;
    if (!flat) this.svg.append(element('defs'));
    const last = game.chess.history({ verbose: true }).at(-1);
    const checkSquare = game.chess.isCheck() ? game.chess.board().flat().find(p => p?.type === 'k' && p.color === game.chess.turn())?.square : null;
    for (let row = 0; row < 8; row++) {
      const group = element('g', { role: 'row' });
      for (let col = 0; col < 8; col++) {
        const square = squareAt(col, row, flipped), piece = game.chess.get(square);
        const points = [[col, row], [col + 1, row], [col + 1, row + 1], [col, row + 1]]
          .map(([x, y]) => this.projection.project(x, y)).map(([x, y]) => `${x * 1000},${y * H}`).join(' ');
        const target = targets.find(m => m.to === square);
        const isLast = lastMove && (last?.from === square || last?.to === square);
        const label = `${square}${piece ? `, ${COLOR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]}` : ', empty'}${square === selected ? ', selected' : ''}${target ? ', legal destination' : ''}${square === checkSquare ? ', king in check' : ''}`;
        const classes = ['square', (col + row) % 2 ? 'dark' : 'light',
          square === selected ? 'selected' : '', target && guides ? 'legal' : '', isLast ? 'last' : '', square === checkSquare ? 'check' : ''].filter(Boolean).join(' ');
        const polygon = element('polygon', { points, class: classes, role: 'gridcell', 'aria-label': label,
          'aria-selected': square === selected, tabindex: square === this.focused ? '0' : '-1', 'data-square': square });
        // The generated plate has reversed colors on the two far ranks. Repair
        // those with real marble texture samples and exact mathematical cells.
        if (!flat && row < 2) this.drawMarbleCell(group, points, row, col);
        group.append(polygon); this.polygons.set(square, polygon);
        if (target && guides) {
          const [x, y] = this.projection.project(col + 0.5, row + 0.54);
          const width = this.projection.project(col + 1, row + 0.5)[0] - this.projection.project(col, row + 0.5)[0];
          group.append(element('ellipse', { cx: x * 1000, cy: y * H,
            rx: width * (piece ? 410 : 105), ry: width * (piece ? 410 : 105) * (flat ? 1 : 0.46),
            class: piece ? 'capture-marker' : 'move-marker', 'aria-hidden': 'true' }));
        }
      }
      this.svg.append(group);
    }
    // Always show labels in tactical view; scene view has the original engraved labels.
    if (flat || flipped) this.drawCoordinates(H, flat);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const square = squareAt(col, row, flipped), piece = game.chess.get(square);
      if (piece) this.drawPiece(piece, square, col, row, selected, flat);
    }
    if (focusInside) this.polygons.get(this.focused)?.focus({ preventScroll: true });
    if (animate && last && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const el = this.pieces.querySelector(`[data-square="${last.to}"]`), from = oldPositions.get(last.from);
      if (el && from && !oldPositions.has(last.to)) {
        const to = el.getBoundingClientRect();
        el.animate?.([{ transform: `translate(${from.x - to.x}px, ${from.y - to.y}px)` }, { transform: 'translate(0,0)' }], { duration: 260, easing: 'cubic-bezier(.2,.65,.3,1)' });
      }
    }
  }
  drawPiece(piece, square, col, row, selected, flat) {
    const button = document.createElement('button');
    button.type = 'button'; button.tabIndex = -1; button.dataset.square = square;
    button.className = `piece ${piece.color}${square === selected ? ' chosen' : ''}${flat ? ' flat-piece' : ''}`;
    button.setAttribute('aria-hidden', 'true');
    button.title = `${COLOR_NAMES[piece.color]} ${PIECE_NAMES[piece.type]} · ${square}`;
    const [x, y] = this.projection.project(col + 0.5, row + (flat ? 0.5 : 0.81));
    const cell = this.projection.project(col + 1, row + 0.6)[0] - this.projection.project(col, row + 0.6)[0];
    if (flat) {
      button.style.cssText = `left:${(x - cell * 0.46) * 100}%;top:${(y - cell * 0.46) * 100}%;width:${cell * 92}%;height:${cell * 92}%;z-index:5`;
      button.innerHTML = pieceIcon(piece.type, piece.color);
    } else {
      const meta = this.atlas[piece.color][piece.type];
      const scale = cell * (piece.type === 'p' ? 0.45 : 0.70) / meta.baseWidth;
      const width = meta.w * scale, height = meta.h * scale / (SCENE.height / SCENE.width);
      button.style.cssText = `left:${(x - meta.anchorX * scale) * 100}%;top:${(y - height) * 100}%;width:${width * 100}%;height:${height * 100}%;z-index:${Math.round(y * 1000)}`;
      const sprite = document.createElement('span'); sprite.className = `sculpture ${piece.color}`;
      if (piece.type === 'n' && col >= 4) sprite.classList.add('mirrored');
      sprite.style.cssText = `background-size:${1536 / meta.w * 100}% ${1024 / meta.h * 100}%;background-position:${meta.x / (1536 - meta.w) * 100}% ${meta.y / (1024 - meta.h) * 100}%`;
      button.append(sprite);
    }
    this.pieces.append(button);
  }
  drawMarbleCell(group, points, row, col) {
    const pairs = points.split(' ').map(p => p.split(',').map(Number));
    const xs = pairs.map(p => p[0]), ys = pairs.map(p => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys), width = Math.max(...xs) - x, height = Math.max(...ys) - y;
    const id = `marble-cell-${row}-${col}`;
    const clip = element('clipPath', { id, clipPathUnits: 'userSpaceOnUse' });
    clip.append(element('polygon', { points })); this.svg.querySelector('defs').append(clip);
    const layer = element('g', { 'clip-path': `url(#${id})`, 'aria-hidden': 'true', 'pointer-events': 'none' });
    const tile = element('svg', { x, y, width, height,
      viewBox: (row + col) % 2 ? '745 495 70 44' : '870 495 70 44', preserveAspectRatio: 'none' });
    tile.append(element('image', { href: './assets/vale.webp', width: SCENE.width, height: SCENE.height }));
    layer.append(tile); group.append(layer, element('polygon', { points, fill: 'none', stroke: '#b59b6f',
      'stroke-width': 1.5, 'aria-hidden': 'true', 'pointer-events': 'none' }));
  }
  drawCoordinates(H, flat) {
    const group = element('g', { class: `coordinates ${flat ? '' : 'on-stone'}`, 'aria-hidden': 'true' });
    for (let i = 0; i < 8; i++) {
      const sq = squareAt(i, 7, this.state.flipped);
      const [x, y] = this.projection.project(i + 0.5, 8.34);
      const label = element('text', { x: x * 1000, y: y * H, 'text-anchor': 'middle' }); label.textContent = sq[0].toUpperCase(); group.append(label);
      const [rx, ry] = this.projection.project(flat ? -0.25 : -0.38, i + 0.6);
      const rank = element('text', { x: rx * 1000, y: ry * H, 'text-anchor': 'middle' }); rank.textContent = squareAt(0, i, this.state.flipped)[1]; group.append(rank);
      if (!flat) {
        const [rightX, rightY] = this.projection.project(8.38, i + 0.6);
        const rightRank = element('text', { x: rightX * 1000, y: rightY * H, 'text-anchor': 'middle' });
        rightRank.textContent = rank.textContent; group.append(rightRank);
      }
    }
    this.svg.append(group);
  }
  keydown(event) {
    if (!this.state) return;
    let [col, row] = coordinates(this.focused, this.state.flipped);
    const directions = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (directions[event.key]) {
      event.preventDefault(); const [dx, dy] = directions[event.key];
      const next = squareAt(Math.max(0, Math.min(7, col + dx)), Math.max(0, Math.min(7, row + dy)), this.state.flipped);
      this.polygons.get(this.focused)?.setAttribute('tabindex', '-1'); this.focused = next;
      this.polygons.get(next)?.setAttribute('tabindex', '0'); this.polygons.get(next)?.focus();
    } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.onSquare(this.focused); }
  }
  pointerDown(event) {
    if (event.button !== 0 || !this.state || this.state.game.paused || this.state.game.outcome) return;
    const square = event.target.closest('[data-square]')?.dataset.square;
    const piece = square && this.state.game.chess.get(square);
    if (!piece || piece.color !== this.state.game.chess.turn()) return;
    this.drag = { square, x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, ghost: null };
  }
  pointerMove(event) {
    if (!this.drag) return;
    if (!this.drag.moved && Math.hypot(event.clientX - this.drag.x, event.clientY - this.drag.y) > 9) {
      this.drag.moved = true;
      this.root.setPointerCapture?.(event.pointerId);
      this.onSquare(this.drag.square, true);
      const original = this.pieces.querySelector(`[data-square="${this.drag.square}"]`);
      if (original) {
        const bounds = original.getBoundingClientRect(); const ghost = original.cloneNode(true);
        ghost.removeAttribute('data-square'); ghost.className += ' drag-ghost';
        ghost.style.cssText = `position:fixed;width:${bounds.width}px;height:${bounds.height}px;z-index:9999;pointer-events:none;opacity:.95`;
        document.body.append(ghost); this.drag.ghost = ghost; this.drag.width = bounds.width; this.drag.height = bounds.height;
      }
    }
    if (this.drag.ghost) {
      this.drag.ghost.style.left = `${event.clientX - this.drag.width / 2}px`;
      this.drag.ghost.style.top = `${event.clientY - this.drag.height * 0.85}px`;
    }
  }
  pointerUp(event) {
    if (!this.drag) return;
    const drag = this.drag;
    if (drag.moved) {
      const rect = this.root.getBoundingClientRect();
      const [col, row] = this.projection.invert((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
      const target = squareAt(col, row, this.state.flipped);
      this.suppressClick = true;
      if (target) this.onDrop(drag.square, target);
      // Pointer-captured click is consumed, but the next deliberate click never is.
      setTimeout(() => { this.suppressClick = false; }, 0);
    }
    this.cancelDrag();
  }
  cancelDrag() { this.drag?.ghost?.remove(); this.drag = null; }
}
