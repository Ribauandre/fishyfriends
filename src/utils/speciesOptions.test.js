import speciesIcon, { SPECIES_OPTIONS } from './speciesOptions';

describe('SPECIES_OPTIONS', () => {
  test('every option has a non-empty label and a recognized icon key', () => {
    const validIcons = new Set([
      'pike', 'largemouth', 'smallmouth', 'stripedbass', 'bluegill', 'snakehead', 'catfish',
      'carp', 'browntrout', 'rainbowtrout', 'brooktrout', 'laketrout', 'trout', 'salmon',
      'bluefish', 'mahimahi', 'shark', 'flounder', 'tautog', 'blackseabass', 'tuna',
      'walleye', 'yellowperch', 'weakfish', 'chainpickerel',
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
    expect(speciesIcon('Catfish')).toBe('catfish');
    expect(speciesIcon('Carp')).toBe('carp');
    expect(speciesIcon('Tautog')).toBe('tautog');
    expect(speciesIcon('Mahi Mahi')).toBe('mahimahi');
    expect(speciesIcon('Tuna')).toBe('tuna');
    expect(speciesIcon('Snook')).toBe('largemouth');
    expect(speciesIcon('Black Sea Bass')).toBe('blackseabass');
    expect(speciesIcon('Weakfish')).toBe('weakfish');
    expect(speciesIcon('Yellow Perch')).toBe('yellowperch');
    expect(speciesIcon('Chain Pickerel')).toBe('chainpickerel');
    expect(speciesIcon('Walleye')).toBe('walleye');
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
    expect(speciesIcon('Peacock Bass')).toBe('largemouth');
    // "Sea Bass" alone commonly means black sea bass in this app's NJ context, so it
    // resolves there rather than to the generic bass fallback.
    expect(speciesIcon('Sea Bass')).toBe('blackseabass');
    // Common angler nicknames for species that already have their own canonical entry —
    // "Fluke" for Fluke / Flounder, "Weak" for Weakfish, "Striper" for Striped Bass.
    expect(speciesIcon('Fluke')).toBe('flounder');
    expect(speciesIcon('Weak')).toBe('weakfish');
    expect(speciesIcon('Striper')).toBe('stripedbass');
    expect(speciesIcon('Giant Snakehead')).toBe('snakehead');
    expect(speciesIcon('Trophy Lake Trout')).toBe('laketrout');
    expect(speciesIcon('Trophy Brown Trout')).toBe('browntrout');
    expect(speciesIcon('Some Blackfish')).toBe('tautog');
    expect(speciesIcon('Trophy Walleye')).toBe('walleye');
    expect(speciesIcon('A Big Chain Pickerel')).toBe('chainpickerel');
    // A generic, non-canonical "pickerel" (e.g. grass or redfin pickerel) is close enough
    // to share the chain pickerel art, the same way "Sea Bass" shares black sea bass's.
    expect(speciesIcon('Redfin Pickerel')).toBe('chainpickerel');
    // Likewise a plain "White Perch" isn't its own canonical species, so it shares the
    // closest relative's art rather than falling all the way back to a bass icon.
    expect(speciesIcon('White Perch')).toBe('yellowperch');
  });

  test('falls back to largemouth for a completely unrecognized species', () => {
    expect(speciesIcon('Mystery Fish')).toBe('largemouth');
  });

  test('a species removed from the canonical list still resolves to a sensible icon instead of throwing', () => {
    // Regression guard: species that used to have their own SPECIES_OPTIONS entry and icon
    // (pulled from a shared reference sheet) were retired, but any catch someone already
    // logged with that name must still render something reasonable, not crash. Walleye and
    // Yellow Perch were later re-added with real dedicated art (see the exact-match test
    // above) — Crappie hasn't been, so it's still the case covered here.
    expect(speciesIcon('Crappie')).toBe('largemouth');
  });

  test('handles empty, null, and undefined input without throwing', () => {
    expect(speciesIcon('')).toBe('largemouth');
    expect(speciesIcon(null)).toBe('largemouth');
    expect(speciesIcon(undefined)).toBe('largemouth');
  });
});
