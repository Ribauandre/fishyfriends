// NPC quests in Cast & Catch. Sal and Cap'n Ray each want something, and doing it is how the
// map grows: Ray's proving run on the bay unlocks The Canyon. Progress lives on
// game_profiles.quests as { key: { progress, done, claimed } } and is advanced client-side
// from each landed catch (advanceQuests), then persisted by the same write that logs the
// catch. Points rewards are turned in by hand with the giver (claimQuestReward in
// AuthContext) so the moment happens in dialogue; unlock rewards are simply live once done.
export const QUESTS = [
  {
    key: 'sals_wall',
    giver: 'shopkeeper',
    title: "A bass for Sal's wall",
    brief: 'Sal wants a largemouth of 16 inches or better for the empty spot over the counter.',
    hint: 'Largemouth hold in the swamp weeds.',
    goal: { type: 'species', species: 'largemouth', minSize: 16, count: 1 },
    reward: { points: 75 },
  },
  {
    key: 'rays_proving',
    giver: 'captain',
    title: 'Prove yourself on the bay',
    brief: "Land three fish in the bay and Cap'n Ray will run you out to where the shelf drops off.",
    hint: 'Any three fish, as long as they come out of the bay.',
    goal: { type: 'biome', biome: 'bay', count: 3 },
    reward: { unlocks: 'canyon' },
  },
  {
    key: 'canyon_sword',
    giver: 'captain',
    title: 'The one that lives out there',
    brief: 'Land a swordfish in The Canyon. Ray has been trying for eleven years.',
    hint: 'They feed after dark.',
    goal: { type: 'species', species: 'swordfish', minSize: 0, count: 1 },
    reward: { points: 250 },
    requires: 'rays_proving',
  },
];

export const QUEST_BY_KEY = Object.fromEntries(QUESTS.map((quest) => [quest.key, quest]));

const EMPTY = { progress: 0, done: false, claimed: false };

export function questState(quests, key) {
  return { ...EMPTY, ...(quests?.[key] || {}) };
}

// A quest is offered once whatever it depends on is done.
export function questAvailable(quest, quests) {
  return !quest.requires || questState(quests, quest.requires).done;
}

export function questsFor(giver, quests) {
  return QUESTS.filter((quest) => quest.giver === giver && questAvailable(quest, quests));
}

function catchCounts(quest, { species, sizeIn = 0, biome }) {
  if (quest.goal.type === 'species') return species === quest.goal.species && sizeIn >= (quest.goal.minSize || 0);
  if (quest.goal.type === 'biome') return biome === quest.goal.biome;
  return false;
}

// Applies one landed catch to every open, available quest. Returns the next quests map and the
// keys that just completed so the UI can celebrate them.
export function advanceQuests(quests, catchInfo) {
  const next = { ...(quests || {}) };
  const completed = [];
  QUESTS.forEach((quest) => {
    const state = questState(next, quest.key);
    if (state.done || !questAvailable(quest, next) || !catchCounts(quest, catchInfo)) return;
    const progress = state.progress + 1;
    const done = progress >= quest.goal.count;
    next[quest.key] = { ...state, progress, done };
    if (done) completed.push(quest.key);
  });
  return { quests: next, completed };
}

export function claimableQuests(quests) {
  return QUESTS.filter((quest) => quest.reward.points && questState(quests, quest.key).done && !questState(quests, quest.key).claimed);
}

export function questProgressLabel(quest, quests) {
  const state = questState(quests, quest.key);
  if (state.claimed) return 'Turned in';
  if (state.done) return quest.reward.points ? 'Done — turn it in' : 'Done';
  return `${state.progress} / ${quest.goal.count}`;
}
