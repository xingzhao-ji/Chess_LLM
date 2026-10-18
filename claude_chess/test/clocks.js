const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const C = require('../src/engine.js');

// Exercise the actual controller with its real rules engine; rendering and
// timers are outside these deterministic clock-boundary checks.
const source = readFileSync(join(__dirname, '../src/app.js'), 'utf8');
const controller = source.slice(source.indexOf('class Game3D {'), source.indexOf('\nboot().catch'));
function fixture(fen, now = 1500) {
  const Game3D = vm.runInNewContext(`${controller}\nGame3D`, {
    C, WHITE: C.WHITE, BLACK: C.BLACK,
    performance: { now: () => now }, setTimeout() {},
  });
  const app = Object.create(Game3D.prototype);
  app.game = fen ? new C.Game(fen) : new C.Game();
  app.clock = { ms: [10000, 10000], inc: 2000, running: true, last: 0 };
  app.aiReq = 0;
  for (const method of ['clearSelection', 'announceMove', 'updateUI', 'save', 'followTurn', 'paintClocks']) app[method] = () => {};
  app.syncBoard = () => 0;
  return app;
}

test('a move charges elapsed time to its mover before adding increment', () => {
  const app = fixture();
  app.playMove(app.game.parse('e4'));
  assert.deepEqual(Array.from(app.clock.ms), [10500, 10000]);
  assert.equal(app.game.history.length, 1);
});

test('an expired player cannot play a move before the next animation frame', () => {
  const app = fixture(undefined, 11000);
  const before = app.game.pos.fen();
  app.playMove(app.game.parse('e4'));
  assert.equal(app.game.pos.fen(), before);
  assert.equal(app.game.history.length, 0);
  assert.equal(app.game.result.reason, 'timeout');
  assert.equal(app.game.result.winner, C.BLACK);
  assert.deepEqual(Array.from(app.clock.ms), [0, 10000]);
});

test('a mating move cannot bypass an expired clock', () => {
  const app = fixture('7k/8/5KQ1/8/8/8/8/8 w - - 0 1', 11000);
  const move = app.game.parse('Qg7#');
  assert.ok(move);
  app.playMove(move);
  assert.equal(app.game.history.length, 0);
  assert.equal(app.game.result.reason, 'timeout-draw');
});

test('a timely mating move settles the mover clock before ending the game', () => {
  const app = fixture('7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  app.playMove(app.game.parse('Qg7#'));
  assert.equal(app.game.result.reason, 'checkmate');
  assert.equal(app.clock.ms[C.WHITE], 8500);
  assert.equal(app.clock.running, false);
});
