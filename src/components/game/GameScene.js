import React from 'react';
import FishIllustration from '../FishIllustration';
import { ANGLER_SPRITES, SPRITE_FRAME, anglerAction } from '../../utils/anglerSprites';

// The 2D stage for Cast & Catch: an SVG backdrop that swaps with the biome, the angler sprite
// on a dock, beach, or the charter boat with the real person's name on a tag, and the line
// out to a bobber or a fighting fish. The fish stays the site's PNG sticker art, laid over the
// water as HTML rather than redrawn, per the repo rule that fish are never abstract glyphs.
// Motion is event-driven only: the cast, the strike, reeling while the player holds, and the
// celebration on a landed fish.
const SCENES = {
  lake: { sky: ['#0a1f2e', '#123a47'], water: ['#0b3c46', '#06232a'], land: '#0f2b24', backdrop: 'hills', stand: 'dock' },
  river: { sky: ['#0b2230', '#154551'], water: ['#0d4650', '#082a30'], land: '#12301f', backdrop: 'trees', stand: 'dock' },
  mountainlake: { sky: ['#07131f', '#0d2d45'], water: ['#0a3f52', '#052430'], land: '#1b2f3d', backdrop: 'mountains', stand: 'dock' },
  swamp: { sky: ['#121a10', '#22301a'], water: ['#243b1c', '#141f0f'], land: '#1c2a12', backdrop: 'swamp', stand: 'dock' },
  bay: { sky: ['#0a1a2c', '#1a3d5a'], water: ['#0c4a5e', '#062a38'], land: '#20313a', backdrop: 'coast', stand: 'dock' },
  shoreline: { sky: ['#0c1b2e', '#245070'], water: ['#0f5568', '#083440'], land: '#5c4a2c', backdrop: 'open', stand: 'beach' },
  offshore: { sky: ['#050d18', '#0d2a45'], water: ['#083545', '#03161d'], land: '#0f2b24', backdrop: 'open', stand: 'boat' },
};

const WATER_TOP = 140;
const VIEW_W = 480;
const VIEW_H = 220;
const SPRITE_BOX_H = 64; // % of stage height

function Backdrop({ kind, land }) {
  switch (kind) {
    case 'hills':
      return <g>
        <ellipse cx="150" cy="150" rx="190" ry="48" fill={land} />
        <ellipse cx="400" cy="152" rx="170" ry="40" fill={land} opacity=".85" />
        {[250, 300, 350, 420].map((x) => <path key={x} d={`M${x} 118 L${x + 9} 100 L${x + 18} 118 Z`} fill="#0b3a2a" stroke="#03080b" strokeWidth="1" />)}
      </g>;
    case 'trees':
      return <g>
        <rect x="0" y="118" width="480" height="24" fill={land} />
        {[200, 240, 285, 330, 380, 430].map((x, i) => <g key={x}>
          <rect x={x + 6} y={108} width="4" height="14" fill="#03080b" />
          <path d={`M${x} 110 L${x + 8} ${86 - (i % 2) * 6} L${x + 16} 110 Z`} fill="#0b3a2a" stroke="#03080b" strokeWidth="1" />
        </g>)}
      </g>;
    case 'mountains':
      return <g>
        <path d="M120 140 L220 40 L320 140 Z" fill={land} stroke="#03080b" strokeWidth="1.5" />
        <path d="M195 66 L220 40 L245 66 L232 62 L220 70 L208 62 Z" fill="#e7f4ef" />
        <path d="M260 140 L360 62 L470 140 Z" fill={land} opacity=".9" stroke="#03080b" strokeWidth="1.5" />
        <path d="M340 78 L360 62 L380 78 L368 76 L360 84 L352 76 Z" fill="#e7f4ef" />
      </g>;
    case 'swamp':
      return <g>
        <rect x="0" y="126" width="480" height="16" fill={land} />
        {[210, 260, 320, 400].map((x) => <g key={x}>
          <path d={`M${x} 140 L${x + 3} 78 L${x + 11} 78 L${x + 14} 140 Z`} fill="#2a2418" stroke="#03080b" strokeWidth="1" />
          <ellipse cx={x + 7} cy="76" rx="22" ry="10" fill="#1f3a14" stroke="#03080b" strokeWidth="1" />
        </g>)}
        {[190, 235, 300, 360, 440].map((x) => <path key={x} d={`M${x} 142 L${x + 2} 118 M${x + 6} 142 L${x + 4} 122`} stroke="#4a6a2a" strokeWidth="2" />)}
      </g>;
    case 'coast':
      return <g>
        <rect x="0" y="130" width="480" height="12" fill={land} />
        <rect x="392" y="86" width="16" height="46" fill="#e7f4ef" stroke="#03080b" strokeWidth="1.5" />
        <rect x="392" y="100" width="16" height="8" fill="#ff5a1f" />
        <path d="M388 86 L412 86 L400 72 Z" fill="#03080b" />
        <circle cx="400" cy="82" r="3" fill="#e3fb14" />
        {[240, 262, 290, 312].map((x, i) => <rect key={x} x={x} y={116 - i * 4} width="14" height={16 + i * 4} fill="#122a35" stroke="#03080b" strokeWidth="1" />)}
      </g>;
    default:
      return <g>
        <circle cx="400" cy="58" r="20" fill="#e3fb14" opacity=".9" />
        <rect x="0" y="138" width="480" height="3" fill="#e3fb14" opacity=".25" />
      </g>;
  }
}

