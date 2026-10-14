/* ---------- Sculpted fantasy piece set ----------
   Every figure is modeled facing +z, standing on y = 0, one square = 1 unit. */
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V3(0, 1, 0);

function lathe(pts, seg = 28, phiStart = 0, phiLen = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0001), y)), seg, phiStart, phiLen);
}
function limb(a, b, r1, r2 = r1, seg = 12, caps = true) {
  const dir = b.clone().sub(a), len = dir.length();
  const g = new THREE.CylinderGeometry(r2, r1, len, seg, 1, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize()));
  g.translate(a.x, a.y, a.z);
  if (!caps) return [g];
  return [g, ball(a, r1, [1, 1, 1], Math.max(8, seg)), ball(b, r2, [1, 1, 1], Math.max(8, seg))];
}
function ball(c, r, s = [1, 1, 1], seg = 16) {
  const g = new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.7)));
  g.scale(s[0], s[1], s[2]); g.translate(c.x, c.y, c.z);
  return g;
}
function cone(base, dir, r, h, seg = 10) {
  const g = new THREE.ConeGeometry(r, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize()));
  g.translate(base.x, base.y, base.z);
  return g;
}
function box(c, w, h, d, rot) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rot) g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])));
  g.translate(c.x, c.y, c.z);
  return g;
}
function ring(y, R, r, sz = 1, seg = 40, x = 0, z = 0) {
  const g = new THREE.TorusGeometry(R, r, 8, seg);
  g.rotateX(Math.PI / 2); g.scale(1, 1, sz); g.translate(x, y, z);
  return g;
}
function tube(points, r, seg = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, seg, r, radial, false);
}

// Feathered wing in the XY plane (x outward, y up), root at the origin, thickness along z.
function wingGeometry({ span = 0.4, height = 0.5, feathers = 8, sharp = false, coverts = true }) {
  function shape(sp, ht, n, notch) {
    const s = new THREE.Shape();
    s.moveTo(0, -0.04 * ht);
    s.bezierCurveTo(sp * 0.04, ht * 0.5, sp * 0.42, ht * 1.04, sp, ht);
    const tips = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      tips.push([sp * (1 - 0.84 * t) + sp * 0.16 * Math.sin(Math.PI * t), ht * (1 - 1.22 * t) - ht * 0.12 * Math.sin(Math.PI * t)]);
    }
    const cx = sp * 0.3, cy = ht * 0.5;
    for (let i = 1; i < n; i++) {
      const [px, py] = tips[i - 1], [qx, qy] = tips[i];
      const mx = (px + qx) / 2, my = (py + qy) / 2;
      const nx = mx + (cx - mx) * notch, ny = my + (cy - my) * notch;
      s.lineTo(nx, ny);
      if (sharp) s.lineTo(qx, qy);
      else {
        const ox = qx + (qx - cx) * 0.07, oy = qy + (qy - cy) * 0.07;
        s.quadraticCurveTo(ox, oy, qx, qy);
      }
    }
    s.lineTo(sp * 0.05, -0.14 * ht);
    s.closePath();
    return s;
  }
  const opts = { depth: 0.014, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1, curveSegments: 5 };
  const parts = [];
  const main = new THREE.ExtrudeGeometry(shape(span, height, feathers, sharp ? 0.2 : 0.14), opts);
  main.translate(0, 0, -0.007);
  parts.push(main);
  if (coverts) {
    for (const zz of [0.012, -0.012]) {
      const cv = new THREE.ExtrudeGeometry(shape(span * 0.62, height * 0.66, Math.max(4, feathers - 3), sharp ? 0.18 : 0.12), { ...opts, depth: 0.008 });
      cv.translate(span * 0.06, height * 0.3, zz - 0.004);
      parts.push(cv);
    }
  }
  return mergeGeometries(parts.map(cleanGeo));
}
// Position a wing: side +1 = figure's left (+x), -1 = right (-x).
function placeWing(geo, side, root, { sweep = 0.5, lean = -0.2, splay = 0 }) {
  const g = geo.clone();
  if (side < 0) g.rotateY(Math.PI);
  g.rotateZ(side * splay);
  g.rotateY(side * sweep);
  g.rotateX(lean);
  g.translate(root.x, root.y, root.z);
  return g;
}

function cleanGeo(g) {
  let n = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
  if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  return n;
}

class Sculpt {
  constructor() { this.parts = {}; }
  add(key, ...gs) {
    const list = this.parts[key] || (this.parts[key] = []);
    for (const g of gs.flat()) list.push(g);
    return this;
  }
  mark() { const m = {}; for (const k of Object.keys(this.parts)) m[k] = this.parts[k].length; return m; }
  transformSince(mark, matrix) {
    for (const [k, list] of Object.entries(this.parts)) for (let i = mark[k] || 0; i < list.length; i++) list[i].applyMatrix4(matrix);
  }
  build(mats) {
    const group = new THREE.Group();
    for (const [key, gs] of Object.entries(this.parts)) {
      const merged = mergeGeometries(gs.map(cleanGeo));
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mats[key] || mats.body);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.matKey = key;
      group.add(mesh);
    }
    return group;
  }
}

