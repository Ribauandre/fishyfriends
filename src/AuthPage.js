import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import { safePath, takeReturnTo } from './utils/returnTo';
import { MIN_PASSWORD_LENGTH } from './utils/passwordCheck';

const HEADINGS = {
  signin: ['WELCOME BACK', 'Sign in to your dock'],
  signup: ['JOIN THE CREW', 'Grab your spot on the dock'],
  forgot: ['LOST THE KEY', 'Reset your password'],
};

const twoDigits = (count) => String(count).padStart(2, '0');

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const { signIn, signUp, requestPasswordReset, isSupabaseConfigured, notice, setNotice, getClubStats } = useAuth();
  // A message from the last form (a wrong password, say) doesn't belong on the next one.
  function switchTo(next) { setError(''); setNotice?.(''); setMode(next); }
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Live totals; until they arrive (or if they can't be had) the row isn't shown at all.
  useEffect(() => {
    let live = true;
    Promise.resolve(getClubStats?.()).then((next) => { if (live && next) setStats(next); }).catch(() => {});
    return () => { live = false; };
    // Once per visit: the provider hands out a new function every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault(); setError('');
    if (mode === 'signup' && !form.displayName.trim()) return setError('Add a display name to get started.');
    setBusy(true);
    if (mode === 'forgot') {
      const reset = await requestPasswordReset(form.email);
      setBusy(false);
      if (reset?.error) setError(reset.error.message); else setResetSent(true);
      return undefined;
    }
    const result = mode === 'signin' ? await signIn(form.email, form.password) : await signUp(form.email, form.password, form.displayName);
    setBusy(false);
    if (result?.error) setError(result.error.message);
    else if (mode === 'signup' && isSupabaseConfigured) {
      setConfirmationSent(true);
      setMode('signin');
    }
    else {
      const stored = takeReturnTo();
      navigate(safePath(location.state?.from) || stored || '/home', { replace: true });
    }
  }

  return <main className="auth-page"><section className="auth-story"><div className="auth-fishing-scene" aria-hidden="true"><div className="auth-shark"><FishIllustration species="stripedbass" /></div></div><span className="eyebrow">FISHY FRIENDS CLUB</span><h1>Your best catch deserves better than a blurry group chat photo.</h1><p>One place for your catches, your crew, and the trash talk that comes with them.</p>{stats && <div className="auth-stat-row" data-testid="club-stats"><strong>{twoDigits(stats.anglers)}</strong><span>{stats.anglers === 1 ? 'angler' : 'anglers'} currently bragging</span><strong>{twoDigits(stats.fish)}</strong><span>fish logged in {stats.year}</span></div>}</section><section className="auth-panel"><div className="brand-mark"><span>FF</span><div><strong>Fishy Friends</strong><small>Friends, fish, and bragging rights</small></div></div>{resetSent ? <div className="confirmation-panel" role="status"><span className="confirmation-icon">✓</span><span className="eyebrow">CHECK YOUR EMAIL</span><h2>Reset link on its way.</h2><p>If <strong>{form.email}</strong> has an account here, a link to set a new password is in its inbox. Open it on this device. It works once, and not for long.</p><button className="button button-primary" type="button" onClick={() => { setResetSent(false); switchTo('signin'); }}>Back to sign in <span>→</span></button></div> : confirmationSent ? <div className="confirmation-panel"><span className="confirmation-icon">✓</span><span className="eyebrow">ONE LAST CAST</span><h2>Check your inbox.</h2><p>We sent a confirmation link to <strong>{form.email}</strong>. Open it on this device and you're on the dock.</p><button className="button button-primary" type="button" onClick={() => setConfirmationSent(false)}>Back to sign in <span>→</span></button></div> : <><div className="auth-heading"><span className="eyebrow">{HEADINGS[mode][0]}</span><h2>{HEADINGS[mode][1]}</h2></div>{!isSupabaseConfigured && <p className="config-error">Sign-in is temporarily unavailable because this deployment is missing its Supabase configuration.</p>}<form onSubmit={handleSubmit} className="auth-form">{mode === 'signup' && <label>Display name<input value={form.displayName} maxLength={80} autoComplete="nickname" onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="How friends know you" /></label>}{mode === 'forgot' && <p className="auth-switch">Type the email you signed up with and we'll send a link to set a new password.</p>}<label>Email<input type="email" required maxLength={254} autoComplete="username" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>{mode !== 'forgot' && <label>Password{mode === 'signup'
      ? <input type="password" required minLength={MIN_PASSWORD_LENGTH} maxLength={200} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`} />
      : <input type="password" required maxLength={200} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Your password" />}</label>}{(error || notice) && <p className="form-error">{error || notice}</p>}<button className="button button-primary" disabled={!isSupabaseConfigured || busy} type="submit">{mode === 'signin' ? 'Enter the club' : mode === 'signup' ? 'Count me in' : 'Send reset link'} <span>→</span></button></form>{mode === 'signin' && <p className="auth-switch"><button type="button" onClick={() => switchTo('forgot')}>Forgot your password?</button></p>}<p className="auth-switch">{mode === 'signin' ? 'New around here?' : 'Already have an account?'} <button type="button" onClick={() => switchTo(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Join up' : 'Sign in'}</button></p></>}</section></main>;
}