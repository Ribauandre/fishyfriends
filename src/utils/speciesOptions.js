// Canonical species list shared by every "what did you catch" form on the site, so a
// catch logged on one page matches the same name (and fish icon) everywhere else. Every
// icon here is either its own dedicated render or an intentional shared fallback (Steelhead/
// Shark/Snook/Coho Salmon reuse a close relative's dedicated art) — never a crop pulled out
// of a shared multi-fish reference sheet.
export const SPECIES_OPTIONS = [
  { label: 'Largemouth Bass', icon: 'largemouth' },
  { label: 'Smallmouth Bass', icon: 'smallmouth' },
  { label: 'Striped Bass', icon: 'stripedbass' },
  { label: 'Bluegill', icon: 'bluegill' },
  { label: 'Northern Pike', icon: 'pike' },
  { label: 'Northern Snakehead', icon: 'snakehead' },
  { label: 'Catfish', icon: 'catfish' },
  { label: 'Carp', icon: 'carp' },
  { label: 'Brown Trout', icon: 'browntrout' },
  { label: 'Rainbow Trout', icon: 'rainbowtrout' },
  { label: 'Brook Trout', icon: 'brooktrout' },
  { label: 'Lake Trout', icon: 'laketrout' },
  { label: 'Steelhead', icon: 'trout' },
  { label: 'Atlantic Salmon', icon: 'salmon' },
  { label: 'Coho Salmon', icon: 'salmon' },
  { label: 'Tuna', icon: 'tuna' },
  { label: 'Bluefish', icon: 'bluefish' },
  { label: 'Mahi Mahi', icon: 'mahimahi' },
  { label: 'Shark', icon: 'shark' },
  { label: 'Fluke / Flounder', icon: 'flounder' },
  { label: 'Tautog', icon: 'tautog' },
  { label: 'Black Sea Bass', icon: 'blackseabass' },
  { label: 'Snook', icon: 'largemouth' },
];

const BY_LABEL = new Map(SPECIES_OPTIONS.map((option) => [option.label.toLowerCase(), option.icon]));

// Fuzzy fallback for a species string that isn't an exact canonical label (e.g. a custom
// species someone typed in). Ordered most-specific first so e.g. "brown trout" matches
// "browntrout" rather than the more generic "trout".
const ICON_ALIASES = [
  ['largemouth', 'largemouth'],
  ['smallmouth', 'smallmouth'],
  ['striped bass', 'stripedbass'],
  ['stripedbass', 'stripedbass'],
  ['bluegill', 'bluegill'],
  ['snakehead', 'snakehead'],
  ['catfish', 'catfish'],
  ['carp', 'carp'],
  ['brown trout', 'browntrout'],
  ['browntrout', 'browntrout'],
  ['rainbow trout', 'rainbowtrout'],
  ['rainbowtrout', 'rainbowtrout'],
  ['lake trout', 'laketrout'],
  ['laketrout', 'laketrout'],
  ['brook trout', 'brooktrout'],
  ['brooktrout', 'brooktrout'],
  ['steelhead', 'trout'],
  ['trout', 'trout'],
  ['salmon', 'salmon'],
  ['bluefish', 'bluefish'],
  ['mahi', 'mahimahi'],
  ['shark', 'shark'],
  ['flounder', 'flounder'],
  ['fluke', 'flounder'],
  ['tautog', 'tautog'],
  ['blackfish', 'tautog'],
  ['black sea bass', 'blackseabass'],
  ['blackseabass', 'blackseabass'],
  ['sea bass', 'blackseabass'],
  ['snook', 'largemouth'],
  ['pike', 'pike'],
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
