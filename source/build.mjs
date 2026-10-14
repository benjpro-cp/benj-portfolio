#!/usr/bin/env node
/* MOTEUR, BENJ ! build (node, no deps)
   node build.mjs              full build
   node build.mjs --only <id>  shell + HUD + one section -> dist/only-<id>.html

   Sources (src/):
     shell.html                 template: includes, /* @styles *\/, <!-- @section:ID -->, <!-- @scripts -->
     shell/head.html, shell/hud.html   included by shell.html
     base.css, base.js          shell styles + window.BJ runtime
     sections/<id>/section.html|css|js
   Outputs:
     dist/index.html            deliverable fragment (no doctype/html/head/body)
     dist/preview.html          same, wrapped in a standards-mode page (use for screenshots)
     dist/assets/*.webp
     ../portfolio/index.html + ../portfolio/assets/   (publish folder)
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(SITE, 'src');
const ASSETS = path.join(SITE, 'assets');
const DIST = path.join(SITE, 'dist');
const PORTFOLIO = path.resolve(SITE, '..', 'portfolio');
const ORDER = ['plateau', 'qui', 'parcours', 'bosse', 'projets', 'offre', 'contact'];
const USED = ['pose-float', 'pose-lean', 'pose-jump', 'pose-pockets', 'pose-squat', 'benj-portrait-s',
  'clap', 'controller', 'camera', 'dumbbell', 'filmroll'].map((n) => n + '.webp');
// Space Grotesk is allowed: it is the MOGD app's own typeface, used only inside the MOGD mockup.
const BANNED_FONTS = ['Inter', 'Bricolage', 'DM Sans', 'Syne', 'Satoshi', 'Poppins',
  'Montserrat', 'Manrope', 'Outfit', 'Figtree', 'Plus Jakarta', 'Fraunces', 'Playfair',
  'Instrument Serif', 'JetBrains Mono', 'Space Mono'];

const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
if (onlyIdx >= 0 && !ONLY) { console.error('build: --only needs a section id'); process.exit(1); }

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
const warnings = [];
const errors = [];
const warn = (m) => warnings.push(m);
const fail = (m) => errors.push(m);

/* ---------- shell template with includes ---------- */
function expandIncludes(html, depth = 0) {
  if (depth > 4) return html;
  return html.replace(/<!--\s*@include:([\w./-]+)\s*-->/g, (_, rel) => {
    const p = path.join(SRC, rel);
    if (!fs.existsSync(p)) { fail(`include not found: src/${rel}`); return ''; }
    return expandIncludes(read(p).trim(), depth + 1);
  });
}

function sectionParts(id) {
  const dir = path.join(SRC, 'sections', id);
  const htmlPath = path.join(dir, 'section.html');
  let html = read(htmlPath).trim();
  if (!html) {
    html = `<section id="${id}" class="bj-scene"><div class="bj-wrap"><p>…</p></div></section>`;
    warn(`${id}: section.html missing, stub used`);
  } else if (!new RegExp(`<section[^>]*\\bid=["']${id}["']`).test(html)) {
    warn(`${id}: section.html has no <section id="${id}"> root`);
  }
  return { id, html, css: read(path.join(dir, 'section.css')).trim(), js: read(path.join(dir, 'section.js')).trim() };
}

/* ---------- CSS scoping check (warn only) ---------- */
function checkScope(id, css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [];
  let buf = '';
  const bad = new Set();
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      const parent = stack[stack.length - 1];
      if (parent === 'kf' || parent === 'skip' || parent === 'rule') { stack.push('skip'); continue; }
      if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) stack.push('group');
      else if (/^@(-webkit-)?keyframes\b/i.test(prelude)) stack.push('kf');
      else if (/^@/.test(prelude)) stack.push('skip');
      else {
        stack.push('rule');
        for (const sel of prelude.split(',')) {
          const s = sel.trim();
          if (s && !s.includes('#' + id)) bad.add(s);
        }
      }
    } else if (ch === '}') {
      stack.pop();
      buf = '';
    } else if (ch === ';' && (!stack.length || stack[stack.length - 1] === 'group')) {
      buf = '';
    } else {
      buf += ch;
    }
  }
  for (const s of bad) warn(`${id}: CSS selector not scoped under #${id}: ${s.slice(0, 90)}`);
}

