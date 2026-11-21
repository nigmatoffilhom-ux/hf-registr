/* fxs.js — HyperFrames uchun WebGL "adjustment layer" dvigateli (2026-11-20, HF 0.9.72).
 *
 * Manba (texture) turlari:
 *   - DOM sahna: <canvas layoutsubtree content="drawable"><div drawable>...sahna...</div></canvas>
 *     (HTML-in-Canvas, drawElementImage — HyperFrames renderi Chrome'da bayroqni o'zi yoqadi)
 *   - <img>, <video> (renderda HF videoni <img class="__render_frame__"> bilan almashtiradi — o'sha o'qiladi)
 *   - oddiy <canvas> (three.js: preserveDrawingBuffer:true), yoki fayl yo'li "assets/x.jpg" (loyiha ildiziga nisbatan)
 *
 * Effektlar (tartib — AE effekt stekiga o'xshash):
 *   buzish (turbulent displacement) → blur (gaussian) → yblur (yo'nalishli) → glow/bloom → rang (levels/curves/sat)
 *   → LUT (.cube, 3D tekstura) → aberratsiya, rgb split, vinyetka, don (film grain)
 *
 * API:
 *   const L = FX.shader({ manba, chiqish, p: {glow:0.8, ...}, kalitlar: [...], tl })
 *   L.p — oddiy obyekt: tl.to(L.p, {glow: 1.5, duration: 1}, 2) bilan vaqt bo'yicha animatsiya.
 *   FX.shaderKalitlar(tl, L.p, kalitlar) — [{t:0, glow:0}, {t:1.5, glow:1.2, ease:"power2.out"}] → tween'lar.
 *   FX.cubeOqi(matn) → {n, data:Float32Array} (.cube parser).
 *
 * Determinizm: Math.random yo'q; don va shovqin = hash(piksel, kadr raqami, seed); kadr raqami = round(t*fps),
 * t = shu kompozitsiya timeline vaqti. Har kadr faqat vaqtning funksiyasi.
 */
