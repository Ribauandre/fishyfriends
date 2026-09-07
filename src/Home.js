import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration, { HERO_SPECIES } from './components/FishIllustration';
import { FISH_YEAR } from './constants';

function randomHeroSpecies() {
  return HERO_SPECIES[Math.floor(Math.random() * HERO_SPECIES.length)];
}

export default function Home() {
  const { user, profile, listFishYearCatches } = useAuth();
  const name = profile.display_name?.split(' ')[0] || 'angler';
  const [monthsLogged, setMonthsLogged] = useState(0);
  // Picked once per visit (not per render) so it doesn't reshuffle on every state update —
  // just varies from one trip to the dashboard to the next.
  const [heroSpecies] = useState(randomHeroSpecies);

  useEffect(() => {
    let active = true;
    listFishYearCatches(FISH_YEAR).then((catches) => {
      if (!active) return;
      const caughtMonths = new Set(catches.filter((entry) => entry.user_id === user?.id).map((entry) => entry.month));
      setMonthsLogged(caughtMonths.size);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  return <main className="content-shell home-page"><section className="welcome-banner"><div><span className="eyebrow">DOCK REPORT · SEPT 5</span><h1>Look who dragged themselves in, {name}.</h1><p>Somebody in this crew is about to beat your best fish this month. Don't let it be Kevin.</p><div className="hero-actions"><Link className="button button-primary" to="/fish-year">Log this month <span>→</span></Link><Link className="text-link" to="/profile">Still ghosting your profile? ↗</Link></div></div><div className="fishing-scene" aria-hidden="true"><FishIllustration species={heroSpecies} className="hero-sticker" /></div></section><section className="dashboard-grid"><article className="feature-card feature-card-dark" data-tour="fish-year-card"><div className="card-topline"><span className="eyebrow">LIVE SEASON</span><span className="status-badge">OPEN</span></div><h2>Fish Year<br /><em>2026</em></h2><p>One fish a month, no excuses. Don't be the guy who skips April.</p><div className="tally-row" aria-hidden="true">{Array.from({ length: 12 }).map((_, index) => <span key={index} className={index < monthsLogged ? 'tally-filled' : 'tally-empty'} />)}</div><div className="card-footer"><span>{monthsLogged} / 12 months logged</span><Link to="/fish-year">See where you stand →</Link></div></article><article className="feature-card feature-card-light"><div className="card-topline"><span className="eyebrow">LAST SEASON</span><span className="card-icon">↗</span></div><h2>Fluke<br /><em>Tournament</em></h2><p>Andre's still rubbing his 20-inch fluke in everyone's face. Somebody dethrone him.</p><div className="card-footer"><span>20 in · 1st place</span><Link to="/fluke-tournament">Come see the proof →</Link></div></article></section><section className="dock-notes"><div className="section-heading"><div><span className="eyebrow">CREW LOG</span><h2>What you've been slacking on</h2></div></div><div className="notes-board"><Link className="note-card note-card-one" to="/profile"><span className="note-pin" /><strong>Your profile's a ghost town</strong><p>Tell the crew your home water before they assume you fish from a bathtub.</p><span className="note-go">Fix it →</span></Link><Link className="note-card note-card-two" to="/fish-year"><span className="note-pin" /><strong>You haven't peeked at the board</strong><p>See who's ahead on Fish Year before someone starts talking trash about you.</p><span className="note-go">Take a look →</span></Link></div></section></main>;
}
