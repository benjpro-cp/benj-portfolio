/* ==========================================================================
   MOTEUR, BENJ !  base.js : shell runtime, exposed as window.BJ
   --------------------------------------------------------------------------
   Loaded before every section script. Each section script is its own
   <script> tag wrapped in try/catch, so a broken section never kills others.

   SECTIONS, CONSTANTS, EVENTS
     BJ.section(id, init(root, BJ))   runs init with #id (skips if absent, catches errors)
     BJ.FIVERR                        'https://www.fiverr.com/benj_cps'
     BJ.reduced                       live boolean (prefers-reduced-motion: reduce)
     BJ.fine                          live boolean (hover:hover and pointer:fine)
     BJ.narrow()                      innerWidth < 700
     BJ.on(name, cb) -> off()         BJ.emit(name, detail)
        events: 'take' {count, reason} | 'stunt:cut' | 'stunt:fall'
                'game:win' {id} | 'mute' {muted} | 'reduced' {reduced}
     BJ.state                         { takes, fell, wins: {id: true} }
     BJ.takes.add(reason) -> count    BJ.takes.count
        updates every [data-take-count] (with a flip), emits 'take'
     BJ.root / BJ.hud                 .bj-root element / HUD header

   ASSETS AND POSES  (all metadata in % of the image box)
     BJ.POSES[pose] = { src, w, h, k, head:[x,y], hit:[[cx,cy,rx,ry]...],
                        harness?:{back,hip}, hand?, feet? }
        poses: float, lean, jump, pockets, squat
        k = head-matched display height relative to the pockets height P, measured
        on the cutouts: pockets 1, jump 1, lean .96, float .77, squat .75
     BJ.PROPS[name] = { src, w, h }   portrait, clap, controller, camera, dumbbell, filmroll
     BJ.load(name | [names]) -> Promise<img | img[]>  (pose/prop name or a path; never rejects)
     BJ.setPose(img, pose, {squash=true, fluff=true}) -> img
        sets src + width/height attrs + data-pose; WAAPI squash (composite add,
        so your own transform is kept); fleece fluff at the img center
     BJ.poseBox(pose, P) -> {w, h}    P = height of 'pockets' in px
     BJ.hitPose(pose, x, y, w, h)     x,y local px inside the displayed w*h box
     BJ.posePoint(pose, key, w, h) -> {x, y}   px of 'head' | 'feet' | 'hand' | 'back' | 'hip'
     BJ.fontsReady                    Promise (fonts loaded or 1500ms)

   LOOP AND INPUT
     BJ.ticker.add(fn(dt, now)) -> remove()   single rAF, dt in s (<= 1/30), paused when hidden
     BJ.inView(el, cb(bool), margin='200px') -> stop()
     BJ.drag(el, {onStart, onMove, onEnd, onTap, tapSlop=6}) -> detach()
        callbacks get (p, event); p = {x, y, dx, dy, vx, vy, t, id, moved, type}
        x/y client px, dx/dy from start, vx/vy px/s over the last 80ms, t ms since down.
        onStart returning false cancels. On release: tap (moved <= tapSlop) -> onTap
        ONLY (falls back to onEnd if no onTap); otherwise onEnd. pointercancel ->
        onEnd with p.cancelled = true. Adds .bj-draggable (grab cursor, no select)
        and .is-grabbing. Does NOT set touch-action: do it in your CSS.

   SOUND (WebAudio synth, unlocked by the first gesture, never throws)
     BJ.sfx.play(name, {vol=1, rate=1})
        clap shutter boing pop whoosh twang thud ting bell coin tick print
        whistle rumble win fail stamp clunk
     BJ.sfx.note(freq, {dur=.3, type='triangle', vol=.6})
     BJ.sfx.loop('whir' | 'vhs') -> {gain(v 0..1), stop()}   (safe before unlock)
     BJ.sfx.muted (getter)  BJ.sfx.setMuted(bool)  BJ.sfx.toggle()  BJ.sfx.unlocked

   FX AND UI
     BJ.fx.fluff(x, y, n=7) | dust(x, y, n=8) | chalk(x, y, n=8) | confetti(x, y, n=60)
        client coords; particles stick to the page while scrolling; no-ops when reduced
     BJ.say(bubbleEl, text, ms=2200) -> Promise   (ms 0 = stay)
     BJ.stamp(host, text, {tone='tally'|'cocoa'|'mint', rot=-6, x='50%', y='50%',
                           ms=1600, size='s'|'m'|'l'}) -> el   (ms 0 = persist)
     BJ.announce(text)                polite aria-live
     BJ.shake(el, px=6, ms=260)       BJ.rumble(el, ms=220)   (both skip when reduced)
     BJ.flash(host, ms=110)           warm flash overlay (reduced: canister outline pulse)

   MATH
     BJ.spring(s={x,v}, target, k, c, dt) -> s    semi-implicit Euler
     BJ.clamp(v,a,b) BJ.lerp(a,b,t) BJ.rand(a,b) BJ.pick(arr) BJ.wait(ms)
     BJ.ease.outBack | outCubic | inOutSine | outElastic | inCubic
   ========================================================================== */
