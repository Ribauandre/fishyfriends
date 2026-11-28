// What a gauge's numbers mean to somebody deciding which river to fish for trout today, and
// how to fish it. Everything here is plain arithmetic on what utils/riverGauges.js reads from
// USGS — the flow now, the day's long-run normals, the last three days' record, the water
// temperature — and every rule is written down where it is applied, so the page can say
// where its words come from.
//
// None of it knows a river. It can't see the colour of the water, a dam being opened or a
// tree across the run, and it has no idea what flow a particular riffle wades at. It is a
// read of the gauge, said plainly, for somebody who will still look at the water.

import { METRICS, NORMAL, REPORTING_WITHIN_HOURS, formatReading } from './riverGauges';
import { nearest } from './gaugeChart';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// --- How much water -----------------------------------------------------------------------
// USGS sorts a day's flow into five classes by where it falls among every year's flow on that
// date: under the 10th percentile ("much below normal"), 10th to 25th ("below"), 25th to
// 75th ("normal"), 75th to 90th ("above") and over the 90th ("much above"). On a riverbank
// those are very low, low, normal, high and very high. Each has a shape as well as a name,
// because the page never says it by colour alone.
export const LEVELS = [
  { key: 'very-low', label: 'Very low', shape: '▼▼' },
  { key: 'low', label: 'Low', shape: '▼' },
  { key: 'normal', label: 'Normal', shape: '●' },
  { key: 'high', label: 'High', shape: '▲' },
  { key: 'very-high', label: 'Very high', shape: '▲▲' },
];
const LEVEL = Object.fromEntries(LEVELS.map((level) => [level.key, level]));
export const levelOf = (key) => LEVEL[key] || null;

//
// Two things are added to USGS's lines. Where a gauge's record is too short for it to give
// the outer two, three times the median and a third of it stand in for them: across the
// club's long-record gauges the 90th percentile sits about three times the median, and the
// 10th about a third of it. And a flow four times the median or more is very high, a quarter
// of it or less very low, whatever the percentiles say: on a flashy brook the 90th percentile
// can be seventeen times the median, and eight times normal is not a river anybody would
// call merely high.
const FAR_TIMES = 3;
const ALWAYS_FAR_TIMES = 4;

export function flowLevel(value, normalsForDay) {
  if (!Number.isFinite(value) || !normalsForDay) return null;
  const median = normalsForDay[NORMAL.median];
  if (value < normalsForDay[NORMAL.low]) return value < (normalsForDay[NORMAL.lowest] ?? median / FAR_TIMES) || value <= median / ALWAYS_FAR_TIMES ? 'very-low' : 'low';
  if (value > normalsForDay[NORMAL.high]) return value > (normalsForDay[NORMAL.highest] ?? median * FAR_TIMES) || value >= median * ALWAYS_FAR_TIMES ? 'very-high' : 'high';
  return 'normal';
}

// How many times the day's median a flow is: the one number that compares a big river with a
// brook. null where there is no median to count from (a stream that is dry on this date most
// years).
export function timesNormal(value, normalsForDay) {
  const median = normalsForDay ? normalsForDay[NORMAL.median] : null;
  return Number.isFinite(value) && median > 0 ? value / median : null;
}

const times = (count) => (count < 9.95 ? count.toFixed(1).replace(/\.0$/, '') : Math.round(count).toLocaleString('en-US'));

// Above normal it is said in times ("2.8× normal"), below it as a share ("62% of normal"):
// nobody says a river is at 0.6 times.
export function timesNormalText(ratio) {
  if (!Number.isFinite(ratio)) return '';
  if (ratio >= 0.95 && ratio < 1.05) return 'right at normal';
  if (ratio < 0.95) return ratio < 0.005 ? '<1% of normal' : `${Math.max(1, Math.round(ratio * 100))}% of normal`;
  return `${times(ratio)}× normal`;
}

// --- Which way it is going ----------------------------------------------------------------
// A river is rising or dropping when it has changed by a tenth or more since this time
// yesterday and is still going that way, or by 8% in the last six hours whatever yesterday
// was. Anything less is steady: a gauge wanders a few percent by itself. "Fast" is a quarter
// or more in six hours.
const MOVED_IN_A_DAY = 0.1;
const MOVED_IN_SIX_HOURS = 0.08;
const STILL_MOVING = 0.01;
const FAST_IN_SIX_HOURS = 0.25;
// A peak (or a low) is worth a mention when it was at least a quarter off where the river is
// now, and at least two hours ago.
const STANDS_OUT = 0.25;

