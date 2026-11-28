import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RiverGauges from './RiverGauges';
import { useAuth } from './context/AuthContext';
import * as usgs from './utils/riverGauges';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
// The page's arithmetic is the real thing; only the four questions it puts to USGS, and the
// search, are answered here. (The board is read from one answer: the last three days of every
// gauge's flow and, where it has a thermometer, its water temperature.) CRA resets mocks
// between tests, so each test gets its answers from beforeEach.
jest.mock('./utils/riverGauges', () => ({
  ...jest.requireActual('./utils/riverGauges'),
  fetchMeasured: jest.fn(), fetchDaily: jest.fn(), fetchContinuous: jest.fn(), fetchNormals: jest.fn(), searchGauges: jest.fn(),
}));

const real = jest.requireActual('./utils/riverGauges');
const FLOW = real.METRICS.flow;
const TEMP = real.METRICS.temp;
const BOTH = [FLOW, TEMP];
// Half past ten on a Thursday morning wherever the tests run, so "today" is the 26th in any zone.
const NOW = new Date(2026, 10, 26, 10, 30).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MINUTE = 60 * 1000;
// Every gauge's newest reading was taken twenty minutes before it was read.
const AGE = 20 * MINUTE;
const MONTH = real.periodRange('30d', NOW);
const dayAway = (day, days) => real.dayOf(real.dayToMs(day) + days * DAY);
// The normals are asked for with a day either side of the stretch they are for.
const around = (range) => [dayAway(range.startDay, -1), dayAway(range.endDay, 1)];
const NEAR = around(real.periodRange('3d', NOW));

const gauge = (id, site, river, place, position, more = {}) => ({ id, site_no: site, river, place, state: 'NJ', position, added_by: null, added_by_name: '', created_at: '2026-11-26T00:00:00Z', ...more });
const CLUB = [
  gauge('g1', '01396500', 'South Branch Raritan', 'near High Bridge', 1),
  gauge('g2', '01380450', 'Rockaway River', 'at Boonton', 5),
  gauge('g3', '01379845', 'Rockaway River', 'at Dover', 7),
  gauge('g4', '01400500', 'Raritan River', 'at Manville', 13),
  gauge('g5', '01443500', 'Paulins Kill', 'at Blairstown', 1000, { added_by: 'me', added_by_name: 'Andre' }),
  gauge('g6', '01449000', 'Lehigh River', 'at Lehighton', 1001, { state: 'PA', added_by: 'someone-else', added_by_name: 'Marta' }),
];
const NJ = ['01396500', '01380450', '01379845', '01400500', '01443500'];

// What each gauge has done over the last three days, as [hours before its newest reading,
// cfs], drawn straight between them:
//   South Branch Raritan   came up overnight, peaked yesterday afternoon, on its way down
//   Rockaway at Boonton    flat until early this morning, and climbing fast since
//   the other four         have not moved
const FLOWS = {
  '01396500': [[72, 43], [30, 43], [20, 647], [6, 262], [0, 229]],
  '01380450': [[72, 100], [8, 100], [6, 600], [0, 872]],
  '01379845': [[72, 70], [0, 70]],
  '01400500': [[72, 200], [0, 200]],
  '01443500': [[72, 345], [0, 345]],
  '01449000': [[72, 310], [0, 310]],
};
// The day's five lines for each gauge that has a long-run record: the 10th, 25th, 50th, 75th
// and 90th percentile. So in New Jersey: one high, one very high, one normal, one low, and
// one USGS can't rate.
const LINES = {
  '01396500': [38, 53, 85, 170, 242],
  '01380450': [67, 116, 172, 384, 582],
  '01379845': [19, 45, 64.8, 106, 412],
  '01400500': [167, 228, 466, 947, 1469],
  '01449000': [100, 200, 300, 400, 600],
};
// One New Jersey gauge has a thermometer, as it was when the page was first built.
const WARMTH = { '01400500': [[72, 43.5], [16, 42.8], [0, 44.6]] };

// A record every fifteen minutes, ending `AGE` before `readAt`.
function drawn(knots, readAt) {
  const points = [];
  for (let quarter = Math.round(knots[0][0] * 4); quarter >= 0; quarter -= 1) {
    const ago = quarter / 4;
    const after = knots.findIndex(([hours]) => hours <= ago);
    const [fromAgo, fromValue] = knots[Math.max(0, after - 1)];
    const [toAgo, toValue] = knots[after];
    const along = fromAgo === toAgo ? 1 : (fromAgo - ago) / (fromAgo - toAgo);
    points.push({ t: readAt - AGE - ago * HOUR, v: after === 0 ? toValue : fromValue + (toValue - fromValue) * along });
  }
  return points;
}

// The last three days of some gauges, as fetchMeasured hands them over.
const records = (sites, readAt, { flows = FLOWS, warmth = WARMTH } = {}) => new Map(sites
  .filter((site) => flows[site] || warmth[site])
  .map((site) => [site, { ...(flows[site] ? { flow: drawn(flows[site], readAt) } : {}), ...(warmth[site] ? { temp: drawn(warmth[site], readAt) } : {}) }]));
const flowNow = (flows, site) => flows[site][flows[site].length - 1][1];

function answers({ flows = FLOWS, lines = LINES, warmth = WARMTH } = {}) {
  usgs.fetchMeasured.mockImplementation(async (sites, metrics, startMs, endMs) => records(sites, endMs, { flows, warmth }));
  usgs.fetchNormals.mockImplementation(async (sites, metric, startDay, endDay) => new Map(sites.filter((site) => metric.key === 'flow' && lines[site])
    .map((site) => [site, Object.fromEntries(real.daysBetween(startDay, endDay).map((day) => [real.dayOfYear(day), lines[site]]))])));
  usgs.fetchDaily.mockImplementation(async (sites, metric, startDay, endDay) => {
    const value = (site) => (metric.key === 'flow' ? (flows[site] ? flowNow(flows, site) : undefined) : (warmth[site] ? flowNow(warmth, site) : undefined));
    // Daily means stop at yesterday.
    return new Map(sites.filter((site) => value(site) !== undefined).map((site) => [site, real.daysBetween(startDay, endDay).slice(0, -1).map((day, index) => ({ t: real.dayToMs(day), v: value(site) + index, day }))]));
  });
  usgs.fetchContinuous.mockImplementation(async (sites, metric, startMs, endMs) => new Map(sites.filter((site) => flows[site])
    .map((site) => [site, Array.from({ length: 48 }, (_, index) => ({ t: endMs - (48 - index) * HOUR, v: flowNow(flows, site) + index / 10 }))])));
  usgs.searchGauges.mockResolvedValue([]);
}

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'me' },
    isAdmin: false,
    listRiverGauges: jest.fn().mockResolvedValue(CLUB),
    addRiverGauge: jest.fn().mockResolvedValue({ error: null, gauge: null }),
    removeRiverGauge: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

let time;
const clock = () => time;

async function open(overrides) {
  const auth = makeBaseAuth(overrides);
  useAuth.mockReturnValue(auth);
  const view = render(<RiverGauges clock={clock} />);
  await screen.findByRole('button', { name: /add a gauge/i });
  return { auth, ...view };
}

