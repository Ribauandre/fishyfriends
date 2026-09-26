import React, { useEffect, useState } from 'react';
import { applyUpdate, onUpdateReady } from '../utils/appUpdate';

export default function UpdateBanner() {
  const [registration, setRegistration] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => onUpdateReady(setRegistration), []);

  if (!registration) return null;
  return <div className="update-banner" role="status">
    <span>A new version of Fishy Friends is ready.</span>
    <button type="button" className="button button-primary" disabled={applying} onClick={() => { setApplying(true); applyUpdate(registration); }}>{applying ? 'Updating...' : 'Refresh'}</button>
  </div>;
}
