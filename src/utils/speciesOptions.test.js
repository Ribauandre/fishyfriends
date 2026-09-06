import speciesIcon, { SPECIES_OPTIONS } from './speciesOptions';

describe('SPECIES_OPTIONS', () => {
  test('every option has a non-empty label and a recognized icon key', () => {
    const validIcons = new Set(['pike', 'bass', 'salmon', 'shark', 'trout', 'perch', 'tuna']);
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
  });

  test('matches canonical labels case-insensitively', () => {
    expect(speciesIcon('striped bass')).toBe('bass');
    expect(speciesIcon('STRIPED BASS')).toBe('bass');
    expect(speciesIcon('Striped Bass')).toBe('bass');
  });

  test('falls back to a fuzzy substring match for an unlisted species containing a known icon word', () => {
    expect(speciesIcon('Giant Tuna')).toBe('tuna');
    expect(speciesIcon('Some Random Shark')).toBe('shark');
  });

  test('falls back to bass for a completely unrecognized species', () => {
    expect(speciesIcon('Mystery Fish')).toBe('bass');
  });

  test('handles empty, null, and undefined input without throwing', () => {
    expect(speciesIcon('')).toBe('bass');
    expect(speciesIcon(null)).toBe('bass');
    expect(speciesIcon(undefined)).toBe('bass');
  });
});