const MIXED = 'A mixed picture for late November: 1 gauge is rising and 1 dropping.';
const text = (node) => (node ? node.textContent.replace(/ /g, ' ').trim() : '');
const river = (name) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
// A line of the board, cell by cell: where, how it is running (and which way), against
// normal, flow, water.
const running = (cell) => (cell.children.length ? [...cell.children].map(text).join(' · ') : text(cell));
const linesOf = (name) => [...river(name).querySelectorAll('.river-line')].map((row) => [
  text(row.querySelector('.river-line-place')), running(row.querySelector('.river-line-status')), text(row.querySelector('.river-line-ratio')),
  text(row.querySelector('.river-line-now')), text(row.querySelector('.river-line-temp')),
]);
const rivers = () => [...document.querySelectorAll('.river-board h2 .river-name')].map((name) => name.firstChild.textContent);
const card = (name) => screen.getByRole('article', { name });
// One of a card's numbers: what is under its label.
const fact = (name, label) => [...within(card(name)).getByText(label).closest('div').querySelectorAll('dd')].map(text);
const notes = (name) => within(card(name)).queryAllByRole('listitem').map(text);
const tallyOf = () => within(screen.getByRole('group', { name: 'Gauges by how they are running' })).getAllByRole('button').map((cell) => cell.textContent.replace(/[▲▼●]/g, ''));
const count = (label) => within(screen.getByRole('group', { name: 'Gauges by how they are running' })).getByRole('button', { name: new RegExp(` ${label}$`) });
const kept = () => JSON.parse(window.localStorage.getItem('fishyfriends:gauges-view'));
const asked = () => ({ record: usgs.fetchMeasured.mock.calls.length, daily: usgs.fetchDaily.mock.calls.length, measured: usgs.fetchContinuous.mock.calls.length, normals: usgs.fetchNormals.mock.calls.length });
const settled = () => waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
const water = () => document.querySelector('.gauge-water');
const HIGH_BRIDGE = 'South Branch Raritan near High Bridge';

beforeEach(() => {
  window.localStorage.clear();
  time = NOW;
  answers();
});

describe('the board', () => {
  test('says in a sentence how the rivers are running, and counts them from very low to very high', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'River gauges', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText(MIXED)).toBeInTheDocument();
    expect(tallyOf()).toEqual(['0 Very low', '1 Low', '1 Normal', '1 High', '1 Very high']);
    // The gauge USGS can't rate is in none of the five, and that is said.
    expect(screen.getByText('Not counted: 1 with too short a record to say.')).toBeInTheDocument();
    // What "normal" means, and what the advice is worth, are said on the page, not left to be guessed.
    expect(screen.getByText(/Normal is the median flow for today's date over every year a gauge has on record/)).toHaveTextContent(/it can't see the colour of the water, so look before you wade\.$/);
  });

  test('is a row a river, in the club\'s order, gauges on the same river together', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(rivers()).toEqual(['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']);
    for (const name of rivers()) expect(river(name)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
  });

  test('each line says how the gauge is running and which way it is going, what that is against normal, its flow and its water', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '▲High · dropping', '2.7× normal', '229 cfs', '']]);
    expect(linesOf('Rockaway River')).toEqual([['at Boonton', '▲▲Very high · rising fast', '5.1× normal', '872 cfs', ''], ['at Dover', '●Normal · steady', '1.1× normal', '70.0 cfs', '']]);
    expect(linesOf('Raritan River')).toEqual([['at Manville', '▼Low · steady', '43% of normal', '200 cfs', '44.6 °F']]);
    expect(linesOf('Paulins Kill')).toEqual([['at Blairstown', 'No long-run normal · steady', '', '345 cfs', '']]);
    // The shapes, the scale and the little line are for the eye; the words beside them are what is read out.
    expect(river('South Branch Raritan')).toHaveAccessibleName('South Branch Raritan near High Bridge High dropping 2.7× normal 229 cfs');
    expect(river('Raritan River')).toHaveAccessibleName('Raritan River at Manville Low steady 43% of normal 200 cfs 44.6\u00A0°F');
  });

  test('and shows it on a scale from a quarter of normal to four times it, the same on every line', async () => {
    await open();
    await screen.findByText(MIXED);
    const scale = (name, line = 0) => river(name).querySelectorAll('.flow-meter')[line];
    const at = (name, line) => parseFloat(scale(name, line).querySelector('.flow-meter-now').style.left);
    const place = (times) => 50 + (Math.log(times) / (2 * Math.log(4))) * 100;
    expect(at('South Branch Raritan')).toBeCloseTo(place(229 / 85), 0);
    expect(at('Rockaway River', 1)).toBeCloseTo(place(70 / 64.8), 0);
    expect(at('Raritan River')).toBeCloseTo(place(200 / 466), 0);
    // Five times normal is off the end: the marker sits at it, as an arrowhead.
    expect(at('Rockaway River', 0)).toBe(100);
    expect(scale('Rockaway River', 0)).toHaveClass('is-off', 'is-off-high', 'is-far');
    expect(scale('South Branch Raritan')).not.toHaveClass('is-off');
    // The usual range and the wider one round it are on every rated line; a gauge with no normal has an empty scale.
    expect(scale('South Branch Raritan').querySelectorAll('.flow-meter-inner, .flow-meter-outer')).toHaveLength(2);
    expect(scale('Paulins Kill')).toHaveClass('is-blank');
    // Each line has the shape of its last three days beside it.
    expect(river('South Branch Raritan').querySelector('.flow-spark path').getAttribute('d')).toMatch(/^M1\.0 /);
  });

  test('under the sentence, the average water temperature of the gauges that measure it, and what it means for trout', async () => {
    answers({ warmth: { '01400500': [[72, 44.6], [0, 44.6]], '01443500': [[72, 41], [0, 41]], '01380450': [[72, 47.3], [0, 47.3]], '01449000': [[72, 39.2], [0, 39.2]] } });
    await open();
    await screen.findByText(MIXED);
    expect(text(water())).toBe('Water is averaging 44.3 °F across the 3 gauges that measure it, from 41.0 °F to 47.3 °F. Cool for trout: they feed, but slowly.');
    // The figure is set apart from the words round it.
    expect(within(water()).getByText('44.3 °F').tagName).toBe('STRONG');
    // Both lines are one announcement to a screen reader, and this one is read out whole.
    expect(water().closest('[role="status"]')).toContainElement(screen.getByText(MIXED));
    expect(water()).toHaveAttribute('aria-atomic', 'true');
    // Every line whose gauge has a thermometer carries its own.
    expect(linesOf('Rockaway River').map((line) => line[4])).toEqual(['47.3 °F', '']);
    // It came with the flows: one question about what the gauges are doing, and none for a chart.
    expect(asked()).toEqual({ record: 1, daily: 0, measured: 0, normals: 1 });
    // Another state's gauges have an average of their own.
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    expect(water()).toBeNull();
    await screen.findByText('Near normal for late November and holding steady.');
    expect(text(water())).toBe('Water is 39.2 °F at the one gauge that measures it. Cold for trout: fish slow and deep, and expect the afternoon to be best.');
  });

  test('water too warm for trout is marked on its line, and said at the top', async () => {
    answers({ warmth: { '01400500': [[72, 70.2], [0, 70.2]], '01380450': [[72, 66], [0, 66]], '01379845': [[72, 58], [0, 58]] } });
    await open();
    await screen.findByText(MIXED);
    expect(linesOf('Raritan River')[0][4]).toBe('70.2 °F too warm');
    expect(linesOf('Rockaway River').map((line) => line[4])).toEqual(['66.0 °F warm', '58.0 °F']);
    expect(river('Raritan River').querySelector('.river-line-temp')).toHaveClass('is-warm');
    expect(river('Rockaway River').querySelectorAll('.river-line-temp')[1]).not.toHaveClass('is-warm');
    // An average of 64.7 °F sounds fine; the river at 70 isn't, and the line says so.
    expect(text(water())).toBe('Water is averaging 64.7 °F across the 3 gauges that measure it, from 58.0 °F to 70.2 °F. Right where trout like it. The warmest of them is too warm.');
  });

  test('where no gauge has a thermometer it says that instead of an average', async () => {
    answers({ warmth: {} });
    await open();
    await screen.findByText(MIXED);
    expect(text(water())).toBe('None of these gauges is reporting water temperature right now.');
    expect(water().querySelector('strong')).toBeNull();
  });

  test('all of that takes two questions to USGS, about every gauge at once, and none for a chart', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(1);
    // The last three days of flow and of water temperature are one question, kept at a reading every fifteen minutes.
    expect(usgs.fetchMeasured).toHaveBeenCalledWith(NJ, BOTH, NOW - 72 * HOUR, NOW, expect.objectContaining({ fresh: false, every: 15 * MINUTE }));
    expect(usgs.fetchNormals).toHaveBeenCalledTimes(1);
    // (And a fortnight of them past today, so tomorrow's visit is one question.)
    expect(usgs.fetchNormals).toHaveBeenCalledWith(NJ, FLOW, NEAR[0], NEAR[1], expect.objectContaining({ now: NOW, storage: window.localStorage, ahead: 14 }));
    expect(asked()).toMatchObject({ daily: 0, measured: 0 });
  });

  test('a gauge that isn\'t reporting says so instead of a number, and isn\'t counted', async () => {
    answers({ flows: { ...FLOWS, '01400500': undefined } });
    await open();
    // Its thermometer is still working: the water line has it, the counts don't.
    expect(await screen.findByText('Running high for late November: 1 gauge is rising and 1 dropping.')).toBeInTheDocument();
    expect(linesOf('Raritan River')).toEqual([['at Manville', 'Not reporting', '', '—', '44.6 °F']]);
    expect(tallyOf()).toEqual(['0 Very low', '0 Low', '1 Normal', '1 High', '1 Very high']);
    expect(screen.getByText('Not counted: 1 not reporting, 1 with too short a record to say.')).toBeInTheDocument();
  });

  test('while USGS is being asked the lines and the counts wait rather than guess', async () => {
    let answer;
    usgs.fetchMeasured.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await open();
    expect(screen.getByText('Reading the gauges...')).toBeInTheDocument();
    expect(water()).toBeNull();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '…', '', '', '']]);
    expect(tallyOf()).toEqual(['– Very low', '– Low', '– Normal', '– High', '– Very high']);
    for (const cell of within(screen.getByRole('group', { name: 'Gauges by how they are running' })).getAllByRole('button')) expect(cell).toBeDisabled();
    expect(await screen.findByRole('button', { name: 'Reading...' })).toBeDisabled();
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
    await act(async () => { answer(records(['01396500'], NOW)); });
    await screen.findByText('Running high for late November and dropping.');
    expect(text(water())).toBe('None of these gauges is reporting water temperature right now.');
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '▲High · dropping', '2.7× normal', '229 cfs', '']]);
    expect(screen.getByText('Not counted: 4 not reporting.')).toBeInTheDocument();
    expect(screen.getByText('Read at 10:30 AM')).toBeInTheDocument();
  });

  test('with no gauges on the list it says so and offers to add the first', async () => {
    await open({ listRiverGauges: jest.fn().mockResolvedValue([]) });
    expect(screen.getByText('No gauges on the club\'s list yet. Add the first one below.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Gauges by how they are running' })).toBeNull();
    expect(usgs.fetchMeasured).not.toHaveBeenCalled();
  });

  test('another state\'s rivers are a choice away, and only they are asked about', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(within(screen.getByLabelText('State')).getAllByRole('option').map((option) => option.textContent)).toEqual(['New Jersey', 'Pennsylvania']);
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    expect(await screen.findByText('Near normal for late November and holding steady.')).toBeInTheDocument();
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '●Normal · steady', 'right at normal', '310 cfs', '']]);
    expect(usgs.fetchMeasured).toHaveBeenLastCalledWith(['01449000'], BOTH, expect.any(Number), NOW, expect.anything());
    expect(kept().state).toBe('PA');
    // Going back asks nothing: New Jersey was read a moment ago.
    userEvent.selectOptions(screen.getByLabelText('State'), 'NJ');
    await screen.findByText(MIXED);
    expect(asked()).toMatchObject({ record: 2, normals: 2 });
  });

  test('a club with gauges in one state has no state to choose', async () => {
    await open({ listRiverGauges: jest.fn().mockResolvedValue(CLUB.filter((row) => row.state === 'NJ')) });
    await screen.findByText(MIXED);
    expect(screen.queryByLabelText('State')).toBeNull();
  });

  test('a count is a way of seeing just the rivers running that way, and what was picked is said', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(screen.getByText('Not counted: 1 with too short a record to say.')).toBeInTheDocument();
    expect(count('Very low')).toBeDisabled();
    userEvent.click(count('Very high'));
    expect(count('Very high')).toHaveAttribute('aria-pressed', 'true');
    // A river with two gauges stays whole when either is running that way.
    expect(rivers()).toEqual(['Rockaway River']);
    expect(linesOf('Rockaway River')).toHaveLength(2);
    expect(screen.getByText(/^Only the rivers running very high\./)).toBeInTheDocument();
    // The same count again puts the rest back; so does Show all.
    userEvent.click(count('Very high'));
    expect(rivers()).toHaveLength(4);
    userEvent.click(count('Low'));
    expect(rivers()).toEqual(['Raritan River']);
    userEvent.click(count('Normal'));
    expect(rivers()).toEqual(['Rockaway River']);
    expect(count('Low')).toHaveAttribute('aria-pressed', 'false');
    userEvent.click(screen.getByRole('button', { name: 'Show all' }));
    expect(rivers()).toEqual(['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']);
    // It is a way of looking, and asks USGS nothing.
    expect(asked()).toEqual({ record: 1, daily: 0, measured: 0, normals: 1 });
  });

  test('rivers all of whose gauges are in their usual range are named when they are the exception', async () => {
    answers({ flows: { ...FLOWS, '01380450': [[72, 300], [0, 300]], '01400500': [[72, 2000], [0, 2000]] }, lines: { ...LINES, '01443500': [100, 200, 300, 400, 600] } });
    await open();
    // Both Rockaway gauges and the Paulins Kill are normal; the other two are far above.
    expect(await screen.findByText('Near normal for late November; 1 gauge is dropping.')).toBeInTheDocument();
    expect(tallyOf()).toEqual(['0 Very low', '0 Low', '3 Normal', '1 High', '1 Very high']);
    expect(screen.getByText('Tap a count to see just those.')).toBeInTheDocument();
  });
});