(function () {
  'use strict';
  var W = window, D = document;
  var BJ = W.BJ = W.BJ || {};
  var perf = W.performance || Date;
  var now = function () { return perf.now(); };

  BJ.version = '1.0.0';
  BJ.FIVERR = 'https://www.fiverr.com/benj_cps';
  BJ.root = D.querySelector('.bj-root') || D.body;
  BJ.hud = D.querySelector('.bj-hud');

  /* ------------------------------------------------------------------ math */
  BJ.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  BJ.lerp = function (a, b, t) { return a + (b - a) * t; };
  BJ.rand = function (a, b) { if (b === undefined) { b = a; a = 0; } return a + Math.random() * (b - a); };
  BJ.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  BJ.wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  BJ.ease = {
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inCubic: function (t) { return t * t * t; },
    inOutSine: function (t) { return -(Math.cos(Math.PI * t) - 1) / 2; },
    outElastic: function (t) {
      if (t <= 0) return 0; if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1;
    }
  };
  BJ.spring = function (s, target, k, c, dt) {
    if (s.v === undefined) s.v = 0;
    s.v += (k * (target - s.x) - c * s.v) * dt;
    s.x += s.v * dt;
    return s;
  };

  /* --------------------------------------------------------------- media */
  var mqReduce = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var mqFine = W.matchMedia ? W.matchMedia('(hover: hover) and (pointer: fine)') : null;
  var mqCoarse = W.matchMedia ? W.matchMedia('(pointer: coarse)') : null;
  Object.defineProperty(BJ, 'reduced', { configurable: true, get: function () { return !!(mqReduce && mqReduce.matches); } });
  Object.defineProperty(BJ, 'fine', { configurable: true, get: function () { return !!(mqFine && mqFine.matches); } });
  Object.defineProperty(BJ, 'coarse', { configurable: true, get: function () { return !!(mqCoarse && mqCoarse.matches); } });
  BJ.narrow = function () { return W.innerWidth < 700; };

  /* -------------------------------------------------------------- events */
  var handlers = {};
  BJ.on = function (name, cb) {
    (handlers[name] || (handlers[name] = [])).push(cb);
    return function off() {
      var a = handlers[name]; if (!a) return;
      var i = a.indexOf(cb); if (i >= 0) a.splice(i, 1);
    };
  };
  BJ.emit = function (name, detail) {
    var a = (handlers[name] || []).slice();
    for (var i = 0; i < a.length; i++) {
      try { a[i](detail); } catch (e) { console.error('[BJ.on ' + name + ']', e); }
    }
  };
  if (mqReduce) {
    var onReduce = function () { BJ.emit('reduced', { reduced: BJ.reduced }); };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
    else if (mqReduce.addListener) mqReduce.addListener(onReduce);
  }

  /* ------------------------------------------------------- state + takes */
  BJ.state = { takes: 1, fell: false, wins: {} };
  BJ.on('game:win', function (d) { if (d && d.id) BJ.state.wins[d.id] = true; });
  BJ.on('stunt:fall', function () { BJ.state.fell = true; });

  var takeCount = 1;
  function paintTakes(flip) {
    var els = D.querySelectorAll('[data-take-count]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      el.textContent = String(takeCount);
      if (flip && !BJ.reduced) {
        el.classList.remove('bj-flip');
        void el.offsetWidth;
        el.classList.add('bj-flip');
      }
    }
  }
  BJ.takes = {
    get count() { return takeCount; },
    add: function (reason) {
      takeCount += 1;
      BJ.state.takes = takeCount;
      paintTakes(true);
      clearTimeout(BJ.takes._t);
      BJ.takes._t = setTimeout(function () {
        var els = D.querySelectorAll('.bj-flip');
        for (var i = 0; i < els.length; i++) els[i].classList.remove('bj-flip');
      }, 320);
      BJ.emit('take', { count: takeCount, reason: reason || '' });
      return takeCount;
    }
  };
  /* HUD REC dot freezes on a cut, restarts on the next take */
  BJ.on('stunt:cut', function () {
    var r = D.querySelectorAll('.bj-hud .bj-rec');
    for (var i = 0; i < r.length; i++) r[i].classList.add('is-frozen');
  });
  BJ.on('take', function () {
    var r = D.querySelectorAll('.bj-hud .bj-rec.is-frozen');
    for (var i = 0; i < r.length; i++) r[i].classList.remove('is-frozen');
  });

  /* ------------------------------------------------------------ sections */
  BJ.section = function (id, init) {
    var root = D.getElementById(id);
    if (!root) return;
    try { init(root, BJ); } catch (e) { console.error('[' + id + ']', e); }
  };

  /* --------------------------------------------------------- poses/props */
  BJ.POSES = {
    float: { src: 'assets/pose-float.webp', w: 1000, h: 871, k: .77, head: [24, 1],
      hit: [[22, 17, 14, 17], [36, 50, 20, 16], [68, 72, 26, 16], [5, 79, 6, 6]],
      harness: { back: [30, 36], hip: [62, 56] }, hand: [5, 79] },
    lean: { src: 'assets/pose-lean.webp', w: 430, h: 487, k: .96, head: [32, 1],
      hit: [[32, 15, 14, 15], [40, 47, 20, 14], [70, 76, 24, 18], [6, 61, 7, 5]],
      harness: { back: [35, 30], hip: [60, 55] }, hand: [6, 61] },
    jump: { src: 'assets/pose-jump.webp', w: 440, h: 469, k: 1, head: [51, 1],
      hit: [[51, 15, 12, 15], [52, 45, 17, 18], [50, 18, 49, 9], [42, 80, 20, 19]],
      feet: [45, 99] },
    pockets: { src: 'assets/pose-pockets.webp', w: 208, h: 520, k: 1, head: [50, 1],
      hit: [[50, 14, 30, 14], [50, 58, 46, 42]], feet: [50, 99] },
    squat: { src: 'assets/pose-squat.webp', w: 282, h: 418, k: .75, head: [30, 3],
      hit: [[30, 20, 26, 20], [52, 64, 46, 33]], feet: [50, 97] }
  };
  BJ.PROPS = {
    portrait: { src: 'assets/benj-portrait.webp', w: 600, h: 600 },
    clap: { src: 'assets/clap.webp', w: 363, h: 389 },
    controller: { src: 'assets/coin.webp', w: 319, h: 258 },
    coin: { src: 'assets/coin.webp', w: 319, h: 258 },
    camera: { src: 'assets/camera.webp', w: 280, h: 214 },
    dumbbell: { src: 'assets/dumbbell.webp', w: 342, h: 275 },
    filmroll: { src: 'assets/filmroll.webp', w: 128, h: 104 }
  };

  var imgCache = {};
  function srcOf(n) {
    if (BJ.POSES[n]) return BJ.POSES[n].src;
    if (BJ.PROPS[n]) return BJ.PROPS[n].src;
    return n;
  }
  function loadOne(n) {
    var src = srcOf(n);
    if (imgCache[src]) return imgCache[src];
    var img = new Image();
    img.decoding = 'async';
    var p = new Promise(function (res) {
      var done = false;
      function fin() { if (!done) { done = true; res(img); } }
      img.onload = function () {
        if (img.decode) img.decode().then(fin, fin); else fin();
      };
      img.onerror = fin;
    });
    img.src = src;
    imgCache[src] = p;
    return p;
  }
  BJ.load = function (names) {
    if (Array.isArray(names)) return Promise.all(names.map(loadOne));
    return loadOne(names);
  };

  BJ.poseBox = function (pose, P) {
    var m = BJ.POSES[pose];
    if (!m) return { w: 0, h: 0 };
    var h = P * m.k;
    return { w: h * m.w / m.h, h: h };
  };
  BJ.hitPose = function (pose, x, y, w, h) {
    var m = BJ.POSES[pose];
    if (!m || !w || !h) return false;
    var px = x / w * 100, py = y / h * 100;
    for (var i = 0; i < m.hit.length; i++) {
      var e = m.hit[i], dx = (px - e[0]) / e[2], dy = (py - e[1]) / e[3];
      if (dx * dx + dy * dy <= 1) return true;
    }
    return false;
  };
  BJ.posePoint = function (pose, key, w, h) {
    var m = BJ.POSES[pose]; if (!m) return null;
    var pt = m[key] || (m.harness && m.harness[key]);
    if (!pt) return null;
    return { x: pt[0] / 100 * w, y: pt[1] / 100 * h };
  };
  BJ.setPose = function (img, pose, o) {
    var m = BJ.POSES[pose];
    if (!img || !m) return img;
    o = o || {};
    if (img.getAttribute('src') !== m.src) img.setAttribute('src', m.src);
    img.setAttribute('width', m.w);
    img.setAttribute('height', m.h);
    img.dataset.pose = pose;
    if (!BJ.reduced) {
      if (o.squash !== false && img.animate) {
        var kf = [{ transform: 'scale(1.1, .88)' }, { transform: 'scale(1, 1)' }];
        var opt = { duration: 220, easing: 'cubic-bezier(.34, 1.56, .64, 1)', composite: 'add' };
        try { img.animate(kf, opt); } catch (e) { try { delete opt.composite; img.animate(kf, opt); } catch (e2) {} }
      }
      if (o.fluff !== false) {
        var r = img.getBoundingClientRect();
        if (r.width) BJ.fx.fluff(r.left + r.width / 2, r.top + r.height / 2, 7);
      }
    }
    return img;
  };
  BJ.fontsReady = Promise.race([
    (D.fonts && D.fonts.ready) ? D.fonts.ready.then(function () {}, function () {}) : Promise.resolve(),
    new Promise(function (r) { setTimeout(r, 1500); })
  ]);

  /* -------------------------------------------------------------- ticker */
  var tickFns = [], rafId = 0, lastT = 0;
  function frame(t) {
    rafId = 0;
    if (!tickFns.length) { lastT = 0; return; }
    rafId = W.requestAnimationFrame(frame);
    if (D.hidden) { lastT = 0; return; }
    var dt = lastT ? Math.min((t - lastT) / 1000, 1 / 30) : 1 / 60;
    if (dt <= 0) dt = 1 / 240;
    lastT = t;
    var list = tickFns.slice();
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (tickFns.indexOf(f) < 0) continue;
      try { f(dt, t); } catch (e) { console.error('[BJ.ticker]', e); removeTick(f); }
    }
  }
  function removeTick(fn) {
    var i = tickFns.indexOf(fn);
    if (i >= 0) tickFns.splice(i, 1);
  }
  BJ.ticker = {
    add: function (fn) {
      if (tickFns.indexOf(fn) < 0) tickFns.push(fn);
      if (!rafId) { lastT = 0; rafId = W.requestAnimationFrame(frame); }
      return function () { removeTick(fn); };
    },
    remove: removeTick,
    get size() { return tickFns.length; },
    get names() { return tickFns.map(function (f) { return f.name || String(f).slice(0, 60); }); }
  };
  D.addEventListener('visibilitychange', function () { lastT = 0; });

  /* -------------------------------------------------------------- inView */
  BJ.inView = function (el, cb, margin) {
    if (!el) return function () {};
    if (!('IntersectionObserver' in W)) { cb(true); return function () {}; }
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        try { cb(es[i].isIntersecting, es[i]); } catch (e) { console.error('[BJ.inView]', e); }
      }
    }, { rootMargin: margin || '200px' });
    io.observe(el);
    return function () { io.disconnect(); };
  };

  /* ---------------------------------------------------------------- drag */
  BJ.drag = function (el, o) {
    o = o || {};
    var slop = o.tapSlop == null ? 6 : o.tapSlop;
    var cur = null;
    el.classList.add('bj-draggable');

    function trim(t) { var s = cur.s; while (s.length > 1 && t - s[0][2] > 80) s.shift(); }
    function make(e, t) {
      var s = cur.s, a = s[0], b = s[s.length - 1], span = (b[2] - a[2]) / 1000, vx = 0, vy = 0;
      if (s.length > 1 && span > .004) { vx = (b[0] - a[0]) / span; vy = (b[1] - a[1]) / span; }
      return {
        x: e.clientX, y: e.clientY,
        dx: e.clientX - cur.sx, dy: e.clientY - cur.sy,
        vx: vx, vy: vy, t: t - cur.t0, id: cur.id, moved: cur.moved, type: e.pointerType
      };
    }
    function call(fn, p, e) { if (!fn) return; try { return fn(p, e); } catch (err) { console.error('[BJ.drag]', err); } }
    function down(e) {
      if (cur) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.isPrimary === false) return;
      var t = now();
      cur = { id: e.pointerId, sx: e.clientX, sy: e.clientY, t0: t, s: [[e.clientX, e.clientY, t]], moved: false };
      var p = make(e, t);
      if (o.onStart && call(o.onStart, p, e) === false) { cur = null; return; }
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
      el.classList.add('is-grabbing');
    }
    function move(e) {
      if (!cur || e.pointerId !== cur.id) return;
      var t = now();
      cur.s.push([e.clientX, e.clientY, t]); trim(t);
      if (!cur.moved && Math.hypot(e.clientX - cur.sx, e.clientY - cur.sy) > slop) cur.moved = true;
      call(o.onMove, make(e, t), e);
    }
    function up(e) {
      if (!cur || e.pointerId !== cur.id) return;
      var t = now();
      cur.s.push([e.clientX, e.clientY, t]); trim(t);
      var p = make(e, t), moved = cur.moved;
      cur = null;
      el.classList.remove('is-grabbing');
      try { el.releasePointerCapture(e.pointerId); } catch (err) {}
      if (!moved && o.onTap) call(o.onTap, p, e);
      else call(o.onEnd, p, e);
    }
    function cancel(e) {
      if (!cur || e.pointerId !== cur.id) return;
      var p = make(e, now());
      p.cancelled = true;
      cur = null;
      el.classList.remove('is-grabbing');
      call(o.onEnd, p, e);
    }
    function noDrag(e) { e.preventDefault(); }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    el.addEventListener('dragstart', noDrag);
    return function detach() {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
      el.removeEventListener('lostpointercapture', cancel);
      el.removeEventListener('dragstart', noDrag);
      el.classList.remove('bj-draggable', 'is-grabbing');
      cur = null;
    };
  };

  /* ================================================================= SOUND */
  var sfx = BJ.sfx = {};
  var AC = W.AudioContext || W.webkitAudioContext;
  var MASTER = .55;
  var actx = null, master = null, noiseBuf = null, isMuted = false, unlocked = false;
  var loopObjs = [];
  try { isMuted = W.localStorage.getItem('bj-muted') === '1'; } catch (e) {}

  var UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'];
  function attachUnlock() { UNLOCK_EVENTS.forEach(function (n) { W.addEventListener(n, unlock, true); }); }
  function detachUnlock() { UNLOCK_EVENTS.forEach(function (n) { W.removeEventListener(n, unlock, true); }); }
  function buildAudio() {
    actx = new AC();
    var comp = actx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = .003; comp.release.value = .18;
    master = actx.createGain();
    master.gain.value = isMuted ? 0 : MASTER;
    master.connect(comp); comp.connect(actx.destination);
    var len = actx.sampleRate;
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  function markUnlocked() {
    if (unlocked) return;
    unlocked = true;
    detachUnlock();
    loopObjs.forEach(function (L) { L.refresh(); });
  }
  function unlock() {
    if (!AC) { detachUnlock(); return; }
    try {
      if (!actx) buildAudio();
      if (actx.state === 'running') { markUnlocked(); return; }
      var pr = actx.resume();
      if (pr && pr.then) pr.then(function () { if (actx.state === 'running') markUnlocked(); }, function () {});
    } catch (e) {}
  }
  attachUnlock();
  D.addEventListener('visibilitychange', function () {
    if (!actx) return;
    try { if (D.hidden) actx.suspend(); else if (unlocked) actx.resume(); } catch (e) {}
  });

  function envGain(t, peak, a, d, dest) {
    var g = actx.createGain(), p = Math.max(peak, .0002);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    g.connect(dest || master);
    return g;
  }
  function osc(type, f, t, a, d, peak, dest) {
    var o = actx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(envGain(t, peak, a, d, dest));
    o.start(t);
    o.stop(t + a + d + .05);
    return o;
  }
  function noise(t, a, d, peak, ftype, freq, q, dest) {
    var s = actx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    var f = actx.createBiquadFilter();
    f.type = ftype || 'lowpass';
    f.frequency.setValueAtTime(freq || 20000, t);
    if (q) f.Q.value = q;
    s.connect(f); f.connect(envGain(t, peak, a, d, dest));
    s.start(t, Math.random() * .8);
    s.stop(t + a + d + .05);
    return { s: s, f: f };
  }
  function lfo(target, rate, depth, t, dur, type) {
    var l = actx.createOscillator(), g = actx.createGain();
    l.type = type || 'sine'; l.frequency.value = rate; g.gain.value = depth;
    l.connect(g); g.connect(target);
    l.start(t); l.stop(t + dur + .05);
  }
  function ting(t, f, v) {
    osc('triangle', f, t, .002, .7, .42 * v);
    osc('sine', f * 1.4983, t, .002, .5, .42 * .2 * v);
  }
  function tick(t, v) { noise(t, .001, .006, .5 * v, 'highpass', 3500); }

  var VOICES = {
    clap: function (t, v, r) {
      noise(t, .001, .012, .9 * v, 'highpass', 1800);
      noise(t + .009, .001, .014, .75 * v, 'highpass', 1600);
      noise(t + .019, .001, .045, .9 * v, 'highpass', 1800);
      var o = osc('sine', 150 * r, t, .002, .09, .7 * v);
      o.frequency.exponentialRampToValueAtTime(95 * r, t + .09);
      osc('triangle', 640 * r, t, .001, .03, .22 * v);
    },
    shutter: function (t, v, r) {
      noise(t, .001, .008, .7 * v, 'highpass', 3000 * r);
      noise(t + .06, .001, .008, .7 * v, 'highpass', 3000 * r);
      noise(t + .004, .004, .12, .22 * v, 'bandpass', 2500 * r, 1.4);
    },
    boing: function (t, v, r) {
      var o = actx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(300 * r, t);
      o.frequency.linearRampToValueAtTime(620 * r, t + .07);
      o.frequency.exponentialRampToValueAtTime(240 * r, t + .28);
      lfo(o.frequency, 17, 26 * r, t, .3);
      o.connect(envGain(t, .5 * v, .006, .29));
      o.start(t); o.stop(t + .35);
    },
    pop: function (t, v, r) {
      var o = osc('triangle', 880 * r, t, .002, .07, .5 * v);
      o.frequency.exponentialRampToValueAtTime(620 * r, t + .07);
    },
    whoosh: function (t, v, r) {
      var n = noise(t, .1, .22, .5 * v, 'bandpass', 400 * r, 1.3);
      n.f.frequency.exponentialRampToValueAtTime(2200 * r, t + .32);
    },
    twang: function (t, v, r) {
      var o = actx.createOscillator(), lp = actx.createBiquadFilter();
      o.type = 'square';
      o.frequency.setValueAtTime(1250 * r, t);
      o.frequency.exponentialRampToValueAtTime(170 * r, t + .38);
      lp.type = 'lowpass'; lp.frequency.value = 2500;
      lfo(o.frequency, 22, 18 * r, t, .38);
      o.connect(lp); lp.connect(envGain(t, .2 * v, .002, .38));
      o.start(t); o.stop(t + .45);
      noise(t, .001, .006, .6 * v, 'highpass', 2000);
    },
    thud: function (t, v, r) {
      var o = osc('sine', 72 * r, t, .004, .2, .95 * v);
      o.frequency.exponentialRampToValueAtTime(46 * r, t + .2);
      noise(t, .002, .06, .5 * v, 'lowpass', 420);
    },
    ting: function (t, v, r) { ting(t, 1760 * r, v); },
    bell: function (t, v, r) { ting(t, 1568 * r, v); ting(t + .12, 2093 * r, v); },
    coin: function (t, v, r) {
      var o = actx.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(988 * r, t);
      o.frequency.setValueAtTime(1319 * r, t + .07);
      var g = actx.createGain();
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.16 * v + .0002, t + .003);
      g.gain.setValueAtTime(.16 * v + .0002, t + .09);
      g.gain.exponentialRampToValueAtTime(.0001, t + .29);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + .32);
    },
    tick: function (t, v) { tick(t, v); },
    print: function (t, v) {
      for (var i = 0; i < 8; i++) tick(t + i * .028, v * .9);
      var o = osc('sawtooth', 90, t, .01, .22, .05 * v);
      o.frequency.linearRampToValueAtTime(110, t + .22);
    },
    whistle: function (t, v, r) {
      var o = actx.createOscillator();
      o.type = 'sine'; o.frequency.setValueAtTime(1800 * r, t);
      lfo(o.frequency, 7, 40 * r, t, .32);
      o.connect(envGain(t, .3 * v, .03, .29));
      o.start(t); o.stop(t + .37);
    },
    rumble: function (t, v, r) {
      var o = actx.createOscillator(), lp = actx.createBiquadFilter(), trem = actx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55 * r;
      lp.type = 'lowpass'; lp.frequency.value = 180;
      trem.gain.value = .6;
      lfo(trem.gain, 18, .4, t, .24, 'square');
      o.connect(lp); lp.connect(trem); trem.connect(envGain(t, .8 * v, .01, .23));
      o.start(t); o.stop(t + .3);
    },
    win: function (t, v, r) {
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
        osc('triangle', f * r, t + i * .09, .004, i === 3 ? .5 : .22, .42 * v);
      });
      osc('sine', 2093 * r, t + .27, .004, .4, .08 * v);
    },
    fail: function (t, v, r) {
      var o = actx.createOscillator(), lp = actx.createBiquadFilter();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(420 * r, t);
      o.frequency.exponentialRampToValueAtTime(110 * r, t + .42);
      lp.type = 'lowpass'; lp.frequency.value = 1300;
      o.connect(lp); lp.connect(envGain(t, .28 * v, .01, .42));
      o.start(t); o.stop(t + .48);
    },
    stamp: function (t, v, r) {
      osc('sine', 95 * r, t, .002, .09, .9 * v);
      noise(t, .001, .035, .5 * v, 'lowpass', 1200);
    },
    clunk: function (t, v, r) {
      osc('square', 140 * r, t, .002, .06, .22 * v);
      noise(t, .001, .04, .4 * v, 'bandpass', 800 * r, 1.2);
    }
  };

  var LOOPS = {
    whir: function () {
      var out = actx.createGain(); out.gain.value = 0; out.connect(master);
      var s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      var bp = actx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 320; bp.Q.value = 2;
      var flutter = actx.createGain(); flutter.gain.value = .7;
      var l = actx.createOscillator(), lg = actx.createGain();
      l.type = 'square'; l.frequency.value = 24; lg.gain.value = .3;
      l.connect(lg); lg.connect(flutter.gain);
      s.connect(bp); bp.connect(flutter); flutter.connect(out);
      var hum = actx.createOscillator(), hg = actx.createGain();
      hum.type = 'sine'; hum.frequency.value = 48; hg.gain.value = .35;
      hum.connect(hg); hg.connect(out);
      s.start(); l.start(); hum.start();
      return mkLoop(out, [s, l, hum], .55);
    },
    vhs: function () {
      var out = actx.createGain(); out.gain.value = 0; out.connect(master);
      var saw = actx.createOscillator(), sg = actx.createGain();
      saw.type = 'sawtooth'; saw.frequency.value = 3000; sg.gain.value = .025;
      var wob = actx.createOscillator(), wg = actx.createGain();
      wob.frequency.value = 3; wg.gain.value = 40;
      wob.connect(wg); wg.connect(saw.frequency);
      saw.connect(sg); sg.connect(out);
      var s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      var hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800;
      var ng = actx.createGain(); ng.gain.value = .16;
      s.connect(hp); hp.connect(ng); ng.connect(out);
      saw.start(); wob.start(); s.start();
      return mkLoop(out, [saw, wob, s], .5);
    }
  };
  function mkLoop(out, nodes, base) {
    return {
      set: function (v) { try { out.gain.setTargetAtTime(BJ.clamp(v, 0, 1) * base, actx.currentTime, .05); } catch (e) {} },
      stop: function () {
        try {
          var t = actx.currentTime;
          out.gain.setTargetAtTime(0, t, .04);
          nodes.forEach(function (n) { try { n.stop(t + .3); } catch (e) {} });
          setTimeout(function () { try { out.disconnect(); } catch (e) {} }, 500);
        } catch (e) {}
      }
    };
  }

  sfx.play = function (name, o) {
    try {
      if (!actx || isMuted || !VOICES[name] || actx.state !== 'running') return;
      o = o || {};
      VOICES[name](actx.currentTime + .005, o.vol == null ? 1 : o.vol, o.rate || 1);
    } catch (e) {}
  };
  sfx.note = function (freq, o) {
    try {
      if (!actx || isMuted || actx.state !== 'running' || !(freq > 0)) return;
      o = o || {};
      var dur = o.dur == null ? .3 : o.dur, vol = o.vol == null ? .6 : o.vol;
      osc(o.type || 'triangle', freq, actx.currentTime + .005, .005, dur, vol * .7);
    } catch (e) {}
  };
  sfx.loop = function (name) {
    var L = { want: 0, real: null };
    L.refresh = function () {
      if (L.want > 0 && !L.real && actx && unlocked && LOOPS[name]) {
        try { L.real = LOOPS[name](); } catch (e) { L.real = null; }
      }
      if (L.real) L.real.set(L.want);
    };
    return {
      gain: function (v) {
        L.want = Math.max(0, +v || 0);
        if (loopObjs.indexOf(L) < 0) loopObjs.push(L);      /* only live loops wait for the unlock */
        L.refresh();
      },
      stop: function () {
        L.want = 0;
        if (L.real) { L.real.stop(); L.real = null; }
        var i = loopObjs.indexOf(L);
        if (i >= 0) loopObjs.splice(i, 1);
      }
    };
  };
  sfx.setMuted = function (b) {
    isMuted = !!b;
    try { W.localStorage.setItem('bj-muted', isMuted ? '1' : '0'); } catch (e) {}
    if (master && actx) { try { master.gain.setTargetAtTime(isMuted ? 0 : MASTER, actx.currentTime, .02); } catch (e) {} }
    var btns = D.querySelectorAll('.bj-mute');
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    BJ.emit('mute', { muted: isMuted });
  };
  sfx.toggle = function () { sfx.setMuted(!isMuted); };
  Object.defineProperty(sfx, 'muted', { get: function () { return isMuted; } });
  Object.defineProperty(sfx, 'unlocked', { get: function () { return unlocked; } });

  /* ==================================================================== FX */
  var fx = BJ.fx = {};
  var cv = D.getElementById('bj-fx');
  var c2 = cv && cv.getContext ? cv.getContext('2d') : null;
  var parts = [], fxOff = null, cssW = 0, cssH = 0, dpr = 1, sprites = {};
  var CONF = ['#E0893A', '#EFC66A', '#E0473B', '#F2EAE3', '#5A2E24'];
  var MAXP = 120;

  function fxSize() {
    var w = W.innerWidth, h = W.innerHeight;
    var d = Math.min(W.devicePixelRatio || 1, BJ.narrow() ? 1.5 : 2);
    if (w === cssW && h === cssH && d === dpr) return;
    cssW = w; cssH = h; dpr = d;
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
  }
  var rsT = 0;
  W.addEventListener('resize', function () {
    clearTimeout(rsT);
    rsT = setTimeout(function () { if (c2 && parts.length) fxSize(); }, 120);
  });
  function sprite(kind) {
    if (sprites[kind]) return sprites[kind];
    var s = D.createElement('canvas'); s.width = s.height = 64;
    var g = s.getContext('2d');
    var gr = g.createRadialGradient(26, 24, 2, 32, 32, 32);
    if (kind === 'fluff') {
      gr.addColorStop(0, 'rgba(214,207,205,1)');
      gr.addColorStop(.45, 'rgba(185,176,174,.95)');
      gr.addColorStop(.8, 'rgba(141,131,130,.55)');
      gr.addColorStop(1, 'rgba(141,131,130,0)');
    } else {
      gr.addColorStop(0, 'rgba(230,210,192,1)');
      gr.addColorStop(.5, 'rgba(214,189,167,.9)');
      gr.addColorStop(.85, 'rgba(170,142,126,.4)');
      gr.addColorStop(1, 'rgba(170,142,126,0)');
    }
    g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
    sprites[kind] = s;
    return s;
  }
  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fxTick(dt) {
    var sy = W.scrollY || W.pageYOffset || 0;
    c2.setTransform(1, 0, 0, 1, 0, 0);
    c2.clearRect(0, 0, cv.width, cv.height);
    c2.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); i--; continue; }
      var dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy = p.vy * dr + p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      var t = p.age / p.life, x = p.x, y = p.y + (p.sy - sy);
      if (y < -60 || y > cssH + 60) continue;
      if (p.k === 'puff') {
        var sz = p.r * (1 + t * p.grow);
        c2.globalAlpha = Math.pow(1 - t, 1.4) * p.a;
        c2.drawImage(p.img, x - sz, y - sz, sz * 2, sz * 2);
      } else if (p.k === 'chalk') {
        c2.globalAlpha = (1 - t) * .95;
        c2.fillStyle = p.c;
        c2.save(); c2.translate(x, y); c2.rotate(p.rot);
        c2.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * .7);
        c2.restore();
      } else {
        c2.globalAlpha = t > .75 ? (1 - t) / .25 : 1;
        c2.save(); c2.translate(x, y); c2.rotate(p.rot);
        c2.scale(1, Math.cos(p.flip + p.age * p.fs));
        c2.fillStyle = p.c;
        rrect(c2, -5, -3.5, 10, 7, 1.8); c2.fill();
        c2.fillStyle = p.c === '#5A2E24' ? '#F3E6D8' : 'rgba(58,33,28,.4)';
        c2.fillRect(-3.6, -2.6, 1.6, 1.4); c2.fillRect(2, -2.6, 1.6, 1.4);
        c2.restore();
      }
    }
    c2.globalAlpha = 1;
    if (!parts.length) {
      c2.setTransform(1, 0, 0, 1, 0, 0);
      c2.clearRect(0, 0, cv.width, cv.height);
      if (fxOff) { fxOff(); fxOff = null; }
    }
  }
  function spawn(list) {
    if (!c2 || BJ.reduced || !list.length) return;
    fxSize();
    var sy = W.scrollY || W.pageYOffset || 0;
    for (var i = 0; i < list.length; i++) { list[i].sy = sy; list[i].age = 0; parts.push(list[i]); }
    if (parts.length > MAXP) parts.splice(0, parts.length - MAXP);
    if (!fxOff) fxOff = BJ.ticker.add(fxTick);
  }
  var R = BJ.rand;
  fx.fluff = function (x, y, n) {
    if (BJ.reduced || !c2) return;
    n = n == null ? 7 : n;
    var out = [], img = sprite('fluff');
    for (var i = 0; i < n; i++) {
      var a = R(0, Math.PI * 2), sp = R(70, 150);
      out.push({ k: 'puff', img: img, x: x + Math.cos(a) * R(2, 14), y: y + Math.sin(a) * R(2, 14),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: -30, drag: .9, life: .6, r: R(6, 14), grow: .8, a: .95, rot: 0, vr: 0 });
    }
    spawn(out);
  };
  fx.dust = function (x, y, n) {
    if (BJ.reduced || !c2) return;
    n = n == null ? 8 : n;
    var out = [], img = sprite('dust');
    for (var i = 0; i < n; i++) {
      var dir = i % 2 ? 1 : -1;
      out.push({ k: 'puff', img: img, x: x + dir * R(0, 12), y: y - R(0, 6),
        vx: dir * R(60, 200), vy: -R(30, 120), g: 260, drag: .92, life: .5, r: R(5, 12), grow: 1.3, a: .9, rot: 0, vr: 0 });
    }
    spawn(out);
  };
  fx.chalk = function (x, y, n) {
    if (BJ.reduced || !c2) return;
    n = n == null ? 8 : n;
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push({ k: 'chalk', c: Math.random() < .7 ? '#F2EAE3' : '#D9CFC8', x: x + R(-8, 8), y: y + R(-4, 4),
        vx: R(-70, 70), vy: R(-90, 10), g: 300, drag: .96, life: R(.55, .8), r: R(1.6, 3.4), rot: R(0, 3), vr: R(-6, 6) });
    }
    spawn(out);
  };
  fx.confetti = function (x, y, n) {
    if (BJ.reduced || !c2) return;
    n = n == null ? 60 : n;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = -Math.PI / 2 + R(-1.1, 1.1), sp = R(260, 640);
      out.push({ k: 'conf', c: CONF[i % CONF.length], x: x + R(-10, 10), y: y + R(-6, 6),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 900, drag: .985, life: R(1.4, 1.9),
        rot: R(0, 6.28), vr: R(-8, 8), flip: R(0, 6.28), fs: R(8, 14) });
    }
    spawn(out);
  };

  /* ================================================================ UI FX */
  function ensurePositioned(host) {
    try { if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; } catch (e) {}
  }
  function len(v) { return typeof v === 'number' ? v + 'px' : String(v); }

  var sayRec = typeof WeakMap === 'function' ? new WeakMap() : null;
  BJ.say = function (el, text, ms) {
    if (!el) return Promise.resolve();
    if (ms == null) ms = 2200;
    var prev = sayRec && sayRec.get(el);
    if (prev) { clearTimeout(prev.t); prev.res(); }
    el.textContent = text;
    el.setAttribute('data-on', '0');
    void el.offsetWidth;
    el.setAttribute('data-on', '1');
    return new Promise(function (res) {
      var rec = { res: res, t: 0 };
      if (sayRec) sayRec.set(el, rec);
      if (ms > 0) {
        rec.t = setTimeout(function () {
          el.setAttribute('data-on', '0');
          if (sayRec && sayRec.get(el) === rec) sayRec.delete(el);
          res();
        }, ms);
      } else res();
    });
  };

  BJ.stamp = function (host, text, o) {
    if (!host) return null;
    o = o || {};
    ensurePositioned(host);
    var el = D.createElement('span');
    el.className = 'bj-stamp' + (BJ.reduced ? ' is-calm' : '');
    el.textContent = text;
    el.setAttribute('data-tone', o.tone || 'tally');
    el.setAttribute('data-size', o.size || 'm');
    el.style.setProperty('--rot', (o.rot == null ? -6 : o.rot) + 'deg');
    el.style.setProperty('--x', len(o.x == null ? '50%' : o.x));
    el.style.setProperty('--y', len(o.y == null ? '50%' : o.y));
    host.appendChild(el);
    sfx.play('stamp');
    var ms = o.ms == null ? 1600 : o.ms;
    if (ms > 0) {
      setTimeout(function () {
        if (!el.parentNode) return;
        if (BJ.reduced || !el.animate) { el.remove(); return; }
        var a = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
        a.onfinish = function () { el.remove(); };
      }, ms);
    }
    return el;
  };

  var live = D.getElementById('bj-live');
  var annT = 0;
  BJ.announce = function (text) {
    if (!live) return;
    live.textContent = '';
    clearTimeout(annT);
    annT = setTimeout(function () { live.textContent = text; }, 60);
  };

  function jitter(el, ms, ampX, ampY, ampR) {
    if (!el || BJ.reduced || !el.animate) return null;
    var kf = [], n = 7;
    for (var i = 0; i <= n; i++) {
      var f = 1 - i / n;
      var x = (i === 0 || i === n) ? 0 : R(-ampX, ampX) * f;
      var y = (i === 0 || i === n) ? 0 : R(-ampY, ampY) * f;
      var r = (i === 0 || i === n) ? 0 : R(-ampR, ampR) * f;
      kf.push({ transform: 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) rotate(' + r.toFixed(2) + 'deg)' });
    }
    var opt = { duration: ms, easing: 'linear', composite: 'add' };
    try { return el.animate(kf, opt); } catch (e) { try { delete opt.composite; return el.animate(kf, opt); } catch (e2) { return null; } }
  }
  BJ.shake = function (el, px, ms) {
    px = px == null ? 6 : px;
    return jitter(el, ms || 260, px, px * .6, 0);
  };
  BJ.rumble = function (el, ms) {
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    return jitter(el, ms || 220, 3, 3, 2);
  };
  BJ.flash = function (host, ms) {
    if (!host) return;
    ms = ms || 110;
    ensurePositioned(host);
    var el = D.createElement('span');
    el.setAttribute('aria-hidden', 'true');
    if (BJ.reduced || !el.animate) {
      el.className = 'bj-flash is-calm';
      host.appendChild(el);
      setTimeout(function () { el.remove(); }, 360);
      return;
    }
    el.className = 'bj-flash';
    host.appendChild(el);
    var a = el.animate([{ opacity: 1 }, { opacity: .95, offset: .3 }, { opacity: 0 }], { duration: ms, easing: 'ease-out', fill: 'forwards' });
    a.onfinish = function () { el.remove(); };
  };

  /* ======================================================= SHELL BEHAVIOUR */
  /* is-live: idle animations only run near the viewport */
  var scenes = D.querySelectorAll('.bj-scene');
  if ('IntersectionObserver' in W) {
    var liveIO = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) es[i].target.classList.toggle('is-live', es[i].isIntersecting);
    }, { rootMargin: '200px 0px' });
    for (var si = 0; si < scenes.length; si++) liveIO.observe(scenes[si]);
  } else {
    for (var sj = 0; sj < scenes.length; sj++) scenes[sj].classList.add('is-live');
  }

  var hud = BJ.hud;
  var navLinks = hud ? [].slice.call(hud.querySelectorAll('.bj-hud__nav a')) : [];
  var navTargets = navLinks.map(function (a) {
    var id = (a.getAttribute('href') || '').slice(1);
    return { a: a, el: id ? D.getElementById(id) : null };
  }).filter(function (n) { return n.el; });

  /* mute button */
  var muteBtns = D.querySelectorAll('.bj-mute');
  for (var mi = 0; mi < muteBtns.length; mi++) {
    muteBtns[mi].setAttribute('aria-pressed', isMuted ? 'true' : 'false');
    muteBtns[mi].addEventListener('click', function () {
      sfx.setMuted(!isMuted);
      if (!isMuted) setTimeout(function () { sfx.play('pop'); }, 30);
    });
  }

  /* scene menu (narrow screens) */
  var menuBtn = hud ? hud.querySelector('.bj-hud__menu') : null;
  var navEl = hud ? hud.querySelector('.bj-hud__nav') : null;
  function setMenu(open) {
    if (!menuBtn || !navEl) return;
    menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    navEl.classList.toggle('is-open', open);
  }
  if (menuBtn && navEl) {
    menuBtn.addEventListener('click', function () {
      var open = menuBtn.getAttribute('aria-expanded') !== 'true';
      setMenu(open);
      sfx.play('clunk', { vol: .35, rate: open ? 1.2 : .9 });
      if (open) { var a0 = navEl.querySelector('a'); if (a0) { try { a0.focus({ preventScroll: true }); } catch (e) { a0.focus(); } } }
    });
    navEl.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    D.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menuBtn.getAttribute('aria-expanded') === 'true') { setMenu(false); menuBtn.focus(); }
    });
    D.addEventListener('pointerdown', function (e) {
      if (menuBtn.getAttribute('aria-expanded') === 'true' && !navEl.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
    }, true);
  }

  /* HUD show / hide (the mute button never leaves) */
  var hudHidden = false;
  function setHud(h) {
    if (!hud || h === hudHidden) return;
    hudHidden = h;
    hud.setAttribute('data-hidden', h ? 'true' : 'false');
    if (h) setMenu(false);
  }
  function hudKeyFocus() {
    try { return !!hud.querySelector(':focus-visible'); } catch (e) { return hud.contains(D.activeElement); }
  }
  if (hud) hud.addEventListener('focusin', function () { if (hudKeyFocus()) setHud(false); });

  /* ticket wiggle after 12s of calm */
  var ticket = hud ? hud.querySelector('.bj-ticket') : null;
  var lastAct = Date.now();
  function activity() { lastAct = Date.now(); }
  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach(function (n) {
    W.addEventListener(n, activity, { passive: true, capture: true });
  });
  setInterval(function () {
    if (!ticket || D.hidden || BJ.reduced || hudHidden) return;
    if (Date.now() - lastAct < 12000) return;
    lastAct = Date.now();
    var kf = [{ transform: 'rotate(0deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-4deg)' },
      { transform: 'rotate(2.5deg)' }, { transform: 'rotate(-1.5deg)' }, { transform: 'rotate(0deg)' }];
    var opt = { duration: 720, easing: 'ease-in-out', composite: 'add' };
    try { ticket.animate(kf, opt); } catch (e) {}
  }, 1000);

  /* ------------------------------------------------------------- slates */
  var slates = [].map.call(D.querySelectorAll('.bj-slate'), function (el) {
    return { el: el, board: el.querySelector('.bj-slate__board'), val: null, armed: null, anim: null };
  });
  var lastClap = 0;
  function setArm(s, deg) {
    if (s.val !== null && Math.abs(s.val - deg) < .05) return;
    s.val = deg;
    s.el.style.setProperty('--arm', deg.toFixed(2) + 'deg');
  }
  function scrollT(s, vh) {
    var r = s.el.getBoundingClientRect();
    return BJ.clamp((0.8 * vh - r.top) / (0.35 * vh), 0, 1);
  }
  function scrollArm(t) { return -24 + 24 * BJ.ease.outCubic(t); }
  function slateSnap(s) {
    s.el.classList.remove('is-snap');
    void s.el.offsetWidth;
    s.el.classList.add('is-snap');
    setTimeout(function () { s.el.classList.remove('is-snap'); }, 150);
    var t = now();
    if (t - lastClap > 180) { sfx.play('clap', { vol: .5 }); lastClap = t; }
    var b = (s.board || s.el).getBoundingClientRect();
    fx.chalk(b.left + 22, b.top + 4, 8);
    BJ.takes.add('slate');
  }
  function slatesFrame(vh) {
    for (var i = 0; i < slates.length; i++) {
      var s = slates[i];
      if (s.anim) continue;
      if (BJ.reduced) { setArm(s, -12); s.armed = null; continue; }
      var r = s.el.getBoundingClientRect();
      if (r.bottom < -400 || r.top > vh + 400) {
        var far = r.top > vh ? 0 : 1;
        setArm(s, scrollArm(far));
        s.armed = far === 0;
        continue;
      }
      var t = scrollT(s, vh);
      setArm(s, scrollArm(t));
      if (s.armed === null) s.armed = t < 1;
      if (t >= 1 && s.armed) { s.armed = false; slateSnap(s); }
      else if (t <= 0) s.armed = true;
    }
  }
  function slateClick(s) {
    if (s.anim) return;
    if (BJ.reduced) {
      setArm(s, 0);
      slateSnap(s);
      setTimeout(function () { if (BJ.reduced) setArm(s, -12); }, 380);
      return;
    }
    var start = s.val == null ? -24 : s.val;
    var phase = start > -6 ? 0 : 1, t0 = 0, from = start;
    s.anim = BJ.ticker.add(function (dt, tnow) {
      if (!t0) t0 = tnow;
      var e = tnow - t0;
      if (phase === 0) {                       /* already closed: lift it first */
        var k0 = Math.min(e / 140, 1);
        setArm(s, from + (-26 - from) * BJ.ease.outCubic(k0));
        if (k0 >= 1) { phase = 1; t0 = tnow; from = -26; }
      } else if (phase === 1) {                /* slam */
        var k1 = Math.min(e / 90, 1);
        setArm(s, from * (1 - k1 * k1));
        if (k1 >= 1) { phase = 2; t0 = tnow; slateSnap(s); }
      } else {                                 /* back to the scroll-driven angle */
        var k2 = Math.min(e / 300, 1);
        var target = scrollArm(scrollT(s, W.innerHeight));
        setArm(s, target * BJ.ease.outBack(k2));
        if (k2 >= 1) { var off = s.anim; s.anim = null; if (off) off(); }
      }
    });
  }
  slates.forEach(function (s) {
    s.el.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target : null;
      if (t && !t.closest('.bj-slate__arm') && t.closest('a, button, input, select, textarea')) return;
      slateClick(s);
    });
  });

  /* ------------------------------------------------------------- guides */
  /* <div class="bj-guide" data-lines="a|b|c" data-from="l|r">: a small pockets
     Benj standing on a scene's edge. Walks in the first time the scene shows,
     says his first line, and says the next one when tapped (pointer bonus). */
  [].forEach.call(D.querySelectorAll('.bj-guide'), function (g) {
    var btn = g.querySelector('.bj-guide__btn'), img = btn && btn.querySelector('img');
    var bub = g.querySelector('.bj-bubble');
    var lines = (g.getAttribute('data-lines') || '').split('|').filter(Boolean);
    var idx = 0, greeted = false, hopA = null;
    if (!btn || !bub || !lines.length) return;
    function talk(ms) { BJ.say(bub, lines[idx % lines.length], ms || 2600); idx++; }
    function hopIt() {
      if (BJ.reduced || !btn.animate) return;
      if (hopA) hopA.cancel();
      try {
        hopA = btn.animate([
          { transform: 'translateY(0) scale(1,1)' },
          { transform: 'translateY(0) scale(1.08,.9)', offset: .18 },
          { transform: 'translateY(-22px) scale(.96,1.05)', offset: .5 },
          { transform: 'translateY(0) scale(1.05,.94)', offset: .8 },
          { transform: 'translateY(0) scale(1,1)' }
        ], { duration: 520, easing: 'ease-out' });
      } catch (e) {}
    }
    btn.addEventListener('click', function () {
      hopIt();
      sfx.play('boing', { vol: .45, rate: 1.25 });
      talk();
    });
    if (!('IntersectionObserver' in W)) return;
    var io = new IntersectionObserver(function (es) {
      for (var i = 0; i < es.length; i++) {
        if (!es[i].isIntersecting || greeted) continue;
        greeted = true;
        io.disconnect();
        var from = g.getAttribute('data-from') === 'r' ? 1 : -1;
        if (!BJ.reduced && btn.animate) {
          try {
            btn.animate([
              { transform: 'translateX(' + (from * 70) + 'px) rotate(' + (from * 6) + 'deg)' },
              { transform: 'translateX(' + (from * 30) + 'px) translateY(-10px) rotate(' + (-from * 3) + 'deg)', offset: .45 },
              { transform: 'translateX(0) translateY(0) rotate(0deg)' }
            ], { duration: 620, easing: 'cubic-bezier(.22,1,.36,1)' });
          } catch (e) {}
        }
        setTimeout(function () { talk(3200); }, BJ.reduced ? 0 : 520);
      }
    }, { threshold: .9 });
    io.observe(g);
  });

  /* ------------------------------------------------ scroll-driven frame */
  var lastY = W.scrollY || 0, queued = false, curNav = null;
  function scrollFrame() {
    queued = false;
    var y = W.scrollY || W.pageYOffset || 0, vh = W.innerHeight;
    if (hud) {
      if (y < 120) setHud(false);
      var dy = y - lastY;
      if (Math.abs(dy) > 8) {
        if (dy > 0 && y > 120 && !hudKeyFocus()) setHud(true);
        else if (dy < 0) setHud(false);
        lastY = y;
      }
    }
    if (navTargets.length) {
      var line = vh * .4, act = null;
      for (var i = 0; i < navTargets.length; i++) {
        var r = navTargets[i].el.getBoundingClientRect();
        if (r.top <= line) act = navTargets[i];
      }
      if (!act) act = navTargets[0];
      if (act !== curNav) {
        for (var j = 0; j < navTargets.length; j++) {
          if (navTargets[j] === act) navTargets[j].a.setAttribute('aria-current', 'true');
          else navTargets[j].a.removeAttribute('aria-current');
        }
        curNav = act;
      }
    }
    slatesFrame(vh);
  }
  function queueScroll() {
    if (queued) return;
    queued = true;
    W.requestAnimationFrame(scrollFrame);
  }
  W.addEventListener('scroll', function () { activity(); queueScroll(); }, { passive: true });
  W.addEventListener('resize', queueScroll, { passive: true });
  BJ.on('reduced', queueScroll);
  scrollFrame();
  BJ.fontsReady.then(queueScroll);
})();
