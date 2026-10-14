BJ.section('contact', function (root, BJ) {
  /* real contacts: fill these in */
  var CONTACT = { linkedin: 'https://www.linkedin.com/in/benjamin-campese-158655296', email: '' };

  var li = root.querySelector('[data-c="linkedin"]');
  if (CONTACT.linkedin) li.href = CONTACT.linkedin;
  else { li.removeAttribute('href'); li.setAttribute('aria-disabled', 'true'); li.querySelector('.ct-btn__s').textContent = 'bientôt'; }

  var mail = root.querySelector('.ct-mail'), addr = mail.querySelector('.ct-mail__addr'), copy = mail.querySelector('.ct-copy-btn');
  if (CONTACT.email) addr.textContent = CONTACT.email;
  else { addr.textContent = 'bientôt'; copy.hidden = true; mail.setAttribute('aria-disabled', 'true'); }
  copy.addEventListener('click', function () {
    var done = function () { copy.textContent = 'copié !'; BJ.sfx.play('ting'); setTimeout(function () { copy.textContent = 'copier'; }, 1600); };
    try {
      navigator.clipboard.writeText(CONTACT.email).then(done, function () { selectAddr(); });
    } catch (e) { selectAddr(); }
  });
  function selectAddr() {
    var r = document.createRange(); r.selectNodeContents(addr);
    var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    copy.textContent = 'sélectionné';
  }

  /* services picked above */
  var sel = root.querySelector('.ct-sel');
  BJ.on('offre', function (d) {
    sel.hidden = !d.list.length;
    sel.textContent = d.list.length ? 'Pour : ' + d.list.join(' + ') + '. Écris-moi où tu veux.' : '';
  });

  /* happy Benjamin */
  var btn = root.querySelector('.ct-benj__btn');
  btn.addEventListener('click', function () {
    var r = btn.getBoundingClientRect();
    BJ.fx.confetti(r.left + r.width / 2, r.top + r.height * .2, 60);
    BJ.sfx.play('win');
    BJ.takes.add('contact');
  });
  [].forEach.call(root.querySelectorAll('a.ct-btn'), function (a) {
    a.addEventListener('click', function () { BJ.sfx.play('pop'); });
  });
});
