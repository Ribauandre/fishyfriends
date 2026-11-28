import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import GaugeChart from './components/GaugeChart';
import {
  FRESH_FOR_MINUTES, METRICS, PERIODS, RECENT_HOURS, REPORTING_WITHIN_HOURS, US_STATES, USGS_API, averageTemperature, dayOf, dayOfYear, dayToMs,
  fetchContinuous, fetchDaily, fetchMeasured, fetchNormals, formatReading, gaugeLink, groupByRiver, localDay, newestOf, normalSeries, overlayLastYear,
  periodRange, readingAge, riverGroupKey, riverKey, searchGauges, seriesOf, stateName, temperatureText, yearBefore, yearBeforeMs,
} from './utils/riverGauges';
import { LEVELS, bandOf, changeText, fishingNotes, headline, levelOf, readGauge, readTitle, tally, timesNormalText, trendLabel, trendNote, waterNote } from './utils/riverRead';

// River gauges (Plan > Gauges): which of the club's rivers to fish for trout today, and how.
//
// Two pages in one component. /gauges is the list: a sentence on how the rivers are running,
// the average water temperature, and a row a gauge that says four things — which river, how
// it is running against normal for the date and which way it is going, its flow, and its
// water temperature where the gauge measures it. /gauges/<station number> is one river: the
// read in a few words, the numbers behind it, how to fish it, and the chart. A row is the way
// in and "All rivers" the way back, as with a trip or a tournament, and the two pages share
// everything that was read, so going in and coming back asks USGS for nothing.
//
// (It was a board first: every row also carried a scale, a ratio and a little three-day line,
// five count boxes and a key sat over it, and a river opened in place, pushing the rest of the
// list a screen or two down. The owner found that cluttered and hard to get around.)
//
// The list of gauges is the club's (the river_gauges table: any member adds one). Every
// reading comes from USGS when the page is opened — nothing is stored — a whole state at a
// time: the last three days of flow and water temperature in one request, flow's normals
// for those days in another (kept on the device for a month, so a return visit asks one
// question, not two). utils/riverGauges.js says why the count matters. That record is the
// list, the trend and the three-day chart, so opening a river asks for nothing; a longer
// stretch is asked for when it is picked. Everything is read again by itself once it is
// fifteen minutes old. utils/riverRead.js turns the numbers into words.
//
// What a viewer picked (state, how far back the charts go, log or straight axis) is kept on
// the device and nowhere else: it is how they like to look at it, not club data.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FRESH_FOR_MS = FRESH_FOR_MINUTES * 60 * 1000;
// The record is kept at a reading every fifteen minutes, which is how most gauges report; a
// few report every five.
const RECORD_EVERY = 15 * 60 * 1000;
const VIEW_KEY = 'fishyfriends:gauges-view';
// What a view kept before version 2 asked the charts for a month of daily means; since then
// they open on the three days the list is already read from.
const VIEW_VERSION = 2;
const DEFAULT_VIEW = { state: '', period: '3d', scale: 'log' };
// How many days of normals past today the page asks for when it has to ask at all.
const NORMALS_AHEAD_DAYS = 14;

function savedView() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_VIEW;
    const current = saved.version === VIEW_VERSION;
    return {
      state: typeof saved.state === 'string' ? saved.state : '',
      // A custom range is for one look at one stretch; the next visit starts from three days.
      period: current && PERIODS.some((period) => period.key === saved.period && period.key !== 'custom') ? saved.period : '3d',
      scale: saved.scale === 'linear' ? 'linear' : 'log',
    };
  } catch (problem) {
    return DEFAULT_VIEW;
  }
}

function keepView(view) {
  try { window.localStorage.setItem(VIEW_KEY, JSON.stringify({ version: VIEW_VERSION, state: view.state, period: view.period, scale: view.scale })); } catch (problem) { /* not kept, then */ }
}

const normalsStorage = () => { try { return window.localStorage; } catch (problem) { return undefined; } };

// A day either side of a stretch, for its normals: they are daily values drawn at the middle
// of each day, and without the neighbours the band would stop short of a three-day chart's
// edges. `today` is the viewer's own date, which west of Greenwich in the evening is not the
// last date of the stretch.
function withNeighbours(range, today) {
  const before = dayOf(dayToMs(range.startDay) - DAY);
  const after = dayOf(dayToMs(range.endDay) + DAY);
  return { startDay: before < today ? before : today, endDay: after > today ? after : today };
}

const capital = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : '');
const riverPath = (site) => `/gauges/${encodeURIComponent(site)}`;
const rowId = (site) => `gauge-row-${site}`;
// A plain click, which the page may answer itself; anything else (a new tab, a new window) is
// the browser's.
const plainClick = (event) => !event.defaultPrevented && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

function Segmented({ label, name, value, options, onChange }) {
  return <div className={`segmented is-${name}`} role="group" aria-label={label}>
    {options.map((option) => <button key={option.key} type="button" className={option.key === value ? 'segment is-active' : 'segment'} aria-pressed={option.key === value} onClick={() => onChange(option.key)}>{option.label}</button>)}
  </div>;
}

// How a river is running is said with a shape and a word, never by colour alone — and not in
// the chart's own colours, which already mean something.
function LevelMark({ level }) {
  const known = levelOf(level);
  return <span className={`level-mark is-${level}`}><i aria-hidden="true">{known.shape}</i>{known.label}</span>;
}

