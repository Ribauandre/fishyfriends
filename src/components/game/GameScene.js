import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import { LURE_ICONS, GOLDEN_PENNANT } from '../../utils/gameProps';
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
// Scene units: the paintings are 16:9, so a full-width stage is 480 x 270 units. The stage
// itself can be taller than that (phones get 4:3, a short desktop window caps the height) —
// the backdrop then crops with object-fit: cover anchored on the dock side, and everything
// positioned here uses the *visible* width in units (`viewW`, measured from the element) so
// the angler, line, bobber and meters stay on the painting no matter the crop.
const VIEW_W = 480;
const VIEW_H = 270;
const VIEW_W_MIN = 300;
const VIEW_W_MAX = 640;

// Where things sit (viewBox units): where the angler's feet go, the water surface the bobber
// floats at, how far out the cast lands, and how tall the sprite box is (% of stage height).
// The angler stands near the end of the dock, clear of the HUD signage in the top-left and
// closer to the middle of the frame.
const DOCK_LAYOUT = { anglerX: 175, anglerY: 134, waterY: 142, bobberX: 300, spriteBoxH: 32, crew: [-60, -114, -166] };
const BOAT_LAYOUT = { anglerX: 100, anglerY: 173, waterY: 150, bobberX: 320, spriteBoxH: 32, crew: [-58] };
// The Canyon is painted from the cockpit: the angler stands on the deck right of the chair.
const CANYON_LAYOUT = { anglerX: 150, anglerY: 222, waterY: 150, bobberX: 340, spriteBoxH: 32, crew: [-70, -128] };

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
const landingFor = (layout, power, viewW) => Math.min(viewW - 24, Math.round(layout.bobberX - 70 + Math.max(0, Math.min(100, power)) * 1.2));
const pct = (value, of) => `${round2((value / of) * 100)}%`;

// Other club members on this ground (Realtime presence, see joinDock in AuthContext) stand
// behind the player along the deck, in whatever pose their own game is in. `crew` slots are
// x offsets from the player's feet; anyone past the last slot is counted on a tag instead.
const RECENT_CATCH_MS = 9000;
// Where a sprite's rod tip is, in units, for the pose it's holding — the pennant hangs there.
function rodTipFor(x, y, boxH, action) {
  const tip = ANGLER_SPRITES[action].rodTip;
  const scale = (boxH / 100) * VIEW_H / SPRITE_FRAME.h;
  return { x: x + (tip.x - SPRITE_FRAME.feetX) * scale, y: y - (SPRITE_FRAME.feetY - tip.y) * scale };
}

function Pennant({ tip, viewW }) {
  return <span
    className="scene-pennant"
    data-cosmetic="golden-pennant"
    style={{ left: pct(tip.x, viewW), top: pct(tip.y, VIEW_H), backgroundImage: `url(${GOLDEN_PENNANT.src})`, backgroundSize: `${GOLDEN_PENNANT.frames * 100}% 100%` }}
  />;
}

function crewAction(other) {
  const phase = other.phase || 'ready';
  return anglerAction({ phase, result: { success: phase === 'result' && Boolean(other.species) }, holding: phase === 'reeling' });
}

// The fish and catch zone live in the open water right of the dock/boat, not the whole stage:
// in units, from just past the dock's end to a hair inside the visible right edge.
const WATER_START = 172.8;
const WATER_END_INSET = 9.6;
const waterSpan = (viewW) => [WATER_START, viewW - WATER_END_INSET];

// The burst around a landed fish. Rarity decides how many of these light up (see CSS).
const SPARKLES = [
  { x: 22, y: 8, delay: 0 }, { x: 44, y: 4, delay: 0.12 }, { x: 50, y: 30, delay: 0.24 }, { x: 18, y: 34, delay: 0.3 },
  { x: 34, y: 42, delay: 0.42 }, { x: 12, y: 18, delay: 0.5 }, { x: 56, y: 16, delay: 0.58 }, { x: 40, y: 22, delay: 0.66 },
];
const round2 = (value) => Math.round(value * 100) / 100;
const waterLeftAt = (pos, viewW) => { const [a, z] = waterSpan(viewW); return round2(((a + (pos / 100) * (z - a)) / viewW) * 100); };
const waterWidthAt = (width, viewW) => { const [a, z] = waterSpan(viewW); return round2((((width / 100) * (z - a)) / viewW) * 100); };

