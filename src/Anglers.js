import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import AnglerBestItem from './components/AnglerBestItem';

function AnglerCard({ profile, personalBests, isYou, onDelete, highlightBestId, highlightCommentId }) {
  const containsHighlight = personalBests.some((best) => best.id === highlightBestId);
  const [open, setOpen] = useState(containsHighlight);

  useEffect(() => {
    if (containsHighlight) setOpen(true);
  }, [containsHighlight]);

  return <article className={`angler-card ${isYou ? 'is-you' : ''} ${open ? 'is-open' : ''}`}>
    <button className="angler-card-head" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="avatar avatar-large">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || 'N').slice(0, 1).toUpperCase()}</span>
      <div>
        <strong>{profile.display_name || 'New angler'}</strong>
        <span className="muted-label">{profile.home_water || 'Home water unknown'}</span>
        {profile.favorite_species && <span className="angler-favorite">Chases {profile.favorite_species}</span>}
      </div>
      <span className="angler-best-count">{personalBests.length} PB{personalBests.length === 1 ? '' : 's'}</span>
      {isYou && <span className="status-badge">YOU</span>}
      <span className="expand-icon">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="angler-card-bests reveal-in">
      <div className="section-heading-mini"><span className="eyebrow">Personal bests</span></div>
      {personalBests.length === 0 && <div className="empty-state"><FishIllustration species="flounder" className="empty-state-sticker" /><p className="month-empty">No personal bests logged yet.</p></div>}
      {personalBests.map((best) => <AnglerBestItem
        key={best.id}
        best={best}
        profile={profile}
        anglerName={profile.display_name || 'An angler'}
        isOwner={isYou}
        onDelete={onDelete}
        highlighted={best.id === highlightBestId}
        highlightCommentId={best.id === highlightBestId ? highlightCommentId : null}
      />)}
    </div>}
  </article>;
}

export default function Anglers() {
  const { user, listAnglers, deletePersonalBest } = useAuth();
  const [roster, setRoster] = useState(null);
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const highlightBestId = searchParams.get('best');
  const highlightCommentId = searchParams.get('comment');

  async function handleDeleteBest(id) {
    const result = await deletePersonalBest(id);
    if (!result.error) setRoster((previous) => previous.map((entry) => entry.profile.id === user.id
      ? { ...entry, personalBests: entry.personalBests.filter((best) => best.id !== id) }
      : entry));
  }

  useEffect(() => {
    let active = true;
    listAnglers().then((data) => { if (active) setRoster(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    if (!roster) return [];
    const q = query.trim().toLowerCase();
    if (!q) return roster;
    return roster.filter(({ profile, personalBests }) =>
      profile.display_name?.toLowerCase().includes(q)
      || profile.home_water?.toLowerCase().includes(q)
      || profile.favorite_species?.toLowerCase().includes(q)
      || personalBests.some((best) => best.species.toLowerCase().includes(q)));
  }, [roster, query]);

  return <main className="content-shell anglers-page">
    <div className="page-intro" data-tour="anglers-intro">
      <div>
        <span className="eyebrow">THE CREW</span><h1>Know your rivals.</h1><p>Everyone's biggest fish by species. Tap an angler to see theirs, then go beat one.</p>
        <Link className="button button-quiet" to="/profile#personal-bests">Your personal bests <span>→</span></Link>
      </div>
      <FishIllustration species="bluegill" className="intro-sticker" />
    </div>
    <div className="angler-search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, water, or species..." /></div>
    {!roster && <p className="month-empty">Rounding up the crew...</p>}
    {roster && <div className="anglers-grid">
      {filtered.map(({ profile, personalBests }) => <AnglerCard
        key={profile.id}
        profile={profile}
        personalBests={personalBests}
        isYou={profile.id === user?.id}
        onDelete={handleDeleteBest}
        highlightBestId={highlightBestId}
        highlightCommentId={highlightCommentId}
      />)}
      {filtered.length === 0 && <p className="month-empty">Nobody matches that. Try a different name or water.</p>}
    </div>}
  </main>;
}
