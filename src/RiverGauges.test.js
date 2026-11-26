import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RiverGauges from './RiverGauges';
import { useAuth } from './context/AuthContext';
import * as usgs from './utils/riverGauges';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
// The page's arithmetic is the real thing; only the four questions it puts to USGS, and the
// search, are answered here. (CRA resets mocks between tests, so each test gets its answers
// from beforeEach.)
jest.mock('./utils/riverGauges', () => ({
  ...jest.requireActual('./utils/riverGauges'),
  fetchLatest: jest.fn(), fetchDaily: jest.fn(), fetchContinuous: jest.fn(), fetchNormals: jest.fn(), searchGauges: jest.fn(),
}));

const real = jest.requireActual('./utils/riverGauges');
const FLOW = real.METRICS.flow;
const TEMP = real.METRICS.temp;
// Half past ten in the morning wherever the tests run, so "today" is the 26th in any zone.
const NOW = new Date(2026, 10, 26, 10, 30).getTime();
const DAY = 24 * 60 * 60 * 1000;
const MONTH = real.periodRange('30d', NOW);

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

// What each gauge is running, and the median for the day; the usual range is taken as 70% to
// 140% of that. So: three New Jersey gauges below it, one inside it, one above.
const RUNNING = { '01396500': 39.4, '01380450': 88.9, '01379845': 44.9, '01400500': 213, '01443500': 300, '01449000': 310 };
const MEDIAN = { '01396500': 85, '01380450': 178, '01379845': 51.9, '01400500': 416, '01443500': 136, '01449000': 300 };
const WARMTH = { '01400500': 44.6 };

function answers({ running = RUNNING, median = MEDIAN } = {}) {
  usgs.fetchLatest.mockImplementation(async (sites, metric) => {
    const values = metric.key === 'flow' ? running : WARMTH;
    return new Map(sites.filter((site) => values[site] !== undefined).map((site) => [site, { t: NOW - 20 * 60 * 1000, v: values[site] }]));
  });
  usgs.fetchNormals.mockImplementation(async (sites, metric, startDay, endDay) => new Map(sites.filter((site) => metric.key === 'flow' && median[site] !== undefined)
    .map((site) => [site, Object.fromEntries(real.daysBetween(startDay, endDay).map((day) => [real.dayOfYear(day), [median[site] * 0.7, median[site], median[site] * 1.4]]))])));
  usgs.fetchDaily.mockImplementation(async (sites, metric, startDay, endDay) => {
    const values = metric.key === 'flow' ? running : WARMTH;
    // Daily means stop at yesterday.
    return new Map(sites.filter((site) => values[site] !== undefined).map((site) => [site, real.daysBetween(startDay, endDay).slice(0, -1).map((day, index) => ({ t: real.dayToMs(day), v: values[site] + index, day }))]));
  });
  usgs.fetchContinuous.mockImplementation(async (sites, metric, startMs, endMs) => new Map(sites.filter((site) => running[site] !== undefined)
    .map((site) => [site, Array.from({ length: 48 }, (_, index) => ({ t: endMs - (48 - index) * 60 * 60 * 1000, v: running[site] + index / 10 }))])));
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

const river = (name) => screen.getByRole('button', { name: new RegExp(`^${name}\\b`) });
const linesOf = (name) => [...river(name).querySelectorAll('.river-line')].map((row) => [...row.children].map((cell) => cell.textContent));
const card = (name) => screen.getByRole('article', { name });
const kept = () => JSON.parse(window.localStorage.getItem('fishyfriends:gauges-view'));
const asked = () => ({ latest: usgs.fetchLatest.mock.calls.length, daily: usgs.fetchDaily.mock.calls.length, measured: usgs.fetchContinuous.mock.calls.length, normals: usgs.fetchNormals.mock.calls.length });
const settled = () => waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());

beforeEach(() => {
  window.localStorage.clear();
  time = NOW;
  answers();
});

