// Time of day in Cast & Catch follows the real clock, so the dock at 10pm is a night dock. The
// four periods drive the scene tint, what the lamp does, which fish are moving (see
// rollSpecies in utils/gameSpecies.js), and what the captain has to say about it.
export const PERIODS = ['dawn', 'day', 'dusk', 'night'];

export const PERIOD_LABELS = { dawn: 'Dawn', day: 'Daytime', dusk: 'Dusk', night: 'Night' };

export function periodFor(date = new Date()) {
  const hour = date.getHours() + date.getMinutes() / 60;
  if (hour >= 5 && hour < 7) return 'dawn';
  if (hour >= 7 && hour < 18) return 'day';
  if (hour >= 18 && hour < 20.5) return 'dusk';
  return 'night';
}

export function isDark(period) { return period === 'night' || period === 'dusk'; }

// Milliseconds until the next period boundary, so the scene can re-tint on time rather than
// polling: 5:00, 7:00, 18:00, 20:30.
export function msUntilNextPeriod(date = new Date()) {
  const boundaries = [5 * 60, 7 * 60, 18 * 60, 20 * 60 + 30];
  const minutesNow = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  const next = boundaries.find((minute) => minute > minutesNow) ?? boundaries[0] + 24 * 60;
  return Math.max(1000, Math.round((next - minutesNow) * 60 * 1000));
}
