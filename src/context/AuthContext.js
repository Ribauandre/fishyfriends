import React, { createContext, useContext, useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';
import compressImage from '../utils/compressImage';
import { upgradeCost, UPGRADE_TRACKS, MAX_UPGRADE_LEVEL } from '../utils/gameUpgrades';
import { OFFSHORE_CHARTER_COST, BIOMES } from '../utils/gameBiomes';
import { isNewRecord, speciesLabel, sizeLabel } from '../utils/gameSpecies';
import { advanceQuests, QUEST_BY_KEY, questState } from '../utils/gameQuests';
import { rankDerby, previousDerby } from '../utils/gameDerby';
import { LURES, FLY_ROD } from '../utils/gameLures';

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

  const GAME_DEFAULT_PROFILE = { tackle_points: 0, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, owned_lures: [], fly_rod: false, records: {}, quests: {}, bounties_claimed: [], derby_wins: [] };
  const FISH_YEAR_BOUNTY_POINTS = 15;

  // Cast & Catch's tackle profile: spendable points plus gear levels. Fetch-on-demand, same
  // as everything else here — the minigame page loads it itself rather than this provider
  // holding it in global state. No row yet just means a brand-new player.
  async function getGameProfile() {
    if (!isSupabaseConfigured || !user) return null;
    const { data } = await supabase.from('game_profiles').select('*').eq('user_id', user.id).maybeSingle();
    if (data) return data;
    const fallback = { user_id: user.id, ...GAME_DEFAULT_PROFILE };
    await supabase.from('game_profiles').upsert({ ...fallback, updated_at: new Date().toISOString() });
    return fallback;
  }

  async function listMyGameCatches(limit = 50) {
    if (!isSupabaseConfigured || !user) return [];
    const { data } = await supabase.from('game_catches').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(limit);
    return data || [];
  }

  // Logs a trophy-case entry and credits its points to the tackle balance, then rolls the
  // catch into the almanac (a new species or a bigger one than before is a record) and every
  // open NPC quest, all in the same profile write. Purely a fun side game — this never
  // touches fish_year_catches or tournament_entries.
  async function logGameCatch({ species, rarity, sizeLabel: label, pointsEarned, sizeIn = 0, biome = '' }) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before logging a catch.') };
    const authorName = profile.display_name || user.email?.split('@')[0] || 'Angler';
    const row = { user_id: user.id, angler_name: authorName, species, rarity, size_label: label || '', points_earned: pointsEarned || 0, size_in: sizeIn || 0, biome };
    const { data, error } = await supabase.from('game_catches').insert(row).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    const currentGameProfile = await getGameProfile();
    const nextPoints = (currentGameProfile?.tackle_points || 0) + (pointsEarned || 0);
    const records = { ...(currentGameProfile?.records || {}) };
    const isRecord = isNewRecord(records, species, sizeIn);
    if (isRecord) records[species] = { size_in: sizeIn, catch_id: data?.id || null, at: new Date().toISOString() };
    const { quests, completed } = advanceQuests(currentGameProfile?.quests || {}, { species, sizeIn, biome });
    const { data: updatedProfile, error: profileError } = await supabase.from('game_profiles')
      .update({ tackle_points: nextPoints, records, quests, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (profileError) return { error: null, catchEntry: data, gameProfile: currentGameProfile, isRecord, completedQuests: completed };
    return { error: null, catchEntry: data, gameProfile: updatedProfile, isRecord, completedQuests: completed };
  }

  // Turns in a finished quest with its giver for the points it promised. Unlock rewards
  // (The Canyon) need no turn-in — they're live the moment the quest is done.
  async function claimQuestReward(questKey) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before turning in a quest.') };
    const quest = QUEST_BY_KEY[questKey];
    if (!quest?.reward?.points) return { error: new Error('Nothing to turn in for that.') };
    const currentGameProfile = await getGameProfile();
    const state = questState(currentGameProfile?.quests, questKey);
    if (!state.done) return { error: new Error("That one's not finished yet.") };
    if (state.claimed) return { error: new Error('Already turned in.') };
    const quests = { ...(currentGameProfile?.quests || {}), [questKey]: { ...state, claimed: true } };
    const nextPoints = (currentGameProfile?.tackle_points || 0) + quest.reward.points;
    const { data, error } = await supabase.from('game_profiles')
      .update({ quests, tackle_points: nextPoints, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data, points: quest.reward.points };
  }

  // This week's club derby: everyone's catches of the target species since Monday, ranked
  // one row per angler (see utils/gameDerby.js). game_catches snapshots angler_name; avatars
  // come from profiles so the board looks like the rest of the site's leaderboards.
  async function listDerbyLeaders({ species, since, until = null }) {
    if (!isSupabaseConfigured) return [];
    let query = supabase.from('game_catches').select('*').eq('species', species).gte('created_at', since);
    if (until) query = query.lt('created_at', until);
    const [catchesRes, profilesRes] = await Promise.all([
      query.order('size_in', { ascending: false }).limit(200),
      supabase.from('profiles').select('id, display_name, avatar_url'),
    ]);
    const profileById = new Map((profilesRes.data || []).map((row) => [row.id, row]));
    const rows = (catchesRes.data || []).map((row) => ({ ...row, avatar_url: profileById.get(row.user_id)?.avatar_url || '' }));
    return rankDerby(rows);
  }

  // The derby's prize. Checks last week's final board; if you topped it and haven't been paid
  // for that week yet, the week key goes on your derby_wins and the Golden Pennant is yours
  // for this week (utils/gameDerby.isChampion). Only ever writes your own row.
  async function claimDerbyWin(now = new Date()) {
    if (!isSupabaseConfigured || !user) return { won: false };
    const last = previousDerby(now);
    const currentGameProfile = await getGameProfile();
    const wins = currentGameProfile?.derby_wins || [];
    if (wins.includes(last.key)) return { won: false, alreadyClaimed: true, derby: last };
    const leaders = await listDerbyLeaders({ species: last.species, since: last.since, until: last.until });
    const winner = leaders[0];
    if (!winner || winner.userId !== user.id) return { won: false, derby: last, winner: winner || null };
    const { data, error } = await supabase.from('game_profiles')
      .update({ derby_wins: [...wins, last.key], updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { won: false, error }; }
    return { won: true, derby: last, sizeIn: winner.sizeIn, gameProfile: data };
  }

  // Real Fish Year catches pay a tackle-point bounty in the game, once each. The angler in
  // Cast & Catch is the real person, so the real logbook is worth something at Sal's.
  async function listFishYearBounties() {
    if (!isSupabaseConfigured || !user) return [];
    const [catchesRes, currentGameProfile] = await Promise.all([
      supabase.from('fish_year_catches').select('id, species, month, year, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
      getGameProfile(),
    ]);
    const claimed = new Set(currentGameProfile?.bounties_claimed || []);
    return (catchesRes.data || []).filter((row) => !claimed.has(row.id)).map((row) => ({ id: row.id, species: row.species, month: row.month, year: row.year, points: FISH_YEAR_BOUNTY_POINTS }));
  }

  async function claimFishYearBounties() {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before claiming a bounty.') };
    const unclaimed = await listFishYearBounties();
    if (unclaimed.length === 0) return { error: new Error('Nothing new to claim — log a real catch first.') };
    const currentGameProfile = await getGameProfile();
    const points = unclaimed.length * FISH_YEAR_BOUNTY_POINTS;
    const { data, error } = await supabase.from('game_profiles').update({
      tackle_points: (currentGameProfile?.tackle_points || 0) + points,
      bounties_claimed: [...(currentGameProfile?.bounties_claimed || []), ...unclaimed.map((row) => row.id)],
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data, claimed: unclaimed.length, points };
  }

  // Spends tackle points to bump one gear track a level. Every track only smooths the
  // existing cast/hookset/reel-in skill checks (see utils/gameUpgrades.js) — it never
  // auto-lands a fish for you.
  async function purchaseUpgrade(trackKey) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before upgrading your gear.') };
    const track = UPGRADE_TRACKS.find((candidate) => candidate.key === trackKey);
    if (!track) return { error: new Error('Unknown upgrade.') };
    const currentGameProfile = await getGameProfile();
    const currentLevel = currentGameProfile?.[track.column] || 1;
    if (currentLevel >= MAX_UPGRADE_LEVEL) return { error: new Error('That gear is already maxed out.') };
    const cost = upgradeCost(currentLevel);
    if ((currentGameProfile?.tackle_points || 0) < cost) return { error: new Error('Not enough tackle points yet.') };
    const nextPoints = currentGameProfile.tackle_points - cost;
    const { data, error } = await supabase.from('game_profiles')
      .update({ [track.column]: currentLevel + 1, tackle_points: nextPoints, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data };
  }

  // Spends tackle points to charter a boat for an offshore trip — the epic/legendary species
  // only spawn out there (see utils/gameBiomes.js). One charter covers however many casts the
  // trip lasts; FishingGame only calls this again once the player has left and come back.
  async function charterBoat(biome = 'offshore') {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before chartering a boat.') };
    const cost = BIOMES[biome]?.charterCost || OFFSHORE_CHARTER_COST;
    const currentGameProfile = await getGameProfile();
    if ((currentGameProfile?.tackle_points || 0) < cost) return { error: new Error('Not enough tackle points to charter a boat.') };
    const nextPoints = currentGameProfile.tackle_points - cost;
    const { data, error } = await supabase.from('game_profiles')
      .update({ tackle_points: nextPoints, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data };
  }

  // One-time lure unlock, paid in tackle points. Live bait is free and never needs unlocking;
  // which lure is currently tied on is a per-session choice FishingGame keeps to itself.
  async function purchaseLure(lureKey) {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before buying a lure.') };
    const lure = LURES[lureKey];
    if (!lure) return { error: new Error('Unknown lure.') };
    const currentGameProfile = await getGameProfile();
    const owned = currentGameProfile?.owned_lures || [];
    if (lure.cost === 0 || owned.includes(lureKey)) return { error: new Error('You already have that lure.') };
    if (lure.rod === 'fly' && !currentGameProfile?.fly_rod) return { error: new Error('You need the fly rod before you can fish flies.') };
    if ((currentGameProfile?.tackle_points || 0) < lure.cost) return { error: new Error('Not enough tackle points yet.') };
    const nextPoints = currentGameProfile.tackle_points - lure.cost;
    const { data, error } = await supabase.from('game_profiles')
      .update({ owned_lures: [...owned, lureKey], tackle_points: nextPoints, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data };
  }

  // The fly rod, once: a flag on the profile (migration 0021) that lets flies be bought and
  // tied on. Flies themselves go through purchaseLure like any other lure.
  async function purchaseFlyRod() {
    if (!isSupabaseConfigured || !user) return { error: new Error('Sign in before buying a rod.') };
    const currentGameProfile = await getGameProfile();
    if (currentGameProfile?.fly_rod) return { error: new Error('You already own the fly rod.') };
    if ((currentGameProfile?.tackle_points || 0) < FLY_ROD.cost) return { error: new Error('Not enough tackle points yet.') };
    const nextPoints = currentGameProfile.tackle_points - FLY_ROD.cost;
    const { data, error } = await supabase.from('game_profiles')
      .update({ fly_rod: true, tackle_points: nextPoints, updated_at: new Date().toISOString() }).eq('user_id', user.id).select().maybeSingle();
    if (error) { setNotice(error.message); return { error }; }
    return { error: null, gameProfile: data };
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
    const [catchesRes, bestsRes, entriesRes, profilesRes, tournamentsRes, gameRes] = await Promise.all([
      supabase.from('fish_year_catches').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('personal_bests').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('tournament_entries').select('*').order('created_at', { ascending: false }).limit(limit),
      supabase.from('profiles').select('id, display_name, avatar_url'),
      supabase.from('tournaments').select('id, name, unit'),
      supabase.from('game_catches').select('*').eq('rarity', 'legendary').order('created_at', { ascending: false }).limit(limit),
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

    // Only legendary game catches make the feed — a club-wide "did you see that?" moment,
    // not every bluegill from the minigame.
    const gameCatches = (gameRes?.data || []).map((row) => gameCatchActivity(row, profileById.get(row.user_id)));

    return [...catches, ...bests, ...entries, ...gameCatches]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
  }

  function gameCatchActivity(row, profileRow) {
    return {
      kind: 'game_catch', id: row.id, userId: row.user_id, anglerName: row.angler_name, avatarUrl: profileRow?.avatar_url || '',
      species: speciesLabel(row.species), photoUrl: '', caughtAt: row.created_at, createdAt: row.created_at,
      sizeLabel: row.size_in ? sizeLabel(row.size_in) : row.size_label, rarity: row.rarity, href: '/fishing-game',
    };
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_catches' }, async ({ new: row }) => {
        if (row.rarity !== 'legendary') return;
        const { data: profileRow } = await supabase.from('profiles').select('display_name, avatar_url').eq('id', row.user_id).maybeSingle();
        onInsert(gameCatchActivity(row, profileRow));
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

  // Cast & Catch presence: everyone with the game open shares one Realtime presence channel,
  // keyed by user id, carrying where they are and what they're doing. Nothing is stored —
  // Presence is in-memory on the Realtime server and vanishes when the tab closes — so this is
  // the one piece of the game that is deliberately not a table. onSync gets everyone but you.
  function joinDock(initial, onSync) {
    if (!isSupabaseConfigured || !user) return { update: () => {}, leave: () => {} };
    const channel = supabase.channel('cast-and-catch-dock', { config: { presence: { key: user.id } } });
    const sync = () => {
      const state = channel.presenceState() || {};
      const others = Object.entries(state)
        .filter(([key]) => key !== user.id)
        .map(([key, metas]) => ({ userId: key, ...(metas[metas.length - 1] || {}) }))
        .filter((entry) => entry.name);
      onSync(others);
    };
    channel.on('presence', { event: 'sync' }, sync).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await channel.track({ ...initial, at: Date.now() });
    });
    return {
      update: (payload) => channel.track({ ...payload, at: Date.now() }),
      leave: () => supabase.removeChannel(channel),
    };
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
    getGameProfile, listMyGameCatches, logGameCatch, purchaseUpgrade, charterBoat, purchaseLure, purchaseFlyRod,
    claimQuestReward, listDerbyLeaders, listFishYearBounties, claimFishYearBounties, joinDock, claimDerbyWin,
    isSupabaseConfigured,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() { return useContext(AuthContext); }
