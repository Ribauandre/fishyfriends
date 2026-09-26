import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import TripFormModal, { localToday } from './components/TripFormModal';
import { splitRoster } from './utils/tripMath';

function TripCard({ trip, userId }) {
  const { going, waitlist } = splitRoster(trip.attendees, trip.max_spots);
  const mine = going.some((a) => a.user_id === userId) ? 'going' : waitlist.some((a) => a.user_id === userId) ? 'waitlist' : null;
  const full = trip.max_spots && going.length >= trip.max_spots;
  const badge = mine === 'going' ? "YOU'RE GOING" : mine === 'waitlist' ? 'WAITLISTED' : full ? 'FULL' : 'OPEN';
  return <Link className="trip-card" to={`/trips/${trip.id}`}>
    <span className={mine === 'going' ? 'status-badge' : 'status-badge status-badge-muted'}>{badge}</span>
    <h3>{trip.name}</h3>
    <span className="muted-label">{trip.starts_on === trip.ends_on ? trip.starts_on : `${trip.starts_on} — ${trip.ends_on}`}</span>
    {trip.location && <p>{trip.location}</p>}
    {trip.target_species?.length > 0 && <p className="trip-card-species">{trip.target_species.join(' · ')}</p>}
    <div className="trip-card-stats">
      <span>{going.length}{trip.max_spots ? ` of ${trip.max_spots}` : ''} going</span>
      {waitlist.length > 0 && <span>{waitlist.length} waiting</span>}
    </div>
    <span className="note-go">See the trip →</span>
  </Link>;
}

export default function Trips() {
  const { user, listTrips, createTrip } = useAuth();
  const [trips, setTrips] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    listTrips().then((data) => { if (active) setTrips(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate(form) {
    const result = await createTrip(form);
    if (!result.error) navigate(`/trips/${result.trip.id}`);
    return result;
  }

  const today = localToday();
  const upcoming = (trips || []).filter((trip) => trip.ends_on >= today);
  const past = (trips || []).filter((trip) => trip.ends_on < today).reverse();

  return <main className="content-shell trips-page">
    <div className="page-intro">
      <div>
        <span className="eyebrow">ROAD TRIP</span>
        <h1>Trips</h1>
        <p>Plan the trip, see who's in, and split the house and the boat without the group-text math.</p>
        <button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Plan a trip <span>＋</span></button>
      </div>
      <FishIllustration species="bluefish" className="intro-sticker" />
    </div>

    {trips === null && <p className="month-empty">Loading trips...</p>}

    {trips !== null && trips.length === 0 && <div className="empty-state">
      <FishIllustration species="bluefish" className="empty-state-sticker" />
      <p className="month-empty">No trips planned yet. Start one and see who bites.</p>
    </div>}

    {upcoming.length > 0 && <section className="tournaments-section">
      <div className="section-heading-mini"><span className="eyebrow">COMING UP</span></div>
      <div className="tournaments-grid">{upcoming.map((trip) => <TripCard key={trip.id} trip={trip} userId={user?.id} />)}</div>
    </section>}

    {past.length > 0 && <section className="tournaments-section">
      <div className="section-heading-mini"><span className="eyebrow">PAST TRIPS</span></div>
      <div className="tournaments-grid">{past.map((trip) => <TripCard key={trip.id} trip={trip} userId={user?.id} />)}</div>
    </section>}

    {showForm && <TripFormModal onSave={handleCreate} onClose={() => setShowForm(false)} />}
  </main>;
}
