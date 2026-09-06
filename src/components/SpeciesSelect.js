import React, { useId, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

export default function SpeciesSelect({ value, onChange, required = true }) {
  const { customSpecies } = useAuth();
  const listId = useId();

  const allSpecies = useMemo(() => {
    const names = new Set(SPECIES_OPTIONS.map((option) => option.label));
    for (const name of customSpecies || []) names.add(name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [customSpecies]);

  return <>
    <input list={listId} required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Start typing a species..." autoComplete="off" />
    <datalist id={listId}>{allSpecies.map((name) => <option key={name} value={name} />)}</datalist>
  </>;
}
