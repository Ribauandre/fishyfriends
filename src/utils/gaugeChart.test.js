import { axisLabel, bandPath, extent, linePath, linearAxis, linearScale, logAxis, logScale, nearest, nearestIndex, segments, timeTicks } from './gaugeChart';

const DAY = 24 * 60 * 60 * 1000;
const local = (year, month, date, hour = 0) => new Date(year, month, date, hour).getTime();

describe('scales', () => {
  test('a straight scale puts a value in proportion between the ends', () => {
    const y = linearScale(0, 200, 166, 10);
    expect(y(0)).toBe(166);
    expect(y(200)).toBe(10);
    expect(y(100)).toBe(88);
    // An axis with no span doesn't divide by nothing.
    expect(Number.isFinite(linearScale(5, 5, 0, 100)(5))).toBe(true);
  });

  test('a log scale gives each tenfold step the same room', () => {
    const y = logScale(1, 1000, 300, 0);
    expect(y(1)).toBe(300);
    expect(y(10)).toBeCloseTo(200, 6);
    expect(y(100)).toBeCloseTo(100, 6);
    expect(y(1000)).toBeCloseTo(0, 6);
    // Nothing at or below zero has a place on it: it is drawn at the bottom, not nowhere.
    expect(y(0)).toBe(300);
    expect(y(-4)).toBe(300);
  });
});

describe('axes', () => {
  test('a straight axis runs between round numbers and is ruled at a handful of them', () => {
    expect(linearAxis(28, 211, { floor: 0 })).toEqual({ min: 0, max: 300, ticks: [0, 100, 200, 300] });
    expect(linearAxis(43.2, 59.6)).toEqual({ min: 40, max: 60, ticks: [40, 45, 50, 55, 60] });
    // Sums of tenths stay round numbers.
    expect(linearAxis(0.12, 0.37)).toEqual({ min: 0.1, max: 0.4, ticks: [0.1, 0.2, 0.3, 0.4] });
    // Steps of 25 as well as 1, 2 and 5: a river running 26 to 83 is ruled four times, not once.
    expect(linearAxis(26, 83, { floor: 0 })).toEqual({ min: 0, max: 100, ticks: [0, 25, 50, 75, 100] });
    expect(linearAxis(41, 50)).toEqual({ min: 40, max: 50, ticks: [40, 42.5, 45, 47.5, 50] });
  });

  test('a flat record still gets an axis, and nonsense gets a plain one', () => {
    expect(linearAxis(5, 5)).toEqual({ min: 4, max: 10, ticks: [4, 6, 8, 10] });
    expect(linearAxis(NaN, 3)).toEqual({ min: 0, max: 1, ticks: [0, 1] });
  });

  test('a log axis runs between 1-2-5 numbers and shows the 2s and 5s while it is short', () => {
    expect(logAxis(28, 211)).toEqual({ min: 20, max: 500, ticks: [20, 50, 100, 200, 500] });
    expect(logAxis(95, 105)).toEqual({ min: 50, max: 200, ticks: [50, 100, 200] });
    // Over three decades or more, only the powers of ten.
    expect(logAxis(0.4, 5200)).toEqual({ min: 0.2, max: 10000, ticks: [1, 10, 100, 1000, 10000] });
  });

  test('a single value, or nothing above zero, still gets a log axis', () => {
    expect(logAxis(50, 50)).toEqual({ min: 50, max: 100, ticks: [50, 100] });
    expect(logAxis(0, 10)).toEqual({ min: 1, max: 10, ticks: [1, 10] });
  });

  test('the extent is the lowest and highest value over every line', () => {
    const lines = [[{ t: 1, v: 40 }, { t: 2, v: 211 }], [{ t: 1, v: 28 }, { t: 2, v: NaN }], undefined, []];
    expect(extent(lines)).toEqual([28, 211]);
    expect(extent([[{ t: 1, v: 0 }, { t: 2, v: -3 }, { t: 3, v: 12 }]], { positive: true })).toEqual([12, 12]);
    expect(extent([[{ t: 1, v: 0 }]], { positive: true })).toBeNull();
    // A line that carries a band round it is as wide as the band.
    expect(extent([[{ t: 1, v: 40 }], [{ t: 1, v: 85, low: 60, high: 120 }, { t: 2, v: 86, low: 12, high: 121 }]])).toEqual([12, 121]);
    expect(extent([[{ t: 1, v: 85, low: 0, high: 120 }]], { positive: true })).toEqual([85, 120]);
    expect(extent([[], undefined])).toBeNull();
  });

  test('an axis number is written short', () => {
    expect([1000, 1234.5, 20, 0.5, 2.5, 0.125, 42.5, 47.26].map(axisLabel)).toEqual(['1,000', '1,235', '20', '0.5', '2.5', '0.125', '42.5', '47.3']);
  });
});

