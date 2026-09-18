import React, { useEffect, useRef, useState } from 'react';
import FishIllustration from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import useAnglerSheets from './useAnglerSheets';
import { LURE_ICONS, GOLDEN_PENNANT, FISH_SHADOW } from '../../utils/gameProps';
import { LURES } from '../../utils/gameLures';
import { RARITY_INFO, sizeFraction, lengthFraction, speciesLabel } from '../../utils/gameSpecies';
import { MEND_ZONE } from '../../utils/lurePhysics';
import { ANGLER_SPRITES, SPRITE_FRAME, anglerAction } from '../../utils/anglerSprites';
import { lookKey, petOf } from '../../utils/anglerLook';
import { petSprite, PET_H, PET_OFFSET } from '../../utils/petSprites';
import {
  PAINT_H, PAINT_W, layoutFor, viewWidthFor, frameFor, stageX, stageY, stageLen, pctX, pctY, pctW, pctH,
  waterSpan, landingX as landingFor, reelX, cameraFor, cameraTransform, REST_CAMERA,
} from '../../utils/sceneLayout';
import riverArt from '../../assets/scenes/river.webp';
import mountainlakeArt from '../../assets/scenes/mountainlake.webp';
import swampArt from '../../assets/scenes/swamp.webp';
import bayArt from '../../assets/scenes/bay.webp';
import shorelineArt from '../../assets/scenes/shoreline.webp';
import offshoreArt from '../../assets/scenes/offshore.webp';
import canyonArt from '../../assets/scenes/canyon.webp';
import flatsArt from '../../assets/scenes/flats.webp';
import pierArt from '../../assets/scenes/pier.webp';
import creekArt from '../../assets/scenes/creek.webp';
import mountainlakeWinterArt from '../../assets/scenes/mountainlake_winter.webp';
import bajaArt from '../../assets/scenes/baja.webp';
import riverNight from '../../assets/scenes/river_night.webp';
import mountainlakeNight from '../../assets/scenes/mountainlake_night.webp';
import swampNight from '../../assets/scenes/swamp_night.webp';
import bayNight from '../../assets/scenes/bay_night.webp';
import shorelineNight from '../../assets/scenes/shoreline_night.webp';
import offshoreNight from '../../assets/scenes/offshore_night.webp';
import canyonNight from '../../assets/scenes/canyon_night.webp';
import flatsNight from '../../assets/scenes/flats_night.webp';
import pierNight from '../../assets/scenes/pier_night.webp';
import creekNight from '../../assets/scenes/creek_night.webp';
import mountainlakeWinterNight from '../../assets/scenes/mountainlake_winter_night.webp';
import bajaNight from '../../assets/scenes/baja_night.webp';
import { sceneKeyFor } from '../../utils/sceneLayout';

// The 2D stage for Cast & Catch: a pixel-art backdrop per biome, the angler sprite, and an SVG
// overlay for the line, bobber, strike splash and the real person's name tag. The five shore
// paintings share one dock; the charter, the Canyon and the Flats put the angler on a boat. The fish stays
// the site's PNG sticker art laid over the water, per the repo rule that fish are never
// abstract glyphs. The angler, line and splash only move on the player's actions; the world
// around them (SceneAmbience) is what keeps the stage alive.
//
// Geometry: every anchor lives in painting units in utils/sceneLayout.js; this component
// measures its own box (viewW), works out how the painting is cropped into it (frameFor),
// and draws everything in stage units. The world layer (backdrop, ambience, sprites, line,
// fish) is what the camera moves; the meters, callout, trophy and tap surface stay in screen
// space above it.
const ART = { river: riverArt, mountainlake: mountainlakeArt, swamp: swampArt, bay: bayArt, shoreline: shorelineArt, offshore: offshoreArt, canyon: canyonArt, flats: flatsArt, pier: pierArt, creek: creekArt, 'mountainlake:winter': mountainlakeWinterArt, baja: bajaArt };
// Every ground painted again at night — a moon, stars, the water dark with a moon path, the
// lamps lit — each repainted from its day painting with the composition held, so the layout
// read off the day painting still fits. At night this is the backdrop and the tint is only a
// light one for the sprites; a day painting under a heavy blue tint still had a blue sky.
const NIGHT_ART = { river: riverNight, mountainlake: mountainlakeNight, swamp: swampNight, bay: bayNight, shoreline: shorelineNight, offshore: offshoreNight, canyon: canyonNight, flats: flatsNight, pier: pierNight, creek: creekNight, 'mountainlake:winter': mountainlakeWinterNight, baja: bajaNight };
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

