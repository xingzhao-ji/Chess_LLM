/* ---------- Sunspire Chess: game controller ---------- */
const C = window.ChessCore;
const { WHITE, BLACK } = C;
const $ = (id) => document.getElementById(id);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const SIDE = ['White', 'Black'];
const NAMES = { 1: 'pawn', 2: 'knight', 3: 'bishop', 4: 'rook', 5: 'queen', 6: 'king' };
const GLYPH = { 0: { 1: '♙', 2: '♘', 3: '♗', 4: '♖', 5: '♕', 6: '♔' }, 1: { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' } };
const VS = '︎';
const sqX = (sq) => (sq & 7) - 3.5;
const sqZ = (sq) => 3.5 - (sq >> 4);
const idx64 = (sq) => (sq >> 4) * 8 + (sq & 7);

const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || Math.min(screen.width, screen.height) < 600;
const settings = Object.assign({ hints: true, sfx: true, ambience: false, hq: !isMobile, camera: 'follow', overhead: false, drawer: null }, store.get('sunspire-settings', {}));
const saveSettings = () => store.set('sunspire-settings', settings);

/* ---------- Sound: synthesized stone, bells and valley air ---------- */
const Sound = {
  ctx: null, master: null, amb: null,
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  clack(gain = 1, pitch = 1, when = 0) {
    if (!settings.sfx || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime + when;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300 * pitch; bp.Q.value = 1.1;
    const g = c.createGain(); g.gain.setValueAtTime(0.5 * gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    n.connect(bp).connect(g).connect(this.master); n.start(t, Math.random()); n.stop(t + 0.09);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(210 * pitch, t); o.frequency.exponentialRampToValueAtTime(120 * pitch, t + 0.12);
    const og = c.createGain(); og.gain.setValueAtTime(0.42 * gain, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(og).connect(this.master); o.start(t); o.stop(t + 0.18);
    const tri = c.createOscillator(); tri.type = 'triangle'; tri.frequency.value = 760 * pitch;
    const tg = c.createGain(); tg.gain.setValueAtTime(0.09 * gain, t); tg.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    tri.connect(tg).connect(this.master); tri.start(t); tri.stop(t + 0.12);
  },
  chime(freqs, gain = 0.1, decay = 1.4, when = 0) {
    if (!settings.sfx || !this.ensure()) return;
    const c = this.ctx, t = c.currentTime + when;
    freqs.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + i * 0.05);
      g.gain.exponentialRampToValueAtTime(gain / (1 + i * 0.6), t + i * 0.05 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.05 + decay);
      o.connect(g).connect(this.master); o.start(t + i * 0.05); o.stop(t + i * 0.05 + decay + 0.05);
    });
  },
  move() { this.clack(1, 0.95 + Math.random() * 0.1); },
  capture() { this.clack(1.25, 0.82); this.clack(0.7, 1.18, 0.06); this.chime([1568, 2349], 0.03, 0.5, 0.02); },
  castle() { this.clack(1, 0.95); this.clack(0.9, 1.08, 0.14); },
  check() { this.chime([988, 1482, 1976], 0.09, 1.3, 0.05); },
  select() { this.clack(0.18, 1.6); },
  end(win) { this.chime(win ? [523, 659, 784, 1047] : [440, 554, 659], 0.08, 2.2); },
  ambience(on) {
    if (!on) { if (this.amb) { const a = this.amb; a.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4); setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 1500); this.amb = null; } return; }
    if (this.amb || !this.ensure()) return;
    const c = this.ctx;
    const gain = c.createGain(); gain.gain.value = 0; gain.connect(this.master);
    gain.gain.setTargetAtTime(1, c.currentTime, 1.2);
    const wind = c.createBufferSource(); wind.buffer = this.noise; wind.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const wg = c.createGain(); wg.gain.value = 0.05;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lfoG = c.createGain(); lfoG.gain.value = 0.03;
    lfo.connect(lfoG).connect(wg.gain);
    wind.connect(lp).connect(wg).connect(gain);
    const falls = c.createBufferSource(); falls.buffer = this.noise; falls.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.4;
    const fg = c.createGain(); fg.gain.value = 0.018;
    falls.connect(bp).connect(fg).connect(gain);
    wind.start(); falls.start(1.3); lfo.start();
    this.amb = { gain, nodes: [wind, falls, lfo] };
    const chirp = () => {
      if (!this.amb) return;
      const t = c.currentTime;
      for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
        const o = c.createOscillator(); o.type = 'sine';
        const f0 = 2600 + Math.random() * 1400, tt = t + k * 0.13;
        o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 1.35, tt + 0.08);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, tt); g.gain.exponentialRampToValueAtTime(0.012, tt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
        o.connect(g).connect(gain); o.start(tt); o.stop(tt + 0.12);
      }
      setTimeout(chirp, 4000 + Math.random() * 7000);
    };
    setTimeout(chirp, 2500);
  },
};

/* ---------- Boot ---------- */
async function boot() {
  const fontReady = Promise.race([
    Promise.all([document.fonts.load('600 64px Cinzel'), document.fonts.load('500 16px "Alegreya Sans"')]).catch(() => {}),
    new Promise((r) => setTimeout(r, 2500)),
  ]);
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  } catch (err) {
    $('loadingSub').innerHTML = '<p class="fatal">This game needs WebGL to draw the board. Try a recent Chrome, Safari, Firefox or Edge, or turn on hardware acceleration in your browser settings.</p>';
    document.querySelector('.loading-bar').hidden = true;
    return;
  }
  await fontReady;
  await new Promise((r) => requestAnimationFrame(() => r()));
  const fontFamily = document.fonts.check('600 32px Cinzel') ? 'Cinzel, Georgia, serif' : 'Georgia, "Times New Roman", serif';

  const container = $('gl');
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.hq ? 2 : 1.25));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Chess board. Use arrow keys to move the cursor and Enter to pick a piece or square.');

  const Q = { high: !isMobile, reflections: settings.hq };
  const world = buildWorld(renderer, Q, fontFamily);
  const scene = world.scene;
  const pieceMats = makePieceMaterials(world.ivoryTex);
  const templates = buildPieceTemplates(pieceMats);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1200);
  camera.layers.enable(1);

  const app = new Game3D({ renderer, scene, camera, world, templates, canvas, container });
  app.start();

  $('loading').dataset.done = 'true';
  setTimeout(() => { $('loading').hidden = true; }, 700);
}

/* ---------- Piece views ---------- */
class PieceView {
  constructor(code, tpl, sq, variant) {
    this.code = code; this.sq = sq; this.variant = variant;
    this.color = C.colorOf(code); this.type = C.typeOf(code);
    this.group = tpl.group.clone();
    this.group.traverse((o) => { if (o.isMesh) o.layers.enable(1); });
    const hb = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, tpl.height, 10).translate(0, tpl.height / 2, 0), HITBOX_MAT);
    hb.userData.view = this;
    this.group.add(hb);
    this.hitbox = hb;
    this.height = tpl.height;
    this.x = sqX(sq); this.z = sqZ(sq); this.arc = 0;
    this.lift = 0; this.liftTarget = 0;
    this.yaw = 0; this.yawTarget = 0; this.yawDelay = 0;
    this.scale = 1; this.opacity = 1; this.fadeMats = null;
  }
  setOpacity(o) {
    this.opacity = o;
    if (o >= 0.999) {
      if (this.fadeMats) {
        this.group.traverse((m) => { if (m.isMesh && m.userData.origMat) { m.material.dispose(); m.material = m.userData.origMat; delete m.userData.origMat; } });
        this.fadeMats = null;
      }
      return;
    }
    if (!this.fadeMats) {
      this.fadeMats = true;
      this.group.traverse((m) => { if (m.isMesh && m !== this.hitbox) { m.userData.origMat = m.material; m.material = m.material.clone(); m.material.transparent = true; } });
    }
    this.group.traverse((m) => { if (m.isMesh && m.userData.origMat) m.material.opacity = o; });
  }
  apply() {
    this.group.position.set(this.x, this.arc + this.lift, this.z);
    this.group.rotation.y = this.yaw;
    this.group.scale.setScalar(this.scale * PIECE_SCALE);
  }
  dispose(scene) {
    scene.remove(this.group);
    this.hitbox.geometry.dispose();
    this.setOpacity(1);
  }
}
const HITBOX_MAT = new THREE.MeshBasicMaterial({ visible: false });
const PIECE_SCALE = 1.1;