describe('the list of rivers', () => {
  test('says how many gauges are running below, near and above normal for today', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'River gauges', level: 1 })).toBeInTheDocument();
    expect(await screen.findByText('Of 5 gauges reporting, 3 are running below normal flow for today, 1 near normal and 1 above.')).toBeInTheDocument();
    // What "normal" means is said on the page, not left to be guessed.
    expect(screen.getByText(/Normal is the median flow for today's date over every year a gauge has on record/)).toBeInTheDocument();
  });

  test('is a drop-down a river, in the club\'s order, gauges on the same river together', async () => {
    const { container } = await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    expect([...container.querySelectorAll('.river-list h2 .river-name')].map((name) => name.textContent)).toEqual(['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']);
    for (const name of ['South Branch Raritan', 'Rockaway River', 'Raritan River', 'Paulins Kill']) expect(river(name)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('article')).toBeNull();
  });

  test('a closed river says, for each of its gauges, what it is running and how many cfs that is off normal', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '39.4 cfs', '▼46 cfs below normal']]);
    expect(linesOf('Rockaway River')).toEqual([['at Boonton', '88.9 cfs', '▼89 cfs below normal'], ['at Dover', '44.9 cfs', '●Near normal · 7 cfs under']]);
    expect(linesOf('Raritan River')).toEqual([['at Manville', '213 cfs', '▼203 cfs below normal']]);
    expect(linesOf('Paulins Kill')).toEqual([['at Blairstown', '300 cfs', '▲164 cfs above normal']]);
    // The shape is decoration for the words beside it, not something to be read out.
    expect(river('Paulins Kill')).toHaveAccessibleName('Paulins Kill at Blairstown 300 cfs 164 cfs above normal');
  });

  test('that much takes two questions to USGS, about every gauge at once, and none for a chart', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(1);
    expect(usgs.fetchLatest).toHaveBeenCalledWith(NJ, FLOW, expect.objectContaining({ fresh: false, now: NOW }));
    expect(usgs.fetchNormals).toHaveBeenCalledTimes(1);
    expect(usgs.fetchNormals).toHaveBeenCalledWith(NJ, FLOW, '2026-11-26', '2026-11-26', expect.objectContaining({ now: NOW, storage: window.localStorage }));
    expect(asked()).toMatchObject({ daily: 0, measured: 0 });
  });

  test('a gauge that isn\'t reporting, and one with no long-run record, say so instead of a number', async () => {
    answers({ running: { ...RUNNING, '01400500': undefined }, median: { ...MEDIAN, '01443500': undefined } });
    await open();
    expect(await screen.findByText('Of 4 gauges reporting, 2 are running below normal flow for today, 1 near normal and 0 above. 1 has too short a record to say.')).toBeInTheDocument();
    expect(linesOf('Raritan River')).toEqual([['at Manville', '—', 'Not reporting']]);
    expect(linesOf('Paulins Kill')).toEqual([['at Blairstown', '300 cfs', 'No long-run normal']]);
  });

  test('while USGS is being asked the lines wait rather than guess', async () => {
    let answer;
    usgs.fetchLatest.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    await open();
    expect(screen.getByText('Reading the gauges...')).toBeInTheDocument();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '…', '']]);
    expect(await screen.findByRole('button', { name: 'Reading...' })).toBeDisabled();
    await act(async () => { answer(new Map([['01396500', { t: NOW, v: 39.4 }]])); });
    await screen.findByText(/^Of 1 gauge reporting/);
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '39.4 cfs', '▼46 cfs below normal']]);
  });

  test('with no gauges on the list it says so and offers to add the first', async () => {
    await open({ listRiverGauges: jest.fn().mockResolvedValue([]) });
    expect(screen.getByText('No gauges on the club\'s list yet. Add the first one below.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'How far back' })).toBeNull();
    expect(usgs.fetchLatest).not.toHaveBeenCalled();
  });

  test('another state\'s rivers are a choice away, and only they are asked about', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    expect(within(screen.getByLabelText('State')).getAllByRole('option').map((option) => option.textContent)).toEqual(['New Jersey', 'Pennsylvania']);
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    expect(await screen.findByText('Of 1 gauge reporting, 0 are running below normal flow for today, 1 near normal and 0 above.')).toBeInTheDocument();
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '310 cfs', '●Near normal · 10 cfs over']]);
    expect(usgs.fetchLatest).toHaveBeenLastCalledWith(['01449000'], FLOW, expect.anything());
    expect(kept().state).toBe('PA');
    // Going back asks nothing: New Jersey was read a moment ago.
    userEvent.selectOptions(screen.getByLabelText('State'), 'NJ');
    await screen.findByText(/^Of 5 gauges reporting/);
    expect(asked()).toMatchObject({ latest: 2, normals: 2 });
  });
});

