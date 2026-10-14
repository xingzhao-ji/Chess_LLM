import { Chess } from './vendor/chess.js';

export const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
export const COLOR_NAMES = { w: 'Ivory', b: 'Obsidian' };
export const CONTROLS = {
  none: { label: 'Unhurried', seconds: null, increment: 0 },
  '3+2': { label: '3 + 2', seconds: 180, increment: 2 },
  '5+3': { label: '5 + 3', seconds: 300, increment: 3 },
  '10+5': { label: '10 + 5', seconds: 600, increment: 5 },
  '15+10': { label: '15 + 10', seconds: 900, increment: 10 },
};

/** One local, two-person game. Wall-clock accounting survives background tabs. */
export class GameSession {
  constructor({ control = 'none', names = {}, now = () => Date.now() } = {}) {
    this.now = now;
    this.control = Object.hasOwn(CONTROLS, control) ? control : 'none';
    this.names = { w: cleanName(names.w, 'Ivory'), b: cleanName(names.b, 'Obsidian') };
    this.chess = new Chess();
    this.clocks = { w: CONTROLS[this.control].seconds, b: CONTROLS[this.control].seconds };
    this.clockHistory = [];
    this.running = false;
    this.paused = false;
    this.outcome = null;
    this.anchor = this.now();
  }
  legalMoves(square) {
    return this.outcome || this.paused ? [] : this.chess.moves({ square, verbose: true });
  }
  remaining(color, time = this.now()) {
    const base = this.clocks[color];
    if (base === null) return null;
    const elapsed = this.running && !this.paused && !this.outcome && this.chess.turn() === color
      ? Math.max(0, time - this.anchor) / 1000 : 0;
    return Math.max(0, base - elapsed);
  }
  settle(time = this.now()) {
    const turn = this.chess.turn();
    this.clocks[turn] = this.remaining(turn, time);
    this.anchor = time;
    if (this.running && !this.paused && !this.outcome && this.clocks[turn] === 0) {
      const winner = turn === 'w' ? 'b' : 'w';
      const hasMaterial = this.chess.board().flat().some(p => p && p.color === winner && p.type !== 'k');
      this.outcome = !hasMaterial || this.chess.isInsufficientMaterial()
        ? { winner: null, reason: 'Time expired · no mating material' }
        : { winner, reason: 'Time expired' };
      this.running = false;
    }
    return this.outcome;
  }
  move(from, to, promotion = 'q') {
    this.settle();
    if (this.outcome || this.paused) return null;
    const before = { ...this.clocks };
    let move;
    try { move = this.chess.move({ from, to, promotion }); } catch { return null; }
    this.clockHistory.push(before);
    if (this.clocks[move.color] !== null) this.clocks[move.color] += CONTROLS[this.control].increment;
    this.running = true;
    this.anchor = this.now();
    this.updateOutcome();
    return move;
  }
  updateOutcome() {
    const c = this.chess;
    if (c.isCheckmate()) this.outcome = { winner: c.turn() === 'w' ? 'b' : 'w', reason: 'Checkmate' };
    else if (c.isStalemate()) this.outcome = { winner: null, reason: 'Stalemate' };
    else if (c.isInsufficientMaterial()) this.outcome = { winner: null, reason: 'Insufficient material' };
    else if (c.isThreefoldRepetition()) this.outcome = { winner: null, reason: 'Threefold repetition' };
    else if (c.isDrawByFiftyMoves()) this.outcome = { winner: null, reason: 'Fifty-move rule' };
    if (this.outcome) this.running = false;
  }
  undo() {
    this.settle();
    // Ended games are final; a new game remains available.
    if (this.outcome || !this.chess.history().length) return null;
    const move = this.chess.undo();
    this.clocks = this.clockHistory.pop();
    this.outcome = null;
    this.running = this.chess.history().length > 0;
    this.anchor = this.now();
    return move;
  }
  pause() { this.settle(); if (!this.outcome) this.paused = true; }
  resume() { this.paused = false; this.anchor = this.now(); }
  finish(winner, reason) {
    this.settle();
    if (this.outcome) return;
    this.outcome = { winner, reason };
    this.running = false;
  }
  serialize() {
    this.settle();
    return { version: 1, control: this.control, names: this.names,
      moves: this.chess.history(), clocks: this.clocks, clockHistory: this.clockHistory,
      running: this.running, paused: this.paused, outcome: this.outcome, anchor: this.anchor };
  }
  static restore(data, now = () => Date.now()) {
    if (!data || data.version !== 1 || !Array.isArray(data.moves) || data.moves.length > 2000) throw Error('Invalid save');
    const game = new GameSession({ control: data.control, names: data.names, now });
    for (const san of data.moves) game.chess.move(san);
    const validClocks = clocks => clocks && ['w', 'b'].every(color => game.control === 'none'
      ? clocks[color] === null : Number.isFinite(clocks[color]) && clocks[color] >= 0);
    if (!validClocks(data.clocks) || !Number.isFinite(data.anchor) || !Array.isArray(data.clockHistory)
      || data.clockHistory.length !== data.moves.length || !data.clockHistory.every(validClocks)) throw Error('Invalid clocks');
    game.clocks = { ...data.clocks };
    game.clockHistory = data.clockHistory.map(c => ({ ...c }));
    game.running = Boolean(data.running);
    game.paused = Boolean(data.paused);
    game.outcome = data.outcome && [null, 'w', 'b'].includes(data.outcome.winner) && typeof data.outcome.reason === 'string'
      ? { winner: data.outcome.winner, reason: data.outcome.reason.slice(0, 80) } : null;
    game.anchor = data.anchor;
    game.updateOutcome();
    game.settle();
    return game;
  }
  pgn() {
    const result = !this.outcome ? '*' : this.outcome.winner === 'w' ? '1-0' : this.outcome.winner === 'b' ? '0-1' : '1/2-1/2';
    this.chess.header('Event', 'The Gilded Vale', 'Site', 'Local two-player game',
      'Date', new Date().toISOString().slice(0, 10).replaceAll('-', '.'), 'White', this.names.w, 'Black', this.names.b,
      'TimeControl', this.control === 'none' ? '-' : `${CONTROLS[this.control].seconds}+${CONTROLS[this.control].increment}`,
      'Result', result);
    return this.chess.pgn({ maxWidth: 80 });
  }
}

function cleanName(name, fallback) { return typeof name === 'string' && name.trim() ? name.trim().slice(0, 24) : fallback; }

export function formatClock(value) {
  if (value === null) return '∞';
  const seconds = Math.max(0, Math.ceil(value));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
