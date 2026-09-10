// Where an angler can fish in Cast & Catch — the six grounds on the map plus the charter.
// `flyWater` marks the trout water where the fly rod comes out (see utils/gameLures.js).
// Each species lives in one or more biomes (a few, like flounder, show up in more than one —
// a fish doesn't care about our biome boundaries any more than a real one does) rather than
// each species belonging to exactly one place. Species rarity itself lives in
// utils/gameSpecies.js and never changes with location; biomes only decide which roster
// you're rolling from. Every biome is free except Offshore, which holds the epic/legendary
// species exclusively and costs tackle points to charter the boat — the same currency the
// tackle shop spends on gear, just spent on the trip instead. Switching to another biome ends
// the trip, so heading back offshore later means chartering again.
export const OFFSHORE_CHARTER_COST = 50;
export const CANYON_CHARTER_COST = 80;

export const BIOMES = {
  river: {
    key: 'river',
    label: 'River',
    blurb: 'Moving water — current-loving fish, and the odd invasive surprise.',
    charterCost: 0,
    flyWater: true,
    species: ['smallmouth', 'pike', 'walleye', 'yellowperch', 'catfish', 'carp', 'chainpickerel', 'browntrout', 'rainbowtrout', 'trout', 'snakehead'],
  },
  mountainlake: {
    key: 'mountainlake',
    label: 'Mountain Lake',
    blurb: 'Cold, clear, high up — trout country.',
    charterCost: 0,
    flyWater: true,
    species: ['brooktrout', 'rainbowtrout', 'browntrout', 'laketrout', 'trout'],
  },
  swamp: {
    key: 'swamp',
    label: 'Swamp',
    blurb: 'Warm, weedy and slow — bass, panfish, and worse.',
    charterCost: 0,
    species: ['largemouth', 'bluegill', 'catfish', 'carp', 'chainpickerel', 'snakehead'],
  },
  bay: {
    key: 'bay',
    label: 'Bay',
    blurb: 'Brackish water where the rivers meet the sea.',
    charterCost: 0,
    species: ['flounder', 'weakfish', 'blackseabass', 'tautog', 'salmon', 'stripedbass'],
  },
  shoreline: {
    key: 'shoreline',
    label: 'Beach',
    blurb: 'Surf casting along the open coast.',
    charterCost: 0,
    species: ['flounder', 'stripedbass', 'bluefish'],
  },
  offshore: {
    key: 'offshore',
    label: 'Offshore',
    blurb: "Open water and the big stuff — you'll need to charter the boat to get out here.",
    charterCost: OFFSHORE_CHARTER_COST,
    species: ['mahimahi', 'tuna', 'shark'],
  },
  // The seventh ground. Cap'n Ray only runs out past the shelf for anglers who've proven
  // themselves on the bay (see utils/gameQuests.js) — until then it's a rumor on the map.
  canyon: {
    key: 'canyon',
    label: 'The Canyon',
    blurb: "Ray's secret: the drop-off past the shelf, run at dusk. Swordfish live here and nowhere else.",
    charterCost: CANYON_CHARTER_COST,
    requiresQuest: 'rays_proving',
    species: ['tuna', 'mahimahi', 'shark', 'swordfish'],
  },
};

export function biomeUnlocked(biome, quests) {
  const required = BIOMES[biome]?.requiresQuest;
  return !required || Boolean(quests?.[required]?.done);
}

export const BIOME_LIST = Object.values(BIOMES);
