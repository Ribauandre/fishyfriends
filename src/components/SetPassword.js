import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FishIllustration from './FishIllustration';
import { MIN_PASSWORD_LENGTH } from '../utils/passwordCheck';

// Where a password-reset link lands. The link has signed the account in, and until a new
// password is set this is all the app shows: someone who got hold of the link gets a form,
// not the club, and the account's owner can't wander off still locked out of their password.
export default function SetPassword() {
  const { user, setRecoveredPassword, signOut } = useAuth();
  const [form, setForm] = useState({ password: '', again: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.password !== form.again) { setError('Those two don\'t match. Type the new password the same way twice.'); return; }
    setSaving(true); setError('');
    const result = await setRecoveredPassword(form.password);
    // On success the provider drops the recovery state and this screen is replaced by the app.
    if (result?.error) { setError(result.error.message); setSaving(false); }
  }

  return <main className="auth-page waiting-room">
    <section className="auth-story">
      <div className="auth-fishing-scene" aria-hidden="true"><div className="auth-shark"><FishIllustration species="stripedbass" /></div></div>
      <span className="eyebrow">FISHY FRIENDS CLUB</span>
      <h1>Back on the dock in a minute.</h1>
      <p>Pick a new password and you're in.</p>
    </section>
    <section className="auth-panel">
      <div className="brand-mark"><span>FF</span><div><strong>Fishy Friends</strong><small>Friends, fish, and bragging rights</small></div></div>
      <div className="auth-heading"><span className="eyebrow">NEW PASSWORD</span><h2>Set a new password</h2></div>
      {user?.email && <p className="auth-switch">For <strong>{user.email}</strong>.</p>}
      <form onSubmit={handleSubmit} className="auth-form">
        {/* Lets a password manager file the new password under the right account. */}
        <input type="email" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
        <label>New password<input type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} /></label>
        <label>And again<input type="password" required maxLength={200} autoComplete="new-password" value={form.again} onChange={(event) => setForm({ ...form, again: event.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save and enter'} <span>→</span></button>
      </form>
      <p className="auth-switch">Changing it signs this account out everywhere else. <button type="button" onClick={signOut}>Cancel and sign out</button></p>
    </section>
  </main>;
}