(function () {
  var G = globalThis;
  G.FX = G.FX || {};
  if (G.FX.shader && G.FX.shader.__fxs) return;

  // ---------- umumiy holat va HyperFrames kadr hook'lari (filmed-screen komponentidagi tartib) ----------
  var S = G.__fxsHolat || (G.__fxsHolat = { layers: [], seq: 0, resolvedSeq: -1, lastSeekT: 0, hooked: {} });
  var myPrepare = null, myResolve = null, preparing = false, resolving = false;

  function live() {
    S.layers = S.layers.filter(function (l) { return l.out.isConnected !== false; });
    return S.layers;
  }
  function arm() {
    if (!live().length) return;
    if (G.__hf_page_composite_prepare !== myPrepare) {
      var priorP = typeof G.__hf_page_composite_prepare === "function" ? G.__hf_page_composite_prepare : null;
      myPrepare = async function () {
        if (preparing) return false;
        preparing = true;
        try {
          var p = priorP ? await priorP() : false;
          var ls = live();
          for (var i = 0; i < ls.length; i++) { try { await ls[i].prepare(); } catch (e) { console.warn("[fxs] prepare: " + e.message); } }
          return p;
        } finally { preparing = false; }
      };
      G.__hf_page_composite_prepare = myPrepare;
    }
    if (G.__hf_page_composite_resolve !== myResolve) {
      var priorR = typeof G.__hf_page_composite_resolve === "function" ? G.__hf_page_composite_resolve : null;
      myResolve = function () {
        if (resolving) return false;
        resolving = true;
        try {
          var p = priorR ? priorR() : false, ok = false;
          live().forEach(function (l) { ok = l.draw() || ok; });
          S.resolvedSeq = S.seq;
          G.__hf_page_composite_pending = false;
          return ok || p;
        } finally { resolving = false; }
      };
      G.__hf_page_composite_resolve = myResolve;
    }
    G.__hf_page_composite_pending = true;
  }
  // Preview/Studio/snapshot resolver chaqirmaydi: paint'ni kutib, keyin chizamiz.
  function previewFrame(my) {
    setTimeout(function () {
      if (my !== S.seq || S.resolvedSeq >= my) return;
      live().forEach(function (l) {
        Promise.resolve(l.prepare()).then(function () {
          l.afterPaint(function () { if (my === S.seq && S.resolvedSeq < my) l.draw(); });
        });
      });
    }, 0);
  }
  function onSeek(t) {
    S.lastSeekT = Number(t) || 0;
    var my = ++S.seq;
    arm();
    previewFrame(my);
  }
  function hook(obj, key) {
    if (S.hooked[obj + "." + key]) return true;
    var o = G[obj];
    if (!o || typeof o[key] !== "function") return false;
    var orig = o[key];
    o[key] = function () { var r = orig.apply(this, arguments); onSeek(arguments[0]); return r; };
    S.hooked[obj + "." + key] = true;
    return true;
  }
  if (!S.polling) {
    S.polling = true;
    (function poll(n) {
      var a = hook("__hf", "seek"), b = hook("__player", "renderSeek"), c = hook("__player", "seek");
      if (!(a && b && c) && n < 500) setTimeout(function () { poll(n + 1); }, 20);
    })(0);
  }

  // ---------- HTML-in-Canvas aniqlash (runtime bilan bir xil: yangi API content="drawable") ----------
  function hicRejim() {
    var t = G.CanvasRenderingContext2D && G.CanvasRenderingContext2D.prototype;
    if (!t || !("drawElementImage" in t)) return null;
    var c = G.document.createElement("canvas");
    if (!("requestPaint" in c)) return null;
    if ("layoutSubtree" in c) return "layoutsubtree";
    if ("updateElementGeometry" in c) return "drawable";
    return null;
  }

  // ---------- GLSL ----------
  var VS = "#version 300 es\nin vec2 a;out vec2 v_uv;void main(){v_uv=a*0.5+0.5;gl_Position=vec4(a,0.0,1.0);}";
  var HEAD = "#version 300 es\nprecision highp float;precision highp int;precision highp sampler3D;\nin vec2 v_uv;out vec4 o;\nuniform sampler2D u_t;uniform vec2 u_res;\n" +
    // butun sonli hash (sin-hash emas — GPU'lar orasida bir xil)
    "uint hU(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}\n" +
    "float h3(vec3 p){uvec3 q=uvec3(ivec3(floor(p))+ivec3(1<<20));return float(hU(q.x^hU(q.y^hU(q.z))))/4294967295.0;}\n" +
    "float vn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);\n" +
    " return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),\n" +
    "            mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}\n" +
    "float fbm(vec3 p){float s=0.0,a=0.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec3(11.7,5.3,1.9);a*=0.5;}return s/0.96875;}\n";

  var FS = {
    // 1) kirish: manbani sig'dirish (cover) + turbulent displacement
    kirish: HEAD + "uniform vec4 u_fit;uniform float u_amt,u_scale,u_time,u_spd,u_seed;\n" +
      "void main(){vec2 uv=v_uv;\n" +
      " if(u_amt>0.0){vec2 px=v_uv*u_res;vec3 q=vec3(px/u_scale,u_time*u_spd+u_seed*7.31);\n" +
      "  vec2 d=vec2(fbm(q),fbm(q+vec3(19.1,7.7,3.3)))-0.5;uv+=d*2.0*u_amt/u_res;}\n" +
      " o=texture(u_t,clamp(uv*u_fit.xy+u_fit.zw,0.0,1.0));}",
    // 2) separabel gaussian (u_dir = bir qadam, uv birligida)
    gauss: HEAD + "uniform vec2 u_dir;uniform float u_sig;\n" +
      "void main(){vec4 acc=texture(u_t,v_uv);float ws=1.0;\n" +
      " for(int i=1;i<=16;i++){float fi=float(i);float w=exp(-0.5*fi*fi/(u_sig*u_sig));\n" +
      "  acc+=w*(texture(u_t,v_uv+u_dir*fi)+texture(u_t,v_uv-u_dir*fi));ws+=2.0*w;}\n" +
      " o=acc/ws;}",
    // 3) yo'nalishli blur (box, 65 tap; u_dir = to'liq uzunlik vektori uv birligida)
    yblur: HEAD + "uniform vec2 u_dir;\n" +
      "void main(){vec4 acc=vec4(0);for(int i=-32;i<=32;i++){acc+=texture(u_t,v_uv+u_dir*(float(i)/64.0));}o=acc/65.0;}",
    // 4a) glow: yorug' qismni ajratish (yumshoq tizza) + 4 tap pasaytirish
    yorug: HEAD + "uniform vec2 u_src;uniform float u_thr;\n" +
      "void main(){vec2 d=0.5/u_src;vec4 c=0.25*(texture(u_t,v_uv+vec2(d.x,d.y))+texture(u_t,v_uv+vec2(-d.x,d.y))+texture(u_t,v_uv+vec2(d.x,-d.y))+texture(u_t,v_uv-d));\n" +
      " float l=max(c.r,max(c.g,c.b));float k=0.12;float s=clamp(l-u_thr+k,0.0,2.0*k);s=s*s/(4.0*k+1e-5);\n" +
      " o=c*(max(s,l-u_thr)/max(l,1e-5));}",
    // 4b) pasaytirish (nusxa)
    nusxa: HEAD + "void main(){o=texture(u_t,v_uv);}",
    // 4c) glow qo'shish
    glow: HEAD + "uniform sampler2D u_b1,u_b2;uniform float u_k;uniform vec3 u_tint;\n" +
      "void main(){vec4 c=texture(u_t,v_uv);vec3 g=(texture(u_b1,v_uv).rgb*0.6+texture(u_b2,v_uv).rgb*0.8)*u_tint*u_k;\n" +
      " o=vec4(c.rgb+g,clamp(c.a+dot(g,vec3(0.3333)),0.0,1.0));}",
    // 5) rang: ekspozitsiya, levels (qora/oq nuqta, gamma), kontrast, S-egri, saturatsiya, LUT
    rang: HEAD + "uniform float u_exp,u_blk,u_wht,u_gam,u_con,u_crv,u_sat,u_lutK,u_lutN;uniform sampler3D u_lut;\n" +
      "void main(){vec4 c=texture(u_t,v_uv);vec3 x=c.a>0.0?c.rgb/c.a:vec3(0);\n" +
      " x*=exp2(u_exp);x=clamp((x-u_blk)/max(u_wht-u_blk,1e-4),0.0,1.0);x=pow(x,vec3(1.0/max(u_gam,0.01)));\n" +
      " x=(x-0.5)*u_con+0.5;x=clamp(x,0.0,1.0);x=x+u_crv*(x*x*(3.0-2.0*x)-x);\n" +
      " float L=dot(x,vec3(0.2126,0.7152,0.0722));x=clamp(mix(vec3(L),x,u_sat),0.0,1.0);\n" +
      " if(u_lutK>0.0){vec3 lc=(x*(u_lutN-1.0)+0.5)/u_lutN;x=mix(x,texture(u_lut,lc).rgb,u_lutK);}\n" +
      " o=vec4(x*c.a,c.a);}",
    // 6) yakun: chromatic aberration (radial), RGB split, vinyetka, film grain
    yakun: HEAD + "uniform float u_ca,u_rgb,u_rgbA,u_vig,u_vigS,u_grain,u_gsz,u_frame,u_seed,u_split;\n" +
      "void main(){if(u_split>0.0){float dx=(v_uv.x-u_split)*u_res.x;if(abs(dx)<2.0){o=vec4(1);return;}if(dx<0.0){o=vec4(0);return;}}\n" +
      " vec2 asp=vec2(u_res.x/u_res.y,1.0);vec2 cc=v_uv-0.5;float r=length(cc*asp)/length(0.5*asp);\n" +
      " vec2 dir=length(cc)>1e-5?normalize(cc*asp)/asp:vec2(0);\n" +
      " vec2 ca=dir*(u_ca*r*r)/u_res.y;vec2 rs=vec2(cos(u_rgbA),-sin(u_rgbA))*u_rgb/u_res;\n" +
      " vec4 cr=texture(u_t,v_uv+ca+rs),cg=texture(u_t,v_uv),cb=texture(u_t,v_uv-ca-rs);\n" +
      " vec4 c=vec4(cr.r,cg.g,cb.b,max(cg.a,max(cr.a,cb.a)));\n" +
      " if(u_vig>0.0){float v=smoothstep(1.0-u_vigS,1.15,r);c.rgb*=1.0-u_vig*v;}\n" +
      " if(u_grain>0.0){vec2 g=v_uv*u_res/max(u_gsz,1.0);float fr=u_frame+u_seed*131.0;\n" +
      "  float n=vn(vec3(g,fr*7.0))+vn(vec3(g*1.97+3.1,fr*7.0+3.0))-1.0;\n" +
      "  vec3 x=c.a>0.0?c.rgb/c.a:vec3(0);float L=dot(x,vec3(0.2126,0.7152,0.0722));float m=0.35+0.65*(1.0-abs(2.0*L-1.0));\n" +
      "  c.rgb=clamp(c.rgb+n*u_grain*0.32*m*c.a,0.0,1.0);}\n" +
      " o=c;}"
  };

  // ---------- standart parametrlar ----------
  var STD = {
    buzish: 0, buzish_olcham: 220, buzish_tezlik: 0.6,
    blur: 0, yblur: 0, yblur_burchak: 0,
    glow: 0, glow_chegara: 0.65, glow_radius: 40, glow_rang: "#ffffff",
    ekspozitsiya: 0, qora: 0, oq: 1, gamma: 1, kontrast: 1, egri: 0, saturatsiya: 1,
    lut: "", lut_kuch: 1,
    aberratsiya: 0, rgb: 0, rgb_burchak: 0,
    vinyetka: 0, vinyetka_yumshoq: 0.75,
    don: 0, don_olcham: 1.6,
    seed: 1, ochiq: 1, ajrat: 0
  };
  function hex3(h) {
    if (Array.isArray(h)) return h;
    var s = String(h || "#fff").replace("#", "");
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // ---------- .cube parser ----------
  function cubeOqi(txt) {
    var n = 0, mn = [0, 0, 0], mx = [1, 1, 1], vals = [];
    String(txt).split(/\r?\n/).forEach(function (ln) {
      ln = ln.trim();
      if (!ln || ln[0] === "#") return;
      var p = ln.split(/\s+/);
      var k = p[0].toUpperCase();
      if (k === "LUT_3D_SIZE") n = parseInt(p[1], 10);
      else if (k === "DOMAIN_MIN") mn = p.slice(1, 4).map(Number);
      else if (k === "DOMAIN_MAX") mx = p.slice(1, 4).map(Number);
      else if (k === "TITLE" || k === "LUT_1D_SIZE" || k === "LUT_3D_INPUT_RANGE") { if (k === "LUT_1D_SIZE") throw new Error("1D LUT qo'llanmaydi"); }
      else if (/^[-+0-9.]/.test(p[0]) && p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
    });
    if (!n || vals.length !== n * n * n * 3) throw new Error(".cube noto'g'ri: LUT_3D_SIZE=" + n + ", qiymat " + vals.length / 3);
    var d = new Float32Array(vals.length);
    for (var i = 0; i < vals.length; i++) { var c = i % 3; d[i] = (vals[i] - mn[c]) / ((mx[c] - mn[c]) || 1); }
    return { n: n, data: d };
  }

  // ---------- kalit kadrlar → GSAP tween'lar ----------
  function kalitlar(tl, p, ks, ease) {
    if (!tl || !ks || !ks.length) return;
    if (typeof ks === "string") { try { ks = JSON.parse(ks); } catch (e) { console.warn("[fxs] kalitlar JSON emas"); return; } }
    ks = ks.slice().sort(function (a, b) { return (+a.t || 0) - (+b.t || 0); });
    var keys = {};
    ks.forEach(function (k) { Object.keys(k).forEach(function (n) {
      if (n === "t" || n === "ease") return;
      if (typeof k[n] === "number") keys[n] = 1;
      else { var a = {}; a[n] = k[n]; tl.set(p, a, Math.max(0, +k.t || 0)); } // satr (lut, glow_rang) — pog'onali
    }); });
    Object.keys(keys).forEach(function (n) {
      var pts = [{ t: 0, v: +p[n] || 0 }];
      ks.forEach(function (k) {
        if (typeof k[n] !== "number") return;
        var t = Math.max(0, +k.t || 0);
        if (t === 0) pts[0].v = k[n]; else pts.push({ t: t, v: k[n], ease: k.ease });
      });
      var a = {}; a[n] = pts[0].v; tl.set(p, a, 0);
      for (var i = 1; i < pts.length; i++) {
        var f = {}, to = {};
        f[n] = pts[i - 1].v; to[n] = pts[i].v;
        to.duration = Math.max(0.001, pts[i].t - pts[i - 1].t);
        to.ease = pts[i].ease || ease || "power1.inOut";
        to.immediateRender = false;
        tl.fromTo(p, f, to, pts[i - 1].t);
      }
    });
  }

  function yuklaRasm(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.decoding = "sync";
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error("rasm yuklanmadi: " + url)); };
      im.src = url;
    });
  }

  // ---------- qatlam ----------
  function shader(o) {
    o = o || {};
    var doc = G.document;
    var src = o.manba;
    if (typeof src === "string" && /^[#.\[]/.test(src)) src = (o.qidir || doc).querySelector(src) || doc.querySelector(src);
    var kind, yol = null;
    if (typeof src === "string" && src) { kind = "yol"; yol = src; src = null; }
    else if (src && src.tagName === "CANVAS" && (src.hasAttribute("layoutsubtree") || src.getAttribute("content") === "drawable")) kind = "dom";
    else if (src && src.tagName === "CANVAS") kind = "canvas";
    else if (src && src.tagName === "VIDEO") kind = "video";
    else if (src && src.tagName === "IMG") kind = "img";
    else throw new Error("[fxs] manba topilmadi: " + o.manba);

    var p = {};
    Object.keys(STD).forEach(function (k) { p[k] = STD[k]; });
    Object.keys(o.p || {}).forEach(function (k) { if (o.p[k] !== undefined && o.p[k] !== null && o.p[k] !== "") p[k] = o.p[k]; });

    // DOM manba: HTML-in-Canvas tayyorlash
    var sceneEl = null, sctx = null, mode = null;
    if (kind === "dom") {
      sceneEl = src.firstElementChild;
      mode = hicRejim();
      if (mode === "drawable") { src.setAttribute("content", "drawable"); if (sceneEl) sceneEl.setAttribute("drawable", ""); }
      else if (mode === "layoutsubtree") src.setAttribute("layoutsubtree", "");
      sctx = src.getContext("2d");
      if (!mode || !sctx || !sctx.drawElementImage) {
        // HTML-in-Canvas yo'q (oddiy brauzer preview): sahnani sahifaga qaytaramiz, effekt o'chadi
        if (sceneEl) { src.parentNode.insertBefore(sceneEl, src); src.remove(); }
        console.warn("[fxs] HTML-in-Canvas yo'q — sahna effektsiz ko'rsatiladi (renderda bor)");
        return { p: p, destroy: function () {}, ishlayapti: false };
      }
      [sceneEl].concat(Array.from(sceneEl.querySelectorAll("*"))).forEach(function (el) { el.setAttribute("data-layout-allow-occlusion", ""); });
    }

    // chiqish canvas
    var out = o.chiqish;
    var W = o.W, H = o.H;
    if (!out) {
      out = doc.createElement("canvas");
      out.className = "fxs-chiqish";
      out.style.cssText = "position:absolute;left:" + src.offsetLeft + "px;top:" + src.offsetTop + "px;width:" + src.offsetWidth + "px;height:" + src.offsetHeight + "px;pointer-events:none;z-index:" + (o.zIndex || 5);
      src.parentNode.insertBefore(out, src.nextSibling);
    }
    if (!W) W = kind === "dom" || kind === "canvas" ? src.width : Math.round(out.offsetWidth || src.offsetWidth || 1920);
    if (!H) H = kind === "dom" || kind === "canvas" ? src.height : Math.round(out.offsetHeight || src.offsetHeight || 1080);
    out.width = W; out.height = H;

    var gl = out.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: true, alpha: true });
    if (!gl) { console.warn("[fxs] WebGL2 yo'q"); return { p: p, destroy: function () {}, ishlayapti: false }; }

    function sh(type, s) {
      var x = gl.createShader(type);
      gl.shaderSource(x, s); gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error("[fxs] shader: " + gl.getShaderInfoLog(x));
      return x;
    }
    var vs = sh(gl.VERTEX_SHADER, VS), progs = {};
    function prog(name) {
      if (progs[name]) return progs[name];
      var pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS[name]));
      gl.bindAttribLocation(pr, 0, "a");
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error("[fxs] link: " + gl.getProgramInfoLog(pr));
      var u = {};
      return (progs[name] = { pr: pr, u: function (n) { return n in u ? u[n] : (u[n] = gl.getUniformLocation(pr, n)); } });
    }
    var vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    function tex2(w, h) {
      var t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (w) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return t;
    }
    function rt(w, h) {
      w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
      var t = tex2(w, h), f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      return { t: t, f: f, w: w, h: h };
    }
    var srcTex = tex2(0, 0);
    var A = rt(W, H), B = rt(W, H), H1 = rt(W / 2, H / 2), H2 = rt(W / 2, H / 2), Q1 = rt(W / 4, H / 4), Q2 = rt(W / 4, H / 4);
    var lutTex = gl.createTexture(), lutN = 2, lutYol = null, lutTayyor = false, lutVada = null;
    gl.bindTexture(gl.TEXTURE_3D, lutTex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));

    function lutYukla(y) {
      lutYol = y; lutTayyor = false;
      if (!y) { lutVada = null; return null; }
      var url = typeof o.lutYol === "function" ? o.lutYol(y) : y;
      var kesh = S.lutKesh || (S.lutKesh = {});
      if (!kesh[url]) kesh[url] = fetch(url).then(function (r) { if (!r.ok) throw new Error("LUT topilmadi: " + url); return r.text(); }).then(cubeOqi);
      lutVada = kesh[url].then(function (c) {
        if (lutYol !== y) return;
        gl.bindTexture(gl.TEXTURE_3D, lutTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, c.n, c.n, c.n, 0, gl.RGB, gl.FLOAT, c.data);
        [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER].forEach(function (k) { gl.texParameteri(gl.TEXTURE_3D, k, gl.LINEAR); });
        [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach(function (k) { gl.texParameteri(gl.TEXTURE_3D, k, gl.CLAMP_TO_EDGE); });
        lutN = c.n; lutTayyor = true;
      }).catch(function (e) { console.warn("[fxs] " + e.message); });
      return lutVada;
    }
    if (p.lut) lutYukla(p.lut);

    var rasmVada = null, rasmEl = null;
    if (kind === "yol") rasmVada = yuklaRasm(yol).then(function (im) { rasmEl = im; }).catch(function (e) { console.warn("[fxs] " + e.message); });

    var comp = (o.root || out).closest("[data-composition-id]");
    var compId = o.compId || (comp && comp.getAttribute("data-composition-id"));
    var rootEl = out.closest("[data-fps]") || G.document.querySelector("[data-fps]");
    var FPS = o.fps || Number(rootEl && rootEl.getAttribute("data-fps")) || 30;
    function now() {
      if (typeof o.vaqt === "function") return o.vaqt();
      var tl = compId && ((G.__timelines && G.__timelines[compId]) || (window.__timelines && window.__timelines[compId]));
      return tl && typeof tl.time === "function" ? tl.time() : S.lastSeekT;
    }

    // joriy manba elementi (video → render kadri)
    function manbaEl() {
      if (kind === "dom" || kind === "canvas") return src;
      if (kind === "img") return src.complete && src.naturalWidth ? src : null;
      if (kind === "yol") return rasmEl;
      if (kind === "video") {
        var fr = src.nextElementSibling;
        if (fr && fr.classList && fr.classList.contains("__render_frame__")) return fr.complete && fr.naturalWidth ? fr : null;
        var any = (src.parentNode || doc).querySelector("img.__render_frame__");
        if (any && any.previousElementSibling === src) return any.complete ? any : null;
        return src.readyState >= 2 ? src : null;
      }
      return null;
    }
    function olcham(el) {
      if (!el) return [W, H];
      if (el.tagName === "VIDEO") return [el.videoWidth || W, el.videoHeight || H];
      if (el.tagName === "IMG") return [el.naturalWidth || W, el.naturalHeight || H];
      return [el.width || W, el.height || H];
    }

    async function prepare() {
      if (p.lut !== lutYol) lutYukla(p.lut);
      if (lutVada && !lutTayyor) await lutVada;
      if (rasmVada) await rasmVada;
      if (kind === "video") {
        var fr = src.nextElementSibling;
        if (fr && fr.classList && fr.classList.contains("__render_frame__") && !fr.complete && fr.decode) { try { await fr.decode(); } catch (e) {} }
      }
    }

    var awaitingPaint = false;
    function capture() {
      if (src.__fxsSeq === S.seq) return true; // bitta manbani bir kadrda bir marta olamiz
      try {
        sctx.clearRect(0, 0, src.width, src.height);
        sctx.drawElementImage(sceneEl, 0, 0);
        src.__fxsSeq = S.seq;
        return true;
      } catch (e) {
        if (/paint record/i.test(e.message)) {
          if (!awaitingPaint) {
            awaitingPaint = true;
            src.addEventListener("paint", function () { awaitingPaint = false; draw(); }, { once: true });
            try { if (src.requestPaint) src.requestPaint(); } catch (_) {}
          }
          return false;
        }
        console.error("[fxs] capture: " + e.message);
        return false;
      }
    }

    function quad(prName, target, setU) {
      var P = prog(prName);
      gl.useProgram(P.pr);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
      var w = target ? target.w : W, h = target ? target.h : H;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(P.u("u_res"), w, h);
      gl.uniform1i(P.u("u_t"), 0);
      setU(P, w, h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    function bind(unit, t, target) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(target || gl.TEXTURE_2D, t); }
    // gaussian: a → (tmp) → a, radius px (a ning o'z pikselida)
    function gauss(a, tmp, rpx) {
      if (rpx <= 0.3) return;
      var step = Math.max(1, rpx / 16), sig = Math.max(0.5, (rpx / step) / 2.5);
      bind(0, a.t);
      quad("gauss", tmp, function (P) { gl.uniform2f(P.u("u_dir"), step / a.w, 0); gl.uniform1f(P.u("u_sig"), sig); });
      bind(0, tmp.t);
      quad("gauss", a, function (P) { gl.uniform2f(P.u("u_dir"), 0, step / a.h); gl.uniform1f(P.u("u_sig"), sig); });
    }

    var cur, oth;
    function swap() { var t = cur; cur = oth; oth = t; }

    function draw() {
      // DOM manba har kadr yangilanadi (qatlam ko'rinmasa ham) — manba canvas'ning o'zi effektsiz sahnani ko'rsatadi
      if (kind === "dom") {
        if (src.checkVisibility && !src.checkVisibility({ visibilityProperty: true })) return false;
        if (!capture()) return false;
      }
      if (+p.ochiq === 0) return false;
      if (out.checkVisibility && !out.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
      var el = manbaEl();
      if (!el) return false;
      var t = now();
      var sz = olcham(el);

      gl.disable(gl.BLEND);
      bind(0, srcTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el); }
      catch (e) { console.warn("[fxs] tekstura: " + e.message); return false; }

      // cover sig'dirish
      var sa = sz[0] / sz[1], ta = W / H, fx = 1, fy = 1;
      if (o.sigdir !== "cho'z") { if (sa > ta) fx = ta / sa; else fy = sa / ta; }
      cur = A; oth = B;
      quad("kirish", cur, function (P) {
        gl.uniform4f(P.u("u_fit"), fx, fy, (1 - fx) / 2, (1 - fy) / 2);
        gl.uniform1f(P.u("u_amt"), +p.buzish || 0);
        gl.uniform1f(P.u("u_scale"), Math.max(1, +p.buzish_olcham || 1));
        gl.uniform1f(P.u("u_time"), t);
        gl.uniform1f(P.u("u_spd"), +p.buzish_tezlik || 0);
        gl.uniform1f(P.u("u_seed"), +p.seed || 0);
      });
      if (+p.blur > 0.3) gauss(cur, oth, +p.blur);
      if (+p.yblur > 0.5) {
        var a = (+p.yblur_burchak || 0) * Math.PI / 180;
        bind(0, cur.t);
        quad("yblur", oth, function (P) { gl.uniform2f(P.u("u_dir"), Math.cos(a) * p.yblur / W, -Math.sin(a) * p.yblur / H); });
        swap();
      }
      if (+p.glow > 0.001) {
        bind(0, cur.t);
        quad("yorug", H1, function (P) { gl.uniform2f(P.u("u_src"), W, H); gl.uniform1f(P.u("u_thr"), +p.glow_chegara); });
        bind(0, H1.t);
        quad("nusxa", Q1, function () {});
        gauss(H1, H2, (+p.glow_radius || 40) / 2);
        gauss(Q1, Q2, (+p.glow_radius || 40) / 2);
        bind(0, cur.t); bind(1, H1.t); bind(2, Q1.t);
        var tc = hex3(p.glow_rang);
        quad("glow", oth, function (P) {
          gl.uniform1i(P.u("u_b1"), 1); gl.uniform1i(P.u("u_b2"), 2);
          gl.uniform1f(P.u("u_k"), +p.glow); gl.uniform3f(P.u("u_tint"), tc[0], tc[1], tc[2]);
        });
        bind(1, null); bind(2, null); gl.activeTexture(gl.TEXTURE0);
        swap();
      }
      var lutK = lutTayyor && p.lut ? Math.max(0, Math.min(1, +p.lut_kuch)) : 0;
      var rangBor = +p.ekspozitsiya !== 0 || +p.qora !== 0 || +p.oq !== 1 || +p.gamma !== 1 || +p.kontrast !== 1 || +p.egri !== 0 || +p.saturatsiya !== 1 || lutK > 0;
      if (rangBor) {
        bind(0, cur.t); bind(3, lutTex, gl.TEXTURE_3D); gl.activeTexture(gl.TEXTURE0);
        quad("rang", oth, function (P) {
          gl.uniform1f(P.u("u_exp"), +p.ekspozitsiya); gl.uniform1f(P.u("u_blk"), +p.qora); gl.uniform1f(P.u("u_wht"), +p.oq);
          gl.uniform1f(P.u("u_gam"), +p.gamma); gl.uniform1f(P.u("u_con"), +p.kontrast); gl.uniform1f(P.u("u_crv"), +p.egri);
          gl.uniform1f(P.u("u_sat"), +p.saturatsiya); gl.uniform1f(P.u("u_lutK"), lutK); gl.uniform1f(P.u("u_lutN"), lutN);
          gl.uniform1i(P.u("u_lut"), 3);
        });
        swap();
      }
      bind(0, cur.t);
      quad("yakun", null, function (P) {
        gl.uniform1f(P.u("u_ca"), +p.aberratsiya || 0);
        gl.uniform1f(P.u("u_rgb"), +p.rgb || 0);
        gl.uniform1f(P.u("u_rgbA"), (+p.rgb_burchak || 0) * Math.PI / 180);
        gl.uniform1f(P.u("u_vig"), Math.max(0, +p.vinyetka || 0));
        gl.uniform1f(P.u("u_vigS"), Math.max(0.05, Math.min(1, +p.vinyetka_yumshoq || 0.75)));
        gl.uniform1f(P.u("u_grain"), Math.max(0, +p.don || 0));
        gl.uniform1f(P.u("u_gsz"), Math.max(1, +p.don_olcham || 1));
        gl.uniform1f(P.u("u_frame"), Math.round(t * FPS));
        gl.uniform1f(P.u("u_seed"), +p.seed || 0);
        gl.uniform1f(P.u("u_split"), Math.max(0, Math.min(1, +p.ajrat || 0)));
      });
      return true;
    }

    function afterPaint(go) {
      if (kind !== "dom") return go();
      var done = false;
      function once() { if (!done) { done = true; go(); } }
      src.addEventListener("paint", once, { once: true });
      try { if (src.requestPaint) src.requestPaint(); } catch (e) {}
      setTimeout(once, 250);
    }

    var layer = { out: out, prepare: prepare, draw: draw, afterPaint: afterPaint, p: p, ishlayapti: true, kind: kind, W: W, H: H };
    S.layers.push(layer);
    if (o.tl && o.kalitlar) kalitlar(o.tl, p, o.kalitlar, o.ease);
    layer.destroy = function () {
      S.layers = S.layers.filter(function (l) { return l !== layer; });
      var lose = gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
      if (!o.chiqish) out.remove();
    };
    return layer;
  }
  shader.__fxs = true;
  G.FX.shader = shader;
  G.FX.shaderKalitlar = kalitlar;
  G.FX.cubeOqi = cubeOqi;
  G.FX.shaderStd = STD;
})();
