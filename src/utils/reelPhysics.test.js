import { stepReel } from './reelPhysics';

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

  test('bounces the fish back into range instead of letting it run past the edges', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1); // pushes velocity as positive as possible
    const next = stepReel({ fishPos: 99, fishVel: 5, zonePos: 50, progress: 0, tension: 0 }, { ...BASE_PARAMS, holding: false });
    expect(next.fishPos).toBeLessThanOrEqual(100);
    expect(next.fishPos).toBeGreaterThanOrEqual(0);
    expect(next.fishVel).toBeLessThan(0);
  });
});
