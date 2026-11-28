// River gauges: what the club's rivers are doing, read straight from the U.S. Geological
// Survey each time the page is opened. Nothing here is stored by the app except which gauges
// the club watches (the river_gauges table, migration 0048) and a copy of each gauge's
// long-run normals kept on the device, because those barely change.
//
// Two USGS services, both free, key-less and readable from a browser:
//
//   * the Water Data API (api.waterdata.usgs.gov/ogcapi/v1) — a gauge's 15-minute record,
//     its daily means, and the catalogue of stations. One request takes many gauges at once
//     (comma-separated ids), which matters: without a key USGS allows a connection only so
//     many requests an hour, so every question is put about a whole state at once. The last
//     three days of flow and water temperature come back in one answer, and its newest
//     readings are what each gauge is doing now. That record is asked for as CSV: the same
//     rows as JSON at an eighth of the size on the wire (three days of the club's thirty-two
//     gauges is 55 KB instead of 450).
//   * the Statistics API (api.waterdata.usgs.gov/statistics/v0, still labelled beta) — for
//     each day of the year, the median and percentiles of that day's flow over every year
//     on record. "Normal for today" is USGS's own convention: between the 25th and 75th
//     percentile; below the 10th and above the 90th are its "much below" and "much above".
//
// This is the modern API on purpose. The older waterservices.usgs.gov, which every tutorial
// still points at, is being switched off in early 2027.
//
// Everything that decides something is a pure function, tested without a network; the
// fetchers take `fetchImpl` so tests hand them answers shaped like the real ones.

export const USGS_API = 'https://api.waterdata.usgs.gov';
const OGC = `${USGS_API}/ogcapi/v1/collections`;
const STATISTICS = `${USGS_API}/statistics/v0/observationNormals`;

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

export const METRICS = {
  flow: { key: 'flow', label: 'Flow', parameter: '00060', unit: 'cfs', name: 'flow' },
  // USGS reports water temperature in Celsius; anglers here think in Fahrenheit.
  temp: { key: 'temp', label: 'Water temp', parameter: '00010', unit: '°F', name: 'water temperature', convert: (celsius) => (celsius * 9) / 5 + 32 },
};

// Three days is the stretch the page opens with: it is the record every gauge's line on the
// list is already read from (RECENT_HOURS), so a chart of it asks USGS for nothing more.
export const PERIODS = [
  { key: '3d', label: '3 days', days: 3 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '1y', label: '1 year', days: 365 },
  { key: 'custom', label: 'Custom' },
];

// A gauge is reporting if its newest reading is from the last 24 hours. Older than that it
// is not: a gauge that has gone quiet shouldn't be held against today's normal, and some of
// the club's gauges stopped measuring temperature years ago while USGS still hands back
// that last value.
export const REPORTING_WITHIN_HOURS = 24;
// How long a set of readings stands before the page loads new ones by itself. USGS gauges
// send theirs every fifteen minutes to an hour.
export const FRESH_FOR_MINUTES = 15;
// How far back the record behind the list goes: enough to say which way a river is going,
// where it peaked after the last rain, and how warm the water got yesterday afternoon.
export const RECENT_HOURS = 72;
// The longest stretch a custom range may cover, in days: the daily record of every gauge in
// a state is fetched for it at once.
export const LONGEST_CUSTOM_DAYS = 3 * 366;
// Gauges per request. Ids travel in the address, and a long list is split.
const SITES_PER_REQUEST = 40;

export const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'],
  ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'],
  ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'],
  ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['PR', 'Puerto Rico'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'],
  ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'],
  ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
];
const STATE_NAME = new Map(US_STATES);
const STATE_CODE = new Map(US_STATES.map(([code, name]) => [name.toLowerCase(), code]));
export const stateName = (code) => STATE_NAME.get(code) || code;
export const stateCode = (name) => STATE_CODE.get(String(name || '').trim().toLowerCase()) || '';

export const siteId = (siteNo) => `USGS-${siteNo}`;
export const gaugeLink = (siteNo) => `https://waterdata.usgs.gov/monitoring-location/${siteId(siteNo)}/`;

