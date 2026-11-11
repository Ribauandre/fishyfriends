import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import FishIllustration from './components/FishIllustration';
import BugReportsSection from './AdminBugReports';
import PhotoPrivacySection from './components/PhotoPrivacySection';

function signedUp(account) {
  return account.signed_up_at ? new Date(account.signed_up_at).toLocaleDateString() : '';
}

function AccountRow({ account, children }) {
  return <li className="bug-report-row admin-account-row">
    <div className="bug-report-row-meta">
      <strong>{account.display_name}</strong>
      {account.is_admin && <span className="admin-account-tag">Admin</span>}
      <span>{account.email}</span>
      {signedUp(account) && <span>signed up {signedUp(account)}</span>}
    </div>
    <div className="admin-account-actions">{children}</div>
  </li>;
}

// Who is in the club. Having an account is not enough: a sign-up sees nothing until it is
// approved here, and removing someone takes their access away at once. Everything on this
// page is decided by the database (is_admin()), so reaching the route without being the
// admin shows nothing and can do nothing.
function MembersSection() {
  const { user, listClubAccounts, setClubMembership } = useAuth();
  const [accounts, setAccounts] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirming, setConfirming] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setAccounts(await listClubAccounts());
  }

  useEffect(() => {
    let active = true;
    listClubAccounts().then((data) => { if (active) setAccounts(data); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function decide(account, status) {
    setBusy(account.account_id); setError('');
    const result = await setClubMembership(account.account_id, status);
    if (result.error) setError(result.error.message);
    setConfirming('');
    await load();
    setBusy('');
  }

  if (accounts === null) return <section className="table-card"><p className="month-empty">Pulling the member list...</p></section>;
  const waiting = accounts.filter((account) => account.status === 'pending');
  const members = accounts.filter((account) => account.status === 'approved');
  const out = accounts.filter((account) => account.status === 'declined');

  return <>
    <section className="table-card" aria-label="Waiting to join">
      <div className="section-heading"><div><span className="eyebrow">AT THE DOOR</span><h2>{waiting.length === 0 ? 'Nobody waiting' : `${waiting.length} waiting to join`}</h2></div></div>
      {error && <p className="form-error">{error}</p>}
      {waiting.length === 0
        ? <p className="month-empty">New sign-ups land here. They can't see anything until you let them in.</p>
        : <ul className="bug-report-list">{waiting.map((account) => <AccountRow key={account.account_id} account={account}>
          <button className="button button-primary" type="button" disabled={busy === account.account_id} onClick={() => decide(account, 'approved')}>Let {account.display_name} in</button>
          <button className="button button-quiet" type="button" disabled={busy === account.account_id} onClick={() => decide(account, 'declined')}>Turn down</button>
        </AccountRow>)}</ul>}
      <p className="month-empty admin-account-hint">Only approve people you know: check the email, not just the name.</p>
    </section>
    <section className="table-card" aria-label="Members">
      <div className="section-heading"><div><span className="eyebrow">THE CREW</span><h2>{members.length} member{members.length === 1 ? '' : 's'}</h2></div></div>
      <ul className="bug-report-list">{members.map((account) => <AccountRow key={account.account_id} account={account}>
        {account.account_id === user?.id || account.is_admin ? null : confirming === account.account_id
          ? <>
            <span className="admin-account-confirm">Remove {account.display_name}? They lose access right away.</span>
            <button className="button button-primary" type="button" disabled={busy === account.account_id} onClick={() => decide(account, 'declined')}>Yes, remove</button>
            <button className="button button-quiet" type="button" onClick={() => setConfirming('')}>Keep</button>
          </>
          : <button className="button button-quiet" type="button" onClick={() => setConfirming(account.account_id)}>Remove</button>}
      </AccountRow>)}</ul>
    </section>
    {out.length > 0 && <section className="table-card" aria-label="Turned down or removed">
      <div className="section-heading"><div><span className="eyebrow">NOT IN THE CLUB</span><h2>Turned down or removed</h2></div></div>
      <ul className="bug-report-list">{out.map((account) => <AccountRow key={account.account_id} account={account}>
        <button className="button button-quiet" type="button" disabled={busy === account.account_id} onClick={() => decide(account, 'approved')}>Let back in</button>
      </AccountRow>)}</ul>
    </section>}
  </>;
}

export default function Admin() {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/home" replace />;
  return <main className="content-shell admin-bugs-page admin-page">
    <div className="page-intro">
      <div><span className="eyebrow">ADMIN ONLY</span><h1>Club admin</h1><p>Who's in, who's waiting, and what the crew has flagged.</p></div>
      <FishIllustration species="catfish" className="intro-sticker" />
    </div>
    <MembersSection />
    <PhotoPrivacySection />
    <BugReportsSection />
  </main>;
}
