/* ==========================================================================
   PLATEAU : the hero stunt.
   Benj (float pose, hi-res, rotated for the ragdoll) hangs on two Verlet stunt
   wires from a clay truss; three props and the hire sign swing on elastic
   fishing lines; two props sit on the floor; the clay letters B E N J are a
   xylophone. Pull too hard and the wires snap: LA CASCADE RATÉE.
   The simulation sleeps as soon as everything is at rest (idle sway is CSS).
   Coordinates: px inside .pl-set. CSS holds every rest position; JS only
   writes transforms relative to it (so the page is complete without JS).
   ========================================================================== */
BJ.section('plateau', function (root) {
  'use strict';
  var Win = window, Doc = document;
  var set = root.querySelector('.pl-set');
  if (!set) return;
  function q(s) { return set.querySelector(s); }
  function qa(s) { return [].slice.call(set.querySelectorAll(s)); }

  var NB = ' ', DEG = 180 / Math.PI;
  var clamp = BJ.clamp, hyp = Math.hypot;
  var perf = Win.performance || Date;
  function now() { return perf.now(); }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }

  var benjEl = q('.pl-benj'), img = q('.pl-benj__img'), hit = q('.pl-benj__hit');
  var shadowEl = q('.pl-benj-shadow');
  var bAnchor = q('.pl-bubble-anchor'), bubble = q('.pl-bubble');
  var hint = q('.pl-hint'), light = q('.pl-light'), tcEl = q('.pl-tc'), trail = q('.pl-trail');
  var truss = q('.pl-truss'), rig = q('.pl-rig'), introArm = q('.pl-intro-arm');
  var letters = qa('.pl-letter');
  if (!benjEl || !img || !hit) return;

  root.classList.add('pl-on');
  BJ.load(['float']);

  /* ------------------------------------------------------------ geometry */
  var G = { w: 0, h: 0, bw: 0, bh: 0, R0: { x: 0, y: 0 }, narrow: false, ok: false };
  var anchors = {};
  var poseG = {};

  function computePoseGeo() {
    poseG.float = { w: G.bw, h: G.bh, ox: -.36 * G.bw, oy: -.5 * G.bh };
  }
  /* pose point [x%, y%] -> set px, for a body whose pivot (torso) is at x,y rotated th deg */
  function worldPt(pose, pt, x, y, th) {
    var g = poseG[pose], lx = g.ox + pt[0] / 100 * g.w, ly = g.oy + pt[1] / 100 * g.h;
    var a = th / DEG, c = Math.cos(a), s = Math.sin(a);
    return { x: x + lx * c - ly * s, y: y + lx * s + ly * c };
  }
  function applyImgBox(pose) {
    var g = poseG[pose];
    if (!g) return;
    if (pose === 'float') { img.style.left = ''; img.style.top = ''; img.style.width = ''; }
    else {
      img.style.left = f1(.36 * G.bw + g.ox) + 'px';
      img.style.top = f1(.5 * G.bh + g.oy) + 'px';
      img.style.width = f1(g.w) + 'px';
    }
  }
  function toSet(cx, cy) {
    var r = set.getBoundingClientRect();
    return { x: cx - r.left, y: cy - r.top };
  }

  /* ---------------------------------------------------------------- Benj */
  var B = {
    x: 0, y: 0, vx: 0, vy: 0, th: 0, w: 0, spin: 0, spin0: 0,
    mode: 'free', pose: 'float', poseT: 0,
    tx: 0, ty: 0, gox: 0, goy: 0, pullT: 0, yanks: [], lastYank: 0, dropT: 0,
    firstGrab: true, firstLean: true, ghostT: 0
  };
  var Dn = null;            /* dangle state (hip point pendulum) */
  var cascades = 0, stampEl = null, timers = [];
  function later(ms, fn) { var id = setTimeout(fn, ms); timers.push(id); return id; }

  function squash() {
    if (BJ.reduced || !img.animate) return;
    try { img.animate([{ transform: 'scale(1.08, .9)' }, { transform: 'scale(1, 1)' }], { duration: 240, easing: 'cubic-bezier(.34, 1.56, .64, 1)', composite: 'add' }); } catch (e) {}
  }

  /* ---------------------------------------------------------- bubble */
  var bub = { w: 160, h: 46, lastT: -1e9 };
  function say(text, ms) {
    BJ.say(bubble, text, ms);
    bub.w = bubble.offsetWidth || bub.w;
    bub.h = bubble.offsetHeight || bub.h;
    bub.lastT = now();
  }

  /* ---------------------------------------------------------------- hint */
  function hideHint() { if (hint && !hint.classList.contains('is-done')) hint.classList.add('is-done'); }

  /* --------------------------------------------------------------- ropes */
  function makeRope(name) {
    return {
      name: name, n: 12, pts: [], L: 100, seg: 10, pinB: true,
      el: rig.querySelector('[data-wire="' + name + '"]'),
      hi: rig.querySelector('[data-wire-hi="' + name + '"]')
    };
  }
  var ropes = { l: makeRope('l'), r: makeRope('r') };
  function ropeEnds(r) {
    var a = anchors[r.name === 'l' ? 'wl' : 'wr'];
    var key = r.name === 'l' ? 'back' : 'hip';
    var b = worldPt('float', BJ.POSES.float.harness[key], B.x, B.y, B.th + B.spin);
    return { a: a, b: b };
  }
  function ropeRestLen(name) {
    var a = anchors[name === 'l' ? 'wl' : 'wr'];
    var b = worldPt('float', BJ.POSES.float.harness[name === 'l' ? 'back' : 'hip'], G.R0.x, G.R0.y, 0);
    return hyp(b.x - a.x, b.y - a.y) * 1.03;
  }
  function ropeReset(r) {
    var e = ropeEnds(r);
    r.L = ropeRestLen(r.name);
    r.seg = r.L / (r.n - 1);
    r.pts = [];
    for (var i = 0; i < r.n; i++) {
      var t = i / (r.n - 1), x = e.a.x + (e.b.x - e.a.x) * t, y = e.a.y + (e.b.y - e.a.y) * t;
      r.pts.push({ x: x, y: y, px: x, py: y });
    }
    r.pinB = true;
    r.el.classList.remove('is-gone'); r.hi.classList.remove('is-gone');
  }
  function resetRopes() { ropeReset(ropes.l); ropeReset(ropes.r); }
  function ropeStep(r, h) {
    var p = r.pts, n = r.n, damp = Math.pow(.985, h * 60), g = 1400 * h * h, i, it;
    var e = ropeEnds(r);
    for (i = 1; i < n; i++) {
      if (i === n - 1 && r.pinB) continue;
      var o = p[i], vx = (o.x - o.px) * damp, vy = (o.y - o.py) * damp;
      o.px = o.x; o.py = o.y;
      o.x += vx; o.y += vy + g;
    }
    p[0].x = p[0].px = e.a.x; p[0].y = p[0].py = e.a.y;
    if (r.pinB) { p[n - 1].x = p[n - 1].px = e.b.x; p[n - 1].y = p[n - 1].py = e.b.y; }
    for (it = 0; it < 6; it++) {
      for (i = 0; i < n - 1; i++) {
        var A = p[i], C = p[i + 1], dx = C.x - A.x, dy = C.y - A.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d <= r.seg || d < .001) continue;
        var diff = (d - r.seg) / d, aPin = i === 0, cPin = r.pinB && i + 1 === n - 1;
        if (aPin && cPin) continue;
        if (aPin) { C.x -= dx * diff; C.y -= dy * diff; }
        else if (cPin) { A.x += dx * diff; A.y += dy * diff; }
        else { A.x += dx * diff * .5; A.y += dy * diff * .5; C.x -= dx * diff * .5; C.y -= dy * diff * .5; }
      }
    }
  }
  function ropePath(r, off) {
    var p = r.pts, n = p.length, s = 'M' + f1(p[0].x + off) + ' ' + f1(p[0].y + off);
    for (var i = 1; i < n - 1; i++) {
      var mx = (p[i].x + p[i + 1].x) / 2, my = (p[i].y + p[i + 1].y) / 2;
      s += 'Q' + f1(p[i].x + off) + ' ' + f1(p[i].y + off) + ' ' + f1(mx + off) + ' ' + f1(my + off);
    }
    return s + 'L' + f1(p[n - 1].x + off) + ' ' + f1(p[n - 1].y + off);
  }
  function ropeDraw(r) {
    var p = r.pts, n = p.length, d, taut = false;
    if (r.pinB) {
      var a = p[0], b = p[n - 1];
      taut = hyp(b.x - a.x, b.y - a.y) > r.L * 1.15;
    }
    if (taut) {
      d = 'M' + f1(p[0].x) + ' ' + f1(p[0].y) + 'L' + f1(p[n - 1].x) + ' ' + f1(p[n - 1].y);
      r.el.setAttribute('d', d);
      r.hi.setAttribute('d', 'M' + f1(p[0].x - .6) + ' ' + f1(p[0].y - .6) + 'L' + f1(p[n - 1].x - .6) + ' ' + f1(p[n - 1].y - .6));
    } else {
      r.el.setAttribute('d', ropePath(r, 0));
      r.hi.setAttribute('d', ropePath(r, -.7));
    }
    if (taut !== r.taut) { r.taut = taut; r.el.classList.toggle('is-taut', taut); r.hi.classList.toggle('is-taut', taut); }
  }
  function cutRope(r, dirX) {
    r.pinB = false;
    var p = r.pts, n = p.length, hstep = 1 / 120;
    for (var i = n - 4; i < n; i++) {
      var k = (i - (n - 5)) / 4;
      p[i].py = p[i].y + 900 * hstep * k;
      p[i].px = p[i].x - dirX * 320 * hstep * k;
    }
    later(1500, function () { if (!r.pinB) { r.el.classList.add('is-gone'); r.hi.classList.add('is-gone'); } });
  }

  /* ------------------------------------------------------- hanging props */
  var KLINE = 420, GP = 1600;
  var hang = {};
  ['clap', 'controller', 'camera', 'hire'].forEach(function (name, i) {
    var el = q('[data-prop="' + name + '"]');
    if (!el) return;
    hang[name] = {
      name: name, el: el, img: el.querySelector('img'),
      line: rig.querySelector('[data-line="' + name + '"]'),
      clampEl: truss.querySelector('[data-anchor="' + name + '"]'),
      x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, rx: 0, ry: 0, ax: 0, ay: 0, ax0: 0,
      L: 50, Ltop: 30, w: 50, h: 50, r: 20, grab: false, tx: 0, ty: 0, gox: 0, goy: 0,
      fxT: 0, phase: i * 2.1, moved: 0
    };
  });
  if (hang.hire) hang.hire.img = hang.hire.el.querySelector('.pl-hire__card');
  /* ------------------------------------------------------- floor props */
  var dumb = { name: 'dumbbell', el: q('.pl-prop[data-prop="dumbbell"]'), sh: q('[data-sh="dumbbell"]'),
    hx: 0, x: 0, vx: 0, lift: 0, vl: 0, tl: 0, tx: 0, grab: false, rot: 0, idleT: 0, w: 0, h: 0, sx: 0 };
  var roll = { name: 'filmroll', el: q('.pl-prop[data-prop="filmroll"]'), sh: q('[data-sh="filmroll"]'),
    hx: 0, x: 0, vx: 0, rot: 0, mode: 'idle', t: 0, from: 0, w: 0, r: 20, off: 0, tickAcc: 0 };
  if (dumb.el) dumb.img = dumb.el.querySelector('img');
  if (roll.el) roll.img = roll.el.querySelector('img');

  /* -------------------------------------------------------------- measure */
  var letterC = [];
  function measureLetters() {
    var sr = set.getBoundingClientRect();
    letterC = letters.map(function (el) {
      var r = el.getBoundingClientRect();
      return { x: r.left - sr.left + r.width / 2, y: r.top - sr.top + r.height / 2 };
    });
  }
  function measure() {
    var oldR = { x: G.R0.x, y: G.R0.y }, first = !G.ok;
    G.w = set.clientWidth; G.h = set.clientHeight;
    if (!G.w || !G.h) return;
    G.narrow = BJ.narrow();
    G.bw = benjEl.offsetWidth; G.bh = benjEl.offsetHeight;
    G.R0 = { x: benjEl.offsetLeft + .36 * G.bw, y: benjEl.offsetTop + .5 * G.bh };
    G.hud = BJ.narrow() ? 48 : 56;
    computePoseGeo();
    applyImgBox(B.pose);
    rig.setAttribute('viewBox', '0 0 ' + G.w + ' ' + G.h);
    qa('.pl-clamp').forEach(function (el) {
      anchors[el.getAttribute('data-anchor')] = {
        x: truss.offsetLeft + el.offsetLeft + el.offsetWidth / 2,
        y: truss.offsetTop + el.offsetTop + el.offsetHeight - 3
      };
    });
    Object.keys(hang).forEach(function (k) {
      var P = hang[k], el = P.el, a = anchors[k] || { x: P.rx, y: 0 };
      var orx = P.rx, ory = P.ry;
      P.w = el.offsetWidth; P.h = el.offsetHeight;
      P.rx = el.offsetLeft + P.w / 2; P.ry = el.offsetTop + P.h / 2;
      P.ax0 = P.ax = a.x; P.ay = a.y;
      var restD = hyp(P.rx - a.x, P.ry - a.y);
      P.L = Math.max(10, restD - GP / KLINE);
      P.Ltop = Math.max(4, restD - P.h * .46);
      P.r = Math.min(P.w, P.h * 1.15) * .42;
      if (first) { P.x = P.rx; P.y = P.ry; }
      else { P.x += P.rx - orx; P.y += P.ry - ory; }
    });
    if (dumb.el) {
      var ohx = dumb.hx;
      dumb.w = dumb.el.offsetWidth; dumb.h = dumb.el.offsetHeight;
      dumb.hx = dumb.el.offsetLeft + dumb.w / 2;
      dumb.base = dumb.el.offsetTop + dumb.h;
      if (first) dumb.x = dumb.hx; else dumb.x += dumb.hx - ohx;
    }
    if (roll.el) {
      var orx2 = roll.hx;
      roll.w = roll.el.offsetWidth;
      roll.hx = roll.el.offsetLeft + roll.w / 2;
      roll.r = roll.w * .36;
      if (first) roll.x = roll.hx; else roll.x += roll.hx - orx2;
    }
    if (first) { B.x = G.R0.x; B.y = G.R0.y; }
    else { B.x += G.R0.x - oldR.x; B.y += G.R0.y - oldR.y; if (Dn) { Dn.x += G.R0.x - oldR.x; Dn.y += G.R0.y - oldR.y; } }
    G.ok = true;
    if (B.mode !== 'dangle' && B.mode !== 'gone') resetRopes();
    measureLetters();
    lightRest();
  }

  /* ----------------------------------------------------------- key light */
  var L = { x: 0, y: 0, tx: 0, ty: 0, rx: 0, ry: 0, par: 0 };
  function lightRest() {
    L.rx = .55 * G.w; L.ry = .35 * G.h;
    if (!L.x && !L.y) { L.x = L.tx = L.rx; L.y = L.ty = L.ry; }
  }
  set.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || !BJ.fine || BJ.reduced) return;
    var s = toSet(e.clientX, e.clientY);
    L.tx = s.x; L.ty = s.y;
    kick();
  }, { passive: true });
  set.addEventListener('pointerleave', function () { L.tx = L.rx; L.ty = L.ry; kick(); }, { passive: true });

  /* ========================================================== simulation */
  function stepBenj(h, t) {
    if (B.mode === 'gone') return;
    if (B.mode === 'dangle') { stepDangle(h); return; }
    var calm = BJ.reduced, k, c, tx, ty;
    if (B.mode === 'grab') { k = 260; c = 24; tx = B.tx; ty = B.ty; }
    else { k = 60; c = 8; tx = G.R0.x; ty = G.R0.y; }
    if (calm) c = 2 * Math.sqrt(k);
    B.vx += (k * (tx - B.x) - c * B.vx) * h;
    B.vy += (k * (ty - B.y) - c * B.vy) * h;
    B.x += B.vx * h; B.y += B.vy * h;
    var tt = clamp(B.vx * .012, -25, 25) + (B.mode === 'grab' ? clamp((B.tx - G.R0.x) * .06, -22, 22) : 0);
    var kc = calm ? 2 * Math.sqrt(80) : 10;
    B.w += (80 * (tt - B.th) - kc * B.w) * h;
    B.th += B.w * h;
  }
  function stepDangle(h) {
    var A = anchors.wr, damp = Math.pow(.995, h * 60);
    Dn.vy += 2400 * h;
    Dn.vx *= damp; Dn.vy *= damp;
    Dn.x += Dn.vx * h; Dn.y += Dn.vy * h;
    Dn.L += (Dn.Lt - Dn.L) * Math.min(1, h * 5);
    var dx = Dn.x - A.x, dy = Dn.y - A.y, d = hyp(dx, dy);
    if (d > Dn.L && d > .01) {
      var nx = dx / d, ny = dy / d;
      Dn.x = A.x + nx * Dn.L; Dn.y = A.y + ny * Dn.L;
      var vr = Dn.vx * nx + Dn.vy * ny;
      if (vr > 0) { Dn.vx -= vr * nx; Dn.vy -= vr * ny; }
    }
    var phi = Math.atan2(Dn.x - A.x, Dn.y - A.y) * DEG;
    var tt = clamp(-phi * .8 - 28, -95, 60);
    B.w += (55 * (tt - B.th) - 5 * B.w) * h;
    B.th += B.w * h;
    /* torso pivot from the hip point */
    var hp = worldPt('float', BJ.POSES.float.harness.hip, 0, 0, B.th);
    B.x = Dn.x - hp.x; B.y = Dn.y - hp.y;
    B.vx = Dn.vx; B.vy = Dn.vy;
  }

  function stepHang(h, t) {
    var keys = Object.keys(hang), calm = BJ.reduced;
    var bodyOn = B.mode !== 'gone' && G.ok && t > B.ghostT, br = .22 * G.bw;
    for (var i = 0; i < keys.length; i++) {
      var P = hang[keys[i]];
      P.ax = P.ax0 + L.par;
      if (P.grab) {
        P.vx += (300 * (P.tx - P.x) - 26 * P.vx) * h;
        P.vy += (300 * (P.ty - P.y) - 26 * P.vy) * h;
      } else {
        P.vy += GP * h;
        var dx = P.x - P.ax, dy = P.y - P.ay, d = hyp(dx, dy);
        if (d > P.L && d > .01) {
          var nx = dx / d, ny = dy / d, pull = KLINE * (d - P.L), vr = P.vx * nx + P.vy * ny;
          P.vx -= (pull * nx + 7 * vr * nx) * h;
          P.vy -= (pull * ny + 7 * vr * ny) * h;
        }
        var damp = Math.pow(.992, h * 60);
        P.vx *= damp; P.vy *= damp;
      }
      P.x += P.vx * h; P.y += P.vy * h;
      /* line hard cap */
      var cx = P.x - P.ax, cy = P.y - P.ay, cd = hyp(cx, cy), cap = P.L * 1.8 + 6;
      if (cd > cap) {
        P.x = P.ax + cx / cd * cap; P.y = P.ay + cy / cd * cap;
        var vr2 = (P.vx * cx + P.vy * cy) / cd;
        if (vr2 > 0) { P.vx -= vr2 * cx / cd; P.vy -= vr2 * cy / cd; }
      }
      /* bounds */
      var minX = 16 + P.w * .45, maxX = G.w - 16 - P.w * .45, maxY = G.h * .9 - P.h * .5;
      if (P.x < minX) { P.x = minX; if (P.vx < 0) P.vx *= -.5; }
      if (P.x > maxX) { P.x = maxX; if (P.vx > 0) P.vx *= -.5; }
      if (P.y > maxY) { P.y = maxY; if (P.vy > 0) P.vy *= -.4; }
      /* collide with Benj's torso */
      if (bodyOn) {
        var bx = P.x - B.x, by = P.y - B.y, bd = hyp(bx, by), minD = br + P.r;
        if (bd < minD && bd > .01) {
          var ux = bx / bd, uy = by / bd;
          P.x = B.x + ux * minD; P.y = B.y + uy * minD;
          var rvn = (P.vx - B.vx) * ux + (P.vy - B.vy) * uy;
          if (rvn < 0) {
            var j = -1.6 * rvn;
            P.vx += j * ux; P.vy += j * uy;
            if (B.mode === 'free' || B.mode === 'grab') { B.vx -= .4 * j * ux; B.vy -= .4 * j * uy; }
            if (-rvn > 500) personality(P.name);
          }
        }
      }
      /* rotation follows the line, with a little lag */
      var phi = Math.atan2(P.x - P.ax, P.y - P.ay) * DEG;
      var rt = clamp(-phi * .6, -70, 70);
      var kr = calm ? 2 * Math.sqrt(140) : 9;
      P.vr += (140 * (rt - P.rot) - kr * P.vr) * h;
      P.rot += P.vr * h;
    }
  }

  function stepDumb(h, t) {
    var D = dumb;
    if (!D.el) return;
    var minX = 16 + D.w / 2, maxX = G.w - 16 - D.w / 2;
    if (D.grab) {
      D.vx += (40 * (D.tx - D.x) - 12 * D.vx) * h;
      D.vl += (40 * (D.tl - D.lift) - 12 * D.vl) * h;
      D.x += D.vx * h; D.lift += D.vl * h;
      D.lift = clamp(D.lift, -90, 0);
    } else {
      if (D.lift < 0 || D.vl < 0) {
        D.vl += 3200 * h;
        D.lift += D.vl * h;
        if (D.lift >= 0) {
          var sp = D.vl;
          D.lift = 0;
          D.vl = sp > 420 ? -sp * .16 : 0;
          if (sp > 260) dumbImpact(sp);
        }
      }
      if (D.lift >= 0) D.vx *= Math.pow(.86, h * 60);
      D.x += D.vx * h;
      if (t - D.idleT > 2500 && Math.abs(D.x - D.hx) > .5) {
        D.vx += (24 * (D.hx - D.x) - 9 * D.vx) * h;
      }
    }
    if (D.x < minX) { D.x = minX; D.vx = Math.abs(D.vx) * .3; }
    if (D.x > maxX) { D.x = maxX; D.vx = -Math.abs(D.vx) * .3; }
    D.rot = clamp(D.vx * .025, -16, 16);
  }
  function dumbImpact(sp) {
    var vol = clamp(sp / 1300, .35, 1);
    BJ.sfx.play('thud', { vol: vol });
    var sr = set.getBoundingClientRect();
    BJ.fx.dust(sr.left + dumb.x, sr.top + dumb.base, 10);
    BJ.shake(set, 4, 240);
    if (!BJ.reduced && dumb.img && dumb.img.animate) {
      dumb.img.animate([{ transform: 'scale(1.12,.86)' }, { transform: 'scale(.97,1.04)', offset: .5 }, { transform: 'none' }],
        { duration: 300, easing: 'ease-out' });
    }
    letterC.forEach(function (c, i) {
      var d = hyp(c.x - dumb.x, c.y - dumb.base);
      if (d < 360) later(d * 1.1, function () { wobble(letters[i], 1 - d / 400); });
    });
  }
  function dumbHop() {
    if (dumb.lift < 0 || dumb.grab) return;
    dumb.vl = BJ.reduced ? 0 : -760;
    dumb.idleT = now();
    if (BJ.reduced) dumbImpact(600);
    else BJ.sfx.play('whoosh', { vol: .3, rate: .7 });
  }

  function stepRoll(h, t) {
    var R = roll;
    if (!R.el) return;
    var px = R.x, minX = 16 + R.w / 2, maxX = G.w - 16 - R.w / 2;
    if (R.mode === 'roll') {
      R.x += R.vx * h;
      R.vx *= Math.pow(.985, h * 60);
      if (R.x < minX) { R.x = minX; R.vx = Math.abs(R.vx) * .5; BJ.sfx.play('clunk', { vol: .4 }); }
      if (R.x > maxX) { R.x = maxX; R.vx = -Math.abs(R.vx) * .5; BJ.sfx.play('clunk', { vol: .4 }); }
      if (Math.abs(R.vx) < 14) { R.mode = 'wait'; R.t = t; }
    } else if (R.mode === 'wait') {
      if (t - R.t > 1200) { R.mode = 'home'; R.t = t; R.from = R.x; }
    } else if (R.mode === 'home') {
      var k = Math.min(1, (t - R.t) / 900);
      R.x = R.from + (R.hx - R.from) * BJ.ease.inOutSine(k);
      if (k >= 1) { R.mode = 'idle'; R.x = R.hx; }
    }
    var dx = R.x - px;
    if (dx) {
      R.rot += dx / R.r * DEG;
      R.tickAcc += Math.abs(dx);
      if (R.tickAcc > 26) { R.tickAcc = 0; BJ.sfx.play('tick', { vol: .35 }); }
    }
  }
  function rollBy(dist) {
    var R = roll;
    if (!R.el || R.mode === 'drag') return;
    if (BJ.reduced) {
      R.x = clamp(R.x + dist, 16 + R.w / 2, G.w - 16 - R.w / 2);
      R.mode = 'wait'; R.t = now();
      render(now());
      later(1200, function () { if (R.mode === 'wait') { R.x = R.hx; R.mode = 'idle'; render(now()); } });
      return;
    }
    R.vx = dist * (1 - .985) * 60;
    R.mode = 'roll';
  }

  /* --------------------------------------------------------- personalities */
  function animate(el, kf, ms, ease) {
    if (!el || !el.animate || BJ.reduced) return null;
    try { return el.animate(kf, { duration: ms, easing: ease || 'cubic-bezier(.34,1.56,.64,1)' }); } catch (e) { return null; }
  }
  function personality(name) {
    var t = now();
    if (name === 'dumbbell') { dumbHop(); return; }
    if (name === 'filmroll') { rollBy(roll.x > G.w * .5 ? -220 : 220); return; }
    var P = hang[name];
    if (!P || t - P.fxT < 320) return;
    P.fxT = t;
    var r = P.el.getBoundingClientRect();
    if (name === 'clap') {
      animate(P.img, [{ transform: 'none' }, { transform: 'scale(1.04,.88) rotate(-6deg)', offset: .3 }, { transform: 'none' }], 300);
      BJ.fx.chalk(r.left + r.width * .3, r.top + r.height * .32, 12);
      BJ.sfx.play('clap');
    } else if (name === 'camera') {
      BJ.flash(set, 110);
      BJ.sfx.play('shutter');
      animate(P.img, [{ transform: 'none' }, { transform: 'scale(.94) rotate(3deg)', offset: .25 }, { transform: 'none' }], 260);
    } else if (name === 'controller') {
      animate(P.img, [{ transform: 'none' }, { transform: 'rotateY(180deg) scale(1.08)', offset: .5 }, { transform: 'rotateY(360deg)' }], 520, 'ease-in-out');
      BJ.sfx.play('coin');
    }
  }

  /* ------------------------------------------------------------ letters */
  var seq = [], lastWin = -1e9, lastNote = {};
  function jelly(el) {
    if (BJ.reduced || !el.animate) {
      el.classList.add('is-flash');
      setTimeout(function () { el.classList.remove('is-flash'); }, 120);
      return;
    }
    el.animate([
      { transform: 'scale(1,1)' },
      { transform: 'scale(1.14,.84)', offset: .22 },
      { transform: 'scale(.93,1.09)', offset: .5 },
      { transform: 'scale(1.03,.98)', offset: .76 },
      { transform: 'scale(1,1)' }
    ], { duration: 380, easing: 'ease-out' });
  }
  function wobble(el, amt) {
    if (!el) return;
    if (BJ.reduced || !el.animate) { jelly(el); return; }
    var a = 7 * clamp(amt, .3, 1);
    el.animate([
      { transform: 'none' },
      { transform: 'translateY(-' + (a * 1.6).toFixed(1) + 'px) rotate(' + (-a).toFixed(1) + 'deg) scale(1.03,.95)', offset: .2 },
      { transform: 'rotate(' + (a * .7).toFixed(1) + 'deg)', offset: .45 },
      { transform: 'rotate(' + (-a * .35).toFixed(1) + 'deg)', offset: .7 },
      { transform: 'none' }
    ], { duration: 560, easing: 'ease-out' });
  }
  function playLetter(i) {
    var el = letters[i], t = now();
    if (!el) return;
    if (lastNote[i] && t - lastNote[i] < 140) return;
    lastNote[i] = t;
    jelly(el);
    BJ.sfx.note(parseFloat(el.getAttribute('data-f')) || 523.25, { dur: .3, type: 'triangle', vol: .6 });
    seq.push({ l: el.getAttribute('data-l'), t: t });
    if (seq.length > 4) seq.shift();
    if (seq.length === 4 && seq.map(function (s) { return s.l; }).join('') === 'BENJ' &&
        seq[3].t - seq[0].t <= 3000 && t - lastWin > 2500) {
      lastWin = t; seq = [];
      later(160, xyloWin);
    }
  }
  function xyloWin() {
    BJ.sfx.play('win');
    letters.forEach(function (el, j) {
      later(j * 80, function () {
        var r = el.getBoundingClientRect();
        BJ.fx.confetti(r.left + r.width / 2, r.top + r.height * .3, 22);
        wobble(el, .6);
      });
    });
    if ((B.mode === 'free' || B.mode === 'grab') && !BJ.reduced) B.spin0 = now();
    say('t’as l’oreille, toi.');
    kick();
  }
  letters.forEach(function (el, i) {
    el.addEventListener('pointerenter', function (e) {
      if (e.pointerType === 'mouse' && BJ.fine) playLetter(i);
    });
    el.addEventListener('pointerdown', function () { playLetter(i); });
  });

  /* ============================================================ cascade */
  function cascade() {
    if (B.mode !== 'free' && B.mode !== 'grab') return;
    cascades++;
    B.yanks = []; B.pullT = 0;
    hideHint();
    BJ.sfx.play('twang');
    if (stampEl && stampEl.parentNode) stampEl.remove();
    stampEl = BJ.stamp(set, 'COUPEZ' + NB + '!', { tone: 'tally', rot: -8, size: 'l', ms: 0 });
    BJ.shake(set, 6, 300);
    BJ.emit('stunt:cut');
    if (BJ.reduced) { calmCascade(); return; }
    squash();
    cutRope(ropes.l, -1);
    var hp = worldPt('float', BJ.POSES.float.harness.hip, B.x, B.y, B.th + B.spin);
    var A = anchors.wr;
    Dn = { x: hp.x, y: hp.y, vx: B.vx, vy: B.vy, L: hyp(hp.x - A.x, hp.y - A.y), Lt: ropes.r.L * 1.04 };
    B.spin = 0; B.spin0 = 0;
    B.mode = 'dangle';
    later(700, snapRight);
    kick();
  }
  function snapRight() {
    if (B.mode !== 'dangle') return;
    BJ.sfx.play('twang', { rate: .7 });
    cutRope(ropes.r, 1);
    BJ.state.fell = true;
    BJ.emit('stunt:fall');
    spawnFall();
    B.mode = 'gone';
    img.style.visibility = 'hidden';
    shadowEl.style.opacity = '0';
    bubble.setAttribute('data-on', '0');
    later(900, function () { BJ.sfx.play('thud', { vol: .4 }); });
    later(1400, redrop);
  }
  function spawnFall() {
    var sr = set.getBoundingClientRect(), g = poseG.float;
    var left = sr.left + benjEl.offsetLeft, top = sr.top + benjEl.offsetTop;
    var wrap = Doc.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.cssText = 'position:fixed;z-index:55;margin:0;padding:0;pointer-events:none;will-change:transform;' +
      'left:' + f1(left) + 'px;top:' + f1(top) + 'px;width:' + f1(G.bw) + 'px;height:' + f1(G.bh) + 'px;transform-origin:36% 50%;';
    var im = Doc.createElement('img');
    im.src = BJ.POSES.float.src; im.alt = ''; im.width = BJ.POSES.float.w; im.height = BJ.POSES.float.h;
    im.setAttribute('draggable', 'false');
    im.style.cssText = 'position:absolute;display:block;max-width:none;height:auto;margin:0;pointer-events:none;' +
      'left:' + f1(.36 * G.bw + g.ox) + 'px;top:' + f1(.5 * G.bh + g.oy) + 'px;width:' + f1(g.w) + 'px;' +
      'filter:drop-shadow(0 16px 14px rgba(90,55,40,.22));';
    wrap.appendChild(im);
    Doc.body.appendChild(wrap);
    var F = { x: B.x - G.R0.x, y: B.y - G.R0.y, vx: clamp(B.vx * .8, -900, 900), vy: Math.min(B.vy, 300) - 260, th: B.th,
      spin: (B.vx >= 0 ? 1 : -1) * 360, n: 0 };
    function place() { wrap.style.transform = 'translate3d(' + f1(F.x) + 'px,' + f1(F.y) + 'px,0) rotate(' + f1(F.th) + 'deg)'; }
    place();
    var off = BJ.ticker.add(function (dt) {
      F.vy += 2600 * dt;
      F.x += F.vx * dt; F.y += F.vy * dt; F.th += F.spin * dt;
      place();
      if (top + F.y - G.bh * .7 > Win.innerHeight + 40 || ++F.n > 400) { off(); wrap.remove(); }
    });
  }
  function redrop() {
    BJ.takes.add('cascade');
    if (stampEl) {
      var s = stampEl; stampEl = null;
      if (s.animate && !BJ.reduced) { var a = s.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }); a.onfinish = function () { s.remove(); }; }
      else s.remove();
    }
    Dn = null;
    B.th = 0; B.w = 0; B.vx = 0; B.vy = 0; B.spin = 0; B.spin0 = 0;
    B.x = G.R0.x;
    if (BJ.reduced) { B.y = G.R0.y; B.mode = 'free'; }
    else { B.y = G.R0.y - .6 * G.h; B.mode = 'drop'; B.dropT = now(); B.ghostT = B.dropT + 900; }
    resetRopes();
    img.style.visibility = '';
    shadowEl.style.opacity = '';
    render(now());
    later(BJ.reduced ? 0 : 380, function () {
      say(cascades >= 3 && cascades % 3 === 0 ? 'tu le fais exprès' + NB + '?' : 'on la refait.');
    });
    BJ.announce('Coupez' + NB + '! Prise ' + BJ.takes.count);
    kick();
  }
  function calmCascade() {
    B.mode = 'gone';
    img.style.visibility = 'hidden';
    shadowEl.style.opacity = '0';
    bubble.setAttribute('data-on', '0');
    ropes.l.pinB = false; ropes.r.pinB = false;
    ['l', 'r'].forEach(function (k) { ropes[k].el.classList.add('is-gone'); ropes[k].hi.classList.add('is-gone'); });
    BJ.state.fell = true;
    BJ.emit('stunt:fall');
    later(600, redrop);
  }

  /* ---------------------------------------------------------- yanks */
  function addYank(t) {
    B.lastYank = t;
    B.yanks.push(t);
    B.yanks = B.yanks.filter(function (x) { return t - x <= 4000; });
    BJ.sfx.play('whoosh', { vol: .35, rate: 1 + B.yanks.length * .18 });
    if (B.yanks.length >= 3) cascade();
  }

  /* ========================================================= input: Benj */
  /* touch: the hit area is touch-action pan-y, so a vertical swipe scrolls the
     page (BJ.drag gets pointercancel); only the sideways part pulls Benj */
  BJ.drag(hit, {
    onStart: function (p) {
      if (B.mode !== 'free' || !G.ok) return false;
      var s = toSet(p.x, p.y);
      B.mode = 'grab';
      B.touch = p.type === 'touch';
      B.gox = B.x - s.x; B.goy = B.y - s.y;
      B.tx = B.x; B.ty = B.y; B.pullT = 0;
      B.spin0 = 0; B.spin = 0;
      if (B.firstGrab) { B.firstGrab = false; say('hé, doucement' + NB + '!'); }
      kick();
    },
    onMove: function (p) {
      if (B.mode !== 'grab') return;
      var s = toSet(p.x, p.y);
      B.tx = clamp(s.x + B.gox, -.15 * G.w, 1.15 * G.w);
      B.ty = B.touch ? G.R0.y + clamp(p.dy * .25, -40, 40) : clamp(s.y + B.goy, 0, G.h * 1.15);
      if (p.moved) hideHint();
      var t = now(), sp = B.touch ? Math.abs(p.vx) : hyp(p.vx, p.vy), pull = hyp(B.tx - G.R0.x, B.ty - G.R0.y);
      if (sp > 1800 && pull > (G.narrow ? 70 : 100) && t - B.lastYank > 260) addYank(t);
      if (B.firstPull && pull > (G.narrow ? 100 : 140) && t - bub.lastT > 1100) { B.firstPull = false; say('je gère, je gère…'); }
      kick();
    },
    onEnd: function () { if (B.mode === 'grab') { B.mode = 'free'; B.pullT = 0; } kick(); },
    onTap: function () {
      if (B.mode !== 'grab') return;
      B.mode = 'free'; B.pullT = 0;
      if (!BJ.reduced) { B.vy -= 520; B.vx += BJ.rand(-140, 140); B.w += BJ.rand(-90, 90); }
      BJ.sfx.play('boing', { vol: .6 });
      var r = img.getBoundingClientRect();
      BJ.fx.fluff(r.left + r.width * .38, r.top + r.height * .45, 6);
      kick();
    }
  });
  B.firstPull = true;
  hit.addEventListener('keydown', function (e) {
    var k = e.key, imp = 700;
    if (B.mode !== 'free' && B.mode !== 'drop') {
      if (k === ' ' || k === 'Enter' || k.indexOf('Arrow') === 0) e.preventDefault();
      return;
    }
    if (k === 'ArrowLeft') B.vx -= imp;
    else if (k === 'ArrowRight') B.vx += imp;
    else if (k === 'ArrowUp') B.vy -= imp;
    else if (k === 'ArrowDown') B.vy += imp;
    else if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (e.repeat || B.mode !== 'free') return;
      hideHint();
      B.vx -= 1131; B.vy += 1131;
      addYank(now());
      kick();
      return;
    } else return;
    e.preventDefault();
    if (BJ.reduced) { B.x += B.vx * .06; B.y += B.vy * .06; }
    kick();
  });

  /* ======================================================== input: props */
  var lastKeyT = 0;
  Object.keys(hang).forEach(function (name) {
    var P = hang[name];
    BJ.drag(P.el, {
      onStart: function (p) {
        var s = toSet(p.x, p.y);
        P.grab = true;
        P.gox = P.x - s.x; P.goy = P.y - s.y;
        P.tx = P.x; P.ty = P.y;
        kick();
      },
      onMove: function (p) {
        if (!P.grab) return;
        var s = toSet(p.x, p.y);
        P.tx = clamp(s.x + P.gox, 0, G.w);
        P.ty = p.type === 'touch' && name === 'hire' ? P.y : clamp(s.y + P.goy, 0, G.h);
        kick();
      },
      onEnd: function (p) {
        if (!P.grab) return;
        P.grab = false;
        P.moved = now();                       /* a drag must not open the link */
        var sp = hyp(p.vx, p.vy), k = sp > 2600 ? 2600 / sp : 1;
        P.vx = p.vx * k; P.vy = p.vy * k;
        if (sp > 700) BJ.sfx.play('whoosh', { vol: .35, rate: 1.2 });
        kick();
      },
      onTap: function () { P.grab = false; if (name !== 'hire') personality(name); kick(); }
    });
  });
  if (hang.hire) {
    hang.hire.el.addEventListener('click', function (e) {
      if (now() - hang.hire.moved < 400) { e.preventDefault(); return; }
      BJ.sfx.play('print', { vol: .7 });
    });
  }
  if (dumb.el) {
    BJ.drag(dumb.el, {
      onStart: function (p) {
        var s = toSet(p.x, p.y);
        dumb.grab = true; dumb.sx = dumb.x - s.x;
        dumb.tx = dumb.x; dumb.tl = dumb.lift; dumb.idleT = now();
        BJ.sfx.play('clunk', { vol: .5 });
        kick();
      },
      onMove: function (p) {
        if (!dumb.grab) return;
        var s = toSet(p.x, p.y);
        dumb.tx = clamp(s.x + dumb.sx, 16 + dumb.w / 2, G.w - 16 - dumb.w / 2);
        dumb.tl = clamp(p.dy, -90, 0);
        dumb.idleT = now();
        kick();
      },
      onEnd: function (p) {
        if (!dumb.grab) return;
        dumb.grab = false; dumb.idleT = now();
        dumb.vx = clamp(dumb.vx + p.vx * .15, -500, 500);
        if (BJ.reduced) { dumb.lift = 0; dumb.vl = 0; dumbImpact(600); }
        else if (dumb.lift > -2) { dumb.lift = 0; dumb.vl = 0; }
        kick();
      },
      onTap: function () { dumb.grab = false; dumbHop(); kick(); }
    });
  }
  if (roll.el) {
    BJ.drag(roll.el, {
      onStart: function (p) {
        if (roll.mode === 'home') roll.mode = 'idle';
        var s = toSet(p.x, p.y);
        roll.off = roll.x - s.x;
        roll.prev = roll.mode;
        roll.mode = 'drag';
        kick();
      },
      onMove: function (p) {
        if (roll.mode !== 'drag') return;
        var s = toSet(p.x, p.y);
        roll.x = clamp(s.x + roll.off, 16 + roll.w / 2, G.w - 16 - roll.w / 2);
        kick();
      },
      onEnd: function (p) {
        if (roll.mode !== 'drag') return;
        if (BJ.reduced) { roll.mode = 'wait'; roll.t = now(); later(1200, function () { if (roll.mode === 'wait') { roll.x = roll.hx; roll.mode = 'idle'; render(now()); } }); return; }
        roll.vx = clamp(p.vx, -2600, 2600);
        roll.mode = 'roll';
        kick();
      },
      onTap: function () { roll.mode = roll.prev === 'drag' ? 'idle' : (roll.prev || 'idle'); personality('filmroll'); kick(); }
    });
  }
  /* keyboard: the five props are one roving group (one tab stop, arrows switch,
     Enter/Space = the prop's little personality) */
  function roving(list, onKey) {
    list.forEach(function (el, i) {
      el.addEventListener('keydown', function (e) {
        var k = e.key, n = -1;
        if (k === 'ArrowRight' || k === 'ArrowDown') n = (i + 1) % list.length;
        else if (k === 'ArrowLeft' || k === 'ArrowUp') n = (i - 1 + list.length) % list.length;
        else if (k === 'Home') n = 0;
        else if (k === 'End') n = list.length - 1;
        if (n >= 0) {
          e.preventDefault();
          list.forEach(function (o, j) { o.tabIndex = j === n ? 0 : -1; });
          try { list[n].focus({ preventScroll: true }); } catch (err) { list[n].focus(); }
          return;
        }
        if (onKey) onKey(e, el, i);
      });
      el.addEventListener('focus', function () { list.forEach(function (o, j) { o.tabIndex = j === i ? 0 : -1; }); });
    });
  }
  var propEls = qa('.pl-prop');
  roving(propEls, function (e, el) {
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (e.repeat) return;
      lastKeyT = now();
      personality(el.getAttribute('data-prop'));
      kick();
    }
  });
  propEls.forEach(function (el) {
    /* assistive-tech activation (click without pointer and without our keydown) */
    el.addEventListener('click', function (e) {
      if (e.detail === 0 && now() - lastKeyT > 500) { personality(el.getAttribute('data-prop')); kick(); }
    });
  });
  /* the xylophone: same roving group; Enter/Space plays the focused letter,
     and typing b, e, n or j plays that letter */
  roving(letters, function (e, el, i) {
    var k = e.key;
    if (k === 'Enter' || k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (!e.repeat) { lastKeyT = now(); playLetter(i); }
      return;
    }
    var j = 'BENJ'.indexOf(String(k).toUpperCase());
    if (k.length === 1 && j >= 0) { e.preventDefault(); lastKeyT = now(); playLetter(j); }
  });
  letters.forEach(function (el, i) {
    el.addEventListener('click', function (e) { if (e.detail === 0 && now() - lastKeyT > 500) playLetter(i); });
  });

  /* =============================================================== render */
  function render(t) {
    if (!G.ok) return;
    /* barrel roll */
    if (B.spin0) {
      var k = (t - B.spin0) / 900;
      if (k >= 1 || k < 0) { B.spin0 = 0; B.spin = 0; }
      else B.spin = 360 * BJ.ease.inOutSine(k);
    }
    var thT = B.th + B.spin;
    if (B.mode !== 'gone') {
      benjEl.style.transform = 'translate3d(' + f1(B.x - G.R0.x) + 'px,' + f1(B.y - G.R0.y) + 'px,0) rotate(' + f1(thT) + 'deg)';
      var rise = G.R0.y - B.y;
      var sc = clamp(1 - rise / 700, .35, 1.3), op = clamp(1 - rise / 800, .2, 1);
      shadowEl.style.transform = 'translate3d(' + f1(B.x - G.R0.x) + 'px,0,0) translateX(-50%) scale(' + sc.toFixed(3) + ')';
      shadowEl.style.opacity = op.toFixed(3);
      /* bubble at the head */
      var hd = worldPt(B.pose, BJ.POSES[B.pose].head, B.x, B.y, thT);
      var bx = hd.x + G.bw * .07, by = hd.y + 10, tail = 'bl';
      if (bx + bub.w > G.w - 12) { bx = hd.x - G.bw * .05 - bub.w; tail = 'br'; }
      bx = clamp(bx, 12, Math.max(12, G.w - bub.w - 12));
      by = clamp(by, G.hud + 16 + bub.h, G.h - 12);
      if (tail !== bubble.getAttribute('data-tail')) bubble.setAttribute('data-tail', tail);
      bAnchor.style.transform = 'translate3d(' + f1(bx) + 'px,' + f1(by) + 'px,0)';
    }
    /* hanging props + their lines */
    Object.keys(hang).forEach(function (name) {
      var P = hang[name];
      P.el.style.transform = 'translate3d(' + f1(P.x - P.rx) + 'px,' + f1(P.y - P.ry) + 'px,0) rotate(' + f1(P.rot) + 'deg)';
      if (P.clampEl) P.clampEl.style.transform = L.par ? 'translateX(' + f1(L.par) + 'px)' : '';
      var a = P.rot / DEG, top = { x: P.x + Math.sin(a) * P.h * .44, y: P.y - Math.cos(a) * P.h * .44 };
      var d = hyp(top.x - P.ax, top.y - P.ay), slack = Math.max(0, P.Ltop - d);
      var sag = Math.sqrt(slack * P.Ltop) * .55;
      var mx = (top.x + P.ax) / 2, my = (top.y + P.ay) / 2 + sag;
      P.line.setAttribute('d', 'M' + f1(P.ax) + ' ' + f1(P.ay) + 'Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(top.x) + ' ' + f1(top.y));
    });
    /* floor props */
    if (dumb.el) {
      dumb.el.style.transform = 'translate3d(' + f1(dumb.x - dumb.hx) + 'px,' + f1(dumb.lift) + 'px,0) rotate(' + f1(dumb.rot) + 'deg)';
      var ls = clamp(1 + dumb.lift / 150, .45, 1);
      dumb.sh.style.transform = 'translate3d(' + f1(dumb.x - dumb.hx) + 'px,0,0) translateX(-50%) scale(' + ls.toFixed(3) + ')';
      dumb.sh.style.opacity = (.35 + .65 * ls).toFixed(3);
    }
    if (roll.el) {
      roll.el.style.transform = 'translate3d(' + f1(roll.x - roll.hx) + 'px,0,0) rotate(' + f1(roll.rot) + 'deg)';
      roll.sh.style.transform = 'translate3d(' + f1(roll.x - roll.hx) + 'px,0,0) translateX(-50%)';
      var lo = Math.min(roll.x, roll.hx), hi = Math.max(roll.x, roll.hx);
      if (hi - lo < 2) trail.style.clipPath = 'inset(0 100% 0 0)';
      else trail.style.clipPath = 'inset(0 ' + f1(G.w - hi) + 'px 0 ' + f1(lo) + 'px)';
    }
    /* wires */
    ropeDraw(ropes.l); ropeDraw(ropes.r);
    /* key light */
    if (light) light.style.transform = 'translate3d(' + f1(L.x - L.rx) + 'px,' + f1(L.y - L.ry) + 'px,0)';
  }

  /* everything at rest? then the loop can sleep until the next interaction */
  function quiet() {
    if (B.mode !== 'free' || B.spin0 || Dn) return false;
    if (hyp(B.x - G.R0.x, B.y - G.R0.y) > .25 || hyp(B.vx, B.vy) > 1.5 || Math.abs(B.th) > .05 || Math.abs(B.w) > .3) return false;
    var keys = Object.keys(hang);
    for (var i = 0; i < keys.length; i++) {
      var P = hang[keys[i]];
      if (P.grab || hyp(P.vx, P.vy) > 1.5 || Math.abs(P.vr) > .4) return false;
    }
    if (dumb.el && (dumb.grab || dumb.lift < 0 || Math.abs(dumb.vx) > .5 || Math.abs(dumb.x - dumb.hx) > .5)) return false;
    if (roll.el && roll.mode !== 'idle') return false;
    for (var r in ropes) {
      var pts = ropes[r].pts;
      /* gravity alone leaves ~.2px of Verlet "velocity" on a resting rope */
      for (var k = 0; k < pts.length; k++) if (Math.abs(pts[k].x - pts[k].px) > .4 || Math.abs(pts[k].y - pts[k].py) > .4) return false;
    }
    if (Math.abs(L.x - L.tx) > .5 || Math.abs(L.y - L.ty) > .5) return false;
    return true;
  }
  var calmFrames = 0;
  function tick(dt, t) {
    if (!G.ok) return;
    var h = dt / 2, s;
    for (s = 0; s < 2; s++) {
      stepBenj(h, t);
      stepHang(h, t);
      stepDumb(h, t);
      stepRoll(h, t);
      ropeStep(ropes.l, h);
      ropeStep(ropes.r, h);
    }
    if (B.mode === 'grab') {
      /* cascade trigger: a pull held. Touch needs a longer, sideways pull */
      var pull = B.touch ? Math.abs(B.tx - G.R0.x) : hyp(B.tx - G.R0.x, B.ty - G.R0.y);
      var thr = (G.narrow ? 170 : 260) * (B.touch ? 1.1 : 1), hold = B.touch ? 450 : 120;
      if (pull > thr) { if (!B.pullT) B.pullT = t; else if (t - B.pullT >= hold) cascade(); }
      else B.pullT = 0;
    }
    if (B.mode === 'drop' && t - B.dropT > 1000) B.mode = 'free';
    /* key light + parallax */
    if (BJ.fine && !BJ.reduced) {
      L.x += (L.tx - L.x) * .06; L.y += (L.ty - L.y) * .06;
      L.par = clamp((L.x / (G.w || 1) - .5) * 16, -8, 8);
    } else { L.x = L.tx = L.rx; L.y = L.ty = L.ry; L.par = 0; }
    render(t);
    /* mostly-quiet is quiet enough: tiny residual wobble must not keep the loop alive */
    calmFrames = quiet() ? calmFrames + 1 : Math.max(0, calmFrames - 2);
    if (calmFrames > 24) {
      B.x = G.R0.x; B.y = G.R0.y; B.vx = B.vy = 0; B.th = B.w = 0;
      render(t);
      sleep();
    }
  }

  /* ============================================================ lifecycle */
  var tickOff = null, visible = false;
  function kick() {
    calmFrames = 0;
    if (visible && !tickOff && G.ok) tickOff = BJ.ticker.add(tick);
  }
  function sleep() { if (tickOff) { tickOff(); tickOff = null; } }

  measure();
  /* intro: Benj drops in from above onto his wires (only if the hero is on screen) */
  (function intro() {
    var r = set.getBoundingClientRect();
    var onScreen = r.top > -80 && r.top < Win.innerHeight * .5;
    if (introArm) {
      if (!onScreen || BJ.reduced) introArm.remove();
      else setTimeout(function () { if (introArm.parentNode) introArm.remove(); }, 1200);
    }
    if (onScreen && !BJ.reduced && G.ok) {
      B.y = G.R0.y - .6 * G.h;
      B.mode = 'drop'; B.dropT = now();
      B.ghostT = now() + 900;
      resetRopes();
    }
    render(now());
  })();

  BJ.inView(set, function (vis) {
    visible = vis;
    if (vis) {
      if (B.mode === 'drop') { B.dropT = now(); B.ghostT = B.dropT + 900; }
      kick();
    } else sleep();
  }, '60px');

  /* timecode: its own slow clock (8 fps, 1 fps when motion is reduced), not the physics loop */
  var tc0 = now(), tcLast = '';
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  setInterval(function () {
    if (!tcEl || !visible || Doc.hidden) return;
    var sec = (now() - tc0) / 1000, fr = BJ.reduced ? Math.floor(sec) * 24 : Math.floor(sec * 24), st = Math.floor(fr / 24);
    var txt = 'TC ' + p2(Math.floor(st / 3600) % 100) + ':' + p2(Math.floor(st / 60) % 60) + ':' + p2(st % 60) + ':' + p2(fr % 24);
    if (txt !== tcLast) { tcLast = txt; tcEl.textContent = txt; }
  }, 125);

  if ('ResizeObserver' in Win) {
    var rsT = 0;
    new ResizeObserver(function () {
      clearTimeout(rsT);
      rsT = setTimeout(function () { measure(); render(now()); kick(); }, 60);
    }).observe(set);
  } else {
    Win.addEventListener('resize', function () { measure(); render(now()); kick(); });
  }
  BJ.fontsReady.then(function () { measureLetters(); });
  BJ.on('reduced', function (d) {
    if (d && d.reduced && (B.mode === 'free' || B.mode === 'drop')) {
      B.mode = 'free'; B.x = G.R0.x; B.y = G.R0.y; B.vx = B.vy = 0; B.th = B.w = 0; B.spin = B.spin0 = 0;
      render(now());
    }
    kick();
  });
});
