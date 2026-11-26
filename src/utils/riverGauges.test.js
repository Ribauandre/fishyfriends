import {
  FRESH_FOR_MINUTES, GaugeDataError, LONGEST_CUSTOM_DAYS, METRICS, PERIODS, REPORTING_WITHIN_HOURS, USGS_API, againstNormal, compareToNormal, dayOf,
  dayOfYear, dayToMs, daysBetween, fetchContinuous, fetchDaily, fetchLatest, fetchNormals, formatDifference, formatReading, gaugeLink, groupByRiver,
  hourly, localDay, normalSeries, normalsFromFeature, overlayLastYear, parseGaugeName, periodRange, readingAge, riverGroupKey, riverKey, searchGauges,
  shiftInstant, shiftYear, siteId, standingText, stateCode, stateName, summarize, summaryText, yearBefore, yearBeforeMs,
} from './riverGauges';

// The fetchers are handed answers shaped like the ones USGS really gives (copied from its
// live replies in November 2026: every value a string, ids prefixed USGS-, daily values dated
// by day, the statistics service's percentiles as two parallel lists).
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 26, 15, 30);
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const feature = (properties) => ({ type: 'Feature', properties, id: 'x', geometry: null });
const reading = (site, time, value) => feature({ monitoring_location_id: `USGS-${site}`, time, value });

function usgs(reply) {
  const asked = [];
  const fetchImpl = jest.fn(async (address, options) => {
    const url = new URL(address);
    asked.push({ url, options, path: url.pathname, sites: (url.searchParams.get('monitoring_location_id') || '').split(',').filter(Boolean) });
    return reply(url, asked.length);
  });
  return { fetchImpl, asked };
}

function fakeStorage(initial = {}) {
  const kept = { ...initial };
  return { kept, getItem: (key) => (key in kept ? kept[key] : null), setItem: (key, value) => { kept[key] = String(value); } };
}

describe('states and stations', () => {
  test('a state is known by its code and by its name', () => {
    expect(stateName('NJ')).toBe('New Jersey');
    expect(stateName('ZZ')).toBe('ZZ');
    expect(stateCode('new jersey ')).toBe('NJ');
    expect(stateCode('Atlantis')).toBe('');
  });

  test('a station is addressed the way USGS addresses it', () => {
    expect(siteId('01396500')).toBe('USGS-01396500');
    expect(gaugeLink('01396500')).toBe('https://waterdata.usgs.gov/monitoring-location/USGS-01396500/');
  });
});

describe('days', () => {
  test('a day is a date in UTC and is drawn at its noon', () => {
    expect(dayOf(Date.UTC(2026, 10, 26, 23, 59))).toBe('2026-11-26');
    expect(dayToMs('2026-11-26')).toBe(Date.UTC(2026, 10, 26, 12));
    expect(dayOf(dayToMs('2026-01-01'))).toBe('2026-01-01');
    expect(dayOfYear('2026-11-26')).toBe('11-26');
  });

  test('the same date a year away, where there is one', () => {
    expect(shiftYear('2026-11-26', -1)).toBe('2025-11-26');
    expect(shiftYear('2023-03-01', 1)).toBe('2024-03-01');
    expect(shiftYear('2024-02-29', 1)).toBeNull();
    expect(yearBefore('2026-11-26')).toBe('2025-11-26');
    expect(yearBefore('2024-02-29')).toBe('2023-02-28');
  });

  test('every date from one to another, across a month end', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    expect(daysBetween('2026-03-02', '2026-02-27')).toEqual([]);
  });

  test('today is the date where the viewer is', () => {
    expect(localDay(new Date(2026, 10, 26, 23, 30).getTime())).toBe('2026-11-26');
    expect(localDay(new Date(2026, 0, 5, 0, 10).getTime())).toBe('2026-01-05');
  });
});

describe('periodRange', () => {
  test('the rolling stretches end now and start that many days back', () => {
    expect(periodRange('30d', NOW)).toEqual({ startMs: NOW - 30 * DAY, endMs: NOW, startDay: '2026-10-27', endDay: '2026-11-26', days: 30, live: true });
    expect(periodRange('7d', NOW)).toMatchObject({ startMs: NOW - 7 * DAY, startDay: '2026-11-19', days: 7, live: true });
    expect(periodRange('1y', NOW)).toMatchObject({ startDay: '2025-11-26', endDay: '2026-11-26', days: 365 });
    expect(PERIODS.map((period) => period.key)).toEqual(['7d', '30d', '1y', 'custom']);
  });

  test('a stretch nobody defined is a month', () => {
    expect(periodRange('fortnight', NOW)).toMatchObject({ days: 30, startDay: '2026-10-27' });
  });

  test('a custom stretch wants two real dates in order, and not too many of them', () => {
    expect(periodRange('custom', NOW, {})).toEqual({ error: 'Pick a start and an end date.' });
    expect(periodRange('custom', NOW, { start: '2026-03-01', end: '' })).toEqual({ error: 'Pick a start and an end date.' });
    expect(periodRange('custom', NOW, { start: '2026-02-30', end: '2026-03-05' })).toEqual({ error: 'Pick a start and an end date.' });
    expect(periodRange('custom', NOW, { start: '2026-03-01', end: '2026-02-01' })).toEqual({ error: 'The start date is after the end date.' });
    expect(periodRange('custom', NOW, { start: '2020-01-01', end: '2026-01-01' }).error).toMatch(/more than three years/);
    expect(LONGEST_CUSTOM_DAYS).toBe(1098);
  });

  test('a custom stretch in the past runs from the start of its first day to the end of its last', () => {
    expect(periodRange('custom', NOW, { start: '2026-03-01', end: '2026-04-30' })).toEqual({
      startMs: Date.UTC(2026, 2, 1), endMs: Date.UTC(2026, 4, 1), startDay: '2026-03-01', endDay: '2026-04-30', days: 61, live: false,
    });
  });

  test('a custom stretch that reaches today stops at now and is still being added to', () => {
    expect(periodRange('custom', NOW, { start: '2026-11-20', end: '2026-11-26' })).toMatchObject({ startMs: Date.UTC(2026, 10, 20), endMs: NOW, days: 7, live: true });
    // A single day, today: at least a day wide, so there is something to draw on.
    expect(periodRange('custom', NOW, { start: '2026-11-26', end: '2026-11-26' })).toMatchObject({ startMs: Date.UTC(2026, 10, 26), endMs: Date.UTC(2026, 10, 27), days: 1, live: true });
  });
});

