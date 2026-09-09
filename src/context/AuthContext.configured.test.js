import { act, renderHook, waitFor } from '@testing-library/react';
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
    __mock.setResponse('notifications', { error: null });

    const response = await result.current.addComment('pb-1', 'Nice!', 'user-2');
    expect(response.comment.author_name).toBe('Andre');
  });

  test('deleteComment reports success', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_comments', { error: null });
    await expect(result.current.deleteComment('c-1')).resolves.toEqual({ error: null });
  });

  test('notifies the personal best owner, snapshotting the comment body as a preview', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_comments', { data: { id: 'c-1', author_name: 'Andre', body: 'Nice!' }, error: null });
    __mock.setResponse('notifications', { error: null });

    await result.current.addComment('pb-1', 'Nice!', 'user-2');

    expect(__mock.current.from).toHaveBeenCalledWith('notifications');
    const notificationCallIndex = __mock.current.fromCalls.indexOf('notifications');
    const builder = __mock.current.from.mock.results[notificationCallIndex].value;
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: 'user-2', actor_id: 'user-1', actor_name: 'Andre', type: 'comment', target_type: 'personal_best', target_id: 'pb-1', preview: 'Nice!', comment_id: 'c-1',
    }));
  });

  test('does not notify when commenting on your own personal best', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_comments', { data: { id: 'c-1', author_name: 'Andre', body: 'Nice!' }, error: null });
    const notificationCallsBefore = __mock.current.fromCalls.filter((table) => table === 'notifications').length;

    await result.current.addComment('pb-1', 'Nice!', 'user-1');

    const notificationCallsAfter = __mock.current.fromCalls.filter((table) => table === 'notifications').length;
    expect(notificationCallsAfter).toBe(notificationCallsBefore);
  });
});

describe('Fish Year catch comments', () => {
  test('addFishYearComment stamps the author and notifies the catch owner', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catch_comments', { data: { id: 'fc-1', author_name: 'Andre', body: 'Great fish!' }, error: null });
    __mock.setResponse('notifications', { error: null });

    const response = await result.current.addFishYearComment('fy-1', 'Great fish!', 'user-2');

    expect(response.comment.author_name).toBe('Andre');
    expect(__mock.current.from).toHaveBeenCalledWith('notifications');
    const notificationCallIndex = __mock.current.fromCalls.indexOf('notifications');
    const builder = __mock.current.from.mock.results[notificationCallIndex].value;
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 'fc-1' }));
  });

  test('deleteFishYearComment reports success', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catch_comments', { error: null });
    await expect(result.current.deleteFishYearComment('fc-1')).resolves.toEqual({ error: null });
  });
});

describe('likes', () => {
  test('listLikes reads from the table matching the target type', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_likes', { data: [{ user_id: 'user-2' }], error: null });

    const likes = await result.current.listLikes('personal_best', 'pb-1');

    expect(__mock.current.from).toHaveBeenCalledWith('personal_best_likes');
    expect(likes).toEqual([{ user_id: 'user-2' }]);
  });

  test('likeTarget inserts a like and notifies the owner', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catch_likes', { error: null });
    __mock.setResponse('notifications', { error: null });

    const response = await result.current.likeTarget('fish_year_catch', 'fy-1', 'user-2');

    expect(response.error).toBeNull();
    expect(__mock.current.from).toHaveBeenCalledWith('fish_year_catch_likes');
    expect(__mock.current.from).toHaveBeenCalledWith('notifications');
    const notificationCallIndex = __mock.current.fromCalls.indexOf('notifications');
    const builder = __mock.current.from.mock.results[notificationCallIndex].value;
    expect(builder.insert).toHaveBeenCalledWith(expect.objectContaining({ comment_id: null }));
  });

  test('likeTarget does not notify when you like your own post', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_likes', { error: null });
    const notificationCallsBefore = __mock.current.fromCalls.filter((table) => table === 'notifications').length;

    await result.current.likeTarget('personal_best', 'pb-1', 'user-1');

    const notificationCallsAfter = __mock.current.fromCalls.filter((table) => table === 'notifications').length;
    expect(notificationCallsAfter).toBe(notificationCallsBefore);
  });

  test('unlikeTarget deletes from the matching likes table', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('personal_best_likes', { error: null });

    const response = await result.current.unlikeTarget('personal_best', 'pb-1');

    expect(response.error).toBeNull();
    expect(__mock.current.from).toHaveBeenCalledWith('personal_best_likes');
  });
});

