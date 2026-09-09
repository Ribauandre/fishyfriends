// Lures decide how the "waiting for a bite" phase plays. Live bait is the passive default;
// the others turn the wait into its own skill check (see utils/lurePhysics.js) and pay off
// with a presentation quality score (0-1) for working the lure well: quality shifts the roll
// toward rarer fish like extra bait levels and adds a points bonus, so a lure is worth
// mastering rather than just a cosmetic choice. Live bait always scores 0.
export const LURES = {
  livebait: { key: 'livebait', label: 'Live bait', cost: 0, interaction: 'wait', blurb: 'Cast it out and wait it out. No bonus, no fuss.' },
  jerkbait: { key: 'jerkbait', label: 'Jerk bait', cost: 60, interaction: 'twitch', blurb: 'Twitch it on the beat — a clean rhythm draws bigger fish.' },
  crankbait: { key: 'crankbait', label: 'Crank bait', cost: 90, interaction: 'crank', blurb: 'Hold to crank and keep the retrieve inside the strike zone.' },
};

export const LURE_LIST = Object.values(LURES);

export function lureOwned(gameProfile, lureKey) {
  return LURES[lureKey]?.cost === 0 || (gameProfile?.owned_lures || []).includes(lureKey);
}

export const QUALITY_BAIT_LEVELS = 2;

export function qualityPointsMultiplier(quality) { return 1 + 0.3 * quality; }