/* ---------- Bases ---------- */
function roundBase(S, r = 0.34, top = 0.14) {
  const k = r / 0.34;
  S.add('body', lathe([[0, 0], [0.335 * k, 0], [0.345 * k, 0.014], [0.345 * k, 0.056], [0.33 * k, 0.07], [0.306 * k, 0.08], [0.3 * k, 0.108], [0.284 * k, 0.124], [0.27 * k, top], [0, top]], 40));
  S.add('trim', ring(0.033, 0.347 * k, 0.011, 1, 48), ring(0.116, 0.293 * k, 0.009, 1, 48));
  return top;
}
function pawnPedestal(S) {
  S.add('body', lathe([[0, 0], [0.27, 0], [0.28, 0.014], [0.28, 0.05], [0.255, 0.066], [0.205, 0.088], [0.19, 0.16], [0.215, 0.18], [0.228, 0.205], [0, 0.205]], 36));
  S.add('trim', ring(0.03, 0.282, 0.01, 1, 44), ring(0.192, 0.226, 0.009, 1, 44));
  return 0.205;
}

/* ---------- Figures ---------- */
function buildPawn(color) {
  const S = new Sculpt();
  const y0 = pawnPedestal(S);
  const goblin = color === 'black';
  const mark = S.mark();
  const sk = goblin ? 'skin' : 'body';
  // legs and boots
  for (const s of [-1, 1]) {
    S.add('body', limb(V3(s * 0.043, y0 + 0.02, 0), V3(s * 0.04, y0 + 0.25, 0), 0.034, 0.037, 10));
    S.add(goblin ? 'body' : 'trim', ball(V3(s * 0.043, y0 + 0.025, 0.018), 0.035, [1, 0.7, 1.4], 10));
  }
  S.add('body', lathe([[0, y0 + 0.2], [0.08, y0 + 0.2], [0.098, y0 + 0.23], [0.088, y0 + 0.31], [0.074, y0 + 0.35], [0, y0 + 0.35]], 22).scale(1, 1, 0.85));
  S.add('body', lathe([[0, y0 + 0.3], [0.072, y0 + 0.3], [0.084, y0 + 0.4], [0.094, y0 + 0.49], [0.078, y0 + 0.55], [0.03, y0 + 0.575], [0, y0 + 0.575]], 22).scale(1, 1, 0.8));
  S.add('trim', ring(y0 + 0.325, 0.08, 0.01, 0.85, 28));
  // shoulders
  for (const s of [-1, 1]) {
    S.add('body', ball(V3(s * 0.085, y0 + 0.53, 0), 0.046, [1, 0.8, 1], 12));
    if (!goblin) S.add('trim', ring(y0 + 0.515, 0.046, 0.006, 1, 18, s * 0.085, 0));
  }
  // head
  S.add(sk, limb(V3(0, y0 + 0.55, 0), V3(0, y0 + 0.62, 0.005), 0.03, 0.028, 8, false));
  const hc = V3(0, y0 + 0.645, 0.008);
  if (goblin) {
    S.add('skin', ball(hc, 0.062, [1.05, 0.95, 1], 16));
    for (const s of [-1, 1]) S.add('skin', cone(V3(s * 0.05, y0 + 0.66, -0.005), V3(s, 0.45, -0.25), 0.024, 0.1, 8));
    S.add('skin', cone(V3(0, y0 + 0.64, 0.06), V3(0, -0.4, 1), 0.016, 0.04, 8));
    S.add('body', ball(V3(0, y0 + 0.69, -0.008), 0.058, [1, 0.6, 1], 14)); // leather cap
  } else {
    S.add('body', ball(hc, 0.054, [1, 1, 1], 16));
    const helm = new THREE.SphereGeometry(0.064, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56);
    helm.translate(hc.x, hc.y + 0.004, hc.z - 0.004);
    S.add('body', helm);
    S.add('trim', ring(hc.y - 0.004, 0.064, 0.007, 1, 24, 0, hc.z - 0.004));
    S.add('trim', tube([V3(0, hc.y + 0.02, hc.z + 0.06), V3(0, hc.y + 0.075, hc.z + 0.01), V3(0, hc.y + 0.06, hc.z - 0.05)], 0.008, 10, 6));
    S.add('body', cone(V3(0, hc.y + 0.06, hc.z), V3(0, 1, -0.1), 0.012, 0.05, 8));
  }
  // arms
  S.add(goblin ? 'skin' : 'body', limb(V3(-0.088, y0 + 0.52, 0), V3(-0.122, y0 + 0.42, 0.04), 0.026, 0.023, 8),
    limb(V3(-0.122, y0 + 0.42, 0.04), V3(-0.118, y0 + 0.4, 0.06), 0.023, 0.022, 8));
  S.add(goblin ? 'skin' : 'body', limb(V3(0.088, y0 + 0.52, 0), V3(0.12, y0 + 0.43, 0.04), 0.026, 0.023, 8));
  // round shield on the figure's left
  const shield = new THREE.CylinderGeometry(0.104, 0.104, 0.024, 28);
  shield.rotateX(Math.PI / 2); shield.rotateY(0.45);
  shield.translate(0.125, y0 + 0.4, 0.07);
  S.add('body', shield);
  const rim = new THREE.TorusGeometry(0.104, 0.009, 6, 30);
  rim.rotateY(0.45); rim.translate(0.13, y0 + 0.4, 0.082);
  S.add('trim', rim, ball(V3(0.135, y0 + 0.4, 0.092), 0.026, [1, 1, 0.7], 12));
  if (goblin) {
    S.add('trim', limb(V3(-0.12, y0 + 0.4, 0.07), V3(-0.13, y0 + 0.18, 0.14), 0.012, 0.004, 6));
    S.add('trim', box(V3(-0.121, y0 + 0.4, 0.068), 0.06, 0.012, 0.02));
  } else {
    S.add('trim', limb(V3(-0.118, y0 - 0.02, 0.06), V3(-0.118, y0 + 0.86, 0.06), 0.011, 0.01, 6));
    S.add('trim', cone(V3(-0.118, y0 + 0.86, 0.06), UP, 0.022, 0.085, 8));
  }
  // bulk the figure up relative to its pedestal
  const k = goblin ? 1.32 : 1.28;
  S.transformSince(mark, new THREE.Matrix4().makeTranslation(0, y0, 0)
    .multiply(new THREE.Matrix4().makeScale(k, goblin ? 1.12 : 1.1, k))
    .multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0)));
  return { S, height: goblin ? 1.0 : 1.1 };
}

