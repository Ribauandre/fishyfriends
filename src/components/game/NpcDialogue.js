import React from 'react';
import { NPCS } from '../../utils/gameDialogue';
import captainPortrait from '../../assets/npcs/captain.png';
import shopkeeperPortrait from '../../assets/npcs/shopkeeper.png';
import outfitterPortrait from '../../assets/npcs/outfitter.png';

// Each character's portrait is pixel art on the chrome's grid: a dedicated render (kept in
// art/npcs/) put on 64 x 64 art pixels by scripts/pixelGrid.mjs (art/props/chrome.json) and drawn
// pixelated at a whole multiple, framed in the thin plank — shown as dialogue cards rather than
// animated sprites.
const PORTRAITS = { captain: captainPortrait, shopkeeper: shopkeeperPortrait, outfitter: outfitterPortrait };

export default function NpcDialogue({ npc, line, compact = false }) {
  const character = NPCS[npc];
  return <figure className={`npc-dialogue npc-${npc} ${compact ? 'is-compact' : ''}`}>
    <span className="npc-frame"><img className="npc-portrait" src={PORTRAITS[npc]} alt="" /></span>
    <figcaption className="npc-bubble">
      <strong>{character.name}</strong>
      <small>{character.title}</small>
      <p>{line}</p>
    </figcaption>
  </figure>;
}