// `sheets` are the strips repainted for a look (useAnglerSheets); without them the stock art shows.
// How much of the dock lamp reaches a sprite, 0 (out of its reach, or daylight) to 1 (under
// it): by the distance from the lamp to the sprite's middle, in painting units, so the
// angler by the post is lit and a crew member at the far slot is barely touched. Dawn and
// dusk get a share of it, night all of it.
export const LAMP_REACH = 250;
const LAMP_SHARE = { dawn: 0.35, dusk: 0.7, night: 1 };
export function lampLight(lamp, feetX, feetY, spriteH, period) {
  if (!lamp || !LAMP_SHARE[period]) return 0;
  const dx = feetX - lamp.x;
  const dy = (feetY - spriteH / 2) - lamp.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return round2(Math.max(0, 1 - distance / LAMP_REACH) * LAMP_SHARE[period]);
}

function AnglerSprite({ feet, boxH, phase, current, className = '', viewW, sheets = null, look = null, lit = 0 }) {
  const { action, frame = 0, play, durationMs, loop } = current;
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteStyle(feet, boxH, viewW),
    backgroundImage: `url(${sheets?.[action] || sprite.src})`,
    backgroundSize: `${sprite.frames * 100}% 100%`,
    backgroundPositionX: `${frame * frameStep}%`,
  };
  // Lamplight on him: brighter and a touch warmer the nearer he stands, drawn before the
  // night tint multiplies everything down, so he comes out lit against the dark.
  if (lit > 0) style.filter = `brightness(${round2(1 + 0.45 * lit)}) sepia(${round2(0.3 * lit)}) saturate(${round2(1 + 0.15 * lit)})`;
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
    data-look={look ? lookKey(look) : undefined}
    data-painted={sheets ? 'yes' : 'no'}
    data-lit={lit > 0 ? lit : undefined}
    style={style}
  />;
}

// The dock pet a look brings (utils/petSprites.js): sat a little behind the angler's heel,
// sized in painting units, and lit by the lamp like him. Two moods: `idle` is the sitting
// strip on a long cycle that holds the first frame and flicks the tail twice near the end
// (pet-idle in App.css, its start offset by where the pet sits so two pets never flick
// together), and `cheer` is the celebration strip looping fast for as long as its angler is
// celebrating a landed fish.
function PetSprite({ petKey, mood = 'idle', feet, viewW, frame, lit = 0, className = '' }) {
  const pet = petSprite(petKey);
  if (!pet) return null;
  const cheering = mood === 'cheer' && Boolean(pet.cheer);
  const strip = cheering ? pet.cheer : pet.idle;
  const boxH = stageLen(strip.unitH, frame);
  const boxW = boxH * (strip.w / strip.h);
  const left = feet.x - boxW * (strip.feetX / strip.w);
  const bottom = (PAINT_H - feet.y) - boxH * (1 - strip.feetY / strip.h);
  const frameStep = 100 / (strip.frames - 1);
  const style = {
    left: `${round2((left / viewW) * 100)}%`, bottom: pctY(bottom), height: pctY(boxH), width: `${round2((boxW / viewW) * 100)}%`,
    backgroundImage: `url(${strip.src})`, backgroundSize: `${strip.frames * 100}% 100%`,
  };
  if (cheering) {
    style['--sprite-end'] = `${(strip.play - 1) * frameStep}%`;
    style.animationDuration = `${strip.durationMs}ms`;
    style.animationTimingFunction = `steps(${strip.play}, jump-none)`;
  } else {
    style['--pet-flick'] = `${frameStep}%`;
    style.animationDuration = `${strip.cycleMs}ms`;
    style.animationDelay = `-${Math.round(feet.x * 37) % strip.cycleMs}ms`;
  }
  if (lit > 0) style.filter = `brightness(${round2(1 + 0.45 * lit)}) sepia(${round2(0.3 * lit)}) saturate(${round2(1 + 0.15 * lit)})`;
  return <div className={`scene-sprite scene-pet ${cheering ? 'is-looping is-cheer' : 'is-idle'} ${className}`} data-pet={petKey} data-mood={cheering ? 'cheer' : 'idle'} data-lit={lit > 0 ? lit : undefined} style={style} />;
}

