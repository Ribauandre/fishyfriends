import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from './Profile';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderProfile() {
  return render(<MemoryRouter><Profile /></MemoryRouter>);
}

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1', email: 'andre@example.com' },
    profile: { display_name: 'Andre', home_water: '', favorite_species: '', bio: '', avatar_url: '' },
    personalBests: [],
    customSpecies: [],
    updateProfile: jest.fn(),
    uploadAvatar: jest.fn(),
    signOut: jest.fn(),
    notice: '',
    setNotice: jest.fn(),
    submitBugReport: jest.fn(),
    listFishingLicenses: jest.fn().mockResolvedValue([]),
    uploadFishingLicense: jest.fn(),
    updateFishingLicense: jest.fn(),
    deleteFishingLicense: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('submitting a bug report clears the field and shows a thank-you message', async () => {
  const submitBugReport = jest.fn().mockResolvedValue({ error: null, report: { id: 'br-1' } });
  useAuth.mockReturnValue(makeBaseAuth({ submitBugReport }));
  renderProfile();

  const field = screen.getByLabelText(/what happened/i);
  await userEvent.type(field, 'The like button does nothing.');
  await userEvent.click(screen.getByRole('button', { name: /reel it in/i }));

  await waitFor(() => expect(submitBugReport).toHaveBeenCalledWith({ body: 'The like button does nothing.' }));
  expect(await screen.findByText(/we'll get it untangled/i)).toBeInTheDocument();
  expect(field).toHaveValue('');
});

test('shows the server error message and keeps the description when reporting fails', async () => {
  const submitBugReport = jest.fn().mockResolvedValue({ error: new Error('Sign in before reporting a bug.') });
  useAuth.mockReturnValue(makeBaseAuth({ submitBugReport }));
  renderProfile();

  const field = screen.getByLabelText(/what happened/i);
  await userEvent.type(field, 'Broken thing');
  await userEvent.click(screen.getByRole('button', { name: /reel it in/i }));

  expect(await screen.findByText(/sign in before reporting a bug/i)).toBeInTheDocument();
  expect(field).toHaveValue('Broken thing');
});

describe('fishing licenses', () => {
  test('shows an empty state when no licenses are on file', async () => {
    useAuth.mockReturnValue(makeBaseAuth());
    renderProfile();
    expect(await screen.findByText(/no licenses on file yet/i)).toBeInTheDocument();
  });

  test('lists licenses with a status badge and flags how many need attention', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', expires_at: '2099-01-01', photo_path: '' },
        { id: 'lic-2', state: 'New York', license_number: '', expires_at: '2020-01-01', photo_path: '' },
      ]),
    }));
    renderProfile();
    expect(await screen.findByText('New Jersey')).toBeInTheDocument();
    expect(screen.getByText('#ABC123')).toBeInTheDocument();
    expect(screen.getByText('New York')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText(/1 needs attention/i)).toBeInTheDocument();
  });

  test('adding a license calls uploadFishingLicense and adds it to the list', async () => {
    const uploadFishingLicense = jest.fn().mockResolvedValue({
      error: null,
      license: { id: 'lic-new', state: 'New Jersey', license_number: '', expires_at: '2099-01-01', photo_path: '' },
    });
    useAuth.mockReturnValue(makeBaseAuth({ uploadFishingLicense }));
    renderProfile();
    await screen.findByText(/no licenses on file yet/i);

    await userEvent.click(screen.getByRole('button', { name: /add a license/i }));
    await userEvent.selectOptions(screen.getByLabelText(/^state$/i), 'New Jersey');
    const expiresInput = screen.getByLabelText(/^expires$/i);
    await userEvent.type(expiresInput, '2099-01-01');
    await userEvent.click(screen.getByRole('button', { name: /^add license/i }));

    await waitFor(() => expect(uploadFishingLicense).toHaveBeenCalledWith(expect.objectContaining({ state: 'New Jersey', expiresAt: '2099-01-01' })));
    await waitFor(() => expect(screen.queryByRole('button', { name: /close add license form/i })).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('New Jersey')).toBeInTheDocument();
  });

  test('shows the server error and keeps the form open when adding a license fails', async () => {
    const uploadFishingLicense = jest.fn().mockResolvedValue({ error: new Error('License photos must be smaller than 5 MB.') });
    useAuth.mockReturnValue(makeBaseAuth({ uploadFishingLicense }));
    renderProfile();
    await screen.findByText(/no licenses on file yet/i);

    await userEvent.click(screen.getByRole('button', { name: /add a license/i }));
    await userEvent.selectOptions(screen.getByLabelText(/^state$/i), 'New Jersey');
    const expiresInput = screen.getByLabelText(/^expires$/i);
    await userEvent.type(expiresInput, '2099-01-01');
    await userEvent.click(screen.getByRole('button', { name: /^add license/i }));

    expect(await screen.findByText(/smaller than 5 mb/i)).toBeInTheDocument();
  });

  test('"Show to warden" opens a big status view for that license', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', expires_at: '2099-01-01', photo_path: '' },
      ]),
    }));
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /show to warden/i }));
    expect(screen.getByRole('dialog', { name: /new jersey fishing license/i })).toBeInTheDocument();
    expect(screen.getByText('✓ VALID')).toBeInTheDocument();
  });

  test('"Show to warden" links to the PDF instead of rendering it as an image when the license was uploaded as a PDF', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', expires_at: '2099-01-01', photo_path: 'user-1/1.pdf', photo_url: 'https://example.com/signed.pdf' },
      ]),
    }));
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /show to warden/i }));
    const link = screen.getByRole('link', { name: /view license pdf/i });
    expect(link).toHaveAttribute('href', 'https://example.com/signed.pdf');
    expect(screen.queryByRole('img', { name: /new jersey fishing license/i })).not.toBeInTheDocument();
  });

  test('shows "Renew" instead of "Update" once a license needs attention', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: '', expires_at: '2099-01-01', photo_path: '' },
        { id: 'lic-2', state: 'New York', license_number: '', expires_at: '2020-01-01', photo_path: '' },
      ]),
    }));
    renderProfile();
    expect(await screen.findByRole('button', { name: /^update$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^renew$/i })).toBeInTheDocument();
  });

  test('renewing a license pre-fills the form and replaces the row with the updated license once saved', async () => {
    const updateFishingLicense = jest.fn().mockResolvedValue({
      error: null,
      license: { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', expires_at: '2099-06-01', photo_path: '' },
    });
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', issued_at: '2026-01-01', expires_at: '2020-01-01', photo_path: 'user-1/old.jpg' },
      ]),
      updateFishingLicense,
    }));
    renderProfile();

    await userEvent.click(await screen.findByRole('button', { name: /^renew$/i }));
    expect(screen.getByRole('heading', { name: /update your new jersey license/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^state$/i)).toHaveValue('New Jersey');
    expect(screen.getByLabelText(/license number/i)).toHaveValue('ABC123');
    const expiresInput = screen.getByLabelText(/^expires$/i);
    expect(expiresInput).toHaveValue('2020-01-01');

    await userEvent.clear(expiresInput);
    await userEvent.type(expiresInput, '2099-06-01');
    await userEvent.click(screen.getByRole('button', { name: /^save changes/i }));

    await waitFor(() => expect(updateFishingLicense).toHaveBeenCalledWith(expect.objectContaining({
      id: 'lic-1', previousPhotoPath: 'user-1/old.jpg', state: 'New Jersey', expiresAt: '2099-06-01',
    })));
    await waitFor(() => expect(screen.queryByRole('heading', { name: /update your new jersey license/i })).not.toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText('Valid through 2099-06-01')).toBeInTheDocument();
  });

  test('shows the server error and keeps the renew form open when the update fails', async () => {
    const updateFishingLicense = jest.fn().mockResolvedValue({ error: new Error('License files must be smaller than 5 MB.') });
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: '', expires_at: '2020-01-01', photo_path: '' },
      ]),
      updateFishingLicense,
    }));
    renderProfile();

    await userEvent.click(await screen.findByRole('button', { name: /^renew$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^save changes/i }));

    expect(await screen.findByText(/smaller than 5 mb/i)).toBeInTheDocument();
  });

  test('deleting a license asks for confirmation, then removes it from the list', async () => {
    const deleteFishingLicense = jest.fn().mockResolvedValue({ error: null });
    useAuth.mockReturnValue(makeBaseAuth({
      listFishingLicenses: jest.fn().mockResolvedValue([
        { id: 'lic-1', state: 'New Jersey', license_number: 'ABC123', expires_at: '2099-01-01', photo_path: 'user-1/1.jpg' },
      ]),
      deleteFishingLicense,
    }));
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /delete new jersey license/i }));
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^delete license/i }));

    await waitFor(() => expect(deleteFishingLicense).toHaveBeenCalledWith('lic-1', 'user-1/1.jpg'));
    await waitFor(() => expect(screen.queryByText('New Jersey')).not.toBeInTheDocument());
  });
});

describe('Venmo username', () => {
  test('is saved without the "@" people tend to type', async () => {
    const updateProfile = jest.fn().mockResolvedValue({ error: null });
    useAuth.mockReturnValue(makeBaseAuth({ updateProfile }));
    renderProfile();
    await userEvent.type(screen.getByLabelText(/venmo username/i), '@Andre-Ribau');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ venmo_handle: 'Andre-Ribau' })));
  });

  test('refuses something that is not a Venmo username, without saving', async () => {
    const updateProfile = jest.fn();
    useAuth.mockReturnValue(makeBaseAuth({ updateProfile }));
    renderProfile();
    await userEvent.type(screen.getByLabelText(/venmo username/i), 'not a handle');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByText(/5–30 letters/)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
