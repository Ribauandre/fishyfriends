// Cast & Catch's rarity system. Reuses the same species keys FishIllustration already has
// dedicated art for, so a rare catch in the minigame renders with the exact same sticker art
// as everywhere else on the site rather than needing new illustrations. Each tier gets a
// harder mechanic (shorter hookset window, tighter reel-in zone) as well as a lower spawn
// weight, so rarity is a real skill check, not just a loot roll.
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
// epic/legendary are offshore-exclusive (see utils/gameBiomes.js), so a charter guarantees one
// of these two on every attempt — hookWindowMs floors were raised for both so paying for a trip
// doesn't mean facing a near-unreactable hookset window (the button only appears on the bite,
// there's no chance to pre-position a click) on every single cast.
const RARITY_DIFFICULTY = {
  common: { spawnWeight: 46, hookWindowMs: 850, zoneWidth: 42, fishSpeed: 1.0, drainRate: 0.5, points: [4, 8] },
  uncommon: { spawnWeight: 28, hookWindowMs: 700, zoneWidth: 34, fishSpeed: 1.3, drainRate: 0.65, points: [10, 18] },
  rare: { spawnWeight: 16, hookWindowMs: 580, zoneWidth: 27, fishSpeed: 1.6, drainRate: 0.85, points: [24, 40] },
  epic: { spawnWeight: 8, hookWindowMs: 500, zoneWidth: 21, fishSpeed: 2.0, drainRate: 1.1, points: [55, 90] },
  legendary: { spawnWeight: 2, hookWindowMs: 420, zoneWidth: 16, fishSpeed: 2.5, drainRate: 1.4, points: [120, 200] },
};

const SPECIES_LABELS = {
  bluegill: 'Bluegill', yellowperch: 'Yellow perch', trout: 'Trout', largemouth: 'Largemouth bass',
  smallmouth: 'Smallmouth bass', carp: 'Carp', catfish: 'Catfish', chainpickerel: 'Chain pickerel',
  pike: 'Northern pike', walleye: 'Walleye', flounder: 'Flounder', brooktrout: 'Brook trout',
  browntrout: 'Brown trout', weakfish: 'Weakfish', blackseabass: 'Black sea bass',
  stripedbass: 'Striped bass', bluefish: 'Bluefish', laketrout: 'Lake trout', rainbowtrout: 'Rainbow trout',
  tautog: 'Tautog', snakehead: 'Northern snakehead', salmon: 'Atlantic salmon', mahimahi: 'Mahi mahi',
  tuna: 'Tuna', shark: 'Shark', swordfish: 'Swordfish',
};

export function speciesLabel(species) { return SPECIES_LABELS[species] || species; }

// Each species' rarity is fixed here, independent of where it's caught — a species can live in
// several biomes (see utils/gameBiomes.js) but its difficulty/points/hookset numbers never
// change with location.
const SPECIES_RARITY = {
  bluegill: 'common', yellowperch: 'common', trout: 'common', largemouth: 'common', smallmouth: 'common',
  carp: 'common', catfish: 'common', chainpickerel: 'common', flounder: 'common', weakfish: 'common',
  pike: 'uncommon', walleye: 'uncommon', brooktrout: 'uncommon', browntrout: 'uncommon', rainbowtrout: 'uncommon',
  blackseabass: 'uncommon', tautog: 'uncommon', bluefish: 'uncommon',
  laketrout: 'rare', snakehead: 'rare', stripedbass: 'rare', salmon: 'rare',
  mahimahi: 'epic', tuna: 'epic',
  shark: 'legendary', swordfish: 'legendary',
};

// Fish that feed after dark. At night the roll leans hard toward these within whatever tier
// it lands on; at dawn and dusk a little; in full daylight it leans away from them. Which
// tier you roll is still bait and rarity's business (see rollSpecies) — night changes what's
// moving, not how hard it fights.
export const NOCTURNAL = ['catfish', 'walleye', 'snakehead', 'stripedbass', 'weakfish', 'shark', 'swordfish'];

const PERIOD_NOCTURNAL_WEIGHT = { night: 3, dusk: 1.7, dawn: 1.7, day: 0.6 };

export function speciesWeight(species, period = 'day') {
  return NOCTURNAL.includes(species) ? (PERIOD_NOCTURNAL_WEIGHT[period] || 1) : 1;
}

export function rarityOf(species) { return SPECIES_RARITY[species] || 'common'; }