function Stand({ kind, land }) {
  if (kind === 'boat') {
    return <g>
      <path d="M16 126 L196 126 L178 158 L34 158 Z" fill="#0e1b1f" stroke="#03080b" strokeWidth="3" />
      <rect x="16" y="120" width="180" height="8" fill="#e3fb14" stroke="#03080b" strokeWidth="2" />
      <rect x="128" y="88" width="46" height="34" fill="#172a2e" stroke="#03080b" strokeWidth="2" />
      <rect x="136" y="94" width="12" height="10" fill="#4fa8ff" />
      <path d="M150 88 L150 60" stroke="#03080b" strokeWidth="3" />
    </g>;
  }
  if (kind === 'beach') {
    return <g><path d="M0 122 Q120 118 210 142 L0 150 Z" fill={land} stroke="#03080b" strokeWidth="2" /></g>;
  }
  return <g>
    {[28, 78, 128].map((x) => <rect key={x} x={x} y="126" width="8" height="40" fill="#0e1b1f" stroke="#03080b" strokeWidth="2" />)}
    <rect x="0" y="120" width="160" height="10" fill="#172a2e" stroke="#03080b" strokeWidth="2" />
    <path d="M0 124 L160 124" stroke="#03080b" strokeWidth="1.5" strokeDasharray="14 6" />
  </g>;
}

