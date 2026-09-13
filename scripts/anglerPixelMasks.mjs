// Build the part masks for the angler's strips: for every pixel, which garment it belongs to.
// Marina's Outfitters recolours what the artist drew, so the painter needs to know which pixels
// are the cap and which are the shirt — and at this size that cannot come from colour alone.
// The sheet reuses the same colours for different things:
//
//   cream   the cap's crown, and the shirt's sleeves
//   blue    the cap's brim, and his jeans
//   green   the cap's front panel, and the vest
//   brown   his hair and beard, his boots, and the rod
//   tan     his skin, and the lighter leather of the boots
//
// So colour narrows a pixel to a short list and *position* settles it, and the positions are
// taken from the figure rather than from the frame: a band of rows would be wrong the moment he
// raises an arm, which he does in eight of these twenty frames — a green sleeve held up beside
// his ear is at cap height without being a cap.
//
// Two anchors do nearly all of it. His face is the largest patch of skin in the upper part of the
// figure, and everything that is his head — the beard against it, the cap above it — is the patch
// of its own colour that actually touches it. And his boots are simply what is below his jeans,
// which is why the jeans are found first: blue is unambiguous once the cap's brim has been taken
// off it, and no pose puts a boot above a trouser leg.
//
// Run: node scripts/anglerPixelMasks.mjs   (writes masks/*.png beside the strips, and previews)

import { readPng, writePng } from './png.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';

const DIR = new URL('../src/assets/angler/', import.meta.url).pathname;
const strips = JSON.parse(readFileSync(`${DIR}strips.json`, 'utf8'));
const ACTIONS = Object.keys(strips);

// The part a pixel belongs to. Stored in the mask's red channel, so these are small integers and
// they are the contract between this script and utils/anglerPaint.js.
export const PART = { outline: 1, skin: 2, cap: 3, hair: 4, shirt: 5, vest: 6, jeans: 7, boots: 8, rod: 9 };

// What colour a pixel is, before anything is known about where it is. `other` is everything the
// sheet uses once and nothing recolours — the reel, the fish, the rod's guides.
const HUE = { key: 1, skin: 2, cream: 3, blue: 4, green: 5, brown: 6, other: 7 };
function hueOf(r, g, b) {
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum < 42) return HUE.key;
  // Light tan. The boots' own leather runs to 155 and his shaded cheek down to 183, so this is
  // the one pair the threshold cannot separate on its own — below it they are told apart by
  // being above or below the jeans.
  if (r - b > 55 && r > 140 && g > b) return HUE.skin;
  if (b - r > 18 && b >= g) return HUE.blue;
  // Cream before olive: the cap's crown is bright enough that the olive test would take it.
  if (lum > 135 && Math.max(r, g, b) - Math.min(r, g, b) < 75) return HUE.cream;
  if (Math.abs(r - g) < 32 && g > b + 18) return HUE.green;
  if (r > g && g >= b && r - b > 26) return HUE.brown;
  return HUE.other;
}

// Connected runs of pixels a test accepts, eight-connected so a diagonal still counts as joined —
// at this size the artist draws plenty of one-pixel diagonal steps.
function components(w, h, accepts) {
  const seen = new Uint8Array(w * h); const out = [];
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || !accepts(start)) continue;
    const stack = [start]; seen[start] = 1; const group = [];
    while (stack.length) {
      const i = stack.pop(); group.push(i);
      const x = i % w; const y = (i / w) | 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (seen[n] || !accepts(n)) continue;
        seen[n] = 1; stack.push(n);
      }
    }
    out.push(group);
  }
  return out;
}

const touches = (group, set, w, h) => group.some((i) => {
  const x = i % w; const y = (i / w) | 0;
  for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
    const nx = x + ox; const ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (set.has(ny * w + nx)) return true;
  }
  return false;
});

