import React, { useEffect, useRef, useState } from 'react';

export default function PostMenu({ shareData, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) { if (ref.current && !ref.current.contains(event.target)) setOpen(false); }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleShare() {
    if (navigator.share) {
      setOpen(false);
      try { await navigator.share(shareData); } catch { /* share sheet cancelled */ }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      setCopied(true);
      setTimeout(() => { setCopied(false); setOpen(false); }, 1400);
    }
  }

  return <div className="post-menu" ref={ref}>
    <button type="button" className="post-menu-trigger" onClick={() => setOpen((value) => !value)} aria-haspopup="true" aria-expanded={open} aria-label="More options">⋯</button>
    {open && <div className="post-menu-dropdown" role="menu">
      <button type="button" role="menuitem" onClick={handleShare}>{copied ? 'Copied!' : 'Share'}</button>
      {onDelete && <button type="button" role="menuitem" className="post-menu-danger" onClick={() => { setOpen(false); onDelete(); }}>Delete</button>}
    </div>}
  </div>;
}
