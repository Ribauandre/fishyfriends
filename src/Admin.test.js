import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Admin from './Admin';
import { useAuth } from './context/AuthContext';
import { makeBackupKey } from './utils/backupKey';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
// Making a real key takes seconds and needs WebCrypto, which jsdom lacks; backupKey.test.js
// and the restore drill cover the real one.
jest.mock('./utils/backupKey', () => ({ ...jest.requireActual('./utils/backupKey'), makeBackupKey: jest.fn() }));

const ACCOUNTS = [
  { account_id: 'u-new', display_name: 'Newcomer', email: 'new@example.com', signed_up_at: '2026-11-10T12:00:00Z', status: 'pending', is_admin: false },
  { account_id: 'u-admin', display_name: 'Andre', email: 'andre@example.com', signed_up_at: '2026-01-01T12:00:00Z', status: 'approved', is_admin: true },
  { account_id: 'u-kev', display_name: 'Kevin', email: 'kev@example.com', signed_up_at: '2026-02-01T12:00:00Z', status: 'approved', is_admin: false },
  { account_id: 'u-out', display_name: 'Stranger', email: 'who@example.com', signed_up_at: '2026-03-01T12:00:00Z', status: 'declined', is_admin: false },
];

const PRINT = '526eff9f8879e7eb'.padEnd(64, 'a');
const PAIR = {
  publicKey: '-----BEGIN PUBLIC KEY-----\nPUBLICHALF\n-----END PUBLIC KEY-----\n',
  privateKey: '-----BEGIN PRIVATE KEY-----\nPRIVATEHALF\n-----END PRIVATE KEY-----\n',
  fingerprint: PRINT,
};

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
    getPhotoPrivacy: jest.fn().mockResolvedValue(false),
    setPhotoPrivacy: jest.fn().mockResolvedValue({ error: null }),
    testPhotoLink: jest.fn().mockResolvedValue('works'),
    checkLiveChannels: jest.fn().mockResolvedValue({ verdict: 'open', membersOnly: { outcome: 'joined', reason: '' }, open: { outcome: 'joined', reason: '' } }),
    getBackupStatus: jest.fn().mockResolvedValue({ key: null, lastRun: null, runs30d: 0 }),
    saveBackupKey: jest.fn().mockResolvedValue({ error: null, fingerprint: PRINT }),
    ...overrides,
  };
}

