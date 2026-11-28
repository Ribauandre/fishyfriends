import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import PasskeySection from './PasskeySection';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const PHONE = { id: 'pk-1', friendly_name: 'iCloud Keychain', created_at: '2026-11-20T12:00:00Z', last_used_at: '2026-11-27T12:00:00Z' };
const LAPTOP = { id: 'pk-2', friendly_name: '', created_at: '2026-10-02T12:00:00Z' };

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1', email: 'andre@example.com' },
    passkeysOn: true,
    canUsePasskeys: true,
    checkPasskeys: jest.fn().mockResolvedValue(true),
    listPasskeys: jest.fn().mockResolvedValue({ passkeys: [PHONE, LAPTOP], error: null }),
    addPasskey: jest.fn().mockResolvedValue({ error: null, passwordOk: true, passkey: { id: 'pk-3', friendly_name: 'Google Password Manager', created_at: '2026-11-28T12:00:00Z' } }),
    renamePasskey: jest.fn(async (id, name) => ({ error: null, passkey: { id, friendly_name: name } })),
    removePasskey: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function open(overrides, entry = '/profile') {
  const auth = makeBaseAuth(overrides);
  useAuth.mockReturnValue(auth);
  const view = render(<MemoryRouter initialEntries={[entry]}><PasskeySection /></MemoryRouter>);
  return { auth, ...view };
}

const rows = () => within(screen.getByRole('list', { name: 'Your passkeys' })).getAllByRole('listitem');

