import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const megabytes = (bytes) => `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;

// The admin's clean-up for photos stored before uploads stripped their metadata: phones
// stamp a photo with where it was taken, and some of those are still on file. Every photo
// is read, has its metadata cut out (the picture itself is not touched), and is written
// back in the same place. Safe to run again: a photo that is already clean is left alone.
export default function PhotoPrivacySection() {
  const { listStoredPhotos, cleanStoredPhoto } = useAuth();
  const [phase, setPhase] = useState('idle');
  const [photos, setPhotos] = useState([]);
  const [counts, setCounts] = useState({ done: 0, cleaned: 0, clean: 0, unreadable: 0, failed: 0 });

  async function look() {
    setPhase('listing');
    const found = await listStoredPhotos();
    setPhotos(found);
    setPhase('listed');
  }

  async function clean() {
    setPhase('cleaning');
    const tally = { done: 0, cleaned: 0, clean: 0, unreadable: 0, failed: 0 };
    setCounts({ ...tally });
    for (const photo of photos) {
      // One at a time: these can be several megabytes each, and it is a phone doing it.
      // eslint-disable-next-line no-await-in-loop
      const outcome = await cleanStoredPhoto(photo);
      tally.done += 1;
      tally[outcome] = (tally[outcome] || 0) + 1;
      setCounts({ ...tally });
    }
    setPhase('done');
  }

  const totalBytes = photos.reduce((sum, photo) => sum + (photo.size || 0), 0);
  return <section className="table-card photo-privacy" aria-label="Photo privacy">
    <div className="section-heading"><div><span className="eyebrow">PHOTO PRIVACY</span><h2>Location data in stored photos</h2></div></div>
    <p className="month-empty">Phones stamp a photo with where it was taken. New uploads have that removed before they leave the phone; this checks the photos already stored and removes it from those too. The pictures themselves don't change.</p>
    {phase === 'idle' && <div className="form-actions"><button className="button button-primary" type="button" onClick={look}>Check stored photos <span>→</span></button></div>}
    {phase === 'listing' && <p className="month-empty" role="status">Counting photos...</p>}
    {phase === 'listed' && (photos.length === 0
      ? <p className="month-empty" role="status">No stored photos found.</p>
      : <>
        <p className="month-empty" role="status">{photos.length} photo{photos.length === 1 ? '' : 's'} to go through, about {megabytes(totalBytes)} to download and check. Best done on Wi-Fi, with this page left open.</p>
        <div className="form-actions"><button className="button button-primary" type="button" onClick={clean}>Remove location data <span>→</span></button></div>
      </>)}
    {phase === 'cleaning' && <p className="month-empty" role="status">Checked {counts.done} of {photos.length}... keep this page open.</p>}
    {phase === 'done' && <>
      <p className="month-empty" role="status">Checked {counts.done} photo{counts.done === 1 ? '' : 's'}: {counts.cleaned} cleaned, {counts.clean} already clean{counts.unreadable ? `, ${counts.unreadable} not a photo this can read` : ''}{counts.failed ? `, ${counts.failed} couldn't be saved` : ''}.</p>
      {counts.failed > 0 && <div className="form-actions"><button className="button button-quiet" type="button" onClick={look}>Try again</button></div>}
    </>}
  </section>;
}
