// usage: node shot.cjs <html file> <outprefix>
const { chromium } = require('playwright');
(async () => {
  const [file, out] = process.argv.slice(2);
  const b = await chromium.launch();
  for (const [name, vp] of [['desk', {width:1440,height:900}], ['mob', {width:390,height:844}]]) {
    const pg = await b.newPage({ viewport: vp });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
    await pg.goto('file://' + file);
    await pg.waitForTimeout(1500);
    await pg.screenshot({ path: `${out}-${name}.png`, fullPage: true });
    const sw = await pg.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight]);
    console.log(name, 'scrollW/innerW/H', sw.join('/'), 'errors:', errs.length ? errs.join(' | ') : 'none');
  }
  await b.close();
})();
