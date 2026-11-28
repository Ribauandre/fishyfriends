import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { PASSKEY_ANCHOR, PASSKEY_NAME_MAX, passkeyDates, passkeyName } from '../utils/passkeys';
import useHashAnchor from '../utils/useHashAnchor';

// Your passkeys: Face ID, Touch ID, a fingerprint or a screen lock in place of the password.
// The section isn't there at all until the club's owner has switched passkeys on for the
// project (see utils/passkeys.js), so a project without them looks as it always did.
//
// Adding one asks for the current password first, as changing the password does: a phone
// left unlocked, or a computer somebody walked away from, isn't enough to leave a way back
// in. Once that has been checked, a second try — the device's prompt was closed, or the
// browser wouldn't show it without a fresh tap — doesn't ask again.
export default function PasskeySection() {
  const { user, passkeysOn, canUsePasskeys, checkPasskeys, listPasskeys, addPasskey, renamePasskey, removePasskey } = useAuth();
  const [passkeys, setPasskeys] = useState(null);
  const [problem, setProblem] = useState('');
  const [quiet, setQuiet] = useState('');
  const [password, setPassword] = useState('');
  const [passwordChecked, setPasswordChecked] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [renaming, setRenaming] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [working, setWorking] = useState(null);
  // A link to /profile#passkeys lands here once the list is in (what is above it on the page
  // loads after it and pushes it down).
  const box = useHashAnchor(PASSKEY_ANCHOR, Boolean(passkeysOn) && passkeys !== null);

  // Once per visit: the provider hands out new functions every render.
  useEffect(() => {
    checkPasskeys?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!passkeysOn) return undefined;
    let live = true;
    listPasskeys().then((result) => {
      if (!live) return;
      if (result?.error) setProblem(result.error.message);
      setPasskeys(result?.passkeys || []);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passkeysOn, user?.id]);

  if (!passkeysOn) return null;

  const said = () => { setProblem(''); setQuiet(''); setAdded(false); };

  async function handleAdd(event) {
    event.preventDefault();
    said();
    setAdding(true);
    const result = await addPasskey(passwordChecked ? '' : password);
    setAdding(false);
    if (result?.needsPassword) setPasswordChecked(false);
    else if (result?.passwordOk) { setPasswordChecked(true); setPassword(''); }
    if (result?.error) {
      if (result.cancelled) setQuiet(result.error.message); else setProblem(result.error.message);
      return;
    }
    setPasswordChecked(false);
    setAdded(true);
    if (result?.passkey?.id) setPasskeys((previous) => [result.passkey, ...(previous || []).filter((passkey) => passkey.id !== result.passkey.id)]);
  }

  async function handleRename(event) {
    event.preventDefault();
    said();
    setWorking(renaming.id);
    const result = await renamePasskey(renaming.id, renaming.name);
    setWorking(null);
    if (result?.error) { setProblem(result.error.message); return; }
    setPasskeys((previous) => (previous || []).map((passkey) => (passkey.id === renaming.id ? { ...passkey, ...result.passkey } : passkey)));
    setRenaming(null);
  }

  async function handleRemove(passkey) {
    said();
    setWorking(passkey.id);
    const result = await removePasskey(passkey.id, { last: (passkeys || []).length === 1 });
    setWorking(null);
    setRemoving(null);
    if (result?.error) { setProblem(result.error.message); return; }
    setPasskeys((previous) => (previous || []).filter((kept) => kept.id !== passkey.id));
  }

  return <section className="settings-card passkey-panel" id={PASSKEY_ANCHOR} ref={box} aria-labelledby="passkeys-heading">
    <div className="section-heading"><div><span className="eyebrow">SKIP THE PASSWORD</span><h2 id="passkeys-heading">Passkeys</h2></div></div>
    <p>Sign in with Face ID, Touch ID, a fingerprint or your screen lock instead of typing your password. A passkey stays on your device or in your password manager: the club never sees your face or your fingerprint, and your password goes on working.</p>

    {passkeys === null && <p className="month-empty" role="status">Looking for your passkeys...</p>}
    {passkeys && passkeys.length === 0 && <p className="month-empty">No passkeys on this account yet.</p>}
    {passkeys && passkeys.length > 0 && <ul className="passkey-list" aria-label="Your passkeys">
      {passkeys.map((passkey) => <li key={passkey.id} className="passkey-row">
        {renaming?.id === passkey.id
          ? <form className="passkey-rename" onSubmit={handleRename}>
            <label>Name<input autoFocus required value={renaming.name} maxLength={PASSKEY_NAME_MAX} onChange={(event) => setRenaming({ ...renaming, name: event.target.value })} placeholder="My iPhone" /></label>
            <div className="passkey-row-actions">
              <button className="button button-primary" type="submit" disabled={working === passkey.id}>{working === passkey.id ? 'Saving...' : 'Save'}</button>
              <button className="button button-quiet" type="button" disabled={working === passkey.id} onClick={() => setRenaming(null)}>Cancel</button>
            </div>
          </form>
          : <>
            <div className="passkey-row-info"><strong>{passkeyName(passkey)}</strong><span>{passkeyDates(passkey)}</span></div>
            {removing === passkey.id
              ? <div className="passkey-row-actions passkey-confirm">
                <span>Remove it? Whatever holds it goes back to your password.</span>
                <button className="button button-primary" type="button" disabled={working === passkey.id} onClick={() => handleRemove(passkey)}>{working === passkey.id ? 'Removing...' : 'Yes, remove'}</button>
                <button className="button button-quiet" type="button" disabled={working === passkey.id} onClick={() => setRemoving(null)}>Keep it</button>
              </div>
              : <div className="passkey-row-actions">
                <button className="button button-quiet" type="button" onClick={() => { said(); setRemoving(null); setRenaming({ id: passkey.id, name: passkey.friendly_name || '' }); }} aria-label={`Rename ${passkeyName(passkey)}`}>Rename</button>
                <button className="button button-quiet" type="button" onClick={() => { said(); setRenaming(null); setRemoving(passkey.id); }} aria-label={`Remove ${passkeyName(passkey)}`}>Remove</button>
              </div>}
          </>}
      </li>)}
    </ul>}

    {canUsePasskeys
      ? <form className="passkey-add" onSubmit={handleAdd}>
        <input type="email" name="username" autoComplete="username" value={user?.email || ''} readOnly hidden />
        {passwordChecked
          ? <p className="field-hint">Password checked. Your device will ask for your face, finger or screen lock.</p>
          : <label>Current password<input type="password" required maxLength={200} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /><span className="field-hint">Asked once, so only you can add a way in.</span></label>}
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={adding}>{adding ? 'Waiting for your device...' : passwordChecked ? 'Try again' : 'Add a passkey'} <span>＋</span></button>{added && <span className="saved-message" role="status">Passkey added</span>}</div>
      </form>
      : <p className="month-empty">This browser can't make or use passkeys. The ones above still work wherever they are kept.</p>}
    {added && <p role="status">Next time, tap <strong>Sign in with a passkey</strong> on the sign-in page. Give it a name above if you use more than one device.</p>}
    {quiet && <p role="status">{quiet}</p>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
    <p>See one you don't recognise? Remove it, then change your password below.</p>
  </section>;
}
