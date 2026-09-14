// Part masks for the angler's strips: which pixel is skin, cap, hair, shirt, vest, jeans, boots,
// rod or the keyline, so that a look can dye each one. Reads the strips the slicer wrote and
// writes assets/angler/masks/*.png (the part id in the red channel), a preview to look at, and
// paint.json — each part's dye base and his own skin ramp, measured off the art.
//
// The sheet this reads is flat pixel art: every block of him is one colour, and the colours are
// the parts. So this is a palette lookup and four position rules, and no more than that. The
// script before it ran a working-size classification, a snap, a relight, a head-by-colour pass
// with three thresholds and a blend settlement, all of which existed to tell parts apart in art
// that was soft inside every block. Nothing of that is needed on art that is flat inside them,
// and none of it is kept: every rule here can be checked against the picture by eye.
//
// The palette is read off the strips themselves (colours within a small distance of one another
// merged, the rare ones — the softened ring between blocks — snapped to the nearest common one),
// and each entry is put in a family: key, white, blue, skin, cream, green, khaki, brown. The
// families are the parts, except where the artist used one colour for two things:
//   cream   is the cap's crown and his shirt      — cap above the chin, shirt below
//   blue    is the cap's side panel, his jeans and the reel — cap above the chin; below it, the
//           big piece is jeans and the little one is the reel, which belongs to no part
//   green   is the cap's brim and panel and the fish he holds up — cap against the head, the
//           fish nothing
//   brown   is his hair and beard, his boots and his rod — hair within a head's reach of the
//           face, boots under the trouser hem, rod for the rest
// His teeth are the cream inside the face, and belong to no part; a skin tone should not darken them.
import { readPng, writePng } from './png.mjs';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const DIR = new URL('../src/assets/angler/', import.meta.url).pathname;
const ACTIONS = ['idle', 'walk', 'cast', 'reel', 'celebrate'];
const strips = JSON.parse(readFileSync(`${DIR}strips.json`, 'utf8'));

export const PART = { outline: 1, skin: 2, cap: 3, hair: 4, shirt: 5, vest: 6, jeans: 7, boots: 8, rod: 9 };
const NAME = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));

const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

// The family a palette colour belongs to. The numbers are the sheet's: jeans (36,83,141), the
// cap's dark side (7,20,46), skin (253,191,121) and its shadow (222,124,63), shirt (253,239,219),
// the brim (12,81,53), the vest (110,121,48) and its shadow (51,61,18), rod (135,60,17), boots
// (127,83,54), beard (92,42,19). Olive is told from green by which of red and blue is the larger:
// the vest has red over blue, the brim and the fish blue over red.
function family([r, g, b]) {
  const l = lum([r, g, b]); const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (l < 40 && sat < 24) return 'key';
  if (b > r + 30 && b >= g) return 'blue';
  if (r - b > 90 && r > 200) return 'skin';
  if (l > 150 && sat < 60) return 'cream';
  if (g > r + 8 && b > r) return 'green';
  if (g >= r - 25 && r > b + 15 && g > b + 15) return 'khaki';
  // Brown has to be brown: the softened ring where the cap's cream meets its black line is a
  // warm grey, and read as brown it came out as flecks of hair across the crown of a black cap.
  if (r > g && g >= b && r - b >= 25) return 'brown';
  return 'other';
}

