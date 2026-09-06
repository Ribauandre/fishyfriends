// Canonical species list shared by every "what did you catch" form on the site, so a
// catch logged on one page matches the same name (and fish icon) everywhere else.
export const SPECIES_OPTIONS = [
  { label: 'Largemouth Bass', icon: 'bass' },
  { label: 'Smallmouth Bass', icon: 'bass' },
  { label: 'Striped Bass', icon: 'bass' },
  { label: 'Northern Pike', icon: 'pike' },
  { label: 'Muskie', icon: 'pike' },
  { label: 'Walleye', icon: 'perch' },
  { label: 'Yellow Perch', icon: 'perch' },
  { label: 'Brown Trout', icon: 'trout' },
  { label: 'Rainbow Trout', icon: 'trout' },
  { label: 'Brook Trout', icon: 'trout' },
  { label: 'Steelhead', icon: 'trout' },
  { label: 'Atlantic Salmon', icon: 'salmon' },
  { label: 'Coho Salmon', icon: 'salmon' },
  { label: 'Tuna', icon: 'tuna' },
  { label: 'Bluefish', icon: 'tuna' },
  { label: 'Mahi Mahi', icon: 'tuna' },
  { label: 'Shark', icon: 'shark' },
  { label: 'Fluke / Flounder', icon: 'bass' },
  { label: 'Snook', icon: 'bass' },
  { label: 'Redfish', icon: 'bass' },
  { label: 'Catfish', icon: 'perch' },
];

const BY_LABEL = new Map(SPECIES_OPTIONS.map((option) => [option.label.toLowerCase(), option.icon]));
const ICON_KEYS = ['pike', 'bass', 'salmon', 'shark', 'trout', 'perch', 'tuna'];

export default function speciesIcon(species) {
  const key = (species || '').toLowerCase();
  const exact = BY_LABEL.get(key);
  if (exact) return exact;
  return ICON_KEYS.find((icon) => key.includes(icon)) || 'bass';
}