describe('an open river', () => {
  test('opening one reads the charts for every gauge in the state: this period, last year and the normals', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    userEvent.click(river('South Branch Raritan'));
    expect(river('South Branch Raritan')).toHaveAttribute('aria-expanded', 'true');
    expect(within(river('South Branch Raritan')).getByText('1 gauge')).toBeInTheDocument();
    // Until the answers are in the card holds the chart's place.
    expect(within(card('South Branch Raritan near High Bridge')).getByRole('status')).toHaveTextContent('Reading the gauge...');
    await screen.findByRole('slider', { name: 'South Branch Raritan near High Bridge, flow: readings along the chart' });
    expect(usgs.fetchDaily.mock.calls.map(([sites, metric, start, end]) => [sites, metric.key, start, end])).toEqual([
      [NJ, 'flow', MONTH.startDay, MONTH.endDay], [NJ, 'flow', real.yearBefore(MONTH.startDay), real.yearBefore(MONTH.endDay)],
    ]);
    expect(usgs.fetchNormals).toHaveBeenCalledWith(NJ, FLOW, MONTH.startDay, MONTH.endDay, expect.objectContaining({ storage: window.localStorage }));
    expect(asked()).toMatchObject({ latest: 1, measured: 0 });
  });

  test('a gauge\'s card names the spot, links to the station, and says what it is running and how that stands', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^Rockaway River/ }));
    await screen.findByRole('slider', { name: /^Rockaway River at Boonton, flow/ });
    expect(within(river('Rockaway River')).getByText('2 gauges')).toBeInTheDocument();
    const boonton = within(card('Rockaway River at Boonton'));
    expect(boonton.getByRole('heading', { level: 3, name: 'at Boonton' })).toBeInTheDocument();
    expect(boonton.getByRole('link', { name: 'USGS 01380450' })).toHaveAttribute('href', 'https://waterdata.usgs.gov/monitoring-location/USGS-01380450/');
    expect(boonton.getByRole('link', { name: 'USGS 01380450' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(boonton.getByText('88.9')).toBeInTheDocument();
    expect(boonton.getByText('20 min ago')).toBeInTheDocument();
    expect(boonton.getByText('89 cfs below normal')).toBeInTheDocument();
    expect(within(card('Rockaway River at Dover')).getByText('Near normal · 7 cfs under')).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
  });

  test('the chart carries this period on to the newest reading and reads all three lines there', async () => {
    const { container } = await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    const slider = await screen.findByRole('slider');
    expect(slider).toHaveAttribute('aria-valuetext', expect.stringMatching(/^Nov 26: this period 39\.4 cfs, last year [\d.]+ cfs, median 85\.0 cfs$/));
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
    // Thirty daily means and the reading from twenty minutes ago.
    expect(slider).toHaveAttribute('aria-valuemax', '30');
  });

  test('a second river opens from what was already read, and closing one takes its charts away', async () => {
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

  test('which rivers are open is kept on the device, and the next visit opens them and asks for everything at once', async () => {
    const first = await open();
    userEvent.click(await screen.findByRole('button', { name: /^Rockaway River/ }));
    await screen.findAllByRole('slider');
    expect(kept()).toEqual({ state: 'NJ', metric: 'flow', period: '30d', scale: 'log', open: ['NJ|rockaway'] });
    first.unmount();
    jest.clearAllMocks();
    answers();
    await open();
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    expect(river('Rockaway River')).toHaveAttribute('aria-expanded', 'true');
    expect(river('Raritan River')).toHaveAttribute('aria-expanded', 'false');
    await screen.findByText(/^Of 5 gauges reporting/);
    expect(asked()).toEqual({ latest: 1, daily: 2, measured: 0, normals: 2 });
  });

  test('Open all and Close all do what they say', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    userEvent.click(screen.getByRole('button', { name: 'Open all' }));
    expect(await screen.findAllByRole('slider')).toHaveLength(5);
    expect(kept().open).toEqual(['NJ|south branch raritan', 'NJ|rockaway', 'NJ|raritan', 'NJ|paulins kill']);
    userEvent.click(screen.getByRole('button', { name: 'Close all' }));
    expect(screen.queryByRole('slider')).toBeNull();
    expect(kept().open).toEqual([]);
    expect(screen.getByRole('button', { name: 'Open all' })).toBeInTheDocument();
  });

  test('what was kept on a device can be nonsense without breaking the page', async () => {
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ state: 7, metric: 'salinity', period: 'custom', scale: 'cubic', open: ['NJ|rockaway', 4, null] }));
    await open();
    expect(await screen.findAllByRole('slider')).toHaveLength(2);
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Flow' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Log' })).toHaveAttribute('aria-pressed', 'true');
    window.localStorage.setItem('fishyfriends:gauges-view', '{broken');
    await open();
    expect((await screen.findAllByText(/^Of 5 gauges reporting/)).length).toBeGreaterThan(0);
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

  test('seven days charts the record as measured, and keeps the old chart up, dimmed, until the new one is in', async () => {
    await withOneOpen();
    const week = real.periodRange('7d', NOW);
    const hours = (endMs, base) => Array.from({ length: 48 }, (_, index) => ({ t: endMs - (48 - index) * 60 * 60 * 1000, v: base + index / 10 }));
    let answer;
    // This week's record is held back; last year's same week comes straight away.
    usgs.fetchContinuous.mockImplementation((sites, metric, startMs, endMs) => (startMs === week.startMs
      ? new Promise((resolve) => { answer = resolve; })
      : Promise.resolve(new Map([['01396500', hours(endMs - DAY, 20)]]))));
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    const waiting = card('South Branch Raritan near High Bridge');
    expect(waiting).toHaveClass('is-stale');
    expect(waiting).toHaveAttribute('aria-busy', 'true');
    expect(within(waiting).getByRole('slider')).toHaveAttribute('aria-valuemax', '30');
    expect(usgs.fetchContinuous).toHaveBeenCalledWith(NJ, FLOW, week.startMs, week.endMs, expect.objectContaining({ now: NOW }));
    // Last year is the measured record too — the same week a year back, with a day to spare
    // at its end — and not the daily means the longer charts use.
    expect(usgs.fetchContinuous).toHaveBeenCalledWith(NJ, FLOW, real.yearBeforeMs(week.startMs), real.yearBeforeMs(week.endMs) + DAY, expect.objectContaining({ now: NOW }));
    expect(usgs.fetchContinuous).toHaveBeenCalledTimes(2);
    expect(usgs.fetchDaily.mock.calls.every(([, , startDay]) => startDay !== real.yearBefore(week.startDay))).toBe(true);
    await act(async () => { answer(new Map([['01396500', hours(NOW, 40)]])); });
    await waitFor(() => expect(card('South Branch Raritan near High Bridge')).not.toHaveClass('is-stale'));
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '48');
    // Read to the hour, last year's line included: 24.7 was read an hour before "now" a year ago.
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/^Nov 26, \d+ (AM|PM): this period 39\.4 cfs, last year 24\.7 cfs, median 85\.0 cfs$/);
  });

  test('a view already looked at this visit is not asked for again', async () => {
    await withOneOpen();
    userEvent.click(screen.getByRole('button', { name: '1 year' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '365'));
    await settled();
    const year = real.periodRange('1y', NOW);
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, year.startDay, year.endDay, expect.anything());
    const before = asked();
    userEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '30'));
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

  test('water temperature charts the gauges that measure it, in °F, and says which don\'t', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    userEvent.click(screen.getByRole('button', { name: 'Open all' }));
    await screen.findAllByRole('slider');
    userEvent.click(screen.getByRole('button', { name: 'Water temp' }));
    const manville = await screen.findByRole('slider', { name: 'Raritan River at Manville, water temperature: readings along the chart' });
    expect(manville.getAttribute('aria-valuetext')).toMatch(/this period 44\.6 °F/);
    expect(screen.getAllByRole('slider')).toHaveLength(1);
    expect(screen.getAllByText('This gauge doesn\'t measure water temperature.')).toHaveLength(4);
    expect(usgs.fetchLatest).toHaveBeenCalledWith(NJ, TEMP, expect.anything());
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, TEMP, MONTH.startDay, MONTH.endDay, expect.anything());
    // A log axis says nothing useful about a temperature.
    expect(screen.getByRole('button', { name: 'Log' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true');
    // The card still says what the river is running, and the top of the page is still about flow.
    const card = within(screen.getByRole('article', { name: 'Raritan River at Manville' }));
    expect(card.getByText('44.6')).toBeInTheDocument();
    expect(card.getByText('203 cfs below normal')).toBeInTheDocument();
    expect(card.getByText('213 cfs now')).toBeInTheDocument();
    expect(screen.getByText(/^Of 5 gauges reporting/)).toBeInTheDocument();
    expect(kept().metric).toBe('temp');
  });

  test('a custom stretch wants its two dates first, then charts just those days', async () => {
    await withOneOpen();
    const before = asked();
    userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    expect(screen.getByText('Pick a start and an end date.')).toBeInTheDocument();
    // Nothing is asked, and the chart that was there waits, dimmed.
    expect(card('South Branch Raritan near High Bridge')).toHaveClass('is-stale');
    userEvent.type(screen.getByLabelText('From'), '2026-03-01');
    userEvent.type(screen.getByLabelText('To'), '2026-02-01');
    expect(screen.getByText('The start date is after the end date.')).toBeInTheDocument();
    expect(asked()).toEqual(before);
    userEvent.clear(screen.getByLabelText('To'));
    userEvent.type(screen.getByLabelText('To'), '2026-04-30');
    await waitFor(() => expect(card('South Branch Raritan near High Bridge')).not.toHaveClass('is-stale'));
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, '2026-03-01', '2026-04-30', expect.anything());
    expect(usgs.fetchDaily).toHaveBeenCalledWith(NJ, FLOW, '2025-03-01', '2025-04-30', expect.anything());
    // A stretch that ended months ago is not carried on to today's reading.
    expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/^Apr 29: this period/);
    // And it is one look, not a habit: the device keeps the choice of a month.
    expect(kept().period).toBe('custom');
    window.localStorage.setItem('fishyfriends:gauges-view', JSON.stringify({ ...kept(), open: [] }));
  });

  test('a custom stretch picked with no river open asks for nothing until one is', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    userEvent.click(screen.getByRole('button', { name: 'Custom' }));
    userEvent.click(river('South Branch Raritan'));
    expect(within(card('South Branch Raritan near High Bridge')).getByRole('status')).toHaveTextContent('Pick a start and an end date above.');
    expect(asked()).toMatchObject({ daily: 0, measured: 0 });
  });

  test('Refresh reads everything again as of now, past the browser\'s own copy for what can have changed', async () => {
    await withOneOpen();
    time = NOW + 45 * 60 * 1000;
    answers({ running: { ...RUNNING, '01396500': 52.0 } });
    usgs.fetchLatest.mockImplementation(async (sites) => new Map(sites.map((site) => [site, { t: time - 5 * 60 * 1000, v: site === '01396500' ? 52 : RUNNING[site] }])));
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await within(card('South Branch Raritan near High Bridge')).findByText('52.0');
    expect(within(card('South Branch Raritan near High Bridge')).getByText('5 min ago')).toBeInTheDocument();
    expect(within(card('South Branch Raritan near High Bridge')).getByText('33 cfs below normal')).toBeInTheDocument();
    expect(usgs.fetchLatest).toHaveBeenLastCalledWith(NJ, FLOW, expect.objectContaining({ fresh: true, now: time }));
    // This period's record is read again, past the browser's copy...
    expect(usgs.fetchDaily).toHaveBeenCalledTimes(3);
    expect(usgs.fetchDaily.mock.calls[2].slice(2)).toEqual([MONTH.startDay, MONTH.endDay, expect.objectContaining({ fresh: true })]);
    // ...and last year's and the long-run normals, which are what they were a minute ago, are not asked for at all.
    expect(usgs.fetchDaily.mock.calls.filter(([, , startDay]) => startDay === real.yearBefore(MONTH.startDay))).toHaveLength(1);
    expect(usgs.fetchNormals).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('read at 11:15 AM');
  });

  test('a Refresh by hand dims the charts until the new ones are in', async () => {
    await withOneOpen();
    let answer;
    usgs.fetchLatest.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(card('South Branch Raritan near High Bridge')).toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toBeInTheDocument();
    await act(async () => { answer(new Map(NJ.map((site) => [site, { t: NOW, v: RUNNING[site] }]))); });
    await waitFor(() => expect(card('South Branch Raritan near High Bridge')).not.toHaveClass('is-stale'));
  });
});

