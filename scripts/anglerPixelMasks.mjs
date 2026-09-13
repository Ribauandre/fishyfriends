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

const touches = (group, set, w, h, reach = 1) => group.some((i) => {
  const x = i % w; const y = (i / w) | 0;
  for (let oy = -reach; oy <= reach; oy += 1) for (let ox = -reach; ox <= reach; ox += 1) {
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
  //
  // And the pieces are cut at the chin *before* any of that is asked of them, not after. Asked of
  // whole pieces, the fish he holds up in one celebrate frame passed everything: it is joined to
  // his vest through the raised sleeve, the vest is the same green, and the whole torso is one
  // piece whose middle sits squarely under his head — so it was cap, and cutting it at the chin
  // afterwards left exactly the fish and the sleeve. Cut first, the fish and the top of that
  // sleeve are a piece of their own, off to one side of the head, and fail the width test.
  //
  // Above the chin means above the chin *row*, not down to it: at working size his chin row is
  // his mouth, and in the reel frames his gritted teeth are two cream pixels on it, inside the
  // face, joined to nothing — and they were cap, so a black cap put a black grin on him.
  const aboveChin = (i) => ((i / w) | 0) < faceBottom;
  const capBlobs = components(w, h, (i) => on[i] && aboveChin(i) && (hue[i] === HUE.cream || hue[i] === HUE.blue || hue[i] === HUE.green));
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
    .flat());
  // The brim is drawn with its own dark edge between it and the crown, so it is a separate piece
  // and does not reach over the top of the head — on its own it fails the test above and comes out
  // as a band of denim across his forehead. A cap is one hat, so anything of its colours lying
  // against what is already cap, and no lower than his chin, is part of it.
  //
  // ...lying *on* it, that is: a piece joins only if more than half of it sits within a working
  // pixel of the cap's own box. The test used to be the same width-of-the-face test as above, and
  // that let in the top of a raised shirt sleeve in two celebrate frames — cream, beside the head
  // at ear height, within two pixels of the brim, and with its middle a little more than a
  // face-width from the face's own, which the 0.4 allowance above (needed for a crown seen from
  // behind) waves through — and, once the pieces were cut at the chin, a pixel of vest collar in
  // the cast wind-up, two rows under the brim. A brim hangs under the crown, the panel sits on it
  // and the brim's shadow lies a pixel under it; a sleeve is beside the whole hat and a collar is
  // below it.
  const onCap = (g) => {
    let cx0 = w; let cx1 = -1; let cy0 = h; let cy1 = -1;
    capSet.forEach((i) => { const x = i % w; const y = (i / w) | 0; if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; });
    const inside = g.filter((i) => { const x = i % w; const y = (i / w) | 0; return x >= cx0 - 1 && x <= cx1 + 1 && y >= cy0 - 1 && y <= cy1 + 1; }).length;
    return inside * 2 > g.length;
  };
  for (let grown = true; grown;) {
    grown = false;
    capBlobs.forEach((g) => {
      if (g.every((i) => capSet.has(i))) return;
      // Two working pixels of reach, not one: the green panel on the front is drawn with its own
      // dark edge between it and the crown, and where the head is turned away that edge is a full
      // working pixel wide, so at one pixel the panel never touches the cap and came out as
      // nothing at all — a green corner on a black cap in the cast wind-up.
      if (!onCap(g) || !touches(g, capSet, w, h, 2)) return;
      g.forEach((i) => capSet.add(i)); grown = true;
    });
  }
  // ...and one piece, joined to the head. This replaces a clip to the head's width, which was put
  // in for the fish he holds up level with his ear in one celebrate frame — pale, above the crown,
  // joined to his cap through his raised sleeve — and which then took the back of the cap off him
  // in the cast wind-up, where the head is turned away and the crown runs well past the small
  // visible face. No width tells those apart: measured, the back of that cap sits 0.8 face-widths
  // out and the fish 0.5 to 0.75. What does tell them apart is how each is joined to the head.
  // The cap was already cut to rows above the chin, and the fish's only connection — the sleeve —
  // is below the chin and gone with that cut, so the fish is now a loose piece; the back of the
  // cap is still joined to the crown. Keep the pieces that touch the head.
  {
    const pieces = components(w, h, (i) => capSet.has(i));
    capSet.clear();
    pieces.forEach((g) => { if (touches(g, headSet, w, h)) g.forEach((i) => capSet.add(i)); });
  }
  // ...and a cap is a cream crown with a small green panel on it, never the other way round. The
  // fish he holds up in one celebrate frame is joined to his head at working size and no geometry
  // told it from the back of his own cap in the cast wind-up — measured, they sit three and seven
  // working pixels past the visible head, and a cap seen from behind is offset from its hair
  // rather than wider than it. What does tell them apart is what they are made of: in every frame
  // the panel is three to five working pixels on a crown of fifteen, and the fish is a body of
  // green larger than the crown itself. Green is cap only as a piece smaller than half the cream.
  {
    let cream = 0; capSet.forEach((i) => { if (hue[i] === HUE.cream) cream += 1; });
    components(w, h, (i) => capSet.has(i) && hue[i] === HUE.green)
      .forEach((g) => { if (g.length * 2 > cream) g.forEach((i) => capSet.delete(i)); });
    // Whatever the fish's pale belly left behind is now a loose piece too.
    const pieces = components(w, h, (i) => capSet.has(i));
    capSet.clear();
    pieces.forEach((g) => { if (touches(g, headSet, w, h)) g.forEach((i) => capSet.add(i)); });
  }
  // ...and nothing on it is held in a hand or worn on an arm. What the earlier rules kept
  // chasing as "the fish" was mostly his raised shirt sleeve: cream, above the chin, joined to the
  // crown — twice the cap's own size in that frame, and no width, no connectivity and no colour
  // told it from the back of the cap in the cast wind-up. What a sleeve and a held fish share,
  // and a cap never has, is that they touch skin that is not his face: an arm, a fist. A cap
  // touches face and hair only. So a cap piece against other skin, sitting outside the head's
  // span, is something he is holding or wearing on his arm. The span guard is for the celebrate
  // frames where a raised fist brushes the brim — that piece is over the head and stays.
  {
    const otherSkin = new Set(components(w, h, (i) => on[i] && hue[i] === HUE.skin && !faceSet.has(i))
      .filter((g) => stout(g, w, 1)).flat());
    let hx0 = w; let hx1 = -1;
    headSet.forEach((i) => { const x = i % w; if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; });
    const pieces = components(w, h, (i) => capSet.has(i));
    pieces.forEach((g) => {
      if (!touches(g, otherSkin, w, h)) return;
      const mid = g.reduce((a, i) => a + (i % w), 0) / g.length;
      if (mid >= hx0 - 1 && mid <= hx1 + 1) return;
      g.forEach((i) => capSet.delete(i));
    });
  }
  if (process.env.PROBE) {
    const box = (set) => { let a = Infinity; let b = -1; let c = Infinity; let d = -1; set.forEach((i) => { const x = i % w; const y = (i / w) | 0; if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }); return `x${a}-${b} y${c}-${d}`; };
    console.log(`    probe: face ${box(faceSet)} (${faceSet.size}px)  hair ${box(hairSet)} (${hairSet.size}px)  cap ${box(capSet)} (${capSet.size}px)  working ${w}x${h}`);
    if (process.env.PROBE === 'map') {
      const ch = { [HUE.key]: 'k', [HUE.skin]: 's', [HUE.cream]: 'c', [HUE.blue]: 'b', [HUE.green]: 'g', [HUE.brown]: 'n', [HUE.other]: 'o' };
      for (let y = 0; y < h; y += 1) {
        let row = '';
        for (let x = 0; x < w; x += 1) { const i = y * w + x; row += !on[i] ? '.' : capSet.has(i) ? ch[hue[i]].toUpperCase() : faceSet.has(i) ? '@' : hairSet.has(i) ? '#' : ch[hue[i]]; }
        console.log(`      ${String(y).padStart(2)} ${row}`);
      }
    }
  }

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
  // ...and never above his chin. The cap is clipped to the head's width, and the navy brim runs a
  // pixel or two past that at the back — those pixels stop being cap, fall through here as blue,
  // and set a trouser hem at forehead height, so that everything under them in those columns came
  // out as boot: a yellow patch on his temple. A trouser leg does not start above the chin.
  const blueBlobs = components(w, h, (i) => on[i] && hue[i] === HUE.blue && !capSet.has(i) && ((i / w) | 0) > faceBottom);
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
  // Where the rod passes behind his beard it is still the rod. Bounding the beard to the head was
  // what let this frame have a rod at all, but it bounds the rod too: the stretch of it inside the
  // head box is brown against his face and comes out as hair, so a dyed rod has a beard-coloured
  // break in it in the cast wind-up. No test on colour or on the piece can split them there. What
  // can is that a rod is straight: the rod that was found outside the head says exactly where the
  // rest of it runs, and brown lying on that line, inside the head box, is rod. Guarded three
  // ways — there has to be enough rod to fit, the fit has to be tight (the reel-in rows bend the
  // rod, and a bent rod's line points nowhere), and the line has to actually cross the head.
  const claimAlongRod = () => {
    if (rodSet.size < ROD_RUN) return;
    const pts = [...rodSet].map((i) => [i % w, (i / w) | 0]);
    const n = pts.length; const cx = pts.reduce((a, p) => a + p[0], 0) / n; const cy = pts.reduce((a, p) => a + p[1], 0) / n;
    let sxx = 0; let syy = 0; let sxy = 0;
    pts.forEach(([x, y]) => { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); });
    const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); const dx = Math.cos(theta); const dy = Math.sin(theta);
    const along = (x, y) => (x - cx) * dx + (y - cy) * dy; const off = (x, y) => Math.abs(-(x - cx) * dy + (y - cy) * dx);
    const residual = pts.reduce((a, [x, y]) => a + off(x, y), 0) / n;
    if (residual > 1.0) return;
    const lo = Math.min(...pts.map(([x, y]) => along(x, y))); const hi = Math.max(...pts.map(([x, y]) => along(x, y)));
    const crosses = [...faceSet].some((i) => off(i % w, (i / w) | 0) <= 2.5);
    if (!crosses) return;
    [...hairSet].forEach((i) => {
      const x = i % w; const y = (i / w) | 0;
      if (off(x, y) > 1.5) return;
      const t = along(x, y);
      if (t < lo - headReach || t > hi + headReach) return;
      hairSet.delete(i); rodSet.add(i);
    });
  };

  brownBlobs.forEach((group) => {
    // What is left of this piece once his beard and his boots are taken out of it — tested on the
    // remainder rather than the whole, since in that one pose the rod and the beard are one piece.
    const rest = group.filter((i) => !hairSet.has(i) && !belowHem(i));
    if (!rest.length || stout(rest, w, 1) || !reaches(rest, w, ROD_RUN)) return;
    rest.forEach((i) => rodSet.add(i));
  });
  claimAlongRod();

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
  // Skin is a face or a hand — a patch — and never a line. The stray rule in `garment` is by size
  // alone, and in the cast wind-up the rod's lit core, which is tan, runs long enough to pass it: a
  // line eight working pixels long is a quarter of the face. It came back as a garment of skin, and
  // upsampled into a tan stripe down the middle of every dyed rod in that frame. A patch has a core
  // to it and a line does not, so the skin pieces are also asked to survive a pixel of erosion.
  const skinSet = new Set([...garment((i) => free(i) && hue[i] === HUE.skin)].length
    ? components(w, h, (i) => free(i) && hue[i] === HUE.skin).filter((g) => stout(g, w, 1)).flat() : []);

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
    // A boot is leather: brown, the tan of its lighter side, or its own keyline. The reel is
    // blue-grey and hangs at hem height when the rod points down, and it is not a boot because it
    // is under the hem any more than a fish would be.
    if (belowHem(i) && (hue[i] === HUE.brown || hue[i] === HUE.skin || hue[i] === HUE.key)) { part[i] = PART.boots; continue; }
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
// A label island of this many pixels or fewer, at full size, is a stray and is absorbed.
const ISLAND = 8;
// On his head, a pixel of skin colour is skin from this much red up, and beard below it — and
// only when it is at least this much redder than it is blue: the crown of his cap is a warm
// cream, (252,229,193), which the broad skin test takes, and his skin proper is never under 98.
const SKIN_RED = 170;
const SKIN_WARMTH = 70;
// ...and redder than it is green by this much: the khaki tops of his vest pockets, (215,200,110),
// pass both tests above, and under a deep tone they came out as two dark patches on the vest.
// Skin is orange, not yellow — the palest highlight on his face is (253,211,155), a step of 42.
const SKIN_RED_OVER_GREEN = 35;

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
  const trace = (() => {
    if (!process.env.TRACE) return () => {};
    const [a, f, tx, ty] = process.env.TRACE.split(',');
    if (globalThis.__action !== a || xOffset !== Number(f) * fw) return () => {};
    const i = Number(ty) * fw + Number(tx);
    return (stage, arr) => console.log(`    trace ${a}[${f}] (${tx},${ty}) after ${stage}: label ${arr[i]} hue ${hue[i]}`);
  })();
  trace('upsample+vote', part);
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
  // Two things sit on the rod that are not rod, and the snap above cannot reach them because they
  // are not at an edge: his hand closed round the grip, and the reel. At working size the fist and
  // the rod through it average to one brown piece with no core, which is what a rod is, so the
  // whole fist came back labelled rod and a gold rod gilded his fingers. Hue alone will not split
  // them — the rod's own lit edge reads as tan too — but shape will: a hand is a patch and a
  // highlight is a streak. So a patch of skin under the rod label, one with a core to it, is a
  // hand and becomes skin; a patch of blue is the reel and is left as drawn, since there is no
  // reel on any rack; and a streak of either stays rod.
  const under = (want) => components(fw, h, (i) => on[i] && snapped[i] === PART.rod && hue[i] === want);
  // A hand is stout *and* compact. Stout alone also passes the rod's own lit core — a tan streak a
  // few pixels wide and a hundred long survives two pixels of erosion exactly as a fist does — and
  // that came back labelled skin, a tan stripe down the middle of every dyed rod. A fist's box is
  // roughly square; a streak's is many times longer than it is wide.
  // Shape, measured so that turning a thing does not change the answer. A bounding box lies about
  // anything diagonal: a streak at forty-five degrees has a box as square as a fist's, which is
  // exactly how the rod's lit core passed as a hand. Length is the longest extent, mean width is
  // area over that length, and the ratio of the two is what a streak and a patch actually differ
  // in — a fist is about as long as it is wide, a highlight is many times longer.
  const proportion = (g) => {
    let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1;
    g.forEach((i) => { const x = i % fw; const y = (i / fw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    const length = Math.hypot(x1 - x0 + 1, y1 - y0 + 1);
    return length / Math.max(1, g.length / length);
  };
  const patch = (g) => proportion(g) < 3;
  // The outline label is only ever right for the drawing's own near-black. At working size a
  // block reads as outline when its *mean* is dark, and the shadow side of his beard is dark
  // enough for that — so a band of beard two working pixels wide came out labelled outline, was
  // never dyed, and a blond beard had a dark brown patch on its cheek with a hard edge where the
  // block boundary fell. The snap above only reaches an edge; this is the inside of a block. So a
  // pixel labelled outline that is not near-black takes the nearest label its colour fits,
  // looking as far as two working pixels, which is as wide as such a band gets. It is safe in
  // the other direction too: the near-black pixels a part is labelled with are held as drawn by
  // the painter itself, whatever their label.
  //
  // It runs twice: once here, and again once the head has been settled by colour below, because
  // that pass is what turns the forehead under a bowed brim from cap into skin, and only then is
  // there any skin for the pixels of forehead inside the brim's own line-block to take.
  // Within `reach` of a pixel, is there one that passes `test`? And the two tests the passes
  // below share: lying against the drawing's line, and being skin outright.
  const nearBy = (i, test, reach) => {
    const x = i % fw; const y = (i / fw) | 0;
    for (let oy = -reach; oy <= reach; oy += 1) for (let ox = -reach; ox <= reach; ox += 1) {
      const nx = x + ox; const ny = y + oy;
      if ((ox || oy) && nx >= 0 && ny >= 0 && nx < fw && ny < h && on[ny * fw + nx] && test(ny * fw + nx)) return true;
    }
    return false;
  };
  const nearKey = (i) => nearBy(i, (n) => hue[n] === HUE.key, 1);
  const isSkin = (i) => {
    const src = (((i / fw) | 0) * stripW + xOffset + (i % fw)) * 4;
    return hue[i] === HUE.skin && data[src] >= SKIN_RED && data[src] - data[src + 2] >= SKIN_WARMTH && data[src] - data[src + 1] >= SKIN_RED_OVER_GREEN;
  };
  const moved = { hand: 0, reel: 0, beard: 0, head: 0, torso: 0, island: 0 };
  const relight = () => {
    const labels = new Uint8Array(snapped);
    for (let i = 0; i < fw * h; i += 1) {
      if (!on[i] || labels[i] !== PART.outline || hue[i] === HUE.key) continue;
      const x = i % fw; const y = (i / fw) | 0;
      let found = 0;
      for (let r = 1; r <= scale * 2 && !found; r += 1) {
        for (let oy = -r; oy <= r && !found; oy += 1) for (let ox = -r; ox <= r && !found; ox += 1) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
          const q = labels[ny * fw + nx];
          if (q !== PART.outline && fits(q, hue[i])) found = q;
        }
      }
      if (found) { snapped[i] = found; moved.beard += 1; }
    }
  };
  relight();
  trace('snap+relit', snapped);
  under(HUE.skin).forEach((g) => { if (stout(g, fw, 2) && patch(g)) g.forEach((i) => { snapped[i] = PART.skin; moved.hand += 1; }); });
  // And the mirror of it. The rod's lit core is tan, and in the cast wind-up — the rod foreshortened
  // and lit along its length — it is long and bright enough to arrive here labelled skin, a tan
  // stripe down the middle of a dyed rod. A hand is a patch; this is a streak, many times longer
  // than it is wide, and it lies against rod on both sides. A streak of skin bordered by rod is
  // the rod's own highlight, whatever put the label there.
  // The reel is not stout — its blue is a thin ring round a dark hub, and wearing two pixels off
  // a ring leaves nothing — but it is compact where a rod guide is a streak: its box is nearly
  // square and several pixels on its short side, and no streak's is.
  const compact = (g) => {
    let x0 = Infinity; let x1 = -1; let y0 = Infinity; let y1 = -1;
    g.forEach((i) => { const x = i % fw; const y = (i / fw) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; });
    return Math.min(x1 - x0, y1 - y0) + 1 >= 6;
  };
  const reelBody = [];
  under(HUE.blue).forEach((g) => { if (compact(g)) g.forEach((i) => { snapped[i] = 0; moved.reel += 1; reelBody.push(i); }); });
  // The reel's rim is drawn dark, blue-grey blurring into black, and it is not a piece of blue
  // that has a core to it — it is a ring, and the ring's pieces are thin — so it stayed rod, and
  // a gold rod put a gold ring round a grey reel. The rim is whatever dark or blue lies within
  // a few pixels of the body just found; the rod itself, where it meets the reel, is brown.
  {
    const body = new Set(reelBody);
    for (let i = 0; i < fw * h; i += 1) {
      if (!on[i] || snapped[i] !== PART.rod || hue[i] === HUE.brown || hue[i] === HUE.skin) continue;
      if (nearBy(i, (n) => body.has(n), 5)) { snapped[i] = 0; moved.reel += 1; }
    }
  }
  // A label island a few pixels across — a pixel of vest in the corner of his eye, a fleck of
  // cap in the beard — is a stray, whichever rule left it: nothing real on him is that small and
  // sits in a part it is not. It takes the label most of its neighbours carry. This runs before
  // the head is settled by colour below, because that pass is right at the width of a pixel —
  // the rim of his ear is a line of skin two pixels wide against the hair — and absorbed
  // afterwards it came back out as hair, and the rim of a deep-skinned ear stayed pale. It runs
  // again after, for what that pass leaves: a pixel of orange on the edge of the cap is a
  // fleck of skin colour, and skin, and under a black cap it is a lit pixel on the brim.
  const absorbIslands = () => {
    const seen = new Uint8Array(fw * h);
    for (let i = 0; i < fw * h; i += 1) {
      if (seen[i] || !on[i] || !snapped[i]) continue;
      const label = snapped[i]; const stack = [i]; const piece = []; seen[i] = 1;
      while (stack.length && piece.length <= ISLAND) {
        const c = stack.pop(); piece.push(c);
        const x = c % fw; const y = (c / fw) | 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
          const n = ny * fw + nx;
          if (seen[n] || !on[n] || snapped[n] !== label) continue;
          seen[n] = 1; stack.push(n);
        }
      }
      if (piece.length > ISLAND || stack.length) continue;
      const votes = new Map();
      piece.forEach((c) => {
        const x = c % fw; const y = (c / fw) | 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
          const q = snapped[ny * fw + nx];
          // Never into the outline: a pixel there is never dyed, so a highlight on his ear that
          // the line's block swallowed stayed pale under every skin tone.
          if (on[ny * fw + nx] && q !== label && q !== PART.outline) votes.set(q, (votes.get(q) || 0) + 1);
        }
      });
      if (!votes.size) continue;
      const to = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      piece.forEach((c) => { snapped[c] = to; });
      moved.island += piece.length;
    }
  };
  absorbIslands();
  trace('islands 1', snapped);
  // On his head, colour settles every pixel. The three things there — skin, beard and cap — are
  // three colours, and at full size they interleave finer than a working pixel: the moustache is
  // drawn across the mouth, the mouth is skin inside the beard, the ear is skin against hair,
  // and the beard's shadow side runs down his cheek. Carried across from working size, a block
  // of beard came out skin and a block of cheek came out hair, and a blond dye put a blond patch
  // on his cheek while a deep tone left an orange one; the snap above only reaches an edge, and
  // these are whole blocks. So within the head every pixel of those three parts takes the part
  // its own colour is. Skin and beard part at red 170: over every frame the head's red channel
  // is two humps, the beard's at 64-120 and the skin's at 216-255, with a valley between them,
  // and the beard's lit mid-tone (165,113,80) sits under the line while the cheek's deepest
  // shadow (178,129,93) sits over it. The cap's cream, navy and green are none of those and are
  // cap where they lie near it; cream well away from any cap is his teeth, which belong to no
  // part and are left as drawn — a skin tone should not darken them.
  //
  // The head is the box round his hair and cap, which unlike the skin never reach a hand. His
  // hands come up to it in the celebrate frames, and a hand is skin whichever way it is read.
  {
    let hx0 = fw; let hx1 = -1; let hy0 = h; let hy1 = -1;
    for (let i = 0; i < fw * h; i += 1) {
      if (!on[i] || (snapped[i] !== PART.hair && snapped[i] !== PART.cap)) continue;
      const x = i % fw; const y = (i / fw) | 0;
      if (x < hx0) hx0 = x; if (x > hx1) hx1 = x; if (y < hy0) hy0 = y; if (y > hy1) hy1 = y;
    }
    const before = new Uint8Array(snapped);
    const teeth = []; const blends = [];
    const near = nearBy;
    const nearCap = (i) => {
      const x = i % fw; const y = (i / fw) | 0;
      for (let oy = -2 * scale; oy <= 2 * scale; oy += 1) for (let ox = -2 * scale; ox <= 2 * scale; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
        if (before[ny * fw + nx] === PART.cap) return true;
      }
      return false;
    };
    for (let y = Math.max(0, hy0 - scale); y <= Math.min(h - 1, hy1 + scale); y += 1) {
      for (let x = Math.max(0, hx0 - scale); x <= Math.min(fw - 1, hx1 + scale); x += 1) {
        const i = y * fw + x;
        if (!on[i]) continue;
        const was = before[i];
        if (was !== PART.skin && was !== PART.hair && was !== PART.cap) continue;
        const q = hue[i];
        let to = was;
        if (q === HUE.key) continue;
        // A pixel against a line, unless it is plainly skin, is the softening between the line
        // and whatever lies past it, and its colour says nothing: the row under the brim is teal
        // blurred into orange and reads as brown, the column beside each eye is black blurred
        // into orange and reads as green. Those are settled last, from what they lie against.
        if (nearKey(i) && !isSkin(i)) { blends.push(i); continue; }
        if (isSkin(i)) to = PART.skin;
        // Warm and light but not red enough to be skin outright is the crown of the cap, (252,229,193),
        // and it is also the brightest highlight on his ear, (254,237,191); colour cannot tell
        // them apart, so such a pixel keeps what it was carried across as.
        else if (q === HUE.skin && data[(y * stripW + xOffset + x) * 4] >= SKIN_RED) to = was;
        else if (q === HUE.brown || q === HUE.skin) to = PART.hair;
        // Cream has to lie *against* the cap to be cap: his teeth are cream too, and with the
        // head bowed over a loaded rod the brim comes within a working pixel of his mouth, so
        // measured by distance they were cap, and a black cap blacked out his grin.
        else if (q === HUE.cream) to = near(i, (n) => before[n] === PART.cap, 2) ? PART.cap : -1;
        else to = nearCap(i) ? PART.cap : was;
        if (to === -1) { teeth.push(i); continue; }
        if (to !== was) { snapped[i] = to; moved.head += 1; }
      }
    }
    // Cream on his head away from the cap is his teeth — a patch of it — and they are left as
    // drawn, in no part. A streak of cream is a highlight on whatever it lies on, and keeps that.
    const teethSet = new Set(teeth);
    components(fw, h, (i) => teethSet.has(i)).forEach((g) => {
      if (!stout(g, fw, 1)) return;
      g.forEach((i) => { snapped[i] = 0; moved.head += 1; });
    });
    // The softening along every line takes the part most of what it lies against, two pixels
    // out, has settled as — the line itself and the rest of the softening not counting.
    {
      const soft = new Set(blends);
      const settled = blends.map((i) => {
        const x = i % fw; const y = (i / fw) | 0; const votes = new Map();
        for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
          const n = ny * fw + nx;
          if (!on[n] || soft.has(n) || hue[n] === HUE.key || !snapped[n]) continue;
          votes.set(snapped[n], (votes.get(snapped[n]) || 0) + 1);
        }
        return votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : before[i];
      });
      blends.forEach((i, k) => { if (settled[k] !== snapped[i]) { snapped[i] = settled[k]; moved.head += 1; } });
    }
    // What that leaves as a fleck of cap on his face — a few pixels of the brim's shadow colour
    // by an eye — is not cap. Skin and beard flecks are left: at this size they are right.
    components(fw, h, (i) => on[i] && snapped[i] === PART.cap && before[i] !== PART.cap).forEach((g) => {
      if (g.length > ISLAND) return;
      const votes = new Map();
      g.forEach((c) => {
        const x = c % fw; const y = (c / fw) | 0;
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= fw || ny >= h || !on[ny * fw + nx]) continue;
          const q = snapped[ny * fw + nx];
          if (q !== PART.cap) votes.set(q, (votes.get(q) || 0) + 1);
        }
      });
      if (!votes.size) return;
      const to = [...votes].sort((a, b) => b[1] - a[1])[0][0];
      g.forEach((c) => { snapped[c] = to; moved.island += 1; });
    });
  }
  trace('head', snapped);
  // And on his torso the same, between the shirt and the vest: cream is shirt and green is vest,
  // and a hand across the front is skin. Carried across from working size, the sleeve of the arm
  // he braces across himself in the reel frames came out vest — its blocks average the cream
  // sleeve with the vest behind it — and a white vest with a black shirt put a white sleeve on
  // a black arm. The softening along every line is settled last from what it lies against, as
  // on the head.
  {
    const before = new Uint8Array(snapped);
    const blends = [];
    for (let i = 0; i < fw * h; i += 1) {
      if (!on[i]) continue;
      const was = before[i];
      if (was !== PART.shirt && was !== PART.vest) continue;
      const q = hue[i];
      if (q === HUE.key) continue;
      if (nearKey(i) && !isSkin(i)) { blends.push(i); continue; }
      let to = was;
      if (isSkin(i)) to = PART.skin;
      else if (q === HUE.cream) to = PART.shirt;
      else if (q === HUE.green) to = PART.vest;
      if (to !== was) { snapped[i] = to; moved.torso += 1; }
    }
    const soft = new Set(blends);
    const settled = blends.map((i) => {
      const x = i % fw; const y = (i / fw) | 0; const votes = new Map();
      for (let oy = -2; oy <= 2; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= fw || ny >= h) continue;
        const n = ny * fw + nx;
        if (!on[n] || soft.has(n) || hue[n] === HUE.key || !snapped[n] || snapped[n] === PART.outline) continue;
        votes.set(snapped[n], (votes.get(snapped[n]) || 0) + 1);
      }
      return votes.size ? [...votes].sort((a, b) => b[1] - a[1])[0][0] : before[i];
    });
    blends.forEach((i, k) => { if (settled[k] !== snapped[i]) { snapped[i] = settled[k]; moved.torso += 1; } });
  }
  trace('torso', snapped);
  relight();
  absorbIslands();
  trace('islands 2', snapped);
  snapped.moved = moved;
  return snapped;
}

