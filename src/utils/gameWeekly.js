// Cap'n Ray's weekly bounties: three asks a week, the same for everyone, picked from the ISO
// week like the derby (utils/gameDerby.js) so no table or scheduler is needed. They are the
// late game's clock — a reason to open the game *this* week rather than eventually — and
// they only ever ask for what every member can do: free grounds, no fly rod, no charter.
//
// Progress lives on game_profiles.weekly as { key, progress: { slot: n }, claimed: [slot] }
// and resets itself the moment the week key changes (advanceWeekly), so nothing is ever
// carried over or cleaned up. Each bounty pays tackle points and one bounty stamp
// (bounty_stamps), which the trophy case counts for good.
import { BIOMES } from './gameBiomes';
import { rarityOf, speciesLabel, inSeason, SPECIES_SIZE } from './gameSpecies';
import { weekKey, weekStart } from './gameDerby';
import { seasonFor } from './gameClock';

const FREE_GROUNDS = Object.values(BIOMES).filter((biome) => !biome.charterCost && !biome.requiresQuest);
const RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

// The three asks. Each is a pure function of the week: a count of fish on one ground, a
// fish of a rarity on another, and one for the hours — after dark or at first and last
// light — on any ground. Points rise with the ask.
export function weeklyFor(date = new Date()) {
  const key = weekKey(date);
  const season = seasonFor(weekStart(date));
  const pick = (list, salt) => list[hash(`${key}:${salt}`) % list.length];
  const groundA = pick(FREE_GROUNDS, 'ground-a');
  const others = FREE_GROUNDS.filter((biome) => biome.key !== groundA.key);
  const groundB = pick(others, 'ground-b');
  const count = 3 + (hash(`${key}:count`) % 3);
  // A rarity the ground can actually give this season: the best tier its in-season roster has,
  // capped at rare so it is a week's ask and not a season's.
  const tiers = groundB.species.filter((species) => inSeason(species, season)).map((species) => RANK[rarityOf(species)]);
  const rarity = ['uncommon', 'rare'][Math.min(1, Math.max(0, Math.max(...tiers, 1) - 1))];
  const hours = hash(`${key}:hours`) % 2 === 0 ? 'night' : 'edges';
  const hoursCount = 2 + (hash(`${key}:hours-count`) % 2);
  // A species the first ground has in season, for the size ask's flavour.
  return {
    key,
    since: weekStart(date).toISOString(),
    bounties: [
      { slot: 'ground', title: `${count} on the ${groundA.label}`, goal: { type: 'ground', biome: groundA.key, count }, points: 60 + count * 20 },
      { slot: 'rarity', title: `${rarity === 'rare' ? 'A rare' : 'An uncommon'} on the ${groundB.label}`, goal: { type: 'rarity', biome: groundB.key, rarity, count: 1 }, points: rarity === 'rare' ? 160 : 100 },
      { slot: 'hours', title: hours === 'night' ? `${hoursCount} after dark` : `${hoursCount} at first or last light`, goal: { type: 'hours', periods: hours === 'night' ? ['night'] : ['dawn', 'dusk'], count: hoursCount }, points: 80 + hoursCount * 20 },
    ],
  };
}

export const weeklyGoalLabel = (bounty) => {
  const { goal } = bounty;
  if (goal.type === 'ground') return `Land ${goal.count} fish on the ${BIOMES[goal.biome].label}, any kind.`;
  if (goal.type === 'rarity') return `Land a fish of ${goal.rarity} rarity or better on the ${BIOMES[goal.biome].label}.`;
  return goal.periods.includes('night') ? `Land ${goal.count} fish after dark, anywhere.` : `Land ${goal.count} fish at dawn or dusk, anywhere.`;
};

// The state for this week: last week's is discarded the moment the key moves on.
export function weeklyState(weekly, date = new Date()) {
  const key = weekKey(date);
  if (!weekly || weekly.key !== key) return { key, progress: {}, claimed: [] };
  return { key, progress: weekly.progress || {}, claimed: weekly.claimed || [] };
}

function counts(bounty, { biome, rarity, period }) {
  const { goal } = bounty;
  if (goal.type === 'ground') return biome === goal.biome;
  if (goal.type === 'rarity') return biome === goal.biome && (RANK[rarity] ?? -1) >= RANK[goal.rarity];
  return goal.periods.includes(period);
}

export function advanceWeekly(weekly, catchInfo, date = new Date()) {
  const state = weeklyState(weekly, date);
  const progress = { ...state.progress };
  const completed = [];
  weeklyFor(date).bounties.forEach((bounty) => {
    const done = (progress[bounty.slot] || 0) >= bounty.goal.count;
    if (done || !counts(bounty, catchInfo)) return;
    progress[bounty.slot] = (progress[bounty.slot] || 0) + 1;
    if (progress[bounty.slot] >= bounty.goal.count) completed.push(bounty.slot);
  });
  return { weekly: { ...state, progress }, completed };
}

export function bountyStatus(bounty, weekly, date = new Date()) {
  const state = weeklyState(weekly, date);
  const progress = state.progress[bounty.slot] || 0;
  const done = progress >= bounty.goal.count;
  return { progress, done, claimed: state.claimed.includes(bounty.slot), claimable: done && !state.claimed.includes(bounty.slot) };
}

export function claimableWeekly(weekly, date = new Date()) {
  return weeklyFor(date).bounties.filter((bounty) => bountyStatus(bounty, weekly, date).claimable);
}

// The club records board: everyone's biggest of each species, from the catch table, biggest
// first by species label. `catches` is any list of rows with species, size_in, angler_name,
// user_id and created_at; a tie goes to whoever landed theirs first.
export function clubRecords(catches = []) {
  const best = new Map();
  catches.forEach((row) => {
    if (rarityOf(row.species) === 'junk') return;
    const size = Number(row.size_in) || 0;
    const current = best.get(row.species);
    if (!current || size > current.sizeIn || (size === current.sizeIn && row.created_at < current.createdAt)) {
      best.set(row.species, { species: row.species, sizeIn: size, userId: row.user_id, anglerName: row.angler_name || 'A club member', createdAt: row.created_at, catchId: row.id });
    }
  });
  return [...best.values()].sort((a, b) => speciesLabel(a.species).localeCompare(speciesLabel(b.species)));
}

// How close a club record is to the top of the species' range, for the board's bar.
export function recordFraction(species, sizeIn) {
  const [min, max] = SPECIES_SIZE[species] || [6, 18];
  return Math.max(0, Math.min(1, (Number(sizeIn) - min) / Math.max(1, max - min)));
}