// Positions the sprite box so its feet anchor lands on (anglerX, anglerY) in viewBox units.
function spriteLayout(anglerX, anglerY) {
  const boxW = SPRITE_BOX_H * (VIEW_H / VIEW_W) * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = (anglerX / VIEW_W) * 100 - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = ((VIEW_H - anglerY) / VIEW_H) * 100 - SPRITE_BOX_H * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${left}%`, bottom: `${bottom}%`, height: `${SPRITE_BOX_H}%`, width: `${boxW}%` };
}

function AnglerSprite({ x, y, phase, result, holding }) {
  const { action, frame = 0, play, durationMs, loop } = anglerAction({ phase, result, holding });
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteLayout(x, y),
    backgroundImage: `url(${sprite.src})`,
    backgroundSize: `${sprite.frames * 100}% 100%`,
    backgroundPositionX: `${frame * frameStep}%`,
  };
  if (play) {
    style['--sprite-end'] = `${(play - 1) * frameStep}%`;
    style.animationDuration = `${durationMs}ms`;
    // jump-none lands on exactly `play` positions (both ends included), one per frame.
    style.animationTimingFunction = `steps(${play}, jump-none)`;
  }
  return <div
    key={`${phase}-${action}-${play ? 'play' : 'hold'}`}
    className={`scene-sprite ${play ? (loop ? 'is-looping' : 'is-playing') : ''}`}
    data-action={action}
    style={style}
  />;
}

export default function GameScene({ biome, phase, displayName, species, reel, zoneWidth = 0, result, holding = false }) {
  const scene = SCENES[biome] || SCENES.lake;
  const anglerX = scene.stand === 'boat' ? 100 : 88;
  const anglerY = scene.stand === 'boat' ? 120 : scene.stand === 'beach' ? 126 : 120;
  const spriteScale = (SPRITE_BOX_H / 100) * VIEW_H / SPRITE_FRAME.h;
  const rodTipX = anglerX + (SPRITE_FRAME.rodTipX - SPRITE_FRAME.feetX) * spriteScale;
  const rodTipY = anglerY - (SPRITE_FRAME.feetY - SPRITE_FRAME.rodTipY) * spriteScale;
  const bobberX = 300;
  const fishX = reel ? (reel.fishPos / 100) * VIEW_W : bobberX;
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';

  return <div className={`game-scene is-${phase}`} data-biome={biome} data-phase={phase}>
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
      <defs>
        <linearGradient id={`sky-${biome}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene.sky[0]} /><stop offset="1" stopColor={scene.sky[1]} /></linearGradient>
        <linearGradient id={`water-${biome}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene.water[0]} /><stop offset="1" stopColor={scene.water[1]} /></linearGradient>
        <pattern id="scene-halftone" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1" fill="rgba(227,251,20,.08)" /></pattern>
      </defs>
      <rect x="0" y="0" width={VIEW_W} height={WATER_TOP} fill={`url(#sky-${biome})`} />
      <Backdrop kind={scene.backdrop} land={scene.land} />
      <rect x="0" y={WATER_TOP} width={VIEW_W} height={VIEW_H - WATER_TOP} fill={`url(#water-${biome})`} />
      <rect x="0" y={WATER_TOP} width={VIEW_W} height={VIEW_H - WATER_TOP} fill="url(#scene-halftone)" />
      <path d={`M0 ${WATER_TOP} L${VIEW_W} ${WATER_TOP}`} stroke="#e3fb14" strokeWidth="1.5" opacity=".5" />
      <Stand kind={scene.stand} land={scene.land} />
      {lineOut && <path
        className="scene-line"
        d={phase === 'reeling' ? `M${rodTipX} ${rodTipY} L${fishX} 178` : `M${rodTipX} ${rodTipY} Q${(rodTipX + bobberX) / 2} ${rodTipY - 30} ${bobberX} ${WATER_TOP + 4}`}
        stroke="#e7f4ef" strokeWidth="1.2" fill="none" opacity=".8"
      />}
      {(phase === 'waiting' || phase === 'hookset') && <circle className="scene-bobber" cx={bobberX} cy={WATER_TOP + 2} r="5" fill="#ff5a1f" stroke="#03080b" strokeWidth="1.5" />}
      {phase === 'hookset' && <g className="scene-splash">
        <circle cx={bobberX} cy={WATER_TOP + 2} r="10" fill="none" stroke="#e3fb14" strokeWidth="2" />
        <circle cx={bobberX} cy={WATER_TOP + 2} r="18" fill="none" stroke="#e3fb14" strokeWidth="1.5" opacity=".6" />
      </g>}
      <text x={anglerX} y={anglerY + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill="#e3fb14" fontFamily="Oswald, Arial Narrow, sans-serif" letterSpacing="1">{(displayName || 'YOU').toUpperCase()}</text>
    </svg>
    <AnglerSprite x={anglerX} y={anglerY} phase={phase} result={result} holding={holding} />
    {phase === 'reeling' && reel && <>
      <div className="reel-zone scene-zone" style={{ left: `${reel.zonePos - zoneWidth / 2}%`, width: `${zoneWidth}%` }} />
      <FishIllustration species={species} className="reel-fish scene-fish" style={{ left: `${reel.fishPos}%` }} />
    </>}
    {phase === 'result' && result?.success && <FishIllustration species={result.species} className="scene-trophy" />}
  </div>;
}
