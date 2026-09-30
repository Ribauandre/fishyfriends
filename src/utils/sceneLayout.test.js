import path from 'node:path';
import {
  SCENE_LAYOUTS, layoutFor, viewWidthFor, frameFor, stageX, stageY, stageLen, waterSpan, landingX, reelX, cameraFor, cameraForLayout, castWindow,
  REST_CAMERA, PAINT_H, PAINT_W, ART_PX, snapArt, placements, fightBand, fightBox, FIGHT_HALF, CAMERA_ANGLER_MARGIN,
} from './sceneLayout';
import { BIOMES } from './gameBiomes';
import { readPng } from '../test-utils/pixelArt';
import strips from '../assets/angler/strips.json';
import pets from '../assets/pets/pets.json';
import { DECOR_PROPS } from './dockDecor';
import { PIXEL_FISH_BOX } from '../components/FishIllustration';

const SCENES = Object.keys(SCENE_LAYOUTS);

test('every ground has a layout whose water is right of (or above) where the angler stands', () => {
  Object.keys(BIOMES).forEach((biome) => {
    const layout = layoutFor(biome);
    expect(layout).toBe(SCENE_LAYOUTS[biome]);
    expect(layout.water.x0).toBeGreaterThan(layout.angler.x);
    expect(layout.cast.min).toBeGreaterThanOrEqual(layout.water.x0);
    expect(layout.cast.max).toBeLessThanOrEqual(layout.water.x1);
    expect(layout.fishY).toBeGreaterThanOrEqual(layout.water.y0);
    expect(layout.fishY).toBeLessThanOrEqual(layout.water.y1);
    layout.crew.forEach((slot) => expect(layout.angler.x + (typeof slot === 'object' ? slot.x : slot)).toBeGreaterThan(40));
  });
  // The shore paintings share the dock: the deck runs to x 240, so nothing fishable sits under it.
  ['river', 'mountainlake', 'swamp', 'bay', 'shoreline'].forEach((biome) => expect(layoutFor(biome).water.x0).toBeGreaterThanOrEqual(240));
  // The beach: the fight stays in the water above the sand line (x 455 on y 165, x 246 on y 228).
  const shore = layoutFor('shoreline');
  const sandAt = (y) => 455 - ((y - 165) / (228 - 165)) * (455 - 246);
  expect(shore.water.x1).toBeLessThanOrEqual(sandAt(shore.fishY));
  expect(layoutFor('nowhere')).toBe(SCENE_LAYOUTS.river);
});

test('everybody stands on the art grid: feet, slots, pets and decorations snap to whole art pixels', () => {
  SCENES.forEach((key) => {
    const p = placements(SCENE_LAYOUTS[key]);
    const onGrid = (v) => expect(Math.abs(v / ART_PX - Math.round(v / ART_PX))).toBeLessThan(0.01);
    [p.you, p.pet, p.decor, ...p.crew, ...p.crew.map((c) => c.pet)].filter(Boolean).forEach((at) => { onGrid(at.x); onGrid(at.y); });
  });
  expect(snapArt(178)).toBeCloseTo(178.67, 2);
  expect(snapArt(4)).toBe(4);
});