// Whether a piece has a core — whether anything is left after wearing `radius` off every edge.
// This is what separates his beard from his rod, the two brown things that lie against his face.
// A bounding box cannot: a beard wraps a jaw and its box is as long and thin as a rod's. Thickness
// can — a rod is the same width all the way along and a beard has a chin in the middle of it.
const stout = (group, w, radius) => {
  let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1;
  group.forEach((i) => {
    const x = i % w; const y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  });
  const bw = x1 - x0 + 3; const bh = y1 - y0 + 3;
  let mask = new Uint8Array(bw * bh);
  group.forEach((i) => { mask[(((i / w) | 0) - y0 + 1) * bw + (i % w) - x0 + 1] = 1; });
  for (let k = 0; k < radius; k += 1) {
    const next = new Uint8Array(bw * bh); let alive = false;
    for (let y = 1; y < bh - 1; y += 1) for (let x = 1; x < bw - 1; x += 1) {
      const i = y * bw + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - bw] && mask[i + bw]) { next[i] = 1; alive = true; }
    }
    if (!alive) return false;
    mask = next;
  }
  return true;
};

const reaches = (group, w, far) => {
  let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1;
  group.forEach((i) => {
    const x = i % w; const y = (i / w) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  });
  return Math.max(x1 - x0, y1 - y0) + 1 >= far;
};

