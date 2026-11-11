import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MIN_PASSWORD_LENGTH } from '../utils/passwordCheck';

export const PASSWORD_ANCHOR = 'password';

// Your password and where you're signed in. Changing the password asks for the current one
// (a phone left unlocked shouldn't be enough to lock you out) and signs the account out
// everywhere else; "sign out everywhere" is for a lost phone or a borrowed computer.
export default function PasswordSection() {
  const { user, passwordWarning, changePassword, signOutEverywhere, requestPasswordReset } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaved(false);
    if (form.next !== form.again) { setError('Those two don\'t match. Type the new password the same way twice.'); return; }
    setSaving(true); setError('');
    const result = await changePassword(form.current, form.next);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    setForm({ current: '', next: '', again: '' });
    setSaved(true);
  }

  // Signed in on this device but can't remember the password: the same emailed link the
  // sign-in page sends, which then asks for a new one without the old.
  async function handleForgot() {
    setError(''); setResetSent(false);
    const result = await requestPasswordReset(user?.email);
    if (result?.error) setError(result.error.message); else setResetSent(true);
  }

  async function handleSignOutEverywhere() {
    setSigningOut(true); setError('');
    const result = await signOutEverywhere();
    if (result?.error) { setSigningOut(false); setConfirmingSignOut(false); setError(result.error.message); return; }
    navigate('/account');
  }

  return <section className="settings-card password-panel" id={PASSWORD_ANCHOR}>
    <div className="section-heading"><div><span className="eyebrow">YOUR ACCOUNT</span><h2>Password &amp; devices</h2></div></div>
    {passwordWarning && <p className="form-error" role="alert">The password you signed in with has turned up in data breaches, so it's on the lists people try first. Change it here.</p>}
    <form onSubmit={handleSubmit}>
      <input type="email" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
      <label>Current password<input type="password" required maxLength={200} autoComplete="current-password" value={form.current} onChange={(event) => setForm({ ...form, current: event.target.value })} /></label>
      <p className="field-hint">Can't remember it? <button type="button" className="text-button" onClick={handleForgot}>Email me a reset link</button></p>
      {resetSent && <p className="saved-message password-reset-sent" role="status">Reset link sent to {user?.email}. Open it on this device.</p>}
      <label>New password<input type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoComplete="new-password" value={form.next} onChange={(event) => setForm({ ...form, next: event.target.value })} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} /></label>
      <label>New password again<input type="password" required maxLength={200} autoComplete="new-password" value={form.again} onChange={(event) => setForm({ ...form, again: event.target.value })} /><span className="field-hint">Changing it signs this account out on every other device.</span></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Checking...' : 'Change password'} <span>→</span></button>{saved && <span className="saved-message" role="status">Password changed</span>}</div>
    </form>
    <div className="form-actions password-devices">
      {confirmingSignOut
        ? <>
          <span>Sign out on every device, this one included?</span>
          <button className="button button-primary" type="button" disabled={signingOut} onClick={handleSignOutEverywhere}>{signingOut ? 'Signing out...' : 'Yes, sign out everywhere'}</button>
          <button className="button button-quiet" type="button" onClick={() => setConfirmingSignOut(false)}>Keep me in</button>
        </>
        : <button className="button button-quiet" type="button" onClick={() => setConfirmingSignOut(true)}>Sign out everywhere</button>}
    </div>
    <p>Lost a phone, or signed in somewhere you shouldn't have? This ends every session; other devices are out within the hour.</p>
  </section>;
}