// What a figure takes of the floor, in art pixels from its feet, measured off the art itself: an
// angler's legs (the bottom rows a pet stands beside, from every idle frame) and his whole idle
// box; a pet is the union of the dog's and the cat's idle frames (a slot takes either); a
// decoration its whole drawing, the widest and tallest of them.
function extents(file, frames, w, rows) {
  const img = readPng(file);
  let x0 = Infinity, x1 = -Infinity;
  for (let f = 0; f < frames; f += 1) {
    for (let y = img.height - rows; y < img.height; y += 1) for (let x = 0; x < w; x += 1) {
      if (img.data[(y * img.width + f * w + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
    }
  }
  return [x0, x1];
}
const ASSETS = path.join(__dirname, '..', 'assets');
const IDLE = strips.idle;
const PET_ROWS = Math.max(pets.dog.h, pets.cat.h);
const LEGS = extents(path.join(ASSETS, 'angler', 'idle.png'), IDLE.frames, IDLE.w, PET_ROWS).map((x) => x - IDLE.feetX);
const BODY = [Math.min(...IDLE.bounds.map((b) => b.x)), Math.max(...IDLE.bounds.map((b) => b.x + b.w))].map((x) => x - IDLE.feetX);
const petSpan = (name) => extents(path.join(ASSETS, 'pets', `${name}.png`), pets[name].frames, pets[name].w, pets[name].h).map((x) => x - pets[name].feetX);
const PET = [Math.min(petSpan('dog')[0], petSpan('cat')[0]), Math.max(petSpan('dog')[1], petSpan('cat')[1])];
const DECOR_W = Math.max(...Object.values(DECOR_PROPS).map((d) => d.w));
const DECOR_H = Math.max(...Object.values(DECOR_PROPS).map((d) => d.rows));

function figures(layout) {
  const p = placements(layout);
  const A = ART_PX;
  const man = (at, name) => ({ name, y: at.y, x0: at.x + LEGS[0] * A, x1: at.x + LEGS[1] * A, vx0: at.x + BODY[0] * A, vx1: at.x + BODY[1] * A, top: at.y - IDLE.h * A, floorTop: at.y - PET_ROWS * A });
  const pet = (at, name) => ({ name, y: at.y, x0: at.x + PET[0] * A, x1: at.x + PET[1] * A, vx0: at.x + PET[0] * A, vx1: at.x + PET[1] * A, top: at.y - PET_ROWS * A, floorTop: at.y - PET_ROWS * A });
  const list = [man(p.you, 'you')];
  if (p.pet) list.push(pet(p.pet, 'your pet'));
  p.crew.forEach((c, i) => { list.push({ ...man(c, `crew ${i}`), back: c.back }); if (c.pet) list.push(pet(c.pet, `crew ${i}'s pet`)); });
  if (p.decor) {
    const half = (DECOR_W * A) / 2;
    list.push({ name: 'decoration', y: p.decor.y, x0: p.decor.x - half, x1: p.decor.x + half, vx0: p.decor.x - half, vx1: p.decor.x + half, top: p.decor.y - DECOR_H * A, floorTop: p.decor.y - DECOR_H * A });
  }
  return list;
}

// Two things on one row (feet within a few units of each other) may not share floor; on
// different rows, the nearer one may not stand over the further one's feet.
function clashes(list) {
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i]; const b = list[j];
      if (Math.abs(a.y - b.y) < 6) {
        if (a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01) out.push(`${a.name} and ${b.name} share floor`);
      } else {
        const [back, front] = a.y < b.y ? [a, b] : [b, a];
        const covers = front.vx0 < back.x1 - 0.01 && back.x0 < front.vx1 - 0.01 && front.top < back.y - 0.01 && back.floorTop < front.y - 0.01;
        // A guest on a back-row slot is meant to stand partly behind the figures in front, the way
        // a crowded dock looks; only their head has to stay clear above whoever covers them.
        if (covers && back.back) { if (back.top > front.top - 8) out.push(`${front.name} hides ${back.name}'s head`); } else if (covers) out.push(`${front.name} stands over ${back.name}'s feet`);
      }
    }
  }
  return out;
}

test('nobody on the deck sits inside anybody else: the angler, the crew, every pet and the decoration each have their own floor', () => {
  // Sanity: the measured footprints are the art's (his legs about 35 art pixels, a pet about 29).
  expect(LEGS[1] - LEGS[0]).toBeGreaterThan(30);
  expect(PET[1] - PET[0]).toBeGreaterThan(24);
  SCENES.forEach((key) => {
    expect({ key, clashes: clashes(figures(SCENE_LAYOUTS[key])) }).toEqual({ key, clashes: [] });
  });
  // The deck is crowded, not emptied: two guests on the dock (one a row back) and one on the charter.
  expect(placements(SCENE_LAYOUTS.river).crew).toHaveLength(2);
  expect(placements(SCENE_LAYOUTS.offshore).crew).toHaveLength(1);
  // …and the check is not vacuous: the old slots (two crew on the dock, pets at every heel) clash,
  // and so does a back-row guest pushed so close behind that his head is hidden.
  expect(clashes(figures({ ...SCENE_LAYOUTS.river, crew: [-86.67, { x: -44, y: -6.67 }] }))).toContain('you hides crew 1\'s head');
  const crowded = { ...SCENE_LAYOUTS.river, crew: [-58, -112], pets: { you: -36, crew: [-36, -36] } };
  expect(clashes(figures(crowded)).length).toBeGreaterThan(0);
});

test('everybody stands inside the painting, with the lamp on the painting too', () => {
  SCENES.forEach((key) => {
    const layout = SCENE_LAYOUTS[key];
    figures(layout).forEach((f) => {
      expect(f.x0).toBeGreaterThanOrEqual(0);
      expect(f.x1).toBeLessThanOrEqual(PAINT_W);
      expect(f.y).toBeLessThanOrEqual(PAINT_H);
    });
    if (layout.lamp) {
      expect(layout.lamp.x).toBeGreaterThan(0);
      expect(layout.lamp.y).toBeGreaterThan(0);
      expect(layout.lamp.pool.y).toBeGreaterThan(layout.lamp.y);
    }
  });
});