describe('an open river', () => {
  test('opening one asks USGS for nothing: its three-day chart is the record the board was read from', async () => {
    const { container } = await open();
    await screen.findByText(MIXED);
    const before = asked();
    userEvent.click(river('South Branch Raritan'));
    expect(river('South Branch Raritan')).toHaveAttribute('aria-expanded', 'true');
    // The line stays where it was: opening a row adds to it, and moves nothing.
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '▲High · dropping', '2.7× normal', '229 cfs', '']]);
    const slider = await screen.findByRole('slider', { name: 'South Branch Raritan near High Bridge, flow: readings along the chart' });
    await settled();
    expect(asked()).toEqual(before);
    // This period against normal: the median, the usual range behind it, and no last year.
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-band')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(0);
    // Read to the minute: the newest reading was taken at ten past ten.
    expect(slider).toHaveAttribute('aria-valuetext', 'Nov 26, 10:10 AM: this period 229 cfs, normal 85.0 cfs');
    expect(text(container.querySelector('.gauge-readout'))).toMatch(/This period229 cfs.*Normal85\.0 cfsusually 53\.0 to 170$/);
    expect(within(card(HIGH_BRIDGE)).getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a gauge\'s card says the read in a few words, the story behind it, and the numbers', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    const high = within(card(HIGH_BRIDGE));
    expect(high.getByRole('heading', { level: 3, name: 'near High Bridge' })).toBeInTheDocument();
    expect(high.getByRole('link', { name: 'USGS 01396500' })).toHaveAttribute('href', 'https://waterdata.usgs.gov/monitoring-location/USGS-01396500/');
    expect(high.getByRole('link', { name: 'USGS 01396500' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(high.getByText(/read 20 min ago/)).toBeInTheDocument();
    expect(high.getByText('High and dropping')).toHaveClass('gauge-read-title');
    expect(high.getByText('Peaked at 647 cfs yesterday afternoon.')).toBeInTheDocument();
    expect(fact(HIGH_BRIDGE, 'Flow now')).toEqual(['229 cfs', '2.7× normal']);
    expect(fact(HIGH_BRIDGE, 'Normal for Nov 26')).toEqual(['85.0 cfs', 'usually 53.0 to 170']);
    // Which way it is going now comes first: it is up on yesterday and on its way down.
    expect(fact(HIGH_BRIDGE, 'Last 6 hours')).toEqual(['Down 13%', 'down 44% since this time yesterday']);
    expect(fact(HIGH_BRIDGE, 'Water')).toEqual(['—', 'no thermometer here']);
  });

  test('and how to fish it: a line for the water, one for its direction, one for its temperature', async () => {
    await open();
    await screen.findByText(MIXED);
    for (const name of ['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']) userEvent.click(river(name));
    await waitFor(() => expect(screen.getAllByRole('slider')).toHaveLength(5));
    expect(within(card(HIGH_BRIDGE)).getByRole('heading', { level: 4, name: 'How to fish it' })).toBeInTheDocument();
    expect(notes(HIGH_BRIDGE)).toEqual([
      'More push than usual. Trout slide out of the heavy current to the soft edges, seams and eddies near the bank: fish those, with more weight and heavier line than usual (3X or 4X tippet on a fly rod).',
      'On its way down, and it should clear as it drops: watch for the colour to go.',
    ]);
    // Very high and still climbing: where to stand, and a warning.
    const boonton = 'Rockaway River at Boonton';
    expect(within(card(boonton)).getByText('Very high and rising fast')).toBeInTheDocument();
    expect(within(card(boonton)).getByText('Up from 100 cfs early this morning.')).toBeInTheDocument();
    expect(fact(boonton, 'Last 6 hours')).toEqual(['Up 45%', '8.7 times what it was this time yesterday']);
    expect(notes(boonton)).toEqual([expect.stringMatching(/^A lot more water than is usual.*Fish it from the bank if at all/), expect.stringMatching(/^Rising fast\. It can be a different river in an hour/)]);
    expect(notes('Rockaway River at Dover')).toEqual(['About its usual flow for the date: fish it the way you normally would.']);
    // Low, with a thermometer: the water gets its line, and its number says what the day did.
    const manville = 'Raritan River at Manville';
    expect(within(card(manville)).getByText('Low and steady')).toBeInTheDocument();
    expect(fact(manville, 'Water')).toEqual(['44.6 °F', 'Cool for trout · 42.8 to 44.6 in a day']);
    expect(notes(manville)).toEqual([expect.stringMatching(/^Low and probably clear\./), 'Water is cool (44.6 °F). Trout feed but won\'t chase: slow everything down. Late morning through the afternoon is usually best.']);
    // A gauge USGS can't rate, that hasn't moved, with no thermometer: the numbers, and no advice made up.
    const blairstown = 'Paulins Kill at Blairstown';
    expect(within(card(blairstown)).getByText('Steady')).toBeInTheDocument();
    expect(fact(blairstown, 'Flow now')).toEqual(['345 cfs', 'no normal to hold it to']);
    expect(fact(blairstown, 'Normal for Nov 26')).toEqual(['—', 'too short a record']);
    expect(fact(blairstown, 'Last 6 hours')).toEqual(['Unchanged', 'unchanged since this time yesterday']);
    expect(notes(blairstown)).toEqual([]);
    expect(within(card(blairstown)).queryByRole('heading', { name: 'How to fish it' })).toBeNull();
  });

  test('a second river opens from what was already read, and closing one takes its card away', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    const before = asked();
    userEvent.click(river('Rockaway River'));
    expect(await screen.findAllByRole('slider')).toHaveLength(3);
    await settled();
    expect(asked()).toEqual(before);
    userEvent.click(river('Rockaway River'));
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(river('Rockaway River')).toHaveAttribute('aria-expanded', 'false');
    expect(linesOf('Rockaway River')).toHaveLength(2);
  });

  test('Close all shuts every open river, and is only there when one is', async () => {
    await open();
    await screen.findByText(MIXED);
    expect(screen.queryByRole('button', { name: 'Close all' })).toBeNull();
    userEvent.click(river('South Branch Raritan'));
    userEvent.click(river('Paulins Kill'));
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    expect(kept().open).toEqual(['NJ|south branch raritan', 'NJ|paulins kill']);
    userEvent.click(screen.getByRole('button', { name: 'Close all' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(kept().open).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Close all' })).toBeNull();
  });

  test('which rivers are open is kept on the device, and the next visit opens them at no more cost', async () => {
    const first = await open();
    userEvent.click(await screen.findByRole('button', { name: /^Rockaway River/ }));
    await screen.findAllByRole('slider');
    expect(kept()).toEqual({ version: 2, state: 'NJ', metric: 'flow', period: '3d', scale: 'log', open: ['NJ|rockaway'] });
    first.unmount();
    jest.clearAllMocks();
    answers();
    await open();
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    expect(river('Rockaway River')).toHaveAttribute('aria-expanded', 'true');
    expect(river('Raritan River')).toHaveAttribute('aria-expanded', 'false');
    await screen.findByText(MIXED);
    await settled();
    expect(asked()).toEqual({ record: 1, daily: 0, measured: 0, normals: 1 });
  });

  test('what a device kept before the page was a board: its rivers stay open, the month of daily means doesn\'t', async () => {
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ state: 'NJ', metric: 'temp', period: '30d', scale: 'linear', open: ['NJ|rockaway'] }));
    await open();
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    const boonton = within(card('Rockaway River at Boonton'));
    expect(boonton.getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(boonton.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
    // How they like the axis is how they like it.
    expect(boonton.getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true');
    await settled();
    expect(asked()).toMatchObject({ daily: 0, measured: 0 });
  });

  test('what was kept on a device can be nonsense without breaking the page', async () => {
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ version: 2, state: 7, metric: 'salinity', period: 'custom', scale: 'cubic', open: ['NJ|rockaway', 4, null] }));
    const first = await open();
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    const boonton = within(card('Rockaway River at Boonton'));
    expect(boonton.getByRole('button', { name: '3 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(boonton.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
    expect(boonton.getByRole('button', { name: 'Log' })).toHaveAttribute('aria-pressed', 'true');
    first.unmount();
    window.localStorage.setItem('fishyfriends:gauges-view', '{broken');
    await open();
    expect(await screen.findByText(MIXED)).toBeInTheDocument();
  });
});

describe('what is charted', () => {
  async function withOneOpen(overrides) {
    const view = await open(overrides);
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
    return view;
  }
  // A reading every fifteen minutes, the newest twenty minutes old: 287 of them inside three days.
  const THREE_DAYS = '286';

  test('thirty days reads the daily means for every gauge in the state, last year\'s and the normals, and keeps the old chart up, dimmed, until they are in', async () => {
    const { container } = await withOneOpen();
    let answer;
    const daily = usgs.fetchDaily.getMockImplementation();
    // This period's record is held back; last year's comes straight away.
    usgs.fetchDaily.mockImplementation((sites, metric, startDay, endDay) => (startDay === MONTH.startDay ? new Promise((resolve) => { answer = () => resolve(daily(sites, metric, startDay, endDay)); }) : daily(sites, metric, startDay, endDay)));
    userEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    const waiting = card(HIGH_BRIDGE);
    expect(waiting).toHaveClass('is-stale');
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    expect(within(waiting).getByRole('slider')).toHaveAttribute('aria-valuemax', THREE_DAYS);
    await waitFor(() => expect(usgs.fetchDaily).toHaveBeenCalledTimes(2));
    expect(usgs.fetchDaily.mock.calls.map(([sites, metric, start, end]) => [sites, metric.key, start, end])).toEqual([
      [NJ, 'flow', MONTH.startDay, MONTH.endDay], [NJ, 'flow', real.yearBefore(MONTH.startDay), real.yearBefore(MONTH.endDay)],
    ]);
    expect(usgs.fetchNormals).toHaveBeenLastCalledWith(NJ, FLOW, ...around(MONTH), expect.objectContaining({ storage: window.localStorage }));
    await act(async () => { answer(); });
    await waitFor(() => expect(card(HIGH_BRIDGE)).not.toHaveClass('is-stale'));
    // Thirty daily means and the reading from twenty minutes ago; all three lines, read to the day.
    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-valuemax', '30');
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/^Nov 26: this period 229 cfs, last year [\d.,]+ cfs, normal 85\.0 cfs$/));
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
    // The board was never part of it.
    expect(asked()).toEqual({ record: 1, daily: 2, measured: 0, normals: 2 });
    expect(kept().period).toBe('30d');
  });

  test('seven days charts the record as measured, this year\'s and last year\'s both', async () => {
    await withOneOpen();
    const week = real.periodRange('7d', NOW);
    const hours = (endMs, base) => Array.from({ length: 48 }, (_, index) => ({ t: endMs - (48 - index) * HOUR, v: base + index / 10 }));
    usgs.fetchContinuous.mockImplementation(async (sites, metric, startMs, endMs) => new Map([['01396500', startMs === week.startMs ? hours(NOW, 200) : hours(endMs - DAY, 20)]]));
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '48'));
    expect(usgs.fetchContinuous).toHaveBeenCalledWith(NJ, FLOW, week.startMs, week.endMs, expect.objectContaining({ now: NOW }));
    // Last year is the measured record too — the same week a year back, with a day to spare
    // at its end — and not the daily means the longer charts use.
    expect(usgs.fetchContinuous).toHaveBeenCalledWith(NJ, FLOW, real.yearBeforeMs(week.startMs), real.yearBeforeMs(week.endMs) + DAY, expect.objectContaining({ now: NOW }));
    expect(usgs.fetchContinuous).toHaveBeenCalledTimes(2);
    expect(usgs.fetchDaily).not.toHaveBeenCalled();
    // Read to the minute, last year's line included: 24.7 was read an hour before "now" a year ago.
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', 'Nov 26, 10:10 AM: this period 229 cfs, last year 24.7 cfs, normal 85.0 cfs');
  });

  test('a view already looked at this visit is not asked for again', async () => {
    await withOneOpen();
    userEvent.click(screen.getByRole('button', { name: '1 year' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '365'));
    await settled();
    const year = real.periodRange('1y', NOW);
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, year.startDay, year.endDay, expect.anything());
    const before = asked();
    userEvent.click(screen.getByRole('button', { name: '3 days' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', THREE_DAYS));
    userEvent.click(screen.getByRole('button', { name: '1 year' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '365'));
    await settled();
    expect(asked()).toEqual(before);
    expect(kept().period).toBe('1y');
  });

  test('the axis is a way of looking, not a question: log or straight, nothing is asked', async () => {
    const { container } = await withOneOpen();
    const ticks = () => [...container.querySelectorAll('.gauge-tick')].map((tick) => tick.textContent);
    const log = ticks();
    const before = asked();
    userEvent.click(screen.getByRole('button', { name: 'Linear' }));
    expect(ticks()).not.toEqual(log);
    expect(ticks()[0]).toBe('0');
    expect(kept().scale).toBe('linear');
    userEvent.click(screen.getByRole('button', { name: 'Log' }));
    expect(ticks()).toEqual(log);
    expect(asked()).toEqual(before);
  });

  test('every chart has the same controls over it, and they are one setting for all of them', async () => {
    await withOneOpen();
    userEvent.click(river('Rockaway River'));
    expect(await screen.findAllByRole('slider')).toHaveLength(3);
    expect(screen.getAllByRole('group', { name: /^What the charts show, / }).map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'What the charts show, South Branch Raritan near High Bridge', 'What the charts show, Rockaway River at Boonton', 'What the charts show, Rockaway River at Dover',
    ]);
    userEvent.click(within(card('Rockaway River at Dover')).getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(within(card(HIGH_BRIDGE)).getByRole('slider')).toHaveAttribute('aria-valuemax', '30'));
    for (const name of [HIGH_BRIDGE, 'Rockaway River at Boonton', 'Rockaway River at Dover']) expect(within(card(name)).getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('water temperature charts the gauges that measure it, in °F, from the same three days, and says which don\'t', async () => {
    await open();
    await screen.findByText(MIXED);
    for (const name of ['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']) userEvent.click(river(name));
    await waitFor(() => expect(screen.getAllByRole('slider')).toHaveLength(5));
    await settled();
    userEvent.click(within(card(HIGH_BRIDGE)).getByRole('button', { name: 'Water temp' }));
    const manville = await screen.findByRole('slider', { name: 'Raritan River at Manville, water temperature: readings along the chart' });
    // No long-run record of this gauge's temperature: this period is the only line, and the only column.
    expect(manville).toHaveAttribute('aria-valuetext', 'Nov 26, 10:10 AM: this period 44.6 °F');
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.getAllByText('This gauge doesn\'t measure water temperature.')).toHaveLength(4);
    // The water's record came with the flows when the page opened: only its normals are asked for.
    expect(asked()).toEqual({ record: 1, daily: 0, measured: 0, normals: 2 });
    expect(usgs.fetchNormals).toHaveBeenLastCalledWith(NJ, TEMP, NEAR[0], NEAR[1], expect.anything());
    // A log axis says nothing useful about a temperature.
    const itsCard = within(card('Raritan River at Manville'));
    expect(itsCard.getByRole('button', { name: 'Log' })).toBeDisabled();
    expect(itsCard.getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true');
    // The card still says what the river is running, and the top of the page says what it did before.
    expect(fact('Raritan River at Manville', 'Flow now')).toEqual(['200 cfs', '43% of normal']);
    expect(itsCard.getByText('Low and steady')).toBeInTheDocument();
    expect(screen.getByText(MIXED)).toBeInTheDocument();
    expect(text(water())).toMatch(/^Water is 44\.6 °F at the one gauge that measures it\./);
    expect(kept().metric).toBe('temp');
    // In November the chart runs from 42 to 45: there is no 68 on it to rule a line at.
    expect(document.querySelector('.gauge-mark')).toBeNull();
    // A month of it is the daily means of the water, asked for by its own name.
    userEvent.click(itsCard.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, TEMP, MONTH.startDay, MONTH.endDay, expect.anything()));
  });

  test('where the water is near too warm for trout, the chart rules a line at 68', async () => {
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ version: 2, state: 'NJ', metric: 'temp', period: '3d', scale: 'log', open: ['NJ|raritan'] }));
    answers({ warmth: { '01400500': [[72, 66], [40, 70.4], [28, 64], [16, 69.5], [0, 64.2]] } });
    await open();
    await screen.findByRole('slider', { name: /^Raritan River at Manville, water temperature/ });
    expect(document.querySelectorAll('.gauge-mark')).toHaveLength(1);
    expect(document.querySelector('.gauge-mark-label').textContent).toBe('68 °F: too warm for trout');
    // And the card says what yesterday afternoon means for today.
    expect(fact('Raritan River at Manville', 'Water')).toEqual(['64.2 °F', 'Right for trout · 64.2 to 69.5 in a day']);
    expect(notes('Raritan River at Manville').pop()).toBe('Water is at the warm end of what trout like (64.2 °F): early and late in the day are best. It reached 69.5 °F in the last day: mornings only.');
  });

  test('a custom stretch wants its two dates first, then charts just those days', async () => {
    await withOneOpen();
    const before = asked();
    userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText('Pick a start and an end date.')).toBeInTheDocument();
    // Nothing is asked, and the chart that was there waits, dimmed.
    expect(card(HIGH_BRIDGE)).toHaveClass('is-stale');
    userEvent.type(screen.getByLabelText('From'), '2026-03-01');
    userEvent.type(screen.getByLabelText('To'), '2026-02-01');
    expect(screen.getByText('The start date is after the end date.')).toBeInTheDocument();
    expect(asked()).toEqual(before);
    userEvent.clear(screen.getByLabelText('To'));
    userEvent.type(screen.getByLabelText('To'), '2026-04-30');
    await waitFor(() => expect(card(HIGH_BRIDGE)).not.toHaveClass('is-stale'));
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, '2026-03-01', '2026-04-30', expect.anything());
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, '2025-03-01', '2025-04-30', expect.anything());
    // Its normals are for those dates, a day either side, and not stretched on to today.
    expect(usgs.fetchNormals).toHaveBeenLastCalledWith(NJ, FLOW, '2026-02-28', '2026-05-01', expect.anything());
    // A stretch that ended months ago is not carried on to today's reading.
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/^Apr 29: this period/);
    // And it is one look, not a habit: the next visit starts from three days.
    expect(kept().period).toBe('custom');
  });

  test('a river opened while a custom stretch still wants its dates says so, and asks for nothing', async () => {
    await withOneOpen();
    userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    const before = asked();
    userEvent.click(river('Paulins Kill'));
    expect(screen.getAllByText('Pick a start and an end date.')).toHaveLength(2);
    expect(asked()).toEqual(before);
    // The card that was already charted keeps its chart, dimmed; the new one has the read and no chart yet.
    expect(within(card('Paulins Kill at Blairstown')).getByText('Steady')).toBeInTheDocument();
  });

  test('Refresh reads everything again as of now, past the browser\'s own copy for what can have changed', async () => {
    await withOneOpen();
    userEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '30'));
    await settled();
    time = NOW + 45 * MINUTE;
    answers({ flows: { ...FLOWS, '01396500': [[72, 43], [30, 43], [20, 647], [6, 200], [0, 180]] }, warmth: { '01400500': [[72, 43.9], [0, 43.9]] } });
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(fact(HIGH_BRIDGE, 'Flow now')).toEqual(['180 cfs', '2.1× normal']));
    expect(within(card(HIGH_BRIDGE)).getByText(/read 20 min ago/)).toBeInTheDocument();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '▲High · dropping', '2.1× normal', '180 cfs', '']]);
    expect(usgs.fetchMeasured).toHaveBeenLastCalledWith(NJ, BOTH, time - 72 * HOUR, time, expect.objectContaining({ fresh: true }));
    // The top of the page is from the same new reading as the cards.
    expect(text(water())).toMatch(/^Water is 43\.9 °F at the one gauge that measures it\./);
    // This period's record is read again, past the browser's copy...
    expect(usgs.fetchDaily).toHaveBeenCalledTimes(3);
    expect(usgs.fetchDaily.mock.calls[2].slice(2)).toEqual([MONTH.startDay, MONTH.endDay, expect.objectContaining({ fresh: true })]);
    // ...and last year's and the long-run normals, which are what they were a minute ago, are not asked for at all.
    expect(usgs.fetchDaily.mock.calls.filter(([, , startDay]) => startDay === real.yearBefore(MONTH.startDay))).toHaveLength(1);
    expect(usgs.fetchNormals).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Read at 11:15 AM')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('read at 11:15 AM');
  });

  test('a Refresh by hand dims the charts until the new ones are in', async () => {
    await withOneOpen();
    let answer;
    usgs.fetchMeasured.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(card(HIGH_BRIDGE)).toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toBeInTheDocument();
    // The board keeps saying what it said until the new readings are in.
    expect(linesOf('South Branch Raritan')[0][3]).toBe('229 cfs');
    await act(async () => { answer(records(NJ, NOW)); });
    await waitFor(() => expect(card(HIGH_BRIDGE)).not.toHaveClass('is-stale'));
  });
});