// Every pixel of each part, gathered across all twenty frames, so the dye bases and the skin
// ramp below are measured off the art rather than guessed at.
const pool = {};

ACTIONS.forEach((action, ri) => {
  globalThis.__action = action;
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
    if (part.moved) console.log(`  ${action}[${f}] full-size rules moved: hand ${part.moved.hand}, reel ${part.moved.reel}, beard ${part.moved.beard}, head ${part.moved.head}, torso ${part.moved.torso}, island ${part.moved.island}`);
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
//
// Measured without the drawing's own lines: his eyes, nostrils and the lines of his mouth are in
// the skin part too, and they are near-black, so with them in the darkest band of his skin came
// out at a brightness of 47 — the eyes, not a shadow. The painter holds those pixels as drawn
// (KEYLINE_FADE in utils/anglerPaint.js is this same 36), so the ramp describes the skin it will
// actually move.
const KEYLINE_FADE = 36;
const skin = [...(pool[PART.skin] || [])].filter((c) => lum(c) >= KEYLINE_FADE).sort((a, b) => lum(a) - lum(b));
const body = [0, 1, 2, 3].map((q) => mean(skin.slice(Math.floor(skin.length * q / 4), Math.max(Math.floor(skin.length * (q + 1) / 4), Math.floor(skin.length * q / 4) + 1))));

const named = Object.fromEntries(Object.entries(PART).map(([k, v]) => [v, k]));
const out = { base: Object.fromEntries(Object.entries(base).map(([p, c]) => [named[p], c])), body };
writeFileSync(`${DIR}paint.json`, `${JSON.stringify(out, null, 2)}\n`);
console.log('masks/preview.png and paint.json written');
console.log(JSON.stringify(out));
