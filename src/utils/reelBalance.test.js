// The fight, played out: a modelled thumb against the real physics and the real rarity and
// tackle numbers, so the balance the game was tuned to (see the note in reelPhysics.js) is
// checked, not remembered. The player sees the fish a few ticks late and fumbles now and
// then; the randomness is a seeded generator, so the numbers are the same every run.
import { stepReel, INITIAL_REEL_STATE } from './reelPhysics';
import { difficultyFor } from './gameSpecies';
import { fishSpeedMultiplier, drainMultiplier, zonePullFor, tensionMaxFor, hookWindowBonusMs } from './gameUpgrades';

const TICK_MS = 80;
const seeded = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function fight(rarity, { reel = 1, line = 1 }, player, random) {
  const d = difficultyFor(rarity);
  const params = {
    fishSpeed: d.fishSpeed * fishSpeedMultiplier(reel), runChance: d.runChance, runPower: d.runPower * fishSpeedMultiplier(reel),
    drainRate: d.drainRate * drainMultiplier(line), zonePull: zonePullFor(reel), zoneWidth: d.zoneWidth,
  };
  const tensionMax = tensionMaxFor(line);
  let state = INITIAL_REEL_STATE; const seen = []; let elapsed = 0;
  for (;;) {
    seen.push(state);
    const late = seen[Math.max(0, seen.length - 1 - player.delay)];
    let holding = late.fishPos > late.zonePos;
    if (random() < player.fumble) holding = !holding;
    state = stepReel(state, { ...params, holding }); elapsed += TICK_MS;
    if (state.progress >= 100) return 'land';
    if (state.tension >= tensionMax) return 'snap';
    if (elapsed >= d.fightMs) return 'time';
  }
}
function landRate(rarity, tackle, player, n = 400) {
  const random = seeded(7);
  jest.spyOn(Math, 'random').mockImplementation(random);
  let landed = 0;
  for (let i = 0; i < n; i += 1) if (fight(rarity, tackle, player, random) === 'land') landed += 1;
  Math.random.mockRestore();
  return landed / n;
}
const AVERAGE = { delay: 3, fumble: 0.04 };
const GOOD = { delay: 2, fumble: 0.01 };
const STOCK = { reel: 1, line: 1 };
const MAXED = { reel: 5, line: 5 };

test('with stock tackle the small fish come in, the rare ones mostly, and a legendary almost never', () => {
  expect(landRate('common', STOCK, AVERAGE)).toBeGreaterThan(0.97);
  expect(landRate('uncommon', STOCK, AVERAGE)).toBeGreaterThan(0.9);
  const rare = landRate('rare', STOCK, AVERAGE);
  expect(rare).toBeGreaterThan(0.55);
  expect(rare).toBeLessThan(0.95);
  const epic = landRate('epic', STOCK, AVERAGE);
  expect(epic).toBeGreaterThan(0.1);
  expect(epic).toBeLessThan(0.5);
  const legendary = landRate('legendary', STOCK, AVERAGE);
  expect(legendary).toBeLessThan(0.15);
  // Not impossible: a good thumb lands one now and then.
  expect(landRate('legendary', STOCK, GOOD)).toBeGreaterThan(0.03);
});

test('the upgrades matter: maxed tackle turns the big fish from a long shot into a fair fight', () => {
  expect(landRate('rare', MAXED, AVERAGE)).toBeGreaterThan(0.95);
  expect(landRate('epic', MAXED, AVERAGE)).toBeGreaterThan(0.8);
  const legendary = landRate('legendary', MAXED, AVERAGE);
  expect(legendary).toBeGreaterThan(0.5);
  expect(legendary).toBeLessThan(0.95);
  // Each track pulls its own weight on an epic: the reel alone and the line alone both help.
  const stock = landRate('epic', STOCK, AVERAGE);
  expect(landRate('epic', { reel: 5, line: 1 }, AVERAGE)).toBeGreaterThan(stock + 0.1);
  expect(landRate('epic', { reel: 1, line: 5 }, AVERAGE)).toBeGreaterThan(stock + 0.1);
});

test('the rod is the hookset: at stock a legendary bite is missed often, at level 5 hardly ever', () => {
  // Reaction times around 400 ms (tap after the cue, touch latency included).
  const random = seeded(3);
  const gauss = () => { const u = random() || 1e-9; const v = random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const missRate = (rarity, rod) => { const window = difficultyFor(rarity).hookWindowMs + hookWindowBonusMs(rod); let missed = 0; for (let i = 0; i < 4000; i += 1) if (400 + 90 * gauss() > window) missed += 1; return missed / 4000; };
  expect(missRate('common', 1)).toBeLessThan(0.01);
  expect(missRate('legendary', 1)).toBeGreaterThan(0.3);
  expect(missRate('legendary', 5)).toBeLessThan(0.02);
});
