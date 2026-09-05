import * as React from 'react';
import kevinJan from '../assets/kevin/jan.jpeg';
import kevinFeb from '../assets/kevin/feb.jpeg';
import devinFeb from '../assets/devin/feb.jpeg';
import andresJan from '../assets/andres/jan.jpeg';
import paoloFeb from '../assets/paolo/feb.jpeg';
import paoloJan from '../assets/paolo/jan.jpeg';
import andreFeb from '../assets/andre/feb.jpeg';
import andresFeb from '../assets/andres/feb.jpeg';

type Entry = { name: string; species: string; date: string; month?: string; photo?: string };
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const entriesByMonth: Record<string, Entry[]> = {
  January: [{ name: 'Andres', species: 'Steelhead', date: '1/16', photo: andresJan }, { name: 'Kevin', species: 'Steelhead', date: '1/16', photo: kevinJan }, { name: 'Paolo', species: 'Steelhead', date: '1/17', photo: paoloJan }],
  February: [{ name: 'Devin', species: 'Snook', date: '2/13', photo: devinFeb }, { name: 'Andre', species: 'Atlantic Salmon', date: '2/15', photo: andreFeb }, { name: 'Kevin', species: 'Atlantic Salmon', date: '2/15', photo: kevinFeb }, { name: 'Paolo', species: 'Atlantic Salmon', date: '2/15', photo: paoloFeb }, { name: 'Andres', species: 'Brown Trout', date: '2/16', photo: andresFeb }],
};

function MonthDetail({ entries }: { entries: Entry[] }) {
  if (!entries.length) return <p className="month-empty">No catches logged yet. Be the first to add one.</p>;
  return <div className="month-catches">{entries.map((entry) => <MonthCatch key={`${entry.date}-${entry.name}-${entry.species}`} entry={entry} />)}</div>;
}

function MonthCatch({ entry }: { entry: Entry }) {
  const [liked, setLiked] = React.useState(false);
  const [imageOpen, setImageOpen] = React.useState(false);
  return <div className="month-catch"><div className="mini-avatar">{entry.name.slice(0, 1)}</div>{entry.photo && <button className="catch-image-button" type="button" onClick={() => setImageOpen(true)} aria-label={`Expand ${entry.name}'s catch photo`}><img src={entry.photo} alt={`${entry.name}'s ${entry.species}`} /></button>}<div><strong>{entry.name}</strong><span>{entry.species} · {entry.date}</span><button className={`like-button ${liked ? 'is-liked' : ''}`} type="button" onClick={() => setLiked(!liked)} aria-pressed={liked}><span>{liked ? '♥' : '♡'}</span>{liked ? 'Liked' : 'Like'} <small>{liked ? 1 : 0}</small></button></div>{imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${entry.name}'s catch photo`} onClick={() => setImageOpen(false)}><button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button><img src={entry.photo} alt={`${entry.name}'s expanded ${entry.species}`} onClick={(event) => event.stopPropagation()} /></div>}</div>;
}

function MonthCard({ month, index, entries }: { month: string; index: number; entries: Entry[] }) {
  const [open, setOpen] = React.useState(index < 2);
  return <div className={`month-card ${entries.length ? 'has-catches' : ''} ${open ? 'is-open' : ''}`}><button className="month-card-header" type="button" onClick={() => setOpen(!open)} aria-expanded={open}><span className="month-number">{String(index + 1).padStart(2, '0')}</span><span className="month-name"><strong>{month}</strong><small>{entries.length ? `${entries.length} catches logged` : 'Waiting for a catch'}</small></span><span className={`month-state ${entries.length ? 'complete' : ''}`}>{entries.length ? '✓' : '—'}</span><span className="expand-icon">{open ? '−' : '+'}</span></button>{open && <div className="month-card-detail"><MonthDetail entries={entries} /></div>}</div>;
}

export default function Participants({ newEntry }: { newEntry?: Entry }) {
  const [entries, setEntries] = React.useState(entriesByMonth);
  React.useEffect(() => {
    if (newEntry) setEntries((previous) => ({ ...previous, [newEntry.month || 'January']: [...(previous[newEntry.month || 'January'] || []), newEntry] }));
  }, [newEntry]);
  const currentParticipants = Array.from(new Set(Object.values(entries).flat().map((entry) => entry.name)));
  return <div className="participants-panel"><div className="participant-summary"><div><strong>{currentParticipants.length}</strong><span>active anglers</span></div><div><strong>{Object.values(entries).filter((monthEntries) => monthEntries.length).length.toString().padStart(2, '0')}</strong><span>months complete</span></div><div><strong>{12 - Object.values(entries).filter((monthEntries) => monthEntries.length).length}</strong><span>months ahead</span></div></div><div className="progress-board"><div className="progress-board-heading"><span className="eyebrow">MONTH-BY-MONTH</span><span className="muted-label">Tap a month to inspect catches</span></div><div className="months-grid">{months.map((month, index) => <MonthCard key={month} month={month} index={index} entries={entries[month] || []} />)}</div></div></div>;
}
