import React from 'react';
import { decorProp } from '../../utils/dockDecor';

// A dock decoration for Marina's rack; the free "bare deck" is an empty tile.
export default function DecorPreview({ decorKey }) {
  const prop = decorProp(decorKey);
  if (!prop) return <span className="pet-preview is-none" role="img" aria-label="Bare deck">none</span>;
  return <img className="decor-preview" src={prop.src} alt={prop.label} data-decor={decorKey} />;
}
