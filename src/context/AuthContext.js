import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

const AuthContext = createContext(null);
const defaultProfile = { display_name: 'New angler', home_water: '', favorite_species: '', bio: '', avatar_url: '' };

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
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/`,
      },
    });
    if (result.error) setNotice(result.error.message);
    else if (!result.data.session) setNotice('Confirmation email sent. Open it on this device, then return here to sign in.');
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

  async function uploadAvatar(file) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before uploading a profile photo.') };
    if (!file?.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    if (file.size > 5 * 1024 * 1024) return { error: new Error('Profile photos must be smaller than 5 MB.') };
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
    if (uploadError) { setNotice(uploadError.message); return { error: uploadError }; }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
    const result = await updateProfile({ ...profile, avatar_url: avatarUrl });
    if (!result.error) setNotice('Profile photo updated.');
    return { ...result, avatarUrl };
  }

  return <AuthContext.Provider value={{ user, profile, loading, notice, setNotice, signIn, signUp, signOut, updateProfile, uploadAvatar, isSupabaseConfigured }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }