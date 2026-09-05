import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const defaultProfile = { display_name: 'New angler', home_water: '', favorite_species: '', bio: '' };

function profileFromUser(user) {
  return { ...defaultProfile, display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || defaultProfile.display_name };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadProfile(currentUser) {
      const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
      if (mounted) setProfile(data ? { ...defaultProfile, ...data } : profileFromUser(currentUser));
    }
    async function loadSession() {
      if (!isSupabaseConfigured) {
        if (mounted) setLoading(false);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (mounted) {
        setUser(data.session?.user || null);
        if (data.session?.user) await loadProfile(data.session.user);
        setLoading(false);
      }
    }
    loadSession();
    if (!isSupabaseConfigured) return () => { mounted = false; };
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setUser(session?.user || null);
      if (session?.user) await loadProfile(session.user);
      else setProfile(defaultProfile);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  async function signIn(email, password) {
    if (!isSupabaseConfigured) {
      const error = new Error('Authentication is not configured for this deployment.');
      setNotice(error.message);
      return { error };
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setNotice(result.error.message);
    return result;
  }

  async function signUp(email, password, displayName) {
    if (!isSupabaseConfigured) {
      const error = new Error('Authentication is not configured for this deployment.');
      setNotice(error.message);
      return { error };
    }
    const result = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (result.error) setNotice(result.error.message); else setNotice('Check your inbox to confirm your email, then sign in.');
    return result;
  }

  async function signOut() { if (isSupabaseConfigured) await supabase.auth.signOut(); setUser(null); setProfile(defaultProfile); }

  async function updateProfile(nextProfile) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Authentication is not configured for this deployment.') };
    setProfile(nextProfile);
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...nextProfile, updated_at: new Date().toISOString() });
    if (error) setNotice(error.message);
    return { error };
  }

  return <AuthContext.Provider value={{ user, profile, loading, notice, setNotice, signIn, signUp, signOut, updateProfile, isSupabaseConfigured }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }