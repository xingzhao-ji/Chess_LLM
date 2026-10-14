import { GameSession, PIECE_NAMES, COLOR_NAMES, CONTROLS, formatClock } from './game.js';
import { BoardView } from './board.js';
import { icon, pieceIcon } from './icons.js';
import { AtmosphereAudio } from './audio.js';

const $ = id => document.getElementById(id);
const SAVE_KEY = 'gilded-vale-game-v1', PREF_KEY = 'gilded-vale-preferences-v1';
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const prefs = { guides: true, lastMove: true, autoFlip: false, quiet: matchMedia('(prefers-reduced-motion: reduce)').matches,
  flat: matchMedia('(max-width: 760px)').matches, evening: false, ...read(PREF_KEY) };
let game = new GameSession(), restored = false, invalidSave = false;
const saved = read(SAVE_KEY);
if (saved) { try { game = GameSession.restore(saved); restored = true; } catch { invalidSave = true; } }
let selected = null, targets = [], flipped = prefs.autoFlip && game.chess.turn() === 'b';
let board, toastTimeout, confirmCallback, pendingPromotion, shownOutcome = false, saveWarning = false;
const audio = new AtmosphereAudio();

for (const slot of document.querySelectorAll('[data-icon]')) slot.innerHTML = icon(slot.dataset.icon);

