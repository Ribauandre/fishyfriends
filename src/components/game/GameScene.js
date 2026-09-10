import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import { LURE_ICONS, GOLDEN_PENNANT } from '../../utils/gameProps';
import { LURES } from '../../utils/gameLures';
import { MEND_ZONE } from '../../utils/lurePhysics';
import { ANGLER_SPRITES, SPRITE_FRAME, anglerAction } from '../../utils/anglerSprites';
import {
  PAINT_H, layoutFor, viewWidthFor, frameFor, stageX, stageY, stageLen, pctX, pctY, pctW, pctH,
  waterSpan, landingX as landingFor, reelX, cameraFor, cameraTransform, REST_CAMERA,
} from '../../utils/sceneLayout';
import riverArt from '../../assets/scenes/river.webp';
import mountainlakeArt from '../../assets/scenes/mountainlake.webp';
import swampArt from '../../assets/scenes/swamp.webp';
import bayArt from '../../assets/scenes/bay.webp';
import shorelineArt from '../../assets/scenes/shoreline.webp';
import offshoreArt from '../../assets/scenes/offshore.webp';
import canyonArt from '../../assets/scenes/canyon.webp';

// The 2D stage for Cast & Catch: a pixel-art backdrop per biome, the angler sprite, and an SVG
// overlay for the line, bobber, strike splash and the real person's name tag. The five shore
// paintings share one dock; the charter and the Canyon put the angler on a boat. The fish stays
// the site's PNG sticker art laid over the water, per the repo rule that fish are never
// abstract glyphs. The angler, line and splash only move on the player's actions; the world
// around them (SceneAmbience) is what keeps the stage alive.
//
// Geometry: every anchor lives in painting units in utils/sceneLayout.js; this component
// measures its own box (viewW), works out how the painting is cropped into it (frameFor),
// and draws everything in stage units. The world layer (backdrop, ambience, sprites, line,
// fish) is what the camera moves; the meters, callout, trophy and tap surface stay in screen
// space above it.
const ART = { river: riverArt, mountainlake: mountainlakeArt, swamp: swampArt, bay: bayArt, shoreline: shorelineArt, offshore: offshoreArt, canyon: canyonArt };
const CREW_SCALE = 0.9;
const RECENT_CATCH_MS = 9000;
const round2 = (value) => Math.round(value * 100) / 100;

// The burst around a landed fish. Rarity decides how many of these light up (see CSS).
const SPARKLES = [
  { x: 22, y: 8, delay: 0 }, { x: 44, y: 4, delay: 0.12 }, { x: 50, y: 30, delay: 0.24 }, { x: 18, y: 34, delay: 0.3 },
  { x: 34, y: 42, delay: 0.42 }, { x: 12, y: 18, delay: 0.5 }, { x: 56, y: 16, delay: 0.58 }, { x: 40, y: 22, delay: 0.66 },
];

// Where a sprite's rod tip is, in stage units, for the pose it's holding — the line leaves
// from there and the pennant hangs there. `feet` and `boxH` are stage units.
function rodTipFor(feet, boxH, action) {
  const tip = ANGLER_SPRITES[action].rodTip;
  const scale = boxH / SPRITE_FRAME.h;
  return { x: round2(feet.x + (tip.x - SPRITE_FRAME.feetX) * scale), y: round2(feet.y - (SPRITE_FRAME.feetY - tip.y) * scale) };
}

