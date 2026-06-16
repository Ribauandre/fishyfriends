import * as React from 'react';
import { useEffect, useState } from 'react';
import IconButton from '@mui/joy/IconButton';
import Table from '@mui/joy/Table';
import Sheet from '@mui/joy/Sheet';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import { supabase, setSupabaseJwtFromEnv } from '../utils/supabase';

type Entry = { id?: number; name: string; species: string; date: string; month: string; photo_url?: string };

function sanitizeName(name: string) {
  if (!name) return '';
  // trim, remove characters except letters/numbers/spaces/' and -, collapse multiple spaces
  return name
    .trim()
    .replace(/[^A-Za-z0-9\s'-]/g, '')
    .replace(/\s+/g, ' ');
}


function MonthRow(props: { month: string; entries: Entry[] }) {
  const { month, entries } = props;
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <tr>
        <td>
          <IconButton
            aria-label="expand month"
            variant="plain"
            color="primary"
            size="sm"
            onClick={() => setOpen(!open)}
          >
            {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
          </IconButton>
        </td>
        <th scope="row" style={{ color: 'white', backgroundColor: 'black' }}>{month}</th>
      </tr>
      <tr>
        <td style={{ height: 0, padding: 0 }} colSpan={2}>
          {open && (
            <Sheet variant="soft" sx={{ textAlign: 'center', backgroundColor: 'black', color: 'white', padding: 2 }}>
              <div style={{ padding: 8 }}>
                <strong>{month}</strong>
                {entries.length === 0 ? (
                  <p style={{ margin: '8px 0 0 0' }}>No entries for this month yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', marginTop: 8 }}>
                    {entries.map((e) => (
                      <div key={e.id || e.name + e.date} className="month-entry">
                        <div className="entry-name">
                          <div className="entry-name-title">{e.name}</div>
                        </div>
                        <div className="entry-body">
                          {e.photo_url ? (
                            <img src={e.photo_url} alt={`${e.name} fish`} className="entry-photo" />
                          ) : null}
                          <div className="entry-info">
                            <div className="entry-info-line"><strong>Species:</strong> <span>{e.species}</span></div>
                            <div className="entry-info-line"><strong>Date:</strong> <span>{e.date}</span></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Sheet>
          )}
        </td>
      </tr>
    </>
  );
}

const months = [
  'January','February','March','April','May','June','July','August','September','October','November','December'
];

export default function Participants() {
  const today = new Date().toISOString().split('T')[0];
  const [entriesByMonth, setEntriesByMonth] = useState<Record<string, Entry[]>>({});
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<{ name: string; species: string; date: string; month: string; file: File | null }>({
    name: '', species: '', date: today, month: months[new Date().getMonth()], file: null
  });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    async function initAndLoad() {
      await setSupabaseJwtFromEnv();
      await fetchEntries();
    }
    initAndLoad();
  }, []);

  async function fetchEntries() {
    setLoading(true);
    const { data, error } = await supabase.from('entries').select('*').order('id', { ascending: true });
    setLoading(false);
    if (error) {
      console.error('Error fetching entries', error);
      return;
    }
    const map: Record<string, Entry[]> = {};
    (data || []).forEach((row: any) => {
      const m = row.month || 'Unknown';
      if (!map[m]) map[m] = [];
      map[m].push({ id: row.id, name: sanitizeName(row.name), species: row.species, date: row.date, month: m, photo_url: row.photo_url });
    });
    setEntriesByMonth(map);
  }

  function handleFormChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target as HTMLInputElement;

    if (name === 'name') {
      setForm(prev => ({ ...prev, name: sanitizeName(value) }));
      return;
    }

    if (name === 'month') {
      const monthIndex = months.indexOf(value) + 1;
      const paddedMonth = String(monthIndex).padStart(2, '0');
      const [year = new Date().getFullYear().toString(), , day = '01'] = form.date.split('-');
      const updatedDate = `${year}-${paddedMonth}-${day.padStart(2, '0')}`;
      setForm(prev => ({ ...prev, month: value, date: updatedDate }));
      return;
    }

    if (name === 'date') {
      const dateParts = value.split('-');
      const monthName = dateParts[1] ? months[Number(dateParts[1]) - 1] : form.month;
      setForm(prev => ({ ...prev, date: value, month: monthName }));
      return;
    }

    setForm(prev => ({ ...prev, [name]: value }));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    setForm(prev => ({ ...prev, file: f || null }));
    if (f) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);
    if (!form.name || !form.species || !form.date) {
      setStatusMessage('Please fill name, species and date');
      return;
    }

    setUploading(true);
    let publicURL: string | undefined = undefined;
    const cleanedName = sanitizeName(form.name);
    try {
      const { data: existingData, error: duplicateError } = await supabase
        .from('entries')
        .select('id,name')
        .eq('month', form.month);
      if (duplicateError) throw duplicateError;
      if (existingData && existingData.some((r: any) => sanitizeName(r.name) === cleanedName)) {
        setStatusMessage('A submission was already submitted for this name and month');
        setUploading(false);
        return;
      }

      if (form.file) {
        const filePath = `photos/${Date.now()}_${form.file.name}`;
        const { error: uploadError } = await supabase.storage.from('photos').upload(filePath, form.file as File, { cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('photos').getPublicUrl(filePath);
        publicURL = urlData.publicUrl;
      }

      const { error: insertError } = await supabase.from('entries').insert([{ name: cleanedName, species: form.species, date: form.date, month: form.month, photo_url: publicURL }]);
      if (insertError) throw insertError;

      setForm({ name: '', species: '', date: today, month: months[new Date().getMonth()], file: null });
      setPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchEntries();
      setStatusMessage('Entry submitted');
    } catch (err) {
      console.error(err);
      setStatusMessage('Failed to submit entry');
    } finally {
      setUploading(false);
    }
  }

  // collect unique participant names for summary
  const namesSet = new Set<string>();
  Object.values(entriesByMonth).flat().forEach(e => namesSet.add(sanitizeName(e.name)));
  const names = Array.from(namesSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  return (
    <Sheet className="participants-sheet" variant="soft" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white' }}>
      <Table className="summary-table" aria-label="summary" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white', ml: 2 }}>
        <thead>
          <tr>
            <th style={{ color: 'white', backgroundColor: 'black' }}>Name</th>
            {months.map((m) => (
              <th key={m} style={{ color: 'white', backgroundColor: 'black', textAlign: 'center' }}>{m.slice(0,3)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {names.map((name) => (
            <tr key={name}>
              <td style={{ color: 'white', backgroundColor: 'black' }}>{name}</td>
              {months.map((m) => {
                const has = (entriesByMonth[m] || []).some(e => e.name === name);
                return (
                  <td key={m} style={{ color: has ? '#8cffb2' : '#ff7b7b', textAlign: 'center', backgroundColor: 'black' }}>{has ? '✓' : '✕'}</td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </Table>

      <Table className="months-table" aria-label="months" sx={{ textAlign: 'left', backgroundColor: 'black', color: 'white' }}>
        <thead>
          <tr>
            <th style={{ width: 40, backgroundColor: 'black' }} aria-label="expand" />
            <th style={{ color: 'white', backgroundColor: 'black' }}>Month</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m) => (
            <MonthRow key={m} month={m} entries={entriesByMonth[m] || []} />
          ))}
        </tbody>
      </Table>

      <div style={{ padding: 12, marginTop: 20 }}>
        <h3 style={{ marginBottom: 12 }}>Submit New Entry</h3>
        <form onSubmit={handleSubmit} className="participants-form">
          <div className="form-row">
            <label>Month</label>
            <select name="month" value={form.month} onChange={handleFormChange} className="participants-input">
              {months.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Name</label>
            <input
              name="name"
              placeholder="Name"
              value={form.name}
              onChange={handleFormChange}
              className="participants-input"
              list="existing-names"
            />
            <datalist id="existing-names">
              {names.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
          <div className="form-row">
            <label>Species</label>
            <input name="species" placeholder="Species" value={form.species} onChange={handleFormChange} className="participants-input" />
          </div>
          <div className="form-row">
            <label>Date</label>
            <input
              type="date"
              name="date"
              value={form.date}
              onChange={handleFormChange}
              className="participants-input"
            />
          </div>
          <div className="form-row file-row">
            <label>Photo</label>
            <input ref={fileInputRef} type="file" onChange={handleFileChange} accept="image/*" className="participants-input" />
            {previewUrl && (
              <div className="file-preview">
                <img src={previewUrl} alt="preview" />
              </div>
            )}
          </div>
          <div className="form-row actions">
            <button type="submit" className="participants-button" disabled={uploading}>
              {uploading ? 'Uploading...' : 'Submit'}
            </button>
            {statusMessage && <div className="status">{statusMessage}</div>}
          </div>
        </form>
      </div>
    </Sheet>
  );
}