// Positions the sprite box so its feet anchor lands on (anglerX, anglerY) in viewBox units.
function spriteLayout(anglerX, anglerY, boxH, viewW) {
  const boxW = boxH * (VIEW_H / viewW) * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = (anglerX / viewW) * 100 - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = ((VIEW_H - anglerY) / VIEW_H) * 100 - boxH * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${left}%`, bottom: `${bottom}%`, height: `${boxH}%`, width: `${boxW}%` };
}

function AnglerSprite({ x, y, boxH, phase, current, className = '', viewW = VIEW_W }) {
  const { action, frame = 0, play, durationMs, loop } = current;
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteLayout(x, y, boxH, viewW),
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
    className={`scene-sprite ${className} ${play ? (loop ? 'is-looping' : 'is-playing') : ''}`}
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
  hooksetWindowMs = 0, tension = 0, callout = '', others = [], now = Date.now, champion = false,
}) {
  const scene = SCENES[biome] || SCENES.river;
  const layout = scene.layout;
  const stageRef = useRef(null);
  const [viewW, setViewW] = useState(VIEW_W);
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof ResizeObserver !== 'function') return undefined;
    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 0 && height > 0) setViewW(Math.max(VIEW_W_MIN, Math.min(VIEW_W_MAX, Math.round((VIEW_H * width) / height))));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const waterLeft = (pos) => waterLeftAt(pos, viewW);
  const waterWidth = (width) => waterWidthAt(width, viewW);
  const current = anglerAction({ phase, result, holding });
  const rodTip = ANGLER_SPRITES[current.action].rodTip;
  const spriteScale = (layout.spriteBoxH / 100) * VIEW_H / SPRITE_FRAME.h;
  const rodTipX = layout.anglerX + (rodTip.x - SPRITE_FRAME.feetX) * spriteScale;
  const rodTipY = layout.anglerY - (SPRITE_FRAME.feetY - rodTip.y) * spriteScale;
  const landingX = landingFor(layout, castDistance, viewW);
  const fishX = reel ? (waterLeft(reel.fishPos) / 100) * viewW : landingX;
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
  const meterLeft = pct(layout.anglerX - 46, viewW);
  const meterBottom = pct(VIEW_H - layout.anglerY, VIEW_H);
  const crewSlots = layout.crew || [];
  const crewShown = others.slice(0, crewSlots.length);
  const crewExtra = others.length - crewShown.length;

  return <div ref={stageRef} className={`game-scene is-${phase}`} data-biome={biome} data-phase={phase} data-period={period} data-view-w={viewW}>
    <img key={biome} className="scene-backdrop" src={scene.art} alt="" />
    {/* Time of day is a tint over the painting (multiply), not a second set of backdrops. */}
    <div className={`scene-tint is-${period}`} aria-hidden="true" />
    <SceneAmbience biome={biome} phase={phase} period={period} viewW={viewW} />
    <svg viewBox={`0 0 ${viewW} ${VIEW_H}`} preserveAspectRatio="none" className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
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
      <text className={champion ? 'is-champion' : ''} x={layout.anglerX} y={layout.anglerY + 16} textAnchor="middle" fontSize="9" fontWeight="700" fill={champion ? '#ffc93c' : '#e3fb14'} stroke="#03080b" strokeWidth="2.5" paintOrder="stroke" fontFamily="Oswald, Arial Narrow, sans-serif" letterSpacing="1">{(displayName || 'YOU').toUpperCase()}</text>
    </svg>
    {crewShown.map((other, index) => {
      const x = layout.anglerX + crewSlots[index];
      const action = crewAction(other);
      const recent = other.lastCatch && now() - other.lastCatch.at < RECENT_CATCH_MS;
      const crewTip = other.champion ? rodTipFor(x, layout.anglerY + 2, layout.spriteBoxH * 0.92, action.action) : null;
      return <React.Fragment key={other.userId}>
        <AnglerSprite x={x} y={layout.anglerY + 2} boxH={layout.spriteBoxH * 0.92} phase={`crew-${other.phase || 'ready'}`} current={action} className="is-crew" viewW={viewW} />
        {crewTip && <Pennant tip={crewTip} viewW={viewW} />}
        <span className={`scene-crew-tag ${other.champion ? 'is-champion' : ''}`} data-user={other.userId} style={{ left: pct(x, viewW), top: pct(layout.anglerY + 8, VIEW_H) }}>{(other.name || 'Angler').toUpperCase()}</span>
        {recent && <span className="scene-crew-bubble" style={{ left: pct(x, viewW), top: pct(layout.anglerY - 66, VIEW_H) }}>Landed a {String(other.lastCatch.species).toLowerCase()}!</span>}
      </React.Fragment>;
    })}
    {crewExtra > 0 && <span className="scene-crew-more" style={{ left: pct(layout.anglerX + crewSlots[crewSlots.length - 1] - 40, viewW), top: pct(layout.anglerY - 50, VIEW_H) }}>+{crewExtra} more</span>}
    <AnglerSprite x={layout.anglerX} y={layout.anglerY} boxH={layout.spriteBoxH} phase={phase} current={current} className="is-you" viewW={viewW} />
    {champion && <Pennant tip={{ x: rodTipX, y: rodTipY }} viewW={viewW} />}
    {working && <img className={`scene-lure ${phase === 'waiting' && lure === 'crankbait' ? 'is-wobbling' : ''}`} src={LURE_ICONS[lure]} alt="" data-lure={lure} style={{ left: pct(lureX, viewW), top: pct(strikeY, VIEW_H) }} />}

    {phase === 'casting' && <div className="stage-meter is-cast" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" ref={castFillRef} />
      <span className="stage-meter-band" style={{ bottom: '40%', height: '20%' }} />
    </div>}
    {gauge && <div className={`stage-gauge is-${lure}`} style={{ left: pct(lureX, viewW), top: pct(layout.waterY - 30, VIEW_H) }} aria-hidden="true">
      <span className="stage-gauge-track">
        <span className="stage-gauge-band" style={{ left: `${round2(gauge.band[0])}%`, width: `${round2(gauge.band[1] - gauge.band[0])}%` }} />
        <span className="stage-gauge-marker" style={{ left: `${round2(gauge.marker)}%` }} />
      </span>
      <span className="stage-gauge-fill"><span style={{ width: `${round2(gauge.fill)}%` }} /></span>
      {lureFeedback && <span key={lureFeedback} className="stage-feedback">{lureFeedback}</span>}
    </div>}
    {phase === 'hookset' && <span className="scene-hook-ring" style={{ left: pct(strikeX, viewW), top: pct(strikeY, VIEW_H), animationDuration: `${hooksetWindowMs || 600}ms` }} aria-hidden="true" />}
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