describe('fetchLatest', () => {
  test('asks for every gauge in one request and gives each one\'s newest reading', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'), reading('01457000', '2026-11-26T14:45:00+00:00', '175')], links: [] }));
    const latest = await fetchLatest(['01396500', '01457000'], METRICS.flow, { now: NOW, fetchImpl });
    expect(latest).toEqual(new Map([['01396500', { t: Date.UTC(2026, 10, 26, 15, 15), v: 39.4 }], ['01457000', { t: Date.UTC(2026, 10, 26, 14, 45), v: 175 }]]));
    expect(asked).toHaveLength(1);
    expect(asked[0].url.origin).toBe(USGS_API);
    expect(asked[0].path).toBe('/ogcapi/v1/collections/latest-continuous/items');
    expect(asked[0].sites).toEqual(['USGS-01396500', 'USGS-01457000']);
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00060');
    expect(asked[0].url.searchParams.get('skipGeometry')).toBe('true');
  });

  test('reporting means a reading from the last 24 hours, as on the dashboard this page was built from', async () => {
    const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();
    const { fetchImpl } = usgs(() => answer({ features: [reading('01396500', hoursAgo(23.9), '39.4'), reading('01457000', hoursAgo(24.1), '175'), reading('01380450', hoursAgo(72), '88.9')] }));
    const latest = await fetchLatest(['01396500', '01457000', '01380450'], METRICS.flow, { now: NOW, fetchImpl });
    expect([...latest.keys()]).toEqual(['01396500']);
    expect(REPORTING_WITHIN_HOURS).toBe(24);
    expect(FRESH_FOR_MINUTES).toBe(15);
  });

  test('a gauge that stopped reporting, or reports nothing that is a number, is left out', async () => {
    const stale = new Date(NOW - (REPORTING_WITHIN_HOURS * 60 * 60 * 1000 + 60000)).toISOString();
    const { fetchImpl } = usgs(() => answer({ features: [
      reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'), reading('01457000', stale, '175'), reading('01380450', '2026-11-26T15:00:00+00:00', null),
      reading('01443500', '2026-11-26T15:00:00+00:00', ''), reading('01379845', 'not a time', '12'), reading('01395000', '2026-11-26T15:00:00+00:00', 'Ice'),
    ] }));
    const latest = await fetchLatest(['01396500', '01457000', '01380450', '01443500', '01379845', '01395000'], METRICS.flow, { now: NOW, fetchImpl });
    expect([...latest.keys()]).toEqual(['01396500']);
  });

  test('two readings of one gauge: the newer is the one kept', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'), reading('01396500', '2026-11-26T14:00:00+00:00', '41.0')] }));
    expect((await fetchLatest(['01396500'], METRICS.flow, { now: NOW, fetchImpl })).get('01396500').v).toBe(39.4);
  });

  test('water temperature is asked for by its own code and comes back in Fahrenheit', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [reading('01400500', '2026-11-26T15:00:00+00:00', '7.0')] }));
    const latest = await fetchLatest(['01400500'], METRICS.temp, { now: NOW, fetchImpl });
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00010');
    expect(latest.get('01400500').v).toBeCloseTo(44.6, 5);
  });

  test('nothing to ask about asks nothing', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [] }));
    expect(await fetchLatest([], METRICS.flow, { now: NOW, fetchImpl })).toEqual(new Map());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a long list is split so no address gets too long', async () => {
    const sites = Array.from({ length: 45 }, (_, index) => String(1000000 + index).padStart(8, '0'));
    const { fetchImpl, asked } = usgs((url) => answer({ features: (url.searchParams.get('monitoring_location_id') || '').split(',').map((id) => reading(id.replace('USGS-', ''), '2026-11-26T15:00:00+00:00', '5')) }));
    const latest = await fetchLatest(sites, METRICS.flow, { now: NOW, fetchImpl });
    expect(asked.map((request) => request.sites.length)).toEqual([40, 5]);
    expect(latest.size).toBe(45);
  });

  test('a further page is followed while USGS offers one from its own host, and from nowhere else', async () => {
    const next = `${USGS_API}/ogcapi/v1/collections/latest-continuous/items?cursor=abc`;
    const { fetchImpl, asked } = usgs((url, count) => (count === 1
      ? answer({ features: [reading('01396500', '2026-11-26T15:00:00+00:00', '39.4')], links: [{ rel: 'self', href: 'x' }, { rel: 'next', href: next }] })
      : answer({ features: [reading('01457000', '2026-11-26T15:00:00+00:00', '175')], links: [{ rel: 'next', href: 'https://elsewhere.example.test/more' }] })));
    const latest = await fetchLatest(['01396500', '01457000'], METRICS.flow, { now: NOW, fetchImpl });
    expect(asked.map((request) => request.url.href)).toEqual([expect.stringContaining('/latest-continuous/items?f=json'), next]);
    expect(latest.size).toBe(2);
  });

  test('Refresh asks past the browser\'s own copy; an ordinary look doesn\'t', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [] }));
    await fetchLatest(['01396500'], METRICS.flow, { now: NOW, fetchImpl });
    await fetchLatest(['01396500'], METRICS.flow, { now: NOW, fetchImpl, fresh: true });
    expect(asked[0].options.cache).toBeUndefined();
    expect(asked[1].options.cache).toBe('reload');
  });

  test('what goes wrong is said in words a member can act on', async () => {
    const failing = (reply) => fetchLatest(['01396500'], METRICS.flow, { now: NOW, fetchImpl: jest.fn(reply) });
    await expect(failing(async () => answer({}, 429))).rejects.toMatchObject({ name: 'GaugeDataError', status: 429, message: expect.stringMatching(/limiting how often/) });
    await expect(failing(async () => answer({}, 503))).rejects.toMatchObject({ status: 503, message: 'USGS answered with an error (503). Try again in a little while.' });
    await expect(failing(async () => { throw new TypeError('Failed to fetch'); })).rejects.toMatchObject({ status: 0, message: 'Couldn\'t reach USGS. Check your connection and try again.' });
    await expect(failing(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } }))).rejects.toThrow(/couldn't be read/);
    await expect(failing(async () => answer({}, 500))).rejects.toBeInstanceOf(GaugeDataError);
  });
});