const changeFrom = (before, after) => {
  if (!before) return null;
  if (before.v > 0) return after.v / before.v - 1;
  return after.v > 0 ? Infinity : 0;
};

// `points` is the last three days' record, oldest first; its last reading is "now". Comes
// back as { direction: 'rising' | 'dropping' | 'steady', fast, daily, recent, dayAgo, high,
// low }: `daily` and `recent` are the change since this time yesterday and in the last six
// hours (0.25 is a quarter more), `dayAgo` yesterday's reading, `high` the highest reading in
// the record if it stands out above now (`crest` when the river rose into it, rather than the
// record simply starting there) and `low` the lowest if now stands out above it. null with
// nothing to go on.
export function flowTrend(points) {
  if (!points || points.length === 0) return null;
  const last = points[points.length - 1];
  const dayAgo = nearest(points, last.t - DAY, 3 * HOUR);
  const sixAgo = nearest(points, last.t - 6 * HOUR, 1.5 * HOUR);
  const daily = dayAgo === last ? null : changeFrom(dayAgo, last);
  const recent = sixAgo === last ? null : changeFrom(sixAgo, last);
  if (daily === null && recent === null) return null;

  let direction = 'steady';
  if (recent !== null && Math.abs(recent) >= MOVED_IN_SIX_HOURS) direction = recent > 0 ? 'rising' : 'dropping';
  else if (daily !== null && Math.abs(daily) >= MOVED_IN_A_DAY && (recent === null || (recent * daily > 0 && Math.abs(recent) >= STILL_MOVING))) direction = daily > 0 ? 'rising' : 'dropping';
  const fast = direction !== 'steady' && recent !== null && Math.abs(recent) >= FAST_IN_SIX_HOURS;

  let top = points[0];
  let bottom = points[0];
  let rose = false;
  let lowestSoFar = points[0].v;
  for (const point of points) {
    // (The later of two equal readings: the peak is where the river turned.)
    if (point.v >= top.v) { top = point; rose = lowestSoFar < point.v * 0.95; }
    if (point.v <= bottom.v) bottom = point;
    if (point.v < lowestSoFar) lowestSoFar = point.v;
  }
  const longAgo = (point) => last.t - point.t >= 2 * HOUR;
  const high = longAgo(top) && top.v >= last.v * (1 + STANDS_OUT) ? { t: top.t, v: top.v, crest: rose } : null;
  const low = longAgo(bottom) && last.v >= bottom.v * (1 + STANDS_OUT) ? { t: bottom.t, v: bottom.v } : null;
  return { direction, fast, daily, recent, dayAgo: dayAgo && dayAgo !== last ? dayAgo.v : null, high, low };
}

export const trendLabel = (trend) => (trend ? `${trend.direction}${trend.fast ? ' fast' : ''}` : '');

// A change in words: "up 38%", "down 22%", "2.4 times what it was".
export function changeText(change) {
  if (change === null || change === undefined || Number.isNaN(change)) return '';
  if (change === Infinity) return 'up from nothing';
  if (Math.abs(change) < 0.005) return 'unchanged';
  if (change >= 0.995) return `${times(1 + change)} times what it was`;
  return `${change > 0 ? 'up' : 'down'} ${Math.max(1, Math.round(Math.abs(change) * 100))}%`;
}

// When something happened, the way it is said on a riverbank and on the viewer's own clock:
// "3 hours ago", "this morning", "yesterday afternoon", "on Thursday night".
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const partOfDay = (hour) => (hour < 5 ? 'early' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night');

export function whenText(t, now = Date.now()) {
  const hours = Math.round((now - t) / HOUR);
  if (hours < 1) return 'within the hour';
  if (hours < 6) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  const then = new Date(t);
  const today = new Date(now);
  const midnight = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(today) - midnight(then)) / DAY);
  const part = partOfDay(then.getHours());
  if (days <= 0) return part === 'early' ? 'early this morning' : part === 'night' ? 'tonight' : `this ${part}`;
  if (days === 1) return part === 'early' ? 'early yesterday' : part === 'night' ? 'last night' : `yesterday ${part}`;
  const weekday = WEEKDAYS[then.getDay()];
  return part === 'early' ? `early on ${weekday}` : `on ${weekday} ${part}`;
}

