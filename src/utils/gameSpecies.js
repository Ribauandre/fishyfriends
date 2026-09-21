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
  // Not a fish. A stick comes up now and then on any water: an easy, dead-weight reel and
  // nothing for it — no points, no record, no quest, no log. Nice one.
  junk: { label: 'Junk', color: '#6d7a80', text: '#071419' },
};

// The chance any bite is the stick rather than a fish.
export const JUNK_CHANCE = 0.05;
export const JUNK_SPECIES = 'stick';
export function isJunk(rarity) { return rarity === 'junk'; }
export function rollJunk(random = Math.random) {
  return random() < JUNK_CHANCE ? { species: JUNK_SPECIES, rarity: 'junk' } : null;
}

// spawnWeight: relative odds before bait level shifts them toward rarer tiers.
// hookWindowMs: how long the hookset flash stays clickable.
// zoneWidth: width (0-100 scale) of the forgiving reel-in zone.
// fishSpeed: how far the fish wanders between runs during reel-in.
// runChance: the chance per tick that it bolts (see utils/reelPhysics.js) — a common fish
//   mostly sulks, a legendary one is never still.
// runPower: how hard a run hits, as a multiple of the base burst.
// drainRate: how fast line tension climbs while the fish is out of the zone.
// points: [min, max] tackle points awarded on a landed catch.
// The charter grounds hold nothing but epic/legendary species (see utils/gameBiomes.js), so a
// charter guarantees one of these two on every attempt — hookWindowMs floors were raised for
// both so paying for a trip doesn't mean facing a near-unreactable hookset window (the button
// only appears on the bite, there's no chance to pre-position a click) on every single cast.
// A couple of epics also lurk in free water (the alligator gar, the cobia) as the long shot
// that keeps those grounds worth a cast late in the game.
const RARITY_DIFFICULTY = {
  // `fightMs` is how long the fish has to work the hook loose: a bigger fish is a longer
  // fight, and the fight is balanced so an average thumb can bank the progress in that time.
  common: { spawnWeight: 46, hookWindowMs: 850, zoneWidth: 42, fishSpeed: 1.0, runChance: 0.03, runPower: 0.8, drainRate: 0.5, fightMs: 12000, points: [4, 8] },
  uncommon: { spawnWeight: 28, hookWindowMs: 700, zoneWidth: 34, fishSpeed: 1.3, runChance: 0.05, runPower: 1.0, drainRate: 0.65, fightMs: 14000, points: [10, 18] },
  rare: { spawnWeight: 16, hookWindowMs: 580, zoneWidth: 27, fishSpeed: 1.6, runChance: 0.07, runPower: 1.15, drainRate: 0.8, fightMs: 18000, points: [24, 40] },
  epic: { spawnWeight: 8, hookWindowMs: 500, zoneWidth: 22, fishSpeed: 2.0, runChance: 0.09, runPower: 1.3, drainRate: 0.9, fightMs: 22000, points: [55, 90] },
  legendary: { spawnWeight: 2, hookWindowMs: 420, zoneWidth: 18, fishSpeed: 2.5, runChance: 0.1, runPower: 1.4, drainRate: 1.0, fightMs: 24000, points: [120, 200] },
  // Dead weight: it never runs and the zone is wide. It is not in the spawn roll (spawnWeight
  // 0) — rollJunk decides a stick before the species roll is made.
  junk: { spawnWeight: 0, hookWindowMs: 1200, zoneWidth: 64, fishSpeed: 0.3, runChance: 0, runPower: 0, drainRate: 0.2, fightMs: 12000, points: [0, 0] },
};