describe('fetchDaily', () => {
  test('asks for the daily means of a stretch and gives each gauge its record, oldest first, a point at each day\'s noon', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [
      reading('01396500', '2026-11-25', '42.2'), reading('01457000', '2026-11-24', '180'), reading('01396500', '2026-11-24', '43.0'),
      reading('01396500', '2026-11-26', null), reading('01396500', 'yesterday', '40'), reading('01396500', '2026-11-23', 'Ice'),
    ] }));
    const daily = await fetchDaily(['01396500', '01457000'], METRICS.flow, '2026-10-27', '2026-11-26', { fetchImpl });
    expect(asked[0].path).toBe('/ogcapi/v1/collections/daily/items');
    expect(asked[0].url.searchParams.get('statistic_id')).toBe('00003');
    expect(asked[0].url.searchParams.get('time')).toBe('2026-10-27/2026-11-26');
    // Room in one answer for a year of every gauge in a state, so it is one request, not several.
    expect(asked[0].url.searchParams.get('limit')).toBe('50000');
    // Each value keeps its date as well as its place on the chart.
    expect(daily.get('01396500')).toEqual([{ t: dayToMs('2026-11-24'), v: 43, day: '2026-11-24' }, { t: dayToMs('2026-11-25'), v: 42.2, day: '2026-11-25' }]);
    expect(daily.get('01457000')).toEqual([{ t: dayToMs('2026-11-24'), v: 180, day: '2026-11-24' }]);
  });

  test('a temperature record is converted, and no gauges means no request', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [reading('01400500', '2026-11-25', '10')] }));
    expect((await fetchDaily(['01400500'], METRICS.temp, '2026-11-25', '2026-11-25', { fetchImpl })).get('01400500')[0].v).toBe(50);
    expect(await fetchDaily([], METRICS.flow, '2026-11-25', '2026-11-25', { fetchImpl })).toEqual(new Map());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('fetchContinuous', () => {
  test('asks for the record as measured between two instants and thins it to a point an hour', async () => {
    const at = (hour, minute) => `2026-11-26T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+00:00`;
    const { fetchImpl, asked } = usgs(() => answer({ features: [
      reading('01396500', at(13, 0), '40.0'), reading('01396500', at(13, 15), '40.1'), reading('01396500', at(13, 45), '40.3'),
      reading('01396500', at(14, 0), '40.5'), reading('01396500', at(14, 30), '40.9'), reading('01396500', at(13, 30), '40.2'),
    ] }));
    const measured = await fetchContinuous(['01396500'], METRICS.flow, NOW - 7 * DAY, NOW, { fetchImpl });
    expect(asked[0].path).toBe('/ogcapi/v1/collections/continuous/items');
    expect(asked[0].url.searchParams.get('time')).toBe('2026-11-19T15:30:00Z/2026-11-26T15:30:00Z');
    expect(asked[0].url.searchParams.get('limit')).toBe('50000');
    // The last reading of each hour, so the newest point is always the newest reading.
    // (A measured reading is an instant, and carries no date of its own.)
    expect(measured.get('01396500')).toEqual([{ t: Date.UTC(2026, 10, 26, 13, 45), v: 40.3 }, { t: Date.UTC(2026, 10, 26, 14, 30), v: 40.9 }]);
  });

  test('hourly keeps one reading for each hour that has any', () => {
    const points = [0, 15, 30, 45, 60, 75, 180].map((minute) => ({ t: Date.UTC(2026, 10, 26, 0, minute), v: minute }));
    expect(hourly(points).map((point) => point.v)).toEqual([45, 75, 180]);
    expect(hourly([])).toEqual([]);
  });
});

