/* formula.js — FX.formula: KaTeX (lokal, vendor/katex.min.js 0.16.11) formulani chizadi va QISM-MA-QISM paydo qiladi.
   Talab: formula/vendor/katex.min.js + katex.min.css (+ vendor/fonts/*.woff2) va formula/formula.css. Internet kerak emas.
   Qismlar belgisi: TeX ichida  [[ ... ]]  — har bir shunday bo'lak alohida paydo bo'ladi (KaTeX \htmlClass{fq fqN}).
       "[[E]] = [[m]] [[c^2]]"   ->  3 qism.  Belgisiz formula — bitta qism (butun).
   API:
     FX.formula.yasa(el, tex, {displayMode:true})  -> { qismlar:[element,...], tex }   (xato bo'lsa qizil TeX matni va konsolga ogohlantirish)
     FX.formula.jonlantir(tl, f, t, {kirish:'qism'|'maska'|'fade', dur:0.55, har:0.22, blur:8})
   Seek-safe: faqat tl ga tween qo'shadi; tasodif yo'q. */
(function () {
  const FX = (window.FX = window.FX || {});
  const F = (FX.formula = {});
  // [[...]] -> \htmlClass{fq fqN}{...}  (ichma-ich qavslar ham sanaladi, indeks ochilish tartibida)
  F.belgila = function (tex) {
    let out = '', i = 0, n = 0; const st = [];
    while (i < tex.length) {
      if (tex.startsWith('[[', i)) { st.push(n); out += '\\htmlClass{fq fq' + n + '}{'; n++; i += 2; }
      else if (st.length && tex.startsWith(']]', i)) { st.pop(); out += '}'; i += 2; }
      else { out += tex[i++]; }
    }
    return { tex: out, n };
  };
  F.yasa = function (el, tex, o) {
    o = o || {};
    const b = F.belgila(String(tex || ''));
    el.classList.add('fx-formula');
    try {
      if (!window.katex) throw new Error('katex yuklanmagan (formula/vendor/katex.min.js)');
      window.katex.render(b.tex, el, { throwOnError: false, displayMode: o.displayMode !== false, trust: true, strict: 'ignore', output: 'html' });
    } catch (e) {
      el.textContent = String(tex); el.style.color = '#ff6b6b';
      if (window.console) console.warn('FX.formula:', e.message);
    }
    let q = [];
    for (let k = 0; k < b.n; k++) { const e = el.querySelector('.fq' + k); if (e) q.push(e); }
    // ichma-ich qismlarni chiqarib tashlaymiz (ota o'zi bilan olib keladi)
    q = q.filter(e => !q.some(o2 => o2 !== e && o2.contains(e)));
    if (!q.length) { const k = el.querySelector('.katex') || el; q = [k]; }
    return { qismlar: q, tex: b.tex, kok: el.querySelector('.katex') };
  };
  F.jonlantir = function (tl, f, t, o) {
    o = o || {};
    const kirish = o.kirish || 'qism', dur = o.dur || 0.55, har = o.har != null ? o.har : 0.22, q = f.qismlar;
    // qismlarga kirmagan "skelet" (=, kasr chizig'i, qavs) belgilangan qismlardan OLDIN ko'rinmasin: butun .katex avval yengil paydo bo'ladi
    const kok = f.kok;
    if (kok && q.indexOf(kok) < 0) { tl.fromTo(kok, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'power1.out' }, t); t += 0.12; }
    if (kirish === 'maska') {
      q.forEach((e, i) => tl.fromTo(e, { clipPath: 'inset(-10% 100% -10% 0)', opacity: 1 }, { clipPath: 'inset(-10% -2% -10% 0)', duration: dur, ease: 'power3.inOut', immediateRender: true }, t + i * har));
      return;
    }
    if (kirish === 'fade') { tl.fromTo(q, { opacity: 0 }, { opacity: 1, duration: dur, ease: 'power1.out', stagger: har }, t); return; }
    q.forEach((e, i) => {
      tl.fromTo(e, { opacity: 0, y: 14, filter: 'blur(' + (o.blur != null ? o.blur : 8) + 'px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: dur, ease: 'power3.out' }, t + i * har);
      tl.set(e, { filter: 'none' }, t + i * har + dur + 0.001); // blur(0px) qatlam yaratmasin
    });
  };
})();