function buildRook(color) {
  const S = new Sculpt();
  const oct = (pts) => lathe(pts, 8, Math.PI / 8);
  if (color === 'white') {
    S.add('body', oct([[0, 0], [0.34, 0], [0.34, 0.06], [0.31, 0.072], [0.31, 0.12], [0.282, 0.132], [0.27, 0.16], [0.245, 0.18], [0.236, 0.66], [0.27, 0.7], [0.276, 0.8], [0.205, 0.8], [0.205, 0.76], [0, 0.76]]));
    for (const [y, r] of [[0.07, 0.312], [0.3, 0.244], [0.55, 0.239], [0.67, 0.25]]) {
      S.add('trim', oct([[r, y], [r + 0.012, y + 0.005], [r + 0.012, y + 0.02], [r, y + 0.025]]));
    }
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, rr = 0.245;
      S.add('body', box(V3(Math.sin(a) * rr, 0.85, Math.cos(a) * rr), 0.105, 0.11, 0.06, [0, a, 0]));
    }
    // arched door and windows
    const ap = 0.236 * Math.cos(Math.PI / 8);
    S.add('trim', box(V3(0, 0.255, ap + 0.004), 0.12, 0.15, 0.016));
    const arch = new THREE.CylinderGeometry(0.06, 0.06, 0.016, 16, 1, false, -Math.PI / 2, Math.PI);
    arch.rotateX(Math.PI / 2); arch.translate(0, 0.33, ap + 0.004);
    S.add('trim', arch);
    S.add('shade', box(V3(0, 0.25, ap + 0.012), 0.004, 0.13, 0.004));
    for (const a of [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]) {
      S.add('shade', box(V3(Math.sin(a) * (ap + 0.003), 0.47, Math.cos(a) * (ap + 0.003)), 0.036, 0.085, 0.012, [0, a, 0]));
      S.add('trim', box(V3(Math.sin(a) * (ap + 0.001), 0.47, Math.cos(a) * (ap + 0.001)), 0.052, 0.1, 0.008, [0, a, 0]));
    }
    return { S, height: 0.95 };
  }
  // Black: gothic keep crowned with spires
  S.add('body', oct([[0, 0], [0.34, 0], [0.34, 0.06], [0.305, 0.08], [0.305, 0.12], [0.265, 0.15], [0.226, 0.18], [0.21, 0.74], [0.25, 0.78], [0.252, 0.86], [0, 0.86]]));
  S.add('trim', oct([[0.306, 0.07], [0.318, 0.075], [0.318, 0.09], [0.306, 0.095]]), oct([[0.214, 0.4], [0.226, 0.405], [0.226, 0.42], [0.214, 0.425]]));
  S.add('body', oct([[0.16, 0.86], [0.16, 1.0], [0.18, 1.02], [0.15, 1.04], [0, 1.5]]));
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    S.add('body', box(V3(Math.sin(a) * 0.23, 0.9, Math.cos(a) * 0.23), 0.07, 0.08, 0.05, [0, a, 0]));
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, x = Math.sin(a) * 0.21, z = Math.cos(a) * 0.21;
    S.add('body', limb(V3(x, 0.7, z), V3(x, 1.06, z), 0.05, 0.05, 10, false));
    S.add('body', lathe([[0.062, 1.06], [0.06, 1.09], [0, 1.27]], 8).translate(x, 0, z));
    S.add('trim', ring(1.065, 0.062, 0.007, 1, 16, x, z));
  }
  for (const a of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const ap = 0.21 * Math.cos(Math.PI / 8) + 0.004;
    S.add('shade', box(V3(Math.sin(a) * ap, 0.52, Math.cos(a) * ap), 0.045, 0.14, 0.012, [0, a, 0]));
    const arch = new THREE.ConeGeometry(0.025, 0.05, 4); arch.rotateY(Math.PI / 4);
    arch.translate(Math.sin(a) * ap, 0.615, Math.cos(a) * ap);
    S.add('shade', arch);
  }
  S.add('shade', box(V3(0, 0.25, 0.205), 0.08, 0.13, 0.012));
  S.add('trim', box(V3(0, 0.25, 0.2), 0.1, 0.15, 0.008));
  return { S, height: 1.45 };
}

