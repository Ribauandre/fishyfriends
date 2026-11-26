import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import GaugeChart from './components/GaugeChart';
import {
  METRICS, PERIODS, US_STATES, againstNormal, dayOfYear, fetchContinuous, fetchDaily, fetchLatest, fetchNormals, formatReading, gaugeLink,
  groupByRiver, localDay, normalSeries, overlayLastYear, periodRange, readingAge, riverGroupKey, riverKey, searchGauges, standingText,
  stateName, summarize, summaryText, yearBefore,
} from './utils/riverGauges';

// River gauges (Plan > Gauges): what the club's rivers are doing right now, and how that
// compares with the same dates last year and with every year on record.
//
// The page is a list of rivers. Each is a drop-down holding that river's gauges: closed, it
// says in a line a gauge how the river is running against normal for today; open, it shows
// each gauge's chart. The list of gauges is the club's (the river_gauges table: any member
// adds one). Every reading comes from USGS when the page is opened — nothing is stored — a
// whole state at a time: two requests for the closed list, three more the first time a
// river is opened (utils/riverGauges.js says why the count matters). What a viewer picked
// (state, flow or temperature, how far back, log or straight axis, which rivers are open) is
// kept on the device and nowhere else: it is how they like to look at it, not club data.

const VIEW_KEY = 'fishyfriends:gauges-view';
const DEFAULT_VIEW = { state: '', metric: 'flow', period: '30d', scale: 'log', open: [] };
const MOST_OPEN_KEPT = 80;

function savedView() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(VIEW_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return DEFAULT_VIEW;
    return {
      state: typeof saved.state === 'string' ? saved.state : '',
      metric: METRICS[saved.metric] ? saved.metric : 'flow',
      // A custom range is for one look at one stretch; the next visit starts from a month.
      period: PERIODS.some((period) => period.key === saved.period && period.key !== 'custom') ? saved.period : '30d',
      scale: saved.scale === 'linear' ? 'linear' : 'log',
      open: Array.isArray(saved.open) ? saved.open.filter((key) => typeof key === 'string').slice(-MOST_OPEN_KEPT) : [],
    };
  } catch (problem) {
    return DEFAULT_VIEW;
  }
}

function keepView(view) {
  try { window.localStorage.setItem(VIEW_KEY, JSON.stringify({ state: view.state, metric: view.metric, period: view.period, scale: view.scale, open: view.open })); } catch (problem) { /* not kept, then */ }
}

const normalsStorage = () => { try { return window.localStorage; } catch (problem) { return undefined; } };

function Segmented({ label, name, value, options, onChange }) {
  return <div className={`segmented is-${name}`} role="group" aria-label={label}>
    {options.map((option) => <button key={option.key} type="button" className={option.key === value ? 'segment is-active' : 'segment'} aria-pressed={option.key === value} disabled={option.disabled} title={option.title} onClick={() => onChange(option.key)}>{option.label}</button>)}
  </div>;
}

// Below, inside or above the usual range is said with a shape and in words, never by colour
// alone — and not in the chart's own colours, which already mean something.
const SHAPE = { below: '▼', normal: '●', above: '▲' };

function Standing({ standing }) {
  return <span className={`gauge-standing is-${standing.verdict}`}><i aria-hidden="true">{SHAPE[standing.verdict]}</i>{standingText(standing)}</span>;
}

const flowStanding = (site, head, today) => {
  const reading = head.latest.get(site) || null;
  return { reading, standing: reading ? againstNormal(reading.v, head.normals.get(site)?.[dayOfYear(today)]) : null };
};

// One gauge's line in a closed river: where it is, what it is running, and how that stands
// against normal for today.
function GaugeLine({ gauge, head, today }) {
  const site = gauge.site_no;
  const heard = head.heard.has(site);
  const { reading, standing } = flowStanding(site, head, today);
  let verdict = '';
  if (!heard) verdict = head.lost ? 'No answer from USGS' : '';
  else if (!reading) verdict = 'Not reporting';
  else if (standing) verdict = <Standing standing={standing} />;
  else if (head.blind) verdict = 'Couldn\'t get today\'s normal';
  else if (head.rated.has(site)) verdict = 'No long-run normal';
  return <span className="river-line">
    <span className="river-line-place">{gauge.place || 'On the river'}</span>
    <span className="river-line-now">{!heard ? '…' : reading ? <><strong>{formatReading(reading.v, METRICS.flow)}</strong> cfs</> : '—'}</span>
    <span className="river-line-standing">{verdict}</span>
  </span>;
}

