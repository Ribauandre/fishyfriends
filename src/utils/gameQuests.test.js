import { QUESTS, advanceQuests, questState, questsFor, claimableQuests, questProgressLabel, questGoalLabel, questRewardLabel, QUEST_BY_KEY } from './gameQuests';
import { biomeUnlocked } from './gameBiomes';

test("Sal's wall wants a largemouth of size, and a small one doesn't count", () => {
  let { quests, completed } = advanceQuests({}, { species: 'largemouth', sizeIn: 12.5, biome: 'swamp' });
  expect(questState(quests, 'sals_wall').progress).toBe(0);
  expect(completed).toEqual([]);
  ({ quests, completed } = advanceQuests(quests, { species: 'largemouth', sizeIn: 17.2, biome: 'swamp' }));
  expect(questState(quests, 'sals_wall')).toEqual({ progress: 1, done: true, claimed: false });
  expect(completed).toEqual(['sals_wall']);
  expect(claimableQuests(quests).map((quest) => quest.key)).toEqual(['sals_wall']);
  expect(questProgressLabel(QUEST_BY_KEY.sals_wall, quests)).toMatch(/turn it in/i);
});

test("three bay fish prove you to Cap'n Ray and open The Canyon", () => {
  let quests = {};
  expect(biomeUnlocked('canyon', quests)).toBe(false);
  expect(biomeUnlocked('river', quests)).toBe(true);
  ['flounder', 'weakfish'].forEach((species) => { ({ quests } = advanceQuests(quests, { species, sizeIn: 15, biome: 'bay' })); });
  expect(questProgressLabel(QUEST_BY_KEY.rays_proving, quests)).toBe('2 / 3');
  // A fish from somewhere else doesn't count toward the bay.
  ({ quests } = advanceQuests(quests, { species: 'flounder', sizeIn: 15, biome: 'shoreline' }));
  expect(questState(quests, 'rays_proving').progress).toBe(2);
  const result = advanceQuests(quests, { species: 'stripedbass', sizeIn: 30, biome: 'bay' });
  expect(result.completed).toEqual(['rays_proving']);
  expect(biomeUnlocked('canyon', result.quests)).toBe(true);
  // An unlock reward has nothing to turn in.
  expect(claimableQuests(result.quests)).toEqual([]);
});

test('the swordfish quest is only offered once the canyon is open', () => {
  expect(questsFor('captain', {}).map((quest) => quest.key)).toEqual(['rays_proving']);
  const opened = { rays_proving: { progress: 3, done: true, claimed: false } };
  expect(questsFor('captain', opened).map((quest) => quest.key)).toEqual(['rays_proving', 'canyon_sword', 'rays_southern_run']);
  // Landing a swordfish before it's offered doesn't secretly complete it.
  expect(questState(advanceQuests({}, { species: 'swordfish', sizeIn: 90, biome: 'canyon' }).quests, 'canyon_sword').progress).toBe(0);
  expect(advanceQuests(opened, { species: 'swordfish', sizeIn: 90, biome: 'canyon' }).completed).toEqual(['canyon_sword']);
});

test("five canyon fish send Ray south and open The Flats, and the slam counts each of its species once", () => {
  let quests = { rays_proving: { progress: 3, done: true, claimed: false } };
  expect(questsFor('captain', quests).map((quest) => quest.key)).toEqual(['rays_proving', 'canyon_sword', 'rays_southern_run']);
  expect(biomeUnlocked('flats', quests)).toBe(false);
  for (let i = 0; i < 4; i += 1) ({ quests } = advanceQuests(quests, { species: 'tuna', sizeIn: 40, biome: 'canyon' }));
  expect(questProgressLabel(QUEST_BY_KEY.rays_southern_run, quests)).toBe('4 / 5');
  ({ quests } = advanceQuests(quests, { species: 'tuna', sizeIn: 40, biome: 'offshore' }));
  expect(questState(quests, 'rays_southern_run').progress).toBe(4);
  const opened = advanceQuests(quests, { species: 'wahoo', sizeIn: 50, biome: 'canyon' });
  expect(opened.completed).toEqual(['rays_southern_run']);
  expect(biomeUnlocked('flats', opened.quests)).toBe(true);
  expect(questsFor('captain', opened.quests).map((quest) => quest.key)).toContain('flats_slam');

  // The slam: a second bonefish is not a second species.
  quests = opened.quests;
  ({ quests } = advanceQuests(quests, { species: 'bonefish', sizeIn: 24, biome: 'flats' }));
  ({ quests } = advanceQuests(quests, { species: 'bonefish', sizeIn: 26, biome: 'flats' }));
  expect(questState(quests, 'flats_slam')).toEqual({ progress: 1, done: false, claimed: false, landed: ['bonefish'] });
  ({ quests } = advanceQuests(quests, { species: 'snook', sizeIn: 26, biome: 'flats' }));
  expect(questState(quests, 'flats_slam').progress).toBe(1);
  ({ quests } = advanceQuests(quests, { species: 'permit', sizeIn: 30, biome: 'flats' }));
  const slam = advanceQuests(quests, { species: 'tarpon', sizeIn: 70, biome: 'flats' });
  // The fifth flats fish also finishes Ray's western run.
  expect(slam.completed).toEqual(['flats_slam', 'rays_western_run']);
  expect(questState(slam.quests, 'flats_slam').landed).toEqual(['bonefish', 'permit', 'tarpon']);
  expect(claimableQuests(slam.quests).map((quest) => quest.key)).toEqual(['flats_slam']);
});

