// Pure rules for fishing trips: who's going vs waitlisted, the equal split, who owes whom,
// All money is integer cents so a split
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

// Each person's side of the split: what they paid for, their equal share of the total (only
// people going have one; the leftover cents go one each to the earliest joiners), payments
// they've sent and received, and what that nets to — positive is owed money, negative owes.
// What you paid comes straight off your share, so someone who fronted the boat may owe
// nothing, or be owed the difference. Going people first, in join order, then anyone else
// who paid for something (a waitlisted angler who picked up the bait).
export function breakdown({ going = [], expenses = [], settlements = [] }) {
  const rows = new Map();
  const row = (userId, name) => {
    if (!rows.has(userId)) rows.set(userId, { userId, name: name || 'Angler', paid: 0, share: 0, sent: 0, received: 0 });
    return rows.get(userId);
  };

  going.forEach((attendee) => row(attendee.user_id, attendee.angler_name));
  if (going.length) {
    const total = totalCents(expenses);
    const base = Math.floor(total / going.length);
    const leftover = total - base * going.length;
    going.forEach((attendee, index) => { row(attendee.user_id).share = base + (index < leftover ? 1 : 0); });
  }
  expenses.forEach((expense) => { row(expense.paid_by, expense.paid_by_name).paid += expense.amount_cents; });
  settlements.forEach((settlement) => {
    row(settlement.from_user, settlement.from_name).sent += settlement.amount_cents;
    row(settlement.to_user, settlement.to_name).received += settlement.amount_cents;
  });

  return [...rows.values()].map((entry) => ({ ...entry, net: entry.paid - entry.share + entry.sent - entry.received }));
}

// Net position per person, for settling up: positive is owed money, negative owes.
export function balances(split) {
  return breakdown(split).map(({ userId, name, net }) => ({ userId, name, cents: net }));
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
