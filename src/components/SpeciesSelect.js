import React, { useState } from 'react';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

export default function SpeciesSelect({ value, onChange, required = true }) {
  const matched = SPECIES_OPTIONS.find((option) => option.label.toLowerCase() === (value || '').toLowerCase());
  const [showCustom, setShowCustom] = useState(Boolean(value) && !matched);

  function handleSelect(event) {
    const next = event.target.value;
    if (next === 'other') {
      setShowCustom(true);
      onChange('');
    } else {
      setShowCustom(false);
      onChange(next);
    }
  }

  return <>
    <select required={required} value={showCustom ? 'other' : (matched ? matched.label : value)} onChange={handleSelect}>
      <option value="" disabled>Choose a species...</option>
      {SPECIES_OPTIONS.map((option) => <option key={option.label} value={option.label}>{option.label}</option>)}
      <option value="other">Something else...</option>
    </select>
    {showCustom && <input required={required} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Name the species" />}
  </>;
}
