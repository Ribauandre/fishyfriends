import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import FishIllustration from './FishIllustration';
import speciesIcon from '../utils/speciesOptions';
import timeAgo from '../utils/timeAgo';

function actionText(item) {
  if (item.kind === 'fish_year_catch') return `logged a ${item.species} for Fish Year`;
  if (item.kind === 'personal_best') return `logged a personal best${item.sizeLabel ? ` — ${item.sizeLabel}` : ''}`;
  if (item.kind === 'game_catch') return `landed a legendary ${item.species.toLowerCase()} in Cast & Catch${item.sizeLabel ? ` — ${item.sizeLabel}` : ''}`;
  return `entered a ${item.size}${item.unit} ${item.species} into ${item.tournamentName}`;
}

// Groups consecutive activity items (the feed is already newest-first) from the same
// angler into one bucket, so a bulk upload doesn't push everyone else's activity off
// screen with a wall of near-identical rows. "Consecutive" (not "same angler anywhere in
// the feed") keeps unrelated posts from the same person, made hours apart, as separate rows.
function groupActivity(activity) {
  const groups = [];
  for (const item of activity) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.userId === item.userId) lastGroup.items.push(item);
    else groups.push({ userId: item.userId, items: [item] });
  }
  return groups;
}

function ActivityRow({ item }) {
  return <Link className="activity-row" to={item.href}>
    <span className="mini-avatar activity-avatar">{item.avatarUrl ? <img src={item.avatarUrl} alt="" /> : item.anglerName.slice(0, 1).toUpperCase()}</span>
    <span className="activity-body">
      <span className="activity-text"><strong>{item.anglerName}</strong> {actionText(item)}</span>
      <span className="activity-time">{timeAgo(item.createdAt)}</span>
    </span>
    <span className="activity-thumb">
      {item.photoUrl ? <img src={item.photoUrl} alt="" /> : <FishIllustration species={speciesIcon(item.species)} />}
    </span>
  </Link>;
}

function ActivityGroup({ group }) {
  const [open, setOpen] = useState(false);
  if (group.items.length === 1) return <ActivityRow item={group.items[0]} />;

  const [first] = group.items;
  const extraCount = group.items.length - 1;
  return <div className={`activity-group ${open ? 'is-open' : ''}`}>
    <button type="button" className="activity-row activity-row-squashed" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span className="mini-avatar activity-avatar">{first.avatarUrl ? <img src={first.avatarUrl} alt="" /> : first.anglerName.slice(0, 1).toUpperCase()}</span>
      <span className="activity-body">
        <span className="activity-text"><strong>{first.anglerName}</strong> {actionText(first)} <span className="activity-more">and {extraCount} more</span></span>
        <span className="activity-time">{timeAgo(first.createdAt)}</span>
      </span>
      <span className="expand-icon">{open ? '−' : '+'}</span>
    </button>
    {open && <div className="activity-group-detail">
      {group.items.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} />)}
    </div>}
  </div>;
}

export default function ActivityFeed({ activity, loading }) {
  return <section className="table-card activity-section">
    <div className="section-heading">
      <div><span className="eyebrow">CREW ACTIVITY</span><h2>What's been happening</h2></div>
    </div>
    {loading && <p className="month-empty">Loading the feed...</p>}
    {!loading && activity.length === 0 && <div className="empty-state">
      <FishIllustration species="carp" className="empty-state-sticker" />
      <p className="month-empty">Nothing posted yet. Be the first — log a catch or a personal best.</p>
    </div>}
    {!loading && activity.length > 0 && <div className="activity-feed">
      {groupActivity(activity).map((group) => <ActivityGroup key={`${group.userId}-${group.items[0].kind}-${group.items[0].id}`} group={group} />)}
    </div>}
  </section>;
}
