// NPC quests in Cast & Catch. Sal and Cap'n Ray each want something, and doing it is how the
// map grows: Ray's proving run on the bay unlocks The Canyon, and fishing The Canyon with him
// unlocks the trip south to The Flats. A 'slam' goal counts distinct species off its list once
// each (the ones landed so far ride along on the quest state as `landed`). Progress lives on
// game_profiles.quests as { key: { progress, done, claimed } } and is advanced client-side
// from each landed catch (advanceQuests), then persisted by the same write that logs the
// catch. Points rewards are turned in by hand with the giver (claimQuestReward in
// AuthContext) so the moment happens in dialogue; unlock rewards are simply live once done.
import { BIOMES } from './gameBiomes';
import { speciesLabel } from './gameSpecies';

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
  {
    key: 'rays_southern_run',
    giver: 'captain',
    title: 'Five from the drop-off',
    brief: 'Land five fish in The Canyon and Ray will trailer the skiff south for the winter — there is a flat he knows.',
    hint: 'Anything that comes over the gunwale out there counts.',
    goal: { type: 'biome', biome: 'canyon', count: 5 },
    reward: { unlocks: 'flats' },
    requires: 'rays_proving',
  },
  {
    key: 'flats_slam',
    giver: 'captain',
    title: 'The grand slam',
    brief: 'A bonefish, a permit and a tarpon from The Flats. Ray has guided two slams in thirty years.',
    hint: 'Shrimp fly in daylight for the bones and permit; the tarpon roll after dark.',
    goal: { type: 'slam', species: ['bonefish', 'permit', 'tarpon'], count: 3 },
    reward: { points: 400 },
    requires: 'rays_southern_run',
  },
  {
    key: 'rays_western_run',
    giver: 'captain',
    title: 'Five off the flat',
    brief: "Land five fish on The Flats and Ray will put you on a plane to his cousin's fish camp on the Pacific.",
    hint: 'Anything that comes over the gunwale down there counts, sticks excepted.',
    goal: { type: 'biome', biome: 'flats', count: 5 },
    reward: { unlocks: 'baja' },
    requires: 'rays_southern_run',
  },
  {
    key: 'baja_rooster',
    giver: 'captain',
    title: 'The rooster',
    brief: "Land a roosterfish off Baja. Ray's cousin says they come right up the beach.",
    hint: 'They chase bait in the surf line in daylight.',
    goal: { type: 'species', species: 'roosterfish', minSize: 0, count: 1 },
    reward: { points: 300 },
    requires: 'rays_western_run',
  },
  {
    key: 'sals_bull_red',
    giver: 'shopkeeper',
    title: 'A bull red for Sal',
    brief: 'Sal wants a redfish of 27 inches or better — a bull red — for the wall beside the bass.',
    hint: 'Reds run the surf on the beach, and every flat down south.',
    goal: { type: 'species', species: 'redfish', minSize: 27, count: 1 },
    reward: { points: 150 },
  },
];

export const QUEST_BY_KEY = Object.fromEntries(QUESTS.map((quest) => [quest.key, quest]));

// What the quest actually asks for, in one line built from its rule rather than written by
// hand, so the board can never drift from what advanceQuests counts. Players were reading a
// title and a "0 / 3" and guessing at the rest.
export function questGoalLabel(quest, quests) {
  const { goal } = quest;
  const state = questState(quests, quest.key);
  if (goal.type === 'species') {
    const size = goal.minSize > 0 ? ` of ${goal.minSize} in or better` : '';
    return `Land ${goal.count === 1 ? 'a' : goal.count} ${speciesLabel(goal.species).toLowerCase()}${size}, on any ground.`;
  }
  if (goal.type === 'biome') return `Land ${goal.count} fish in ${BIOMES[goal.biome]?.label || goal.biome} — any species, any size.`;
  if (goal.type === 'slam') {
    const landed = state.landed || [];
    return `Land one of each: ${goal.species.map((species) => `${speciesLabel(species).toLowerCase()}${landed.includes(species) ? ' ✓' : ''}`).join(', ')}.`;
  }
  return '';
}

// The reward, as the board reads it.
export function questRewardLabel(quest) {
  if (quest.reward.points) return `${quest.reward.points} tackle points`;
  if (quest.reward.unlocks) return `Opens ${BIOMES[quest.reward.unlocks]?.label || quest.reward.unlocks} on the map`;
  return '';
}

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

function catchCounts(quest, { species, sizeIn = 0, biome }, state) {
  if (quest.goal.type === 'species') return species === quest.goal.species && sizeIn >= (quest.goal.minSize || 0);
  if (quest.goal.type === 'biome') return biome === quest.goal.biome;
  if (quest.goal.type === 'slam') return quest.goal.species.includes(species) && !(state.landed || []).includes(species);
  return false;
}

// Applies one landed catch to every open, available quest. Returns the next quests map and the
// keys that just completed so the UI can celebrate them.
export function advanceQuests(quests, catchInfo) {
  const next = { ...(quests || {}) };
  const completed = [];
  QUESTS.forEach((quest) => {
    const state = questState(next, quest.key);
    if (state.done || !questAvailable(quest, next) || !catchCounts(quest, catchInfo, state)) return;
    const progress = state.progress + 1;
    const done = progress >= quest.goal.count;
    next[quest.key] = { ...state, progress, done };
    if (quest.goal.type === 'slam') next[quest.key].landed = [...(state.landed || []), catchInfo.species];
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