function RiverGroup({ group, open, onToggle, head, today, children }) {
  const body = useId();
  const count = group.gauges.length;
  return <section className={open ? 'river-group is-open' : 'river-group'}>
    <h2 className="river-heading">
      <button type="button" className="river-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={onToggle}>
        <span className="river-name">{group.river}</span>
        {open
          ? <span className="river-count">{count === 1 ? '1 gauge' : `${count} gauges`}</span>
          : <span className="river-lines">{group.gauges.map((gauge) => <GaugeLine key={gauge.id} gauge={gauge} head={head} today={today} />)}</span>}
        <span className="expand-icon" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
    </h2>
    {open && <div className="river-body reveal-in" id={body}>{children}</div>}
  </section>;
}

function GaugeCard({ gauge, frame, stale, waiting, wanted, scale, head, today, now, canRemove, onRemove }) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const site = gauge.site_no;
  // The card shows what the picture on screen holds, which while a new view is being read is
  // still the old one.
  const ready = Boolean(frame && frame.sites.has(site));
  const metric = METRICS[frame ? frame.metricKey : wanted];
  const latest = ready ? frame.data.latest.get(site) || null : (metric.key === 'flow' ? head.latest.get(site) || null : null);
  const { reading: flowNow, standing } = flowStanding(site, head, today);

  const series = useMemo(() => {
    if (!ready) return null;
    let points = frame.data.now.get(site) || [];
    const newest = frame.data.latest.get(site);
    // Daily means stop at yesterday: the line is carried on to the newest reading.
    if (newest && frame.range.live && (points.length === 0 || newest.t > points[points.length - 1].t)) points = [...points, newest];
    return { now: points, last: overlayLastYear(frame.data.last.get(site) || []), normal: normalSeries(frame.data.normals.get(site), frame.range.startDay, frame.range.endDay) };
  }, [ready, frame, site]);
  const nothing = ready && series.now.length === 0 && series.last.length === 0;

  async function remove() {
    setRemoving(true);
    const result = await onRemove(gauge);
    if (result?.error) { setRemoving(false); setConfirming(false); }
  }

  return <article className={stale && ready ? 'gauge-card is-stale' : 'gauge-card'} aria-label={`${gauge.river} ${gauge.place}`.trim()} aria-busy={!ready || stale || undefined}>
    <header className="gauge-card-head">
      <div className="gauge-card-name">
        <h3>{gauge.place || gauge.river}</h3>
        <p><a href={gaugeLink(site)} target="_blank" rel="noopener noreferrer">USGS {site}</a></p>
      </div>
      <div className="gauge-now">
        <span className="gauge-now-value"><i className="gauge-swatch is-now" aria-hidden="true" /><strong>{!ready && !latest ? '…' : formatReading(latest?.v, metric)}</strong> {metric.unit}</span>
        {latest && <span className="gauge-now-age">{readingAge(latest.t, now)}</span>}
      </div>
    </header>
    {(standing || (metric.key !== 'flow' && flowNow)) && <p className="gauge-verdict">
      {standing && <Standing standing={standing} />}
      {metric.key !== 'flow' && flowNow && <span className="gauge-verdict-flow">{formatReading(flowNow.v, METRICS.flow)} cfs now</span>}
    </p>}
    {!ready && <p className="month-empty gauge-note is-waiting" role="status">{waiting}</p>}
    {nothing && <p className="month-empty gauge-note">{metric.key === 'temp' ? 'This gauge doesn\'t measure water temperature.' : 'Nothing from this gauge for this stretch.'}</p>}
    {ready && !nothing && <GaugeChart title={`${gauge.river} ${gauge.place}, ${metric.name}`.replace(' ,', ',')} unit={metric.unit} scale={metric.key === 'flow' ? scale : 'linear'} floor={metric.key === 'flow' ? 0 : undefined} startMs={frame.range.startMs} endMs={frame.range.endMs} now={series.now} last={series.last} normal={series.normal} hourly={frame.period === '7d'} format={(value) => formatReading(value, metric)} />}
    {(gauge.added_by_name || canRemove) && <footer className="gauge-card-foot">
      <span>{gauge.added_by_name ? `Added by ${gauge.added_by_name}` : ''}</span>
      {canRemove && !confirming && <button type="button" className="text-link" onClick={() => setConfirming(true)}>Remove</button>}
      {canRemove && confirming && <span className="gauge-remove-confirm">Remove it for the whole club? <button type="button" className="text-link" disabled={removing} onClick={remove}>{removing ? 'Removing...' : 'Yes, remove'}</button> <button type="button" className="text-link" disabled={removing} onClick={() => setConfirming(false)}>Keep it</button></span>}
    </footer>}
  </article>;
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

// What every river's closed line is made of: each gauge's flow right now and flow's normals
// for today. `heard` and `rated` are the gauges each answer has come in for, so a gauge that
// isn't reporting can be told from one that hasn't been asked about yet.
const NO_HEAD = { latest: new Map(), normals: new Map(), heard: new Set(), rated: new Set(), lost: false, blind: false };