function horse(S, y0, { horn = false, wingSharp = false }) {
  const b = 'body';
  // hind legs
  for (const s of [-1, 1]) {
    S.add(b, ball(V3(s * 0.052, y0 + 0.36, -0.1), 0.085, [0.85, 1.05, 1.1], 14));
    S.add(b, limb(V3(s * 0.062, y0 + 0.34, -0.11), V3(s * 0.06, y0 + 0.16, -0.175), 0.05, 0.03, 10));
    S.add(b, limb(V3(s * 0.06, y0 + 0.16, -0.175), V3(s * 0.056, y0 + 0.03, -0.1), 0.029, 0.025, 8));
    S.add(b, ball(V3(s * 0.056, y0 + 0.02, -0.088), 0.033, [1, 0.7, 1.25], 10));
  }
  // body: rump to chest, rearing
  S.add(b, limb(V3(0, y0 + 0.37, -0.085), V3(0, y0 + 0.58, 0.085), 0.098, 0.102, 18, true));
  S.add(b, ball(V3(0, y0 + 0.46, 0.0), 0.102, [0.95, 1.0, 1.15], 16));
  // front legs, tucked
  [[-1, 0], [1, 0.05]].forEach(([s, lift]) => {
    S.add(b, limb(V3(s * 0.058, y0 + 0.56, 0.1), V3(s * 0.064, y0 + 0.52 + lift, 0.215), 0.042, 0.03, 10));
    S.add(b, limb(V3(s * 0.064, y0 + 0.52 + lift, 0.215), V3(s * 0.06, y0 + 0.4 + lift, 0.18), 0.028, 0.024, 8));
    S.add(b, ball(V3(s * 0.06, y0 + 0.39 + lift, 0.18), 0.03, [1, 0.75, 1.15], 10));
  });
  // neck and head
  S.add(b, limb(V3(0, y0 + 0.62, 0.095), V3(0, y0 + 0.82, 0.14), 0.078, 0.05, 14));
  S.add(b, limb(V3(0, y0 + 0.86, 0.135), V3(0, y0 + 0.795, 0.27), 0.053, 0.036, 12));
  S.add(b, ball(V3(0, y0 + 0.83, 0.17), 0.05, [0.95, 1.05, 1.1], 12));
  for (const s of [-1, 1]) S.add(b, cone(V3(s * 0.022, y0 + 0.885, 0.125), V3(s * 0.2, 1, -0.35), 0.016, 0.06, 8));
  // mane
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    const p = V3(0, y0 + 0.88 - t * 0.24, 0.115 - t * 0.04 - 0.035);
    S.add(b, cone(p, V3(0, 0.3 - t * 0.6, -1), 0.03, 0.08, 6).scale(0.55, 1, 1));
  }
  // flowing tail
  S.add(b, tube([V3(0, y0 + 0.38, -0.17), V3(0, y0 + 0.31, -0.26), V3(0.02, y0 + 0.17, -0.3), V3(0.04, y0 + 0.05, -0.24)], 0.03, 16, 8));
  S.add(b, tube([V3(0, y0 + 0.37, -0.17), V3(-0.03, y0 + 0.28, -0.25), V3(-0.02, y0 + 0.14, -0.27), V3(-0.035, y0 + 0.05, -0.21)], 0.022, 16, 6));
  if (horn) S.add('trim', cone(V3(0, y0 + 0.875, 0.175), V3(0, 0.8, 0.6), 0.016, 0.15, 10));
  // wings raised from the withers
  const wg = wingGeometry({ span: 0.4, height: 0.44, feathers: wingSharp ? 8 : 7, sharp: wingSharp });
  for (const s of [-1, 1]) S.add(b, placeWing(wg, s, V3(s * 0.05, y0 + 0.62, 0.0), { sweep: 0.95, lean: -0.35, splay: -0.25 }));
}

