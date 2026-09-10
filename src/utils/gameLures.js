// Lures decide how the "waiting for a bite" phase plays. Live bait is the passive default;
// the others turn the wait into its own skill check (see utils/lurePhysics.js) and pay off
// with a presentation quality score (0-1) for working the lure well: quality shifts the roll
// toward rarer fish like extra bait levels and adds a points bonus, so a lure is worth
// mastering rather than just a cosmetic choice. Live bait always scores 0.
//
// Flies are lures too, but they need the fly rod (bought once at Sal's, `fly_rod` on the
// profile) and only come out on trout water (`flyWater` in utils/gameBiomes.js). Each fly
// has a hatch — the hours it matches what the trout are eating — and the streamer favours
// the big fish. Off-hatch a fly still works, just slower (see hatchMatch and the drift in
// utils/lurePhysics.js).
import { BIOMES } from './gameBiomes';

export const FLY_ROD = { key: 'flyrod', label: 'Fly rod', cost: 120, blurb: 'Opens the fly box: dry flies, nymphs and streamers on the river and the mountain lake. Cast to the rise, then mend the drift.' };

export const LURES = {
  livebait: { key: 'livebait', label: 'Live bait', cost: 0, interaction: 'wait', blurb: 'Cast it out and wait it out. No bonus, no fuss.' },
  jerkbait: { key: 'jerkbait', label: 'Jerk bait', cost: 60, interaction: 'twitch', blurb: 'Twitch it on the beat — a clean rhythm draws bigger fish.' },
  crankbait: { key: 'crankbait', label: 'Crank bait', cost: 90, interaction: 'crank', blurb: 'Hold to crank and keep the retrieve inside the strike zone.' },
  dryfly: { key: 'dryfly', label: 'Dry fly', cost: 40, interaction: 'drift', rod: 'fly', hatch: ['dawn', 'dusk'], blurb: 'Rides the surface. Cast to the rise at dawn or dusk and mend to keep it drifting clean.' },
  nymph: { key: 'nymph', label: 'Nymph', cost: 50, interaction: 'drift', rod: 'fly', hatch: ['day'], blurb: 'Drifts under the surface — trout eat these all day long.' },
  streamer: { key: 'streamer', label: 'Streamer', cost: 70, interaction: 'drift', rod: 'fly', hatch: ['night'], favors: ['browntrout', 'laketrout'], blurb: 'Swim it after dark for the big browns and lakers.' },
};

export const LURE_LIST = Object.values(LURES);
export const FLIES = LURE_LIST.filter((lure) => lure.rod === 'fly');

export function isFly(lureKey) { return LURES[lureKey]?.rod === 'fly'; }

export function lureOwned(gameProfile, lureKey) {
  return LURES[lureKey]?.cost === 0 || (gameProfile?.owned_lures || []).includes(lureKey);
}

export function hasFlyRod(gameProfile) { return Boolean(gameProfile?.fly_rod); }

// Whether a lure can even be tied on here: flies need fly water; everything else goes anywhere.
export function lureAllowedOn(lureKey, biome) {
  return !isFly(lureKey) || Boolean(BIOMES[biome]?.flyWater);
}

// The chips the dock shows for this ground: the conventional lures always, the fly box only on
// fly water and only once the fly rod is owned.
export function luresFor(biome, gameProfile) {
  return LURE_LIST.filter((lure) => !isFly(lure.key) || (BIOMES[biome]?.flyWater && hasFlyRod(gameProfile)));
}

// "Match the hatch": true when the fly suits the hour. Off-hatch it still catches, slower.
export function hatchMatch(lureKey, period) {
  const hatch = LURES[lureKey]?.hatch;
  return Boolean(hatch && hatch.includes(period));
}

export const QUALITY_BAIT_LEVELS = 2;

export function qualityPointsMultiplier(quality) { return 1 + 0.3 * quality; }
