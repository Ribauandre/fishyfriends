// Where an angler can fish in Cast & Catch. Freshwater and inshore water are free and hold
// only common-through-rare species; the epic and legendary species live offshore exclusively,
// and reaching them costs tackle points to charter a boat — the same currency the tackle shop
// spends on gear, just spent on the trip instead. Switching to another biome ends the trip, so
// heading back offshore later means chartering again.
export const OFFSHORE_CHARTER_COST = 50;

export const BIOMES = {
  freshwater: {
    key: 'freshwater',
    label: 'Freshwater',
    blurb: 'Ponds, lakes and rivers — free to fish.',
    charterCost: 0,
    speciesByRarity: {
      common: ['bluegill', 'yellowperch', 'trout', 'largemouth', 'smallmouth', 'carp', 'catfish', 'chainpickerel'],
      uncommon: ['pike', 'walleye', 'brooktrout', 'browntrout', 'rainbowtrout'],
      rare: ['laketrout', 'snakehead'],
    },
  },
  inshore: {
    key: 'inshore',
    label: 'Inshore',
    blurb: 'Bays, piers and the surf — free to fish.',
    charterCost: 0,
    speciesByRarity: {
      common: ['flounder', 'weakfish'],
      uncommon: ['blackseabass', 'tautog', 'bluefish'],
      rare: ['stripedbass', 'salmon'],
    },
  },
  offshore: {
    key: 'offshore',
    label: 'Offshore',
    blurb: "Open water and the big stuff — you'll need to charter a boat to get out here.",
    charterCost: OFFSHORE_CHARTER_COST,
    speciesByRarity: {
      epic: ['mahimahi', 'tuna'],
      legendary: ['shark'],
    },
  },
};

export const BIOME_LIST = Object.values(BIOMES);