const percentiles = (day, values, years = 100) => ({ time_of_year: day, time_of_year_type: 'day_of_year', values: values.map(String), percentiles: ['5', '10', '25', '50', '75', '90', '95'], sample_count: years, computation: 'percentile' });
const median = (day, value) => ({ time_of_year: day, value: String(value), sample_count: 100, computation: 'median' });
const record = (values, { parameter = '00060', parent = '00003' } = {}) => ({ parameter_code: parameter, unit_of_measure: 'ft^3/s', parent_statistic_id: parent, values });
const station = (site, data) => ({ type: 'Feature', geometry: null, properties: { monitoring_location_id: `USGS-${site}`, monitoring_location_name: 'A gauge', data } });

describe('normalsFromFeature', () => {
  test('reads each day\'s 25th percentile, median and 75th out of the percentile lists', () => {
    const normals = normalsFromFeature(station('01396500', [record([median('11-25', 86), percentiles('11-25', [20, 30, 60, 86, 120, 200, 300]), percentiles('11-26', [21, 31, 61, 85, 121, 201, 301])])]), '00060');
    expect(normals.days).toEqual({ '11-25': [60, 86, 120], '11-26': [61, 85, 121] });
    expect(normals.years).toBe(100);
  });

  test('other measurements, other statistics and days it can\'t read are passed over', () => {
    const feature = station('01396500', [
      record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7])], { parameter: '00010' }),
      record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7])], { parent: '00001' }),
      record([percentiles('11-25', [20, 30, 60, 86, 120, 200, 300]), { ...percentiles('11-26', [20, 30, null, 86, 120, 200, 300]) }, percentiles('week 47', [1, 2, 3, 4, 5, 6, 7]), { time_of_year: '11-27', computation: 'percentile' }]),
    ]);
    expect(normalsFromFeature(feature, '00060').days).toEqual({ '11-25': [60, 86, 120] });
    expect(normalsFromFeature(feature, '00095')).toBeNull();
    expect(normalsFromFeature(station('01396500', []), '00060')).toBeNull();
    expect(normalsFromFeature(undefined, '00060')).toBeNull();
  });

  test('a gauge with two records of the same thing is read from the longer one', () => {
    const feature = station('01396500', [record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7], 12)]), record([percentiles('11-25', [20, 30, 60, 86, 120, 200, 300], 107)])]);
    expect(normalsFromFeature(feature, '00060')).toEqual({ days: { '11-25': [60, 86, 120] }, years: 107 });
  });
});

