import React, { useState } from 'react';
import SpeciesSelect from './SpeciesSelect';
import { US_STATES } from '../utils/usStates';

export function localToday() {
  return new Date().toLocaleDateString('en-CA');
}

function formFromTrip(trip) {
  if (!trip) {
    return { name: '', location: '', state: '', startsOn: localToday(), endsOn: localToday(), rsvpBy: '', targetSpecies: [], accommodation: '', accommodationUrl: '', notes: '', maxSpots: '' };
  }
  return {
    name: trip.name, location: trip.location, state: trip.state, startsOn: trip.starts_on, endsOn: trip.ends_on,
    targetSpecies: trip.target_species || [], accommodation: trip.accommodation, accommodationUrl: trip.accommodation_url,
    notes: trip.notes, maxSpots: trip.max_spots ? String(trip.max_spots) : '', rsvpBy: trip.rsvp_by || '',
  };
}

// Create and edit share one form; onSave gets the form and returns { error } or { trip }.
export default function TripFormModal({ trip, onSave, onClose }) {
  const [form, setForm] = useState(() => formFromTrip(trip));
  const [speciesDraft, setSpeciesDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });

  function addSpecies() {
    const species = speciesDraft.trim();
    if (species && !form.targetSpecies.includes(species)) setForm({ ...form, targetSpecies: [...form.targetSpecies, species] });
    setSpeciesDraft('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await onSave(form);
    setSaving(false);
    if (result?.error) setError(result.error.message);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal trip-form" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">{trip ? 'EDIT TRIP' : 'NEW TRIP'}</span><h2>{trip ? 'Update the trip' : 'Plan a trip'}</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close trip form">×</button>
      </div>
      <label>Trip name<input required value={form.name} onChange={set('name')} placeholder="Montauk fall run" /></label>
      <label>Where<input value={form.location} onChange={set('location')} placeholder="Montauk Point" /></label>
      <label>State (optional)
        <select value={form.state} onChange={set('state')}>
          <option value="">—</option>
          {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <div className="trip-form-dates">
        <label>Starts<input required type="date" value={form.startsOn} onChange={set('startsOn')} /></label>
        <label>Ends<input required type="date" value={form.endsOn} onChange={set('endsOn')} /></label>
      </div>
      <div className="trip-form-species">
        <span className="trip-form-label">Target species</span>
        {form.targetSpecies.length > 0 && <ul className="trip-species-chips">
          {form.targetSpecies.map((species) => <li key={species}>{species}<button type="button" onClick={() => setForm({ ...form, targetSpecies: form.targetSpecies.filter((s) => s !== species) })} aria-label={`Remove ${species}`}>×</button></li>)}
        </ul>}
        <div className="trip-form-species-add">
          <SpeciesSelect required={false} value={speciesDraft} onChange={setSpeciesDraft} />
          <button className="button button-quiet" type="button" onClick={addSpecies} disabled={!speciesDraft.trim()}>Add</button>
        </div>
      </div>
      <label>Where we're staying<input value={form.accommodation} onChange={set('accommodation')} placeholder="Beach house on Old Montauk Hwy" /></label>
      <label>Booking link (optional)<input type="url" inputMode="url" value={form.accommodationUrl} onChange={set('accommodationUrl')} placeholder="https://www.airbnb.com/rooms/..." /></label>
      <div className="trip-form-dates">
        <label>Spots (blank for no limit)<input inputMode="numeric" value={form.maxSpots} onChange={set('maxSpots')} placeholder="6" /></label>
        <label>RSVP by (optional)<input type="date" value={form.rsvpBy} onChange={set('rsvpBy')} /></label>
      </div>
      <label>Notes<textarea rows="3" value={form.notes} onChange={set('notes')} placeholder="Meet at the dock at 5am. Bring your own rods." /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : trip ? 'Save changes' : 'Create trip'} <span>→</span></button></div>
    </form>
  </div>;
}
