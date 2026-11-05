import { SPECIES_OPTIONS } from './speciesOptions';

// One fish, one name. The species box takes free text, so the same fish used to be saved as
// "Striper", "striped bass" and "Stripped Bass" and show up as three species on the board,
// the checklist and personal bests. Every writer saves canonicalSpecies(name) instead, and
// migration 0039 merged what was already logged with the same rules (its alias table is
// checked against SPECIES_ALIASES by speciesNames.test.js, so the two can't drift).

// Common names for a canonical species, written as speciesKey() leaves them. Only names that
// mean that one fish: "perch", "trout", "bass" or "rockfish" could be several, so they stay
// as typed.
export const SPECIES_ALIASES = {
  striper: 'Striped Bass',
  'strip bass': 'Striped Bass',
  linesider: 'Striped Bass',
  largemouth: 'Largemouth Bass',
  'large mouth bass': 'Largemouth Bass',
  'large mouth': 'Largemouth Bass',
  lmb: 'Largemouth Bass',
  bucketmouth: 'Largemouth Bass',
  smallmouth: 'Smallmouth Bass',
  'small mouth bass': 'Smallmouth Bass',
  'small mouth': 'Smallmouth Bass',
  smallie: 'Smallmouth Bass',
  smb: 'Smallmouth Bass',
  bronzeback: 'Smallmouth Bass',
  weakie: 'Weakfish',
  squeteague: 'Weakfish',
  'blue gill': 'Bluegill',
  pike: 'Northern Pike',
  pickerel: 'Chain Pickerel',
  snakehead: 'Northern Snakehead',
  'common carp': 'Carp',
  brookie: 'Brook Trout',
  laker: 'Lake Trout',
  steelie: 'Steelhead',
  'steelhead trout': 'Steelhead',
  coho: 'Coho Salmon',
  'silver salmon': 'Coho Salmon',
  'blue fish': 'Bluefish',
  blue: 'Bluefish',
  mahi: 'Mahi Mahi',
  mahimahi: 'Mahi Mahi',
  dorado: 'Mahi Mahi',
  dolphinfish: 'Mahi Mahi',
  'dolphin fish': 'Mahi Mahi',
  broadbill: 'Swordfish',
  'sword fish': 'Swordfish',
  fluke: 'Fluke / Flounder',
  flounder: 'Fluke / Flounder',
  'summer flounder': 'Fluke / Flounder',
  tog: 'Tautog',
  blackfish: 'Tautog',
  'sea bass': 'Black Sea Bass',
  seabass: 'Black Sea Bass',
  'black seabass': 'Black Sea Bass',
  bsb: 'Black Sea Bass',
};

// Lower case, "&" as "and", anything but letters and digits a space, single spaces, and each
// word's plural "s" dropped ("Stripers" is "striper"; "bass" keeps its double s).
export function speciesKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
    .join(' ');
}

export function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

// How far off a typo can be and still mean a canonical name: nothing for short names, one
// letter from five, two from nine.
export function typoAllowance(key) {
  if (key.length >= 9) return 2;
  if (key.length >= 5) return 1;
  return 0;
}

const TARGETS = [
  ...SPECIES_OPTIONS.map((option) => [speciesKey(option.label), option.label]),
  ...Object.entries(SPECIES_ALIASES).map(([key, label]) => [key, label]),
];
const EXACT = new Map(TARGETS);

// The canonical name for what someone typed: a listed species if it is one (by name, by a
// common name, or by a small typo that is closest to exactly one of them), else the spelling
// already in use for that name (`known`, e.g. the custom species list), else the text tidied.
export function canonicalSpecies(name, known = []) {
  const cleaned = String(name ?? '').trim().replace(/\s+/g, ' ');
  const key = speciesKey(cleaned);
  if (!key) return cleaned;
  if (EXACT.has(key)) return EXACT.get(key);

  const allowance = typoAllowance(key);
  if (allowance > 0) {
    let best = Infinity;
    let labels = new Set();
    for (const [target, label] of TARGETS) {
      const distance = levenshtein(key, target);
      if (distance > allowance) continue;
      if (distance < best) { best = distance; labels = new Set([label]); } else if (distance === best) labels.add(label);
    }
    if (labels.size === 1) return [...labels][0];
  }

  const existing = (known || []).find((candidate) => speciesKey(candidate) === key);
  return existing || cleaned;
}