/* ---------- Main game ---------- */
class Game3D {
  constructor(o) {
    Object.assign(this, o);
    this.views = new Map();
    this.tweens = [];
    this.raycaster = new THREE.Raycaster();
    this.plane0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.selected = -1; this.targets = new Map(); this.hover = -1; this.cursor = -1; this.cursorVisible = false;
    this.dragOver = -1;
    this.viewPly = null;
    this.aiReq = 0; this.aiThinking = false;
    this.pendingPromo = null;
    this.clock = null;
    this.rig = { target: new THREE.Vector3(0, 0.25, 0.15), az: 0, polar: 0.98, zoom: 1, anim: null, user: false };
    this.viewerSide = WHITE;
    this.lastFrame = performance.now();
    this.frameTimes = [];
  }

  start() {
    this.initWorker();
    this.bindUI();
    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    const saved = store.get('sunspire-game', null);
    let resumed = false;
    if (saved && saved.moves && saved.moves.length && !saved.over) {
      try { this.newGame(saved, { resume: true }); resumed = true; } catch { resumed = false; }
    }
    if (!resumed) this.newGame({ mode: 'local', tc: 'none' }, { intro: true });
    else this.toast('Your game is back where you left it');
    this.setDrawer(settings.drawer !== null ? settings.drawer : false);
    const loop = (now) => { this.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    if (settings.ambience) {
      const once = () => { Sound.ambience(true); window.removeEventListener('pointerdown', once); window.removeEventListener('keydown', once); };
      window.addEventListener('pointerdown', once); window.addEventListener('keydown', once);
    }
  }

  /* ----- game lifecycle ----- */
  newGame(cfg, { resume = false, intro = false } = {}) {
    this.cancelAI();
    this.mode = cfg.mode || 'local';
    this.level = cfg.level || 'medium';
    this.humanSide = cfg.humanSide ?? WHITE;
    this.aiSide = this.mode === 'ai' ? 1 - this.humanSide : -1;
    this.tc = cfg.tc || 'none';
    this.game = new C.Game();
    if (resume) for (const u of cfg.moves) { if (!this.game.playUci(u)) break; }
    if (resume && cfg.result) this.game.setResult(cfg.result);
    const [base, inc] = this.tc === 'none' ? [0, 0] : this.tc.split('+').map(Number);
    this.clock = this.tc === 'none' ? null : {
      ms: resume && cfg.clock ? cfg.clock.slice() : [base * 60000, base * 60000], inc: inc * 1000,
      running: false, last: performance.now(),
    };
    if (this.clock && this.game.history.length && !this.game.result) { this.clock.running = true; this.clock.last = performance.now(); }
    this.viewPly = null;
    this.clearSelection();
    this.hideOver();
    // camera mode defaults: follow for two players, your own side against the computer
    if (this.mode === 'ai' && settings.camera === 'follow') this.cameraMode = this.humanSide === WHITE ? 'white' : 'black';
    else this.cameraMode = settings.camera;
    this.updateCamSeg();
    this.syncBoard(this.game.pos, { intro: intro || !resume, instant: resume });
    this.snapCameraToSide(this.desiredSide(), !intro);
    this.updateUI();
    this.save();
    this.maybeAI();
  }

  save() {
    const g = this.game;
    store.set('sunspire-game', {
      mode: this.mode, level: this.level, humanSide: this.humanSide, tc: this.tc,
      moves: g.history.map((h) => h.uci), clock: this.clock ? this.clock.ms : null,
      result: g.result && ['resign', 'timeout', 'agreed'].includes(g.result.reason) ? g.result : null,
      over: !!g.result,
    });
  }

  humanCanMove() {
    const g = this.game;
    return !g.result && this.viewPly === null && !this.pendingPromo && !this.aiThinking &&
      (this.mode === 'local' || g.turn() !== this.aiSide);
  }

  /* ----- selection and moves ----- */
  pieceAt(sq) { return this.game.pos.board[sq]; }
  ownPiece(sq) { const p = this.pieceAt(sq); return p && C.colorOf(p) === this.game.turn(); }

  select(sq) {
    this.selected = sq;
    this.targets = new Map();
    for (const m of this.game.legalMoves()) {
      if (C.mFrom(m) !== sq) continue;
      const to = C.mTo(m);
      if (!this.targets.has(to)) this.targets.set(to, []);
      this.targets.get(to).push(m);
    }
    for (const v of this.views.values()) v.liftTarget = v.sq === sq ? 0.12 : 0;
    Sound.select();
    this.refreshOverlay();
  }
  clearSelection() {
    this.selected = -1; this.targets = new Map(); this.dragOver = -1;
    for (const v of this.views.values()) v.liftTarget = 0;
    this.refreshOverlay();
  }

  clickSquare(sq) {
    if (sq < 0) { this.clearSelection(); return; }
    if (!this.humanCanMove()) {
      if (this.viewPly !== null) this.toast('Reviewing an earlier move. Press → or tap “Back to game” to play on.');
      return;
    }
    if (this.selected >= 0 && this.targets.has(sq)) { this.tryMove(this.selected, sq); return; }
    if (this.ownPiece(sq)) {
      if (this.selected === sq) this.clearSelection(); else this.select(sq);
      return;
    }
    this.clearSelection();
  }

  tryMove(from, to, opts = {}) {
    const ms = this.targets.get(to) || this.game.find(from, to);
    if (!ms || !ms.length) return false;
    if (ms.length > 1) { this.openPromo(from, to, ms, opts); return true; }
    this.playMove(ms[0], opts);
    return true;
  }

  playMove(m, { dragged = false } = {}) {
    const g = this.game;
    // Settle the mover before the rules engine switches turns. Input can arrive
    // before the next animation frame, including after a throttled background.
    this.tickClock(performance.now());
    if (g.result) return;
    const mover = g.turn();
    const info = g.play(m);
    if (!info) return;
    if (this.clock && !g.result) {
      this.clock.ms[mover] += this.clock.inc;
      this.clock.running = true; this.clock.last = performance.now();
    }
    this.clearSelection();
    this.viewPly = null;
    const landing = this.syncBoard(g.pos, { move: info, dragged });
    this.announceMove(info);
    this.updateUI();
    this.save();
    const after = landing + 120;
    if (g.result) {
      if (this.clock) this.clock.running = false;
      setTimeout(() => this.showOver(), after + 500);
    } else {
      this.followTurn(after + 260);
      setTimeout(() => this.maybeAI(), after);
    }
  }

  /* ----- board sync with animation ----- */
  variantFor(code, sq) {
    if (C.typeOf(code) !== 2) return 'default';
    if (C.colorOf(code) === WHITE) return (sq & 7) >= 4 ? 'unicorn' : 'pegasus';
    return 'default';
  }
  makeView(code, sq, variant) {
    const key = `${C.colorOf(code) === WHITE ? 'white' : 'black'}-${C.typeOf(code)}-${variant || this.variantFor(code, sq)}`;
    const tpl = this.templates[key] || this.templates[key.replace(/-(pegasus|unicorn)$/, '-default')];
    const v = new PieceView(code, tpl, sq, variant);
    v.yaw = v.yawTarget = this.facingYaw(v);
    this.scene.add(v.group);
    v.apply();
    return v;
  }

  // Returns ms until the main mover lands.
  syncBoard(pos, { move = null, dragged = false, intro = false, instant = false, review = false } = {}) {
    this.finishTweens();
    const anim = !instant && !reduceMotion;
    const target = new Map();
    for (let sq = 0; sq < 120; sq++) { if (sq & 0x88) { sq += 7; continue; } if (pos.board[sq]) target.set(sq, pos.board[sq]); }
    const next = new Map(), spare = [];
    for (const [sq, v] of this.views) { if (target.get(sq) === v.code) next.set(sq, v); else spare.push(v); }
    const needed = [...target].filter(([sq]) => !next.has(sq));
    if (move) needed.sort((a, b) => (b[0] === move.to) - (a[0] === move.to));
    const movers = [], spawns = [];
    for (const [sq, code] of needed) {
      let best = -1, bestD = Infinity;
      spare.forEach((v, i) => {
        if (v.code !== code) return;
        let d = Math.hypot(sqX(v.sq) - sqX(sq), sqZ(v.sq) - sqZ(sq));
        if (move && v.sq === move.from && sq === move.to) d = -1;
        if (d < bestD) { bestD = d; best = i; }
      });
      if (best >= 0) { const v = spare.splice(best, 1)[0]; movers.push({ v, to: sq }); next.set(sq, v); v.sq = sq; }
      else spawns.push([sq, code]);
    }
    let landing = 0;
    // movers glide in an arc; knights leap
    movers.forEach(({ v, to }, i) => {
      const x0 = v.x, z0 = v.z, x1 = sqX(to), z1 = sqZ(to);
      const dist = Math.hypot(x1 - x0, z1 - z0);
      const isRookInCastle = move && move.castle && C.typeOf(v.code) === 4;
      const dur = !anim ? 0 : dragged && i === 0 ? 160 : clamp(300 + dist * 60, 320, review ? 420 : 680);
      const delay = isRookInCastle ? 150 : 0;
      const h = dragged && i === 0 ? 0 : C.typeOf(v.code) === 2 ? 0.75 : 0.16 + dist * 0.03;
      const startArc = v.arc;
      landing = Math.max(landing, delay + dur);
      this.tween(dur, (k) => {
        const e = ease(k);
        v.x = x0 + (x1 - x0) * e; v.z = z0 + (z1 - z0) * e;
        v.arc = startArc * (1 - e) + Math.sin(Math.PI * e) * h;
      }, () => { v.arc = 0; if (anim && !review) this.world.dust(x1, z1); }, delay);
    });
    // pieces leaving the board: captured or reverted
    const promoFrom = move && move.promo ? move.from : -1;
    spare.forEach((v) => {
      const wasPromoPawn = promoFrom >= 0 && v.sq === promoFrom && C.typeOf(v.code) === 1;
      const delay = !anim ? 0 : wasPromoPawn ? 0 : Math.max(0, landing * 0.72);
      if (wasPromoPawn && anim) {
        const x0 = v.x, z0 = v.z, x1 = sqX(move.to), z1 = sqZ(move.to);
        const dur = clamp(300 + Math.hypot(x1 - x0, z1 - z0) * 60, 320, 600);
        landing = Math.max(landing, dur);
        this.tween(dur, (k) => { const e = ease(k); v.x = x0 + (x1 - x0) * e; v.z = z0 + (z1 - z0) * e; v.arc = Math.sin(Math.PI * e) * 0.2; });
        this.tween(320, (k) => { v.setOpacity(1 - k); v.scale = 1 - 0.3 * k; }, () => this.removeView(v), dur);
        return;
      }
      if (!anim) { this.removeView(v); return; }
      this.tween(340, (k) => { v.setOpacity(1 - easeOut(k)); v.scale = 1 - 0.35 * k; v.arc = -0.05 * k; },
        () => this.removeView(v), delay);
      if (!review) setTimeout(() => this.world.burst(v.x, v.z, { color: v.color === WHITE ? 0xfff0c8 : 0xffc888 }), delay + 60);
    });
    // new pieces rise in (promotion, undo of a capture, new game)
    spawns.forEach(([sq, code], i) => {
      const v = this.makeView(code, sq);
      next.set(sq, v);
      if (!anim) return;
      const delay = intro ? 60 + (7 - (sq >> 4)) * 0 + (C.colorOf(code) === WHITE ? (sq >> 4) * 90 : (7 - (sq >> 4)) * 90) + (sq & 7) * 35 : landing * (move && move.promo ? 1 : 0.5);
      v.setOpacity(0); v.scale = 0.7; v.arc = intro ? 0.6 : 0.3;
      v.apply();
      this.tween(intro ? 520 : 420, (k) => { const e = easeOut(k); v.setOpacity(e); v.scale = 0.7 + 0.3 * e; v.arc = (intro ? 0.6 : 0.3) * (1 - e); },
        () => { v.setOpacity(1); if (move && move.promo) this.world.burst(v.x, v.z, { count: 40 }); }, delay);
      if (!intro) landing = Math.max(landing, delay + 420);
    });
    this.views = next;
    this.updateFacing(false);
    // sounds at landing
    if (move && !review) {
      const t = anim ? Math.max(0, landing - (move.promo ? 300 : 0)) : 0;
      setTimeout(() => {
        if (move.captured) Sound.capture(); else if (move.castle) Sound.castle(); else Sound.move();
        if (/[+#]/.test(move.san || '')) Sound.check();
      }, anim ? Math.min(t, 700) : 0);
    } else if (review && anim) setTimeout(() => Sound.clack(0.5, 1.1), landing);
    this.refreshOverlay();
    return anim ? landing : 0;
  }
  removeView(v) {
    v.dispose(this.scene);
  }

  tween(dur, fn, done, delay = 0) {
    if (dur <= 0 && delay <= 0) { fn(1); if (done) done(); return; }
    this.tweens.push({ t0: performance.now() + delay, dur: Math.max(1, dur), fn, done });
  }
  finishTweens() {
    const list = this.tweens; this.tweens = [];
    for (const t of list) { t.fn(1); if (t.done) t.done(); }
  }

  /* ----- facing: pieces turn to present themselves to the viewer ----- */
  facingYaw(v) {
    let base = 0;
    if (v.type === 2) {
      const file = v.sq & 7;
      const inward = file <= 3 ? 1 : -1;
      base = (v.color === WHITE ? inward : -inward) * (Math.PI / 2 - 0.55);
    }
    return this.viewerSide === WHITE ? base : Math.PI - base;
  }
  updateFacing(stagger) {
    const now = performance.now();
    for (const v of this.views.values()) {
      const y = this.facingYaw(v);
      if (Math.abs(y - v.yawTarget) > 1e-3) {
        v.yawTarget = y;
        v.yawDelay = stagger && !reduceMotion ? now + ((v.sq & 7) + (v.sq >> 4)) * 28 : now;
      }
    }
  }

  /* ----- camera rig ----- */
  desiredSide() {
    if (this.cameraMode === 'white') return WHITE;
    if (this.cameraMode === 'black') return BLACK;
    if (this.mode === 'ai') return this.humanSide;
    return this.game.turn();
  }
  defaultPolar() {
    const a = this.camera.aspect;
    const t = clamp((a - 0.6) / 0.9, 0, 1);
    return settings.overhead ? 0.22 : 0.74 + t * 0.34;
  }
  defaultFov() {
    const a = this.camera.aspect;
    const t = clamp((a - 0.6) / 0.9, 0, 1);
    return 42 - t * 16;
  }
  snapCameraToSide(side, animate) {
    const r = this.rig;
    const goalAz = side === WHITE ? 0 : Math.PI;
    let d = goalAz - r.az;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(Math.abs(d) - Math.PI) < 1e-3) d = Math.PI * (r.az % (2 * Math.PI) >= 0 ? 1 : -1);
    const goal = { az: r.az + d, polar: this.defaultPolar(), zoom: 1 };
    if (!animate || reduceMotion) { Object.assign(r, goal); r.anim = null; r.user = false; this.onCameraSide(); return; }
    r.anim = { from: { az: r.az, polar: r.polar, zoom: r.zoom }, to: goal, t0: performance.now(), dur: Math.abs(d) > 1 ? 1100 : 600 };
    r.user = false;
  }
  followTurn(delay) {
    if (this.cameraMode !== 'follow' || this.mode === 'ai') return;
    clearTimeout(this.followTimer);
    this.followTimer = setTimeout(() => { if (!this.dragging) this.snapCameraToSide(this.game.turn(), true); }, delay);
  }
  onCameraSide() {
    const side = Math.cos(this.rig.az) >= 0 ? WHITE : BLACK;
    if (side !== this.viewerSide) { this.viewerSide = side; this.updateFacing(true); }
  }
  updateCamera(now) {
    const r = this.rig;
    if (r.anim) {
      const k = clamp((now - r.anim.t0) / r.anim.dur, 0, 1), e = ease(k);
      for (const key of ['az', 'polar', 'zoom']) r[key] = r.anim.from[key] + (r.anim.to[key] - r.anim.from[key]) * e;
      if (k >= 1) r.anim = null;
    }
    this.onCameraSide();
    const cam = this.camera;
    const fov = this.defaultFov();
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const fit = this.fitDistance(r.az, r.polar);
    const dist = fit * r.zoom;
    const t = r.target;
    cam.position.set(t.x + dist * Math.sin(r.polar) * Math.sin(r.az), t.y + dist * Math.cos(r.polar), t.z + dist * Math.sin(r.polar) * Math.cos(r.az));
    cam.up.set(0, 1, 0);
    cam.lookAt(t);
    cam.updateMatrixWorld();
  }
  // Smallest distance at which the whole board fits inside the safe area (excluding HUD panels).
  fitDistance(az, polar) {
    const key = `${az.toFixed(3)}|${polar.toFixed(3)}|${this.camera.aspect.toFixed(3)}|${this.camera.fov.toFixed(2)}|${this.safeKey}`;
    if (this._fitKey === key) return this._fitVal;
    const cam = this.fitCam || (this.fitCam = new THREE.PerspectiveCamera());
    cam.copy(this.camera);
    const t = this.rig.target, R = 5.25;
    const corners = [];
    for (const x of [-R, R]) for (const z of [-R, R]) for (const y of [-0.1, 1.5]) corners.push(new THREE.Vector3(x, y, z));
    const s = this.safe;
    const p = new THREE.Vector3();
    const fits = (d) => {
      cam.position.set(t.x + d * Math.sin(polar) * Math.sin(az), t.y + d * Math.cos(polar), t.z + d * Math.sin(polar) * Math.cos(az));
      cam.lookAt(t); cam.updateMatrixWorld();
      for (const c of corners) {
        p.copy(c).project(cam);
        if (p.x < s.x0 || p.x > s.x1 || p.y < s.y0 || p.y > s.y1 || p.z > 1) return false;
      }
      return true;
    };
    let lo = 6, hi = 80;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
    this._fitKey = key; this._fitVal = hi;
    return hi;
  }
  measureSafe() {
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const top = document.querySelector('.hud-top').getBoundingClientRect();
    const dock = document.querySelector('.dock').getBoundingClientRect();
    const drawer = $('drawer');
    const narrow = W <= 640;
    const stage = this.container.getBoundingClientRect();
    let topPx = Math.max(0, top.bottom - stage.top) + 6;
    // On wide screens the plates sit at the sides of the sky band; the board can rise between them.
    if (!narrow) topPx = Math.min(topPx, H * 0.16);
    const bottomPx = Math.max(0, stage.bottom - dock.top) + 6;
    const rightPx = !narrow && drawer.dataset.open === 'true' ? drawer.getBoundingClientRect().width + 28 : 12;
    const leftPx = 12;
    // shift the projection so the board centers in the free area
    const offX = (leftPx - rightPx) / 2, offY = (topPx - bottomPx) / 2;
    this.camera.setViewOffset(W, H, -offX, -offY, W, H);
    const fw = (W - leftPx - rightPx) / W, fh = (H - topPx - bottomPx) / H;
    this.safe = { x0: -fw, x1: fw, y0: -fh, y1: fh };
    this.safeKey = `${W}x${H}:${topPx}:${bottomPx}:${rightPx}`;
  }
  resize() {
    const W = this.container.clientWidth, H = this.container.clientHeight;
    this.renderer.setSize(W, H, false);
    this.camera.aspect = W / Math.max(1, H);
    this.camera.fov = this.defaultFov();
    this.camera.updateProjectionMatrix();
    this.measureSafe();
    this.camera.updateProjectionMatrix();
    if (!this.rig.user && !this.rig.anim) this.rig.polar = this.defaultPolar();
  }

  /* ----- per-frame ----- */
  frame(now) {
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    // tweens
    if (this.tweens.length) {
      const list = this.tweens; this.tweens = [];
      for (const t of list) {
        const k = (now - t.t0) / t.dur;
        if (k < 0) { this.tweens.push(t); continue; }
        if (k >= 1) { t.fn(1); if (t.done) t.done(); } else { t.fn(k); this.tweens.push(t); }
      }
    }
    // pieces: lift, facing, drag
    const bob = Math.sin(now / 320) * 0.025;
    for (const v of this.views.values()) {
      const lt = v.liftTarget + (v.liftTarget ? bob : 0) + (v === this.dragView ? 0.32 : 0);
      v.lift += (lt - v.lift) * Math.min(1, dt * 12);
      if (now >= v.yawDelay) {
        let d = v.yawTarget - v.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        v.yaw += d * Math.min(1, dt * (reduceMotion ? 60 : 5.5));
      }
      v.apply();
    }
    this.tickClock(now);
    this.updateCamera(now);
    
    this.world.update(now / 1000);
    this.renderer.shadowMap.needsUpdate = true;
    this.world.renderReflection(this.camera, this.rig.target);
    this.renderer.render(this.scene, this.camera);
    this.watchPerformance(now, dt);
  }
  watchPerformance(now, dt) {
    if (this.perfDone || !settings.hq) return;
    if (!this.perfStart) { this.perfStart = now + 1500; return; }
    if (now < this.perfStart) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.perfDone = true;
      if (avg > 0.045) { settings.hq = false; this.applyQuality(); this.toast('Switched to lighter graphics to keep play smooth'); }
    }
  }
  applyQuality() {
    this.world.reflection.enabled = settings.hq;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, settings.hq ? 2 : 1.25));
    this.resize();
    $('setHQ').checked = settings.hq;
    saveSettings();
  }

  /* ----- clocks ----- */
  tickClock(now) {
    const c = this.clock;
    if (!c || !c.running || this.game.result) { if (c) c.last = now; return; }
    const side = this.game.turn();
    c.ms[side] -= now - c.last; c.last = now;
    if (c.ms[side] <= 0) {
      c.ms[side] = 0; c.running = false;
      const opp = side ^ 1;
      const canMate = this.hasMatingMaterial(opp);
      this.cancelAI();
      this.game.setResult(canMate ? { score: opp === WHITE ? '1-0' : '0-1', reason: 'timeout', winner: opp, loser: side }
        : { score: '½-½', reason: 'timeout-draw', winner: -1, loser: side });
      this.clearSelection();
      this.updateUI(); this.save();
      setTimeout(() => this.showOver(), 300);
    }
    if (now - (this.lastClockPaint || 0) > 200) { this.lastClockPaint = now; this.paintClocks(); }
  }
  hasMatingMaterial(color) {
    let minors = 0;
    for (let sq = 0; sq < 120; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = this.game.pos.board[sq];
      if (!p || C.colorOf(p) !== color) continue;
      const t = C.typeOf(p);
      if (t === 1 || t === 4 || t === 5) return true;
      if (t === 2 || t === 3) minors++;
    }
    return minors >= 2;
  }
  fmt(ms) {
    const s = Math.max(0, ms) / 1000;
    if (s < 20) return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    const t = Math.ceil(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  }
  paintClocks() {
    const c = this.clock;
    for (const [side, id] of [[WHITE, 'clockWhite'], [BLACK, 'clockBlack']]) {
      const el = $(id);
      el.hidden = !c;
      if (!c) continue;
      el.textContent = this.fmt(c.ms[side]);
      el.dataset.low = String(c.ms[side] < 20000);
    }
  }

  /* ----- computer opponent ----- */
  initWorker() {
    try {
      const src = document.getElementById('engine-src').textContent;
      this.worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      this.worker.onmessage = (e) => this.onAI(e.data);
      this.worker.onerror = () => { this.worker = null; };
    } catch { this.worker = null; }
  }
  maybeAI() {
    const g = this.game;
    if (this.mode !== 'ai' || g.result || g.turn() !== this.aiSide || this.viewPly !== null) return;
    this.aiThinking = true;
    const id = ++this.aiReq;
    this.aiStart = performance.now();
    this.updateUI();
    const msg = { id, fen: g.pos.fen(), level: this.level, keys: g.keys.slice(0, -1) };
    if (this.worker) this.worker.postMessage(msg);
    else setTimeout(() => this.onAI({ id, ...C.search(msg.fen, { level: msg.level, keys: msg.keys }) }), 60);
  }
  onAI(res) {
    if (res.id !== this.aiReq || !this.aiThinking) return;
    const wait = Math.max(0, 650 - (performance.now() - this.aiStart));
    setTimeout(() => {
      if (res.id !== this.aiReq) return;
      this.aiThinking = false;
      const g = this.game;
      const m = res.move && g.legalMoves().find((mm) => C.uci(mm) === res.move);
      if (m) this.playMove(m); else this.updateUI();
    }, wait);
  }
  cancelAI() { this.aiReq++; this.aiThinking = false; }

  /* ----- take back, draw, resign ----- */
  undo() {
    const g = this.game;
    if (!g.history.length) return;
    this.cancelAI();
    if (g.result && ['resign', 'agreed', 'timeout', 'timeout-draw'].includes(g.result.reason)) {
      g.result = g.evaluateResult();
      if (this.clock && this.clock.ms.some((x) => x <= 0)) this.clock.ms = this.clock.ms.map((x) => Math.max(x, 1000));
    }
    let n = 1;
    if (this.mode === 'ai' && g.turn() === this.humanSide && g.history.length >= 2) n = 2;
    for (let i = 0; i < n; i++) g.undo();
    this.viewPly = null;
    this.clearSelection();
    this.hideOver();
    if (this.clock) { this.clock.running = g.history.length > 0; this.clock.last = performance.now(); }
    this.syncBoard(g.pos, {});
    this.updateUI(); this.save();
    this.followTurn(500);
    this.maybeAI();
  }
  offerDraw() {
    const g = this.game;
    if (g.result) return;
    if (this.mode === 'ai') {
      const ev = C.evaluate(g.pos) * (g.turn() === this.aiSide ? 1 : -1);
      if (g.history.length >= 20 && ev < -60) this.finish({ score: '½-½', reason: 'agreed', winner: -1 }, 'The computer accepts the draw.');
      else this.toast(`${SIDE[this.aiSide]} declines the draw and plays on`);
      return;
    }
    this.confirm('Do both players agree to a draw?', 'Agree to a draw', () => this.finish({ score: '½-½', reason: 'agreed', winner: -1 }));
  }
  resign() {
    const g = this.game;
    if (g.result) return;
    const side = this.mode === 'ai' ? this.humanSide : g.turn();
    this.confirm(`Resign this game as ${SIDE[side]}?`, `Resign as ${SIDE[side]}`, () =>
      this.finish({ score: side === WHITE ? '0-1' : '1-0', reason: 'resign', winner: side ^ 1, loser: side }));
  }
  finish(result) {
    this.cancelAI();
    this.game.setResult(result);
    if (this.clock) this.clock.running = false;
    this.clearSelection();
    this.updateUI(); this.save();
    this.showOver();
  }

  /* ----- history review ----- */
  setViewPly(ply) {
    const g = this.game;
    const n = g.history.length;
    let p = ply === null ? null : clamp(ply, 0, n);
    if (p === n) p = null;
    const prev = this.viewPly === null ? n : this.viewPly;
    const nextP = p === null ? n : p;
    if (nextP === prev && p === this.viewPly) return;
    this.clearSelection();
    this.viewPly = p;
    const pos = p === null ? g.pos : g.positionAt(p);
    const forward = nextP === prev + 1 ? g.history[prev] : null;
    this.syncBoard(pos, { move: forward, review: true, instant: Math.abs(nextP - prev) > 1 && !forward });
    this.updateUI();
  }

  /* ----- overlay flags ----- */
  refreshOverlay() {
    const flags = new Uint8Array(64);
    const g = this.game;
    if (!g) return;
    const ply = this.viewPly === null ? g.history.length : this.viewPly;
    const last = ply > 0 ? g.history[ply - 1] : null;
    if (last) { flags[idx64(last.from)] |= 1; flags[idx64(last.to)] |= 1; }
    if (this.selected >= 0) {
      flags[idx64(this.selected)] |= 2;
      if (settings.hints) for (const [to, ms] of this.targets) flags[idx64(to)] |= (C.mFlags(ms[0]) & C.F_CAPTURE) ? 8 : 4;
    }
    if (this.hover >= 0 && this.hover !== this.selected && (this.ownPiece(this.hover) || this.targets.has(this.hover)) && this.humanCanMove()) flags[idx64(this.hover)] |= 16;
    if (this.dragOver >= 0 && this.targets.has(this.dragOver)) flags[idx64(this.dragOver)] |= 128;
    const pos = this.viewPly === null ? g.pos : g.positionAt(this.viewPly);
    if (pos.inCheck()) flags[idx64(pos.kings[pos.turn])] |= 32;
    if (this.cursorVisible && this.cursor >= 0) flags[idx64(this.cursor)] |= 64;
    this.world.setSquareFlags(flags);
  }

  /* ----- picking ----- */
  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  squareAtPoint(p) {
    const f = Math.floor(p.x + 4), rk = Math.floor(4 - p.z);
    if (f < 0 || f > 7 || rk < 0 || rk > 7) return -1;
    return rk * 16 + f;
  }
  pick(e) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const live = [...this.views.values()].filter((v) => v !== this.dragView && v.opacity > 0.5);
    const meshes = [];
    for (const v of live) for (const m of v.group.children) if (m !== v.hitbox) { m.userData.view = v; meshes.push(m); }
    const exact = this.raycaster.intersectObjects(meshes, false);
    const pt = new THREE.Vector3();
    const planeSq = this.raycaster.ray.intersectPlane(this.plane0, pt) ? this.squareAtPoint(pt) : -1;
    const pieceSq = exact.length ? exact[0].object.userData.view.sq : -1;
    const useful = (sq) => sq >= 0 && (this.ownPiece(sq) || this.targets.has(sq));
    if (this.selected >= 0) {
      if (pieceSq >= 0 && useful(pieceSq)) return pieceSq;
      if (useful(planeSq)) return planeSq;
    } else {
      if (pieceSq >= 0 && this.ownPiece(pieceSq)) return pieceSq;
      if (planeSq >= 0 && this.ownPiece(planeSq)) return planeSq;
    }
    if (pieceSq >= 0) return pieceSq;
    // near miss: forgiving cylinders around each piece
    const near = this.raycaster.intersectObjects(live.map((v) => v.hitbox), false);
    if (near.length && !(planeSq >= 0 && this.pieceAt(planeSq))) {
      const sq = near[0].object.userData.view.sq;
      if (useful(sq) || planeSq < 0) return sq;
    }
    return planeSq;
  }

  /* ----- pointer input ----- */
  bindInput() {
    const cv = this.canvas;
    const pointers = new Map();
    let down = null, pinch = null;
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('pointerdown', (e) => {
      Sound.ensure();
      cv.focus({ preventScroll: true });
      this.cursorVisible = false;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { cv.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.rig.zoom };
        if (down && down.mode === 'drag') this.cancelDrag();
        down = { mode: 'orbit', x: e.clientX, y: e.clientY };
        return;
      }
      const sq = this.pick(e);
      const orbitButton = e.button === 2 || e.button === 1;
      const canPickUp = !orbitButton && sq >= 0 && this.humanCanMove() && this.ownPiece(sq);
      down = { x: e.clientX, y: e.clientY, sq, mode: orbitButton ? 'orbit' : canPickUp ? 'piece' : 'empty', az: this.rig.az, polar: this.rig.polar };
    });
    cv.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.rig.zoom = clamp(pinch.zoom * pinch.d / Math.max(20, d), 0.55, 1.6);
        this.rig.anim = null; this.rig.user = true;
        return;
      }
      if (!down) {
        if (e.pointerType === 'mouse') {
          const sq = this.pick(e);
          if (sq !== this.hover) { this.hover = sq; this.refreshOverlay(); }
          const active = this.humanCanMove() && sq >= 0 && (this.ownPiece(sq) || this.targets.has(sq));
          cv.style.cursor = active ? (this.ownPiece(sq) ? 'grab' : 'pointer') : 'default';
        }
        return;
      }
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const moved = Math.hypot(dx, dy) > (e.pointerType === 'touch' ? 10 : 6);
      if (down.mode === 'piece' && moved) this.startDrag(down.sq), down.mode = 'drag';
      else if (down.mode === 'empty' && moved) { down.mode = 'orbit'; down.az = this.rig.az; down.polar = this.rig.polar; down.x = e.clientX; down.y = e.clientY; }
      if (down.mode === 'drag') this.updateDrag(e);
      if (down.mode === 'orbit' && down.az !== undefined) {
        this.rig.anim = null; this.rig.user = true;
        this.rig.az = down.az - (e.clientX - down.x) * 0.006;
        this.rig.polar = clamp(down.polar - (e.clientY - down.y) * 0.004, 0.12, 1.2);
        cv.style.cursor = 'grabbing';
      }
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!down) return;
      const d = down; down = null;
      if (pointers.size) return;
      if (d.mode === 'drag') this.endDrag(e);
      else if (d.mode === 'piece' || d.mode === 'empty') {
        if (e.type === 'pointercancel') return;
        const sq = d.mode === 'piece' ? d.sq : this.pick(e);
        this.clickSquare(sq);
      }
      cv.style.cursor = 'default';
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { if (!down && this.hover !== -1) { this.hover = -1; this.refreshOverlay(); } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.rig.anim = null; this.rig.user = true;
      this.rig.zoom = clamp(this.rig.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 1.6);
    }, { passive: false });
    cv.addEventListener('dblclick', (e) => { if (this.pick(e) < 0) this.resetCamera(); });
    cv.addEventListener('keydown', (e) => this.boardKey(e));
  }
  startDrag(sq) {
    if (this.selected !== sq) this.select(sq);
    const v = this.views.get(sq);
    if (!v) return;
    this.dragView = v; this.dragging = true;
    this.canvas.style.cursor = 'grabbing';
  }
  updateDrag(e) {
    const v = this.dragView; if (!v) return;
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    const pt = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, pt)) return;
    v.x = clamp(pt.x, -4.4, 4.4); v.z = clamp(pt.z, -4.4, 4.4);
    // aim by the piece's base: lean a little toward the camera so the target square sits under the cursor
    const sq = this.squareAtPoint({ x: pt.x, z: pt.z });
    if (sq !== this.dragOver) { this.dragOver = sq; this.refreshOverlay(); }
  }
  endDrag() {
    const v = this.dragView;
    this.dragView = null; this.dragging = false;
    const to = this.dragOver;
    this.dragOver = -1;
    if (v && to >= 0 && to !== v.sq && this.targets.has(to)) { this.tryMove(v.sq, to, { dragged: true }); return; }
    if (v) {
      const x0 = v.x, z0 = v.z, x1 = sqX(v.sq), z1 = sqZ(v.sq);
      this.tween(reduceMotion ? 0 : 260, (k) => { const e = easeOut(k); v.x = x0 + (x1 - x0) * e; v.z = z0 + (z1 - z0) * e; });
    }
    this.refreshOverlay();
  }
  cancelDrag() { if (this.dragView) { this.dragOver = -1; this.endDrag(); } }

  /* ----- keyboard ----- */
  boardKey(e) {
    const dirs = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key]) {
      e.preventDefault(); e.stopPropagation();
      if (!this.cursorVisible || this.cursor < 0) {
        this.cursor = this.selected >= 0 ? this.selected : (this.viewerSide === WHITE ? 0x14 : 0x63);
        this.cursorVisible = true;
      } else {
        let [df, dr] = dirs[e.key];
        if (this.viewerSide === BLACK) { df = -df; dr = -dr; }
        const f = clamp((this.cursor & 7) + df, 0, 7), r = clamp((this.cursor >> 4) + dr, 0, 7);
        this.cursor = r * 16 + f;
      }
      this.refreshOverlay();
      this.announce(this.describeSquare(this.cursor));
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && this.cursorVisible) {
      e.preventDefault(); e.stopPropagation();
      this.clickSquare(this.cursor);
      if (this.selected >= 0) this.announce(`${this.describeSquare(this.selected)} picked up. ${this.targets.size} moves available.`);
    }
  }
  describeSquare(sq) {
    const p = this.game.pos.board[sq];
    const name = C.sqName(sq);
    return p ? `${name}, ${SIDE[C.colorOf(p)]} ${NAMES[C.typeOf(p)]}` : `${name}, empty`;
  }

  /* ----- promotion ----- */
  openPromo(from, to, moves, opts) {
    const box = $('promo');
    box.querySelectorAll('button').forEach((b) => b.remove());
    const color = this.game.turn();
    this.pendingPromo = { from, to };
    for (const type of [5, 4, 3, 2]) {
      const m = moves.find((mm) => C.mPromo(mm) === type);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn';
      b.innerHTML = `<span class="glyph">${GLYPH[color][type]}${VS}</span><span class="pname">${NAMES[type][0].toUpperCase() + NAMES[type].slice(1)}</span>`;
      b.setAttribute('aria-label', `Promote to ${NAMES[type]}`);
      b.addEventListener('click', () => { this.closePromo(); this.playMove(m, opts); });
      box.appendChild(b);
    }
    box.hidden = false;
    const p = new THREE.Vector3(sqX(to), 1.2, sqZ(to)).project(this.camera);
    const W = this.container.clientWidth, H = this.container.clientHeight;
    const bw = box.offsetWidth, bh = box.offsetHeight;
    box.style.left = clamp((p.x + 1) / 2 * W - bw / 2, 12, W - bw - 12) + 'px';
    box.style.top = clamp((1 - p.y) / 2 * H - bh - 10, 12, H - bh - 12) + 'px';
    box.querySelector('button').focus();
  }
  closePromo(cancelled) {
    $('promo').hidden = true;
    const p = this.pendingPromo;
    this.pendingPromo = null;
    if (cancelled && p) {
      const v = this.views.get(p.from);
      if (v) { const x0 = v.x, z0 = v.z; this.tween(220, (k) => { v.x = x0 + (sqX(p.from) - x0) * k; v.z = z0 + (sqZ(p.from) - z0) * k; }); }
      this.clearSelection();
    }
  }

  /* ----- HUD ----- */
  bindUI() {
    $('btnNew').addEventListener('click', () => this.openNew());
    $('btnNewMobile').addEventListener('click', () => this.openNew());
    $('btnUndo').addEventListener('click', () => this.undo());
    $('btnDraw').addEventListener('click', () => this.offerDraw());
    $('btnResign').addEventListener('click', () => this.resign());
    $('btnReset').addEventListener('click', () => this.resetCamera());
    $('btnOverhead').addEventListener('click', () => this.toggleOverhead());
    $('btnMoves').addEventListener('click', () => this.setDrawer($('drawer').dataset.open !== 'true'));
    $('btnCloseDrawer').addEventListener('click', () => this.setDrawer(false));
    $('btnSound').addEventListener('click', () => this.setSfx(!settings.sfx));
    $('camSeg').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setCameraMode(b.dataset.cam)));
    const pops = [['btnSettings', 'settingsPop'], ['btnSettingsMobile', 'settingsPop'], ['btnHelp', 'helpPop']];
    for (const [btn, pop] of pops) $(btn).addEventListener('click', (e) => { e.stopPropagation(); this.togglePop(pop, btn); });
    document.addEventListener('pointerdown', (e) => {
      for (const id of ['settingsPop', 'helpPop']) {
        const el = $(id);
        if (!el.hidden && !el.contains(e.target) && !e.target.closest('#btnSettings,#btnHelp,#btnSettingsMobile')) this.closePop(id);
      }
    });
    // settings toggles
    const bindToggle = (id, key, fn) => { const el = $(id); el.checked = settings[key]; el.addEventListener('change', () => { settings[key] = el.checked; saveSettings(); if (fn) fn(el.checked); }); };
    bindToggle('setHints', 'hints', () => this.refreshOverlay());
    bindToggle('setSfx', 'sfx', (on) => this.setSfx(on));
    bindToggle('setAmb', 'ambience', (on) => Sound.ambience(on));
    bindToggle('setHQ', 'hq', () => { this.perfDone = true; this.applyQuality(); });
    this.setSfx(settings.sfx, true);
    // move record
    $('navFirst').addEventListener('click', () => this.setViewPly(0));
    $('navPrev').addEventListener('click', () => this.stepHistory(-1));
    $('navNext').addEventListener('click', () => this.stepHistory(1));
    $('navLast').addEventListener('click', () => this.setViewPly(null));
    $('moveList').addEventListener('click', (e) => { const b = e.target.closest('.move'); if (b) this.setViewPly(+b.dataset.ply); });
    $('typeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('typeInput'), msg = $('typeMsg');
      if (!this.humanCanMove()) { msg.textContent = this.game.result ? 'The game is over.' : 'Wait for your turn.'; msg.dataset.error = 'true'; return; }
      const m = this.game.parse(input.value);
      if (!m) { msg.textContent = `“${input.value.trim()}” isn't a legal move here.`; msg.dataset.error = 'true'; return; }
      msg.textContent = ''; msg.dataset.error = 'false'; input.value = '';
      this.playMove(m);
    });
    // confirm
    $('confirmNo').addEventListener('click', () => { $('confirm').hidden = true; });
    $('confirmYes').addEventListener('click', () => { $('confirm').hidden = true; if (this.confirmFn) this.confirmFn(); });
    // new game
    const form = $('newForm');
    form.addEventListener('change', () => this.syncNewForm());
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      let side = fd.get('side');
      if (side === 'random') side = Math.random() < 0.5 ? 'white' : 'black';
      $('newModal').hidden = true;
      this.newGame({ mode: fd.get('mode'), humanSide: side === 'black' ? BLACK : WHITE, level: fd.get('level'), tc: fd.get('tc') }, { intro: true });
    });
    $('newCancel').addEventListener('click', () => { $('newModal').hidden = true; });
    $('newModal').addEventListener('pointerdown', (e) => { if (e.target === $('newModal')) $('newModal').hidden = true; });
    $('overNew').addEventListener('click', () => { this.hideOver(); this.openNew(); });
    $('overReview').addEventListener('click', () => this.hideOver());
    // keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.closest && e.target.closest('input, select, textarea')) return;
      if (e.key === 'Escape') {
        if (!$('promo').hidden) { this.closePromo(true); return; }
        for (const id of ['newModal', 'overModal', 'confirm']) if (!$(id).hidden) { $(id).hidden = true; return; }
        for (const id of ['settingsPop', 'helpPop']) if (!$(id).hidden) { this.closePop(id); return; }
        this.clearSelection(); this.cursorVisible = false; this.refreshOverlay();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.pendingPromo) {
        const t = { q: 5, r: 4, b: 3, n: 2 }[e.key.toLowerCase()];
        if (t) { const btn = [...$('promo').querySelectorAll('button')][[5, 4, 3, 2].indexOf(t)]; if (btn) btn.click(); }
        return;
      }
      if (!$('newModal').hidden) return;
      const k = e.key;
      if (k === 'ArrowLeft') { e.preventDefault(); this.stepHistory(-1); }
      else if (k === 'ArrowRight') { e.preventDefault(); this.stepHistory(1); }
      else if (k === 'Home') this.setViewPly(0);
      else if (k === 'End') this.setViewPly(null);
      else if (k === 'u' || k === 'U') this.undo();
      else if (k === 'f' || k === 'F') this.setCameraMode(this.viewerSide === WHITE ? 'black' : 'white');
      else if (k === 'o' || k === 'O') this.toggleOverhead();
      else if (k === 'r' || k === 'R') this.resetCamera();
      else if (k === 'm' || k === 'M') this.setSfx(!settings.sfx);
      else if (k === 'n' || k === 'N') this.openNew();
      else if (k === '?') this.togglePop('helpPop', 'btnHelp');
    });
  }
  stepHistory(d) {
    const n = this.game.history.length;
    const cur = this.viewPly === null ? n : this.viewPly;
    this.setViewPly(cur + d >= n ? null : cur + d);
  }
  setSfx(on, quiet) {
    settings.sfx = on; saveSettings();
    $('btnSound').setAttribute('aria-pressed', String(on));
    $('btnSound').querySelector('.wave').style.opacity = on ? 1 : 0.15;
    $('setSfx').checked = on;
    if (!quiet) this.toast(on ? 'Sound on' : 'Sound off');
  }
  setCameraMode(mode) {
    this.cameraMode = mode;
    if (this.mode === 'local' || mode !== 'follow') { settings.camera = mode; saveSettings(); }
    this.updateCamSeg();
    this.snapCameraToSide(this.desiredSide(), true);
  }
  updateCamSeg() {
    const effective = this.cameraMode;
    $('camSeg').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cam === effective)));
  }
  toggleOverhead() {
    settings.overhead = !settings.overhead; saveSettings();
    $('btnOverhead').setAttribute('aria-pressed', String(settings.overhead));
    const r = this.rig;
    r.anim = { from: { az: r.az, polar: r.polar, zoom: r.zoom }, to: { az: r.az, polar: this.defaultPolar(), zoom: 1 }, t0: performance.now(), dur: reduceMotion ? 1 : 700 };
  }
  resetCamera() {
    this.rig.user = false;
    this.snapCameraToSide(this.desiredSide(), true);
  }
  setDrawer(open) {
    $('drawer').dataset.open = String(open);
    $('btnMoves').setAttribute('aria-expanded', String(open));
    settings.drawer = open; saveSettings();
    this.measureSafe();
    this.camera.updateProjectionMatrix();
  }
  togglePop(id, btn) {
    const el = $(id);
    const open = el.hidden;
    for (const other of ['settingsPop', 'helpPop']) if (other !== id) this.closePop(other);
    el.hidden = !open;
    $(btn).setAttribute('aria-expanded', String(open));
    if (open) {
      const b = $(btn).getBoundingClientRect(), s = this.container.getBoundingClientRect();
      const narrow = this.container.clientWidth <= 640;
      el.style.right = narrow ? '10px' : Math.max(10, s.right - b.right) + 'px';
      el.style.top = narrow ? 'auto' : (b.bottom - s.top + 8) + 'px';
      el.style.bottom = narrow ? '80px' : 'auto';
      const first = el.querySelector('input, button'); if (first) first.focus();
    }
  }
  closePop(id) { $(id).hidden = true; for (const b of ['btnSettings', 'btnHelp', 'btnSettingsMobile']) if ($(b).getAttribute('aria-controls') === id) $(b).setAttribute('aria-expanded', 'false'); }
  confirm(text, yes, fn) {
    $('confirmText').textContent = text;
    $('confirmYes').textContent = yes;
    this.confirmFn = fn;
    $('confirm').hidden = false;
    $('confirmNo').focus();
  }
  openNew() {
    const form = $('newForm');
    form.elements.mode.value = this.mode;
    form.elements.tc.value = this.tc;
    form.elements.level.value = this.level;
    form.elements.side.value = this.humanSide === BLACK ? 'black' : 'white';
    this.syncNewForm();
    $('newModal').hidden = false;
    form.querySelector('input:checked').focus();
  }
  syncNewForm() {
    const ai = $('newForm').elements.mode.value === 'ai';
    $('aiFields').hidden = !ai; $('aiLevel').hidden = !ai;
  }
  showOver() {
    const r = this.game.result;
    if (!r) return;
    const winner = r.winner >= 0 ? SIDE[r.winner] : null;
    const titles = {
      checkmate: 'Checkmate', stalemate: 'Stalemate', insufficient: 'Draw', fifty: 'Draw', threefold: 'Draw',
      resign: `${SIDE[r.loser]} resigns`, timeout: `${SIDE[r.loser]}'s flag falls`, 'timeout-draw': 'Draw on time', agreed: 'Draw agreed',
    };
    const texts = {
      checkmate: `${winner} wins. The ${SIDE[r.winner ^ 1].toLowerCase()} king has no escape.`,
      stalemate: `${SIDE[this.game.turn()]} has no legal move but is not in check, so the game is drawn.`,
      insufficient: 'Neither side has enough material left to deliver checkmate.',
      fifty: 'Fifty moves passed without a capture or a pawn move.',
      threefold: 'The same position came up three times.',
      resign: `${winner} wins.`, timeout: `${winner} wins on time.`,
      'timeout-draw': `${SIDE[r.loser]} ran out of time, but ${SIDE[r.loser ^ 1]} has no mating material.`,
      agreed: 'Both sides shake hands over the board.',
    };
    $('overScore').textContent = r.score.replace('-', '–');
    $('overTitle').textContent = titles[r.reason] || 'Game over';
    $('overText').textContent = texts[r.reason] || '';
    $('overModal').hidden = false;
    $('overNew').focus();
    const humanWon = this.mode === 'ai' ? r.winner === this.humanSide : r.winner >= 0;
    Sound.end(humanWon);
    if (r.winner >= 0 && !reduceMotion) {
      const kingSq = this.game.pos.kings[r.winner];
      for (let i = 0; i < 3; i++) setTimeout(() => this.world.burst(sqX(kingSq), sqZ(kingSq), { count: 40, up: 1.4 }), i * 260);
    }
  }
  hideOver() { $('overModal').hidden = true; }
  toast(text) {
    const t = $('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  announce(text) { $('announcer').textContent = text; }
  announceMove(info) {
    const who = SIDE[info.color];
    let s;
    if (info.castle) s = `${who} castles ${C.mTo(info.m) > C.mFrom(info.m) ? 'kingside' : 'queenside'}`;
    else {
      s = `${who} ${NAMES[C.typeOf(info.piece)]} from ${C.sqName(info.from)} to ${C.sqName(info.to)}`;
      if (info.captured) s += `, takes the ${NAMES[C.typeOf(info.captured)]}`;
      if (info.promo) s += `, promotes to ${NAMES[info.promo]}`;
    }
    if (info.san.endsWith('#')) s += '. Checkmate.'; else if (info.san.endsWith('+')) s += '. Check.';
    this.announce(s);
  }

  updateUI() {
    const g = this.game;
    const n = g.history.length;
    const reviewing = this.viewPly !== null;
    const pos = reviewing ? g.positionAt(this.viewPly) : g.pos;
    const turn = pos.turn;
    // status line
    const st = $('status'), txt = $('statusText');
    st.dataset.turn = turn === WHITE ? 'white' : 'black';
    st.dataset.alert = '';
    if (reviewing) {
      txt.innerHTML = `Move ${this.viewPly} of ${n} · <button type="button" id="backLive">Back to game</button>`;
      $('backLive').addEventListener('click', () => this.setViewPly(null));
    } else if (g.result) {
      const r = g.result;
      st.dataset.alert = 'over';
      const why = { checkmate: 'Checkmate', stalemate: 'Stalemate', insufficient: 'Insufficient material', fifty: 'Fifty-move rule', threefold: 'Threefold repetition', resign: 'Resignation', timeout: 'Time', 'timeout-draw': 'Time', agreed: 'Agreed' }[r.reason];
      txt.textContent = `${why} · ${r.winner >= 0 ? SIDE[r.winner] + ' wins' : 'Draw'} ${r.score.replace('-', '–')}`;
    } else if (this.aiThinking) {
      txt.textContent = `${SIDE[this.aiSide]} is thinking…`;
    } else {
      const you = this.mode === 'ai' && turn === this.humanSide;
      const check = g.pos.inCheck();
      if (check) st.dataset.alert = 'check';
      txt.textContent = `${check ? 'Check · ' : ''}${you ? 'Your move' : `${SIDE[turn]} to move`}`;
    }
    // plates
    for (const side of [WHITE, BLACK]) {
      const plate = side === WHITE ? $('plateWhite') : $('plateBlack');
      plate.dataset.active = String(!g.result && !reviewing && g.turn() === side);
      const role = side === WHITE ? $('roleWhite') : $('roleBlack');
      role.textContent = this.mode === 'ai' ? (side === this.humanSide ? 'You' : `Computer · ${{ easy: 'gentle', medium: 'steady', hard: 'strong' }[this.level]}`) : (side === WHITE ? 'Player one' : 'Player two');
    }
    // captures from the displayed position
    const counts = [{}, {}];
    for (let sq = 0; sq < 120; sq++) { if (sq & 0x88) { sq += 7; continue; } const p = pos.board[sq]; if (p) { const c = C.colorOf(p), t = C.typeOf(p); counts[c][t] = (counts[c][t] || 0) + 1; } }
    const START = { 1: 8, 2: 2, 3: 2, 4: 2, 5: 1 }, VAL = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9 };
    const material = [0, 0];
    for (const side of [WHITE, BLACK]) for (const t of [1, 2, 3, 4, 5]) material[side] += (counts[side][t] || 0) * VAL[t];
    for (const side of [WHITE, BLACK]) {
      const opp = side ^ 1;
      let s = '';
      for (const t of [5, 4, 3, 2, 1]) { const missing = Math.max(0, START[t] - (counts[opp][t] || 0)); s += (GLYPH[opp][t] + VS).repeat(missing); }
      $(side === WHITE ? 'capsWhite' : 'capsBlack').textContent = s;
      const diff = material[side] - material[opp];
      $(side === WHITE ? 'advWhite' : 'advBlack').textContent = diff > 0 ? `+${diff}` : '';
    }
    this.paintClocks();
    // move list
    const list = $('moveList');
    list.innerHTML = '';
    $('emptyMoves').hidden = n > 0;
    const cur = reviewing ? this.viewPly : n;
    for (let i = 0; i < n; i += 2) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="mnum">${i / 2 + 1}.</span>`;
      for (let j = i; j < i + 2; j++) {
        if (j < n) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'move'; b.dataset.ply = j + 1; b.textContent = g.history[j].san;
          b.setAttribute('aria-label', `Move ${i / 2 + 1}, ${SIDE[j % 2]}: ${g.history[j].san}`);
          if (j + 1 === cur) b.setAttribute('aria-current', 'true');
          li.appendChild(b);
        } else li.appendChild(document.createElement('span'));
      }
      list.appendChild(li);
    }
    const currentBtn = list.querySelector('[aria-current="true"]');
    if (currentBtn) {
      const top = currentBtn.offsetTop - list.offsetTop, h = currentBtn.offsetHeight;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + h > list.scrollTop + list.clientHeight) list.scrollTop = top + h - list.clientHeight;
    }
    this.container.parentElement.scrollLeft = 0; this.container.parentElement.scrollTop = 0;
    // controls
    $('btnUndo').disabled = n === 0;
    $('btnDraw').disabled = !!g.result || n === 0;
    $('btnResign').disabled = !!g.result || n === 0;
    $('navFirst').disabled = cur === 0; $('navPrev').disabled = cur === 0;
    $('navNext').disabled = !reviewing; $('navLast').disabled = !reviewing;
    $('btnOverhead').setAttribute('aria-pressed', String(settings.overhead));
    this.refreshOverlay();
  }
}

boot().catch((err) => {
  console.error(err);
  const sub = $('loadingSub');
  if (sub) sub.innerHTML = `<p class="fatal">The board couldn't be set up: ${String(err.message || err).replace(/</g, '&lt;')}. Reload the page to try again.</p>`;
});
