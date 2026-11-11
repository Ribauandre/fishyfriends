import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// The admin's switch for who can open a stored photo. While the photo buckets are open, a
// photo's address is all anyone needs, signed in or not, forever — and until the storage fix
// of November 2026 anyone could list those addresses, so every one that existed has to be
// taken as copied. Private, a photo loads only through a signed link the app asks for as a
// member, and the old addresses open nothing. The app already shows every photo through
// signed links, so the switch changes nothing for a phone on this version; before flipping
// it this proves, on this device, that a signed link really opens a stored photo.
export default function PhotoLinksSection() {
  const { getPhotoPrivacy, setPhotoPrivacy, testPhotoLink } = useAuth();
  const [isPrivate, setIsPrivate] = useState(undefined);
  const [phase, setPhase] = useState('idle');
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let active = true;
    getPhotoPrivacy().then((answer) => { if (active) setIsPrivate(answer); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function close() {
    setProblem(''); setPhase('testing');
    const outcome = await testPhotoLink();
    if (outcome === 'failed') {
      setProblem('A private link didn\'t open a photo on this device, so nothing was changed. Try again on a good connection; if it keeps failing, leave photos as they are and report it.');
      setPhase('idle');
      return;
    }
    setPhase('switching');
    const result = await setPhotoPrivacy(true);
    if (result.error) setProblem(result.error.message); else setIsPrivate(true);
    setPhase('idle');
  }

  async function open() {
    setProblem(''); setPhase('switching');
    const result = await setPhotoPrivacy(false);
    if (result.error) setProblem(result.error.message); else setIsPrivate(false);
    setPhase('idle');
  }

  const busy = phase !== 'idle';
  return <section className="table-card photo-privacy" aria-label="Who can open a photo">
    <div className="section-heading"><div><span className="eyebrow">PHOTO LINKS</span><h2>{isPrivate ? 'Photos are private' : 'Who can open a photo'}</h2></div></div>
    {isPrivate === undefined && <p className="month-empty" role="status">Checking how photos are served...</p>}
    {isPrivate === null && <p className="month-empty" role="status">Couldn't check how photos are served. Reload to try again.</p>}
    {isPrivate === false && <>
      <p className="month-empty">Right now a photo opens for anyone who has its address, signed in or not. Until the storage fix those addresses could be copied by anyone, so treat the old ones as out there. Make photos private and they stop working: photos then load only for members, through links that run out.</p>
      <p className="month-empty">Give the crew a day or two on this update first. A phone that hasn't reloaded the app since would show broken photos until it does.</p>
      <div className="form-actions"><button className="button button-primary" type="button" disabled={busy} onClick={close}>{phase === 'testing' ? 'Testing a private link...' : phase === 'switching' ? 'Switching...' : <>Make photos private <span>→</span></>}</button></div>
    </>}
    {isPrivate === true && <>
      <p className="month-empty" role="status">Photos load only for members, through links that run out. The old addresses open nothing.</p>
      <div className="form-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={open}>{phase === 'switching' ? 'Switching...' : 'Open them by address again'}</button></div>
    </>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </section>;
}
