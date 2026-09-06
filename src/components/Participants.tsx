import * as React from 'react';
import CommentThread from './CommentThread';
import FishIllustration from './FishIllustration';
import speciesIcon from '../utils/speciesOptions';

type Catch = { id: string; user_id: string; angler_name: string; month: string; species: string; caught_at: string | null; photo_url: string };
type Comment = { id: string; author_name: string; body: string };
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function MonthDetail({ entries }: { entries: Catch[] }) {
  if (!entries.length) return <p className="month-empty">No catches yet. Somebody's gotta break the ice.</p>;
  return <div className="month-catches">{entries.map((entry) => <MonthCatch key={entry.id} entry={entry} />)}</div>;
}

function MonthCatch({ entry }: { entry: Catch }) {
  const [liked, setLiked] = React.useState(false);
  const [imageOpen, setImageOpen] = React.useState(false);
  const [comments, setComments] = React.useState<Comment[]>([]);
  async function handleAddComment(body: string) {
    setComments((previous) => [...previous, { id: `c-${Date.now()}`, author_name: 'You', body }]);
    return { error: null };
  }
  return <div className="catch-card">
    <button className="catch-card-media" type="button" onClick={() => entry.photo_url && setImageOpen(true)} aria-label={entry.photo_url ? `Expand ${entry.angler_name}'s catch photo` : `${entry.angler_name} caught a ${entry.species}, no photo yet`}>
      {entry.photo_url ? <img src={entry.photo_url} alt={`${entry.angler_name}'s ${entry.species}`} /> : <span className="catch-card-placeholder"><FishIllustration species={speciesIcon(entry.species)} /></span>}
      <span className="catch-card-species">{entry.species}</span>
    </button>
    <div className="catch-card-caption">
      <span className="mini-avatar">{entry.angler_name.slice(0, 1)}</span>
      <div><strong>{entry.angler_name}</strong><span>{entry.caught_at || ''}</span></div>
    </div>
    <div className="catch-card-actions">
      <button className={`like-button ${liked ? 'is-liked' : ''}`} type="button" onClick={() => setLiked(!liked)} aria-pressed={liked}><span>{liked ? '♥' : '♡'}</span>{liked ? 'Liked' : 'Like'} <small>{liked ? 1 : 0}</small></button>
      <CommentThread comments={comments} loading={false} onAdd={handleAddComment} />
    </div>
    {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${entry.angler_name}'s catch photo`} onClick={() => setImageOpen(false)}><button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button><img src={entry.photo_url} alt={`${entry.angler_name}'s expanded ${entry.species}`} onClick={(event) => event.stopPropagation()} /></div>}
  </div>;
}

function MonthCard({ month, index, entries }: { month: string; index: number; entries: Catch[] }) {
  const [open, setOpen] = React.useState(index < 2);
  return <div className={`month-card ${entries.length ? 'has-catches' : ''} ${open ? 'is-open' : ''}`}><button className="month-card-header" type="button" onClick={() => setOpen(!open)} aria-expanded={open}><span className="month-number">{String(index + 1).padStart(2, '0')}</span><span className="month-name"><strong>{month}</strong><small>{entries.length ? `${entries.length} catches logged` : 'Waiting for a catch'}</small></span><span className={`month-state ${entries.length ? 'complete' : ''}`}>{entries.length ? '✓' : '—'}</span><span className="expand-icon">{open ? '−' : '+'}</span></button>{open && <div className="month-card-detail"><MonthDetail entries={entries} /></div>}</div>;
}

export default function Participants({ catches }: { catches: Catch[] }) {
  const entries = React.useMemo(() => {
    const grouped: Record<string, Catch[]> = {};
    for (const entry of catches) grouped[entry.month] = [...(grouped[entry.month] || []), entry];
    return grouped;
  }, [catches]);
  const currentParticipants = Array.from(new Set(catches.map((entry) => entry.angler_name)));
  return <div className="participants-panel"><div className="participant-summary"><div><strong>{currentParticipants.length}</strong><span>active anglers</span></div><div><strong>{Object.values(entries).filter((monthEntries) => monthEntries.length).length.toString().padStart(2, '0')}</strong><span>months complete</span></div><div><strong>{12 - Object.values(entries).filter((monthEntries) => monthEntries.length).length}</strong><span>months ahead</span></div></div><div className="progress-board"><div className="progress-board-heading"><span className="eyebrow">MONTH-BY-MONTH</span><span className="muted-label">Tap a month to inspect catches</span></div><div className="months-grid">{months.map((month, index) => <MonthCard key={month} month={month} index={index} entries={entries[month] || []} />)}</div></div></div>;
}
