import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from './FishIllustration';
import LikeButton from './LikeButton';
import PersonalBestComments from './PersonalBestComments';
import PostMenu from './PostMenu';
import iconFor from '../utils/speciesOptions';

// One personal best: photo (or the species art), size and date, likes and comments. Used on
// an angler's card on Crew and in your own bests on Profile; a shared link or a notification
// highlights it and scrolls it into view.
export default function AnglerBestItem({ best, profile, anglerName, isOwner, onDelete, highlighted, highlightCommentId }) {
  const [imageOpen, setImageOpen] = useState(false);
  const ref = useRef(null);

  function scrollToSelf() {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  useEffect(() => {
    if (highlighted) scrollToSelf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  return <div className={`angler-best ${highlighted ? 'is-shared-highlight' : ''}`} ref={ref}>
    <PostMenu
      shareData={{ title: `${anglerName}'s ${best.species}`, text: `${anglerName}'s ${best.species}${best.size_label ? ` — ${best.size_label}` : ''} on Fishy Friends.`, url: `${window.location.origin}/anglers?best=${best.id}` }}
      onDelete={isOwner ? () => onDelete(best.id) : undefined}
    />
    <button className="angler-best-media" type="button" onClick={() => best.photo_url && setImageOpen(true)} aria-label={best.photo_url ? `Expand ${anglerName}'s ${best.species} photo` : `${anglerName}'s ${best.species}, no photo yet`}>
      {best.photo_url
        ? <img className="angler-best-photo" src={best.photo_url} alt={`${profile.display_name}'s ${best.species}`} onLoad={() => { if (highlighted) scrollToSelf(); }} />
        : <FishIllustration species={iconFor(best.species)} className="angler-best-fish" />}
    </button>
    <div>
      <span className="personal-best-tag">Personal best</span>
      <strong>{best.species}</strong>
      <span>{best.size_label || 'size unknown'}{best.caught_at ? ` · ${best.caught_at}` : ''}</span>
      <LikeButton targetType="personal_best" targetId={best.id} ownerId={profile.id} />
      <PersonalBestComments personalBestId={best.id} ownerId={profile.id} defaultOpen={highlighted} highlightCommentId={highlightCommentId} />
    </div>
    {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${anglerName}'s ${best.species} photo`} onClick={() => setImageOpen(false)}>
      <button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button>
      <img src={best.photo_url} alt={`${profile.display_name}'s expanded ${best.species}`} onClick={(event) => event.stopPropagation()} />
    </div>}
  </div>;
}
