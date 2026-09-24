import { weeklyFor, weeklyState, advanceWeekly, bountyStatus, claimableWeekly, weeklyGoalLabel, clubRecords, recordFraction } from './gameWeekly';
import { BIOMES } from './gameBiomes';
import { weekKey } from './gameDerby';
import { SPECIES_SIZE } from './gameSpecies';

const MONDAY = new Date(Date.UTC(2026, 5, 15, 12));
const NEXT = new Date(Date.UTC(2026, 5, 22, 12));

test('three bounties a week, the same for everyone, on grounds every member can fish', () => {
  const week = weeklyFor(MONDAY);
  expect(week.key).toBe(weekKey(MONDAY));
  expect(week).toEqual(weeklyFor(new Date(Date.UTC(2026, 5, 18, 3))));
  expect(week.bounties.map((bounty) => bounty.slot)).toEqual(['ground', 'rarity', 'hours']);
  week.bounties.forEach((bounty) => { expect(bounty.points).toBeGreaterThan(0); expect(bounty.goal.count).toBeGreaterThan(0); expect(weeklyGoalLabel(bounty)).toMatch(/land/i); });
  [week.bounties[0], week.bounties[1]].forEach((bounty) => { expect(BIOMES[bounty.goal.biome].charterCost).toBe(0); expect(BIOMES[bounty.goal.biome].requiresQuest).toBeUndefined(); });
  expect(week.bounties[0].goal.biome).not.toBe(week.bounties[1].goal.biome);
  // Next week is a different board.
  expect(weeklyFor(NEXT).key).not.toBe(week.key);
  const boards = new Set(Array.from({ length: 12 }, (_, i) => JSON.stringify(weeklyFor(new Date(Date.UTC(2026, 0, 5 + 7 * i))).bounties)));
  expect(boards.size).toBeGreaterThan(6);
});

test('a catch advances the bounties it counts for, and the week rolls the state over', () => {
  const week = weeklyFor(MONDAY);
  const [ground, rarity, hours] = week.bounties;
  let state = weeklyState(undefined, MONDAY);
  expect(state).toEqual({ key: week.key, progress: {}, claimed: [] });
  // A common fish on the first ground in daylight counts once.
  ({ weekly: state } = advanceWeekly(state, { species: 'bluegill', rarity: 'common', biome: ground.goal.biome, period: 'day' }, MONDAY));
  expect(state.progress.ground).toBe(1);
  expect(state.progress.rarity).toBeUndefined();
  // A rare fish on the second ground after dark counts for the rarity ask and, on a night
  // week, the hours ask.
  const result = advanceWeekly(state, { species: 'laketrout', rarity: 'rare', biome: rarity.goal.biome, period: 'night' }, MONDAY);
  state = result.weekly;
  expect(state.progress.rarity).toBe(1);
  expect(result.completed).toContain('rarity');
  expect(Boolean(state.progress.hours)).toBe(hours.goal.periods.includes('night'));
  expect(bountyStatus(rarity, state, MONDAY)).toEqual({ progress: 1, done: true, claimed: false, claimable: true });
  expect(claimableWeekly(state, MONDAY).map((bounty) => bounty.slot)).toEqual(['rarity']);
  // Progress never runs past the ask, and a claimed one stays claimed.
  const again = advanceWeekly(state, { species: 'laketrout', rarity: 'rare', biome: rarity.goal.biome, period: 'day' }, MONDAY);
  expect(again.weekly.progress.rarity).toBe(1);
  expect(again.completed).not.toContain('rarity');
  expect(bountyStatus(rarity, { ...state, claimed: ['rarity'] }, MONDAY).claimable).toBe(false);
  // Monday comes: last week's progress is gone.
  expect(weeklyState(state, NEXT)).toEqual({ key: weekKey(NEXT), progress: {}, claimed: [] });
  expect(advanceWeekly(state, { species: 'bluegill', rarity: 'common', biome: ground.goal.biome, period: 'day' }, NEXT).weekly.progress).toEqual(expect.not.objectContaining({ rarity: 1 }));
});

test('the club records board is the biggest of each species by anyone, first landed on a tie, flotsam aside', () => {
  const rows = [
    { id: 'a', species: 'pike', size_in: '30', angler_name: 'Kevin', user_id: 'u2', created_at: '2026-06-02T00:00:00Z' },
    { id: 'b', species: 'pike', size_in: '40', angler_name: 'Andre', user_id: 'u1', created_at: '2026-06-03T00:00:00Z' },
    { id: 'c', species: 'pike', size_in: 40, angler_name: 'Sal', user_id: 'u3', created_at: '2026-06-01T00:00:00Z' },
    { id: 'd', species: 'bluegill', size_in: 9, angler_name: 'Kevin', user_id: 'u2', created_at: '2026-06-02T00:00:00Z' },
    { id: 'e', species: 'stick', size_in: 20, angler_name: 'Kevin', user_id: 'u2', created_at: '2026-06-02T00:00:00Z' },
  ];
  const board = clubRecords(rows);
  expect(board.map((row) => row.species)).toEqual(['bluegill', 'pike']);
  expect(board[1]).toEqual(expect.objectContaining({ sizeIn: 40, anglerName: 'Sal', userId: 'u3' }));
  expect(recordFraction('pike', SPECIES_SIZE.pike[1])).toBe(1);
  expect(recordFraction('pike', 0)).toBe(0);
});
