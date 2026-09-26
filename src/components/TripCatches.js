import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FishIllustration from './FishIllustration';
import SpeciesSelect from './SpeciesSelect';
import speciesIcon from '../utils/speciesOptions';
import { catchRecap } from '../utils/tripMath';
import { localToday } from './TripFormModal';

function LogCatchForm({ tripId, onLogged, onClose }) {
  const { logTripCatch } = useAuth();
  const [form, setForm] = useState({ species: '', lengthIn: '', caughtAt: localToday(), file: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await logTripCatch({ tripId, ...form });
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    onLogged(result.tripCatch);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">TRIP CATCH</span><h2>Log a fish</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close log catch form">×</button>
      </div>
      <label>Species<SpeciesSelect value={form.species} onChange={(species) => setForm({ ...form, species })} /></label>
      <label>Length in inches (optional)<input inputMode="decimal" value={form.lengthIn} onChange={(event) => setForm({ ...form, lengthIn: event.target.value })} placeholder="28" /></label>
      <label>Date<input type="date" value={form.caughtAt} onChange={(event) => setForm({ ...form, caughtAt: event.target.value })} /></label>
      <label>Photo (optional)<input type="file" accept="image/*" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log it'} <span>→</span></button></div>
    </form>
  </div>;
}

// What the trip actually caught: a recap once there's something in it, open to the crew,
// with logging for people on the trip once it has started.
export default function TripCatches({ trip, canLog, isCreator }) {
  const { user, listTripCatches, deleteTripCatch } = useAuth();
  const [catches, setCatches] = useState(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    let active = true;
    listTripCatches(trip.id).then((rows) => { if (active) setCatches(rows); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id]);

  async function handleDelete(id) {
    const result = await deleteTripCatch(id);
    if (!result.error) setCatches((previous) => previous.filter((c) => c.id !== id));
  }

  const started = localToday() >= trip.starts_on;
  const recap = catchRecap(catches || []);

  return <section className="table-card trip-catches">
    <div className="section-heading">
      <div><span className="eyebrow">THE RECAP</span><h2>Trip catches</h2></div>
      {canLog && started && <button className="button button-primary" type="button" onClick={() => setLogging(true)}>Log a fish <span>＋</span></button>}
    </div>
    {catches === null && <p className="muted-label">Loading...</p>}
    {catches?.length === 0 && <p className="muted-label">{started ? 'Nothing logged yet.' : `Catches can be logged once the trip starts on ${trip.starts_on}.`}</p>}
    {recap.total > 0 && <div className="trip-recap">
      <div>
        <h3 className="trip-subheading">Most fish ({recap.total} total)</h3>
        <ol className="trip-recap-board">
          {recap.leaderboard.map((row) => <li key={row.userId}><strong>{row.name}</strong><span>{row.count} fish</span></li>)}
        </ol>
      </div>
      {recap.biggest.length > 0 && <div>
        <h3 className="trip-subheading">Biggest of each</h3>
        <ul className="trip-recap-board">
          {recap.biggest.map((c) => <li key={c.id}><strong>{c.species}</strong><span>{Number(c.length_in)}" · {c.angler_name}</span></li>)}
        </ul>
      </div>}
    </div>}
    {catches?.length > 0 && <ul className="trip-catch-grid">
      {[...catches].reverse().map((c) => <li key={c.id}>
        {c.photo_url ? <img src={c.photo_url} alt={`${c.angler_name}'s ${c.species}`} /> : <FishIllustration species={speciesIcon(c.species)} />}
        <strong>{c.species}{c.length_in ? ` · ${Number(c.length_in)}"` : ''}</strong>
        <span className="muted-label">{c.angler_name}{c.caught_at ? ` · ${c.caught_at}` : ''}</span>
        {(c.user_id === user?.id || isCreator) && <button className="license-remove" type="button" onClick={() => handleDelete(c.id)} aria-label={`Delete ${c.angler_name}'s ${c.species}`}>×</button>}
      </li>)}
    </ul>}
    {logging && <LogCatchForm tripId={trip.id} onClose={() => setLogging(false)} onLogged={(tripCatch) => { setCatches((previous) => [...(previous || []), tripCatch]); setLogging(false); }} />}
  </section>;
}
