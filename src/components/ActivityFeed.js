import React from 'react';
import { Link } from 'react-router-dom';
import FishIllustration from './FishIllustration';
import speciesIcon from '../utils/speciesOptions';
import timeAgo from '../utils/timeAgo';

function actionText(item) {
  if (item.kind === 'fish_year_catch') return `logged a ${item.species} for Fish Year`;
  if (item.kind === 'personal_best') return `logged a personal best${item.sizeLabel ? ` — ${item.sizeLabel}` : ''}`;
  return `entered a ${item.size}${item.unit} ${item.species} into ${item.tournamentName}`;
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
      {activity.map((item) => <ActivityRow key={`${item.kind}-${item.id}`} item={item} />)}
    </div>}
  </section>;
}
