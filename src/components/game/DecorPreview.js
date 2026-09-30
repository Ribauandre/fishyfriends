import React from 'react';
import { decorProp } from '../../utils/dockDecor';
import { RACK_PX } from './PetPreview';

// A dock decoration for Marina's rack, at the rack's whole-number scale of its art pixels; the
// free "bare deck" is an empty tile.
export default function DecorPreview({ decorKey }) {
  const prop = decorProp(decorKey);
  if (!prop) return <span className="pet-preview is-none" role="img" aria-label="Bare deck">none</span>;
  return <img className="decor-preview" src={prop.src} alt={prop.label} data-decor={decorKey} width={prop.w * RACK_PX} height={prop.rows * RACK_PX} style={{ width: `${prop.w * RACK_PX}px`, height: `${prop.rows * RACK_PX}px` }} />;
}
