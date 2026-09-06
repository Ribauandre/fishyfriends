import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';

jest.mock('../lib/supabase');
// eslint-disable-next-line import/first
import { __mock } from '../lib/supabase';

const fakeUser = { id: 'user-1', email: 'andre@example.com' };
const fakeProfileRow = { id: 'user-1', display_name: 'Andre', home_water: 'Raritan Bay', favorite_species: 'Striped Bass', bio: '', avatar_url: '' };

function wrapper({ children }) { return <AuthProvider>{children}</AuthProvider>; }

async function setupSignedIn() {
  __mock.reset();
  __mock.setResponse('profiles', { data: fakeProfileRow, error: null });
  __mock.setResponse('personal_bests', { data: [], error: null });
  __mock.setResponse('custom_species', { data: [], error: null });
  __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await waitFor(() => expect(result.current.user).toEqual(fakeUser));
  return result;
}

beforeEach(() => {
  __mock.reset();
});

test('loads the signed-in user and their profile on mount', async () => {
  const result = await setupSignedIn();
  expect(result.current.profile.display_name).toBe('Andre');
  expect(result.current.profile.home_water).toBe('Raritan Bay');
});

test('creates a profiles row automatically for a signed-in user who never saved Settings, so they still show up in the Anglers directory', async () => {
  __mock.setResponse('profiles', { data: null, error: null });
  __mock.setResponse('personal_bests', { data: [], error: null });
  __mock.setResponse('custom_species', { data: [], error: null });
  __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));

  // Local state falls back to a derived profile immediately...
  expect(result.current.profile.display_name).toBe('andre');
  // ...and that fallback gets persisted (an upsert, not just a read) rather than only
  // ever living in memory, so a fresh session later (or the Anglers directory, which
  // reads straight from public.profiles) will actually find this angler.
  await waitFor(() => expect(__mock.current.fromCalls.filter((table) => table === 'profiles').length).toBeGreaterThanOrEqual(2));
});

describe('signIn / signUp / signOut', () => {
  test('signIn calls Supabase with the given credentials', async () => {
    __mock.setResponse('profiles', { data: null, error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    __mock.current.auth.signInWithPassword.mockResolvedValue({ error: null, data: { user: fakeUser } });
    await result.current.signIn('andre@example.com', 'hunter2');
    expect(__mock.current.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'andre@example.com', password: 'hunter2' });
  });

  test('signUp sends a confirmation notice when no session comes back (email confirmation required)', async () => {
    __mock.setResponse('profiles', { data: null, error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: null } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    __mock.current.auth.signUp.mockResolvedValue({ error: null, data: { session: null } });
    await result.current.signUp('new@example.com', 'hunter2', 'New Angler');
    expect(__mock.current.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      password: 'hunter2',
      options: expect.objectContaining({ data: { display_name: 'New Angler' } }),
    }));
    await waitFor(() => expect(result.current.notice).toMatch(/confirmation email sent/i));
  });

  test('signOut calls Supabase and clears the local user', async () => {
    const result = await setupSignedIn();
    await result.current.signOut();
    expect(__mock.current.auth.signOut).toHaveBeenCalled();
    await waitFor(() => expect(result.current.user).toBeNull());
  });
});

describe('updateProfile', () => {
  test('upserts the profile and registers a new favorite species', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: null, error: null });
    __mock.setResponse('custom_species', { data: null, error: null });

    await result.current.updateProfile({ ...result.current.profile, favorite_species: 'Wahoo' });

    expect(__mock.current.from).toHaveBeenCalledWith('profiles');
    await waitFor(() => expect(result.current.customSpecies).toContain('Wahoo'));
  });

  test('does not register a species that is already on the canonical list', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: null, error: null });
    const customSpeciesCallsBefore = __mock.current.fromCalls.filter((table) => table === 'custom_species').length;

    await result.current.updateProfile({ ...result.current.profile, favorite_species: 'Northern Pike' });

    const customSpeciesCallsAfter = __mock.current.fromCalls.filter((table) => table === 'custom_species').length;
    expect(customSpeciesCallsAfter).toBe(customSpeciesCallsBefore);
  });

  test('sets a notice and does not register a species when the upsert fails', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: null, error: new Error('db is down') });

    await result.current.updateProfile({ ...result.current.profile, favorite_species: 'Wahoo' });

    await waitFor(() => expect(result.current.notice).toBe('db is down'));
    expect(result.current.customSpecies).not.toContain('Wahoo');
  });
});

describe('uploadAvatar', () => {
  test('uploads to the user-scoped path and saves the resulting URL on the profile', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: null, error: null });
    const file = new File(['bytes'], 'me.png', { type: 'image/png' });

    const response = await result.current.uploadAvatar(file);

    expect(__mock.current.storage.from).toHaveBeenCalledWith('avatars');
    expect(__mock.current.storageUpload).toHaveBeenCalledWith('user-1/avatar.png', file, expect.objectContaining({ upsert: true }));
    expect(response.avatarUrl).toMatch(/^https:\/\/example\.com\/photo\.jpg/);
  });
});