describe('fetchNormals', () => {
  const week = (site, shift = 0) => station(site, [record(['11-20', '11-21', '11-22', '11-23', '11-24', '11-25', '11-26'].map((day, index) => percentiles(day, [10, 20, 60 + shift + index, 85 + shift + index, 120 + shift + index, 200, 300])))]);

  test('asks the statistics service for just the days of a short stretch, every gauge in one request', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ type: 'FeatureCollection', features: [week('01396500'), week('01457000', 100)], next: null }));
    const normals = await fetchNormals(['01396500', '01457000'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW });
    expect(asked).toHaveLength(1);
    expect(asked[0].path).toBe('/statistics/v0/observationNormals');
    expect(asked[0].url.searchParams.getAll('monitoring_location_id')).toEqual(['USGS-01396500', 'USGS-01457000']);
    expect(asked[0].url.searchParams.get('computation_type')).toBe('percentile');
    expect(asked[0].url.searchParams.get('start_date')).toBe('11-20');
    expect(asked[0].url.searchParams.get('end_date')).toBe('11-26');
    expect(normals.get('01396500')['11-26']).toEqual([66, 91, 126]);
    expect(normals.get('01457000')['11-20']).toEqual([160, 185, 220]);
  });

  test('what the device already holds is not asked for again', async () => {
    const storage = fakeStorage();
    const { fetchImpl, asked } = usgs((url) => answer({ features: url.searchParams.getAll('monitoring_location_id').map((id) => week(id.replace('USGS-', ''))) }));
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(Object.keys(JSON.parse(storage.kept['fishyfriends:gauge-normals']).sites)).toEqual(['01396500|00060']);
    // The same stretch, and a shorter one inside it: nothing to ask.
    const again = await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW + DAY, storage });
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW + DAY, storage });
    expect(asked).toHaveLength(1);
    expect(again.get('01396500')['11-24']).toEqual([64, 89, 124]);
    // A gauge the device hasn't met is asked about alone.
    await fetchNormals(['01396500', '01457000'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW + DAY, storage });
    expect(asked).toHaveLength(2);
    expect(asked[1].url.searchParams.getAll('monitoring_location_id')).toEqual(['USGS-01457000']);
  });

  test('a day that was asked for and didn\'t come back is remembered as asked', async () => {
    const storage = fakeStorage();
    // The stretch runs a day past what the service has an answer for.
    const { fetchImpl, asked } = usgs(() => answer({ features: [week('01396500')] }));
    const normals = await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-27', { fetchImpl, now: NOW, storage });
    expect(normals.get('01396500')['11-27']).toBeUndefined();
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-27', { fetchImpl, now: NOW, storage });
    expect(asked).toHaveLength(1);
  });

  test('a gauge with no long-run record at all is remembered too, and simply has no normals', async () => {
    const storage = fakeStorage();
    const { fetchImpl, asked } = usgs(() => answer({ features: [week('01396500')] }));
    const normals = await fetchNormals(['01396500', '01391102'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(normals.has('01391102')).toBe(false);
    await fetchNormals(['01391102'], METRICS.flow, '2026-11-01', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(asked).toHaveLength(1);
  });

  test('a longer stretch than the device holds is asked for, and added to what it had', async () => {
    const storage = fakeStorage();
    const early = station('01396500', [record([percentiles('11-01', [1, 2, 30, 40, 50, 60, 70])])]);
    const { fetchImpl, asked } = usgs((url, count) => answer({ features: [count === 1 ? week('01396500') : early] }));
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW, storage });
    const normals = await fetchNormals(['01396500'], METRICS.flow, '2026-11-01', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(asked[1].url.searchParams.get('start_date')).toBe('11-01');
    expect(normals.get('01396500')['11-01']).toEqual([30, 40, 50]);
    expect(normals.get('01396500')['11-26']).toEqual([66, 91, 126]);
  });

  test('a long stretch, or one that crosses New Year, asks for the whole year once', async () => {
    const storage = fakeStorage();
    const { fetchImpl, asked } = usgs(() => answer({ features: [week('01396500')] }));
    await fetchNormals(['01396500'], METRICS.flow, '2025-11-26', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(asked[0].url.searchParams.has('start_date')).toBe(false);
    expect(asked[0].url.searchParams.has('end_date')).toBe(false);
    // With the whole year held, no stretch needs asking about.
    await fetchNormals(['01396500'], METRICS.flow, '2026-03-01', '2026-04-30', { fetchImpl, now: NOW, storage });
    expect(asked).toHaveLength(1);
    await fetchNormals(['01457000'], METRICS.flow, '2025-12-20', '2026-01-10', { fetchImpl, now: NOW, storage });
    expect(asked[1].url.searchParams.has('start_date')).toBe(false);
  });

  test('after a month the device\'s copy is asked for afresh', async () => {
    const storage = fakeStorage();
    const { fetchImpl, asked } = usgs(() => answer({ features: [week('01396500')] }));
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW, storage });
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW + 29 * DAY, storage });
    expect(asked).toHaveLength(1);
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW + 31 * DAY, storage });
    expect(asked).toHaveLength(2);
  });

  test('temperature normals are kept as USGS gave them and handed out in Fahrenheit', async () => {
    const storage = fakeStorage();
    const { fetchImpl, asked } = usgs(() => answer({ features: [station('01400500', [record([percentiles('11-26', [1, 2, 5, 10, 15, 18, 20])], { parameter: '00010' })])] }));
    const normals = await fetchNormals(['01400500'], METRICS.temp, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage });
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00010');
    expect(normals.get('01400500')['11-26']).toEqual([41, 50, 59]);
    expect(JSON.parse(storage.kept['fishyfriends:gauge-normals']).sites['01400500|00010'].days['11-26']).toEqual([5, 10, 15]);
  });

  test('an answer in pages is read to the end', async () => {
    const { fetchImpl, asked } = usgs((url, count) => (count === 1 ? answer({ features: [week('01396500')], next: 'page-two' }) : answer({ features: [week('01457000', 100)], next: null })));
    const normals = await fetchNormals(['01396500', '01457000'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW });
    expect(asked[1].url.searchParams.get('next_token')).toBe('page-two');
    expect(normals.size).toBe(2);
  });

  test('storage that is full, broken or holding rubbish costs nothing but the saving', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [week('01396500')] }));
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: full })).get('01396500')['11-26']).toEqual([66, 91, 126]);
    const rubbish = fakeStorage({ 'fishyfriends:gauge-normals': '{not json' });
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: rubbish })).size).toBe(1);
    const older = fakeStorage({ 'fishyfriends:gauge-normals': JSON.stringify({ version: 0, sites: { '01396500|00060': { at: NOW, days: { '11-26': [1, 2, 3] }, whole: true } } }) });
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: older })).get('01396500')['11-26']).toEqual([66, 91, 126]);
  });

  test('only so many gauges are kept on a device: the ones asked about longest ago go first', async () => {
    const storage = fakeStorage();
    const sites = Array.from({ length: 200 }, (_, index) => String(2000000 + index).padStart(8, '0'));
    const reply = (url) => answer({ features: url.searchParams.getAll('monitoring_location_id').map((id) => week(id.replace('USGS-', ''))) });
    await fetchNormals(sites.slice(0, 100), METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl: usgs(reply).fetchImpl, now: NOW, storage });
    await fetchNormals(sites.slice(100), METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl: usgs(reply).fetchImpl, now: NOW + DAY, storage });
    const kept = Object.keys(JSON.parse(storage.kept['fishyfriends:gauge-normals']).sites);
    // Room for a state's worth of gauges twice over, flow and temperature each.
    expect(kept).toHaveLength(160);
    expect(kept).toEqual(expect.arrayContaining(sites.slice(100).map((site) => `${site}|00060`)));
  });
});

