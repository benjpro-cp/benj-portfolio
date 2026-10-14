BJ.section('parcours', function (root, BJ) {
  var wrap = root.querySelector('.bj-wrap');
  var benj = root.querySelector('.pa-benj'), img = benj.querySelector('img');
  var btns = [].slice.call(root.querySelectorAll('.pa-step__btn'));
  var at = 3, anim = null;
  var LINES = ['', '', '', 'la suite ? on verra. elle sera grande.'];

  function spot(i) {
    var w = wrap.getBoundingClientRect(), b = btns[i].getBoundingClientRect();
    var bw = benj.offsetWidth, bh = benj.offsetHeight;
    return { x: b.left - w.left + b.width / 2 - bw / 2, y: b.top - w.top - bh + 8 };
  }
  function place(i) {
    var p = spot(i);
    benj.style.setProperty('--x', p.x + 'px');
    benj.style.setProperty('--y', p.y + 'px');
  }
  function hop(i) {
    if (i === at) { BJ.setPose(img, 'jump'); BJ.sfx.play('boing'); return; }
    var a = spot(at), b = spot(i);
    at = i;
    BJ.sfx.play('whoosh');
    if (BJ.reduced || !benj.animate) { place(i); return; }
    if (anim) anim.cancel();
    var mx = (a.x + b.x) / 2, my = Math.min(a.y, b.y) - 90;
    anim = benj.animate([
      { transform: 'translate(' + a.x + 'px,' + a.y + 'px)' },
      { transform: 'translate(' + mx + 'px,' + my + 'px) rotate(' + (b.x > a.x ? 12 : -12) + 'deg)', offset: .5 },
      { transform: 'translate(' + b.x + 'px,' + b.y + 'px) scale(1.06,.92)', offset: .88 },
      { transform: 'translate(' + b.x + 'px,' + b.y + 'px)' }
    ], { duration: 560, easing: 'ease-in-out' });
    anim.onfinish = function () { place(i); anim = null; BJ.sfx.play('thud', { vol: .5 }); var r = btns[i].getBoundingClientRect(); BJ.fx.dust(r.left + r.width / 2, r.top, 8); };
    place(i);
  }
  btns.forEach(function (b, i) {
    b.addEventListener('click', function () {
      hop(i);
      if (i === 4) BJ.stamp(btns[4], 'bientôt', { tone: 'cocoa', rot: 8, ms: 1600, size: 's' });
      BJ.takes.add('marche');
    });
  });
  place(at);
  addEventListener('resize', function () { place(at); });
  BJ.fontsReady.then(function () { place(at); });
});
