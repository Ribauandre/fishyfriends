import React from 'react';
import FishIllustration from '../FishIllustration';
import { ANGLER_SPRITES, SPRITE_FRAME, anglerAction } from '../../utils/anglerSprites';
import lakeArt from '../../assets/scenes/lake.webp';
import riverArt from '../../assets/scenes/river.webp';
import mountainlakeArt from '../../assets/scenes/mountainlake.webp';
import swampArt from '../../assets/scenes/swamp.webp';
import shorelineArt from '../../assets/scenes/shoreline.webp';

// The 2D stage for Cast & Catch, a 16:9 layered scene: a pixel-art backdrop per biome (all
// painted around the same dock, so the angler's spot never moves), the angler sprite, and an
// SVG overlay for the line, bobber, strike splash, and the real person's name tag. Biomes
// without painted art yet (bay, offshore) fall back to a code-drawn backdrop. The fish stays
// the site's PNG sticker art, laid over the water as HTML rather than redrawn, per the repo
// rule that fish are never abstract glyphs. Motion is event-driven only.
const VIEW_W = 480;
const VIEW_H = 270;

// Where things sit in the painted scenes (viewBox units): the dock deck the angler stands on,
// the water surface the bobber floats at, and how far out the cast lands.
const ART_LAYOUT = { anglerX: 96, anglerY: 130, waterY: 142, bobberX: 300, spriteBoxH: 44 };

const SCENES = {
  lake: { art: lakeArt },
  river: { art: riverArt },
  mountainlake: { art: mountainlakeArt },
  swamp: { art: swampArt },
  shoreline: { art: shorelineArt },
  bay: { sky: ['#0a1a2c', '#1a3d5a'], water: ['#0c4a5e', '#062a38'], land: '#20313a', backdrop: 'coast', stand: 'dock' },
  offshore: { sky: ['#050d18', '#0d2a45'], water: ['#083545', '#03161d'], land: '#0f2b24', backdrop: 'open', stand: 'boat' },
};

// The code-drawn fallback was built on a 480x220 canvas; it's stretched to the 16:9 stage.
const FALLBACK_H = 220;
const FALLBACK_WATER_TOP = 140;
const FALLBACK_SCALE = VIEW_H / FALLBACK_H;