describe('the lines on a chart', () => {
  test('the median is drawn through each day of the stretch that has one', () => {
    const normals = { '11-24': [60, 86, 120], '11-26': [61, 85, 121] };
    expect(normalSeries(normals, '2026-11-24', '2026-11-26')).toEqual([{ t: dayToMs('2026-11-24'), v: 86, day: '2026-11-24' }, { t: dayToMs('2026-11-26'), v: 85, day: '2026-11-26' }]);
    expect(normalSeries(undefined, '2026-11-24', '2026-11-26')).toEqual([]);
  });

  test('last year\'s record is laid over this year\'s dates, and a leap day has nowhere to go', () => {
    const points = [{ t: dayToMs('2025-11-25'), v: 28, day: '2025-11-25' }, { t: dayToMs('2025-11-26'), v: 55, day: '2025-11-26' }];
    expect(overlayLastYear(points)).toEqual([{ t: dayToMs('2026-11-25'), v: 28, day: '2026-11-25' }, { t: dayToMs('2026-11-26'), v: 55, day: '2026-11-26' }]);
    expect(overlayLastYear([{ t: dayToMs('2024-02-28'), v: 1 }, { t: dayToMs('2024-02-29'), v: 2 }, { t: dayToMs('2024-03-01'), v: 3 }]).map((point) => dayOf(point.t))).toEqual(['2025-02-28', '2025-03-01']);
  });

  test('a measured reading from last year is laid over the same date and time of day this year', () => {
    const at = (year, month, date, hour, minute) => Date.UTC(year, month, date, hour, minute);
    const measured = [{ t: at(2025, 10, 26, 15, 15), v: 54.9 }, { t: at(2025, 10, 26, 15, 30), v: 55.2 }];
    // No date of its own: a reading is an instant, and stays one.
    expect(overlayLastYear(measured)).toEqual([{ t: at(2026, 10, 26, 15, 15), v: 54.9 }, { t: at(2026, 10, 26, 15, 30), v: 55.2 }]);
    // A leap day's readings have no place in the year after; the days either side keep theirs.
    const leap = [{ t: at(2024, 1, 28, 23, 45), v: 1 }, { t: at(2024, 1, 29, 0, 0), v: 2 }, { t: at(2024, 1, 29, 23, 45), v: 3 }, { t: at(2024, 2, 1, 0, 0), v: 4 }];
    expect(overlayLastYear(leap).map((point) => [new Date(point.t).toISOString().slice(0, 16), point.v])).toEqual([['2025-02-28T23:45', 1], ['2025-03-01T00:00', 4]]);
  });

  test('the same moment a year away, for asking after last year\'s measured week', () => {
    expect(shiftInstant(Date.UTC(2026, 10, 26, 15, 30, 12, 345), -1)).toBe(Date.UTC(2025, 10, 26, 15, 30, 12, 345));
    expect(shiftInstant(Date.UTC(2024, 1, 29, 6), 1)).toBeNull();
    expect(yearBeforeMs(NOW)).toBe(Date.UTC(2025, 10, 26, 15, 30));
    // From a 29 February, the same time on the 28th of the year before.
    expect(yearBeforeMs(Date.UTC(2028, 1, 29, 6))).toBe(Date.UTC(2027, 1, 28, 6));
    // A year back is 365 days, or 366 across a leap day — never an average.
    expect(NOW - yearBeforeMs(NOW)).toBe(365 * DAY);
    expect(Date.UTC(2025, 1, 1) - yearBeforeMs(Date.UTC(2025, 1, 1))).toBe(366 * DAY);
  });
});

describe('against normal', () => {
  const day = [60, 85, 120];

  test('normal is the range USGS itself draws: the 25th to the 75th percentile for the day', () => {
    expect(compareToNormal(39.4, day)).toBe('below');
    expect(compareToNormal(60, day)).toBe('normal');
    expect(compareToNormal(120, day)).toBe('normal');
    expect(compareToNormal(120.1, day)).toBe('above');
    expect(compareToNormal(39.4, undefined)).toBeNull();
    expect(compareToNormal(NaN, day)).toBeNull();
  });

  test('how far off is counted from the median, in cubic feet a second', () => {
    expect(againstNormal(39.4, day)).toEqual({ verdict: 'below', median: 85, off: expect.closeTo(-45.6, 5) });
    expect(againstNormal(200, day)).toEqual({ verdict: 'above', median: 85, off: 115 });
    expect(againstNormal(78, day)).toMatchObject({ verdict: 'normal', off: -7 });
    expect(againstNormal(39.4, null)).toBeNull();
  });

  test('a difference is written as short as it honestly can be', () => {
    expect([46.4, 7.04, 3.24, 0.45, 1234.5, -12.6, 9.96, 9.94, 0.999, 0.004].map(formatDifference)).toEqual(['46', '7', '3.2', '0.45', '1,235', '13', '10', '9.9', '1', '0.00']);
  });

  test('the standing is said in words that agree with the sentence at the top of the page', () => {
    const say = (value) => standingText(againstNormal(value, day));
    expect(say(39.4)).toBe('46 cfs below normal');
    expect(say(200)).toBe('115 cfs above normal');
    // Inside the usual range a river is near normal, however far it is from the median.
    expect(say(78)).toBe('Near normal · 7 cfs under');
    expect(say(90)).toBe('Near normal · 5 cfs over');
    expect(say(60)).toBe('Near normal · 25 cfs under');
    expect(say(85.001)).toBe('Right at normal');
    expect(standingText(null)).toBe('');
  });

  test('the summary counts each gauge that is reporting once', () => {
    const gauges = ['a', 'b', 'c', 'd', 'e'].map((site) => ({ site_no: site }));
    const latest = new Map([['a', { t: NOW, v: 39.4 }], ['b', { t: NOW, v: 100 }], ['c', { t: NOW, v: 500 }], ['d', { t: NOW, v: 12 }]]);
    const normals = new Map([['a', { '11-26': day }], ['b', { '11-26': day }], ['c', { '11-26': day }], ['d', { '11-25': day }], ['e', { '11-26': day }]]);
    expect(summarize(gauges, latest, normals, '2026-11-26')).toEqual({ reporting: 4, below: 1, normal: 1, above: 1, unrated: 1 });
    expect(summarize(gauges, new Map(), normals, '2026-11-26')).toEqual({ reporting: 0, below: 0, normal: 0, above: 0, unrated: 0 });
  });

  test('and says it as a sentence', () => {
    expect(summaryText({ reporting: 13, below: 7, normal: 6, above: 0, unrated: 0 }, 'New Jersey')).toBe('Of 13 gauges reporting, 7 are running below normal flow for today, 6 near normal and 0 above.');
    expect(summaryText({ reporting: 3, below: 1, normal: 1, above: 0, unrated: 1 }, 'New Jersey')).toBe('Of 3 gauges reporting, 1 is running below normal flow for today, 1 near normal and 0 above. 1 has too short a record to say.');
    expect(summaryText({ reporting: 4, below: 0, normal: 2, above: 0, unrated: 2 }, 'New Jersey')).toMatch(/2 have too short a record to say\.$/);
    expect(summaryText({ reporting: 1, below: 0, normal: 0, above: 0, unrated: 1 }, 'New Jersey')).toBe('1 gauge reporting. USGS has no long-run record to say what is normal for it today.');
    expect(summaryText({ reporting: 2, below: 0, normal: 0, above: 0, unrated: 2 }, 'New Jersey')).toMatch(/^2 gauges reporting\. .* for them today\.$/);
    expect(summaryText({ reporting: 0, below: 0, normal: 0, above: 0, unrated: 0 }, 'New York')).toBe('No gauge in New York is reporting right now.');
  });
});

