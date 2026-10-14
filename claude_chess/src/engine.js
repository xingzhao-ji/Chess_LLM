/* Sunspire Chess rules engine and computer opponent.
   0x88 board. Pure logic, no DOM: runs on the page and inside a Web Worker. */
(function (root) {
  'use strict';

  const WHITE = 0, BLACK = 1;
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const pc = (color, type) => type | (color << 3);
  const typeOf = (p) => p & 7;
  const colorOf = (p) => p >> 3;

  const F_CAPTURE = 1, F_EP = 2, F_CASTLE = 4, F_DOUBLE = 8, F_PROMO = 16;
  const encode = (f, t, promo, flags) => f | (t << 7) | (promo << 14) | (flags << 17);
  const mFrom = (m) => m & 127;
  const mTo = (m) => (m >> 7) & 127;
  const mPromo = (m) => (m >> 14) & 7;
  const mFlags = (m) => m >> 17;

  const KN = [33, 31, 18, 14, -33, -31, -18, -14];
  const KG = [1, -1, 16, -16, 15, 17, -15, -17];
  const DIAG = [15, 17, -15, -17];
  const ORTH = [1, -1, 16, -16];

  // castling rights bits: 1 = White O-O, 2 = White O-O-O, 4 = Black O-O, 8 = Black O-O-O
  const castleMask = new Uint8Array(128).fill(15);
  castleMask[0] = 15 & ~2; castleMask[7] = 15 & ~1; castleMask[4] = 15 & ~3;
  castleMask[112] = 15 & ~8; castleMask[119] = 15 & ~4; castleMask[116] = 15 & ~12;

  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const sqName = (sq) => FILES[sq & 7] + ((sq >> 4) + 1);
  const sqFrom = (name) => (name.charCodeAt(0) - 97) + 16 * (name.charCodeAt(1) - 49);
  const PIECE_CHARS = ' pnbrqk';

  class Position {
    constructor(fen) {
      this.board = new Int8Array(128);
      this.kings = [0, 0];
      this.stack = [];
      this.load(fen || START);
    }

    load(fen) {
      const parts = fen.trim().split(/\s+/);
      const b = this.board; b.fill(0);
      let rank = 7, file = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { rank--; file = 0; continue; }
        if (ch >= '1' && ch <= '8') { file += +ch; continue; }
        const lower = ch.toLowerCase();
        const type = PIECE_CHARS.indexOf(lower);
        if (type < 1) throw new Error('Bad FEN piece ' + ch);
        const color = ch === lower ? BLACK : WHITE;
        const sq = rank * 16 + file;
        b[sq] = pc(color, type);
        if (type === KING) this.kings[color] = sq;
        file++;
      }
      this.turn = parts[1] === 'b' ? BLACK : WHITE;
      const c = parts[2] || '-';
      this.castling = (c.includes('K') ? 1 : 0) | (c.includes('Q') ? 2 : 0) | (c.includes('k') ? 4 : 0) | (c.includes('q') ? 8 : 0);
      this.ep = parts[3] && parts[3] !== '-' ? sqFrom(parts[3]) : -1;
      this.halfmove = parseInt(parts[4] || '0', 10);
      this.fullmove = parseInt(parts[5] || '1', 10);
      this.stack = [];
    }

    clone() {
      const p = Object.create(Position.prototype);
      p.board = new Int8Array(this.board);
      p.kings = this.kings.slice();
      p.stack = [];
      p.turn = this.turn; p.castling = this.castling; p.ep = this.ep;
      p.halfmove = this.halfmove; p.fullmove = this.fullmove;
      return p;
    }

    placement() {
      let s = '';
      for (let r = 7; r >= 0; r--) {
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const p = this.board[r * 16 + f];
          if (!p) { empty++; continue; }
          if (empty) { s += empty; empty = 0; }
          const ch = PIECE_CHARS[typeOf(p)];
          s += colorOf(p) === WHITE ? ch.toUpperCase() : ch;
        }
        if (empty) s += empty;
        if (r) s += '/';
      }
      return s;
    }

    castleString() {
      const c = this.castling;
      const s = (c & 1 ? 'K' : '') + (c & 2 ? 'Q' : '') + (c & 4 ? 'k' : '') + (c & 8 ? 'q' : '');
      return s || '-';
    }

    fen() {
      return [this.placement(), this.turn ? 'b' : 'w', this.castleString(),
        this.ep >= 0 ? sqName(this.ep) : '-', this.halfmove, this.fullmove].join(' ');
    }

    // Key for repetition: en passant counts only if a capture is actually available.
    key() {
      let ep = '-';
      if (this.ep >= 0) {
        const us = this.turn, pawn = pc(us, PAWN);
        const from = this.ep + (us === WHITE ? -16 : 16);
        for (const d of [-1, 1]) {
          const s = from + d;
          if (!(s & 0x88) && this.board[s] === pawn) {
            // must also be legal
            const m = encode(s, this.ep, 0, F_CAPTURE | F_EP);
            this.make(m);
            const ok = !this.attacked(this.kings[us], us ^ 1);
            this.unmake();
            if (ok) { ep = sqName(this.ep); break; }
          }
        }
      }
      return this.placement() + ' ' + (this.turn ? 'b' : 'w') + ' ' + this.castleString() + ' ' + ep;
    }

    attacked(sq, by) {
      const b = this.board;
      let a;
      if (by === WHITE) {
        a = sq - 15; if (!(a & 0x88) && b[a] === 1) return true;
        a = sq - 17; if (!(a & 0x88) && b[a] === 1) return true;
      } else {
        a = sq + 15; if (!(a & 0x88) && b[a] === 9) return true;
        a = sq + 17; if (!(a & 0x88) && b[a] === 9) return true;
      }
      const kn = pc(by, KNIGHT), kg = pc(by, KING);
      for (let i = 0; i < 8; i++) {
        a = sq + KN[i]; if (!(a & 0x88) && b[a] === kn) return true;
        a = sq + KG[i]; if (!(a & 0x88) && b[a] === kg) return true;
      }
      const bi = pc(by, BISHOP), ro = pc(by, ROOK), qu = pc(by, QUEEN);
      for (let i = 0; i < 4; i++) {
        let d = DIAG[i]; a = sq + d;
        while (!(a & 0x88)) { const p = b[a]; if (p) { if (p === bi || p === qu) return true; break; } a += d; }
        d = ORTH[i]; a = sq + d;
        while (!(a & 0x88)) { const p = b[a]; if (p) { if (p === ro || p === qu) return true; break; } a += d; }
      }
      return false;
    }

    inCheck(color) {
      const c = color === undefined ? this.turn : color;
      return this.attacked(this.kings[c], c ^ 1);
    }

    // Pseudo-legal moves. capturesOnly also includes promotions (for quiescence search).
    pseudo(list, capturesOnly) {
      const b = this.board, us = this.turn, them = us ^ 1;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || colorOf(p) !== us) continue;
        const t = typeOf(p);
        if (t === PAWN) {
          const dir = us === WHITE ? 16 : -16;
          const startRank = us === WHITE ? 1 : 6;
          const promoRank = us === WHITE ? 7 : 0;
          let to = sq + dir;
          if (!(to & 0x88) && !b[to]) {
            if ((to >> 4) === promoRank) {
              for (let pr = QUEEN; pr >= KNIGHT; pr--) list.push(encode(sq, to, pr, F_PROMO));
            } else if (!capturesOnly) {
              list.push(encode(sq, to, 0, 0));
              const to2 = to + dir;
              if ((sq >> 4) === startRank && !b[to2]) list.push(encode(sq, to2, 0, F_DOUBLE));
            }
          }
          for (const cd of (us === WHITE ? [15, 17] : [-15, -17])) {
            to = sq + cd;
            if (to & 0x88) continue;
            const q = b[to];
            if (q && colorOf(q) === them) {
              if ((to >> 4) === promoRank) {
                for (let pr = QUEEN; pr >= KNIGHT; pr--) list.push(encode(sq, to, pr, F_PROMO | F_CAPTURE));
              } else list.push(encode(sq, to, 0, F_CAPTURE));
            } else if (to === this.ep) {
              list.push(encode(sq, to, 0, F_CAPTURE | F_EP));
            }
          }
        } else if (t === KNIGHT || t === KING) {
          const offs = t === KNIGHT ? KN : KG;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i];
            if (to & 0x88) continue;
            const q = b[to];
            if (!q) { if (!capturesOnly) list.push(encode(sq, to, 0, 0)); }
            else if (colorOf(q) === them) list.push(encode(sq, to, 0, F_CAPTURE));
          }
          if (t === KING && !capturesOnly) this.castles(sq, list);
        } else {
          const dirs = t === BISHOP ? DIAG : t === ROOK ? ORTH : KG;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let to = sq + d;
            while (!(to & 0x88)) {
              const q = b[to];
              if (!q) { if (!capturesOnly) list.push(encode(sq, to, 0, 0)); }
              else { if (colorOf(q) === them) list.push(encode(sq, to, 0, F_CAPTURE)); break; }
              to += d;
            }
          }
        }
      }
      return list;
    }

    castles(sq, list) {
      const b = this.board, us = this.turn, them = us ^ 1, c = this.castling;
      const home = us === WHITE ? 4 : 116;
      if (sq !== home) return;
      const kBit = us === WHITE ? 1 : 4, qBit = us === WHITE ? 2 : 8;
      const rook = pc(us, ROOK);
      if ((c & kBit) && b[home + 3] === rook && !b[home + 1] && !b[home + 2] &&
        !this.attacked(home, them) && !this.attacked(home + 1, them) && !this.attacked(home + 2, them)) {
        list.push(encode(home, home + 2, 0, F_CASTLE));
      }
      if ((c & qBit) && b[home - 4] === rook && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
        !this.attacked(home, them) && !this.attacked(home - 1, them) && !this.attacked(home - 2, them)) {
        list.push(encode(home, home - 2, 0, F_CASTLE));
      }
    }

    make(m) {
      const b = this.board;
      const from = mFrom(m), to = mTo(m), flags = mFlags(m), promo = mPromo(m);
      const p = b[from], us = this.turn;
      let captured = b[to], capSq = to;
      if (flags & F_EP) { capSq = us === WHITE ? to - 16 : to + 16; captured = b[capSq]; b[capSq] = 0; }
      this.stack.push({ m, captured, capSq, castling: this.castling, ep: this.ep, half: this.halfmove });
      b[to] = promo ? pc(us, promo) : p;
      b[from] = 0;
      if (flags & F_CASTLE) {
        if (to > from) { b[from + 1] = b[from + 3]; b[from + 3] = 0; }
        else { b[from - 1] = b[from - 4]; b[from - 4] = 0; }
      }
      if (typeOf(p) === KING) this.kings[us] = to;
      this.castling &= castleMask[from] & castleMask[to];
      this.ep = (flags & F_DOUBLE) ? (from + to) >> 1 : -1;
      this.halfmove = (typeOf(p) === PAWN || captured) ? 0 : this.halfmove + 1;
      if (us === BLACK) this.fullmove++;
      this.turn = us ^ 1;
    }

    unmake() {
      const u = this.stack.pop();
      const b = this.board, m = u.m;
      const from = mFrom(m), to = mTo(m), flags = mFlags(m), promo = mPromo(m);
      this.turn ^= 1;
      const us = this.turn;
      if (us === BLACK) this.fullmove--;
      const moved = promo ? pc(us, PAWN) : b[to];
      b[from] = moved;
      b[to] = 0;
      if (u.captured) b[u.capSq] = u.captured;
      if (flags & F_CASTLE) {
        if (to > from) { b[from + 3] = b[from + 1]; b[from + 1] = 0; }
        else { b[from - 4] = b[from - 1]; b[from - 1] = 0; }
      }
      if (typeOf(moved) === KING) this.kings[us] = from;
      this.castling = u.castling; this.ep = u.ep; this.halfmove = u.half;
    }

    legal() {
      const ps = this.pseudo([], false), out = [], us = this.turn;
      for (let i = 0; i < ps.length; i++) {
        this.make(ps[i]);
        if (!this.attacked(this.kings[us], us ^ 1)) out.push(ps[i]);
        this.unmake();
      }
      return out;
    }

    perft(depth) {
      if (depth === 0) return 1;
      const ps = this.pseudo([], false), us = this.turn;
      let n = 0;
      for (let i = 0; i < ps.length; i++) {
        this.make(ps[i]);
        if (!this.attacked(this.kings[us], us ^ 1)) n += depth === 1 ? 1 : this.perft(depth - 1);
        this.unmake();
      }
      return n;
    }

    insufficient() {
      const minors = []; let other = false;
      for (let sq = 0; sq < 120; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = this.board[sq]; if (!p) continue;
        const t = typeOf(p);
        if (t === KING) continue;
        if (t === KNIGHT || t === BISHOP) minors.push({ t, sq });
        else { other = true; break; }
      }
      if (other) return false;
      if (minors.length <= 1) return true;
      if (minors.every((x) => x.t === BISHOP)) {
        const shade = (sq) => ((sq >> 4) + (sq & 7)) & 1;
        const s0 = shade(minors[0].sq);
        return minors.every((x) => shade(x.sq) === s0);
      }
      return false;
    }

    san(m, legalList) {
      const legal = legalList || this.legal();
      const from = mFrom(m), to = mTo(m), flags = mFlags(m), promo = mPromo(m);
      const p = this.board[from], t = typeOf(p);
      let s;
      if (flags & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
      else if (t === PAWN) {
        s = (flags & F_CAPTURE ? FILES[from & 7] + 'x' : '') + sqName(to);
        if (promo) s += '=' + 'NBRQ'[promo - 2];
      } else {
        s = 'NBRQK'[t - 2];
        let ambiguous = false, sameFile = false, sameRank = false;
        for (const o of legal) {
          if (o === m) continue;
          const of = mFrom(o);
          if (mTo(o) !== to || of === from || typeOf(this.board[of]) !== t) continue;
          ambiguous = true;
          if ((of & 7) === (from & 7)) sameFile = true;
          if ((of >> 4) === (from >> 4)) sameRank = true;
        }
        if (ambiguous) {
          if (!sameFile) s += FILES[from & 7];
          else if (!sameRank) s += (from >> 4) + 1;
          else s += sqName(from);
        }
        if (flags & F_CAPTURE) s += 'x';
        s += sqName(to);
      }
      this.make(m);
      if (this.inCheck()) s += this.legal().length ? '+' : '#';
      this.unmake();
      return s;
    }
  }

  const uci = (m) => sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? 'nbrq'[mPromo(m) - 2] : '');

  /* ---------- Game: history, SAN, results ---------- */
  class Game {
    constructor(fen) {
      this.startFen = fen || START;
      this.pos = new Position(this.startFen);
      this.history = []; // {m, san, uci, piece, captured, color}
      this.keys = [this.pos.key()];
      this.refresh();
      this.result = this.evaluateResult(); // {score, reason, winner} or null
    }
    refresh() { this.legalCache = this.pos.legal(); }
    legalMoves() { return this.legalCache; }
    turn() { return this.pos.turn; }

    describe(m) {
      const b = this.pos.board;
      const from = mFrom(m), to = mTo(m), flags = mFlags(m);
      const ep = flags & F_EP;
      const capSq = ep ? (this.pos.turn === WHITE ? to - 16 : to + 16) : to;
      return {
        m, from, to, flags, promo: mPromo(m),
        piece: b[from], captured: (flags & F_CAPTURE) ? b[capSq] : 0, capSq,
        castle: !!(flags & F_CASTLE), color: this.pos.turn,
      };
    }

    find(from, to, promo) {
      return this.legalCache.filter((m) => mFrom(m) === from && mTo(m) === to && (!promo || mPromo(m) === promo));
    }

    play(m) {
      if (this.result) return null;
      if (!this.legalCache.includes(m)) return null;
      const info = this.describe(m);
      info.san = this.pos.san(m, this.legalCache);
      info.uci = uci(m);
      this.pos.make(m);
      this.history.push(info);
      this.keys.push(this.pos.key());
      this.refresh();
      this.result = this.evaluateResult();
      return info;
    }

    playUci(str) {
      const from = sqFrom(str.slice(0, 2)), to = sqFrom(str.slice(2, 4));
      const promo = str[4] ? 'nbrq'.indexOf(str[4]) + 2 : 0;
      const ms = this.find(from, to, promo || (str.length > 4 ? -1 : 0));
      if (!ms.length) return null;
      return this.play(promo ? ms[0] : (ms.find((m) => !mPromo(m) || mPromo(m) === QUEEN) || ms[0]));
    }

    undo() {
      if (!this.history.length) return null;
      const info = this.history.pop();
      this.pos.unmake();
      this.keys.pop();
      this.result = null;
      this.refresh();
      return info;
    }

    evaluateResult() {
      const pos = this.pos;
      if (!this.legalCache.length) {
        if (pos.inCheck()) {
          const winner = pos.turn ^ 1;
          return { score: winner === WHITE ? '1-0' : '0-1', reason: 'checkmate', winner };
        }
        return { score: '½-½', reason: 'stalemate', winner: -1 };
      }
      if (pos.insufficient()) return { score: '½-½', reason: 'insufficient', winner: -1 };
      if (pos.halfmove >= 100) return { score: '½-½', reason: 'fifty', winner: -1 };
      const k = this.keys[this.keys.length - 1];
      let reps = 0;
      for (let i = this.keys.length - 1; i >= 0; i--) if (this.keys[i] === k) reps++;
      if (reps >= 3) return { score: '½-½', reason: 'threefold', winner: -1 };
      return null;
    }

    setResult(r) { this.result = r; }

    // Position after `ply` half-moves (for reviewing history).
    positionAt(ply) {
      const p = new Position(this.startFen);
      for (let i = 0; i < ply && i < this.history.length; i++) p.make(this.history[i].m);
      return p;
    }

    // Accepts SAN ("Nf3", "exd5", "O-O", "e8=Q") or coordinates ("g1f3", "e7e8q").
    parse(text) {
      const raw = text.trim();
      if (!raw) return null;
      const clean = (s) => s.replace(/[+#?!]/g, '').replace(/0/g, 'O').replace(/=/g, '');
      const want = clean(raw);
      const legal = this.legalCache;
      for (const m of legal) if (clean(this.pos.san(m, legal)) === want) return m;
      const lw = want.toLowerCase();
      for (const m of legal) if (clean(this.pos.san(m, legal)).toLowerCase().replace(/x/g, '') === lw.replace(/x/g, '') &&
        !/^[a-h]/.test(raw) === !/^[a-h]/.test(clean(this.pos.san(m, legal)))) return m;
      if (/^[a-h][1-8]-?[a-h][1-8][nbrq]?$/i.test(raw)) {
        const u = raw.toLowerCase().replace('-', '');
        for (const m of legal) if (uci(m) === u || (uci(m) === u + 'q')) return m;
      }
      return null;
    }
  }

  /* ---------- Computer opponent ---------- */
  const VAL = [0, 100, 320, 330, 500, 900, 20000];
  // Piece-square tables from White's view, index 0 = a8 ... 63 = h1.
  const PST = {
    1: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    2: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    3: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    4: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    5: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    6: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
    7: [-50, -40, -30, -20, -20, -30, -40, -50, -30, -20, -10, 0, 0, -10, -20, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 30, 40, 40, 30, -10, -30, -30, -10, 20, 30, 30, 20, -10, -30, -30, -30, 0, 0, 0, 0, -30, -30, -50, -30, -30, -30, -30, -30, -30, -50],
  };
  const pstIndex = (sq, color) => color === WHITE ? (7 - (sq >> 4)) * 8 + (sq & 7) : (sq >> 4) * 8 + (sq & 7);

  function evaluate(pos) {
    const b = pos.board;
    let score = 0, phaseMat = 0, queens = 0;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue;
      const t = typeOf(p);
      if (t !== KING && t !== PAWN) phaseMat += VAL[t];
      if (t === QUEEN) queens++;
    }
    const endgame = queens === 0 ? phaseMat <= 1700 : phaseMat <= 2600;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq]; if (!p) continue;
      const t = typeOf(p), c = colorOf(p);
      const table = t === KING && endgame ? PST[7] : PST[t];
      const v = VAL[t] + table[pstIndex(sq, c)];
      score += c === WHITE ? v : -v;
    }
    return pos.turn === WHITE ? score : -score;
  }

  const MATE = 100000;

  function search(fen, opts) {
    const pos = new Position(fen);
    const level = opts.level || 'medium';
    const maxDepth = level === 'easy' ? 2 : level === 'medium' ? 4 : 64;
    const timeLimit = level === 'easy' ? 300 : level === 'medium' ? 1000 : (opts.timeMs || 2200);
    const history = new Set(opts.keys || []);
    const t0 = Date.now();
    let nodes = 0, stopped = false;
    const killers = [];

    function score(m, pvMove, ply) {
      if (m === pvMove) return 1e7;
      const f = mFlags(m);
      let s = 0;
      if (f & F_CAPTURE) {
        const victim = (f & F_EP) ? PAWN : typeOf(pos.board[mTo(m)]);
        s = 1e6 + VAL[victim] * 10 - VAL[typeOf(pos.board[mFrom(m)])] / 10;
      }
      if (f & F_PROMO) s += 9e5 + mPromo(m) * 10;
      const k = killers[ply];
      if (k && (k[0] === m || k[1] === m)) s += 5e5;
      return s;
    }
    function order(list, pvMove, ply) {
      const scored = list.map((m) => [score(m, pvMove, ply), m]);
      scored.sort((a, b) => b[0] - a[0]);
      return scored.map((x) => x[1]);
    }

    function quiesce(alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() - t0 > timeLimit) stopped = true;
      if (stopped) return 0;
      const stand = evaluate(pos);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (ply > 24) return alpha;
      const list = order(pos.pseudo([], true), 0, 63);
      const us = pos.turn;
      for (const m of list) {
        pos.make(m);
        if (pos.attacked(pos.kings[us], us ^ 1)) { pos.unmake(); continue; }
        const v = -quiesce(-beta, -alpha, ply + 1);
        pos.unmake();
        if (stopped) return 0;
        if (v >= beta) return beta;
        if (v > alpha) alpha = v;
      }
      return alpha;
    }

    function negamax(depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && Date.now() - t0 > timeLimit) stopped = true;
      if (stopped) return 0;
      if (ply > 0 && (pos.halfmove >= 100 || (ply <= 3 && history.size && pos.halfmove >= 4 && history.has(pos.key())))) return 0;
      const inCheck = pos.inCheck();
      if (inCheck) depth++;
      if (depth <= 0) return quiesce(alpha, beta, ply);
      const us = pos.turn;
      const list = order(pos.pseudo([], false), 0, ply);
      let legal = 0;
      for (const m of list) {
        pos.make(m);
        if (pos.attacked(pos.kings[us], us ^ 1)) { pos.unmake(); continue; }
        legal++;
        const v = -negamax(depth - 1, -beta, -alpha, ply + 1);
        pos.unmake();
        if (stopped) return 0;
        if (v >= beta) {
          if (!(mFlags(m) & F_CAPTURE)) {
            const k = killers[ply] || (killers[ply] = [0, 0]);
            if (k[0] !== m) { k[1] = k[0]; k[0] = m; }
          }
          return beta;
        }
        if (v > alpha) alpha = v;
      }
      if (!legal) return inCheck ? -MATE + ply : 0;
      return alpha;
    }

    const rootMoves = pos.legal();
    if (!rootMoves.length) return null;
    if (rootMoves.length === 1) return { move: uci(rootMoves[0]), depth: 0 };
    const margin = level === 'easy' ? 250 : 0;
    let best = rootMoves[0], bestScore = -Infinity, completed = 0;
    let scores = new Map();
    for (let depth = 1; depth <= maxDepth; depth++) {
      let alpha = -Infinity, iterBest = 0, iterScore = -Infinity;
      const iterScores = new Map();
      const ordered = order(rootMoves, best, 0);
      for (const m of ordered) {
        pos.make(m);
        const v = -negamax(depth - 1, -Infinity, -(alpha - margin), 1);
        pos.unmake();
        if (stopped) break;
        iterScores.set(m, v);
        if (v > iterScore) { iterScore = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      if (stopped && !iterBest) break;
      if (!stopped || iterScore > bestScore) { best = iterBest; bestScore = iterScore; scores = iterScores; }
      if (!stopped) completed = depth;
      if (stopped || Math.abs(bestScore) > MATE - 100) break;
      if (Date.now() - t0 > timeLimit * 0.55) break;
    }
    if (level === 'easy' && scores.size > 1) {
      // A gentle opponent: pick among reasonable moves, sometimes a weaker one.
      const arr = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      const margin = Math.random() < 0.25 ? 220 : 90;
      const pool = arr.filter(([, v]) => v >= arr[0][1] - margin);
      best = pool[Math.floor(Math.random() * pool.length)][0];
    }
    return { move: uci(best), depth: completed, score: bestScore, nodes, ms: Date.now() - t0 };
  }

  const api = {
    WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING,
    F_CAPTURE, F_EP, F_CASTLE, F_DOUBLE, F_PROMO,
    START, Position, Game, search, evaluate,
    pc, typeOf, colorOf, mFrom, mTo, mPromo, mFlags, encode, sqName, sqFrom, uci,
  };
  root.ChessCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  // Worker entry point: when this file runs inside a Worker, answer search requests.
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = (e) => {
      const { id, fen, level, keys } = e.data;
      let res = null;
      try { res = search(fen, { level, keys }); } catch (err) { res = { error: String(err) }; }
      root.postMessage({ id, ...res });
    };
  }
})(typeof self !== 'undefined' ? self : globalThis);