describe('new readings by themselves', () => {
  const MINUTE = 60 * 1000;
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
    usgs.fetchLatest.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
    time = NOW + 15 * MINUTE + 2000;
    act(() => { jest.advanceTimersByTime(3 * MINUTE); });
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(2);
    // Not a Refresh by hand: this period's daily means may come from the browser's own copy.
    expect(usgs.fetchLatest).toHaveBeenLastCalledWith(NJ, FLOW, expect.objectContaining({ fresh: false, now: time }));
    // The chart that is up stays up, undimmed, while the new readings are on their way.
    expect(card('South Branch Raritan near High Bridge')).not.toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toBeInTheDocument();
    await act(async () => { answer(new Map(NJ.map((site) => [site, { t: time - 4 * MINUTE, v: site === '01396500' ? 61.5 : RUNNING[site] }]))); });
    expect(await within(card('South Branch Raritan near High Bridge')).findByText('61.5')).toBeInTheDocument();
    expect(linesOf('Rockaway River')[0]).toEqual(['at Boonton', '88.9 cfs', '▼89 cfs below normal']);
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('read at 10:45 AM');
    // Only what can have changed was asked for: one reading of the gauges and this period's record.
    expect(asked()).toEqual({ ...before, latest: before.latest + 1, daily: before.daily + 1 });
  });

  test('a page nobody is looking at waits, and catches up when it is looked at again', async () => {
    let showing = 'visible';
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => showing });
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    await settled();
    showing = 'hidden';
    time = NOW + 40 * MINUTE;
    act(() => { jest.advanceTimersByTime(40 * MINUTE); });
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(1);
    // Looked at again before the fifteen minutes were up: nothing either.
    showing = 'visible';
    time = NOW + 5 * MINUTE;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(1);
    time = NOW + 40 * MINUTE;
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/read at 11:10 AM/)).toBeInTheDocument();
  });

  test('leaving the page stops it asking', async () => {
    const { unmount } = await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    await settled();
    unmount();
    time = NOW + 60 * MINUTE;
    act(() => { jest.advanceTimersByTime(60 * MINUTE); });
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(1);
  });
});