describe('new readings by themselves', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); delete document.visibilityState; });

  test('once what is on screen is fifteen minutes old the gauges are read again, without a flicker', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('U.S. Geological Survey · read at 10:30 AM · new readings after 15 minutes');
    const before = asked();
    time = NOW + 14 * MINUTE;
    act(() => { jest.advanceTimersByTime(13 * MINUTE); });
    expect(asked()).toEqual(before);

    let answer;
    usgs.fetchMeasured.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    time = NOW + 15 * MINUTE + 2000;
    act(() => { jest.advanceTimersByTime(3 * MINUTE); });
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(2);
    // Not a Refresh by hand: nothing is asked for past the browser's own copy.
    expect(usgs.fetchMeasured).toHaveBeenLastCalledWith(NJ, BOTH, time - 72 * HOUR, time, expect.objectContaining({ fresh: false }));
    // The chart that is up stays up, undimmed, while the new readings are on their way, and so
    // does what the board and the top of the page say.
    expect(card(HIGH_BRIDGE)).not.toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toBeInTheDocument();
    expect(text(water())).toMatch(/^Water is 44\.6 °F at the one gauge that measures it\./);
    expect(linesOf('South Branch Raritan')[0][3]).toBe('229 cfs');
    await act(async () => { answer(records(NJ, time, { flows: { ...FLOWS, '01396500': [[72, 43], [30, 43], [20, 647], [6, 230], [0, 215]] }, warmth: { '01400500': [[72, 45.1], [0, 45.1]], '01443500': [[72, 42.3], [0, 42.3]] } })); });
    await waitFor(() => expect(fact(HIGH_BRIDGE, 'Flow now')).toEqual(['215 cfs', '2.5× normal']));
    // The average is of the new readings too: a second thermometer has come on since.
    expect(text(water())).toMatch(/^Water is averaging 43\.7 °F across the 2 gauges that measure it, from 42\.3 °F to 45\.1 °F\./);
    expect(linesOf('Rockaway River')[0]).toEqual(['at Boonton', '▲▲Very high · rising fast', '5.1× normal', '872 cfs', '']);
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('read at 10:45 AM');
    // Only what can have changed was asked for: the one reading of the gauges.
    expect(asked()).toEqual({ ...before, record: before.record + 1 });
  });

  test('a page nobody is looking at waits, and catches up when it is looked at again', async () => {
    let showing = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => showing });
    await open();
    await screen.findByText(MIXED);
    await settled();
    showing = 'hidden';
    time = NOW + 40 * MINUTE;
    act(() => { jest.advanceTimersByTime(40 * MINUTE); });
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(1);
    // Looked at again before the fifteen minutes were up: nothing either.
    showing = 'visible';
    time = NOW + 5 * MINUTE;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(1);
    time = NOW + 40 * MINUTE;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Read at 11:10 AM')).toBeInTheDocument();
  });

  test('leaving the page stops it asking', async () => {
    const { unmount } = await open();
    await screen.findByText(MIXED);
    await settled();
    unmount();
    time = NOW + 60 * MINUTE;
    act(() => { jest.advanceTimersByTime(60 * MINUTE); });
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(1);
  });
});

