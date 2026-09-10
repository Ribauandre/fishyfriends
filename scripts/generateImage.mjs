#!/usr/bin/env node
// Generates an image with OpenAI's Images API and writes it to disk. Dev-time art tooling
// only — nothing in the app imports this. The API key comes from OPENAI_API_KEY in the
// environment and is never read from or written to the repo.
//
//   OPENAI_API_KEY=... node scripts/generateImage.mjs --out src/assets/scenes/foo.png \
//     [--size 1536x1024] [--quality medium] [--transparent] [--image ref.png] [--mask mask.png] "prompt text"
//
// --transparent asks for a real alpha channel (sprites); omit it for backdrops.
// --image sends a reference image through the edits endpoint instead, so a new piece can be
// drawn as "the same character as this, now doing X"; with --mask (a PNG the same size whose
// transparent pixels mark the area to redraw) only that area is regenerated — how the angler's
// base strips were made bald and clean-shaven without touching the rest of the art.
//
// Behind an egress proxy (e.g. Claude Code on the web), Node's fetch does not read
// HTTPS_PROXY on its own — run with NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS pointing at
// the proxy's CA bundle) or the request never leaves the box.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i === -1 ? fallback : args[i + 1]; };
const flag = (name) => args.includes(name);
const prompt = args.filter((arg, i) => !arg.startsWith('--') && !['--out', '--size', '--quality', '--image', '--mask'].includes(args[i - 1])).join(' ');
const out = option('--out');
if (!process.env.OPENAI_API_KEY) { console.error('OPENAI_API_KEY is not set.'); process.exit(1); }
if (!out || !prompt) { console.error('Usage: generateImage.mjs --out <file.png> [--size WxH] [--quality low|medium|high] [--transparent] "prompt"'); process.exit(1); }

const body = {
  model: 'gpt-image-1',
  prompt,
  n: 1,
  size: option('--size', '1024x1024'),
  quality: option('--quality', 'medium'),
  output_format: 'png',
  ...(flag('--transparent') ? { background: 'transparent' } : {}),
};

const reference = option('--image');
const response = reference
  ? await (() => {
    // The edits endpoint is multipart: the same fields, plus the reference image.
    const form = new FormData();
    Object.entries(body).forEach(([key, value]) => form.append(key, String(value)));
    form.append('image', new Blob([readFileSync(reference)], { type: 'image/png' }), 'reference.png');
    if (option('--mask')) form.append('mask', new Blob([readFileSync(option('--mask'))], { type: 'image/png' }), 'mask.png');
    return fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
  })()
  : await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
if (!response.ok) { console.error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 600)}`); process.exit(1); }
const json = await response.json();
const b64 = json.data?.[0]?.b64_json;
if (!b64) { console.error('No image returned.'); process.exit(1); }
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(b64, 'base64'));
console.log(`wrote ${out} (${Math.round(Buffer.byteLength(b64, 'base64') / 1024)} KB)`);