// --- Days ---------------------------------------------------------------------------------
// A daily value belongs to a date, not an instant. Dates are 'YYYY-MM-DD' strings and are
// drawn at noon UTC of that date, so a daily mean sits in the middle of its day whatever
// zone the phone is in.
const pad = (value) => String(value).padStart(2, '0');
export const dayOf = (ms) => { const date = new Date(ms); return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`; };
export const dayToMs = (day) => { const [year, month, date] = day.split('-').map(Number); return Date.UTC(year, month - 1, date, 12); };
export const dayOfYear = (day) => day.slice(5);
const isDay = (text) => /^\d{4}-\d{2}-\d{2}$/.test(String(text || '')) && dayOf(dayToMs(text)) === text;

// The same date a year away. A 29 February has no such date in a year that isn't a leap
// year: null, and that day is simply missing from the comparison.
export function shiftYear(day, years) {
  const [year, month, date] = day.split('-').map(Number);
  const shifted = `${year + years}-${pad(month)}-${pad(date)}`;
  return isDay(shifted) ? shifted : null;
}

// What a period covers, as instants for the chart and as dates for the daily record.
// `custom` is { start, end } in dates; a range that isn't one comes back as { error }.
export function periodRange(period, now = Date.now(), custom = {}) {
  if (period === 'custom') {
    if (!isDay(custom.start) || !isDay(custom.end)) return { error: 'Pick a start and an end date.' };
    if (custom.start > custom.end) return { error: 'The start date is after the end date.' };
    const days = Math.round((dayToMs(custom.end) - dayToMs(custom.start)) / DAY) + 1;
    if (days > LONGEST_CUSTOM_DAYS) return { error: 'That\'s more than three years. Pick a shorter stretch.' };
    const startMs = dayToMs(custom.start) - DAY / 2;
    return { startMs, endMs: Math.min(dayToMs(custom.end) + DAY / 2, Math.max(now, startMs + DAY)), startDay: custom.start, endDay: custom.end, days, live: custom.end >= dayOf(now) };
  }
  const days = (PERIODS.find((candidate) => candidate.key === period) || PERIODS[0]).days;
  return { startMs: now - days * DAY, endMs: now, startDay: dayOf(now - days * DAY), endDay: dayOf(now), days, live: true };
}

// Every date from one to another, inclusive.
export function daysBetween(startDay, endDay) {
  const days = [];
  for (let ms = dayToMs(startDay); ms <= dayToMs(endDay) && days.length < 2000; ms += DAY) days.push(dayOf(ms));
  return days;
}

// --- Asking USGS --------------------------------------------------------------------------
export class GaugeDataError extends Error {
  constructor(message, status) { super(message); this.name = 'GaugeDataError'; this.status = status || 0; }
}

async function answer(url, { fetchImpl, fresh = false, timeout = 25000 } = {}) {
  const request = fetchImpl || window.fetch.bind(window);
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  let response;
  try {
    // "fresh" is the Refresh button: USGS lets a browser keep an answer for an hour.
    response = await request(url, { ...(fresh ? { cache: 'reload' } : {}), ...(controller ? { signal: controller.signal } : {}) });
  } catch (problem) {
    throw new GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (response.status === 429) throw new GaugeDataError('USGS is limiting how often this connection can ask. Give it a few minutes and try again.', 429);
  if (!response.ok) throw new GaugeDataError(`USGS answered with an error (${response.status}). Try again in a little while.`, response.status);
  return response;
}

const unreadable = (status) => new GaugeDataError('USGS sent back something that couldn\'t be read. Try again in a little while.', status);

async function getJson(url, options) {
  const response = await answer(url, options);
  try {
    return await response.json();
  } catch (problem) {
    throw unreadable(response.status);
  }
}

async function getText(url, options) {
  const response = await answer(url, options);
  try {
    return await response.text();
  } catch (problem) {
    throw unreadable(response.status);
  }
}

const chunks = (list, size) => { const out = []; for (let at = 0; at < list.length; at += size) out.push(list.slice(at, at + size)); return out; };
const query = (params) => Object.entries(params).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');

// Rows of one collection for a list of gauges: the list is split so no address gets too
// long, and a "next" page is followed while USGS offers one from its own host.
async function items(collection, siteNos, params, options) {
  const rows = [];
  for (const part of chunks(siteNos, SITES_PER_REQUEST)) {
    let url = `${OGC}/${collection}/items?${query({ f: 'json', monitoring_location_id: part.map(siteId).join(','), skipGeometry: 'true', limit: 10000, ...params })}`;
    for (let page = 0; url && page < 8; page += 1) {
      // eslint-disable-next-line no-await-in-loop
      const body = await getJson(url, options);
      for (const feature of body.features || []) rows.push(feature.properties || {});
      const next = (body.links || []).find((link) => link.rel === 'next')?.href;
      url = next && next.startsWith(`${USGS_API}/`) ? next : null;
    }
  }
  return rows;
}

const siteOf = (row) => String(row.monitoring_location_id || '').replace(/^USGS-/, '');
const numberOf = (text) => { const value = Number(text); return text !== null && text !== '' && Number.isFinite(value) ? value : null; };

// The most recent reading of each gauge, for every measurement asked about, in one question:
// Map of site number -> { flow: { t, v }, temp: { t, v } }, holding only what the gauge has
// reported in the last day (many gauges have no thermometer, and each measurement keeps its
// own clock: a gauge whose thermometer went quiet years ago is still reporting flow). A gauge
// with none of it is left out. This is what the add-a-gauge search goes by, to offer only
// stations that are flowing; the list reads what its gauges are doing off the end of their
// three-day record (fetchMeasured, newestOf), and asks nothing more for it.
export async function fetchLatest(siteNos, metrics, { now = Date.now(), ...options } = {}) {
  const latest = new Map();
  if (siteNos.length === 0 || metrics.length === 0) return latest;
  const asked = new Map(metrics.map((metric) => [metric.parameter, metric]));
  const rows = await items('latest-continuous', siteNos, { parameter_code: [...asked.keys()].join(','), properties: 'monitoring_location_id,parameter_code,time,value' }, options);
  for (const row of rows) {
    const metric = asked.get(row.parameter_code);
    const t = Date.parse(row.time);
    const raw = numberOf(row.value);
    if (!metric || !Number.isFinite(t) || raw === null || now - t > REPORTING_WITHIN_HOURS * HOUR) continue;
    const site = siteOf(row);
    const readings = latest.get(site) || {};
    const known = readings[metric.key];
    if (!known || t > known.t) latest.set(site, { ...readings, [metric.key]: { t, v: metric.convert ? metric.convert(raw) : raw } });
  }
  return latest;
}

// One measurement out of that answer: Map of site number -> { t, v }, for the gauges that
// report it.
export function readingsOf(latest, key) {
  const readings = new Map();
  latest.forEach((found, site) => { if (found[key]) readings.set(site, found[key]); });
  return readings;
}

// A daily value carries its date as well as where it is drawn (`day`): the date is what it
// is called, in whatever zone the phone is in, and noon UTC is only where the point sits.
function seriesBySite(rows, metric, timeOf, dated = false) {
  const series = new Map();
  for (const row of rows) {
    const t = timeOf(row.time);
    const raw = numberOf(row.value);
    if (!Number.isFinite(t) || raw === null) continue;
    const site = siteOf(row);
    if (!series.has(site)) series.set(site, []);
    series.get(site).push({ t, v: metric.convert ? metric.convert(raw) : raw, ...(dated ? { day: row.time } : {}) });
  }
  for (const points of series.values()) points.sort((a, b) => a.t - b.t);
  return series;
}

// Daily means from one date to another: Map of site number -> [{ t, v }], oldest first.
export async function fetchDaily(siteNos, metric, startDay, endDay, options) {
  if (siteNos.length === 0) return new Map();
  // (A year of daily values for a state's thirty-odd gauges is more rows than one page holds by default: asked for in one.)
  const rows = await items('daily', siteNos, { parameter_code: metric.parameter, statistic_id: '00003', time: `${startDay}/${endDay}`, limit: 50000, properties: 'monitoring_location_id,time,value' }, options);
  return seriesBySite(rows, metric, (day) => (isDay(day) ? dayToMs(day) : NaN), true);
}

// --- The record as measured ---------------------------------------------------------------
// The most rows USGS hands back in one answer.
const MOST_ROWS = 50000;

// USGS's answer as CSV: a line of column names, then a line a reading. The columns are found
// by name, so their order (and the empty x and y that lead them) is USGS's business. An
// answer with no readings in it is an empty one.
export function readCsv(text) {
  const lines = String(text || '').split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return [];
  const cells = (line) => line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
  const names = cells(lines[0]);
  const at = { site: names.indexOf('monitoring_location_id'), parameter: names.indexOf('parameter_code'), time: names.indexOf('time'), value: names.indexOf('value') };
  if (at.site < 0 || at.time < 0 || at.value < 0) throw unreadable(200);
  const rows = [];
  for (let line = 1; line < lines.length; line += 1) {
    const values = cells(lines[line]);
    rows.push({ monitoring_location_id: values[at.site], parameter_code: at.parameter < 0 ? '' : values[at.parameter], time: values[at.time], value: values[at.value] });
  }
  return rows;
}

// A record with at most one reading for each stretch `every` long: the last one, so the
// newest point is always the newest reading.
export function thinned(points, every) {
  const kept = [];
  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last && Math.floor(last.t / every) === Math.floor(point.t / every)) kept[kept.length - 1] = point;
    else kept.push(point);
  }
  return kept;
}
export const hourly = (points) => thinned(points, HOUR);

// The record as measured (every 15 minutes or so) between two instants, for several
// measurements in one question: Map of site number -> { flow: [{ t, v }], temp: [...] },
// oldest first, holding only what a gauge measures (most have no thermometer). `every` thins
// each record to one reading a stretch that long.
export async function fetchMeasured(siteNos, metrics, startMs, endMs, { every = 0, ...options } = {}) {
  const found = new Map();
  if (siteNos.length === 0 || metrics.length === 0) return found;
  const asked = new Map(metrics.map((metric) => [metric.parameter, metric]));
  const time = `${new Date(startMs).toISOString().slice(0, 19)}Z/${new Date(endMs).toISOString().slice(0, 19)}Z`;
  const queue = chunks(siteNos, SITES_PER_REQUEST);
  while (queue.length > 0) {
    const part = queue.shift();
    const url = `${OGC}/continuous/items?${query({ f: 'csv', monitoring_location_id: part.map(siteId).join(','), skipGeometry: 'true', limit: MOST_ROWS, parameter_code: [...asked.keys()].join(','), time, properties: 'monitoring_location_id,parameter_code,time,value' })}`;
    // eslint-disable-next-line no-await-in-loop
    const rows = readCsv(await getText(url, options));
    // A full answer is a cut-off one, and CSV has no "next page" to follow: the same gauges
    // are asked about again, half of them at a time.
    if (rows.length >= MOST_ROWS && part.length > 1) {
      const half = Math.ceil(part.length / 2);
      queue.unshift(part.slice(0, half), part.slice(half));
      continue;
    }
    for (const row of rows) {
      const metric = asked.get(row.parameter_code) || (asked.size === 1 ? metrics[0] : null);
      // (CSV writes an instant with a space where JSON has a T, which not every browser reads.)
      const t = Date.parse(String(row.time || '').replace(' ', 'T'));
      const raw = numberOf(row.value);
      if (!metric || !Number.isFinite(t) || raw === null) continue;
      const site = siteOf(row);
      if (!found.has(site)) found.set(site, {});
      const records = found.get(site);
      if (!records[metric.key]) records[metric.key] = [];
      records[metric.key].push({ t, v: metric.convert ? metric.convert(raw) : raw });
    }
  }
  for (const records of found.values()) {
    for (const key of Object.keys(records)) {
      records[key].sort((a, b) => a.t - b.t);
      if (every > 0) records[key] = thinned(records[key], every);
    }
  }
  return found;
}

// One measurement out of that answer: Map of site number -> [{ t, v }], for the gauges that
// have it.
export function seriesOf(measured, key) {
  const series = new Map();
  measured.forEach((records, site) => { if (records[key] && records[key].length > 0) series.set(site, records[key]); });
  return series;
}

// What each gauge is doing now, out of the same answer: Map of site number -> { t, v }, the
// newest reading of one measurement, for the gauges that have reported it in the last day
// (each measurement keeps its own clock: a gauge whose thermometer went quiet is still
// reporting flow).
export function newestOf(measured, key, now = Date.now()) {
  const newest = new Map();
  measured.forEach((records, site) => {
    const points = records[key];
    const last = points && points[points.length - 1];
    if (last && now - last.t <= REPORTING_WITHIN_HOURS * HOUR) newest.set(site, last);
  });
  return newest;
}

// One measurement's record, thinned to a point an hour: a week of it is ten thousand readings
// for a dozen gauges, and a phone's chart is three hundred pixels wide.
export async function fetchContinuous(siteNos, metric, startMs, endMs, options) {
  return seriesOf(await fetchMeasured(siteNos, [metric], startMs, endMs, { ...options, every: HOUR }), metric.key);
}

// --- Normals ------------------------------------------------------------------------------
// For each gauge and day of the year, five lines through the daily means of every year on
// record: the 10th, 25th, 50th (the median), 75th and 90th percentile. The middle three are
// always there; the outer two are null for a gauge whose record is too short for USGS to
// give them (it wants more years for the edges than for the middle).
export const NORMAL = { lowest: 0, low: 1, median: 2, high: 3, highest: 4 };
const NORMALS_KEY = 'fishyfriends:gauge-normals';
const NORMALS_KEEP_MS = 30 * DAY;
// (One entry a gauge and measurement: the club's list in one state is thirty-odd gauges, and
// each is kept for flow and for temperature.)
const NORMALS_KEEP_SITES = 160;
// What is kept changed shape when the outer two lines were added: a copy from before is not
// read, and is replaced the first time the page is opened.
const NORMALS_VERSION = 2;

function readNormals(storage) {
  try {
    const saved = JSON.parse(storage.getItem(NORMALS_KEY) || 'null');
    return saved && saved.version === NORMALS_VERSION && saved.sites && typeof saved.sites === 'object' ? saved.sites : {};
  } catch (problem) {
    return {};
  }
}

function writeNormals(storage, sites) {
  try {
    const newest = Object.entries(sites).sort((a, b) => b[1].at - a[1].at).slice(0, NORMALS_KEEP_SITES);
    storage.setItem(NORMALS_KEY, JSON.stringify({ version: NORMALS_VERSION, sites: Object.fromEntries(newest) }));
  } catch (problem) {
    // Storage that is full or switched off: the normals are just asked for again next time.
  }
}

// One gauge's part of the statistics answer -> { 'MM-DD': [p10, p25, p50, p75, p90] }. A gauge
// can have more than one record of the same thing (a sensor that was moved); the longest is
// used.
export function normalsFromFeature(feature, parameter) {
  let best = null;
  for (const record of feature?.properties?.data || []) {
    if (record.parameter_code !== parameter || record.parent_statistic_id !== '00003') continue;
    const days = {};
    let years = 0;
    for (const entry of record.values || []) {
      if (entry.computation !== 'percentile' || !Array.isArray(entry.percentiles) || !Array.isArray(entry.values)) continue;
      const at = (percentile) => numberOf(entry.values[entry.percentiles.indexOf(percentile)] ?? null);
      const [lowest, low, median, high, highest] = [at('10'), at('25'), at('50'), at('75'), at('90')];
      if (low === null || median === null || high === null || !/^\d{2}-\d{2}$/.test(entry.time_of_year || '')) continue;
      days[entry.time_of_year] = [lowest, low, median, high, highest];
      years = Math.max(years, Number(entry.sample_count) || 0);
    }
    if (Object.keys(days).length && (!best || years > best.years)) best = { days, years };
  }
  return best;
}

// Normals for the days from startDay to endDay: Map of site number -> { 'MM-DD': [p10, p25,
// p50, p75, p90] }, in the metric's display unit. What the device already holds is not asked for
// again; a short stretch asks for just those days, a long one (or one that crosses New
// Year) for the whole year. `ahead` is how many days past the stretch to ask for while it is
// asking anyway: the list wants today's normals every day, and with a fortnight in hand
// tomorrow's visit finds tomorrow already on the device.
export async function fetchNormals(siteNos, metric, startDay, endDay, { storage, now = Date.now(), ahead = 0, ...options } = {}) {
  const wanted = [...new Set(daysBetween(startDay, endDay).map(dayOfYear))];
  const kept = storage ? readNormals(storage) : {};
  const keyOf = (site) => `${site}|${metric.parameter}`;
  const missing = siteNos.filter((site) => {
    const entry = kept[keyOf(site)];
    return !entry || now - entry.at > NORMALS_KEEP_MS || (!entry.none && wanted.some((day) => !(day in entry.days) && !entry.whole));
  });

  if (missing.length) {
    const first = dayOfYear(startDay);
    const last = dayOfYear(endDay);
    const whole = wanted.length > 120 || first > last;
    // (Not across New Year: a stretch of days of the year can't run from December into January.)
    const beyond = ahead > 0 ? dayOfYear(dayOf(dayToMs(endDay) + ahead * DAY)) : last;
    const until = beyond > last ? beyond : last;
    for (const part of chunks(missing, SITES_PER_REQUEST)) {
      const found = new Map();
      let token = '';
      for (let page = 0; page < 8; page += 1) {
        const url = `${STATISTICS}?${query({ parameter_code: metric.parameter, computation_type: 'percentile', normal_type: 'DOY', page_size: 1000, ...(whole ? {} : { start_date: first, end_date: until }), ...(token ? { next_token: token } : {}) })}&${part.map((site) => `monitoring_location_id=${siteId(site)}`).join('&')}`;
        // eslint-disable-next-line no-await-in-loop
        const body = await getJson(url, options);
        for (const feature of body.features || []) {
          const normals = normalsFromFeature(feature, metric.parameter);
          if (normals) found.set(siteOf(feature.properties), normals);
        }
        token = body.next || '';
        if (!token) break;
      }
      for (const site of part) {
        const normals = found.get(site);
        const before = kept[keyOf(site)];
        const merged = normals ? { ...(before && !before.none && now - before.at <= NORMALS_KEEP_MS ? before.days : {}), ...normals.days } : {};
        // What was asked for and didn't come back is remembered as asked (a day with too few
        // years behind it, a gauge with no long-run record at all), or it would be asked
        // about again on every visit.
        if (normals) for (const day of wanted) if (!(day in merged)) merged[day] = null;
        kept[keyOf(site)] = normals ? { at: now, days: merged, whole } : { at: now, days: {}, none: true, whole: true };
      }
    }
    if (storage) writeNormals(storage, kept);
  }

  const result = new Map();
  for (const site of siteNos) {
    const entry = kept[keyOf(site)];
    if (!entry || entry.none) continue;
    const days = {};
    for (const [day, values] of Object.entries(entry.days)) if (values) days[day] = metric.convert ? values.map((value) => (value === null ? null : metric.convert(value))) : values;
    result.set(site, days);
  }
  return result;
}

// The dashed line and the band behind it: for each date in a stretch, the median (`v`) and
// the range the middle half of years fell in (`low` to `high`), drawn through the days.
export function normalSeries(normals, startDay, endDay) {
  if (!normals) return [];
  return daysBetween(startDay, endDay).filter((day) => normals[dayOfYear(day)]).map((day) => {
    const lines = normals[dayOfYear(day)];
    return { t: dayToMs(day), v: lines[NORMAL.median], low: lines[NORMAL.low], high: lines[NORMAL.high], day };
  });
}

// Last year's record laid over this year's dates.
export function overlayLastYear(points) {
  return points.map((point) => {
    // A daily value moves to the same date; a measured reading to the same date and time.
    if (point.day) { const day = shiftYear(point.day, 1); return day ? { t: dayToMs(day), v: point.v, day } : null; }
    const t = shiftInstant(point.t, 1);
    return t === null ? null : { t, v: point.v };
  }).filter(Boolean);
}

// The same moment of the same date a year away (in UTC), or null where that year has no
// such date: a reading taken on 29 February has no place in the year after.
export function shiftInstant(ms, years) {
  const from = new Date(ms);
  const moved = Date.UTC(from.getUTCFullYear() + years, from.getUTCMonth(), from.getUTCDate(), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds());
  return new Date(moved).getUTCDate() === from.getUTCDate() ? moved : null;
}

// The average water temperature at the top of the page: the newest reading at each gauge that
// measures it, added up and divided by how many there are, with the coldest and the warmest
// of them. By gauge, so every number in the line is a number on a row of the list. null where none
// of the gauges being shown has a reading; `temps` is each gauge's newest one.
export function averageTemperature(gauges, temps) {
  const values = gauges.map((gauge) => temps.get(gauge.site_no)?.v).filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return { mean: values.reduce((sum, value) => sum + value, 0) / values.length, gauges: values.length, low: Math.min(...values), high: Math.max(...values) };
}

// That average in words — in three pieces, so the page can set the figure apart: what comes
// before it, the figure, and what comes after. Read together they are one sentence. (The
// space between a number and its unit is a no-break one: on a narrow phone the line never
// ends between "44.4" and "°F".)
export function temperatureText(average) {
  if (!average) return ['None of these gauges is reporting water temperature right now.', '', ''];
  const degrees = (value) => `${formatReading(value, METRICS.temp)}\u00A0${METRICS.temp.unit}`;
  if (average.gauges === 1) return ['Water is ', degrees(average.mean), ' at the one gauge that measures it.'];
  const [low, high] = [degrees(average.low), degrees(average.high)];
  return ['Water is averaging ', degrees(average.mean), `${low === high ? '' : `, from ${low} to ${high}`}.`];
}

// --- Rivers -------------------------------------------------------------------------------
// The same river however it was typed: "Rockaway River", "rockaway river " and "Rockaway"
// are one river, and "South Branch Raritan" is not the "Raritan River".
export const riverKey = (river) => String(river || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/ river$/, '');

// Gauges as rivers: one group for each river, in the order the gauges came in (a river sits
// where its first gauge does), each wearing the name its first gauge was given.
export const riverGroupKey = (gauge) => riverKey(gauge.river) || gauge.site_no;

export function groupByRiver(gauges) {
  const groups = new Map();
  for (const gauge of gauges) {
    const key = riverGroupKey(gauge);
    if (!groups.has(key)) groups.set(key, { key, river: gauge.river, gauges: [] });
    groups.get(key).gauges.push(gauge);
  }
  return [...groups.values()];
}

// Today's date where the viewer is, which near midnight is not the date in UTC.
export const localDay = (ms = Date.now()) => { const date = new Date(ms); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; };

// The same stretch a year earlier. (A 29 February has no year-earlier date: the 28th.)
export const yearBefore = (day) => shiftYear(day, -1) || shiftYear(dayOf(dayToMs(day) - DAY), -1);
// The same moment a year earlier, for asking after last year's measured record. (From a
// 29 February, the same time on the 28th.)
export const yearBeforeMs = (ms) => shiftInstant(ms, -1) ?? shiftInstant(ms - DAY, -1);

// --- Finding a gauge ----------------------------------------------------------------------
// "FLAT BROOK NEAR FLATBROOKVILLE" and "flat brook" both as USGS writes its newer names.
const SMALL_WORDS = new Set(['at', 'near', 'below', 'above', 'of', 'the', 'and', 'in', 'on']);
const titled = (text) => text.toLowerCase().replace(/\S+/g, (word, at) => (at > 0 && SMALL_WORDS.has(word) ? word : word[0].toUpperCase() + word.slice(1)));

const SHORTHAND = [
  [/\bnr\b\.?/gi, 'near'], [/\b(bl|blw)\b\.?/gi, 'below'], [/\b(ab|abv)\b\.?/gi, 'above'],
  [/\bR\b\.?(?=\s|$)/g, 'River'], [/\bBk\b\.?/g, 'Brook'], [/\bCr\b\.?/g, 'Creek'], [/\btrib\b\.?/gi, 'tributary'],
];

// USGS names a station in one line: "South Branch Raritan River near High Bridge NJ",
// "Pequest R at Rt 206 bl Springdale NJ". A card wants the water and the spot apart.
export function parseGaugeName(name) {
  let text = String(name || '').replace(/\s+/g, ' ').trim();
  let state = '';
  const tail = text.match(/[,\s]+([A-Z]{2})\.?$/);
  if (tail && STATE_NAME.has(tail[1])) { state = tail[1]; text = text.slice(0, tail.index).trim(); }
  // Older stations are written in capitals throughout.
  if (text === text.toUpperCase()) text = titled(text);
  for (const [pattern, word] of SHORTHAND) text = text.replace(pattern, word);
  const split = text.match(/\s(at|near|below|above)\s/i);
  if (!split) return { river: text, place: '', state };
  return { river: text.slice(0, split.index).trim(), place: text.slice(split.index).trim().replace(/^(At|Near|Below|Above)\b/, (word) => word.toLowerCase()), state };
}

// Stream gauges in a state whose name holds `term`, or the one with that station number,
// that are measuring flow right now. USGS's catalogue matches letters exactly, capitals and
// all, so the words are tried the way its names are written.
export async function searchGauges({ state, term }, options = {}) {
  const typed = String(term || '').replace(/[%_'"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (typed.length < 3) return [];
  const base = { f: 'json', skipGeometry: 'true', limit: 60, properties: 'monitoring_location_number,monitoring_location_name,state_name,site_type_code' };
  const asNumber = typed.replace(/^USGS[-\s]*/i, '');
  const url = /^\d{8,15}$/.test(asNumber)
    ? `${OGC}/monitoring-locations/items?${query({ ...base, id: siteId(asNumber) })}`
    : `${OGC}/monitoring-locations/items?${query({ ...base, state_name: stateName(state), site_type_code: 'ST', filter: `monitoring_location_name LIKE '%${titled(typed)}%'` })}`;
  const body = await getJson(url, options);
  const found = (body.features || []).map((feature) => feature.properties || {})
    .filter((row) => /^\d{8,15}$/.test(row.monitoring_location_number || '') && row.site_type_code === 'ST');
  if (found.length === 0) return [];
  const flowing = readingsOf(await fetchLatest(found.map((row) => row.monitoring_location_number), [METRICS.flow], options), 'flow');
  return found
    .filter((row) => flowing.has(row.monitoring_location_number))
    .map((row) => {
      const parsed = parseGaugeName(row.monitoring_location_name);
      return { siteNo: row.monitoring_location_number, name: row.monitoring_location_name, river: parsed.river, place: parsed.place, state: stateCode(row.state_name) || parsed.state, flow: flowing.get(row.monitoring_location_number).v };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// --- Saying it ----------------------------------------------------------------------------
export function formatReading(value, metric) {
  if (!Number.isFinite(value)) return '—';
  if (metric.key === 'temp') return value.toFixed(1);
  if (value >= 100) return Math.round(value).toLocaleString('en-US');
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function readingAge(t, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - t) / 60000));
  if (minutes < 2) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 36 * 60) { const hours = Math.round(minutes / 60); return `${hours} hour${hours === 1 ? '' : 's'} ago`; }
  const days = Math.round(minutes / (60 * 24));
  return `${days} days ago`;
}
