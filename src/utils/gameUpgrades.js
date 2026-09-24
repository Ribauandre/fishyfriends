// Tackle shop config for Cast & Catch. Every track tops out at level 5 and only ever
// widens margins on the existing skill checks — none of them remove the checks or auto-land
// a fish — and each track has one job, so a player can feel which one they bought: the rod
// is the hookset window; the line is how much strain it takes before it snaps and how fast
// strain builds while the fish is out of the zone; the reel is how fast the zone moves under
// the thumb and how much sting a run has; bait is the odds of a rarer bite.
export const MAX_UPGRADE_LEVEL = 5;

export const UPGRADE_TRACKS = [
  { key: 'rod', column: 'rod_level', label: 'Rod', blurb: 'Widens the hookset window.' },
  { key: 'line', column: 'line_level', label: 'Line', blurb: 'Takes more strain before it snaps, and takes it slower.' },
  { key: 'reel', column: 'reel_level', label: 'Reel', blurb: 'Reels faster and takes the sting out of a run.' },
  { key: 'bait', column: 'bait_level', label: 'Bait', blurb: 'Better odds at rarer fish.' },
];

// The first level is cheap (a handful of panfish) and each one after costs about twice the
// last, so maxing a track is 800 points and all four 3,200 — a few weeks of casting, not an
// afternoon. It was 40/80/140/220 (480 a track) and players maxed everything in a day.
export function upgradeCost(currentLevel) {
  return [40, 110, 230, 420][currentLevel - 1] ?? 420;
}

// The late game's sink: a maxed track can be *rebuilt* — back to level 1 for a permanent
// bonus, half a level's worth per rebuild (rebuildBonus, added to the level the fight
// formulas see), up to MAX_REBUILDS. Each rebuild costs more than the last, and the points
// to level the track back up on top, so a maxed player always has somewhere to put a catch.
export const MAX_REBUILDS = 5;
export const REBUILD_LEVEL_BONUS = 0.5;
export function rebuildCost(rebuilds = 0) { return 1500 + 500 * rebuilds; }
export function rebuildBonus(rebuilds = 0) { return Math.min(MAX_REBUILDS, Math.max(0, rebuilds)) * REBUILD_LEVEL_BONUS; }
// The level a track plays at: its bought level plus what its rebuilds earned.
export function effectiveLevel(gameProfile, track) {
  const level = gameProfile?.[`${track}_level`] || 1;
  return level + rebuildBonus(gameProfile?.rebuilds?.[track] || 0);
}

// The charter club: one purchase, every charter free from then on (utils/gameBiomes.js
// charterFare reads it).
export const CHARTER_CLUB_COST = 1200;

// Effective, upgrade-adjusted difficulty modifiers layered on top of a rarity's base numbers.
export function hookWindowBonusMs(rodLevel) { return (rodLevel - 1) * 70; }
export function tensionMaxFor(lineLevel) { return 100 + (lineLevel - 1) * 25; }
// The line: strain builds slower on a better line, as well as snapping later.
export function drainMultiplier(lineLevel) { return 1 - (lineLevel - 1) * 0.1; }
// The reel: the fish's drift and its runs have less sting, and the catch zone moves faster
// under the thumb, so it can follow a run.
export function fishSpeedMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
export function zonePullFor(reelLevel) { return 5.5 + (reelLevel - 1) * 0.6; }
