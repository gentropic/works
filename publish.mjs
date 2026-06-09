// publish.mjs — assemble the Auditable Works PWA from auditable's built outputs.
// This repo is the release surface (the PWA shell — manifest, sw.js, icon.svg —
// is owned here; the app build in auditable stays a plain app).
//
// Layout produced (served at gentropic.org/works/):
//   index.html          ← the LEAN works-core shell + manifest/sw injected (the PWA
//                          base; first run → setup → provision a profile)
//   full/index.html     ← the works-all monolith (everything, offline, no setup)
//   packages/           ← the first-party code-package catalog (registry.json +
//                          dist/*.gcupkg) — SAME-ORIGIN, so provisioning needs no
//                          CORS and the SW runtime-caches the .gcupkgs
//   auditable/index.html← the standalone notebook (no desktop shell)
//
//   in ../auditable:  node build.js --target=works-core
//                     node build.js --target=works-all
//                     node build.js --target=packages
//                     node build.js                       # auditable.html
//   here:             node publish.mjs [auditable-dir-or-dl-dir]
//
// Accepts either an auditable checkout (built outputs in place) or a flat dir of
// downloaded release assets (the CI's ./dl). packages/ may be a dir OR a
// packages.zip release asset (unzipped by CI before this runs).

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(process.argv[2] || path.join(here, '..', 'auditable'));

const find = (...names) => {
  for (const n of names) {
    const p = path.join(src, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
};
const mb = (p) => (fs.statSync(p).size / 1048576).toFixed(1) + ' MB';

// PWA injection — only the lean index.html is the installable shell.
const PWA_INJECT =
  '<link rel="manifest" href="manifest.webmanifest">\n'
  + '<meta name="theme-color" content="#15191c">\n'
  + '<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));</script>\n';

function injectPwa(html) {
  if (/rel="manifest"/.test(html)) return html;
  return html.replace(/<\/head>/i, PWA_INJECT + '</head>');
}

// ── 1. The lean shell → index.html (the PWA base) ──────────────────────────
const core = find('works-core.html');
if (!core) {
  console.error('publish: no works-core.html at', src, '\n  build it first: (in auditable) node build.js --target=works-core');
  process.exit(1);
}
fs.writeFileSync(path.join(here, 'index.html'), injectPwa(fs.readFileSync(core, 'utf8')));
console.log('published index.html (' + mb(core) + ') — the lean works-core PWA shell');

// ── 2. The monolith → full/index.html (everything, offline, no setup) ──────
const all = find('works-all.html');
if (all) {
  fs.mkdirSync(path.join(here, 'full'), { recursive: true });
  fs.copyFileSync(all, path.join(here, 'full', 'index.html'));
  console.log('published full/index.html (' + mb(all) + ') — the works-all monolith');
} else {
  console.warn('  (no works-all.html — the /full monolith was not published)');
}

// ── 3. The package catalog → packages/ (same-origin) ───────────────────────
// Accept packages/ as a directory (auditable checkout, or unzipped by CI).
const pkgDir = fs.existsSync(path.join(src, 'packages')) ? path.join(src, 'packages') : null;
if (pkgDir) {
  const dest = path.join(here, 'packages');
  fs.rmSync(dest, { recursive: true, force: true });
  fs.cpSync(pkgDir, dest, { recursive: true });
  const n = fs.existsSync(path.join(dest, 'registry.json'))
    ? (JSON.parse(fs.readFileSync(path.join(dest, 'registry.json'), 'utf8')).entries || []).length : 0;
  console.log('published packages/ (' + n + ' catalog entries) — same-origin, SW-cacheable');
} else {
  console.warn('  (no packages/ — the catalog was not published; provisioning will have no default source)');
}

// ── 4. The standalone notebook → auditable/index.html ──────────────────────
const nb = find('auditable.html');
if (nb) {
  fs.mkdirSync(path.join(here, 'auditable'), { recursive: true });
  fs.copyFileSync(nb, path.join(here, 'auditable', 'index.html'));
  console.log('published auditable/index.html (' + mb(nb) + ') — the standalone notebook');
} else {
  console.warn('  (no auditable.html — notebook not published)');
}
