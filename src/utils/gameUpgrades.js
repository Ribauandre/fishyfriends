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

export function upgradeCost(currentLevel) {
  return Math.round(40 * Math.pow(currentLevel, 1.6));
}

// Effective, upgrade-adjusted difficulty modifiers layered on top of a rarity's base numbers.
export function hookWindowBonusMs(rodLevel) { return (rodLevel - 1) * 70; }
export function tensionMaxFor(lineLevel) { return 100 + (lineLevel - 1) * 25; }
export function fishSpeedMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
export function drainMultiplier(reelLevel) { return 1 - (reelLevel - 1) * 0.08; }
