import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import GaugeChart from './GaugeChart';

// jsdom lays nothing out, so the chart draws at its default width (320) and a pointer's
// place is measured from a box at 0,0: the plot runs from x = 46 to x = 310.
const DAY = 24 * 60 * 60 * 1000;
// Everything sits at noon UTC, so the dates read the same in whatever zone the tests run.
const NOON = (date) => Date.UTC(2026, 10, date, 12);
const END = NOON(26);
const START = END - 30 * DAY;

// A month of daily values (Oct 28 to Nov 25 for this period: today's mean isn't in yet), and
// the newest reading carried on to "now".
const days = Array.from({ length: 30 }, (_, index) => index + 1);
const daily = (offset, v) => ({ t: START + offset * DAY, v, day: new Date(START + offset * DAY).toISOString().slice(0, 10) });
const now = [...days.slice(0, 29).map((offset) => daily(offset, 40 + offset)), { t: END - 20 * 60 * 1000, v: 39.4 }];
const last = days.map((offset) => daily(offset, 25 + offset));
const normal = days.map((offset) => daily(offset, 80 + offset / 10));
const flow = (value) => (value >= 100 ? String(Math.round(value)) : value.toFixed(1));

// jsdom has no PointerEvent, and without one a fired pointer event carries no position.
beforeAll(() => {
  if (typeof window.PointerEvent !== 'function') window.PointerEvent = class PointerEvent extends window.MouseEvent {};
});

function draw(props = {}) {
  return render(<GaugeChart title="South Branch Raritan near High Bridge, flow" unit="cfs" scale="log" floor={0} startMs={START} endMs={END} now={now} last={last} normal={normal} format={flow} {...props} />);
}

const readout = (container) => [...container.querySelectorAll('.gauge-readout > span')].map((cell) => cell.textContent);
const xOf = (t) => 46 + ((t - START) / (END - START)) * (310 - 46);

test('draws the three lines, the axis and the newest reading', () => {
  const { container } = draw();
  expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(1);
  expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(1);
  expect(container.querySelectorAll('.gauge-line-normal')).toHaveLength(1);
  // 25.. to 83: a log axis from 20 to 100, ruled at 20, 50 and 100.
  const ticks = [...container.querySelectorAll('.gauge-tick')].map((tick) => tick.textContent);
  expect(ticks.slice(0, 3)).toEqual(['20', '50', '100']);
  expect(ticks.slice(3).every((label) => /^(Oct|Nov) \d+$/.test(label))).toBe(true);
  expect(container.querySelectorAll('.gauge-newest')).toHaveLength(1);
  expect(container.querySelector('.gauge-rule')).toBeNull();
});

test('with nothing pointed at, the line under the chart reads the newest values', () => {
  const { container } = draw();
  expect(readout(container)).toEqual(['Nov 26', 'This period39.4 cfs', 'Last year55.0 cfs', 'Median83.0 cfs']);
});

