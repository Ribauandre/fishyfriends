import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { displayZelle, formatPhone } from '../utils/payContacts';

// Zelle and Apple Cash details for trip settle-ups. Kept apart from the profile form because
// these are private-ish: only people on a trip with you can see them, not the whole crew.
export default function PaymentContactsSection() {
  const { getMyPaymentContacts, saveMyPaymentContacts } = useAuth();
  const [form, setForm] = useState({ zelle: '', appleCashPhone: '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMyPaymentContacts().then((contacts) => {
      if (active) setForm({ zelle: displayZelle(contacts.zelle), appleCashPhone: contacts.apple_cash_phone ? formatPhone(contacts.apple_cash_phone) : '' });
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true); setError('');
    const result = await saveMyPaymentContacts(form);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setForm({ zelle: displayZelle(result.contacts.zelle), appleCashPhone: result.contacts.apple_cash_phone ? formatPhone(result.contacts.apple_cash_phone) : '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  }

  return <section className="settings-card payment-contacts-panel">
    <div className="section-heading"><div><span className="eyebrow">GETTING PAID BACK</span><h2>Zelle &amp; Apple Cash</h2></div></div>
    <p>For trip settle-ups. Only people on a trip with you can see these, not the whole crew.</p>
    <form onSubmit={handleSubmit}>
      <label>Zelle email or phone<input value={form.zelle} onChange={(event) => setForm({ ...form, zelle: event.target.value })} placeholder="you@example.com" autoCapitalize="none" autoCorrect="off" /></label>
      <label>Apple Cash phone (iPhone)<input type="tel" value={form.appleCashPhone} onChange={(event) => setForm({ ...form, appleCashPhone: event.target.value })} placeholder="(555) 555-0101" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'} <span>→</span></button>{saved && <span className="saved-message">Saved</span>}</div>
    </form>
  </section>;
}
