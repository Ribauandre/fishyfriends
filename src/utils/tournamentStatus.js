// A tournament's status is derived from today's date against its stored range rather than
// a stored column, so it never goes stale if nobody remembers to flip a flag.
export function tournamentStatus(tournament) {
  const today = new Date().toISOString().slice(0, 10);
  if (today < tournament.starts_on) return 'upcoming';
  if (today > tournament.ends_on) return 'ended';
  return 'active';
}

export const TOURNAMENT_STATUS_LABEL = { active: 'Active', upcoming: 'Upcoming', ended: 'Ended' };
