/* maska.js — After Effects maska / track matte / shape layer / trim paths / motion path / morf  (FX.maska.*)
   HyperFrames uchun: deterministik, seek-safe, faqat yagona paused GSAP timeline'ga yoziladi, Math.random yo'q (seedli PRNG).
   Ulash (host <head>, gsap 3.14.2 dan KEYIN; vendor fayllar ixtiyoriy — yo'li shu fayl papkasiga nisbatan emas, host'ga nisbatan):
     <script src="maska/vendor/MotionPathPlugin.min.js"></script>   <!-- FX.maska.yol uchun (GSAP 3.14.2, bepul "no charge" litsenziya) -->
     <script src="maska/vendor/MorphSVGPlugin.min.js"></script>     <!-- FX.maska.morf uchun (GSAP 3.14.2, 3.13 dan bepul) -->
     <script src="maska/maska.js"></script>
   Sub-composition ichidan chaqirsangiz ELEMENT bering (selector emas) — runtime document.querySelector ni faqat sub-comp skriptida cheklaydi.

   1. MASKA (SVG <mask>, element ustiga CSS mask:url(#..)). Maska koordinatalari — element chap-yuqori burchagidan, px.
        const h = FX.maska.yarat(el, { tur:'aylana'|'rect'|'ellips'|'yol'|'yulduz'|'poligon', W,H, bosh:{...}, feather:px, teskari:true });
        FX.maska.anim(tl, h, t, { ga:{...}, dan:{...}, dur, ease, feather });
          aylana: x,y (markaz), r | ellips: x,y,rx,ry | rect: x,y,w,h,r (burchak radiusi) | yol/yulduz/poligon: x,y (siljish), s (masshtab), rot (burchak)
        FX.maska.ochil(tl, el, t, { tur:'aylana'|'rect'|'yol'|'yulduz', yon:'chap'|'ong'|'yuqori'|'past'|'markaz-x'|'markaz-y'|'markaz', markaz:[fx,fy], feather, dur, ease, yop:true, teskari:true });
        Teskari maska: { teskari:true } — shakl "teshik" bo'ladi (shakl ichi yashirin).
   2. TRACK MATTE:
        FX.maska.matteMatn(el, { matn, shrift, olcham, vazn, W,H, x,y, ls, teskari, feather })  — alpha matte: el faqat harflar ichida ko'rinadi (h.text animatsiyalanadi: anim ga:{x,y,s,rot,ls})
        FX.maska.matteRasm(el, { href, tur:'alpha'|'luma', W,H, fit:'cover'|'contain', teskari }) — PNG alpha yoki oq-qora (luma) rasm matte
        FX.maska.gradOchil(tl, el, t, { burchak:0, yumshoq:.35, dur, ease, yop })  — luma matte: gradient bilan yumshoq ochilish (burchak: 0=chapdan, 90=yuqoridan)
        Video: <video> ni EMAS, uning <div> o'ramini maskalang (render paytida video <img> bilan almashadi).
   3. SHAPE LAYER:
        const sv = FX.maska.katlam(ota, { W,H });  const p = FX.maska.shakl(sv, { tur:'yol'|'rect'|'aylana'|'ellips'|'chiziq'|'poligon'|'yulduz'|'yurak', d, x,y,w,h,r, cx,cy, n, R, fill, stroke, sw, cap, join, dash });
        FX.maska.trim(tl, p, t, { dan:{boshi:0,oxiri:0,siljish:0}, ga:{boshi:0,oxiri:1,siljish:0}, dur, ease });   // Trim Paths: start / end / offset (0..1)
        FX.maska.rang(tl, p, t, { fill, stroke, sw, opacity, dur, ease });                                      // fill / stroke animatsiyasi
        FX.maska.repeater(sv, p, { soni, dx,dy, rot, s, opacity, markaz:[x,y], tasodif:{x,y,rot,s}, urug });    // nusxa ko'paytirish -> [<g>...]
        FX.maska.repeaterKirish(tl, nusxalar, t, { har, dur, tur:'olcham'|'chizilish'|'opacity', ease });
   4. YO'L BO'YLAB HARAKAT (GSAP MotionPathPlugin):
        FX.maska.yol(tl, el, yolEl|'M..d', t, { dur, ease, burilish:true|burchak, boshi:0, oxiri:1, iz:chizilganYolEl, teskari });
   5. MORF (GSAP MorphSVGPlugin):
        FX.maska.morf(tl, pathEl, nishon(d yoki element), t, { dur, ease, tur:'rotational'|'linear', rang:{fill,stroke} });
        FX.maska.morfZanjir(tl, pathEl, [d1,d2,...], t, { dur, qolish, ease });
        FX.maska.d.{aylana,rect,poligon,yulduz,yurak}(...) — bir xil nuqta sonli path generatorlari.
   Yordamchi: FX.maska.rng(urug) -> () => [0,1) (mulberry32). */
