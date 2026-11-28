import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import GaugeChart from './components/GaugeChart';
import {
  FRESH_FOR_MINUTES, METRICS, PERIODS, RECENT_HOURS, REPORTING_WITHIN_HOURS, US_STATES, USGS_API, averageTemperature, dayOf, dayOfYear, dayToMs,
  fetchContinuous, fetchDaily, fetchMeasured, fetchNormals, formatReading, gaugeLink, groupByRiver, localDay, newestOf, normalSeries, overlayLastYear,
  periodRange, readingAge, riverGroupKey, riverKey, searchGauges, seriesOf, stateName, temperatureText, thinned, yearBefore, yearBeforeMs,
} from './utils/riverGauges';
import { LEVELS, bandOf, changeText, fishingNotes, headline, levelOf, readGauge, readTitle, tally, timesNormalText, trendLabel, trendNote, waterNote } from './utils/riverRead';

// River gauges (Plan > Gauges): which of the club's rivers to fish for trout today, and how.
//
// The page is a board. Each river is a row, with a line for each of its gauges: how it is
// running against normal for the date (very low to very high, as a word, a shape and a
// marker on a small scale), which way it is going, what it is flowing and how warm the water
// is. The counts across the top are the same thing added up, and each is a way of seeing
// just those rivers. A row opens into the detail: the read in a few words, the numbers
// behind it, how to fish it, and the chart.
//
// The list of gauges is the club's (the river_gauges table: any member adds one). Every
// reading comes from USGS when the page is opened — nothing is stored — a whole state at a
// time: the last three days of flow and water temperature in one request, flow's normals
// for those days in another (kept on the device for a month, so a return visit asks one
// question, not two). utils/riverGauges.js says why the count matters. That record is the
// board, the trend and the three-day chart, so opening a river asks for nothing; a longer
// stretch is asked for when it is picked. Everything is read again by itself once it is
// fifteen minutes old. utils/riverRead.js turns the numbers into words.
//
// What a viewer picked (state, which rivers are open, how far back the charts go, flow or
// temperature, log or straight axis) is kept on the device and nowhere else: it is how they
// like to look at it, not club data.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const FRESH_FOR_MS = FRESH_FOR_MINUTES * 60 * 1000;
// The board's record is kept at a reading every fifteen minutes, which is how most gauges
// report; a few report every five.
const RECORD_EVERY = 15 * 60 * 1000;
const VIEW_KEY = 'fishyfriends:gauges-view';
// What a view kept before the page became a board asked the charts for a month of daily
// means; since then they open on the three days the board is already read from.
const VIEW_VERSION = 2;
const DEFAULT_VIEW = { state: '', metric: 'flow', period: '3d', scale: 'log', open: [] };
const MOST_OPEN_KEPT = 80;
// How many days of normals past today the board asks for when it has to ask at all.
const NORMALS_AHEAD_DAYS = 14;

function savedView() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_VIEW;
    const current = saved.version === VIEW_VERSION;
    return {
      state: typeof saved.state === 'string' ? saved.state : '',
      metric: current && METRICS[saved.metric] ? saved.metric : 'flow',
      // A custom range is for one look at one stretch; the next visit starts from three days.
      period: current && PERIODS.some((period) => period.key === saved.period && period.key !== 'custom') ? saved.period : '3d',
      scale: saved.scale === 'linear' ? 'linear' : 'log',
      open: Array.isArray(saved.open) ? saved.open.filter((key) => typeof key === 'string').slice(-MOST_OPEN_KEPT) : [],
    };
  } catch (problem) {
    return DEFAULT_VIEW;
  }
}

