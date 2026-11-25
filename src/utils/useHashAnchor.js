import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

// For a section other pages link straight to (/admin#backups). The sections above it load
// after it mounts and push it down the page, so it is scrolled to once it is `ready` — its
// own content is in — rather than on mount. Returns the ref to put on the section.
export default function useHashAnchor(id, ready = true) {
  const { hash } = useLocation();
  const box = useRef(null);
  useEffect(() => {
    if (ready && hash === `#${id}`) box.current?.scrollIntoView({ block: 'start' });
  }, [hash, id, ready]);
  return box;
}
