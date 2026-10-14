const C = require('../src/engine.js');
const cases = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];
let ok = true;
for (const [fen, exp] of cases) {
  const p = new C.Position(fen);
  exp.forEach((n, i) => {
    const t = Date.now(); const got = p.perft(i + 1);
    const pass = got === n; ok = ok && pass;
    console.log((pass ? 'ok  ' : 'FAIL') + ' d' + (i + 1) + ' ' + got + '/' + n + ' ' + (Date.now() - t) + 'ms  ' + fen.slice(0, 24));
  });
  if (p.fen() !== fen) { console.log('FEN roundtrip FAIL', p.fen()); ok = false; }
}
// SAN + results
const g = new C.Game();
for (const s of ['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6', 'Qxf7#']) { const m = g.parse(s); if (!m) { console.log('parse FAIL', s); ok = false; break; } g.play(m); }
console.log('mate SAN', g.history.map(h => h.san).join(' '), g.result);
ok = ok && g.result && g.result.reason === 'checkmate' && g.history[6].san === 'Qxf7#';
// castling, ep, promotion SAN
const g2 = new C.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
console.log('castle', g2.pos.san(g2.parse('O-O')), g2.pos.san(g2.parse('0-0-0')));
const g3 = new C.Game('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2');
const ep = g3.parse('exd6'); console.log('ep', !!ep, g3.pos.san(ep)); ok = ok && !!ep;
const g4 = new C.Game('8/P6k/8/8/8/8/8/K7 w - - 0 1');
const pr = g4.parse('a8=Q'); console.log('promo', g4.pos.san(pr), g4.parse('a7a8n') && g4.pos.san(g4.parse('a7a8n')));
// disambiguation
const g5 = new C.Game('4k3/8/8/8/8/8/8/R3K2R w - - 0 1');
console.log('disamb', g5.legalMoves().filter(m => C.mTo(m) === C.sqFrom('d1') || C.mTo(m)===C.sqFrom('f1')).map(m => g5.pos.san(m)).join(','));
// stalemate & insufficient
console.log('stalemate', new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1').result);
console.log('insufficient', new C.Game('8/8/8/4k3/8/8/2B5/4K3 w - - 0 1').result);
// threefold
const g6 = new C.Game();
for (const s of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8']) g6.play(g6.parse(s));
console.log('threefold', g6.result); ok = ok && g6.result && g6.result.reason === 'threefold';
// AI
for (const level of ['easy', 'medium', 'hard']) {
  const r = C.search('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 2 3', { level });
  console.log('ai', level, r.move, 'depth', r.depth, r.ms + 'ms', r.nodes);
}
const mateIn1 = C.search('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', { level: 'medium' });
console.log('mate-in-1', mateIn1.move); ok = ok && mateIn1.move === 'a1a8';
console.log(ok ? 'ALL OK' : 'SOME FAILED');
