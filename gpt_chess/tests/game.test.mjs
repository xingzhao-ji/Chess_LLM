import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, formatClock } from '../dist/game.js';
import { perspective, tactical, BOARD, coordinates, squareAt } from '../dist/geometry.js';
import { Chess } from '../dist/vendor/chess.js';

const play = (game, moves) => moves.forEach(([from, to, promotion]) => assert.ok(game.move(from, to, promotion), `${from}-${to}`));

test('initial position has 20 legal moves and 8,902 positions at depth 3', () => {
  const g = new GameSession(); assert.equal(g.chess.moves().length, 20); assert.equal(g.chess.perft(3), 8902);
});
test('illegal and out-of-turn moves leave the position unchanged', () => {
  const g = new GameSession(), before = g.chess.fen();
  assert.equal(g.move('e2', 'e5'), null); assert.equal(g.move('e7', 'e5'), null); assert.equal(g.chess.fen(), before);
});
test('castling moves the rook, and castling through check is rejected', () => {
  const g = new GameSession(); g.chess.load('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(g.move('e1', 'g1')); assert.equal(g.chess.get('f1').type, 'r'); assert.equal(g.chess.get('h1'), undefined);
  const h = new GameSession(); h.chess.load('r3kr1r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(h.move('e1', 'g1'), null);
});
test('en passant removes the captured pawn from its actual square', () => {
  const g = new GameSession(); play(g, [['e2','e4'],['a7','a6'],['e4','e5'],['d7','d5'],['e5','d6']]);
  assert.equal(g.chess.get('d5'), undefined); assert.equal(g.chess.get('d6').color, 'w'); assert.equal(g.chess.history({ verbose: true }).at(-1).captured, 'p');
});
test('all four promotion choices are legal, including underpromotion', () => {
  for (const promotion of ['q', 'r', 'b', 'n']) {
    const g = new GameSession(); g.chess.load('7k/P7/8/8/8/8/8/7K w - - 0 1');
    assert.ok(g.move('a7', 'a8', promotion)); assert.equal(g.chess.get('a8').type, promotion);
  }
});
test('Fool’s Mate ends the game and prevents further moves', () => {
  const g = new GameSession(); play(g, [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']]);
  assert.deepEqual(g.outcome, { winner: 'b', reason: 'Checkmate' }); assert.equal(g.move('a2', 'a3'), null);
});
test('stalemate, insufficient material, and fifty-move draw are distinguished', () => {
  const g = new GameSession(); g.chess.load('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); g.updateOutcome(); assert.equal(g.outcome.reason, 'Stalemate');
  const h = new GameSession(); h.chess.load('7k/8/8/8/8/8/8/7K w - - 0 1'); h.updateOutcome(); assert.equal(h.outcome.reason, 'Insufficient material');
  const j = new GameSession(); j.chess.load('7k/8/8/8/8/8/R7/7K w - - 99 70'); j.move('a2','a3'); assert.equal(j.outcome.reason, 'Fifty-move rule');
});
test('threefold repetition is preserved through serialization and restoration', () => {
  const g = new GameSession(); const cycle = [['g1','f3'],['g8','f6'],['f3','g1'],['f6','g8']]; play(g, cycle);
  const restored = GameSession.restore(JSON.parse(JSON.stringify(g.serialize()))); play(restored, cycle);
  assert.equal(restored.outcome.reason, 'Threefold repetition');
});
test('clocks begin after first move, run for the active player and add increment', () => {
  let now = 0; const g = new GameSession({ control:'5+3', now: () => now }); now = 60000;
  assert.equal(g.remaining('w'), 300); g.move('e2','e4'); assert.equal(g.clocks.w, 303);
  now += 7000; assert.equal(g.remaining('b'), 293); g.move('e7','e5'); assert.equal(g.clocks.b, 296);
  now += 5000; assert.equal(g.remaining('w'), 298); assert.equal(g.remaining('b'), 296);
});
test('a long background interval causes flag fall and cannot be bypassed with a move', () => {
  let now = 0; const g = new GameSession({ control:'3+2', now: () => now }); g.move('e2','e4');
  now = 181000; assert.equal(g.move('e7','e5'), null); assert.deepEqual(g.outcome, {winner:'w',reason:'Time expired'});
});
test('clock expiry is a draw if the other side has only a king', () => {
  let now = 0; const g = new GameSession({ control:'3+2', now: () => now });
  g.chess.load('7k/8/8/8/8/8/r7/7K b - - 0 1'); g.running = true; now = 181000; g.settle();
  assert.equal(g.outcome.winner, null); assert.match(g.outcome.reason, /no mating material/);
});
test('pausing freezes the clock and blocks moves until resumed', () => {
  let now = 0; const g = new GameSession({control:'3+2',now:()=>now}); g.move('e2','e4'); now = 12000; g.pause();
  now = 900000; assert.equal(g.remaining('b'),168); assert.equal(g.move('e7','e5'),null);
  g.resume(); now += 4000; assert.equal(g.remaining('b'),164);
});
test('restoring a running game accounts for time since the last save', () => {
  let now = 0; const g = new GameSession({control:'10+5',now:()=>now}); g.move('e2','e4'); now = 10000;
  const save = JSON.parse(JSON.stringify(g.serialize())); now = 30000;
  const h = GameSession.restore(save,()=>now); assert.equal(h.remaining('b'),570); assert.equal(h.remaining('w'),605);
});
test('a takeback restores the prior position and agreed clock snapshot', () => {
  let now = 0; const g = new GameSession({control:'5+3',now:()=>now}); g.move('e2','e4'); now=8000; g.move('e7','e5');
  assert.ok(g.undo()); assert.equal(g.chess.turn(),'b'); assert.equal(g.chess.get('e7').type,'p'); assert.equal(g.clocks.b,292);
  g.undo(); assert.equal(g.running,false); assert.equal(g.chess.history().length,0); assert.equal(g.clocks.w,300);
});
test('PGN export round trips through the rules engine with names and result', () => {
  const g = new GameSession({names:{w:'Player One',b:'Guest'}}); play(g,[['e2','e4'],['e7','e5']]); g.finish(null,'Draw by agreement');
  const pgn = g.pgn(), imported = new Chess(); imported.loadPgn(pgn);
  assert.equal(imported.fen(),g.chess.fen()); assert.equal(imported.getHeaders().White,'Player One'); assert.equal(imported.getHeaders().Result,'1/2-1/2');
});
test('damaged saves and invalid time controls fail safely', () => {
  assert.throws(()=>GameSession.restore({version:1,moves:['invalid']}));
  const g = new GameSession({control:'bogus'}); assert.equal(g.control,'none');
  const save = g.serialize(); save.clocks.w=NaN; assert.throws(()=>GameSession.restore(save));
});
test('clock labels handle infinity, subsecond values and the final zero', () => {
  assert.equal(formatClock(null),'∞'); assert.equal(formatClock(.02),'0:01'); assert.equal(formatClock(0),'0:00'); assert.equal(formatClock(605),'10:05');
});
test('projected corners land on the scene and all 128 rotated square centers hit the intended square', () => {
  assert.deepEqual(perspective.project(0,0),BOARD.tl);
  const near = (a,b) => assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
  for (const [col,row,point] of [[8,0,BOARD.tr],[8,8,BOARD.br],[0,8,BOARD.bl]]) perspective.project(col,row).forEach((n,i)=>near(n,point[i]));
  for (const flipped of [false,true]) for (const projection of [perspective,tactical]) for (let row=0;row<8;row++) for(let col=0;col<8;col++) {
    const projected=projection.project(col+.5,row+.5), inverse=projection.invert(...projected);
    near(inverse[0],col+.5);near(inverse[1],row+.5);
    const square=squareAt(...inverse,flipped);assert.deepEqual(coordinates(square,flipped),[col,row]);
  }
  assert.equal(squareAt(-.01,2),null); assert.equal(squareAt(8,2),null);
});
