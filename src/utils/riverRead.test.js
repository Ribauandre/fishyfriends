import {
  LEVELS, TROUT_BANDS, bandOf, changeText, dayRange, fishingNotes, flowLevel, flowTrend, headline, levelOf, readGauge, readTitle, tally,
  timeOfYear, timesNormal, timesNormalText, trendLabel, trendNote, troutBand, waterNote, whenText,
} from './riverRead';

// A day's five lines, as utils/riverGauges.js hands them over: the 10th, 25th, 50th, 75th
// and 90th percentile of every year's flow on that date.
const DAY_LINES = [30, 60, 85, 120, 200];
// A gauge with eight years behind it: USGS gives the middle three and not the outer two.
const SHORT_RECORD = [null, 60, 85, 120, null];
// A brook that is a trickle most years and a torrent in a few: its 90th percentile is
// seventeen times its median (Canoe Brook near Summit, in late November).
const FLASHY = [0.1, 1.8, 5.2, 16, 90.6];

const HOUR = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 28, 5, 30);

// A record every fifteen minutes, drawn straight between the readings named ([hours ago,
// value], oldest first) and ending at the last of them.
function record(knots, now = NOW) {
  const points = [];
  for (let quarter = Math.round(knots[0][0] * 4); quarter >= Math.round(knots[knots.length - 1][0] * 4); quarter -= 1) {
    const ago = quarter / 4;
    const after = knots.findIndex(([hours]) => hours <= ago);
    const [fromAgo, fromValue] = knots[Math.max(0, after - 1)];
    const [toAgo, toValue] = knots[after];
    const along = fromAgo === toAgo ? 1 : (fromAgo - ago) / (fromAgo - toAgo);
    points.push({ t: now - ago * HOUR, v: after === 0 ? toValue : fromValue + (toValue - fromValue) * along });
  }
  return points;
}

describe('how much water', () => {
  test('USGS\'s five classes, by where the flow falls among every year\'s flow on the date', () => {
    const level = (value) => flowLevel(value, DAY_LINES);
    expect([29.9, 30, 59.9, 60, 85, 120, 120.1, 200, 200.1].map(level)).toEqual(['very-low', 'low', 'low', 'normal', 'normal', 'normal', 'high', 'high', 'very-high']);
    expect(LEVELS.map((entry) => [entry.key, entry.label, entry.shape])).toEqual([
      ['very-low', 'Very low', '▼▼'], ['low', 'Low', '▼'], ['normal', 'Normal', '●'], ['high', 'High', '▲'], ['very-high', 'Very high', '▲▲'],
    ]);
    expect(levelOf('high')).toEqual({ key: 'high', label: 'High', shape: '▲' });
    expect(levelOf('biblical')).toBeNull();
  });

  test('nothing to hold a flow against, or no flow, is no level', () => {
    expect(flowLevel(100, undefined)).toBeNull();
    expect(flowLevel(100, null)).toBeNull();
    expect(flowLevel(NaN, DAY_LINES)).toBeNull();
    expect(flowLevel(undefined, DAY_LINES)).toBeNull();
  });

  test('where the record is too short for the outer lines, a third of the median and three times it stand in', () => {
    const level = (value) => flowLevel(value, SHORT_RECORD);
    // 85 / 3 is 28.3, and three times 85 is 255.
    expect([28, 29, 59, 60, 120, 121, 255, 256].map(level)).toEqual(['very-low', 'low', 'low', 'normal', 'normal', 'high', 'high', 'very-high']);
  });

  test('four times the median is very high, and a quarter of it very low, whatever the percentiles say', () => {
    const level = (value) => flowLevel(value, FLASHY);
    // 4 x 5.2 is 20.8: well under this brook's 90th percentile, and nobody's idea of merely high.
    expect([16.1, 20.7, 20.8, 41.2, 91].map(level)).toEqual(['high', 'high', 'very-high', 'very-high', 'very-high']);
    // 5.2 / 4 is 1.3.
    expect([1.7, 1.31, 1.3, 0.2, 0.05].map(level)).toEqual(['low', 'low', 'very-low', 'very-low', 'very-low']);
  });

  test('but inside the usual range a river is normal, however many times its median that is', () => {
    // A stream that is dry half the years: the middle half of them run from nothing to plenty.
    expect(flowLevel(9, [0, 1, 2, 10, 50])).toBe('normal');
    expect(flowLevel(10.5, [0, 1, 2, 10, 50])).toBe('very-high');
  });
});