// Positions the sprite box so its feet anchor lands on `feet` (stage units); boxH in stage units.
function spriteStyle(feet, boxH, viewW) {
  const boxW = boxH * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = feet.x - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = (PAINT_H - feet.y) - boxH * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${round2((left / viewW) * 100)}%`, bottom: pctY(bottom), height: pctY(boxH), width: `${round2((boxW / viewW) * 100)}%` };
}

function AnglerSprite({ feet, boxH, phase, current, className = '', viewW }) {
  const { action, frame = 0, play, durationMs, loop } = current;
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteStyle(feet, boxH, viewW),
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

function Pennant({ tip, frame }) {
  return <span
    className="scene-pennant"
    data-cosmetic="golden-pennant"
    style={{ left: pctX(tip.x, frame), top: pctY(tip.y), width: pctW(24, frame), backgroundImage: `url(${GOLDEN_PENNANT.src})`, backgroundSize: `${GOLDEN_PENNANT.frames * 100}% 100%` }}
  />;
}

function crewAction(other) {
  const phase = other.phase || 'ready';
  return anglerAction({ phase, result: { success: phase === 'result' && Boolean(other.species) }, holding: phase === 'reeling' });
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
  castBand = [40, 60], rise = null,
}) {
  const layout = layoutFor(biome);
  const art = ART[biome] || ART.river;
  const stageRef = useRef(null);
  const [viewW, setViewW] = useState(480);
  useEffect(() => {
    const node = stageRef.current;
    if (!node || typeof ResizeObserver !== 'function') return undefined;
    const measure = () => { const { width, height } = node.getBoundingClientRect(); if (width > 0 && height > 0) setViewW(viewWidthFor(width, height)); };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const frame = frameFor(viewW, layout.crop);

  // The angler, in stage units.
  const feet = { x: stageX(layout.angler.x, frame), y: stageY(layout.angler.y, frame) };
  const spriteH = stageLen(layout.spriteH, frame);
  const current = anglerAction({ phase, result, holding });
  const rodTip = rodTipFor(feet, spriteH, current.action);
  const tagY = layout.tagAbove ? feet.y - spriteH - 5 : feet.y + 16;

  // The water: where the cast lands, where the fly drifts and where the fish fights.
  const surfaceY = stageY(layout.cast.y, frame);
  const landing = landingFor(layout, castDistance, frame);
  const fishY = stageY(layout.fishY, frame);
  const fishX = reel ? reelX(layout, reel.fishPos, frame) : landing;
  const [waterA, waterZ] = waterSpan(layout, frame);
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';
  const working = lure !== 'livebait' && lureDisplay && (phase === 'waiting' || phase === 'hookset');
  const drifting = working && LURES[lure]?.interaction === 'drift';
  // A worked lure travels back from where it landed toward the rod as line comes in; a fly
  // goes the other way, drifting down the run from where it landed.
  const retrieve = working ? (lure === 'jerkbait' ? (lureDisplay.lineOut ?? 100) : 100 - (lureDisplay.distance || 0)) : 100;
  const driftRun = Math.max(0, Math.min(stageLen(70, frame), waterZ - landing));
  const lureX = !working ? landing : drifting ? landing + ((lureDisplay.drift || 0) / 100) * driftRun : rodTip.x + (landing - rodTip.x) * (retrieve / 100);
  const riseX = rise === null || rise === undefined ? null : landingFor(layout, rise, frame);
  const strikeX = working ? lureX : landing;
  const gauge = phase === 'waiting' && working ? (lure === 'jerkbait'
    ? { band: [55, 80], marker: lureDisplay.marker || 0, fill: lureDisplay.attraction || 0 }
    : drifting
      ? { band: MEND_ZONE, marker: lureDisplay.drag || 0, fill: lureDisplay.attraction || 0 }
      : { band: [(lureDisplay.bandCenter || 50) - 11, (lureDisplay.bandCenter || 50) + 11], marker: lureDisplay.speed || 0, fill: lureDisplay.attraction || 0 }) : null;
  const hold = Boolean(interaction?.onHoldStart);

  // The camera, and the meters that sit outside it in screen space beside the angler (or at
  // the stage's edge when the push-in has moved past his side).
  const camera = cameraFor(phase, { anglerX: feet.x, anglerY: feet.y, spriteH }, viewW);
  const focused = camera !== REST_CAMERA;
  const meterLeft = pctX(Math.max(8, (feet.x - 46 - camera.x) * camera.scale), frame);
  const meterBottom = pctY(PAINT_H - Math.min(PAINT_H - 8, (feet.y - camera.y) * camera.scale));

  // Other club members on this ground stand along the deck behind the player, in whatever
  // pose their own game is in; anyone past the last slot is counted on a tag instead.
  const crewSlots = layout.crew;
  const crewShown = others.slice(0, crewSlots.length);
  const crewExtra = others.length - crewShown.length;
  const zoneLeft = reel ? reelX(layout, reel.zonePos - zoneWidth / 2, frame) : 0;
  const zoneRight = reel ? reelX(layout, reel.zonePos + zoneWidth / 2, frame) : 0;

  return <div ref={stageRef} className={`game-scene is-${phase} ${focused ? 'is-focused' : ''}`} data-biome={biome} data-phase={phase} data-period={period} data-view-w={viewW}>
    <div className="scene-world" data-camera={phase === 'casting' ? 'cast' : focused ? 'fight' : 'rest'} data-camera-x={camera.x} data-camera-scale={camera.scale} style={{ transform: cameraTransform(camera, viewW) }}>
      <img key={biome} className="scene-backdrop" src={art} alt="" data-crop={layout.crop} />
      {/* Time of day is a tint over the painting (multiply), not a second set of backdrops. */}
      <div className={`scene-tint is-${period}`} aria-hidden="true" />
      <SceneAmbience biome={biome} phase={phase} period={period} viewW={viewW} />
      <svg viewBox={`0 0 ${viewW} ${PAINT_H}`} preserveAspectRatio="none" className="game-scene-svg" role="img" aria-label={`${displayName || 'You'} fishing`}>
        {lineOut && <path
          className="scene-line"
          d={phase === 'reeling' ? `M${rodTip.x} ${rodTip.y} L${fishX} ${fishY}` : `M${rodTip.x} ${rodTip.y} Q${(rodTip.x + strikeX) / 2} ${Math.min(rodTip.y, surfaceY) - 30} ${strikeX} ${surfaceY + 2}`}
          stroke={phase === 'reeling' && tension > 70 ? '#ff5a1f' : '#e7f4ef'} strokeWidth={phase === 'reeling' ? 1.2 + tension / 60 : 1.2} fill="none" opacity=".85"
        />}
        {riseX !== null && <g className="scene-rise" data-rise={rise}>
          <circle cx={riseX} cy={surfaceY} r="4" fill="none" stroke="#e7f4ef" strokeWidth="1" />
          <circle className="scene-rise-ring" cx={riseX} cy={surfaceY} r="9" fill="none" stroke="#e3fb14" strokeWidth="1.2" />
        </g>}
        {phase === 'waiting' && !working && <circle className="scene-ripple" cx={landing} cy={surfaceY} r="12" fill="none" stroke="#e7f4ef" strokeWidth="1.2" />}
        {(phase === 'waiting' || phase === 'hookset') && !working && <circle className="scene-bobber" cx={landing} cy={surfaceY} r="5" fill="#ff5a1f" stroke="#03080b" strokeWidth="1.5" />}
        {phase === 'hookset' && <g className="scene-splash">
          <circle cx={strikeX} cy={surfaceY} r="10" fill="none" stroke="#e3fb14" strokeWidth="2" />
          <circle cx={strikeX} cy={surfaceY} r="18" fill="none" stroke="#e3fb14" strokeWidth="1.5" opacity=".6" />
        </g>}
        <text className={champion ? 'is-champion' : ''} x={feet.x} y={tagY} textAnchor="middle" fontSize="9" fontWeight="700" fill={champion ? '#ffc93c' : '#e3fb14'} stroke="#03080b" strokeWidth="2.5" paintOrder="stroke" fontFamily="Oswald, Arial Narrow, sans-serif" letterSpacing="1">{(displayName || 'YOU').toUpperCase()}</text>
      </svg>
      {crewShown.map((other, index) => {
        const crewFeet = { x: round2(feet.x + stageLen(crewSlots[index], frame)), y: feet.y + 2 };
        const crewH = spriteH * CREW_SCALE;
        const action = crewAction(other);
        const recent = other.lastCatch && now() - other.lastCatch.at < RECENT_CATCH_MS;
        const crewTagY = layout.tagAbove ? crewFeet.y - crewH - 4 : crewFeet.y + 8;
        return <React.Fragment key={other.userId}>
          <AnglerSprite feet={crewFeet} boxH={crewH} phase={`crew-${other.phase || 'ready'}`} current={action} className="is-crew" viewW={viewW} />
          {other.champion && <Pennant tip={rodTipFor(crewFeet, crewH, action.action)} frame={frame} />}
          <span className={`scene-crew-tag ${other.champion ? 'is-champion' : ''}`} data-user={other.userId} style={{ left: pctX(crewFeet.x, frame), top: pctY(crewTagY) }}>{(other.name || 'Angler').toUpperCase()}</span>
          {recent && <span className="scene-crew-bubble" style={{ left: pctX(crewFeet.x, frame), top: pctY(crewFeet.y - crewH - 14) }}>Landed a {String(other.lastCatch.species).toLowerCase()}!</span>}
        </React.Fragment>;
      })}
      {crewExtra > 0 && <span className="scene-crew-more" style={{ left: pctX(feet.x + stageLen(crewSlots[crewSlots.length - 1], frame) - 30, frame), top: pctY(feet.y - spriteH - 4) }}>+{crewExtra} more</span>}
      <AnglerSprite feet={feet} boxH={spriteH} phase={phase} current={current} className="is-you" viewW={viewW} />
      {champion && <Pennant tip={rodTip} frame={frame} />}
      {working && <img className={`scene-lure ${phase === 'waiting' && lure === 'crankbait' ? 'is-wobbling' : ''}`} src={LURE_ICONS[lure]} alt="" data-lure={lure} style={{ left: pctX(lureX, frame), top: pctY(surfaceY), width: pctW(24, frame) }} />}
      {gauge && <div className={`stage-gauge is-${lure}`} style={{ left: pctX(lureX, frame), top: pctY(surfaceY - 32) }} aria-hidden="true">
        <span className="stage-gauge-track">
          <span className="stage-gauge-band" style={{ left: `${round2(gauge.band[0])}%`, width: `${round2(gauge.band[1] - gauge.band[0])}%` }} />
          <span className="stage-gauge-marker" style={{ left: `${round2(gauge.marker)}%` }} />
        </span>
        <span className="stage-gauge-fill"><span style={{ width: `${round2(gauge.fill)}%` }} /></span>
        {lureFeedback && <span key={lureFeedback} className="stage-feedback">{lureFeedback}</span>}
      </div>}
      {phase === 'hookset' && <span className="scene-hook-ring" style={{ left: pctX(strikeX, frame), top: pctY(surfaceY), animationDuration: `${hooksetWindowMs || 600}ms` }} aria-hidden="true" />}
      {phase === 'reeling' && reel && <>
        <div className="reel-zone scene-zone" style={{ left: pctX(zoneLeft, frame), width: pctX(zoneRight - zoneLeft, frame), top: pctY(stageY(layout.water.y0, frame)), height: pctH(layout.water.y1 - layout.water.y0, frame) }} />
        <FishIllustration species={species} className="reel-fish scene-fish" style={{ left: pctX(fishX, frame), top: pctY(fishY), width: pctW(66, frame) }} />
        <div className="stage-progress" style={{ left: pctX(waterA, frame), width: pctX(waterZ - waterA, frame), top: pctY(stageY(layout.water.y0, frame) - 8) }} aria-hidden="true">
          <span style={{ width: `${round2(reel.progress || 0)}%` }} />
        </div>
      </>}
    </div>

    {phase === 'casting' && <div className="stage-meter is-cast" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" ref={castFillRef} />
      <span className="stage-meter-band" style={{ bottom: `${castBand[0]}%`, height: `${castBand[1] - castBand[0]}%` }} />
    </div>}
    {phase === 'reeling' && reel && <div className="stage-meter is-tension" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" style={{ height: `${round2(Math.min(100, tension))}%` }} />
    </div>}
    {callout && <p key={phase} className={`stage-callout ${phase === 'hookset' ? 'is-alert' : ''}`} data-phase={phase}>{callout}</p>}

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
