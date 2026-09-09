import React from 'react';
import FishIllustration from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import { ANGLER_SPRITES, SPRITE_FRAME, anglerAction } from '../../utils/anglerSprites';
import riverArt from '../../assets/scenes/river.webp';
import mountainlakeArt from '../../assets/scenes/mountainlake.webp';
import swampArt from '../../assets/scenes/swamp.webp';
import bayArt from '../../assets/scenes/bay.webp';
import shorelineArt from '../../assets/scenes/shoreline.webp';
import offshoreArt from '../../assets/scenes/offshore.webp';
import canyonArt from '../../assets/scenes/canyon.webp';

// The 2D stage for Cast & Catch, a 16:9 layered scene: a pixel-art backdrop per biome, the
// angler sprite, and an SVG overlay for the line, bobber, strike splash, and the real
// person's name tag. The six shore biomes are painted around the same dock, so the angler
// keeps one spot on the deck; offshore puts him on the charter's cockpit floor instead. The
// fish stays the site's PNG sticker art, laid over the water as HTML rather than redrawn, per
// the repo rule that fish are never abstract glyphs. The angler, line and splash only move on
// the player's actions; the world around them (SceneAmbience) is what keeps the stage alive.
const VIEW_W = 480;
const VIEW_H = 270;

// Where things sit (viewBox units): where the angler's feet go, the water surface the bobber
// floats at, how far out the cast lands, and how tall the sprite box is (% of stage height).
const DOCK_LAYOUT = { anglerX: 96, anglerY: 130, waterY: 142, bobberX: 300, spriteBoxH: 32 };
const BOAT_LAYOUT = { anglerX: 100, anglerY: 173, waterY: 150, bobberX: 320, spriteBoxH: 32 };
// The Canyon is painted from the cockpit: the angler stands on the deck right of the chair.
const CANYON_LAYOUT = { anglerX: 150, anglerY: 222, waterY: 150, bobberX: 340, spriteBoxH: 32 };

const SCENES = {
  river: { art: riverArt, layout: DOCK_LAYOUT },
  mountainlake: { art: mountainlakeArt, layout: DOCK_LAYOUT },
  swamp: { art: swampArt, layout: DOCK_LAYOUT },
  bay: { art: bayArt, layout: DOCK_LAYOUT },
  shoreline: { art: shorelineArt, layout: DOCK_LAYOUT },
  offshore: { art: offshoreArt, layout: BOAT_LAYOUT },
  canyon: { art: canyonArt, layout: CANYON_LAYOUT },
};

// The fish and catch zone live in the open water right of the dock/boat, not the whole stage.
const WATER_X = [36, 98];

// The burst around a landed fish. Rarity decides how many of these light up (see CSS).
const SPARKLES = [
  { x: 22, y: 8, delay: 0 }, { x: 44, y: 4, delay: 0.12 }, { x: 50, y: 30, delay: 0.24 }, { x: 18, y: 34, delay: 0.3 },
  { x: 34, y: 42, delay: 0.42 }, { x: 12, y: 18, delay: 0.5 }, { x: 56, y: 16, delay: 0.58 }, { x: 40, y: 22, delay: 0.66 },
];
const round2 = (value) => Math.round(value * 100) / 100;
const waterLeft = (pos) => round2(WATER_X[0] + (pos / 100) * (WATER_X[1] - WATER_X[0]));
const waterWidth = (width) => round2((width / 100) * (WATER_X[1] - WATER_X[0]));

// Positions the sprite box so its feet anchor lands on (anglerX, anglerY) in viewBox units.
function spriteLayout(anglerX, anglerY, boxH) {
  const boxW = boxH * (VIEW_H / VIEW_W) * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = (anglerX / VIEW_W) * 100 - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = ((VIEW_H - anglerY) / VIEW_H) * 100 - boxH * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${left}%`, bottom: `${bottom}%`, height: `${boxH}%`, width: `${boxW}%` };
}

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

export default function GameScene({ biome, phase, displayName, species, reel, zoneWidth = 0, result, holding = false, travel = null, period = 'day' }) {
  const scene = SCENES[biome] || SCENES.river;
  const layout = scene.layout;
  const current = anglerAction({ phase, result, holding });
  const rodTip = ANGLER_SPRITES[current.action].rodTip;
  const spriteScale = (layout.spriteBoxH / 100) * VIEW_H / SPRITE_FRAME.h;
  const rodTipX = layout.anglerX + (rodTip.x - SPRITE_FRAME.feetX) * spriteScale;
  const rodTipY = layout.anglerY - (SPRITE_FRAME.feetY - rodTip.y) * spriteScale;
  const fishX = reel ? (waterLeft(reel.fishPos) / 100) * VIEW_W : layout.bobberX;
  const fishY = layout.waterY + 60;
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';

  return <div className={`game-scene is-${phase}`} data-biome={biome} data-phase={phase} data-period={period}>
    <img key={biome} className="scene-backdrop" src={scene.art} alt="" />
    {/* Time of day is a tint over the painting (multiply), not a second set of backdrops. */}
    <div className={`scene-tint is-${period}`} aria-hidden="true" />
    <SceneAmbience biome={biome} phase={phase} period={period} />
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
      {lineOut && <path
        className="scene-line"
        d={phase === 'reeling' ? `M${rodTipX} ${rodTipY} L${fishX} ${fishY}` : `M${rodTipX} ${rodTipY} Q${(rodTipX + layout.bobberX) / 2} ${rodTipY - 30} ${layout.bobberX} ${layout.waterY + 4}`}
        stroke="#e7f4ef" strokeWidth="1.2" fill="none" opacity=".85"
      />}
      {phase === 'waiting' && <circle className="scene-ripple" cx={layout.bobberX} cy={layout.waterY + 2} r="12" fill="none" stroke="#e7f4ef" strokeWidth="1.2" />}
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
    {phase === 'result' && result?.success && <>
      <FishIllustration species={result.species} className="scene-trophy" />
      <div className={`scene-sparkles is-${result.rarity || 'common'}`} aria-hidden="true">
        {SPARKLES.map((sparkle, index) => <span key={index} style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, animationDelay: `${sparkle.delay}s` }} />)}
      </div>
    </>}
    {travel && <TravelTransition vehicle={travel.vehicle} toBiome={travel.to} />}
  </div>;
}
