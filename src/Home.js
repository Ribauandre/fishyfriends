import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ActivityFeed from './components/ActivityFeed';
import FishingConditions from './components/FishingConditions';
import FishIllustration, { HERO_SPECIES } from './components/FishIllustration';
import { FISH_YEAR } from './constants';
import { licenseStatus } from './utils/licenseStatus';
import { homeAgenda } from './utils/homeAgenda';
import { localToday } from './components/TripFormModal';
import LogCatchModal from './components/LogCatchModal';

function randomHeroSpecies() {
  return HERO_SPECIES[Math.floor(Math.random() * HERO_SPECIES.length)];
}

// The feed scrolls now instead of being cut down to a handful of rows, so it can hold a
// much longer scrollback than it needs to show at once.
const ACTIVITY_LIMIT = 30;

// Combines the initial fetch with anything that's arrived live since, deduping by
// kind+id (a Map naturally overwrites on a repeat key) so it doesn't matter which of the
// two resolves first — re-sorting and re-trimming after every merge keeps the feed at its
// usual newest-ACTIVITY_LIMIT length even as live items land on top.
function mergeActivity(existing, incoming) {
  const byKey = new Map(existing.map((item) => [`${item.kind}-${item.id}`, item]));
  for (const item of incoming) byKey.set(`${item.kind}-${item.id}`, item);
  return [...byKey.values()].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, ACTIVITY_LIMIT);
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
  const { user, profile, listRecentActivity, subscribeToActivity, listFishYearCatches, listFishingLicenses, listMyWaypointInvites, listTrips, listTournaments, listTournamentEntries } = useAuth();
  const name = profile.display_name?.split(' ')[0] || 'angler';
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [fishYearCatches, setFishYearCatches] = useState([]);
  const [licenseAlerts, setLicenseAlerts] = useState([]);
  const [invites, setInvites] = useState([]);
  const [trips, setTrips] = useState([]);
  const [tournaments, setTournaments] = useState([]);
  const [myTournamentIds, setMyTournamentIds] = useState([]);
  const [logging, setLogging] = useState(false);
  const today = localToday();
  // Picked once per visit (not per render) so it doesn't reshuffle on every state update —
  // just varies from one trip to the dashboard to the next.
  const [heroSpecies] = useState(randomHeroSpecies);

  useEffect(() => {
    let active = true;
    listRecentActivity(ACTIVITY_LIMIT).then((data) => { if (active) { setActivity((previous) => mergeActivity(previous, data)); setActivityLoading(false); } });
    listFishYearCatches(FISH_YEAR).then((data) => { if (active) setFishYearCatches(data); });
    // A license reminder needs to reach the crew's landing page, not just wait for someone to
    // open Profile — this is the one place everyone signs in to first.
    listFishingLicenses().then((data) => {
      if (!active) return;
      setLicenseAlerts(data.map((license) => ({ license, ...licenseStatus(license.expires_at) })).filter((entry) => entry.status !== 'valid'));
    });
    listMyWaypointInvites().then((data) => { if (active) setInvites(data || []); });
    listTrips().then((data) => { if (active) setTrips(data || []); });
    listTournaments().then(async (data) => {
      if (!active) return;
      setTournaments(data || []);
      // Only the running ones matter here, and there are rarely more than a couple.
      const running = (data || []).filter((tournament) => tournament.starts_on <= today && today <= tournament.ends_on);
      const boards = await Promise.all(running.map((tournament) => listTournamentEntries(tournament.id)));
      if (active) setMyTournamentIds(running.filter((tournament, index) => (boards[index] || []).some((entry) => entry.user_id === user?.id)).map((tournament) => tournament.id));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const agenda = homeAgenda({ today, userId: user?.id, profile, fishYear: FISH_YEAR, myFishYearCatches: fishYearCatches.filter((row) => row.user_id === user?.id), invites, trips, tournaments, myTournamentIds });
  const dateLabel = new Date(`${today}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase();

  // Live-updates the feed the moment someone posts, via the same merge the initial fetch
  // above uses — so a catch that streams in before that fetch resolves isn't lost when it
  // finally does.
  useEffect(() => {
    const unsubscribe = subscribeToActivity((item) => setActivity((previous) => mergeActivity(previous, [item])));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <main className="content-shell home-page">{licenseAlerts.length > 0 && <Link to="/profile#licenses" className="license-reminder-banner">
    <span className="license-reminder-icon" aria-hidden="true">⚠</span>
    <p>{licenseAlerts.map((entry, index) => <React.Fragment key={entry.license.id}>{index > 0 ? ', ' : ''}<strong>{entry.license.state}</strong> license {entry.status === 'expired' ? 'has expired' : entry.label.toLowerCase()}</React.Fragment>)}</p>
    <span className="license-reminder-go">Manage licenses →</span>
  </Link>}<section className="welcome-banner"><div><span className="eyebrow">DOCK REPORT · {dateLabel}</span><ShakyHeadline text={`Look who dragged themselves in, ${name}.`} /><p>Somebody in this crew is about to beat your best fish this month. Don't let it be Kevin.</p><div className="hero-actions"><button className="button button-primary" type="button" onClick={() => setLogging(true)}>Log a catch <span>＋</span></button><Link className="button button-quiet" to="/fish-year">See the board <span>→</span></Link></div></div><div className="fishing-scene" aria-hidden="true"><FishIllustration species={heroSpecies} className="hero-sticker" /></div></section><section className="table-card home-agenda"><div className="section-heading"><div><span className="eyebrow">ON YOUR PLATE</span><h2>What needs you</h2></div></div>{agenda.length === 0 ? <p className="month-empty">You're all caught up. Go fishing.</p> : <ul className="home-agenda-list">{agenda.map((item) => <li key={item.key}>{item.action === 'log' ? <button type="button" className="home-agenda-item" onClick={() => setLogging(true)}><strong>{item.title}</strong><span>{item.detail}</span><em aria-hidden="true">＋</em></button> : <Link className="home-agenda-item" to={item.to}><strong>{item.title}</strong><span>{item.detail}</span><em aria-hidden="true">→</em></Link>}</li>)}</ul>}</section><FishingConditions /><ActivityFeed activity={activity} loading={activityLoading} />{logging && <LogCatchModal onClose={() => setLogging(false)} onLogged={(results) => { const logged = results.find((entry) => entry.key === 'fishYear'); if (logged) setFishYearCatches((previous) => [...previous, logged.result.catchEntry]); }} />}</main>;
}