(function () {
  const FX = (window.FX = window.FX || {});
  const NS = 'http://www.w3.org/2000/svg';
  let UID = 0;
  const M = (FX.maska = FX.maska || {});

  if (window.gsap) {
    const pl = [window.MotionPathPlugin, window.MorphSVGPlugin].filter(Boolean);
    if (pl.length) { try { gsap.registerPlugin.apply(gsap, pl); } catch (e) { console.warn('maska.js plugin:', e); } }
  }

  // ---- yordamchilar ----
  M.rng = function (urug) {
    let a = (urug == null ? 1 : urug) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const one = s => (typeof s === 'string' ? document.querySelector(s) : s);
  const svg = (tag, at) => { const e = document.createElementNS(NS, tag); if (at) for (const k in at) e.setAttribute(k, at[k]); return e; };
  const num = (v, d) => (v == null || isNaN(+v) ? d : +v);
  function defs() {
    let s = document.getElementById('fx-maska-defs');
    if (!s) {
      s = svg('svg', { id: 'fx-maska-defs', width: 0, height: 0, 'aria-hidden': 'true' });
      s.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
      document.body.appendChild(s);
    }
    return s;
  }
  function olcham(el, o) {
    let W = o.W, H = o.H;
    if (!W) W = el.offsetWidth || (el.getBoundingClientRect && el.getBoundingClientRect().width) || (el.parentNode && el.parentNode.offsetWidth) || 1920;
    if (!H) H = el.offsetHeight || (el.getBoundingClientRect && el.getBoundingClientRect().height) || (el.parentNode && el.parentNode.offsetHeight) || 1080;
    return [W, H];
  }
  function mask(W, H, alpha) {
    const id = 'fxm' + (++UID);
    const m = svg('mask', { id, maskUnits: 'userSpaceOnUse', x: -W, y: -H, width: 3 * W, height: 3 * H });
    m.style.setProperty('mask-type', alpha ? 'alpha' : 'luminance');
    defs().appendChild(m);
    return m;
  }
  function qo(el, m) {
    const u = 'url(#' + m.getAttribute('id') + ')';
    el.style.setProperty('mask', u); el.style.setProperty('-webkit-mask', u);
  }
  function xira(W, H, f) { // feather filtri; sigma = f/2
    const id = 'fxf' + (++UID);
    const fl = svg('filter', { id, filterUnits: 'userSpaceOnUse', x: -W, y: -H, width: 3 * W, height: 3 * H, 'color-interpolation-filters': 'sRGB' });
    const b = svg('feGaussianBlur', { stdDeviation: Math.max(0, f) / 2 });
    fl.appendChild(b); defs().appendChild(fl);
    return { id, b };
  }
  function bbox(d) {
    const p = svg('path', { d }); defs().appendChild(p);
    let b; try { b = p.getBBox(); } catch (e) { b = { x: 0, y: 0, width: 100, height: 100 }; }
    defs().removeChild(p); return b;
  }

  // ---- path generatorlari (bir xil nuqta soni: morf uchun qulay) ----
  const D = (M.d = {});
  const fmt = n => Math.round(n * 100) / 100;
  const poly = pts => 'M' + pts.map(p => fmt(p[0]) + ',' + fmt(p[1])).join('L') + 'Z';
  D.poligon = (cx, cy, R, n, rot) => { n = n || 6; rot = (rot == null ? -90 : rot) * Math.PI / 180; const a = []; for (let i = 0; i < n; i++) { const t = rot + i * 2 * Math.PI / n; a.push([cx + R * Math.cos(t), cy + R * Math.sin(t)]); } return poly(a); };
  D.yulduz = (cx, cy, R, r, n, rot) => { n = n || 5; r = r == null ? R * 0.45 : r; rot = (rot == null ? -90 : rot) * Math.PI / 180; const a = []; for (let i = 0; i < n * 2; i++) { const t = rot + i * Math.PI / n, q = i % 2 ? r : R; a.push([cx + q * Math.cos(t), cy + q * Math.sin(t)]); } return poly(a); };
  D.aylana = (cx, cy, r, n) => { n = n || 48; const a = []; for (let i = 0; i < n; i++) { const t = -Math.PI / 2 + i * 2 * Math.PI / n; a.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); } return poly(a); };
  D.rect = (cx, cy, w, h, n) => { n = n || 48; const a = [], k = n / 4; for (let s = 0; s < 4; s++) for (let i = 0; i < k; i++) { const u = i / k; const x0 = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]][s], x1 = [[w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]][s]; a.push([cx + x0[0] + (x1[0] - x0[0]) * u, cy + x0[1] + (x1[1] - x0[1]) * u]); } return poly(a); };
  D.yurak = (cx, cy, S, n) => { n = n || 48; const a = []; for (let i = 0; i < n; i++) { const t = Math.PI + i * 2 * Math.PI / n; a.push([cx + S * 0.0625 * 16 * Math.pow(Math.sin(t), 3), cy - S * 0.0625 * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) + S * 0.06]); } return poly(a); };

  // ================= 1. MASKA =================
  function dToLimit(W, H, mx, my, f) { return Math.hypot(Math.max(mx, W - mx), Math.max(my, H - my)) + f * 1.5 + 4; }

  M.yarat = function (el, o) {
    o = o || {}; el = one(el);
    const [W, H] = olcham(el, o);
    const tur = o.tur || 'aylana', neg = !!o.teskari;
    const m = mask(W, H, false);
    const bg = svg('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: neg ? '#fff' : '#000' });
    m.appendChild(bg);
    const b0 = o.bosh || {};
    let sh, bb = null;
    if (tur === 'rect') sh = svg('rect', { x: num(b0.x, 0), y: num(b0.y, 0), width: num(b0.w, W), height: num(b0.h, H), rx: num(b0.r, 0), ry: num(b0.r, 0) });
    else if (tur === 'ellips') sh = svg('ellipse', { cx: num(b0.x, W / 2), cy: num(b0.y, H / 2), rx: num(b0.rx, 0), ry: num(b0.ry, 0) });
    else if (tur === 'aylana') sh = svg('circle', { cx: num(b0.x, W / 2), cy: num(b0.y, H / 2), r: num(b0.r, 0) });
    else { // yol | yulduz | poligon
      let d = o.d;
      if (!d) { const R = num(o.R, 100); d = tur === 'poligon' ? D.poligon(0, 0, R, o.n || 6, o.rot0) : D.yulduz(0, 0, R, o.r2, o.n || 5, o.rot0); }
      bb = bbox(d);
      sh = svg('path', { d });
      const cx = bb.x + bb.width / 2, cy = bb.y + bb.height / 2;
      // d (0,0) atrofida chizilgan bo'lsa markazga qo'yamiz (x,y — markaz), aks holda yo'lning o'z koordinatalarida
      const bx = o.d ? 0 : W / 2, by = o.d ? 0 : H / 2;
      gsap.set(sh, { svgOrigin: cx + ' ' + cy, x: num(b0.x, bx), y: num(b0.y, by), scale: num(b0.s, 0), rotation: num(b0.rot, 0) });
    }
    sh.setAttribute('fill', neg ? '#000' : '#fff');
    let fl = null;
    if (o.feather != null) { fl = xira(W, H, o.feather); sh.setAttribute('filter', 'url(#' + fl.id + ')'); }
    m.appendChild(sh); qo(el, m);
    return { el, mask: m, shape: sh, tur, W, H, blur: fl && fl.b, neg, bbox: bb, o };
  };

  function mapProps(h, p) {
    const a = {};
    if (h.tur === 'rect') { if ('x' in p) a.x = p.x; if ('y' in p) a.y = p.y; if ('w' in p) a.width = p.w; if ('h' in p) a.height = p.h; if ('r' in p) { a.rx = p.r; a.ry = p.r; } return { attr: a }; }
    if (h.tur === 'aylana') { if ('x' in p) a.cx = p.x; if ('y' in p) a.cy = p.y; if ('r' in p) a.r = p.r; return { attr: a }; }
    if (h.tur === 'ellips') { if ('x' in p) a.cx = p.x; if ('y' in p) a.cy = p.y; if ('rx' in p) a.rx = p.rx; if ('ry' in p) a.ry = p.ry; return { attr: a }; }
    const g = {};
    if ('x' in p) g.x = p.x; if ('y' in p) g.y = p.y; if ('s' in p) g.scale = p.s; if ('rot' in p) g.rotation = p.rot;
    return { gs: g };
  }
  M.ayarla = function (h, p) { const mp = mapProps(h, p); if (mp.attr) gsap.set(h.shape, { attr: mp.attr }); if (mp.gs) gsap.set(h.shape, mp.gs); };

  // h shaklini t da animatsiya qiladi. o.ga = oxirgi qiymatlar, o.dan = boshlang'ich (ixtiyoriy), o.feather = yangi yumshoqlik (px)
  M.anim = function (tl, h, t, o) {
    o = o || {};
    const dur = o.dur == null ? 1 : o.dur, ease = o.ease || 'power2.inOut';
    const ga = mapProps(h, o.ga || {}), dan = o.dan ? mapProps(h, o.dan) : null;
    const base = { duration: dur, ease, immediateRender: false };
    if (ga.attr && Object.keys(ga.attr).length) {
      if (dan && dan.attr) tl.fromTo(h.shape, { attr: dan.attr }, Object.assign({ attr: ga.attr }, base), t);
      else tl.to(h.shape, Object.assign({ attr: ga.attr }, base), t);
    }
    if (ga.gs && Object.keys(ga.gs).length) {
      if (dan && dan.gs) tl.fromTo(h.shape, dan.gs, Object.assign({}, ga.gs, base), t);
      else tl.to(h.shape, Object.assign({}, ga.gs, base), t);
    }
    if (o.feather != null && h.blur) {
      const f = { attr: { stdDeviation: o.feather / 2 } };
      if (o.featherDan != null) tl.fromTo(h.blur, { attr: { stdDeviation: o.featherDan / 2 } }, Object.assign(f, base), t);
      else tl.to(h.blur, Object.assign(f, base), t);
    }
    return h;
  };

  // tayyor ochilish / yopilish presetlari
  M.ochil = function (tl, el, t, o) {
    o = o || {}; el = one(el);
    const tur = o.tur || 'aylana', dur = o.dur == null ? 1.1 : o.dur, f = o.feather == null ? 0 : o.feather;
    const [W, H] = olcham(el, o);
    const mk = o.markaz || [0.5, 0.5], mx = mk[0] * W, my = mk[1] * H, yop = !!o.yop;
    let h, A, B; // A = yopiq holat, B = ochiq holat
    if (tur === 'rect') {
      const yon = o.yon || 'chap', r = o.r || 0, mg = f * 1.5 + 4;
      const full = { x: -mg, y: -mg, w: W + 2 * mg, h: H + 2 * mg, r };
      const zero = {
        chap: { x: -mg, y: -mg, w: 0, h: full.h }, ong: { x: W + mg, y: -mg, w: 0, h: full.h },
        yuqori: { x: -mg, y: -mg, w: full.w, h: 0 }, past: { x: -mg, y: H + mg, w: full.w, h: 0 },
        'markaz-x': { x: W / 2, y: -mg, w: 0, h: full.h }, 'markaz-y': { x: -mg, y: H / 2, w: full.w, h: 0 }, markaz: { x: W / 2, y: H / 2, w: 0, h: 0 }
      }[yon] || { x: -mg, y: -mg, w: 0, h: full.h };
      A = Object.assign({ r }, zero); B = full;
      h = M.yarat(el, { tur: 'rect', W, H, bosh: yop ? B : A, feather: f, teskari: o.teskari });
    } else if (tur === 'aylana') {
      const R = dToLimit(W, H, mx, my, f);
      A = { x: mx, y: my, r: 0 }; B = { x: mx, y: my, r: R };
      h = M.yarat(el, { tur: 'aylana', W, H, bosh: yop ? B : A, feather: f, teskari: o.teskari });
    } else { // yol | yulduz | poligon: masshtab bilan
      const R0 = num(o.R, 100), R = dToLimit(W, H, mx, my, f) / (R0 * 0.9);
      const hd = M.yarat(el, { tur, W, H, d: o.d, R: R0, n: o.n, r2: o.r2, bosh: { x: mx, y: my, s: 0, rot: o.rot0 || 0 }, feather: f, teskari: o.teskari });
      h = hd;
      A = { x: mx, y: my, s: 0, rot: o.rot0 || 0 }; B = { x: mx, y: my, s: R, rot: (o.rot0 || 0) + (o.burilish == null ? 90 : o.burilish) };
      if (o.d) { const bb = h.bbox; B.s = dToLimit(W, H, mx, my, f) / (Math.min(bb.width, bb.height) * 0.45 || 1); }
      M.ayarla(h, yop ? B : A);
    }
    M.anim(tl, h, t, { dan: yop ? B : A, ga: yop ? A : B, dur, ease: o.ease || 'power3.inOut' });
    return h;
  };

  // ================= 2. TRACK MATTE =================
  M.matteMatn = function (el, o) {
    o = o || {}; el = one(el);
    const [W, H] = olcham(el, o), m = mask(W, H, false), neg = !!o.teskari;
    m.appendChild(svg('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: neg ? '#fff' : '#000' }));
    const x = num(o.x, W / 2), y = num(o.y, H / 2);
    const tx = svg('text', { x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: neg ? '#000' : '#fff' });
    tx.setAttribute('style', "font-family:" + (o.shrift || "Inter,Arial,sans-serif") + ";font-weight:" + (o.vazn || 900) + ";font-size:" + (o.olcham || Math.round(H * 0.3)) + "px;letter-spacing:" + (o.ls || 0) + "px");
    tx.textContent = o.matn || 'MATN';
    let fl = null;
    if (o.feather != null) { fl = xira(W, H, o.feather); tx.setAttribute('filter', 'url(#' + fl.id + ')'); }
    m.appendChild(tx); qo(el, m);
    gsap.set(tx, { svgOrigin: x + ' ' + y });
    return { el, mask: m, text: tx, shape: tx, tur: 'matn', W, H, blur: fl && fl.b, neg };
  };
  // matn uchun anim: ga:{x,y,s,rot} (siljish/masshtab/burilish), ls — harf oralig'i (px)
  const _anim = M.anim;
  M.anim = function (tl, h, t, o) {
    if (h.tur === 'matn') {
      o = o || {}; const g = o.ga || {}, dur = o.dur == null ? 1 : o.dur, ease = o.ease || 'power2.inOut';
      const tw = {}; if ('x' in g) tw.x = g.x; if ('y' in g) tw.y = g.y; if ('s' in g) tw.scale = g.s; if ('rot' in g) tw.rotation = g.rot;
      const fr = o.dan ? {} : null; if (fr) { const d = o.dan; if ('x' in d) fr.x = d.x; if ('y' in d) fr.y = d.y; if ('s' in d) fr.scale = d.s; if ('rot' in d) fr.rotation = d.rot; }
      if (Object.keys(tw).length) { if (fr) tl.fromTo(h.text, fr, Object.assign({}, tw, { duration: dur, ease, immediateRender: false }), t); else tl.to(h.text, Object.assign({}, tw, { duration: dur, ease, immediateRender: false }), t); }
      if ('ls' in g) tl.to(h.text, { letterSpacing: g.ls, duration: dur, ease, immediateRender: false }, t);
      if (o.feather != null && h.blur) tl.to(h.blur, { attr: { stdDeviation: o.feather / 2 }, duration: dur, ease, immediateRender: false }, t);
      return h;
    }
    return _anim(tl, h, t, o);
  };

  M.matteRasm = function (el, o) {
    o = o || {}; el = one(el);
    const [W, H] = olcham(el, o), alpha = (o.tur || 'alpha') === 'alpha', neg = !!o.teskari;
    const m = mask(W, H, alpha);
    if (!alpha) m.appendChild(svg('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: neg ? '#fff' : '#000' }));
    const im = svg('image', { x: 0, y: 0, width: W, height: H, preserveAspectRatio: o.fit === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice' });
    im.setAttribute('href', o.href); im.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', o.href);
    m.appendChild(im); qo(el, m);
    gsap.set(im, { svgOrigin: W / 2 + ' ' + H / 2 });
    return { el, mask: m, image: im, shape: im, tur: 'rasm', W, H };
  };

  // gradient luma matte: yumshoq ochilish. burchak 0 = chapdan o'ngga, 90 = yuqoridan pastga
  M.gradOchil = function (tl, el, t, o) {
    o = o || {}; el = one(el);
    const [W, H] = olcham(el, o), dur = o.dur == null ? 1.4 : o.dur, ease = o.ease || 'power2.inOut', yop = !!o.yop;
    const ang = (o.burchak || 0) * Math.PI / 180, dx = Math.cos(ang), dy = Math.sin(ang), soft = (o.yumshoq == null ? 0.35 : o.yumshoq) * Math.hypot(W, H);
    const cx = W / 2, cy = H / 2, pc = cx * dx + cy * dy;
    let pmin = 1e9, pmax = -1e9;
    [[0, 0], [W, 0], [W, H], [0, H]].forEach(c => { const p = c[0] * dx + c[1] * dy; pmin = Math.min(pmin, p); pmax = Math.max(pmax, p); });
    const P = s => ({ x: cx + dx * (s - pc), y: cy + dy * (s - pc) });
    const at = u => { const q = pmin + u * (pmax - pmin + soft), a = P(q - soft), b = P(q); return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }; };
    const m = mask(W, H, false), id = 'fxg' + (++UID);
    const g = svg('linearGradient', { id, gradientUnits: 'userSpaceOnUse' });
    g.appendChild(svg('stop', { offset: 0, 'stop-color': '#fff' })); g.appendChild(svg('stop', { offset: 1, 'stop-color': '#000' }));
    m.appendChild(g);
    m.appendChild(svg('rect', { x: -W, y: -H, width: 3 * W, height: 3 * H, fill: 'url(#' + id + ')' }));
    qo(el, m);
    const a0 = at(yop ? 1 : 0), a1 = at(yop ? 0 : 1);
    gsap.set(g, { attr: a0 });
    tl.fromTo(g, { attr: a0 }, { attr: a1, duration: dur, ease, immediateRender: false }, t);
    return { el, mask: m, grad: g, tur: 'grad', W, H };
  };

  // ================= 3. SHAPE LAYER =================
  M.katlam = function (ota, o) {
    o = o || {}; ota = one(ota);
    const [W, H] = olcham(ota, o);
    const s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, preserveAspectRatio: 'none' });
    s.style.cssText = 'position:absolute;left:' + (o.x || 0) + 'px;top:' + (o.y || 0) + 'px;width:' + W + 'px;height:' + H + 'px;overflow:visible;pointer-events:none';
    ota.appendChild(s); s.__W = W; s.__H = H; return s;
  };
  M.shakl = function (sv, o) {
    o = o || {}; const tur = o.tur || 'yol'; let e;
    const W = sv.__W || 1000, H = sv.__H || 1000, cx = num(o.cx, W / 2), cy = num(o.cy, H / 2);
    if (tur === 'rect') e = svg('rect', { x: num(o.x, cx - num(o.w, 200) / 2), y: num(o.y, cy - num(o.h, 200) / 2), width: num(o.w, 200), height: num(o.h, 200), rx: num(o.r, 0) });
    else if (tur === 'aylana') e = svg('circle', { cx, cy, r: num(o.r, 100) });
    else if (tur === 'ellips') e = svg('ellipse', { cx, cy, rx: num(o.rx, 120), ry: num(o.ry, 80) });
    else if (tur === 'chiziq') e = svg('line', { x1: num(o.x1, 0), y1: num(o.y1, 0), x2: num(o.x2, W), y2: num(o.y2, H) });
    else if (tur === 'poligon') e = svg('path', { d: D.poligon(cx, cy, num(o.R, 100), o.n || 6, o.rot0) });
    else if (tur === 'yulduz') e = svg('path', { d: D.yulduz(cx, cy, num(o.R, 100), o.r2, o.n || 5, o.rot0) });
    else if (tur === 'yurak') e = svg('path', { d: D.yurak(cx, cy, num(o.R, 100), o.nn) });
    else e = svg('path', { d: o.d || 'M0,0' });
    e.setAttribute('pathLength', 1000);
    e.style.fill = o.fill || 'none'; e.style.stroke = o.stroke || 'none';
    e.style.strokeWidth = num(o.sw, 6) + 'px'; e.style.strokeLinecap = o.cap || 'butt'; e.style.strokeLinejoin = o.join || 'round';
    if (o.opacity != null) e.style.opacity = o.opacity;
    sv.appendChild(e); return e;
  };
  const dash = (s, e) => { const L = Math.max(0, Math.min(1, e) - s) * 1000; return L + ' ' + (1000 - L + 0.01); };
  // Trim Paths. boshi/oxiri/siljish — 0..1 (siljish: kontur bo'ylab aylantirish; yopiq shaklda chiziq o'raladi)
  M.trim = function (tl, p, t, o) {
    o = o || {}; p = one(p);
    const dan = Object.assign({ boshi: 0, oxiri: 0, siljish: 0 }, o.dan || {}), ga = Object.assign({}, dan, o.ga || {});
    const st = d => ({ strokeDasharray: dash(d.boshi, d.oxiri), strokeDashoffset: -(d.boshi + d.siljish) * 1000 });
    // dashoffset = -(boshi+siljish): chiziq boshi siljish bilan suriladi; len = oxiri - boshi
    const S = st(dan), E = st(ga);
    const d0 = o.dur == null ? 1.2 : o.dur, z0 = dan.oxiri - dan.boshi <= 1e-4, z1 = ga.oxiri - ga.boshi <= 1e-4;
    if (!p.__trim0) { p.__trim0 = 1; gsap.set(p, S); if (z0) gsap.set(p, { strokeOpacity: 0 }); } // birinchi chaqiruvda boshlang'ich holat (t gacha ko'rinmaydi)
    // uzunligi 0 bo'lgan chiziq round cap bilan nuqta bo'lib ko'rinadi -> nol uzunlikda strokeOpacity 0 (tl.set — seek-safe)
    if (z0) tl.set(p, { strokeOpacity: 1 }, t + 0.0005);
    if (z1) tl.set(p, { strokeOpacity: 0 }, t + d0);
    tl.fromTo(p, S, Object.assign({}, E, { duration: d0, ease: o.ease || 'power2.inOut', immediateRender: false }), t);
    return p;
  };
  M.trimBosh = function (p, dan) { dan = Object.assign({ boshi: 0, oxiri: 0, siljish: 0 }, dan || {}); p = one(p); p.__trim0 = 1; gsap.set(p, { strokeDasharray: dash(dan.boshi, dan.oxiri), strokeDashoffset: -(dan.boshi + dan.siljish) * 1000, strokeOpacity: dan.oxiri - dan.boshi <= 1e-4 ? 0 : 1 }); };
  M.rang = function (tl, p, t, o) {
    o = o || {}; p = one(p); const v = {};
    if (o.fill != null) v.fill = o.fill; if (o.stroke != null) v.stroke = o.stroke; if (o.sw != null) v.strokeWidth = o.sw; if (o.opacity != null) v.opacity = o.opacity;
    v.duration = o.dur == null ? 0.8 : o.dur; v.ease = o.ease || 'power1.inOut'; v.immediateRender = false;
    tl.to(p, v, t); return p;
  };
  // Repeater: proto nusxalari (har biri <g>); birinchisi (0) = asl; i-nusxa: i*dx, i*dy, i*rot, s^i, opacity^i
  M.repeater = function (sv, proto, o) {
    o = o || {}; proto = one(proto);
    const n = o.soni || 6, rnd = M.rng(o.urug == null ? 7 : o.urug), tz = o.tasodif || {};
    const W = sv.__W || 1000, H = sv.__H || 1000, mk = o.markaz || [W / 2, H / 2], out = [];
    for (let i = 0; i < n; i++) {
      const g = svg('g'); sv.appendChild(g); g.appendChild(i === 0 ? proto : proto.cloneNode(true)); // proto g0 ga ko'chadi, qolganlari nusxa
      const j = k => (tz[k] ? (rnd() * 2 - 1) * tz[k] : 0);
      const s = Math.pow(o.s == null ? 1 : o.s, i) * (1 + j('s'));
      gsap.set(g, { svgOrigin: mk[0] + ' ' + mk[1], x: (o.dx || 0) * i + j('x'), y: (o.dy || 0) * i + j('y'), rotation: (o.rot || 0) * i + j('rot'), scale: s, opacity: Math.pow(o.opacity == null ? 1 : o.opacity, i) });
      g.__op = Math.pow(o.opacity == null ? 1 : o.opacity, i);
      out.push(g);
    }
    return out;
  };
  M.repeaterKirish = function (tl, arr, t, o) {
    o = o || {}; const har = o.har == null ? 0.08 : o.har, dur = o.dur == null ? 0.6 : o.dur, ease = o.ease || 'back.out(1.6)', tur = o.tur || 'olcham';
    arr.forEach((g, i) => {
      const k = t + i * har;
      if (tur === 'chizilish') {
        g.querySelectorAll('*').forEach(c => { c.style.strokeDasharray = '0 1001'; tl.to(c, { strokeDasharray: '1000 0.01', duration: dur, ease: 'power2.out', immediateRender: false }, k); });
      } else if (tur === 'opacity') { gsap.set(g, { opacity: 0 }); tl.to(g, { opacity: g.__op, duration: dur, ease, immediateRender: false }, k); }
      else { const sc = gsap.getProperty(g, 'scale'); gsap.set(g, { scale: 0, opacity: 0 }); tl.to(g, { scale: sc, opacity: g.__op, duration: dur, ease, immediateRender: false }, k); }
    });
  };

  // ================= 4. YO'L BO'YLAB HARAKAT =================
  M.yol = function (tl, el, yol, t, o) {
    o = o || {}; el = one(el);
    if (!window.MotionPathPlugin) throw new Error('FX.maska.yol: MotionPathPlugin yuklanmagan (maska/vendor/MotionPathPlugin.min.js)');
    let pe = yol, tmp = null;
    if (typeof yol === 'string' && /^\s*[Mm]/.test(yol)) { tmp = svg('path', { d: yol }); defs().appendChild(tmp); pe = tmp; }
    else pe = one(yol);
    const dur = o.dur == null ? 2 : o.dur, ease = o.ease || 'power1.inOut';
    const mp = { path: pe, start: o.boshi == null ? 0 : o.boshi, end: o.oxiri == null ? 1 : o.oxiri, alignOrigin: o.markaz || [0.5, 0.5] };
    if (o.align !== false && !tmp) mp.align = pe;
    if (o.burilish) mp.autoRotate = o.burilish === true ? true : o.burilish;
    tl.to(el, { motionPath: mp, duration: dur, ease, immediateRender: false }, t);
    if (o.iz) { const iz = one(o.iz); gsap.set(iz, { strokeOpacity: 0 }); tl.set(iz, { strokeOpacity: 1 }, t + 0.0005); tl.fromTo(iz, { strokeDasharray: '0 1000.01' }, { strokeDasharray: dash(0, (o.oxiri == null ? 1 : o.oxiri)), duration: dur, ease, immediateRender: false }, t); }
    return el;
  };

  // ================= 5. MORF =================
  M.morf = function (tl, p, nishon, t, o) {
    o = o || {}; p = one(p);
    if (!window.MorphSVGPlugin) throw new Error('FX.maska.morf: MorphSVGPlugin yuklanmagan (maska/vendor/MorphSVGPlugin.min.js)');
    const v = { morphSVG: { shape: nishon, type: o.tur || 'rotational', origin: o.origin || '50% 50%', shapeIndex: o.shapeIndex == null ? 'auto' : o.shapeIndex }, duration: o.dur == null ? 1.2 : o.dur, ease: o.ease || 'power2.inOut', immediateRender: false };
    if (o.rang) { if (o.rang.fill != null) v.fill = o.rang.fill; if (o.rang.stroke != null) v.stroke = o.rang.stroke; }
    tl.to(p, v, t); return p;
  };
  M.morfZanjir = function (tl, p, royxat, t, o) {
    o = o || {}; const dur = o.dur == null ? 1 : o.dur, qol = o.qolish == null ? 0.5 : o.qolish;
    royxat.forEach((n, i) => M.morf(tl, p, typeof n === 'object' && n.d ? n.d : n, t + i * (dur + qol), Object.assign({}, o, { rang: n.rang || null })));
    return t + royxat.length * (dur + qol);
  };
})();