function Backdrop({ kind, land }) {
  switch (kind) {
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
  return <g>
    {[28, 78, 128].map((x) => <rect key={x} x={x} y="126" width="8" height="40" fill="#0e1b1f" stroke="#03080b" strokeWidth="2" />)}
    <rect x="0" y="120" width="160" height="10" fill="#172a2e" stroke="#03080b" strokeWidth="2" />
    <path d="M0 124 L160 124" stroke="#03080b" strokeWidth="1.5" strokeDasharray="14 6" />
  </g>;
}

function FallbackBackdrop({ biome, scene }) {
  return <g transform={`scale(1 ${FALLBACK_SCALE})`}>
    <defs>
      <linearGradient id={`sky-${biome}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene.sky[0]} /><stop offset="1" stopColor={scene.sky[1]} /></linearGradient>
      <linearGradient id={`water-${biome}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={scene.water[0]} /><stop offset="1" stopColor={scene.water[1]} /></linearGradient>
      <pattern id="scene-halftone" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="3.5" cy="3.5" r="1" fill="rgba(227,251,20,.08)" /></pattern>
    </defs>
    <rect x="0" y="0" width={VIEW_W} height={FALLBACK_WATER_TOP} fill={`url(#sky-${biome})`} />
    <Backdrop kind={scene.backdrop} land={scene.land} />
    <rect x="0" y={FALLBACK_WATER_TOP} width={VIEW_W} height={FALLBACK_H - FALLBACK_WATER_TOP} fill={`url(#water-${biome})`} />
    <rect x="0" y={FALLBACK_WATER_TOP} width={VIEW_W} height={FALLBACK_H - FALLBACK_WATER_TOP} fill="url(#scene-halftone)" />
    <path d={`M0 ${FALLBACK_WATER_TOP} L${VIEW_W} ${FALLBACK_WATER_TOP}`} stroke="#e3fb14" strokeWidth="1.5" opacity=".5" />
    <Stand kind={scene.stand} land={scene.land} />
  </g>;
}

// Positions the sprite box so its feet anchor lands on (anglerX, anglerY) in viewBox units.
function spriteLayout(anglerX, anglerY, boxH) {
  const boxW = boxH * (VIEW_H / VIEW_W) * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = (anglerX / VIEW_W) * 100 - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = ((VIEW_H - anglerY) / VIEW_H) * 100 - boxH * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${left}%`, bottom: `${bottom}%`, height: `${boxH}%`, width: `${boxW}%` };
}

// The fish and catch zone live in the open water right of the dock, not across the whole stage.
const WATER_X = [36, 98];
const round2 = (value) => Math.round(value * 100) / 100;
const waterLeft = (pos) => round2(WATER_X[0] + (pos / 100) * (WATER_X[1] - WATER_X[0]));
const waterWidth = (width) => round2((width / 100) * (WATER_X[1] - WATER_X[0]));

function AnglerSprite({ x, y, boxH, phase, current }) {
  const { action, frame = 0, play, durationMs, loop } = current;
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteLayout(x, y, boxH),
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
  const painted = Boolean(scene.art);
  const layout = painted
    ? ART_LAYOUT
    : {
      anglerX: scene.stand === 'boat' ? 100 : 88,
      anglerY: (scene.stand === 'boat' ? 120 : 120) * FALLBACK_SCALE,
      waterY: FALLBACK_WATER_TOP * FALLBACK_SCALE,
      bobberX: 300,
      spriteBoxH: 48,
    };
  const current = anglerAction({ phase, result, holding });
  const rodTip = ANGLER_SPRITES[current.action].rodTip;
  const spriteScale = (layout.spriteBoxH / 100) * VIEW_H / SPRITE_FRAME.h;
  const rodTipX = layout.anglerX + (rodTip.x - SPRITE_FRAME.feetX) * spriteScale;
  const rodTipY = layout.anglerY - (SPRITE_FRAME.feetY - rodTip.y) * spriteScale;
  const fishX = reel ? (waterLeft(reel.fishPos) / 100) * VIEW_W : layout.bobberX;
  const fishY = layout.waterY + 60;
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';

  return <div className={`game-scene is-${phase} ${painted ? 'is-painted' : 'is-fallback'}`} data-biome={biome} data-phase={phase}>
    {painted && <img className="scene-backdrop" src={scene.art} alt="" />}
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
      {!painted && <FallbackBackdrop biome={biome} scene={scene} />}
      {lineOut && <path
        className="scene-line"
        d={phase === 'reeling' ? `M${rodTipX} ${rodTipY} L${fishX} ${fishY}` : `M${rodTipX} ${rodTipY} Q${(rodTipX + layout.bobberX) / 2} ${rodTipY - 30} ${layout.bobberX} ${layout.waterY + 4}`}
        stroke="#e7f4ef" strokeWidth="1.2" fill="none" opacity=".85"
      />}
      {(phase === 'waiting' || phase === 'hookset') && <circle className="scene-bobber" cx={layout.bobberX} cy={layout.waterY + 2} r="5" fill="#ff5a1f" stroke="#03080b" strokeWidth="1.5" />}
      {phase === 'hookset' && <g className="scene-splash">
        <circle cx={layout.bobberX} cy={layout.waterY + 2} r="10" fill="none" stroke="#e3fb14" strokeWidth="2" />
        <circle cx={layout.bobberX} cy={layout.waterY + 2} r="18" fill="none" stroke="#e3fb14" strokeWidth="1.5" opacity=".6" />
      </g>}
      <text x={layout.anglerX} y={layout.anglerY + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill="#e3fb14" stroke="#03080b" strokeWidth="2.5" paintOrder="stroke" fontFamily="Oswald, Arial Narrow, sans-serif" letterSpacing="1">{(displayName || 'YOU').toUpperCase()}</text>
    </svg>
    <AnglerSprite x={layout.anglerX} y={layout.anglerY} boxH={layout.spriteBoxH} phase={phase} current={current} />
    {phase === 'reeling' && reel && <>
      <div className="reel-zone scene-zone" style={{ left: `${waterLeft(reel.zonePos - zoneWidth / 2)}%`, width: `${waterWidth(zoneWidth)}%`, top: `${((layout.waterY + 12) / VIEW_H) * 100}%` }} />
      <FishIllustration species={species} className="reel-fish scene-fish" style={{ left: `${waterLeft(reel.fishPos)}%`, top: `${((fishY - 22) / VIEW_H) * 100}%` }} />
    </>}
    {phase === 'result' && result?.success && <FishIllustration species={result.species} className="scene-trophy" />}
  </div>;
}
