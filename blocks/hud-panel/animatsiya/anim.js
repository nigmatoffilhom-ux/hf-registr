/* anim.js — FX.anim.* : GSAP animatsiya presetlari (seek-safe, Math.random yo'q, faqat tl ga qo'shadi).
   Ulash (standalone host <head>, gsap'dan keyin):  <script src="animatsiya/anim.js"></script>
   Har funksiya: FX.anim.<nom>(tl, nishon, t, o)  — tl = yagona paused timeline, t = boshlanish (s).
     nishon: element, NodeList/massiv yoki selector. Sub-composition ichidan chaqirsangiz ELEMENT bering
             (runtime faqat sub-comp skriptidagi document.querySelector ni cheklaydi, bu fayldagini emas).
   Umumiy sozlamalar (o): dur (s), ease (GSAP nomi), yon ('past'|'yuqori'|'chap'|'ong'), masofa (px),
     bolish ('harf'|'soz' — matnni bo'lib stagger), har (stagger qadami, s), tartib ('boshi'|'oxiri'|'markaz'|'chetlar'|'tasodif'), urug' (tasodif urug'i).
   Misollar:
     FX.anim.kirish(tl, el, 0.5, { tur: 'blur-in', dur: 0.9 });
     FX.anim.kirish(tl, el, 0.5, { tur: 'slide-up', bolish: 'soz', har: 0.07, tartib: 'markaz' });
     FX.anim.chiqish(tl, el, 4.0, { tur: 'fade' });
     FX.anim.typewriter(tl, el, 1.0, { tezlik: 22, kursor: true });
     FX.anim.maska(tl, el, 1.0, { yon: 'doira' });        FX.anim.maska(tl, el, 1, { tur: 'qator', bolish: 'soz' });
     FX.anim.pulsatsiya(tl, el, 2.0, { kuch: 1.08, takror: 3 });
     FX.anim.sanash(tl, el, 1.0, { dan: 0.01, gacha: 0.65, format: 'M', dur: 2 });   // count-up: 0.01 M -> 0.65 M
   Element transform oladigan bo'lsin (display:block yoki inline-block). */
