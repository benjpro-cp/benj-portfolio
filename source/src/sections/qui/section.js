BJ.section('qui', function (root, BJ) {
  var tabs = [].slice.call(root.querySelectorAll('.qu-pillar'));
  var panel = root.querySelector('.qu-panel');
  var cards = [].slice.call(root.querySelectorAll('.qu-card'));
  var me = root.querySelector('.qu-me__btn'), bubble = root.querySelector('.qu-bubble');
  var NOTES = { biz: 392, gym: 330, vid: 294, cine: 262 };

  function pop(el) {
    if (BJ.reduced || !el.animate) return;
    el.animate([{ transform: 'scale(1,1)' }, { transform: 'scale(1.08,.9)', offset: .3 }, { transform: 'scale(.97,1.04)', offset: .6 }, { transform: 'scale(1,1)' }], { duration: 420, easing: 'ease-out' });
  }
  function select(tab, focus) {
    var p = tab.dataset.p;
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', tab.id);
    cards.forEach(function (c) { c.hidden = c.dataset.p !== p; });
    if (focus) tab.focus();
    pop(tab);
    BJ.sfx.note(NOTES[p], { dur: .25 });
    var r = tab.getBoundingClientRect();
    BJ.fx.dust(r.left + r.width / 2, r.bottom - 6, 6);
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { select(t); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length], true);
    });
  });

  /* Benjamin introduces himself */
  var lines = ['salut, moi c’est Benjamin.', 'business, muscu, vidéo.', 'et un peu de ciné.', 'clique sur mes piliers.'];
  var li = 0;
  me.addEventListener('click', function () {
    BJ.say(bubble, lines[li++ % lines.length], 2200);
    BJ.setPose(me.querySelector('img'), 'pockets');
    BJ.sfx.play('boing', { vol: .6 });
  });

  /* rep game */
  var db = root.querySelector('.qu-reps__db');
  var n = 0, done = false, nEl = root.querySelector('.qu-reps__n'), bar = root.querySelector('.qu-reps__bar');
  function rep() {
    if (done) { n = 0; done = false; }
    n++;
    nEl.textContent = n + '/10';
    bar.style.setProperty('--p', n / 10);
    db.classList.add('is-up');
    setTimeout(function () { db.classList.remove('is-up'); }, 140);
    BJ.sfx.play(n % 2 ? 'whoosh' : 'thud', { vol: .5, rate: 1 + n * .03 });
    if (n >= 10) {
      done = true;
      var r = db.getBoundingClientRect();
      BJ.fx.confetti(r.left + r.width / 2, r.top, 50);
      BJ.sfx.play('win');
      BJ.stamp(db.parentNode, 'discipline : validée', { tone: 'mint', rot: -5, x: '62%', y: '20%', ms: 2200 });
      BJ.takes.add('reps');
      BJ.emit('game:win', { id: 'reps' });
      BJ.announce('10 reps. Discipline validée.');
      setTimeout(function () { nEl.textContent = '0/10'; bar.style.setProperty('--p', 0); }, 2400);
    }
  }
  db.addEventListener('click', rep);
});