describe('sources', () => {
  test('the page says where its numbers and its words come from, in a row that opens', async () => {
    await open();
    await screen.findByText(MIXED);
    const row = screen.getByRole('button', { name: /^Sources/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveTextContent('U.S. Geological Survey · read at 10:30 AM · new readings after 15 minutes');
    userEvent.click(row);
    const sources = within(screen.getByRole('region', { name: 'Sources' }));
    expect(sources.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['From USGS', 'Worked out on this page']);
    const [fromUsgs, workedOut] = sources.getAllByRole('list');
    expect(within(fromUsgs).getAllByRole('listitem').map((item) => item.querySelector('strong').textContent)).toEqual([
      'USGS readings, last 3 days', 'Historic daily percentiles', 'Daily means, this period and last year', '15-minute readings, this week and the same week last year',
    ]);
    expect(within(workedOut).getAllByRole('listitem').map((item) => item.querySelector('strong').textContent)).toEqual([
      'Very low to very high', 'Times normal', 'Rising, dropping or steady', 'Water temperature for trout', 'Average water temperature', 'How to fish it',
    ]);
    // Every rule the page applies is written down beside its name.
    expect(within(workedOut).getByText(/under the 10th percentile, 10th to 25th, 25th to 75th \(normal\), 75th to 90th, and over the 90th/)).toBeInTheDocument();
    expect(within(workedOut).getByText(/changed by a tenth or more since this time yesterday and still going that way, or by 8% in the last six hours/)).toBeInTheDocument();
    expect(within(workedOut).getByText(/Under 40 °F cold, 40 to 50 cool, 50 to 65 right, 65 to 68 warm, 68 and over too warm/)).toBeInTheDocument();
    // Each source names the service or the agency it is, and links to that page.
    const links = sources.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['USGS: Continuous values', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous?f=html'],
      ['USGS: Statistics', 'https://api.waterdata.usgs.gov/statistics/v0/docs'],
      ['USGS: Daily values', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily?f=html'],
      ['USGS: Continuous values', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous?f=html'],
      ['USGS: how streamflow is classed', 'https://pubs.usgs.gov/publication/fs20233030/full'],
      ['Maryland DNR: trout and water temperature', 'https://dnr.maryland.gov/fisheries/Pages/trout/advisory.aspx'],
    ]);
    for (const link of links) { expect(link).toHaveAttribute('target', '_blank'); expect(link).toHaveAttribute('rel', 'noopener noreferrer'); }
    expect(sources.getByText(/Load new data: after 15 minutes\./)).toBeInTheDocument();
    userEvent.click(row);
    expect(screen.queryByText('Worked out on this page')).toBeNull();
  });

  test('before anything has been read it doesn\'t claim a time', async () => {
    usgs.fetchMeasured.mockRejectedValue(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0));
    await open();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('U.S. Geological Survey · not read yet · new readings after 15 minutes');
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
  });
});

describe('from one state to another', () => {
  test('going to another state and back after a reading keeps nothing stale on screen', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
    userEvent.click(count('High'));
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await settled();
    // Pennsylvania has not been asked about since the gauges were read again, and what was
    // picked out of New Jersey's rivers doesn't follow the page there.
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '…', '', '', '']]);
    expect(await screen.findByText('Near normal for late November and holding steady.')).toBeInTheDocument();
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '●Normal · steady', 'right at normal', '310 cfs', '']]);
    expect(count('Normal')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('when USGS can\'t be had', () => {
  const NO_ANSWER = new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0);

  test('no readings: it says so, once at the top and on each line, and Refresh tries again', async () => {
    usgs.fetchMeasured.mockRejectedValue(NO_ANSWER);
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS. Check your connection and try again.');
    expect(screen.getByText('USGS isn\'t answering right now.')).toBeInTheDocument();
    expect(water()).toBeNull();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', 'No answer from USGS', '', '', '']]);
    expect(tallyOf()[0]).toBe('– Very low');
    answers();
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(MIXED)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '▲High · dropping', '2.7× normal', '229 cfs', '']]);
    expect(text(water())).toMatch(/^Water is 44\.6 °F at the one gauge that measures it\./);
  });

  test('readings but no normals: the flows and which way they are going are shown, and nothing is called normal or not', async () => {
    usgs.fetchNormals.mockRejectedValue(new real.GaugeDataError('USGS answered with an error (503). Try again in a little while.', 503));
    await open();
    expect(await screen.findByText('5 of 5 gauges reporting. Today\'s normals couldn\'t be had to hold them against.')).toBeInTheDocument();
    // The water's temperature needs no normal to be said.
    expect(text(water())).toMatch(/^Water is 44\.6 °F at the one gauge that measures it\./);
    expect(screen.getByRole('alert')).toHaveTextContent('USGS answered with an error (503)');
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', 'Couldn\'t get today\'s normal · dropping', '', '229 cfs', '']]);
    expect(tallyOf()).toEqual(['0 Very low', '0 Low', '0 Normal', '0 High', '0 Very high']);
    // The card says what can still be said: the direction, and what to do about it.
    userEvent.click(river('Rockaway River'));
    expect(await within(card('Rockaway River at Boonton')).findByText('Rising fast')).toBeInTheDocument();
    expect(notes('Rockaway River at Boonton')).toEqual([expect.stringMatching(/^Rising fast\./)]);
  });

  test('no record for a longer chart: the card says it couldn\'t be read instead of that there is nothing', async () => {
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ version: 2, state: 'NJ', metric: 'flow', period: '30d', scale: 'log', open: ['NJ|south branch raritan'] }));
    usgs.fetchDaily.mockRejectedValue(new real.GaugeDataError('USGS is limiting how often this connection can ask. Give it a few minutes and try again.', 429));
    await open();
    expect(await screen.findByText('Couldn\'t read this gauge. Try Refresh in a minute.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('USGS is limiting how often this connection can ask.');
    expect(screen.queryByRole('slider')).toBeNull();
    // The board, and the card's own read, never needed the chart's record.
    await screen.findByText(MIXED);
    expect(linesOf('Rockaway River')).toHaveLength(2);
    expect(within(card(HIGH_BRIDGE)).getByText('High and dropping')).toBeInTheDocument();
  });

  test('a new view that can\'t be read leaves the old chart up, dimmed, rather than an empty one', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    usgs.fetchContinuous.mockRejectedValue(NO_ANSWER);
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS.');
    expect(card(HIGH_BRIDGE)).toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '286');
  });

  test('a request that fails while a second look is waiting on it fails for both, and is never read as a gauge with nothing to say', async () => {
    let fail;
    usgs.fetchMeasured.mockImplementation(() => new Promise((resolve, reject) => { fail = reject; }));
    await open();
    await screen.findByRole('button', { name: 'Reading...' });
    // Opening a river makes the page ask again while the first request is still out.
    userEvent.click(river('South Branch Raritan'));
    expect(within(card(HIGH_BRIDGE)).getByText('Reading the gauge...', { selector: '.gauge-read-title' })).toBeInTheDocument();
    await act(async () => { fail(NO_ANSWER); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS.');
    expect(linesOf('Rockaway River')[0]).toEqual(['at Boonton', 'No answer from USGS', '', '', '']);
    expect(within(card(HIGH_BRIDGE)).getByText('No answer from USGS', { selector: '.gauge-read-title' })).toBeInTheDocument();
    expect(screen.queryByText('Not reporting')).toBeNull();
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(1);
    // And it is asked for again the next time the page has a question, not remembered as answered.
    answers();
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByText(MIXED)).toBeInTheDocument();
    expect(usgs.fetchMeasured).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  const lastYearLost = (who) => async (sites, metric, startDay, endDay) => {
    if (who(sites) && startDay.startsWith('2025')) throw new real.GaugeDataError('USGS answered with an error (500). Try again in a little while.', 500);
    return new Map(sites.map((site) => [site, real.daysBetween(startDay, endDay).slice(0, -1).map((day) => ({ t: real.dayToMs(day), v: flowNow(FLOWS, site), day }))]));
  };

  test('one state\'s record failing to load doesn\'t take another\'s lines away', async () => {
    usgs.fetchDaily.mockImplementation(lastYearLost((sites) => sites.includes('01449000')));
    const { container } = await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    userEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1));
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    userEvent.click(await screen.findByRole('button', { name: /^Lehigh River/ }));
    await screen.findByRole('slider', { name: /^Lehigh River at Lehighton, flow/ });
    expect(screen.getByRole('alert')).toHaveTextContent('USGS answered with an error (500)');
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(0);
    // New Jersey's last year was read before any of that, and is still there.
    userEvent.selectOptions(screen.getByLabelText('State'), 'NJ');
    await screen.findByRole('slider', { name: /^South Branch Raritan near High Bridge, flow/ });
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1);
  });

  test('last year or the normals missing costs a line, not the chart', async () => {
    usgs.fetchDaily.mockImplementation(lastYearLost(() => true));
    const { container } = await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    userEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '30'));
    expect(screen.getByRole('alert')).toHaveTextContent('USGS answered with an error (500)');
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(0);
    expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
    // With nothing of last year's to draw, there is no column for it under the chart.
    expect(text(container.querySelector('.gauge-readout'))).not.toMatch(/Last year/);
  });
});

