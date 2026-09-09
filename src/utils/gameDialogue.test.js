import { shopkeeperLine, captainLine } from './gameDialogue';

describe('shopkeeperLine', () => {
  const profile = { tackle_points: 120, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1 };

  test('greets with your balance by default', () => {
    expect(shopkeeperLine({ gameProfile: profile, event: null })).toMatch(/120 tackle points/);
  });

  test('nudges a broke angler toward fishing instead of browsing', () => {
    expect(shopkeeperLine({ gameProfile: { ...profile, tackle_points: 0 }, event: null })).toMatch(/land something/i);
  });

  test('reacts to what you just bought', () => {
    expect(shopkeeperLine({ gameProfile: profile, event: { type: 'upgrade', label: 'Rod' } })).toMatch(/rod will treat you right/i);
    expect(shopkeeperLine({ gameProfile: profile, event: { type: 'lure', label: 'Jerk bait' } })).toMatch(/jerk bait takes practice/i);
  });

  test('repeats a failed purchase back to you', () => {
    expect(shopkeeperLine({ gameProfile: profile, event: { type: 'error', message: 'Not enough tackle points yet.' } })).toMatch(/not enough tackle points yet/i);
  });

  test('has nothing to sell once everything is maxed', () => {
    const maxed = { ...profile, rod_level: 5, line_level: 5, reel_level: 5, bait_level: 5 };
    expect(shopkeeperLine({ gameProfile: maxed, event: null })).toMatch(/go fish/i);
  });
});

describe('captainLine', () => {
  test('pitches the charter when offshore is picked but not paid for', () => {
    expect(captainLine({ biome: 'offshore', chartered: false, phase: 'ready' })).toMatch(/50 points gets you past the reef/i);
  });

  test('welcomes you aboard once chartered', () => {
    expect(captainLine({ biome: 'offshore', chartered: true, phase: 'ready' })).toMatch(/welcome aboard/i);
  });

  test('refuses when you cannot pay', () => {
    expect(captainLine({ biome: 'offshore', chartered: false, charterError: 'Not enough tackle points to charter a boat.', phase: 'ready' })).toMatch(/no points, no boat/i);
  });

  test('gives a species tip for free water', () => {
    expect(captainLine({ biome: 'shoreline', chartered: false, phase: 'ready' })).toMatch(/fluke/i);
    expect(captainLine({ biome: 'mountainlake', chartered: false, phase: 'ready' })).toMatch(/trout/i);
  });

  test('comments on an offshore landing by species', () => {
    expect(captainLine({ biome: 'offshore', chartered: true, phase: 'result', result: { success: true, species: 'tuna' } })).toMatch(/a tuna\. that's why you charter/i);
  });
});
