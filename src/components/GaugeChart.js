import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { axisLabel, bandPath, extent, linearAxis, linearScale, linePath, logAxis, logScale, nearest, nearestIndex, segments, timeTicks } from '../utils/gaugeChart';

// One gauge's chart: this stretch of its record, the same dates a year ago, and what is
// normal for each of those dates over every year on record — the median as a dashed line,
// with the range the middle half of years fell in as a band behind it. Plain SVG drawn to
// the width it is given — no chart library, nothing animated — in the site's own line weights
// and colours.
//
// A value is read off by pointing: a finger or the mouse along the chart moves a rule to the
// nearest reading, and the line under the chart says the date and each line's value there.
// That line stands in for a floating tooltip, which a thumb covers and a phone's edge clips,
// and it keeps its shape as the numbers change, so the card doesn't twitch under the finger.
// It is the chart's legend as well: each value sits under its line's swatch and name. With
// nothing pointed at it reads the newest values. Dragging up or down still scrolls the page.
// From the keyboard the chart is a slider: the arrow keys walk the rule along the readings
// and a screen reader is told the same line.

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const HEIGHT = 190;
const MARGIN = { top: 10, right: 10, bottom: 24, left: 46 };

// Drawn in this order, so this period's line lies over the others.
const LINES = [
  { key: 'normal', label: 'Normal' },
  { key: 'last', label: 'Last year' },
  { key: 'now', label: 'This period' },
];
const READ_ORDER = ['now', 'last', 'normal'];
const LABEL = Object.fromEntries(LINES.map((line) => [line.key, line.label]));

// A reading is named by when it was taken, on the viewer's clock. A daily value is named by
// its own date (it carries one, `day`), which is the same date everywhere.
const dateText = (t, withTime) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
const dayText = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const stamp = (point, withTime) => (point.day ? dayText(point.day) : dateText(point.t, withTime));