function toast(message) {
  $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { $('toast').hidden = true; }, 3800);
}
function announce(message) { $('announcement').textContent = message; }
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(game.serialize())); localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); }
  catch { if (!saveWarning) { saveWarning = true; toast('Browser storage is unavailable. Export PGN to keep this game.'); } }
}
function showDialog(id) { const dialog = $(id); if (!dialog.open) dialog.showModal(); }
function closeDialogs() { for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); }
function setTool(id, name, label) {
  $(id).querySelector('[data-icon]').innerHTML = icon(name);
  const text = $(id).querySelector('.tool-label'); if (text) text.textContent = label;
  $(id).setAttribute('aria-label', label);
}
function clearSelection() { selected = null; targets = []; }
function render(animate = false) {
  if (!board) return;
  board.render({ game, selected, targets, flipped, flat: prefs.flat, guides: prefs.guides, lastMove: prefs.lastMove, animate: animate && !prefs.quiet });
  $('pause-cover').hidden = !game.paused;
  for (const color of ['w', 'b']) {
    $('name-' + color).textContent = game.names[color];
    $('player-' + color).classList.toggle('active', !game.outcome && !game.paused && game.chess.turn() === color);
    $('player-' + color).setAttribute('aria-label', `${game.names[color]}, ${color === 'w' ? 'White' : 'Black'}`);
    $('caption-' + color).textContent = game.outcome ? 'FINISHED' : game.paused ? 'PAUSED' : game.chess.turn() === color ? 'YOUR MOVE' : 'WAITING';
  }
  updateClocks(); renderCaptures(); renderStatus(); renderJournal();
  const history = game.chess.history();
  $('takeback').disabled = !history.length || Boolean(game.outcome) || game.paused;
  $('pause').disabled = Boolean(game.outcome) || game.paused;
  $('offer-draw').disabled = Boolean(game.outcome) || game.paused;
  $('resign').disabled = Boolean(game.outcome) || game.paused;
  setTool('toggle-view', prefs.flat ? 'mountain' : 'grid', prefs.flat ? 'Scenic view' : 'Tactical view');
  $('toggle-view').title = `${prefs.flat ? 'Scenic' : 'Tactical'} view (V)`;
  if (game.outcome && !shownOutcome) showResult();
}
function updateClocks() {
  for (const color of ['w', 'b']) {
    const value = game.remaining(color), text = formatClock(value), clock = $('clock-' + color);
    if (clock.textContent !== text) clock.textContent = text;
    clock.classList.toggle('low', value !== null && value < 30 && !game.outcome);
    clock.setAttribute('aria-label', `${game.names[color]}: ${value === null ? 'no time limit' : text + ' remaining'}`);
  }
}
function renderStatus() {
  const turn = game.chess.turn(), name = game.names[turn];
  $('turn-gem').classList.toggle('black', turn === 'b');
  $('move-count').textContent = `MOVE ${String(game.chess.moveNumber()).padStart(2, '0')}`;
  let title = `${name} to move`, detail = 'Choose a piece. Find your next move.';
  if (game.chess.isCheck()) { title = `${name} is in check`; detail = 'Protect your king to continue.'; }
  if (selected) {
    const piece = game.chess.get(selected), count = new Set(targets.map(m => m.to)).size;
    title = `${PIECE_NAMES[piece.type][0].toUpperCase() + PIECE_NAMES[piece.type].slice(1)} · ${selected}`;
    detail = count ? `${count} legal ${count === 1 ? 'destination' : 'destinations'}. Choose a square to move.` : 'No legal moves. Choose another piece.';
  }
  if (game.paused) { title = 'A moment of stillness'; detail = 'Both clocks are paused.'; }
  if (game.outcome) { title = game.outcome.winner ? `${game.names[game.outcome.winner]} wins` : 'A game shared, a draw'; detail = `${game.outcome.reason} · Open the journal to review.`; }
  $('turn-heading').textContent = title; $('turn-instruction').textContent = detail;
}
function renderCaptures() {
  const moves = game.chess.history({ verbose: true });
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }, points = { w: 0, b: 0 };
  for (const piece of game.chess.board().flat().filter(Boolean)) points[piece.color] += values[piece.type];
  for (const color of ['w', 'b']) {
    const captured = moves.filter(m => m.color === color && m.captured).map(m => m.captured).sort((a, b) => values[b] - values[a]);
    const node = $('captures-' + color); node.innerHTML = captured.map(p => pieceIcon(p, color === 'w' ? 'b' : 'w')).join('');
    const delta = points[color] - points[color === 'w' ? 'b' : 'w'];
    if (delta > 0) { const score = document.createElement('span'); score.className = 'score'; score.textContent = `+${delta}`; node.append(score); }
    node.setAttribute('aria-label', `${game.names[color]} captured: ${captured.length ? captured.map(p => PIECE_NAMES[p]).join(', ') : 'none'}${delta > 0 ? `. Material advantage ${delta}` : ''}`);
  }
}
function renderJournal() {
  const history = game.chess.history(), list = $('move-list'); list.replaceChildren();
  if (!history.length) {
    const empty = document.createElement('p'); empty.className = 'journal-empty'; empty.textContent = 'A quiet board. A thousand possibilities.\nYour first move begins the story.'; list.append(empty);
  } else for (let i = 0; i < history.length; i += 2) {
    const row = document.createElement('div'); row.className = 'move-row';
    for (const [j, value] of [String(i / 2 + 1).padStart(2, '0'), history[i], history[i + 1] || '…'].entries()) {
      const cell = document.createElement('span'); cell.textContent = value;
      if (j > 0 && i + j - 1 === history.length - 1) cell.className = 'latest';
      row.append(cell);
    }
    list.append(row);
  }
  $('journal-description').textContent = `${game.names.w} & ${game.names.b} · ${CONTROLS[game.control].label}`;
}
function selectSquare(square, force = false) {
  game.settle();
  if (game.paused || game.outcome) { render(); return; }
  if (!force && selected && targets.some(m => m.to === square)) { attemptMove(selected, square); return; }
  const piece = game.chess.get(square);
  if (piece?.color === game.chess.turn()) {
    if (selected === square && !force) clearSelection();
    else { selected = square; targets = game.legalMoves(square); announce(`${game.names[piece.color]} ${PIECE_NAMES[piece.type]} on ${square}. ${new Set(targets.map(m => m.to)).size} legal destinations.`); }
  } else if (selected) { toast('That square is not a legal destination.'); }
  else if (piece) { toast(`${game.names[game.chess.turn()]} moves next.`); }
  render();
}
function attemptMove(from, to) {
  game.settle();
  if (game.outcome) { render(); return; }
  const candidates = game.legalMoves(from).filter(move => move.to === to);
  if (!candidates.length) { if (from !== to) toast('That move is not legal. Your piece stays in place.'); return; }
  if (candidates.some(move => move.promotion)) {
    pendingPromotion = { from, to }; const container = $('promotion-choices'); container.replaceChildren();
    for (const type of ['q', 'r', 'b', 'n']) {
      const button = document.createElement('button'); button.type = 'button';
      button.innerHTML = pieceIcon(type, game.chess.turn()) + `<span>${PIECE_NAMES[type][0].toUpperCase() + PIECE_NAMES[type].slice(1)}</span>`;
      button.setAttribute('aria-label', `Promote to ${PIECE_NAMES[type]}`);
      button.addEventListener('click', () => { $('promotion-dialog').close(); pendingPromotion = null; commitMove(from, to, type); });
      container.append(button);
    }
    showDialog('promotion-dialog');
  } else commitMove(from, to);
}
function commitMove(from, to, promotion) {
  const move = game.move(from, to, promotion);
  if (!move) { render(); return; }
  clearSelection(); audio.move(Boolean(move.captured));
  if (prefs.autoFlip) flipped = game.chess.turn() === 'b';
  board.focused = to;
  announce(`${game.names[move.color]} played ${move.san}. ${game.outcome ? game.outcome.reason : game.names[game.chess.turn()] + ' to move.'}`);
  render(true); persist();
}
function confirmAction(title, message, callback, accept = 'Accept') {
  closeDialogs(); confirmCallback = callback;
  $('confirm-title').textContent = title; $('confirm-message').textContent = message;
  $('confirm-yes').textContent = accept; showDialog('confirm-dialog');
}
function showResult() {
  shownOutcome = true; closeDialogs(); pendingPromotion = null;
  const result = game.outcome;
  $('result-title').textContent = result.winner ? `${game.names[result.winner]} wins.` : 'An honorable draw.';
  $('result-reason').textContent = `${result.reason}. ${game.chess.history().length} half-moves played on the castle terrace.`;
  showDialog('result-dialog'); announce(`${$('result-title').textContent} ${result.reason}.`);
}
function applyPreferences() {
  document.body.classList.toggle('quiet', prefs.quiet);
  document.body.classList.toggle('evening', prefs.evening);
  $('legal-guides').checked = prefs.guides; $('last-markers').checked = prefs.lastMove;
  $('auto-flip').checked = prefs.autoFlip; $('quiet-motion').checked = prefs.quiet;
  $('golden-light').classList.toggle('active', !prefs.evening); $('evening-light').classList.toggle('active', prefs.evening);
  $('golden-light').setAttribute('aria-pressed', String(!prefs.evening)); $('evening-light').setAttribute('aria-pressed', String(prefs.evening));
}
function toggleView() { prefs.flat = !prefs.flat; applyPreferences(); render(); persist(); }
function flipBoard() { flipped = !flipped; render(); announce(`${flipped ? 'Obsidian' : 'Ivory'} is now at the near side.`); }
function toggleImmersion(force) {
  const active = typeof force === 'boolean' ? force : !document.body.classList.contains('immersive');
  document.body.classList.toggle('immersive', active); $('leave-immersive').hidden = !active;
  $('immersive').setAttribute('aria-pressed', String(active));
  if (active) $('leave-immersive').focus(); else $('immersive').focus();
}
function openNewGame() {
  closeDialogs(); const form = $('new-form'); form.elements.white.value = game.names.w; form.elements.black.value = game.names.b;
  form.elements.control.value = game.control; showDialog('new-dialog');
}
function bindControls() {
  $('new-game').addEventListener('click', openNewGame);
  $('play-again').addEventListener('click', openNewGame);
  $('new-form').addEventListener('submit', event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    game = new GameSession({ control: data.get('control'), names: { w: data.get('white'), b: data.get('black') } });
    clearSelection(); flipped = false; shownOutcome = false; board.focused = 'e2';
    closeDialogs(); render(); persist(); announce(`${game.names.w} plays White and moves first. A new game begins.`);
  });
  for (const button of document.querySelectorAll('.close-dialog')) button.addEventListener('click', () => button.closest('dialog').close());
  $('settings').addEventListener('click', () => showDialog('settings-dialog'));
  $('help').addEventListener('click', () => showDialog('help-dialog'));
  $('view-reference').addEventListener('click', () => { $('settings-dialog').close(); showDialog('reference-dialog'); });
  $('open-journal').addEventListener('click', () => { renderJournal(); showDialog('journal-dialog'); $('move-list').parentElement.scrollTop = 100000; });
  $('review-game').addEventListener('click', () => { $('result-dialog').close(); renderJournal(); showDialog('journal-dialog'); });
  $('toggle-view').addEventListener('click', toggleView); $('flip-board').addEventListener('click', flipBoard);
  $('immersive').addEventListener('click', () => toggleImmersion()); $('leave-immersive').addEventListener('click', () => toggleImmersion(false));
  $('fullscreen').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else toast('Fullscreen is not available here. Try immersive mode.');
    } catch { toast('Fullscreen is unavailable in this window. Try immersive mode.'); }
  });
  document.addEventListener('fullscreenchange', () => $('fullscreen').setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Enter fullscreen'));
  $('toggle-sound').addEventListener('click', async () => {
    try { const enabled = await audio.toggle(); $('toggle-sound').setAttribute('aria-pressed', String(enabled));
      setTool('toggle-sound', enabled ? 'sound' : 'mute', enabled ? 'Sound on' : 'Sound off');
      $('toggle-sound').title = enabled ? 'Disable waterfall ambience and piece sounds' : 'Enable waterfall ambience and piece sounds';
    } catch { toast('Sound is unavailable in this browser. The game is ready to play.'); }
  });
  for (const [id, key] of [['legal-guides', 'guides'], ['last-markers', 'lastMove'], ['auto-flip', 'autoFlip'], ['quiet-motion', 'quiet']]) {
    $(id).addEventListener('change', event => { prefs[key] = event.target.checked;
      if (key === 'autoFlip' && prefs.autoFlip) flipped = game.chess.turn() === 'b';
      applyPreferences(); render(); persist(); });
  }
  for (const [id, value] of [['golden-light', false], ['evening-light', true]]) $(id).addEventListener('click', () => { prefs.evening = value; applyPreferences(); persist(); });
  $('takeback').addEventListener('click', () => {
    const last = game.chess.history().at(-1); if (!last || game.outcome) return;
    confirmAction(`Take back ${last}?`, 'Both players must agree. This restores the board and both clocks to the moment before the last move.', () => {
      const move = game.undo(); if (!move) { render(); return; }
      clearSelection(); if (prefs.autoFlip) flipped = game.chess.turn() === 'b'; render(); persist(); announce('Takeback accepted. ' + game.names[game.chess.turn()] + ' to move.');
    }, 'Both agree');
  });
  $('pause').addEventListener('click', () => confirmAction('Take a moment?', 'Ask the other player before pausing. Both clocks stop only after agreement.', () => { game.pause(); clearSelection(); render(); persist(); }, 'Both agree'));
  $('resume-game').addEventListener('click', () => { game.resume(); render(); persist(); announce('Game resumed. ' + game.names[game.chess.turn()] + ' to move.'); });
  $('offer-draw').addEventListener('click', () => {
    const from = game.chess.turn(), to = from === 'w' ? 'b' : 'w';
    confirmAction('A draw, by agreement?', `${game.names[from]} offers a draw. ${game.names[to]}, would you like to accept? The clock continues until a decision.`, () => {
      game.finish(null, 'Draw by agreement'); clearSelection(); render(); persist();
    }, 'Accept draw');
  });
  $('resign').addEventListener('click', () => {
    const resigning = game.chess.turn();
    confirmAction(`Resign as ${game.names[resigning]}?`, `${game.names[resigning === 'w' ? 'b' : 'w']} will win this game. This decision ends the game.`, () => {
      game.finish(resigning === 'w' ? 'b' : 'w', 'Resignation'); clearSelection(); render(); persist();
    }, 'Resign');
  });
  $('confirm-no').addEventListener('click', () => { $('confirm-dialog').close(); confirmCallback = null; });
  $('confirm-yes').addEventListener('click', () => { $('confirm-dialog').close(); const callback = confirmCallback; confirmCallback = null; callback?.(); });
  $('confirm-dialog').addEventListener('cancel', () => { confirmCallback = null; });
  $('promotion-dialog').addEventListener('cancel', event => { event.preventDefault(); toast('Choose a piece to complete promotion.'); });
  $('export-pgn').addEventListener('click', () => {
    const blob = new Blob([game.pgn()], { type: 'application/x-chess-pgn' }); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gilded-vale-${new Date().toISOString().slice(0, 10)}.pgn`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Game exported as PGN.');
  });
  document.addEventListener('keydown', event => {
    if (document.querySelector('dialog[open]') || event.target.matches('input,textarea,select') || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key.toLowerCase() === 'f') { event.preventDefault(); flipBoard(); }
    if (event.key.toLowerCase() === 'v') { event.preventDefault(); toggleView(); }
    if (event.key.toLowerCase() === 'i') { event.preventDefault(); toggleImmersion(); }
    if (event.key === 'Escape') { if (document.body.classList.contains('immersive')) toggleImmersion(false); clearSelection(); render(); }
  });
  $('board-grid').addEventListener('focus', () => board.polygons.get(board.focused)?.focus());
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', () => { game.settle(); persist(); updateClocks(); if (game.outcome) render(); });
  // Prevent two tabs from silently overwriting the same local game.
  window.addEventListener('storage', event => {
    if (event.key !== SAVE_KEY || !event.newValue) return;
    try {
      const next = GameSession.restore(JSON.parse(event.newValue));
      const changed = next.chess.fen() !== game.chess.fen() || next.paused !== game.paused || next.control !== game.control
        || JSON.stringify(next.outcome) !== JSON.stringify(game.outcome) || JSON.stringify(next.names) !== JSON.stringify(game.names);
      game = next;
      if (changed) { clearSelection(); if (prefs.autoFlip) flipped = game.chess.turn() === 'b'; render(); toast('Game synchronized from another tab.'); }
    }
    catch { toast('Another tab has an incompatible saved game.'); }
  });
}

async function boot() {
  try {
    const response = await fetch('./assets/sprites.json'); if (!response.ok) throw Error('Could not load piece definitions');
    const atlas = await response.json();
    board = new BoardView($('scene-board'), atlas, selectSquare, attemptMove);
    bindControls(); applyPreferences(); render();
    const assets = ['./assets/vale.webp', './assets/ivory.webp', './assets/obsidian.webp'];
    const results = await Promise.allSettled(assets.map(src => new Promise((resolve, reject) => {
      const img = new Image(); img.onload = resolve; img.onerror = reject; img.src = src;
    })));
    $('loading-note').hidden = true;
    if (results.some(r => r.status === 'rejected')) { prefs.flat = true; render(); toast('Some scenery could not load. Tactical view is ready to play.'); }
    else if (invalidSave) toast('The previous saved game could not be restored. A fresh board is ready.');
    else if (restored && !game.outcome) toast(game.paused ? 'Welcome back. Your game is paused.' : 'Welcome back. Your game has been restored.');
    persist();
    setInterval(() => { const previous = game.outcome; game.settle(); updateClocks(); if (game.outcome && !previous) { clearSelection(); render(); persist(); } }, 200);
    setInterval(() => { if (game.running && !game.paused && !game.outcome && game.control !== 'none') persist(); }, 2000);
  } catch (error) {
    $('loading-note').textContent = 'The game could not load. Please refresh this page.';
    console.error('Chess initialization failed:', error);
  }
}
boot();
