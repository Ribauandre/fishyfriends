// The arithmetic under a gauge's chart: where a value sits on a straight or a log axis,
// which round numbers to rule the axis at, which dates to name along the bottom, and how a
// record becomes a line. No drawing here — components/GaugeChart.js does that — so all of it
// can be tested as numbers.

const DAY = 24 * 60 * 60 * 1000;

// value -> position, between two ends of an axis.
export function linearScale(from, to, start, end) {
  const span = to - from || 1;
  return (value) => start + ((value - from) / span) * (end - start);
}

// The same on a log axis. Nothing at or below zero has a place on one, so such a value is
// drawn at the bottom of the axis rather than nowhere.
export function logScale(from, to, start, end) {
  const low = Math.log10(from);
  const span = Math.log10(to) - low || 1;
  return (value) => start + ((Math.log10(Math.max(value, from)) - low) / span) * (end - start);
}

const niceStep = (rough) => {
  const power = 10 ** Math.floor(Math.log10(rough));
  const unit = rough / power;
  // Quarters as well as 1, 2 and 5: without them a river running 30 to 80 gets one line
  // across its chart, at 50.
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
};
// Sums of steps like 0.1 pick up binary dust (0.30000000000000004); a tick is a round number.
const tidy = (value) => Number(value.toPrecision(12));

// A straight axis that holds low..high: round ends and a handful of round ticks. `floor`
// pins the bottom (flow starts at 0; a temperature axis starts near its lowest reading).
export function linearAxis(low, high, { ticks = 4, floor } = {}) {
  let min = floor !== undefined ? floor : low;
  let max = high;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (max <= min) max = min + (Math.abs(min) || 1);
  const step = niceStep((max - min) / ticks);
  min = floor !== undefined ? floor : Math.floor(min / step) * step;
  max = Math.ceil(max / step) * step;
  const marks = [];
  for (let value = min; value <= max + step / 1000; value += step) marks.push(tidy(value));
  return { min: tidy(min), max: tidy(max), ticks: marks };
}

// A log axis that holds low..high: it runs between round numbers (1, 2, 5 times a power of
// ten) and is ruled at each power of ten, with the 2s and 5s as well when it spans less
// than three of them — otherwise a river that only ever runs between 40 and 300 cfs would
// have a single line across its chart.
export function logAxis(low, high) {
  if (!(low > 0) || !(high > 0)) return { min: 1, max: 10, ticks: [1, 10] };
  const steps = [1, 2, 5];
  const down = (value) => { const power = 10 ** Math.floor(Math.log10(value)); return tidy([...steps].reverse().find((step) => step * power <= value * 1.0000001) * power); };
  const up = (value) => { const power = 10 ** Math.floor(Math.log10(value)); return tidy(([...steps, 10].find((step) => step * power >= value / 1.0000001)) * power); };
  const min = down(low);
  let max = up(high);
  if (max <= min) max = up(min * 2);
  const decades = Math.log10(max / min);
  const marks = [];
  for (let power = 10 ** Math.floor(Math.log10(min)); power <= max; power *= 10) {
    for (const step of decades < 3 ? steps : [1]) {
      const value = tidy(step * power);
      if (value >= min && value <= max) marks.push(value);
    }
  }
  return { min, max, ticks: marks };
}

// The lowest and highest value drawn, over every line on the chart. On a log axis only what
// is above zero counts.
export function extent(seriesList, { positive = false } = {}) {
  let low = Infinity;
  let high = -Infinity;
  for (const points of seriesList) {
    for (const point of points || []) {
      if (!Number.isFinite(point.v) || (positive && point.v <= 0)) continue;
      if (point.v < low) low = point.v;
      if (point.v > high) high = point.v;
    }
  }
  return low === Infinity ? null : [low, high];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Dates to name along the bottom, in the viewer's own calendar: days for a week, weeks for a
// month, months for a year, and never more than fit. Each is the start of a day.
export function timeTicks(startMs, endMs, most = 5) {
  const span = endMs - startMs;
  if (!(span > 0)) return [];
  const days = span / DAY;
  const ticks = [];
  if (days > 75) {
    // Whole months, so that a year is twelve of them and not twelve and a bit.
    const months = Math.max(1, Math.round(days / 30.44));
    const every = [1, 2, 3, 6, 12, 24, 60].find((count) => months / count <= most) || 120;
    const first = new Date(startMs);
    const date = new Date(first.getFullYear(), first.getMonth() + 1, 1);
    while (date.getMonth() % every !== 0 && every <= 12) date.setMonth(date.getMonth() + 1);
    for (; date.getTime() <= endMs; date.setMonth(date.getMonth() + every)) {
      ticks.push({ t: date.getTime(), label: date.getMonth() === 0 || every >= 12 ? `${MONTHS[date.getMonth()]} ${date.getFullYear()}` : MONTHS[date.getMonth()] });
    }
    return ticks;
  }
  const every = [1, 2, 3, 7, 14, 28].find((count) => days / count <= most) || 28;
  const first = new Date(startMs);
  const date = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1);
  for (; date.getTime() <= endMs; date.setDate(date.getDate() + every)) {
    ticks.push({ t: date.getTime(), label: `${MONTHS[date.getMonth()]} ${date.getDate()}` });
  }
  return ticks;
}

// A record as the pieces of line to draw: where two readings are further apart than
// `longestGap`, the gauge was down in between and the line is not drawn across it.
export function segments(points, longestGap) {
  const pieces = [];
  let piece = [];
  for (const point of points || []) {
    if (!Number.isFinite(point.v)) continue;
    if (piece.length && point.t - piece[piece.length - 1].t > longestGap) { pieces.push(piece); piece = []; }
    piece.push(point);
  }
  if (piece.length) pieces.push(piece);
  return pieces;
}

const round = (value) => Math.round(value * 10) / 10;

// One piece as an SVG path. A lone reading with nothing either side is a short dash, or it
// would not show at all.
export function linePath(piece, x, y) {
  if (piece.length === 1) return `M${round(x(piece[0].t) - 1.5)} ${round(y(piece[0].v))}h3`;
  return piece.map((point, index) => `${index ? 'L' : 'M'}${round(x(point.t))} ${round(y(point.v))}`).join('');
}

// Where in a record (oldest first) the reading closest in time to `t` is; -1 for an empty one.
export function nearestIndex(points, t) {
  if (!points || points.length === 0) return -1;
  let low = 0;
  let high = points.length - 1;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (points[middle].t < t) low = middle; else high = middle;
  }
  return Math.abs(points[low].t - t) <= Math.abs(points[high].t - t) ? low : high;
}

// The reading closest in time to `t`, or null if the nearest is further off than `within`.
export function nearest(points, t, within = Infinity) {
  const index = nearestIndex(points, t);
  if (index < 0) return null;
  return Math.abs(points[index].t - t) <= within ? points[index] : null;
}

export function axisLabel(value) {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toPrecision(3)));
}
