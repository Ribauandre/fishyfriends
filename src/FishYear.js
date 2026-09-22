import React, { useEffect, useRef, useState } from 'react';
import Participants from './components/Participants.tsx';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import SpeciesSelect from './components/SpeciesSelect';
import extractPhotoDate from './utils/photoDate';
import { FISH_YEAR } from './constants';
import { bestStreak, currentStreak } from './utils/fishYearStreak';

const yearMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthFromDate(dateStr) {
  return yearMonths[Number(dateStr.slice(5, 7)) - 1] || yearMonths[0];
}

// A shareable summary of the user's own season — hidden until they've actually logged
// something, so a brand-new angler doesn't see a recap full of dashes.
function FishYearRecap({ catches, userId, monthsCaught, longestStreak }) {
  const [shared, setShared] = useState(false);
  const myCatches = catches.filter((entry) => entry.user_id === userId);
  const totalCatches = myCatches.length;
  const topSpecies = (() => {
    if (!myCatches.length) return '';
    const counts = {};
    myCatches.forEach((entry) => { counts[entry.species] = (counts[entry.species] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  })();

  async function handleShare() {
    const text = `My ${FISH_YEAR} Fish Year recap: ${monthsCaught}/12 months, ${totalCatches} catch${totalCatches === 1 ? '' : 'es'}${topSpecies ? `, mostly ${topSpecies}` : ''}${longestStreak >= 2 ? `, ${longestStreak}-month streak` : ''}.`;
    const shareData = { title: `${FISH_YEAR} Fish Year recap`, text, url: `${window.location.origin}/fish-year` };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* share sheet cancelled */ }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text} ${shareData.url}`);
      setShared(true);
      setTimeout(() => setShared(false), 1800);
    }
  }

  if (!totalCatches) return null;

  return <section className="table-card fish-year-recap">
    <div className="section-heading">
      <div><span className="eyebrow">YOUR SEASON</span><h2>{FISH_YEAR} recap</h2></div>
      <button className="button button-quiet" type="button" onClick={handleShare}>{shared ? 'Copied!' : 'Share'} <span>↗</span></button>
    </div>
    <div className="participant-summary">
      <div><strong>{monthsCaught}</strong><span>months caught</span></div>
      <div><strong>{totalCatches}</strong><span>total catches</span></div>
      <div><strong>{topSpecies || '—'}</strong><span>top species</span></div>
      <div><strong>{longestStreak || '—'}</strong><span>best streak</span></div>
    </div>
  </section>;
}

export default function FishYear() {
  const { user, listFishYearCatches, logFishYearCatch, deleteFishYearCatch } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightCatchId = searchParams.get('catch');
  const highlightCommentId = searchParams.get('comment');
  const [showForm, setShowForm] = useState(false);
  const [catches, setCatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ species: '', date: new Date().toISOString().slice(0, 10), photoFile: null, dateFromPhoto: false });
  // A ref alongside `saving` state: state updates aren't guaranteed to re-render (and disable
  // the submit button) before a near-simultaneous second tap's handler starts, so the guard
  // that actually stops a double submit has to be synchronous.
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    listFishYearCatches(FISH_YEAR).then((data) => { if (active) { setCatches(data); setLoading(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const caughtMonths = Array.from(new Set(catches.filter((c) => c.user_id === user?.id).map((c) => c.month)));
  const caughtMonthIndexes = caughtMonths.map((month) => yearMonths.indexOf(month));
  const today = new Date();
  const referenceMonthIndex = today.getFullYear() === FISH_YEAR ? today.getMonth() : 11;
  const streak = currentStreak(caughtMonthIndexes, referenceMonthIndex);
  const longestStreak = bestStreak(caughtMonthIndexes);

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((previous) => ({ ...previous, photoFile: file, dateFromPhoto: false }));
    const takenAt = await extractPhotoDate(file);
    if (takenAt) setForm((previous) => ({ ...previous, date: takenAt, dateFromPhoto: true }));
  }

  async function logCatch(event) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError('');
    const result = await logFishYearCatch({ year: FISH_YEAR, month: monthFromDate(form.date), species: form.species, caughtAt: form.date, file: form.photoFile });
    savingRef.current = false;
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    setCatches((previous) => [...previous, result.catchEntry]);
    setShowForm(false);
    setForm({ species: '', date: new Date().toISOString().slice(0, 10), photoFile: null, dateFromPhoto: false });
  }

  async function handleDeleteCatch(id) {
    const result = await deleteFishYearCatch(id);
    if (!result.error) setCatches((previous) => previous.filter((entry) => entry.id !== id));
  }

  return <main className="content-shell challenge-page"><div className="page-intro challenge-intro"><div><span className="eyebrow">2026 · MONTHLY CHALLENGE</span><h1>Fish Year</h1><p>At least one fish, every month, or the crew never lets you forget it.</p></div><div className="challenge-actions"><button className="button button-primary" type="button" data-tour="log-catch-button" onClick={() => setShowForm(true)}>Log a catch <span>＋</span></button><Link className="button button-quiet" to="/profile">My profile <span>→</span></Link></div></div><section className="personal-year-board" data-tour="fish-year-card"><div className="section-heading"><div><span className="eyebrow">YOUR 2026</span><h2>Catch the whole year (or don't, we'll notice)</h2></div>{longestStreak >= 2 && <span className={streak === longestStreak ? 'status-badge' : 'status-badge status-badge-muted'}>{streak === longestStreak ? `${streak}-MONTH STREAK` : `BEST STREAK: ${longestStreak}`}</span>}</div><div className="year-month-grid">{yearMonths.map((month) => { const caught = caughtMonths.includes(month); return <div className={`year-month ${caught ? 'is-caught' : 'is-missing'}`} key={month}><span className="year-month-number">{String(yearMonths.indexOf(month) + 1).padStart(2, '0')}</span><strong>{month.slice(0, 3)}</strong><span className="year-month-status">{caught ? '✓ Caught' : '— Not caught'}</span></div>; })}</div><div className="year-board-footer"><strong>{caughtMonths.length} of 12 months caught</strong><span>{12 - caughtMonths.length} months left to redeem yourself</span></div></section><FishYearRecap catches={catches} userId={user?.id} monthsCaught={caughtMonths.length} longestStreak={longestStreak} /><section className="table-card"><div className="section-heading"><div><span className="eyebrow">THE BOARD</span><h2>Who's actually fishing</h2></div><span className="status-badge status-badge-muted">LIVE</span></div>{loading ? <p className="month-empty">Loading the board...</p> : <Participants catches={catches} currentUserId={user?.id} onDelete={handleDeleteCatch} highlightId={highlightCatchId} highlightCommentId={highlightCommentId} />}</section><section className="rules-strip"><span className="rule-index">RULES / 01</span><p>Catch at least one fish a month and post proof. Saltwater, freshwater, minnow or monster — no photo, it didn't happen.</p></section>{showForm && <div className="catch-modal-backdrop" role="presentation" onClick={() => setShowForm(false)}><form className="catch-modal" onSubmit={logCatch} onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">NEW CATCH</span><h2>Log your fish</h2></div><button className="modal-close" type="button" onClick={() => setShowForm(false)} aria-label="Close log catch form">×</button></div><label>Photo<input type="file" accept="image/*" onChange={handlePhoto} /></label><label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, dateFromPhoto: false })} />{form.dateFromPhoto && <span className="field-hint">✓ Grabbed from the photo</span>}</label><label>Species<SpeciesSelect value={form.species} onChange={(species) => setForm({ ...form, species })} /></label>{error && <p className="form-error">{error}</p>}<div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Make it official'} <span>→</span></button></div></form></div>}</main>;
}
