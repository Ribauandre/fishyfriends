import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import PersonalBestComments from './components/PersonalBestComments';
import PostMenu from './components/PostMenu';
import iconFor from './utils/speciesOptions';

function AnglerBestItem({ best, profile, anglerName, isOwner, onDelete, highlighted }) {
  const ref = useRef(null);
  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);
  return <div className={`angler-best ${highlighted ? 'is-shared-highlight' : ''}`} ref={ref}>
    <PostMenu
      shareData={{ title: `${anglerName}'s ${best.species}`, text: `${anglerName}'s ${best.species}${best.size_label ? ` — ${best.size_label}` : ''} on Fishy Friends.`, url: `${window.location.origin}/anglers?best=${best.id}` }}
      onDelete={isOwner ? () => onDelete(best.id) : undefined}
    />
    {best.photo_url ? <img className="angler-best-photo" src={best.photo_url} alt={`${profile.display_name}'s ${best.species}`} /> : <FishIllustration species={iconFor(best.species)} className="angler-best-fish" />}
    <div><strong>{best.species}</strong><span>{best.size_label || 'size unknown'}{best.caught_at ? ` · ${best.caught_at}` : ''}</span><PersonalBestComments personalBestId={best.id} /></div>
  </div>;
}

export default function Anglers() {
  const { user, listAnglers, deletePersonalBest } = useAuth();
  const [roster, setRoster] = useState(null);
  const [query, setQuery] = useState('');
  const [searchParams] = useSearchParams();
  const highlightBestId = searchParams.get('best');

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
    <div className="page-intro">
      <div><span className="eyebrow">THE CREW</span><h1>Know your rivals.</h1><p>Look anyone up, see their water, and find out exactly whose personal best you need to beat.</p></div>
    </div>
    <div className="angler-search"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, water, or species..." /></div>
    {!roster && <p className="month-empty">Rounding up the crew...</p>}
    {roster && <div className="anglers-grid">
      {filtered.map(({ profile, personalBests }) => <article className={`angler-card ${profile.id === user?.id ? 'is-you' : ''}`} key={profile.id}>
        <div className="angler-card-head">
          <span className="avatar avatar-large">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || 'N').slice(0, 1).toUpperCase()}</span>
          <div><strong>{profile.display_name || 'New angler'}</strong><span className="muted-label">{profile.home_water || 'Home water unknown'}</span></div>
          {profile.id === user?.id && <span className="status-badge">YOU</span>}
        </div>
        {profile.favorite_species && <span className="angler-favorite">Chases {profile.favorite_species}</span>}
        <div className="angler-bests">
          {personalBests.length === 0 && <p className="month-empty">No personal bests logged yet.</p>}
          {personalBests.map((best) => <AnglerBestItem
            key={best.id}
            best={best}
            profile={profile}
            anglerName={profile.display_name || 'An angler'}
            isOwner={profile.id === user?.id}
            onDelete={handleDeleteBest}
            highlighted={best.id === highlightBestId}
          />)}
        </div>
      </article>)}
      {filtered.length === 0 && <p className="month-empty">Nobody matches that. Try a different name or water.</p>}
    </div>}
  </main>;
}
