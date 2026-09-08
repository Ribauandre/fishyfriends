import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import LikeButton from './components/LikeButton';
import PersonalBestComments from './components/PersonalBestComments';
import PersonalBestForm from './components/PersonalBestForm';
import PostMenu from './components/PostMenu';
import SpeciesChecklist from './components/SpeciesChecklist';
import iconFor from './utils/speciesOptions';

function AnglerBestItem({ best, profile, anglerName, isOwner, onDelete, highlighted }) {
  const [imageOpen, setImageOpen] = useState(false);
  const ref = useRef(null);

  function scrollToSelf() {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  useEffect(() => {
    if (highlighted) scrollToSelf();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlighted]);

  return <div className={`angler-best ${highlighted ? 'is-shared-highlight' : ''}`} ref={ref}>
    <PostMenu
      shareData={{ title: `${anglerName}'s ${best.species}`, text: `${anglerName}'s ${best.species}${best.size_label ? ` — ${best.size_label}` : ''} on Fishy Friends.`, url: `${window.location.origin}/anglers?best=${best.id}` }}
      onDelete={isOwner ? () => onDelete(best.id) : undefined}
    />
    <button className="angler-best-media" type="button" onClick={() => best.photo_url && setImageOpen(true)} aria-label={best.photo_url ? `Expand ${anglerName}'s ${best.species} photo` : `${anglerName}'s ${best.species}, no photo yet`}>
      {best.photo_url
        ? <img className="angler-best-photo" src={best.photo_url} alt={`${profile.display_name}'s ${best.species}`} onLoad={() => { if (highlighted) scrollToSelf(); }} />
        : <FishIllustration species={iconFor(best.species)} className="angler-best-fish" />}
    </button>
    <div>
      <span className="personal-best-tag">Personal best</span>
      <strong>{best.species}</strong>
      <span>{best.size_label || 'size unknown'}{best.caught_at ? ` · ${best.caught_at}` : ''}</span>
      <LikeButton targetType="personal_best" targetId={best.id} ownerId={profile.id} />
      <PersonalBestComments personalBestId={best.id} ownerId={profile.id} />
    </div>
    {imageOpen && <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`${anglerName}'s ${best.species} photo`} onClick={() => setImageOpen(false)}>
      <button className="lightbox-close" type="button" onClick={() => setImageOpen(false)} aria-label="Close expanded image">×</button>
      <img src={best.photo_url} alt={`${profile.display_name}'s expanded ${best.species}`} onClick={(event) => event.stopPropagation()} />
    </div>}
  </div>;
}

function AnglerCard({ profile, personalBests, isYou, onDelete, highlightBestId }) {
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
    {open && <div className="angler-card-bests">
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
      />)}
    </div>}
  </article>;
}

export default function Anglers() {
  const { user, listAnglers, deletePersonalBest, uploadPersonalBest } = useAuth();
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

  async function handleSaveBest(payload) {
    const result = await uploadPersonalBest(payload);
    if (!result.error && result.bestEntry) {
      setRoster((previous) => previous.map((entry) => {
        if (entry.profile.id !== user.id) return entry;
        const existingIndex = entry.personalBests.findIndex((best) => best.id === result.bestEntry.id);
        const personalBests = existingIndex === -1
          ? [...entry.personalBests, result.bestEntry]
          : entry.personalBests.map((best) => (best.id === result.bestEntry.id ? result.bestEntry : best));
        return { ...entry, personalBests };
      }));
    }
    return result;
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

  const yourBests = roster?.find((entry) => entry.profile.id === user?.id)?.personalBests || [];

  return <main className="content-shell anglers-page">
    <div className="page-intro" data-tour="anglers-intro">
      <div><span className="eyebrow">THE CREW</span><h1>Know your rivals.</h1><p>Everyone's biggest fish by species — log yours below, then go pick a fight.</p></div>
      <FishIllustration species="bluegill" className="intro-sticker" />
    </div>
    <section className="table-card personal-bests-panel">
      <div className="section-heading"><div><span className="eyebrow">YOUR BESTS</span><h2>Log a new personal best</h2></div></div>
      <PersonalBestForm onSave={handleSaveBest} />
    </section>
    <SpeciesChecklist personalBests={yourBests} />
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
      />)}
      {filtered.length === 0 && <p className="month-empty">Nobody matches that. Try a different name or water.</p>}
    </div>}
  </main>;
}