describe('times normal', () => {
  test('is the flow over the day\'s median', () => {
    expect(timesNormal(229, DAY_LINES)).toBeCloseTo(2.694, 3);
    expect(timesNormal(42.5, DAY_LINES)).toBe(0.5);
    expect(timesNormal(0, DAY_LINES)).toBe(0);
    // A stream that is dry on this date most years has no normal to count from.
    expect(timesNormal(3, [0, 0, 0, 2, 9])).toBeNull();
    expect(timesNormal(3, undefined)).toBeNull();
    expect(timesNormal(NaN, DAY_LINES)).toBeNull();
  });

  test('above normal it is said in times, below it as a share', () => {
    expect([2.694, 2, 1.05, 1.5, 9.94, 9.96, 13.13, 1234.4].map(timesNormalText)).toEqual(['2.7× normal', '2× normal', '1.1× normal', '1.5× normal', '9.9× normal', '10× normal', '13× normal', '1,234× normal']);
    expect([0.62, 0.5, 0.949, 0.011, 0.004, 0].map(timesNormalText)).toEqual(['62% of normal', '50% of normal', '95% of normal', '1% of normal', '<1% of normal', '<1% of normal']);
    expect([0.95, 1, 1.049].map(timesNormalText)).toEqual(['right at normal', 'right at normal', 'right at normal']);
    expect(timesNormalText(null)).toBe('');
    expect(timesNormalText(NaN)).toBe('');
  });
});

