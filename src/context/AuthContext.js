import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

const AuthContext = createContext(null);
const defaultProfile = { display_name: 'New angler', home_water: '', favorite_species: '', bio: '', avatar_url: '' };
const KNOWN_SPECIES = new Set(SPECIES_OPTIONS.map((option) => option.label.toLowerCase()));

function profileFromUser(user) {
  return { ...defaultProfile, display_name: user?.user_metadata?.display_name || user?.email?.split('@')[0] || defaultProfile.display_name };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(defaultProfile);
  const [personalBests, setPersonalBests] = useState([]);
  const [customSpecies, setCustomSpecies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  async function loadPersonalBests(userId) {
    const { data } = await supabase.from('personal_bests').select('*').eq('user_id', userId).order('created_at', { ascending: true });
    setPersonalBests(data || []);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.from('custom_species').select('name').order('name').then(({ data }) => {
      if (active) setCustomSpecies((data || []).map((row) => row.name));
    });
    return () => { active = false; };
  }, []);

  // Adds a newly typed species to the shared list so it shows up as a suggestion for
  // everyone else too, instead of staying a one-off value only this catch/best used.
  async function registerSpecies(name) {
    const trimmed = name?.trim();
    if (!trimmed || !isSupabaseConfigured) return;
    if (KNOWN_SPECIES.has(trimmed.toLowerCase())) return;
    if (customSpecies.some((existing) => existing.toLowerCase() === trimmed.toLowerCase())) return;
    const { error } = await supabase.from('custom_species').upsert({ name: trimmed }, { onConflict: 'name', ignoreDuplicates: true });
    if (!error) setCustomSpecies((previous) => [...previous, trimmed].sort((a, b) => a.localeCompare(b)));
  }

  useEffect(() => {
    let mounted = true;
    async function loadProfile(currentUser) {
      const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).maybeSingle();
      if (mounted) setProfile(data ? { ...defaultProfile, ...data } : profileFromUser(currentUser));
      if (mounted) await loadPersonalBests(currentUser.id);
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
      else { setProfile(defaultProfile); setPersonalBests([]); }
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
    else if (nextProfile.favorite_species) registerSpecies(nextProfile.favorite_species);
    return { error };
  }

  async function uploadAvatar(file) {
    if (!file?.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    if (file.size > 5 * 1024 * 1024) return { error: new Error('Profile photos must be smaller than 5 MB.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before uploading a profile photo.') };
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

  async function uploadPersonalBest({ species, sizeLabel, caughtAt, file }) {
    if (!species?.trim()) return { error: new Error('Name the species you caught.') };
    if (file && !file.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    if (file && file.size > 5 * 1024 * 1024) return { error: new Error('Catch photos must be smaller than 5 MB.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before logging a personal best.') };

    let photoUrl;
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const slug = species.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${user.id}/${slug}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('personal-bests').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) { setNotice(uploadError.message); return { error: uploadError }; }
      const { data } = supabase.storage.from('personal-bests').getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const existing = personalBests.find((best) => best.species.toLowerCase() === species.trim().toLowerCase());
    const row = { user_id: user.id, species: species.trim(), size_label: sizeLabel || '', caught_at: caughtAt || null, ...(photoUrl ? { photo_url: photoUrl } : {}) };
    const { data, error } = existing
      ? await supabase.from('personal_bests').update(row).eq('id', existing.id).select().maybeSingle()
      : await supabase.from('personal_bests').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    setPersonalBests((previous) => existing ? previous.map((best) => (best.id === existing.id ? data : best)) : [...previous, data]);
    setNotice('Personal best saved.');
    registerSpecies(species);
    return { error: null };
  }

  async function deletePersonalBest(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a personal best.') };
    const { error } = await supabase.from('personal_bests').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    setPersonalBests((previous) => previous.filter((best) => best.id !== id));
    return { error: null };
  }

  async function listAnglers() {
    if (!isSupabaseConfigured) return [];
    const [{ data: profiles }, { data: bests }] = await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('personal_bests').select('*'),
    ]);
    return (profiles || []).map((anglerProfile) => ({
      profile: anglerProfile,
      personalBests: (bests || []).filter((best) => best.user_id === anglerProfile.id),
    }));
  }

  async function listComments(personalBestId) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('personal_best_comments').select('*').eq('personal_best_id', personalBestId).order('created_at', { ascending: true });
    return data || [];
  }

  async function addComment(personalBestId, body) {
    if (!body?.trim()) return { error: new Error('Say something first.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before commenting.') };
    const authorName = profile.display_name || user?.email?.split('@')[0] || 'Angler';
    const row = { personal_best_id: personalBestId, user_id: user.id, author_name: authorName, body: body.trim() };
    const { data, error } = await supabase.from('personal_best_comments').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, comment: data };
  }

  async function listFishYearCatches(year) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('fish_year_catches').select('*').eq('year', year).order('created_at', { ascending: true });
    return data || [];
  }

  async function logFishYearCatch({ year, month, species, caughtAt, file }) {
    if (!species?.trim()) return { error: new Error('Name the species you caught.') };
    if (file && !file.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    if (file && file.size > 5 * 1024 * 1024) return { error: new Error('Catch photos must be smaller than 5 MB.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before logging a catch.') };

    let photoUrl = '';
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const slug = species.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${user.id}/${slug}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('fish-year-catches').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) { setNotice(uploadError.message); return { error: uploadError }; }
      const { data } = supabase.storage.from('fish-year-catches').getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { user_id: user.id, angler_name: authorName, angler_avatar_url: profile.avatar_url || '', year, month, species: species.trim(), caught_at: caughtAt || null, photo_url: photoUrl };
    const { data, error } = await supabase.from('fish_year_catches').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    registerSpecies(species);
    return { error: null, catchEntry: data };
  }

  return <AuthContext.Provider value={{ user, profile, personalBests, customSpecies, loading, notice, setNotice, signIn, signUp, signOut, updateProfile, uploadAvatar, uploadPersonalBest, deletePersonalBest, listAnglers, listComments, addComment, listFishYearCatches, logFishYearCatch, isSupabaseConfigured }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
