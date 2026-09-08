import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ActivityFeed from './components/ActivityFeed';
import FishIllustration, { HERO_SPECIES } from './components/FishIllustration';

function randomHeroSpecies() {
  return HERO_SPECIES[Math.floor(Math.random() * HERO_SPECIES.length)];
}

// Splits the headline into per-letter spans so the impact shake can stagger across them left
// to right instead of moving the whole line as one block. Words stay glued together (via
// .shake-word) so lines still wrap at spaces, not mid-word. The visible spans are decorative
// (aria-hidden); the real h1 text comes from aria-label so screen readers hear one sentence.
function ShakyHeadline({ text }) {
  let letterIndex = 0;
  // eslint-disable-next-line jsx-a11y/heading-has-content
  return <h1 aria-label={text}><span aria-hidden="true">{text.split(' ').map((word, wordIndex) => <React.Fragment key={wordIndex}>{wordIndex > 0 ? ' ' : ''}<span className="shake-word">{word.split('').map((letter) => {
    const delay = (0.27 + letterIndex * 0.012).toFixed(3);
    letterIndex += 1;
    return <span className="shake-letter" key={letterIndex} style={{ animationDelay: `${delay}s` }}>{letter}</span>;
  })}</span></React.Fragment>)}</span></h1>;
}

export default function Home() {
  const { profile, listRecentActivity } = useAuth();
  const name = profile.display_name?.split(' ')[0] || 'angler';
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  // Picked once per visit (not per render) so it doesn't reshuffle on every state update —
  // just varies from one trip to the dashboard to the next.
  const [heroSpecies] = useState(randomHeroSpecies);

  useEffect(() => {
    let active = true;
    listRecentActivity().then((data) => { if (active) { setActivity(data); setActivityLoading(false); } });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <main className="content-shell home-page"><section className="welcome-banner"><div><span className="eyebrow">DOCK REPORT · SEPT 5</span><ShakyHeadline text={`Look who dragged themselves in, ${name}.`} /><p>Somebody in this crew is about to beat your best fish this month. Don't let it be Kevin.</p><div className="hero-actions"><Link className="button button-primary" to="/fish-year">Log this month <span>→</span></Link><Link className="button button-quiet" to="/anglers">Post a personal best <span>→</span></Link></div></div><div className="fishing-scene" aria-hidden="true"><FishIllustration species={heroSpecies} className="hero-sticker" /></div></section><ActivityFeed activity={activity} loading={activityLoading} /><section className="dock-notes"><div className="section-heading"><div><span className="eyebrow">CREW LOG</span><h2>What you've been slacking on</h2></div></div><div className="notes-board"><Link className="note-card note-card-one" to="/profile"><span className="note-pin" /><strong>Your profile's a ghost town</strong><p>Tell the crew your home water before they assume you fish from a bathtub.</p><span className="note-go">Fix it →</span></Link><Link className="note-card note-card-two" to="/fish-year"><span className="note-pin" /><strong>You haven't peeked at the board</strong><p>See who's ahead on Fish Year before someone starts talking trash about you.</p><span className="note-go">Take a look →</span></Link></div></section></main>;
}
