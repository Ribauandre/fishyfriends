import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import WaypointLeafletMap from './components/WaypointLeafletMap';
import parseGpx from './utils/parseGpx';
import parseKml from './utils/parseKml';
import { fetchMyMapsPoints } from './utils/googleMyMaps';

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

const SOURCE_LABELS = { gpx: 'GPX import', kml: 'KML import' };

function ImportPointsModal({ preview, onClose, onImported }) {
  const { importWaypoints } = useAuth();
  const { mapId } = useParams();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { points, label, source, skipped } = preview;

  async function handleConfirm() {
    setSaving(true); setError('');
    const result = await importWaypoints({ mapId, points, source });
    setSaving(false);
    if (result?.error) { setError(result.error.message); return; }
    onImported(result.waypoints);
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">{source.toUpperCase()} IMPORT</span><h2>Import from {label}</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close import">×</button>
      </div>
      <p>Found {points.length} waypoint{points.length === 1 ? '' : 's'}. Add {points.length === 1 ? 'it' : 'them all'} to this map?</p>
      {skipped > 0 && <p className="muted-label">{skipped} line{skipped === 1 ? '' : 's'} or shape{skipped === 1 ? '' : 's'} skipped: only pins can be waypoints.</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button button-primary" type="button" onClick={handleConfirm} disabled={saving}>{saving ? 'Importing...' : `Import ${points.length}`} <span>→</span></button>
      </div>
    </div>
  </div>;
}

function MyMapsLinkModal({ onClose, onFound }) {
  const [link, setLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true); setError('');
    try {
      const { title, points, skipped } = await fetchMyMapsPoints(link);
      onFound({ points, skipped, source: 'kml', label: title ? `"${title}"` : 'Google My Maps' });
    } catch (fetchError) {
      setError(fetchError.message);
      setLoading(false);
    }
  }

  return <div className="catch-modal-backdrop" role="presentation" onClick={onClose}>
    <form className="catch-modal" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">GOOGLE MY MAPS</span><h2>Import pins from a map</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close Google My Maps import">×</button>
      </div>
      <p>Paste the map's link. It has to be shared as "Anyone with this link can view". Or export it from My Maps as KML and use Import file instead.</p>
      <label>Map link<input required type="url" inputMode="url" value={link} onChange={(event) => setLink(event.target.value)} placeholder="https://www.google.com/maps/d/edit?mid=..." /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={loading}>{loading ? 'Reading the map...' : 'Find pins'} <span>→</span></button></div>
    </form>
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
    // The inserted row carries no profile; attach the one just picked so the name shows.
    onInvited({ ...result.member, profile: anglers.find((angler) => angler.id === selected) || null });
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
  const [importPreview, setImportPreview] = useState(null);
  const [importError, setImportError] = useState('');
  const [showMyMaps, setShowMyMaps] = useState(false);
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

  function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportError('');
    const isKml = file.name.toLowerCase().endsWith('.kml');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        const parsed = isKml ? parseKml(text) : { points: parseGpx(text), skipped: 0 };
        setImportPreview({ points: parsed.points, skipped: parsed.skipped, source: isKml ? 'kml' : 'gpx', label: file.name });
      } catch (error) {
        setImportError(error.message);
      }
    };
    reader.onerror = () => setImportError("Couldn't read that file.");
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
        <button className="button button-quiet" type="button" onClick={() => fileInputRef.current?.click()}>Import file <span>↑</span></button>
        <input ref={fileInputRef} type="file" accept=".gpx,.kml" onChange={handleImportFile} style={{ display: 'none' }} aria-label="GPX or KML file" />
        <button className="button button-quiet" type="button" onClick={() => setShowMyMaps(true)}>Google My Maps <span>↓</span></button>
        <Link className="button button-quiet" to="/waypoints">All maps <span>→</span></Link>
      </div>
    </div>

    {importError && <p className="form-error">{importError}</p>}

    <section className="table-card waypoint-map-section">
      <WaypointLeafletMap waypoints={waypoints} onMapClick={handleMapClick} addingMode={addingMode} />
    </section>

    <section className="table-card">
      <div className="section-heading"><div><span className="eyebrow">PINS</span><h2>{waypoints.length} waypoint{waypoints.length === 1 ? '' : 's'}</h2></div></div>
      {waypoints.length === 0 && <p className="month-empty">No waypoints yet. Drop a pin, import a GPX or KML file, or pull in a Google My Maps map.</p>}
      {waypoints.length > 0 && <ul className="waypoint-list">
        {waypoints.map((waypoint) => <li key={waypoint.id} className="waypoint-row">
          <div className="waypoint-row-info">
            <strong>{waypoint.name}</strong>
            <span className="waypoint-row-coords">{waypoint.lat.toFixed(4)}, {waypoint.lng.toFixed(4)}</span>
            {waypoint.notes && <p>{waypoint.notes}</p>}
            <span className="muted-label">Added by {waypoint.created_by_name}{SOURCE_LABELS[waypoint.source] ? ` · ${SOURCE_LABELS[waypoint.source]}` : ''}</span>
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
    {showMyMaps && <MyMapsLinkModal onClose={() => setShowMyMaps(false)} onFound={(preview) => { setShowMyMaps(false); setImportPreview(preview); }} />}
    {importPreview && <ImportPointsModal preview={importPreview} onClose={() => setImportPreview(null)} onImported={(imported) => { setWaypoints((previous) => [...previous, ...imported]); setImportPreview(null); }} />}
    {confirmingDelete && <DeleteMapModal mapName={map.name} deleting={deleting} onCancel={() => setConfirmingDelete(false)} onConfirm={handleDeleteMap} />}
  </main>;
}
