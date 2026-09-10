// Pure per-tick logic for the active lures' bite mechanics, split out from FishingGame so each
// can be tested without timers or DOM (same approach as utils/reelPhysics.js).

// ---- Jerk bait: a marker sweeps a meter on a loop; twitch while it's inside the zone to
// build attraction, twitch off-beat and you spook the fish. Attraction also bleeds away on its
// own so you can't idle your way to a bite. ----
export const JERK_SWEEP_MS = 800;
export const JERK_ZONE = [55, 80];
export const JERK_TIME_LIMIT_MS = 15000;
export const INITIAL_JERK_STATE = { attraction: 0, hits: 0, misses: 0 };

export function jerkMarker(elapsedMs) { return ((elapsedMs % JERK_SWEEP_MS) / JERK_SWEEP_MS) * 100; }

export function twitchJerk(state, marker) {
  const onBeat = marker >= JERK_ZONE[0] && marker <= JERK_ZONE[1];
  const attraction = Math.max(0, Math.min(100, state.attraction + (onBeat ? 20 : -10)));
  return { attraction, hits: state.hits + (onBeat ? 1 : 0), misses: state.misses + (onBeat ? 0 : 1), lastTwitchOnBeat: onBeat };
}

export function decayJerk(state, dtMs) {
  return { ...state, attraction: Math.max(0, state.attraction - dtMs * 0.006) };
}

export function jerkQuality(state) { return state.hits / Math.max(1, state.hits + state.misses); }

// ---- Crank bait: holding cranks the retrieve speed up, releasing lets it fall. Attraction
// builds while speed sits inside a strike band whose centre drifts, so you keep adjusting
// rather than finding one setting and parking. The lure also travels back to you as you crank;
// reach the boat before attraction fills and the cast is wasted. ----
export const CRANK_TICK_MS = 80;
export const CRANK_BAND_WIDTH = 22;
export const INITIAL_CRANK_STATE = { speed: 0, bandCenter: 55, attraction: 0, distance: 0, inBandTicks: 0, ticks: 0 };

export function stepCrank(state, { holding }) {
  const speed = Math.max(0, Math.min(100, state.speed + (holding ? 4 : -3)));
  const bandCenter = Math.max(30, Math.min(80, state.bandCenter + (Math.random() * 2 - 1) * 1.5));
  const inBand = Math.abs(speed - bandCenter) <= CRANK_BAND_WIDTH / 2;
  const attraction = Math.max(0, Math.min(100, state.attraction + (inBand ? 3 : -1)));
  const distance = Math.min(100, state.distance + (speed / 100) * 1.1);
  return { speed, bandCenter, attraction, distance, inBandTicks: state.inBandTicks + (inBand ? 1 : 0), ticks: state.ticks + 1, inBand };
}

export function crankQuality(state) { return state.inBandTicks / Math.max(1, state.ticks); }

// ---- The fly: an accuracy cast, then the drift. The cast meter's sweet spot sits wherever the
// trout is rising, and how close the fly lands sets the starting attraction. Then the fly
// drifts down the run while drag builds as the line bellies in the current; a mend (tap)
// while drag is in the band resets it cleanly, a mend too early does nothing, and letting
// drag hit the top skates the fly and spooks the fish. Attraction builds while the fly drifts
// drag-free — faster on the hatch — and the cast is spent once the run is drifted through.
// ----
export const DRIFT_TICK_MS = 80;
export const DRIFT_RUN_MS = 12000;
export const MEND_ZONE = [45, 80];
export const RISE_TOLERANCE = 25;
export const INITIAL_DRIFT_STATE = { drag: 0, drift: 0, attraction: 0, mends: 0, cleanMends: 0, ticks: 0, cleanTicks: 0 };

// 1 when the fly lands on the rise, 0 when it's RISE_TOLERANCE meter points or more away.
export function castAccuracy(power, rise) {
  return Math.max(0, Math.min(1, 1 - Math.abs(power - rise) / RISE_TOLERANCE));
}

export function startDrift(accuracy) {
  return { ...INITIAL_DRIFT_STATE, accuracy, attraction: Math.round(accuracy * 35) };
}

export function stepDrift(state, { hatch = false } = {}) {
  const drag = Math.min(100, state.drag + 1.4);
  const clean = drag < MEND_ZONE[1];
  const attraction = Math.max(0, Math.min(100, state.attraction + (clean ? 1.0 * (hatch ? 1.5 : 1) : -1.5)));
  const drift = Math.min(100, state.drift + (100 * DRIFT_TICK_MS) / DRIFT_RUN_MS);
  return { ...state, drag, attraction, drift, ticks: state.ticks + 1, cleanTicks: state.cleanTicks + (clean ? 1 : 0), clean };
}

export function mendLine(state) {
  const inZone = state.drag >= MEND_ZONE[0] && state.drag <= MEND_ZONE[1];
  const late = state.drag > MEND_ZONE[1];
  // A clean mend resets the drag; a late one saves the drift but costs attraction; an early one
  // is wasted line — the fly keeps dragging as it was.
  return {
    ...state,
    drag: inZone ? 0 : late ? 20 : state.drag,
    attraction: late ? Math.max(0, state.attraction - 15) : state.attraction,
    mends: state.mends + 1,
    cleanMends: state.cleanMends + (inZone ? 1 : 0),
    lastMendClean: inZone,
    lastMendLate: late,
  };
}

export function driftSpooked(state) { return state.drag >= 100; }
export function driftDone(state) { return state.drift >= 100; }

// Presentation quality: how close the cast was, how much of the drift ran drag-free, and how
// clean the mends were — plus a little for matching the hatch.
export function driftQuality(state, { hatch = false } = {}) {
  const mendShare = state.mends > 0 ? state.cleanMends / state.mends : 0.5;
  const cleanShare = state.ticks > 0 ? state.cleanTicks / state.ticks : 1;
  const base = 0.35 * (state.accuracy || 0) + 0.35 * mendShare + 0.3 * cleanShare;
  return Math.max(0, Math.min(1, base + (hatch ? 0.15 : 0)));
}
