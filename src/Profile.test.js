import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
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
    getMyPaymentContacts: jest.fn().mockResolvedValue({ zelle: '', apple_cash_phone: '' }),
    deletePersonalBest: jest.fn().mockResolvedValue({ error: null }),
    listFishYearCatches: jest.fn().mockResolvedValue([]),
    listTournaments: jest.fn().mockResolvedValue([]),
    listTrips: jest.fn().mockResolvedValue([]),
    listComments: jest.fn().mockResolvedValue([]),
    addComment: jest.fn(),
    deleteComment: jest.fn(),
    listLikes: jest.fn().mockResolvedValue([]),
    likeTarget: jest.fn().mockResolvedValue({ error: null }),
    unlikeTarget: jest.fn().mockResolvedValue({ error: null }),
    saveMyPaymentContacts: jest.fn(),
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
  test('is saved from the Getting paid back card without the "@" people tend to type', async () => {
    const updateProfile = jest.fn().mockResolvedValue({ error: null });
    const saveMyPaymentContacts = jest.fn().mockResolvedValue({ error: null, contacts: { zelle: '', apple_cash_phone: '' } });
    useAuth.mockReturnValue(makeBaseAuth({ updateProfile, saveMyPaymentContacts }));
    renderProfile();
    await userEvent.type(screen.getByLabelText(/venmo username/i), '@Andre-Ribau');
    await userEvent.click(screen.getByRole('button', { name: /save payment details/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Andre', venmo_handle: 'Andre-Ribau' })));
    expect(saveMyPaymentContacts).toHaveBeenCalled();
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  test('refuses something that is not a Venmo username, without saving', async () => {
    const updateProfile = jest.fn();
    const saveMyPaymentContacts = jest.fn();
    useAuth.mockReturnValue(makeBaseAuth({ updateProfile, saveMyPaymentContacts }));
    renderProfile();
    await userEvent.type(screen.getByLabelText(/venmo username/i), 'not a handle');
    await userEvent.click(screen.getByRole('button', { name: /save payment details/i }));
    expect(await screen.findByText(/5–30 letters/)).toBeInTheDocument();
    expect(updateProfile).not.toHaveBeenCalled();
    expect(saveMyPaymentContacts).not.toHaveBeenCalled();
  });

  test('leaves the profile row alone when Venmo did not change', async () => {
    const updateProfile = jest.fn();
    const saveMyPaymentContacts = jest.fn().mockResolvedValue({ error: null, contacts: { zelle: 'andre@example.com', apple_cash_phone: '' } });
    useAuth.mockReturnValue(makeBaseAuth({ profile: { display_name: 'Andre', venmo_handle: 'Andre-Ribau' }, updateProfile, saveMyPaymentContacts }));
    renderProfile();
    expect(screen.getByLabelText(/venmo username/i)).toHaveValue('Andre-Ribau');
    await userEvent.type(screen.getByLabelText(/zelle email or phone/i), 'andre@example.com');
    await userEvent.click(screen.getByRole('button', { name: /save payment details/i }));
    await waitFor(() => expect(saveMyPaymentContacts).toHaveBeenCalled());
    expect(updateProfile).not.toHaveBeenCalled();
  });

  test('saving profile details keeps the saved Venmo username', async () => {
    const updateProfile = jest.fn().mockResolvedValue({ error: null });
    useAuth.mockReturnValue(makeBaseAuth({ profile: { display_name: 'Andre', venmo_handle: 'Andre-Ribau' }, updateProfile }));
    renderProfile();
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ venmo_handle: 'Andre-Ribau' })));
  });

  test('the profile details form no longer has its own Venmo field', () => {
    renderProfile();
    expect(screen.getAllByLabelText(/venmo username/i)).toHaveLength(1);
    expect(screen.getByLabelText(/venmo username/i).closest('section')).toHaveAttribute('id', 'getting-paid');
  });
});