test('the stage measures its width in painting rows: 16:9 is 480, a phone is narrower, a desktop wider', () => {
  expect(viewWidthFor(1600, 900)).toBe(480);
  expect(viewWidthFor(390, 312)).toBe(338);
  expect(viewWidthFor(1380, 435)).toBe(857);
  expect(viewWidthFor(0, 0)).toBe(480);
  expect(viewWidthFor(100, 900)).toBe(300);
});

test('a narrow stage keeps painting units and crops the right; a wide one scales up and crops top and bottom', () => {
  const phone = frameFor(338, 'center');
  expect(phone.k).toBe(1);
  expect(phone.cropTop).toBe(0);
  expect(phone.visibleRight).toBe(338);
  expect(stageX(178, phone)).toBe(178);
  expect(stageY(136, phone)).toBe(136);

  const wide = frameFor(720, 'center');
  expect(wide.k).toBe(1.5);
  expect(wide.cropTop).toBe(45);
  expect(stageX(178, wide)).toBe(267);
  expect(stageY(135, wide)).toBe(135);
  expect(stageLen(86, wide)).toBe(129);
  // The Canyon keeps its bottom (the deck) instead of its middle.
  const canyon = frameFor(720, 'bottom');
  expect(canyon.cropTop).toBe(90);
  expect(stageY(258, canyon)).toBe(252);
});

test('casts land in the water that is actually on screen, weakest to strongest', () => {
  const layout = layoutFor('river');
  const full = frameFor(480);
  expect(landingX(layout, 0, full)).toBe(layout.cast.min);
  expect(landingX(layout, 100, full)).toBe(layout.cast.max);
  // A phone crops the painting hard on the deck, but the cast camera pans across the rest of
  // it, so what can be fished is that window rather than the crop.
  const phone = frameFor(338);
  const reach = castWindow(layout, phone)[1];
  expect(reach).toBeGreaterThan(338);
  expect(landingX(layout, 100, phone)).toBe(Math.min(layout.cast.max, reach - 24));
  expect(landingX(layout, 50, phone)).toBeGreaterThan(layout.cast.min);
  const wide = frameFor(720);
  expect(landingX(layout, 0, wide)).toBe(layout.cast.min * 1.5);
  const [a, z] = waterSpan(layout, phone);
  expect(a).toBe(layout.water.x0);
  expect(z).toBe(Math.min(layout.water.x1, reach - 10));
  expect(reelX(layout, 0, phone)).toBe(a);
  expect(reelX(layout, 100, phone)).toBe(z);
});

test('the fight is a band of the same height on every ground, in its water, round the fish\'s row', () => {
  SCENES.forEach((key) => {
    const layout = SCENE_LAYOUTS[key];
    const [top, bottom] = fightBand(layout);
    expect(top).toBeGreaterThanOrEqual(layout.water.y0);
    expect(bottom).toBeLessThanOrEqual(layout.water.y1 + 0.01);
    expect(layout.fishY).toBeGreaterThanOrEqual(top);
    expect(layout.fishY).toBeLessThanOrEqual(bottom);
    expect(bottom - top).toBeLessThanOrEqual(2 * FIGHT_HALF + 0.01);
    if (layout.water.y1 - layout.water.y0 > 2 * FIGHT_HALF) expect(bottom - top).toBeCloseTo(2 * FIGHT_HALF, 1);
  });
  // The Flats' water runs 196 units down from the mangroves; the band is the same 72 as the dock's.
  const flats = fightBand(layoutFor('flats'));
  expect(flats[1] - flats[0]).toBeCloseTo(72, 1);
});

