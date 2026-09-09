import React, { useState } from 'react';
import FishIllustration from './FishIllustration';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

// A species counts as caught from either a personal best or a Fish Year catch — the Set
// below collapses any repeats (e.g. the same species logged in two different months) on its
// own, so there's no need to dedupe the two lists first. Comparing against the canonical
// label directly is enough; no need for the fuzzy alias matching speciesIcon does elsewhere,
// which would falsely credit e.g. Steelhead for a plain Trout catch since they share icon art.
export default function SpeciesChecklist({ personalBests, fishYearCatches = [] }) {
  const [open, setOpen] = useState(false);
  const caughtLabels = new Set([...personalBests, ...fishYearCatches].map((entry) => entry.species.trim().toLowerCase()));
  const caughtCount = SPECIES_OPTIONS.filter((option) => caughtLabels.has(option.label.toLowerCase())).length;

  return <section className={`table-card species-board collapsible-section ${open ? 'is-open' : ''}`}>
    <button type="button" className="section-heading collapsible-header" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <div><span className="eyebrow">FISH BINGO</span><span className="collapsible-header-title">Species checklist</span></div>
      <div className="collapsible-header-right">
        <span className="muted-label">{caughtCount} of {SPECIES_OPTIONS.length} species caught</span>
        <span className="expand-icon">{open ? '−' : '+'}</span>
      </div>
    </button>
    {open && <>
      <div className="year-legend species-legend">
        <span><i className="legend-caught" />Caught</span>
        <span><i className="legend-missing" />Not yet</span>
      </div>
      <div className="species-grid">
        {SPECIES_OPTIONS.map((option) => {
          const caught = caughtLabels.has(option.label.toLowerCase());
          return <div className={`species-cell ${caught ? 'is-caught' : 'is-missing'}`} key={option.label}>
            <FishIllustration species={option.icon} />
            <span>{option.label}</span>
          </div>;
        })}
      </div>
    </>}
  </section>;
}
