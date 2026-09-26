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

test('subscribeToActivity returns a harmless no-op unsubscribe when unconfigured', async () => {
  const result = await setup();
  const onInsert = jest.fn();
  const unsubscribe = result.current.subscribeToActivity(onInsert);
  expect(typeof unsubscribe).toBe('function');
  expect(() => unsubscribe()).not.toThrow();
  expect(onInsert).not.toHaveBeenCalled();
});

test('submitBugReport requires a description before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.submitBugReport({ body: '   ' }); });
  expect(response.error.message).toMatch(/describe what went wrong/i);
});

test('submitBugReport fails closed once a description is given', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.submitBugReport({ body: 'The like button does nothing.' }); });
  expect(response.error.message).toMatch(/sign in before reporting/i);
});

test('listBugReports fails closed to an empty list', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.listBugReports(); });
  expect(response).toEqual([]);
});

test('listFishingLicenses fails closed to an empty list', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.listFishingLicenses(); });
  expect(response).toEqual([]);
});

test('uploadFishingLicense requires a state before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.uploadFishingLicense({ state: '  ', expiresAt: '2026-12-31' }); });
  expect(response.error.message).toMatch(/choose which state/i);
});

test('uploadFishingLicense requires an expiration date before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.uploadFishingLicense({ state: 'New Jersey', expiresAt: '' }); });
  expect(response.error.message).toMatch(/add the expiration date/i);
});

test('uploadFishingLicense fails closed once state and expiration are given', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.uploadFishingLicense({ state: 'New Jersey', expiresAt: '2026-12-31' }); });
  expect(response.error.message).toMatch(/sign in before adding a license/i);
});

test('uploadFishingLicense rejects a file that is neither an image nor a PDF', async () => {
  const result = await setup();
  const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  let response;
  await waitFor(async () => { response = await result.current.uploadFishingLicense({ state: 'New Jersey', expiresAt: '2026-12-31', file: textFile }); });
  expect(response.error.message).toMatch(/image or pdf/i);
});

test('uploadFishingLicense accepts a PDF and fails closed after that, same as an image', async () => {
  const result = await setup();
  const pdfFile = new File(['%PDF-1.4'], 'license.pdf', { type: 'application/pdf' });
  let response;
  await waitFor(async () => { response = await result.current.uploadFishingLicense({ state: 'New Jersey', expiresAt: '2026-12-31', file: pdfFile }); });
  expect(response.error.message).toMatch(/sign in before adding a license/i);
});

test('deleteFishingLicense fails closed', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.deleteFishingLicense('lic-1'); });
  expect(response.error.message).toMatch(/sign in before managing licenses/i);
});

test('updateFishingLicense requires a state before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.updateFishingLicense({ id: 'lic-1', state: '  ', expiresAt: '2026-12-31' }); });
  expect(response.error.message).toMatch(/choose which state/i);
});

test('updateFishingLicense requires an expiration date before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.updateFishingLicense({ id: 'lic-1', state: 'New Jersey', expiresAt: '' }); });
  expect(response.error.message).toMatch(/add the expiration date/i);
});

test('updateFishingLicense rejects a file that is neither an image nor a PDF', async () => {
  const result = await setup();
  const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
  let response;
  await waitFor(async () => { response = await result.current.updateFishingLicense({ id: 'lic-1', state: 'New Jersey', expiresAt: '2026-12-31', file: textFile }); });
  expect(response.error.message).toMatch(/image or pdf/i);
});

test('updateFishingLicense fails closed once state and expiration are given', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.updateFishingLicense({ id: 'lic-1', state: 'New Jersey', expiresAt: '2026-12-31' }); });
  expect(response.error.message).toMatch(/sign in before updating a license/i);
});

test('waypoint list* helpers return empty arrays instead of throwing', async () => {
  const result = await setup();
  await expect(result.current.listMyWaypointMaps()).resolves.toEqual([]);
  await expect(result.current.listMapMembers('map-1')).resolves.toEqual([]);
  await expect(result.current.listMyWaypointInvites()).resolves.toEqual([]);
  await expect(result.current.listWaypoints('map-1')).resolves.toEqual([]);
});

test('getWaypointMap returns null instead of throwing when unconfigured', async () => {
  const result = await setup();
  await expect(result.current.getWaypointMap('map-1')).resolves.toBeNull();
});

