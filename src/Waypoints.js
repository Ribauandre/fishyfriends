import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';

function CreateMapModal({ onClose, onCreated }) {
  const { createWaypointMap } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await createWaypointMap(form);
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onCreated(result.map);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">NEW MAP</span><h2>Create a waypoint map</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close create map form">×</button>
      </div>
      <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Backwater Striper Spots" /></label>
      <label>Description (optional)<textarea rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="What's this map for, and who should be on it?" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Create map'} <span>→</span></button></div>
    </form>
  </div>;
}

function WaypointMapCard({ map }) {
  return <Link className="waypoint-map-card" to={`/waypoints/${map.id}`}>
    <span className={map.isOwner ? 'status-badge' : 'status-badge status-badge-muted'}>{map.isOwner ? 'OWNER' : 'COLLABORATOR'}</span>
    <h3>{map.name}</h3>
    {map.description && <p>{map.description}</p>}
    <div className="waypoint-map-card-stats">
      <span>{map.waypointCount} waypoint{map.waypointCount === 1 ? '' : 's'}</span>
      <span>{map.memberCount} collaborator{map.memberCount === 1 ? '' : 's'}</span>
    </div>
    <span className="note-go">Open the map →</span>
  </Link>;
}

function InviteRow({ invite, onRespond }) {
  const [responding, setResponding] = useState(false);

  async function respond(accept) {
    setResponding(true);
    await onRespond(invite.id, accept);
    setResponding(false);
  }

  return <li className="waypoint-invite-row">
    <div className="waypoint-invite-info">
      <strong>{invite.inviterName}</strong> invited you to <strong>{invite.map_name}</strong>
    </div>
    <div className="waypoint-invite-actions">
      <button className="button button-primary" type="button" disabled={responding} onClick={() => respond(true)}>Accept</button>
      <button className="button button-quiet" type="button" disabled={responding} onClick={() => respond(false)}>Decline</button>
    </div>
  </li>;
}

export default function Waypoints() {
  const { listMyWaypointMaps, listMyWaypointInvites, respondToWaypointInvite } = useAuth();
  const [maps, setMaps] = useState(null);
  const [invites, setInvites] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    listMyWaypointMaps().then((data) => { if (active) setMaps(data); });
    listMyWaypointInvites().then((data) => { if (active) setInvites(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRespond(inviteId, accept) {
    const result = await respondToWaypointInvite(inviteId, accept);
    if (result.error) return;
    setInvites((previous) => previous.filter((invite) => invite.id !== inviteId));
    if (accept) listMyWaypointMaps().then(setMaps);
  }

  return <main className="content-shell waypoints-page">
    <div className="page-intro" data-tour="waypoints-intro">
      <div>
        <span className="eyebrow">PRIVATE BY DEFAULT</span>
        <h1>Waypoints</h1>
        <p>Import your GPX pins from Navionics or C-MAP, and invite only the crew you actually want reading them.</p>
        <button className="button button-primary" type="button" onClick={() => setShowForm(true)}>Create a map <span>＋</span></button>
      </div>
      <FishIllustration species="tarpon" className="intro-sticker" />
    </div>

    {invites.length > 0 && <section className="table-card waypoint-invites">
      <div className="section-heading"><div><span className="eyebrow">WAITING ON YOU</span><h2>Map invitations</h2></div></div>
      <ul className="waypoint-invite-list">
        {invites.map((invite) => <InviteRow key={invite.id} invite={invite} onRespond={handleRespond} />)}
      </ul>
    </section>}

    {maps === null && <p className="month-empty">Loading your maps...</p>}

    {maps !== null && maps.length === 0 && <div className="empty-state">
      <FishIllustration species="tarpon" className="empty-state-sticker" />
      <p className="month-empty">No waypoint maps yet. Create one and start dropping pins.</p>
    </div>}

    {maps !== null && maps.length > 0 && <div className="waypoint-maps-grid">
      {maps.map((map) => <WaypointMapCard key={map.id} map={map} />)}
    </div>}

    {showForm && <CreateMapModal onClose={() => setShowForm(false)} onCreated={(map) => navigate(`/waypoints/${map.id}`)} />}
  </main>;
}