(function () {
  const FX = (window.FX = window.FX || {});
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const list = s => {
    if (!s) return [];
    if (typeof s === 'string') return Array.from(document.querySelectorAll(s));
    if (s.length !== undefined && !s.nodeType) return Array.from(s);
    return [s];
  };
  const A = {};
  // Uslub (FX.uslub) shu yerni to'ldirishi mumkin: dur va ease bo'sh bo'lsa preset o'z qiymatini oladi.
  A.standart = { dur: null, ease: null, easeChiqish: null, masofa: null };

  // --- Matnni bo'lish: harf/so'z span'lari (idempotent). So'zlar orasidagi probel matn tuguni qoladi -> qator ko'chadi.
  A.bol = function (el, rejim) {
    rejim = rejim || 'harf';
    if (el.__fxBol && el.__fxBol.rejim === rejim) return el.__fxBol.q;
    const matn = el.__fxMatn != null ? el.__fxMatn : el.textContent;
    el.__fxMatn = matn;
    el.textContent = '';
    const q = [];
    matn.split(/(\s+)/).forEach(b => {
      if (!b) return;
      if (/^\s+$/.test(b)) { el.appendChild(document.createTextNode(' ')); return; }
      const soz = document.createElement('span');
      soz.className = 'fx-soz';
      soz.style.cssText = 'display:inline-block;white-space:nowrap';
      if (rejim === 'soz') { soz.textContent = b; q.push(soz); }
      else Array.from(b).forEach(ch => {
        const h = document.createElement('span');
        h.className = 'fx-harf'; h.style.display = 'inline-block'; h.textContent = ch;
        soz.appendChild(h); q.push(h);
      });
      el.appendChild(soz);
    });
    el.__fxBol = { rejim, q };
    return q;
  };

  // --- Stagger: GSAP'ning from:"random" i Math.random ishlatadi, shuning uchun tartibni o'zimiz hisoblaymiz.
  A.kechikish = function (n, har, tartib, urug) {
    const c = (n - 1) / 2;
    let d;
    if (tartib === 'oxiri') d = i => (n - 1 - i);
    else if (tartib === 'markaz') d = i => Math.abs(i - c);
    else if (tartib === 'chetlar') d = i => c - Math.abs(i - c);
    else if (tartib === 'tasodif') {
      const idx = Array.from({ length: n }, (_, i) => i);
      const u = urug || 1;
      idx.sort((a, b) => hash(a * 31.7 + u) - hash(b * 31.7 + u));
      const o = []; idx.forEach((v, k) => { o[v] = k; });
      d = i => o[i];
    } else d = i => i;
    return Array.from({ length: n }, (_, i) => d(i) * har);
  };

  function nishonlar(nishon, o) {
    let q = list(nishon);
    if (o.bolish) q = q.reduce((m, el) => m.concat(A.bol(el, o.bolish)), []);
    return q;
  }
  function staggerFn(q, o) {
    if (q.length < 2) return 0;
    const har = o.har != null ? o.har : (o.bolish === 'harf' ? 0.035 : 0.08);
    const k = A.kechikish(q.length, har, o.tartib, o.urug);
    return i => k[i];
  }
  function siljish(yon, m) {
    if (yon === 'yuqori') return { x: 0, y: -m };
    if (yon === 'chap') return { x: -m, y: 0 };
    if (yon === 'ong') return { x: m, y: 0 };
    return { x: 0, y: m }; // 'past'
  }
  const S = A.standart;

  // Har preset: ko'rinmas holat (yashirin) + ko'rinadigan holat (ochiq) + odatiy ease/dur.
  function holat(tur, o, chiqishmi) {
    const m = o.masofa != null ? o.masofa : (S.masofa != null ? S.masofa : 60);
    switch (tur) {
      case 'fade':
        return { yash: { opacity: 0 }, och: { opacity: 1 }, ease: 'power1.out', easeC: 'power1.in', dur: 0.6 };
      case 'slide-up': case 'slide': {
        const yon = o.yon || (tur === 'slide-up' ? (chiqishmi ? 'yuqori' : 'past') : (chiqishmi ? 'yuqori' : 'past'));
        const d = siljish(yon, m);
        return { yash: { opacity: 0, x: d.x, y: d.y }, och: { opacity: 1, x: 0, y: 0 }, ease: 'power3.out', easeC: 'power3.in', dur: 0.7 };
      }
      case 'scale-pop': {
        const s0 = o.boshScale != null ? o.boshScale : 0.3;
        return { yash: { opacity: 0, scale: s0 }, och: { opacity: 1, scale: 1 }, ease: 'back.out(2.2)', easeC: 'back.in(2)', dur: 0.55 };
      }
      case 'blur-in': case 'blur': {
        const b = o.blur != null ? o.blur : 18;
        return { yash: { opacity: 0, filter: 'blur(' + b + 'px)', scale: o.boshScale != null ? o.boshScale : 1.08 },
                 och: { opacity: 1, filter: 'blur(0px)', scale: 1 }, ease: 'power2.out', easeC: 'power2.in', dur: 0.9 };
      }
      case 'rotate-in': case 'rotate': {
        const os = o.os || 'z', s = o.yon === 'ong' ? -1 : 1;
        if (os === 'x') return { yash: { opacity: 0, rotationX: -95, transformPerspective: 900, transformOrigin: '50% 100%' },
                                 och: { opacity: 1, rotationX: 0, transformPerspective: 900, transformOrigin: '50% 100%' }, ease: 'power3.out', easeC: 'power3.in', dur: 0.7 };
        if (os === 'y') return { yash: { opacity: 0, rotationY: 90 * s, transformPerspective: 900, transformOrigin: '50% 50%' },
                                 och: { opacity: 1, rotationY: 0, transformPerspective: 900, transformOrigin: '50% 50%' }, ease: 'power3.out', easeC: 'power3.in', dur: 0.7 };
        return { yash: { opacity: 0, rotation: -18 * s, y: m * 0.6, transformOrigin: '0% 100%' },
                 och: { opacity: 1, rotation: 0, y: 0, transformOrigin: '0% 100%' }, ease: 'back.out(1.6)', easeC: 'back.in(1.4)', dur: 0.7 };
      }
    }
    throw new Error('FX.anim: noma\'lum tur "' + tur + '"');
  }

  // KIRISH: fade | slide-up | slide (yon) | scale-pop | blur-in | rotate-in (os: z|x|y)
  A.kirish = function (tl, nishon, t, o) {
    o = o || {};
    const q = nishonlar(nishon, o), h = holat(o.tur || 'fade', o, false);
    if (!q.length) return tl;
    tl.fromTo(q, Object.assign({}, h.yash), Object.assign({}, h.och, {
      duration: o.dur || S.dur || h.dur, ease: o.ease || S.ease || h.ease, stagger: staggerFn(q, o)
    }), t);
    return tl;
  };

  // CHIQISH: o'sha turlar teskari (slide uchun yon = qayoqqa ketadi, odatiy 'yuqori')
  A.chiqish = function (tl, nishon, t, o) {
    o = o || {};
    const q = nishonlar(nishon, o), h = holat(o.tur || 'fade', o, true);
    if (!q.length) return tl;
    tl.fromTo(q, Object.assign({}, h.och), Object.assign({}, h.yash, {
      duration: o.dur || S.dur || h.dur, ease: o.ease || S.easeChiqish || h.easeC, stagger: staggerFn(q, o), immediateRender: false
    }), t);
    return tl;
  };

  // Qisqa nomlar
  ['fade', 'slide-up', 'scale-pop', 'blur-in', 'rotate-in'].forEach(tur => {
    const nom = tur.replace(/-(\w)/g, (_, c) => c.toUpperCase()); // slideUp, scalePop, blurIn, rotateIn
    A[nom] = (tl, n, t, o) => A.kirish(tl, n, t, Object.assign({}, o, { tur }));
    A[nom + 'Chiqish'] = (tl, n, t, o) => A.chiqish(tl, n, t, Object.assign({}, o, { tur }));
  });

  // STAGGER: kirish, lekin bo'lish va qadam majburiy (odatiy: so'zma-so'z, 'boshi')
  A.stagger = function (tl, nishon, t, o) {
    o = Object.assign({ tur: 'slide-up', har: 0.08 }, o);
    if (!o.bolish && list(nishon).length < 2) o.bolish = 'soz';
    return A.kirish(tl, nishon, t, o);
  };

  // PULSATSIYA: tur 'scale' | 'glow' | 'opacity'; takror = necha marta urish (cheklangan, repeat:-1 yo'q)
  A.pulsatsiya = function (tl, nishon, t, o) {
    o = o || {};
    const q = list(nishon), dur = o.dur || 0.7, n = Math.max(1, o.takror || 3), tur = o.tur || 'scale';
    let a, b;
    if (tur === 'glow') {
      const r = o.rang || '#ffd166';
      a = { filter: 'drop-shadow(0 0 0px ' + r + ')' }; b = { filter: 'drop-shadow(0 0 ' + (o.kuch || 28) + 'px ' + r + ')' };
    } else if (tur === 'opacity') { a = { opacity: 1 }; b = { opacity: o.kuch != null ? o.kuch : 0.35 }; }
    else { a = { scale: 1 }; b = { scale: o.kuch || 1.08 }; }
    tl.fromTo(q, a, Object.assign({}, b, { duration: dur / 2, ease: o.ease || 'sine.inOut', yoyo: true, repeat: n * 2 - 1, immediateRender: false }), t);
    return tl;
  };

  // TYPEWRITER: belgilar ketma-ket paydo bo'ladi (display toggle -> kursor oxirgi belgining yonida yuradi)
  //   o.tezlik = belgi/soniya (odatiy 20) yoki o.dur = jami vaqt; o.kursor (true), o.kursorTakror (miltillash soni, 4), o.kursorYashir (true)
  A.typewriter = function (tl, nishon, t, o) {
    o = o || {};
    list(nishon).forEach(el => {
      if (!el.__fxTw) {
        const matn = el.__fxMatn != null ? el.__fxMatn : el.textContent;
        el.__fxMatn = matn; el.textContent = '';
        const q = Array.from(matn).map(ch => {
          const s = document.createElement('span'); s.className = 'fx-tw'; s.textContent = ch; s.style.display = 'none';
          el.appendChild(s); return s;
        });
        let k = null;
        if (o.kursor !== false) {
          k = document.createElement('span'); k.className = 'fx-kursor';
          k.style.cssText = 'display:inline-block;width:.07em;height:.92em;margin-left:.06em;vertical-align:-.08em;background:' + (o.kursorRang || 'currentColor') + ';opacity:0';
          el.appendChild(k);
        }
        el.__fxTw = { q, k };
      }
      const { q, k } = el.__fxTw, n = q.length;
      const qadam = o.dur ? o.dur / Math.max(1, n) : 1 / (o.tezlik || 20);
      if (k) tl.set(k, { opacity: 1 }, t);
      q.forEach((s, i) => {
        // har belgiga ozgina notekislik (hash, qadamning 0–35%) — "qo'lda yozilgan" ritm, lekin deterministik va monoton
        tl.set(s, { display: 'inline' }, t + i * qadam + (hash(i + 3) * 0.35 * qadam));
      });
      if (k) {
        const t1 = t + n * qadam + 0.35 * qadam, m = o.kursorTakror != null ? o.kursorTakror : 4;
        for (let j = 0; j < m; j++) { tl.set(k, { opacity: 0 }, t1 + j * 0.5 + 0.25); tl.set(k, { opacity: 1 }, t1 + j * 0.5 + 0.5); }
        if (o.kursorYashir !== false) tl.set(k, { opacity: 0 }, t1 + m * 0.5 + 0.1);
      }
    });
    return tl;
  };

  // MASKA OCHILISH
  //   tur 'clip' (odatiy): clip-path, yon 'chap' (chapdan o'ngga) | 'ong' | 'yuqori' | 'past' | 'markaz' | 'doira'
  //   tur 'qator': matn ko'rinmas ramka ichidan ko'tariladi (bolish:'soz' -> har so'z o'z ramkasidan)
  //   o.chiqish = true -> teskari (yopilish)
  const CLIP = {
    chap: 'inset(0% 100% 0% 0%)', ong: 'inset(0% 0% 0% 100%)', yuqori: 'inset(0% 0% 100% 0%)',
    past: 'inset(100% 0% 0% 0%)', markaz: 'inset(0% 50% 0% 50%)'
  };
  A.maska = function (tl, nishon, t, o) {
    o = o || {};
    const dur = o.dur || S.dur || 0.9, ch = !!o.chiqish;
    if ((o.tur || 'clip') === 'qator') {
      let q = [];
      list(nishon).forEach(el => {
        if (!el.__fxMaska) {
          const birlik = o.bolish === 'soz' ? A.bol(el, 'soz') : [el];
          const ichi = [];
          birlik.forEach(b => {
            const r = document.createElement('span'), i = document.createElement('span');
            r.className = 'fx-maska';
            r.style.cssText = 'display:' + (b === el ? 'block' : 'inline-block') + ';overflow:hidden;padding:.12em 0 .14em;margin:-.12em 0 -.14em;vertical-align:top';
            i.className = 'fx-maska-ichi'; i.style.display = 'block';
            while (b.firstChild) i.appendChild(b.firstChild);
            r.appendChild(i); b.appendChild(r); ichi.push(i);
          });
          el.__fxMaska = ichi;
        }
        q = q.concat(el.__fxMaska);
      });
      // kirish odatda pastdan ko'tariladi, chiqish yuqoriga ketadi (yon bilan teskarilash mumkin)
      const yuqoriga = ch ? o.yon !== 'past' : o.yon === 'yuqori';
      const yash = { yPercent: yuqoriga ? -115 : 115 }, och = { yPercent: 0 };
      const sf = staggerFn(q, Object.assign({ har: 0.07 }, o, { bolish: o.bolish || 'soz' }));
      if (ch) tl.fromTo(q, och, Object.assign({}, yash, { duration: dur, ease: o.ease || S.easeChiqish || 'power3.in', stagger: sf, immediateRender: false }), t);
      else tl.fromTo(q, yash, Object.assign({}, och, { duration: dur, ease: o.ease || S.ease || 'power4.out', stagger: sf }), t);
      return tl;
    }
    const q = list(nishon), yon = o.yon || 'chap';
    const yash = { clipPath: yon === 'doira' ? 'circle(0% at ' + (o.markaz || '50% 50%') + ')' : CLIP[yon] };
    const och = { clipPath: yon === 'doira' ? 'circle(75% at ' + (o.markaz || '50% 50%') + ')' : 'inset(0% 0% 0% 0%)' };
    const sf = staggerFn(q, o);
    if (ch) tl.fromTo(q, och, Object.assign({}, yash, { duration: dur, ease: o.ease || S.easeChiqish || 'power3.inOut', stagger: sf, immediateRender: false }), t);
    else tl.fromTo(q, yash, Object.assign({}, och, { duration: dur, ease: o.ease || 'power3.inOut', stagger: sf }), t);
    return tl;
  };


  // SANASH (count-up): son vaqt funksiyasi sifatida dan -> gacha o'sadi (GSAP proxy tween + onUpdate; seek-safe, deterministik).
  //   FX.anim.sanash(tl, el, t, { dan, gacha, dur, ease, format, kasr, birlik, oldin, ajr, vergul })
  //   format preset: 'M' (2 kasr, " M")  '%' (1 kasr)  'deg' yoki '°' (0 kasr, °)  'int' (butun, minglar ajratgichi)  'oddiy' (odatiy)
  //   kasr   — kasr xonalari (yo'q bo'lsa dan/gacha dagi eng ko'p xonadan; preset o'zi beradi)
  //   birlik — son ortidan matn (harf bilan boshlansa oldidan ingichka probel qo'yiladi), oldin — son oldidan matn
  //   ajr    — minglar ajratgichi ('' = yo'q; format 'int' da ingichka probel), vergul — kasr belgisi (odatiy '.')
  //   Qaytaradi: { el, yoz(v) }  — boshlang'ich qiymat darhol yoziladi.
  A.formatla = function (v, o) {
    o = o || {};
    const P = { 'M': { kasr: 2, birlik: 'M' }, '%': { kasr: 1, birlik: '%' }, 'deg': { kasr: 0, birlik: '°' }, '°': { kasr: 0, birlik: '°' },
                'int': { kasr: 0, ajr: ' ' } }[o.format] || {};
    const kasr = o.kasr != null ? o.kasr : (P.kasr != null ? P.kasr : 0);
    let birlik = o.birlik != null ? o.birlik : (P.birlik || '');
    if (/^[A-Za-zµ]/.test(birlik)) birlik = ' ' + birlik;
    const ajr = o.ajr != null ? o.ajr : (P.ajr || '');
    const neg = v < 0; v = Math.abs(v);
    let [b, q] = v.toFixed(kasr).split('.');
    if (ajr) b = b.replace(/\B(?=(\d{3})+(?!\d))/g, ajr);
    return (o.oldin || '') + (neg ? '−' : '') + b + (q ? (o.vergul || '.') + q : '') + birlik;
  };
  A.sanash = function (tl, nishon, t, o) {
    o = o || {};
    const el = list(nishon)[0];
    if (!el) return null;
    const dan = o.dan != null ? o.dan : 0, gacha = o.gacha != null ? o.gacha : 100;
    if (o.kasr == null && !o.format) {
      const kx = x => ((String(x).split('.')[1]) || '').length;
      o = Object.assign({}, o, { kasr: Math.max(kx(dan), kx(gacha)) });
    }
    const yoz = v => { el.textContent = A.formatla(v, o); };
    const st = { v: dan };
    el.style.fontVariantNumeric = 'tabular-nums';
    yoz(dan);
    tl.fromTo(st, { v: dan }, { v: gacha, duration: o.dur || S.dur || 1.5, ease: o.ease || 'power2.out', immediateRender: false,
      onUpdate: () => yoz(st.v) }, t);
    tl.call(() => yoz(gacha), null, t + (o.dur || S.dur || 1.5) + 0.0001); // oxirgi qiymat aniq
    return { el, yoz };
  };

  FX.anim = A;
})();
