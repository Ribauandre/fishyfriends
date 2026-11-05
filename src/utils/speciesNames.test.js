import fs from 'fs';
import path from 'path';
import { SPECIES_OPTIONS } from './speciesOptions';
import { SPECIES_ALIASES, canonicalSpecies, levenshtein, speciesKey } from './speciesNames';

test('a name is keyed without case, punctuation, extra spaces or plurals', () => {
  expect(speciesKey('  STRIPERS!! ')).toBe('striper');
  expect(speciesKey('Fluke / Flounder')).toBe('fluke flounder');
  expect(speciesKey('Black Sea Bass')).toBe('black sea bass');
  expect(speciesKey('Mahi-Mahi')).toBe('mahi mahi');
  expect(speciesKey('Bluegills')).toBe('bluegill');
});

test('levenshtein', () => {
  expect(levenshtein('striper', 'stripper')).toBe(1);
  expect(levenshtein('walleye', 'walley')).toBe(1);
  expect(levenshtein('', 'abc')).toBe(3);
});

describe('canonicalSpecies', () => {
  test.each([
    ['striper', 'Striped Bass'],
    ['Stripers', 'Striped Bass'],
    ['striped bass', 'Striped Bass'],
    ['Stripped Bass', 'Striped Bass'],
    ['STRIPED  BASS', 'Striped Bass'],
    ['smallies', 'Smallmouth Bass'],
    ['Large Mouth Bass', 'Largemouth Bass'],
    ['Walley', 'Walleye'],
    ['tog', 'Tautog'],
    ['Blackfish', 'Tautog'],
    ['dorado', 'Mahi Mahi'],
    ['mahi-mahi', 'Mahi Mahi'],
    ['fluke', 'Fluke / Flounder'],
    ['Summer Flounder', 'Fluke / Flounder'],
    ['sea bass', 'Black Sea Bass'],
    ['blues', 'Bluefish'],
    ['Brok Trout', 'Brook Trout'],
  ])('%p is %p', (typed, canonical) => {
    expect(canonicalSpecies(typed)).toBe(canonical);
  });

  test('a name that could be several fish, or is too short to guess at, stays as typed', () => {
    expect(canonicalSpecies('perch')).toBe('perch');
    expect(canonicalSpecies('Trout')).toBe('Trout');
    expect(canonicalSpecies('bass')).toBe('bass');
    expect(canonicalSpecies('Cod')).toBe('Cod');
  });

  test('a different species close to a listed one is not swallowed by it', () => {
    expect(canonicalSpecies('Winter Flounder')).toBe('Winter Flounder');
    expect(canonicalSpecies('White Perch')).toBe('White Perch');
    expect(canonicalSpecies('Mako Shark')).toBe('Mako Shark');
    expect(canonicalSpecies('Brown Trout')).toBe('Brown Trout');
  });

  test('a species not on the list takes the spelling already in use', () => {
    expect(canonicalSpecies('black  crappie', ['Black Crappie'])).toBe('Black Crappie');
    expect(canonicalSpecies('Black Crappies', ['Black Crappie'])).toBe('Black Crappie');
    expect(canonicalSpecies('  Sheepshead ')).toBe('Sheepshead');
    expect(canonicalSpecies('')).toBe('');
  });

  test('every common name points at a listed species', () => {
    const labels = new Set(SPECIES_OPTIONS.map((option) => option.label));
    Object.entries(SPECIES_ALIASES).forEach(([key, label]) => {
      expect(labels.has(label)).toBe(true);
      expect(speciesKey(key)).toBe(key);
    });
  });
});

test('migration 0039 merged with the same labels and common names the app saves with', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/0039_merge_species_spellings.sql'), 'utf8');
  const labelBlock = sql.slice(sql.indexOf('insert into sp_labels'), sql.indexOf('create temporary table sp_aliases'));
  const aliasBlock = sql.slice(sql.indexOf('insert into sp_aliases'), sql.indexOf('create temporary table sp_targets'));
  const labels = [...labelBlock.matchAll(/\('((?:[^']|'')+)'\)/g)].map((match) => match[1].replace(/''/g, "'"));
  const aliases = Object.fromEntries([...aliasBlock.matchAll(/\('((?:[^']|'')+)', '((?:[^']|'')+)'\)/g)].map((match) => [match[1], match[2]]));
  expect(labels).toEqual(SPECIES_OPTIONS.map((option) => option.label));
  expect(aliases).toEqual(SPECIES_ALIASES);
});