const SPECIES_LABELS = {
  bluegill: 'Bluegill', yellowperch: 'Yellow perch', trout: 'Trout', largemouth: 'Largemouth bass',
  smallmouth: 'Smallmouth bass', carp: 'Carp', catfish: 'Catfish', chainpickerel: 'Chain pickerel',
  pike: 'Northern pike', walleye: 'Walleye', flounder: 'Flounder', brooktrout: 'Brook trout',
  browntrout: 'Brown trout', weakfish: 'Weakfish', blackseabass: 'Black sea bass',
  stripedbass: 'Striped bass', bluefish: 'Bluefish', laketrout: 'Lake trout', rainbowtrout: 'Rainbow trout',
  tautog: 'Tautog', snakehead: 'Northern snakehead', salmon: 'Atlantic salmon', mahimahi: 'Mahi mahi',
  tuna: 'Tuna', shark: 'Shark', swordfish: 'Swordfish',
  muskie: 'Muskellunge', americanshad: 'American shad', arcticchar: 'Arctic char', crappie: 'Crappie', bowfin: 'Bowfin',
  longnosegar: 'Longnose gar', alligatorgar: 'Alligator gar', porgy: 'Porgy', blackdrum: 'Black drum', cobia: 'Cobia',
  wahoo: 'Wahoo', bluemarlin: 'Blue marlin',
  bonefish: 'Bonefish', permit: 'Permit', tarpon: 'Tarpon', snook: 'Snook', redfish: 'Redfish', barracuda: 'Barracuda',
  jackcrevalle: 'Jack crevalle', mangrovesnapper: 'Mangrove snapper',
  whiteperch: 'White perch', fallfish: 'Fallfish', rockbass: 'Rock bass', channelcatfish: 'Channel catfish',
  landlockedsalmon: 'Landlocked salmon', splake: 'Splake', tigertrout: 'Tiger trout',
  pumpkinseed: 'Pumpkinseed', warmouth: 'Warmouth', whitecatfish: 'White catfish', floridabass: 'Florida bass',
  winterflounder: 'Winter flounder', northernkingfish: 'Northern kingfish', searobin: 'Sea robin', oystertoadfish: 'Oyster toadfish', americaneel: 'American eel',
  spanishmackerel: 'Spanish mackerel', bonito: 'Bonito', littletunny: 'False albacore', pompano: 'Pompano', sandbarshark: 'Sandbar shark', kingmackerel: 'King mackerel',
  yellowfintuna: 'Yellowfin tuna', bluefintuna: 'Bluefin tuna', bigeyetuna: 'Bigeye tuna', threshershark: 'Thresher shark', makoshark: 'Mako shark', tilefish: 'Golden tilefish',
  whitemarlin: 'White marlin', sailfish: 'Sailfish', opah: 'Opah',
  spottedseatrout: 'Spotted seatrout', ladyfish: 'Ladyfish', lemonshark: 'Lemon shark',
  roosterfish: 'Roosterfish', yellowtail: 'Yellowtail', calicobass: 'Calico bass', californiahalibut: 'California halibut',
  lingcod: 'Lingcod', cabezon: 'Cabezon', giantseabass: 'Giant sea bass', stripedmarlin: 'Striped marlin', corvina: 'Corvina', sierra: 'Sierra mackerel',
  stick: 'A stick',
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
  // The second wave: more to find on every ground, and the flats down south.
  americanshad: 'common', crappie: 'common', porgy: 'common', jackcrevalle: 'common', mangrovesnapper: 'common',
  bowfin: 'uncommon', snook: 'uncommon', redfish: 'uncommon',
  muskie: 'rare', arcticchar: 'rare', longnosegar: 'rare', blackdrum: 'rare', bonefish: 'rare', barracuda: 'rare',
  alligatorgar: 'epic', cobia: 'epic', wahoo: 'epic', permit: 'epic',
  bluemarlin: 'legendary', tarpon: 'legendary',
  // The third wave: the small fish every ground really has, the pier and the creek, the
  // deep-water charter box, and the seasons.
  whiteperch: 'common', fallfish: 'common', rockbass: 'common', pumpkinseed: 'common', warmouth: 'common',
  winterflounder: 'common', northernkingfish: 'common', searobin: 'common', ladyfish: 'common',
  channelcatfish: 'uncommon', splake: 'uncommon', whitecatfish: 'uncommon', oystertoadfish: 'uncommon', americaneel: 'uncommon',
  spanishmackerel: 'uncommon', pompano: 'uncommon', spottedseatrout: 'uncommon',
  landlockedsalmon: 'rare', tigertrout: 'rare', bonito: 'rare', littletunny: 'rare', kingmackerel: 'rare',
  floridabass: 'epic', sandbarshark: 'epic', yellowfintuna: 'epic', bigeyetuna: 'epic', threshershark: 'epic', tilefish: 'epic',
  whitemarlin: 'epic', sailfish: 'epic', opah: 'epic', lemonshark: 'epic',
  bluefintuna: 'legendary', makoshark: 'legendary',
  // Baja, the Pacific trip.
  calicobass: 'common', corvina: 'common', sierra: 'uncommon', lingcod: 'uncommon', cabezon: 'uncommon',
  yellowtail: 'rare', californiahalibut: 'rare', roosterfish: 'epic', stripedmarlin: 'legendary', giantseabass: 'legendary',
  stick: 'junk',
};