describe('rivers', () => {
  test('a river is the same river however it was typed', () => {
    expect(riverKey('Rockaway River')).toBe('rockaway');
    expect(riverKey('  rockaway   river ')).toBe('rockaway');
    expect(riverKey('Rockaway')).toBe('rockaway');
    expect(riverKey('South Branch Raritan')).not.toBe(riverKey('Raritan River'));
    expect(riverKey('River Styx')).toBe('river styx');
    expect(riverKey(null)).toBe('');
  });

  test('gauges come as rivers, each where its first gauge sits, under the name that gauge was given', () => {
    const gauge = (site, river, place) => ({ id: site, site_no: site, river, place });
    const groups = groupByRiver([
      gauge('1', 'South Branch Raritan', 'near High Bridge'), gauge('2', 'Rockaway River', 'at Boonton'), gauge('3', 'Paulins Kill', 'at Blairstown'),
      gauge('4', 'rockaway river', 'at Dover'), gauge('5', 'Rockaway', 'below Reservoir'), gauge('6', '', 'somewhere'), gauge('7', '', 'elsewhere'),
    ]);
    expect(groups.map((group) => [group.key, group.river, group.gauges.map((row) => row.site_no)])).toEqual([
      ['south branch raritan', 'South Branch Raritan', ['1']], ['rockaway', 'Rockaway River', ['2', '4', '5']], ['paulins kill', 'Paulins Kill', ['3']],
      // A gauge nobody named a river for stands alone rather than joining every other such gauge.
      ['6', '', ['6']], ['7', '', ['7']],
    ]);
    expect(riverGroupKey({ river: 'Rockaway River', site_no: '2' })).toBe('rockaway');
    expect(groupByRiver([])).toEqual([]);
  });
});

describe('parseGaugeName', () => {
  test('a station\'s one-line name comes apart into the water and the spot', () => {
    expect(parseGaugeName('South Branch Raritan River near High Bridge NJ')).toEqual({ river: 'South Branch Raritan River', place: 'near High Bridge', state: 'NJ' });
    expect(parseGaugeName('Saddle River below Hohokus Brook at Paramus NJ')).toEqual({ river: 'Saddle River', place: 'below Hohokus Brook at Paramus', state: 'NJ' });
    expect(parseGaugeName('Toms River near Toms River NJ')).toEqual({ river: 'Toms River', place: 'near Toms River', state: 'NJ' });
  });

  test('the survey\'s capitals and shorthand are written out', () => {
    expect(parseGaugeName('PEQUEST RIVER AT PEQUEST NJ')).toEqual({ river: 'Pequest River', place: 'at Pequest', state: 'NJ' });
    expect(parseGaugeName('Pequest R at Rt 206 bl Springdale NJ')).toEqual({ river: 'Pequest River', place: 'at Rt 206 below Springdale', state: 'NJ' });
    expect(parseGaugeName('Flat Brook nr Flatbrookville, NJ')).toEqual({ river: 'Flat Brook', place: 'near Flatbrookville', state: 'NJ' });
    expect(parseGaugeName('WB Delaware R ab Hale Eddy NY')).toEqual({ river: 'WB Delaware River', place: 'above Hale Eddy', state: 'NY' });
  });

  test('a name with no spot in it is all water, and nothing is nothing', () => {
    expect(parseGaugeName('Lake Hopatcong NJ')).toEqual({ river: 'Lake Hopatcong', place: '', state: 'NJ' });
    expect(parseGaugeName('')).toEqual({ river: '', place: '', state: '' });
    expect(parseGaugeName(undefined)).toEqual({ river: '', place: '', state: '' });
  });
});