function maskFrame(hue, w, h, on) {
  const part = new Uint8Array(w * h);
  let top = h;
  for (let i = 0; i < w * h; i += 1) if (on[i] && ((i / w) | 0) < top) top = (i / w) | 0;

  // An opening — worn away by a pixel and grown back — keeps everything solid and loses anything
  // drawn one pixel wide. The rod is the only such thing on him, so this is what tells the rod
  // from his hair further down; it is measured here because picking his face out needs it too.
  const erodeOnce = (mask) => {
    const out = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
      const i = y * w + x;
      if (mask[i] && mask[i - 1] && mask[i + 1] && mask[i - w] && mask[i + w]) out[i] = 1;
    }
    return out;
  };
  const dilateOnce = (mask) => {
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      if (!mask[i]) continue;
      out[i] = 1;
      if (x > 0) out[i - 1] = 1;
      if (x < w - 1) out[i + 1] = 1;
      if (y > 0) out[i - w] = 1;
      if (y < h - 1) out[i + w] = 1;
    }
    return out;
  };
  const openBy = (radius) => {
    let mask = on;
    for (let k = 0; k < radius; k += 1) mask = erodeOnce(mask);
    for (let k = 0; k < radius; k += 1) mask = dilateOnce(mask);
    return mask;
  };
  const opened = openBy(1);
  // Opening by two, for the rod. One round loses a line a pixel wide, which is most of it, but
  // where he grips it the drawing thickens it to two and lays it alongside a fist, and a single
  // round hands that stretch back — so the rod came out dyed from the tip to about his hands and
  // left dark from there in, a dashed line down the middle of the frame. Two rounds lose anything
  // under about four pixels across, and there is nothing that thin on him: his forearm is five
  // across at the wrist and everything else is thicker.
  const openedRod = openBy(2);

  // His face is the patch of skin with hair against it. Size is not the test and height is not
  // the test: crouched into a cast he holds a bare forearm out in front of him, and that is both
  // a bigger patch of skin than his face and no lower down, so both of those pick the arm — and
  // then his cap hangs off his elbow and comes out as a band of denim across his forehead. What
  // is only ever true of the face is that it has a beard on it. The brown must be blobby to
  // count, so that a fist closed around the rod does not score for gripping something brown.
  const hairish = (i) => hue[i] === HUE.brown && opened[i];
  const beardScore = (g) => {
    const seen = new Set();
    g.forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (on[n] && hairish(n)) seen.add(n);
      }
    });
    return seen.size;
  };
  const skinBlobs = components(w, h, (i) => on[i] && hue[i] === HUE.skin);
  const face = skinBlobs.sort((a, b) => beardScore(b) - beardScore(a) || b.length - a.length)[0] || [];
  const faceSet = new Set(face);

  // His hair and beard: the brown that touches his face. The rod is brown too and passes close
  // by his head in several poses, but it is held in a hand, not grown on a chin.
  const brownBlobs = components(w, h, (i) => on[i] && hue[i] === HUE.brown);
  // ...and only as far as a head reaches. Whole components will not do: wound up for the cast he
  // brings the rod past his chin, and there the rod and the beard are one piece of brown, so no
  // test on the piece can separate them — it took the rod into his beard and that frame lost its
  // rod entirely. A beard is bounded by the head it grows on, so the brown that touches his face
  // counts as hair only within a head's reach of it, and whatever runs on past that is left for
  // the rod tests to claim.
  let fx0 = w; let fx1 = -1; let fy0 = h; let fy1 = -1;
  faceSet.forEach((i) => {
    const x = i % w; const y = (i / w) | 0;
    if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
  });
  const headReach = Math.max(fx1 - fx0, fy1 - fy0) * 0.7;
  const onHead = (i) => {
    const x = i % w; const y = (i / w) | 0;
    return x >= fx0 - headReach && x <= fx1 + headReach && y >= fy0 - headReach && y <= fy1 + headReach;
  };
  const hair = brownBlobs.filter((g) => touches(g, faceSet, w, h)).map((g) => g.filter(onHead));
  const hairSet = new Set(hair.flat());

  // His cap: the cream, blue and green that sit on that head.
  //
  // A different sheet drew him in a bucket hat the same tan as the skin under it — (225,187,131)
  // against (221,188,136) — and there the hat had to be found by shape, as the part of the head
  // patch above its widest row. This one draws a white crown, a green panel and a navy brim, and
  // none of those is a colour a face is, so colour answers it directly and far more cleanly. The
  // shape rule is not kept as a fallback: on this sheet it takes the top of his forehead.
  //
  // What colour alone cannot do is tell the crown from his shirt, or the brim from his jeans — the
  // same cream and the same navy. So a piece counts as cap only if it lies against his head and
  // reaches no lower than his chin: in the poses where he brings the rod up there is no keyline
  // between crown and shoulder for a flood to stop at, and without that clause the whole man comes
  // out as one piece of hat.
  const faceRows = face.map((i) => (i / w) | 0);
  const faceTop = face.length ? Math.min(...faceRows) : top;
  const faceBottom = face.length ? Math.max(...faceRows) : top;
  const headSet = new Set([...faceSet, ...hairSet]);
  const capBlobs = components(w, h, (i) => on[i] && (hue[i] === HUE.cream || hue[i] === HUE.blue || hue[i] === HUE.green));
  // ...and over the head rather than merely beside it. In one celebrate frame he holds a fish up
  // level with his ear: it is pale, it is a separate piece, it reaches higher than his crown and it
  // lies against his head, so it answered every clause above and came out as cap — twice as much
  // cap as any other frame, and a dyed hat would have taken the fish with it. A hat is worn on a
  // head, so the middle of a piece of it has to sit within the width of the face it is worn on.
  const overHead = (g) => {
    const mid = g.reduce((sum, i) => sum + (i % w), 0) / g.length;
    const span = (fx1 - fx0) * 0.4;
    return mid >= fx0 - span && mid <= fx1 + span;
  };
  const capSet = new Set(capBlobs
    .filter((g) => touches(g, headSet, w, h) && overHead(g) && Math.min(...g.map((i) => (i / w) | 0)) <= faceTop)
    .map((g) => g.filter((i) => ((i / w) | 0) <= faceBottom))
    .flat());
  // The brim is drawn with its own dark edge between it and the crown, so it is a separate piece
  // and does not reach over the top of the head — on its own it fails the test above and comes out
  // as a band of denim across his forehead. A cap is one hat, so anything of its colours lying
  // against what is already cap, and no lower than his chin, is part of it.
  for (let grown = true; grown;) {
    grown = false;
    capBlobs.forEach((g) => {
      if (g.every((i) => capSet.has(i))) return;
      if (Math.max(...g.map((i) => (i / w) | 0)) > faceBottom) return;
      if (!overHead(g) || !touches(g, capSet, w, h)) return;
      g.forEach((i) => capSet.add(i)); grown = true;
    });
  }
  // Clipped to the head's own width, not merely filtered by it. Whole components will not do here
  // either: in that frame the fish, his raised sleeve and the crown are all cream and all one
  // piece, so there is nothing to reject — the piece is genuinely part cap. A cap is no wider than
  // the head it is worn on, so what lies outside that width is not cap whatever it is joined to.
  const capSpan = (fx1 - fx0) * 0.4;
  [...capSet].forEach((i) => {
    const x = i % w;
    if (x < fx0 - capSpan || x > fx1 + capSpan) capSet.delete(i);
  });

  let capLeft = w; let capRight = -1; let capBottom = -1;
  capSet.forEach((i) => {
    const x = i % w; const y = (i / w) | 0;
    if (x < capLeft) capLeft = x;
    if (x > capRight) capRight = x;
    if (y > capBottom) capBottom = y;
  });

  // His jeans: the blue that is not his cap's brim. Then his boots are what is under them —
  // taken per column, so a boot swung forward in a stride is still under its own trouser leg.
  //
  // It has to be the trousers and not merely the blue, because his *reel* is blue too, and it
  // hangs at chest height: read every blue pixel as trouser and the reel sets a hem of its own
  // in the two or three columns it occupies, so everything below it down that narrow strip —
  // his hip, his hand, the hem of his vest — comes out as boot, and a red boot puts a red smear
  // across the middle of him. It moves side to side with the pose, which is why it showed up on
  // his right in the idle frames and on his left in the celebrate ones. So the trousers are the
  // big blue, by the same stray rule the garments use: two legs, and nothing a quarter their size.
  const blueBlobs = components(w, h, (i) => on[i] && hue[i] === HUE.blue && !capSet.has(i));
  const biggestBlue = Math.max(0, ...blueBlobs.map((g) => g.length));
  const jeans = blueBlobs.filter((g) => g.length * 4 >= biggestBlue).flat();
  const hemBy = new Int16Array(w).fill(-1);
  jeans.forEach((i) => { const x = i % w; const y = (i / w) | 0; if (y > hemBy[x]) hemBy[x] = y; });
  // A column with no trouser in it — between his boots, or out past them — takes the hem of the
  // nearest column that has one, so the band follows the legs instead of breaking up.
  const hem = new Int16Array(w);
  for (let x = 0; x < w; x += 1) {
    if (hemBy[x] >= 0) { hem[x] = hemBy[x]; continue; }
    let near = -1; let best = Infinity;
    for (let k = 0; k < w; k += 1) if (hemBy[k] >= 0 && Math.abs(k - x) < best) { best = Math.abs(k - x); near = hemBy[k]; }
    hem[x] = near;
  }

  const belowHem = (i) => { const x = i % w; return hem[x] >= 0 && ((i / w) | 0) > hem[x]; };

  // The rod is found by its shape, not by joining it up. It is drawn one pixel wide and its own
  // dark edge breaks the brown into single pixels a step apart, so there is no component there to
  // find — the first attempt at this came back with fourteen rod pixels in a whole strip. What is
  // true of it is that it is thin: erode the figure and a one-pixel line disappears, where his
  // body, his hair and his boots all survive and come back under the matching dilation. So the
  // rod is the brown that the opening does not give back. Taking every brown that is not hair
  // instead also takes the shadow in a fold of his vest, and a red rod would scatter red across
  // his chest.
  // Its own dark edge is thin in the same way and belongs to it: left out, a dyed rod comes out a
  // dashed line, because the sheet draws about half of it in the near-black it draws outlines in.
  // His body's outline is thin too, but an opening gives that back — it is the ring around a
  // solid thing, not a line on its own.
  // Opening by two costs one thing, and it is paid for here. Where the crown of his hat is only a
  // couple of pixels tall the opening takes its keyline too, and a keyline is near-black like half
  // the rod, so the top of every hat in the sheet came out as rod and a red rod put red pixels on
  // his head. Inside the hat, then, only *brown* counts as rod: the rod does cross the head box in
  // the cast poses and its brown core is still found there, and all that is given up is its own
  // dark edge for those few pixels, which is a pixel wide and against a dark hat.
  const inHat = (i) => {
    const y = (i / w) | 0; const x = i % w;
    return y <= capBottom && x >= capLeft && x <= capRight;
  };
  const thin = new Set();
  for (let i = 0; i < w * h; i += 1) {
    if (!on[i] || openedRod[i] || hairSet.has(i) || belowHem(i)) continue;
    if (hue[i] === HUE.key && inHat(i)) continue;
    if (hue[i] === HUE.brown || hue[i] === HUE.key) thin.add(i);
  }
  // A rod is long. The fish he holds up in the celebrate frames is drawn with a thin dark fin and
  // a thinner tail, and those are as narrow as a rod and the same near-black, so they answer to
  // everything above — leaving a scatter of rod-coloured flecks across a fish that would light up
  // the moment anyone bought a red rod. Nothing else the test finds is more than a few pixels
  // across, so the rod is simply the runs of it long enough to be one.
  const ROD_RUN = 5;
  const rodSet = new Set(components(w, h, (i) => thin.has(i)).filter((g) => g.length >= ROD_RUN).flat());

  // Thinness above is measured against his whole outline, and there is one pose where that misses
  // the rod entirely: wound up for the cast he holds it back along his own arm, and the two
  // together are as wide as an arm, so the opening hands it back and that frame came out with no
  // rod at all while the other nineteen were right. What is still true of it there is the rest of
  // what a rod is — a long piece of brown with no core to it. A beard has a core, and his boots
  // are below the hem already.
  brownBlobs.forEach((group) => {
    // What is left of this piece once his beard and his boots are taken out of it — tested on the
    // remainder rather than the whole, since in that one pose the rod and the beard are one piece.
    const rest = group.filter((i) => !hairSet.has(i) && !belowHem(i));
    if (!rest.length || stout(rest, w, 1) || !reaches(rest, w, ROD_RUN)) return;
    rest.forEach((i) => rodSet.add(i));
  });

  // A garment is one thing, or at most a few — two sleeves, two trouser legs. So each is the
  // pieces of its colour that are a real part of it, and anything smaller than a quarter of the
  // biggest piece is a stray the hue test picked up: a flake of shading, or the fish he is
  // holding up, which is green like his vest and would otherwise be dyed along with it. A stray
  // is left undyed rather than guessed at, because an undyed pixel is invisible and a wrongly
  // dyed one is a coloured fleck in the middle of him.
  function garment(accepts) {
    const groups = components(w, h, (i) => on[i] && accepts(i));
    if (!groups.length) return new Set();
    const biggest = Math.max(...groups.map((g) => g.length));
    return new Set(groups.filter((g) => g.length * 4 >= biggest).flat());
  }
  const free = (i) => !capSet.has(i) && !hairSet.has(i) && !rodSet.has(i) && !belowHem(i);
  const jeansSet = garment((i) => free(i) && hue[i] === HUE.blue);
  const skinSet = garment((i) => free(i) && hue[i] === HUE.skin);

  // The fish he holds up on three of these frames is the same green as his vest and the same
  // cream as his sleeves, and it is big enough to survive the stray test on both. What separates
  // a garment from a caught fish is that a garment is joined to the rest of what he is wearing —
  // a sleeve meets the vest, the vest meets the waist of his jeans — where a fish held out at
  // eye level meets nothing but his fist, and his fist is skin. So each of these is the colour
  // that either reaches something already known to be clothing, or lies below his chin at all.
  function worn(want, anchor) {
    const blobs = components(w, h, (i) => on[i] && free(i) && hue[i] === want)
      .filter((g) => touches(g, anchor, w, h) || g.reduce((s, i) => s + ((i / w) | 0), 0) / g.length > faceBottom);
    const biggest = Math.max(0, ...blobs.map((g) => g.length));
    return new Set(blobs.filter((g) => g.length * 4 >= biggest).flat());
  }
  const vestSet = worn(HUE.green, jeansSet);
  const shirtSet = worn(HUE.cream, new Set([...vestSet, ...jeansSet]));

  for (let i = 0; i < w * h; i += 1) {
    if (!on[i]) continue;
    // The rod is asked before the outline, because half of it is drawn in the outline's own
    // near-black and asking the other way round leaves a dyed rod dashed.
    if (capSet.has(i)) { part[i] = PART.cap; continue; }
    if (hairSet.has(i)) { part[i] = PART.hair; continue; }
    if (rodSet.has(i)) { part[i] = PART.rod; continue; }
    if (hue[i] === HUE.key) { part[i] = PART.outline; continue; }
    if (belowHem(i)) { part[i] = PART.boots; continue; }
    if (jeansSet.has(i)) { part[i] = PART.jeans; continue; }
    if (skinSet.has(i)) { part[i] = PART.skin; continue; }
    if (shirtSet.has(i)) { part[i] = PART.shirt; continue; }
    if (vestSet.has(i)) { part[i] = PART.vest; continue; }
    part[i] = 0;
  }
  return part;
}

