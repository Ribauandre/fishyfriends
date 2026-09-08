import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import SpeciesSelect from './components/SpeciesSelect';

export default function Profile() {
  const { user, profile, personalBests, updateProfile, uploadAvatar, signOut, notice, setNotice, submitBugReport } = useAuth();
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [bugReport, setBugReport] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);
  const [bugError, setBugError] = useState('');
  async function saveProfile(event) { event.preventDefault(); await updateProfile(form); setSaved(true); setTimeout(() => setSaved(false), 2200); }
  async function handleAvatar(event) { const file = event.target.files?.[0]; if (!file) return; setUploading(true); const result = await uploadAvatar(file); if (!result.error) setForm((previous) => ({ ...previous, avatar_url: result.avatarUrl })); setUploading(false); }
  async function handleBugReport(event) {
    event.preventDefault();
    setBugSubmitting(true); setBugError('');
    const result = await submitBugReport({ body: bugReport });
    setBugSubmitting(false);
    if (result?.error) { setBugError(result.error.message); return; }
    setBugReport('');
    setBugSubmitted(true);
    setTimeout(() => setBugSubmitted(false), 2200);
  }
  return <main className="content-shell profile-page"><div className="page-intro"><div><span className="eyebrow">YOUR PROFILE</span><h1>Make it yours.</h1><p>Give the crew something to work with before they start making things up.</p></div><FishIllustration species="largemouth" className="intro-sticker" /></div><section className="profile-layout"><aside className="profile-card" data-tour="profile-card"><div className="avatar avatar-large">{form.avatar_url ? <img src={form.avatar_url} alt="Profile" /> : (form.display_name || 'N').slice(0, 1).toUpperCase()}</div><label className="avatar-upload">{uploading ? 'Uploading...' : 'Change photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} disabled={uploading} /></label><h2>{form.display_name || 'New angler'}</h2><p>{user?.email}</p><div className="profile-tag">Member since 2025</div><button className="button button-quiet" type="button" onClick={signOut}>Sign out</button></aside><form className="settings-card" onSubmit={saveProfile}><div className="section-heading"><div><span className="eyebrow">PROFILE DETAILS</span><h2>How should we know you?</h2></div><span className="status-dot">● Saved privately</span></div><label>Display name<input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label><label>Home water<input value={form.home_water || ''} onChange={(e) => setForm({ ...form, home_water: e.target.value })} placeholder="Bay, river, lake, or coastline" /></label><label>Favorite species<SpeciesSelect required={false} value={form.favorite_species || ''} onChange={(favorite_species) => setForm({ ...form, favorite_species })} /></label><label>About you<textarea rows="4" value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Brag a little, nobody's grading this" /></label><div className="form-actions"><button className="button button-primary" type="submit">Save profile <span>→</span></button>{saved && <span className="saved-message">Profile updated</span>}</div>{notice && <p className="preview-note">{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></p>}</form></section><p className="profile-bests-nudge"><Link className="text-link" to="/anglers">Manage your {personalBests.length} personal best{personalBests.length === 1 ? '' : 's'} on Anglers ↗</Link></p><section className="settings-card bug-report-panel"><div className="section-heading"><div><span className="eyebrow">HIT A SNAG?</span><h2>Report a bug</h2></div></div><p>Something acting up? Tell us what happened — we actually read these, and the crew never has to know.</p><form onSubmit={handleBugReport}><label>What happened<textarea rows="4" required value={bugReport} onChange={(e) => setBugReport(e.target.value)} placeholder="The more specific, the better — what you tapped, what you expected, and what happened instead." /></label>{bugError && <p className="form-error">{bugError}</p>}<div className="form-actions"><button className="button button-primary" type="submit" disabled={bugSubmitting}>{bugSubmitting ? 'Reeling...' : 'Reel it in'} <span>→</span></button>{bugSubmitted && <span className="saved-message">Got it — we'll get it untangled</span>}</div></form></section></main>;
}