// Fish that are only in for part of the year (see seasonFor in utils/gameClock.js): the shad
// run in spring, the warm-water fish show up in summer and leave in the fall, the winter
// flounder and tautog come in when the water cools. Anything not listed is in all year. Out
// of season a fish rolls nowhere and the derby never asks for it; the almanac says when it's
// back.
export const SEASONS = {
  americanshad: ['spring'],
  winterflounder: ['winter', 'spring'],
  tautog: ['fall', 'winter', 'spring'],
  landlockedsalmon: ['spring', 'fall'],
  spanishmackerel: ['summer', 'fall'],
  bonito: ['summer', 'fall'],
  littletunny: ['fall'],
  pompano: ['summer'],
  sandbarshark: ['summer'],
  kingmackerel: ['summer', 'fall'],
  cobia: ['summer', 'fall'],
  mahimahi: ['summer', 'fall'],
  bluefintuna: ['summer', 'fall'],
  whitemarlin: ['summer', 'fall'],
  sailfish: ['summer', 'fall'],
};

export function inSeason(species, season) {
  const seasons = SEASONS[species];
  return !seasons || !season || seasons.includes(season);
}

// Fish that feed after dark. At night the roll leans hard toward these within whatever tier
// it lands on; at dawn and dusk a little; in full daylight it leans away from them. Which
// tier you roll is still bait and rarity's business (see rollSpecies) — night changes what's
// moving, not how hard it fights.
export const NOCTURNAL = ['catfish', 'walleye', 'snakehead', 'stripedbass', 'weakfish', 'shark', 'swordfish', 'bowfin', 'blackdrum', 'snook', 'tarpon', 'channelcatfish', 'whitecatfish', 'oystertoadfish', 'americaneel', 'sandbarshark', 'makoshark'];

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

// How much of a legendary's weight a dry spell adds back: `pity` is how many bites in a row
// have not been a legendary (the page keeps it per visit), each one worth PITY_STEP up to
// PITY_CAP — after forty dry bites the legendary weight has trebled, and it resets on the
// next one landed or lost. It nudges the long tail, it does not hand one out.
export const PITY_STEP = 0.1;
export const PITY_CAP = 4;

