import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// Who's bringing what. Anyone on the trip adds items and claims them; a claimed item shows
// who has it, and only they can let it go.
export default function TripPackingList({ tripId, isCreator }) {
  const { user, listTripItems, addTripItem, setTripItemClaim, deleteTripItem } = useAuth();
  const [items, setItems] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    listTripItems(tripId).then((rows) => { if (active) setItems(rows); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const replace = (item) => setItems((previous) => previous.map((existing) => (existing.id === item.id ? item : existing)));

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    const result = await addTripItem({ tripId, name });
    if (result.error) { setError(result.error.message); return; }
    setName('');
    setItems((previous) => [...previous, result.item]);
  }

  async function handleClaim(item, claim) {
    setError('');
    const result = await setTripItemClaim(item.id, claim);
    if (result.error) { setError(result.error.message); return; }
    replace(result.item);
  }

  async function handleDelete(item) {
    const result = await deleteTripItem(item.id);
    if (!result.error) setItems((previous) => previous.filter((existing) => existing.id !== item.id));
  }

  const unclaimed = (items || []).filter((item) => !item.claimed_by).length;

  return <section className="table-card trip-packing">
    <div className="section-heading">
      <div><span className="eyebrow">WHO'S BRINGING WHAT</span><h2>Packing list</h2></div>
      {items?.length > 0 && <span className={unclaimed ? 'status-badge status-badge-muted' : 'status-badge'}>{unclaimed ? `${unclaimed} UNCLAIMED` : 'ALL COVERED'}</span>}
    </div>
    {items === null && <p className="muted-label">Loading...</p>}
    {items?.length === 0 && <p className="muted-label">Nothing on the list yet. Add the cooler, the boat, the bait...</p>}
    {items?.length > 0 && <ul className="trip-item-list">
      {items.map((item) => <li key={item.id} className={item.claimed_by ? 'is-claimed' : ''}>
        <div><strong>{item.name}</strong><span className="muted-label">{item.claimed_by ? `${item.claimed_by === user?.id ? 'You' : item.claimed_by_name} ${item.claimed_by === user?.id ? 'are' : 'is'} bringing it` : 'Nobody yet'}</span></div>
        {!item.claimed_by && <button className="button button-quiet" type="button" onClick={() => handleClaim(item, true)}>I'll bring it</button>}
        {item.claimed_by === user?.id && <button className="button button-quiet" type="button" onClick={() => handleClaim(item, false)}>Never mind</button>}
        {(item.created_by === user?.id || isCreator) && <button className="license-remove" type="button" onClick={() => handleDelete(item)} aria-label={`Remove ${item.name} from the list`}>×</button>}
      </li>)}
    </ul>}
    <form className="trip-item-form" onSubmit={handleAdd}>
      <input aria-label="Item to add" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Cooler, bucket of bunker, the boat..." />
      <button className="button button-quiet" type="submit">Add</button>
    </form>
    {error && <p className="form-error">{error}</p>}
  </section>;
}
