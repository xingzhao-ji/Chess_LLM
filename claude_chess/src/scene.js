/* ---------- World: sky, terrace, board, light, effects ---------- */
const BOARD = { FRAME_IN: 4.06, FRAME_OUT: 4.94, RIM: 5.04 };
const ELEV_SHIFT = 23.5; // painted horizon sits below the true horizon, like a matte painting

function skyMaterial(texFront, texBack, fallFront, fallBack) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: {
      tFront: { value: texFront }, tBack: { value: texBack },
      tFallF: { value: fallFront }, tFallB: { value: fallBack },
      uTime: { value: 0 }, uShift: { value: ELEV_SHIFT },
      uMin: { value: PAINT.ELEV_MIN }, uMax: { value: PAINT.ELEV_MAX },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        gl_Position.z = gl_Position.w * 0.99999;
      }`,
    fragmentShader: `
      uniform sampler2D tFront, tBack, tFallF, tFallB;
      uniform float uTime, uShift, uMin, uMax;
      varying vec3 vWorld;
      vec3 L(vec3 c) { return pow(c, vec3(2.2)); }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        float az = degrees(atan(d.x, -d.z));
        float el = degrees(asin(clamp(d.y, -1.0, 1.0))) + uShift;
        float h = clamp(el / 40.0, 0.0, 1.0);
        vec3 sky = mix(L(vec3(0.99, 0.83, 0.64)), L(vec3(0.95, 0.76, 0.72)), smoothstep(0.0, 0.12, h));
        sky = mix(sky, L(vec3(0.83, 0.70, 0.79)), smoothstep(0.1, 0.45, h));
        sky = mix(sky, L(vec3(0.52, 0.55, 0.75)), smoothstep(0.42, 1.0, h));
        float sd = length(vec2(az * cos(radians(el * 0.5)), el - 3.2));
        vec3 sunCol = L(vec3(1.0, 0.86, 0.6));
        float glow = exp(-sd / 10.0) * 0.55 + exp(-sd / 2.6) * 0.65 + smoothstep(1.3, 0.7, sd) * 1.6;
        sky += sunCol * glow;
        vec2 cp = vec2(az * 0.05 + uTime * 0.0035, el * 0.2);
        float cl = smoothstep(0.5, 0.8, fbm(cp * vec2(1.0, 2.8))) * smoothstep(2.0, 7.0, el) * (1.0 - smoothstep(26.0, 45.0, el));
        vec3 cloudCol = mix(L(vec3(0.97, 0.79, 0.76)), L(vec3(1.0, 0.92, 0.78)), exp(-sd / 22.0));
        sky = mix(sky, cloudCol, cl * 0.55);
        bool front = abs(az) <= 90.0;
        float a = front ? az + 90.0 : (az < 0.0 ? az + 360.0 : az) - 90.0;
        vec2 uv = vec2(a / 180.0, (el - uMin) / (uMax - uMin));
        vec4 land = vec4(0.0);
        float fm = 0.0;
        if (uv.y >= 0.0 && uv.y <= 1.0) {
          land = front ? texture2D(tFront, uv) : texture2D(tBack, uv);
          fm = front ? texture2D(tFallF, uv).r : texture2D(tFallB, uv).r;
        } else if (uv.y < 0.0) {
          land = vec4(L(vec3(0.43, 0.38, 0.34)), 1.0);
        }
        float streak = noise(vec2(uv.x * 2600.0, uv.y * 90.0 + uTime * 2.4));
        land.rgb += fm * (streak * 0.22 - 0.04);
        land.rgb = mix(land.rgb, sunCol * 1.05, clamp(glow * 0.32, 0.0, 0.5));
        vec3 col = mix(sky, land.rgb, land.a);
        gl_FragColor = vec4(col * 0.98, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

function overlayMaterial(stateTex) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false, premultipliedAlpha: true,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { tState: { value: stateTex }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D tState; uniform float uTime; varying vec2 vUv;
      void over(inout vec4 acc, vec3 c, float a) { a = clamp(a, 0.0, 1.0); acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a); }
      void main() {
        vec2 g = vUv * 8.0; vec2 cell = floor(g); vec2 f = fract(g) - 0.5;
        int flags = int(texture2D(tState, (cell + 0.5) / 8.0).r * 255.0 + 0.5);
        float edge = max(abs(f.x), abs(f.y)), r = length(f);
        vec4 acc = vec4(0.0);
        if ((flags & 1) != 0) over(acc, vec3(1.0, 0.78, 0.36), 0.26 + 0.12 * smoothstep(0.3, 0.5, edge));
        if ((flags & 16) != 0) over(acc, vec3(1.0, 0.95, 0.82), 0.14 + 0.18 * smoothstep(0.38, 0.5, edge));
        if ((flags & 128) != 0) over(acc, vec3(1.0, 0.86, 0.5), 0.34);
        if ((flags & 32) != 0) {
          float pulse = 0.78 + 0.22 * sin(uTime * 4.0);
          over(acc, vec3(1.0, 0.28, 0.16), 0.75 * pulse * smoothstep(0.62, 0.0, r));
        }
        if ((flags & 2) != 0) {
          over(acc, vec3(1.0, 0.84, 0.45), 0.22);
          over(acc, vec3(1.0, 0.88, 0.55), 0.95 * smoothstep(0.415, 0.44, edge) * (1.0 - smoothstep(0.485, 0.5, edge)));
        }
        if ((flags & 4) != 0) {
          over(acc, vec3(1.0, 0.92, 0.66), 0.18 * smoothstep(0.32, 0.0, r));
          over(acc, vec3(1.0, 0.93, 0.72), 0.82 * smoothstep(0.125, 0.105, r));
        }
        if ((flags & 8) != 0) {
          float corner = step(0.3, abs(f.x)) * step(0.3, abs(f.y)) * smoothstep(0.405, 0.43, edge) * (1.0 - smoothstep(0.485, 0.5, edge));
          over(acc, vec3(1.0, 0.55, 0.32), 0.16);
          over(acc, vec3(1.0, 0.78, 0.5), 0.95 * corner);
        }
        if ((flags & 64) != 0) {
          float band = smoothstep(0.43, 0.45, edge) * (1.0 - smoothstep(0.48, 0.5, edge));
          float dash = step(0.5, fract((f.x + f.y) * 7.0 + uTime * 0.6));
          over(acc, vec3(0.92, 0.97, 1.0), band * (0.55 + 0.45 * dash));
        }
        gl_FragColor = acc;
      }`,
  });
}

function makeLeafGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(-0.26, 0.02, -0.47, 0.24);
  s.quadraticCurveTo(-0.4, 0.42, -0.22, 0.44);
  s.quadraticCurveTo(-0.3, 0.72, -0.04, 0.96);
  s.quadraticCurveTo(0, 1.04, 0.04, 0.96);
  s.quadraticCurveTo(0.3, 0.72, 0.22, 0.44);
  s.quadraticCurveTo(0.4, 0.42, 0.47, 0.24);
  s.quadraticCurveTo(0.26, 0.02, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    uv.setXY(i, x + 0.5, y);
    p.setZ(i, 0.12 * x * x - 0.05 * y);
  }
  g.computeVertexNormals();
  return g;
}

function buildWorld(renderer, Q, fontFamily) {
  const scene = new THREE.Scene();
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const world = { scene, updaters: [] };

  /* sky dome */
  const PW = Q.high ? 4096 : 2048, PH = Q.high ? 1280 : 640;
  const front = paintPanel(PW, PH, -90, 11), back = paintPanel(PW, PH, 90, 11);
  const tex = (c) => { const t = toTexture(c, { aniso: 1 }); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const fallTex = (c) => { const t = new THREE.CanvasTexture(c); t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; return t; };
  const skyMat = skyMaterial(tex(front.land), tex(back.land), fallTex(front.fall), fallTex(back.fall));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  world.updaters.push((t) => { skyMat.uniforms.uTime.value = t; });

  // environment for reflections comes from the same painted valley
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));
  const env = pmrem.fromScene(envScene, 0.02, 0.1, 1000);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.7;
  pmrem.dispose();

  /* light: warm key from the front-left, low sun behind Black as a rim */
  const hemi = new THREE.HemisphereLight(0xffe4cc, 0x5a4636, 0.75);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0dc, 2.35);
  key.position.set(-5, 19, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(Q.high ? 2048 : 1024, Q.high ? 2048 : 1024);
  Object.assign(key.shadow.camera, { left: -7.5, right: 7.5, top: 7.5, bottom: -7.5, near: 1, far: 40 });
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(key); scene.add(key.target);
  const rim = new THREE.DirectionalLight(0xffb27a, 1.3);
  rim.position.set(1.5, 18, -9);
  scene.add(rim);
  world.key = key;

  /* materials */
  const whiteM = marbleCanvas(Q.high ? 1024 : 512, 'white', 21);
  const blackM = marbleCanvas(Q.high ? 1024 : 512, 'black', 37);
  const creamM = marbleCanvas(512, 'cream', 53);
  const ivoryM = marbleCanvas(256, 'ivory', 71);
  world.ivoryTex = toTexture(ivoryM, { repeat: true, aniso });
  const creamTex = toTexture(creamM, { repeat: true, aniso });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9ab55, metalness: 1, roughness: 0.26 });
  world.gold = gold;

  /* board */
  const board = new THREE.Group();
  scene.add(board);
  const squaresTex = toTexture(boardSquaresCanvas(Q.high ? 2048 : 1024, whiteM, blackM, 5), { aniso });
  const squaresMat = new THREE.MeshPhysicalMaterial({ map: squaresTex, roughness: 0.3, clearcoat: 0.25, clearcoatRoughness: 0.2, envMapIntensity: 0.04, specularIntensity: 0.25 });
  const squares = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), squaresMat);
  squares.receiveShadow = true;
  board.add(squares);

  // grid of inlaid gold strips
  const strips = [];
  for (let i = 0; i <= 8; i++) {
    const v = i - 4;
    strips.push(new THREE.BoxGeometry(0.03, 0.008, 8.03).translate(v, 0.002, 0));
    strips.push(new THREE.BoxGeometry(8.03, 0.008, 0.03).translate(0, 0.002, v));
  }
  const grid = new THREE.Mesh(mergeGeometries(strips.map(cleanGeo)), gold);
  grid.receiveShadow = true;
  board.add(grid);

  const rectRing = (outer, inner) => {
    const s = new THREE.Shape();
    s.moveTo(-outer, -outer); s.lineTo(outer, -outer); s.lineTo(outer, outer); s.lineTo(-outer, outer); s.closePath();
    const h = new THREE.Path();
    h.moveTo(-inner, -inner); h.lineTo(-inner, inner); h.lineTo(inner, inner); h.lineTo(inner, -inner); h.closePath();
    s.holes.push(h);
    return s;
  };
  // inner gold lip
  const lip = new THREE.Mesh(new THREE.ExtrudeGeometry(rectRing(4.1, 4.0), { depth: 0.028, bevelEnabled: false }).rotateX(-Math.PI / 2), gold);
  lip.receiveShadow = true; lip.castShadow = true;
  board.add(lip);
  // engraved marble frame band
  const fc = frameCanvases(Q.high ? 2048 : 1024, creamM, fontFamily);
  const frameColor = toTexture(fc.color, { aniso });
  const frameOrm = toTexture(fc.orm, { srgb: false, aniso });
  const frameGeo = new THREE.ShapeGeometry(rectRing(BOARD.FRAME_OUT + 0.06, 4.08));
  { const p = frameGeo.attributes.position, uv = frameGeo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + 5) / 10, (p.getY(i) + 5) / 10); }
  frameGeo.rotateX(-Math.PI / 2); frameGeo.translate(0, 0.014, 0);
  const frameMat = new THREE.MeshPhysicalMaterial({ map: frameColor, roughnessMap: frameOrm, metalnessMap: frameOrm, bumpMap: frameOrm, bumpScale: 1.4, roughness: 1, metalness: 1, clearcoat: 0.5, clearcoatRoughness: 0.2 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.receiveShadow = true;
  board.add(frame);
  // outer gold rim with bevel
  const rimGeo = new THREE.ExtrudeGeometry(rectRing(BOARD.RIM, BOARD.FRAME_OUT + 0.04), { depth: 0.035, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 3 }).rotateX(-Math.PI / 2);
  const outerRim = new THREE.Mesh(rimGeo, gold);
  outerRim.castShadow = true; outerRim.receiveShadow = true;
  board.add(outerRim);
  // slab and trims
  const sideMat = new THREE.MeshPhysicalMaterial({ map: creamTex, roughness: 0.35, clearcoat: 0.4 });
  creamTex.repeat.set(2, 2);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD.RIM * 2, 0.44, BOARD.RIM * 2).translate(0, -0.235, 0), sideMat);
  slab.receiveShadow = true; slab.castShadow = true;
  board.add(slab);
  for (const y of [-0.09, -0.41]) {
    const tr = new THREE.Mesh(new THREE.ExtrudeGeometry(rectRing(BOARD.RIM + 0.02, BOARD.RIM - 0.05), { depth: y < -0.2 ? 0.05 : 0.025, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0), gold);
    board.add(tr);
  }

  /* pedestal table and terrace */
  const stoneTex = toTexture(stoneFloorCanvas(1024, 9), { repeat: true, aniso });
  stoneTex.repeat.set(3.5, 3.5);
  const stone = new THREE.MeshStandardMaterial({ map: creamTex, color: 0xe2d6c2, roughness: 0.62 });
  const table = new THREE.Group();
  table.add(new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.26, 10.6).translate(0, -0.57, 0), stone));
  table.add(new THREE.Mesh(new THREE.BoxGeometry(8.4, 8.2, 8.4).translate(0, -4.75, 0), stone));
  table.add(new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 9.4).translate(0, -8.75, 0), stone));
  table.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = true; } });
  scene.add(table);

  const FLOOR_Y = -9, TER = 12.5, TERX = 22;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(TERX * 2, TER * 2).rotateX(-Math.PI / 2).translate(0, FLOOR_Y, 0),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.82 }));
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(TERX * 2 + 0.4, 1.2, TER * 2 + 0.4).translate(0, FLOOR_Y - 0.61, 0), stone));

  // balustrade on all four sides
  const balTex = toTexture(marbleCanvas(256, 'cream', 91), { repeat: true, aniso });
  const balMat = new THREE.MeshStandardMaterial({ map: balTex, color: 0xd9cbb6, roughness: 0.75 });
  const baluster = lathe([[0, 0], [0.21, 0], [0.21, 0.12], [0.15, 0.2], [0.12, 0.38], [0.19, 0.78], [0.23, 1.08], [0.16, 1.46], [0.1, 1.64], [0.13, 1.76], [0.19, 1.84], [0.19, 1.96], [0, 1.96]], 14);
  baluster.scale(1, 1.2, 1);
  const sides = [
    { horiz: true, off: -(TER - 0.5), len: TERX * 2 - 1.2, n: 52 },
    { horiz: true, off: TER - 0.5, len: TERX * 2 - 1.2, n: 52 },
    { horiz: false, off: -(TERX - 0.5), len: TER * 2 - 1.2, n: 30 },
    { horiz: false, off: TERX - 0.5, len: TER * 2 - 1.2, n: 30 },
  ];
  const inst = new THREE.InstancedMesh(baluster, balMat, 200);
  const m4 = new THREE.Matrix4();
  let n = 0;
  const railGeos = [];
  for (const sd of sides) {
    const posts = Math.round(sd.len / 6.5);
    for (let i = 0; i < sd.n; i++) {
      const u = (i + 0.5) / sd.n;
      if (Math.abs(u * posts - Math.round(u * posts)) < 0.6 * posts / sd.n) continue;
      const t = -sd.len / 2 + u * sd.len;
      inst.setMatrixAt(n++, m4.makeTranslation(sd.horiz ? t : sd.off, FLOOR_Y + 0.35, sd.horiz ? sd.off : t));
    }
    for (const [y, h, w] of [[FLOOR_Y + 0.18, 0.36, 0.72], [FLOOR_Y + 2.86, 0.3, 0.66], [FLOOR_Y + 3.06, 0.14, 0.78]]) {
      railGeos.push(new THREE.BoxGeometry(sd.horiz ? sd.len + 1 : w, h, sd.horiz ? w : sd.len + 1).translate(sd.horiz ? 0 : sd.off, y, sd.horiz ? sd.off : 0));
    }
    for (let k = 0; k <= posts; k++) {
      const t = -sd.len / 2 + k * sd.len / posts;
      const x = sd.horiz ? t : sd.off, z = sd.horiz ? sd.off : t;
      railGeos.push(new THREE.BoxGeometry(0.82, 3.0, 0.82).translate(x, FLOOR_Y + 1.5, z));
      railGeos.push(new THREE.BoxGeometry(0.98, 0.2, 0.98).translate(x, FLOOR_Y + 3.1, z));
    }
  }
  inst.count = n; inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);
  const rails = new THREE.Mesh(mergeGeometries(railGeos.map(cleanGeo)), balMat);
  rails.castShadow = true; rails.receiveShadow = true;
  scene.add(rails);

  /* ivy */
  const leafTex = toTexture(leafCanvas(128), { aniso });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, roughness: 0.48, side: THREE.DoubleSide });
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x5b4a33, roughness: 0.8 });
  const vines = [
    [[-5.3, -8.9, 4.0], [-5.42, -4.4, 4.7], [-5.28, -1.4, 5.1], [-5.12, -0.25, 5.16], [-5.0, 0.07, 4.55], [-5.02, 0.07, 3.1], [-5.04, 0.07, 1.5], [-5.08, 0.0, 0.3], [-5.2, -0.6, -0.5]],
    [[-5.08, 0.06, 5.0], [-4.1, -0.08, 5.13], [-3.1, -0.5, 5.17], [-2.3, -1.15, 5.2]],
    [[5.4, -8.9, 3.2], [5.36, -3.4, 4.4], [5.16, -0.4, 4.95], [5.02, 0.07, 4.2], [5.0, 0.07, 2.6], [5.02, 0.07, 0.9], [5.05, 0.05, -0.6], [5.2, -0.5, -1.3]],
    [[5.05, 0.05, 5.05], [3.8, -0.25, 5.17], [2.6, -0.85, 5.2], [1.5, -1.5, 5.22]],
    [[-5.3, -2.0, -3.6], [-5.02, 0.07, -3.7], [-5.02, 0.07, -4.8], [-4.4, 0.05, -5.08], [-3.7, -0.5, -5.18]],
    [[5.3, -1.8, -2.0], [5.02, 0.07, -2.7], [5.02, 0.07, -4.3], [5.22, -0.8, -4.95]],
    [[-16.5, -5.9, -12.4], [-14.5, -5.8, -12.6], [-12.8, -6.0, -12.4], [-11.8, -6.9, -12.2]],
    [[16.5, -5.9, -11.8], [14.8, -5.8, -12.6], [13.2, -6.1, -12.4], [12.4, -7.1, -12.2]],
    [[-12.4, -5.9, 12.0], [-10.6, -5.8, 12.6], [-9.0, -6.0, 12.4], [-8.0, -6.8, 12.3]],
    [[-5.4, -8.9, -2.6], [-5.5, -6.0, -3.2], [-5.25, -2.4, -3.4], [-5.12, -0.5, -3.5]],
  ];
  const rr = rng(77);
  const leafGeo = makeLeafGeometry();
  const leafCount = 900;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  const vineGeos = [];
  let li = 0;
  const q = new THREE.Quaternion(), e = new THREE.Euler(), sV = new THREE.Vector3(), pV = new THREE.Vector3();
  const col = new THREE.Color();
  for (const pts of vines) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)));
    vineGeos.push(new THREE.TubeGeometry(curve, 48, 0.025, 5, false));
    const len = curve.getLength();
    const count = Math.round(len * 10);
    for (let k = 0; k < count && li < leafCount; k++) {
      const t = rr();
      const p = curve.getPoint(t);
      p.x += (rr() - 0.5) * 0.34; p.y += (rr() - 0.3) * 0.18; p.z += (rr() - 0.5) * 0.34;
      if (Math.abs(p.x) < 4.98 && Math.abs(p.z) < 4.98) {
        // keep leaves off the playing surface and the engraved band
        if (Math.abs(p.x) > Math.abs(p.z)) p.x = Math.sign(p.x) * (4.98 + rr() * 0.12); else p.z = Math.sign(p.z) * (4.98 + rr() * 0.12);
        p.y = Math.max(p.y, 0.06);
      }
      const onTop = p.y > -0.05;
      e.set(onTop ? -Math.PI / 2 + (rr() - 0.5) * 0.9 : (rr() - 0.5) * 1.2, rr() * Math.PI * 2, (rr() - 0.5) * 0.8);
      q.setFromEuler(e);
      const near = Math.abs(p.x) < 6 && Math.abs(p.z) < 6;
      const s = (near ? 0.2 : 0.3) + rr() * (near ? 0.17 : 0.2);
      sV.set(s, s, s); pV.copy(p);
      leaves.setMatrixAt(li, m4.compose(pV, q, sV));
      col.setHSL(0.26 + rr() * 0.06, 0.45 + rr() * 0.2, 0.32 + rr() * 0.22);
      leaves.setColorAt(li, col);
      li++;
    }
  }
  leaves.count = li; leaves.castShadow = true; leaves.receiveShadow = true;
  scene.add(leaves);
  const vineMesh = new THREE.Mesh(mergeGeometries(vineGeos.map(cleanGeo)), vineMat);
  vineMesh.castShadow = true;
  scene.add(vineMesh);

  /* golden motes drifting in the light */
  const MOTES = Q.high ? 170 : 80;
  const mp = new Float32Array(MOTES * 3), ph = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) { mp[i * 3] = (rr() - 0.5) * 22; mp[i * 3 + 1] = rr() * 7 - 0.5; mp[i * 3 + 2] = (rr() - 0.5) * 22; ph[i] = rr() * 100; }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mg.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const motesMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, tDot: { value: new THREE.CanvasTexture(softDotCanvas(64)) } },
    vertexShader: `uniform float uTime, uScale; attribute float phase; varying float vA;
      void main() { vec3 p = position; float t = uTime * 0.12 + phase;
        p += vec3(sin(t * 1.3) * 0.6, sin(t * 0.7) * 0.4 + mod(uTime * 0.05 + phase, 3.0) * 0.2, cos(t * 1.1) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * 60.0 / -mv.z; vA = 0.35 + 0.35 * sin(t * 3.0); }`,
    fragmentShader: `uniform sampler2D tDot; varying float vA; void main() { vec4 c = texture2D(tDot, gl_PointCoord); gl_FragColor = vec4(c.rgb * c.a * vA * 0.55, 1.0); }`,
  });
  const motes = new THREE.Points(mg, motesMat);
  motes.frustumCulled = false;
  scene.add(motes);
  world.motesMat = motesMat;
  world.updaters.push((t) => { motesMat.uniforms.uTime.value = t; });

  /* distant birds gliding over the valley */
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x3f3338, side: THREE.DoubleSide, toneMapped: false });
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    for (const s of [-1, 1]) {
      const wgeo = new THREE.BufferGeometry();
      wgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.25, 0, 0, 0.25, s * 1.3, 0.1, -0.1], 3));
      const w = new THREE.Mesh(wgeo, birdMat);
      w.userData.side = s;
      g.add(w);
    }
    g.userData = { r: 70 + rr() * 30, az: -0.6 + rr() * 1.1, h: -2 + rr() * 14, sp: 0.01 + rr() * 0.012, ph: rr() * 10, sc: 0.8 + rr() * 0.5 };
    g.scale.setScalar(g.userData.sc);
    scene.add(g); birds.push(g);
  }
  world.updaters.push((t) => {
    for (const b of birds) {
      const u = b.userData;
      const a = u.az + Math.sin(t * u.sp + u.ph) * 0.5;
      b.position.set(Math.sin(a) * u.r, u.h + Math.sin(t * 0.3 + u.ph) * 1.5, -Math.cos(a) * u.r);
      b.rotation.y = -a + Math.PI / 2 * Math.sign(Math.cos(t * u.sp + u.ph));
      const flap = Math.sin(t * 6 + u.ph) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.7 + u.ph));
      b.children.forEach((w) => { w.rotation.z = w.userData.side * flap; });
    }
  });

  /* square highlights */
  const stateData = new Uint8Array(64 * 4);
  const stateTex = new THREE.DataTexture(stateData, 8, 8, THREE.RGBAFormat);
  stateTex.magFilter = stateTex.minFilter = THREE.NearestFilter;
  stateTex.needsUpdate = true;
  const ovMat = overlayMaterial(stateTex);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(0, 0.006, 0), ovMat);
  overlay.renderOrder = 2;
  board.add(overlay);
  world.updaters.push((t) => { ovMat.uniforms.uTime.value = t; });
  world.setSquareFlags = (flags) => { for (let i = 0; i < 64; i++) stateData[i * 4] = flags[i]; stateTex.needsUpdate = true; };

  /* planar reflection of the pieces in the polished squares */
  const reflRT = new THREE.WebGLRenderTarget(512, 512, { samples: 0 });
  const mirrorCam = new THREE.PerspectiveCamera();
  const texMatrix = new THREE.Matrix4();
  const reflUniforms = { tRefl: { value: reflRT.texture }, uReflMatrix: { value: texMatrix }, uReflStrength: { value: 0.42 } };
  squaresMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, reflUniforms);
    sh.vertexShader = 'uniform mat4 uReflMatrix;\nvarying vec4 vReflCoord;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vReflCoord = uReflMatrix * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = 'uniform sampler2D tRefl;\nuniform float uReflStrength;\nvarying vec4 vReflCoord;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec4 reflC = texture2DProj(tRefl, vReflCoord);
      float lumR = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      float kR = uReflStrength * mix(1.0, 0.3, smoothstep(0.05, 0.5, lumR));
      outgoingLight = mix(outgoingLight, reflC.rgb, reflC.a * kR);
      #include <opaque_fragment>`);
  };
  world.reflection = { enabled: Q.reflections };
  world.renderReflection = (camera, target) => {
    if (!world.reflection.enabled) { reflUniforms.uReflStrength.value = 0; return; }
    reflUniforms.uReflStrength.value = 0.42;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(256, Math.round(size.x * 0.5)), h = Math.max(256, Math.round(size.y * 0.5));
    if (reflRT.width !== w || reflRT.height !== h) reflRT.setSize(w, h);
    mirrorCam.copy(camera);
    mirrorCam.position.y = -camera.position.y;
    mirrorCam.up.set(0, -1, 0);
    mirrorCam.lookAt(target.x, -target.y, target.z);
    mirrorCam.updateMatrixWorld();
    mirrorCam.layers.set(1);
    texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMatrix.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearAlpha();
    renderer.setRenderTarget(reflRT);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(0x000000, prevClear);
  };

  /* small effects: landing dust and capture sparkles */
  const sparkTex = new THREE.CanvasTexture(softDotCanvas(64));
  const fx = [];
  world.burst = (x, z, { color = 0xffd890, count = 26, up = 1 } = {}) => {
    const pos = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) {
      pos.set([x, 0.15, z], i * 3);
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 1.2;
      vel.push([Math.cos(a) * s * 0.6, (0.8 + Math.random() * 1.6) * up, Math.sin(a) * s * 0.6]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color, size: 0.12, map: sparkTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = new THREE.Points(g, m);
    scene.add(pts);
    fx.push({ pts, vel, t0: performance.now(), dur: 900 });
  };
  const ringTex = (() => { const c = makeCanvas(128, 128), x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 30, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,240,210,0)'); g.addColorStop(0.7, 'rgba(255,236,200,0.6)'); g.addColorStop(1, 'rgba(255,230,190,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
  world.dust = (x, z) => {
    const m = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m);
    mesh.position.set(x, 0.012, z);
    scene.add(mesh);
    fx.push({ ring: mesh, t0: performance.now(), dur: 520 });
  };
  world.updaters.push(() => {
    const now = performance.now();
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], k = (now - f.t0) / f.dur;
      if (k >= 1) {
        const o = f.pts || f.ring; scene.remove(o); o.geometry.dispose(); o.material.dispose(); fx.splice(i, 1); continue;
      }
      if (f.pts) {
        const p = f.pts.geometry.attributes.position;
        const dt = 1 / 60;
        for (let j = 0; j < f.vel.length; j++) {
          f.vel[j][1] -= 2.2 * dt;
          p.setXYZ(j, p.getX(j) + f.vel[j][0] * dt, Math.max(0.02, p.getY(j) + f.vel[j][1] * dt), p.getZ(j) + f.vel[j][2] * dt);
        }
        p.needsUpdate = true;
        f.pts.material.opacity = 1 - k;
      } else {
        f.ring.scale.setScalar(0.5 + k * 0.9);
        f.ring.material.opacity = 0.55 * (1 - k);
      }
    }
  });

  world.update = (t) => { for (const u of world.updaters) u(t); };
  world.squares = squares;
  return world;
}