describe('where the club hasn\'t switched passkeys on', () => {
  test('the section isn\'t there at all, and nothing is asked about the account', () => {
    const { auth, container } = open({ passkeysOn: false, canUsePasskeys: false });
    expect(container).toBeEmptyDOMElement();
    expect(auth.listPasskeys).not.toHaveBeenCalled();
    // It does ask, once, whether the switch has been turned on since.
    expect(auth.checkPasskeys).toHaveBeenCalledTimes(1);
  });

  test('a page test with no passkey functions at all still renders nothing rather than breaking', () => {
    useAuth.mockReturnValue({ user: { id: 'user-1' } });
    const { container } = render(<MemoryRouter><PasskeySection /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('a link straight to it', () => {
  let scrolled;
  beforeEach(() => { scrolled = jest.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {}); });
  afterEach(() => { scrolled.mockRestore(); });

  test('/profile#passkeys scrolls to the section once its list is in, not before', async () => {
    let answer;
    open({ listPasskeys: jest.fn(() => new Promise((resolve) => { answer = resolve; })) }, '/profile#passkeys');
    expect(screen.getByText('Looking for your passkeys...')).toBeInTheDocument();
    expect(scrolled).not.toHaveBeenCalled();
    answer({ passkeys: [PHONE], error: null });
    await screen.findByRole('list', { name: 'Your passkeys' });
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(scrolled.mock.instances[0]).toBe(document.getElementById('passkeys'));
  });

  test('any other link leaves the page where it is', async () => {
    open({}, '/profile#licenses');
    await screen.findByRole('list', { name: 'Your passkeys' });
    expect(scrolled).not.toHaveBeenCalled();
  });
});

describe('the list', () => {
  test('says what passkeys are, and that the club never sees a face or a fingerprint', async () => {
    open();
    expect(screen.getByRole('heading', { level: 2, name: 'Passkeys' })).toBeInTheDocument();
    expect(screen.getByText(/the club never sees your face or your fingerprint, and your password goes on working/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Passkeys' })).toHaveAttribute('id', 'passkeys');
    await screen.findByRole('list', { name: 'Your passkeys' });
  });

  test('each passkey by name, with when it was added and last used', async () => {
    open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    expect(rows().map((row) => row.querySelector('.passkey-row-info').textContent)).toEqual([
      'iCloud KeychainAdded Nov 20, 2026 · last used Nov 27, 2026',
      'PasskeyAdded Oct 2, 2026 · never used',
    ]);
  });

  test('while it is being read it says so, and an account with none says that', async () => {
    let answer;
    open({ listPasskeys: jest.fn(() => new Promise((resolve) => { answer = resolve; })) });
    expect(screen.getByText('Looking for your passkeys...')).toBeInTheDocument();
    answer({ passkeys: [], error: null });
    expect(await screen.findByText('No passkeys on this account yet.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Your passkeys' })).toBeNull();
  });

  test('a list that couldn\'t be read says why', async () => {
    open({ listPasskeys: jest.fn().mockResolvedValue({ passkeys: null, error: new Error('Your passkeys couldn\'t be read. Try again in a moment.') }) });
    expect(await screen.findByRole('alert')).toHaveTextContent('Your passkeys couldn\'t be read.');
  });

  test('tells its owner what to do about one they don\'t recognise', async () => {
    open();
    expect(screen.getByText('See one you don\'t recognise? Remove it, then change your password below.')).toBeInTheDocument();
  });
});

describe('adding one', () => {
  test('asks for the current password, then for the device, and lists the new passkey first', async () => {
    const { auth } = open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    const password = screen.getByLabelText(/Current password/);
    expect(password).toBeRequired();
    expect(password).toHaveAttribute('maxLength', '200');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    userEvent.type(password, 'old-password-1');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    expect(await screen.findByText('Passkey added')).toBeInTheDocument();
    expect(auth.addPasskey).toHaveBeenCalledWith('old-password-1');
    expect(rows()).toHaveLength(3);
    expect(rows()[0]).toHaveTextContent('Google Password Manager');
    expect(screen.getByText(/Next time, tap/)).toHaveTextContent('Next time, tap Sign in with a passkey on the sign-in page.');
    // The password is asked for again for the next one, and isn't left in the box.
    expect(screen.getByLabelText(/Current password/)).toHaveValue('');
  });

  test('while the device is asking, the button waits', async () => {
    let answer;
    open({ addPasskey: jest.fn(() => new Promise((resolve) => { answer = resolve; })) });
    userEvent.type(screen.getByLabelText(/Current password/), 'old-password-1');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    expect(await screen.findByRole('button', { name: /Waiting for your device/ })).toBeDisabled();
    answer({ error: null, passwordOk: true, passkey: { id: 'pk-3', friendly_name: 'x', created_at: '2026-11-28T12:00:00Z' } });
    await screen.findByText('Passkey added');
  });

  test('a wrong password adds nothing and keeps asking for it', async () => {
    const { auth } = open({ addPasskey: jest.fn().mockResolvedValue({ error: new Error('That isn\'t your current password.') }) });
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.type(screen.getByLabelText(/Current password/), 'not-it');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That isn\'t your current password.');
    expect(screen.getByLabelText(/Current password/)).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
    expect(auth.addPasskey).toHaveBeenCalledTimes(1);
  });

  test('a prompt that was closed is said quietly, and trying again doesn\'t ask for the password twice', async () => {
    const addPasskey = jest.fn()
      .mockResolvedValueOnce({ error: new Error('No passkey was added. Nothing has changed.'), cancelled: true, passwordOk: true })
      .mockResolvedValueOnce({ error: null, passwordOk: true, passkey: { id: 'pk-3', friendly_name: 'iCloud Keychain', created_at: '2026-11-28T12:00:00Z' } });
    open({ addPasskey });
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.type(screen.getByLabelText(/Current password/), 'old-password-1');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    expect(await screen.findByText('No passkey was added. Nothing has changed.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
    expect(screen.getByText(/Password checked/)).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Passkey added')).toBeInTheDocument();
    expect(addPasskey).toHaveBeenNthCalledWith(1, 'old-password-1');
    expect(addPasskey).toHaveBeenNthCalledWith(2, '');
    expect(rows()).toHaveLength(3);
  });

  test('a second try that comes too late is asked for the password again', async () => {
    const addPasskey = jest.fn()
      .mockResolvedValueOnce({ error: new Error('No passkey was added. Nothing has changed.'), cancelled: true, passwordOk: true })
      .mockResolvedValueOnce({ error: new Error('Type your current password.'), needsPassword: true });
    open({ addPasskey });
    userEvent.type(screen.getByLabelText(/Current password/), 'old-password-1');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    userEvent.click(await screen.findByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Type your current password.');
    expect(screen.getByLabelText(/Current password/)).toBeInTheDocument();
  });

  test('a refusal from the server after the password was right says why, and doesn\'t ask for the password again', async () => {
    open({ addPasskey: jest.fn().mockResolvedValue({ error: new Error('That device or password manager already holds a passkey for your account.'), cancelled: false, passwordOk: true }) });
    userEvent.type(screen.getByLabelText(/Current password/), 'old-password-1');
    userEvent.click(screen.getByRole('button', { name: /Add a passkey/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already holds a passkey for your account');
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
  });

  test('a browser that can\'t do passkeys is told so, and can still see and remove the ones it has', async () => {
    open({ canUsePasskeys: false });
    await screen.findByRole('list', { name: 'Your passkeys' });
    expect(screen.getByText(/This browser can't make or use passkeys/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add a passkey/ })).toBeNull();
    expect(screen.queryByLabelText(/Current password/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove iCloud Keychain' })).toBeInTheDocument();
  });
});

describe('renaming one', () => {
  test('a name to tell two devices apart, no longer than the database takes', async () => {
    const { auth } = open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Rename Passkey' }));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('maxLength', '80');
    expect(name).toHaveValue('');
    userEvent.type(name, 'Work laptop');
    userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(rows()[1]).toHaveTextContent('Work laptop'));
    expect(auth.renamePasskey).toHaveBeenCalledWith('pk-2', 'Work laptop');
    expect(screen.queryByLabelText('Name')).toBeNull();
  });

  test('starts from the name it has, and Cancel leaves it', async () => {
    const { auth } = open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Rename iCloud Keychain' }));
    expect(screen.getByLabelText('Name')).toHaveValue('iCloud Keychain');
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(rows()[0]).toHaveTextContent('iCloud Keychain');
    expect(auth.renamePasskey).not.toHaveBeenCalled();
  });

  test('a name the server wouldn\'t take says so and leaves the form open', async () => {
    open({ renamePasskey: jest.fn().mockResolvedValue({ error: new Error('The name couldn\'t be saved. Try again in a moment.') }) });
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Rename iCloud Keychain' }));
    userEvent.clear(screen.getByLabelText('Name'));
    userEvent.type(screen.getByLabelText('Name'), 'Boat tablet');
    userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The name couldn\'t be saved.');
    expect(screen.getByLabelText('Name')).toHaveValue('Boat tablet');
  });
});

describe('removing one', () => {
  test('asks first, and Keep it changes nothing', async () => {
    const { auth } = open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Remove iCloud Keychain' }));
    expect(screen.getByText('Remove it? Whatever holds it goes back to your password.')).toBeInTheDocument();
    userEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(auth.removePasskey).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });

  test('Yes takes it off the account and off the list', async () => {
    const { auth } = open();
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Remove iCloud Keychain' }));
    userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(auth.removePasskey).toHaveBeenCalledWith('pk-1', { last: false });
    expect(rows()[0]).toHaveTextContent('Passkey');
  });

  test('removing the only one is told apart, so the device stops being offered "the one saved here"', async () => {
    const { auth } = open({ listPasskeys: jest.fn().mockResolvedValue({ passkeys: [PHONE], error: null }) });
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Remove iCloud Keychain' }));
    userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByText('No passkeys on this account yet.')).toBeInTheDocument();
    expect(auth.removePasskey).toHaveBeenCalledWith('pk-1', { last: true });
  });

  test('one the server wouldn\'t remove stays, with the reason', async () => {
    open({ removePasskey: jest.fn().mockResolvedValue({ error: new Error('The passkey couldn\'t be removed. Try again in a moment.') }) });
    await screen.findByRole('list', { name: 'Your passkeys' });
    userEvent.click(screen.getByRole('button', { name: 'Remove iCloud Keychain' }));
    userEvent.click(screen.getByRole('button', { name: 'Yes, remove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('couldn\'t be removed');
    expect(rows()).toHaveLength(2);
  });
});
