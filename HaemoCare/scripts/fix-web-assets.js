#!/usr/bin/env node
// Post-process `expo export --platform web` output for Cloudflare Pages.
//
// Problem: `wrangler pages deploy` (the deploy step Cloudflare uses
// internally) hard-codes `node_modules` as an excluded directory, anywhere
// in the upload tree. Expo's web export puts Google-Fonts TTF assets at
// `dist/assets/node_modules/@expo-google-fonts/...`. Those files therefore
// never reach the CDN, every font request 404→SPA-fallback returns HTML,
// useFonts() never resolves, App.tsx returns null forever → blank page.
//
// Fix: rename `dist/assets/node_modules` → `dist/assets/_modules`, then
// patch every occurrence of `assets/node_modules/` → `assets/_modules/`
// in the static JS bundles + CSS so runtime fetches resolve.
//
// Safe to run multiple times: the rename is no-op if the source dir is
// already gone, the string replace is no-op if nothing matches.

const fs = require('fs');
const path = require('path');

const DIST = path.resolve(__dirname, '..', 'dist');
const SRC_DIR = path.join(DIST, 'assets', 'node_modules');
const DST_DIR = path.join(DIST, 'assets', '_modules');
const SEARCH = 'assets/node_modules/';
const REPLACE = 'assets/_modules/';

function log(msg) { console.log(`[fix-web-assets] ${msg}`); }

if (!fs.existsSync(DIST)) {
  console.error(`[fix-web-assets] no dist/ at ${DIST} — did you run expo export first?`);
  process.exit(1);
}

if (fs.existsSync(SRC_DIR)) {
  if (fs.existsSync(DST_DIR)) {
    log(`removing pre-existing ${DST_DIR}`);
    fs.rmSync(DST_DIR, { recursive: true, force: true });
  }
  log(`renaming assets/node_modules → assets/_modules`);
  fs.renameSync(SRC_DIR, DST_DIR);
} else {
  log(`no assets/node_modules dir found (already renamed or empty build)`);
}

// Walk every text-ish file under dist/_expo and the root index.html, rewrite
// the path references. Static bundles are minified but the string is intact.
const TEXT_EXTS = new Set(['.js', '.css', '.html', '.json', '.map']);
let patched = 0;

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (TEXT_EXTS.has(path.extname(entry.name))) {
      const before = fs.readFileSync(full, 'utf8');
      if (!before.includes(SEARCH)) continue;
      const after = before.split(SEARCH).join(REPLACE);
      fs.writeFileSync(full, after);
      patched++;
      log(`patched ${path.relative(DIST, full)}`);
    }
  }
}

walk(DIST);
log(`done — ${patched} file(s) patched`);