// The palette, over every frame of every strip.
const images = Object.fromEntries(ACTIONS.map((a) => [a, readPng(`${DIR}${a}.png`)]));
const counts = new Map();
ACTIONS.forEach((a) => {
  const { width, height, data } = images[a];
  for (let p = 0; p < width * height; p += 1) {
    if (!data[p * 4 + 3]) continue;
    const k = `${data[p * 4]},${data[p * 4 + 1]},${data[p * 4 + 2]}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
});
const MERGE = 24;
const palette = [];
[...counts].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => {
  const c = k.split(',').map(Number);
  const near = palette.find((e) => dist(e.c, c) <= MERGE);
  if (near) near.n += n; else palette.push({ c, n });
});
const total = palette.reduce((s, e) => s + e.n, 0);
const common = palette.filter((e) => e.n / total >= 0.001);
common.forEach((e) => { e.f = family(e.c); });
console.log(`palette: ${palette.length} colours, ${common.length} common; families ${[...new Set(common.map((e) => e.f))].join(' ')}`);
if (process.env.PROBE) common.forEach((e) => console.log(`  ${e.c.join(',').padEnd(12)} ${e.f.padEnd(6)} ${(e.n / total * 100).toFixed(2)}%`));
const snap = (c) => { let best = common[0]; let d = Infinity; common.forEach((e) => { const dd = dist(e.c, c); if (dd < d) { d = dd; best = e; } }); return best; };

const FOUR = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function components(w, h, test) {
  const seen = new Uint8Array(w * h); const out = [];
  for (let s = 0; s < w * h; s += 1) {
    if (seen[s] || !test(s)) continue;
    const run = [s]; seen[s] = 1; const g = [];
    while (run.length) {
      const i = run.pop(); g.push(i);
      const x = i % w; const y = (i / w) | 0;
      FOUR.forEach(([ox, oy]) => {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return;
        const n = ny * w + nx;
        if (seen[n] || !test(n)) return;
        seen[n] = 1; run.push(n);
      });
    }
    out.push(g);
  }
  return out.sort((a, b) => b.length - a.length);
}
const boxOf = (g, w) => { let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1; g.forEach((i) => { const x = i % w; const y = (i / w) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }); return { x0, x1, y0, y1 }; };
const touches = (g, w, h, test) => g.some((i) => { const x = i % w; const y = (i / w) | 0; return FOUR.some(([ox, oy]) => { const nx = x + ox; const ny = y + oy; return nx >= 0 && ny >= 0 && nx < w && ny < h && test(ny * w + nx); }); });

// One frame: `fam` is the family of every lit pixel, `on` whether it is lit.
function maskFrame(fam, col, w, h, on, label) {
  const part = new Uint8Array(w * h);
  const is = (f) => (i) => on[i] && fam[i] === f;
  const teeth = new Set();

  // His face is the skin with the most beard against it — a hand is skin too, and in the cast
  // frames a forearm is bigger than the face.
  const skins = components(w, h, is('skin'));
  const beardOn = (g) => g.reduce((n, i) => { const x = i % w; const y = (i / w) | 0; return n + FOUR.filter(([ox, oy]) => { const nx = x + ox; const ny = y + oy; return nx >= 0 && ny >= 0 && nx < w && ny < h && fam[ny * w + nx] === 'brown'; }).length; }, 0);
  const face = skins.reduce((best, g) => (beardOn(g) > beardOn(best) ? g : best), skins[0]);
  const faceSet = new Set(face);
  const fb = boxOf(face, w);
  const chin = fb.y1;
  const reach = Math.max(fb.x1 - fb.x0, fb.y1 - fb.y0) * 0.8;
  const onHead = (i) => { const x = i % w; const y = (i / w) | 0; return x >= fb.x0 - reach && x <= fb.x1 + reach && y >= fb.y0 - reach && y <= fb.y1 + reach; };
  skins.forEach((g) => g.forEach((i) => { part[i] = PART.skin; }));

  // Hair and beard: brown against the face, or brown that lies mostly within a head's reach of
  // it (the hair at the back of his head is cut off from the face by his ear's line), and only
  // the part of it within that reach. What runs on past is the rod — in the cast wind-up it
  // passes his chin and the two are one piece of brown.
  const browns = components(w, h, is('brown'));
  const hairSet = new Set();
  // ...and not the rod where it passes the head. In the walk frames he carries it upright past
  // his ear, touching, and in the cast wind-up it crosses his chin, so within a head's reach it
  // is as much "brown against the face" as the beard is, and no thickness tells them apart —
  // the hair behind his ear is as thin as the rod. What does is the shade: the rod is lit in
  // (135,56,12) and (155,66,18), his hair goes no lighter than (119,58,27). Pixels of the rod's
  // lit shades are rod and pixels of the hair's darker shades are hair, and the shades the two
  // share — the rod's shadow is (105,48,16), a beard brown — go with whichever is nearer.
  const ROD_RED = 128; const HAIR_RED = 112;
  browns.forEach((g) => {
    const within = g.filter(onHead).length;
    if (!touches(g, w, h, (n) => faceSet.has(n)) && within * 5 < g.length * 3) return;
    const set = new Set(g); const cls = new Map(); const queue = [];
    g.forEach((i) => { const r = col[i][0]; if (r >= ROD_RED) { cls.set(i, 'rod'); queue.push(i); } else if (r < HAIR_RED) { cls.set(i, 'hair'); queue.push(i); } });
    for (let q = 0; q < queue.length; q += 1) {
      const i = queue[q]; const x = i % w; const y = (i / w) | 0;
      FOUR.forEach(([ox, oy]) => { const nx = x + ox; const ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) return; const n = ny * w + nx; if (!set.has(n) || cls.has(n)) return; cls.set(n, cls.get(i)); queue.push(n); });
    }
    g.forEach((i) => { if (onHead(i) && cls.get(i) !== 'rod') hairSet.add(i); });
  });
  hairSet.forEach((i) => { part[i] = PART.hair; });
  const headSet = new Set([...faceSet, ...hairSet]);
  const nearHead = (g) => touches(g, w, h, (n) => headSet.has(n)) || g.some((i) => onHead(i));

  // The cap: cream, blue and green above the chin and at the head.
  const aboveChin = (g) => boxOf(g, w).y1 <= chin + 2;
  // ...except the cream inside the face itself, which is his teeth and belongs to no part. They
  // are not told from the cap by colour — the crown's brightest cream merges with their white
  // — but by where they are: a piece of cream whose box lies within the face's.
  const inFace = (g) => { const b = boxOf(g, w); return b.x0 >= fb.x0 && b.x1 <= fb.x1 && b.y0 >= fb.y0 && b.y1 <= fb.y1; };
  components(w, h, is('cream')).forEach((g) => { if (inFace(g)) g.forEach((i) => teeth.add(i)); else if (aboveChin(g) && nearHead(g)) g.forEach((i) => { part[i] = PART.cap; }); });
  components(w, h, is('green')).forEach((g) => { if (aboveChin(g) && nearHead(g)) g.forEach((i) => { part[i] = PART.cap; }); });
  const blues = components(w, h, is('blue'));
  blues.forEach((g) => { if (aboveChin(g) && nearHead(g)) g.forEach((i) => { part[i] = PART.cap; }); });

  // Jeans: the big blue below the chin. The reel is the little one, and is left alone.
  const legs = blues.filter((g) => !aboveChin(g));
  const jeans = legs.filter((g) => g.length * 4 >= legs[0].length);
  jeans.forEach((g) => g.forEach((i) => { part[i] = PART.jeans; }));
  const hem = new Int32Array(w).fill(-1);
  jeans.forEach((g) => g.forEach((i) => { const x = i % w; const y = (i / w) | 0; if (y > hem[x]) hem[x] = y; }));

  // The vest is olive; the shirt is the cream that is joined to the vest or the jeans, which the
  // fish's pale belly is not.
  components(w, h, is('khaki')).forEach((g) => g.forEach((i) => { part[i] = PART.vest; }));
  components(w, h, is('cream')).forEach((g) => {
    if (g.some((i) => part[i] === PART.cap || teeth.has(i))) return;
    if (touches(g, w, h, (n) => part[n] === PART.vest || part[n] === PART.jeans)) g.forEach((i) => { part[i] = PART.shirt; });
  });

  // Boots and rod: what is left of the brown. A boot is a piece that sits low — its middle is
  // below the middle of his jeans — and against them, through the line between; the rod, held
  // at chest height, has its middle above that however far down it reaches. Reading boots as
  // what lies under the hem of the trouser leg in its own columns missed the boot he swings out
  // sideways in a wide stance or a jump, whose columns have no hem over them.
  const jb = boxOf(jeans.flat(), w);
  const jeansMid = (jb.y0 + jb.y1) / 2;
  const nearJeans = (g) => g.some((i) => { const x = i % w; const y = (i / w) | 0; for (let oy = -6; oy <= 6; oy += 1) for (let ox = -6; ox <= 6; ox += 1) { const nx = x + ox; const ny = y + oy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && part[ny * w + nx] === PART.jeans) return true; } return false; });
  const midY = (g) => g.reduce((s, i) => s + ((i / w) | 0), 0) / g.length;
  browns.forEach((g) => {
    const rest = g.filter((i) => !hairSet.has(i));
    if (!rest.length) return;
    const to = midY(rest) > jeansMid && nearJeans(rest) ? PART.boots : PART.rod;
    rest.forEach((i) => { part[i] = to; });
  });
  // The lit side of a boot is a tan that reads as skin. Skin that sits that low, against the
  // jeans, and is not his face is a boot too — his hands never hang below his hips.
  skins.forEach((g) => { if (g !== face && midY(g) > jeansMid && nearJeans(g)) g.forEach((i) => { part[i] = PART.boots; }); });

  for (let i = 0; i < w * h; i += 1) if (on[i] && fam[i] === 'key') part[i] = PART.outline;

  // Skin is his face, his hands and arms, the neck under his chin, and nothing else. The lit
  // edge of a vest pocket, the toe of a boot and the buckle of his belt are all a tan that reads
  // as skin, and under a deep skin tone every one of them went dark. So a piece of skin has to
  // be big (a hand or a forearm is hundreds of pixels), or lie just under the face (the neck at
  // his collar), or touch a big piece (the fingers round a rod grip, which the rod splits off
  // the hand); any other piece is a highlight on whatever surrounds it, and takes that label.
  {
    const pieces = components(w, h, (i) => part[i] === PART.skin);
    const big = new Set(pieces.filter((g) => g.length >= 200).flat());
    pieces.forEach((g) => {
      if (big.has(g[0])) return;
      const b = boxOf(g, w);
      const votes = new Map();
      g.forEach((i) => { const x = i % w; const y = (i / w) | 0; for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) { const nx = x + ox; const ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const q = part[ny * w + nx]; if (on[ny * w + nx] && q && q !== PART.skin && q !== PART.outline) votes.set(q, (votes.get(q) || 0) + 1); } });
      const to = votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : 0;
      // The neck shows at his open collar, against the shirt; a pocket flap under his chin in
      // the celebrate frames sits against the vest, and is the vest's.
      const underFace = b.y0 <= fb.y1 + 30 && b.y0 >= fb.y0 && b.x1 >= fb.x0 - 10 && b.x0 <= fb.x1 + 10 && to !== PART.vest;
      if (underFace) return;
      const near = g.some((i) => { const x = i % w; const y = (i / w) | 0; for (let oy = -3; oy <= 3; oy += 1) for (let ox = -3; ox <= 3; ox += 1) { const nx = x + ox; const ny = y + oy; if (nx >= 0 && ny >= 0 && nx < w && ny < h && big.has(ny * w + nx)) return true; } return false; });
      if (near) return;
      g.forEach((i) => { part[i] = to; });
    });
  }

  // The softened ring between two blocks snaps to one side or the other, and now and then to a
  // third colour altogether — a pixel of olive between orange and black. A fleck that small of
  // a part it is not takes the label most of its neighbours carry.
  const ISLAND = 6;
  const seen = new Uint8Array(w * h);
  for (let s = 0; s < w * h; s += 1) {
    if (seen[s] || !on[s] || !part[s]) continue;
    const label = part[s]; const run = [s]; const piece = []; seen[s] = 1;
    while (run.length && piece.length <= ISLAND) {
      const i = run.pop(); piece.push(i);
      const x = i % w; const y = (i / w) | 0;
      FOUR.forEach(([ox, oy]) => { const nx = x + ox; const ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) return; const n = ny * w + nx; if (seen[n] || !on[n] || part[n] !== label) return; seen[n] = 1; run.push(n); });
    }
    if (piece.length > ISLAND || run.length) continue;
    const votes = new Map();
    piece.forEach((i) => { const x = i % w; const y = (i / w) | 0; FOUR.forEach(([ox, oy]) => { const nx = x + ox; const ny = y + oy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) return; const n = ny * w + nx; if (on[n] && part[n] !== label && part[n] !== PART.outline) votes.set(part[n], (votes.get(part[n]) || 0) + 1); }); });
    // A fleck with nothing round it but the line is in the line, and is never dyed.
    const to = votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : PART.outline;
    piece.forEach((i) => { part[i] = to; });
  }

  // What is left in no part and is thin — the softened ring between a block and the line, or
  // between two blocks of different parts, which is a colour that is neither — takes the label
  // of what it lies against. Only the thin: the reel and a held fish are in no part and stay so,
  // and they are told from a ring by having pixels with nothing but more of themselves around.
  {
    const loose = components(w, h, (i) => on[i] && !part[i] && !teeth.has(i));
    loose.forEach((g) => {
      const set = new Set(g);
      const fat = g.some((i) => { const x = i % w; const y = (i / w) | 0; return FOUR.every(([ox, oy]) => { const nx = x + ox; const ny = y + oy; return nx >= 0 && ny >= 0 && nx < w && ny < h && set.has(ny * w + nx); }); });
      if (fat) return;
      const take = g.map((i) => {
        const x = i % w; const y = (i / w) | 0; const votes = new Map();
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = part[ny * w + nx];
          if (on[ny * w + nx] && q && q !== PART.outline) votes.set(q, (votes.get(q) || 0) + 1);
        }
        return votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : PART.outline;
      });
      g.forEach((i, k) => { part[i] = take[k]; });
    });
  }

  if (process.env.PROBE) console.log(`  ${label}: face x${fb.x0}-${fb.x1} y${fb.y0}-${fb.y1}, hair ${hairSet.size}px, jeans hem ${Math.max(...hem)}`);
  return part;
}

// Where the line leaves the rod in the frame each strip holds: the pixel of the rod's biggest
// piece furthest from his feet. Printed for anglerSprites.js, which carries the numbers.
const HELD = { idle: 0, walk: 0, cast: 3, reel: 0, celebrate: 0 };
function rodTip(part, w, h, feetX, feetY) {
  const rod = components(w, h, (i) => part[i] === PART.rod)[0] || [];
  let best = null; let far = -1;
  rod.forEach((i) => { const x = i % w; const y = (i / w) | 0; const d = Math.hypot(x - feetX, y - feetY); if (d > far) { far = d; best = { x, y }; } });
  return best;
}

mkdirSync(`${DIR}masks/`, { recursive: true });
const PREVIEW = {
  [PART.outline]: [18, 18, 22], [PART.skin]: [255, 176, 96], [PART.cap]: [250, 250, 240],
  [PART.hair]: [150, 92, 50], [PART.shirt]: [190, 214, 236], [PART.vest]: [116, 168, 62],
  [PART.jeans]: [64, 122, 216], [PART.boots]: [120, 66, 32], [PART.rod]: [226, 72, 180],
};
const cols = Math.max(...ACTIONS.map((a) => strips[a].frames));
const BW = strips[ACTIONS[0]].w; const BH = strips[ACTIONS[0]].h;
const STEP = Math.max(1, Math.round(BW / 150));
const sw = Math.ceil(BW / STEP); const sh = Math.ceil(BH / STEP);
const pw = cols * sw; const ph = ACTIONS.length * sh;
const preview = Buffer.alloc(pw * ph * 4);
for (let i = 0; i < pw * ph; i += 1) { preview[i * 4] = 28; preview[i * 4 + 1] = 28; preview[i * 4 + 2] = 34; preview[i * 4 + 3] = 255; }
const pool = {};

ACTIONS.forEach((action, ri) => {
  const { width: w, height: h, data } = images[action];
  const out = Buffer.alloc(w * h * 4);
  const tally = {};
  for (let f = 0; f < strips[action].frames; f += 1) {
    const fw = BW;
    const on = new Uint8Array(fw * h); const fam = new Array(fw * h).fill(''); const col = new Array(fw * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < fw; x += 1) {
      const src = (y * w + f * BW + x) * 4;
      if (!data[src + 3]) continue;
      const entry = snap([data[src], data[src + 1], data[src + 2]]);
      on[y * fw + x] = 1; fam[y * fw + x] = entry.f; col[y * fw + x] = entry.c;
    }
    const part = maskFrame(fam, col, fw, h, on, `${action}[${f}]`);
    if (f === HELD[action]) console.log(`  ${action} rodTip: ${JSON.stringify(rodTip(part, fw, h, strips[action].feetX, strips[action].feetY))}`);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < fw; x += 1) {
      const p = part[y * fw + x]; if (!p) continue;
      tally[p] = (tally[p] || 0) + 1;
      const src = (y * w + f * BW + x) * 4;
      (pool[p] = pool[p] || []).push([data[src], data[src + 1], data[src + 2]]);
      out[src] = p; out[src + 3] = 255;
      if (x % STEP === 0 && y % STEP === 0) {
        const c = PREVIEW[p];
        const q = ((ri * sh + ((y / STEP) | 0)) * pw + f * sw + ((x / STEP) | 0)) * 4;
        for (let k = 0; k < 3; k += 1) preview[q + k] = c[k];
      }
    }
  }
  writePng(`${DIR}masks/${action}.png`, { width: w, height: h, data: out });
  console.log(`${action}: ${Object.entries(tally).map(([p, n]) => `${NAME[p]} ${n}`).join(', ')}`);
});
writePng(`${DIR}masks/preview.png`, { width: pw, height: ph, data: preview });

// Each part's dye base is the mean of its lighter half, so a pale dye lands under white rather
// than blowing out. His skin ramp is four bands at the quartiles of the skin's brightness, taken
// without the drawing's own lines (his eyes and the line of his mouth are in the skin part too),
// which the painter holds as drawn anyway.
const mean = (list) => list.reduce((acc, c) => acc.map((v, k) => v + c[k]), [0, 0, 0]).map((v) => Math.round(v / list.length));
const base = {};
Object.entries(pool).forEach(([p, list]) => { const sorted = [...list].sort((a, b) => lum(a) - lum(b)); base[NAME[p]] = mean(sorted.slice(Math.floor(sorted.length / 2))); });
const KEYLINE_FADE = 20;
const skin = (pool[PART.skin] || []).filter((c) => lum(c) >= KEYLINE_FADE).sort((a, b) => lum(a) - lum(b));
const body = [0, 1, 2, 3].map((q) => mean(skin.slice(Math.floor(skin.length * q / 4), Math.max(Math.floor(skin.length * (q + 1) / 4), Math.floor(skin.length * q / 4) + 1))));

// Each part's shades: the palette colours it is drawn in, darkest first, with `main` the one it
// is mostly drawn in. A dye on flat art is a palette swap — every shade of the part maps to a
// shade of the target, by rank — and this is the table it swaps through. Shades under two
// percent of the part are the softened ring between blocks and are not shades.
const shades = {};
Object.entries(pool).forEach(([p, list]) => {
  if (Number(p) === PART.outline || Number(p) === PART.skin) return;
  const merged = [];
  list.forEach((c) => { const near = merged.find((e) => dist(e.c, c) <= MERGE); if (near) { near.n += 1; near.sum = near.sum.map((v, k) => v + c[k]); } else merged.push({ c, n: 1, sum: [...c] }); });
  const total = merged.reduce((s, e) => s + e.n, 0);
  const kept = merged.filter((e) => e.n / total >= 0.02).map((e) => ({ c: e.sum.map((v) => Math.round(v / e.n)), n: e.n })).sort((a, b) => lum(a.c) - lum(b.c));
  const main = kept.reduce((best, e, i) => (e.n > kept[best].n ? i : best), 0);
  shades[NAME[p]] = { main, list: kept.map((e) => e.c) };
});
writeFileSync(`${DIR}paint.json`, `${JSON.stringify({ base, body, shades }, null, 2)}\n`);
console.log('masks/preview.png and paint.json written');
console.log(JSON.stringify({ base, body }));