function keepView(view) {
  try { window.localStorage.setItem(VIEW_KEY, JSON.stringify({ version: VIEW_VERSION, state: view.state, metric: view.metric, period: view.period, scale: view.scale, open: view.open })); } catch (problem) { /* not kept, then */ }
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

const shortDate = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Segmented({ label, name, value, options, onChange }) {
  return <div className={`segmented is-${name}`} role="group" aria-label={label}>
    {options.map((option) => <button key={option.key} type="button" className={option.key === value ? 'segment is-active' : 'segment'} aria-pressed={option.key === value} disabled={option.disabled} title={option.title} onClick={() => onChange(option.key)}>{option.label}</button>)}
  </div>;
}

// How a river is running is said with a shape and a word, never by colour alone — and not in
// the chart's own colours, which already mean something.
function LevelMark({ level }) {
  const known = levelOf(level);
  return <span className={`level-mark is-${level}`}><i aria-hidden="true">{known.shape}</i>{known.label}</span>;
}

const ARROWS = {
  rising: 'M3 9.5 9.5 3M4.5 3h5v5',
  dropping: 'M3 2.5 9.5 9M9.5 4v5h-5',
  steady: 'M1.5 6h9M7 2.5 10.5 6 7 9.5',
};

function TrendMark({ trend }) {
  return <span className={`trend-mark is-${trend.direction}${trend.fast ? ' is-fast' : ''}`}>
    <svg aria-hidden="true" viewBox="0 0 12 12" width="12" height="12"><path d={ARROWS[trend.direction]} /></svg>{trendLabel(trend)}
  </span>;
}

const percent = (share) => `${(share * 100).toFixed(1)}%`;

// The little scale on every line: a quarter of normal at the left, four times at the right,
// normal in the middle. The lighter band is the usual range for the date, the fainter one
// round it the wider range USGS calls above and below normal, and the marker is the river
// now. It says nothing the words beside it don't: it is for running an eye down the board.
function Meter({ meter, far }) {
  if (!meter) return <span className="flow-meter is-blank" aria-hidden="true" />;
  // Past an end of the scale the marker becomes an arrowhead at that end.
  return <span className={`flow-meter${meter.off ? ` is-off is-off-${meter.off > 0 ? 'high' : 'low'}` : ''}${far ? ' is-far' : ''}`} aria-hidden="true">
    {meter.outer && <i className="flow-meter-outer" style={{ left: percent(meter.outer[0]), width: percent(meter.outer[1] - meter.outer[0]) }} />}
    {meter.inner && <i className="flow-meter-inner" style={{ left: percent(meter.inner[0]), width: percent(meter.inner[1] - meter.inner[0]) }} />}
    <i className="flow-meter-normal" />
    <i className="flow-meter-now" style={{ left: percent(meter.at) }} />
  </span>;
}

// The last three days as a line an inch long: the shape of the river's last rise and fall.
// Each is drawn to its own range (on a log scale, so a doubling looks the same on a brook and
// a river); one that has barely moved is drawn flat rather than blown up into a mountain.
const SPARK = { width: 72, height: 22 };
function Spark({ points }) {
  const path = useMemo(() => {
    const kept = thinned((points || []).filter((point) => point.v > 0), HOUR);
    if (kept.length < 2) return '';
    const logs = kept.map((point) => Math.log(point.v));
    let low = Math.min(...logs);
    let high = Math.max(...logs);
    // (At least a quarter's swing top to bottom.)
    const least = Math.log(1.25);
    if (high - low < least) { const middle = (high + low) / 2; low = middle - least / 2; high = middle + least / 2; }
    const [first, last] = [kept[0].t, kept[kept.length - 1].t];
    const x = (t) => 1 + ((t - first) / Math.max(1, last - first)) * (SPARK.width - 2);
    const y = (value) => SPARK.height - 2 - ((value - low) / (high - low)) * (SPARK.height - 4);
    return kept.map((point, index) => `${index ? 'L' : 'M'}${x(point.t).toFixed(1)} ${y(logs[index]).toFixed(1)}`).join('');
  }, [points]);
  return <svg className="flow-spark" aria-hidden="true" viewBox={`0 0 ${SPARK.width} ${SPARK.height}`} width={SPARK.width} height={SPARK.height}>{path && <path d={path} />}</svg>;
}

// One gauge's line on the board: where it is, how it is running and which way it is going,
// where that sits against normal, what it is flowing, and the water temperature if the gauge
// measures it.
function GaugeLine({ gauge, read, head }) {
  const site = gauge.site_no;
  const heard = head.heard.has(site);
  let status;
  if (!heard) status = head.lost ? 'No answer from USGS' : '…';
  else if (!read.flow) status = 'Not reporting';
  else if (read.level) status = <><LevelMark level={read.level} />{read.trend && <TrendMark trend={read.trend} />}</>;
  else {
    const why = head.blind ? 'Couldn\'t get today\'s normal' : head.rated.has(site) ? 'No long-run normal' : '…';
    status = <><span className="level-mark is-unrated">{why}</span>{read.trend && <TrendMark trend={read.trend} />}</>;
  }
  const flowing = heard && read.flow;
  const warm = flowing && (read.band === 'warm' || read.band === 'hot');
  return <span className="river-line">
    <span className="river-line-place">{gauge.place || 'On the river'}</span>
    <span className="river-line-status">{status}</span>
    <span className="river-line-spark">{flowing && <Spark points={head.record.get(site)?.flow} />}</span>
    <span className="river-line-meter"><Meter meter={flowing ? read.meter : null} far={flowing && (read.level === 'very-high' || read.level === 'very-low')} /><span className="river-line-ratio">{flowing && read.ratio !== null ? timesNormalText(read.ratio) : ''}</span></span>
    <span className="river-line-now">{!heard ? '' : flowing ? <><strong>{formatReading(read.flow.v, METRICS.flow)}</strong> cfs</> : '—'}</span>
    <span className={warm ? 'river-line-temp is-warm' : 'river-line-temp'}>{heard && read.temp ? <>{formatReading(read.temp.v, METRICS.temp)}&nbsp;°F{warm && <i> {bandOf(read.band).label.toLowerCase()}</i>}</> : ''}</span>
  </span>;
}

function RiverGroup({ group, open, onToggle, reads, head, children }) {
  const body = useId();
  // A river with one gauge says where that is beside its name where the board is narrow.
  const solo = group.gauges.length === 1;
  return <section className={`river-group${open ? ' is-open' : ''}${solo ? ' is-solo' : ''}`}>
    <h2 className="river-heading">
      <button type="button" className="river-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={onToggle}>
        <span className="river-name">{group.river}{solo && group.gauges[0].place && <small aria-hidden="true">{group.gauges[0].place}</small>}</span>
        <span className="river-lines">{group.gauges.map((gauge) => <GaugeLine key={gauge.id} gauge={gauge} read={reads.get(gauge.site_no)} head={head} />)}</span>
        <span className="expand-icon" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
    </h2>
    {open && <div className="river-body reveal-in" id={body}>{children}</div>}
  </section>;
}

// What the charts show: how far back, flow or temperature, and on which axis. It sits over
// each chart because that is where it is wanted, but it is one setting for every chart on the
// page, not one a chart: pick a month here and every open river shows a month.
function ChartBar({ name, view, range, custom, today, onChange, onCustom }) {
  const flow = view.metric === 'flow';
  return <div className="chart-bar" role="group" aria-label={`What the charts show, ${name}`}>
    <Segmented label="How far back" name="period" value={view.period} onChange={(key) => onChange({ period: key })} options={PERIODS.map((period) => ({ key: period.key, label: period.label }))} />
    <Segmented label="Reading" name="reading" value={view.metric} onChange={(key) => onChange({ metric: key })} options={[{ key: 'flow', label: 'Flow' }, { key: 'temp', label: 'Water temp' }]} />
    <Segmented label="Axis" name="axis" value={flow ? view.scale : 'linear'} onChange={(key) => onChange({ scale: key })} options={[{ key: 'log', label: 'Log', disabled: !flow, title: flow ? undefined : 'A log axis is for flow' }, { key: 'linear', label: 'Linear' }]} />
    {view.period === 'custom' && <div className="gauge-custom">
      <label>From<input type="date" value={custom.start} max={custom.end || today} onChange={(event) => onCustom({ ...custom, start: event.target.value })} /></label>
      <label>To<input type="date" value={custom.end} min={custom.start || undefined} max={today} onChange={(event) => onCustom({ ...custom, end: event.target.value })} /></label>
      {range.error && <p className="field-hint" role="status">{range.error}</p>}
    </div>}
  </div>;
}

const capital = (text) => (text ? `${text[0].toUpperCase()}${text.slice(1)}` : '');

// The numbers behind a read, each with the one thing that gives it meaning under it. How far
// it has moved is said for the last six hours first, because that is the direction it is
// going now: a river that came up overnight and is on its way down is "up" on yesterday.
function Facts({ read, today }) {
  const { flow, temp, normal, trend } = read;
  const band = bandOf(read.band);
  const lately = Boolean(trend) && trend.recent !== null;
  const moved = capital(trend ? changeText(lately ? trend.recent : trend.daily) : '');
  let before = 'no earlier reading to go by';
  // ("Up 53% since this time yesterday", but "8.7 times what it was this time yesterday".)
  if (lately && trend.daily !== null) before = `${changeText(trend.daily)} ${trend.daily >= 0.995 ? '' : 'since '}this time yesterday`;
  else if (trend && trend.dayAgo !== null) before = `${formatReading(trend.dayAgo, METRICS.flow)} cfs then`;
  return <dl className="gauge-facts">
    <div>
      <dt>Flow now</dt>
      <dd><strong>{formatReading(flow.v, METRICS.flow)}</strong> cfs</dd>
      <dd className="gauge-fact-sub">{read.ratio !== null ? timesNormalText(read.ratio) : 'no normal to hold it to'}</dd>
    </div>
    <div>
      <dt>Normal for {shortDate(today)}</dt>
      <dd>{normal ? <><strong>{formatReading(normal.median, METRICS.flow)}</strong> cfs</> : <strong>—</strong>}</dd>
      <dd className="gauge-fact-sub">{normal ? `usually ${formatReading(normal.low, METRICS.flow)} to ${formatReading(normal.high, METRICS.flow)}` : 'too short a record'}</dd>
    </div>
    <div>
      <dt>{lately || !trend ? 'Last 6 hours' : 'Since yesterday'}</dt>
      <dd><strong>{moved || '—'}</strong></dd>
      <dd className="gauge-fact-sub">{before}</dd>
    </div>
    <div>
      <dt>Water</dt>
      <dd>{temp ? <><strong>{formatReading(temp.v, METRICS.temp)}</strong> °F</> : <strong>—</strong>}</dd>
      <dd className="gauge-fact-sub">{temp ? `${band.says}${read.tempDay ? ` · ${formatReading(read.tempDay.low, METRICS.temp)} to ${formatReading(read.tempDay.high, METRICS.temp)} in a day` : ''}` : 'no thermometer here'}</dd>
    </div>
  </dl>;
}

// The line a trout angler would want ruled across a temperature chart.
const TOO_WARM = { value: 68, label: '68 °F: too warm for trout' };

function GaugeCard({ gauge, read, heard, lost, frame, stale, waiting, wanted, scale, today, now, canRemove, onRemove, bar }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const site = gauge.site_no;
  // The chart shows what the picture on screen holds, which while a new view is being read is
  // still the old one.
  const ready = Boolean(frame && frame.sites.has(site));
  const metric = METRICS[frame ? frame.metricKey : wanted];

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

  async function remove() {
    setRemoving(true);
    const result = await onRemove(gauge);
    if (result?.error) { setRemoving(false); setConfirming(false); }
  }

  return <article className={stale && ready ? 'gauge-card is-stale' : 'gauge-card'} aria-label={`${gauge.river} ${gauge.place}`.trim()} aria-busy={!ready || stale || undefined}>
    <div className="gauge-read">
      <header className="gauge-card-name">
        <h3>{gauge.place || gauge.river}</h3>
        <p><a href={gaugeLink(site)} target="_blank" rel="noopener noreferrer">USGS {site}</a>{heard && read.flow ? ` · read ${readingAge(read.flow.t, now)}` : ''}</p>
      </header>
      {!heard && <p className="gauge-read-title is-quiet">{lost ? 'No answer from USGS' : 'Reading the gauge...'}</p>}
      {heard && <p className={read.flow ? 'gauge-read-title' : 'gauge-read-title is-quiet'}>{readTitle(read)}</p>}
      {story && <p className="gauge-read-story">{story}</p>}
      {heard && !read.flow && <p className="gauge-read-story">Nothing from this gauge in the last {REPORTING_WITHIN_HOURS} hours.</p>}
      {heard && read.flow && <Facts read={read} today={today} />}
      {notes.length > 0 && <div className="gauge-notes">
        <h4>How to fish it</h4>
        <ul>{notes.map((note) => <li key={note.key}>{note.text}</li>)}</ul>
      </div>}
    </div>
    <div className="gauge-card-chart">
      {bar}
      {!ready && <p className="month-empty gauge-note is-waiting" role="status">{waiting}</p>}
      {nothing && <p className="month-empty gauge-note">{metric.key === 'temp' ? 'This gauge doesn\'t measure water temperature.' : 'Nothing from this gauge for this stretch.'}</p>}
      {ready && !nothing && <GaugeChart title={`${gauge.river} ${gauge.place}, ${metric.name}`.replace(' ,', ',')} unit={metric.unit} scale={metric.key === 'flow' ? scale : 'linear'} floor={metric.key === 'flow' ? 0 : undefined} startMs={frame.range.startMs} endMs={frame.range.endMs} now={series.now} last={series.last} normal={series.normal} lines={frame.period === '3d' ? ['now', 'normal'] : undefined} mark={metric.key === 'temp' ? TOO_WARM : null} hourly={measured} format={(value) => formatReading(value, metric)} />}
    </div>
    {(gauge.added_by_name || canRemove) && <footer className="gauge-card-foot">
      <span>{gauge.added_by_name ? `Added by ${gauge.added_by_name}` : ''}</span>
      {canRemove && !confirming && <button type="button" className="text-link" onClick={() => setConfirming(true)}>Remove</button>}
      {canRemove && confirming && <span className="gauge-remove-confirm">Remove it for the whole club? <button type="button" className="text-link" disabled={removing} onClick={remove}>{removing ? 'Removing...' : 'Yes, remove'}</button> <button type="button" className="text-link" disabled={removing} onClick={() => setConfirming(false)}>Keep it</button></span>}
    </footer>}
  </article>;
}

// How the club's gauges are running, counted: five cells from very low to very high, in the
// order the scale on each line runs. Each is also a way of seeing just those rivers.
function Tally({ counts, only, onPick }) {
  return <div className="level-tally" role="group" aria-label="Gauges by how they are running">
    {LEVELS.map((level) => {
      const count = counts ? counts.levels[level.key] : null;
      const picked = only === level.key;
      return <button key={level.key} type="button" className={`level-cell is-${level.key}${picked ? ' is-active' : ''}`} aria-pressed={picked} disabled={!count && !picked} onClick={() => onPick(picked ? null : level.key)}>
        <strong>{count === null ? '–' : count}</strong>{' '}
        <span><i aria-hidden="true">{level.shape}</i>{level.label}</span>
      </button>;
    })}
  </div>;
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
  // wrote it, so it lands in the same drop-down.
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
      <p className="month-empty">What the club will see for USGS {draft.siteNo}. Gauges with the same river name share a drop-down; change the wording if the survey's is clumsy.</p>
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

// What the board is made of: the last three days of every gauge's flow and water temperature
// as measured (`record`), and flow's normals for those days. `heard` and `rated` are the
// gauges each answer has come in for, so a gauge that isn't reporting can be told from one
// that hasn't been asked about yet. `at` is when the readings on screen were read, `turn`
// which reading of them that was.
const NO_HEAD = { record: new Map(), normals: new Map(), heard: new Set(), rated: new Set(), lost: false, blind: false, at: 0, turn: -1 };
// Everything a gauge measures that the page uses, asked for in one question.
const MEASURED = [METRICS.flow, METRICS.temp];
const NOTHING = { got: Promise.resolve(new Map()), sofar: () => new Map() };

// Where the numbers come from, in the words the owner's own dashboard used for them, and
// where the words about them come from. Closed, it says who the readings are from, when they
// were read and when they will be read again.
const SOURCES = [
  { name: `USGS readings, last ${RECENT_HOURS / 24} days`, what: `Each gauge's flow and water temperature as measured, every fifteen minutes or so. The newest of them is what the gauge is doing now; a gauge with nothing from the last ${REPORTING_WITHIN_HOURS} hours counts as not reporting.`, service: 'Continuous values', link: `${USGS_API}/ogcapi/v1/collections/continuous?f=html` },
  { name: 'Historic daily percentiles', what: 'For each day of the year, where that day\'s flow has fallen over every year a gauge has on record: the median, the range the middle half of years fell in, and the 10th and 90th percentile.', service: 'Statistics', link: `${USGS_API}/statistics/v0/docs` },
  { name: 'Daily means, this period and last year', what: 'The 30-day, 1-year and custom charts.', service: 'Daily values', link: `${USGS_API}/ogcapi/v1/collections/daily?f=html` },
  { name: '15-minute readings, this week and the same week last year', what: 'The 7-day chart, drawn at one reading an hour.', service: 'Continuous values', link: `${USGS_API}/ogcapi/v1/collections/continuous?f=html` },
];
const WORKED_OUT = [
  { name: 'Very low to very high', what: 'USGS\'s own five classes, by where the flow now falls among every year\'s flow on this date: under the 10th percentile, 10th to 25th, 25th to 75th (normal), 75th to 90th, and over the 90th. Where a record is too short for the outer two, a third of the median and three times it stand in.', service: 'USGS: how streamflow is classed', link: 'https://pubs.usgs.gov/publication/fs20233030/full' },
  { name: 'Times normal', what: 'The newest flow divided by the median for today\'s date. The scale on each line runs from a quarter of normal to four times it.' },
  { name: 'Rising, dropping or steady', what: 'Rising or dropping: changed by a tenth or more since this time yesterday and still going that way, or by 8% in the last six hours. Fast: a quarter or more in six hours.' },
  { name: 'Water temperature for trout', what: 'Under 40 °F cold, 40 to 50 cool, 50 to 65 right, 65 to 68 warm, 68 and over too warm: the bands state fisheries agencies give for catching trout without killing them.', service: 'Maryland DNR: trout and water temperature', link: 'https://dnr.maryland.gov/fisheries/Pages/trout/advisory.aspx' },
  { name: 'Average water temperature', what: `The newest water temperature at each gauge that measures it, added up and divided by how many there are. A gauge with no thermometer, or with nothing from it in the last ${REPORTING_WITHIN_HOURS} hours, is left out.` },
  { name: 'How to fish it', what: 'Rules of thumb from the flow, its direction and the water temperature: the common ground of what guides and fisheries agencies say about high, low and warm water. They are a read of the gauge and can\'t see the river.' },
];

const clockTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

function Sources({ readAt }) {
  const [open, setOpen] = useState(false);
  const body = useId();
  return <section className={open ? 'river-group gauge-sources is-open' : 'river-group gauge-sources'} aria-label="Sources">
    <h2 className="river-heading">
      <button type="button" className="river-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={() => setOpen((value) => !value)}>
        <span className="river-name">Sources</span>
        <span className="gauge-sources-line">U.S. Geological Survey · {readAt ? `read at ${clockTime(readAt)}` : 'not read yet'} · new readings after {FRESH_FOR_MINUTES} minutes</span>
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
  const [gauges, setGauges] = useState(null);
  const [view, setView] = useState(savedView);
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [head, setHead] = useState(NO_HEAD);
  // Which rivers the board is showing: all of them, or only those running one way.
  const [only, setOnly] = useState(null);
  // The charts on screen: the answers and the view they answer. A new view's answers replace
  // it all at once when they are in; until then the old picture stays up, dimmed, so nothing
  // jumps while USGS is being asked.
  const [frame, setFrame] = useState(null);
  const [chartsLost, setChartsLost] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(true);
  // A Refresh by hand dims the charts until the new ones are in; the page's own reading
  // every fifteen minutes swaps them without a flicker.
  const [refreshing, setRefreshing] = useState(false);
  const [turn, setTurn] = useState(0);
  const [loadedAt, setLoadedAt] = useState(() => clock());
  // Answers already had this visit, so going back to a view doesn't ask USGS again. Their
  // keys say which can change (`now:` — the last three days, this period's record) and which
  // can't (`kept:` — last year, the long-run normals): reading the gauges again forgets
  // only the first kind.
  const memo = useRef(new Map());
  const fresh = useRef(false);

  useEffect(() => {
    let active = true;
    listRiverGauges().then((rows) => { if (active) setGauges(rows || []); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const states = useMemo(() => [...new Set((gauges || []).map((gauge) => gauge.state))].sort((a, b) => stateName(a).localeCompare(stateName(b))), [gauges]);
  const state = states.includes(view.state) ? view.state : (states.includes('NJ') ? 'NJ' : states[0] || '');
  const shown = useMemo(() => (gauges || []).filter((gauge) => gauge.state === state), [gauges, state]);
  const groups = useMemo(() => groupByRiver(shown), [shown]);
  const sites = useMemo(() => shown.map((gauge) => gauge.site_no), [shown]);
  const openKeys = useMemo(() => new Set(view.open), [view.open]);
  const keyOf = (group) => `${state}|${group.key}`;
  const anyOpen = groups.some((group) => openKeys.has(keyOf(group)));
  const metric = METRICS[view.metric];
  const customKey = view.period === 'custom' ? `${custom.start}/${custom.end}` : '';
  const range = useMemo(() => periodRange(view.period, loadedAt, custom), [view.period, loadedAt, customKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = localDay(loadedAt);
  const sitesKey = sites.join(',');
  const looking = `${metric.key}|${view.period}|${customKey}`;

  function change(patch) {
    setView((previous) => { const next = { ...previous, state, ...patch }; keepView(next); return next; });
  }

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
    // newest readings are the board; the rest of it is which way each river is going, how
    // warm the water got yesterday, and the three-day chart.
    const record = ask('now:record', (list) => fetchMeasured(list, MEASURED, loadedAt - RECENT_HOURS * HOUR, loadedAt, { ...newest, every: RECORD_EVERY }));
    // Flow's normals for those days are what every line is held against, and the band behind
    // the three-day chart. When they have to be asked for, a fortnight more is asked for with
    // them, so the board is one question to USGS tomorrow and the day after, not two.
    const near = withNeighbours(periodRange('3d', loadedAt), today);
    const normalsFlow = normalsOf(flow, near, { ahead: NORMALS_AHEAD_DAYS });

    // Any other chart is only asked for once a river is open: the board needs none of it.
    let chart = null;
    if (anyOpen && !range.error) {
      const span = `${range.startDay}/${range.endDay}`;
      const before = `${yearBefore(range.startDay)}/${yearBefore(range.endDay)}`;
      const latest = part(record, (found) => newestOf(found, metric.key, loadedAt));
      const normals = normalsOf(metric, withNeighbours(range, range.live ? today : range.endDay));
      if (view.period === '3d') {
        // Three days is the record the board was read from: nothing more to ask.
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
  }, [sitesKey, metric.key, view.period, customKey, range.error, turn, anyOpen]);

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

  function toggle(group) {
    const key = keyOf(group);
    change({ open: openKeys.has(key) ? view.open.filter((kept) => kept !== key) : [...view.open, key].slice(-MOST_OPEN_KEPT) });
  }

  // Shuts every river being shown; the ones open in another state are left as they were.
  function closeAll() {
    const mine = new Set(groups.map(keyOf));
    change({ open: view.open.filter((key) => !mine.has(key)) });
  }

  async function remove(gauge) {
    const result = await removeRiverGauge(gauge.id);
    if (!result.error) setGauges((previous) => previous.filter((row) => row.id !== gauge.id));
    else setProblem(result.error.message);
    return result;
  }

  // A new gauge is shown where it landed: its state, with its river open.
  function added(gauge) {
    if (!gauge) return;
    setGauges((previous) => [...(previous || []).filter((row) => row.id !== gauge.id), gauge]);
    setOnly(null);
    const key = `${gauge.state}|${riverGroupKey(gauge)}`;
    setView((previous) => { const next = { ...previous, state: gauge.state, open: [...previous.open.filter((kept) => kept !== key), key].slice(-MOST_OPEN_KEPT) }; keepView(next); return next; });
  }

  const taken = useMemo(() => new Set((gauges || []).map((gauge) => gauge.site_no)), [gauges]);
  const rivers = useMemo(() => new Map((gauges || []).slice().reverse().map((gauge) => [`${gauge.state}|${riverKey(gauge.river)}`, gauge.river])), [gauges]);
  // Every gauge being shown, read: what the board, the counts and the open cards all say.
  // The readings are judged as of when they were read, not as of the page being looked at.
  const reads = useMemo(() => new Map(shown.map((gauge) => [gauge.site_no, readGauge({ record: head.record.get(gauge.site_no), normalsForDay: head.normals.get(gauge.site_no)?.[dayOfYear(today)], now: head.at || loadedAt })])), [shown, head, today, loadedAt]);
  const headIn = sites.length > 0 && sites.every((site) => head.heard.has(site) && head.rated.has(site));
  const counts = useMemo(() => (headIn ? tally(shown.map((gauge) => reads.get(gauge.site_no))) : null), [headIn, shown, reads]);

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

  // Only the rivers running the way that was picked, where one was; a river with two gauges
  // stays whole if either is.
  const listed = only ? groups.filter((group) => group.gauges.some((gauge) => reads.get(gauge.site_no).level === only)) : groups;
  // What the counts leave out, said under them: a gauge that isn't reporting, or one with too
  // short a record for USGS to say what is normal for it.
  let uncounted = 'Tap a count to see just those.';
  if (counts && !head.blind && counts.rated < counts.gauges) {
    const quiet = counts.gauges - counts.reporting;
    const short = counts.reporting - counts.rated;
    uncounted = [quiet ? `${quiet} not reporting` : '', short ? `${short} with too short a record to say` : ''].filter(Boolean).join(', ');
    uncounted = `Not counted: ${uncounted}.`;
  }
  const stale = Boolean(frame) && (frame.key !== looking || refreshing);
  const waiting = range.error ? 'Pick a start and an end date above.' : chartsLost ? 'Couldn\'t read this gauge. Try Refresh in a minute.' : 'Reading the gauge...';

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

    {groups.length > 0 && <>
      <section className="gauge-glance" aria-label="At a glance">
        <Tally counts={counts} only={only} onPick={setOnly} />
        <div className="gauge-glance-foot">
          <p className="gauge-glance-showing" role="status">{only ? <><span>Only the rivers running {levelOf(only).label.toLowerCase()}.</span> <button type="button" className="text-link" onClick={() => setOnly(null)}>Show all</button></> : uncounted}</p>
          <p className="gauge-read-at"><span>{head.at ? `Read at ${clockTime(head.at)}` : 'Not read yet'}</span> <button type="button" className="text-link gauge-refresh" disabled={busy} onClick={() => reload(true)}>{busy ? 'Reading...' : 'Refresh'}</button>{anyOpen && <button type="button" className="text-link gauge-close-all" onClick={closeAll}>Close all</button>}</p>
          {states.length > 1 && <label className="gauge-state">State<select value={state} onChange={(event) => { setOnly(null); change({ state: event.target.value }); }}>{states.map((code) => <option key={code} value={code}>{stateName(code)}</option>)}</select></label>}
        </div>
      </section>

      <div className="river-board">
        {/* The board's heading, laid out on a row's own grid so each word sits over its column.
            On a narrow screen only the key to the scale is left of it. */}
        <div className="river-board-head" aria-hidden="true">
          <span className="river-board-river">River</span>
          <span className="river-line">
            <span className="river-line-place">Gauge</span>
            <span className="river-line-status">Running</span>
            <span className="river-line-spark">3 days</span>
            <span className="river-line-meter"><span className="flow-meter-key"><span>¼×</span><span>normal</span><span>4×</span></span><span className="river-line-ratio" /></span>
            <span className="river-line-now">Flow</span>
            <span className="river-line-temp">Water</span>
          </span>
          <span />
        </div>
        {listed.map((group) => {
          const open = openKeys.has(keyOf(group));
          return <RiverGroup key={group.key} group={group} open={open} onToggle={() => toggle(group)} reads={reads} head={head}>
            {open && group.gauges.map((gauge) => <GaugeCard key={gauge.id} gauge={gauge} read={reads.get(gauge.site_no)} heard={head.heard.has(gauge.site_no)} lost={head.lost} frame={frame} stale={stale} waiting={waiting} wanted={metric.key} scale={view.scale} today={today} now={loadedAt} canRemove={Boolean(isAdmin || (gauge.added_by && gauge.added_by === user?.id))} onRemove={remove}
              bar={<ChartBar name={`${gauge.river} ${gauge.place}`.trim()} view={view} range={range} custom={custom} today={today} onChange={change} onCustom={setCustom} />} />)}
          </RiverGroup>;
        })}
      </div>
      <p className="month-empty gauge-footnote">Normal is the median flow for today's date over every year a gauge has on record, and the usual range is where the middle half of those years fell. The marker on each line is the river now, on a scale from a quarter of normal to four times it. How to fish a river is a rule of thumb read off its gauge: it can't see the colour of the water, so look before you wade.</p>
      <Sources readAt={head.at} />
    </>}

    {gauges !== null && <AddGauge defaultState={state} taken={taken} rivers={rivers} onAdded={added} />}
  </main>;
}
