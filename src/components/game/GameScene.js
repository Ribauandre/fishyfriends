import React from 'react';
import FishIllustration from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import { LURE_ICONS } from '../../utils/gameProps';
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
// The angler stands near the end of the dock, clear of the HUD signage in the top-left and
// closer to the middle of the frame.
const DOCK_LAYOUT = { anglerX: 175, anglerY: 134, waterY: 142, bobberX: 300, spriteBoxH: 32 };
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

// How far a cast lands: power 0-100 from the meter maps to a spot around the layout's default.
const landingFor = (layout, power) => Math.round(layout.bobberX - 70 + Math.max(0, Math.min(100, power)) * 1.2);
const pct = (value, of) => `${round2((value / of) * 100)}%`;

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

// Play happens on the stage: `interaction` makes the whole scene a tap (or hold) surface for
// the current phase, and the meters — cast power beside the rod, the lure's rhythm or speed
// gauge over the lure, the hookset ring on the strike, tension at the angler and progress
// over the water — are drawn where the action is. The dock keeps a labelled button for the
// same action so every step works by keyboard too.
export default function GameScene({
  biome, phase, displayName, species, reel, zoneWidth = 0, result, holding = false, travel = null, period = 'day',
  interaction = null, castFillRef = null, castDistance = 60, lure = 'livebait', lureDisplay = null, lureFeedback = '',
  hooksetWindowMs = 0, tension = 0, callout = '',
}) {
  const scene = SCENES[biome] || SCENES.river;
  const layout = scene.layout;
  const current = anglerAction({ phase, result, holding });
  const rodTip = ANGLER_SPRITES[current.action].rodTip;
  const spriteScale = (layout.spriteBoxH / 100) * VIEW_H / SPRITE_FRAME.h;
  const rodTipX = layout.anglerX + (rodTip.x - SPRITE_FRAME.feetX) * spriteScale;
  const rodTipY = layout.anglerY - (SPRITE_FRAME.feetY - rodTip.y) * spriteScale;
  const landingX = landingFor(layout, castDistance);
  const fishX = reel ? (waterLeft(reel.fishPos) / 100) * VIEW_W : landingX;
  const fishY = layout.waterY + 60;
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';
  const working = lure !== 'livebait' && lureDisplay && (phase === 'waiting' || phase === 'hookset');
  // A worked lure travels back from where it landed toward the rod as line comes in.
  const retrieve = working ? (lure === 'jerkbait' ? (lureDisplay.lineOut ?? 100) : 100 - (lureDisplay.distance || 0)) : 100;
  const lureX = working ? rodTipX + (landingX - rodTipX) * (retrieve / 100) : landingX;
  const strikeX = working ? lureX : landingX;
  const strikeY = layout.waterY + 2;
  const gauge = phase === 'waiting' && working ? (lure === 'jerkbait'
    ? { band: [55, 80], marker: lureDisplay.marker || 0, fill: lureDisplay.attraction || 0 }
    : { band: [(lureDisplay.bandCenter || 50) - 11, (lureDisplay.bandCenter || 50) + 11], marker: lureDisplay.speed || 0, fill: lureDisplay.attraction || 0 }) : null;
  const hold = Boolean(interaction?.onHoldStart);
  // Meters go on the angler's left, over the deck, so they never sit on the rod arm.
  const meterLeft = pct(layout.anglerX - 46, VIEW_W);
  const meterBottom = pct(VIEW_H - layout.anglerY, VIEW_H);

  return <div className={`game-scene is-${phase}`} data-biome={biome} data-phase={phase} data-period={period}>
    <img key={biome} className="scene-backdrop" src={scene.art} alt="" />
    {/* Time of day is a tint over the painting (multiply), not a second set of backdrops. */}
    <div className={`scene-tint is-${period}`} aria-hidden="true" />
    <SceneAmbience biome={biome} phase={phase} period={period} />
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
      {lineOut && <path
        className="scene-line"
        d={phase === 'reeling' ? `M${rodTipX} ${rodTipY} L${fishX} ${fishY}` : `M${rodTipX} ${rodTipY} Q${(rodTipX + strikeX) / 2} ${rodTipY - 30} ${strikeX} ${strikeY + 2}`}
        stroke={phase === 'reeling' && tension > 70 ? '#ff5a1f' : '#e7f4ef'} strokeWidth={phase === 'reeling' ? 1.2 + tension / 60 : 1.2} fill="none" opacity=".85"
      />}
      {phase === 'waiting' && !working && <circle className="scene-ripple" cx={landingX} cy={strikeY} r="12" fill="none" stroke="#e7f4ef" strokeWidth="1.2" />}
      {(phase === 'waiting' || phase === 'hookset') && !working && <circle className="scene-bobber" cx={landingX} cy={strikeY} r="5" fill="#ff5a1f" stroke="#03080b" strokeWidth="1.5" />}
      {phase === 'hookset' && <g className="scene-splash">
        <circle cx={strikeX} cy={strikeY} r="10" fill="none" stroke="#e3fb14" strokeWidth="2" />
        <circle cx={strikeX} cy={strikeY} r="18" fill="none" stroke="#e3fb14" strokeWidth="1.5" opacity=".6" />
      </g>}
      <text x={layout.anglerX} y={layout.anglerY + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill="#e3fb14" stroke="#03080b" strokeWidth="2.5" paintOrder="stroke" fontFamily="Oswald, Arial Narrow, sans-serif" letterSpacing="1">{(displayName || 'YOU').toUpperCase()}</text>
    </svg>
    <AnglerSprite x={layout.anglerX} y={layout.anglerY} boxH={layout.spriteBoxH} phase={phase} current={current} />
    {working && <img className={`scene-lure ${phase === 'waiting' && lure === 'crankbait' ? 'is-wobbling' : ''}`} src={LURE_ICONS[lure]} alt="" data-lure={lure} style={{ left: pct(lureX, VIEW_W), top: pct(strikeY, VIEW_H) }} />}

    {phase === 'casting' && <div className="stage-meter is-cast" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" ref={castFillRef} />
      <span className="stage-meter-band" style={{ bottom: '40%', height: '20%' }} />
    </div>}
    {gauge && <div className={`stage-gauge is-${lure}`} style={{ left: pct(lureX, VIEW_W), top: pct(layout.waterY - 30, VIEW_H) }} aria-hidden="true">
      <span className="stage-gauge-track">
        <span className="stage-gauge-band" style={{ left: `${round2(gauge.band[0])}%`, width: `${round2(gauge.band[1] - gauge.band[0])}%` }} />
        <span className="stage-gauge-marker" style={{ left: `${round2(gauge.marker)}%` }} />
      </span>
      <span className="stage-gauge-fill"><span style={{ width: `${round2(gauge.fill)}%` }} /></span>
      {lureFeedback && <span key={lureFeedback} className="stage-feedback">{lureFeedback}</span>}
    </div>}
    {phase === 'hookset' && <span className="scene-hook-ring" style={{ left: pct(strikeX, VIEW_W), top: pct(strikeY, VIEW_H), animationDuration: `${hooksetWindowMs || 600}ms` }} aria-hidden="true" />}
    {phase === 'reeling' && reel && <>
      <div className="reel-zone scene-zone" style={{ left: `${waterLeft(reel.zonePos - zoneWidth / 2)}%`, width: `${waterWidth(zoneWidth)}%`, top: `${((layout.waterY + 12) / VIEW_H) * 100}%` }} />
      <FishIllustration species={species} className="reel-fish scene-fish" style={{ left: `${waterLeft(reel.fishPos)}%`, top: `${((fishY - 22) / VIEW_H) * 100}%` }} />
      <div className="stage-meter is-tension" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
        <span className="stage-meter-fill" style={{ height: `${round2(Math.min(100, tension))}%` }} />
      </div>
      <div className="stage-progress" style={{ left: `${waterLeft(0)}%`, width: `${waterWidth(100)}%`, top: pct(layout.waterY - 8, VIEW_H) }} aria-hidden="true">
        <span style={{ width: `${round2(reel.progress || 0)}%` }} />
      </div>
    </>}
    {callout && <p className={`stage-callout ${phase === 'hookset' ? 'is-alert' : ''}`} data-phase={phase}>{callout}</p>}

    {phase === 'result' && result?.success && <>
      <FishIllustration species={result.species} className="scene-trophy" />
      <div className={`scene-sparkles is-${result.rarity || 'common'}`} aria-hidden="true">
        {SPARKLES.map((sparkle, index) => <span key={index} style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, animationDelay: `${sparkle.delay}s` }} />)}
      </div>
    </>}
    {interaction && <button
      type="button"
      className={`scene-action ${hold ? 'is-hold' : ''}`}
      aria-label={interaction.label}
      onClick={hold ? undefined : interaction.onTap}
      onPointerDown={hold ? interaction.onHoldStart : undefined}
      onPointerUp={hold ? interaction.onHoldEnd : undefined}
      onPointerLeave={hold ? interaction.onHoldEnd : undefined}
      onPointerCancel={hold ? interaction.onHoldEnd : undefined}
    />}
    {travel && <TravelTransition vehicle={travel.vehicle} toBiome={travel.to} />}
  </div>;
}