const PREVIEW = {
  [PART.outline]: [18, 18, 22], [PART.skin]: [255, 176, 96], [PART.cap]: [250, 250, 240],
  [PART.hair]: [150, 92, 50], [PART.shirt]: [190, 214, 236], [PART.vest]: [116, 168, 62],
  [PART.jeans]: [64, 122, 216], [PART.boots]: [120, 66, 32], [PART.rod]: [226, 72, 180],
};

mkdirSync(`${DIR}masks/`, { recursive: true });
// The preview is a thing to look at, not an asset. At the size he is actually drawn, one pixel for
// one pixel is a nine-thousand-pixel-wide PNG and a megabyte in the repo, so it is sampled down to
// something a person can take in at a glance.
const cols = Math.max(...ACTIONS.map((a) => strips[a].frames));
const BW = strips[ACTIONS[0]].w; const BH = strips[ACTIONS[0]].h;
const STEP = Math.max(1, Math.round(BW / 110));
const sw = Math.ceil(BW / STEP); const sh = Math.ceil(BH / STEP);
const pw = cols * sw; const ph = ACTIONS.length * sh;
const preview = Buffer.alloc(pw * ph * 4);
for (let i = 0; i < pw * ph; i += 1) { preview[i * 4] = 28; preview[i * 4 + 1] = 28; preview[i * 4 + 2] = 34; preview[i * 4 + 3] = 255; }

