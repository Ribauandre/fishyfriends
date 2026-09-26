import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import LogCatchModal from './components/LogCatchModal';
import { localToday } from './components/TripFormModal';
import { dateWithin } from './utils/catchDestinations';
import TournamentEntries from './components/TournamentEntries';
import { tournamentStatus, TOURNAMENT_STATUS_LABEL } from './utils/tournamentStatus';

function DeleteTournamentModal({ tournamentName, deleting, onCancel, onConfirm }) {
  return <div className="catch-modal-backdrop" role="presentation" onClick={onCancel}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">DELETE TOURNAMENT</span><h2>Are you sure?</h2></div>
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Cancel deleting tournament">×</button>
      </div>
      <p>This deletes "{tournamentName}" along with every entry, comment, and like on it. This can't be undone.</p>
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button className="button button-danger" type="button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete tournament'}</button>
      </div>
    </div>
  </div>;
}

export default function TournamentDetail() {
  const { tournamentId } = useParams();
  const { user, getTournament, listTournamentEntries, deleteTournamentEntry, deleteTournament } = useAuth();
  const [searchParams] = useSearchParams();
  const highlightEntryId = searchParams.get('entry');
  const highlightCommentId = searchParams.get('comment');
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
    setDeleting(true);
    const result = await deleteTournament(tournamentId);
    setDeleting(false);
    if (!result.error) navigate('/tournaments');
    else setConfirmingDelete(false);
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
      <TournamentEntries entries={entries} unit={tournament.unit} tournamentId={tournament.id} currentUserId={user?.id} onDelete={handleDeleteEntry} highlightId={highlightEntryId} highlightCommentId={highlightCommentId} />
    </section>

    {isCreator && <p className="tournament-danger-zone"><button type="button" className="button button-danger" onClick={() => setConfirmingDelete(true)}>Delete this tournament</button></p>}

    {showForm && <LogCatchModal preset={{ tournamentId: tournament.id, date: dateWithin(localToday(), tournament.starts_on, tournament.ends_on) }} onClose={() => setShowForm(false)} onLogged={(results) => {
      const logged = results.find((entry) => entry.key === `tournament:${tournament.id}`);
      if (logged) setEntries((previous) => [logged.result.entry, ...previous].sort((a, b) => b.size - a.size));
    }} />}
    {confirmingDelete && <DeleteTournamentModal tournamentName={tournament.name} deleting={deleting} onCancel={() => setConfirmingDelete(false)} onConfirm={handleDeleteTournament} />}
  </main>;
}

function unitWord(unit) { return unit === 'lb' ? 'weight' : 'length'; }
