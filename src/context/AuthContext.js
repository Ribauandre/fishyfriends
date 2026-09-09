import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';
import compressImage from '../utils/compressImage';

const AuthContext = createContext(null);
const defaultProfile = { display_name: 'New angler', home_water: '', favorite_species: '', bio: '', avatar_url: '', tour_completed_at: null };
const TOUR_STORAGE_KEY = 'fishyfriends:tour-done';

function tourSeenLocally() {
  try { return window.localStorage.getItem(TOUR_STORAGE_KEY) === '1'; } catch (storageError) { return false; }
}
const KNOWN_SPECIES = new Set(SPECIES_OPTIONS.map((option) => option.label.toLowerCase()));

const LIKE_TABLES = { personal_best: 'personal_best_likes', fish_year_catch: 'fish_year_catch_likes', tournament_entry: 'tournament_entry_likes' };
const LIKE_COLUMNS = { personal_best: 'personal_best_id', fish_year_catch: 'catch_id', tournament_entry: 'tournament_entry_id' };

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
      if (data) {
        // A later refetch (e.g. after a token refresh) can race the completeTour() write and
        // read the row before it lands, coming back with tour_completed_at still null. Once
        // this client has seen it set, keep treating the tour as done rather than letting a
        // stale read revive it.
        if (mounted) setProfile((previous) => ({ ...defaultProfile, ...data, tour_completed_at: data.tour_completed_at || previous.tour_completed_at || null }));
      } else {
        // No profiles row yet (never saved Settings) — anyone in this state can still post
        // catches and personal bests since those only need the auth user id, but the
        // Anglers directory is built from public.profiles, so they'd otherwise be invisible
        // there forever. Persist a row now so every signed-in user shows up.
        const fallback = profileFromUser(currentUser);
        if (mounted) setProfile(fallback);
        await supabase.from('profiles').upsert({ id: currentUser.id, ...fallback, updated_at: new Date().toISOString() });
      }
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

  // The feature tour runs once per person. The profile row is the source of truth so it
  // doesn't replay on a second device, but the timestamp is mirrored into localStorage so a
  // returning user never gets a flash of the tour in the moment before their profile loads.
  async function completeTour() {
    try { window.localStorage.setItem(TOUR_STORAGE_KEY, '1'); } catch (storageError) { /* private mode */ }
    setProfile((previous) => ({ ...previous, tour_completed_at: new Date().toISOString() }));
    if (!isSupabaseConfigured || !user) return { error: null };
    const { error } = await supabase.from('profiles').update({ tour_completed_at: new Date().toISOString() }).eq('id', user.id);
    return { error: error || null };
  }

  async function uploadAvatar(rawFile) {
    if (!rawFile?.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    const file = await compressImage(rawFile);
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

  async function uploadPersonalBest({ species, sizeLabel, caughtAt, file: rawFile }) {
    if (!species?.trim()) return { error: new Error('Name the species you caught.') };
    if (rawFile && !rawFile.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    const file = rawFile && await compressImage(rawFile);
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
    return { error: null, bestEntry: data };
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

  async function addComment(personalBestId, body, ownerId) {
    if (!body?.trim()) return { error: new Error('Say something first.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before commenting.') };
    const authorName = profile.display_name || user?.email?.split('@')[0] || 'Angler';
    const trimmedBody = body.trim();
    const row = { personal_best_id: personalBestId, user_id: user.id, author_name: authorName, body: trimmedBody };
    const { data, error } = await supabase.from('personal_best_comments').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    notifyIfNeeded({ recipientId: ownerId, type: 'comment', targetType: 'personal_best', targetId: personalBestId, preview: trimmedBody, commentId: data.id });
    return { error: null, comment: data };
  }

  async function deleteComment(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a comment.') };
    const { error } = await supabase.from('personal_best_comments').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function listFishYearComments(catchId) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('fish_year_catch_comments').select('*').eq('catch_id', catchId).order('created_at', { ascending: true });
    return data || [];
  }

  async function addFishYearComment(catchId, body, ownerId) {
    if (!body?.trim()) return { error: new Error('Say something first.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before commenting.') };
    const authorName = profile.display_name || user?.email?.split('@')[0] || 'Angler';
    const trimmedBody = body.trim();
    const row = { catch_id: catchId, user_id: user.id, author_name: authorName, body: trimmedBody };
    const { data, error } = await supabase.from('fish_year_catch_comments').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    notifyIfNeeded({ recipientId: ownerId, type: 'comment', targetType: 'fish_year_catch', targetId: catchId, preview: trimmedBody, commentId: data.id });
    return { error: null, comment: data };
  }

  async function deleteFishYearComment(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a comment.') };
    const { error } = await supabase.from('fish_year_catch_comments').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function listLikes(targetType, targetId) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from(LIKE_TABLES[targetType]).select('user_id').eq(LIKE_COLUMNS[targetType], targetId);
    return data || [];
  }

  async function likeTarget(targetType, targetId, ownerId) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before liking a post.') };
    const row = { [LIKE_COLUMNS[targetType]]: targetId, user_id: user.id };
    const { error } = await supabase.from(LIKE_TABLES[targetType]).insert(row);
    if (error) { setNotice(error.message); return { error }; }
    notifyIfNeeded({ recipientId: ownerId, type: 'like', targetType, targetId, preview: '' });
    return { error: null };
  }

  async function unlikeTarget(targetType, targetId) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before unliking a post.') };
    const { error } = await supabase.from(LIKE_TABLES[targetType]).delete().eq(LIKE_COLUMNS[targetType], targetId).eq('user_id', user.id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  // Fires right after a like/comment succeeds so the recipient sees it in their bell —
  // fire-and-forget (not awaited by callers) since a failed notification insert shouldn't
  // block or error out the like/comment action that triggered it. Never notifies yourself:
  // the DB's own insert policy (actor_id <> recipient_id) would reject it anyway, but
  // checking here avoids a pointless round trip when you like or comment on your own post.
  async function notifyIfNeeded({ recipientId, type, targetType, targetId, preview, commentId }) {
    if (!isSupabaseConfigured || !user || !recipientId || recipientId === user.id) return;
    const actorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    await supabase.from('notifications').insert({
      recipient_id: recipientId,
      actor_id: user.id,
      actor_name: actorName,
      type,
      target_type: targetType,
      target_id: targetId,
      comment_id: commentId || null,
      preview: preview || '',
    });
  }

  async function listNotifications() {
    if (!isSupabaseConfigured || !user) return [];
    const { data } = await supabase.from('notifications').select('*').eq('recipient_id', user.id).order('created_at', { ascending: false }).limit(50);
    return data || [];
  }

  async function markNotificationRead(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in first.') };
    const { error } = await supabase.from('notifications').update({ read: true }).eq('id', id);
    return { error: error || null };
  }

  async function markAllNotificationsRead() {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in first.') };
    const { error } = await supabase.from('notifications').update({ read: true }).eq('recipient_id', user.id).eq('read', false);
    return { error: error || null };
  }

  async function listFishYearCatches(year) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('fish_year_catches').select('*').eq('year', year).order('created_at', { ascending: true });
    return data || [];
  }

  async function logFishYearCatch({ year, month, species, caughtAt, file: rawFile }) {
    const trimmedSpecies = species?.trim();
    if (!trimmedSpecies) return { error: new Error('Name the species you caught.') };
    if (rawFile && !rawFile.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    const file = rawFile && await compressImage(rawFile);
    if (file && file.size > 5 * 1024 * 1024) return { error: new Error('Catch photos must be smaller than 5 MB.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before logging a catch.') };

    // Catches the accidental double-submit (a slow upload gets re-tapped, or the form is
    // reopened and filled out again) rather than a deliberate second fish of the same
    // species — same angler, same species, same day already on the board reads as one
    // catch entered twice. A transient failure here just skips the check, not the catch.
    if (caughtAt) {
      const { data: existing } = await supabase.from('fish_year_catches').select('id').eq('user_id', user.id).eq('year', year).eq('caught_at', caughtAt).ilike('species', trimmedSpecies).maybeSingle();
      if (existing) return { error: new Error(`You already logged a ${trimmedSpecies} on ${caughtAt} — that catch's already on the board.`) };
    }

    let photoUrl = '';
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const slug = trimmedSpecies.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${user.id}/${slug}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('fish-year-catches').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) { setNotice(uploadError.message); return { error: uploadError }; }
      const { data } = supabase.storage.from('fish-year-catches').getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { user_id: user.id, angler_name: authorName, angler_avatar_url: profile.avatar_url || '', year, month, species: trimmedSpecies, caught_at: caughtAt || null, photo_url: photoUrl };
    const { data, error } = await supabase.from('fish_year_catches').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    registerSpecies(species);
    return { error: null, catchEntry: data };
  }

  async function deleteFishYearCatch(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a catch.') };
    const { error } = await supabase.from('fish_year_catches').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function listTournaments() {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('tournaments').select('*').order('starts_on', { ascending: false });
    return data || [];
  }

  async function getTournament(id) {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase.from('tournaments').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function createTournament({ name, rules, unit, startsOn, endsOn }) {
    if (!name?.trim()) return { error: new Error('Name the tournament.') };
    if (!startsOn || !endsOn) return { error: new Error('Set both a start and end date.') };
    if (endsOn < startsOn) return { error: new Error('The end date has to be on or after the start date.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before starting a tournament.') };
    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { name: name.trim(), rules: rules?.trim() || '', unit: unit === 'lb' ? 'lb' : 'in', starts_on: startsOn, ends_on: endsOn, created_by: user.id, created_by_name: authorName };
    const { data, error } = await supabase.from('tournaments').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, tournament: data };
  }

  async function deleteTournament(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a tournament.') };
    const { error } = await supabase.from('tournaments').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function listTournamentEntries(tournamentId) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('tournament_entries').select('*').eq('tournament_id', tournamentId).order('size', { ascending: false });
    return data || [];
  }

  async function getTournamentEntry(id) {
    if (!isSupabaseConfigured) return null;
    const { data } = await supabase.from('tournament_entries').select('*').eq('id', id).maybeSingle();
    return data;
  }

  async function submitTournamentEntry({ tournamentId, species, size, caughtAt, file: rawFile }) {
    if (!species?.trim()) return { error: new Error('Name the species you caught.') };
    const numericSize = Number(size);
    if (!size || Number.isNaN(numericSize) || numericSize <= 0) return { error: new Error('Enter the size of your catch.') };
    if (rawFile && !rawFile.type.startsWith('image/')) return { error: new Error('Choose an image file.') };
    const file = rawFile && await compressImage(rawFile);
    if (file && file.size > 5 * 1024 * 1024) return { error: new Error('Catch photos must be smaller than 5 MB.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before logging a tournament entry.') };

    let photoUrl = '';
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const slug = species.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const path = `${user.id}/${slug}-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('tournament-entries').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '3600' });
      if (uploadError) { setNotice(uploadError.message); return { error: uploadError }; }
      const { data } = supabase.storage.from('tournament-entries').getPublicUrl(path);
      photoUrl = `${data.publicUrl}?v=${Date.now()}`;
    }

    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { tournament_id: tournamentId, user_id: user.id, angler_name: authorName, angler_avatar_url: profile.avatar_url || '', species: species.trim(), size: numericSize, caught_at: caughtAt || null, photo_url: photoUrl };
    const { data, error } = await supabase.from('tournament_entries').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    registerSpecies(species);
    return { error: null, entry: data };
  }

  async function deleteTournamentEntry(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a tournament entry.') };
    const { error } = await supabase.from('tournament_entries').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function listTournamentEntryComments(entryId) {
    if (!isSupabaseConfigured) return [];
    const { data } = await supabase.from('tournament_entry_comments').select('*').eq('tournament_entry_id', entryId).order('created_at', { ascending: true });
    return data || [];
  }

  async function addTournamentEntryComment(entryId, body, ownerId) {
    if (!body?.trim()) return { error: new Error('Say something first.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before commenting.') };
    const authorName = profile.display_name || user?.email?.split('@')[0] || 'Angler';
    const trimmedBody = body.trim();
    const row = { tournament_entry_id: entryId, user_id: user.id, author_name: authorName, body: trimmedBody };
    const { data, error } = await supabase.from('tournament_entry_comments').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    notifyIfNeeded({ recipientId: ownerId, type: 'comment', targetType: 'tournament_entry', targetId: entryId, preview: trimmedBody, commentId: data.id });
    return { error: null, comment: data };
  }

  async function deleteTournamentEntryComment(id) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before removing a comment.') };
    const { error } = await supabase.from('tournament_entry_comments').delete().eq('id', id);
    if (error) { setNotice(error.message); return { error }; }
    return { error: null };
  }

  async function submitBugReport({ body }) {
    if (!body?.trim()) return { error: new Error('Describe what went wrong first.') };
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before reporting a bug.') };
    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { user_id: user.id, angler_name: authorName, body: body.trim(), page_url: window.location.pathname };
    const { data, error } = await supabase.from('bug_reports').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, report: data };
  }

  // Merges the crew's three kinds of posts into one reverse-chronological feed for the Home
  // page. personal_bests doesn't snapshot an angler_name/avatar the way the other two do, so
  // it's joined against profiles here; tournament_entries needs its parent tournament's name
  // and unit to read as more than a bare number.
  async function listRecentActivity(limit = 30) {
    if (!isSupabaseConfigured) return [];
    const [catchesRes, bestsRes, entriesRes, profilesRes, tournamentsRes] = await Promise.all([
      supabase.from('fish_year_catches').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('personal_bests').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('tournament_entries').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('profiles').select('id, display_name, avatar_url'),
      supabase.from('tournaments').select('id, name, unit'),
    ]);
    const profileById = new Map((profilesRes.data || []).map((row) => [row.id, row]));
    const tournamentById = new Map((tournamentsRes.data || []).map((row) => [row.id, row]));

    const catches = (catchesRes.data || []).map((row) => ({
      kind: 'fish_year_catch', id: row.id, userId: row.user_id, anglerName: row.angler_name, avatarUrl: row.angler_avatar_url,
      species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
      month: row.month, href: `/fish-year?catch=${row.id}`,
    }));
    const bests = (bestsRes.data || []).map((row) => {
      const profile = profileById.get(row.user_id);
      return {
        kind: 'personal_best', id: row.id, userId: row.user_id, anglerName: profile?.display_name || 'Angler', avatarUrl: profile?.avatar_url || '',
        species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
        sizeLabel: row.size_label, href: `/anglers?best=${row.id}`,
      };
    });
    const entries = (entriesRes.data || []).map((row) => {
      const tournament = tournamentById.get(row.tournament_id);
      return {
        kind: 'tournament_entry', id: row.id, userId: row.user_id, anglerName: row.angler_name, avatarUrl: row.angler_avatar_url,
        species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
        size: row.size, unit: tournament?.unit || 'in', tournamentName: tournament?.name || 'a tournament',
        href: `/tournaments/${row.tournament_id}?entry=${row.id}`,
      };
    });

    return [...catches, ...bests, ...entries]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  // Gives Home's activity feed a "someone just posted" feel via Supabase Realtime instead
  // of only refreshing on the next page load. Builds each pushed item into the exact same
  // shape listRecentActivity returns, so ActivityFeed doesn't need to know the difference.
  // fish_year_catches and tournament_entries snapshot the poster's name/avatar on the row
  // itself, same as listRecentActivity relies on; personal_bests doesn't, so that one needs
  // a follow-up profile lookup, and tournament_entries needs its parent tournament's name/
  // unit the same way listRecentActivity's own query joins it in.
  function subscribeToActivity(onInsert) {
    if (!isSupabaseConfigured) return () => {};
    const channel = supabase.channel('home-activity-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fish_year_catches' }, ({ new: row }) => {
        onInsert({
          kind: 'fish_year_catch', id: row.id, userId: row.user_id, anglerName: row.angler_name, avatarUrl: row.angler_avatar_url,
          species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
          month: row.month, href: `/fish-year?catch=${row.id}`,
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'personal_bests' }, async ({ new: row }) => {
        const { data: profileRow } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', row.user_id).maybeSingle();
        onInsert({
          kind: 'personal_best', id: row.id, userId: row.user_id, anglerName: profileRow?.display_name || 'Angler', avatarUrl: profileRow?.avatar_url || '',
          species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
          sizeLabel: row.size_label, href: `/anglers?best=${row.id}`,
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tournament_entries' }, async ({ new: row }) => {
        const tournament = await getTournament(row.tournament_id);
        onInsert({
          kind: 'tournament_entry', id: row.id, userId: row.user_id, anglerName: row.angler_name, avatarUrl: row.angler_avatar_url,
          species: row.species, photoUrl: row.photo_url, caughtAt: row.caught_at, createdAt: row.created_at,
          size: row.size, unit: tournament?.unit || 'in', tournamentName: tournament?.name || 'a tournament',
          href: `/tournaments/${row.tournament_id}?entry=${row.id}`,
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }

  const shouldShowTour = Boolean(user) && !loading && !profile.tour_completed_at && !tourSeenLocally();

  return <AuthContext.Provider value={{
    user, profile, personalBests, customSpecies, loading, notice, setNotice,
    shouldShowTour, completeTour,
    signIn, signUp, signOut, updateProfile, uploadAvatar,
    uploadPersonalBest, deletePersonalBest, listAnglers,
    listComments, addComment, deleteComment,
    listFishYearCatches, logFishYearCatch, deleteFishYearCatch,
    listFishYearComments, addFishYearComment, deleteFishYearComment,
    listTournaments, getTournament, createTournament, deleteTournament,
    listTournamentEntries, getTournamentEntry, submitTournamentEntry, deleteTournamentEntry,
    listTournamentEntryComments, addTournamentEntryComment, deleteTournamentEntryComment,
    subscribeToActivity,
    listRecentActivity,
    listLikes, likeTarget, unlikeTarget,
    listNotifications, markNotificationRead, markAllNotificationsRead,
    submitBugReport,
    isSupabaseConfigured,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
