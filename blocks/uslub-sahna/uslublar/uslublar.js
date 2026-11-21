/* uslublar.js — FX.uslub.* : uslub tokenlarini CSS'dan o'qiydi va namuna sahnani shu uslub ritmida jonlantiradi.
   Talab: gsap + animatsiya/anim.js (FX.anim) + uslublar/uslublar.css oldin ulangan bo'lsin.
   Ulash (host <head>):  <script src="uslublar/uslublar.js"></script>
   API:
     FX.uslub.tokenlar(el)            -> { ease, easeChiqish, dur, har }  (el yoki ota-onasida class="uslub-*" bo'lsin)
     FX.uslub.qolla(el)               -> tokenlarni FX.anim.standart ga yozadi (butun sahifa bitta uslubda bo'lsa qulay)
     FX.uslub.sahna(tl, ildiz, t, o)  -> .u-* qismlarni uslubga xos xoreografiya bilan jonlantiradi; o.chiqish (s, ildiz vaqtida), o.dur (sahna uzunligi)
     FX.uslub.grain(tl, el, t, dur, fps) -> plyonka doni: fon bo'lagi har 1/fps s da hash bilan siljiydi (seek-safe) */
(function () {
  const FX = (window.FX = window.FX || {});
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const ZAXIRA = {
    apple: { ease: 'power3.out', easeChiqish: 'power2.in', dur: 1.1, har: 0.07 },
    kinetik: { ease: 'back.out(2.6)', easeChiqish: 'expo.in', dur: 0.45, har: 0.03 },
    minimal: { ease: 'power2.out', easeChiqish: 'power1.in', dur: 0.8, har: 0.06 },
    kino: { ease: 'sine.inOut', easeChiqish: 'sine.in', dur: 1.8, har: 0.16 }
  };
  const U = {};
  U.royxat = Object.keys(ZAXIRA);

  U.nomi = function (el) {
    for (let e = el; e && e.classList; e = e.parentElement) {
      const c = Array.from(e.classList).find(k => k.indexOf('uslub-') === 0);
      if (c) return c.slice(6);
    }
    return 'apple';
  };
  U.tokenlar = function (el) {
    const nom = U.nomi(el), z = ZAXIRA[nom] || ZAXIRA.apple;
    let cs = null;
    try { cs = getComputedStyle(el); } catch (e) { /* bo'sh */ }
    const ol = (k, d) => { const v = cs && cs.getPropertyValue(k).trim(); return v ? v : d; };
    return {
      nom,
      ease: ol('--u-ease', z.ease), easeChiqish: ol('--u-ease-chiqish', z.easeChiqish),
      dur: parseFloat(ol('--u-dur', z.dur)) || z.dur, har: parseFloat(ol('--u-har', z.har)) || z.har
    };
  };
  U.qolla = function (el) {
    const k = U.tokenlar(el), S = FX.anim.standart;
    S.dur = k.dur; S.ease = k.ease; S.easeChiqish = k.easeChiqish;
    return k;
  };

  U.grain = function (tl, el, t, dur, fps) {
    fps = fps || 12;
    const n = Math.ceil(dur * fps);
    for (let i = 0; i <= n; i++) {
      tl.set(el, { x: Math.round((hash(i * 3.1) - 0.5) * 320), y: Math.round((hash(i * 7.7 + 1) - 0.5) * 320) }, t + i / fps);
    }
  };

  U.sahna = function (tl, ildiz, t, o) {
    o = o || {};
    const A = FX.anim, k = U.tokenlar(ildiz.querySelector('.u-sahna') || ildiz);
    const q = s => ildiz.querySelector(s);
    const P = {
      sahna: q('.u-sahna'), rasm: q('.u-rasm'), ustki: q('.u-ustki'), ustkiM: q('.u-ustki-matn'), sarl: q('.u-sarlavha'), matn: q('.u-matn'),
      lt: q('.u-lt'), ltCh: q('.u-lt-chiziq'), ltPanel: q('.u-lt-panel'), ism: q('.u-lt-ism'), lav: q('.u-lt-lav'),
      nur: q('.u-nur'), blok: q('.u-blok'), chiziq: q('.u-chiziq'), qutib: ildiz.querySelectorAll('.u-qutib'), grain: q('.u-grain'), qora: q('.u-qora')
    };
    const E = k.ease, EC = k.easeChiqish, D = k.dur, H = k.har, ch = Number(o.chiqish) || 0, sDur = Number(o.dur) || 5;
    const bor = el => el && el.textContent.trim();

    if (k.nom === 'apple') {
      tl.fromTo(P.nur, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 2.4, ease: 'sine.out' }, t);
      if (bor(P.ustki)) A.kirish(tl, P.ustki, t + 0.15, { tur: 'slide', masofa: 18, dur: D * 0.8, ease: E });
      A.kirish(tl, P.sarl, t + 0.3, { tur: 'blur-in', blur: 10, boshScale: 1, bolish: 'soz', har: H, dur: D, ease: E });
      A.kirish(tl, P.sarl, t + 0.3, { tur: 'slide', masofa: 26, bolish: 'soz', har: H, dur: D, ease: E });
      if (bor(P.matn)) A.kirish(tl, P.matn, t + 0.8, { tur: 'slide', masofa: 16, dur: D, ease: E });
      if (bor(P.ism)) {
        A.kirish(tl, P.lt, t + 1.3, { tur: 'slide', yon: 'chap', masofa: 30, dur: D * 0.8, ease: E });
        A.kirish(tl, [P.ism, P.lav], t + 1.45, { tur: 'fade', har: 0.1, dur: 0.6 });
      }
      if (ch) A.chiqish(tl, [P.ustki, P.sarl, P.matn, P.lt], t + ch, { tur: 'slide', yon: 'yuqori', masofa: 14, har: 0.06, dur: 0.55, ease: EC });
    } else if (k.nom === 'kinetik') {
      if (bor(P.ustkiM)) {
        tl.fromTo(P.blok, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'expo.out' }, t + 0.05);
        A.kirish(tl, P.ustkiM, t + 0.18, { tur: 'slide', yon: 'chap', masofa: 40, dur: 0.3, ease: 'expo.out' });
      }
      A.kirish(tl, P.sarl, t + 0.25, { tur: 'scale-pop', boshScale: 0, bolish: 'harf', har: H, dur: D, ease: E });
      A.pulsatsiya(tl, P.sarl, t + 0.25 + D + H * 12, { kuch: 1.04, takror: 1, dur: 0.24, ease: 'power2.out' });
      if (bor(P.matn)) A.kirish(tl, P.matn, t + 0.75, { tur: 'slide', yon: 'chap', masofa: 120, dur: 0.4, ease: 'expo.out' });
      if (bor(P.ism)) {
        A.maska(tl, P.lt, t + 1.0, { yon: 'chap', dur: 0.35, ease: 'expo.out' });
        tl.fromTo(P.ltCh, { scaleY: 0 }, { scaleY: 1, duration: 0.25, ease: 'expo.out' }, t + 1.0);
        A.kirish(tl, [P.ism, P.lav], t + 1.12, { tur: 'slide', yon: 'past', masofa: 30, har: 0.06, dur: 0.35, ease: 'back.out(2)' });
      }
      if (ch) {
        A.chiqish(tl, P.sarl, t + ch, { tur: 'slide', yon: 'chap', masofa: 260, bolish: 'harf', har: 0.012, dur: 0.28, ease: EC });
        A.chiqish(tl, [P.ustki, P.matn], t + ch, { tur: 'slide', yon: 'chap', masofa: 200, har: 0.04, dur: 0.28, ease: EC });
        A.maska(tl, P.lt, t + ch + 0.05, { yon: 'ong', chiqish: true, dur: 0.28, ease: EC });
      }
    } else if (k.nom === 'minimal') {
      if (bor(P.ustki)) A.kirish(tl, P.ustki, t + 0.2, { tur: 'fade', dur: D });
      A.maska(tl, P.sarl, t + 0.35, { tur: 'qator', dur: D * 1.2, ease: 'power3.out' });
      tl.fromTo(P.chiziq, { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'power2.inOut' }, t + 0.7);
      if (bor(P.matn)) A.kirish(tl, P.matn, t + 1.0, { tur: 'fade', dur: D });
      if (bor(P.ism)) {
        A.maska(tl, P.lt, t + 1.4, { yon: 'chap', dur: 0.9, ease: 'power2.inOut' });
        A.kirish(tl, [P.ism, P.lav], t + 1.7, { tur: 'fade', har: 0.12, dur: 0.6 });
      }
      if (ch) {
        A.chiqish(tl, [P.ustki, P.sarl, P.matn, P.lt], t + ch, { tur: 'fade', har: 0.04, dur: 0.5, ease: EC });
        tl.to(P.chiziq, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.5, ease: EC, immediateRender: false }, t + ch);
      }
    } else { // kino
      tl.fromTo(P.qutib[0], { yPercent: -100 }, { yPercent: 0, duration: 1.6, ease: 'power2.inOut' }, t);
      tl.fromTo(P.qutib[1], { yPercent: 100 }, { yPercent: 0, duration: 1.6, ease: 'power2.inOut' }, t);
      if (P.rasm && P.rasm.getAttribute('src')) tl.fromTo(P.rasm, { scale: 1.12 }, { scale: 1.0, duration: sDur, ease: 'none' }, t);
      U.grain(tl, P.grain, t, sDur);
      if (bor(P.ustki)) A.kirish(tl, P.ustki, t + 0.5, { tur: 'fade', dur: D });
      A.kirish(tl, P.sarl, t + 0.8, { tur: 'blur-in', blur: 14, boshScale: 1.04, dur: D * 1.3, ease: E });
      tl.fromTo(P.sarl, { letterSpacing: '0.5em' }, { letterSpacing: '0.28em', duration: D * 2, ease: 'power2.out' }, t + 0.8);
      if (bor(P.matn)) A.kirish(tl, P.matn, t + 1.7, { tur: 'fade', dur: D });
      if (bor(P.ism)) A.kirish(tl, [P.ism, P.lav], t + 2.2, { tur: 'fade', har: 0.3, dur: D * 0.8 });
      if (ch) tl.fromTo(P.qora, { opacity: 0 }, { opacity: 1, duration: 0.9, ease: EC, immediateRender: false }, t + ch);
    }
    return k;
  };

  FX.uslub = U;
})();
