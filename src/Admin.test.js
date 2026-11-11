import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Admin from './Admin';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

const ACCOUNTS = [
  { account_id: 'u-new', display_name: 'Newcomer', email: 'new@example.com', signed_up_at: '2026-11-10T12:00:00Z', status: 'pending', is_admin: false },
  { account_id: 'u-admin', display_name: 'Andre', email: 'andre@example.com', signed_up_at: '2026-01-01T12:00:00Z', status: 'approved', is_admin: true },
  { account_id: 'u-kev', display_name: 'Kevin', email: 'kev@example.com', signed_up_at: '2026-02-01T12:00:00Z', status: 'approved', is_admin: false },
  { account_id: 'u-out', display_name: 'Stranger', email: 'who@example.com', signed_up_at: '2026-03-01T12:00:00Z', status: 'declined', is_admin: false },
];

let auth;
function makeAuth(overrides = {}) {
  return {
    user: { id: 'u-admin', email: 'andre@example.com' },
    isAdmin: true,
    listClubAccounts: jest.fn().mockResolvedValue(ACCOUNTS),
    setClubMembership: jest.fn().mockResolvedValue({ error: null }),
    listBugReports: jest.fn().mockResolvedValue([]),
    listStoredPhotos: jest.fn().mockResolvedValue([]),
    cleanStoredPhoto: jest.fn().mockResolvedValue('clean'),
    ...overrides,
  };
}

function renderAdmin(overrides) {
  auth = makeAuth(overrides);
  useAuth.mockReturnValue(auth);
  return render(<MemoryRouter initialEntries={['/admin']}><Routes>
    <Route path="/admin" element={<Admin />} />
    <Route path="/home" element={<div>Home page</div>} />
  </Routes></MemoryRouter>);
}

const section = (name) => within(screen.getByRole('region', { name }));

test('anyone but the admin is sent home, and nothing is asked of the database', () => {
  renderAdmin({ isAdmin: false });
  expect(screen.getByText('Home page')).toBeInTheDocument();
  expect(auth.listClubAccounts).not.toHaveBeenCalled();
  expect(auth.listBugReports).not.toHaveBeenCalled();
});

test('shows who is waiting, who is in and who was turned down, with emails to tell them apart', async () => {
  renderAdmin();
  expect(await screen.findByRole('heading', { name: '1 waiting to join' })).toBeInTheDocument();
  expect(section('Waiting to join').getByText('new@example.com')).toBeInTheDocument();
  expect(section('Members').getByRole('heading', { name: '2 members' })).toBeInTheDocument();
  expect(section('Members').getByText('Kevin')).toBeInTheDocument();
  expect(section('Turned down or removed').getByText('Stranger')).toBeInTheDocument();
});

test('approving someone waiting asks the database and reloads the list', async () => {
  renderAdmin();
  await userEvent.click(await screen.findByRole('button', { name: 'Let Newcomer in' }));
  expect(auth.setClubMembership).toHaveBeenCalledWith('u-new', 'approved');
  await waitFor(() => expect(auth.listClubAccounts).toHaveBeenCalledTimes(2));
});

test('turning someone down marks them declined', async () => {
  renderAdmin();
  await userEvent.click(await screen.findByRole('button', { name: 'Turn down' }));
  expect(auth.setClubMembership).toHaveBeenCalledWith('u-new', 'declined');
});

test('removing a member takes a second, deliberate tap', async () => {
  renderAdmin();
  await screen.findByRole('heading', { name: '2 members' });
  await userEvent.click(section('Members').getByRole('button', { name: 'Remove' }));
  expect(auth.setClubMembership).not.toHaveBeenCalled();
  expect(screen.getByText(/remove kevin\? they lose access right away/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Keep' }));
  expect(auth.setClubMembership).not.toHaveBeenCalled();
  await userEvent.click(section('Members').getByRole('button', { name: 'Remove' }));
  await userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
  expect(auth.setClubMembership).toHaveBeenCalledWith('u-kev', 'declined');
});

test('the admin can\'t remove themselves', async () => {
  renderAdmin();
  await screen.findByRole('heading', { name: '2 members' });
  expect(section('Members').getAllByRole('button', { name: 'Remove' })).toHaveLength(1);
});

test('someone turned down can be let back in', async () => {
  renderAdmin();
  await userEvent.click(await screen.findByRole('button', { name: 'Let back in' }));
  expect(auth.setClubMembership).toHaveBeenCalledWith('u-out', 'approved');
});

test('a refusal from the database is shown, not swallowed', async () => {
  renderAdmin({ setClubMembership: jest.fn().mockResolvedValue({ error: new Error('Only the club admin can change who is a member.') }) });
  await userEvent.click(await screen.findByRole('button', { name: 'Let Newcomer in' }));
  expect(await screen.findByText(/only the club admin can change/i)).toBeInTheDocument();
});

describe('photo privacy', () => {
  const PHOTOS = [
    { bucket: 'photos', path: 'old/a.jpg', size: 4 * 1024 * 1024 },
    { bucket: 'avatars', path: 'u-kev/avatar.jpg', size: 1024 * 1024 },
    { bucket: 'fish-year-catches', path: 'u-kev/bass.jpg', size: 1024 * 1024 },
  ];

  test('counts the stored photos first and says how much there is to download', async () => {
    renderAdmin({ listStoredPhotos: jest.fn().mockResolvedValue(PHOTOS) });
    await userEvent.click(await section('Photo privacy').findByRole('button', { name: /check stored photos/i }));
    expect(await section('Photo privacy').findByText(/3 photos to go through, about 6 MB/i)).toBeInTheDocument();
    expect(auth.cleanStoredPhoto).not.toHaveBeenCalled();
  });

  test('cleans each photo in turn and reports what happened to them', async () => {
    const cleanStoredPhoto = jest.fn().mockResolvedValueOnce('cleaned').mockResolvedValueOnce('clean').mockResolvedValueOnce('failed');
    renderAdmin({ listStoredPhotos: jest.fn().mockResolvedValue(PHOTOS), cleanStoredPhoto });
    await userEvent.click(await section('Photo privacy').findByRole('button', { name: /check stored photos/i }));
    await userEvent.click(await section('Photo privacy').findByRole('button', { name: /remove location data/i }));
    expect(await section('Photo privacy').findByText(/checked 3 photos: 1 cleaned, 1 already clean, 1 couldn't be saved/i)).toBeInTheDocument();
    expect(cleanStoredPhoto.mock.calls.map(([photo]) => photo.path)).toEqual(['old/a.jpg', 'u-kev/avatar.jpg', 'u-kev/bass.jpg']);
    expect(section('Photo privacy').getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  test('says so when there is nothing stored', async () => {
    renderAdmin();
    await userEvent.click(await section('Photo privacy').findByRole('button', { name: /check stored photos/i }));
    expect(await section('Photo privacy').findByText(/no stored photos found/i)).toBeInTheDocument();
  });
});