describe('notifications', () => {
  test('listNotifications reads the current user\'s notifications', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('notifications', { data: [{ id: 'n-1', recipient_id: 'user-1' }], error: null });

    const list = await result.current.listNotifications();

    expect(__mock.current.from).toHaveBeenCalledWith('notifications');
    expect(list).toEqual([{ id: 'n-1', recipient_id: 'user-1' }]);
  });

  test('markNotificationRead reports success', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('notifications', { error: null });
    await expect(result.current.markNotificationRead('n-1')).resolves.toEqual({ error: null });
  });

  test('markAllNotificationsRead reports success', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('notifications', { error: null });
    await expect(result.current.markAllNotificationsRead()).resolves.toEqual({ error: null });
  });
});

describe('feature tour', () => {
  beforeEach(() => { window.localStorage.clear(); });

  test('flags the tour for an angler whose profile has never completed it', async () => {
    const result = await setupSignedIn();
    expect(result.current.shouldShowTour).toBe(true);
  });

  test('does not flag the tour once the profile records a completion', async () => {
    __mock.setResponse('profiles', { data: { ...fakeProfileRow, tour_completed_at: '2026-01-02T00:00:00Z' }, error: null });
    __mock.setResponse('personal_bests', { data: [], error: null });
    __mock.setResponse('custom_species', { data: [], error: null });
    __mock.current.auth.getSession.mockResolvedValue({ data: { session: { user: fakeUser } } });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.shouldShowTour).toBe(false);
  });

  test('completeTour persists to the profile so a second device does not replay it', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { error: null });

    await result.current.completeTour();

    expect(__mock.current.from).toHaveBeenCalledWith('profiles');
    await waitFor(() => expect(result.current.shouldShowTour).toBe(false));
  });

  test('a later profile refetch racing the completeTour() write does not revive the tour', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { error: null });
    await result.current.completeTour();
    await waitFor(() => expect(result.current.shouldShowTour).toBe(false));

    // A background auth event (e.g. a token refresh) triggers another profile fetch, which
    // reads the row before the completeTour() write above has actually landed — still null.
    __mock.setResponse('profiles', { data: { ...fakeProfileRow, tour_completed_at: null }, error: null });
    const authCallback = __mock.current.auth.onAuthStateChange.mock.calls[0][0];
    await act(async () => { await authCallback('TOKEN_REFRESHED', { user: fakeUser }); });

    expect(result.current.shouldShowTour).toBe(false);
  });
});

