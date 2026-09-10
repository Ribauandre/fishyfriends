// Writes the stock angler strips (src/assets/angler/*.png): the rig rendered in the default
// look, exactly as the game renders it at runtime. Run after changing utils/anglerRig.js or
// utils/anglerDraw.js so the fallback art (no canvas, or before the first draw) matches.
//
//   node scripts/renderAnglerSheets.mjs
//
// Needs Playwright with Chromium (the modules are drawn in a real canvas): a project or global
// install (NODE_PATH=/path/to/global/node_modules) and either `npx playwright install chromium`
// once or PLAYWRIGHT_CHROMIUM=/path/to/chromium.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

// Playwright isn't a dependency of the app; use the project's copy if there is one, else a
// global install (NODE_PATH, or the usual global node_modules).
function loadPlaywright() {
  const candidates = [import.meta.url, ...(process.env.NODE_PATH || '').split(':').filter(Boolean).map((dir) => path.join(dir, 'x.js')), '/usr/local/lib/node_modules/x.js', '/usr/lib/node_modules/x.js'];
  for (const from of candidates) {
    try { return createRequire(from.startsWith('file:') ? from : `file://${from}`)('playwright'); } catch (error) { /* try the next */ }
  }
  throw new Error('playwright not found: npm i -D playwright, or set NODE_PATH to a global node_modules');
}
const { chromium } = loadPlaywright();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const utils = path.join(root, 'src', 'utils');
const out = path.join(root, 'src', 'assets', 'angler');

const browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
const page = await browser.newPage();
// Serve the pure modules straight from src so the page can import them as ES modules.
await page.route('**/*', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' });
  const file = path.join(utils, path.basename(url.pathname));
  if (existsSync(file)) return route.fulfill({ contentType: 'application/javascript', body: readFileSync(file, 'utf8') });
  return route.fulfill({ status: 404, body: '' });
});
page.on('pageerror', (error) => { console.error(error.message); process.exitCode = 1; });
await page.goto('http://angler.local/');
const sheets = await page.evaluate(async () => {
  const draw = await import('/anglerDraw.js');
  const { DEFAULT_LOOK } = await import('/anglerLook.js');
  return draw.renderAngler(DEFAULT_LOOK);
});
await browser.close();
if (!sheets) throw new Error('Nothing rendered — no canvas in the page?');
for (const [action, dataUrl] of Object.entries(sheets)) {
  const file = path.join(out, `${action}.png`);
  writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log(`wrote ${path.relative(root, file)}`);
}
