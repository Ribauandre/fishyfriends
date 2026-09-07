// Canonical species list shared by every "what did you catch" form on the site, so a
// catch logged on one page matches the same name (and fish icon) everywhere else.
export const SPECIES_OPTIONS = [
  { label: 'Largemouth Bass', icon: 'largemouth' },
  { label: 'Smallmouth Bass', icon: 'smallmouth' },
  { label: 'Striped Bass', icon: 'stripedbass' },
  { label: 'Bluegill', icon: 'bluegill' },
  { label: 'Northern Pike', icon: 'pike' },
  { label: 'Muskie', icon: 'pike' },
  { label: 'Northern Snakehead', icon: 'snakehead' },
  { label: 'Walleye', icon: 'perch' },
  { label: 'Yellow Perch', icon: 'perch' },
  { label: 'Brown Trout', icon: 'trout' },
  { label: 'Rainbow Trout', icon: 'trout' },
  { label: 'Brook Trout', icon: 'trout' },
  { label: 'Lake Trout', icon: 'laketrout' },
  { label: 'Steelhead', icon: 'trout' },
  { label: 'Atlantic Salmon', icon: 'salmon' },
  { label: 'Coho Salmon', icon: 'salmon' },
  { label: 'Tuna', icon: 'tuna' },
  { label: 'Bluefish', icon: 'bluefish' },
  { label: 'Mahi Mahi', icon: 'tuna' },
  { label: 'Shark', icon: 'shark' },
  { label: 'Fluke / Flounder', icon: 'flounder' },
  { label: 'Snook', icon: 'largemouth' },
  { label: 'Redfish', icon: 'largemouth' },
  { label: 'Catfish', icon: 'perch' },
];

const BY_LABEL = new Map(SPECIES_OPTIONS.map((option) => [option.label.toLowerCase(), option.icon]));

// Fuzzy fallback for a species string that isn't an exact canonical label (e.g. a custom
// species someone typed in). Ordered most-specific first so "largemouth bass" matches
// "largemouth" rather than the more generic "bass".
const ICON_ALIASES = [
  ['largemouth', 'largemouth'],
  ['smallmouth', 'smallmouth'],
  ['striped bass', 'stripedbass'],
  ['stripedbass', 'stripedbass'],
  ['bluegill', 'bluegill'],
  ['bluefish', 'bluefish'],
  ['flounder', 'flounder'],
  ['fluke', 'flounder'],
  ['snakehead', 'snakehead'],
  ['muskie', 'pike'],
  ['pike', 'pike'],
  ['salmon', 'salmon'],
  ['shark', 'shark'],
  ['lake trout', 'laketrout'],
  ['laketrout', 'laketrout'],
  ['steelhead', 'trout'],
  ['trout', 'trout'],
  ['walleye', 'perch'],
  ['perch', 'perch'],
  ['tuna', 'tuna'],
  ['bass', 'largemouth'],
];

export default function speciesIcon(species) {
  const key = (species || '').toLowerCase();
  const exact = BY_LABEL.get(key);
  if (exact) return exact;
  const alias = ICON_ALIASES.find(([keyword]) => key.includes(keyword));
  return alias ? alias[1] : 'largemouth';
}
