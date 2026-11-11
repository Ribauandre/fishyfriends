import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// One transparent pixel: holds the image's box (the class sizes it) until the link arrives.
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';

// A photo somebody uploaded — an avatar, a catch. Every one in the app goes through here
// rather than a bare <img>, because the address in the database is not what gets requested:
// it is swapped for a signed link (utils/photoLinks.js), so the photo buckets can be private.
// If a link can't be had it tries the stored address, which still works while the buckets
// are open, and after that shows `fallback` (or nothing) instead of a broken image. An
// address that isn't in this project's storage is never requested at all.
function PhotoImage({ src, alt = '', fallback = null, onLoad, links, ...rest }) {
  const kind = links ? links.kind(src) : 'plain';
  const [view, setView] = useState(() => {
    if (kind === 'foreign') return { stage: 'failed', url: '' };
    if (kind !== 'stored') return { stage: 'plain', url: src };
    const cached = links.peek(src);
    return cached ? { stage: 'signed', url: cached } : { stage: 'waiting', url: BLANK };
  });

  useEffect(() => {
    if (view.stage !== 'waiting' && view.stage !== 'renewing') return undefined;
    let live = true;
    links.resolve(src).then((signed) => {
      if (!live) return;
      setView(signed ? { stage: view.stage === 'renewing' ? 'renewed' : 'signed', url: signed } : { stage: 'stored', url: src });
    });
    return () => { live = false; };
  }, [view.stage, links, src]);

  function handleError() {
    if (view.stage === 'signed') {
      // The link may have run out, or the file was replaced under it: ask for a new one, once.
      links.forget(src);
      setView({ stage: 'renewing', url: BLANK });
    } else if (view.stage === 'renewed') {
      setView({ stage: 'stored', url: src });
    } else if (view.stage === 'stored' || view.stage === 'plain') {
      if (fallback !== null || view.stage === 'stored') setView({ stage: 'failed', url: '' });
    }
  }

  if (view.stage === 'failed') return fallback;
  const settled = view.url !== BLANK;
  return <img {...rest} src={view.url} alt={alt} data-photo={settled ? undefined : 'loading'} onLoad={settled ? onLoad : undefined} onError={handleError} />;
}

export default function Photo(props) {
  const links = useAuth()?.photoLinks || null;
  // Keyed by the address so a different photo starts over instead of inheriting this one's state.
  return <PhotoImage key={props.src} links={links} {...props} />;
}
