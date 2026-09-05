import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [error, setError] = useState('');
  const { signIn, signUp, isSupabaseConfigured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  async function handleSubmit(event) {
    event.preventDefault(); setError('');
    if (mode === 'signup' && !form.displayName.trim()) return setError('Add a display name to get started.');
    const result = mode === 'signin' ? await signIn(form.email, form.password) : await signUp(form.email, form.password, form.displayName);
    if (result?.error) setError(result.error.message);
    else if (mode === 'signup' && isSupabaseConfigured) setMode('signin');
    else navigate(location.state?.from || '/home');
  }

  return <main className="auth-page"><section className="auth-story"><span className="eyebrow">FISHY FRIENDS CLUB</span><h1>Your best catches deserve a home.</h1><p>Keep your challenge progress, profile, and fishing crew in one calm place.</p><div className="auth-stat-row"><strong>2025</strong><span>season archived</span><strong>08</strong><span>active anglers</span></div></section><section className="auth-panel"><div className="brand-mark"><span>FF</span><div><strong>Fishy Friends</strong><small>Community fishing log</small></div></div><div className="auth-heading"><span className="eyebrow">{mode === 'signin' ? 'WELCOME BACK' : 'JOIN THE CREW'}</span><h2>{mode === 'signin' ? 'Sign in to your dock' : 'Create your fishing profile'}</h2></div><form onSubmit={handleSubmit} className="auth-form">{mode === 'signup' && <label>Display name<input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} placeholder="How friends know you" /></label>}<label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label><label>Password<input type="password" required minLength="6" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="At least 6 characters" /></label>{error && <p className="form-error">{error}</p>}<button className="button button-primary" type="submit">{mode === 'signin' ? 'Enter the club' : 'Create my profile'} <span>→</span></button></form><p className="auth-switch">{mode === 'signin' ? 'New to Fishy Friends?' : 'Already have an account?'} <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></p>{!isSupabaseConfigured && <p className="preview-note">Preview mode is on. This form works locally until Supabase environment keys are added.</p>}</section></main>;
}