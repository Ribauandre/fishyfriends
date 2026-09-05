import * as React from 'react';
import placeholderFluke from '../assets/cartoon-flounder-isolated-on-white-vector-46294379.jpg';
import firstPlace from '../assets/andre/IMG_7938.jpeg';
import secondPlace from '../assets/andres/IMG_7920.jpeg';

type LeaderboardRow = { place: number; name: string; size: number; date: string; photo: string };

const rows: LeaderboardRow[] = [
  { place: 1, name: 'Andre', size: 20, date: '07/16', photo: firstPlace },
  { place: 2, name: 'Andres', size: 19.5, date: '07/16', photo: secondPlace },
  { place: 3, name: 'Kevin', size: 18.25, date: '08/02', photo: placeholderFluke },
];

function LeaderboardRowItem({ row }: { row: LeaderboardRow }) {
  const [open, setOpen] = React.useState(row.place === 1);
  const [liked, setLiked] = React.useState(false);
  const [imageOpen, setImageOpen] = React.useState(false);
  return (
    <div className={`leaderboard-entry ${open ? 'is-open' : ''}`}>
      <button className="leaderboard-row" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`place place-${row.place}`}>{row.place === 1 ? '01' : row.place === 2 ? '02' : '03'}</span>
        <span className="rank-name"><strong>{row.name}</strong><small>{row.place === 1 ? 'Champion' : 'Finalist'}</small></span>
        <span className="rank-size"><strong>{row.size}</strong><small>inches</small></span>
        <span className="rank-date">{row.date}</span>
        <span className="expand-icon">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="leaderboard-detail"><button className="catch-image-button" type="button" onClick={() => setImageOpen(true)} aria-label={`Expand ${row.name}'s catch photo`}><img src={row.photo} alt={`${row.name}'s ${row.size}-inch fluke`} /></button><div><span className="eyebrow">CATCH PROOF</span><h3>{row.name}'s tournament catch</h3><p>{row.size}-inch fluke recorded on {row.date}, during the 2025 NJ season.</p><button className={`like-button ${liked ? 'is-liked' : ''}`} type="button" onClick={() => setLiked(!liked)} aria-pressed={liked}><span>{liked ? '♥' : '♡'}</span>{liked ? 'Liked' : 'Like catch'} <small>{liked ? 1 : 0}</small></button></div></div>}
      {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${row.name}'s catch photo`} onClick={() => setImageOpen(false)}><button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button><img src={row.photo} alt={`${row.name}'s expanded ${row.size}-inch fluke`} onClick={(event) => event.stopPropagation()} /></div>}
    </div>
  );
}

export default function Leaderboard() {
  return <div className="leaderboard-panel"><div className="leaderboard-labels"><span>RANK / ANGLER</span><span>LENGTH</span><span>DATE</span></div>{rows.map((row) => <LeaderboardRowItem key={row.name} row={row} />)}</div>;
}
