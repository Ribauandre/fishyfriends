import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import WaypointLeafletMap from './components/WaypointLeafletMap';
import parseGpx from './utils/parseGpx';

function NamePinModal({ lat, lng, onClose, onSaved }) {
  const { addWaypoint } = useAuth();
  const { mapId } = useParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', notes: '' });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await addWaypoint({ mapId, lat, lng, name: form.name, notes: form.notes });
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onSaved(result.waypoint);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">NEW PIN</span><h2>Name this waypoint</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close name waypoint form">×</button>
      </div>
      <p>{lat.toFixed(5)}, {lng.toFixed(5)}</p>
      <label>Name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Reef Spot" /></label>
      <label>Notes (optional)<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Good bite at dusk on the outgoing tide" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Drop the pin'} <span>→</span></button></div>
    </form>
  </div>;
}

function ImportGpxModal({ points, fileName, onClose, onImported }) {
  const { importWaypointsFromGpx } = useAuth();
  const { mapId } = useParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleConfirm() {
    setSaving(true); setError('');
    const result = await importWaypointsFromGpx({ mapId, points });
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onImported(result.waypoints);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">GPX IMPORT</span><h2>Import from {fileName}</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close GPX import">×</button>
      </div>
      <p>Found {points.length} waypoint{points.length === 1 ? '' : 's'} in this file. Add {points.length === 1 ? 'it' : 'them all'} to this map?</p>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button button-primary" type="button" onClick={handleConfirm} disabled={saving}>{saving ? 'Importing...' : `Import ${points.length}`} <span>→</span></button>
      </div>
    </div>
  </div>;
}

function InviteCollaboratorForm({ mapId, mapName, excludeUserIds, onInvited }) {
  const { listAnglers, inviteToWaypointMap } = useAuth();
  const [anglers, setAnglers] = useState([]);
  const [selected, setSelected] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listAnglers().then((data) => { if (active) setAnglers(data.map((entry) => entry.profile)); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const available = anglers.filter((angler) => !excludeUserIds.includes(angler.id));

  async function handleInvite(event) {
    event.preventDefault();
    if (!selected) return;
    setInviting(true); setError('');
    const result = await inviteToWaypointMap(mapId, mapName, selected);
    setInviting(false);
    if (result?.error) { setError(result.error.message); return; }
    setSelected('');
    onInvited(result.member);
  }

  if (!available.length) return <p className="month-empty">Everyone's already on this map or been invited.</p>;

  return <form className="waypoint-invite-form" onSubmit={handleInvite}>
    <select value={selected} onChange={(event) => setSelected(event.target.value)} aria-label="Angler to invite">
      <option value="" disabled>Choose an angler</option>
      {available.map((angler) => <option key={angler.id} value={angler.id}>{angler.display_name || 'New angler'}</option>)}
    </select>
    <button className="button button-quiet" type="submit" disabled={!selected || inviting}>{inviting ? 'Inviting...' : 'Invite'}</button>
    {error && <p className="form-error">{error}</p>}
  </form>;
}

function DeleteMapModal({ mapName, deleting, onCancel, onConfirm }) {
  return <div className="catch-modal-backdrop" role="presentation" onClick={onCancel}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">DELETE MAP</span><h2>Are you sure?</h2></div>
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Cancel deleting map">×</button>
      </div>
      <p>This deletes "{mapName}" along with every waypoint on it and removes every collaborator. This can't be undone.</p>
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button className="button button-danger" type="button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete map'}</button>
      </div>
    </div>
  </div>;
}

export default function WaypointDetail() {
  const { mapId } = useParams();
  const { user, getWaypointMap, listWaypoints, deleteWaypoint, listMapMembers, removeMapMember, deleteWaypointMap } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [map, setMap] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addingMode, setAddingMode] = useState(false);
  const [pendingPin, setPendingPin] = useState(null);
  const [gpxPreview, setGpxPreview] = useState(null);
  const [gpxFileName, setGpxFileName] = useState('');
  const [gpxError, setGpxError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getWaypointMap(mapId), listWaypoints(mapId), listMapMembers(mapId)]).then(([mapData, waypointData, memberData]) => {
      if (!active) return;
      setMap(mapData);
      setWaypoints(waypointData);
      setMembers(memberData);
      setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  function handleMapClick(lat, lng) {
    if (!addingMode) return;
    setPendingPin({ lat, lng });
    setAddingMode(false);
  }

  function handleGpxFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setGpxError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setGpxPreview(parseGpx(String(reader.result)));
        setGpxFileName(file.name);
      } catch (error) {
        setGpxError(error.message);
      }
    };
    reader.onerror = () => setGpxError("Couldn't read that file.");
    reader.readAsText(file);
  }

  async function handleDeleteWaypoint(id) {
    const result = await deleteWaypoint(id);
    if (!result.error) setWaypoints((previous) => previous.filter((waypoint) => waypoint.id !== id));
  }

  async function handleRemoveMember(memberId) {
    const result = await removeMapMember(memberId);
    if (!result.error) setMembers((previous) => previous.filter((member) => member.id !== memberId));
  }

  async function handleDeleteMap() {
    setDeleting(true);
    const result = await deleteWaypointMap(mapId);
    setDeleting(false);
    if (!result.error) navigate('/waypoints');
    else setConfirmingDelete(false);
  }

  if (loading) return <main className="content-shell waypoints-page"><p className="month-empty">Loading the map...</p></main>;

  if (!map) return <main className="content-shell waypoints-page">
    <p className="month-empty">That map doesn't exist, or you haven't been invited to it.</p>
    <Link className="text-link" to="/waypoints">← Back to your maps</Link>
  </main>;

  const excludeIds = [user?.id, ...members.map((member) => member.user_id)].filter(Boolean);

  return <main className="content-shell waypoints-page">
    <div className="page-intro challenge-intro">
      <div>
        <span className="eyebrow">{map.isOwner ? 'YOUR MAP' : 'SHARED WITH YOU'}</span>
        <h1>{map.name}</h1>
        {map.description && <p>{map.description}</p>}
      </div>
      <div className="challenge-actions">
        <button className={addingMode ? 'button button-primary' : 'button button-quiet'} type="button" onClick={() => setAddingMode((value) => !value)}>{addingMode ? 'Tap the map...' : 'Add a waypoint'} <span>＋</span></button>
        <button className="button button-quiet" type="button" onClick={() => fileInputRef.current?.click()}>Import GPX <span>↑</span></button>
        <input ref={fileInputRef} type="file" accept=".gpx" onChange={handleGpxFile} style={{ display: 'none' }} />
        <Link className="button button-quiet" to="/waypoints">All maps <span>→</span></Link>
      </div>
    </div>

    {gpxError && <p className="form-error">{gpxError}</p>}

    <section className="table-card waypoint-map-section">
      <WaypointLeafletMap waypoints={waypoints} onMapClick={handleMapClick} addingMode={addingMode} />
    </section>

    <section className="table-card">
      <div className="section-heading"><div><span className="eyebrow">PINS</span><h2>{waypoints.length} waypoint{waypoints.length === 1 ? '' : 's'}</h2></div></div>
      {waypoints.length === 0 && <p className="month-empty">No waypoints yet. Drop a pin or import a GPX file.</p>}
      {waypoints.length > 0 && <ul className="waypoint-list">
        {waypoints.map((waypoint) => <li key={waypoint.id} className="waypoint-row">
          <div className="waypoint-row-info">
            <strong>{waypoint.name}</strong>
            <span className="waypoint-row-coords">{waypoint.lat.toFixed(4)}, {waypoint.lng.toFixed(4)}</span>
            {waypoint.notes && <p>{waypoint.notes}</p>}
            <span className="muted-label">Added by {waypoint.created_by_name}{waypoint.source === 'gpx' ? ' · GPX import' : ''}</span>
          </div>
          {(waypoint.created_by === user?.id || map.isOwner) && <button className="license-remove" type="button" onClick={() => handleDeleteWaypoint(waypoint.id)} aria-label={`Delete ${waypoint.name}`}>×</button>}
        </li>)}
      </ul>}
    </section>

    <section className="table-card">
      <div className="section-heading"><div><span className="eyebrow">WHO CAN SEE THIS</span><h2>Collaborators</h2></div></div>
      <p>Nobody else can see this map until you invite them, and they've accepted.</p>
      <ul className="waypoint-member-list">
        {map.isOwner && <li className="waypoint-member-row"><span className="status-badge">OWNER</span><strong>You</strong></li>}
        {members.map((member) => <li key={member.id} className="waypoint-member-row">
          <span className={member.status === 'accepted' ? 'status-badge' : 'status-badge status-badge-muted'}>{member.status === 'accepted' ? 'ACCEPTED' : 'PENDING'}</span>
          <strong>{member.profile?.display_name || 'Angler'}</strong>
          {(map.isOwner || member.user_id === user?.id) && <button className="license-remove" type="button" onClick={() => handleRemoveMember(member.id)} aria-label={`Remove ${member.profile?.display_name || 'this angler'}`}>×</button>}
        </li>)}
      </ul>
      {map.isOwner && <InviteCollaboratorForm mapId={mapId} mapName={map.name} excludeUserIds={excludeIds} onInvited={(member) => setMembers((previous) => [...previous, member])} />}
    </section>

    {map.isOwner && <p className="tournament-danger-zone"><button type="button" className="button button-danger" onClick={() => setConfirmingDelete(true)}>Delete this map</button></p>}

    {pendingPin && <NamePinModal lat={pendingPin.lat} lng={pendingPin.lng} onClose={() => setPendingPin(null)} onSaved={(waypoint) => { setWaypoints((previous) => [...previous, waypoint]); setPendingPin(null); }} />}
    {gpxPreview && <ImportGpxModal points={gpxPreview} fileName={gpxFileName} onClose={() => setGpxPreview(null)} onImported={(imported) => { setWaypoints((previous) => [...previous, ...imported]); setGpxPreview(null); }} />}
    {confirmingDelete && <DeleteMapModal mapName={map.name} deleting={deleting} onCancel={() => setConfirmingDelete(false)} onConfirm={handleDeleteMap} />}
  </main>;
}