const cfs = (value) => `${formatReading(value, METRICS.flow)} cfs`;

// The story behind the direction, where the record holds one: the peak a dropping river is
// coming down from, or the low a rising one came up from.
export function trendNote(trend, now = Date.now()) {
  if (!trend) return '';
  if (trend.direction !== 'rising' && trend.high) return trend.high.crest ? `Peaked at ${cfs(trend.high.v)} ${whenText(trend.high.t, now)}.` : `Down from ${cfs(trend.high.v)} ${whenText(trend.high.t, now)}.`;
  if (trend.direction === 'rising' && trend.low) return `Up from ${cfs(trend.low.v)} ${whenText(trend.low.t, now)}.`;
  return '';
}

// --- Water temperature, for trout ---------------------------------------------------------
// The bands state fisheries agencies and guides give, in °F. Under 40 trout barely move; 40
// to 50 they feed but won't chase; 50 to 65 is where they are comfortable (Maryland DNR:
// "below 65 °F: preferred temperatures, fishing is generally good"); 65 to 67 is fish-the-
// morning-and-handle-them-gently water; and from 68 "trout feed less, fishing is generally
// poor, trout highly vulnerable to handling stress" — the point to leave them alone.
export const TROUT_BANDS = [
  { key: 'cold', below: 40, label: 'Cold', says: 'Cold for trout' },
  { key: 'cool', below: 50, label: 'Cool', says: 'Cool for trout' },
  { key: 'prime', below: 65, label: 'Prime', says: 'Right for trout' },
  { key: 'warm', below: 68, label: 'Warm', says: 'Warm for trout' },
  { key: 'hot', below: Infinity, label: 'Too warm', says: 'Too warm for trout' },
];
const BAND = Object.fromEntries(TROUT_BANDS.map((band) => [band.key, band]));
export const bandOf = (key) => BAND[key] || null;

// A temperature is banded as it is shown, to a tenth of a degree: 67.96 reads "68.0" on the
// page and is 68 here.
const shown = (degrees) => Math.round(degrees * 10) / 10;

export function troutBand(degrees) {
  if (!Number.isFinite(degrees)) return null;
  return TROUT_BANDS.find((band) => shown(degrees) < band.below).key;
}

// The coldest and the warmest the water has been in the day up to `until`. In summer the
// afternoon high is the number that matters: a river at 64 at breakfast can be at 70 by four.
export function dayRange(points, until) {
  const values = (points || []).filter((point) => point.t <= until && point.t > until - DAY).map((point) => point.v);
  return values.length < 2 ? null : { low: Math.min(...values), high: Math.max(...values) };
}

const degrees = (value) => `${formatReading(value, METRICS.temp)} ${METRICS.temp.unit}`;

// --- One gauge, read ----------------------------------------------------------------------
// `record` is the last three days as measured ({ flow: [...], temp: [...] }, either missing
// for a gauge that doesn't measure it), `normalsForDay` flow's five lines for today's date.
// A gauge whose newest reading is more than a day old is not reporting, and is not read.
export function readGauge({ record, normalsForDay, now = Date.now() }) {
  const newest = (points) => {
    const last = points && points[points.length - 1];
    return last && now - last.t <= REPORTING_WITHIN_HOURS * HOUR ? last : null;
  };
  const flow = newest(record && record.flow);
  const temp = newest(record && record.temp);
  return {
    flow,
    temp,
    level: flow ? flowLevel(flow.v, normalsForDay) : null,
    ratio: flow ? timesNormal(flow.v, normalsForDay) : null,
    normal: normalsForDay ? { median: normalsForDay[NORMAL.median], low: normalsForDay[NORMAL.low], high: normalsForDay[NORMAL.high] } : null,
    trend: flow ? flowTrend(record.flow) : null,
    band: temp ? troutBand(temp.v) : null,
    tempDay: temp ? dayRange(record.temp, temp.t) : null,
  };
}

