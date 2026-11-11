import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FishIllustration from './FishIllustration';

const POLL_MS = 30000;

// What a signed-in account sees until the club's admin approves it (and what a removed one
// sees after). Having an account isn't being in the club: the database gives a waiting
// account nothing but its own profile row, so there is no app to show yet. It checks again
// by itself, so being approved opens the door without a reload.
const COPY = {
  pending: {
    eyebrow: 'ALMOST IN',
    title: 'You\'re on the list.',
    body: 'Fishy Friends is a private club, so whoever runs it lets each new angler in. There\'s nothing else to do: this page opens up by itself once you\'re approved.',
    action: 'Check again',
    still: 'Still waiting. Give the admin a nudge.',
  },
  declined: {
    eyebrow: 'NOT THIS TIME',
    title: 'This account isn\'t in the club.',
    body: 'If you think that\'s a mistake, talk to whoever invited you.',
  },
  unknown: {
    eyebrow: 'LINE\'S TANGLED',
    title: 'Couldn\'t check your membership.',
    body: 'Check your connection and try again.',
    action: 'Try again',
    still: 'Still can\'t reach the club. Try again in a minute.',
  },
};

export default function WaitingRoom() {
  const { user, membershipStatus, refreshMembership, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const copy = COPY[membershipStatus] || COPY.unknown;
  const canRetry = Boolean(copy.action);

  useEffect(() => {
    if (!canRetry || !refreshMembership) return undefined;
    const timer = setInterval(() => { refreshMembership(); }, POLL_MS);
    return () => clearInterval(timer);
    // The provider hands out a new function every render; the interval only needs one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRetry]);

  async function handleCheck() {
    setChecking(true);
    await refreshMembership();
    setChecking(false);
    setChecked(true);
  }

  return <main className="auth-page waiting-room">
    <section className="auth-story">
      <div className="auth-fishing-scene" aria-hidden="true"><div className="auth-shark"><FishIllustration species="stripedbass" /></div></div>
      <span className="eyebrow">FISHY FRIENDS CLUB</span>
      <h1>Members only past this point.</h1>
      <p>Catches, trips and bragging rights stay between the crew.</p>
    </section>
    <section className="auth-panel">
      <div className="brand-mark"><span>FF</span><div><strong>Fishy Friends</strong><small>Friends, fish, and bragging rights</small></div></div>
      <div className="confirmation-panel" role="status">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
        {user?.email && <p>Signed in as <strong>{user.email}</strong>.</p>}
        {canRetry && <button className="button button-primary" type="button" onClick={handleCheck} disabled={checking}>{checking ? 'Checking...' : copy.action} <span>→</span></button>}
        {canRetry && checked && !checking && <p className="waiting-room-note">{copy.still}</p>}
        <p><button className="button button-quiet" type="button" onClick={signOut}>Sign out</button></p>
      </div>
    </section>
  </main>;
}