describe('subscribeToActivity', () => {
  test('pushes a Fish Year catch insert straight through, using its own snapshotted name/avatar', async () => {
    const result = await setupSignedIn();
    const onInsert = jest.fn();
    result.current.subscribeToActivity(onInsert);

    await act(async () => { await __mock.current.emitPostgresChange('fish_year_catches', {
      id: 'fy-9', user_id: 'user-2', angler_name: 'Kevin', angler_avatar_url: 'kevin.jpg',
      species: 'Pike', photo_url: '', caught_at: '2026-05-01', created_at: '2026-05-01T12:00:00Z', month: 'May',
    }); });

    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'fish_year_catch', id: 'fy-9', anglerName: 'Kevin', avatarUrl: 'kevin.jpg', species: 'Pike', href: '/fish-year?catch=fy-9',
    }));
  });

  test('looks up the poster\'s profile for a personal best insert, which doesn\'t snapshot one', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('profiles', { data: { display_name: 'Priya', avatar_url: 'priya.jpg' }, error: null });
    const onInsert = jest.fn();
    result.current.subscribeToActivity(onInsert);

    await act(async () => { await __mock.current.emitPostgresChange('personal_bests', {
      id: 'pb-9', user_id: 'user-5', species: 'Tuna', size_label: '40 in', photo_url: '', caught_at: '2026-05-02', created_at: '2026-05-02T12:00:00Z',
    }); });

    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'personal_best', id: 'pb-9', anglerName: 'Priya', avatarUrl: 'priya.jpg', sizeLabel: '40 in', href: '/anglers?best=pb-9',
    }));
  });

  test('looks up the parent tournament\'s name and unit for a tournament entry insert', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('tournaments', { data: { id: 't-1', name: 'Summer Fluke Classic', unit: 'in' }, error: null });
    const onInsert = jest.fn();
    result.current.subscribeToActivity(onInsert);

    await act(async () => { await __mock.current.emitPostgresChange('tournament_entries', {
      id: 'te-9', tournament_id: 't-1', user_id: 'user-4', angler_name: 'Andres', angler_avatar_url: '',
      species: 'Fluke', size: 21, photo_url: '', caught_at: '2026-05-03', created_at: '2026-05-03T12:00:00Z',
    }); });

    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'tournament_entry', id: 'te-9', tournamentName: 'Summer Fluke Classic', unit: 'in', size: 21, href: '/tournaments/t-1?entry=te-9',
    }));
  });

  test('unsubscribing removes the underlying Realtime channel', async () => {
    const result = await setupSignedIn();
    const unsubscribe = result.current.subscribeToActivity(jest.fn());
    unsubscribe();
    expect(__mock.current.removeChannel).toHaveBeenCalled();
  });
});

describe('submitBugReport', () => {
  test('stamps the current display name and page path onto the report', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('bug_reports', { data: { id: 'br-1', angler_name: 'Andre', body: 'The like button does nothing.' }, error: null });

    const response = await result.current.submitBugReport({ body: 'The like button does nothing.' });

    expect(response.report.angler_name).toBe('Andre');
    expect(__mock.current.from).toHaveBeenCalledWith('bug_reports');
    const call = __mock.current.from.mock.results[__mock.current.fromCalls.indexOf('bug_reports')];
    expect(call.value.insert).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'user-1', angler_name: 'Andre', body: 'The like button does nothing.',
    }));
  });

  test('surfaces a Supabase error instead of throwing', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('bug_reports', { data: null, error: { message: 'insert failed' } });

    const response = await result.current.submitBugReport({ body: 'Broken thing' });

    expect(response.error.message).toBe('insert failed');
  });
});

