const MONTHS_IN_YEAR = 12;

// Longest run of consecutive calendar months caught, anywhere in the year — the crew's
// bragging stat, independent of whether that run is still going.
export function bestStreak(caughtMonthIndexes) {
  const caught = new Set(caughtMonthIndexes);
  let best = 0;
  let current = 0;
  for (let month = 0; month < MONTHS_IN_YEAR; month += 1) {
    if (caught.has(month)) { current += 1; best = Math.max(best, current); }
    else current = 0;
  }
  return best;
}

// The run of consecutive months caught ending at (and including) referenceMonthIndex, so it
// reads as "still going" rather than counting a hot streak from January that fizzled out.
export function currentStreak(caughtMonthIndexes, referenceMonthIndex) {
  const caught = new Set(caughtMonthIndexes);
  let streak = 0;
  for (let month = referenceMonthIndex; month >= 0; month -= 1) {
    if (!caught.has(month)) break;
    streak += 1;
  }
  return streak;
}
