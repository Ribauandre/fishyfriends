// Where an angler can fish in Cast & Catch. Each species lives in one or more biomes (a few,
// like flounder, show up in more than one — a fish doesn't care about our biome boundaries any
// more than a real one does) rather than each species belonging to exactly one place. Species
// rarity itself lives in utils/gameSpecies.js and never changes with location; biomes only
// decide which roster you're rolling from. Every biome is free except Offshore, which holds the
// epic/legendary species exclusively and costs tackle points to charter a boat — the same
// currency the tackle shop spends on gear, just spent on the trip instead. Switching to another
// biome ends the trip, so heading back offshore later means chartering again.
export const OFFSHORE_CHARTER_COST = 50;

export const BIOMES = {
  lake: {
    key: 'lake',
    label: 'Lake',
    blurb: 'Open freshwater — a little bit of everything.',
    charterCost: 0,
    species: ['largemouth', 'smallmouth', 'walleye', 'pike', 'yellowperch', 'bluegill', 'catfish', 'carp', 'chainpickerel', 'laketrout'],
  },
  river: {
    key: 'river',
    label: 'River',
    blurb: 'Moving water — current-loving fish, and the odd invasive surprise.',
    charterCost: 0,
    species: ['smallmouth', 'pike', 'walleye', 'catfish', 'carp', 'chainpickerel', 'browntrout', 'rainbowtrout', 'trout', 'snakehead'],
  },
  mountainlake: {
    key: 'mountainlake',
    label: 'Mountain Lake',
    blurb: 'Cold, clear, high up — trout country.',
    charterCost: 0,
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
    label: 'Shoreline',
    blurb: 'Surf and rock casting along the open coast.',
    charterCost: 0,
    species: ['flounder', 'stripedbass', 'bluefish'],
  },
  offshore: {
    key: 'offshore',
    label: 'Offshore',
    blurb: "Open water and the big stuff — you'll need to charter a boat to get out here.",
    charterCost: OFFSHORE_CHARTER_COST,
    species: ['mahimahi', 'tuna', 'shark'],
  },
};

export const BIOME_LIST = Object.values(BIOMES);