describe('Cast & Catch world', () => {
  // Errors come back as { error: Error }; this Jest doesn't match Error objects with objectContaining.
  const expectError = async (promise, pattern) => { const response = await promise; expect(response.error?.message).toMatch(pattern); };
  const builderFor = (table) => {
    const index = __mock.current.from.mock.calls.map(([name]) => name).lastIndexOf(table);
    return __mock.current.from.mock.results[index].value;
  };

  test('logGameCatch stores the size and ground, then rolls the catch into records and quests in one profile write', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('game_catches', { data: { id: 'gc-1', species: 'largemouth', size_in: 17.5 }, error: null });
    __mock.setResponse('game_profiles', [
      { data: { user_id: 'user-1', tackle_points: 10, records: { largemouth: { size_in: 12 } }, quests: {} }, error: null },
      { data: { user_id: 'user-1', tackle_points: 16, records: { largemouth: { size_in: 17.5 } }, quests: { sals_wall: { progress: 1, done: true, claimed: false } } }, error: null },
    ]);
    const response = await result.current.logGameCatch({ species: 'largemouth', rarity: 'common', sizeLabel: '17.5 in', pointsEarned: 6, sizeIn: 17.5, biome: 'swamp' });
    expect(builderFor('game_catches').insert).toHaveBeenCalledWith(expect.objectContaining({ species: 'largemouth', size_in: 17.5, biome: 'swamp', angler_name: 'Andre' }));
    expect(builderFor('game_profiles').update).toHaveBeenCalledWith(expect.objectContaining({
      tackle_points: 16,
      records: { largemouth: expect.objectContaining({ size_in: 17.5, catch_id: 'gc-1' }) },
      quests: { sals_wall: { progress: 1, done: true, claimed: false } },
    }));
    expect(response.isRecord).toBe(true);
    expect(response.completedQuests).toEqual(['sals_wall']);
  });

  test('claimQuestReward pays once and refuses an unfinished or already-claimed quest', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 10, quests: { sals_wall: { progress: 1, done: true, claimed: false } } }, error: null });
    const paid = await result.current.claimQuestReward('sals_wall');
    expect(paid.points).toBe(75);
    expect(builderFor('game_profiles').update).toHaveBeenCalledWith(expect.objectContaining({ tackle_points: 85, quests: { sals_wall: { progress: 1, done: true, claimed: true } } }));

    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 85, quests: { sals_wall: { progress: 1, done: true, claimed: true } } }, error: null });
    await expectError(result.current.claimQuestReward('sals_wall'), 'Already turned in.');
    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 85, quests: {} }, error: null });
    await expectError(result.current.claimQuestReward('sals_wall'), /not finished/);
    await expectError(result.current.claimQuestReward('rays_proving'), /nothing to turn in/i);
  });

  test('charterBoat charges what the ground costs', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 100 }, error: null });
    await result.current.charterBoat('canyon');
    expect(builderFor('game_profiles').update).toHaveBeenCalledWith(expect.objectContaining({ tackle_points: 20 }));
    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 60 }, error: null });
    await expectError(result.current.charterBoat('canyon'), /not enough tackle points/i);
  });

  test('listDerbyLeaders ranks the week\'s catches one row per angler with avatars from profiles', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('game_catches', { data: [
      { id: 'a', user_id: 'user-2', angler_name: 'Kevin', size_in: '24.0', created_at: '2026-06-15T10:00:00Z' },
      { id: 'b', user_id: 'user-1', angler_name: 'Andre', size_in: '26.5', created_at: '2026-06-15T11:00:00Z' },
      { id: 'c', user_id: 'user-1', angler_name: 'Andre', size_in: '20.0', created_at: '2026-06-15T12:00:00Z' },
    ], error: null });
    __mock.setResponse('profiles', { data: [{ id: 'user-1', display_name: 'Andre', avatar_url: 'andre.jpg' }, { id: 'user-2', display_name: 'Kevin', avatar_url: '' }], error: null });
    const leaders = await result.current.listDerbyLeaders({ species: 'stripedbass', since: '2026-06-15T00:00:00.000Z' });
    expect(builderFor('game_catches').eq).toHaveBeenCalledWith('species', 'stripedbass');
    expect(builderFor('game_catches').gte).toHaveBeenCalledWith('created_at', '2026-06-15T00:00:00.000Z');
    expect(leaders.map((row) => [row.anglerName, row.sizeIn, row.avatarUrl])).toEqual([['Andre', 26.5, 'andre.jpg'], ['Kevin', 24, '']]);
  });

  test('Fish Year bounties are listed unclaimed and paid once each', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catches', { data: [{ id: 'fy-1', species: 'Pike', month: 'May', year: 2026 }, { id: 'fy-2', species: 'Carp', month: 'June', year: 2026 }], error: null });
    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 10, bounties_claimed: ['fy-1'] }, error: null });
    const unclaimed = await result.current.listFishYearBounties();
    expect(unclaimed).toEqual([{ id: 'fy-2', species: 'Carp', month: 'June', year: 2026, points: 15 }]);
    const paid = await result.current.claimFishYearBounties();
    expect(paid.claimed).toBe(1);
    expect(paid.points).toBe(15);
    expect(builderFor('game_profiles').update).toHaveBeenCalledWith(expect.objectContaining({ tackle_points: 25, bounties_claimed: ['fy-1', 'fy-2'] }));

    __mock.setResponse('game_profiles', { data: { user_id: 'user-1', tackle_points: 25, bounties_claimed: ['fy-1', 'fy-2'] }, error: null });
    await expectError(result.current.claimFishYearBounties(), /nothing new to claim/i);
  });

  test('legendary game catches join the activity feed, by fetch and by Realtime, with a readable species name', async () => {
    const result = await setupSignedIn();
    __mock.setResponse('fish_year_catches', { data: [], error: null });
    __mock.setResponse('tournament_entries', { data: [], error: null });
    __mock.setResponse('tournaments', { data: [], error: null });
    __mock.setResponse('profiles', { data: [{ id: 'user-2', display_name: 'Kevin', avatar_url: 'kevin.jpg' }], error: null });
    __mock.setResponse('game_catches', { data: [{ id: 'gc-7', user_id: 'user-2', angler_name: 'Kevin', species: 'shark', rarity: 'legendary', size_in: '88.0', size_label: '88.0 in', created_at: '2026-06-15T12:00:00Z' }], error: null });
    const feed = await result.current.listRecentActivity();
    expect(builderFor('game_catches').eq).toHaveBeenCalledWith('rarity', 'legendary');
    expect(feed).toEqual([expect.objectContaining({ kind: 'game_catch', id: 'gc-7', anglerName: 'Kevin', avatarUrl: 'kevin.jpg', species: 'Shark', sizeLabel: '88.0 in', href: '/fishing-game' })]);

    const onInsert = jest.fn();
    result.current.subscribeToActivity(onInsert);
    __mock.setResponse('profiles', { data: { display_name: 'Kevin', avatar_url: 'kevin.jpg' }, error: null });
    await act(async () => { await __mock.current.emitPostgresChange('game_catches', { id: 'gc-8', user_id: 'user-2', angler_name: 'Kevin', species: 'bluegill', rarity: 'common', size_in: '7.0', created_at: '2026-06-15T13:00:00Z' }); });
    expect(onInsert).not.toHaveBeenCalled();
    await act(async () => { await __mock.current.emitPostgresChange('game_catches', { id: 'gc-9', user_id: 'user-2', angler_name: 'Kevin', species: 'swordfish', rarity: 'legendary', size_in: '120.0', created_at: '2026-06-15T14:00:00Z' }); });
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'game_catch', id: 'gc-9', species: 'Swordfish', sizeLabel: '120.0 in', avatarUrl: 'kevin.jpg' }));
  });
});

