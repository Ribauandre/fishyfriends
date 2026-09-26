import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FishIllustration from './FishIllustration';
import LogCatchModal from './LogCatchModal';
import speciesIcon from '../utils/speciesOptions';
import { catchRecap } from '../utils/tripMath';
import { localToday } from './TripFormModal';
import { dateWithin } from '../utils/catchDestinations';

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
    {logging && <LogCatchModal preset={{ tripId: trip.id, date: dateWithin(localToday(), trip.starts_on, trip.ends_on) }} onClose={() => setLogging(false)} onLogged={(results) => {
      const logged = results.find((entry) => entry.key === `trip:${trip.id}`);
      if (logged) setCatches((previous) => [...(previous || []), logged.result.tripCatch]);
    }} />}
  </section>;
}