describe('the club\'s list', () => {
  test('a member can remove the gauge they added, after being asked, and nobody else\'s', async () => {
    const { auth } = await open();
    await screen.findByText(MIXED);
    userEvent.click(river('South Branch Raritan'));
    userEvent.click(river('Paulins Kill'));
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    expect(within(card(HIGH_BRIDGE)).queryByRole('button', { name: 'Remove' })).toBeNull();
    const mine = within(card('Paulins Kill at Blairstown'));
    expect(mine.getByText('Added by Andre')).toBeInTheDocument();
    userEvent.click(mine.getByRole('button', { name: 'Remove' }));
    expect(mine.getByText(/Remove it for the whole club\?/)).toBeInTheDocument();
    userEvent.click(mine.getByRole('button', { name: 'Keep it' }));
    expect(auth.removeRiverGauge).not.toHaveBeenCalled();
    userEvent.click(mine.getByRole('button', { name: 'Remove' }));
    userEvent.click(mine.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Paulins Kill/ })).toBeNull());
    expect(auth.removeRiverGauge).toHaveBeenCalledWith('g5');
    // The gauge USGS couldn't rate is gone, and so is the note about it.
    expect(await screen.findByText('Tap a count to see just those.')).toBeInTheDocument();
    expect(rivers()).toEqual(['South Branch Raritan', 'Rockaway River', 'Raritan River']);
  });

  test('the admin can remove any gauge, the club\'s own included', async () => {
    await open({ isAdmin: true });
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    expect(within(card(HIGH_BRIDGE)).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  test('a removal the database refuses leaves the gauge where it was and says why', async () => {
    await open({ removeRiverGauge: jest.fn().mockResolvedValue({ error: new Error('Only whoever added a gauge, or the admin, can remove it.') }) });
    userEvent.click(await screen.findByRole('button', { name: /^Paulins Kill/ }));
    await screen.findByRole('slider');
    userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only whoever added a gauge, or the admin, can remove it.');
    expect(card('Paulins Kill at Blairstown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  test('adding: a search by river, what is already listed marked, and the new gauge filed under the club\'s own name for its river', async () => {
    answers({ flows: { ...FLOWS, '01381000': [[72, 28.6], [0, 28.6]] }, lines: { ...LINES, '01381000': [10, 20, 40, 60, 90] } });
    usgs.searchGauges.mockResolvedValue([
      { siteNo: '01380450', name: 'Rockaway River at Main Street at Boonton NJ', river: 'Rockaway River', place: 'at Main Street at Boonton', state: 'NJ', flow: 88.9 },
      { siteNo: '01381000', name: 'ROCKAWAY RIVER BELOW RESERVOIR AT BOONTON NJ', river: 'Rockaway river', place: 'below Reservoir at Boonton', state: 'NJ', flow: 28.6 },
    ]);
    const added = gauge('g7', '01381000', 'Rockaway River', 'below the reservoir', 1000, { added_by: 'me', added_by_name: 'Andre' });
    const { auth } = await open({ addRiverGauge: jest.fn().mockResolvedValue({ error: null, gauge: added }) });
    // One river is already open, and the board is showing only the rivers running high.
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
    userEvent.click(count('High'));
    userEvent.click(screen.getByRole('button', { name: /add a gauge/i }));
    const form = within(screen.getByRole('region', { name: 'Add a gauge' }));
    expect(form.getByLabelText('State')).toHaveValue('NJ');
    expect(form.getByRole('button', { name: /search/i })).toBeDisabled();
    userEvent.type(form.getByLabelText('River or station number'), 'rockaway');
    userEvent.click(form.getByRole('button', { name: /search/i }));
    const found = within(await form.findByRole('list', { name: 'Gauges found' })).getAllByRole('listitem');
    expect(usgs.searchGauges).toHaveBeenCalledWith({ state: 'NJ', term: 'rockaway' });
    expect(within(found[0]).getByText('On the list')).toBeInTheDocument();
    expect(within(found[0]).queryByRole('button')).toBeNull();
    expect(found[1]).toHaveTextContent('below Reservoir at Boonton · USGS 01381000 · 28.6 cfs now');
    userEvent.click(within(found[1]).getByRole('button', { name: 'Add' }));
    // "Rockaway river" as USGS had it becomes the club's "Rockaway River", so it joins that row.
    expect(form.getByLabelText('River')).toHaveValue('Rockaway River');
    expect(form.getByLabelText('River')).toHaveAttribute('maxLength', '80');
    expect(form.getByLabelText('Where on it')).toHaveAttribute('maxLength', '120');
    userEvent.clear(form.getByLabelText('Where on it'));
    userEvent.type(form.getByLabelText('Where on it'), 'below the reservoir');
    userEvent.click(form.getByRole('button', { name: /add to the club's list/i }));
    await waitFor(() => expect(auth.addRiverGauge).toHaveBeenCalledWith({ siteNo: '01381000', river: 'Rockaway River', place: 'below the reservoir', state: 'NJ' }));
    // Its river opens to show it — whatever the board was showing only — and USGS is asked about it alone.
    expect(await screen.findByRole('slider', { name: /^Rockaway River below the reservoir, flow/ })).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
    expect(linesOf('Rockaway River')).toHaveLength(3);
    expect(linesOf('Rockaway River')[2]).toEqual(['below the reservoir', '●Normal · steady', '72% of normal', '28.6 cfs', '']);
    expect(rivers()).toHaveLength(4);
    expect(usgs.fetchMeasured).toHaveBeenLastCalledWith(['01381000'], BOTH, expect.any(Number), expect.any(Number), expect.anything());
    expect(usgs.fetchNormals).toHaveBeenLastCalledWith(['01381000'], FLOW, expect.any(String), expect.any(String), expect.anything());
    expect(usgs.fetchDaily).not.toHaveBeenCalled();
    await waitFor(() => expect(tallyOf()).toEqual(['0 Very low', '1 Low', '2 Normal', '1 High', '1 Very high']));
    expect(kept().open).toEqual(['NJ|south branch raritan', 'NJ|rockaway']);
    expect(form.getByLabelText('River or station number')).toHaveValue('');
  });

  test('a gauge in another state takes the page there', async () => {
    usgs.searchGauges.mockResolvedValue([{ siteNo: '01420500', name: 'BEAVER KILL AT COOKS FALLS NY', river: 'Beaver Kill', place: 'at Cooks Falls', state: 'NY', flow: 402 }]);
    const added = gauge('g8', '01420500', 'Beaver Kill', 'at Cooks Falls', 1000, { state: 'NY', added_by: 'me', added_by_name: 'Andre' });
    const { auth } = await open({ addRiverGauge: jest.fn().mockResolvedValue({ error: null, gauge: added }) });
    await screen.findByText(MIXED);
    userEvent.click(screen.getByRole('button', { name: /add a gauge/i }));
    const form = within(screen.getByRole('region', { name: 'Add a gauge' }));
    userEvent.type(form.getByLabelText('River or station number'), '01420500');
    userEvent.click(form.getByRole('button', { name: /search/i }));
    userEvent.click(await form.findByRole('button', { name: 'Add' }));
    userEvent.click(form.getByRole('button', { name: /add to the club's list/i }));
    await waitFor(() => expect(auth.addRiverGauge).toHaveBeenCalledWith({ siteNo: '01420500', river: 'Beaver Kill', place: 'at Cooks Falls', state: 'NY' }));
    await waitFor(() => expect(screen.getByLabelText('State', { selector: '.gauge-state select' })).toHaveValue('NY'));
    expect(river('Beaver Kill')).toHaveAttribute('aria-expanded', 'true');
    expect(kept()).toMatchObject({ state: 'NY', open: ['NY|beaver kill'] });
  });

  test('a search that finds nothing, or fails, and an add the database refuses, each say so', async () => {
    const { auth } = await open({ addRiverGauge: jest.fn().mockResolvedValue({ error: new Error('That gauge is already on the club\'s list.') }) });
    await screen.findByText(MIXED);
    userEvent.click(screen.getByRole('button', { name: /add a gauge/i }));
    const form = within(screen.getByRole('region', { name: 'Add a gauge' }));
    userEvent.type(form.getByLabelText('River or station number'), 'styx');
    userEvent.click(form.getByRole('button', { name: /search/i }));
    expect(await form.findByText(/No gauge by that name is measuring flow in New Jersey right now/)).toBeInTheDocument();
    usgs.searchGauges.mockRejectedValue(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0));
    userEvent.click(form.getByRole('button', { name: /search/i }));
    expect(await form.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS.');
    usgs.searchGauges.mockResolvedValue([{ siteNo: '01445500', name: 'Pequest River at Pequest NJ', river: 'Pequest River', place: 'at Pequest', state: 'NJ', flow: 61.8 }]);
    userEvent.click(form.getByRole('button', { name: /search/i }));
    userEvent.click(await form.findByRole('button', { name: 'Add' }));
    userEvent.click(form.getByRole('button', { name: /add to the club's list/i }));
    expect(await form.findByRole('alert')).toHaveTextContent('That gauge is already on the club\'s list.');
    expect(auth.addRiverGauge).toHaveBeenCalledTimes(1);
    // The draft is still there to put right or drop.
    expect(form.getByLabelText('River')).toHaveValue('Pequest River');
    userEvent.click(form.getByRole('button', { name: 'Never mind' }));
    expect(form.queryByLabelText('River')).toBeNull();
    userEvent.click(form.getByRole('button', { name: 'Close add a gauge' }));
    expect(screen.queryByRole('region', { name: 'Add a gauge' })).toBeNull();
  });
});
