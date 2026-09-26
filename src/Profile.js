import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import SpeciesSelect from './components/SpeciesSelect';
import { US_STATES } from './utils/usStates';
import { licenseStatus } from './utils/licenseStatus';
import { normalizeVenmoHandle } from './utils/venmo';

function licenseStatusBadgeClass(status) {
  if (status === 'expired') return 'status-badge status-badge-danger';
  if (status === 'expiring') return 'status-badge status-badge-warn';
  return 'status-badge';
}

// Also doubles as the renew/edit form — updating a license in place keeps the same row
// (and its id) instead of making the crew delete an expired one and re-add it from scratch.
function LicenseFormModal({ license, onClose, onSaved }) {
  const { uploadFishingLicense, updateFishingLicense } = useAuth();
  const isEditing = Boolean(license);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    state: license?.state || '',
    licenseNumber: license?.license_number || '',
    issuedAt: license?.issued_at || '',
    expiresAt: license?.expires_at || '',
    file: null,
  });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = isEditing
      ? await updateFishingLicense({ id: license.id, previousPhotoPath: license.photo_path, ...form })
      : await uploadFishingLicense(form);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved(result.license);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">{isEditing ? 'RENEW LICENSE' : 'NEW LICENSE'}</span><h2>{isEditing ? `Update your ${license.state} license` : 'Add a fishing license'}</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label={isEditing ? 'Close renew license form' : 'Close add license form'}>×</button>
      </div>
      <label>State<select required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })}>
        <option value="" disabled>Choose a state</option>
        {US_STATES.map((state) => <option key={state} value={state}>{state}</option>)}
      </select></label>
      <label>License number (optional)<input value={form.licenseNumber} onChange={(event) => setForm({ ...form, licenseNumber: event.target.value })} /></label>
      <label>Issued (optional)<input type="date" value={form.issuedAt} onChange={(event) => setForm({ ...form, issuedAt: event.target.value })} /></label>
      <label>Expires<input required type="date" value={form.expiresAt} onChange={(event) => setForm({ ...form, expiresAt: event.target.value })} /></label>
      <label>{isEditing ? 'New photo or PDF (optional)' : 'Photo or PDF (optional)'}<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })} /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : isEditing ? 'Save changes' : 'Add license'} <span>→</span></button></div>
    </form>
  </div>;
}

function DeleteLicenseModal({ license, deleting, onCancel, onConfirm }) {
  return <div className="catch-modal-backdrop" role="presentation" onClick={onCancel}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">DELETE LICENSE</span><h2>Are you sure?</h2></div>
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Cancel deleting license">×</button>
      </div>
      <p>This removes your {license.state} license{license.license_number ? ` (#${license.license_number})` : ''} for good.</p>
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button className="button button-danger" type="button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete license'}</button>
      </div>
    </div>
  </div>;
}

function isPdfPath(path) {
  return /\.pdf$/i.test(path || '');
}