// One gauge's row in the list: which river (and where on it), how it is running and which
// way it is going, its flow, and its water temperature if the gauge measures it. The whole
// row is the way into that river's page.
function RiverRow({ gauge, read, head, shared, onOpen }) {
  const site = gauge.site_no;
  const heard = head.heard.has(site);
  const flowing = heard && Boolean(read.flow);
  const trend = flowing ? trendLabel(read.trend) : '';
  let status;
  if (!heard) status = <span className="river-row-quiet">{head.lost ? 'No answer from USGS' : '…'}</span>;
  else if (!flowing) status = <span className="river-row-quiet">Not reporting</span>;
  else if (read.level) {
    status = <><LevelMark level={read.level} />{trend && <><i aria-hidden="true"> · </i><span className={read.trend.direction === 'rising' && read.trend.fast ? 'river-row-trend is-fast' : 'river-row-trend'}>{trend}</span></>}</>;
  } else {
    // Nothing to call it high or low against: which way it is going can still be said.
    const why = head.blind ? '' : head.rated.has(site) ? 'no long-run normal' : '…';
    status = <><span className="river-row-trend is-first">{capital(trend) || 'Reporting'}</span>{why && <><i aria-hidden="true"> · </i><span className="river-row-quiet">{why}</span></>}</>;
  }
  const warm = flowing && (read.band === 'warm' || read.band === 'hot');
  return <li>
    <Link id={rowId(site)} className="river-row" to={riverPath(site)} state={{ fromList: true }} onClick={onOpen}>
      {/* (Where the gauge is always belongs to the row; on a narrow screen it is only shown where a river has more than one.) */}
      <span className="river-row-name">{gauge.river}{gauge.place && <> <small className={shared ? 'is-needed' : undefined}>{gauge.place}</small></>}</span>
      <span className="river-row-status">{status}</span>
      {/* (Two columns where there is room for columns; on a narrow screen, one small block at the row's top right, the water under the flow.) */}
      <span className="river-row-numbers">
        <span className="river-row-flow">{!heard ? '' : flowing ? <><strong>{formatReading(read.flow.v, METRICS.flow)}</strong> cfs</> : '—'}</span>
        <span className={warm ? 'river-row-temp is-warm' : 'river-row-temp'}>{heard && read.temp ? <>{formatReading(read.temp.v, METRICS.temp)}&nbsp;°F{warm && <i> {bandOf(read.band).label.toLowerCase()}</i>}</> : ''}</span>
      </span>
      <span className="river-row-go" aria-hidden="true">›</span>
    </Link>
  </li>;
}

// A way of seeing just the gauges running one way, with how many there are of each, in the
// rows' own words. Only the ways some gauge is running are offered, and nothing at all when
// they are all running the same.
function LevelFilter({ counts, only, onPick }) {
  const running = LEVELS.filter((level) => counts.levels[level.key] > 0);
  if (running.length < 2) return null;
  return <div className="level-filter" role="group" aria-label="Which gauges to show">
    <button type="button" className={only ? 'level-chip' : 'level-chip is-active'} aria-pressed={!only} onClick={() => onPick(null)}>All <span>{counts.gauges}</span></button>
    {running.map((level) => <button key={level.key} type="button" className={only === level.key ? 'level-chip is-active' : 'level-chip'} aria-pressed={only === level.key} onClick={() => onPick(only === level.key ? null : level.key)}>{level.label} <span>{counts.levels[level.key]}</span></button>)}
  </div>;
}

// The numbers behind a read, a line each: what it is flowing and what that is against normal,
// what normal is, how far it has moved, and how warm the water is. Each figure is followed by
// what gives it meaning, as a piece of its own that goes to the next line whole where a
// phone hasn't room for both. How far it has moved is said for the last six hours, because
// that is the direction it is going now: a river that came up overnight and is on its way
// down is "up" on yesterday.
function Facts({ read, unrated }) {
  const { flow, temp, normal, trend } = read;
  const lately = Boolean(trend) && trend.recent !== null;
  const number = (value) => formatReading(value, METRICS.flow);
  return <dl className="gauge-facts">
    <div>
      <dt>Flow now</dt>
      <dd><strong>{number(flow.v)}</strong> cfs{read.ratio !== null && <> <span>{timesNormalText(read.ratio)}</span></>}</dd>
    </div>
    <div>
      <dt>Normal today</dt>
      <dd>{normal ? <><strong>{number(normal.median)}</strong> cfs <span>usually {number(normal.low)} to {number(normal.high)}</span></> : <span>{unrated}</span>}</dd>
    </div>
    {trend && <div>
      <dt>{lately ? 'Last 6 hours' : 'Since yesterday'}</dt>
      <dd><strong>{capital(changeText(lately ? trend.recent : trend.daily))}</strong></dd>
    </div>}
    {temp && <div>
      <dt>Water</dt>
      <dd><strong>{formatReading(temp.v, METRICS.temp)}</strong> °F <span>{bandOf(read.band).says.toLowerCase()}</span></dd>
    </div>}
  </dl>;
}

// What the chart shows: flow or water temperature, where the gauge has a thermometer, and
// how far back. One setting for every river, not one a river: pick a month here and the next
// river opened shows a month. It says what was asked for the moment it is asked, while the
// chart under it is still the one before.
function ChartControls({ view, shown, hasTemp, range, custom, today, onChange, onReading, onCustom }) {
  return <div className="chart-controls">
    {hasTemp ? <div className="chart-tabs" role="group" aria-label="What is charted">
      {[['flow', 'Flow'], ['temp', 'Water temp']].map(([key, label]) => <button key={key} type="button" className={key === shown ? 'chart-tab is-active' : 'chart-tab'} aria-pressed={key === shown} onClick={() => onReading(key)}>{label}</button>)}
    </div> : <p className="chart-tabs"><span className="chart-tab is-active">Flow</span></p>}
    <Segmented label="How far back" name="period" value={view.period} onChange={(key) => onChange({ period: key })} options={PERIODS.map((period) => ({ key: period.key, label: period.label }))} />
    {view.period === 'custom' && <div className="gauge-custom">
      <label>From<input type="date" value={custom.start} max={custom.end || today} onChange={(event) => onCustom({ ...custom, start: event.target.value })} /></label>
      <label>To<input type="date" value={custom.end} min={custom.start || undefined} max={today} onChange={(event) => onCustom({ ...custom, end: event.target.value })} /></label>
      {range.error && <p className="field-hint" role="status">{range.error}</p>}
    </div>}
  </div>;
}

