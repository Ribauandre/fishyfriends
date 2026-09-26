import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import TripFormModal from './components/TripFormModal';
import TripPackingList from './components/TripPackingList';
import TripCatches from './components/TripCatches';
import TripShare from './components/TripShare';
import PayOptions from './components/PayOptions';
import speciesIcon from './utils/speciesOptions';
import { balances, formatCents, parseDollars, perPersonCents, rsvpClosed, settleUp, splitRoster, totalCents } from './utils/tripMath';

function AddExpenseForm({ tripId, notifyUserIds, onAdded }) {
  const { addTripExpense } = useAuth();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    const amountCents = parseDollars(amount);
    if (!amountCents) { setError('Enter an amount like 85 or 85.50.'); return; }
    setSaving(true); setError('');
    const result = await addTripExpense({ tripId, description, amountCents, notifyUserIds });
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setDescription(''); setAmount('');
    onAdded(result.expense);
  }

  return <form className="trip-expense-form" onSubmit={handleSubmit}>
    <input aria-label="What it was for" required value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Charter deposit" />
    <input aria-label="Amount you paid" required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="$600" />
    <button className="button button-quiet" type="submit" disabled={saving}>{saving ? 'Adding...' : 'I paid this'}</button>
    {error && <p className="form-error">{error}</p>}
  </form>;
}

function DeleteTripModal({ tripName, deleting, onCancel, onConfirm }) {
  return <div className="catch-modal-backdrop" role="presentation" onClick={onCancel}>
    <div className="catch-modal" onClick={(event) => event.stopPropagation()}>
      <div className="section-heading">
        <div><span className="eyebrow">DELETE TRIP</span><h2>Are you sure?</h2></div>
        <button className="modal-close" type="button" onClick={onCancel} aria-label="Cancel deleting trip">×</button>
      </div>
      <p>This deletes "{tripName}" with everyone's RSVP, every expense and every payment recorded on it. This can't be undone.</p>
      <div className="form-actions">
        <button className="button button-quiet" type="button" onClick={onCancel} disabled={deleting}>Cancel</button>
        <button className="button button-danger" type="button" onClick={onConfirm} disabled={deleting}>{deleting ? 'Deleting...' : 'Delete trip'}</button>
      </div>
    </div>
  </div>;
}

