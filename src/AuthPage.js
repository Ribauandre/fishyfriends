import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import { safePath, takeReturnTo } from './utils/returnTo';

const twoDigits = (count) => String(count).padStart(2, '0');

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const [confirmationSent, setConfirmationSent] = useState(false);
  const { signIn, signUp, isSupabaseConfigured, notice, getClubStats } = useAuth();
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
    const result = mode === 'signin' ? await signIn(form.email, form.password) : await signUp(form.email, form.password, form.displayName);
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

  return <main className="auth-page"><section className="auth-story"><div className="auth-fishing-scene" aria-hidden="true"><div className="auth-shark"><FishIllustration species="stripedbass" /></div></div><span className="eyebrow">FISHY FRIENDS CLUB</span><h1>Your best catch deserves better than a blurry group chat photo.</h1><p>One place for your catches, your crew, and the trash talk that comes with them.</p>{stats && <div className="auth-stat-row" data-testid="club-stats"><strong>{twoDigits(stats.anglers)}</strong><span>{stats.anglers === 1 ? 'angler' : 'anglers'} currently bragging</span><strong>{twoDigits(stats.fish)}</strong><span>fish logged in {stats.year}</span></div>}</section><section className="auth-panel"><div className="brand-mark"><span>FF</span><div><strong>Fishy Friends</strong><small>Friends, fish, and bragging rights</small></div></div>{confirmationSent ? <div className="confirmation-panel"><span className="confirmation-icon">✓</span><span className="eyebrow">ONE LAST CAST</span><h2>Check your inbox.</h2><p>We sent a confirmation link to <strong>{form.email}</strong>. Open it on this device and you're on the dock.</p><button className="button button-primary" type="button" onClick={() => setConfirmationSent(false)}>Back to sign in <span>→</span></button></div> : <><div className="auth-heading"><span className="eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN THE CREW'}</span><h2>{mode === 'signin' ? 'Sign in to your dock' : 'Grab your spot on the dock'}</h2></div>{!isSupabaseConfigured && <p className="config-error">Sign-in is temporarily unavailable because this deployment is missing its Supabase configuration.</p>}<form onSubmit={handleSubmit} className="auth-form">{mode === 'signup' && <label>Display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="How friends know you" /></label>}<label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<input type="password" required minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></label>{(error || notice) && <p className="form-error">{error || notice}</p>}<button className="button button-primary" disabled={!isSupabaseConfigured} type="submit">{mode === 'signin' ? 'Enter the club' : 'Count me in' } <span>→</span></button></form><p className="auth-switch">{mode === 'signin' ? 'New around here?' : 'Already have an account?'} <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Join up' : 'Sign in'}</button></p></>}</section></main>;
}