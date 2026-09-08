import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import { tournamentStatus, TOURNAMENT_STATUS_LABEL } from './utils/tournamentStatus';

function TournamentCard({ tournament }) {
  const status = tournamentStatus(tournament);
  return <Link className={`tournament-card tournament-card-${status}`} to={`/tournaments/${tournament.id}`}>
    <span className={`status-badge ${status === 'active' ? '' : 'status-badge-muted'}`}>{TOURNAMENT_STATUS_LABEL[status]}</span>
    <h3>{tournament.name}</h3>
    <span className="muted-label">{tournament.starts_on} — {tournament.ends_on}</span>
    {tournament.rules && <p>{tournament.rules}</p>}
    <span className="note-go">See the board →</span>
  </Link>;
}

function CreateTournamentModal({ onClose, onCreated }) {
  const { createTournament } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', rules: '', unit: 'in', startsOn: new Date().toISOString().slice(0, 10), endsOn: new Date().toISOString().slice(0, 10) });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await createTournament(form);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onCreated(result.tournament);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">NEW TOURNAMENT</span><h2>Start a tournament</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close start tournament form">×</button>
      </div>
      <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Summer Fluke Classic" /></label>
      <label>Rules<textarea rows="3" value={form.rules} onChange={(event) => setForm({ ...form, rules: event.target.value })} placeholder="Biggest fish wins. Photo with a tape measure required." /></label>
      <label>Measured in
        <select value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })}>
          <option value="in">Inches</option>
          <option value="lb">Pounds</option>
        </select>
      </label>
      <label>Starts<input required type="date" value={form.startsOn} onChange={(event) => setForm({ ...form, startsOn: event.target.value })} /></label>
      <label>Ends<input required type="date" value={form.endsOn} onChange={(event) => setForm({ ...form, endsOn: event.target.value })} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Make it official'} <span>→</span></button></div>
    </form>
  </div>;
}

export default function Tournaments() {
  const { listTournaments } = useAuth();
  const [tournaments, setTournaments] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    listTournaments().then((data) => { if (active) setTournaments(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const grouped = { active: [], upcoming: [], ended: [] };
  for (const tournament of tournaments || []) grouped[tournamentStatus(tournament)].push(tournament);

  return <main className="content-shell tournaments-page">
    <div className="page-intro tournament-intro" data-tour="tournament-highlight">
      <div>
        <span className="eyebrow">BRAGGING RIGHTS</span>
        <h1>Tournaments</h1>
        <p>Start one, name the rules, and let the crew fight over the leaderboard.</p>
        <button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Start a tournament <span>＋</span></button>
      </div>
      <FishIllustration species="stripedbass" className="intro-sticker" />
    </div>

    {tournaments === null && <p className="month-empty">Loading tournaments...</p>}

    {tournaments !== null && tournaments.length === 0 && <div className="empty-state">
      <FishIllustration species="tuna" className="empty-state-sticker" />
      <p className="month-empty">No tournaments yet. Be the first to start one.</p>
    </div>}

    {grouped.active.length > 0 && <section className="tournaments-section">
      <div className="section-heading-mini"><span className="eyebrow">HAPPENING NOW</span></div>
      <div className="tournaments-grid">{grouped.active.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}</div>
    </section>}

    {grouped.upcoming.length > 0 && <section className="tournaments-section">
      <div className="section-heading-mini"><span className="eyebrow">COMING UP</span></div>
      <div className="tournaments-grid">{grouped.upcoming.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}</div>
    </section>}

    {grouped.ended.length > 0 && <section className="tournaments-section">
      <div className="section-heading-mini"><span className="eyebrow">ARCHIVE</span></div>
      <div className="tournaments-grid">{grouped.ended.map((tournament) => <TournamentCard key={tournament.id} tournament={tournament} />)}</div>
    </section>}

    {showForm && <CreateTournamentModal onClose={() => setShowForm(false)} onCreated={(tournament) => navigate(`/tournaments/${tournament.id}`)} />}
  </main>;
}
