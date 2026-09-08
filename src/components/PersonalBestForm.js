import React, { useState } from 'react';
import SpeciesSelect from './SpeciesSelect';
import extractPhotoDate from '../utils/photoDate';

export default function PersonalBestForm({ onSave }) {
  const [species, setSpecies] = useState('');
  const [sizeLabel, setSizeLabel] = useState('');
  const [caughtAt, setCaughtAt] = useState('');
  const [dateFromPhoto, setDateFromPhoto] = useState(false);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(event) {
    const nextFile = event.target.files?.[0] || null;
    setFile(nextFile);
    setDateFromPhoto(false);
    if (!nextFile) return;
    const takenAt = await extractPhotoDate(nextFile);
    if (takenAt) { setCaughtAt(takenAt); setDateFromPhoto(true); }
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await onSave({ species, sizeLabel, caughtAt, file });
    setSaving(false);
    if (result?.error) setError(result.error.message);
    else { setSpecies(''); setSizeLabel(''); setCaughtAt(''); setDateFromPhoto(false); setFile(null); event.target.reset(); }
  }

  return <form className="best-form" onSubmit={submit}>
    <label>Photo<input type="file" accept="image/*" onChange={handleFile} /></label>
    <label>Date<input type="date" value={caughtAt} onChange={(e) => { setCaughtAt(e.target.value); setDateFromPhoto(false); }} />{dateFromPhoto && <span className="field-hint">✓ Grabbed from the photo</span>}</label>
    <label>Species<SpeciesSelect value={species} onChange={setSpecies} /></label>
    <label>Size<input value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} placeholder="38 in, 12 lb..." /></label>
    {error && <p className="form-error">{error}</p>}
    <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Log personal best'} <span>→</span></button>
  </form>;
}