// The strips are cut at the resolution the artist drew at, which is about eight times the size the
// rules above were written and checked against. They are not run there.
//
// Every one of those rules is about shape at the scale of the drawing — a rod is thin, a beard is
// not; a cap lies against a head; a garment is one piece and a stray is a quarter the size of one.
// Scaled up they all still read, but the art underneath stops cooperating: at full size the hue
// regions fragment, because the artist draws shading *inside* a beard and a keyline between every
// two things, and those internal lines are pixels thick. Asked at that size, a beard is not one
// stout patch of brown but a dozen thin ones, and it comes out as rod; widen the reach so that a
// cap can find the head across its own outline and the rod, passing his ear, finds it too.
//
// Both of those were real, and both were chased for a while before the better answer showed up:
// classify where the classification is stable and carry the answer across. So the frame is boxed
// down to working size, the rules run there exactly as they were verified, and the labels are
// expanded back. A label map upsamples honestly — it has no colours to interpolate — and the only
// thing it costs is that a boundary lands within a working pixel of where it should, which is
// inside the blend the render put there anyway.
const WORKING_HEIGHT = 30;

function maskAtWorkingSize(hue, fw, h, on, data, stripW, xOffset) {
  const scale = Math.max(1, Math.round(h / WORKING_HEIGHT));
  if (scale === 1) return maskFrame(hue, fw, h, on);
  const sw = Math.ceil(fw / scale); const sh = Math.ceil(h / scale);
  const sOn = new Uint8Array(sw * sh); const sHue = new Uint8Array(sw * sh);
  for (let sy = 0; sy < sh; sy += 1) for (let sx = 0; sx < sw; sx += 1) {
    const mean = [0, 0, 0]; let lit = 0; let total = 0;
    for (let y = sy * scale; y < Math.min(h, (sy + 1) * scale); y += 1) {
      for (let x = sx * scale; x < Math.min(fw, (sx + 1) * scale); x += 1) {
        total += 1;
        if (!on[y * fw + x]) continue;
        const src = (y * stripW + xOffset + x) * 4;
        mean[0] += data[src]; mean[1] += data[src + 1]; mean[2] += data[src + 2]; lit += 1;
      }
    }
    // Drawn at all only where the block is mostly figure, which is what keeps a keyline one
    // working pixel thick rather than two.
    if (!lit || lit * 2 <= total) continue;
    sOn[sy * sw + sx] = 1;
    sHue[sy * sw + sx] = hueOf(Math.round(mean[0] / lit), Math.round(mean[1] / lit), Math.round(mean[2] / lit));
  }
  const small = maskFrame(sHue, sw, sh, sOn);
  const part = new Uint8Array(fw * h);
  for (let y = 0; y < h; y += 1) for (let x = 0; x < fw; x += 1) {
    if (!on[y * fw + x]) continue;
    part[y * fw + x] = small[Math.min(sh - 1, (y / scale) | 0) * sw + Math.min(sw - 1, (x / scale) | 0)];
  }
  // A full-size pixel whose working pixel was background — the outer half of a keyline, the blend
  // around every edge — takes a vote of its assigned neighbours. Left alone it is recoloured by
  // nothing, and a dyed cap is drawn with a seam of its original colour all the way round.
  for (let round = 0; round < scale; round += 1) {
    const grown = [];
    for (let i = 0; i < fw * h; i += 1) {
      if (!on[i] || part[i]) continue;
      const votes = new Map();
      const x = i % fw; const y = (i / fw) | 0;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
        const v = part[ny * fw + nx];
        if (v) votes.set(v, (votes.get(v) || 0) + 1);
      }
      if (votes.size) grown.push([i, [...votes].sort((a, b) => b[1] - a[1])[0][0]]);
    }
    if (!grown.length) break;
    grown.forEach(([i, v]) => { part[i] = v; });
  }

  // Expanded like that the labels are right but their edges are square, in steps of a working
  // pixel, where the art's own edges are where the artist put them. Dyed, that shows: the cap's
  // colour runs a few pixels onto the forehead along one row and stops short along the next.
  //
  // The working size decided *which* parts this pose has and roughly where — the part that needs
  // the whole figure to answer. Where a boundary falls needs only the pixel: his hat is cream and
  // his face is not. So every pixel whose colour disagrees with the label it inherited looks
  // outward for the nearest label its colour does fit, and takes that. Only boundaries move, only
  // as far as a working pixel, and only onto a part already found nearby — a pixel cannot invent
  // a part that this pose does not have.
  const FITS = {
    [PART.outline]: [HUE.key], [PART.skin]: [HUE.skin], [PART.cap]: [HUE.cream, HUE.blue, HUE.green],
    [PART.hair]: [HUE.brown], [PART.shirt]: [HUE.cream], [PART.vest]: [HUE.green],
    [PART.jeans]: [HUE.blue], [PART.boots]: [HUE.brown, HUE.skin], [PART.rod]: [HUE.brown, HUE.key],
  };
  const fits = (p, q) => p && FITS[p] && FITS[p].includes(q);
  // ...and only at a boundary. Asked everywhere, this relabels the *inside* of parts too: a
  // highlight on his beard is light enough to read as skin, and a shadow on his cheek dark enough
  // to read as brown, so the beard came out flecked with skin and the face with hair, and the
  // dyes lit every fleck up in the wrong colour. A pixel with nothing but its own part around it
  // is that part whatever colour the artist shaded it; only one that sits against another part
  // is really in doubt.
  const edge = (i) => {
    const x = i % fw; const y = (i / fw) | 0;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      const nx = x + ox; const ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
      const v = part[ny * fw + nx];
      if (v && v !== part[i]) return true;
    }
    return false;
  };
  const snapped = new Uint8Array(part);
  for (let i = 0; i < fw * h; i += 1) {
    if (!on[i] || !part[i] || fits(part[i], hue[i]) || !edge(i)) continue;
    const x = i % fw; const y = (i / fw) | 0;
    let found = 0;
    for (let r = 1; r <= scale && !found; r += 1) {
      for (let oy = -r; oy <= r && !found; oy += 1) for (let ox = -r; ox <= r && !found; ox += 1) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
        if (fits(part[ny * fw + nx], hue[i])) found = part[ny * fw + nx];
      }
    }
    if (found) snapped[i] = found;
  }
  return snapped;
}