function buildKnight(color, variant) {
  const S = new Sculpt();
  const y0 = roundBase(S);
  horse(S, y0, { horn: variant === 'unicorn' || color === 'black', wingSharp: color === 'black' });
  return { S, height: 1.25 };
}

function robedBody(S, y0, { hood }) {
  const prof = [[0, y0], [0.17, y0], [0.166, y0 + 0.05], [0.142, y0 + 0.25], [0.118, y0 + 0.5], [0.102, y0 + 0.68], [0.114, y0 + 0.78], [0.11, y0 + 0.83], [0.06, y0 + 0.87], [0.035, y0 + 0.89], [0, y0 + 0.89]];
  S.add('body', lathe(prof, 30).scale(1, 1, 0.82));
  S.add('trim', ring(y0 + 0.028, 0.168, 0.01, 0.82, 40));
  const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (prof[i][1] >= y) { const [r0, a] = prof[i - 1], [r1, bb] = prof[i]; return r0 + (r1 - r0) * (y - a) / (bb - a); } return 0.1; };
  for (const xs of [-0.028, 0.028]) {
    const pts = [];
    for (let t = 0; t <= 1; t += 0.1) {
      const y = y0 + 0.84 - t * 0.81;
      const r = rAt(y) * 0.82;
      const x = xs * (0.6 + t * 0.9);
      pts.push(V3(x, y, Math.sqrt(Math.max(r * r - x * x, 0)) + 0.002));
    }
    S.add('trim', tube(pts, 0.0085, 20, 5));
  }
  S.add('trim', ring(y0 + 0.62, 0.104, 0.009, 0.82, 28));
  return prof;
}

function buildBishop(color) {
  const S = new Sculpt();
  const y0 = roundBase(S);
  const black = color === 'black';
  robedBody(S, y0, {});
  const head = V3(0, y0 + 0.95, 0.012);
  if (black) {
    S.add('body', lathe([[0.078, y0 + 0.86], [0.083, y0 + 0.95], [0.07, y0 + 1.05], [0.04, y0 + 1.12], [0, y0 + 1.16]], 22).scale(1, 1, 0.95).translate(0, 0, -0.012));
    S.add('shade', ball(V3(0, y0 + 0.94, 0.032), 0.052, [0.9, 1.1, 0.8], 12));
    S.add('body', lathe([[0.132, y0 + 0.62], [0.124, y0 + 0.74], [0.094, y0 + 0.85], [0.05, y0 + 0.9]], 24).scale(1, 1, 0.84));
  } else {
    S.add('body', ball(head, 0.056, [1, 1.05, 1], 14));
    S.add('body', lathe([[0.072, y0 + 0.86], [0.076, y0 + 0.95], [0.06, y0 + 1.0], [0, y0 + 1.02]], 20, Math.PI * 0.62, Math.PI * 0.76).translate(0, 0, -0.008));
    S.add('body', lathe([[0.062, y0 + 0.985], [0.064, y0 + 1.03], [0.05, y0 + 1.11], [0.02, y0 + 1.17], [0, y0 + 1.19]], 20).scale(1, 1, 0.78));
    S.add('trim', ring(y0 + 0.99, 0.063, 0.007, 0.78, 22), box(V3(0, y0 + 1.08, 0.04), 0.012, 0.13, 0.006, [-0.25, 0, 0]));
  }
  // sleeves and hands
  S.add('body', limb(V3(-0.1, y0 + 0.8, 0), V3(-0.13, y0 + 0.64, 0.04), 0.038, 0.04, 10), limb(V3(-0.13, y0 + 0.64, 0.04), V3(-0.148, y0 + 0.6, 0.1), 0.04, 0.052, 10));
  S.add('body', limb(V3(0.1, y0 + 0.8, 0), V3(0.12, y0 + 0.64, 0.05), 0.038, 0.04, 10), limb(V3(0.12, y0 + 0.64, 0.05), V3(0.06, y0 + 0.62, 0.12), 0.04, 0.05, 10));
  S.add('trim', ring(y0 + 0.6, 0.05, 0.006, 1, 16, -0.148, 0.1));
  S.add(black ? 'shade' : 'body', ball(V3(-0.152, y0 + 0.6, 0.12), 0.026, [1, 1, 1], 10));
  // staff
  const sx = -0.158, sz = 0.122;
  S.add('trim', limb(V3(sx, y0 - 0.01, sz), V3(sx, y0 + 1.1, sz), 0.011, 0.011, 8, false));
  if (black) {
    const crook = new THREE.TorusGeometry(0.042, 0.009, 6, 18, Math.PI * 1.35);
    crook.rotateZ(-0.2); crook.translate(sx, y0 + 1.15, sz);
    S.add('trim', crook, ball(V3(sx, y0 + 1.1, sz), 0.02, [1, 1, 1], 10));
    for (const s of [-1, 1]) S.add('trim', cone(V3(sx, y0 + 1.12, sz), V3(s * 0.5, 1, 0), 0.008, 0.07, 6));
  } else {
    S.add('trim', ball(V3(sx, y0 + 1.13, sz), 0.032, [1, 1.1, 1], 14), ring(y0 + 1.1, 0.03, 0.007, 1, 16, sx, sz),
      cone(V3(sx, y0 + 1.155, sz), UP, 0.012, 0.06, 8), ring(y0 + 1.0, 0.018, 0.006, 1, 12, sx, sz));
  }
  return { S, height: 1.35 };
}

