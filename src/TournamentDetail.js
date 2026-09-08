import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import SpeciesSelect from './components/SpeciesSelect';
import TournamentEntries from './components/TournamentEntries';
import extractPhotoDate from './utils/photoDate';
import { tournamentStatus, TOURNAMENT_STATUS_LABEL } from './utils/tournamentStatus';

function EntryModal({ tournamentId, unit, onClose, onSaved }) {
  const { submitTournamentEntry } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ species: '', size: '', date: new Date().toISOString().slice(0, 10), photoFile: null, dateFromPhoto: false });

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((previous) => ({ ...previous, photoFile: file, dateFromPhoto: false }));
    const takenAt = await extractPhotoDate(file);
    if (takenAt) setForm((previous) => ({ ...previous, date: takenAt, dateFromPhoto: true }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await submitTournamentEntry({ tournamentId, species: form.species, size: form.size, caughtAt: form.date, file: form.photoFile });
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved(result.entry);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">NEW ENTRY</span><h2>Log your fish</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close log entry form">×</button>
      </div>
      <label>Photo<input type="file" accept="image/*" onChange={handlePhoto} /></label>
      <label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, dateFromPhoto: false })} />{form.dateFromPhoto && <span className="field-hint">✓ Grabbed from the photo</span>}</label>
      <label>Species<SpeciesSelect value={form.species} onChange={(species) => setForm({ ...form, species })} /></label>
      <label>Size ({unit === 'lb' ? 'lbs' : 'inches'})<input required type="number" step="0.1" min="0.1" value={form.size} onChange={(event) => setForm({ ...form, size: event.target.value })} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Make it official'} <span>→</span></button></div>
    </form>
  </div>;
}

export default function TournamentDetail() {
  const { tournamentId } = useParams();
  const { user, getTournament, listTournamentEntries, deleteTournamentEntry, deleteTournament } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightEntryId = searchParams.get('entry');
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getTournament(tournamentId), listTournamentEntries(tournamentId)]).then(([tournamentData, entryData]) => {
      if (!active) return;
      setTournament(tournamentData);
      setEntries(entryData);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function handleDeleteEntry(id) {
    const result = await deleteTournamentEntry(id);
    if (!result.error) setEntries((previous) => previous.filter((entry) => entry.id !== id));
  }

  async function handleDeleteTournament() {
    const result = await deleteTournament(tournamentId);
    if (!result.error) navigate('/tournaments');
  }

  if (loading) return <main className="content-shell challenge-page"><p className="month-empty">Loading the tournament...</p></main>;

  if (!tournament) return <main className="content-shell challenge-page">
    <p className="month-empty">That tournament doesn't exist, or it's been taken down.</p>
    <Link className="text-link" to="/tournaments">← Back to tournaments</Link>
  </main>;

  const status = tournamentStatus(tournament);
  const isCreator = user?.id === tournament.created_by;

  return <main className="content-shell challenge-page">
    <div className="page-intro tournament-intro">
      <div>
        <span className="eyebrow">{TOURNAMENT_STATUS_LABEL[status].toUpperCase()} · {tournament.starts_on} – {tournament.ends_on}</span>
        <h1>{tournament.name}</h1>
        <p>Started by {tournament.created_by_name}. Biggest {unitWord(tournament.unit)} wins.</p>
      </div>
      <div className="challenge-actions">
        <button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Log an entry <span>＋</span></button>
        <Link className="button button-quiet" to="/tournaments">All tournaments <span>→</span></Link>
      </div>
    </div>

    {tournament.rules && <section className="rules-strip">
      <span className="rule-index">RULES</span>
      <p>{tournament.rules}</p>
    </section>}

    <section className="table-card">
      <div className="section-heading">
        <div><span className="eyebrow">THE BOARD</span><h2>Current standings</h2></div>
        <span className={`status-badge ${status === 'active' ? '' : 'status-badge-muted'}`}>{TOURNAMENT_STATUS_LABEL[status]}</span>
      </div>
      <TournamentEntries entries={entries} unit={tournament.unit} tournamentId={tournament.id} currentUserId={user?.id} onDelete={handleDeleteEntry} highlightId={highlightEntryId} />
    </section>

    {isCreator && <p className="tournament-danger-zone"><button type="button" className="text-link" onClick={handleDeleteTournament}>Delete this tournament</button></p>}

    {showForm && <EntryModal tournamentId={tournament.id} unit={tournament.unit} onClose={() => setShowForm(false)} onSaved={(entry) => { setEntries((previous) => [entry, ...previous].sort((a, b) => b.size - a.size)); setShowForm(false); }} />}
  </main>;
}

function unitWord(unit) { return unit === 'lb' ? 'weight' : 'length'; }