// Every pixel of each part, gathered across all twenty frames, so the dye bases and the skin
// ramp below are measured off the art rather than guessed at.
const pool = {};

ACTIONS.forEach((action, ri) => {
  const img = readPng(`${DIR}${action}.png`);
  const { width: w, height: h, data } = img;
  const on = new Uint8Array(w * h); const hue = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    on[i] = data[i * 4 + 3] ? 1 : 0;
    if (on[i]) hue[i] = hueOf(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  const out = Buffer.alloc(w * h * 4);
  const counts = {};
  for (let f = 0; f < strips[action].frames; f += 1) {
    // One frame at a time, so a component never runs from one pose into the next.
    const fw = BW;
    const fOn = new Uint8Array(fw * h); const fHue = new Uint8Array(fw * h);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < fw; x += 1) {
      fOn[y * fw + x] = on[y * w + f * BW + x]; fHue[y * fw + x] = hue[y * w + f * BW + x];
    }
    const part = maskAtWorkingSize(fHue, fw, h, fOn, data, w, f * BW);
    for (let y = 0; y < h; y += 1) for (let x = 0; x < fw; x += 1) {
      const p = part[y * fw + x]; if (!p) continue;
      counts[p] = (counts[p] || 0) + 1;
      const src = (y * w + f * BW + x) * 4;
      (pool[p] = pool[p] || []).push([data[src], data[src + 1], data[src + 2]]);
      const t = (y * w + f * BW + x) * 4;
      out[t] = p; out[t + 3] = 255;
      if (x % STEP === 0 && y % STEP === 0) {
        const c = PREVIEW[p];
        const q = ((ri * sh + ((y / STEP) | 0)) * pw + f * sw + ((x / STEP) | 0)) * 4;
        for (let k = 0; k < 3; k += 1) preview[q + k] = c[k];
      }
    }
  }
  writePng(`${DIR}masks/${action}.png`, { width: w, height: h, data: out });
  const name = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
  console.log(`${action}: ${Object.entries(counts).map(([p, n]) => `${name[p]} ${n}`).join(', ')}`);
});
writePng(`${DIR}masks/preview.png`, { width: pw, height: ph, data: preview });

