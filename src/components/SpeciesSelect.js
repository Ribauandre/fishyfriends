import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

export default function SpeciesSelect({ value, onChange, required = true }) {
  const { customSpecies } = useAuth();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const wrapperRef = useRef(null);
  const listboxId = useId();

  const allSpecies = useMemo(() => {
    const names = new Set(SPECIES_OPTIONS.map((option) => option.label));
    for (const name of customSpecies || []) names.add(name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [customSpecies]);

  const matches = useMemo(() => {
    const query = (value || '').trim().toLowerCase();
    if (!query) return allSpecies;
    return allSpecies.filter((name) => name.toLowerCase().includes(query));
  }, [allSpecies, value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function selectSpecies(name) {
    onChange(name);
    setOpen(false);
    setHighlighted(-1);
  }

  function handleKeyDown(event) {
    if (!open) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') setOpen(true);
      return;
    }
    if (event.key === 'ArrowDown') { event.preventDefault(); setHighlighted((previous) => Math.min(previous + 1, matches.length - 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setHighlighted((previous) => Math.max(previous - 1, 0)); }
    else if (event.key === 'Enter' && highlighted >= 0 && matches[highlighted]) { event.preventDefault(); selectSpecies(matches[highlighted]); }
    else if (event.key === 'Escape') setOpen(false);
  }

  return <div className="species-autocomplete" ref={wrapperRef}>
    <input
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      required={required}
      value={value}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setHighlighted(-1); }}
      onFocus={() => setOpen(true)}
      onKeyDown={handleKeyDown}
      placeholder="Start typing a species..."
      autoComplete="off"
    />
    {open && matches.length > 0 && <ul className="species-options" id={listboxId} role="listbox">
      {matches.map((name, index) => <li key={name} role="option" aria-selected={index === highlighted} className={index === highlighted ? 'is-highlighted' : ''} onMouseDown={(event) => { event.preventDefault(); selectSpecies(name); }}>{name}</li>)}
    </ul>}
  </div>;
}
