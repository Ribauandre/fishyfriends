import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import PostMenu from './components/PostMenu';
import SpeciesSelect from './components/SpeciesSelect';
import iconFor from './utils/speciesOptions';
import extractPhotoDate from './utils/photoDate';

function PersonalBestCard({ best, anglerName, onRemove }) {
  return <div className="best-card">
    <PostMenu
      shareData={{ title: `${anglerName}'s ${best.species}`, text: `${anglerName}'s ${best.species}${best.size_label ? ` — ${best.size_label}` : ''} on Fishy Friends.`, url: `${window.location.origin}/anglers?best=${best.id}` }}
      onDelete={() => onRemove(best.id)}
    />
    {best.photo_url ? <img className="best-card-photo" src={best.photo_url} alt={`${best.species} personal best`} /> : <FishIllustration species={iconFor(best.species)} className="best-card-fish" />}
    <div className="best-card-info"><strong>{best.species}</strong><span>{best.size_label || 'size unknown'}{best.caught_at ? ` · ${best.caught_at}` : ''}</span></div>
  </div>;
}

function PersonalBestForm({ onSave }) {
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

export default function Profile() {
  const { user, profile, personalBests, updateProfile, uploadAvatar, uploadPersonalBest, deletePersonalBest, signOut, notice, setNotice } = useAuth();
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  async function saveProfile(event) { event.preventDefault(); await updateProfile(form); setSaved(true); setTimeout(() => setSaved(false), 2200); }
  async function handleAvatar(event) { const file = event.target.files?.[0]; if (!file) return; setUploading(true); const result = await uploadAvatar(file); if (!result.error) setForm((previous) => ({ ...previous, avatar_url: result.avatarUrl })); setUploading(false); }
  return <main className="content-shell profile-page"><div className="page-intro"><div><span className="eyebrow">YOUR PROFILE</span><h1>Make it yours.</h1><p>Give the crew something to work with before they start making things up.</p></div><FishIllustration species="pike" className="intro-sticker" /></div><section className="profile-layout"><aside className="profile-card"><div className="avatar avatar-large">{form.avatar_url ? <img src={form.avatar_url} alt="Profile" /> : (form.display_name || 'N').slice(0, 1).toUpperCase()}</div><label className="avatar-upload">{uploading ? 'Uploading...' : 'Change photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} disabled={uploading} /></label><h2>{form.display_name || 'New angler'}</h2><p>{user?.email}</p><div className="profile-tag">Member since 2025</div><button className="button button-quiet" type="button" onClick={signOut}>Sign out</button></aside><form className="settings-card" onSubmit={saveProfile}><div className="section-heading"><div><span className="eyebrow">PROFILE DETAILS</span><h2>How should we know you?</h2></div><span className="status-dot">● Saved privately</span></div><label>Display name<input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label><label>Home water<input value={form.home_water || ''} onChange={(e) => setForm({ ...form, home_water: e.target.value })} placeholder="Bay, river, lake, or coastline" /></label><label>Favorite species<SpeciesSelect required={false} value={form.favorite_species || ''} onChange={(favorite_species) => setForm({ ...form, favorite_species })} /></label><label>About you<textarea rows="4" value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Brag a little, nobody's grading this" /></label><div className="form-actions"><button className="button button-primary" type="submit">Save profile <span>→</span></button>{saved && <span className="saved-message">Profile updated</span>}</div>{notice && <p className="preview-note">{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></p>}</form></section><section className="table-card personal-bests-panel"><div className="section-heading"><div><span className="eyebrow">PERSONAL BESTS</span><h2>Your biggest, by species</h2></div></div>{personalBests.length === 0 && <p className="month-empty">Nothing logged yet. Add your first personal best below before someone else claims bragging rights.</p>}<div className="best-grid">{personalBests.map((best) => <PersonalBestCard key={best.id} best={best} anglerName={profile.display_name || 'An angler'} onRemove={deletePersonalBest} />)}</div><PersonalBestForm onSave={uploadPersonalBest} /></section></main>;
}
