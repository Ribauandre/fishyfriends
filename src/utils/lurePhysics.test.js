import {
  INITIAL_JERK_STATE, INITIAL_CRANK_STATE, JERK_ZONE, JERK_SWEEP_MS, CRANK_BAND_WIDTH,
  jerkMarker, twitchJerk, decayJerk, jerkQuality, stepCrank, crankQuality,
} from './lurePhysics';

describe('jerk bait', () => {
  test('the marker sweeps 0-100 and loops every sweep', () => {
    expect(jerkMarker(0)).toBe(0);
    expect(jerkMarker(JERK_SWEEP_MS / 2)).toBe(50);
    expect(jerkMarker(JERK_SWEEP_MS)).toBe(0);
  });

  test('a twitch inside the zone builds attraction and counts as a hit', () => {
    const next = twitchJerk(INITIAL_JERK_STATE, (JERK_ZONE[0] + JERK_ZONE[1]) / 2);
    expect(next.attraction).toBe(20);
    expect(next.hits).toBe(1);
    expect(next.misses).toBe(0);
    expect(next.lastTwitchOnBeat).toBe(true);
  });

  test('a twitch outside the zone spooks the fish and drops attraction, floored at 0', () => {
    const next = twitchJerk({ attraction: 5, hits: 0, misses: 0 }, 10);
    expect(next.attraction).toBe(0);
    expect(next.misses).toBe(1);
    expect(next.lastTwitchOnBeat).toBe(false);
  });

  test('attraction decays over time so idling never earns a bite', () => {
    const next = decayJerk({ attraction: 50, hits: 0, misses: 0 }, 1000);
    expect(next.attraction).toBeCloseTo(44);
  });

  test('quality is the share of twitches that landed on the beat', () => {
    expect(jerkQuality({ attraction: 0, hits: 3, misses: 1 })).toBe(0.75);
    expect(jerkQuality(INITIAL_JERK_STATE)).toBe(0);
  });
});

describe('crank bait', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  test('holding cranks the speed up, releasing lets it fall, clamped to [0, 100]', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(stepCrank(INITIAL_CRANK_STATE, { holding: true }).speed).toBe(4);
    expect(stepCrank({ ...INITIAL_CRANK_STATE, speed: 2 }, { holding: false }).speed).toBe(0);
    expect(stepCrank({ ...INITIAL_CRANK_STATE, speed: 99 }, { holding: true }).speed).toBe(100);
  });

  test('attraction builds inside the strike band and bleeds outside it', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // no band drift
    const inBand = stepCrank({ ...INITIAL_CRANK_STATE, speed: 55, attraction: 10 }, { holding: false });
    expect(inBand.attraction).toBe(13);
    expect(inBand.inBandTicks).toBe(1);
    const outOfBand = stepCrank({ ...INITIAL_CRANK_STATE, speed: 100, attraction: 10 }, { holding: true });
    expect(outOfBand.attraction).toBe(9);
    expect(outOfBand.inBandTicks).toBe(0);
  });

  test('the lure travels back faster the harder you crank, capped at the boat', () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const slow = stepCrank({ ...INITIAL_CRANK_STATE, speed: 20 }, { holding: false });
    const fast = stepCrank({ ...INITIAL_CRANK_STATE, speed: 90 }, { holding: false });
    expect(fast.distance).toBeGreaterThan(slow.distance);
    expect(stepCrank({ ...INITIAL_CRANK_STATE, speed: 100, distance: 99.9 }, { holding: true }).distance).toBe(100);
  });

  test('the band drifts but stays inside the gauge', () => {
    jest.spyOn(Math, 'random').mockReturnValue(1);
    const drifted = stepCrank({ ...INITIAL_CRANK_STATE, bandCenter: 79.5 }, { holding: false });
    expect(drifted.bandCenter).toBeLessThanOrEqual(80);
    expect(drifted.bandCenter + CRANK_BAND_WIDTH / 2).toBeLessThanOrEqual(100);
  });

  test('quality is the share of ticks spent in the band', () => {
    expect(crankQuality({ ...INITIAL_CRANK_STATE, inBandTicks: 30, ticks: 40 })).toBe(0.75);
  });
});