/* ---------- tiny dependency-free minifiers (sources keep their comments) ----------
   CSS: drop comments, indentation, blank lines.  JS: the sources use block comments
   only (no // comments, no template literals, no comment-like strings: build fails
   loudly otherwise), so block comments + indentation can go safely. */
function minCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')                 /* one line */
    .replace(/\s*([{};])\s*/g, '$1')       /* never touch the space before ':' (descendant :focus) */
    .replace(/([:,])\s+/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}
function minJs(label, js) {
  if (/`/.test(js)) { fail(`${label}: template literal found, JS minifier would be unsafe`); return js; }
  /* scanner: strings are copied verbatim, block comments dropped (no regex literals in the sources) */
  let out = '', i = 0;
  while (i < js.length) {
    const c = js[i];
    if (c === '/' && js[i + 1] === '*') {
      const e = js.indexOf('*/', i + 2);
      i = e < 0 ? js.length : e + 2;
    } else if (c === '/' && js[i + 1] === '/') {
      fail(`${label}: line comment found, JS minifier would be unsafe`); return js;
    } else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < js.length && js[j] !== c) { if (js[j] === '\\') j++; if (js[j] === '\n') break; j++; }
      out += js.slice(i, j + 1); i = j + 1;
    } else { out += c; i++; }
  }
  return out.replace(/^[ \t]+/gm, '').replace(/[ \t]+$/gm, '').replace(/\n{2,}/g, '\n').trim();
}
function minHtml(html) {
  return html.replace(/<!--(?!\s*@)[\s\S]*?-->/g, '').replace(/^[ \t]+/gm, '').replace(/\n{2,}/g, '\n');
}

/* ---------- script wrapper: every file is its own <script> + try/catch IIFE ---------- */
function wrapJs(label, js) {
  if (!js) return '';
  const safe = minJs(label, js).replace(/<\/script/gi, '<\\/script');
  return `<script>\n/* == ${label} == */\n(function(){try{\n${safe}\n}catch(e){console.error('[${label}]',e)}})();\n</script>`;
}

/* ---------- assemble ---------- */
function assemble(ids) {
  let shell = expandIncludes(read(path.join(SRC, 'shell.html')));
  if (!shell) { fail('src/shell.html missing'); return ''; }
  const parts = ids.map(sectionParts);
  const baseCss = read(path.join(SRC, 'base.css')).trim();
  const baseJs = read(path.join(SRC, 'base.js')).trim();

  const css = [`/* == base == */\n${baseCss}`]
    .concat(parts.map((p) => (p.css ? `/* == ${p.id} == */\n${p.css}` : '')).filter(Boolean))
    .join('\n');
  for (const p of parts) if (p.css && !p.id.startsWith('_')) checkScope(p.id, p.css);
  shell = shell.replace('/* @styles */', () => minCss(css));

  const markerIds = [];
  shell.replace(/<!--\s*@section:([\w-]+)\s*-->/g, (_, id) => { markerIds.push(id); return ''; });
  const extra = parts.filter((p) => !markerIds.includes(p.id));
  let firstMarker = true;
  shell = shell.replace(/<!--\s*@section:([\w-]+)\s*-->/g, (_, id) => {
    const p = parts.find((x) => x.id === id);
    let out = p ? minHtml(p.html) : '';
    if (firstMarker && extra.length) out = extra.map((x) => x.html).join('\n') + (out ? '\n' + out : '');
    firstMarker = false;
    return out;
  });

  const scripts = [wrapJs('base', baseJs)].concat(parts.map((p) => wrapJs(p.id, p.js))).filter(Boolean).join('\n');
  shell = shell.replace('<!-- @scripts -->', () => scripts);
  return shell.replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function wrapPreview(fragment) {
  return `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n</head>\n<body>\n${fragment}</body>\n</html>\n`;
}

/* ---------- guards ---------- */
function guard(label, html, isFragment) {
  if (isFragment && /<!doctype|<html\b|<head\b|<body\b/i.test(html)) fail(`${label}: contains <!doctype>/<html>/<head>/<body>`);
  const checks = [
    [/\balert\s*\(/, 'alert('], [/\bconfirm\s*\(/, 'confirm('], [/\bprompt\s*\(/, 'prompt('],
    [/window\.print\b/, 'window.print'], [/<iframe/i, '<iframe'],
    [/<a\b[^>]*\sdownload\b/i, '<a download>'], [/<script[^>]*\ssrc\s*=/i, '<script src=>'],
    [/lorem/i, 'lorem']
  ];
  for (const [re, name] of checks) if (re.test(html)) fail(`${label}: forbidden ${name}`);
  const mail = html.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/);
  if (mail) fail(`${label}: email-like string "${mail[0]}"`);
  const emo = html.match(/\p{Extended_Pictographic}/u);
  if (emo) fail(`${label}: emoji / pictographic char "${emo[0]}" (U+${emo[0].codePointAt(0).toString(16).toUpperCase()})`);
  for (const f of BANNED_FONTS) {
    if (new RegExp(`\\b${f.replace(/ /g, '\\s+')}\\b`).test(html)) fail(`${label}: banned font name "${f}"`);
  }
  const refs = new Set();
  for (const m of html.matchAll(/assets\/([\w.-]+\.(?:webp|png|svg|jpe?g|gif|avif))/gi)) refs.add(m[1]);
  for (const r of refs) if (!fs.existsSync(path.join(ASSETS, r))) fail(`${label}: missing asset assets/${r}`);
  const ids = new Map();
  const markup = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
  for (const m of markup.matchAll(/\sid=["']([^"']+)["']/g)) ids.set(m[1], (ids.get(m[1]) || 0) + 1);
  for (const [id, n] of ids) if (n > 1) warn(`${label}: duplicate id="${id}" (${n}x)`);
  return refs;
}

/* ---------- assets ---------- */
function copyAssets(destDir, refs) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(destDir)) fs.rmSync(path.join(destDir, f), { force: true, recursive: true });
  const want = new Set(USED);
  for (const r of refs) if (!r.startsWith('_')) want.add(r);
  let bytes = 0;
  for (const f of want) {
    const src = path.join(ASSETS, f);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(destDir, f));
    bytes += fs.statSync(src).size;
  }
  return bytes;
}

/* ---------- run ---------- */
fs.mkdirSync(DIST, { recursive: true });
const kb = (n) => (n / 1024).toFixed(1) + ' KB';

if (ONLY) {
  const exists = fs.existsSync(path.join(SRC, 'sections', ONLY));
  if (!exists) { console.error(`build: no section folder src/sections/${ONLY}`); process.exit(1); }
  const frag = assemble([ONLY]);
  const refs = guard(`only-${ONLY}`, frag, true);
  if (!errors.length) {
    fs.writeFileSync(path.join(DIST, `only-${ONLY}.html`), wrapPreview(frag));
    copyAssets(path.join(DIST, 'assets'), refs);
  }
} else {
  const frag = assemble(ORDER);
  const refs = guard('index.html', frag, true);
  if (!errors.length) {
    fs.writeFileSync(path.join(DIST, 'index.html'), frag);
    fs.writeFileSync(path.join(DIST, 'preview.html'), wrapPreview(frag));
    const aBytes = copyAssets(path.join(DIST, 'assets'), refs);
    fs.mkdirSync(PORTFOLIO, { recursive: true });
    fs.writeFileSync(path.join(PORTFOLIO, 'index.html'), frag);
    copyAssets(path.join(PORTFOLIO, 'assets'), refs);
    const hBytes = Buffer.byteLength(frag);
    const total = hBytes + aBytes;
    console.log(`html ${kb(hBytes)} | assets ${kb(aBytes)} | total ${kb(total)}`);
    if (hBytes > 300 * 1024) warn(`html is ${kb(hBytes)} (budget < 300 KB)`);
    if (total > 2 * 1024 * 1024) fail(`total ${kb(total)} exceeds 2 MB`);
  }
}

for (const w of warnings) console.warn('WARN  ' + w);
if (errors.length) {
  for (const e of errors) console.error('ERROR ' + e);
  console.error(`build FAILED (${errors.length} error${errors.length > 1 ? 's' : ''})`);
  process.exit(1);
}
console.log(ONLY
  ? `built ${path.join(DIST, `only-${ONLY}.html`)}`
  : `built ${path.join(DIST, 'index.html')}, ${path.join(DIST, 'preview.html')}, ${path.join(PORTFOLIO, 'index.html')}`);