describe('which way it is going', () => {
  test('a river that has barely moved is steady', () => {
    expect(flowTrend(record([[72, 100], [0, 100]]))).toEqual({ direction: 'steady', fast: false, daily: 0, recent: 0, dayAgo: 100, high: null, low: null });
    // A gauge wanders a few percent by itself: 6% on the day and 2% in six hours is not a direction.
    expect(flowTrend(record([[72, 100], [24, 100], [6, 104], [0, 106]]))).toMatchObject({ direction: 'steady', daily: expect.closeTo(0.06, 5), recent: expect.closeTo(0.0192, 3) });
  });

  test('a tenth or more since this time yesterday, and still going that way, is a direction', () => {
    expect(flowTrend(record([[72, 100], [24, 100], [0, 115]]))).toMatchObject({ direction: 'rising', fast: false, daily: expect.closeTo(0.15, 5), dayAgo: 100 });
    expect(flowTrend(record([[72, 100], [24, 100], [0, 88]]))).toMatchObject({ direction: 'dropping', fast: false, daily: expect.closeTo(-0.12, 5) });
    expect(flowTrend(record([[72, 100], [24, 100], [0, 109]])).direction).toBe('steady');
  });

  test('one that came up and has levelled off, or has only just turned, is steady', () => {
    // Up 30% on yesterday, flat for the last six hours.
    expect(flowTrend(record([[72, 100], [24, 100], [6, 130], [0, 130]]))).toMatchObject({ direction: 'steady', daily: expect.closeTo(0.3, 5), recent: 0 });
    // Down on the day, and a touch up since this morning.
    expect(flowTrend(record([[72, 100], [24, 100], [6, 80], [0, 82]])).direction).toBe('steady');
  });

  test('eight percent in six hours is a direction whatever yesterday was', () => {
    // Came up overnight, crested, and is on its way down: up on yesterday, and dropping.
    const crested = flowTrend(record([[72, 50], [30, 50], [20, 500], [6, 340], [0, 300]]));
    expect(crested).toMatchObject({ direction: 'dropping', fast: false, daily: expect.closeTo(300 / 320 - 1, 5), recent: expect.closeTo(300 / 340 - 1, 5), dayAgo: 320 });
    expect(flowTrend(record([[72, 100], [6, 100], [0, 109]])).direction).toBe('rising');
    expect(flowTrend(record([[72, 100], [6, 100], [0, 107]])).direction).toBe('steady');
  });

  test('a quarter or more in six hours is fast', () => {
    expect(flowTrend(record([[72, 100], [6, 100], [0, 130]]))).toMatchObject({ direction: 'rising', fast: true });
    expect(flowTrend(record([[72, 200], [6, 200], [0, 140]]))).toMatchObject({ direction: 'dropping', fast: true });
    expect(flowTrend(record([[72, 100], [6, 100], [0, 120]]))).toMatchObject({ direction: 'rising', fast: false });
    expect(trendLabel({ direction: 'rising', fast: true })).toBe('rising fast');
    expect(trendLabel({ direction: 'dropping', fast: false })).toBe('dropping');
    expect(trendLabel({ direction: 'steady', fast: false })).toBe('steady');
    expect(trendLabel(null)).toBe('');
  });

  test('the peak a river is coming down from is kept, and whether it rose into it', () => {
    const crested = flowTrend(record([[72, 50], [30, 50], [20, 500], [6, 340], [0, 300]]));
    expect(crested.high).toEqual({ t: NOW - 20 * HOUR, v: 500, crest: true });
    // The low it came up from, too: the last of the readings at the bottom.
    expect(crested.low).toEqual({ t: NOW - 30 * HOUR, v: 50 });
    // A record that starts at its highest and has fallen ever since has a high, but no crest in it.
    expect(flowTrend(record([[72, 900], [0, 300]])).high).toEqual({ t: NOW - 72 * HOUR, v: 900, crest: false });
  });

  test('a peak or a low is only worth a mention a quarter off where the river is now, and two hours ago', () => {
    // Within a quarter of now: no story.
    expect(flowTrend(record([[72, 100], [30, 100], [20, 120], [0, 100]]))).toMatchObject({ high: null, low: null });
    // A peak an hour ago is where the river still is.
    expect(flowTrend(record([[72, 100], [2, 100], [1, 200], [0, 150]])).high).toBeNull();
    expect(flowTrend(record([[72, 100], [3, 100], [2, 200], [0, 150]])).high).toMatchObject({ v: 200, crest: true });
    // Up from a low.
    expect(flowTrend(record([[72, 80], [40, 40], [0, 60]]))).toMatchObject({ direction: 'rising', low: { t: NOW - 40 * HOUR, v: 40 } });
  });

  test('with too little record to compare there is no direction to give', () => {
    expect(flowTrend([])).toBeNull();
    expect(flowTrend(undefined)).toBeNull();
    expect(flowTrend([{ t: NOW, v: 100 }])).toBeNull();
    // Three hours of readings: nothing from six hours ago, let alone yesterday.
    expect(flowTrend(record([[3, 100], [0, 200]]))).toBeNull();
    // Eight hours: the six-hour change stands by itself.
    expect(flowTrend(record([[8, 100], [0, 200]]))).toMatchObject({ direction: 'rising', fast: true, daily: null, dayAgo: null });
    // A gauge that was down this morning: yesterday's reading is all there is to go on.
    const gap = [...record([[72, 100], [20, 100]]), { t: NOW, v: 150 }];
    expect(flowTrend(gap)).toMatchObject({ direction: 'rising', fast: false, recent: null, daily: expect.closeTo(0.5, 5) });
  });

  test('a river that was dry and isn\'t is rising', () => {
    expect(flowTrend(record([[72, 0], [6, 0], [0, 5]]))).toMatchObject({ direction: 'rising', recent: Infinity });
    expect(flowTrend(record([[72, 0], [0, 0]]))).toMatchObject({ direction: 'steady', daily: 0, recent: 0 });
  });
});

