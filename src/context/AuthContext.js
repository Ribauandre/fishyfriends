import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const LOCAL_PROFILE_KEY = 'fishyfriends-profile';
const LOCAL_USER_KEY = 'fishyfriends-user';
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
        const savedProfile = window.localStorage.getItem(LOCAL_PROFILE_KEY);
        const savedUser = window.localStorage.getItem(LOCAL_USER_KEY);
        if (mounted && savedUser) setUser(JSON.parse(savedUser));
        if (mounted && savedProfile) setProfile({ ...defaultProfile, ...JSON.parse(savedProfile) });
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
      const localUser = { id: 'local-user', email, user_metadata: { display_name: email.split('@')[0] } };
      setUser(localUser); setProfile({ ...profileFromUser(localUser), ...profile }); window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
      setNotice('Preview account active. Add Supabase keys to enable real sign-in.');
      return { error: null };
    }
    const result = await supabase.auth.signInWithPassword({ email, password });
    if (result.error) setNotice(result.error.message);
    return result;
  }

  async function signUp(email, password, displayName) {
    if (!isSupabaseConfigured) {
      const localUser = { id: 'local-user', email, user_metadata: { display_name: displayName } };
      const nextProfile = { ...defaultProfile, display_name: displayName };
      setUser(localUser); setProfile(nextProfile); window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile)); window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
      setNotice('Preview account created. Add Supabase keys to enable real sign-up.');
      return { error: null };
    }
    const result = await supabase.auth.signUp({ email, password, options: { data: { display_name: displayName } } });
    if (result.error) setNotice(result.error.message); else setNotice('Check your inbox to confirm your email, then sign in.');
    return result;
  }

  async function signOut() { if (isSupabaseConfigured) await supabase.auth.signOut(); setUser(null); setProfile(defaultProfile); window.localStorage.removeItem(LOCAL_USER_KEY); }

  async function updateProfile(nextProfile) {
    setProfile(nextProfile); window.localStorage.setItem(LOCAL_PROFILE_KEY, JSON.stringify(nextProfile));
    if (!isSupabaseConfigured || !user) return { error: null };
    const { error } = await supabase.from('profiles').upsert({ id: user.id, ...nextProfile, updated_at: new Date().toISOString() });
    if (error) setNotice(error.message);
    return { error };
  }

  return <AuthContext.Provider value={{ user, profile, loading, notice, setNotice, signIn, signUp, signOut, updateProfile, isSupabaseConfigured }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }