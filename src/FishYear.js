import React from 'react';
import Participants from './components/Participants.tsx';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useState } from 'react';
import SpeciesSelect from './components/SpeciesSelect';

const yearMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function FishYear() {
  const { profile } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [newEntry, setNewEntry] = useState(null);
  const [caughtMonths, setCaughtMonths] = useState([]);
  const [form, setForm] = useState({ month: 'September', species: '', date: new Date().toISOString().slice(0, 10), photo: '' });

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (file) setForm({ ...form, photo: URL.createObjectURL(file) });
  }

  function logCatch(event) {
    event.preventDefault();
    setNewEntry({ name: profile.display_name || 'You', ...form });
    setCaughtMonths((previous) => previous.includes(form.month) ? previous : [...previous, form.month]);
    setShowForm(false);
    setForm({ month: 'September', species: '', date: new Date().toISOString().slice(0, 10), photo: '' });
  }

  return <main className="content-shell challenge-page"><div className="page-intro challenge-intro"><div><span className="eyebrow">2026 · MONTHLY CHALLENGE</span><h1>Fish Year</h1><p>One fish, every month, or the crew never lets you forget it.</p></div><div className="challenge-actions"><button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Log a catch <span>＋</span></button><Link className="button button-quiet" to="/profile">My profile <span>→</span></Link></div></div><section className="personal-year-board"><div className="section-heading"><div><span className="eyebrow">YOUR 2026</span><h2>Catch the whole year (or don't, we'll notice)</h2></div><div className="year-legend"><span><i className="legend-caught" />Caught</span><span><i className="legend-missing" />Not caught</span></div></div><div className="year-month-grid">{yearMonths.map((month) => { const caught = caughtMonths.includes(month); return <div className={`year-month ${caught ? 'is-caught' : 'is-missing'}`} key={month}><span className="year-month-number">{String(yearMonths.indexOf(month) + 1).padStart(2, '0')}</span><strong>{month.slice(0, 3)}</strong><span className="year-month-status">{caught ? '✓ Caught' : '— Not caught'}</span></div>; })}</div><div className="year-board-footer"><strong>{caughtMonths.length} of 12 months caught</strong><span>{12 - caughtMonths.length} months left to redeem yourself</span></div></section><div className="challenge-summary"><div><strong>{caughtMonths.length}</strong><span>months logged</span></div><div><strong>{12 - caughtMonths.length}</strong><span>months to go</span></div></div><section className="table-card"><div className="section-heading"><div><span className="eyebrow">THE BOARD</span><h2>Who's actually fishing</h2></div><span className="status-badge status-badge-muted">LIVE</span></div><Participants newEntry={newEntry} /></section><section className="rules-strip"><span className="rule-index">RULES / 01</span><p>Catch at least one fish a month and post proof. Saltwater, freshwater, minnow or monster — no photo, it didn't happen.</p></section>{showForm && <div className="catch-modal-backdrop" role="presentation" onClick={() => setShowForm(false)}><form className="catch-modal" onSubmit={logCatch} onClick={(event) => event.stopPropagation()}><div className="section-heading"><div><span className="eyebrow">NEW CATCH</span><h2>Log your fish</h2></div><button className="modal-close" type="button" onClick={() => setShowForm(false)} aria-label="Close log catch form">×</button></div><label>Month<select value={form.month} onChange={(event) => setForm({ ...form, month: event.target.value })}>{yearMonths.map((month) => <option key={month}>{month}</option>)}</select></label><label>Species<SpeciesSelect value={form.species} onChange={(species) => setForm({ ...form, species })} /></label><label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label><label>Photo<input type="file" accept="image/*" onChange={handlePhoto} /></label><div className="form-actions"><button className="button button-primary" type="submit">Make it official <span>→</span></button></div></form></div>}</main>;
}
