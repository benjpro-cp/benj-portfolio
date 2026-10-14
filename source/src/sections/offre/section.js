BJ.section('offre', function (root, BJ) {
  var boxes = [].slice.call(root.querySelectorAll('.of-box'));
  var txt = root.querySelector('.of-basket__txt'), go = root.querySelector('.of-basket__go');
  var NOTES = [523.25, 659.25, 783.99];
  function list() { return boxes.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return b.dataset.s; }); }
  boxes.forEach(function (b, i) {
    b.addEventListener('click', function () {
      var on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      BJ.sfx.note(NOTES[i] * (on ? 1 : .75), { dur: .2 });
      if (on) { var r = b.getBoundingClientRect(); BJ.fx.dust(r.left + r.width / 2, r.bottom, 8); BJ.takes.add('offre'); }
      var l = list();
      BJ.state.offre = l;
      txt.textContent = l.length ? 'Ta sélection : ' + l.join(' + ') + '.' : 'Rien de choisi pour l\'instant.';
      go.hidden = !l.length;
      BJ.emit('offre', { list: l });
    });
  });
});