test('the camera rests on the whole painting and pans to the water on the cast, where it stays for the fight', () => {
  const angler = { anglerX: 178, anglerY: 136, spriteH: 92 };
  expect(cameraFor('ready', angler, 480)).toBe(REST_CAMERA);
  expect(cameraFor('result', angler, 480)).toBe(REST_CAMERA);
  const cast = cameraFor('casting', angler, 480);
  // The angler sits just inside the left edge (room at his back for the meters) and the
  // painting's right edge is the frame's.
  expect(cast.x).toBe(178 - CAMERA_ANGLER_MARGIN);
  // The zoom is rounded, so the painting's edge lands within a unit of the frame's.
  expect(480 - (cast.x + 480 / cast.scale)).toBeLessThan(2);
  expect(cast.scale).toBeGreaterThanOrEqual(1.3);
  // His hat is just under the top, so the frame below him is water.
  expect(cast.y).toBe(136 - 92 - 6 - 8);
  expect(cast.y + PAINT_H / cast.scale).toBeLessThanOrEqual(PAINT_H);
  // The fight keeps the same frame: no second move once the line is out.
  expect(cameraFor('waiting', angler, 480)).toEqual(cast);
  expect(cameraFor('reeling', angler, 480)).toEqual(cast);
  // A phone crops the painting rather than shortening it, so the camera pans across the part of
  // it the deck view never shows — past the stage's own right edge — rather than stopping there.
  const phone = cameraFor('casting', angler, 300);
  expect(phone.x).toBe(178 - CAMERA_ANGLER_MARGIN);
  expect(phone.x + 300 / phone.scale).toBeGreaterThan(300);
  // Through a layout: the cast and the fight share one frame on every ground.
  SCENES.forEach((key) => [300, 480, 702].forEach((viewW) => {
    const frame = frameFor(viewW, SCENE_LAYOUTS[key].crop);
    expect(cameraForLayout('reeling', SCENE_LAYOUTS[key], frame)).toEqual(cameraForLayout('casting', SCENE_LAYOUTS[key], frame));
  }));
});

// The fight has to be on screen whole — at every width a stage can be, on every ground: the
// zone from its pointer to its bottom cap and the callout's line under it, the progress gauge
// above it, the fish's row with room for the biggest shadow, and the water the fish runs in
// from side to side. At 2.6:1 on the river the old camera showed a fifth of the zone.
test('the fight camera keeps the whole fight in frame on every ground and every stage width', () => {
  const widths = [];
  for (let w = 300; w <= 960; w += 6) widths.push(w);
  SCENES.forEach((key) => {
    const layout = SCENE_LAYOUTS[key];
    widths.forEach((viewW) => {
      const frame = frameFor(viewW, layout.crop);
      const camera = cameraForLayout('reeling', layout, frame);
      const top = camera.y;
      const bottom = camera.y + PAINT_H / camera.scale;
      const left = camera.x;
      const right = camera.x + viewW / camera.scale;
      const [boxTop, boxBottom] = fightBox(layout).map((y) => stageY(y, frame));
      const [a, z] = waterSpan(layout, frame);
      const where = `${key} at ${viewW}`;
      expect({ where, top: boxTop >= top - 0.01, bottom: boxBottom <= bottom + 0.01 }).toEqual({ where, top: true, bottom: true });
      expect({ where, left: a >= left - 0.01, right: z <= right + 0.01 }).toEqual({ where, left: true, right: true });
      // The camera never shows past the painting.
      expect(camera.scale).toBeGreaterThanOrEqual(1);
      expect(right).toBeLessThanOrEqual(Math.max(viewW, PAINT_W) + 0.5);
      expect(top).toBeGreaterThanOrEqual(stageY(0, frame) - 0.01);
      expect(bottom).toBeLessThanOrEqual(stageY(PAINT_H, frame) + 0.5);
      // …and the angler's feet stay in it.
      const feet = placements(layout).you;
      expect(stageY(feet.y, frame)).toBeLessThanOrEqual(bottom + 0.01);
      expect(stageX(feet.x, frame)).toBeGreaterThanOrEqual(left);
    });
  });
});

test('a landed fish keeps the fight\'s frame, eased off only as far as the catch needs room beside him', () => {
  SCENES.forEach((key) => [300, 338, 480, 702].forEach((viewW) => {
    const layout = SCENE_LAYOUTS[key];
    const frame = frameFor(viewW, layout.crop);
    const room = stageLen((31 + 8) * ART_PX + PIXEL_FISH_BOX.w * ART_PX, frame);
    const fight = cameraForLayout('reeling', layout, frame);
    const result = cameraForLayout('result', layout, frame, { room });
    expect(result.scale).toBeLessThanOrEqual(fight.scale);
    const feetX = stageX(placements(layout).you.x, frame);
    // The biggest catch fits right of him inside the frame (where the painting has that much).
    const right = result.x + viewW / result.scale;
    const paintRight = Math.max(viewW, PAINT_W);
    expect(right).toBeGreaterThanOrEqual(Math.min(paintRight, feetX + room) - 0.5);
  }));
});
