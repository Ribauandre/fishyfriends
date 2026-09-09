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