// What each part is painted in, which is what its dye is measured against. Taken from the
// lighter half of the part rather than its middle, so that dyeing a pale colour onto it lands
// under white instead of blowing out — the same reading the previous sheet's bases were taken at.
const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const mean = (list) => list.reduce((acc, c) => acc.map((v, k) => v + c[k]), [0, 0, 0]).map((v) => Math.round(v / list.length));
const base = {};
Object.entries(pool).forEach(([p, list]) => {
  const sorted = [...list].sort((a, b) => lum(a) - lum(b));
  base[p] = mean(sorted.slice(Math.floor(sorted.length / 2)));
});

// His skin, as a ramp: the tones sorted by brightness and cut into four bands at the quartiles,
// each band the mean of the tones actually used in it. A skin tone is not a dye — a dye keeps
// only brightness and rebuilds the colour, which flattens a face — so the painter moves a pixel
// from its band in this ramp to the same band in the one being worn. The five ramps it can be
// moved to are the ones the previous sheet's artist drew as five separate heads, in
// utils/skinRamps.json: real drawn skin, and the only measured skin tones there are.
const skin = [...(pool[PART.skin] || [])].sort((a, b) => lum(a) - lum(b));
const body = [0, 1, 2, 3].map((q) => mean(skin.slice(Math.floor(skin.length * q / 4), Math.max(Math.floor(skin.length * (q + 1) / 4), Math.floor(skin.length * q / 4) + 1))));

const named = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
const out = { base: Object.fromEntries(Object.entries(base).map(([p, c]) => [named[p], c])), body };
writeFileSync(`${DIR}paint.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log('masks/preview.png and paint.json written');
console.log(JSON.stringify(out));
