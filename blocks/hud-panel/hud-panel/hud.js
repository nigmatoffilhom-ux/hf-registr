/* hud.js — FX.hud: monoshrift HUD panel (burchak belgilari, key = value qatorlari, qiymat count-up).
   Talab: animatsiya/anim.js (FX.anim.sanash) + hud-panel/hud.css. Seek-safe, Math.random yo'q.
   Qatorlar (satrlar) formati — massiv yoki satr:
     massiv:  [{k:"R", dan:7.73, gacha:2.35, birlik:"M", kasr:2}, ...]   yoki   [["R",7.73,2.35,"M",2], ...]
     satr:    "R|7.73>2.35|M|2 ; d|0.5>10|m ; theta|0>360|°|0 ; n|0.01>0.65|M"       (qator: nom | dan>gacha | birlik | kasr)
              sonsiz qiymat (matn):  "holat|AKTIV"   — sanalmaydi
     kasr berilmasa dan/gacha dagi eng ko'p xonadan olinadi. birlik harf bilan boshlansa oldidan ingichka probel qo'yiladi.
   API:
     FX.hud.satrlar(v)                       -> normallashgan qatorlar
     FX.hud.panel(ota, {sarlavha, oxir, satrlar, kursor}) -> { el, rows:[{k,v,r}], kursor }
     FX.hud.jonlantir(tl, panel, t, {dur, har, ease, davom})  — count-up'larni va (bo'lsa) kursor miltillashini tl ga qo'shadi */
(function () {
  const FX = (window.FX = window.FX || {});
  const H = (FX.hud = {});
  const num = x => { const n = parseFloat(String(x).replace(',', '.')); return isNaN(n) ? null : n; };
  const kx = x => ((String(x).split('.')[1]) || '').length;
  const norm = r => {
    let o;
    if (Array.isArray(r)) o = { k: r[0], dan: r[1], gacha: r[2], birlik: r[3], kasr: r[4] };
    else o = Object.assign({}, r);
    o.dan = num(o.dan); o.gacha = num(o.gacha);
    if (o.gacha == null && o.dan != null) o.gacha = o.dan;
    if (o.kasr == null && o.dan != null) o.kasr = Math.max(kx(r.dan != null ? (r.dan) : (r[1])), kx(r.gacha != null ? r.gacha : r[2]));
    return o;
  };
  H.satrlar = function (v) {
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t[0] === '[') { try { v = JSON.parse(t); } catch (e) {} }
    }
    if (Array.isArray(v)) return v.map(norm);
    return String(v).split(/;|\n/).map(s => s.trim()).filter(Boolean).map(s => {
      const p = s.split('|').map(x => x.trim());
      const k = p[0], dg = p[1] || '';
      if (dg.indexOf('>') < 0 && num(dg) == null) return { k, matn: dg };
      const [d, g] = dg.indexOf('>') >= 0 ? dg.split('>') : [dg, dg];
      return { k, dan: num(d), gacha: num(g), birlik: p[2] || '', kasr: p[3] != null && p[3] !== '' ? parseInt(p[3], 10) : Math.max(kx(d), kx(g)) };
    });
  };
  H.panel = function (ota, o) {
    o = o || {};
    const el = document.createElement('div'); el.className = 'hud-p';
    ['a', 'b', 'c', 'd'].forEach(c => { const i = document.createElement('i'); i.className = c; el.appendChild(i); });
    const s = document.createElement('div'); s.className = 'hud-s';
    const s1 = document.createElement('span'); s1.textContent = o.sarlavha || '';
    const s2 = document.createElement('span'); s2.textContent = o.oxir || '';
    s.appendChild(s1); s.appendChild(s2); el.appendChild(s);
    const rows = H.satrlar(o.satrlar).map(r => {
      const d = document.createElement('div'); d.className = 'hud-r';
      const k = document.createElement('span'); k.className = 'hud-k'; k.textContent = r.k;
      const v = document.createElement('span'); v.className = 'hud-v';
      d.appendChild(k); d.appendChild(v); el.appendChild(d);
      if (r.matn != null) v.textContent = r.matn;
      else v.textContent = FX.anim.formatla(r.dan, r);
      return { k, v, r };
    });
    let kursor = null;
    if (o.kursor !== false && rows.length) { kursor = document.createElement('span'); kursor.className = 'hud-c'; rows[rows.length - 1].v.appendChild(kursor); }
    if (ota) ota.appendChild(el);
    return { el, rows, kursor, sarlavha: s1, oxir: s2 };
  };
  // count-up'larni qo'shadi. t — boshlanish, dur — har qator uchun uzunlik, har — qatorlar orasidagi kechikish.
  // Kursor: davom (s) davomida har 0.5 s da yonib-o'chadi (chekli, deterministik).
  H.jonlantir = function (tl, p, t, o) {
    o = o || {};
    const dur = o.dur || 1.8, har = o.har != null ? o.har : 0.12;
    p.rows.forEach((x, i) => {
      if (x.r.matn != null) return;
      const O = Object.assign({}, x.r, { dur, ease: o.ease || 'power2.out' });
      FX.anim.sanash(tl, x.v, t + i * har, O);
      // sanash textContent ni qayta yozadi -> kursorni qayta qo'shish uchun kursor sanagich elementidan tashqarida bo'lishi kerak
    });
    if (p.kursor) {
      // kursor qiymat ichida emas, panel oxirida alohida: sanash textContent'ini ezmasligi uchun joyini o'zgartiramiz
      const last = p.rows[p.rows.length - 1];
      last.k.appendChild(p.kursor);   // oxirgi qatorning nomi yonida (qiymat matni sanash bilan qayta yoziladi)
      const davom = o.davom != null ? o.davom : dur + 1;
      for (let j = 0; j * 0.5 < davom; j++) tl.set(p.kursor, { opacity: j % 2 === 0 ? 1 : 0 }, t + j * 0.5);
      tl.set(p.kursor, { opacity: 0 }, t + davom);
    }
  };
})();
