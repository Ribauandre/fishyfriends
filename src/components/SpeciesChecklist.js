import React from 'react';
import FishIllustration from './FishIllustration';
import { SPECIES_OPTIONS } from '../utils/speciesOptions';

// A species counts as caught from either a personal best or a Fish Year catch — the Set
// below collapses any repeats (e.g. the same species logged in two different months) on its
// own, so there's no need to dedupe the two lists first. Comparing against the canonical
// label directly is enough; no need for the fuzzy alias matching speciesIcon does elsewhere,
// which would falsely credit e.g. Steelhead for a plain Trout catch since they share icon art.
export default function SpeciesChecklist({ personalBests, fishYearCatches = [] }) {
  const caughtLabels = new Set([...personalBests, ...fishYearCatches].map((entry) => entry.species.trim().toLowerCase()));
  const caughtCount = SPECIES_OPTIONS.filter((option) => caughtLabels.has(option.label.toLowerCase())).length;

  return <section className="table-card species-board">
    <div className="section-heading">
      <div><span className="eyebrow">FISH BINGO</span><h2>Species checklist</h2></div>
      <div className="year-legend">
        <span><i className="legend-caught" />Caught</span>
        <span><i className="legend-missing" />Not yet</span>
      </div>
    </div>
    <span className="muted-label">{caughtCount} of {SPECIES_OPTIONS.length} species caught</span>
    <div className="species-grid">
      {SPECIES_OPTIONS.map((option) => {
        const caught = caughtLabels.has(option.label.toLowerCase());
        return <div className={`species-cell ${caught ? 'is-caught' : 'is-missing'}`} key={option.label}>
          <FishIllustration species={option.icon} />
          <span>{option.label}</span>
        </div>;
      })}
    </div>
  </section>;
}