// A club member's sprite in their own look (each needs its own paint job, so its own hook).
function CrewSprite({ look, ...props }) {
  const sheets = useAnglerSheets(look);
  return <AnglerSprite {...props} sheets={sheets} look={look} />;
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
  hooksetWindowMs = 0, tension = 0, callout = '', others = [], now = Date.now, champion = false, catchSize = null,
  castBand = [40, 60], rise = null, look = null, season = null,
}) {
  const sheets = useAnglerSheets(look);
  const layout = layoutFor(biome, season);
  const sceneKey = sceneKeyFor(biome, season);
  const nightArt = period === 'night' ? NIGHT_ART[sceneKey] || NIGHT_ART[biome] : null;
  const art = nightArt || ART[sceneKey] || ART[biome] || ART.river;
  const stageRef = useRef(null);
  // iOS: a finger moving on the stage is play, never a scroll or a pinch. touch-action on the
  // tap surface covers most of it; this catches the second finger that lands beside it.
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const block = (event) => { if (interaction) event.preventDefault(); };
    node.addEventListener('touchmove', block, { passive: false });
    return () => node.removeEventListener('touchmove', block);
  }, [interaction]);
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
  // The painting's own box in stage units. It is laid out like everything else on the stage
  // rather than fitted by the browser, so a narrow stage — which crops the painting's right
  // rather than shrinking it — still has the rest of it there for the camera to pan across.
  const paintBox = { left: 0, top: pctY(-frame.cropTop * frame.k), width: pctX(stageX(PAINT_W, frame), frame), height: pctY(stageLen(PAINT_H, frame)) };
  const focused = camera !== REST_CAMERA;
  // The meters stand beside the angler, in screen space: to his left when the camera leaves
  // room there, otherwise just past his front foot, so they never sit on him.
  const meterAtBack = (feet.x - 46 - camera.x) * camera.scale;
  const meterLeft = pctX(meterAtBack >= 8 ? meterAtBack : (feet.x + 30 - camera.x) * camera.scale, frame);
  const meterBottom = pctY(PAINT_H - Math.min(PAINT_H - 8, (feet.y - camera.y) * camera.scale));

  // Other club members on this ground stand along the deck behind the player, in whatever
  // pose their own game is in; anyone past the last slot is counted on a tag instead.
  const crewSlots = layout.crew;
  const crewShown = others.slice(0, crewSlots.length);
  const crewExtra = others.length - crewShown.length;
  const zoneLeft = reel ? reelX(layout, reel.zonePos - zoneWidth / 2, frame) : 0;
  const inZone = Boolean(reel) && Math.abs((reel.fishPos || 0) - (reel.zonePos || 0)) <= zoneWidth / 2;
  const zoneRight = reel ? reelX(layout, reel.zonePos + zoneWidth / 2, frame) : 0;

  return <div ref={stageRef} className={`game-scene is-${phase} ${focused ? 'is-focused' : ''}`} data-biome={biome} data-phase={phase} data-period={period} data-night-art={nightArt ? 'yes' : undefined} data-view-w={viewW}>
    <div className="scene-world" data-camera={phase === 'casting' ? 'cast' : focused ? 'fight' : 'rest'} data-camera-x={camera.x} data-camera-scale={camera.scale} style={{ transform: cameraTransform(camera, viewW) }}>
      <img key={`${biome}-${nightArt ? 'night' : 'day'}`} className="scene-backdrop" src={art} alt="" data-crop={layout.crop} style={paintBox} />
      <SceneAmbience biome={biome} period={period} season={season} viewW={viewW} />
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
          <PetSprite petKey={petOf(other.look)} mood={action.action === 'celebrate' ? 'cheer' : 'idle'} feet={{ x: crewFeet.x + stageLen(PET_OFFSET.x * CREW_SCALE, frame), y: crewFeet.y + PET_OFFSET.y }} viewW={viewW} frame={frame} className="is-crew" lit={lampLight(layout.lamp, layout.angler.x + crewSlots[index] + PET_OFFSET.x, layout.angler.y, PET_H, period)} />
          <CrewSprite look={other.look || null} feet={crewFeet} boxH={crewH} phase={`crew-${other.phase || 'ready'}`} current={action} className="is-crew" viewW={viewW} lit={lampLight(layout.lamp, layout.angler.x + crewSlots[index], layout.angler.y, layout.spriteH, period)} />
          {other.champion && <Pennant tip={rodTipFor(crewFeet, crewH, action.action)} frame={frame} />}
          <span className={`scene-crew-tag ${other.champion ? 'is-champion' : ''}`} data-user={other.userId} style={{ left: pctX(crewFeet.x, frame), top: pctY(crewTagY) }}>{(other.name || 'Angler').toUpperCase()}</span>
          {recent && <span className="scene-crew-bubble" style={{ left: pctX(crewFeet.x, frame), top: pctY(crewFeet.y - crewH - 14) }}>Landed a {String(other.lastCatch.species).toLowerCase()}!</span>}
        </React.Fragment>;
      })}
      {crewExtra > 0 && <span className="scene-crew-more" style={{ left: pctX(feet.x + stageLen(crewSlots[crewSlots.length - 1], frame) - 30, frame), top: pctY(feet.y - spriteH - 4) }}>+{crewExtra} more</span>}
      <PetSprite petKey={petOf(look)} mood={current.action === 'celebrate' ? 'cheer' : 'idle'} feet={{ x: feet.x + stageLen(PET_OFFSET.x, frame), y: feet.y + PET_OFFSET.y }} viewW={viewW} frame={frame} className="is-you" lit={lampLight(layout.lamp, layout.angler.x + PET_OFFSET.x, layout.angler.y, PET_H, period)} />
      <AnglerSprite feet={feet} boxH={spriteH} phase={phase} current={current} className="is-you" viewW={viewW} sheets={sheets} look={look} lit={lampLight(layout.lamp, layout.angler.x, layout.angler.y, layout.spriteH, period)} />
      {champion && <Pennant tip={rodTip} frame={frame} />}
      {/* Time of day is a tint (multiply) over everything that is *in* the world — the
          painting, its ambience, the line, the crew and the angler — not a second set of
          backdrops. It sits here, after the sprites, so he is lit like the dock he stands on;
          the play surfaces after it (lure, zone, the fish's mark) stay bright, and the crew's
          name tags float above it by z-index. */}
      <div className={`scene-tint is-${period}`} aria-hidden="true" style={paintBox} />
      {/* The dock lamp, after dark: a bright glow at the lamp head and a wide warm pool of
          light on the deck below it, both screened over the tinted world so they light what
          is under them — the planks, the barrel, the angler if he stands near enough — the
          way a lamp does, instead of glowing under the night like they did in the ambience. */}
      {layout.lamp && period !== 'day' && <>
        <div className={`scene-lamp-pool is-${period}`} aria-hidden="true" style={{ left: pctX(stageX(layout.lamp.x + 34, frame), frame), top: pctY(stageY(layout.lamp.y + 64, frame)), width: pctW(400, frame), height: pctH(250, frame) }} />
        <div className={`scene-lamp is-${period}`} aria-hidden="true" style={{ left: pctX(stageX(layout.lamp.x, frame), frame), top: pctY(stageY(layout.lamp.y, frame)), width: pctW(layout.lamp.r * 2, frame), height: pctH(layout.lamp.r * 2, frame) }} />
      </>}
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
        {/* The zone the fish has to be held in: a bright frame on the water, mint while the fish
            is inside it and coral, pulsing, the moment it isn't — the edge is the whole game. */}
        <div className={`reel-zone scene-zone ${inZone ? 'is-in' : 'is-out'}`} style={{ left: pctX(zoneLeft, frame), width: pctX(zoneRight - zoneLeft, frame), top: pctY(stageY(layout.water.y0, frame)), height: pctH(layout.water.y1 - layout.water.y0, frame) }}>
          <span className="scene-zone-cap is-top" aria-hidden="true" /><span className="scene-zone-cap is-bottom" aria-hidden="true" />
        </div>
        {/* The point that counts: the fish is judged by its centre, and a big shadow straddles
            the frame, so a line drops through it from the zone's top to its bottom, in the
            zone's colour, with a pointer at the surface. Inside the frame or not is then a
            line against an edge, not a guess. */}
        <span className={`scene-fish-mark ${inZone ? 'is-in' : 'is-out'}`} aria-hidden="true" style={{ left: pctX(fishX, frame), top: pctY(stageY(layout.water.y0, frame)), height: pctH(layout.water.y1 - layout.water.y0, frame) }} />
        {/* What's on the line is a shadow until it's landed — drawn at the fish's actual length
            on the scale of every fish in the game, so a panfish is a smudge and a marlin fills
            the water, facing the way it's running — the fight reads as a fight and the sticker
            is the reveal. */}
        <span className={`scene-fish scene-shadow ${(reel.fishVel || 0) < 0 ? 'is-left' : ''} ${inZone ? 'is-in' : 'is-out'}`} data-species={species} style={{ left: pctX(fishX, frame), top: pctY(fishY), width: pctW(24 + 100 * lengthFraction(catchSize), frame) }}>
          <img src={FISH_SHADOW} alt="" />
        </span>
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
      {/* The catch, centre stage, drawn at its size within its species — and its plaque. It
          stays up until the next tap; the stage is the tap surface for that. */}
      <div className="scene-catch" style={{ width: `${round2(40 + 30 * sizeFraction(result.species, result.sizeIn))}%` }}>
        <FishIllustration species={result.species} className="scene-trophy" />
      </div>
      <div className="scene-plaque" role="status">
        <span className="scene-plaque-tags">
          {result.rarity && RARITY_INFO[result.rarity] && <span className="rarity-tag" style={{ background: RARITY_INFO[result.rarity].color, color: RARITY_INFO[result.rarity].text }}>{RARITY_INFO[result.rarity].label.toUpperCase()}</span>}
          {result.isRecord && <span className="rarity-tag is-record">NEW RECORD</span>}
          {result.derbyFish && <span className="rarity-tag is-derby">DERBY FISH</span>}
        </span>
        <strong>{speciesLabel(result.species)}</strong>
        {result.sizeLabel && <span className="scene-plaque-size">{result.sizeLabel}</span>}
        <small>{result.pointsEarned != null ? `+${result.pointsEarned} tackle points · ` : ''}tap to continue</small>
      </div>
      <div className={`scene-sparkles is-${result.rarity || 'common'}`} aria-hidden="true">
        {SPARKLES.map((sparkle, index) => <span key={index} style={{ left: `${sparkle.x}%`, top: `${sparkle.y}%`, animationDelay: `${sparkle.delay}s` }} />)}
      </div>
    </>}
    {interaction && <button
      type="button"
      className={`scene-action ${hold ? 'is-hold' : ''}`}
      aria-label={interaction.label}
      onClick={hold ? undefined : interaction.onTap}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={hold ? interaction.onHoldStart : undefined}
      onPointerUp={hold ? interaction.onHoldEnd : undefined}
      onPointerLeave={hold ? interaction.onHoldEnd : undefined}
      onPointerCancel={hold ? interaction.onHoldEnd : undefined}
    />}
    {travel && <TravelTransition vehicle={travel.vehicle} toBiome={travel.to} />}
  </div>;
}