describe('sources', () => {
  test('the page says where its numbers come from, in a row that opens', async () => {
    await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    const row = screen.getByRole('button', { name: /^Sources/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveTextContent('U.S. Geological Survey · read at 10:30 AM · new readings after 15 minutes');
    userEvent.click(row);
    const sources = within(screen.getByRole('region', { name: 'Sources' }));
    expect(sources.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['From USGS', 'Worked out on this page']);
    const [fromUsgs, workedOut] = sources.getAllByRole('list');
    expect(within(fromUsgs).getAllByRole('listitem').map((item) => item.querySelector('strong').textContent)).toEqual([
      'Latest USGS readings (24 h)', 'Historic daily medians', 'Daily means, this period and last year', '15-minute readings, this period and last year',
    ]);
    expect(within(workedOut).getAllByRole('listitem').map((item) => item.querySelector('strong').textContent)).toEqual([
      'Latest reading per gauge', 'Flow compared with normal', 'Gauges below, near and above normal',
    ]);
    // Each source names the USGS service it is, and links to that service's own page.
    const links = sources.getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['USGS: Latest continuous', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/latest-continuous?f=html'],
      ['USGS: Statistics', 'https://api.waterdata.usgs.gov/statistics/v0/docs'],
      ['USGS: Daily values', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/daily?f=html'],
      ['USGS: Continuous values', 'https://api.waterdata.usgs.gov/ogcapi/v1/collections/continuous?f=html'],
    ]);
    for (const link of links) { expect(link).toHaveAttribute('target', '_blank'); expect(link).toHaveAttribute('rel', 'noopener noreferrer'); }
    expect(sources.getByText(/Load new data: after 15 minutes\./)).toBeInTheDocument();
    userEvent.click(row);
    expect(screen.queryByText('Worked out on this page')).toBeNull();
  });

  test('before anything has been read it doesn\'t claim a time', async () => {
    usgs.fetchLatest.mockRejectedValue(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0));
    await open();
    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: /^Sources/ })).toHaveTextContent('U.S. Geological Survey · not read yet · new readings after 15 minutes');
  });
});