function buildQueen(color) {
  const S = new Sculpt();
  const y0 = roundBase(S, 0.35, 0.145);
  const black = color === 'black';
  S.add('body', lathe([[0, y0], [0.2, y0], [0.198, y0 + 0.03], [0.162, y0 + 0.2], [0.122, y0 + 0.42], [0.086, y0 + 0.6], [0.072, y0 + 0.66], [0.084, y0 + 0.74], [0.09, y0 + 0.8], [0.07, y0 + 0.845], [0.034, y0 + 0.87], [0, y0 + 0.87]], 32).scale(1, 1, 0.85));
  S.add('trim', ring(y0 + 0.022, 0.2, 0.01, 0.85, 44), ring(y0 + 0.66, 0.074, 0.009, 0.85, 26), ring(y0 + 0.82, 0.078, 0.007, 0.85, 26));
  for (const xs of [-0.03, 0.03]) S.add('trim', tube([V3(xs * 0.5, y0 + 0.65, 0.064), V3(xs, y0 + 0.4, 0.106), V3(xs * 1.4, y0 + 0.15, 0.14), V3(xs * 1.6, y0 + 0.03, 0.17)], 0.0075, 16, 5));
  S.add('body', limb(V3(0, y0 + 0.85, 0), V3(0, y0 + 0.92, 0.005), 0.026, 0.024, 8, false));
  S.add('body', ball(V3(0, y0 + 0.96, 0.012), 0.054, [1, 1.08, 1], 14));
  // hair
  S.add('body', ball(V3(0, y0 + 0.97, -0.012), 0.06, [1.05, 1.05, 1], 14));
  S.add('body', limb(V3(0, y0 + 0.95, -0.03), V3(0, y0 + 0.74, -0.062), 0.05, 0.036, 10));
  for (const s of [-1, 1]) S.add('body', limb(V3(s * 0.045, y0 + 0.95, 0.0), V3(s * 0.06, y0 + 0.82, 0.02), 0.022, 0.016, 8));
  // crown
  S.add('trim', lathe([[0.048, y0 + 1.0], [0.052, y0 + 1.012], [0.054, y0 + 1.035], [0.05, y0 + 1.035]], 24));
  const n = black ? 7 : 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const p = V3(Math.sin(a) * 0.05, y0 + 1.03, Math.cos(a) * 0.05);
    S.add('trim', cone(p, V3(Math.sin(a) * 0.15, 1, Math.cos(a) * 0.15), 0.011, black ? 0.075 : 0.042, 6));
    if (!black) S.add('trim', ball(V3(p.x * 1.06, p.y + 0.045, p.z * 1.06), 0.008, [1, 1, 1], 6));
  }
  // arms, open in a gesture
  for (const s of [-1, 1]) {
    S.add('body', limb(V3(s * 0.08, y0 + 0.8, 0), V3(s * 0.118, y0 + 0.65, 0.025), 0.024, 0.022, 8));
    S.add('body', limb(V3(s * 0.118, y0 + 0.65, 0.025), V3(s * 0.14, y0 + 0.53, 0.07), 0.022, 0.034, 8));
    S.add('trim', ring(y0 + 0.535, 0.033, 0.005, 1, 14, s * 0.14, 0.07));
    S.add('body', ball(V3(s * 0.143, y0 + 0.51, 0.08), 0.02, [1, 1.2, 0.8], 8));
  }
  const wg = wingGeometry({ span: 0.4, height: 0.58, feathers: black ? 9 : 8, sharp: black });
  for (const s of [-1, 1]) S.add('body', placeWing(wg, s, V3(s * 0.035, y0 + 0.74, -0.065), { sweep: black ? 0.45 : 0.6, lean: -0.15, splay: black ? 0.1 : 0.05 }));
  return { S, height: 1.45 };
}

