import {
  SCENE_LAYOUTS, layoutFor, viewWidthFor, frameFor, stageX, stageY, stageLen, waterSpan, landingX, reelX, cameraFor, REST_CAMERA, PAINT_H,
} from './sceneLayout';
import { BIOMES } from './gameBiomes';
import { DOCK_PROPS } from './gameProps';

test('every ground has a layout whose water is right of (or above) where the angler stands', () => {
  Object.keys(BIOMES).forEach((biome) => {
    const layout = layoutFor(biome);
    expect(layout).toBe(SCENE_LAYOUTS[biome]);
    expect(layout.water.x0).toBeGreaterThan(layout.angler.x);
    expect(layout.cast.min).toBeGreaterThanOrEqual(layout.water.x0);
    expect(layout.cast.max).toBeLessThanOrEqual(layout.water.x1);
    expect(layout.fishY).toBeGreaterThanOrEqual(layout.water.y0);
    expect(layout.fishY).toBeLessThanOrEqual(layout.water.y1);
    layout.crew.forEach((dx) => expect(layout.angler.x + dx).toBeGreaterThan(40));
  });
  // The shore paintings share the dock: the deck runs to x 240, so nothing fishable sits under it.
  ['river', 'mountainlake', 'swamp', 'bay', 'shoreline'].forEach((biome) => expect(layoutFor(biome).water.x0).toBeGreaterThanOrEqual(240));
  expect(layoutFor('nowhere')).toBe(SCENE_LAYOUTS.river);
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
  const phone = frameFor(338);
  expect(landingX(layout, 100, phone)).toBe(338 - 24);
  expect(landingX(layout, 50, phone)).toBeGreaterThan(layout.cast.min);
  const wide = frameFor(720);
  expect(landingX(layout, 0, wide)).toBe(layout.cast.min * 1.5);
  const [a, z] = waterSpan(layout, phone);
  expect(a).toBe(layout.water.x0);
  expect(z).toBe(338 - 10);
  expect(reelX(layout, 0, phone)).toBe(a);
  expect(reelX(layout, 100, phone)).toBe(z);
});

test('the camera rests on the whole painting and pans to the water on the cast, where it stays for the fight', () => {
  const angler = { anglerX: 178, anglerY: 136, spriteH: 92 };
  expect(cameraFor('ready', angler, 480)).toBe(REST_CAMERA);
  const cast = cameraFor('casting', angler, 480);
  // The angler sits just inside the left edge and the painting's right edge is the frame's.
  expect(cast.x).toBe(178 - 30);
  // The zoom is rounded, so the painting's edge lands within a unit of the frame's.
  expect(480 - (cast.x + 480 / cast.scale)).toBeLessThan(2);
  expect(cast.scale).toBeGreaterThanOrEqual(1.3);
  // His hat is just under the top, so the frame below him is water.
  expect(cast.y).toBe(136 - 92 - 6 - 8);
  expect(cast.y + PAINT_H / cast.scale).toBeLessThanOrEqual(PAINT_H);
  // The fight keeps the same frame: no second move once the line is out.
  expect(cameraFor('waiting', angler, 480)).toEqual(cast);
  expect(cameraFor('reeling', angler, 480)).toEqual(cast);
  // A wide stage needs less push to put the painting's edge at the frame's; a phone cannot
  // reach the margin at all and stops at the most zoom allowed.
  const wide = cameraFor('casting', { ...angler, anglerX: 178 }, 702);
  expect(wide.scale).toBe(1.3);
  expect(wide.x).toBe(148);
  const phone = cameraFor('casting', angler, 300);
  expect(phone.scale).toBe(1.5);
  expect(300 - (phone.x + 300 / phone.scale)).toBeLessThan(2);
});

test("every ground's dock props name real art and stay inside the narrowest crop", () => {
  // A phone fits the painting to the stage's height and crops its right side, so a prop past
  // what the narrowest stage can show would be half a buoy at the edge.
  const narrow = frameFor(viewWidthFor(390, 320)).visibleRight;
  expect(narrow).toBeLessThan(360);
  Object.keys(BIOMES).forEach((biome) => {
    layoutFor(biome).props.forEach((prop) => {
      expect(DOCK_PROPS[prop.art]).toBeDefined();
      expect(prop.x - prop.w / 2).toBeGreaterThan(0);
      expect(prop.x + prop.w / 2).toBeLessThan(narrow);
      expect(prop.y).toBeGreaterThan(0);
      expect(prop.y).toBeLessThanOrEqual(PAINT_H);
    });
  });
  // The pieces that float sit in the water, and the ones that don't sit on the dock.
  const bay = layoutFor('bay').props;
  expect(bay.find((prop) => prop.art === 'buoy').front).toBe(true);
  expect(bay.find((prop) => prop.art === 'gull').front).toBeUndefined();
});
