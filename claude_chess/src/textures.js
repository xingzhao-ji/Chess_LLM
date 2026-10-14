/* ---------- Procedural textures: marble, frame, stone, leaves, scenery ---------- */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Multi-octave value noise built with GPU-scaled canvases; returns Float32Array in [0,1].
function turbulence(size, rand, octaves, weights) {
  const out = new Float32Array(size * size);
  const c = makeCanvas(size, size), ctx = c.getContext('2d', { willReadFrequently: true });
  let total = 0;
  octaves.forEach((cells, i) => {
    const s = makeCanvas(cells, cells), sc = s.getContext('2d');
    const img = sc.createImageData(cells, cells);
    for (let k = 0; k < cells * cells; k++) { const v = rand() * 255; img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = v; img.data[k * 4 + 3] = 255; }
    sc.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(s, 0, 0, size, size);
    const d = ctx.getImageData(0, 0, size, size).data;
    const w = weights ? weights[i] : Math.pow(0.55, i);
    total += w;
    for (let k = 0; k < size * size; k++) out[k] += d[k * 4] / 255 * w;
  });
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

const MARBLE_STYLES = {
  white: { base: [242, 239, 234], vary: 10, vein: [128, 124, 120], veinA: 0.55, sharp: 7, freq: 2.2, warp: 5.5, vein2: [176, 172, 166], vein2A: 0.4, sharp2: 16, freq2: 5.0, warp2: 4 },
  black: { base: [17, 17, 19], vary: 9, vein: [214, 210, 204], veinA: 0.8, sharp: 26, freq: 1.7, warp: 6.5, vein2: [92, 90, 94], vein2A: 0.45, sharp2: 9, freq2: 3.6, warp2: 5 },
  cream: { base: [233, 224, 207], vary: 12, vein: [176, 160, 136], veinA: 0.32, sharp: 9, freq: 2.0, warp: 5, vein2: [204, 192, 170], vein2A: 0.3, sharp2: 14, freq2: 4.0, warp2: 4 },
  ivory: { base: [238, 230, 214], vary: 7, vein: [196, 182, 158], veinA: 0.28, sharp: 10, freq: 2.4, warp: 4, vein2: [214, 204, 186], vein2A: 0.22, sharp2: 14, freq2: 5.0, warp2: 3 },
};

function marbleCanvas(size, styleName, seed) {
  const st = MARBLE_STYLES[styleName];
  const r = rng(seed);
  const T = turbulence(size, r, [3, 6, 12, 24, 48, 96]);
  const T2 = turbulence(size, r, [5, 10, 20, 40, 80, 160]);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  const a1 = r() * Math.PI, a2 = a1 + 0.6 + r() * 0.8;
  const c1 = Math.cos(a1), s1 = Math.sin(a1), c2 = Math.cos(a2), s2 = Math.sin(a2);
  for (let y = 0, k = 0; y < size; y++) {
    for (let x = 0; x < size; x++, k++) {
      const t = T[k], t2 = T2[k];
      let v = 1 - Math.abs(Math.sin(((x * c1 + y * s1) / size * st.freq + t * st.warp) * Math.PI));
      v = Math.pow(v, st.sharp);
      let v2 = 1 - Math.abs(Math.sin(((x * c2 + y * s2) / size * st.freq2 + t2 * st.warp2) * Math.PI));
      v2 = Math.pow(v2, st.sharp2);
      const cloud = (t2 - 0.5) * 2 * st.vary + (t - 0.5) * st.vary;
      const a = Math.min(1, v * st.veinA), b = Math.min(1, v2 * st.vein2A);
      for (let ch = 0; ch < 3; ch++) {
        let col = st.base[ch] + cloud;
        col = col * (1 - b) + st.vein2[ch] * b;
        col = col * (1 - a) + st.vein[ch] * a;
        d[k * 4 + ch] = col;
      }
      d[k * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function toTexture(canvas, { srgb = true, repeat = false, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// 8x8 playing surface: every square cut from a different part of the slab.
function boardSquaresCanvas(size, whiteM, blackM, seed) {
  const r = rng(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const cell = size / 8;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const dark = (file + rank) % 2 === 0;
      const src = dark ? blackM : whiteM;
      const crop = src.width * (0.32 + r() * 0.12);
      const sx = r() * (src.width - crop), sy = r() * (src.height - crop);
      const x = file * cell, y = (7 - rank) * cell;
      ctx.save();
      ctx.translate(x + cell / 2, y + cell / 2);
      ctx.rotate(Math.floor(r() * 4) * Math.PI / 2);
      ctx.drawImage(src, sx, sy, crop, crop, -cell / 2, -cell / 2, cell, cell);
      ctx.restore();
      // faint bevel shading at square edges
      const g = ctx.createLinearGradient(x, y, x, y + cell);
      g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.06)');
      ctx.fillStyle = g; ctx.fillRect(x, y, cell, cell);
    }
  }
  return c;
}

/* Frame top: cream marble band with engraved gold numerals/letters and corner filigree.
   Canvas covers the full 10x10 board footprint (x,z in [-5,5]); canvas top = far side (rank 8). */
function frameCanvases(size, creamM, fontFamily) {
  const color = makeCanvas(size, size), cx = color.getContext('2d');
  const orm = makeCanvas(size, size), ox = orm.getContext('2d');
  const U = size / 10; // px per world unit
  const P = (v) => (v + 5) * U;
  // marble base, tiled with variation
  const tile = creamM.width;
  for (let y = 0; y < size; y += tile) for (let x = 0; x < size; x += tile) cx.drawImage(creamM, x, y);
  ox.fillStyle = 'rgb(128, 96, 0)'; ox.fillRect(0, 0, size, size); // R bump mid, G roughness ~.38, B metal 0

  const goldGrad = (x0, y0, x1, y1) => {
    const g = cx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#f6dc94'); g.addColorStop(0.45, '#c9963f'); g.addColorStop(1, '#efcf7a');
    return g;
  };
  // gold paint: color pass + material pass (metal, low roughness, recessed bump)
  function both(fn, bump = 70) {
    cx.save(); fn(cx, 'color'); cx.restore();
    ox.save(); fn(ox, 'orm', bump); ox.restore();
  }
  const metalStyle = (bump) => `rgb(${bump}, 60, 255)`;

  // inlaid gold lines around the band
  const lines = [[4.16, 0.022], [4.80, 0.03], [4.88, 0.012]];
  for (const [h, w] of lines) {
    both((ctx, pass, bump) => {
      ctx.strokeStyle = pass === 'color' ? goldGrad(0, 0, size, size) : metalStyle(bump || 90);
      ctx.lineWidth = w * U;
      ctx.strokeRect(P(-h), P(-h), 2 * h * U, 2 * h * U);
    }, 92);
  }

  // engraved glyphs: dark recess, then gold fill slightly offset
  function glyph(text, x, z, rot, sizeU) {
    const px = P(x), py = P(z);
    const fsize = sizeU * U;
    const font = `600 ${fsize}px ${fontFamily}`;
    cx.save(); cx.translate(px, py); cx.rotate(rot);
    cx.font = font; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = 'rgba(60, 40, 15, 0.55)'; cx.fillText(text, fsize * 0.035, fsize * 0.05);
    cx.fillStyle = goldGrad(-fsize / 2, -fsize / 2, fsize / 2, fsize / 2);
    cx.fillText(text, 0, 0);
    cx.restore();
    ox.save(); ox.translate(px, py); ox.rotate(rot);
    ox.font = font; ox.textAlign = 'center'; ox.textBaseline = 'middle';
    ox.fillStyle = metalStyle(40); ox.fillText(text, 0, 0);
    ox.restore();
  }
  const files = 'ABCDEFGH';
  for (let i = 0; i < 8; i++) {
    glyph(files[i], i - 3.5, 4.5, 0, 0.42);           // front band, read by White
    glyph(String(i + 1), -4.5, 3.5 - i, 0, 0.3);       // left numerals
    glyph(String(i + 1), 4.5, 3.5 - i, 0, 0.3);        // right numerals
  }

  // corner filigree: scrolls and a rosette
  function filigree(cxw, czw, rot) {
    both((ctx, pass, bump) => {
      ctx.translate(P(cxw), P(czw)); ctx.rotate(rot);
      const s = U * 0.36;
      ctx.strokeStyle = pass === 'color' ? goldGrad(-s, -s, s, s) : metalStyle(bump || 60);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = s * 0.075; ctx.lineCap = 'round';
      for (const m of [1, -1]) {
        ctx.save(); ctx.scale(m, 1);
        ctx.beginPath();
        ctx.moveTo(0, s * 0.15);
        ctx.bezierCurveTo(s * 0.35, s * 0.05, s * 0.75, s * 0.25, s * 0.85, -s * 0.15);
        ctx.bezierCurveTo(s * 0.9, -s * 0.5, s * 0.55, -s * 0.6, s * 0.45, -s * 0.35);
        ctx.bezierCurveTo(s * 0.38, -s * 0.18, s * 0.55, -s * 0.12, s * 0.6, -s * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.1, s * 0.3);
        ctx.bezierCurveTo(s * 0.4, s * 0.55, s * 0.8, s * 0.5, s * 0.82, s * 0.2);
        ctx.stroke();
        ctx.beginPath(); ctx.ellipse(s * 0.5, -s * 0.05, s * 0.12, s * 0.05, -0.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(s * 0.32, s * 0.42, s * 0.1, s * 0.04, 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      for (let k = 0; k < 6; k++) {
        ctx.save(); ctx.rotate(k * Math.PI / 3);
        ctx.beginPath(); ctx.ellipse(0, -s * 0.16, s * 0.06, s * 0.13, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.beginPath(); ctx.arc(0, 0, s * 0.08, 0, Math.PI * 2);
      ctx.fillStyle = pass === 'color' ? '#7a5520' : metalStyle(30); ctx.fill();
    }, 60);
  }
  filigree(-4.5, 4.5, Math.PI * 0.25 + Math.PI);
  filigree(4.5, 4.5, -Math.PI * 0.25 + Math.PI);
  filigree(-4.5, -4.5, -Math.PI * 0.25);
  filigree(4.5, -4.5, Math.PI * 0.25);

  // soft wear and shadowing toward the outer rim
  const vg = cx.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(70,50,30,0.12)');
  cx.fillStyle = vg; cx.fillRect(0, 0, size, size);
  return { color, orm };
}

function stoneFloorCanvas(size, seed) {
  const r = rng(seed);
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  ctx.fillStyle = '#9b8873'; ctx.fillRect(0, 0, size, size);
  const rows = 6;
  const h = size / rows;
  for (let row = 0; row < rows; row++) {
    let x = row % 2 ? -h * 0.6 : 0;
    while (x < size) {
      const w = h * (1.1 + r() * 0.9);
      const tone = 196 + r() * 26;
      const g = ctx.createLinearGradient(x, row * h, x + w, row * h + h);
      g.addColorStop(0, `rgb(${tone}, ${tone - 14}, ${tone - 34})`);
      g.addColorStop(1, `rgb(${tone - 16}, ${tone - 30}, ${tone - 48})`);
      ctx.fillStyle = g;
      const pad = size * 0.004;
      ctx.fillRect(x + pad, row * h + pad, Math.min(w, size - x) - pad * 2, h - pad * 2);
      x += w;
    }
  }
  // speckle and weathering
  const T = turbulence(256, r, [4, 8, 16, 32, 64]);
  const n = makeCanvas(256, 256), nx = n.getContext('2d');
  const img = nx.createImageData(256, 256);
  for (let k = 0; k < T.length; k++) { const v = T[k] * 255; img.data[k * 4] = v * 0.8; img.data[k * 4 + 1] = v * 0.7; img.data[k * 4 + 2] = v * 0.55; img.data[k * 4 + 3] = 70; }
  nx.putImageData(img, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(n, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? '255,250,240' : '60,45,30'}, ${0.05 + r() * 0.08})`;
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
}

function leafCanvas(size) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size * 0.5, size * 0.45, size * 0.05, size * 0.5, size * 0.5, size * 0.6);
  g.addColorStop(0, '#8fb06a'); g.addColorStop(0.6, '#5d8442'); g.addColorStop(1, '#3d6130');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(220, 235, 190, 0.55)'; ctx.lineWidth = size * 0.018; ctx.lineCap = 'round';
  const cx = size / 2, cy = size * 0.62;
  for (const a of [-90, -40, -140, 10, -190]) {
    const rad = a * Math.PI / 180;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(rad) * size * 0.45, cy + Math.sin(rad) * size * 0.45); ctx.stroke();
  }
  return c;
}

function softDotCanvas(size) {
  const c = makeCanvas(size, size), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,220,150,0.5)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

/* ---------- Painted valley: matte painting in (azimuth, painted elevation) space ----------
   Azimuth 0 = toward Black's side (the sun); positive azimuth = to White's right.
   Each panel covers 180 degrees; painted elevation spans ELEV_MIN..ELEV_MAX. */
const PAINT = { ELEV_MIN: -26, ELEV_MAX: 30 };

function periodicNoise1D(seed, cells) {
  const r = rng(seed); const vals = Array.from({ length: cells }, () => r());
  return (t) => { // t in degrees, periodic over 360
    const x = (((t % 360) + 360) % 360) / 360 * cells;
    const i = Math.floor(x), f = x - i;
    const a = vals[i % cells], b = vals[(i + 1) % cells];
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  };
}
function ridge(seed, octs) {
  const ns = octs.map((o, i) => periodicNoise1D(seed + i * 101, o[0]));
  return (az) => octs.reduce((s, o, i) => s + (ns[i](az) - 0.5) * o[1], 0);
}

function paintPanel(W, H, azStart, seed) {
  const land = makeCanvas(W, H), ctx = land.getContext('2d');
  const fall = makeCanvas(W >> 1, H >> 1), fx = fall.getContext('2d');
  const r = rng(seed);
  const X = (az) => ((az - azStart) / 180) * W;
  const Y = (el) => (PAINT.ELEV_MAX - el) / (PAINT.ELEV_MAX - PAINT.ELEV_MIN) * H;
  const pxDeg = W / 180;
  const wrapAz = (az) => { let a = az - azStart; a = ((a % 360) + 360) % 360; return azStart + a; };
  const inPanel = (az, margin = 30) => { const a = wrapAz(az); return a > azStart - margin && a < azStart + 180 + margin; };

  function rangeLayer(fn, top, bottom, step = 0.25) {
    // fill from ridge line fn(az) down to `bottom` elevation
    ctx.beginPath();
    ctx.moveTo(X(azStart - 2), Y(bottom));
    for (let az = azStart - 2; az <= azStart + 182; az += step) ctx.lineTo(X(az), Y(fn(az)));
    ctx.lineTo(X(azStart + 182), Y(bottom));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, Y(top[1]), 0, Y(bottom));
    top[0].forEach(([o, col]) => g.addColorStop(o, col));
    ctx.fillStyle = g; ctx.fill();
  }

  // Distant ranges (hazy lavender), mid ranges (rose-lit), near hills (green-violet)
  const far = ridge(seed + 1, [[9, 4], [27, 2.2], [80, 1.0], [240, 0.35]]);
  const farFn = (az) => 3.2 + far(az) * 0.8 + 1.4 * Math.exp(-Math.pow((wrapAz(az) - 16) / 7, 2));
  rangeLayer(farFn, [[[0, '#c7a6b4'], [0.5, '#c9a9b3'], [1, '#d9b9b2']], 10], -2);

  // the great rose peak on the right of the image (az ~ +22)
  const peak = ridge(seed + 2, [[14, 2.6], [40, 1.4], [120, 0.8], [300, 0.3]]);
  const midFn = (az) => {
    const a = wrapAz(az);
    let h = 1.8 + peak(az);
    h += 5.6 * Math.exp(-Math.pow((a - 11) / 4.2, 2));
    h += 3.4 * Math.exp(-Math.pow((a - 17) / 3.5, 2));
    h += 2.6 * Math.exp(-Math.pow((a + 7) / 5, 2));
    h += 6 * Math.exp(-Math.pow((a - 200) / 12, 2)); // a summit behind White
    return h;
  };
  rangeLayer(midFn, [[[0, '#b88a9a'], [0.35, '#9c7590'], [1, '#c4a0a6']], 14], -3);
  // sunlit rim on the mid range: thin warm stroke on the ridge
  ctx.save();
  ctx.beginPath();
  for (let az = azStart - 2; az <= azStart + 182; az += 0.25) { const fnv = midFn(az); az === azStart - 2 ? ctx.moveTo(X(az), Y(fnv)) : ctx.lineTo(X(az), Y(fnv)); }
  ctx.strokeStyle = 'rgba(255, 196, 160, 0.45)'; ctx.lineWidth = pxDeg * 0.12; ctx.stroke();
  ctx.restore();
  // rock striations on the big peak
  if (inPanel(11, 0)) {
    ctx.save();
    for (let i = 0; i < 70; i++) {
      const az = 11 + (r() - 0.5) * 10, top = midFn(az) - r() * 1.5;
      ctx.strokeStyle = `rgba(${r() < 0.5 ? '255,214,190' : '96,64,86'}, ${0.12 + r() * 0.12})`;
      ctx.lineWidth = pxDeg * (0.05 + r() * 0.08);
      ctx.beginPath(); ctx.moveTo(X(az), Y(top)); ctx.lineTo(X(az + (r() - 0.5) * 1.2), Y(top - 1 - r() * 3)); ctx.stroke();
    }
    ctx.restore();
  }

  // haze band at the valley floor
  const haze = ctx.createLinearGradient(0, Y(3), 0, Y(-6));
  haze.addColorStop(0, 'rgba(240, 200, 185, 0)'); haze.addColorStop(0.6, 'rgba(236, 196, 182, 0.55)'); haze.addColorStop(1, 'rgba(226, 186, 170, 0.35)');
  ctx.fillStyle = haze; ctx.fillRect(0, Y(3), W, Y(-6) - Y(3));

  // near hills and cliffs (left and right of the valley), with forest
  const near = ridge(seed + 3, [[12, 2.4], [36, 1.2], [110, 0.6], [280, 0.25]]);
  const cliffL = (az) => { const a = wrapAz(az); return Math.exp(-Math.pow((a + 18) / 7, 2)); };
  const cliffR = (az) => { const a = wrapAz(az); return Math.exp(-Math.pow((a - 20) / 6, 2)); };
  const nearFn = (az) => {
    const a = wrapAz(az);
    let h = -2.0 + near(az);
    if (Math.abs(a) < 100) h += 4.6 * cliffL(az) + 3.6 * cliffR(az);
    h += 2.6 * Math.exp(-Math.pow((a - 52) / 10, 2)) + 3.5 * Math.exp(-Math.pow((a + 58) / 12, 2));
    h += 1.5 * Math.exp(-Math.pow((a - 150) / 25, 2)) + 2 * Math.exp(-Math.pow((a - 240) / 30, 2));
    return h;
  };
  rangeLayer(nearFn, [[[0, '#6f7a55'], [0.25, '#566447'], [0.7, '#5b5650'], [1, '#6f6158']], 10], PAINT.ELEV_MIN);
  // cliff faces: soft warm rock streaks under the castles
  ctx.save();
  for (let i = 0; i < 900; i++) {
    const az = azStart + r() * 180;
    const k = Math.max(cliffL(az), cliffR(az));
    if (k < 0.3 || r() > k) continue;
    const top = nearFn(az);
    ctx.strokeStyle = `rgba(${150 + r() * 50}, ${128 + r() * 35}, ${118 + r() * 30}, ${0.12 + r() * 0.18})`;
    ctx.lineWidth = pxDeg * (0.04 + r() * 0.12);
    const y0 = top - 0.3 - r() * 1.2;
    ctx.beginPath(); ctx.moveTo(X(az), Y(y0)); ctx.lineTo(X(az + (r() - 0.5) * 0.3), Y(y0 - 1 - r() * 4)); ctx.stroke();
  }
  ctx.restore();
  // forest canopy along the ridge tops and slopes
  for (let i = 0; i < 14000; i++) {
    const az = azStart - 2 + r() * 184;
    const top = nearFn(az);
    const depth = Math.pow(r(), 1.8) * 7;
    const el = top - 0.3 - depth;
    if (el < PAINT.ELEV_MIN + 1) continue;
    const rad = pxDeg * (0.035 + r() * 0.09);
    const lit = r();
    ctx.fillStyle = lit > 0.72 ? `rgba(${130 + r() * 40}, ${140 + r() * 30}, ${80 + r() * 20}, 0.55)` : `rgba(${60 + r() * 30}, ${78 + r() * 30}, ${52 + r() * 20}, 0.6)`;
    ctx.beginPath(); ctx.ellipse(X(az), Y(el), rad, rad * 1.1, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- waterfalls (left valley wall) ----
  function waterfall(az, top, bottom, width) {
    if (!inPanel(az, 4)) return;
    const x0 = X(az), w = width * pxDeg * 0.7;
    for (let i = 0; i < 140; i++) {
      const t = r();
      const xx = x0 + (t - 0.5) * w * (0.8 + 0.4 * r());
      const edge = 1 - Math.abs(t - 0.5) * 2;
      ctx.strokeStyle = `rgba(${r() < 0.7 ? '246,246,248' : '180,190,200'}, ${(0.08 + r() * 0.22) * (0.4 + edge)})`;
      ctx.lineWidth = 1 + r() * pxDeg * 0.08;
      const yt = Y(top - r() * 0.4), yb = Y(bottom + r() * 0.8);
      ctx.beginPath(); ctx.moveTo(xx, yt); ctx.bezierCurveTo(xx + (r() - 0.5) * 3, (yt * 2 + yb) / 3, xx + (r() - 0.5) * 6, (yt + yb * 2) / 3, xx + (r() - 0.5) * w * 0.3, yb); ctx.stroke();
    }
    const mist = ctx.createRadialGradient(x0, Y(bottom), 0, x0, Y(bottom), w * 1.8);
    mist.addColorStop(0, 'rgba(250,245,245,0.65)'); mist.addColorStop(1, 'rgba(250,245,245,0)');
    ctx.fillStyle = mist; ctx.fillRect(x0 - w * 2, Y(bottom) - w * 1.8, w * 4, w * 3.6);
    fx.fillStyle = '#fff';
    fx.fillRect((x0 - w * 0.5) / 2, Y(top) / 2, w / 2, (Y(bottom) - Y(top)) / 2);
  }
  waterfall(-22.5, 1.8, -6.5, 1.5);
  waterfall(-19.5, 2.3, -7.5, 2.1);
  waterfall(-16.2, 1.5, -7.8, 1.5);
  waterfall(-26, 0.8, -4.5, 0.8);
  waterfall(23.5, 0.6, -6.5, 1.0);
  waterfall(150, -1, -7, 1.3);

  // ---- castles ----
  function tower(x, baseY, w, h, opts) {
    const { roof = 'cone', light = 0.5, crenel = false } = opts || {};
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, `rgb(${220 + light * 25}, ${200 + light * 22}, ${190 + light * 18})`);
    g.addColorStop(0.55, `rgb(${196 + light * 20}, ${176 + light * 18}, ${170 + light * 14})`);
    g.addColorStop(1, `rgb(${150}, ${132}, ${138})`);
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, baseY - h, w, h);
    if (crenel) {
      const n = Math.max(3, Math.round(w / (pxDeg * 0.18)));
      for (let i = 0; i < n; i += 2) ctx.fillRect(x - w / 2 + i * w / n, baseY - h - w * 0.12, w / n, w * 0.12);
    }
    if (roof === 'cone') {
      ctx.fillStyle = '#6e5f78';
      ctx.beginPath(); ctx.moveTo(x - w * 0.62, baseY - h); ctx.lineTo(x, baseY - h - w * 1.9); ctx.lineTo(x + w * 0.62, baseY - h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255, 200, 180, 0.35)';
      ctx.beginPath(); ctx.moveTo(x - w * 0.62, baseY - h); ctx.lineTo(x, baseY - h - w * 1.9); ctx.lineTo(x - w * 0.1, baseY - h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#5b4d63'; ctx.lineWidth = Math.max(1, w * 0.05);
      ctx.beginPath(); ctx.moveTo(x, baseY - h - w * 1.9); ctx.lineTo(x, baseY - h - w * 2.3); ctx.stroke();
    } else if (roof === 'spire') {
      ctx.fillStyle = '#d4c0b8';
      ctx.beginPath(); ctx.moveTo(x - w * 0.5, baseY - h); ctx.lineTo(x, baseY - h - w * 2.6); ctx.lineTo(x + w * 0.5, baseY - h); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(60, 45, 60, 0.55)';
    const wins = Math.max(1, Math.floor(h / (w * 1.6)));
    for (let i = 0; i < wins; i++) {
      const wy = baseY - h + w * 0.6 + i * w * 1.6;
      ctx.fillRect(x - w * 0.08, wy, w * 0.16, w * 0.35);
    }
  }
  function hall(x, baseY, w, h) {
    const g = ctx.createLinearGradient(0, baseY - h, 0, baseY);
    g.addColorStop(0, '#e1cbc2'); g.addColorStop(1, '#a8929a');
    ctx.fillStyle = g; ctx.fillRect(x, baseY - h, w, h);
    ctx.fillStyle = '#76667e';
    ctx.beginPath(); ctx.moveTo(x - w * 0.03, baseY - h); ctx.lineTo(x + w * 0.5, baseY - h - h * 0.45); ctx.lineTo(x + w * 1.03, baseY - h); ctx.fill();
    ctx.fillStyle = 'rgba(70,50,70,0.5)';
    for (let i = 1; i < 6; i++) ctx.fillRect(x + i * w / 6 - w * 0.015, baseY - h * 0.7, w * 0.03, h * 0.25);
  }
  function castle(az, el, s, style) {
    if (!inPanel(az, 10)) return;
    const x = X(az), y = Y(el), u = pxDeg * s;
    ctx.save();
    if (style === 'left') {
      hall(x - u * 3.2, y, u * 4.5, u * 1.8);
      tower(x - u * 3.6, y, u * 0.9, u * 4.2, { crenel: true, roof: 'spire', light: 0.8 });
      tower(x - u * 1.0, y, u * 0.8, u * 6.6, { roof: 'cone', light: 0.9 });
      tower(x + u * 0.6, y, u * 1.2, u * 4.0, { crenel: true, light: 0.7, roof: 'none' });
      tower(x + u * 1.9, y, u * 0.7, u * 5.4, { roof: 'cone', light: 0.6 });
      tower(x - u * 2.2, y, u * 0.55, u * 3.3, { roof: 'cone', light: 0.5 });
      tower(x + u * 3.0, y, u * 0.55, u * 3.0, { roof: 'cone', light: 0.4 });
    } else {
      hall(x - u * 2.5, y, u * 5.5, u * 2.0);
      tower(x - u * 2.6, y, u * 0.75, u * 3.6, { roof: 'cone', light: 0.5 });
      tower(x - u * 1.2, y, u * 0.9, u * 4.8, { roof: 'cone', light: 0.6 });
      tower(x + u * 0.3, y, u * 1.0, u * 7.0, { roof: 'cone', light: 0.85 });
      tower(x + u * 1.7, y, u * 0.8, u * 4.2, { roof: 'cone', light: 0.6 });
      tower(x + u * 3.0, y, u * 0.65, u * 3.2, { roof: 'cone', light: 0.5 });
    }
    // atmospheric haze over the castle
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(214, 178, 190, 0.38)';
    ctx.fillRect(x - u * 6, y - u * 9, u * 12, u * 10);
    ctx.restore();
  }
  // left castle on the cliff above the waterfalls, right castle on its hill
  castle(-12.5, nearFn(-15) + 0.2, 0.52, 'left');
  castle(18, nearFn(19) - 0.2, 0.5, 'right');
  castle(-62, nearFn(-62) - 0.3, 0.5, 'right');
  castle(205, nearFn(205) - 0.3, 0.7, 'left');
  castle(128, nearFn(128) - 0.2, 0.45, 'right');

  // a river glinting down the valley floor behind White
  if (inPanel(180, 0)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 222, 196, 0.35)'; ctx.lineWidth = pxDeg * 0.28; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(X(172), Y(-1.2));
    ctx.bezierCurveTo(X(182), Y(-3), X(166), Y(-6), X(184), Y(-12));
    ctx.bezierCurveTo(X(196), Y(-16), X(178), Y(-20), X(186), Y(-26));
    ctx.stroke(); ctx.restore();
  }

  // overall depth haze: warm at the valley floor
  const fog = ctx.createLinearGradient(0, Y(0), 0, Y(PAINT.ELEV_MIN));
  fog.addColorStop(0, 'rgba(230, 190, 175, 0.12)'); fog.addColorStop(1, 'rgba(120, 100, 90, 0.25)');
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = fog; ctx.fillRect(0, Y(0), W, H - Y(0));
  ctx.globalCompositeOperation = 'source-over';
  return { land, fall };
}
