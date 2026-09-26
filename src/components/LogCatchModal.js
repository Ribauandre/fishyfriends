import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SpeciesSelect from './SpeciesSelect';
import extractPhotoDate from '../utils/photoDate';
import { localToday } from './TripFormModal';
import { FISH_YEAR } from '../constants';
import { checkCatch, eligibleDestinations, monthFromDate, sizeLabel } from '../utils/catchDestinations';

// The one form for logging a fish. It asks where the catch counts — Fish Year, a personal
// best, a tournament running that day, a trip you're on — and writes it to each, so one fish
// is entered once. `preset` ticks a place to start with (the page it was opened from); once
// saved, `onLogged` gets what was written so that page can show it without a refetch.
// `preset.date` starts the date inside a tournament's or trip's window when today isn't.
export default function LogCatchModal({ preset = {}, onClose, onLogged }) {
  const { user, personalBests, listTournaments, listTrips, logFishYearCatch, uploadPersonalBest, submitTournamentEntry, logTripCatch } = useAuth();
  const [form, setForm] = useState({ species: '', date: preset.date || localToday(), length: '', weight: '', photoFile: null, dateFromPhoto: false });
  const [tournaments, setTournaments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [picks, setPicks] = useState(() => ({
    fishYear: preset.fishYear ?? !(preset.personalBest || preset.tournamentId || preset.tripId),
    personalBest: Boolean(preset.personalBest),
    tournamentIds: preset.tournamentId ? [preset.tournamentId] : [],
    tripIds: preset.tripId ? [preset.tripId] : [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [failures, setFailures] = useState([]);
  const [done, setDone] = useState([]);
  // A second tap can land before `saving` re-renders the button disabled, so the guard that
  // actually stops a double submit is synchronous.
  const savingRef = useRef(false);

  useEffect(() => {
    let active = true;
    listTournaments().then((rows) => { if (active) setTournaments(rows || []); });
    listTrips().then((rows) => { if (active) setTrips(rows || []); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eligible = useMemo(() => eligibleDestinations({ date: form.date, fishYear: FISH_YEAR, tournaments, trips, userId: user?.id }), [form.date, tournaments, trips, user?.id]);
  // Only what the date allows is sent, whatever was ticked before the date changed.
  const activePicks = {
    fishYear: picks.fishYear && eligible.fishYear,
    personalBest: picks.personalBest,
    tournamentIds: picks.tournamentIds.filter((id) => eligible.tournaments.some((tournament) => tournament.id === id)),
    tripIds: picks.tripIds.filter((id) => eligible.trips.some((trip) => trip.id === id)),
  };
  const currentBest = form.species.trim() && personalBests.find((best) => best.species.toLowerCase() === form.species.trim().toLowerCase());

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((previous) => ({ ...previous, photoFile: file, dateFromPhoto: false }));
    const takenAt = await extractPhotoDate(file);
    if (takenAt) setForm((previous) => ({ ...previous, date: takenAt, dateFromPhoto: true }));
  }

  const toggle = (key, id) => setPicks((previous) => (id === undefined
    ? { ...previous, [key]: !previous[key] }
    : { ...previous, [key]: previous[key].includes(id) ? previous[key].filter((value) => value !== id) : [...previous[key], id] }));

  async function handleSubmit(event) {
    event.preventDefault();
    const checked = checkCatch({ species: form.species, picks: activePicks, tournaments: eligible.tournaments, length: form.length, weight: form.weight });
    if (checked.error) { setError(checked.error); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(''); setFailures([]);
    const base = { species: form.species, caughtAt: form.date, file: form.photoFile };
    const jobs = [];
    if (activePicks.fishYear) jobs.push({ key: 'fishYear', label: `Fish Year ${FISH_YEAR}`, run: () => logFishYearCatch({ ...base, year: FISH_YEAR, month: monthFromDate(form.date) }), link: (result) => `/fish-year?catch=${result.catchEntry?.id || ''}` });
    if (activePicks.personalBest) jobs.push({ key: 'personalBest', label: 'Personal best', run: () => uploadPersonalBest({ ...base, sizeLabel: sizeLabel(checked.lengthIn, checked.weightLb) }), link: (result) => `/profile?best=${result.bestEntry?.id || ''}` });
    for (const tournament of checked.tournaments) jobs.push({ key: `tournament:${tournament.id}`, label: tournament.name, run: () => submitTournamentEntry({ ...base, tournamentId: tournament.id, size: tournament.unit === 'lb' ? checked.weightLb : checked.lengthIn }), link: (result) => `/tournaments/${tournament.id}?entry=${result.entry?.id || ''}` });
    for (const tripId of activePicks.tripIds) {
      const trip = eligible.trips.find((candidate) => candidate.id === tripId);
      jobs.push({ key: `trip:${tripId}`, label: trip.name, run: () => logTripCatch({ ...base, tripId, lengthIn: checked.lengthIn ?? '' }), link: () => `/trips/${tripId}` });
    }

    const logged = [];
    const failed = [];
    for (const job of jobs) {
      // One at a time: each writer uploads the photo to its own bucket, and a phone on a
      // dock's signal copes better with one upload than four at once.
      // eslint-disable-next-line no-await-in-loop
      const result = await job.run();
      if (result?.error) failed.push({ ...job, message: result.error.message });
      else logged.push({ ...job, result });
    }
    savingRef.current = false;
    setSaving(false);
    if (logged.length) {
      onLogged?.(logged.map(({ key, label, result }) => ({ key, label, result })));
      setDone((previous) => [...previous, ...logged]);
      // What went through is unticked, so trying again only retries what failed.
      setPicks((previous) => ({
        fishYear: previous.fishYear && !logged.some((job) => job.key === 'fishYear'),
        personalBest: previous.personalBest && !logged.some((job) => job.key === 'personalBest'),
        tournamentIds: previous.tournamentIds.filter((id) => !logged.some((job) => job.key === `tournament:${id}`)),
        tripIds: previous.tripIds.filter((id) => !logged.some((job) => job.key === `trip:${id}`)),
      }));
    }
    setFailures(failed);
  }

  if (done.length && !failures.length && !saving) {
    return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="catch-modal log-catch-done" role="dialog" aria-modal="true" aria-label="Catch logged" onClick={(event) => event.stopPropagation()}>
        <div className="section-heading">
          <div><span className="eyebrow">MADE IT OFFICIAL</span><h2>{form.species} logged</h2></div>
          <button className="modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ul className="log-catch-results">
          {done.map((job) => <li key={job.key}><span aria-hidden="true">✓</span> <Link className="text-link" to={job.link(job.result)} onClick={onClose}>{job.label} →</Link></li>)}
        </ul>
        <div className="form-actions"><button className="button button-primary" type="button" onClick={onClose}>Done <span>→</span></button></div>
      </div>
    </div>;
  }

  const trackedTournaments = eligible.tournaments.filter((tournament) => activePicks.tournamentIds.includes(tournament.id));
  const needsWeight = trackedTournaments.some((tournament) => tournament.unit === 'lb');
  const needsLength = trackedTournaments.some((tournament) => tournament.unit !== 'lb');

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal log-catch-modal" role="dialog" aria-modal="true" aria-label="Log a catch" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">NEW CATCH</span><h2>Log your fish</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close log catch form">×</button>
      </div>
      <label>Photo<input type="file" accept="image/*" onChange={handlePhoto} /></label>
      <label>Date<input required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value, dateFromPhoto: false })} />{form.dateFromPhoto && <span className="field-hint">✓ Grabbed from the photo</span>}</label>
      <label>Species<SpeciesSelect value={form.species} onChange={(species) => setForm({ ...form, species })} /></label>
      <div className="log-catch-sizes">
        <label>Length (in){needsLength ? '' : ' — optional'}<input type="number" inputMode="decimal" step="0.1" min="0" value={form.length} onChange={(event) => setForm({ ...form, length: event.target.value })} /></label>
        <label>Weight (lb){needsWeight ? '' : ' — optional'}<input type="number" inputMode="decimal" step="0.1" min="0" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} /></label>
      </div>

      <fieldset className="log-catch-destinations">
        <legend>Where it counts</legend>
        <label className="log-catch-option">
          <input type="checkbox" checked={activePicks.fishYear} disabled={!eligible.fishYear} onChange={() => toggle('fishYear')} />
          <span><strong>Fish Year {FISH_YEAR}</strong><em>{eligible.fishYear ? `Counts for ${monthFromDate(form.date)}` : `Only ${FISH_YEAR} catches count`}</em></span>
        </label>
        <label className="log-catch-option">
          <input type="checkbox" checked={activePicks.personalBest} onChange={() => toggle('personalBest')} />
          <span><strong>Personal best</strong><em>{currentBest ? `Replaces your ${currentBest.species} best${currentBest.size_label ? ` (${currentBest.size_label})` : ''}` : 'Your biggest of this species'}</em></span>
        </label>
        {eligible.tournaments.map((tournament) => <label className="log-catch-option" key={tournament.id}>
          <input type="checkbox" checked={activePicks.tournamentIds.includes(tournament.id)} onChange={() => toggle('tournamentIds', tournament.id)} />
          <span><strong>{tournament.name}</strong><em>Tournament · measured in {tournament.unit === 'lb' ? 'pounds' : 'inches'}</em></span>
        </label>)}
        {eligible.trips.map((trip) => <label className="log-catch-option" key={trip.id}>
          <input type="checkbox" checked={activePicks.tripIds.includes(trip.id)} onChange={() => toggle('tripIds', trip.id)} />
          <span><strong>{trip.name}</strong><em>Trip catches</em></span>
        </label>)}
        <p className="field-hint">Tournaments and trips show up here when they're running on the catch date.</p>
      </fieldset>

      {done.length > 0 && <p className="field-hint">Already logged: {done.map((job) => job.label).join(', ')}.</p>}
      {failures.map((job) => <p className="form-error" key={job.key}>{job.label}: {job.message}</p>)}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Make it official'} <span>→</span></button></div>
    </form>
  </div>;
}
