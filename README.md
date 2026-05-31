# works

The published, installable **Auditable Works** PWA — the GCU desktop (reactive
notebooks + a book reader + a terminal + more, in one self-contained page).

This repo is a thin **release surface**, not source. The app is built in the
**`auditable`** monorepo (`../auditable`, `node build.js --target=works-all`);
here it's wrapped as a PWA and served via GitHub Pages.

```
index.html            the built works-all.html + manifest link + SW registration
auditable/index.html  the standalone notebook (auditable.html), at /works/auditable/
manifest.webmanifest  PWA manifest (name, icon, standalone)
sw.js                 service worker — precache the shell → full offline
icon.svg              app icon
publish.mjs           copy ../auditable/{works-all,auditable}.html → here (+ inject PWA bits)
```

Two apps publish here from the one auditable build: the **desktop** at
`gentropic.org/works/` and the bare **notebook** at `gentropic.org/works/auditable/`.

## Publishing a new build

```sh
cd ../auditable && node build.js --target=works-all   # build the desktop
cd ../works     && node publish.mjs                    # → index.html
git add index.html && git commit -m "publish works <date/version>" && git push
```

`publish.mjs` injects the manifest link + SW registration into `<head>`; it
doesn't modify the app itself (the PWA shell is a publishing concern, kept out of
the app build).

## Hosting

GitHub Pages, deploy from `main` / `/` (root) → served at the org domain,
**`https://gentropic.org/works/`** (same setup as `gentropic.org/gcu-library`).
`.nojekyll` keeps the build served as-is.

Sibling repos: **`auditable`** (the app + dev), **`gcu-library`** (content packs
+ the registry + the web reader). A `#capsule=…` link (share / QR) opens here
and installs the referenced pack — "open in Works".
