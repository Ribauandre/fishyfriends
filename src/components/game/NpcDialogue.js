import React from 'react';
import { NPCS } from '../../utils/gameDialogue';
import captainPortrait from '../../assets/npcs/captain.png';
import shopkeeperPortrait from '../../assets/npcs/shopkeeper.png';

// Pixel-art portraits are dedicated renders for each character (downscaled to 256px for the
// bundle), shown as dialogue cards rather than animated sprites.
const PORTRAITS = { captain: captainPortrait, shopkeeper: shopkeeperPortrait };

export default function NpcDialogue({ npc, line }) {
  const character = NPCS[npc];
  return <figure className={`npc-dialogue npc-${npc}`}>
    <img className="npc-portrait" src={PORTRAITS[npc]} alt="" />
    <figcaption className="npc-bubble">
      <strong>{character.name}</strong>
      <small>{character.title}</small>
      <p>{line}</p>
    </figcaption>
  </figure>;
}
