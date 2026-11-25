import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { makeBackupKey, keyFileName, keyFileText, shortFingerprint } from '../utils/backupKey';
import { backupConcern, backupDay, backupSize, BACKUP_STALE_DAYS } from '../utils/backupStatus';
import useHashAnchor from '../utils/useHashAnchor';

// The nightly backups, and the one thing only the admin can do for them: make the key.
//
// Supabase's free plan keeps no backups, so a job on GitHub copies the database every night
// (supabase/backup/). The copies sit where anyone with a GitHub account can download them,
// so each is sealed to a key pair made HERE, in the admin's browser. The public half is
// saved to the database for the job to seal with. The private half is shown once, for the
// admin to save, and goes nowhere else — which is the point (nothing on GitHub or in the
// database can open a backup) and the catch (lose it and nobody can). So the page won't
// start the backups until the admin says the key is saved, and says plainly what it is.
export default function BackupSection() {
  const { getBackupStatus, saveBackupKey } = useAuth();
  const [status, setStatus] = useState(undefined);
  const [draft, setDraft] = useState(null);
  const [phase, setPhase] = useState('idle');
  const [kept, setKept] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState('');
  const box = useHashAnchor('backups', status !== undefined);

  useEffect(() => {
    let active = true;
    getBackupStatus().then((answer) => { if (active) setStatus(answer); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The download link's address lives only as long as the key is on screen.
  useEffect(() => () => { if (draft?.href?.startsWith('blob:')) URL.revokeObjectURL(draft.href); }, [draft]);

  async function make() {
    setProblem(''); setPhase('making'); setKept(false); setCopied(false);
    try {
      const pair = await makeBackupKey();
      const text = keyFileText({ privateKey: pair.privateKey, fingerprint: pair.fingerprint });
      const href = typeof URL.createObjectURL === 'function'
        ? URL.createObjectURL(new Blob([text], { type: 'text/plain' }))
        : `data:text/plain;charset=utf-8,${encodeURIComponent(text)}`;
      setDraft({ publicKey: pair.publicKey, fingerprint: pair.fingerprint, text, href });
    } catch (error) {
      setProblem(error.message || 'The key couldn\'t be made on this device.');
    }
    setPhase('idle');
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
    } catch (error) {
      setProblem('Couldn\'t copy it from here. Select the text in the box and copy it by hand, or use the download.');
    }
  }

  async function start() {
    setProblem(''); setPhase('saving');
    const result = await saveBackupKey(draft.publicKey);
    if (result.error) {
      setProblem(result.error.message);
    } else if (result.fingerprint !== draft.fingerprint) {
      // The database works the fingerprint out itself from what it was sent.
      setProblem('The database stored a different key from the one this device made, so don\'t rely on it. Make a new key and try again.');
    } else {
      setDraft(null);
      setStatus(await getBackupStatus());
    }
    setPhase('idle');
  }

  const concern = backupConcern(status);
  const last = status?.lastRun;
  const busy = phase !== 'idle';
  return <section ref={box} className="table-card photo-privacy backups" id="backups" aria-label="Backups">
    <div className="section-heading"><div><span className="eyebrow">BACKUPS</span><h2>{!status ? 'Backups' : status.key ? 'Backups are on' : 'No backups yet'}</h2></div></div>
    {status === undefined && <p className="month-empty" role="status">Checking on the backups...</p>}
    {status === null && <p className="month-empty" role="status">Couldn't check on the backups. Reload to try again.</p>}

    {status && !draft && !status.key && <>
      <p className="month-empty">Nothing is keeping a copy of the club's records. If a bad update or a mistaken delete took them, or the database itself went away, they would be gone.</p>
      <p className="month-empty">Make a backup key and a copy of the database is taken every night, locked so that only your key opens it, and kept for 90 days. It takes a minute, and you need somewhere safe to keep the key: a password manager is best.</p>
    </>}

    {status?.key && !draft && <>
      <p className="month-empty">Every night a copy of the database is locked with your backup key and kept for 90 days. Key <strong className="backup-print">{shortFingerprint(status.key.fingerprint)}</strong>, made {backupDay(status.key.createdAt)}.</p>
      {concern === 'fine' && <p className="month-empty" role="status">Last backup: {backupDay(last.finishedAt)} ({last.rows.toLocaleString('en-US')} rows, {backupSize(last.bytes)}). {status.runs30d} kept in the last 30 days.</p>}
      {concern === 'waiting' && <p className="month-empty" role="status">The first backup is made tonight. Come back tomorrow to see it listed here.</p>}
      {concern === 'stale' && <p className="form-error" role="alert">No backup has been kept since {backupDay(last.finishedAt)}. The nightly job has stopped or is failing: on GitHub, open this site's code, then Actions, then Nightly backup. (GitHub switches a nightly job off when the code hasn't changed for 60 days; the button to switch it back on is on that page.)</p>}
      {concern === 'never' && <p className="form-error" role="alert">The key was made more than {BACKUP_STALE_DAYS} days ago and no backup has been kept yet. On GitHub, open this site's code, then Actions, then Nightly backup, to see what the job says.</p>}
      <p className="month-empty">The copies are kept with the site's code on GitHub (Actions, then Nightly backup). Anyone with a GitHub account can download one; without your key file it can't be read. Photos and license documents are files, not records, and are not in a backup.</p>
    </>}

    {draft && <div className="backup-key">
      <h3>Save this key before anything else</h3>
      <p className="month-empty">This key is the only thing that opens a backup. It was made on this device just now and exists nowhere else: not on the site, not in the database, not on GitHub. Put it in a password manager, or keep the file somewhere that will outlive this phone. Anyone who has it can read every backup, and if it's lost nobody can open them, you included.</p>
      {status?.key && <p className="month-empty">Backups made up to now still need the old key. Keep that one too until they have aged out, 90 days from now.</p>}
      <div className="form-actions backup-key-actions">
        <a className="button button-quiet" href={draft.href} download={keyFileName(draft.fingerprint)}>Download the key file</a>
        <button className="button button-quiet" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy the key'}</button>
      </div>
      <textarea className="backup-key-text" readOnly rows={7} value={draft.text} aria-label="Backup key" onFocus={(event) => event.target.select()} />
      <label className="backup-key-kept"><input type="checkbox" checked={kept} onChange={(event) => setKept(event.target.checked)} /><span>I've saved this key somewhere safe.</span></label>
      <div className="form-actions backup-key-actions">
        <button className="button button-primary" type="button" disabled={!kept || busy} onClick={start}>{phase === 'saving' ? 'Starting...' : <>{status?.key ? 'Use this key from now on' : 'Start the backups'} <span>→</span></>}</button>
        <button className="button button-quiet" type="button" disabled={busy} onClick={() => { setDraft(null); setProblem(''); }}>Throw this key away</button>
      </div>
    </div>}

    {status && !draft && <div className="form-actions"><button className={`button ${status.key ? 'button-quiet' : 'button-primary'}`} type="button" disabled={busy} onClick={make}>{phase === 'making' ? 'Making the key...' : status.key ? 'Replace the key' : <>Make the backup key <span>→</span></>}</button></div>}
    {problem && <p className="form-error" role="alert">{problem}</p>}
  </section>;
}
