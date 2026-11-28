import {
  FRESH_FOR_MINUTES, GaugeDataError, LONGEST_CUSTOM_DAYS, METRICS, NORMAL, PERIODS, RECENT_HOURS, REPORTING_WITHIN_HOURS, USGS_API, averageTemperature,
  dayOf, dayOfYear, dayToMs, daysBetween, fetchContinuous, fetchDaily, fetchLatest, fetchMeasured, fetchNormals, formatReading, gaugeLink, groupByRiver,
  hourly, localDay, newestOf, normalSeries, normalsFromFeature, overlayLastYear, parseGaugeName, periodRange, readCsv, readingAge, readingsOf,
  riverGroupKey, riverKey, searchGauges, seriesOf, shiftInstant, shiftYear, siteId, stateCode, stateName, temperatureText, thinned, yearBefore,
  yearBeforeMs,
} from './riverGauges';

// The fetchers are handed answers shaped like the ones USGS really gives (copied from its
// live replies in November 2026: every value a string, ids prefixed USGS-, daily values dated
// by day, the statistics service's percentiles as two parallel lists; a reading says which
// measurement it is of by its parameter code — 00060 flow, 00010 water temperature). The
// record as measured is asked for as CSV, and comes the way USGS writes that: two empty
// columns first, and an instant with a space where JSON has a T.
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 26, 15, 30);
const answer = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const sheet = (text, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => text });
const CSV_HEAD = 'x,y,monitoring_location_id,parameter_code,time,value';
const two = (value) => String(value).padStart(2, '0');
const clock = (hour, minute, date = 26) => `2026-11-${two(date)} ${two(hour)}:${two(minute)}:00+00:00`;
const line = (site, time, value, code = '00060') => `,,USGS-${site},${code},${time},${value}`;
const csv = (...lines) => sheet([CSV_HEAD, ...lines].join('\n'));
const feature = (properties) => ({ type: 'Feature', properties, id: 'x', geometry: null });
const reading = (site, time, value, code = '00060') => feature({ monitoring_location_id: `USGS-${site}`, parameter_code: code, time, value });

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
    expect(PERIODS.map((period) => period.key)).toEqual(['3d', '7d', '30d', '1y', 'custom']);
  });

  test('three days is the stretch the list itself is read from', () => {
    expect(periodRange('3d', NOW)).toEqual({ startMs: NOW - 3 * DAY, endMs: NOW, startDay: '2026-11-23', endDay: '2026-11-26', days: 3, live: true });
    expect(RECENT_HOURS).toBe(72);
  });

  test('a stretch nobody defined is those three days', () => {
    expect(periodRange('fortnight', NOW)).toMatchObject({ days: 3, startDay: '2026-11-23' });
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
  const FLOW = [METRICS.flow];
  const BOTH = [METRICS.flow, METRICS.temp];

  test('asks for every gauge in one request and gives each one\'s newest reading', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'), reading('01457000', '2026-11-26T14:45:00+00:00', '175')], links: [] }));
    const latest = await fetchLatest(['01396500', '01457000'], FLOW, { now: NOW, fetchImpl });
    expect(latest).toEqual(new Map([['01396500', { flow: { t: Date.UTC(2026, 10, 26, 15, 15), v: 39.4 } }], ['01457000', { flow: { t: Date.UTC(2026, 10, 26, 14, 45), v: 175 } }]]));
    expect(asked).toHaveLength(1);
    expect(asked[0].url.origin).toBe(USGS_API);
    expect(asked[0].path).toBe('/ogcapi/v1/collections/latest-continuous/items');
    expect(asked[0].sites).toEqual(['USGS-01396500', 'USGS-01457000']);
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00060');
    expect(asked[0].url.searchParams.get('skipGeometry')).toBe('true');
  });

  test('flow and water temperature come in the one answer, each gauge holding what it measures', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [
      reading('01400500', '2026-11-26T15:15:00+00:00', '213'), reading('01400500', '2026-11-26T15:00:00+00:00', '7.0', '00010'),
      reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'),
      // Its thermometer went quiet years ago, and USGS still hands back the last thing it said.
      reading('01396500', '2021-09-01T04:55:00+00:00', '21.0', '00010'),
      // Nobody asked how high the water stands.
      reading('01396500', '2026-11-26T15:15:00+00:00', '2.31', '00065'),
      // A thermometer and nothing else that is reporting.
      reading('01458500', '2026-11-26T15:10:00+00:00', '6.5', '00010'),
    ] }));
    const latest = await fetchLatest(['01400500', '01396500', '01458500', '01380450'], BOTH, { now: NOW, fetchImpl });
    expect(asked).toHaveLength(1);
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00060,00010');
    // Each reading has to say what it is a reading of.
    expect(asked[0].url.searchParams.get('properties').split(',')).toEqual(['monitoring_location_id', 'parameter_code', 'time', 'value']);
    expect(latest.get('01400500')).toEqual({ flow: { t: Date.UTC(2026, 10, 26, 15, 15), v: 213 }, temp: { t: Date.UTC(2026, 10, 26, 15), v: expect.closeTo(44.6, 5) } });
    expect(latest.get('01396500')).toEqual({ flow: { t: Date.UTC(2026, 10, 26, 15, 15), v: 39.4 } });
    expect(latest.get('01458500')).toEqual({ temp: { t: Date.UTC(2026, 10, 26, 15, 10), v: expect.closeTo(43.7, 5) } });
    // A gauge with nothing to say is not in the answer at all.
    expect(latest.has('01380450')).toBe(false);
    expect([...readingsOf(latest, 'flow')].map(([site, found]) => [site, found.v])).toEqual([['01400500', 213], ['01396500', 39.4]]);
    expect([...readingsOf(latest, 'temp').keys()]).toEqual(['01400500', '01458500']);
    expect(readingsOf(new Map(), 'flow')).toEqual(new Map());
  });

  test('reporting means a reading from the last 24 hours, as on the dashboard this page was built from', async () => {
    const hoursAgo = (hours) => new Date(NOW - hours * 60 * 60 * 1000).toISOString();
    const { fetchImpl } = usgs(() => answer({ features: [reading('01396500', hoursAgo(23.9), '39.4'), reading('01457000', hoursAgo(24.1), '175'), reading('01380450', hoursAgo(72), '88.9')] }));
    const latest = await fetchLatest(['01396500', '01457000', '01380450'], FLOW, { now: NOW, fetchImpl });
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
    const latest = await fetchLatest(['01396500', '01457000', '01380450', '01443500', '01379845', '01395000'], FLOW, { now: NOW, fetchImpl });
    expect([...latest.keys()]).toEqual(['01396500']);
  });

  test('two readings of one gauge: the newer is the one kept, for each measurement on its own', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [
      reading('01396500', '2026-11-26T15:15:00+00:00', '39.4'), reading('01396500', '2026-11-26T14:00:00+00:00', '41.0'),
      reading('01396500', '2026-11-26T13:00:00+00:00', '6.0', '00010'), reading('01396500', '2026-11-26T15:00:00+00:00', '7.0', '00010'),
    ] }));
    const found = (await fetchLatest(['01396500'], BOTH, { now: NOW, fetchImpl })).get('01396500');
    expect(found.flow.v).toBe(39.4);
    expect(found.temp).toEqual({ t: Date.UTC(2026, 10, 26, 15), v: expect.closeTo(44.6, 5) });
  });

  test('water temperature is asked for by its own code and comes back in Fahrenheit', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [reading('01400500', '2026-11-26T15:00:00+00:00', '7.0', '00010')] }));
    const latest = await fetchLatest(['01400500'], [METRICS.temp], { now: NOW, fetchImpl });
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00010');
    expect(latest.get('01400500').temp.v).toBeCloseTo(44.6, 5);
    expect(latest.get('01400500').flow).toBeUndefined();
  });

  test('nothing to ask about asks nothing', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [] }));
    expect(await fetchLatest([], FLOW, { now: NOW, fetchImpl })).toEqual(new Map());
    expect(await fetchLatest(['01396500'], [], { now: NOW, fetchImpl })).toEqual(new Map());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a long list is split so no address gets too long', async () => {
    const sites = Array.from({ length: 45 }, (_, index) => String(1000000 + index).padStart(8, '0'));
    const { fetchImpl, asked } = usgs((url) => answer({ features: (url.searchParams.get('monitoring_location_id') || '').split(',').map((id) => reading(id.replace('USGS-', ''), '2026-11-26T15:00:00+00:00', '5')) }));
    const latest = await fetchLatest(sites, FLOW, { now: NOW, fetchImpl });
    expect(asked.map((request) => request.sites.length)).toEqual([40, 5]);
    expect(latest.size).toBe(45);
  });

  test('a further page is followed while USGS offers one from its own host, and from nowhere else', async () => {
    const next = `${USGS_API}/ogcapi/v1/collections/latest-continuous/items?cursor=abc`;
    const { fetchImpl, asked } = usgs((url, count) => (count === 1
      ? answer({ features: [reading('01396500', '2026-11-26T15:00:00+00:00', '39.4')], links: [{ rel: 'self', href: 'x' }, { rel: 'next', href: next }] })
      : answer({ features: [reading('01457000', '2026-11-26T15:00:00+00:00', '175')], links: [{ rel: 'next', href: 'https://elsewhere.example.test/more' }] })));
    const latest = await fetchLatest(['01396500', '01457000'], FLOW, { now: NOW, fetchImpl });
    expect(asked.map((request) => request.url.href)).toEqual([expect.stringContaining('/latest-continuous/items?f=json'), next]);
    expect(latest.size).toBe(2);
  });

  test('Refresh asks past the browser\'s own copy; an ordinary look doesn\'t', async () => {
    const { fetchImpl, asked } = usgs(() => answer({ features: [] }));
    await fetchLatest(['01396500'], FLOW, { now: NOW, fetchImpl });
    await fetchLatest(['01396500'], FLOW, { now: NOW, fetchImpl, fresh: true });
    expect(asked[0].options.cache).toBeUndefined();
    expect(asked[1].options.cache).toBe('reload');
  });

  test('what goes wrong is said in words a member can act on', async () => {
    const failing = (reply) => fetchLatest(['01396500'], FLOW, { now: NOW, fetchImpl: jest.fn(reply) });
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

describe('the record as measured', () => {
  const BOTH = [METRICS.flow, METRICS.temp];

  test('USGS\'s CSV is read by its column names, whatever order they come in', () => {
    expect(readCsv([CSV_HEAD, line('01396500', clock(13, 0), '40.0'), line('01400500', clock(13, 15), '7.0', '00010')].join('\n'))).toEqual([
      { monitoring_location_id: 'USGS-01396500', parameter_code: '00060', time: '2026-11-26 13:00:00+00:00', value: '40.0' },
      { monitoring_location_id: 'USGS-01400500', parameter_code: '00010', time: '2026-11-26 13:15:00+00:00', value: '7.0' },
    ]);
    // Another order, Windows line ends, quoted cells, a blank line at the end.
    expect(readCsv('value,"time",monitoring_location_id,parameter_code\r\n"40.0",2026-11-26 13:00:00+00:00,USGS-01396500,00060\r\n\r\n')).toEqual([
      { monitoring_location_id: 'USGS-01396500', parameter_code: '00060', time: '2026-11-26 13:00:00+00:00', value: '40.0' },
    ]);
    // Nothing recorded is an empty answer, not a broken one.
    expect(readCsv('')).toEqual([]);
    expect(readCsv(undefined)).toEqual([]);
    expect(readCsv(CSV_HEAD)).toEqual([]);
    // Something that isn't the table asked for is said to be unreadable rather than read as no gauges.
    expect(() => readCsv('<html>Service unavailable</html>')).toThrow(GaugeDataError);
    expect(() => readCsv('x,y,time,value\n,,2026-11-26 13:00:00+00:00,4')).toThrow(/couldn't be read/);
  });

  test('every gauge\'s flow and water temperature come in one answer, each gauge holding what it measures', async () => {
    const { fetchImpl, asked } = usgs(() => csv(
      line('01400500', clock(13, 15), '213'), line('01400500', clock(13, 0), '210'), line('01400500', clock(13, 0), '7.0', '00010'), line('01400500', clock(13, 15), '7.5', '00010'),
      line('01396500', clock(13, 15), '39.4'),
      // Nobody asked how high the water stands, and these aren't readings at all.
      line('01396500', clock(13, 15), '2.31', '00065'), line('01396500', clock(13, 30), 'Ice'), line('01396500', 'not a time', '12'), line('01396500', clock(13, 45), ''),
    ));
    const measured = await fetchMeasured(['01400500', '01396500', '01380450'], BOTH, NOW - 3 * DAY, NOW, { fetchImpl });
    expect(asked).toHaveLength(1);
    expect(asked[0].url.origin).toBe(USGS_API);
    expect(asked[0].path).toBe('/ogcapi/v1/collections/continuous/items');
    // As CSV: the same rows as JSON, an eighth of the size on the wire.
    expect(asked[0].url.searchParams.get('f')).toBe('csv');
    expect(asked[0].sites).toEqual(['USGS-01400500', 'USGS-01396500', 'USGS-01380450']);
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00060,00010');
    expect(asked[0].url.searchParams.get('time')).toBe('2026-11-23T15:30:00Z/2026-11-26T15:30:00Z');
    expect(asked[0].url.searchParams.get('limit')).toBe('50000');
    expect(asked[0].url.searchParams.get('properties').split(',')).toEqual(['monitoring_location_id', 'parameter_code', 'time', 'value']);
    // Oldest first, whatever order they came in; water temperature in Fahrenheit.
    expect(measured.get('01400500')).toEqual({
      flow: [{ t: Date.UTC(2026, 10, 26, 13, 0), v: 210 }, { t: Date.UTC(2026, 10, 26, 13, 15), v: 213 }],
      temp: [{ t: Date.UTC(2026, 10, 26, 13, 0), v: expect.closeTo(44.6, 5) }, { t: Date.UTC(2026, 10, 26, 13, 15), v: expect.closeTo(45.5, 5) }],
    });
    // A gauge with no thermometer has no temperature record; one with nothing to say isn't there.
    expect(measured.get('01396500')).toEqual({ flow: [{ t: Date.UTC(2026, 10, 26, 13, 15), v: 39.4 }] });
    expect(measured.has('01380450')).toBe(false);
  });

  test('a record can be thinned to the last reading of each stretch', async () => {
    const readings = [[13, 0, '40.0'], [13, 5, '40.1'], [13, 10, '40.2'], [13, 15, '40.3'], [13, 25, '40.4'], [14, 0, '40.9']].map(([hour, minute, value]) => line('01396500', clock(hour, minute), value));
    const every = async (stretch) => (await fetchMeasured(['01396500'], [METRICS.flow], NOW - DAY, NOW, { fetchImpl: usgs(() => csv(...readings)).fetchImpl, every: stretch })).get('01396500').flow.map((point) => point.v);
    expect(await every(0)).toEqual([40.0, 40.1, 40.2, 40.3, 40.4, 40.9]);
    // A gauge that reports every five minutes, kept at a reading every fifteen.
    expect(await every(15 * 60 * 1000)).toEqual([40.2, 40.4, 40.9]);
    expect(await every(HOUR)).toEqual([40.4, 40.9]);
    const points = [0, 15, 30, 45, 60, 75, 180].map((minute) => ({ t: Date.UTC(2026, 10, 26, 0, minute), v: minute }));
    expect(thinned(points, 30 * 60 * 1000).map((point) => point.v)).toEqual([15, 45, 75, 180]);
    expect(hourly(points).map((point) => point.v)).toEqual([45, 75, 180]);
    expect(hourly([])).toEqual([]);
  });

  test('one measurement out of the answer, and what each gauge is doing now', async () => {
    const hoursAgo = (hours) => { const at = new Date(NOW - hours * HOUR); return `${at.toISOString().slice(0, 10)} ${at.toISOString().slice(11, 19)}+00:00`; };
    const { fetchImpl } = usgs(() => csv(
      line('01400500', hoursAgo(30), '200'), line('01400500', hoursAgo(1), '213'), line('01400500', hoursAgo(2), '7.0', '00010'),
      // Flow still coming in; the thermometer went quiet more than a day ago.
      line('01396500', hoursAgo(0.25), '39.4'), line('01396500', hoursAgo(25), '6.0', '00010'),
      // Nothing at all since the day before yesterday.
      line('01457000', hoursAgo(40), '175'),
    ));
    const measured = await fetchMeasured(['01400500', '01396500', '01457000'], BOTH, NOW - 3 * DAY, NOW, { fetchImpl });
    expect([...seriesOf(measured, 'flow').keys()]).toEqual(['01400500', '01396500', '01457000']);
    expect([...seriesOf(measured, 'temp').keys()]).toEqual(['01400500', '01396500']);
    expect(seriesOf(measured, 'flow').get('01400500').map((point) => point.v)).toEqual([200, 213]);
    // Reporting means a reading from the last 24 hours, for each measurement on its own clock.
    expect([...newestOf(measured, 'flow', NOW)].map(([site, reading]) => [site, reading.v])).toEqual([['01400500', 213], ['01396500', 39.4]]);
    expect([...newestOf(measured, 'temp', NOW).keys()]).toEqual(['01400500']);
    expect(newestOf(new Map(), 'flow', NOW)).toEqual(new Map());
    expect(REPORTING_WITHIN_HOURS).toBe(24);
    expect(FRESH_FOR_MINUTES).toBe(15);
  });

  test('nothing recorded is no gauges, and nothing to ask about asks nothing', async () => {
    const { fetchImpl } = usgs(() => sheet(''));
    expect(await fetchMeasured(['01396500'], BOTH, NOW - DAY, NOW, { fetchImpl })).toEqual(new Map());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await fetchMeasured([], BOTH, NOW - DAY, NOW, { fetchImpl })).toEqual(new Map());
    expect(await fetchMeasured(['01396500'], [], NOW - DAY, NOW, { fetchImpl })).toEqual(new Map());
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a long list is split so no address gets too long', async () => {
    const sites = Array.from({ length: 45 }, (_, index) => String(1000000 + index).padStart(8, '0'));
    const { fetchImpl, asked } = usgs((url) => csv(...(url.searchParams.get('monitoring_location_id') || '').split(',').map((id) => line(id.replace('USGS-', ''), clock(15, 0), '5'))));
    const measured = await fetchMeasured(sites, [METRICS.flow], NOW - DAY, NOW, { fetchImpl });
    expect(asked.map((request) => request.sites.length)).toEqual([40, 5]);
    expect(measured.size).toBe(45);
  });

  test('a full answer is a cut-off one: the same gauges are asked about again, half at a time', async () => {
    const sites = ['01396500', '01457000', '01380450', '01443500'];
    // Fifty thousand rows is all USGS hands back at once, and a CSV answer has no next page.
    const full = sheet([CSV_HEAD, ...Array.from({ length: 50000 }, () => line('01396500', clock(15, 0), '5'))].join('\n'));
    const { fetchImpl, asked } = usgs((url, count) => (count === 1 ? full : csv(...(url.searchParams.get('monitoring_location_id') || '').split(',').map((id) => line(id.replace('USGS-', ''), clock(15, 0), '7')))));
    const measured = await fetchMeasured(sites, [METRICS.flow], NOW - DAY, NOW, { fetchImpl });
    expect(asked.map((request) => request.sites.map((id) => id.replace('USGS-', '')))).toEqual([sites, sites.slice(0, 2), sites.slice(2)]);
    // What the cut-off answer held is not kept: every gauge is read from an answer that had room for it.
    expect([...measured].map(([site, records]) => [site, records.flow.map((point) => point.v)])).toEqual(sites.map((site) => [site, [7]]));
  });

  test('Refresh asks past the browser\'s own copy, and what goes wrong is said in words a member can act on', async () => {
    const { fetchImpl, asked } = usgs(() => sheet(''));
    await fetchMeasured(['01396500'], BOTH, NOW - DAY, NOW, { fetchImpl });
    await fetchMeasured(['01396500'], BOTH, NOW - DAY, NOW, { fetchImpl, fresh: true });
    expect(asked[0].options.cache).toBeUndefined();
    expect(asked[1].options.cache).toBe('reload');
    const failing = (reply) => fetchMeasured(['01396500'], BOTH, NOW - DAY, NOW, { fetchImpl: jest.fn(reply) });
    await expect(failing(async () => sheet('', 429))).rejects.toMatchObject({ name: 'GaugeDataError', status: 429, message: expect.stringMatching(/limiting how often/) });
    await expect(failing(async () => sheet('', 503))).rejects.toMatchObject({ status: 503 });
    await expect(failing(async () => { throw new TypeError('Failed to fetch'); })).rejects.toMatchObject({ status: 0, message: 'Couldn\'t reach USGS. Check your connection and try again.' });
    await expect(failing(async () => ({ ok: true, status: 200, text: async () => { throw new Error('cut off'); } }))).rejects.toThrow(/couldn't be read/);
    await expect(failing(async () => sheet('<html>An error page</html>'))).rejects.toThrow(/couldn't be read/);
  });
});

describe('fetchContinuous', () => {
  test('asks for one measurement\'s record between two instants and thins it to a point an hour', async () => {
    const { fetchImpl, asked } = usgs(() => csv(
      line('01396500', clock(13, 0), '40.0'), line('01396500', clock(13, 15), '40.1'), line('01396500', clock(13, 45), '40.3'),
      line('01396500', clock(14, 0), '40.5'), line('01396500', clock(14, 30), '40.9'), line('01396500', clock(13, 30), '40.2'),
    ));
    const measured = await fetchContinuous(['01396500', '01457000'], METRICS.flow, NOW - 7 * DAY, NOW, { fetchImpl });
    expect(asked[0].path).toBe('/ogcapi/v1/collections/continuous/items');
    expect(asked[0].url.searchParams.get('f')).toBe('csv');
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00060');
    expect(asked[0].url.searchParams.get('time')).toBe('2026-11-19T15:30:00Z/2026-11-26T15:30:00Z');
    // The last reading of each hour, so the newest point is always the newest reading.
    // (A measured reading is an instant, and carries no date of its own.)
    expect(measured).toEqual(new Map([['01396500', [{ t: Date.UTC(2026, 10, 26, 13, 45), v: 40.3 }, { t: Date.UTC(2026, 10, 26, 14, 30), v: 40.9 }]]]));
  });

  test('water temperature comes back in Fahrenheit, from the gauges that measure it', async () => {
    const { fetchImpl, asked } = usgs(() => csv(line('01400500', clock(13, 0), '10', '00010')));
    const measured = await fetchContinuous(['01400500', '01396500'], METRICS.temp, NOW - 7 * DAY, NOW, { fetchImpl });
    expect(asked[0].url.searchParams.get('parameter_code')).toBe('00010');
    expect(measured).toEqual(new Map([['01400500', [{ t: Date.UTC(2026, 10, 26, 13, 0), v: 50 }]]]));
  });
});

const percentiles = (day, values, years = 100) => ({ time_of_year: day, time_of_year_type: 'day_of_year', values: values.map(String), percentiles: ['5', '10', '25', '50', '75', '90', '95'], sample_count: years, computation: 'percentile' });
const median = (day, value) => ({ time_of_year: day, value: String(value), sample_count: 100, computation: 'median' });
const record = (values, { parameter = '00060', parent = '00003' } = {}) => ({ parameter_code: parameter, unit_of_measure: 'ft^3/s', parent_statistic_id: parent, values });
const station = (site, data) => ({ type: 'Feature', geometry: null, properties: { monitoring_location_id: `USGS-${site}`, monitoring_location_name: 'A gauge', data } });

describe('normalsFromFeature', () => {
  test('reads five lines for each day out of the percentile lists: the 10th, 25th, median, 75th and 90th', () => {
    const normals = normalsFromFeature(station('01396500', [record([median('11-25', 86), percentiles('11-25', [20, 30, 60, 86, 120, 200, 300]), percentiles('11-26', [21, 31, 61, 85, 121, 201, 301])])]), '00060');
    expect(normals.days).toEqual({ '11-25': [30, 60, 86, 120, 200], '11-26': [31, 61, 85, 121, 201] });
    expect(normals.years).toBe(100);
    // Where each line is in a day's five.
    expect(NORMAL).toEqual({ lowest: 0, low: 1, median: 2, high: 3, highest: 4 });
  });

  test('a record too short for the outer lines keeps the middle three', () => {
    // As USGS answers for a gauge with eight years behind it: "nan" where it won't say.
    const short = station('01457500', [record([percentiles('11-26', ['nan', 'nan', 6587.5, 8705, 16750, 'nan', 'nan'], 8)])]);
    expect(normalsFromFeature(short, '00060')).toEqual({ days: { '11-26': [null, 6587.5, 8705, 16750, null] }, years: 8 });
  });

  test('other measurements, other statistics and days it can\'t read are passed over', () => {
    const feature = station('01396500', [
      record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7])], { parameter: '00010' }),
      record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7])], { parent: '00001' }),
      record([percentiles('11-25', [20, 30, 60, 86, 120, 200, 300]), { ...percentiles('11-26', [20, 30, null, 86, 120, 200, 300]) }, percentiles('week 47', [1, 2, 3, 4, 5, 6, 7]), { time_of_year: '11-27', computation: 'percentile' }]),
    ]);
    expect(normalsFromFeature(feature, '00060').days).toEqual({ '11-25': [30, 60, 86, 120, 200] });
    expect(normalsFromFeature(feature, '00095')).toBeNull();
    expect(normalsFromFeature(station('01396500', []), '00060')).toBeNull();
    expect(normalsFromFeature(undefined, '00060')).toBeNull();
  });

  test('a gauge with two records of the same thing is read from the longer one', () => {
    const feature = station('01396500', [record([percentiles('11-25', [1, 2, 3, 4, 5, 6, 7], 12)]), record([percentiles('11-25', [20, 30, 60, 86, 120, 200, 300], 107)])]);
    expect(normalsFromFeature(feature, '00060')).toEqual({ days: { '11-25': [30, 60, 86, 120, 200] }, years: 107 });
  });
});