describe('searchGauges', () => {
  const location = (number, name, type = 'ST', state = 'New Jersey') => ({ type: 'Feature', id: `USGS-${number}`, geometry: null, properties: { monitoring_location_number: number, monitoring_location_name: name, state_name: state, site_type_code: type } });

  test('a river\'s name finds its stream gauges that are measuring flow right now', async () => {
    const { fetchImpl, asked } = usgs((url) => (url.pathname.endsWith('/monitoring-locations/items')
      ? answer({ features: [location('01445500', 'Pequest River at Pequest NJ'), location('01445000', 'Pequest River at Huntsville NJ'), location('01445430', 'Pequest River at Townsbury NJ'), location('405210074500001', 'Pequest well', 'GW'), location('abc', 'Pequest oddity')] })
      : answer({ features: [reading('01445500', '2026-11-26T15:00:00+00:00', '61.8'), reading('01445000', '2026-11-26T15:00:00+00:00', '12.3')] })));
    const found = await searchGauges({ state: 'NJ', term: 'pequest' }, { fetchImpl, now: NOW });
    expect(asked[0].url.searchParams.get('state_name')).toBe('New Jersey');
    expect(asked[0].url.searchParams.get('site_type_code')).toBe('ST');
    // USGS matches letters exactly, capitals and all, so the word goes the way its names are written.
    expect(asked[0].url.searchParams.get('filter')).toBe('monitoring_location_name LIKE \'%Pequest%\'');
    // Only what is a stream gauge is asked about, and only what is flowing is offered.
    expect(asked[1].sites).toEqual(['USGS-01445500', 'USGS-01445000', 'USGS-01445430']);
    expect(found).toEqual([
      { siteNo: '01445000', name: 'Pequest River at Huntsville NJ', river: 'Pequest River', place: 'at Huntsville', state: 'NJ', flow: 12.3 },
      { siteNo: '01445500', name: 'Pequest River at Pequest NJ', river: 'Pequest River', place: 'at Pequest', state: 'NJ', flow: 61.8 },
    ]);
  });

  test('a station number, with or without its USGS, finds that station wherever it is', async () => {
    const { fetchImpl, asked } = usgs((url) => (url.pathname.endsWith('/monitoring-locations/items')
      ? answer({ features: [location('01420500', 'BEAVER KILL AT COOKS FALLS NY', 'ST', 'New York')] })
      : answer({ features: [reading('01420500', '2026-11-26T15:00:00+00:00', '402')] })));
    const found = await searchGauges({ state: 'NJ', term: ' USGS-01420500 ' }, { fetchImpl, now: NOW });
    expect(asked[0].url.searchParams.get('id')).toBe('USGS-01420500');
    expect(asked[0].url.searchParams.has('state_name')).toBe(false);
    expect(asked[0].url.searchParams.has('filter')).toBe(false);
    expect(found).toEqual([{ siteNo: '01420500', name: 'BEAVER KILL AT COOKS FALLS NY', river: 'Beaver Kill', place: 'at Cooks Falls', state: 'NY', flow: 402 }]);
  });

  test('what is typed can\'t reach into the question put to USGS', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [] }));
    await searchGauges({ state: 'NJ', term: 'big\' OR 1=1 -- %_"\\ flat  brook' }, { fetchImpl, now: NOW });
    expect(asked[0].url.searchParams.get('filter')).toBe('monitoring_location_name LIKE \'%Big Or 1=1 -- Flat Brook%\'');
  });

  test('fewer than three letters asks nothing, and nothing found asks no further', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [] }));
    expect(await searchGauges({ state: 'NJ', term: ' fl ' }, { fetchImpl, now: NOW })).toEqual([]);
    expect(asked).toHaveLength(0);
    expect(await searchGauges({ state: 'NJ', term: 'flat brook' }, { fetchImpl, now: NOW })).toEqual([]);
    expect(asked).toHaveLength(1);
  });
});

describe('saying it', () => {
  test('a flow is written to three figures, a temperature to a tenth', () => {
    expect(formatReading(1234.56, METRICS.flow)).toBe('1,235');
    expect(formatReading(123.4, METRICS.flow)).toBe('123');
    expect(formatReading(39.44, METRICS.flow)).toBe('39.4');
    expect(formatReading(4.123, METRICS.flow)).toBe('4.12');
    expect(formatReading(44.63, METRICS.temp)).toBe('44.6');
    expect(formatReading(undefined, METRICS.flow)).toBe('—');
  });

  test('how old a reading is', () => {
    const ago = (ms) => readingAge(NOW - ms, NOW);
    expect([0, 60e3, 5 * 60e3, 59 * 60e3, 90 * 60e3, 35 * 3600e3, 37 * 3600e3, 72 * 3600e3].map(ago)).toEqual(['just now', 'just now', '5 min ago', '59 min ago', '2 hours ago', '35 hours ago', '2 days ago', '3 days ago']);
    expect(readingAge(NOW - 61 * 60e3, NOW)).toBe('1 hour ago');
    // A clock that is a little off never says a reading is from the future.
    expect(readingAge(NOW + 5 * 60e3, NOW)).toBe('just now');
  });
});
