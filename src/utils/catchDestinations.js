// One fish can count in several places: the Fish Year board, your personal bests, a
// tournament running that day and a trip you're on. These are the pure rules the Log a catch
// form uses to decide which of those a catch on a given date can go to, and what it needs.
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function monthFromDate(dateStr) {
  return MONTHS[Number(String(dateStr).slice(5, 7)) - 1] || MONTHS[0];
}

// Today, pulled inside a tournament's or trip's dates, so opening the form from one that has
// ended (a late entry) or not started still lists it.
export function dateWithin(today, starts, ends) {
  if (today < starts) return starts;
  if (today > ends) return ends;
  return today;
}

const within = (date, starts, ends) => Boolean(date) && starts <= date && date <= ends;

// Tournaments running on the date, and trips you're on (going or waitlisted — the same people
// the trip lets log a catch) that the date falls inside.
export function eligibleDestinations({ date, fishYear, tournaments = [], trips = [], userId }) {
  return {
    fishYear: Boolean(date) && String(date).startsWith(`${fishYear}-`),
    tournaments: tournaments.filter((tournament) => within(date, tournament.starts_on, tournament.ends_on)),
    trips: trips.filter((trip) => (trip.attendees || []).some((attendee) => attendee.user_id === userId) && within(date, trip.starts_on, trip.ends_on)),
  };
}

function positive(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return { value: null };
  const number = Number(trimmed);
  return number > 0 ? { value: number } : { error: true };
}

// A personal best keeps a free-text size, so it gets both measurements written out.
export function sizeLabel(lengthIn, weightLb) {
  return [lengthIn ? `${lengthIn} in` : '', weightLb ? `${weightLb} lb` : ''].filter(Boolean).join(' · ');
}

// What the form would send, or why it can't: a species, somewhere to log it, and a size in
// each checked tournament's unit.
export function checkCatch({ species, picks, tournaments = [], length, weight }) {
  if (!species?.trim()) return { error: 'Pick the species.' };
  const lengthIn = positive(length);
  const weightLb = positive(weight);
  if (lengthIn.error) return { error: 'Length has to be a number of inches, or blank.' };
  if (weightLb.error) return { error: 'Weight has to be a number of pounds, or blank.' };
  const chosenTournaments = tournaments.filter((tournament) => picks.tournamentIds.includes(tournament.id));
  if (!picks.fishYear && !picks.personalBest && !chosenTournaments.length && !picks.tripIds.length) return { error: 'Tick at least one place for this catch to count.' };
  const missing = chosenTournaments.find((tournament) => (tournament.unit === 'lb' ? !weightLb.value : !lengthIn.value));
  if (missing) return { error: `${missing.name} is measured in ${missing.unit === 'lb' ? 'pounds — add the weight' : 'inches — add the length'}.` };
  return { lengthIn: lengthIn.value, weightLb: weightLb.value, tournaments: chosenTournaments };
}
