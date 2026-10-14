BJ.section('bosse', function (root, BJ) {
  var PHRASES = [['Hello !', 'Salut !'], ['Let’s build it.', 'On le construit.'], ['Stay hungry.', 'Reste affamé.'], ['No days off.', 'Pas de jour off.']];
  var b = root.querySelector('.bo-bubble'), en = b.querySelector('.bo-bubble__en'), fr = b.querySelector('.bo-bubble__fr'), k = 0;
  b.addEventListener('click', function () {
    if (b.classList.contains('is-flip')) {
      k = (k + 1) % PHRASES.length;
      setTimeout(function () { en.textContent = PHRASES[k][0]; fr.textContent = PHRASES[k][1]; }, BJ.reduced ? 0 : 160);
      b.classList.remove('is-flip');
    } else b.classList.add('is-flip');
    BJ.sfx.play('pop');
    BJ.announce(b.classList.contains('is-flip') ? fr.textContent : en.textContent);
  });

  var out = 0, cnt = root.querySelector('[data-books]');
  [].forEach.call(root.querySelectorAll('.bo-book'), function (bk) {
    bk.addEventListener('click', function () {
      var on = bk.classList.toggle('is-out');
      bk.setAttribute('aria-pressed', String(on));
      out += on ? 1 : -1;
      cnt.textContent = out;
      BJ.sfx.play(on ? 'whoosh' : 'thud', { vol: .6 });
      var r = bk.getBoundingClientRect();
      if (on) { BJ.fx.dust(r.left + r.width / 2, r.top, 6); BJ.takes.add('livre'); }
      if (on && out === 5) BJ.stamp(root.querySelector('.bo-books'), 'rat de bibliothèque', { tone: 'mint', rot: -6, x: '60%', y: '30%', ms: 2000 });
    });
    bk.setAttribute('aria-pressed', 'false');
  });
});
