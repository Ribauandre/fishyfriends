// Tackle shop config for Cast & Catch. Every track tops out at level 5 and only ever
// widens margins on the existing skill checks (a longer hookset window, more line slack
// before a snap, a smoother-moving fish, better rarity odds) — none of them remove the
// checks or auto-land a fish.
export const MAX_UPGRADE_LEVEL = 5;

export const UPGRADE_TRACKS = [
  { key: 'rod', column: 'rod_level', label: 'Rod', blurb: 'Widens the hookset window.' },
  { key: 'line', column: 'line_level', label: 'Line', blurb: 'More slack before the line snaps.' },
  { key: 'reel', column: 'reel_level', label: 'Reel', blurb: 'Smooths out how hard fish fight.' },
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
export function fishSpeedMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
export function drainMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