describe('timeTicks', () => {
  const morning = 5.5 * 60 * 60 * 1000;

  test('a month is named by the week, or by the fortnight where there is less room', () => {
    const start = local(2026, 9, 27) + morning;
    const end = local(2026, 10, 26) + morning;
    expect(timeTicks(start, end, 7).map((tick) => tick.label)).toEqual(['Oct 28', 'Nov 4', 'Nov 11', 'Nov 18', 'Nov 25']);
    expect(timeTicks(start, end, 4).map((tick) => tick.label)).toEqual(['Oct 28', 'Nov 11', 'Nov 25']);
  });

  test('a week is named by the day, each tick at the start of its day', () => {
    const ticks = timeTicks(local(2026, 10, 19) + morning, local(2026, 10, 26) + morning, 7);
    expect(ticks.map((tick) => tick.label)).toEqual(['Nov 20', 'Nov 21', 'Nov 22', 'Nov 23', 'Nov 24', 'Nov 25', 'Nov 26']);
    expect(ticks[0].t).toBe(local(2026, 10, 20));
    expect(timeTicks(local(2026, 10, 19) + morning, local(2026, 10, 26) + morning, 4).map((tick) => tick.label)).toEqual(['Nov 20', 'Nov 22', 'Nov 24', 'Nov 26']);
  });

  test('a year is named by the month, with the year where it turns', () => {
    const start = local(2025, 10, 26) + morning;
    const end = local(2026, 10, 26) + morning;
    // A year is twelve months, not twelve and a bit: a phone gets four names, not two.
    expect(timeTicks(start, end, 4).map((tick) => tick.label)).toEqual(['Jan 2026', 'Apr', 'Jul', 'Oct']);
    expect(timeTicks(start, end, 7).map((tick) => tick.label)).toEqual(['Jan 2026', 'Mar', 'May', 'Jul', 'Sep', 'Nov']);
    expect(timeTicks(start, end, 4)[0].t).toBe(local(2026, 0, 1));
  });

  test('several years are named by the year', () => {
    expect(timeTicks(local(2023, 10, 26), local(2026, 10, 26), 4).map((tick) => tick.label)).toEqual(['Jan 2024', 'Jan 2025', 'Jan 2026']);
  });

  test('never more names than fit, and none for a stretch that isn\'t one', () => {
    for (const most of [2, 3, 4, 5, 6, 7]) {
      for (const days of [1, 7, 30, 61, 100, 365, 1098]) {
        expect(timeTicks(local(2026, 0, 15), local(2026, 0, 15) + days * DAY, most).length).toBeLessThanOrEqual(most + 1);
      }
    }
    expect(timeTicks(5, 5)).toEqual([]);
    expect(timeTicks(10, 5)).toEqual([]);
  });
});

describe('lines', () => {
  const point = (day, v) => ({ t: day * DAY, v });

  test('a record is drawn in pieces, broken where the gauge was down', () => {
    const pieces = segments([point(1, 10), point(2, 11), point(3, NaN), point(4, 12), point(9, 13), point(10, 14)], 3.5 * DAY);
    expect(pieces.map((piece) => piece.map((row) => row.v))).toEqual([[10, 11, 12], [13, 14]]);
    expect(segments([], DAY)).toEqual([]);
    expect(segments(undefined, DAY)).toEqual([]);
  });

  test('a piece becomes a path, and a lone reading a short dash that can be seen', () => {
    const x = (t) => t / DAY;
    const y = (v) => v * 2;
    expect(linePath([point(1, 10), point(2, 11.26)], x, y)).toBe('M1 20L2 22.5');
    expect(linePath([point(4, 5)], x, y)).toBe('M2.5 10h3');
  });

  test('a band is the closed shape between its top and its bottom, and a lone point has none', () => {
    const x = (t) => t * 10;
    const y = (value) => 100 - value;
    expect(bandPath([{ t: 1, low: 20, high: 60 }, { t: 2, low: 25, high: 70 }, { t: 3, low: 30, high: 65 }], x, y)).toBe('M10 40L20 30L30 35L30 70L20 75L10 80Z');
    expect(bandPath([{ t: 1, low: 20, high: 60 }], x, y)).toBe('');
    expect(bandPath([], x, y)).toBe('');
  });

  test('the nearest reading in time, if it is near enough', () => {
    const points = [point(1, 10), point(2, 11), point(3, 12), point(10, 13)];
    expect(nearest(points, 2.4 * DAY)).toBe(points[1]);
    expect(nearest(points, 2.6 * DAY)).toBe(points[2]);
    expect(nearest(points, -5 * DAY)).toBe(points[0]);
    expect(nearest(points, 50 * DAY)).toBe(points[3]);
    expect(nearest(points, 6 * DAY, DAY)).toBeNull();
    expect(nearest(points, 9.5 * DAY, DAY)).toBe(points[3]);
    expect(nearest([], 3)).toBeNull();
    expect(nearest(undefined, 3)).toBeNull();
    expect(nearestIndex(points, 2.6 * DAY)).toBe(2);
    expect(nearestIndex([point(4, 1)], 0)).toBe(0);
    expect(nearestIndex([], 0)).toBe(-1);
  });
});