function renderAdmin(overrides, at = '/admin') {
  auth = makeAuth(overrides);
  useAuth.mockReturnValue(auth);
  return render(<MemoryRouter initialEntries={[at]}><Routes>
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

describe('who can open a photo', () => {
  const links = () => section('Who can open a photo');

  test('says photos open by address, and makes them private only after a private link is seen to work', async () => {
    renderAdmin();
    expect(await links().findByText(/opens for anyone who has its address/i)).toBeInTheDocument();
    await userEvent.click(links().getByRole('button', { name: /make photos private/i }));
    expect(await links().findByRole('heading', { name: 'Photos are private' })).toBeInTheDocument();
    expect(auth.testPhotoLink).toHaveBeenCalledTimes(1);
    expect(auth.setPhotoPrivacy).toHaveBeenCalledWith(true);
    expect(auth.testPhotoLink.mock.invocationCallOrder[0]).toBeLessThan(auth.setPhotoPrivacy.mock.invocationCallOrder[0]);
    expect(links().getByText(/the old addresses open nothing/i)).toBeInTheDocument();
  });

  test('changes nothing when a private link does not open a photo', async () => {
    renderAdmin({ testPhotoLink: jest.fn().mockResolvedValue('failed') });
    await userEvent.click(await links().findByRole('button', { name: /make photos private/i }));
    expect(await links().findByRole('alert')).toHaveTextContent(/nothing was changed/i);
    expect(auth.setPhotoPrivacy).not.toHaveBeenCalled();
    expect(links().getByRole('button', { name: /make photos private/i })).toBeEnabled();
  });

  test('with no photos stored there is nothing to test, and the switch still works', async () => {
    renderAdmin({ testPhotoLink: jest.fn().mockResolvedValue('none') });
    await userEvent.click(await links().findByRole('button', { name: /make photos private/i }));
    await waitFor(() => expect(auth.setPhotoPrivacy).toHaveBeenCalledWith(true));
  });

  test('private photos can be opened by address again, without a second test', async () => {
    renderAdmin({ getPhotoPrivacy: jest.fn().mockResolvedValue(true) });
    await userEvent.click(await links().findByRole('button', { name: /open them by address again/i }));
    expect(await links().findByText(/opens for anyone who has its address/i)).toBeInTheDocument();
    expect(auth.setPhotoPrivacy).toHaveBeenCalledWith(false);
    expect(auth.testPhotoLink).not.toHaveBeenCalled();
  });

  test('a refusal from the database is shown and the page stays as it was', async () => {
    renderAdmin({ setPhotoPrivacy: jest.fn().mockResolvedValue({ error: new Error('Only the club admin can change how photos are served.') }) });
    await userEvent.click(await links().findByRole('button', { name: /make photos private/i }));
    expect(await links().findByRole('alert')).toHaveTextContent(/only the club admin/i);
    expect(links().queryByRole('heading', { name: 'Photos are private' })).not.toBeInTheDocument();
  });

  test('says so when it can\'t tell how photos are served, and offers no switch', async () => {
    renderAdmin({ getPhotoPrivacy: jest.fn().mockResolvedValue(null) });
    expect(await links().findByText(/couldn't check how photos are served/i)).toBeInTheDocument();
    expect(links().queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('who can listen in live', () => {
  const live = () => section('Who can listen in live');
  const NOT_ALLOWED = 'Unauthorized: You do not have permissions to read from this Channel topic: club-channel-check';
  const answer = (verdict, membersOnly, open) => ({ verdict, membersOnly, open });
  const joined = { outcome: 'joined', reason: '' };

  test('members-only works but open channels are still accepted: says so, and gives the steps only the owner can take', async () => {
    renderAdmin();
    expect(await live().findByText(/still accepts open channels/i)).toBeInTheDocument();
    expect(live().getByText(/turn off "allow public access to channels"/i)).toBeInTheDocument();
    expect(live().getByText(/give the crew a day or two/i)).toBeInTheDocument();
    expect(live().queryByRole('alert')).not.toBeInTheDocument();
    // A fresh answer, not one remembered from earlier in the day.
    expect(auth.checkLiveChannels).toHaveBeenCalledWith();
  });

  test('after the setting is turned off, Check again finds the channels closed', async () => {
    const checkLiveChannels = jest.fn()
      .mockResolvedValueOnce(answer('open', joined, joined))
      .mockResolvedValueOnce(answer('closed', joined, { outcome: 'refused', reason: 'PrivateOnly: This project only allows private channels' }));
    renderAdmin({ checkLiveChannels });
    await userEvent.click(await live().findByRole('button', { name: /check again/i }));
    expect(await live().findByRole('heading', { name: 'Live channels are members-only' })).toBeInTheDocument();
    expect(live().getByText(/the site's public key alone gets nobody in/i)).toBeInTheDocument();
    expect(live().queryByText(/allow public access/i)).not.toBeInTheDocument();
    expect(checkLiveChannels).toHaveBeenCalledTimes(2);
  });

  test('members-only refused: warns NOT to turn open channels off, in the server\'s words', async () => {
    renderAdmin({ checkLiveChannels: jest.fn().mockResolvedValue(answer('not-ready', { outcome: 'refused', reason: NOT_ALLOWED }, joined)) });
    const warning = await live().findByRole('alert');
    expect(warning).toHaveTextContent(/don't turn open channels off yet/i);
    expect(warning).toHaveTextContent(NOT_ALLOWED);
    expect(live().getByText(/0045_members_only_live_channels\.sql/)).toBeInTheDocument();
    expect(live().queryByText(/turn off "allow public access/i)).not.toBeInTheDocument();
  });

  test('both refused: says the live dock and feed are off and the two ways back', async () => {
    renderAdmin({ checkLiveChannels: jest.fn().mockResolvedValue(answer('broken', { outcome: 'refused', reason: NOT_ALLOWED }, { outcome: 'refused', reason: 'PrivateOnly' })) });
    expect(await live().findByRole('alert')).toHaveTextContent(/neither kind of channel can be joined/i);
    expect(live().getByText(/turn "allow public access to channels" back on/i)).toBeInTheDocument();
  });

  test('couldn\'t tell: says so, and can be asked again', async () => {
    renderAdmin({ checkLiveChannels: jest.fn().mockResolvedValue(answer('unknown', { outcome: 'unreachable', reason: '' }, { outcome: 'unreachable', reason: '' })) });
    expect(await live().findByText(/couldn't reach the live channels/i)).toBeInTheDocument();
    expect(live().getByRole('button', { name: /check again/i })).toBeEnabled();
    expect(live().queryByText(/allow public access/i)).not.toBeInTheDocument();
  });

  test('Home\'s reminder lands on this section', async () => {
    const scrolled = jest.spyOn(Element.prototype, 'scrollIntoView');
    renderAdmin(undefined, '/admin#live-channels');
    await live().findByText(/still accepts open channels/i);
    await waitFor(() => expect(scrolled.mock.instances.some((element) => element.id === 'live-channels')).toBe(true));
    scrolled.mockRestore();
  });
});

describe('backups', () => {
  const backups = () => section('Backups');
  const daysAgo = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const withKey = (lastRun, keyAge = 30) => ({ key: { fingerprint: PRINT, createdAt: daysAgo(keyAge) }, lastRun, runs30d: lastRun ? 28 : 0 });
  const run = (days) => ({ finishedAt: daysAgo(days), fingerprint: PRINT, bytes: 181000, rows: 2345, tables: 33 });
  beforeEach(() => { makeBackupKey.mockResolvedValue(PAIR); });

  test('with no key it says nothing is backed up, and making one shows the private half to be saved before anything is switched on', async () => {
    renderAdmin();
    expect(await backups().findByRole('heading', { name: 'No backups yet' })).toBeInTheDocument();
    expect(backups().getByText(/nothing is keeping a copy/i)).toBeInTheDocument();
    // Said before the key is made, not after: where the copies are kept, and who can fetch one.
    expect(backups().getByText(/anyone with a github account can download one\. what they get is locked/i)).toBeInTheDocument();
    await userEvent.click(backups().getByRole('button', { name: /make the backup key/i }));

    expect(await backups().findByRole('heading', { name: /save this key before anything else/i })).toBeInTheDocument();
    const shown = backups().getByRole('textbox', { name: 'Backup key' });
    expect(shown.value).toContain('PRIVATEHALF');
    expect(shown.value).not.toContain('PUBLICHALF');
    expect(shown).toHaveAttribute('readonly');
    const download = backups().getByRole('link', { name: /download the key file/i });
    expect(download).toHaveAttribute('download', 'fishyfriends-backup-key-526eff9f.txt');
    expect(decodeURIComponent(download.getAttribute('href'))).toContain('PRIVATEHALF');
    // Nothing has gone to the database yet, and can't until the key is said to be saved.
    expect(auth.saveBackupKey).not.toHaveBeenCalled();
    expect(backups().getByRole('button', { name: /start the backups/i })).toBeDisabled();
  });

  test('once the key is saved, only the public half is sent, and the page shows backups on', async () => {
    const getBackupStatus = jest.fn().mockResolvedValueOnce({ key: null, lastRun: null, runs30d: 0 }).mockResolvedValue(withKey(null, 0));
    renderAdmin({ getBackupStatus });
    await userEvent.click(await backups().findByRole('button', { name: /make the backup key/i }));
    await userEvent.click(await backups().findByRole('checkbox', { name: /saved this key somewhere safe/i }));
    await userEvent.click(backups().getByRole('button', { name: /start the backups/i }));

    expect(await backups().findByRole('heading', { name: 'Backups are on' })).toBeInTheDocument();
    expect(auth.saveBackupKey).toHaveBeenCalledTimes(1);
    expect(auth.saveBackupKey).toHaveBeenCalledWith(PAIR.publicKey);
    expect(JSON.stringify(auth.saveBackupKey.mock.calls)).not.toContain('PRIVATEHALF');
    // The private half is gone from the page.
    expect(backups().queryByRole('textbox', { name: 'Backup key' })).not.toBeInTheDocument();
    expect(backups().getByText('526e ff9f 8879 e7eb')).toBeInTheDocument();
    expect(backups().getByText(/the first backup is made tonight/i)).toBeInTheDocument();
  });

  test('throwing the key away sends nothing', async () => {
    renderAdmin();
    await userEvent.click(await backups().findByRole('button', { name: /make the backup key/i }));
    await userEvent.click(await backups().findByRole('button', { name: /throw this key away/i }));
    expect(backups().queryByRole('textbox', { name: 'Backup key' })).not.toBeInTheDocument();
    expect(backups().getByRole('button', { name: /make the backup key/i })).toBeEnabled();
    expect(auth.saveBackupKey).not.toHaveBeenCalled();
  });

  test('a key the database stored differently is not trusted', async () => {
    renderAdmin({ saveBackupKey: jest.fn().mockResolvedValue({ error: null, fingerprint: 'f'.repeat(64) }) });
    await userEvent.click(await backups().findByRole('button', { name: /make the backup key/i }));
    await userEvent.click(await backups().findByRole('checkbox', { name: /saved this key/i }));
    await userEvent.click(backups().getByRole('button', { name: /start the backups/i }));
    expect(await backups().findByRole('alert')).toHaveTextContent(/stored a different key/i);
    expect(backups().queryByRole('heading', { name: 'Backups are on' })).not.toBeInTheDocument();
  });

  test('a refusal from the database, or a browser that can\'t make a key, is said', async () => {
    renderAdmin({ saveBackupKey: jest.fn().mockResolvedValue({ error: new Error('Only the club admin can set the backup key.') }) });
    await userEvent.click(await backups().findByRole('button', { name: /make the backup key/i }));
    await userEvent.click(await backups().findByRole('checkbox', { name: /saved this key/i }));
    await userEvent.click(backups().getByRole('button', { name: /start the backups/i }));
    expect(await backups().findByRole('alert')).toHaveTextContent(/only the club admin/i);

    await userEvent.click(backups().getByRole('button', { name: /throw this key away/i }));
    makeBackupKey.mockRejectedValue(new Error('This browser can\'t make a key. Try a current Safari, Chrome or Firefox.'));
    await userEvent.click(backups().getByRole('button', { name: /make the backup key/i }));
    expect(await backups().findByRole('alert')).toHaveTextContent(/can't make a key/i);
    expect(backups().queryByRole('textbox', { name: 'Backup key' })).not.toBeInTheDocument();
  });

  test('with backups running it shows the last one, where they are kept and what is not in them', async () => {
    renderAdmin({ getBackupStatus: jest.fn().mockResolvedValue(withKey(run(0.4))) });
    expect(await backups().findByRole('heading', { name: 'Backups are on' })).toBeInTheDocument();
    expect(backups().getByText(/last backup: .*2,345 rows, 177 KB.*28 kept in the last 30 days/i)).toBeInTheDocument();
    expect(backups().getByText(/anyone with a github account can download one; without your key file it can't be read/i)).toBeInTheDocument();
    expect(backups().getByText(/photos and license documents .* are not in a backup/i)).toBeInTheDocument();
    expect(backups().queryByRole('alert')).not.toBeInTheDocument();
  });

  test('it says when the nightly job has stopped, or never started', async () => {
    const first = renderAdmin({ getBackupStatus: jest.fn().mockResolvedValue(withKey(run(9))) });
    expect(await backups().findByRole('alert')).toHaveTextContent(/no backup has been kept since/i);
    first.unmount();
    renderAdmin({ getBackupStatus: jest.fn().mockResolvedValue(withKey(null, 10)) });
    expect(await backups().findByRole('alert')).toHaveTextContent(/no backup has been kept yet/i);
  });

  test('replacing the key warns that the old one still opens the backups made so far', async () => {
    renderAdmin({ getBackupStatus: jest.fn().mockResolvedValue(withKey(run(0.4))) });
    await userEvent.click(await backups().findByRole('button', { name: /replace the key/i }));
    expect(await backups().findByText(/still need the old key/i)).toBeInTheDocument();
    expect(backups().getByRole('button', { name: /use this key from now on/i })).toBeDisabled();
  });

  test('says so when it can\'t check, and offers nothing', async () => {
    renderAdmin({ getBackupStatus: jest.fn().mockResolvedValue(null) });
    expect(await backups().findByText(/couldn't check on the backups/i)).toBeInTheDocument();
    expect(backups().queryByRole('button')).not.toBeInTheDocument();
  });
});