// The read in three or four words: "High and dropping", "Normal and steady".
export function readTitle(read) {
  if (!read || !read.flow) return 'Not reporting';
  const level = read.level ? levelOf(read.level).label : '';
  const trend = trendLabel(read.trend);
  if (level && trend) return `${level} and ${trend}`;
  if (level) return level;
  return trend ? `${trend[0].toUpperCase()}${trend.slice(1)}` : 'Reporting';
}

// --- How to fish it -----------------------------------------------------------------------
// A few plain sentences, each from one number: how much water, which way it is going, how
// warm it is. They are the common ground of what guides and fisheries agencies say about
// high water (trout leave the heavy current for the soft water at the edges; more weight,
// heavier line), low water (they see you coming; finer and smaller) and warm water — and no
// more particular than that. They are written for whatever somebody fishes with: the club is
// not all fly rods.
const FLOW_NOTES = {
  'very-low': 'Very low, and almost certainly clear. Trout see you coming: stay back, keep low, and go finer and smaller in everything you tie on. The deep pools and the broken water hold the fish.',
  low: 'Low and probably clear. Go quietly, and fish a finer line and a smaller fly or lure than usual. The deeper runs and pools are where to look.',
  normal: 'About its usual flow for the date: fish it the way you normally would.',
  high: 'More push than usual. Trout slide out of the heavy current to the soft edges, seams and eddies near the bank: fish those, with more weight and heavier line than usual (3X or 4X tippet on a fly rod).',
  'very-high': 'A lot more water than is usual, and likely off-colour. Fish it from the bank if at all: trout sit in the soft water within a foot or two of it. Something big, dark and heavy, fished slow, on stout line. Smaller streams drop and clear first.',
};

function trendAdvice(read) {
  const { trend, level } = read;
  if (!trend || trend.direction === 'steady') return '';
  const up = level === 'normal' || level === 'high' || level === 'very-high' || !level;
  if (trend.direction === 'rising') {
    if (trend.fast) return 'Rising fast. It can be a different river in an hour: stay close to the bank and keep an eye on the water around you.';
    return up ? 'Still coming up: expect more push and more colour in a few hours than there is now.' : 'Coming up, which it needs.';
  }
  if (level === 'high' || level === 'very-high') return 'On its way down, and it should clear as it drops: watch for the colour to go.';
  if (level === 'low' || level === 'very-low') return 'And still dropping.';
  return '';
}

function temperatureAdvice(read) {
  if (!read.temp || !read.band) return '';
  const now = read.temp.v;
  const said = degrees(now);
  const peak = read.tempDay ? read.tempDay.high : null;
  let note = '';
  if (read.band === 'cold') note = `Water is cold (${said}). Trout hold deep and won't move far to feed: fish slow and near the bottom. The afternoon is usually the best of it.`;
  else if (read.band === 'cool') note = `Water is cool (${said}). Trout feed but won't chase: slow everything down. Late morning through the afternoon is usually best.`;
  else if (read.band === 'prime') note = shown(now) < 60 ? `Water is right where trout like it (${said}): they should be active through the day.` : `Water is at the warm end of what trout like (${said}): early and late in the day are best.`;
  else if (read.band === 'warm') note = `Water is warm for trout (${said}). Fish the morning, play fish quickly and keep them in the water.`;
  else note = `Water is too warm for trout (${said}). A fish played now may not recover: leave them be and fish for something else.`;
  // Yesterday afternoon says what this afternoon will do.
  if (peak !== null && read.band !== 'hot' && troutBand(peak) === 'hot') note += ` It reached ${degrees(peak)} in the last day: mornings only.`;
  else if (peak !== null && (read.band === 'cold' || read.band === 'cool' || read.band === 'prime') && troutBand(peak) === 'warm') note += ` It got to ${degrees(peak)} in the last day, so the morning is the time.`;
  return note;
}

// [{ key: 'flow' | 'trend' | 'water', text }], in that order, leaving out what there is
// nothing to say about.
export function fishingNotes(read) {
  if (!read || !read.flow) return [];
  return [
    { key: 'flow', text: read.level ? FLOW_NOTES[read.level] : '' },
    { key: 'trend', text: trendAdvice(read) },
    { key: 'water', text: temperatureAdvice(read) },
  ].filter((note) => note.text);
}

