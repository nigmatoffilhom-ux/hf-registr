/* fx3d.js — 3D bloklar uchun umumiy yordamchilar (wire-neon, kamera-yol, zarra-morf, exploded-view). window.FX3D.
   three.js = window.M3THREE (3d-mini/vendor/m3-three.js, r160, lokal). Hamma funksiya faqat argument + seeded PRNG'dan hisoblanadi (Math.random yo'q).
   prng(seed) · E (easing) · wirePairs/surface/shape/gridPairs (chiziq-juftliklar Float32Array) · fatLines (qalin neon chiziq, ekran fazosida) ·
   glow (2D canvas'da bloom: kichraytirilgan nusxalar additive) · camPath (CatmullRom kamera yo'li, kalit nuqtalar bo'yicha) */
(function () {
  const F = (window.FX3D = window.FX3D || {});
  F.prng = function (seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  const clamp01 = F.clamp01 = t => Math.max(0, Math.min(1, t));
  F.num = (v, d) => (v === undefined || v === null || v === '' || isNaN(Number(v))) ? d : Number(v);
  F.bool = (v, d) => (v === undefined || v === null || v === '') ? d : !(v === false || v === 'false' || v === 0 || v === '0');
  F.json = (v, d) => { if (Array.isArray(v) || (v && typeof v === 'object')) return v; try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  F.E = {
    expoOut: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    cubicOut: t => 1 - Math.pow(1 - t, 3),
    backOut: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    smooth: t => t * t * (3 - 2 * t),
    inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  };
  F.hex = (THREE, c) => new THREE.Color(c);

  // ---- Chiziq-juftliklar (har segment = 6 son: x0 y0 z0 x1 y1 z1) ----
  F.wirePairs = function (THREE, geo, edgesDeg) {
    const g = edgesDeg ? new THREE.EdgesGeometry(geo, edgesDeg) : new THREE.WireframeGeometry(geo);
    const a = g.attributes.position.array; const out = new Float32Array(a.length); out.set(a); g.dispose(); return out;
  };
  // f(u,v)->[x,y,z]; u,v in [0,1]; faqat setka chiziqlari (diagonalsiz)
  F.surface = function (THREE, f, nu, nv, closeU, closeV) {
    const P = []; const pt = (i, j) => f(i / nu, j / nv);
    for (let i = 0; i <= nu; i++) for (let j = 0; j < nv; j++) { const a = pt(i, j), b = pt(i, j + 1); P.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    for (let j = 0; j <= nv; j++) for (let i = 0; i < nu; i++) { const a = pt(i, j), b = pt(i + 1, j); P.push(a[0], a[1], a[2], b[0], b[1], b[2]); }
    return new Float32Array(P);
  };
  // normallashtirish: markazga, eng uzoq nuqta radiusi = 1
  F.normalize = function (pairs) {
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < pairs.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pairs[i + k]); mx[k] = Math.max(mx[k], pairs[i + k]); }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]; let R = 0;
    for (let i = 0; i < pairs.length; i += 3) R = Math.max(R, Math.hypot(pairs[i] - c[0], pairs[i + 1] - c[1], pairs[i + 2] - c[2]));
    R = R || 1; const o = new Float32Array(pairs.length);
    for (let i = 0; i < pairs.length; i += 3) for (let k = 0; k < 3; k++) o[i + k] = (pairs[i + k] - c[k]) / R;
    return o;
  };
  F.shape = function (THREE, name, o) {
    o = o || {}; const TAU = Math.PI * 2; let p;
    switch (name) {
      case 'kub': p = F.wirePairs(THREE, new THREE.BoxGeometry(1, 1, 1, 4, 4, 4)); break; // 4x4 setka har yoqda
      case 'kub-oddiy': p = F.wirePairs(THREE, new THREE.BoxGeometry(1, 1, 1), 1); break;
      case 'shar': p = F.surface(THREE, (u, v) => { const a = u * TAU, b = v * Math.PI; return [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)]; }, 28, 18); break;
      case 'tor': p = F.surface(THREE, (u, v) => { const a = u * TAU, b = v * TAU; return [(1 + 0.38 * Math.cos(b)) * Math.cos(a), 0.38 * Math.sin(b), (1 + 0.38 * Math.cos(b)) * Math.sin(a)]; }, 40, 16); break;
      case 'konus': p = F.surface(THREE, (u, v) => { const a = u * TAU, r = (1 - v); return [r * Math.cos(a), v * 1.6 - 0.8, r * Math.sin(a)]; }, 28, 10); break;
      // huni: yuqorisi keng, o'rtasi torayadi, pastki bo'yni silindr (reel "funnel")
      case 'huni': p = F.surface(THREE, (u, v) => { const a = u * TAU, h = v; const r = 0.16 + 0.84 * Math.pow(1 - h, 2.2); return [r * Math.cos(a), h * 2 - 1, r * Math.sin(a)]; }, 36, 20); break;
      case 'mobius': p = F.surface(THREE, (u, v) => { const a = u * TAU, s = (v - 0.5) * 0.9; return [(1 + s * Math.cos(a / 2)) * Math.cos(a), s * Math.sin(a / 2), (1 + s * Math.cos(a / 2)) * Math.sin(a)]; }, 60, 6); break;
      case 'tolqin': p = F.surface(THREE, (u, v) => { const x = (u - 0.5) * 2, z = (v - 0.5) * 2; return [x, 0.28 * Math.sin(x * 5.2) * Math.cos(z * 4.4) + 0.12 * Math.sin(z * 9), z]; }, 36, 36); break;
      case 'spiral': p = F.surface(THREE, (u, v) => { const a = u * TAU * 3, r = 0.35 + v * 0.65; return [r * Math.cos(a), (u - 0.5) * 2, r * Math.sin(a)]; }, 90, 3); break;
      case 'parametrik': {
        const mk = e => new Function('u', 'v', 'with(Math){return (' + (e || '0') + ')}');
        const fx = mk(o.fx || 'cos(u*6.2832)*(1+0.4*cos(v*6.2832))'), fy = mk(o.fy || '0.4*sin(v*6.2832)'), fz = mk(o.fz || 'sin(u*6.2832)*(1+0.4*cos(v*6.2832))');
        p = F.surface(THREE, (u, v) => [fx(u, v), fy(u, v), fz(u, v)], 48, 24); break; }
      default: p = F.wirePairs(THREE, new THREE.BoxGeometry(1, 1, 1, 4, 4, 4));
    }
    return F.normalize(p);
  };
  // pol setkasi: y = y0 tekisligida, har chiziq `sub` bo'lakka bo'lingan (chetga qarab so'nishi uchun)
  F.gridPairs = function (S, n, sub, y0) {
    const P = [], st = 2 * S / n;
    for (let i = 0; i <= n; i++) {
      const c = -S + i * st;
      for (let j = 0; j < sub; j++) {
        const a = -S + 2 * S * j / sub, b = -S + 2 * S * (j + 1) / sub;
        P.push(c, y0, a, c, y0, b); P.push(a, y0, c, b, y0, c);
      }
    }
    return new Float32Array(P);
  };

  // ---- Qalin neon chiziq: ekran fazosida kengaytirilgan quad'lar, additive ----
  // opts: {rang, kenglik(px), W, H, xira(0..1), fog:[near,far], rangFn(x,y,z)->Color, ordAxis:1(y), reveal(0 yoq), pulse}
  F.fatLines = function (THREE, pairs, o) {
    const n = pairs.length / 6, pos = new Float32Array(n * 4 * 3), oth = new Float32Array(n * 4 * 3), side = new Float32Array(n * 4), col = new Float32Array(n * 4 * 3), ord = new Float32Array(n * 4), idx = new Uint32Array(n * 6);
    let mn = 1e9, mx = -1e9; const ax = o.ordAxis === undefined ? 1 : o.ordAxis;
    for (let s = 0; s < n; s++) { const m = (pairs[s * 6 + ax] + pairs[s * 6 + 3 + ax]) / 2; mn = Math.min(mn, m); mx = Math.max(mx, m); }
    const rnd = F.prng(o.seed || 5), base = new THREE.Color(o.rang || '#3fb8ff');
    for (let s = 0; s < n; s++) {
      const A = [pairs[s * 6], pairs[s * 6 + 1], pairs[s * 6 + 2]], B = [pairs[s * 6 + 3], pairs[s * 6 + 4], pairs[s * 6 + 5]];
      const m = (A[ax] + B[ax]) / 2, od = o.reveal === false ? 0 : ((m - mn) / ((mx - mn) || 1)) * 0.92 + rnd() * 0.08;
      const cA = o.rangFn ? o.rangFn(A[0], A[1], A[2]) : base, cB = o.rangFn ? o.rangFn(B[0], B[1], B[2]) : base;
      const V = [[A, B, -1, cA], [A, B, 1, cA], [B, A, 1, cB], [B, A, -1, cB]];
      for (let k = 0; k < 4; k++) {
        const q = s * 4 + k, v = V[k];
        pos.set(v[0], q * 3); oth.set(v[1], q * 3); side[q] = v[2]; ord[q] = od; col[q * 3] = v[3].r; col[q * 3 + 1] = v[3].g; col[q * 3 + 2] = v[3].b;
      }
      const b = s * 4; idx.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], s * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aOther', new THREE.BufferAttribute(oth, 3));
    g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aOrd', new THREE.BufferAttribute(ord, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, side: THREE.DoubleSide,
      uniforms: { uRes: { value: new THREE.Vector2(o.W, o.H) }, uW: { value: o.kenglik || 2 }, uA: { value: o.xira === undefined ? 1 : o.xira }, uFog: { value: new THREE.Vector2((o.fog || [8, 30])[0], (o.fog || [8, 30])[1]) }, uProg: { value: 2 }, uHot: { value: o.hot === undefined ? 1 : o.hot }, uPulse: { value: 0 } },
      vertexShader: `attribute vec3 aOther; attribute float aSide; attribute vec3 aCol; attribute float aOrd;
        uniform vec2 uRes; uniform float uW; varying vec3 vC; varying float vS; varying float vD; varying float vO;
        void main(){
          vec4 m0 = modelViewMatrix*vec4(position,1.); vec4 m1 = modelViewMatrix*vec4(aOther,1.);
          vec4 p0 = projectionMatrix*m0; vec4 p1 = projectionMatrix*m1;
          float w0 = max(p0.w, 0.02), w1 = max(p1.w, 0.02);
          vec2 s0 = p0.xy/w0*uRes*0.5; vec2 s1 = p1.xy/w1*uRes*0.5;
          vec2 d = s1 - s0; float l = length(d); d = l > 1e-4 ? d/l : vec2(1.,0.);
          vec2 n = vec2(-d.y, d.x);
          vec2 off = n*aSide*uW*0.5 - d*uW*0.5;
          gl_Position = vec4((s0+off)/(uRes*0.5)*w0, p0.z, w0);
          vC = aCol; vS = aSide; vD = -m0.z; vO = aOrd; }`,
      fragmentShader: `uniform float uA; uniform vec2 uFog; uniform float uProg; uniform float uHot; uniform float uPulse;
        varying vec3 vC; varying float vS; varying float vD; varying float vO;
        void main(){
          float e = 1.0 - smoothstep(0.45, 1.0, abs(vS));
          float fog = 1.0 - smoothstep(uFog.x, uFog.y, vD);
          float r = clamp((uProg*1.3 - vO)/0.3, 0., 1.);
          float hot = r*(1.-r)*4.*uHot;
          vec3 c = vC*(1.0+uPulse) + vec3(1.)*hot*0.8;
          float k = r*e*fog*uA; c *= k; gl_FragColor = vec4(c, max(max(c.r,c.g),c.b)); }`,
    });
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = o.renderOrder || 0;
    return mesh;
  };

  // ---- Bloom (2D canvas): out ga src ni asl holda + 2 xira darajada additive ----
  F.glowTayyor = function (W, H) {
    const mk = d => { const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(W / d)); c.height = Math.max(8, Math.round(H / d)); return c; };
    return { s1: mk(4), s2: mk(12) };
  };
  F.glow = function (out, src, W, H, G, o) {
    o = o || {}; const a1 = o.a1 === undefined ? 0.85 : o.a1, a2 = o.a2 === undefined ? 0.9 : o.a2;
    const c1 = G.s1.getContext('2d'), c2 = G.s2.getContext('2d');
    c1.clearRect(0, 0, G.s1.width, G.s1.height); c1.imageSmoothingQuality = 'high'; c1.filter = 'blur(1.2px)'; c1.drawImage(src, 0, 0, G.s1.width, G.s1.height); c1.filter = 'none';
    c2.clearRect(0, 0, G.s2.width, G.s2.height); c2.imageSmoothingQuality = 'high'; c2.filter = 'blur(1.6px)'; c2.drawImage(G.s1, 0, 0, G.s2.width, G.s2.height); c2.filter = 'none';
    out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.globalCompositeOperation = 'source-over'; out.drawImage(src, 0, 0, W, H);
    out.globalCompositeOperation = 'lighter';
    out.globalAlpha = a1; out.drawImage(G.s1, 0, 0, W, H);
    out.globalAlpha = a2; out.drawImage(G.s2, 0, 0, W, H);
    out.globalAlpha = 1; out.globalCompositeOperation = 'source-over';
  };

  // ---- Kamera yo'li: kalit nuqtalar -> CatmullRom (pozitsiya va nishon alohida), vaqt bo'yicha ----
  // keys: [{t, p:[x,y,z], k:[x,y,z], fov}]; ease: 'inout' (har kalitda yumshoq to'xtaydi) | 'chiziq' (tekis oqim, kalitlarda to'xtamaydi)
  F.camPath = function (THREE, keys, ease) {
    keys = keys.slice().sort((a, b) => a.t - b.t);
    const n = keys.length, V = a => new THREE.Vector3(a[0], a[1], a[2]);
    const cp = n > 1 ? new THREE.CatmullRomCurve3(keys.map(k => V(k.p)), false, 'centripetal') : null;
    const ct = n > 1 ? new THREE.CatmullRomCurve3(keys.map(k => V(k.k || [0, 0, 0])), false, 'centripetal') : null;
    const sm = F.E.inOut;
    return function (t) {
      if (n === 1 || t <= keys[0].t) return { p: V(keys[0].p), k: V(keys[0].k || [0, 0, 0]), fov: keys[0].fov };
      if (t >= keys[n - 1].t) return { p: V(keys[n - 1].p), k: V(keys[n - 1].k || [0, 0, 0]), fov: keys[n - 1].fov };
      let i = 0; while (i < n - 2 && t > keys[i + 1].t) i++;
      let s = (t - keys[i].t) / ((keys[i + 1].t - keys[i].t) || 1); s = ease === 'chiziq' ? s : sm(s);
      const u = (i + s) / (n - 1), f0 = keys[i].fov, f1 = keys[i + 1].fov;
      return { p: cp.getPoint(u), k: ct.getPoint(u), fov: (f0 && f1) ? f0 + (f1 - f0) * s : (f0 || f1) };
    };
  };
  // tayyor yo'llar: orbit | dolly | tepa (yuqoridan) | aralash. R = obyekt radiusi masofasi, dur = umumiy davomiylik
  F.yolPreset = function (nom, R, dur) {
    const c = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
    if (nom === 'dolly') return [{ t: 0, p: [0, R * 0.25, R * 2.6], k: [0, 0, 0], fov: 38 }, { t: dur * 0.55, p: [R * 0.5, R * 0.3, R * 1.5], k: [0, 0, 0], fov: 38 }, { t: dur, p: [R * 0.9, R * 0.25, R * 0.9], k: [0, 0.05 * R, 0], fov: 38 }];
    if (nom === 'tepa') return [{ t: 0, p: c(0.8, R * 2.4, R * 0.9), k: [0, 0, 0], fov: 38 }, { t: dur * 0.5, p: c(0.3, R * 1.0, R * 3.0), k: [0, 0, 0], fov: 38 }, { t: dur, p: [0.001 * R, R * 3.6, 0.4 * R], k: [0, 0, 0], fov: 38 }];
    if (nom === 'aralash') return [{ t: 0, p: c(0, R * 2.8, R * 0.7), k: [0, 0, 0], fov: 38 }, { t: dur * 0.3, p: c(1.2, R * 2.0, R * 0.5), k: [0, 0, 0], fov: 38 }, { t: dur * 0.6, p: c(2.6, R * 1.3, R * 0.2), k: [0, 0.1 * R, 0], fov: 38 }, { t: dur * 0.85, p: [0.2 * R, R * 3.2, R * 1.2], k: [0, 0, 0], fov: 38 }, { t: dur, p: [0.01 * R, R * 3.8, 0.6 * R], k: [0, 0, 0], fov: 38 }];
    const keys = []; const N = 5; for (let i = 0; i <= N; i++) keys.push({ t: dur * i / N, p: c(0.5 + i * (Math.PI * 1.1) / N, R * 2.4, R * (0.55 - 0.1 * Math.sin(i))), k: [0, 0, 0], fov: 38 }); // orbit
    return keys;
  };
})();
