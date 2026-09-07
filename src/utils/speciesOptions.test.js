import speciesIcon, { SPECIES_OPTIONS } from './speciesOptions';

describe('SPECIES_OPTIONS', () => {
  test('every option has a non-empty label and a recognized icon key', () => {
    const validIcons = new Set([
      'pike', 'largemouth', 'smallmouth', 'stripedbass', 'bluegill', 'crappie', 'musky',
      'snakehead', 'chainpickerel', 'walleye', 'perch', 'whiteperch', 'catfish', 'carp',
      'browntrout', 'rainbowtrout', 'brooktrout', 'laketrout', 'trout', 'salmon',
      'falsealbacore', 'bluefish', 'mahimahi', 'mackerel', 'shark', 'flounder', 'tautog',
      'weakfish', 'speckledtrout', 'cobia', 'redfish',
    ]);
    for (const option of SPECIES_OPTIONS) {
      expect(option.label.trim()).toBe(option.label);
      expect(option.label.length).toBeGreaterThan(0);
      expect(validIcons.has(option.icon)).toBe(true);
    }
  });

  test('labels are unique (no duplicate species options)', () => {
    const labels = SPECIES_OPTIONS.map((option) => option.label.toLowerCase());
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('speciesIcon', () => {
  test('matches a canonical label exactly', () => {
    expect(speciesIcon('Northern Pike')).toBe('pike');
    expect(speciesIcon('Atlantic Salmon')).toBe('salmon');
    expect(speciesIcon('Largemouth Bass')).toBe('largemouth');
    expect(speciesIcon('Smallmouth Bass')).toBe('smallmouth');
    expect(speciesIcon('Striped Bass')).toBe('stripedbass');
    expect(speciesIcon('Bluegill')).toBe('bluegill');
    expect(speciesIcon('Fluke / Flounder')).toBe('flounder');
    expect(speciesIcon('Bluefish')).toBe('bluefish');
    expect(speciesIcon('Northern Snakehead')).toBe('snakehead');
    expect(speciesIcon('Lake Trout')).toBe('laketrout');
    expect(speciesIcon('Brown Trout')).toBe('browntrout');
    expect(speciesIcon('Rainbow Trout')).toBe('rainbowtrout');
    expect(speciesIcon('Brook Trout')).toBe('brooktrout');
    expect(speciesIcon('Steelhead')).toBe('trout');
    expect(speciesIcon('Crappie')).toBe('crappie');
    expect(speciesIcon('Muskie')).toBe('musky');
    expect(speciesIcon('Chain Pickerel')).toBe('chainpickerel');
    expect(speciesIcon('Walleye')).toBe('walleye');
    expect(speciesIcon('Yellow Perch')).toBe('perch');
    expect(speciesIcon('White Perch')).toBe('whiteperch');
    expect(speciesIcon('Catfish')).toBe('catfish');
    expect(speciesIcon('Carp')).toBe('carp');
    expect(speciesIcon('Tautog')).toBe('tautog');
    expect(speciesIcon('Weakfish')).toBe('weakfish');
    expect(speciesIcon('Speckled Trout')).toBe('speckledtrout');
    expect(speciesIcon('Cobia')).toBe('cobia');
    expect(speciesIcon('Redfish')).toBe('redfish');
    expect(speciesIcon('Mahi Mahi')).toBe('mahimahi');
    expect(speciesIcon('Atlantic Mackerel')).toBe('mackerel');
    expect(speciesIcon('False Albacore')).toBe('falsealbacore');
    expect(speciesIcon('Tuna')).toBe('falsealbacore');
    expect(speciesIcon('Snook')).toBe('largemouth');
  });

  test('matches canonical labels case-insensitively', () => {
    expect(speciesIcon('striped bass')).toBe('stripedbass');
    expect(speciesIcon('STRIPED BASS')).toBe('stripedbass');
    expect(speciesIcon('Striped Bass')).toBe('stripedbass');
  });

  test('falls back to a fuzzy substring match for an unlisted species containing a known icon word', () => {
    expect(speciesIcon('Giant Tuna')).toBe('falsealbacore');
    expect(speciesIcon('Some Random Shark')).toBe('shark');
    expect(speciesIcon('Trophy Largemouth')).toBe('largemouth');
    expect(speciesIcon('Sea Bass')).toBe('largemouth');
    expect(speciesIcon('Giant Snakehead')).toBe('snakehead');
    expect(speciesIcon('Trophy Lake Trout')).toBe('laketrout');
    expect(speciesIcon('Trophy Brown Trout')).toBe('browntrout');
    expect(speciesIcon('A Big White Perch')).toBe('whiteperch');
    expect(speciesIcon('Some Blackfish')).toBe('tautog');
    expect(speciesIcon('A Speckled beauty')).toBe('speckledtrout');
  });

  test('falls back to largemouth for a completely unrecognized species', () => {
    expect(speciesIcon('Mystery Fish')).toBe('largemouth');
  });

  test('handles empty, null, and undefined input without throwing', () => {
    expect(speciesIcon('')).toBe('largemouth');
    expect(speciesIcon(null)).toBe('largemouth');
    expect(speciesIcon(undefined)).toBe('largemouth');
  });
});