describe('the dock (presence)', () => {
  test('joinDock tracks who you are once subscribed, reports everyone but you on sync, and leaves cleanly', async () => {
    const result = await setupSignedIn();
    const onSync = jest.fn();
    const dock = result.current.joinDock({ name: 'Andre', biome: 'river', phase: 'ready' }, onSync);
    const chan = __mock.current.channels[__mock.current.channels.length - 1];
    expect(chan.name).toBe('cast-and-catch-dock');
    expect(chan.options).toEqual({ config: { presence: { key: 'user-1' } } });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(chan.track).toHaveBeenCalledWith(expect.objectContaining({ name: 'Andre', biome: 'river', phase: 'ready', at: expect.any(Number) }));

    await act(async () => { await __mock.current.emitPresenceSync({
      'user-1': [{ name: 'Andre', biome: 'river', phase: 'ready' }],
      'user-2': [{ name: 'Kevin', biome: 'bay', phase: 'waiting' }, { name: 'Kevin', biome: 'bay', phase: 'reeling' }],
      'user-3': [{}],
    }); });
    expect(onSync).toHaveBeenCalledWith([{ userId: 'user-2', name: 'Kevin', biome: 'bay', phase: 'reeling' }]);

    dock.update({ name: 'Andre', biome: 'bay', phase: 'casting' });
    expect(chan.track).toHaveBeenLastCalledWith(expect.objectContaining({ biome: 'bay', phase: 'casting' }));
    dock.leave();
    expect(__mock.current.removeChannel).toHaveBeenCalledWith(chan);
  });
});