describe('saying it', () => {
  test('a change, in the words it would be told in', () => {
    expect([0.38, -0.22, 0.006, -0.006, 0.994].map(changeText)).toEqual(['up 38%', 'down 22%', 'up 1%', 'down 1%', 'up 99%']);
    expect([1.4, 1, 9.2, 0.995].map(changeText)).toEqual(['2.4 times what it was', '2 times what it was', '10 times what it was', '2 times what it was']);
    expect([0, 0.004, -0.004].map(changeText)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(changeText(Infinity)).toBe('up from nothing');
    expect([null, undefined, NaN].map(changeText)).toEqual(['', '', '']);
  });

  test('when something happened, on the viewer\'s own clock', () => {
    // A Saturday, at eight in the evening where the viewer is.
    const now = new Date(2026, 10, 28, 20, 0).getTime();
    const at = (date, hour, minute = 0) => whenText(new Date(2026, 10, date, hour, minute).getTime(), now);
    expect(at(28, 19, 40)).toBe('within the hour');
    expect(at(28, 19, 0)).toBe('an hour ago');
    expect(at(28, 15, 0)).toBe('5 hours ago');
    expect(at(28, 13, 0)).toBe('this afternoon');
    expect(at(28, 8, 0)).toBe('this morning');
    expect(at(28, 3, 0)).toBe('early this morning');
    expect(at(27, 22, 0)).toBe('last night');
    expect(at(27, 18, 0)).toBe('yesterday evening');
    expect(at(27, 15, 0)).toBe('yesterday afternoon');
    expect(at(27, 9, 0)).toBe('yesterday morning');
    expect(at(27, 2, 0)).toBe('early yesterday');
    expect(at(26, 21, 30)).toBe('on Thursday night');
    expect(at(26, 2, 0)).toBe('early on Thursday');
    expect(at(25, 10, 0)).toBe('on Wednesday morning');
    // Just after midnight, an evening is last night's and not today's.
    expect(whenText(new Date(2026, 10, 27, 17, 30).getTime(), new Date(2026, 10, 28, 0, 30).getTime())).toBe('yesterday evening');
  });

  test('the story behind a direction, where the record holds one', () => {
    const now = new Date(2026, 10, 28, 9, 0).getTime();
    const yesterdayMorning = new Date(2026, 10, 27, 8, 0).getTime();
    const thursdayNight = new Date(2026, 10, 26, 22, 0).getTime();
    expect(trendNote({ direction: 'dropping', high: { t: yesterdayMorning, v: 647.2, crest: true }, low: null }, now)).toBe('Peaked at 647 cfs yesterday morning.');
    expect(trendNote({ direction: 'steady', high: { t: thursdayNight, v: 1170, crest: true }, low: null }, now)).toBe('Peaked at 1,170 cfs on Thursday night.');
    expect(trendNote({ direction: 'dropping', high: { t: thursdayNight, v: 500, crest: false }, low: null }, now)).toBe('Down from 500 cfs on Thursday night.');
    expect(trendNote({ direction: 'rising', high: { t: thursdayNight, v: 500, crest: true }, low: { t: yesterdayMorning, v: 45 } }, now)).toBe('Up from 45.0 cfs yesterday morning.');
    // Nothing that stands out, nothing to tell.
    expect(trendNote({ direction: 'rising', high: null, low: null }, now)).toBe('');
    expect(trendNote({ direction: 'dropping', high: null, low: { t: yesterdayMorning, v: 45 } }, now)).toBe('');
    expect(trendNote(null, now)).toBe('');
  });
});

describe('water temperature, for trout', () => {
  test('the bands fisheries agencies give: cold, cool, right, warm, and too warm from 68', () => {
    expect([33, 39.9, 40, 49.9, 50, 59, 64.9, 65, 67.9, 68, 80].map(troutBand)).toEqual(['cold', 'cold', 'cool', 'cool', 'prime', 'prime', 'prime', 'warm', 'warm', 'hot', 'hot']);
    expect(TROUT_BANDS.map((band) => [band.key, band.below, band.label])).toEqual([['cold', 40, 'Cold'], ['cool', 50, 'Cool'], ['prime', 65, 'Prime'], ['warm', 68, 'Warm'], ['hot', Infinity, 'Too warm']]);
    expect(bandOf('warm').says).toBe('Warm for trout');
    expect(bandOf('tepid')).toBeNull();
    expect(troutBand(NaN)).toBeNull();
    expect(troutBand(undefined)).toBeNull();
  });

  test('a temperature is banded as it is shown, to a tenth of a degree', () => {
    // 67.96 is written "68.0", and a page that says 68.0 can't call it anything but too warm.
    expect(troutBand(67.96)).toBe('hot');
    expect(troutBand(67.94)).toBe('warm');
    expect(troutBand(49.96)).toBe('prime');
    expect(troutBand(39.94)).toBe('cold');
  });

  test('the coldest and the warmest of the day up to a reading', () => {
    const points = [[30, 70], [23, 61], [16, 69.4], [8, 62.5], [0, 64]].map(([ago, v]) => ({ t: NOW - ago * HOUR, v }));
    expect(dayRange(points, NOW)).toEqual({ low: 61, high: 69.4 });
    // The day before a reading from eight hours ago is another day.
    expect(dayRange(points, NOW - 8 * HOUR)).toEqual({ low: 61, high: 70 });
    expect(dayRange([{ t: NOW, v: 64 }], NOW)).toBeNull();
    expect(dayRange(undefined, NOW)).toBeNull();
  });
});

describe('one gauge, read', () => {
  const rainRecord = () => ({ flow: record([[72, 50], [30, 50], [20, 500], [6, 340], [0, 229]]), temp: [[30, 47], [20, 44.1], [10, 46.4], [0, 45.2]].map(([ago, v]) => ({ t: NOW - ago * HOUR, v })) });

  test('everything the page says about a gauge comes from its record and the day\'s normals', () => {
    const read = readGauge({ record: rainRecord(), normalsForDay: DAY_LINES, now: NOW });
    expect(read.flow).toEqual({ t: NOW, v: 229 });
    expect(read.temp).toEqual({ t: NOW, v: 45.2 });
    expect(read.level).toBe('very-high');
    expect(read.ratio).toBeCloseTo(2.694, 3);
    expect(read.normal).toEqual({ median: 85, low: 60, high: 120 });
    expect(read.trend).toMatchObject({ direction: 'dropping', fast: true, high: { v: 500, crest: true } });
    expect(read.band).toBe('cool');
    expect(read.tempDay).toEqual({ low: 44.1, high: 46.4 });
    expect(readTitle(read)).toBe('Very high and dropping fast');
  });

  test('a gauge whose newest reading is more than a day old is not reporting, each measurement on its own clock', () => {
    const quiet = { flow: record([[72, 50], [25, 60]]).map((point) => ({ ...point, t: point.t - 25 * HOUR })), temp: [{ t: NOW - HOUR, v: 45 }, { t: NOW, v: 45.2 }] };
    const read = readGauge({ record: quiet, normalsForDay: DAY_LINES, now: NOW });
    expect(read).toMatchObject({ flow: null, level: null, ratio: null, trend: null, band: 'cool' });
    expect(readTitle(read)).toBe('Not reporting');
    // Twenty-four hours to the minute is still reporting.
    expect(readGauge({ record: { flow: [{ t: NOW - 24 * HOUR, v: 60 }] }, normalsForDay: DAY_LINES, now: NOW }).flow).toEqual({ t: NOW - 24 * HOUR, v: 60 });
    expect(readGauge({ record: { flow: [{ t: NOW - 24 * HOUR - 60000, v: 60 }] }, normalsForDay: DAY_LINES, now: NOW }).flow).toBeNull();
  });

  test('a gauge with no thermometer, no long-run record, or nothing at all is read as far as it goes', () => {
    const flowOnly = readGauge({ record: { flow: record([[72, 100], [0, 100]]) }, normalsForDay: DAY_LINES, now: NOW });
    expect(flowOnly).toMatchObject({ level: 'normal', temp: null, band: null, tempDay: null });
    expect(readTitle(flowOnly)).toBe('Normal and steady');
    const unrated = readGauge({ record: { flow: record([[72, 100], [24, 100], [0, 130]]) }, normalsForDay: undefined, now: NOW });
    expect(unrated).toMatchObject({ level: null, ratio: null, normal: null, trend: { direction: 'rising' } });
    expect(readTitle(unrated)).toBe('Rising');
    expect(readTitle(readGauge({ record: { flow: [{ t: NOW, v: 100 }] }, normalsForDay: DAY_LINES, now: NOW }))).toBe('Normal');
    expect(readTitle(readGauge({ record: { flow: [{ t: NOW, v: 100 }] }, normalsForDay: undefined, now: NOW }))).toBe('Reporting');
    expect(readGauge({ record: undefined, normalsForDay: DAY_LINES, now: NOW })).toMatchObject({ flow: null, temp: null, level: null, trend: null, band: null });
    expect(readTitle(null)).toBe('Not reporting');
  });
});

describe('how to fish it', () => {
  const flowing = (level, trend = null, more = {}) => ({ flow: { t: NOW, v: 100 }, level, trend, temp: null, band: null, tempDay: null, ...more });
  const said = (read) => fishingNotes(read).map((note) => note.text);
  const going = (direction, fast = false) => ({ direction, fast });

  test('each level has its own advice, from the common ground of what guides say about it', () => {
    expect(said(flowing('very-low'))[0]).toMatch(/^Very low, and almost certainly clear\..*stay back, keep low, and go finer and smaller.*deep pools/);
    expect(said(flowing('low'))[0]).toMatch(/^Low and probably clear\..*a finer line and a smaller fly or lure.*deeper runs and pools/);
    expect(said(flowing('normal'))).toEqual(['About its usual flow for the date: fish it the way you normally would.']);
    expect(said(flowing('high'))[0]).toMatch(/^More push than usual\..*soft edges, seams and eddies near the bank.*more weight and heavier line/);
    expect(said(flowing('very-high'))[0]).toMatch(/^A lot more water than is usual.*from the bank if at all.*Smaller streams drop and clear first\.$/);
    // Said for whatever somebody fishes with: a fly rod is mentioned once, in brackets.
    for (const level of ['very-low', 'low', 'normal', 'high', 'very-high']) expect(said(flowing(level))[0]).not.toMatch(/nymph|streamer|leader/i);
  });

  test('which way it is going adds a line where that changes anything', () => {
    expect(said(flowing('high', going('rising')))[1]).toBe('Still coming up: expect more push and more colour in a few hours than there is now.');
    expect(said(flowing('normal', going('rising')))[1]).toMatch(/^Still coming up/);
    expect(said(flowing('low', going('rising')))[1]).toBe('Coming up, which it needs.');
    // A fast rise is a warning at any level.
    for (const level of ['very-low', 'normal', 'very-high']) expect(said(flowing(level, going('rising', true)))[1]).toMatch(/^Rising fast\. It can be a different river in an hour: stay close to the bank/);
    expect(said(flowing('high', going('dropping')))[1]).toBe('On its way down, and it should clear as it drops: watch for the colour to go.');
    expect(said(flowing('very-high', going('dropping', true)))[1]).toMatch(/^On its way down/);
    expect(said(flowing('very-low', going('dropping')))[1]).toBe('And still dropping.');
    // Dropping at its usual flow, or steady at any, needs nothing said.
    expect(said(flowing('normal', going('dropping')))).toHaveLength(1);
    expect(said(flowing('high', going('steady')))).toHaveLength(1);
  });

  test('water temperature says how the trout will be, with the figure it is going by', () => {
    const water = (degrees, tempDay = null) => said(flowing('normal', null, { temp: { t: NOW, v: degrees }, band: troutBand(degrees), tempDay })).pop();
    const F = ' °F';
    expect(water(38.2)).toBe(`Water is cold (38.2${F}). Trout hold deep and won't move far to feed: fish slow and near the bottom. The afternoon is usually the best of it.`);
    expect(water(46.4)).toBe(`Water is cool (46.4${F}). Trout feed but won't chase: slow everything down. Late morning through the afternoon is usually best.`);
    expect(water(56.1)).toBe(`Water is right where trout like it (56.1${F}): they should be active through the day.`);
    expect(water(62.3)).toBe(`Water is at the warm end of what trout like (62.3${F}): early and late in the day are best.`);
    expect(water(66.2)).toBe(`Water is warm for trout (66.2${F}). Fish the morning, play fish quickly and keep them in the water.`);
    expect(water(71.6)).toBe(`Water is too warm for trout (71.6${F}). A fish played now may not recover: leave them be and fish for something else.`);
  });

  test('yesterday afternoon\'s high says what this afternoon will do', () => {
    const water = (degrees, high) => said(flowing('normal', null, { temp: { t: NOW, v: degrees }, band: troutBand(degrees), tempDay: { low: degrees - 3, high } })).pop();
    expect(water(64, 69.4)).toMatch(/early and late in the day are best\. It reached 69\.4 °F in the last day: mornings only\.$/);
    expect(water(66, 70)).toMatch(/keep them in the water\. It reached 70\.0 °F in the last day: mornings only\.$/);
    expect(water(58, 66.1)).toMatch(/active through the day\. It got to 66\.1 °F in the last day, so the morning is the time\.$/);
    // Nothing to add where the day stayed in the band it is in, or is already too warm.
    expect(water(58, 61)).toMatch(/active through the day\.$/);
    expect(water(66, 67)).toMatch(/keep them in the water\.$/);
    expect(water(70, 74)).toMatch(/fish for something else\.$/);
  });

  test('the notes come in one order — the water, its direction, its temperature — and only for a gauge that is reporting', () => {
    const read = flowing('high', going('dropping'), { temp: { t: NOW, v: 46.4 }, band: 'cool' });
    expect(fishingNotes(read).map((note) => note.key)).toEqual(['flow', 'trend', 'water']);
    // No long-run normal: nothing to say about the level, the rest still stands.
    expect(fishingNotes(flowing(null, going('rising'), { temp: { t: NOW, v: 46.4 }, band: 'cool' })).map((note) => note.key)).toEqual(['trend', 'water']);
    expect(fishingNotes({ flow: null, level: null, trend: null, temp: { t: NOW, v: 46 }, band: 'cool' })).toEqual([]);
    expect(fishingNotes(null)).toEqual([]);
  });
});

describe('the whole board', () => {
  const read = (level, direction, reporting = true) => ({ flow: reporting ? { t: NOW, v: 1 } : null, level, trend: direction ? { direction, fast: false } : null });
  const board = (...reads) => tally(reads);

  test('is counted: how many are reporting, how each is running, and which way they are going', () => {
    const counts = board(read('high', 'dropping'), read('high', 'steady'), read('very-high', 'rising'), read('normal', 'dropping'), read(null, 'rising'), read('low', null), read(null, null, false), null);
    expect(counts).toEqual({ gauges: 8, reporting: 6, rated: 5, levels: { 'very-low': 0, low: 1, normal: 1, high: 2, 'very-high': 1 }, trended: 5, rising: 2, dropping: 2 });
    expect(tally([])).toMatchObject({ gauges: 0, reporting: 0, rated: 0 });
  });

  test('what "normal" is normal for is the time of year', () => {
    expect(['2026-11-28', '2026-06-15', '2026-04-03', '2026-02-10', '2026-02-11', '2026-12-21'].map(timeOfYear)).toEqual(['late November', 'mid-June', 'early April', 'early February', 'mid-February', 'late December']);
    expect(timeOfYear('')).toBe('today');
    expect(timeOfYear(undefined)).toBe('today');
  });

  const many = (count, level, direction) => Array.from({ length: count }, () => read(level, direction));
  const say = (reads, more = {}) => headline(tally(reads), { where: 'New Jersey', day: '2026-11-28', ...more });

  test('the sentence at the top says how the rivers are running for the time of year, and which way', () => {
    expect(say([...many(18, 'high', 'dropping'), ...many(3, 'very-high', 'dropping'), ...many(5, 'very-high', 'rising'), ...many(3, 'high', 'steady'), ...many(3, 'normal', 'steady')], { inShape: ['Delaware River', 'McDonalds Branch'] }))
      .toBe('Running high for late November and mostly dropping; 5 gauges are still rising. In the usual range: Delaware River and McDonalds Branch.');
    expect(say([...many(20, 'normal', 'steady'), ...many(4, 'high', 'steady')])).toBe('Near normal for late November and holding steady.');
    expect(say([...many(9, 'low', 'dropping'), ...many(2, 'very-low', 'dropping'), read('normal', 'dropping')], { day: '2026-08-25' })).toBe('Running low for late August and dropping.');
    expect(say([...many(7, 'high', 'rising'), ...many(2, 'very-high', 'rising'), read('very-high', 'dropping')])).toBe('Running high for late November and mostly rising; 1 gauge is dropping.');
    expect(say([...many(6, 'normal', 'rising'), ...many(6, 'normal', 'dropping')])).toBe('Near normal for late November: 6 gauges are rising and 6 dropping.');
    expect(say([...many(8, 'normal', 'steady'), ...many(2, 'normal', 'rising')])).toBe('Near normal for late November; 2 gauges are rising.');
    expect(say([...many(9, 'normal', 'steady'), read('normal', 'dropping')])).toBe('Near normal for late November; 1 gauge is dropping.');
  });

  test('rivers that are neither one thing nor the other are said to be so, and the ones in shape are named when they are few', () => {
    const mixed = [...many(4, 'normal', 'steady'), ...many(4, 'high', 'steady'), ...many(4, 'low', 'steady')];
    expect(say(mixed, { inShape: ['Flat Brook', 'Pequest River', 'Paulins Kill'], day: '2026-04-03' })).toBe('A mixed picture for early April and holding steady. In the usual range: Flat Brook, Pequest River and Paulins Kill.');
    // Too many to name, or none: nothing is named.
    expect(say(mixed, { inShape: ['A', 'B', 'C', 'D', 'E'] })).toBe('A mixed picture for late November and holding steady.');
    expect(say(mixed)).toBe('A mixed picture for late November and holding steady.');
    // When most are in shape there is no exception to name.
    expect(say(many(10, 'normal', 'steady'), { inShape: ['Flat Brook'] })).toBe('Near normal for late November and holding steady.');
    expect(say([...many(9, 'high', 'steady'), read('normal', 'steady')], { inShape: ['Flat Brook'] })).toBe('Running high for late November and holding steady. In the usual range: Flat Brook.');
  });

  test('gauges with no direction yet, no long-run record, or nothing to say are spoken for', () => {
    // Levels in, the three days' record not: no word on direction rather than a wrong one.
    expect(say(many(5, 'high', null))).toBe('Running high for late November.');
    expect(say([read(null, 'steady'), read(null, 'rising')])).toBe('2 gauges reporting. USGS has no long-run record to say what is normal for them today.');
    expect(say([read(null, 'steady')])).toBe('1 gauge reporting. USGS has no long-run record to say what is normal for it today.');
    expect(say([read('high', 'steady', false), read(null, null, false)])).toBe('No gauge in New Jersey is reporting right now.');
    expect(say([])).toBe('No gauge in New Jersey is reporting right now.');
  });

  test('the average water temperature gets a few words on what it means for trout', () => {
    const average = (mean, high = mean) => ({ mean, gauges: 3, low: mean - 2, high });
    expect(waterNote(average(38))).toBe('Cold for trout: fish slow and deep, and expect the afternoon to be best.');
    expect(waterNote(average(48.7, 51.4))).toBe('Cool for trout: they feed, but slowly.');
    expect(waterNote(average(58))).toBe('Right where trout like it.');
    expect(waterNote(average(66))).toBe('Warm for trout: fish the morning and handle them gently.');
    expect(waterNote(average(71))).toBe('Too warm for trout.');
    // An average hides the warmest river, and that is the one somebody will kill a fish in.
    expect(waterNote(average(63, 69))).toBe('Right where trout like it. The warmest of them is too warm.');
    expect(waterNote(average(66, 70))).toBe('Warm for trout: fish the morning and handle them gently. The warmest of them is too warm.');
    expect(waterNote(null)).toBe('');
  });
});
