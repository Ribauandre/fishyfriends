// Cast & Catch's rarity system. Reuses the same species keys FishIllustration already has
// dedicated art for, so a rare catch in the minigame renders with the exact same sticker art
// as everywhere else on the site rather than needing new illustrations. Each tier gets a
// harder mechanic (shorter hookset window, tighter reel-in zone) as well as a lower spawn
// weight, so rarity is a real skill check, not just a loot roll.
export const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_INFO = {
  common: { label: 'Common', color: '#9bb6b1', text: '#071419' },
  uncommon: { label: 'Uncommon', color: '#1fb8bd', text: '#071419' },
  rare: { label: 'Rare', color: '#4fa8ff', text: '#071419' },
  epic: { label: 'Epic', color: '#c58bff', text: '#071419' },
  legendary: { label: 'Legendary', color: '#e3fb14', text: '#071419' },
};

// spawnWeight: relative odds before bait level shifts them toward rarer tiers.
// hookWindowMs: how long the hookset flash stays clickable.
// zoneWidth: width (0-100 scale) of the forgiving reel-in zone.
// fishSpeed: how erratically the fish darts around during reel-in.
// drainRate: how fast line tension climbs while the fish is out of the zone.
// points: [min, max] tackle points awarded on a landed catch.
const RARITY_DIFFICULTY = {
  common: { spawnWeight: 46, hookWindowMs: 900, zoneWidth: 42, fishSpeed: 1.0, drainRate: 0.5, points: [4, 8] },
  uncommon: { spawnWeight: 28, hookWindowMs: 720, zoneWidth: 34, fishSpeed: 1.3, drainRate: 0.65, points: [10, 18] },
  rare: { spawnWeight: 16, hookWindowMs: 580, zoneWidth: 27, fishSpeed: 1.6, drainRate: 0.85, points: [24, 40] },
  epic: { spawnWeight: 8, hookWindowMs: 460, zoneWidth: 21, fishSpeed: 2.0, drainRate: 1.1, points: [55, 90] },
  legendary: { spawnWeight: 2, hookWindowMs: 360, zoneWidth: 16, fishSpeed: 2.5, drainRate: 1.4, points: [120, 200] },
};

const SPECIES_BY_RARITY = {
  common: ['bluegill', 'yellowperch', 'trout', 'largemouth', 'smallmouth', 'carp', 'catfish', 'chainpickerel'],
  uncommon: ['pike', 'walleye', 'flounder', 'brooktrout', 'browntrout', 'weakfish', 'blackseabass'],
  rare: ['stripedbass', 'bluefish', 'laketrout', 'rainbowtrout', 'tautog', 'snakehead'],
  epic: ['salmon', 'mahimahi', 'tuna'],
  legendary: ['shark'],
};

const SPECIES_LABELS = {
  bluegill: 'Bluegill', yellowperch: 'Yellow perch', trout: 'Trout', largemouth: 'Largemouth bass',
  smallmouth: 'Smallmouth bass', carp: 'Carp', catfish: 'Catfish', chainpickerel: 'Chain pickerel',
  pike: 'Northern pike', walleye: 'Walleye', flounder: 'Flounder', brooktrout: 'Brook trout',
  browntrout: 'Brown trout', weakfish: 'Weakfish', blackseabass: 'Black sea bass',
  stripedbass: 'Striped bass', bluefish: 'Bluefish', laketrout: 'Lake trout', rainbowtrout: 'Rainbow trout',
  tautog: 'Tautog', snakehead: 'Northern snakehead', salmon: 'Atlantic salmon', mahimahi: 'Mahi mahi',
  tuna: 'Tuna', shark: 'Shark',
};

export function speciesLabel(species) { return SPECIES_LABELS[species] || species; }

export function rarityOf(species) {
  return RARITY_TIERS.find((tier) => SPECIES_BY_RARITY[tier].includes(species)) || 'common';
}

export function difficultyFor(rarity) { return RARITY_DIFFICULTY[rarity] || RARITY_DIFFICULTY.common; }

// Each bait level above 1 pulls weight away from common/uncommon and toward rare+, without
// ever making the harder reel-in mechanic itself easier — bait gets you more shots at a big
// fish, it doesn't help you land one once it's on the line.
export function rollSpecies(baitLevel = 1) {
  const shift = Math.max(0, baitLevel - 1) * 6;
  const weights = RARITY_TIERS.map((tier) => {
    const base = RARITY_DIFFICULTY[tier].spawnWeight;
    const isLowTier = tier === 'common' || tier === 'uncommon';
    return Math.max(1, base + (isLowTier ? -shift : shift * 0.6));
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  let chosenTier = RARITY_TIERS[RARITY_TIERS.length - 1];
  for (let i = 0; i < RARITY_TIERS.length; i += 1) {
    if (roll < weights[i]) { chosenTier = RARITY_TIERS[i]; break; }
    roll -= weights[i];
  }
  const pool = SPECIES_BY_RARITY[chosenTier];
  const species = pool[Math.floor(Math.random() * pool.length)];
  return { species, rarity: chosenTier };
}

export function pointsFor(rarity) {
  const [min, max] = difficultyFor(rarity).points;
  return Math.round(min + Math.random() * (max - min));
}

export function sizeLabelFor(rarity) {
  const sizesByRarity = {
    common: [4, 12], uncommon: [8, 18], rare: [14, 28], epic: [22, 40], legendary: [36, 70],
  };
  const [min, max] = sizesByRarity[rarity] || sizesByRarity.common;
  const inches = (min + Math.random() * (max - min)).toFixed(1);
  return `${inches} in`;
}