test('the lines are drawn inside a clip the width of the plot, so none runs over the axis labels', () => {
  const { container } = draw();
  const group = container.querySelector('g[clip-path]');
  const id = group.getAttribute('clip-path').match(/^url\(#(.+)\)$/)[1];
  expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  const box = container.querySelector(`clipPath[id="${id}"] rect`);
  expect(Number(box.getAttribute('x'))).toBe(46);
  expect(Number(box.getAttribute('width'))).toBe(264);
  expect(group.querySelectorAll('.gauge-line')).toHaveLength(3);
  // Two charts on a page don't share a clip.
  const other = draw();
  expect(other.container.querySelector('g[clip-path]').getAttribute('clip-path')).not.toBe(group.getAttribute('clip-path'));
});

test('pointing along the chart moves a rule to the nearest reading and reads every line there', () => {
  const { container } = draw();
  const plot = container.querySelector('.gauge-chart-plot');
  const target = now[9];
  // A little off the reading: the rule stands on the reading, not under the finger.
  fireEvent.pointerMove(plot, { clientX: xOf(target.t) + 2, clientY: 60 });
  expect(readout(container)).toEqual(['Nov 6', 'This period50.0 cfs', 'Last year35.0 cfs', 'Median81.0 cfs']);
  const rule = container.querySelector('.gauge-rule');
  expect(Number(rule.getAttribute('x1'))).toBeCloseTo(Math.round(xOf(target.t)) + 0.5, 5);
  expect(container.querySelectorAll('.gauge-newest')).toHaveLength(2);
  fireEvent.pointerLeave(plot);
  expect(container.querySelector('.gauge-rule')).toBeNull();
  expect(readout(container)[0]).toBe('Nov 26');
});

test('a finger past either end of the plot reads the end, not nothing', () => {
  const { container } = draw();
  const plot = container.querySelector('.gauge-chart-plot');
  fireEvent.pointerDown(plot, { clientX: 2, clientY: 60 });
  expect(readout(container)[1]).toBe('This period41.0 cfs');
  fireEvent.pointerMove(plot, { clientX: 5000, clientY: 60 });
  expect(readout(container)[1]).toBe('This period39.4 cfs');
});

test('from the keyboard the chart is a slider that walks the readings and says each one', () => {
  draw();
  const slider = screen.getByRole('slider', { name: 'South Branch Raritan near High Bridge, flow: readings along the chart' });
  expect(slider).toHaveAttribute('aria-valuemin', '0');
  expect(slider).toHaveAttribute('aria-valuemax', '29');
  expect(slider).toHaveAttribute('aria-valuenow', '29');
  expect(slider).toHaveAttribute('aria-valuetext', 'Nov 26: this period 39.4 cfs, last year 55.0 cfs, median 83.0 cfs');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(slider).toHaveAttribute('aria-valuenow', '28');
  expect(slider).toHaveAttribute('aria-valuetext', 'Nov 25: this period 69.0 cfs, last year 54.0 cfs, median 82.9 cfs');
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(slider).toHaveAttribute('aria-valuetext', 'Nov 24: this period 68.0 cfs, last year 53.0 cfs, median 82.8 cfs');
  fireEvent.keyDown(slider, { key: 'Home' });
  expect(slider).toHaveAttribute('aria-valuenow', '0');
  expect(slider.getAttribute('aria-valuetext')).toMatch(/^Oct 28: this period 41\.0 cfs/);
  fireEvent.keyDown(slider, { key: 'ArrowLeft' });
  expect(slider).toHaveAttribute('aria-valuenow', '0');
  fireEvent.keyDown(slider, { key: 'PageUp' });
  expect(slider).toHaveAttribute('aria-valuenow', '3');
  fireEvent.keyDown(slider, { key: 'End' });
  fireEvent.keyDown(slider, { key: 'ArrowRight' });
  expect(slider).toHaveAttribute('aria-valuenow', '29');
  // A key that isn't the chart's is left for the page.
  expect(fireEvent.keyDown(slider, { key: 'Tab' })).toBe(true);
  expect(fireEvent.keyDown(slider, { key: 'ArrowLeft' })).toBe(false);
  fireEvent.keyDown(slider, { key: 'Escape' });
  expect(slider).toHaveAttribute('aria-valuenow', '29');
  fireEvent.keyDown(slider, { key: 'Home' });
  fireEvent.blur(slider);
  expect(slider).toHaveAttribute('aria-valuenow', '29');
});

test('a straight axis starts where it is told to, and a log axis leaves out what is not above zero', () => {
  const { container, rerender } = draw({ scale: 'linear' });
  expect([...container.querySelectorAll('.gauge-tick')].map((tick) => tick.textContent).slice(0, 5)).toEqual(['0', '25', '50', '75', '100']);
  rerender(<GaugeChart title="A gauge" unit="cfs" scale="log" startMs={START} endMs={END} now={[{ t: NOON(20), v: 0 }, { t: NOON(21), v: 12 }, { t: NOON(22), v: 15 }]} format={flow} />);
  expect([...container.querySelectorAll('.gauge-tick')].map((tick) => tick.textContent).slice(0, 2)).toEqual(['10', '20']);
});

test('a line stops where the gauge was down, and a line with no reading there says so', () => {
  const broken = [{ t: NOON(1), v: 40 }, { t: NOON(2), v: 41 }, { t: NOON(12), v: 45 }, { t: NOON(13), v: 46 }];
  const { container } = draw({ now: broken, last: [], normal: [] });
  expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(2);
  expect(container.querySelectorAll('.gauge-line-last')).toHaveLength(0);
  expect(readout(container)).toEqual(['Nov 13', 'This period46.0 cfs', 'Last year—', 'Median—']);
});

test('the measured record is read to the hour, and its line breaks after six hours of silence', () => {
  const start = END - 7 * DAY;
  const hours = Array.from({ length: 24 }, (_, index) => ({ t: END - (30 - index) * 60 * 60 * 1000, v: 40 + index / 10 })).filter((_, index) => index < 8 || index > 15);
  const { container } = render(<GaugeChart title="A gauge" unit="cfs" scale="linear" floor={0} startMs={start} endMs={END} now={hours} last={[]} normal={[]} hourly format={flow} />);
  expect(container.querySelectorAll('.gauge-line-now')).toHaveLength(2);
  expect(readout(container)[0]).toMatch(/^Nov 2\d, \d+ (AM|PM)$/);
});

test('with nothing recorded it says so instead of drawing an empty axis, and is not a slider', () => {
  const { container } = draw({ now: [], last: [], normal: [] });
  expect(screen.getByRole('img', { name: 'South Branch Raritan near High Bridge, flow: nothing recorded for this stretch' })).toBeInTheDocument();
  expect(screen.queryByRole('slider')).toBeNull();
  expect(container.querySelector('.gauge-none').textContent).toBe('Nothing recorded for this stretch');
  expect(container.querySelectorAll('.gauge-line')).toHaveLength(0);
});

test('an event that says nothing of where it happened is ignored rather than read as nowhere', () => {
  const { container } = draw();
  fireEvent(container.querySelector('.gauge-chart-plot'), new window.Event('pointermove', { bubbles: true }));
  expect(container.querySelector('.gauge-rule')).toBeNull();
  expect(readout(container)[0]).toBe('Nov 26');
});

test('a daily value is named by its own date, not by what the clock makes of where it is drawn', () => {
  // Drawn at an instant that is already the 21st somewhere and still the 19th somewhere else.
  const { container } = draw({ now: [{ t: NOON(20), v: 44, day: '2026-11-20' }, { t: NOON(21) + 11 * 60 * 60 * 1000, v: 45, day: '2026-11-21' }], last: [], normal: [] });
  expect(readout(container)[0]).toBe('Nov 21');
  fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
  expect(readout(container)[0]).toBe('Nov 20');
  expect(screen.getByRole('slider').getAttribute('aria-valuetext')).toMatch(/^Nov 20: this period 44\.0 cfs$/);
});

test('with no reading of this period near, the date is the day of the line that is being read', () => {
  const { container } = draw({ now: [], last: [daily(10, 35), daily(11, 36)], normal: [] });
  expect(readout(container)).toEqual(['Nov 7', 'This period—', 'Last year36.0 cfs', 'Median—']);
});

test('a temperature is charted in its own unit', () => {
  const temps = days.map((offset) => daily(offset, 44 + offset / 5));
  const { container } = render(<GaugeChart title="Raritan River at Manville, water temperature" unit="°F" scale="linear" startMs={START} endMs={END} now={temps} format={(value) => value.toFixed(1)} />);
  expect(readout(container)[1]).toBe('This period50.0 °F');
  expect([...container.querySelectorAll('.gauge-tick')].map((tick) => tick.textContent).slice(0, 2)).toEqual(['44', '46']);
});

test('a year of daily values is drawn with thinner lines', () => {
  const year = Array.from({ length: 365 }, (_, index) => ({ t: END - (365 - index) * DAY, v: 40 + (index % 30) }));
  const { container } = render(<GaugeChart title="A gauge" unit="cfs" startMs={END - 365 * DAY} endMs={END} now={year} format={flow} />);
  expect(container.querySelector('.gauge-chart')).toHaveClass('is-dense');
  expect(draw().container.querySelector('.gauge-chart')).not.toHaveClass('is-dense');
});
