import React from 'react';
import { NPCS } from '../../utils/gameDialogue';

// Head-and-shoulders portraits drawn in the same neon-keyline sticker style as the rest of
// the site, so the NPCs don't read as a different app. Kept to flat shapes on purpose: they
// are dialogue cards, not animated sprites.
function ShopkeeperPortrait() {
  return <svg viewBox="0 0 64 64" className="npc-portrait" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" fill="#0e1b1f" stroke="#03080b" strokeWidth="3" />
    <path d="M14 62 Q14 44 32 44 Q50 44 50 62 Z" fill="#e3fb14" />
    <path d="M22 62 L22 50 L42 50 L42 62 Z" fill="#071419" />
    <circle cx="32" cy="30" r="13" fill="#f0c9a0" stroke="#03080b" strokeWidth="2" />
    <path d="M19 33 Q22 46 32 46 Q42 46 45 33 Q40 40 32 40 Q24 40 19 33 Z" fill="#8a6a4a" />
    <path d="M17 26 Q18 12 32 12 Q46 12 47 26 L44 26 Q40 19 32 19 Q24 19 20 26 Z" fill="#ff5a1f" stroke="#03080b" strokeWidth="2" />
    <rect x="44" y="22" width="10" height="4" fill="#ff5a1f" stroke="#03080b" strokeWidth="1.5" />
    <circle cx="27" cy="29" r="1.8" fill="#03080b" />
    <circle cx="37" cy="29" r="1.8" fill="#03080b" />
  </svg>;
}

function CaptainPortrait() {
  return <svg viewBox="0 0 64 64" className="npc-portrait" aria-hidden="true">
    <rect x="2" y="2" width="60" height="60" fill="#0e1b1f" stroke="#03080b" strokeWidth="3" />
    <path d="M12 62 Q12 44 32 44 Q52 44 52 62 Z" fill="#08767a" />
    <path d="M32 44 L32 62" stroke="#e3fb14" strokeWidth="3" />
    <circle cx="32" cy="31" r="13" fill="#c98a5a" stroke="#03080b" strokeWidth="2" />
    <rect x="20" y="27" width="10" height="6" rx="2" fill="#03080b" />
    <rect x="34" y="27" width="10" height="6" rx="2" fill="#03080b" />
    <path d="M30 30 L34 30" stroke="#03080b" strokeWidth="2" />
    <path d="M16 24 L48 24 L46 15 Q32 9 18 15 Z" fill="#071419" stroke="#03080b" strokeWidth="2" />
    <path d="M14 24 L50 24 L50 28 L14 28 Z" fill="#e3fb14" stroke="#03080b" strokeWidth="1.5" />
    <circle cx="32" cy="18" r="2.5" fill="#e3fb14" />
  </svg>;
}

export default function NpcDialogue({ npc, line }) {
  const character = NPCS[npc];
  return <figure className={`npc-dialogue npc-${npc}`}>
    {npc === 'captain' ? <CaptainPortrait /> : <ShopkeeperPortrait />}
    <figcaption className="npc-bubble">
      <strong>{character.name}</strong>
      <small>{character.title}</small>
      <p>{line}</p>
    </figcaption>
  </figure>;
}
