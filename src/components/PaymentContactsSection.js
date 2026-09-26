import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { displayZelle, formatPhone } from '../utils/payContacts';
import { normalizeVenmoHandle } from '../utils/venmo';

export const GETTING_PAID_ANCHOR = 'getting-paid';

function contactFields(contacts) {
  return { zelle: displayZelle(contacts?.zelle || ''), appleCashPhone: contacts?.apple_cash_phone ? formatPhone(contacts.apple_cash_phone) : '' };
}

// Every way the crew can pay you back after a trip, in one place. Venmo lives on the profile
// row (the crew can see it); Zelle and Apple Cash are an email or a phone number, so they live
// in payment_contacts and only people on a trip with you can see them. One Save writes both.
export default function PaymentContactsSection() {
  const { profile, updateProfile, getMyPaymentContacts, saveMyPaymentContacts } = useAuth();
  const [form, setForm] = useState({ venmo: profile?.venmo_handle || '', zelle: '', appleCashPhone: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMyPaymentContacts().then((contacts) => {
      if (active) setForm((previous) => ({ ...previous, ...contactFields(contacts) }));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The profile loads after the page on a cold start; fill Venmo in once it arrives.
  useEffect(() => {
    if (profile?.venmo_handle) setForm((previous) => (previous.venmo ? previous : { ...previous, venmo: profile.venmo_handle }));
  }, [profile?.venmo_handle]);

  async function handleSubmit(event) {
    event.preventDefault();
    const venmo = normalizeVenmoHandle(form.venmo);
    if (venmo.error) { setError(venmo.error); return; }
    setSaving(true); setError('');
    if (venmo.handle !== (profile?.venmo_handle || '')) {
      const profileResult = await updateProfile({ ...profile, venmo_handle: venmo.handle });
      if (profileResult?.error) { setSaving(false); setError(profileResult.error.message); return; }
    }
    const result = await saveMyPaymentContacts({ zelle: form.zelle, appleCashPhone: form.appleCashPhone });
    setSaving(false);
    if (result.error) { setForm((previous) => ({ ...previous, venmo: venmo.handle })); setError(result.error.message); return; }
    setForm({ venmo: venmo.handle, ...contactFields(result.contacts) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return <section className="settings-card payment-contacts-panel" id={GETTING_PAID_ANCHOR}>
    <div className="section-heading"><div><span className="eyebrow">GETTING PAID BACK</span><h2>Venmo, Zelle &amp; Apple Cash</h2></div></div>
    <p>How the crew pays you back when you front money on a trip. Fill in any you use.</p>
    <form onSubmit={handleSubmit}>
      <label>Venmo username<input value={form.venmo} onChange={(event) => setForm({ ...form, venmo: event.target.value })} placeholder="@your-venmo" autoCapitalize="none" autoCorrect="off" /><span className="field-hint">The crew can see this. Trip-mates get a Pay on Venmo button with the amount filled in.</span></label>
      <label>Zelle email or phone<input value={form.zelle} onChange={(event) => setForm({ ...form, zelle: event.target.value })} placeholder="you@example.com" autoCapitalize="none" autoCorrect="off" /></label>
      <label>Apple Cash phone (iPhone)<input type="tel" value={form.appleCashPhone} onChange={(event) => setForm({ ...form, appleCashPhone: event.target.value })} placeholder="(555) 555-0101" /><span className="field-hint">Zelle and Apple Cash: only people on a trip with you can see these, not the whole crew.</span></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save payment details'} <span>→</span></button>{saved && <span className="saved-message">Saved</span>}</div>
    </form>
  </section>;
}
