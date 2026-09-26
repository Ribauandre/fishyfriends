import React, { useState } from 'react';
import { messagesUrl, tripShareText, tripUrl } from '../utils/tripShare';

// Share a trip to the group chat: straight into Messages with the details written out, or
// through the phone's share sheet (or, where there isn't one, by copying the link).
export default function TripShare({ trip, perPersonCents, spotsLeft }) {
  const [copied, setCopied] = useState(false);
  const text = tripShareText(trip, { perPersonCents, spotsLeft });
  const url = tripUrl(window.location.origin, trip.id);

  async function handleShare() {
    if (navigator.share) {
      try { await navigator.share({ title: trip.name, text, url }); } catch { /* share sheet closed */ }
      return;
    }
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  return <>
    <a className="button button-quiet trip-share-messages" href={messagesUrl(text, url)}>Text it to the crew <span aria-hidden="true">✉</span></a>
    <button className="button button-quiet" type="button" onClick={handleShare}>{copied ? 'Link copied' : 'Share'} <span aria-hidden="true">↗</span></button>
  </>;
}
