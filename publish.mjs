// publish.mjs — publish the built Auditable Works desktop into this repo as an
// installable PWA. The app is built in the auditable monorepo; this repo is the
// release surface (a thin PWA shell wrapping the built works-all.html).
//
//   in ../auditable:  node build.js --target=works-all
//   here:             node publish.mjs            # → index.html
//                     node publish.mjs <auditable-path>
//
// index.html is the built works-all.html with the manifest link + service-worker
// registration injected into <head>. The shell (manifest, sw.js, icon.svg) is
// owned here, so the app build stays a plain app.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const aud = path.resolve(process.argv[2] || path.join(here, '..', 'auditable'));
const src = path.join(aud, 'works-all.html');
if (!fs.existsSync(src)) {
  console.error('publish: no works-all.html at', src, '\n  build it first: (in auditable) node build.js --target=works-all');
  process.exit(1);
}

let html = fs.readFileSync(src, 'utf8');
const inject =
  '<link rel="manifest" href="manifest.webmanifest">\n'
  + '<meta name="theme-color" content="#15191c">\n'
  + '<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));</script>\n';
if (!/rel="manifest"/.test(html)) html = html.replace(/<\/head>/i, inject + '</head>');

fs.writeFileSync(path.join(here, 'index.html'), html);
console.log('published index.html (' + (html.length / 1048576).toFixed(1) + ' MB) from ' + path.relative(here, src));

// Also publish the standalone notebook at /auditable/ → gentropic.org/works/auditable/.
// The bare reactive notebook (no desktop shell), un-shelled from Works. Served
// as-is; the Works SW (scope ./) runtime-caches it on visit.
const nb = path.join(aud, 'auditable.html');
if (fs.existsSync(nb)) {
  fs.mkdirSync(path.join(here, 'auditable'), { recursive: true });
  fs.copyFileSync(nb, path.join(here, 'auditable', 'index.html'));
  const kb = (fs.statSync(nb).size / 1048576).toFixed(1);
  console.log('published auditable/index.html (' + kb + ' MB) — the standalone notebook');
} else {
  console.warn('  (no auditable.html in ' + path.relative(here, aud) + ' — notebook not published)');
}
