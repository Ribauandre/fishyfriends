import { stepReel, INITIAL_REEL_STATE, MAX_FISH_VEL, RUN_CHANCE } from './reelPhysics';

// A random source that returns the given values in order (and the last one forever after).
const sequence = (...values) => { let i = 0; return () => values[Math.min(i++, values.length - 1)]; };

const BASE_PARAMS = { fishSpeed: 1, drainRate: 1, zoneWidth: 20 };

describe('stepReel', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  test('fills progress and drains tension while the fish stays inside the zone', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // keeps fish velocity locked at 0
    const state = { fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 50 };
    const next = stepReel(state, { ...BASE_PARAMS, holding: true });
    expect(next.fishPos).toBe(50);
    expect(next.progress).toBeCloseTo(3.2);
    expect(next.tension).toBeCloseTo(47.5);
  });

  test('drains progress and builds tension while the fish is outside the zone', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = { fishPos: 50, fishVel: 0, zonePos: 90, progress: 50, tension: 0 };
    const next = stepReel(state, { ...BASE_PARAMS, zoneWidth: 10, holding: false });
    expect(next.progress).toBeCloseTo(48.4);
    expect(next.tension).toBeCloseTo(4.5);
  });

  test('never drops progress below 0 while out of zone', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = { fishPos: 50, fishVel: 0, zonePos: 90, progress: 0, tension: 0 };
    const next = stepReel(state, { ...BASE_PARAMS, zoneWidth: 10, holding: false });
    expect(next.progress).toBe(0);
  });

  test('never drops tension below 0 while in zone', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = { fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 0 };
    const next = stepReel(state, { ...BASE_PARAMS, holding: true });
    expect(next.tension).toBe(0);
  });

  test('caps progress at 100', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const state = { fishPos: 50, fishVel: 0, zonePos: 50, progress: 99, tension: 0 };
    const next = stepReel(state, { ...BASE_PARAMS, holding: true });
    expect(next.progress).toBe(100);
  });

  test('pulls the catch zone up while holding and down while released, clamped to [0, 100]', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const held = stepReel({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: true });
    expect(held.zonePos).toBeGreaterThan(50);
    const released = stepReel({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: false });
    expect(released.zonePos).toBeLessThan(50);
    const atFloor = stepReel({ fishPos: 50, fishVel: 0, zonePos: 1, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: false });
    expect(atFloor.zonePos).toBe(0);
    const atCeiling = stepReel({ fishPos: 50, fishVel: 0, zonePos: 99, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: true });
    expect(atCeiling.zonePos).toBe(100);
  });

  test('a hooked fish bolts: a run is a burst the zone cannot follow, held for several ticks', () => {
    // First roll starts the run (below the chance), second picks the direction (left), the
    // rest set its length and strength.
    jest.spyOn(Math, 'random').mockImplementation(sequence(0.01, 0.2, 0.5, 0.5, 0.5));
    const bolt = stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, holding: true });
    expect(bolt.run).toBeGreaterThanOrEqual(3);
    expect(bolt.fishVel).toBeLessThan(-4);
    expect(Math.abs(bolt.fishVel)).toBeGreaterThan(5.5); // faster than the zone's 5.5 pull
    // The run carries on without a new roll going its way, and closes on its own speed.
    Math.random.mockImplementation(() => 0.5);
    const next = stepReel(bolt, { ...BASE_PARAMS, holding: true });
    expect(next.run).toBe(bolt.run - 1);
    expect(next.fishVel).toBeLessThan(bolt.fishVel);
    expect(next.fishPos).toBeLessThan(bolt.fishPos);
    expect(Math.abs(next.fishVel)).toBeLessThanOrEqual(MAX_FISH_VEL);
  });

  test('a faster fish runs more often and jinks back on itself', () => {
    // Just under the common fish's run chance: a common fish drifts, a legendary bolts.
    jest.spyOn(Math, 'random').mockImplementation(sequence(RUN_CHANCE * 1.5, 0.9, 0.5, 0.5, 0.5));
    expect(stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, fishSpeed: 1, holding: true }).run).toBe(0);
    Math.random.mockImplementation(sequence(RUN_CHANCE * 1.5, 0.9, 0.5, 0.5, 0.5));
    expect(stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, fishSpeed: 2.5, holding: true }).run).toBeGreaterThan(0);
    // No run; a wander to the right, then a jink roll under the chance flips it hard left.
    Math.random.mockImplementation(sequence(0.9, 1, 0.001));
    const jink = stepReel({ ...INITIAL_REEL_STATE, fishVel: 2 }, { ...BASE_PARAMS, fishSpeed: 1, holding: true });
    expect(jink.fishVel).toBeLessThan(-2);
  });

  test('a species\' temperament sets how often and how hard it runs', () => {
    // The same roll starts a run for a legendary temperament and not for a common one.
    jest.spyOn(Math, 'random').mockImplementation(sequence(0.04, 0.9, 0.5, 0.5, 0.5));
    expect(stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, runChance: 0.03, runPower: 0.8, holding: true }).run).toBe(0);
    Math.random.mockImplementation(sequence(0.04, 0.9, 0.5, 0.5, 0.5));
    const hot = stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, runChance: 0.15, runPower: 1.6, holding: true });
    expect(hot.run).toBeGreaterThan(0);
    Math.random.mockImplementation(sequence(0.01, 0.9, 0.5, 0.5, 0.5));
    const mild = stepReel(INITIAL_REEL_STATE, { ...BASE_PARAMS, runChance: 0.03, runPower: 0.8, holding: true });
    expect(mild.run).toBeGreaterThan(0);
    expect(Math.abs(hot.fishVel)).toBeGreaterThan(Math.abs(mild.fishVel));
  });

  test('bounces the fish back into range instead of letting it run past the edges', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1); // pushes velocity as positive as possible
    const next = stepReel({ fishPos: 99, fishVel: 5, zonePos: 50, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: false });
    expect(next.fishPos).toBeLessThanOrEqual(100);
    expect(next.fishPos).toBeGreaterThanOrEqual(0);
    expect(next.fishVel).toBeLessThan(0);
  });
});