// --- All the gauges together --------------------------------------------------------------
// `reads` is one read a gauge being shown. Counted: how many gauges there are, how many are
// reporting, how many USGS can rate (and how many of those at each level), and of the ones
// with a direction (`trended`) how many are rising and dropping.
export function tally(reads) {
  const counts = { gauges: reads.length, reporting: 0, rated: 0, levels: Object.fromEntries(LEVELS.map((level) => [level.key, 0])), trended: 0, rising: 0, dropping: 0 };
  for (const read of reads) {
    if (!read || !read.flow) continue;
    counts.reporting += 1;
    if (read.level) { counts.rated += 1; counts.levels[read.level] += 1; }
    if (read.trend) { counts.trended += 1; if (read.trend.direction !== 'steady') counts[read.trend.direction] += 1; }
  }
  return counts;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// "late November", from a 'YYYY-MM-DD' date: what "normal" is normal for.
export function timeOfYear(day) {
  const [, month, date] = String(day || '').split('-').map(Number);
  if (!MONTHS[month - 1] || !date) return 'today';
  return `${date <= 10 ? 'early ' : date <= 20 ? 'mid-' : 'late '}${MONTHS[month - 1]}`;
}

const listed = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
// The share of the rated gauges that makes "most of them".
const MOST = 0.6;

// The sentence at the top of the page: how the club's rivers are running for the time of
// year, which way they are going, and — when it is the exception — which are in their usual
// range. The counts under it carry the numbers, so it doesn't. `where` is the state's name
// (for when nothing is reporting), `day` today's date, and `inShape` the names of the rivers
// running in their usual range.
export function headline(counts, { where = '', day = '', inShape = [] } = {}) {
  if (counts.reporting === 0) return `No gauge in ${where} is reporting right now.`;
  const total = `${counts.reporting} ${counts.reporting === 1 ? 'gauge' : 'gauges'}`;
  if (counts.rated === 0) return `${total} reporting. USGS has no long-run record to say what is normal for ${counts.reporting === 1 ? 'it' : 'them'} today.`;

  const season = timeOfYear(day);
  const { levels, rising, dropping } = counts;
  const most = counts.rated * MOST;
  let gist = `A mixed picture for ${season}`;
  if (levels.normal >= most) gist = `Near normal for ${season}`;
  else if (levels.high + levels['very-high'] >= most) gist = `Running high for ${season}`;
  else if (levels.low + levels['very-low'] >= most) gist = `Running low for ${season}`;

  const gauges = (count) => `${count} ${count === 1 ? 'gauge is' : 'gauges are'}`;
  let moving = '';
  if (counts.trended > 0) {
    const mostly = counts.trended * MOST;
    if (rising === 0 && dropping === 0) moving = ' and holding steady';
    else if (dropping >= mostly) moving = rising ? ` and mostly dropping; ${gauges(rising)} still rising` : ' and dropping';
    else if (rising >= mostly) moving = dropping ? ` and mostly rising; ${gauges(dropping)} dropping` : ' and rising';
    else if (rising && dropping) moving = `: ${gauges(rising)} rising and ${dropping} dropping`;
    else moving = `; ${gauges(rising || dropping)} ${rising ? 'rising' : 'dropping'}`;
  }

  // Worth naming when they are the exception, and few enough to name.
  const named = levels.normal < most && inShape.length > 0 && inShape.length <= 4 ? ` In the usual range: ${listed(inShape)}.` : '';
  return `${gist}${moving}.${named}`;
}

// What the average water temperature means for trout, in a few words after the figure.
export function waterNote(average) {
  if (!average) return '';
  const band = troutBand(average.mean);
  const warmest = troutBand(average.high);
  const tail = band !== 'hot' && warmest === 'hot' ? ' The warmest of them is too warm.' : '';
  if (band === 'cold') return `Cold for trout: fish slow and deep, and expect the afternoon to be best.${tail}`;
  if (band === 'cool') return `Cool for trout: they feed, but slowly.${tail}`;
  if (band === 'prime') return `Right where trout like it.${tail}`;
  if (band === 'warm') return `Warm for trout: fish the morning and handle them gently.${tail}`;
  return 'Too warm for trout.';
}
