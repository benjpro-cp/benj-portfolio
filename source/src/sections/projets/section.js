BJ.section('projets', function (root, BJ) {
  /* real links: fill these in */
  var LINKS = { resto: '', coach: '' };
  [].forEach.call(root.querySelectorAll('.pj-go'), function (a) {
    var url = LINKS[a.dataset.link];
    if (url) { a.href = url; return; }
    a.removeAttribute('href'); a.removeAttribute('target');
    a.setAttribute('aria-disabled', 'true');
    a.firstChild.textContent = 'lien bientôt';
  });

  /* filters: dim instead of hide, so the layout never jumps */
  var keys = [].slice.call(root.querySelectorAll('.pj-filters .bj-key'));
  var cards = [].slice.call(root.querySelectorAll('.pj-card'));
  keys.forEach(function (k) {
    k.addEventListener('click', function () {
      var f = k.dataset.f;
      keys.forEach(function (x) { x.setAttribute('aria-pressed', String(x === k)); });
      cards.forEach(function (c) { c.classList.toggle('is-dim', f !== 'all' && c.dataset.cat !== f); });
      BJ.sfx.play('tick');
    });
  });

  /* gentle tilt on desktop */
  cards.forEach(function (c) {
    c.addEventListener('pointermove', function (e) {
      if (!BJ.fine || BJ.reduced) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--ry', ((e.clientX - r.left) / r.width - .5) * 5 + 'deg');
      c.style.setProperty('--rx', -((e.clientY - r.top) / r.height - .5) * 5 + 'deg');
    });
    c.addEventListener('pointerleave', function () { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); });
  });

  /* mock buttons react */
  [['.pj-resto .pj-browser', 'table réservée'], ['.pj-coach .pj-browser', 'appel réservé']].forEach(function (d) {
    var el = root.querySelector(d[0]);
    el.addEventListener('click', function () {
      BJ.stamp(el, d[1], { tone: 'mint', rot: -8, ms: 1400, size: 'm' });
      BJ.sfx.play('bell');
    });
  });

  /* MOGD scan demo, in the app's own look (real rank thresholds from the app) */
  var phone = root.querySelector('.pj-phone');
  var num = phone.querySelector('.mg-num'), rank = phone.querySelector('.mg-rank'), barEl = phone.querySelector('.mg-bar');
  var rows = [].slice.call(phone.querySelectorAll('.mg-row'));
  var RANKS = [[92, 'ÉLITE', '#a78bfa'], [82, 'DIAMANT', '#67e8f9'], [70, 'PLATINE', '#e2e8f0'], [55, 'OR', '#fbbf24'], [40, 'ARGENT', '#94a3b8'], [0, 'BRONZE', '#cd7f32']];
  var busy = false;
  function rankOf(v) { for (var i = 0; i < RANKS.length; i++) if (v >= RANKS[i][0]) return RANKS[i]; }
  phone.addEventListener('click', function () {
    if (busy) return;
    busy = true;
    rows.forEach(function (r) { r.querySelector('i').style.setProperty('--v', 0); r.querySelector('b').textContent = '--'; });
    num.textContent = '--'; rank.textContent = 'ANALYSE…'; rank.style.setProperty('--rc', '#9aa0a8'); barEl.style.setProperty('--s', '0%');
    rows.forEach(function (r, i) {
      setTimeout(function () {
        var v = +r.querySelector('b').dataset.v;
        r.querySelector('b').textContent = v; r.querySelector('i').style.setProperty('--v', v);
        BJ.sfx.play('tick');
      }, 250 + i * 220);
    });
    var target = 77;
    setTimeout(function () {
      var t0 = performance.now(), dur = BJ.reduced ? 1 : 1000, last = null;
      (function step(now) {
        var k = Math.min(1, (now - t0) / dur), v = Math.round(target * BJ.ease.outCubic(k));
        num.textContent = v; barEl.style.setProperty('--s', v + '%');
        var r = rankOf(v);
        if (r !== last) { last = r; rank.textContent = r[1]; rank.style.setProperty('--rc', r[2]); }
        if (k < 1) requestAnimationFrame(step);
        else { busy = false; BJ.sfx.play('coin'); BJ.takes.add('mogd'); BJ.announce('Démo MOGD : ' + v + ' sur 100, rang ' + r[1] + '.'); }
      })(t0);
    }, 1150);
  });

  /* thumbnails gallery page, opened by #miniatures (back button and Escape close it) */
  var page = root.querySelector('.mn-page'), card = root.querySelector('a.pj-mini');
  var zoom = page.querySelector('.mn-zoom'), zImg = zoom.querySelector('img');
  var thumbs = [].slice.call(page.querySelectorAll('.mn-thumb')), zi = 0, opened = false, back = 0;
  function openPage() {
    if (opened) return;
    opened = true; back = scrollY;
    page.hidden = false; page.scrollTop = 0;
    document.documentElement.style.overflow = 'hidden';
    BJ.sfx.play('whoosh');
    page.querySelector('.mn-back').focus();
  }
  function closePage() {
    if (!opened) return;
    opened = false; zoom.hidden = true;
    page.hidden = true;
    document.documentElement.style.overflow = '';
    scrollTo(0, back);
    card.focus({ preventScroll: true });
  }
  function syncPage() { if (location.hash === '#miniatures') openPage(); else closePage(); }
  addEventListener('hashchange', syncPage);
  page.querySelector('.mn-back').addEventListener('click', function () {
    if (location.hash === '#miniatures') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    closePage();
  });
  function showZoom(i) {
    zi = (i + thumbs.length) % thumbs.length;
    zImg.src = thumbs[zi].querySelector('img').src;
    zImg.alt = 'Miniature YouTube ' + (zi + 1);
    zoom.hidden = false;
    BJ.sfx.play('tick');
  }
  thumbs.forEach(function (t, i) { t.addEventListener('click', function () { showZoom(i); zoom.querySelector('.mn-zoom__close').focus(); }); });
  zoom.querySelector('.mn-zoom__prev').addEventListener('click', function () { showZoom(zi - 1); });
  zoom.querySelector('.mn-zoom__next').addEventListener('click', function () { showZoom(zi + 1); });
  zoom.querySelector('.mn-zoom__close').addEventListener('click', function () { zoom.hidden = true; thumbs[zi].focus(); });
  zoom.addEventListener('click', function (e) { if (e.target === zoom) { zoom.hidden = true; thumbs[zi].focus(); } });
  BJ.drag(zImg, { onEnd: function (p) { if (Math.abs(p.dx) > 40) showZoom(zi + (p.dx < 0 ? 1 : -1)); } });
  addEventListener('keydown', function (e) {
    if (!opened) return;
    if (!zoom.hidden && e.key === 'ArrowRight') showZoom(zi + 1);
    else if (!zoom.hidden && e.key === 'ArrowLeft') showZoom(zi - 1);
    else if (e.key === 'Escape') { if (!zoom.hidden) { zoom.hidden = true; thumbs[zi].focus(); } else page.querySelector('.mn-back').click(); }
  });
  syncPage();

  /* editing timeline: plays while visible, click to pause */
  var tl = root.querySelector('.pj-timeline'), head = tl.querySelector('.pj-head');
  var t = .3, playing = !BJ.reduced, visible = false, last = 0;
  function sync() { tl.setAttribute('aria-pressed', String(playing)); }
  sync();
  tl.addEventListener('click', function () { playing = !playing; sync(); BJ.sfx.play(playing ? 'pop' : 'tick'); });
  BJ.inView(tl, function (v) { visible = v; });
  BJ.ticker.add(function (dt) {
    if (!playing || !visible) return;
    t += dt * .12;
    if (t > 1) t = 0;
    head.style.setProperty('--t', t.toFixed(4));
    var cut = Math.floor(t * 8);
    if (cut !== last) { last = cut; }
  });
});