export default function RiverGauges({ clock = Date.now }) {
  const { user, isAdmin, listRiverGauges, removeRiverGauge } = useAuth();
  const [gauges, setGauges] = useState(null);
  const [view, setView] = useState(savedView);
  const [custom, setCustom] = useState({ start: '', end: '' });
  const [head, setHead] = useState(NO_HEAD);
  // The charts on screen: the answers and the view they answer. A new view's answers replace
  // it all at once when they are in; until then the old picture stays up, dimmed, so nothing
  // jumps while USGS is being asked.
  const [frame, setFrame] = useState(null);
  const [chartsLost, setChartsLost] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(true);
  const [turn, setTurn] = useState(0);
  const [loadedAt, setLoadedAt] = useState(() => clock());
  // Answers already had this visit, so going back to a view doesn't ask USGS again.
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
  const looking = `${metric.key}|${view.period}|${customKey}|${turn}`;

  function change(patch) {
    setView((previous) => { const next = { ...previous, state, ...patch }; keepView(next); return next; });
  }

  useEffect(() => {
    if (!sitesKey) { setBusy(false); return undefined; }
    let active = true;
    // The Refresh button wants the newest readings, not the copy a browser may keep for an
    // hour. Only what can have changed is asked for that way: last year's record and the
    // long-run normals are the same as they were a minute ago.
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

    const flow = METRICS.flow;
    const latestFlow = ask('latest|flow', (list) => fetchLatest(list, flow, newest));
    // The charts are only asked for once a river is open: the closed list needs none of it.
    let chart = null;
    if (anyOpen && !range.error) {
      const span = `${range.startDay}/${range.endDay}`;
      const before = `${yearBefore(range.startDay)}/${yearBefore(range.endDay)}`;
      chart = {
        latest: metric.key === 'flow' ? latestFlow : ask(`latest|${metric.key}`, (list) => fetchLatest(list, metric, newest)),
        now: view.period === '7d'
          ? ask(`measured|${metric.key}|${span}`, (list) => fetchContinuous(list, metric, range.startMs, range.endMs, newest))
          : ask(`daily|${metric.key}|${span}`, (list) => fetchDaily(list, metric, range.startDay, range.endDay, newest)),
        last: ask(`daily|${metric.key}|${before}`, (list) => fetchDaily(list, metric, yearBefore(range.startDay), yearBefore(range.endDay), settled)),
        normals: ask(`normals|${metric.key}|${span}`, (list) => fetchNormals(list, metric, range.startDay, range.endDay, { ...settled, storage: normalsStorage() })),
      };
    }
    // Flow's normals for today feed the sentence at the top and every closed river, whatever
    // is being charted. They are asked for after the chart's, which for a stretch of flow
    // ending today already holds them.
    const normalsFlow = ask(`normals|flow|${today}`, (list) => (chart ? chart.normals.got.catch(() => null) : Promise.resolve()).then(() => fetchNormals(list, flow, today, today, { ...settled, storage: normalsStorage() })));

    const also = (known, more) => new Set([...known, ...more]);
    const headIn = Promise.all([
      latestFlow.got.then(
        (latest) => { if (active) setHead((previous) => ({ ...previous, latest, heard: also(previous.heard, sites), lost: false })); },
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
        setFrame((previous) => ({ key: looking, metricKey: metric.key, period: view.period, range, sites: also(previous && previous.key === looking ? previous.sites : [], sites), data }));
      });
    }
    Promise.all([headIn, chartIn]).then(() => { if (active) setBusy(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitesKey, metric.key, view.period, customKey, range.error, turn, anyOpen]);

  function refresh() {
    memo.current.clear();
    fresh.current = true;
    setLoadedAt(clock());
    setTurn((count) => count + 1);
  }

  function toggle(group) {
    const key = keyOf(group);
    change({ open: openKeys.has(key) ? view.open.filter((kept) => kept !== key) : [...view.open, key].slice(-MOST_OPEN_KEPT) });
  }

  function openAll(open) {
    const mine = new Set(groups.map(keyOf));
    const others = view.open.filter((key) => !mine.has(key));
    change({ open: open ? [...others, ...mine].slice(-MOST_OPEN_KEPT) : others });
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
    const key = `${gauge.state}|${riverGroupKey(gauge)}`;
    setView((previous) => { const next = { ...previous, state: gauge.state, open: [...previous.open.filter((kept) => kept !== key), key].slice(-MOST_OPEN_KEPT) }; keepView(next); return next; });
  }

  const taken = useMemo(() => new Set((gauges || []).map((gauge) => gauge.site_no)), [gauges]);
  const rivers = useMemo(() => new Map((gauges || []).slice().reverse().map((gauge) => [`${gauge.state}|${riverKey(gauge.river)}`, gauge.river])), [gauges]);
  const headIn = sites.length > 0 && sites.every((site) => head.heard.has(site) && head.rated.has(site));
  let summary = 'Reading the gauges...';
  if (gauges === null) summary = 'Pulling the club\'s gauges...';
  else if (shown.length === 0) summary = 'No gauges on the club\'s list yet. Add the first one below.';
  else if (headIn) {
    const counts = summarize(shown, head.latest, head.normals, today);
    summary = head.blind && counts.reporting > 0 ? `${counts.reporting} of ${shown.length} gauges reporting. Today's normals couldn't be had to hold them against.` : summaryText(counts, stateName(state));
  } else if (head.lost) summary = 'USGS isn\'t answering right now.';

  const stale = Boolean(frame) && frame.key !== looking;
  const waiting = range.error ? 'Pick a start and an end date above.' : chartsLost ? 'Couldn\'t read this gauge. Try Refresh in a minute.' : 'Reading the gauge...';
  const allOpen = groups.length > 0 && groups.every((group) => openKeys.has(keyOf(group)));

  return <main className="content-shell gauges-page">
    <div className="page-intro">
      <div>
        <span className="eyebrow">STRAIGHT FROM USGS</span>
        <h1>River gauges</h1>
        <p className="gauge-summary" role="status">{summary}</p>
      </div>
      <FishIllustration species="trout" className="intro-sticker" />
    </div>

    {gauges !== null && gauges.length > 0 && <section className="gauge-controls" aria-label="What to show">
      <label className="gauge-state">State<select value={state} onChange={(event) => change({ state: event.target.value })}>{states.map((code) => <option key={code} value={code}>{stateName(code)}</option>)}</select></label>
      <Segmented label="Reading" name="reading" value={metric.key} onChange={(key) => change({ metric: key })} options={[{ key: 'flow', label: 'Flow' }, { key: 'temp', label: 'Water temp' }]} />
      <Segmented label="How far back" name="period" value={view.period} onChange={(key) => change({ period: key })} options={PERIODS.map((period) => ({ key: period.key, label: period.label }))} />
      <Segmented label="Axis" name="axis" value={metric.key === 'flow' ? view.scale : 'linear'} onChange={(key) => change({ scale: key })} options={[{ key: 'log', label: 'Log', disabled: metric.key !== 'flow', title: metric.key !== 'flow' ? 'A log axis is for flow' : undefined }, { key: 'linear', label: 'Linear' }]} />
      <button className="button button-quiet gauge-refresh" type="button" disabled={busy} onClick={refresh}>{busy ? 'Reading...' : 'Refresh'}</button>
      {view.period === 'custom' && <div className="gauge-custom">
        <label>From<input type="date" value={custom.start} max={custom.end || today} onChange={(event) => setCustom({ ...custom, start: event.target.value })} /></label>
        <label>To<input type="date" value={custom.end} min={custom.start || undefined} max={today} onChange={(event) => setCustom({ ...custom, end: event.target.value })} /></label>
        {range.error && <p className="field-hint" role="status">{range.error}</p>}
      </div>}
    </section>}

    {problem && <p className="form-error gauge-problem" role="alert">{problem}</p>}

    {groups.length > 0 && <>
      <div className="gauge-legend-row">
        <ul className="gauge-legend" aria-label="What the lines are">
          <li><i className="gauge-swatch is-now" aria-hidden="true" />This period</li>
          <li><i className="gauge-swatch is-last" aria-hidden="true" />Same dates last year</li>
          <li><i className="gauge-swatch is-normal" aria-hidden="true" />Daily median, all years</li>
        </ul>
        <button type="button" className="text-link gauge-open-all" onClick={() => openAll(!allOpen)}>{allOpen ? 'Close all' : 'Open all'}</button>
      </div>
      <div className="river-list">
        {groups.map((group) => {
          const open = openKeys.has(keyOf(group));
          return <RiverGroup key={group.key} group={group} open={open} onToggle={() => toggle(group)} head={head} today={today}>
            {open && group.gauges.map((gauge) => <GaugeCard key={gauge.id} gauge={gauge} frame={frame} stale={stale} waiting={waiting} wanted={metric.key} scale={view.scale} head={head} today={today} now={loadedAt} canRemove={Boolean(isAdmin || (gauge.added_by && gauge.added_by === user?.id))} onRemove={remove} />)}
          </RiverGroup>;
        })}
      </div>
      <p className="month-empty gauge-footnote">Normal is the median flow for today's date over every year a gauge has on record, and that is what the cfs are counted from. A river is called near normal while it is inside the range USGS itself calls normal: the middle half of those years.</p>
    </>}

    {gauges !== null && <AddGauge defaultState={state} taken={taken} rivers={rivers} onAdded={added} />}
  </main>;
}