export function difficultyFor(rarity) { return RARITY_DIFFICULTY[rarity] || RARITY_DIFFICULTY.common; }

// Rolls a species from a biome's species list (see utils/gameBiomes.js), grouping them by their
// fixed rarity and weighting by each tier's base spawn odds. Each bait level above 1 pulls
// weight away from common/uncommon and toward rare+ — within whichever tiers that biome
// actually has — without ever making the harder reel-in mechanic itself easier; bait gets you
// more shots at a big fish, it doesn't help you land one once it's on the line.
const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

// `favor` lists species the lure is made for (a streamer and the big browns): they roll at a
// multiple of their weight within whichever tier comes up, so the lure steers what bites
// without changing how hard any fish fights.
export const FAVOR_WEIGHT = 2.5;

export function rollSpecies(baitLevel, biomeSpecies, { period = 'day', random = Math.random, favor = [] } = {}) {
  const speciesByRarity = {};
  biomeSpecies.forEach((species) => {
    const rarity = rarityOf(species);
    (speciesByRarity[rarity] || (speciesByRarity[rarity] = [])).push(species);
  });
  const tiers = RARITY_ORDER.filter((tier) => speciesByRarity[tier]);
  const shift = Math.max(0, baitLevel - 1) * 6;
  const weights = tiers.map((tier) => {
    const base = RARITY_DIFFICULTY[tier].spawnWeight;
    const isLowTier = tier === 'common' || tier === 'uncommon';
    return Math.max(1, base + (isLowTier ? -shift : shift * 0.6));
  });
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = random() * total;
  let chosenTier = tiers[tiers.length - 1];
  for (let i = 0; i < tiers.length; i += 1) {
    if (roll < weights[i]) { chosenTier = tiers[i]; break; }
    roll -= weights[i];
  }
  const pool = speciesByRarity[chosenTier];
  const poolWeights = pool.map((species) => speciesWeight(species, period) * (favor.includes(species) ? FAVOR_WEIGHT : 1));
  let pick = random() * poolWeights.reduce((sum, w) => sum + w, 0);
  let species = pool[pool.length - 1];
  for (let i = 0; i < pool.length; i += 1) {
    if (pick < poolWeights[i]) { species = pool[i]; break; }
    pick -= poolWeights[i];
  }
  return { species, rarity: chosenTier };
}

export function pointsFor(rarity) {
  const [min, max] = difficultyFor(rarity).points;
  return Math.round(min + Math.random() * (max - min));
}

// Real-ish length ranges per species, in inches, so a record is a number worth chasing and a
// 9-inch bluegill means something a 9-inch shark never could. Skewed toward the small end;
// the big ones are rare, like real ones.
export const SPECIES_SIZE = {
  bluegill: [5, 11], yellowperch: [6, 14], trout: [8, 20], largemouth: [10, 24], smallmouth: [9, 21],
  carp: [14, 36], catfish: [12, 40], chainpickerel: [12, 26], flounder: [12, 26], weakfish: [12, 28],
  pike: [18, 44], walleye: [14, 30], brooktrout: [7, 20], browntrout: [10, 28], rainbowtrout: [10, 28],
  blackseabass: [10, 22], tautog: [12, 26], bluefish: [14, 34], laketrout: [18, 40], snakehead: [16, 34],
  stripedbass: [18, 48], salmon: [20, 42], mahimahi: [24, 54], tuna: [30, 80], shark: [40, 110], swordfish: [60, 140],
};

export function rollSize(species, random = Math.random) {
  const [min, max] = SPECIES_SIZE[species] || [6, 18];
  return Math.round((min + (max - min) * random() ** 1.6) * 10) / 10;
}

export function sizeLabel(sizeIn) { return `${Number(sizeIn).toFixed(1)} in`; }

// A record is the biggest of a species you've personally landed in the game (the almanac keeps
// them, see game_profiles.records). The first of a species is a record by definition.
export function isNewRecord(records, species, sizeIn) {
  const best = records?.[species]?.size_in;
  return best === undefined || best === null || sizeIn > Number(best);
}

export function sizeLabelFor(rarity) {
  const sizesByRarity = {
    common: [4, 12], uncommon: [8, 18], rare: [14, 28], epic: [22, 40], legendary: [36, 70],
  };
  const [min, max] = sizesByRarity[rarity] || sizesByRarity.common;
  const inches = (min + Math.random() * (max - min)).toFixed(1);
  return `${inches} in`;
}
