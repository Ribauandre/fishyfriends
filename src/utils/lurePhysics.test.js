import {
  INITIAL_JERK_STATE, INITIAL_CRANK_STATE, JERK_ZONE, JERK_SWEEP_MS, CRANK_BAND_WIDTH,
  jerkMarker, twitchJerk, decayJerk, jerkQuality, stepCrank, crankQuality,
  MEND_ZONE, RISE_TOLERANCE, DRIFT_TICK_MS, DRIFT_RUN_MS,
  castAccuracy, startDrift, stepDrift, mendLine, driftSpooked, driftDone, driftQuality,
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

describe('the fly: accuracy cast and drift', () => {
  test('accuracy is 1 on the rise and falls to 0 a tolerance away', () => {
    expect(castAccuracy(50, 50)).toBe(1);
    expect(castAccuracy(50 + RISE_TOLERANCE / 2, 50)).toBeCloseTo(0.5);
    expect(castAccuracy(50 + RISE_TOLERANCE, 50)).toBe(0);
    expect(castAccuracy(0, 100)).toBe(0);
  });

  test('a close cast starts the drift with attraction already built', () => {
    expect(startDrift(1).attraction).toBe(35);
    expect(startDrift(0).attraction).toBe(0);
    expect(startDrift(0.5).accuracy).toBe(0.5);
  });

  test('drag builds every tick, attraction climbs while the drift is clean and bleeds once it drags', () => {
    let state = startDrift(0);
    state = stepDrift(state);
    expect(state.drag).toBeCloseTo(1.4);
    expect(state.attraction).toBeCloseTo(1);
    expect(state.clean).toBe(true);
    const dragging = stepDrift({ ...startDrift(0), drag: MEND_ZONE[1] + 5, attraction: 20 });
    expect(dragging.clean).toBe(false);
    expect(dragging.attraction).toBeCloseTo(18.5);
  });

  test('matching the hatch builds attraction half again as fast', () => {
    expect(stepDrift(startDrift(0), { hatch: true }).attraction).toBeCloseTo(1.5);
  });

  test('a mend in the band resets the drag; late costs attraction; early does nothing', () => {
    const clean = mendLine({ ...startDrift(0), drag: (MEND_ZONE[0] + MEND_ZONE[1]) / 2, attraction: 40 });
    expect(clean.drag).toBe(0);
    expect(clean.lastMendClean).toBe(true);
    expect(clean.cleanMends).toBe(1);
    const late = mendLine({ ...startDrift(0), drag: MEND_ZONE[1] + 10, attraction: 40 });
    expect(late.drag).toBe(20);
    expect(late.attraction).toBe(25);
    expect(late.lastMendLate).toBe(true);
    const early = mendLine({ ...startDrift(0), drag: 10, attraction: 40 });
    expect(early.drag).toBe(10);
    expect(early.attraction).toBe(40);
    expect(early.lastMendClean).toBe(false);
    expect(early.mends).toBe(1);
  });

  test('never mending skates the fly before the run is drifted through', () => {
    let state = startDrift(1);
    let ticks = 0;
    while (!driftSpooked(state) && !driftDone(state) && state.attraction < 100) { state = stepDrift(state); ticks += 1; }
    expect(driftSpooked(state)).toBe(true);
    expect(driftDone(state)).toBe(false);
    expect(ticks * DRIFT_TICK_MS).toBeLessThan(DRIFT_RUN_MS);
  });

  test('a clean mend whenever the drag enters the band gets the bite before the run ends', () => {
    let state = startDrift(0.5);
    let ticks = 0;
    while (state.attraction < 100 && !driftDone(state) && !driftSpooked(state)) {
      if (state.drag >= MEND_ZONE[0]) state = mendLine(state);
      state = stepDrift(state);
      ticks += 1;
    }
    expect(state.attraction).toBe(100);
    expect(driftSpooked(state)).toBe(false);
    expect(ticks * DRIFT_TICK_MS).toBeLessThan(DRIFT_RUN_MS);
  });

  test('quality blends the cast, the mends and the clean share of the drift, plus the hatch', () => {
    const perfect = { ...startDrift(1), mends: 2, cleanMends: 2, ticks: 10, cleanTicks: 10 };
    expect(driftQuality(perfect)).toBeCloseTo(1);
    expect(driftQuality(perfect, { hatch: true })).toBe(1);
    const sloppy = { ...startDrift(0), mends: 2, cleanMends: 0, ticks: 10, cleanTicks: 5 };
    expect(driftQuality(sloppy)).toBeCloseTo(0.15);
    expect(driftQuality(sloppy, { hatch: true })).toBeCloseTo(0.3);
  });
});
