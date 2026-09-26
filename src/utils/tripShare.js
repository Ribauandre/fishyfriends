import { formatCents } from './tripMath';

// What goes in the text when someone shares a trip: enough to decide from the message alone
// (the link opens the trip, but only for someone signed in), then the link.
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(iso) {
  return { month: MONTH[Number(iso.slice(5, 7)) - 1], day: Number(iso.slice(8, 10)) };
}

export function shortDate(iso) {
  const { month, day } = parts(iso);
  return `${month} ${day}`;
}

export function tripDates(startsOn, endsOn) {
  if (!endsOn || startsOn === endsOn) return shortDate(startsOn);
  const start = parts(startsOn);
  const end = parts(endsOn);
  return start.month === end.month ? `${start.month} ${start.day}–${end.day}` : `${shortDate(startsOn)} – ${shortDate(endsOn)}`;
}

export function tripShareText(trip, { perPersonCents = 0, spotsLeft = null } = {}) {
  const where = [trip.location, trip.state].filter(Boolean).join(', ');
  const lines = [[trip.name, tripDates(trip.starts_on, trip.ends_on), where].filter(Boolean).join(' · ')];
  const details = [];
  if (trip.target_species?.length) details.push(`Going after ${trip.target_species.join(', ')}.`);
  if (perPersonCents > 0) details.push(`About ${formatCents(perPersonCents)} a person so far.`);
  if (spotsLeft !== null) details.push(spotsLeft > 0 ? `${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left.` : 'Full, but there\'s a waitlist.');
  if (trip.rsvp_by) details.push(`RSVP by ${shortDate(trip.rsvp_by)}.`);
  if (details.length) lines.push(details.join(' '));
  lines.push('Who\'s in?');
  return lines.join('\n');
}

export function tripUrl(origin, tripId) {
  return `${origin}/trips/${tripId}`;
}

// Opens Messages (iMessage on an iPhone or Mac) with the text filled in and no one picked
// yet, so the sender chooses the group thread.
export function messagesUrl(text, url) {
  return `sms:?&body=${encodeURIComponent(`${text}\n${url}`)}`;
}