test('createWaypointMap requires a name before the configuration check', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.createWaypointMap({ name: '   ' }); });
  expect(response.error.message).toMatch(/name the map/i);
});

test('createWaypointMap fails closed once a name is given', async () => {
  const result = await setup();
  let response;
  await waitFor(async () => { response = await result.current.createWaypointMap({ name: 'My Spots' }); });
  expect(response.error.message).toMatch(/sign in before creating a map/i);
});

test('deleteWaypointMap fails closed', async () => {
  const result = await setup();
  await expect(result.current.deleteWaypointMap('map-1')).resolves.toEqual({ error: expect.any(Error) });
});

test('inviteToWaypointMap fails closed', async () => {
  const result = await setup();
  const response = await result.current.inviteToWaypointMap('map-1', 'My Spots', 'user-2');
  expect(response.error.message).toMatch(/sign in before inviting anyone/i);
});

test('respondToWaypointInvite fails closed for both accept and decline', async () => {
  const result = await setup();
  await expect(result.current.respondToWaypointInvite('member-1', true)).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.respondToWaypointInvite('member-1', false)).resolves.toEqual({ error: expect.any(Error) });
});

test('addWaypoint fails closed', async () => {
  const result = await setup();
  const response = await result.current.addWaypoint({ mapId: 'map-1', name: 'Spot', lat: 40, lng: -74 });
  expect(response.error.message).toMatch(/sign in before adding a waypoint/i);
});

test('importWaypoints requires points before the configuration check', async () => {
  const result = await setup();
  const response = await result.current.importWaypoints({ mapId: 'map-1', points: [] });
  expect(response.error.message).toMatch(/no waypoints to import/i);
});

test('importWaypoints fails closed once points are given', async () => {
  const result = await setup();
  const response = await result.current.importWaypoints({ mapId: 'map-1', points: [{ name: 'Spot', lat: 40, lng: -74, notes: '' }] });
  expect(response.error.message).toMatch(/sign in before importing waypoints/i);
});

test('deleteWaypoint and removeMapMember fail closed', async () => {
  const result = await setup();
  await expect(result.current.deleteWaypoint('wp-1')).resolves.toEqual({ error: expect.any(Error) });
  await expect(result.current.removeMapMember('member-1')).resolves.toEqual({ error: expect.any(Error) });
});

describe('trips fail closed', () => {
  const trip = { name: 'Montauk', startsOn: '2026-10-10', endsOn: '2026-10-12' };

  test('reads return nothing', async () => {
    const result = await setup();
    await expect(result.current.listTrips()).resolves.toEqual([]);
    await expect(result.current.getTrip('trip-1')).resolves.toBeNull();
    await expect(result.current.listTripAttendees('trip-1')).resolves.toEqual([]);
    await expect(result.current.listTripExpenses('trip-1')).resolves.toEqual([]);
    await expect(result.current.listTripSettlements('trip-1')).resolves.toEqual([]);
  });

  test('createTrip validates first, then fails closed', async () => {
    const result = await setup();
    expect((await result.current.createTrip({ ...trip, name: ' ' })).error.message).toMatch(/name the trip/i);
    expect((await result.current.createTrip({ ...trip, endsOn: '2026-10-01' })).error.message).toMatch(/on or after the start date/i);
    expect((await result.current.createTrip(trip)).error.message).toMatch(/sign in before planning a trip/i);
  });

  test('writes fail closed', async () => {
    const result = await setup();
    for (const response of await Promise.all([
      result.current.updateTrip('trip-1', trip),
      result.current.deleteTrip('trip-1'),
      result.current.joinTrip('trip-1'),
      result.current.leaveTrip('trip-1'),
      result.current.removeTripAttendee('att-1'),
      result.current.addTripExpense({ tripId: 'trip-1', description: 'Bait', amountCents: 500 }),
      result.current.deleteTripExpense('exp-1'),
      result.current.recordTripSettlement({ tripId: 'trip-1', from: { userId: 'a', name: 'A' }, to: { userId: 'b', name: 'B' }, amountCents: 500 }),
      result.current.deleteTripSettlement('set-1'),
    ])) {
      expect(response.error).toEqual(expect.any(Error));
    }
  });
});