describe('fetchNormals', () => {
  const real_days = daysBetween;
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
    expect(normals.get('01396500')['11-26']).toEqual([20, 66, 91, 126, 200]);
    expect(normals.get('01457000')['11-20']).toEqual([20, 160, 185, 220, 200]);
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
    expect(again.get('01396500')['11-24']).toEqual([20, 64, 89, 124, 200]);
    // A gauge the device hasn't met is asked about alone.
    await fetchNormals(['01396500', '01457000'], METRICS.flow, '2026-11-20', '2026-11-26', { fetchImpl, now: NOW + DAY, storage });
    expect(asked).toHaveLength(2);
    expect(asked[1].url.searchParams.getAll('monitoring_location_id')).toEqual(['USGS-01457000']);
  });

  test('asked to, it asks some days past the stretch while it is asking, so tomorrow\'s visit asks nothing', async () => {
    const storage = fakeStorage();
    const days = (from, to) => real_days(from, to).map((day, index) => percentiles(day.slice(5), [10, 20, 60 + index, 85 + index, 120 + index, 200, 300]));
    const { fetchImpl, asked } = usgs((url) => answer({ features: [station('01396500', [record(days(`2026-${url.searchParams.get('start_date')}`, `2026-${url.searchParams.get('end_date')}`))])] }));
    const normals = await fetchNormals(['01396500'], METRICS.flow, '2026-11-22', '2026-11-27', { fetchImpl, now: NOW, storage, ahead: 14 });
    expect(asked[0].url.searchParams.get('start_date')).toBe('11-22');
    expect(asked[0].url.searchParams.get('end_date')).toBe('12-11');
    expect(normals.get('01396500')['11-26']).toEqual([20, 64, 89, 124, 200]);
    // The next day's stretch, and the one a week on, are already on the device.
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-23', '2026-11-28', { fetchImpl, now: NOW + DAY, storage, ahead: 14 });
    await fetchNormals(['01396500'], METRICS.flow, '2026-11-30', '2026-12-05', { fetchImpl, now: NOW + 8 * DAY, storage, ahead: 14 });
    expect(asked).toHaveLength(1);
    // Past what was fetched, it asks again — and a fortnight on from there.
    await fetchNormals(['01396500'], METRICS.flow, '2026-12-07', '2026-12-12', { fetchImpl, now: NOW + 15 * DAY, storage, ahead: 14 });
    expect(asked).toHaveLength(2);
    expect(asked[1].url.searchParams.get('end_date')).toBe('12-26');
    // Not across New Year: days of the year don't run from December into January.
    await fetchNormals(['01457000'], METRICS.flow, '2026-12-23', '2026-12-28', { fetchImpl, now: NOW, storage, ahead: 14 });
    expect(asked[2].url.searchParams.get('start_date')).toBe('12-23');
    expect(asked[2].url.searchParams.get('end_date')).toBe('12-28');
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
    expect(normals.get('01396500')['11-01']).toEqual([2, 30, 40, 50, 60]);
    expect(normals.get('01396500')['11-26']).toEqual([20, 66, 91, 126, 200]);
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
    expect(normals.get('01400500')['11-26']).toEqual([35.6, 41, 50, 59, expect.closeTo(64.4, 5)]);
    expect(JSON.parse(storage.kept['fishyfriends:gauge-normals']).sites['01400500|00010'].days['11-26']).toEqual([2, 5, 10, 15, 18]);
  });

  test('a line USGS wouldn\'t give stays missing through the conversion', async () => {
    const { fetchImpl } = usgs(() => answer({ features: [station('01400500', [record([percentiles('11-26', ['nan', 'nan', 5, 10, 15, 'nan', 'nan'], 8)], { parameter: '00010' })])] }));
    const normals = await fetchNormals(['01400500'], METRICS.temp, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW });
    expect(normals.get('01400500')['11-26']).toEqual([null, 41, 50, 59, null]);
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
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: full })).get('01396500')['11-26']).toEqual([20, 66, 91, 126, 200]);
    const rubbish = fakeStorage({ 'fishyfriends:gauge-normals': '{not json' });
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: rubbish })).size).toBe(1);
    // What a device kept when a day was three lines, not five, is not read as five: it is asked for again.
    const older = fakeStorage({ 'fishyfriends:gauge-normals': JSON.stringify({ version: 1, sites: { '01396500|00060': { at: NOW, days: { '11-26': [1, 2, 3] }, whole: true } } }) });
    expect((await fetchNormals(['01396500'], METRICS.flow, '2026-11-26', '2026-11-26', { fetchImpl, now: NOW, storage: older })).get('01396500')['11-26']).toEqual([20, 66, 91, 126, 200]);
    expect(JSON.parse(older.kept['fishyfriends:gauge-normals']).version).toBe(2);
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
  test('the median, and the usual range round it, are drawn through each day of the stretch that has them', () => {
    const normals = { '11-24': [30, 60, 86, 120, 200], '11-26': [null, 61, 85, 121, null] };
    expect(normalSeries(normals, '2026-11-24', '2026-11-26')).toEqual([
      { t: dayToMs('2026-11-24'), v: 86, low: 60, high: 120, day: '2026-11-24' }, { t: dayToMs('2026-11-26'), v: 85, low: 61, high: 121, day: '2026-11-26' },
    ]);
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

describe('the average water temperature', () => {
  const gauges = ['a', 'b', 'c', 'd'].map((site) => ({ site_no: site }));
  const at = (v) => ({ t: NOW, v });

  test('is the newest reading at each gauge that measures it, added up and divided by how many there are', () => {
    const temps = new Map([['a', at(44.6)], ['c', at(41.0)], ['d', at(47.3)], ['z', at(90)]]);
    expect(averageTemperature(gauges, temps)).toEqual({ mean: expect.closeTo(44.3, 5), gauges: 3, low: 41.0, high: 47.3 });
    // Only the gauges being shown are in it: another state's, read earlier this visit, are not.
    expect(averageTemperature(gauges.slice(0, 2), temps)).toEqual({ mean: 44.6, gauges: 1, low: 44.6, high: 44.6 });
    expect(averageTemperature(gauges, new Map())).toBeNull();
    expect(averageTemperature([], temps)).toBeNull();
    // A reading that isn't a number is no reading.
    expect(averageTemperature(gauges, new Map([['a', at(NaN)], ['b', at(40)]]))).toMatchObject({ mean: 40, gauges: 1 });
  });

  test('and is said as a sentence, the figure apart from the words round it', () => {
    // A number and its unit are held together by a no-break space, so a line never ends between them.
    const F = '\u00A0°F';
    expect(temperatureText({ mean: 44.3, gauges: 20, low: 39.44, high: 47.82 })).toEqual(['Water is averaging ', `44.3${F}`, `, from 39.4${F} to 47.8${F}.`]);
    expect(temperatureText({ mean: 44.6, gauges: 1, low: 44.6, high: 44.6 }).join('')).toBe(`Water is 44.6${F} at the one gauge that measures it.`);
    // Every gauge reading the same to a tenth of a degree: no "from 44.6 °F to 44.6 °F".
    expect(temperatureText({ mean: 44.6, gauges: 2, low: 44.58, high: 44.62 }).join('')).toBe(`Water is averaging 44.6${F}.`);
    expect(temperatureText(null)).toEqual(['None of these gauges is reporting water temperature right now.', '', '']);
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