// A quick, at-a-glance card meant to be handed over on the dock — big state name and a
// status banner that reads clean from arm's length, rather than the compact list row.
function WardenView({ license, anglerName, onClose }) {
  const { status, label } = licenseStatus(license.expires_at);
  return <div className="warden-view-backdrop" role="dialog" aria-modal="true" aria-label={`${license.state} fishing license`} onClick={onClose}>
    <div className={`warden-view-card is-${status}`} onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" type="button" onClick={onClose} aria-label="Close license view">×</button>
      <span className="eyebrow">FISHING LICENSE</span>
      <h2>{license.state}</h2>
      <p className="warden-view-name">{anglerName}</p>
      {license.photo_url && (isPdfPath(license.photo_path)
        ? <a className="warden-view-pdf-link" href={license.photo_url} target="_blank" rel="noopener noreferrer">View license PDF ↗</a>
        : <img className="warden-view-photo" src={license.photo_url} alt={`${license.state} fishing license`} />)}
      <dl className="warden-view-facts">
        {license.license_number && <><dt>License #</dt><dd>{license.license_number}</dd></>}
        {license.issued_at && <><dt>Issued</dt><dd>{license.issued_at}</dd></>}
        <dt>Expires</dt><dd>{license.expires_at}</dd>
      </dl>
      <p className={`warden-view-status is-${status}`}>{status === 'valid' ? '✓ VALID' : status === 'expiring' ? `⚠ ${label.toUpperCase()}` : '✕ EXPIRED'}</p>
    </div>
  </div>;
}

function FishingLicensesSection() {
  const { profile, listFishingLicenses, deleteFishingLicense } = useAuth();
  const [licenses, setLicenses] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLicense, setEditingLicense] = useState(null);
  const [wardenLicense, setWardenLicense] = useState(null);
  const [deletingLicense, setDeletingLicense] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    listFishingLicenses().then((data) => { if (active) setLicenses(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaved(license) {
    setLicenses((previous) => [...(previous || []).filter((item) => item.id !== license.id), license].sort((a, b) => a.expires_at.localeCompare(b.expires_at)));
    setShowAddForm(false);
    setEditingLicense(null);
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteFishingLicense(deletingLicense.id, deletingLicense.photo_path);
    setDeleting(false);
    if (!result.error) { setLicenses((previous) => previous.filter((license) => license.id !== deletingLicense.id)); setDeletingLicense(null); }
  }

  const alertCount = (licenses || []).filter((license) => licenseStatus(license.expires_at).status !== 'valid').length;

  return <section className="settings-card fishing-licenses-panel">
    <div className="section-heading">
      <div><span className="eyebrow">SHOW THE WARDEN</span><h2>Fishing licenses</h2></div>
      <div className="license-heading-actions">
        {alertCount > 0 && <span className="status-badge status-badge-warn">{alertCount} need{alertCount === 1 ? 's' : ''} attention</span>}
        <button className="button button-quiet" type="button" onClick={() => setShowAddForm(true)}>Add a license <span>＋</span></button>
      </div>
    </div>
    <p>Keep your state licenses on file so you can pull one up on the dock, and get a heads-up here before one lapses.</p>
    {licenses === null && <p className="month-empty">Loading your licenses...</p>}
    {licenses && licenses.length === 0 && <div className="empty-state"><FishIllustration species="catfish" className="empty-state-sticker" /><p className="month-empty">No licenses on file yet.</p></div>}
    {licenses && licenses.length > 0 && <ul className="license-list">
      {licenses.map((license) => {
        const { status, label } = licenseStatus(license.expires_at);
        return <li key={license.id} className="license-row">
          <div className="license-row-info">
            <strong>{license.state}</strong>
            {license.license_number && <span className="license-row-number">#{license.license_number}</span>}
            <span className={licenseStatusBadgeClass(status)}>{label}</span>
          </div>
          <div className="license-row-actions">
            <button className="button button-quiet" type="button" onClick={() => setWardenLicense(license)}>Show to warden</button>
            <button className="button button-quiet" type="button" onClick={() => setEditingLicense(license)}>{status === 'valid' ? 'Update' : 'Renew'}</button>
            <button className="license-remove" type="button" onClick={() => setDeletingLicense(license)} aria-label={`Delete ${license.state} license`}>×</button>
          </div>
        </li>;
      })}
    </ul>}
    {(showAddForm || editingLicense) && <LicenseFormModal license={editingLicense} onClose={() => { setShowAddForm(false); setEditingLicense(null); }} onSaved={handleSaved} />}
    {wardenLicense && <WardenView license={wardenLicense} anglerName={profile.display_name || 'Angler'} onClose={() => setWardenLicense(null)} />}
    {deletingLicense && <DeleteLicenseModal license={deletingLicense} deleting={deleting} onCancel={() => setDeletingLicense(null)} onConfirm={handleDelete} />}
  </section>;
}

export default function Profile() {
  const { user, profile, personalBests, updateProfile, uploadAvatar, signOut, notice, setNotice, submitBugReport } = useAuth();
  const [form, setForm] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [venmoError, setVenmoError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [bugReport, setBugReport] = useState('');
  const [bugSubmitting, setBugSubmitting] = useState(false);
  const [bugSubmitted, setBugSubmitted] = useState(false);
  const [bugError, setBugError] = useState('');
  async function saveProfile(event) {
    event.preventDefault();
    const venmo = normalizeVenmoHandle(form.venmo_handle);
    if (venmo.error) { setVenmoError(venmo.error); return; }
    setVenmoError('');
    const next = { ...form, venmo_handle: venmo.handle };
    setForm(next);
    await updateProfile(next);
    setSaved(true); setTimeout(() => setSaved(false), 2200);
  }
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
  return <main className="content-shell profile-page"><div className="page-intro"><div><span className="eyebrow">YOUR PROFILE</span><h1>Make it yours.</h1><p>Give the crew something to work with before they start making things up.</p></div><FishIllustration species="largemouth" className="intro-sticker" /></div><section className="profile-layout"><aside className="profile-card" data-tour="profile-card"><div className="avatar avatar-large">{form.avatar_url ? <img src={form.avatar_url} alt="Profile" /> : (form.display_name || 'N').slice(0, 1).toUpperCase()}</div><label className="avatar-upload">{uploading ? 'Uploading...' : 'Change photo'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatar} disabled={uploading} /></label><h2>{form.display_name || 'New angler'}</h2><p>{user?.email}</p><div className="profile-tag">Member since 2025</div><button className="button button-quiet" type="button" onClick={signOut}>Sign out</button></aside><form className="settings-card" onSubmit={saveProfile}><div className="section-heading"><div><span className="eyebrow">PROFILE DETAILS</span><h2>How should we know you?</h2></div><span className="status-dot">● Saved privately</span></div><label>Display name<input value={form.display_name || ''} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label><label>Home water<input value={form.home_water || ''} onChange={(e) => setForm({ ...form, home_water: e.target.value })} placeholder="Bay, river, lake, or coastline" /></label><label>Favorite species<SpeciesSelect required={false} value={form.favorite_species || ''} onChange={(favorite_species) => setForm({ ...form, favorite_species })} /></label><label>About you<textarea rows="4" value={form.bio || ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Brag a little, nobody's grading this" /></label><label>Venmo username (optional)<input value={form.venmo_handle || ''} onChange={(e) => setForm({ ...form, venmo_handle: e.target.value })} placeholder="@your-venmo" autoCapitalize="none" autoCorrect="off" /><span className="field-hint">The crew sees this, so people on your trips can pay you back in one tap.</span></label>{venmoError && <p className="form-error">{venmoError}</p>}<div className="form-actions"><button className="button button-primary" type="submit">Save profile <span>→</span></button>{saved && <span className="saved-message">Profile updated</span>}</div>{notice && <p className="preview-note">{notice}<button type="button" onClick={() => setNotice('')}>Dismiss</button></p>}</form></section><p className="profile-bests-nudge"><Link className="text-link" to="/anglers">Manage your {personalBests.length} personal best{personalBests.length === 1 ? '' : 's'} on Anglers ↗</Link></p><FishingLicensesSection /><section className="settings-card bug-report-panel"><div className="section-heading"><div><span className="eyebrow">HIT A SNAG?</span><h2>Report a bug</h2></div></div><p>Something acting up? Tell us what happened — we actually read these, and the crew never has to know.</p><form onSubmit={handleBugReport}><label>What happened<textarea rows="4" required value={bugReport} onChange={(e) => setBugReport(e.target.value)} placeholder="The more specific, the better — what you tapped, what you expected, and what happened instead." /></label>{bugError && <p className="form-error">{bugError}</p>}<div className="form-actions"><button className="button button-primary" type="submit" disabled={bugSubmitting}>{bugSubmitting ? 'Reeling...' : 'Reel it in'} <span>→</span></button>{bugSubmitted && <span className="saved-message">Got it — we'll get it untangled</span>}</div></form></section></main>;
}