describe('the rest of what is charted', () => {
  async function withOneOpen(overrides) {
    const view = await open(overrides);
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
    return view;
  }

  test('going from one state to another and back after a reading keeps nothing stale on screen', async () => {
    await withOneOpen();
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await settled();
    // Pennsylvania has not been asked about since the gauges were read again.
    userEvent.selectOptions(screen.getByLabelText('State'), 'PA');
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '…', '']]);
    expect(await screen.findByText(/^Of 1 gauge reporting/)).toBeInTheDocument();
    expect(linesOf('Lehigh River')).toEqual([['at Lehighton', '310 cfs', '●Near normal · 10 cfs over']]);
  });
});

describe('when USGS can\'t be had', () => {
  test('no readings: it says so, once at the top and on each line, and Refresh tries again', async () => {
    usgs.fetchLatest.mockRejectedValue(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0));
    await open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS. Check your connection and try again.');
    expect(screen.getByText('USGS isn\'t answering right now.')).toBeInTheDocument();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '…', 'No answer from USGS']]);
    answers();
    userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText(/^Of 5 gauges reporting/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '39.4 cfs', '▼46 cfs below normal']]);
  });

  test('readings but no normals: the flows are shown and nothing is called normal or not', async () => {
    usgs.fetchNormals.mockRejectedValue(new real.GaugeDataError('USGS answered with an error (503). Try again in a little while.', 503));
    await open();
    expect(await screen.findByText('5 of 5 gauges reporting. Today\'s normals couldn\'t be had to hold them against.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('USGS answered with an error (503)');
    expect(linesOf('South Branch Raritan')).toEqual([['near High Bridge', '39.4 cfs', 'Couldn\'t get today\'s normal']]);
  });

  test('no record for the chart: the card says it couldn\'t be read instead of that there is nothing', async () => {
    usgs.fetchDaily.mockRejectedValue(new real.GaugeDataError('USGS is limiting how often this connection can ask. Give it a few minutes and try again.', 429));
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    expect(await screen.findByText('Couldn\'t read this gauge. Try Refresh in a minute.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('USGS is limiting how often this connection can ask.');
    expect(screen.queryByRole('slider')).toBeNull();
    // The closed lines never needed the chart's record.
    expect(linesOf('Rockaway River')).toHaveLength(2);
  });

  test('a new view that can\'t be read leaves the old chart up, dimmed, rather than an empty one', async () => {
    await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    usgs.fetchContinuous.mockRejectedValue(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0));
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS.');
    expect(card('South Branch Raritan near High Bridge')).toHaveClass('is-stale');
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuemax', '30');
  });

  test('a request that fails while a second look is waiting on it fails for both, and is never read as a gauge with nothing to say', async () => {
    let fail;
    usgs.fetchLatest.mockImplementation(() => new Promise((resolve, reject) => { fail = reject; }));
    await open();
    await screen.findByRole('button', { name: 'Reading...' });
    // Opening a river makes the page ask again while the first request is still out.
    userEvent.click(river('South Branch Raritan'));
    await act(async () => { fail(new real.GaugeDataError('Couldn\'t reach USGS. Check your connection and try again.', 0)); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn\'t reach USGS.');
    expect(linesOf('Rockaway River')[0]).toEqual(['at Boonton', '…', 'No answer from USGS']);
    expect(screen.queryByText('Not reporting')).toBeNull();
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(1);
    // And it is asked for again the next time the page has a question, not remembered as answered.
    answers();
    userEvent.click(screen.getByRole('button', { name: '7 days' }));
    expect(await screen.findByText(/^Of 5 gauges reporting/)).toBeInTheDocument();
    expect(usgs.fetchLatest).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('one state\'s record failing to load doesn\'t take another\'s lines away', async () => {
    usgs.fetchDaily.mockImplementation(async (sites, metric, startDay, endDay) => {
      if (sites.includes('01449000') && startDay.startsWith('2025')) throw new real.GaugeDataError('USGS answered with an error (500). Try again in a little while.', 500);
      return new Map(sites.map((site) => [site, real.daysBetween(startDay, endDay).slice(0, -1).map((day) => ({ t: real.dayToMs(day), v: RUNNING[site], day }))]));
    });
    const { container } = await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1);
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
    usgs.fetchDaily.mockImplementation(async (sites, metric, startDay, endDay) => {
      if (startDay.startsWith('2025')) throw new real.GaugeDataError('USGS answered with an error (500). Try again in a little while.', 500);
      return new Map(sites.map((site) => [site, real.daysBetween(startDay, endDay).slice(0, -1).map((day) => ({ t: real.dayToMs(day), v: RUNNING[site], day }))]));
    });
    const { container } = await open();
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    expect(screen.getByRole('alert')).toHaveTextContent('USGS answered with an error (500)');
    expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
    expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(0);
    expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
  });
});

describe('the club\'s list', () => {
  test('a member can remove the gauge they added, after being asked, and nobody else\'s', async () => {
    const { auth } = await open();
    await screen.findByText(/^Of 5 gauges reporting/);
    userEvent.click(screen.getByRole('button', { name: 'Open all' }));
    await screen.findAllByRole('slider');
    expect(within(card('South Branch Raritan near High Bridge')).queryByRole('button', { name: 'Remove' })).toBeNull();
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
    expect(await screen.findByText(/^Of 4 gauges reporting/)).toBeInTheDocument();
  });

  test('the admin can remove any gauge, the club\'s own included', async () => {
    await open({ isAdmin: true });
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    expect(within(card('South Branch Raritan near High Bridge')).getByRole('button', { name: 'Remove' })).toBeInTheDocument();
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
    answers({ running: { ...RUNNING, '01381000': 28.6 }, median: { ...MEDIAN, '01381000': 40 } });
    usgs.searchGauges.mockResolvedValue([
      { siteNo: '01380450', name: 'Rockaway River at Main Street at Boonton NJ', river: 'Rockaway River', place: 'at Main Street at Boonton', state: 'NJ', flow: 88.9 },
      { siteNo: '01381000', name: 'ROCKAWAY RIVER BELOW RESERVOIR AT BOONTON NJ', river: 'Rockaway river', place: 'below Reservoir at Boonton', state: 'NJ', flow: 28.6 },
    ]);
    const added = gauge('g7', '01381000', 'Rockaway River', 'below the reservoir', 1000, { added_by: 'me', added_by_name: 'Andre' });
    const { auth } = await open({ addRiverGauge: jest.fn().mockResolvedValue({ error: null, gauge: added }) });
    // One river is already open, so the charts for the gauges on the list have been read.
    userEvent.click(await screen.findByRole('button', { name: /^South Branch Raritan/ }));
    await screen.findByRole('slider');
    await settled();
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
    // "Rockaway river" as USGS had it becomes the club's "Rockaway River", so it joins that drop-down.
    expect(form.getByLabelText('River')).toHaveValue('Rockaway River');
    expect(form.getByLabelText('River')).toHaveAttribute('maxLength', '80');
    expect(form.getByLabelText('Where on it')).toHaveAttribute('maxLength', '120');
    userEvent.clear(form.getByLabelText('Where on it'));
    userEvent.type(form.getByLabelText('Where on it'), 'below the reservoir');
    userEvent.click(form.getByRole('button', { name: /add to the club's list/i }));
    await waitFor(() => expect(auth.addRiverGauge).toHaveBeenCalledWith({ siteNo: '01381000', river: 'Rockaway River', place: 'below the reservoir', state: 'NJ' }));
    // Its river opens to show it, and USGS is asked about it alone.
    expect(await screen.findByRole('slider', { name: /^Rockaway River below the reservoir, flow/ })).toBeInTheDocument();
    expect(screen.getAllByRole('slider')).toHaveLength(4);
    expect(within(river('Rockaway River')).getByText('3 gauges')).toBeInTheDocument();
    expect(usgs.fetchLatest).toHaveBeenLastCalledWith(['01381000'], FLOW, expect.anything());
    expect(usgs.fetchDaily).toHaveBeenLastCalledWith(['01381000'], FLOW, expect.any(String), expect.any(String), expect.anything());
    expect(usgs.fetchNormals).toHaveBeenLastCalledWith(['01381000'], FLOW, expect.any(String), expect.any(String), expect.anything());
    expect(await screen.findByText(/^Of 6 gauges reporting/)).toBeInTheDocument();
    expect(kept().open).toEqual(['NJ|south branch raritan', 'NJ|rockaway']);
    expect(form.getByLabelText('River or station number')).toHaveValue('');
  });

  test('a gauge in another state takes the page there', async () => {
    usgs.searchGauges.mockResolvedValue([{ siteNo: '01420500', name: 'BEAVER KILL AT COOKS FALLS NY', river: 'Beaver Kill', place: 'at Cooks Falls', state: 'NY', flow: 402 }]);
    const added = gauge('g8', '01420500', 'Beaver Kill', 'at Cooks Falls', 1000, { state: 'NY', added_by: 'me', added_by_name: 'Andre' });
    const { auth } = await open({ addRiverGauge: jest.fn().mockResolvedValue({ error: null, gauge: added }) });
    await screen.findByText(/^Of 5 gauges reporting/);
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
    await screen.findByText(/^Of 5 gauges reporting/);
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
