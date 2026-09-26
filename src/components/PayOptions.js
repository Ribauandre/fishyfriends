import React, { useState } from 'react';
import { venmoPayUrl } from '../utils/venmo';
import { appleCashMessageUrl, displayZelle } from '../utils/payContacts';
import { formatCents } from '../utils/tripMath';

function CopyButton({ text, label }) {
  const [state, setState] = useState('idle');
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch (error) {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 1800);
  }
  return <button className="button button-quiet trip-copy" type="button" onClick={handleCopy} aria-label={`Copy ${label}`}>
    {state === 'copied' ? 'Copied' : state === 'failed' ? 'Hold to copy' : 'Copy'}
  </button>;
}

// How the payer can send this one: Venmo fills the payment in; Zelle can't, so its details
// are laid out to copy into a bank app; Apple Cash is sent from a Messages thread.
export default function PayOptions({ transfer, tripName, venmoHandle, contacts }) {
  const [showZelle, setShowZelle] = useState(false);
  const amount = (transfer.cents / 100).toFixed(2);
  return <>
    {venmoHandle && <a className="button button-primary" href={venmoPayUrl(venmoHandle, transfer.cents, `${tripName}: trip share`)} target="_blank" rel="noopener noreferrer">Pay on Venmo</a>}
    {contacts?.zelle && <button className="button button-quiet" type="button" aria-expanded={showZelle} onClick={() => setShowZelle((open) => !open)}>Zelle</button>}
    {contacts?.appleCashPhone && <a className="button button-quiet" href={appleCashMessageUrl(contacts.appleCashPhone, transfer.cents, tripName)}>Apple Cash</a>}
    {showZelle && <span className="trip-zelle">
      <span>Zelle {transfer.to.name} at <strong>{displayZelle(contacts.zelle)}</strong> <CopyButton text={displayZelle(contacts.zelle)} label={`${transfer.to.name}'s Zelle`} /></span>
      <span>Amount <strong>{formatCents(transfer.cents)}</strong> <CopyButton text={amount} label="amount" /></span>
      <span className="muted-label">Open your bank's app, choose Zelle, and paste these in.</span>
    </span>}
  </>;
}