export default function TripDetail() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const {
    user, getTrip, updateTrip, deleteTrip, listTripAttendees, joinTrip, leaveTrip, removeTripAttendee,
    listTripExpenses, deleteTripExpense, listTripSettlements, recordTripSettlement, deleteTripSettlement,
    listVenmoHandles, listPaymentContacts,
  } = useAuth();

  const [trip, setTrip] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [venmo, setVenmo] = useState({});
  const [payContacts, setPayContacts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Expenses and payments are only readable by people on the trip, so they're (re)loaded
  // whenever that changes rather than once with the trip.
  const loadMoney = useCallback(async (peopleIds) => {
    const [expenseRows, settlementRows] = await Promise.all([listTripExpenses(tripId), listTripSettlements(tripId)]);
    setExpenses(expenseRows);
    setSettlements(settlementRows);
    const people = [...new Set([...peopleIds, ...expenseRows.map((e) => e.paid_by)])];
    const [handles, contacts] = await Promise.all([listVenmoHandles(people), listPaymentContacts(people)]);
    setVenmo(handles);
    setPayContacts(contacts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getTrip(tripId), listTripAttendees(tripId)]).then(async ([tripData, attendeeRows]) => {
      if (!active) return;
      setTrip(tripData);
      setAttendees(attendeeRows);
      const member = tripData && (tripData.created_by === user?.id || attendeeRows.some((a) => a.user_id === user?.id));
      if (member) await loadMoney(attendeeRows.map((a) => a.user_id));
      if (active) setLoading(false);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (loading) return <main className="content-shell trips-page"><p className="month-empty">Loading the trip...</p></main>;
  if (!trip) return <main className="content-shell trips-page">
    <p className="month-empty">That trip doesn't exist anymore.</p>
    <Link className="text-link" to="/trips">← Back to trips</Link>
  </main>;

  const isCreator = trip.created_by === user?.id;
  const { going, waitlist } = splitRoster(attendees, trip.max_spots);
  const myAttendance = attendees.find((a) => a.user_id === user?.id);
  const isMember = isCreator || Boolean(myAttendance);
  const imWaitlisted = waitlist.some((a) => a.user_id === user?.id);
  const full = trip.max_spots && going.length >= trip.max_spots;
  const balanceList = balances({ going, expenses, settlements });
  const transfers = settleUp(balanceList);
  const myBalance = balanceList.find((b) => b.userId === user?.id)?.cents || 0;
  const closed = rsvpClosed(trip);

  async function handleJoin() {
    setBusy(true);
    const result = await joinTrip(trip.id, { creatorId: trip.created_by, tripName: trip.name });
    if (!result.error) {
      setAttendees((previous) => [...previous, result.attendee]);
      await loadMoney([...attendees.map((a) => a.user_id), user.id]);
    }
    setBusy(false);
  }

  async function handleLeave() {
    setBusy(true);
    const result = await leaveTrip(trip.id);
    if (!result.error) {
      setAttendees((previous) => previous.filter((a) => a.user_id !== user.id));
      setExpenses([]); setSettlements([]);
    }
    setBusy(false);
  }

  async function handleRemove(attendee) {
    const result = await removeTripAttendee(attendee.id);
    if (!result.error) setAttendees((previous) => previous.filter((a) => a.id !== attendee.id));
  }

  async function handleSave(form) {
    const result = await updateTrip(trip.id, form);
    if (!result.error) { setTrip(result.trip); setEditing(false); }
    return result;
  }

  async function handleDeleteExpense(id) {
    const result = await deleteTripExpense(id);
    if (!result.error) setExpenses((previous) => previous.filter((e) => e.id !== id));
  }

  async function handleMarkPaid(transfer) {
    const result = await recordTripSettlement({ tripId: trip.id, from: transfer.from, to: transfer.to, amountCents: transfer.cents });
    if (!result.error) setSettlements((previous) => [...previous, result.settlement]);
  }

  async function handleUndoPayment(id) {
    const result = await deleteTripSettlement(id);
    if (!result.error) setSettlements((previous) => previous.filter((s) => s.id !== id));
  }

  async function handleDeleteTrip() {
    setDeleting(true);
    const result = await deleteTrip(trip.id);
    setDeleting(false);
    if (!result.error) navigate('/trips');
    else setConfirmingDelete(false);
  }

  const dates = trip.starts_on === trip.ends_on ? trip.starts_on : `${trip.starts_on} — ${trip.ends_on}`;
  const total = totalCents(expenses);

  return <main className="content-shell trips-page">
    <div className="page-intro challenge-intro">
      <div>
        <span className="eyebrow">{isCreator ? 'YOUR TRIP' : `PLANNED BY ${trip.created_by_name.toUpperCase()}`}</span>
        <h1>{trip.name}</h1>
        <p>{dates}{trip.location ? ` · ${trip.location}` : ''}{trip.state ? ` · ${trip.state}` : ''}</p>
        {trip.rsvp_by && <p className={closed ? 'trip-rsvp is-closed' : 'trip-rsvp'}>{closed ? `RSVPs closed ${trip.rsvp_by}` : `RSVP by ${trip.rsvp_by}`}</p>}
      </div>
      <div className="challenge-actions">
        {!myAttendance && (!closed || isCreator) && <button className="button button-primary" type="button" onClick={handleJoin} disabled={busy}>{full ? 'Join the waitlist' : "I'm in"} <span>＋</span></button>}
        {myAttendance && !isCreator && <button className="button button-quiet" type="button" onClick={handleLeave} disabled={busy}>{imWaitlisted ? 'Leave the waitlist' : "I can't make it"}</button>}
        {isCreator && <button className="button button-quiet" type="button" onClick={() => setEditing(true)}>Edit trip</button>}
        <TripShare trip={trip} perPersonCents={isMember ? perPersonCents(expenses, going.length) : 0} spotsLeft={trip.max_spots ? Math.max(trip.max_spots - going.length, 0) : null} />
        <Link className="button button-quiet" to="/trips">All trips <span>→</span></Link>
      </div>
    </div>

    <div className="trip-layout">
      <section className="table-card">
        <div className="section-heading"><div><span className="eyebrow">THE PLAN</span><h2>What we're after</h2></div></div>
        {trip.target_species?.length > 0
          ? <ul className="trip-target-species">{trip.target_species.map((species) => <li key={species}><FishIllustration species={speciesIcon(species)} /><span>{species}</span></li>)}</ul>
          : <p className="muted-label">No target species set.</p>}
        <h3 className="trip-subheading">Where we're staying</h3>
        {trip.accommodation || trip.accommodation_url
          ? <p className="trip-accommodation">
            {trip.accommodation || 'Booking'}
            {trip.accommodation_url && <> · <a className="text-link" href={trip.accommodation_url} target="_blank" rel="noopener noreferrer">View listing ↗</a></>}
          </p>
          : <p className="muted-label">Not booked yet.</p>}
        {trip.notes && <><h3 className="trip-subheading">Notes</h3><p className="trip-notes">{trip.notes}</p></>}
      </section>

      <section className="table-card">
        <div className="section-heading">
          <div><span className="eyebrow">WHO'S IN</span><h2>{going.length}{trip.max_spots ? ` of ${trip.max_spots}` : ''} going</h2></div>
        </div>
        <ol className="trip-roster">
          {going.map((attendee) => <li key={attendee.id}>
            <strong>{attendee.angler_name}</strong>
            {attendee.user_id === trip.created_by && <span className="status-badge">ORGANIZER</span>}
            {isCreator && attendee.user_id !== user.id && <button className="license-remove" type="button" onClick={() => handleRemove(attendee)} aria-label={`Remove ${attendee.angler_name}`}>×</button>}
          </li>)}
        </ol>
        {going.length === 0 && <p className="muted-label">Nobody's in yet.</p>}
        {waitlist.length > 0 && <>
          <h3 className="trip-subheading">Waitlist</h3>
          <ol className="trip-roster trip-roster-waitlist">
            {waitlist.map((attendee) => <li key={attendee.id}>
              <strong>{attendee.angler_name}</strong>
              {isCreator && <button className="license-remove" type="button" onClick={() => handleRemove(attendee)} aria-label={`Remove ${attendee.angler_name}`}>×</button>}
            </li>)}
          </ol>
          <p className="muted-label">If someone drops out, the next person on the waitlist moves up.</p>
        </>}
      </section>
    </div>

    <section className="table-card trip-money">
      <div className="section-heading"><div><span className="eyebrow">SPLIT EVENLY</span><h2>Expenses</h2></div></div>
      {!isMember && <p className="month-empty">Join the trip to see and add expenses.</p>}
      {isMember && <>
        <div className="trip-money-summary">
          <div><span className="muted-label">Total</span><strong>{formatCents(total)}</strong></div>
          <div><span className="muted-label">Per person ({going.length} going)</span><strong>{formatCents(perPersonCents(expenses, going.length))}</strong></div>
          <div>
            <span className="muted-label">You</span>
            <strong className={myBalance < 0 ? 'trip-owe' : ''}>{myBalance < 0 ? `owe ${formatCents(-myBalance)}` : myBalance > 0 ? `are owed ${formatCents(myBalance)}` : 'are square'}</strong>
          </div>
        </div>

        {expenses.length > 0 && <ul className="trip-expense-list">
          {expenses.map((expense) => <li key={expense.id}>
            <div><strong>{expense.description}</strong><span className="muted-label">Paid by {expense.paid_by_name}</span></div>
            <span className="trip-expense-amount">{formatCents(expense.amount_cents)}</span>
            {(expense.paid_by === user?.id || isCreator) && <button className="license-remove" type="button" onClick={() => handleDeleteExpense(expense.id)} aria-label={`Delete ${expense.description}`}>×</button>}
          </li>)}
        </ul>}
        <AddExpenseForm tripId={trip.id} notifyUserIds={going.map((a) => a.user_id)} onAdded={(expense) => setExpenses((previous) => [...previous, expense])} />

        <h3 className="trip-subheading">Settle up</h3>
        {transfers.length === 0
          ? <p className="muted-label">{expenses.length ? "Everyone's square." : 'Nothing to settle yet.'}</p>
          : <ul className="trip-transfer-list">
            {transfers.map((transfer) => <li key={`${transfer.from.userId}-${transfer.to.userId}`}>
              <span><strong>{transfer.from.name}</strong> pays <strong>{transfer.to.name}</strong> {formatCents(transfer.cents)}</span>
              <span className="trip-transfer-actions">
                {transfer.from.userId === user?.id && <PayOptions transfer={transfer} tripName={trip.name} venmoHandle={venmo[transfer.to.userId]} contacts={payContacts[transfer.to.userId]} />}
                {[transfer.from.userId, transfer.to.userId].includes(user?.id) && <button className="button button-quiet" type="button" onClick={() => handleMarkPaid(transfer)}>Mark paid</button>}
              </span>
            </li>)}
          </ul>}

        {myBalance > 0 && !venmo[user?.id] && !payContacts[user?.id]?.zelle && !payContacts[user?.id]?.appleCashPhone && <p className="muted-label">Add Venmo, Zelle or Apple Cash on your <Link className="text-link" to="/profile#getting-paid">Profile</Link> so people can pay you back.</p>}

        {settlements.length > 0 && <>
          <h3 className="trip-subheading">Payments</h3>
          <ul className="trip-transfer-list trip-payments">
            {settlements.map((settlement) => <li key={settlement.id}>
              <span>{settlement.from_name} paid {settlement.to_name} {formatCents(settlement.amount_cents)}</span>
              {(settlement.created_by === user?.id || isCreator) && <button className="license-remove" type="button" onClick={() => handleUndoPayment(settlement.id)} aria-label={`Undo ${settlement.from_name}'s payment`}>×</button>}
            </li>)}
          </ul>
        </>}
      </>}
    </section>

    {isMember && <TripPackingList tripId={trip.id} isCreator={isCreator} />}

    <TripCatches trip={trip} canLog={Boolean(myAttendance)} isCreator={isCreator} />

    {isCreator && <p className="tournament-danger-zone"><button type="button" className="button button-danger" onClick={() => setConfirmingDelete(true)}>Delete this trip</button></p>}

    {editing && <TripFormModal trip={trip} onSave={handleSave} onClose={() => setEditing(false)} />}
    {confirmingDelete && <DeleteTripModal tripName={trip.name} deleting={deleting} onCancel={() => setConfirmingDelete(false)} onConfirm={handleDeleteTrip} />}
  </main>;
}
