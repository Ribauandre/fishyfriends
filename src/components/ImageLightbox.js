import { createPortal } from 'react-dom';

// A photo opened full screen. It renders into <body>, not where it was opened: inside a card it
// was trapped in the card's own stacking context (z-index: 1), so the top bar painted over its
// close button and took the tap, and inside a panel still holding its reveal animation's
// transform it was a "full-screen" box the size of the panel. Its padding keeps the photo and
// the close button clear of the status bar and the home indicator in the installed app.
export default function ImageLightbox({ src, alt, label, onClose }) {
  return createPortal(<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
    <button className="lightbox-close" type="button" onClick={(event) => { event.stopPropagation(); onClose(); }} aria-label="Close expanded image">×</button>
    <img src={src} alt={alt} onClick={(event) => event.stopPropagation()} />
  </div>, document.body);
}
