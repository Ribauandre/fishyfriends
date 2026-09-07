import speciesIcon, { SPECIES_OPTIONS } from './speciesOptions';

describe('SPECIES_OPTIONS', () => {
  test('every option has a non-empty label and a recognized icon key', () => {
    const validIcons = new Set(['pike', 'largemouth', 'smallmouth', 'stripedbass', 'bluegill', 'flounder', 'salmon', 'shark', 'trout', 'laketrout', 'perch', 'tuna', 'bluefish', 'snakehead']);
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
    expect(speciesIcon('Brown Trout')).toBe('trout');
  });

  test('matches canonical labels case-insensitively', () => {
    expect(speciesIcon('striped bass')).toBe('stripedbass');
    expect(speciesIcon('STRIPED BASS')).toBe('stripedbass');
    expect(speciesIcon('Striped Bass')).toBe('stripedbass');
  });

  test('falls back to a fuzzy substring match for an unlisted species containing a known icon word', () => {
    expect(speciesIcon('Giant Tuna')).toBe('tuna');
    expect(speciesIcon('Some Random Shark')).toBe('shark');
    expect(speciesIcon('Trophy Largemouth')).toBe('largemouth');
    expect(speciesIcon('Sea Bass')).toBe('largemouth');
    expect(speciesIcon('Giant Snakehead')).toBe('snakehead');
    expect(speciesIcon('Trophy Lake Trout')).toBe('laketrout');
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
