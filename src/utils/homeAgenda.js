import { MONTHS } from './catchDestinations';

// Home's "On your plate": what needs you right now, worked out from what the page already
// loads. Each item is { key, title, detail, to } — or `action: 'log'` for the one that opens
// the Log a catch form instead of going somewhere. Pure, so the rules are tested without the
// page; `today` is a local YYYY-MM-DD.
const DAY_MS = 86400000;

export function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function inDays(days) {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

function daysLeftInMonth(today) {
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return last - Number(today.slice(8, 10));
}

export function homeAgenda({ today, userId, profile = {}, fishYear, myFishYearCatches = [], invites = [], trips = [], tournaments = [], myTournamentIds = [] }) {
  const items = [];

  const month = MONTHS[Number(today.slice(5, 7)) - 1];
  if (today.startsWith(`${fishYear}-`) && !myFishYearCatches.some((row) => row.month === month)) {
    const left = daysLeftInMonth(today);
    items.push({ key: 'fish-year', title: `No fish logged for ${month} yet`, detail: left === 0 ? 'Last day of the month for Fish Year.' : `${left} day${left === 1 ? '' : 's'} left to keep your Fish Year going.`, action: 'log' });
  }

  for (const invite of invites) {
    items.push({ key: `invite-${invite.id}`, title: `${invite.inviterName || 'Someone'} shared a waypoint map`, detail: `${invite.map_name || 'A map'} is waiting on your yes.`, to: '/waypoints' });
  }

  const mine = (trip) => (trip.attendees || []).some((attendee) => attendee.user_id === userId);
  for (const trip of trips.filter((candidate) => mine(candidate) && candidate.ends_on >= today).slice(0, 2)) {
    const started = trip.starts_on <= today;
    items.push({ key: `trip-${trip.id}`, title: started ? `${trip.name} is on` : `${trip.name} ${inDays(daysBetween(today, trip.starts_on))}`, detail: started ? 'Log what you catch so it makes the recap.' : [trip.location, 'check the packing list and who\'s in'].filter(Boolean).join(' · '), to: `/trips/${trip.id}` });
  }
  // Trips you haven't joined whose RSVP closes within the week.
  for (const trip of trips.filter((candidate) => !mine(candidate) && candidate.created_by !== userId && candidate.rsvp_by && candidate.rsvp_by >= today && daysBetween(today, candidate.rsvp_by) <= 7)) {
    const closes = daysBetween(today, trip.rsvp_by);
    items.push({ key: `rsvp-${trip.id}`, title: `RSVP for ${trip.name} ${closes === 0 ? 'closes today' : `closes ${inDays(closes)}`}`, detail: trip.location || 'Decide if you\'re in.', to: `/trips/${trip.id}` });
  }

  for (const tournament of tournaments.filter((candidate) => candidate.starts_on <= today && today <= candidate.ends_on)) {
    const entered = myTournamentIds.includes(tournament.id);
    const ends = daysBetween(today, tournament.ends_on);
    items.push({ key: `tournament-${tournament.id}`, title: `${tournament.name} ends ${inDays(ends)}`, detail: entered ? 'You\'re on the board. Beat your own entry.' : 'You haven\'t entered yet.', to: `/tournaments/${tournament.id}` });
  }

  if (!profile.avatar_url || !profile.home_water) {
    items.push({ key: 'profile', title: 'Finish your profile', detail: 'Add a photo and your home water so the crew knows who they\'re up against.', to: '/profile' });
  }

  return items;
}
