import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';

// No jest.mock('../lib/supabase') here on purpose: the real module reads
// REACT_APP_SUPABASE_* env vars, none of which are set in the test environment, so
// isSupabaseConfigured is false — exactly like a deployment missing its Supabase config.
// This covers every "fails closed" guard clause across the context.

function wrapper({ children }) { return <AuthProvider>{children}</AuthProvider>; }

async function setup() {
  const { result } = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

test('starts with no user and the default profile, and stops loading quickly', async () => {
  const result = await setup();
  expect(result.current.user).toBeNull();
  expect(result.current.profile.display_name).toBe('New angler');
  expect(result.current.personalBests).toEqual([]);
  expect(result.current.isSupabaseConfigured).toBe(false);
});

test('signIn fails closed with a clear message', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.signIn('a@b.com', 'password'); });
  expect(response.error.message).toMatch(/not configured/i);
});

test('signUp fails closed with a clear message', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.signUp('a@b.com', 'password', 'Andre'); });
  expect(response.error.message).toMatch(/not configured/i);
});

test('updateProfile fails closed', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.updateProfile({ display_name: 'Andre' }); });
  expect(response.error.message).toMatch(/not configured/i);
});

test('uploadAvatar validates the file before checking configuration', async () => {
  const result = await setup();
  const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  let response;
  await waitFor(async () => { response = await result.current.uploadAvatar(textFile); });
  expect(response.error.message).toMatch(/choose an image file/i);

  const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.png', { type: 'image/png' });
  await waitFor(async () => { response = await result.current.uploadAvatar(bigFile); });
  expect(response.error.message).toMatch(/smaller than 5 mb/i);

  const goodFile = new File(['ok'], 'avatar.png', { type: 'image/png' });
  await waitFor(async () => { response = await result.current.uploadAvatar(goodFile); });
  expect(response.error.message).toMatch(/sign in before uploading/i);
});

test('uploadPersonalBest requires a species even when unconfigured', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.uploadPersonalBest({ species: '  ' }); });
  expect(response.error.message).toMatch(/name the species/i);
});

test('logFishYearCatch requires a species before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.logFishYearCatch({ species: '' }); });
  expect(response.error.message).toMatch(/name the species/i);
});

test('list* helpers return empty arrays instead of throwing', async () => {
  const result = await setup();
  await expect(result.current.listAnglers()).resolves.toEqual([]);
  await expect(result.current.listComments('best-1')).resolves.toEqual([]);
  await expect(result.current.listFishYearCatches(2026)).resolves.toEqual([]);
  await expect(result.current.listTournaments()).resolves.toEqual([]);
  await expect(result.current.listTournamentEntries('t-1')).resolves.toEqual([]);
  await expect(result.current.listTournamentEntryComments('e-1')).resolves.toEqual([]);
  await expect(result.current.listRecentActivity()).resolves.toEqual([]);
});

test('get* helpers return null instead of throwing when unconfigured', async () => {
  const result = await setup();
  await expect(result.current.getTournament('t-1')).resolves.toBeNull();
  await expect(result.current.getTournamentEntry('e-1')).resolves.toBeNull();
});

test('delete* helpers fail closed', async () => {
  const result = await setup();
  await expect(result.current.deletePersonalBest('id')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.deleteComment('id')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.deleteFishYearCatch('id')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.deleteTournament('id')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.deleteTournamentEntry('id')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.deleteTournamentEntryComment('id')).resolves.toEqual({ error: expect.any(Error) });
});

test('createTournament validates before checking configuration', async () => {
  const result = await setup();
  await expect(result.current.createTournament({ name: '  ', startsOn: '2026-01-01', endsOn: '2026-01-02' })).resolves.toEqual({ error: expect.objectContaining({ message: expect.stringMatching(/name the tournament/i) }) });
  await expect(result.current.createTournament({ name: 'Fall Classic', startsOn: '2026-02-01', endsOn: '2026-01-01' })).resolves.toEqual({ error: expect.objectContaining({ message: expect.stringMatching(/end date/i) }) });
  await expect(result.current.createTournament({ name: 'Fall Classic', startsOn: '2026-01-01', endsOn: '2026-01-02' })).resolves.toEqual({ error: expect.objectContaining({ message: expect.stringMatching(/sign in before starting/i) }) });
});

test('submitTournamentEntry requires a species and a positive size before the configuration check', async () => {
  const result = await setup();
  await expect(result.current.submitTournamentEntry({ tournamentId: 't-1', species: '', size: '12' })).resolves.toEqual({ error: expect.objectContaining({ message: expect.stringMatching(/name the species/i) }) });
  await expect(result.current.submitTournamentEntry({ tournamentId: 't-1', species: 'Carp', size: '0' })).resolves.toEqual({ error: expect.objectContaining({ message: expect.stringMatching(/enter the size/i) }) });
});

test('addComment requires a non-empty body before the configuration check', async () => {
  const result = await setup();
  const response = await result.current.addComment('best-1', '   ');
  expect(response.error.message).toMatch(/say something/i);
});

test('addTournamentEntryComment requires a non-empty body before the configuration check', async () => {
  const result = await setup();
  const response = await result.current.addTournamentEntryComment('e-1', '   ');
  expect(response.error.message).toMatch(/say something/i);
});