describe('uploadPersonalBest', () => {
  test('inserts a new personal best when none exists for that species yet', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_bests', { data: { id: 'pb-new', species: 'Striped Bass' }, error: null });

    const response = await result.current.uploadPersonalBest({ species: 'Striped Bass', sizeLabel: '38 in', caughtAt: '2026-06-12' });

    expect(response.error).toBeNull();
    await waitFor(() => expect(result.current.personalBests.some((best) => best.id === 'pb-new')).toBe(true));
  });

  test('updates the existing personal best instead of creating a duplicate for the same species', async () => {
    __mock.setResponse('profiles', { data: fakeProfileRow, error: null });
    __mock.setResponse('personal_bests', { data: [{ id: 'pb-1', species: 'Striped Bass', size_label: '30 in' }], error: null });
    __mock.setResponse('custom_species', { data: [], error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.personalBests).toHaveLength(1));

    __mock.setResponse('personal_bests', { data: { id: 'pb-1', species: 'Striped Bass', size_label: '40 in' }, error: null });
    await result.current.uploadPersonalBest({ species: 'striped bass', sizeLabel: '40 in', caughtAt: '2026-07-01' });

    await waitFor(() => expect(result.current.personalBests[0].size_label).toBe('40 in'));
    expect(result.current.personalBests).toHaveLength(1);
  });

  test('registers a brand-new species exactly once', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_bests', { data: { id: 'pb-new', species: 'Wahoo' }, error: null });
    __mock.setResponse('custom_species', { data: null, error: null });

    await result.current.uploadPersonalBest({ species: 'Wahoo', sizeLabel: '20 lb' });
    await waitFor(() => expect(result.current.customSpecies).toContain('Wahoo'));

    const upsertCallsAfterFirst = __mock.current.fromCalls.filter((table) => table === 'custom_species').length;
    await result.current.uploadPersonalBest({ species: 'Wahoo', sizeLabel: '22 lb' });
    const upsertCallsAfterSecond = __mock.current.fromCalls.filter((table) => table === 'custom_species').length;
    expect(upsertCallsAfterSecond).toBe(upsertCallsAfterFirst);
  });
});

describe('deletePersonalBest', () => {
  test('removes the best from local state on success', async () => {
    __mock.setResponse('profiles', { data: fakeProfileRow, error: null });
    __mock.setResponse('personal_bests', { data: [{ id: 'pb-1', species: 'Striped Bass' }], error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.personalBests).toHaveLength(1));

    __mock.setResponse('personal_bests', { error: null });
    await result.current.deletePersonalBest('pb-1');
    await waitFor(() => expect(result.current.personalBests).toHaveLength(0));
  });

  test('keeps local state and sets a notice on failure', async () => {
    __mock.setResponse('profiles', { data: fakeProfileRow, error: null });
    __mock.setResponse('personal_bests', { data: [{ id: 'pb-1', species: 'Striped Bass' }], error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.personalBests).toHaveLength(1));

    __mock.setResponse('personal_bests', { error: new Error('nope') });
    await result.current.deletePersonalBest('pb-1');
    expect(result.current.personalBests).toHaveLength(1);
    await waitFor(() => expect(result.current.notice).toBe('nope'));
  });
});

describe('listAnglers', () => {
  test('groups personal bests under the matching angler profile', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: [fakeProfileRow, { id: 'user-2', display_name: 'Kevin' }], error: null });
    __mock.setResponse('personal_bests', { data: [{ id: 'pb-1', user_id: 'user-1', species: 'Striped Bass' }, { id: 'pb-2', user_id: 'user-2', species: 'Steelhead' }], error: null });

    const roster = await result.current.listAnglers();

    expect(roster).toHaveLength(2);
    expect(roster.find((entry) => entry.profile.id === 'user-1').personalBests).toHaveLength(1);
    expect(roster.find((entry) => entry.profile.id === 'user-2').personalBests[0].species).toBe('Steelhead');
  });
});

describe('logFishYearCatch / deleteFishYearCatch', () => {
  test('inserts a catch snapshotting the angler name and avatar', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catches', { data: { id: 'fy-1' }, error: null });
    __mock.setResponse('custom_species', { data: null, error: null });

    const response = await result.current.logFishYearCatch({ year: 2026, month: 'June', species: 'Striped Bass', caughtAt: '2026-06-12' });

    expect(response.error).toBeNull();
    expect(response.catchEntry).toEqual({ id: 'fy-1' });
  });

  test('deleteFishYearCatch reports an error from Supabase', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catches', { error: new Error('db is down') });

    const response = await result.current.deleteFishYearCatch('fy-1');
    expect(response.error.message).toBe('db is down');
  });
});

describe('addComment / deleteComment', () => {
  test('addComment stamps the current display name as the author', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_comments', { data: { id: 'c-1', author_name: 'Andre', body: 'Nice!' }, error: null });

    const response = await result.current.addComment('pb-1', 'Nice!');
    expect(response.comment.author_name).toBe('Andre');
  });

  test('deleteComment reports success', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_comments', { error: null });
    await expect(result.current.deleteComment('c-1')).resolves.toEqual({ error: null });
  });
});
