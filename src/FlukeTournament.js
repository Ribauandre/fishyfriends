import React from 'react';
import Leaderboard from "./components/Leaderboard.tsx";
import { Link } from 'react-router-dom';

export default function FlukeTournament() {
  return <main className="content-shell challenge-page"><div className="page-intro tournament-intro"><div><span className="eyebrow">ARCHIVE · 2025 SEASON</span><h1>Fluke Tournament</h1><p>Big fish, friendly rivalry, and one very good tape measure photo.</p></div><div className="winner-stamp" data-tour="tournament-highlight"><span>WINNER</span><strong>20<span>in</span></strong><small>Andre · 07/16</small></div></div><section className="table-card tournament-board"><div className="section-heading"><div><span className="eyebrow">FINAL RESULTS</span><h2>Last season's bragging rights</h2></div><Link className="text-link" to="/fish-year">See current challenge ↗</Link></div><Leaderboard /></section><section className="rules-strip rules-grid"><div><span className="rule-index">RULES / 01</span><p>Photo must show the fluke AND the tape measure — Photoshop doesn't count.</p></div><div><span className="rule-index">RULES / 02</span><p>Catch it during NJ's open fluke season, May 4–Sept 25. The fish don't care about your excuses.</p></div></section></main>;
}
