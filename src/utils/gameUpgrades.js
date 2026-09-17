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

// Grows by a shrinking multiple each level (2x, 1.75x, 1.57x, ...) instead of a power curve's
// steep early jump, so the first upgrade doesn't cost three times the second-to-last.
export function upgradeCost(currentLevel) {
  return 40 + 30 * (currentLevel - 1) + 10 * (currentLevel - 1) ** 2;
}

// Effective, upgrade-adjusted difficulty modifiers layered on top of a rarity's base numbers.
export function hookWindowBonusMs(rodLevel) { return (rodLevel - 1) * 70; }
export function tensionMaxFor(lineLevel) { return 100 + (lineLevel - 1) * 25; }
// The line: strain builds slower on a better line, as well as snapping later.
export function drainMultiplier(lineLevel) { return 1 - (lineLevel - 1) * 0.1; }
// The reel: the fish's drift and its runs have less sting, and the catch zone moves faster
// under the thumb, so it can follow a run.
export function fishSpeedMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
export function zonePullFor(reelLevel) { return 5.5 + (reelLevel - 1) * 0.6; }