// The line a trout angler would want ruled across a temperature chart.
const TOO_WARM = { value: 68, label: '68 °F: too warm for trout' };

// One river's page: the read in a few words and the story behind it, the numbers, how to
// fish it, and the chart.
function RiverView({ gauge, siblings, read, heard, lost, unrated, problem, frame, stale, waiting, metric, hasTemp, view, range, custom, today, now, busy, canRemove, linkState, headingRef, onBack, onChange, onReading, onCustom, onRefresh, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [refused, setRefused] = useState('');
  const site = gauge.site_no;
  // The chart shows what the picture on screen holds, which while a new view is being read is
  // still the old one — unless that is the water temperature of a river with no thermometer.
  const ready = Boolean(frame && frame.sites.has(site)) && (frame.metricKey === metric.key || hasTemp);
  const charted = METRICS[ready ? frame.metricKey : metric.key];

  const series = useMemo(() => {
    if (!ready) return null;
    let points = frame.data.now.get(site) || [];
    const newest = frame.data.latest.get(site);
    // Daily means stop at yesterday: the line is carried on to the newest reading.
    if (newest && frame.range.live && (points.length === 0 || newest.t > points[points.length - 1].t)) points = [...points, newest];
    const around = withNeighbours(frame.range, frame.range.endDay);
    return { now: points, last: overlayLastYear(frame.data.last.get(site) || []), normal: normalSeries(frame.data.normals.get(site), around.startDay, around.endDay) };
  }, [ready, frame, site]);
  const nothing = ready && series.now.length === 0 && series.last.length === 0;
  const measured = Boolean(frame) && (frame.period === '3d' || frame.period === '7d');
  const notes = heard ? fishingNotes(read) : [];
  const story = heard && read.flow ? trendNote(read.trend, now) : '';
  const name = `${gauge.river} ${gauge.place}`.trim();

  async function remove() {
    setRemoving(true);
    setRefused('');
    const result = await onRemove(gauge);
    // (Removed, the page is gone with it and there is nothing left here to set.)
    if (result?.error) { setRemoving(false); setConfirming(false); setRefused(result.error.message); }
  }

  const back = <Link className="text-link gauge-back" to="/gauges" onClick={onBack}>← All rivers</Link>;

  return <>
    {back}
    <div className="page-intro gauge-intro">
      <div>
        <span className="eyebrow">{(gauge.place || 'River gauge').toUpperCase()}</span>
        <h1 ref={headingRef} tabIndex={-1}>{gauge.river}</h1>
        <p><a href={gaugeLink(site)} target="_blank" rel="noopener noreferrer">USGS {site}</a>{heard && read.flow ? ` · read ${readingAge(read.flow.t, now)}` : ''}</p>
        {siblings.length > 0 && <p className="gauge-siblings">Also on this river: {siblings.map((other, index) => <React.Fragment key={other.id}>{index > 0 && ', '}<Link to={riverPath(other.site_no)} replace state={linkState}>{other.place || `USGS ${other.site_no}`}</Link></React.Fragment>)}</p>}
      </div>
    </div>

    {problem && <p className="form-error gauge-problem" role="alert">{problem}</p>}

    <div className="gauge-view">
      <section className="gauge-read" aria-label="How it is running">
        {!heard && <h2 className="gauge-verdict is-quiet">{lost ? 'No answer from USGS' : 'Reading the gauge...'}</h2>}
        {heard && <h2 className={read.flow ? 'gauge-verdict' : 'gauge-verdict is-quiet'}>{read.flow && read.level && <i className={`is-${read.level}`} aria-hidden="true">{levelOf(read.level).shape}</i>}{readTitle(read)}</h2>}
        {story && <p className="gauge-story">{story}</p>}
        {heard && !read.flow && <p className="gauge-story">Nothing from this gauge in the last {REPORTING_WITHIN_HOURS} hours.</p>}
        {heard && read.flow && <Facts read={read} unrated={unrated} />}
        {notes.length > 0 && <div className="gauge-notes">
          <h2>How to fish it</h2>
          <ul>{notes.map((note) => <li key={note.key}>{note.text}</li>)}</ul>
          <p className="gauge-notes-caveat">Read off the gauge, which can't see the water: look before you wade.</p>
        </div>}
      </section>

      <section className={stale && ready ? 'gauge-chart-card is-stale' : 'gauge-chart-card'} aria-label="Chart" aria-busy={!ready || stale || undefined}>
        <ChartControls view={view} shown={metric.key} hasTemp={hasTemp} range={range} custom={custom} today={today} onChange={onChange} onReading={onReading} onCustom={onCustom} />
        {!ready && <p className="month-empty gauge-note is-waiting" role="status">{waiting}</p>}
        {nothing && <p className="month-empty gauge-note">{charted.key === 'temp' ? 'This gauge doesn\'t measure water temperature.' : 'Nothing from this gauge for this stretch.'}</p>}
        {ready && !nothing && <GaugeChart title={`${name}, ${charted.name}`} unit={charted.unit} scale={charted.key === 'flow' ? view.scale : 'linear'} floor={charted.key === 'flow' ? 0 : undefined} startMs={frame.range.startMs} endMs={frame.range.endMs} now={series.now} last={series.last} normal={series.normal} lines={frame.period === '3d' ? ['now', 'normal'] : undefined} mark={charted.key === 'temp' ? TOO_WARM : null} hourly={measured} format={(value) => formatReading(value, charted)} />}
        {/* A log axis is for flow: a doubling looks the same on a brook and a river. A temperature has no use for one. */}
        {charted.key === 'flow' && <div className="chart-axis" role="group" aria-label="Axis">
          <span aria-hidden="true">Axis</span>
          {[['log', 'Log'], ['linear', 'Linear']].map(([key, label]) => <button key={key} type="button" aria-pressed={view.scale === key} onClick={() => onChange({ scale: key })}>{label}</button>)}
        </div>}
      </section>
    </div>

    <footer className="gauge-view-foot">
      {back}
      <span className="gauge-view-foot-note">
        {gauge.added_by_name && <span>Added by {gauge.added_by_name}</span>}
        {canRemove && !confirming && <button type="button" className="text-link" onClick={() => setConfirming(true)}>Remove</button>}
        {canRemove && confirming && <span className="gauge-remove-confirm">Remove it for the whole club? <button type="button" className="text-link" disabled={removing} onClick={remove}>{removing ? 'Removing...' : 'Yes, remove'}</button> <button type="button" className="text-link" disabled={removing} onClick={() => setConfirming(false)}>Keep it</button></span>}
        <button type="button" className="text-link gauge-refresh" disabled={busy} onClick={onRefresh}>{busy ? 'Reading...' : 'Refresh'}</button>
      </span>
      {refused && <p className="form-error gauge-refused" role="alert">{refused}</p>}
    </footer>
  </>;
}

function AddGauge({ defaultState, taken, rivers, onAdded }) {
  const { addRiverGauge } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(defaultState || 'NJ');
  const [term, setTerm] = useState('');
  const [phase, setPhase] = useState('idle');
  const [found, setFound] = useState(null);
  const [draft, setDraft] = useState(null);
  const [problem, setProblem] = useState('');

  useEffect(() => { if (defaultState) setState(defaultState); }, [defaultState]);

  async function search(event) {
    event.preventDefault();
    setProblem(''); setFound(null); setDraft(null); setPhase('searching');
    try {
      setFound(await searchGauges({ state, term }));
    } catch (error) {
      setProblem(error.message);
    }
    setPhase('idle');
  }

  // A gauge on a river the club already watches goes under that river's name as the club
  // wrote it, so the two sit together in the list.
  function pick(gauge) {
    setProblem('');
    const where = gauge.state || state;
    setDraft({ ...gauge, state: where, river: rivers.get(`${where}|${riverKey(gauge.river)}`) || gauge.river });
  }

  async function save(event) {
    event.preventDefault();
    setProblem(''); setPhase('saving');
    const result = await addRiverGauge({ siteNo: draft.siteNo, river: draft.river, place: draft.place, state: draft.state });
    setPhase('idle');
    if (result.error) { setProblem(result.error.message); return; }
    setDraft(null); setFound(null); setTerm('');
    onAdded(result.gauge);
  }

  if (!open) return <div className="gauge-add-closed"><button className="button button-quiet" type="button" onClick={() => setOpen(true)}>Add a gauge <span>＋</span></button></div>;

  return <section className="table-card gauge-add" aria-label="Add a gauge">
    <div className="section-heading"><div><span className="eyebrow">FOR THE WHOLE CLUB</span><h2>Add a gauge</h2></div><button className="modal-close" type="button" onClick={() => setOpen(false)} aria-label="Close add a gauge">×</button></div>
    <p className="month-empty">Any USGS stream gauge that is measuring flow right now. Search by the river's name, or paste a station number.</p>
    <form className="gauge-add-form" onSubmit={search}>
      <label>State<select value={state} onChange={(event) => setState(event.target.value)}>{US_STATES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>River or station number<input value={term} maxLength={60} onChange={(event) => setTerm(event.target.value)} placeholder="Pequest, or 01445500" /></label>
      <button className="button button-primary" type="submit" disabled={phase !== 'idle' || term.trim().length < 3}>{phase === 'searching' ? 'Searching...' : 'Search'} <span>→</span></button>
    </form>
    {found && found.length === 0 && <p className="month-empty" role="status">No gauge by that name is measuring flow in {stateName(state)} right now. USGS writes names its own way: try one word of the river's name.</p>}
    {found && found.length > 0 && <ul className="gauge-found" aria-label="Gauges found">
      {found.map((gauge) => {
        const listed = taken.has(gauge.siteNo);
        return <li key={gauge.siteNo}>
          <div><strong>{gauge.river}</strong><span>{gauge.place}{gauge.place ? ' · ' : ''}USGS {gauge.siteNo} · {formatReading(gauge.flow, METRICS.flow)} cfs now</span></div>
          {listed ? <span className="gauge-found-listed">On the list</span> : <button type="button" className="button button-quiet" onClick={() => pick(gauge)}>Add</button>}
        </li>;
      })}
    </ul>}
    {draft && <form className="gauge-add-draft" onSubmit={save}>
      <p className="month-empty">What the club will see for USGS {draft.siteNo}. Gauges with the same river name sit together in the list; change the wording if the survey's is clumsy.</p>
      <label>River<input required value={draft.river} maxLength={80} onChange={(event) => setDraft({ ...draft, river: event.target.value })} /></label>
      <label>Where on it<input value={draft.place} maxLength={120} onChange={(event) => setDraft({ ...draft, place: event.target.value })} placeholder="near High Bridge" /></label>
      <div className="form-actions gauge-add-actions">
        <button className="button button-primary" type="submit" disabled={phase !== 'idle'}>{phase === 'saving' ? 'Adding...' : 'Add to the club\'s list'} <span>＋</span></button>
        <button className="button button-quiet" type="button" disabled={phase !== 'idle'} onClick={() => setDraft(null)}>Never mind</button>
      </div>
    </form>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </section>;
}

// What both pages are made of: the last three days of every gauge's flow and water
// temperature as measured (`record`), and flow's normals for those days. `heard` and `rated`
// are the gauges each answer has come in for, so a gauge that isn't reporting can be told from
// one that hasn't been asked about yet. `at` is when the readings on screen were read, `turn`
// which reading of them that was.
const NO_HEAD = { record: new Map(), normals: new Map(), heard: new Set(), rated: new Set(), lost: false, blind: false, at: 0, turn: -1 };
// Everything a gauge measures that the page uses, asked for in one question.
const MEASURED = [METRICS.flow, METRICS.temp];
const NOTHING = { got: Promise.resolve(new Map()), sofar: () => new Map() };

// Where the numbers come from, in the words the owner's own dashboard used for them, and
// where the words about them come from. Closed, it says who the readings are from and when
// they will be read again.
const SOURCES = [
  { name: `USGS readings, last ${RECENT_HOURS / 24} days`, what: `Each gauge's flow and water temperature as measured, every fifteen minutes or so. The newest of them is what the gauge is doing now; a gauge with nothing from the last ${REPORTING_WITHIN_HOURS} hours counts as not reporting.`, service: 'Continuous values', link: `${USGS_API}/ogcapi/v1/collections/continuous?f=html` },
  { name: 'Historic daily percentiles', what: 'For each day of the year, where that day\'s flow has fallen over every year a gauge has on record: the median, the range the middle half of years fell in, and the 10th and 90th percentile.', service: 'Statistics', link: `${USGS_API}/statistics/v0/docs` },
  { name: 'Daily means, this period and last year', what: 'The 30-day, 1-year and custom charts.', service: 'Daily values', link: `${USGS_API}/ogcapi/v1/collections/daily?f=html` },
  { name: '15-minute readings, this week and the same week last year', what: 'The 7-day chart, drawn at one reading an hour.', service: 'Continuous values', link: `${USGS_API}/ogcapi/v1/collections/continuous?f=html` },
];
const WORKED_OUT = [
  { name: 'Very low to very high', what: 'USGS\'s own five classes, by where the flow now falls among every year\'s flow on this date: under the 10th percentile, 10th to 25th, 25th to 75th (normal), 75th to 90th, and over the 90th. Where a record is too short for the outer two, a third of the median and three times it stand in, and four times the median or more is always very high, a quarter or less always very low.', service: 'USGS: how streamflow is classed', link: 'https://pubs.usgs.gov/publication/fs20233030/full' },
  { name: 'Normal, and times normal', what: 'Normal is the median flow for today\'s date over every year a gauge has on record, and the usual range is where the middle half of those years fell. Times normal is the newest flow divided by that median.' },
  { name: 'Rising, dropping or steady', what: 'Rising or dropping: changed by a tenth or more since this time yesterday and still going that way, or by 8% in the last six hours. Fast: a quarter or more in six hours.' },
  { name: 'Water temperature for trout', what: 'Under 40 °F cold, 40 to 50 cool, 50 to 65 right, 65 to 68 warm, 68 and over too warm: the bands state fisheries agencies give for catching trout without killing them.', service: 'Maryland DNR: trout and water temperature', link: 'https://dnr.maryland.gov/fisheries/Pages/trout/advisory.aspx' },
  { name: 'Average water temperature', what: `The newest water temperature at each gauge that measures it, added up and divided by how many there are. A gauge with no thermometer, or with nothing from it in the last ${REPORTING_WITHIN_HOURS} hours, is left out.` },
  { name: 'How to fish it', what: 'Rules of thumb from the flow, its direction and the water temperature: the common ground of what guides and fisheries agencies say about high, low and warm water. They are a read of the gauge and can\'t see the river.' },
];

const clockTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function Sources() {
  const [open, setOpen] = useState(false);
  const body = useId();
  return <section className={open ? 'gauge-sources is-open' : 'gauge-sources'} aria-label="Sources">
    <h2 className="gauge-sources-heading">
      <button type="button" className="gauge-sources-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => setOpen((value) => !value)}>
        <span className="gauge-sources-name">Sources</span>
        <span className="gauge-sources-line">U.S. Geological Survey · new readings after {FRESH_FOR_MINUTES} minutes</span>
        <span className="expand-icon" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
    </h2>
    {open && <div className="gauge-sources-body reveal-in" id={body}>
      <div>
        <h3>From USGS</h3>
        <ul>{SOURCES.map((source) => <li key={source.name}><strong>{source.name}</strong><span>{source.what}</span><a href={source.link} target="_blank" rel="noopener noreferrer">USGS: {source.service}</a></li>)}</ul>
      </div>
      <div>
        <h3>Worked out on this page</h3>
        <ul>{WORKED_OUT.map((step) => <li key={step.name}><strong>{step.name}</strong><span>{step.what}</span>{step.link && <a href={step.link} target="_blank" rel="noopener noreferrer">{step.service}</a>}</li>)}</ul>
      </div>
      <p className="month-empty">Load new data: after {FRESH_FOR_MINUTES} minutes. While this page is open it reads the gauges again by itself, and Refresh reads them now. Nothing USGS says is kept by the club; readings are provisional until the survey has reviewed them.</p>
    </div>}
  </section>;
}

export default function RiverGauges({ clock = Date.now }) {
  const { user, isAdmin, listRiverGauges, removeRiverGauge } = useAuth();
  // The river being looked at, by its gauge's station number: none on the list itself.
  const { siteNo = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [gauges, setGauges] = useState(null);
  const [view, setView] = useState(savedView);
  // Flow or water temperature on the chart: a look for this visit, and only ever the water's
  // where the river being looked at has a thermometer.
  const [reading, setReading] = useState('flow');
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [head, setHead] = useState(NO_HEAD);
  // Which gauges the list is showing: all of them, or only those running one way.
  const [only, setOnly] = useState(null);
  // The chart on screen: the answers and the view they answer. A new view's answers replace
  // it all at once when they are in; until then the old picture stays up, dimmed, so nothing
  // jumps while USGS is being asked.
  const [frame, setFrame] = useState(null);
  const [chartsLost, setChartsLost] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(true);
  // A Refresh by hand dims the chart until the new one is in; the page's own reading every
  // fifteen minutes swaps it without a flicker.
  const [refreshing, setRefreshing] = useState(false);
  const [turn, setTurn] = useState(0);
  const [loadedAt, setLoadedAt] = useState(() => clock());
  // Answers already had this visit, so going back to a view doesn't ask USGS again. Their
  // keys say which can change (`now:` — the last three days, this period's record) and which
  // can't (`kept:` — last year, the long-run normals): reading the gauges again forgets
  // only the first kind.
  const memo = useRef(new Map());
  const fresh = useRef(false);
  // Where the list was scrolled to when a river was opened, and which river that was.
  const listScroll = useRef(0);
  const cameFrom = useRef('');
  const heading = useRef(null);

  useEffect(() => {
    let active = true;
    listRiverGauges().then((rows) => { if (active) setGauges(rows || []); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = useMemo(() => (siteNo && gauges ? gauges.find((gauge) => gauge.site_no === siteNo) || null : null), [gauges, siteNo]);
  const states = useMemo(() => [...new Set((gauges || []).map((gauge) => gauge.state))].sort((a, b) => stateName(a).localeCompare(stateName(b))), [gauges]);
  // A river's page is in its own state, whichever the list was last showing.
  const state = selected ? selected.state : states.includes(view.state) ? view.state : (states.includes('NJ') ? 'NJ' : states[0] || '');
  const shown = useMemo(() => (gauges || []).filter((gauge) => gauge.state === state), [gauges, state]);
  const groups = useMemo(() => groupByRiver(shown), [shown]);
  const sites = useMemo(() => shown.map((gauge) => gauge.site_no), [shown]);
  const charting = Boolean(selected);
  const hasTemp = charting && (head.record.get(selected.site_no)?.temp || []).length > 0;
  const metric = METRICS[reading === 'temp' && hasTemp ? 'temp' : 'flow'];
  const customKey = view.period === 'custom' ? `${custom.start}/${custom.end}` : '';
  const range = useMemo(() => periodRange(view.period, loadedAt, custom), [view.period, loadedAt, customKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = localDay(loadedAt);
  const sitesKey = sites.join(',');
  const looking = `${metric.key}|${view.period}|${customKey}`;

  function change(patch) {
    setView((previous) => { const next = { ...previous, state, ...patch }; keepView(next); return next; });
  }

  // The list goes where a river's page was: back from a Pennsylvania river is Pennsylvania's list.
  useEffect(() => {
    if (selected && selected.state !== view.state) setView((previous) => { const next = { ...previous, state: selected.state }; keepView(next); return next; });
  }, [selected, view.state]);

  // A river's page starts at its top, with its name the thing a screen reader is on; coming
  // back, the list is where it was left, on the row that was opened.
  useLayoutEffect(() => {
    const from = cameFrom.current;
    cameFrom.current = siteNo;
    if (siteNo) {
      window.scrollTo(0, 0);
      if (heading.current) heading.current.focus({ preventScroll: true });
    } else if (from) {
      window.scrollTo(0, listScroll.current);
      const row = document.getElementById(rowId(from));
      if (row) row.focus({ preventScroll: true });
    }
  }, [siteNo]);

  useEffect(() => {
    if (!sitesKey) { setBusy(false); return undefined; }
    let active = true;
    // The Refresh button wants the newest of everything, not the copy of this period's daily
    // means a browser may keep for an hour (USGS lets it; the readings themselves it never
    // lets a browser keep). Only what can have changed is asked for that way: last year's
    // record and the long-run normals are the same as they were a minute ago.
    const newest = { fresh: fresh.current, now: loadedAt };
    const settled = { now: loadedAt };
    fresh.current = false;
    setProblem('');
    setChartsLost(false);
    setBusy(true);
    const trouble = (error) => { if (active) setProblem(error.message); };

    // One answer per kind of question this visit, remembered gauge by gauge: asking again
    // for a list that has one new gauge in it asks USGS about that gauge alone. Whoever asks
    // about a gauge while a request for it is still out waits on that same request, and
    // hears of it if it fails — a request that failed is never mistaken for a gauge with
    // nothing to say, and its gauges are asked about again next time.
    const ask = (key, fetcher) => {
      let entry = memo.current.get(key);
      if (!entry) { entry = { found: new Map(), requests: new Map() }; memo.current.set(key, entry); }
      const missing = sites.filter((site) => !entry.requests.has(site));
      if (missing.length > 0) {
        const request = fetcher(missing).then(
          (found) => { found.forEach((value, site) => entry.found.set(site, value)); },
          (error) => { missing.forEach((site) => { if (entry.requests.get(site) === request) entry.requests.delete(site); }); throw error; },
        );
        missing.forEach((site) => entry.requests.set(site, request));
      }
      const sofar = () => new Map(entry.found);
      return { got: Promise.all([...new Set(sites.map((site) => entry.requests.get(site)))]).then(sofar), sofar };
    };
    const part = (answer, pick) => ({ got: answer.got.then(pick), sofar: () => pick(answer.sofar()) });
    const normalsOf = (which, span, more) => ask(`kept:normals|${which.key}|${span.startDay}/${span.endDay}`, (list) => fetchNormals(list, which, span.startDay, span.endDay, { ...settled, ...more, storage: normalsStorage() }));

    const flow = METRICS.flow;
    // The last three days of every gauge's flow and water temperature, in one answer. Its
    // newest readings are the list; the rest of it is which way each river is going, how
    // warm the water got yesterday, and the three-day chart.
    const record = ask('now:record', (list) => fetchMeasured(list, MEASURED, loadedAt - RECENT_HOURS * HOUR, loadedAt, { ...newest, every: RECORD_EVERY }));
    // Flow's normals for those days are what every gauge is held against, and the band behind
    // the three-day chart. When they have to be asked for, a fortnight more is asked for with
    // them, so the list is one question to USGS tomorrow and the day after, not two.
    const near = withNeighbours(periodRange('3d', loadedAt), today);
    const normalsFlow = normalsOf(flow, near, { ahead: NORMALS_AHEAD_DAYS });

    // Any other chart is only asked for on a river's page: the list needs none of it.
    let chart = null;
    if (charting && !range.error) {
      const span = `${range.startDay}/${range.endDay}`;
      const before = `${yearBefore(range.startDay)}/${yearBefore(range.endDay)}`;
      const latest = part(record, (found) => newestOf(found, metric.key, loadedAt));
      const normals = normalsOf(metric, withNeighbours(range, range.live ? today : range.endDay));
      if (view.period === '3d') {
        // Three days is the record the list was read from: nothing more to ask.
        chart = { latest, now: part(record, (found) => seriesOf(found, metric.key)), last: NOTHING, normals };
      } else if (view.period === '7d') {
        // Seven days is the record as measured, this year's and last year's both. Last year's
        // week is asked for with a day to spare past "now", so it still reaches the edge of
        // the chart after this one has been reloaded for hours.
        chart = {
          latest,
          now: ask(`now:measured|${metric.key}|${span}`, (list) => fetchContinuous(list, metric, range.startMs, range.endMs, newest)),
          last: ask(`kept:measured|${metric.key}|${before}`, (list) => fetchContinuous(list, metric, yearBeforeMs(range.startMs), yearBeforeMs(range.endMs) + DAY, settled)),
          normals,
        };
      } else {
        // Anything longer is daily means.
        chart = {
          latest,
          now: ask(`now:daily|${metric.key}|${span}`, (list) => fetchDaily(list, metric, range.startDay, range.endDay, newest)),
          last: ask(`kept:daily|${metric.key}|${before}`, (list) => fetchDaily(list, metric, yearBefore(range.startDay), yearBefore(range.endDay), settled)),
          normals,
        };
      }
    }

    const also = (known, more) => new Set([...known, ...more]);
    const headIn = Promise.all([
      record.got.then(
        // Which gauges have been heard from starts over with each reading of them: what
        // another state's gauges said last time was forgotten along with everything else.
        (found) => { if (active) setHead((previous) => ({ ...previous, record: found, heard: previous.turn === turn ? also(previous.heard, sites) : new Set(sites), lost: false, at: loadedAt, turn })); },
        (error) => { trouble(error); if (active) setHead((previous) => ({ ...previous, lost: true })); },
      ),
      normalsFlow.got.then(
        (normals) => { if (active) setHead((previous) => ({ ...previous, normals, rated: also(previous.rated, sites), blind: false })); },
        (error) => { trouble(error); if (active) setHead((previous) => ({ ...previous, rated: also(previous.rated, sites), blind: true })); },
      ),
    ]);

    let chartIn = Promise.resolve();
    if (chart) {
      const data = {};
      let lost = false;
      const take = (name) => chart[name].got.then(
        (found) => { data[name] = found; },
        // Without this period's own record there is no chart; without one of the others
        // there is a chart with a line missing, and the reason said above it. What other
        // gauges already had answered stays theirs.
        (error) => { data[name] = chart[name].sofar(); if (name === 'now') lost = true; trouble(error); },
      );
      chartIn = Promise.all(['latest', 'now', 'last', 'normals'].map(take)).then(() => {
        if (!active) return;
        if (lost) { setChartsLost(true); return; }
        setFrame((previous) => ({ key: looking, turn, metricKey: metric.key, period: view.period, range, sites: also(previous && previous.key === looking && previous.turn === turn ? previous.sites : [], sites), data }));
      });
    }
    Promise.all([headIn, chartIn]).then(() => { if (active) { setBusy(false); setRefreshing(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesKey, metric.key, view.period, customKey, range.error, turn, charting]);

  // Reads the gauges again: by hand (Refresh), or by itself once they are fifteen minutes old.
  function reload(byHand) {
    for (const key of [...memo.current.keys()]) if (key.startsWith('now:')) memo.current.delete(key);
    fresh.current = byHand;
    setRefreshing(byHand);
    setLoadedAt(clock());
    setTurn((count) => count + 1);
  }

  // New readings after fifteen minutes, for as long as someone is looking: a tab in the
  // background waits, and catches up the moment it is looked at again.
  useEffect(() => {
    if (!sitesKey || busy) return undefined;
    const hidden = () => document.visibilityState === 'hidden';
    const timer = window.setTimeout(() => { if (!hidden()) reload(false); }, Math.max(1000, loadedAt + FRESH_FOR_MS - clock()));
    const seen = () => { if (!hidden() && clock() - loadedAt >= FRESH_FOR_MS) reload(false); };
    document.addEventListener('visibilitychange', seen);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', seen); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedAt, busy, sitesKey]);

  // "All rivers" from a river that was opened from the list is a step back, not a step on:
  // the phone's own back gesture then leaves the page instead of going round again.
  function back(event) {
    if (plainClick(event) && location.state && location.state.fromList) { event.preventDefault(); navigate(-1); }
  }

  async function remove(gauge) {
    const result = await removeRiverGauge(gauge.id);
    if (result.error) return result;
    setGauges((previous) => previous.filter((row) => row.id !== gauge.id));
    // Its page went with it: the list it was opened from, or the list in that page's place.
    if (location.state && location.state.fromList) navigate(-1);
    else navigate('/gauges', { replace: true });
    return result;
  }

  // A new gauge is shown: its own page, in its own state.
  function added(gauge) {
    if (!gauge) return;
    setGauges((previous) => [...(previous || []).filter((row) => row.id !== gauge.id), gauge]);
    setOnly(null);
    listScroll.current = window.scrollY;
    navigate(riverPath(gauge.site_no), { state: { fromList: true } });
  }

  const taken = useMemo(() => new Set((gauges || []).map((gauge) => gauge.site_no)), [gauges]);
  const rivers = useMemo(() => new Map((gauges || []).slice().reverse().map((gauge) => [`${gauge.state}|${riverKey(gauge.river)}`, gauge.river])), [gauges]);
  // Every gauge in the state, read: what the list, the counts and a river's page all say.
  // The readings are judged as of when they were read, not as of the page being looked at.
  const reads = useMemo(() => new Map(shown.map((gauge) => [gauge.site_no, readGauge({ record: head.record.get(gauge.site_no), normalsForDay: head.normals.get(gauge.site_no)?.[dayOfYear(today)], now: head.at || loadedAt })])), [shown, head, today, loadedAt]);
  const headIn = sites.length > 0 && sites.every((site) => head.heard.has(site) && head.rated.has(site));
  const counts = useMemo(() => (headIn ? tally(shown.map((gauge) => reads.get(gauge.site_no))) : null), [headIn, shown, reads]);
  const stale = Boolean(frame) && (frame.key !== looking || refreshing);
  const waiting = range.error ? 'Pick a start and an end date above.' : chartsLost ? 'Couldn\'t read this gauge. Try Refresh in a minute.' : 'Reading the gauge...';

  if (siteNo) {
    if (gauges === null) return <main className="content-shell gauges-page"><p className="month-empty" role="status">Pulling the club's gauges...</p></main>;
    if (!selected) return <main className="content-shell gauges-page">
      <p className="month-empty">That gauge isn't on the club's list anymore.</p>
      <Link className="text-link" to="/gauges">← All rivers</Link>
    </main>;
    const site = selected.site_no;
    const group = groups.find((candidate) => candidate.key === riverGroupKey(selected));
    return <main className="content-shell gauges-page is-river">
      <RiverView key={site} gauge={selected} siblings={group ? group.gauges.filter((gauge) => gauge.id !== selected.id) : []}
        read={reads.get(site)} heard={head.heard.has(site)} lost={head.lost}
        unrated={head.blind ? 'couldn\'t be read today' : head.rated.has(site) ? 'no long-run record' : '…'} problem={problem}
        frame={frame} stale={stale} waiting={waiting} metric={metric} hasTemp={hasTemp} view={view} range={range} custom={custom} today={today} now={loadedAt} busy={busy}
        canRemove={Boolean(isAdmin || (selected.added_by && selected.added_by === user?.id))} linkState={location.state} headingRef={heading}
        onBack={back} onChange={change} onReading={setReading} onCustom={setCustom} onRefresh={() => reload(true)} onRemove={remove} />
    </main>;
  }

  let summary = 'Reading the gauges...';
  // The line under it: the average water temperature, once the readings it is made of are in.
  let water = null;
  if (gauges === null) summary = 'Pulling the club\'s gauges...';
  else if (shown.length === 0) summary = 'No gauges on the club\'s list yet. Add the first one below.';
  else if (headIn) {
    const inShape = groups.filter((group) => group.gauges.every((gauge) => reads.get(gauge.site_no).level === 'normal')).map((group) => group.river);
    summary = head.blind && counts.reporting > 0 ? `${counts.reporting} of ${shown.length} gauges reporting. Today's normals couldn't be had to hold them against.` : headline(counts, { where: stateName(state), day: today, inShape });
    const temps = new Map(shown.filter((gauge) => reads.get(gauge.site_no).temp).map((gauge) => [gauge.site_no, reads.get(gauge.site_no).temp]));
    const average = averageTemperature(shown, temps);
    // (With no gauge reporting anything, the sentence above has already said so.)
    if (average || counts.reporting > 0) water = [...temperatureText(average), waterNote(average)];
  } else if (head.lost) summary = 'USGS isn\'t answering right now.';

  // A row a gauge, in the club's order, gauges on the same river together. Where one way of
  // running was picked, only those — unless a new reading has left none running that way.
  const picked = only && counts && counts.levels[only] > 0 ? only : null;
  const rows = groups.flatMap((group) => group.gauges.map((gauge) => ({ gauge, shared: group.gauges.length > 1 })));
  const listed = picked ? rows.filter((row) => reads.get(row.gauge.site_no).level === picked) : rows;

  return <main className="content-shell gauges-page">
    <div className="page-intro">
      <div>
        <span className="eyebrow">STRAIGHT FROM USGS</span>
        <h1>River gauges</h1>
        {/* One live region for both lines, there from the start, so a screen reader is told when
            the readings come in; the second is read out whole when its figure changes. */}
        <div role="status">
          <p className="gauge-summary">{summary}</p>
          {water && <p className="gauge-water" aria-atomic="true">{water[0]}{water[1] && <strong>{water[1]}</strong>}{water[2]}{water[3] ? ` ${water[3]}` : ''}</p>}
        </div>
      </div>
      <FishIllustration species="trout" className="intro-sticker" />
    </div>

    {problem && <p className="form-error gauge-problem" role="alert">{problem}</p>}

    {rows.length > 0 && <>
      {(counts || states.length > 1) && <div className="gauge-tools">
        {counts && <LevelFilter counts={counts} only={picked} onPick={setOnly} />}
        {states.length > 1 && <label className="gauge-state">State<select value={state} onChange={(event) => { setOnly(null); change({ state: event.target.value }); }}>{states.map((code) => <option key={code} value={code}>{stateName(code)}</option>)}</select></label>}
      </div>}

      <div className="river-list">
        {/* What each column is, where there is room for columns: on a narrow screen a row needs no key. */}
        <div className="river-list-head" aria-hidden="true"><span>River</span><span>Running</span><span>Flow</span><span>Water</span><span /></div>
        <ul aria-label="Rivers">
          {listed.map((row) => <RiverRow key={row.gauge.id} gauge={row.gauge} read={reads.get(row.gauge.site_no)} head={head} shared={row.shared} onOpen={() => { listScroll.current = window.scrollY; }} />)}
        </ul>
      </div>
      <p className="gauge-read-at"><span>{head.at ? `Read at ${clockTime(head.at)}` : 'Not read yet'}</span> <button type="button" className="text-link gauge-refresh" disabled={busy} onClick={() => reload(true)}>{busy ? 'Reading...' : 'Refresh'}</button></p>
      <Sources />
    </>}

    {gauges !== null && <AddGauge defaultState={state} taken={taken} rivers={rivers} onAdded={added} />}
  </main>;
}