function buildKing(color) {
  const S = new Sculpt();
  const y0 = roundBase(S, 0.36, 0.15);
  const black = color === 'black';
  // boots / greaves
  for (const s of [-1, 1]) {
    S.add('body', limb(V3(s * 0.055, y0 + 0.01, 0.01), V3(s * 0.056, y0 + 0.22, 0), black ? 0.05 : 0.045, black ? 0.05 : 0.046, 10));
    S.add('trim', ring(y0 + 0.17, black ? 0.052 : 0.047, 0.007, 1, 16, s * 0.056, 0.0));
    S.add('body', ball(V3(s * 0.056, y0 + 0.02, 0.035), 0.044, [1, 0.6, 1.4], 10));
  }
  // long coat / armored skirt and torso
  S.add('body', lathe([[0, y0 + 0.17], [0.148, y0 + 0.17], [0.14, y0 + 0.3], [0.126, y0 + 0.5], [0.112, y0 + 0.64], [0.124, y0 + 0.8], [0.138, y0 + 0.93], [0.124, y0 + 0.99], [0.055, y0 + 1.03], [0, y0 + 1.03]], 32).scale(1, 1, 0.82));
  S.add('trim', ring(y0 + 0.19, 0.147, 0.009, 0.82, 40), ring(y0 + 0.64, 0.114, 0.012, 0.82, 32));
  S.add('trim', tube([V3(0, y0 + 0.98, 0.085), V3(0, y0 + 0.8, 0.104), V3(0, y0 + 0.62, 0.096), V3(0, y0 + 0.4, 0.105), V3(0, y0 + 0.19, 0.122)], 0.009, 20, 5));
  if (!black) {
    for (let i = 0; i < 5; i++) S.add('trim', ball(V3(0, y0 + 0.92 - i * 0.06, 0.106 + (i > 2 ? 0.004 : 0)), 0.008, [1, 1, 1], 6));
  } else {
    S.add('body', lathe([[0.13, y0 + 0.44], [0.14, y0 + 0.5], [0.13, y0 + 0.6], [0.11, y0 + 0.62]], 24).scale(1, 1, 0.85));
  }
  // cape behind
  const capeOuter = [[0.146, y0 + 0.97], [0.17, y0 + 0.75], [0.2, y0 + 0.4], [0.226, y0 + 0.03]];
  S.add('body', lathe(capeOuter, 22, Math.PI * 0.58, Math.PI * 0.84).scale(1, 1, 0.9));
  S.add('body', lathe(capeOuter.map(([r, y]) => [r - 0.012, y]).reverse(), 22, Math.PI * 0.58, Math.PI * 0.84).scale(1, 1, 0.9));
  // shoulders: fur mantle (White) or spiked pauldrons (Black)
  if (black) {
    for (const s of [-1, 1]) {
      S.add('body', ball(V3(s * 0.138, y0 + 0.95, 0), 0.074, [1, 0.8, 1], 14));
      S.add('trim', ring(y0 + 0.915, 0.07, 0.008, 1, 20, s * 0.138, 0));
      for (const k of [-1, 0, 1]) S.add('body', cone(V3(s * 0.15, y0 + 0.99, k * 0.035), V3(s * 0.7, 1, k * 0.25), 0.015, 0.07, 6));
    }
  } else {
    S.add('body', lathe([[0.06, y0 + 1.05], [0.12, y0 + 1.015], [0.162, y0 + 0.96], [0.165, y0 + 0.92], [0.14, y0 + 0.9], [0.06, y0 + 0.92]], 30).scale(1, 1, 0.86));
    for (let k = 0; k < 22; k++) {
      const a = (k / 22) * Math.PI * 2;
      S.add('body', ball(V3(Math.sin(a) * 0.158, y0 + 0.935 + (k % 2) * 0.012, Math.cos(a) * 0.158 * 0.86), 0.022, [1, 1, 1], 7));
    }
  }
  // head
  const hy = y0 + 1.11;
  if (black) {
    S.add('body', ball(V3(0, hy, 0.01), 0.068, [1, 1.08, 1], 16));
    S.add('shade', box(V3(0, hy - 0.004, 0.068), 0.07, 0.016, 0.012));
    S.add('trim', box(V3(0, hy - 0.02, 0.07), 0.008, 0.06, 0.008));
  } else {
    S.add('body', ball(V3(0, hy, 0.012), 0.062, [1, 1.05, 1], 16));
    S.add('body', ball(V3(0, hy - 0.045, 0.04), 0.052, [1, 1.25, 0.75], 12));
    S.add('body', ball(V3(0, hy + 0.005, -0.016), 0.066, [1.05, 1.05, 1], 12));
  }
  // crown
  const cy = hy + 0.045;
  S.add('trim', lathe([[0.062, cy], [0.066, cy + 0.01], [0.07, cy + 0.045], [0.064, cy + 0.045], [0.06, cy + 0.01]], 26));
  const pts = black ? 8 : 6;
  for (let k = 0; k < pts; k++) {
    const a = (k / pts) * Math.PI * 2;
    const p = V3(Math.sin(a) * 0.066, cy + 0.04, Math.cos(a) * 0.066);
    S.add('trim', cone(p, V3(Math.sin(a) * 0.18, 1, Math.cos(a) * 0.18), black ? 0.014 : 0.016, black ? 0.11 : 0.05, 6));
    if (!black) S.add('trim', ball(V3(p.x * 1.05, p.y + 0.052, p.z * 1.05), 0.011, [1, 1, 1], 8));
  }
  if (black) {
    S.add('trim', box(V3(0, cy + 0.21, 0), 0.022, 0.11, 0.022), box(V3(0, cy + 0.235, 0), 0.075, 0.022, 0.022), ball(V3(0, cy + 0.06, 0), 0.04, [1, 1.3, 1], 10));
  } else {
    S.add('trim', ball(V3(0, cy + 0.05, 0), 0.05, [1, 0.8, 1], 12));
  }
  // arms and regalia
  if (black) {
    for (const s of [-1, 1]) {
      S.add('body', limb(V3(s * 0.138, y0 + 0.92, 0), V3(s * 0.15, y0 + 0.76, 0.06), 0.042, 0.038, 10));
      S.add('body', limb(V3(s * 0.15, y0 + 0.76, 0.06), V3(s * 0.035, y0 + 0.69, 0.14), 0.038, 0.034, 10));
      S.add('body', ball(V3(s * 0.03, y0 + 0.69, 0.15), 0.032, [1, 1, 1], 10));
    }
    S.add('trim', box(V3(0, y0 + 0.33, 0.17), 0.045, 0.5, 0.012), cone(V3(0, y0 + 0.08, 0.17), V3(0, -1, 0), 0.032, 0.05, 4).scale(1, 1, 0.3),
      box(V3(0, y0 + 0.6, 0.165), 0.2, 0.026, 0.03), ball(V3(0, y0 + 0.77, 0.155), 0.028, [1, 1, 1], 10));
    S.add('body', limb(V3(0, y0 + 0.61, 0.162), V3(0, y0 + 0.75, 0.157), 0.016, 0.016, 8, false));
  } else {
    S.add('body', limb(V3(-0.14, y0 + 0.93, 0), V3(-0.165, y0 + 0.75, 0.025), 0.04, 0.04, 10), limb(V3(-0.165, y0 + 0.75, 0.025), V3(-0.155, y0 + 0.6, 0.05), 0.04, 0.046, 10));
    S.add('body', ball(V3(-0.155, y0 + 0.575, 0.055), 0.028, [1, 1.1, 1], 10));
    S.add('trim', ring(y0 + 0.61, 0.045, 0.007, 1, 16, -0.155, 0.05));
    S.add('body', limb(V3(0.14, y0 + 0.93, 0), V3(0.172, y0 + 0.76, 0.04), 0.04, 0.04, 10), limb(V3(0.172, y0 + 0.76, 0.04), V3(0.178, y0 + 0.67, 0.115), 0.04, 0.046, 10));
    S.add('trim', ring(y0 + 0.69, 0.045, 0.007, 1, 16, 0.177, 0.1));
    const sx = 0.182, sz = 0.13;
    S.add('trim', limb(V3(sx, y0 - 0.005, sz), V3(sx, y0 + 0.98, sz), 0.012, 0.013, 8, false));
    S.add('trim', ball(V3(sx, y0 + 1.02, sz), 0.04, [1, 1.15, 1], 14), ring(y0 + 0.985, 0.03, 0.008, 1, 16, sx, sz),
      cone(V3(sx, y0 + 1.055, sz), UP, 0.015, 0.06, 8), ball(V3(sx, y0 + 0.82, sz), 0.02, [1, 1, 1], 8));
    S.add('body', ball(V3(sx - 0.004, y0 + 0.66, sz), 0.03, [1, 1.1, 1], 10));
  }
  return { S, height: 1.6 };
}

