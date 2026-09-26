// Pure rules for fishing trips: who's going vs waitlisted, the equal split, who owes whom,
// and whether an attendee's license covers the trip. All money is integer cents so a split
// never drifts by a floating-point penny.

function joinOrder(a, b) {
  return new Date(a.created_at) - new Date(b.created_at) || String(a.id).localeCompare(String(b.id));
}

// Going is the first max_spots people by join time; the rest wait in order. Not stored, so
// someone leaving promotes the next person with no extra write.
export function splitRoster(attendees, maxSpots) {
  const ordered = [...(attendees || [])].sort(joinOrder);
  if (!maxSpots) return { going: ordered, waitlist: [] };
  return { going: ordered.slice(0, maxSpots), waitlist: ordered.slice(maxSpots) };
}

export function parseDollars(input) {
  const cleaned = String(input ?? '').replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 ? cents : null;
}

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function formatCents(cents) {
  return USD.format((cents || 0) / 100);
}

export function totalCents(expenses) {
  return (expenses || []).reduce((sum, expense) => sum + expense.amount_cents, 0);
}

export function perPersonCents(expenses, goingCount) {
  return goingCount ? Math.round(totalCents(expenses) / goingCount) : 0;
}

// Net position per person: positive is owed money, negative owes. Every expense is split
// equally across everyone going (the leftover cents go one each to the earliest joiners);
// a payment recorded from A to B moves A up and B down by that amount.
export function balances({ going = [], expenses = [], settlements = [] }) {
  const net = new Map();
  const names = new Map();
  const touch = (userId, name) => {
    if (!net.has(userId)) net.set(userId, 0);
    if (name && !names.has(userId)) names.set(userId, name);
  };
  const add = (userId, cents) => net.set(userId, net.get(userId) + cents);

  going.forEach((attendee) => touch(attendee.user_id, attendee.angler_name));
  expenses.forEach((expense) => { touch(expense.paid_by, expense.paid_by_name); add(expense.paid_by, expense.amount_cents); });
  if (going.length) {
    const total = totalCents(expenses);
    const base = Math.floor(total / going.length);
    const leftover = total - base * going.length;
    going.forEach((attendee, index) => add(attendee.user_id, -(base + (index < leftover ? 1 : 0))));
  }
  settlements.forEach((settlement) => {
    touch(settlement.from_user, settlement.from_name);
    touch(settlement.to_user, settlement.to_name);
    add(settlement.from_user, settlement.amount_cents);
    add(settlement.to_user, -settlement.amount_cents);
  });

  return [...net].map(([userId, cents]) => ({ userId, name: names.get(userId) || 'Angler', cents }));
}

// Fewest payments that square everyone up: the biggest debtor pays the biggest creditor,
// repeatedly. Ties break by name so everyone sees the same list.
export function settleUp(balanceList) {
  const byAmount = (a, b) => b.cents - a.cents || a.name.localeCompare(b.name);
  const creditors = balanceList.filter((b) => b.cents > 0).map((b) => ({ ...b })).sort(byAmount);
  const debtors = balanceList.filter((b) => b.cents < 0).map((b) => ({ ...b, cents: -b.cents })).sort(byAmount);
  const transfers = [];
  let c = 0;
  let d = 0;
  while (c < creditors.length && d < debtors.length) {
    const cents = Math.min(creditors[c].cents, debtors[d].cents);
    transfers.push({ from: { userId: debtors[d].userId, name: debtors[d].name }, to: { userId: creditors[c].userId, name: creditors[c].name }, cents });
    creditors[c].cents -= cents;
    debtors[d].cents -= cents;
    if (!creditors[c].cents) c += 1;
    if (!debtors[d].cents) d += 1;
  }
  return transfers;
}

function todayIso(today) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

// A private nudge for the angler looking at the trip, from their own licenses: nothing on
// file for the trip's state, or the newest one lapses before the trip ends.
export function licenseWarning(licenses, trip, today = new Date()) {
  if (!trip?.state) return null;
  if (trip.ends_on < todayIso(today)) return null;
  const forState = (licenses || []).filter((license) => license.state === trip.state);
  if (!forState.length) return `You don't have a ${trip.state} fishing license on file. If you have one, add it on your Profile so it's with you on the trip.`;
  const newest = forState.reduce((best, license) => (license.expires_at > best.expires_at ? license : best));
  if (newest.expires_at >= trip.ends_on) return null;
  if (newest.expires_at < todayIso(today)) return `Your ${trip.state} fishing license expired on ${newest.expires_at}. Renew it before the trip.`;
  return `Your ${trip.state} fishing license expires on ${newest.expires_at}, before this trip ends. Renew it before you go.`;
}

// Sign-ups close the day after the RSVP-by date, by the angler's own calendar.
export function rsvpClosed(trip, today = new Date()) {
  return Boolean(trip?.rsvp_by) && todayIso(today) > trip.rsvp_by;
}

// The recap: who caught the most (ties to whoever got there first), and the biggest fish
// of each species, from the lengths people entered.
export function catchRecap(catches) {
  const ordered = [...(catches || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const anglers = new Map();
  ordered.forEach((c) => {
    const entry = anglers.get(c.user_id) || { userId: c.user_id, name: c.angler_name, count: 0, first: anglers.size };
    entry.count += 1;
    anglers.set(c.user_id, entry);
  });
  const leaderboard = [...anglers.values()].sort((a, b) => b.count - a.count || a.first - b.first).map(({ first, ...rest }) => rest);
  const biggest = new Map();
  ordered.forEach((c) => {
    if (!c.length_in) return;
    const best = biggest.get(c.species);
    if (!best || Number(c.length_in) > Number(best.length_in)) biggest.set(c.species, c);
  });
  return { total: ordered.length, leaderboard, biggest: [...biggest.values()].sort((a, b) => Number(b.length_in) - Number(a.length_in)) };
}
