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

describe('the world talks back', () => {
  const profile = { tackle_points: 120, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, quests: {} };

  test('the captain reads the hour: night tips replace the daytime ones', () => {
    expect(captainLine({ biome: 'river', chartered: false, phase: 'ready', period: 'night' })).toMatch(/after dark/i);
    expect(captainLine({ biome: 'river', chartered: false, phase: 'ready', period: 'day' })).toMatch(/current seams/i);
    expect(captainLine({ biome: 'offshore', chartered: true, phase: 'ready', period: 'night' })).toMatch(/sharks own the dark/i);
  });

  test('the captain runs his proving quest on the bay and opens the canyon after it', () => {
    expect(captainLine({ biome: 'bay', chartered: false, phase: 'ready', quests: {} })).toMatch(/land three fish/i);
    expect(captainLine({ biome: 'bay', chartered: false, phase: 'ready', quests: { rays_proving: { progress: 2, done: false } } })).toMatch(/1 more from the bay/i);
    expect(captainLine({ biome: 'bay', chartered: false, phase: 'ready', quests: { rays_proving: { progress: 3, done: true } } })).toMatch(/canyon's on the map/i);
    expect(captainLine({ biome: 'canyon', chartered: false, phase: 'ready' })).toMatch(/80 points/);
    expect(captainLine({ biome: 'canyon', chartered: true, phase: 'ready', period: 'night' })).toMatch(/swordfish/i);
  });

  test('a record gets its own line wherever it happens', () => {
    expect(captainLine({ biome: 'river', chartered: false, phase: 'result', result: { success: true, species: 'walleye' }, isRecord: true })).toMatch(/your biggest yet/i);
  });

  test("Sal has seen your real personal bests and runs the bounty board", () => {
    expect(shopkeeperLine({ gameProfile: profile, event: null, personalBests: [{ species: 'Striped Bass', size_label: '34 in' }] })).toMatch(/striped bass you logged for real — 34 in/i);
    expect(shopkeeperLine({ gameProfile: profile, event: null, bounties: [{ id: 'a' }, { id: 'b' }] })).toMatch(/2 real catches.*cash it in/i);
    expect(shopkeeperLine({ gameProfile: profile, event: { type: 'bounty', count: 2, points: 30 } })).toMatch(/2 real fish on the books — 30 points/i);
  });

  test('Sal wants his bass turned in before anything else', () => {
    const done = { ...profile, quests: { sals_wall: { progress: 1, done: true, claimed: false } } };
    expect(shopkeeperLine({ gameProfile: done, event: null })).toMatch(/is that my bass/i);
    expect(shopkeeperLine({ gameProfile: done, event: { type: 'quest', points: 75 } })).toMatch(/75 points, as promised/i);
  });
});
