import { QUESTS, advanceQuests, questState, questsFor, claimableQuests, questProgressLabel, QUEST_BY_KEY } from './gameQuests';
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
  expect(questsFor('captain', opened).map((quest) => quest.key)).toEqual(['rays_proving', 'canyon_sword']);
  // Landing a swordfish before it's offered doesn't secretly complete it.
  expect(questState(advanceQuests({}, { species: 'swordfish', sizeIn: 90, biome: 'canyon' }).quests, 'canyon_sword').progress).toBe(0);
  expect(advanceQuests(opened, { species: 'swordfish', sizeIn: 90, biome: 'canyon' }).completed).toEqual(['canyon_sword']);
});

test('a finished quest stops counting', () => {
  const done = { sals_wall: { progress: 1, done: true, claimed: true } };
  const { quests } = advanceQuests(done, { species: 'largemouth', sizeIn: 20, biome: 'swamp' });
  expect(quests.sals_wall).toEqual(done.sals_wall);
  expect(QUESTS.every((quest) => quest.title && quest.brief && quest.goal.count >= 1)).toBe(true);
});