const BUILDERS = { 1: buildPawn, 2: buildKnight, 3: buildBishop, 4: buildRook, 5: buildQueen, 6: buildKing };

function makePieceMaterials(ivoryTex) {
  const white = {
    body: new THREE.MeshPhysicalMaterial({ color: 0xf1e8d8, map: ivoryTex, roughness: 0.36, clearcoat: 0.35, clearcoatRoughness: 0.28, sheen: 0.25, sheenColor: new THREE.Color(0xfff2dc) }),
    trim: new THREE.MeshStandardMaterial({ color: 0xdcae58, metalness: 1, roughness: 0.27 }),
    shade: new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.8 }),
  };
  white.skin = white.body;
  const black = {
    body: new THREE.MeshStandardMaterial({ color: 0x2e2722, metalness: 0.6, roughness: 0.4 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x9a7448, metalness: 0.9, roughness: 0.34 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x5f7440, metalness: 0.25, roughness: 0.48 }),
    shade: new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 0.9 }),
  };
  return { white, black };
}

// Builds one template per (color, type, variant). Instances clone the group and share geometry.
function buildPieceTemplates(mats) {
  const t = {};
  for (const color of ['white', 'black']) {
    for (const type of [1, 2, 3, 4, 5, 6]) {
      const variants = type === 2 && color === 'white' ? ['pegasus', 'unicorn'] : ['default'];
      for (const v of variants) {
        const { S, height } = BUILDERS[type](color, v);
        const group = S.build(mats[color]);
        t[`${color}-${type}-${v}`] = { group, height };
      }
    }
  }
  return t;
}
