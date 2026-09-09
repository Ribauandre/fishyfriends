// The club derby: one target species a week, the same for everyone, biggest one landed in
// Cast & Catch wins. The target is picked deterministically from the ISO week, so no table
// or scheduler is needed — every client agrees on it, and the leaderboard is just everyone's
// catches of that species since Monday (listDerbyLeaders in AuthContext). Species that need
// an unlocked ground are left out so the derby is always open to the whole club.
import { BIOMES } from './gameBiomes';

const LOCKED = new Set(Object.values(BIOMES).filter((biome) => biome.requiresQuest).flatMap((biome) => biome.species));
const OPEN = new Set(Object.values(BIOMES).filter((biome) => !biome.requiresQuest).flatMap((biome) => biome.species));
export const DERBY_POOL = [...OPEN].filter((species) => !LOCKED.has(species) || OPEN.has(species)).sort();

// ISO week: Monday-based, week 1 holds January 4th. Computed in UTC so it matches the
// created_at timestamps the leaderboard filters on.
export function weekStart(date = new Date()) {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() - (day - 1));
  return utc;
}

export function weekKey(date = new Date()) {
  const start = weekStart(date);
  const thursday = new Date(start);
  thursday.setUTCDate(start.getUTCDate() + 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}

export function derbyFor(date = new Date()) {
  const key = weekKey(date);
  const species = DERBY_POOL[hash(key) % DERBY_POOL.length];
  const since = weekStart(date);
  const until = new Date(since);
  until.setUTCDate(since.getUTCDate() + 7);
  const grounds = Object.values(BIOMES).filter((biome) => !biome.requiresQuest && biome.species.includes(species)).map((biome) => biome.key);
  return { key, species, since: since.toISOString(), until: until.toISOString(), grounds };
}

// Everyone's best of the species this week, one row per angler, biggest first; a tie goes to
// whoever landed theirs first.
export function rankDerby(catches) {
  const best = new Map();
  catches.forEach((row) => {
    const current = best.get(row.user_id);
    const size = Number(row.size_in) || 0;
    if (!current || size > current.sizeIn || (size === current.sizeIn && row.created_at < current.createdAt)) {
      best.set(row.user_id, { userId: row.user_id, anglerName: row.angler_name, sizeIn: size, catchId: row.id, createdAt: row.created_at, avatarUrl: row.avatar_url || '' });
    }
  });
  return [...best.values()].sort((a, b) => b.sizeIn - a.sizeIn || (a.createdAt < b.createdAt ? -1 : 1));
}

// The Monday (UTC) a week key like '2026-W37' starts on — so a stored win can be turned back
// into that week's derby (species, dates) without storing anything else.
export function dateOfWeekKey(key) {
  const match = /^(\d{4})-W(\d{2})$/.exec(key || '');
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  // ISO week 1 is the week with January 4th in it.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = weekStart(jan4);
  monday.setUTCDate(monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

// Last week's derby: the one whose board is final and whose winner gets the pennant now.
export function previousDerby(date = new Date()) {
  const lastWeek = new Date(weekStart(date));
  lastWeek.setUTCDate(lastWeek.getUTCDate() - 1);
  return derbyFor(lastWeek);
}

// The Golden Pennant is worn for exactly one week: the week after the one you won.
export function isChampion(derbyWins, date = new Date()) {
  return (derbyWins || []).includes(previousDerby(date).key);
}

export const PENNANT_PRIZE = {
  name: 'The Golden Pennant',
  blurb: 'Top the board and it flies from your rod all next week, for everyone on the dock to see.',
};