describe('Zelle & Apple Cash', () => {
  test('shows what is saved, formatted, and says who can see it', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ getMyPaymentContacts: jest.fn().mockResolvedValue({ zelle: '+15555550101', apple_cash_phone: '+15555550199' }) }));
    renderProfile();
    expect(await screen.findByDisplayValue('(555) 555-0101')).toBeInTheDocument();
    expect(screen.getByDisplayValue('(555) 555-0199')).toBeInTheDocument();
    expect(screen.getByText(/only people on a trip with you can see these/i)).toBeInTheDocument();
  });

  test('saves the details and shows the server-side validation message on a bad one', async () => {
    const saveMyPaymentContacts = jest.fn()
      .mockResolvedValueOnce({ error: new Error('Enter a 10-digit US phone number.') })
      .mockResolvedValueOnce({ error: null, contacts: { zelle: 'andre@example.com', apple_cash_phone: '+15555550101' } });
    useAuth.mockReturnValue(makeBaseAuth({ saveMyPaymentContacts }));
    renderProfile();
    const zelle = await screen.findByLabelText(/zelle email or phone/i);
    await userEvent.type(zelle, 'Andre@Example.com');
    await userEvent.type(screen.getByLabelText(/apple cash phone/i), '555');
    const panel = screen.getByText('Venmo, Zelle & Apple Cash').closest('section');
    await userEvent.click(within(panel).getByRole('button', { name: /save payment details/i }));
    expect(await screen.findByText(/10-digit US phone/i)).toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText(/apple cash phone/i));
    await userEvent.type(screen.getByLabelText(/apple cash phone/i), '5555550101');
    await userEvent.click(within(panel).getByRole('button', { name: /save payment details/i }));
    await waitFor(() => expect(saveMyPaymentContacts).toHaveBeenLastCalledWith({ zelle: 'Andre@Example.com', appleCashPhone: '5555550101' }));
    expect(await screen.findByDisplayValue('(555) 555-0101')).toBeInTheDocument();
    expect(screen.getByDisplayValue('andre@example.com')).toBeInTheDocument();
  });
});

test('the bug-report inbox link is on Profile, for the admin only', () => {
  const { unmount } = renderProfile();
  expect(screen.queryByRole('link', { name: /bug reports/i })).not.toBeInTheDocument();
  unmount();
  useAuth.mockReturnValue(makeBaseAuth({ user: { id: 'user-1', email: 'ribauandre@yahoo.com' } }));
  renderProfile();
  expect(screen.getByRole('link', { name: /bug reports/i })).toHaveAttribute('href', '/admin/bugs');
});

describe('your personal bests and species checklist', () => {
  const bests = [{ id: 'pb-1', user_id: 'user-1', species: 'Striped Bass', size_label: '38 in', caught_at: '2026-05-01', photo_url: '' }];

  test('your personal bests are listed on Profile, with an empty state when there are none', async () => {
    const { unmount } = renderProfile();
    expect(screen.getByText(/no personal bests yet/i)).toBeInTheDocument();
    unmount();
    useAuth.mockReturnValue(makeBaseAuth({ personalBests: bests }));
    renderProfile();
    const section = screen.getByText('Personal bests').closest('section');
    expect(within(section).getByText('Striped Bass')).toBeInTheDocument();
    expect(within(section).getByText(/38 in/)).toBeInTheDocument();
  });

  test('Log a personal best opens the one Log a catch form with Personal best ticked', async () => {
    renderProfile();
    await userEvent.click(screen.getByRole('button', { name: /log a personal best/i }));
    const form = screen.getByRole('dialog', { name: /log a catch/i });
    expect(within(form).getByRole('checkbox', { name: /personal best/i })).toBeChecked();
    expect(within(form).getByRole('checkbox', { name: /fish year/i })).not.toBeChecked();
  });

  test('the species checklist is collapsed by default, showing only a caught-count summary', async () => {
    useAuth.mockReturnValue(makeBaseAuth({ personalBests: bests }));
    renderProfile();
    expect(await screen.findByText(/species caught/i)).toBeInTheDocument();
    expect(screen.queryByText('Carp')).not.toBeInTheDocument();
  });

  test('it credits your personal bests and your own Fish Year catches, not anyone else\'s', async () => {
    useAuth.mockReturnValue(makeBaseAuth({
      personalBests: bests,
      listFishYearCatches: jest.fn().mockResolvedValue([
        { id: 'fy-1', user_id: 'user-1', month: 'March', species: 'Carp' },
        { id: 'fy-2', user_id: 'user-2', month: 'April', species: 'Bluegill' },
      ]),
    }));
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /species checklist/i }));
    const board = screen.getByRole('button', { name: /species checklist/i }).closest('section');
    await waitFor(() => expect(within(board).getByText('Carp').closest('.species-cell')).toHaveClass('is-caught'));
    expect(within(board).getByText('Striped Bass').closest('.species-cell')).toHaveClass('is-caught');
    expect(within(board).getByText('Bluegill').closest('.species-cell')).toHaveClass('is-missing');
  });

  test('a link to #fish-bingo opens the checklist', () => {
    render(<MemoryRouter initialEntries={['/profile#fish-bingo']}><Profile /></MemoryRouter>);
    expect(screen.getByRole('button', { name: /species checklist/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