// `lines` says which of the three are part of this chart at all (a three-day chart has no
// last year): one left out has no place in the line under the chart either. `mark` is a
// level worth a rule of its own ({ value, label }), drawn only where the axis reaches it.
export default function GaugeChart({ title, unit, scale = 'log', floor, startMs, endMs, now = [], last = [], normal = [], lines = READ_ORDER, mark = null, format = axisLabel, hourly = false }) {
  const box = useRef(null);
  // React's ids carry punctuation that has no business inside a url(#...) reference.
  const clip = `gauge-clip-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [width, setWidth] = useState(320);
  const [pointed, setPointed] = useState(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const measure = () => { const measured = Math.round(element.clientWidth); if (measured > 0) setWidth(measured); };
    measure();
    if (typeof ResizeObserver !== 'function') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const drawn = useMemo(() => {
    // A day either side of the window is kept so a line runs to the edge instead of stopping
    // at the last reading inside it; the plot clips what is beyond.
    const inView = (points) => points.filter((point) => point.t >= startMs - DAY && point.t <= endMs + DAY);
    return { now: inView(now), last: inView(last), normal: inView(normal) };
  }, [now, last, normal, startMs, endMs]);

  const log = scale === 'log';
  const range = extent([drawn.now, drawn.last, drawn.normal], { positive: log });
  const axis = !range ? null : log ? logAxis(range[0], range[1]) : linearAxis(range[0], range[1], { floor });
  const left = MARGIN.left;
  const right = Math.max(left + 40, width - MARGIN.right);
  const bottom = HEIGHT - MARGIN.bottom;
  const x = linearScale(startMs, endMs, left, right);
  const y = axis ? (log ? logScale : linearScale)(axis.min, axis.max, bottom, MARGIN.top) : () => bottom;
  // A day's worth of daily means is a point a day; the measured record (`hourly`: this
  // period and last year both, on the 3- and 7-day charts) is a point an hour or closer. The
  // normals are daily.
  const gap = { now: hourly ? 6 * HOUR : 3.5 * DAY, last: hourly ? 6 * HOUR : 3.5 * DAY, normal: 3.5 * DAY };
  const inWindow = (point) => point.t >= startMs && point.t <= endMs;
  const banded = drawn.normal.filter((point) => Number.isFinite(point.low) && Number.isFinite(point.high));

  // What the rule walks along: this period's readings, or failing those whichever line there is.
  const track = (drawn.now.some(inWindow) ? drawn.now : drawn.last.some(inWindow) ? drawn.last : drawn.normal).filter(inWindow);
  const newest = drawn.now.length ? drawn.now[drawn.now.length - 1] : null;
  const at = pointed ?? newest?.t ?? (track.length ? track[track.length - 1].t : null);
  const reach = Math.max((endMs - startMs) / 40, hourly ? 2 * HOUR : 1.5 * DAY);
  const read = at === null ? {} : {
    now: nearest(drawn.now, at, hourly ? reach : Math.max(reach, DAY)),
    last: nearest(drawn.last, at, hourly ? reach : Math.max(reach, DAY)),
    normal: nearest(drawn.normal, at, Math.max(reach, DAY)),
  };
  // The rule stands on the reading being read, not wherever the finger happens to be.
  const anchor = read.now || read.last || read.normal || null;
  const ruleAt = pointed === null ? null : Math.min(endMs, Math.max(startMs, anchor ? anchor.t : pointed));
  const when = at === null ? '' : anchor ? stamp(anchor, hourly && anchor !== read.normal) : dateText(at, false);
  // A line with nothing to draw in this stretch (a gauge with no long-run record, one that
  // wasn't there last year) has no column under the chart. That is settled for as long as the
  // chart shows this stretch, so pointing along it still never changes the shape.
  const shown = READ_ORDER.filter((key) => lines.includes(key) && (key === 'now' || drawn[key].length > 0));
  const said = shown.filter((key) => read[key]).map((key) => `${LABEL[key].toLowerCase()} ${format(read[key].v)} ${unit}`);
  const spoken = at === null || said.length === 0 ? 'Nothing recorded for this stretch' : `${when}: ${said.join(', ')}`;
  const usual = read.normal && Number.isFinite(read.normal.low) && Number.isFinite(read.normal.high) ? `${format(read.normal.low)} to ${format(read.normal.high)}` : '';

  function point(event) {
    if (!Number.isFinite(event.clientX)) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const t = startMs + ((event.clientX - bounds.left - left) / Math.max(1, right - left)) * (endMs - startMs);
    setPointed(Math.min(endMs, Math.max(startMs, t)));
  }

  function step(event) {
    if (track.length === 0) return;
    let index = nearestIndex(track, at ?? track[track.length - 1].t);
    const stride = Math.max(1, Math.round(track.length / 10));
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') index -= 1;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') index += 1;
    else if (event.key === 'PageDown') index -= stride;
    else if (event.key === 'PageUp') index += stride;
    else if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = track.length - 1;
    else if (event.key === 'Escape') { setPointed(null); return; }
    else return;
    event.preventDefault();
    setPointed(track[Math.min(track.length - 1, Math.max(0, index))].t);
  }

  const slider = track.length > 0 ? {
    role: 'slider', tabIndex: 0, 'aria-orientation': 'horizontal', 'aria-label': `${title}: readings along the chart`,
    'aria-valuemin': 0, 'aria-valuemax': track.length - 1, 'aria-valuenow': Math.max(0, nearestIndex(track, at ?? 0)), 'aria-valuetext': spoken,
    onKeyDown: step, onBlur: () => setPointed(null),
  } : { role: 'img', 'aria-label': `${title}: nothing recorded for this stretch` };

  // A year of daily values on a phone is more than a point a pixel: thinner lines keep it readable.
  const dense = drawn.now.length > (right - left) / 1.5;
  const marked = axis && mark && mark.value >= axis.min && mark.value <= axis.max ? Math.round(y(mark.value)) + 0.5 : null;

  return <div className={dense ? 'gauge-chart is-dense' : 'gauge-chart'} ref={box}>
    <div className="gauge-chart-scrub" {...slider}>
      <svg className="gauge-chart-plot" aria-hidden="true" width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} onPointerMove={point} onPointerDown={point} onPointerLeave={() => setPointed(null)}>
        <defs><clipPath id={clip}><rect x={left} y="0" width={right - left} height={HEIGHT} /></clipPath></defs>
        {axis && lines.includes('normal') && <g clipPath={`url(#${clip})`}>
          {segments(banded, gap.normal).map((piece, index) => <path key={index} className="gauge-band" d={bandPath(piece, x, y)} />)}
        </g>}
        {axis && axis.ticks.map((tick) => <g key={tick}>
          <line className="gauge-grid" x1={left} x2={right} y1={Math.round(y(tick)) + 0.5} y2={Math.round(y(tick)) + 0.5} />
          <text className="gauge-tick" x={left - 6} y={y(tick)} dy="0.32em" textAnchor="end">{axisLabel(tick)}</text>
        </g>)}
        <line className="gauge-axis" x1={left} x2={right} y1={bottom + 0.5} y2={bottom + 0.5} />
        {timeTicks(startMs, endMs, Math.max(2, Math.min(7, Math.floor((right - left) / 60)))).map((tick) => <g key={tick.t}>
          <line className="gauge-axis" x1={Math.round(x(tick.t)) + 0.5} x2={Math.round(x(tick.t)) + 0.5} y1={bottom} y2={bottom + 4} />
          {/* (A date at the very edge of the plot is set inside it rather than cut off.) */}
          <text className="gauge-tick" x={x(tick.t)} y={bottom + 16} textAnchor={x(tick.t) > right - 20 ? 'end' : x(tick.t) < left + 20 ? 'start' : 'middle'}>{tick.label}</text>
        </g>)}
        {marked !== null && <g>
          <line className="gauge-mark" x1={left} x2={right} y1={marked} y2={marked} />
          <text className="gauge-mark-label" x={right - 4} y={marked - 5} textAnchor="end">{mark.label}</text>
        </g>}
        {axis && <g clipPath={`url(#${clip})`}>
          {LINES.filter((line) => lines.includes(line.key)).map((line) => segments(drawn[line.key], gap[line.key]).map((piece, index) => <path key={`${line.key}-${index}`} className={`gauge-line gauge-line-${line.key}`} d={linePath(piece, x, y)} />))}
        </g>}
        {axis && ruleAt !== null && <line className="gauge-rule" x1={Math.round(x(ruleAt)) + 0.5} x2={Math.round(x(ruleAt)) + 0.5} y1={MARGIN.top} y2={bottom} />}
        {axis && newest && inWindow(newest) && <rect className="gauge-newest" x={x(newest.t) - 4} y={y(newest.v) - 4} width="8" height="8" />}
        {axis && pointed !== null && read.now && inWindow(read.now) && read.now !== newest && <rect className="gauge-newest is-read" x={x(read.now.t) - 4} y={y(read.now.v) - 4} width="8" height="8" />}
        {!axis && <text className="gauge-none" x={(left + right) / 2} y={(MARGIN.top + bottom) / 2} textAnchor="middle">Nothing recorded for this stretch</text>}
      </svg>
    </div>
    <p className={`gauge-readout has-${shown.length}`}>
      {at === null || !axis ? <span className="gauge-readout-date">&nbsp;</span> : <>
        <span className="gauge-readout-date">{when}</span>
        {shown.map((key) => <span key={key} className={`gauge-readout-value is-${key}`}>
          <span className="gauge-readout-label"><i aria-hidden="true" />{LABEL[key]}</span>
          <strong>{read[key] ? `${format(read[key].v)} ${unit}` : '—'}</strong>
          {key === 'normal' && <span className="gauge-readout-usual">{usual ? `usually ${usual}` : ' '}</span>}
        </span>)}
      </>}
    </p>
  </div>;
}
