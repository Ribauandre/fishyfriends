import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from './FishIllustration';
import LikeButton from './LikeButton';
import PostMenu from './PostMenu';
import TournamentEntryComments from './TournamentEntryComments';
import speciesIcon from '../utils/speciesOptions';

function TournamentEntryRow({ entry, place, unit, tournamentId, currentUserId, onDelete, highlighted }) {
  const [open, setOpen] = useState(Boolean(highlighted));
  const [imageOpen, setImageOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (highlighted) { setOpen(true); ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  }, [highlighted]);

  return <div className={`leaderboard-entry ${highlighted ? 'is-shared-highlight' : ''}`} ref={ref}>
    <button className="leaderboard-row" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className={`place place-${place}`}>{String(place).padStart(2, '0')}</span>
      <span className="rank-name"><strong>{entry.angler_name}</strong><small>{entry.species}</small></span>
      <span className="rank-size"><strong>{entry.size}</strong><small>{unit === 'lb' ? 'lbs' : 'inches'}</small></span>
      <span className="rank-date">{entry.caught_at || ''}</span>
      <span className="expand-icon">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="leaderboard-detail">
      <PostMenu
        shareData={{ title: `${entry.angler_name}'s ${entry.species}`, text: `${entry.angler_name} entered a ${entry.size}${unit} ${entry.species} into the tournament.`, url: `${window.location.origin}/tournaments/${tournamentId}?entry=${entry.id}` }}
        onDelete={currentUserId && entry.user_id === currentUserId ? () => onDelete(entry.id) : undefined}
      />
      <button className="catch-image-button" type="button" onClick={() => entry.photo_url && setImageOpen(true)} aria-label={entry.photo_url ? `Expand ${entry.angler_name}'s catch photo` : `${entry.angler_name}'s ${entry.species}, no photo yet`}>
        {entry.photo_url ? <img src={entry.photo_url} alt={`${entry.angler_name}'s ${entry.species}`} /> : <FishIllustration species={speciesIcon(entry.species)} />}
      </button>
      <div>
        <span className="eyebrow">CATCH PROOF</span>
        <h3>{entry.angler_name}'s entry</h3>
        <p>{entry.size} {unit === 'lb' ? 'lbs' : 'inches'} of {entry.species}{entry.caught_at ? `, logged ${entry.caught_at}` : ''}.</p>
        <LikeButton targetType="tournament_entry" targetId={entry.id} ownerId={entry.user_id} />
        <TournamentEntryComments entryId={entry.id} ownerId={entry.user_id} defaultOpen={highlighted} />
      </div>
    </div>}
    {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${entry.angler_name}'s catch photo`} onClick={() => setImageOpen(false)}>
      <button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button>
      <img src={entry.photo_url} alt={`${entry.angler_name}'s expanded ${entry.species}`} onClick={(event) => event.stopPropagation()} />
    </div>}
  </div>;
}

export default function TournamentEntries({ entries, unit, tournamentId, currentUserId, onDelete, highlightId }) {
  if (!entries.length) return <div className="empty-state"><FishIllustration species="flounder" className="empty-state-sticker" /><p className="month-empty">No entries yet. Somebody's gotta break the ice.</p></div>;
  return <div className="leaderboard-panel">
    <div className="leaderboard-labels"><span>RANK / ANGLER</span><span>SIZE</span><span>DATE</span></div>
    {entries.map((entry, index) => <TournamentEntryRow
      key={entry.id}
      entry={entry}
      place={index + 1}
      unit={unit}
      tournamentId={tournamentId}
      currentUserId={currentUserId}
      onDelete={onDelete}
      highlighted={entry.id === highlightId}
    />)}
  </div>;
}