test('five flats fish open Baja, and the rooster is the last of the captain\'s asks', () => {
  let quests = { rays_proving: { progress: 3, done: true }, rays_southern_run: { progress: 5, done: true } };
  expect(questsFor('captain', quests).map((quest) => quest.key)).toContain('rays_western_run');
  expect(questsFor('captain', quests).map((quest) => quest.key)).not.toContain('baja_rooster');
  expect(biomeUnlocked('baja', quests)).toBe(false);
  for (let i = 0; i < 5; i += 1) ({ quests } = advanceQuests(quests, { species: 'bonefish', sizeIn: 20, biome: 'flats' }));
  expect(questState(quests, 'rays_western_run').done).toBe(true);
  expect(biomeUnlocked('baja', quests)).toBe(true);
  expect(questsFor('captain', quests).map((quest) => quest.key)).toContain('baja_rooster');
  const rooster = advanceQuests(quests, { species: 'roosterfish', sizeIn: 40, biome: 'baja' });
  expect(rooster.completed).toEqual(['baja_rooster']);
  expect(questGoalLabel(QUEST_BY_KEY.rays_western_run, {})).toBe('Land 5 fish in The Flats — any species, any size.');
  expect(questRewardLabel(QUEST_BY_KEY.rays_western_run)).toBe('Opens Baja on the map');
});

test("Sal's bull red wants 27 inches, from any water", () => {
  let { quests } = advanceQuests({}, { species: 'redfish', sizeIn: 22, biome: 'shoreline' });
  expect(questState(quests, 'sals_bull_red').progress).toBe(0);
  ({ quests } = advanceQuests(quests, { species: 'redfish', sizeIn: 28.5, biome: 'shoreline' }));
  expect(questState(quests, 'sals_bull_red').done).toBe(true);
  expect(questsFor('shopkeeper', {}).map((quest) => quest.key)).toEqual(['sals_wall', 'sals_bull_red']);
});

test('every quest says in one line what to do and what it pays, built from its rule', () => {
  expect(questGoalLabel(QUEST_BY_KEY.sals_wall, {})).toBe('Land a largemouth bass of 16 in or better, on any ground.');
  expect(questGoalLabel(QUEST_BY_KEY.rays_proving, {})).toBe('Land 3 fish in Bay — any species, any size.');
  expect(questGoalLabel(QUEST_BY_KEY.rays_southern_run, {})).toBe('Land 5 fish in The Canyon — any species, any size.');
  expect(questGoalLabel(QUEST_BY_KEY.canyon_sword, {})).toBe('Land a swordfish, on any ground.');
  expect(questGoalLabel(QUEST_BY_KEY.flats_slam, {})).toBe('Land one of each: bonefish, permit, tarpon.');
  // The slam ticks off what has been landed so far.
  expect(questGoalLabel(QUEST_BY_KEY.flats_slam, { flats_slam: { progress: 1, done: false, claimed: false, landed: ['permit'] } })).toBe('Land one of each: bonefish, permit ✓, tarpon.');
  expect(questRewardLabel(QUEST_BY_KEY.sals_wall)).toBe('75 tackle points');
  expect(questRewardLabel(QUEST_BY_KEY.rays_proving)).toBe('Opens The Canyon on the map');
  expect(questRewardLabel(QUEST_BY_KEY.rays_southern_run)).toBe('Opens The Flats on the map');
  QUESTS.forEach((quest) => { expect(questGoalLabel(quest, {})).not.toBe(''); expect(questRewardLabel(quest)).not.toBe(''); });
});

test('a finished quest stops counting', () => {
  const done = { sals_wall: { progress: 1, done: true, claimed: true } };
  const { quests } = advanceQuests(done, { species: 'largemouth', sizeIn: 20, biome: 'swamp' });
  expect(quests.sals_wall).toEqual(done.sals_wall);
  expect(QUESTS.every((quest) => quest.title && quest.brief && quest.goal.count >= 1)).toBe(true);
});