export function rollSpecies(baitLevel, biomeSpecies, { period = 'day', season = null, random = Math.random, favor = [], pity = 0 } = {}) {
  const speciesByRarity = {};
  // Out-of-season fish are simply not there — unless that would leave the ground empty.
  const inWater = biomeSpecies.filter((species) => inSeason(species, season));
  (inWater.length ? inWater : biomeSpecies).forEach((species) => {
    const rarity = rarityOf(species);
    (speciesByRarity[rarity] || (speciesByRarity[rarity] = [])).push(species);
  });
  const tiers = RARITY_ORDER.filter((tier) => speciesByRarity[tier]);
  // Each bait level takes weight off the two low tiers (mostly the common) and hands it to the upper ones in
  // proportion to their own weight, so better bait is mostly more rares and epics and a
  // legendary goes from one bite in fifty to one in twenty-five at level 5. It used to hand
  // the upper three tiers the same share each, which made a legendary one bite in six at
  // level 5 — and the almanac a day's work.
  const shift = Math.max(0, baitLevel - 1) * 6;
  const upperTotal = tiers.filter((tier) => tier !== 'common' && tier !== 'uncommon').reduce((sum, tier) => sum + RARITY_DIFFICULTY[tier].spawnWeight, 0) || 1;
  const weights = tiers.map((tier) => {
    const base = RARITY_DIFFICULTY[tier].spawnWeight;
    const isLowTier = tier === 'common' || tier === 'uncommon';
    const shifted = isLowTier ? base - shift * (tier === 'common' ? 0.7 : 0.3) : base + (shift * base) / upperTotal;
    return Math.max(1, shifted + (tier === 'legendary' ? Math.min(PITY_CAP, Math.max(0, pity) * PITY_STEP) : 0));
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
  muskie: [28, 54], americanshad: [12, 24], arcticchar: [12, 30], crappie: [7, 17], bowfin: [14, 32], longnosegar: [24, 60],
  alligatorgar: [48, 96], porgy: [8, 18], blackdrum: [16, 50], cobia: [30, 66], wahoo: [36, 80], bluemarlin: [90, 170],
  bonefish: [16, 32], permit: [16, 40], tarpon: [40, 90], snook: [16, 44], redfish: [16, 48], barracuda: [20, 60],
  jackcrevalle: [12, 36], mangrovesnapper: [8, 20],
  whiteperch: [7, 16], fallfish: [8, 20], rockbass: [6, 13], channelcatfish: [14, 40],
  landlockedsalmon: [16, 30], splake: [12, 28], tigertrout: [12, 26],
  pumpkinseed: [4, 10], warmouth: [5, 12], whitecatfish: [12, 26], floridabass: [18, 30],
  winterflounder: [10, 22], northernkingfish: [9, 18], searobin: [10, 18], oystertoadfish: [8, 16], americaneel: [16, 48],
  spanishmackerel: [14, 30], bonito: [16, 32], littletunny: [18, 36], pompano: [10, 24], sandbarshark: [40, 90], kingmackerel: [24, 60],
  yellowfintuna: [30, 80], bluefintuna: [60, 130], bigeyetuna: [36, 84], threshershark: [70, 200], makoshark: [60, 140], tilefish: [20, 44],
  whitemarlin: [60, 110], sailfish: [70, 130], opah: [30, 60],
  spottedseatrout: [14, 32], ladyfish: [14, 32], lemonshark: [60, 120],
  roosterfish: [24, 60], yellowtail: [20, 48], calicobass: [10, 24], californiahalibut: [22, 50], lingcod: [20, 48], cabezon: [12, 30],
  giantseabass: [48, 90], stripedmarlin: [80, 140], corvina: [12, 28], sierra: [14, 30],
  stick: [8, 30],
};

export function rollSize(species, random = Math.random) {
  const [min, max] = SPECIES_SIZE[species] || [6, 18];
  return Math.round((min + (max - min) * random() ** 1.6) * 10) / 10;
}

export function sizeLabel(sizeIn) { return `${Number(sizeIn).toFixed(1)} in`; }

// Where a catch sits in its species' range, 0 (the smallest of its kind) to 1 (the biggest):
// the stage draws a landed fish at that size, so a 9-inch bluegill and a 60-inch tarpon each
// read as what they are. Unknown or missing sizes sit in the middle.
// Where a length sits among every fish in the game, 0 (a 5-inch panfish) to 1 (a marlin),
// on a log scale so the small end still spreads out: the shadow on the line is drawn at
// this, so a bluegill is a smudge and a marlin fills the water. Missing sizes read middling.
export const LENGTH_RANGE = [4, 200];
export function lengthFraction(sizeIn) {
  const size = Number(sizeIn);
  if (!Number.isFinite(size) || size <= 0) return 0.4;
  const [min, max] = LENGTH_RANGE;
  return Math.max(0, Math.min(1, Math.log(size / min) / Math.log(max / min)));
}

export function sizeFraction(species, sizeIn) {
  const [min, max] = SPECIES_SIZE[species] || [6, 18];
  const size = Number(sizeIn);
  if (!Number.isFinite(size) || max <= min) return 0.5;
  return Math.max(0, Math.min(1, (size - min) / (max - min)));
}

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
