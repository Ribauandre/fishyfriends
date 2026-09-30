import React, { useEffect, useRef, useState } from 'react';
import FishIllustration, { PIXEL_FISH_BOX, pixelFishSize } from '../FishIllustration';
import SceneAmbience from './SceneAmbience';
import TravelTransition from './TravelTransition';
import useAnglerSheets from './useAnglerSheets';
import useStripFrame, { heldFrame } from './useStripFrame';
import { GOLDEN_PENNANT, LURE_SPRITES, fishShadowFor } from '../../utils/gameProps';
import { LURES } from '../../utils/gameLures';
import { RARITY_INFO, lengthFraction, speciesLabel } from '../../utils/gameSpecies';
import { MEND_ZONE } from '../../utils/lurePhysics';
import { ANGLER_SPRITES, SPRITE_FRAME, KEYLINE, anglerAction } from '../../utils/anglerSprites';
import { lookKey, petOf, decorOf } from '../../utils/anglerLook';
import strips from '../../assets/angler/strips.json';
import { decorProp } from '../../utils/dockDecor';
import { petSprite, PET_H } from '../../utils/petSprites';
import {
  ART_PX, BACKDROP_ROWS, PAINT_H, PAINT_W, layoutFor, viewWidthFor, frameFor, stageX, stageY, stageLen, pctX, pctY, pctW, pctH,
  waterSpan, landingX as landingFor, reelX, cameraForLayout, cameraTransform, REST_CAMERA, placements, fightBand, FIGHT_ABOVE, sceneKeyFor,
  castWindow, cropAnchor, tagAboveFor, clipPathFor, insidePolygon, HOOK_R, HOOK_EDGE,
} from '../../utils/sceneLayout';
import {
  stageGrid, cellsPath, lineCells, quadPoints, ringCells, glowBands, BOBBER, spriteCells, snapX, snapY,
} from '../../utils/stagePixels';
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

// The 2D stage for Cast & Catch: a pixel-art painting per ground, the angler sprite, his crew,
// their pets, and the marks of play — the line, the float, the rings on the water, the zone —
// all on one art pixel (sceneLayout's ART_PX), drawn pixelated. The five shore paintings share
// one dock; the charter, the Canyon and the Flats put the angler on a boat. The angler, the line
// and the splash only move on the player's actions; the world around them (SceneAmbience) is
// what keeps the stage alive.
//
// Geometry: every anchor lives in painting units in utils/sceneLayout.js; this component
// measures its own box (viewW), works out how the painting is cropped into it (frameFor), and
// draws everything in stage units. The world layer (backdrop, ambience, sprites, line, fish,
// the landed catch) is what the camera moves; the meters, callout and tap surface stay in
// screen space above it. Sizes in CSS are in art pixels too: the stage is a size container
// and --apx is one art pixel on it (App.css), --sapx one as the camera shows it.
const ART = { river: riverArt, mountainlake: mountainlakeArt, swamp: swampArt, bay: bayArt, shoreline: shorelineArt, offshore: offshoreArt, canyon: canyonArt, flats: flatsArt, pier: pierArt, creek: creekArt, 'mountainlake:winter': mountainlakeWinterArt, baja: bajaArt };
// Every ground painted again at night — a moon, stars, the water dark with a moon path, the
// lamps lit — registered to its day painting pixel for pixel. At night it is laid over the day
// painting and faded in with the tint (no remount, so the swap never flashes black), and the
// tint over it is only a light one for the sprites.
const NIGHT_ART = { river: riverNight, mountainlake: mountainlakeNight, swamp: swampNight, bay: bayNight, shoreline: shorelineNight, offshore: offshoreNight, canyon: canyonNight, flats: flatsNight, pier: pierNight, creek: creekNight, 'mountainlake:winter': mountainlakeWinterNight, baja: bajaNight };
const RECENT_CATCH_MS = 9000;
const round2 = (value) => Math.round(value * 100) / 100;
const A = ART_PX;

// Where a sprite's rod tip is, in stage units, in the frame of the strip on screen — the line
// leaves from there and the pennant hangs there. `feet` and `boxH` are stage units. `hand` marks
// the one frame with no rod in it (celebrating, the fish held up in his fist); `behind`, a frame
// whose tip is behind his back (the wind-up), where a flag flown from it would cross his head.
export function rodTipFor(feet, boxH, action, frame = null) {
  const sprite = ANGLER_SPRITES[action];
  const tip = (frame === null ? null : sprite.rodTips[Math.max(0, Math.min(sprite.frames - 1, frame))]) || sprite.rodTip;
  const scale = boxH / SPRITE_FRAME.h;
  return {
    x: round2(feet.x + (tip.x - SPRITE_FRAME.feetX) * scale),
    y: round2(feet.y - (SPRITE_FRAME.feetY - tip.y) * scale),
    hand: Boolean(tip.hand),
    behind: tip.x < SPRITE_FRAME.feetX,
  };
}

// Positions the sprite box so its feet anchor lands on `feet` (stage units); boxH in stage units.
function spriteStyle(feet, boxH, viewW) {
  const boxW = boxH * (SPRITE_FRAME.w / SPRITE_FRAME.h);
  const left = feet.x - boxW * (SPRITE_FRAME.feetX / SPRITE_FRAME.w);
  const bottom = (PAINT_H - feet.y) - boxH * (1 - SPRITE_FRAME.feetY / SPRITE_FRAME.h);
  return { left: `${round2((left / viewW) * 100)}%`, bottom: pctY(bottom), height: pctY(boxH), width: `${round2((boxW / viewW) * 100)}%` };
}

// How much of the dock lamp reaches a sprite, 0 (out of its light, or daylight) to 1 (under
// it): by where it stands against the light the stage actually draws — the pool on the deck
// below the lamp, measured from the sprite's feet across the pool's ellipse (a little wider than
// drawn, and three times as deep, since a figure stands up out of it) — and, for a head right
// under the lamp, the glow at the lamp head. Anything past the drawn light keeps the night's
// grade: the angler at the end of the dock is not lit by a lamp a hundred units behind him.
// Painting units. Dawn and dusk get a share of it, night all of it.
const LAMP_SHARE = { dawn: 0.35, dusk: 0.7, night: 1 };
export function lampLight(lamp, feetX, feetY, spriteH, period) {
  if (!lamp || !LAMP_SHARE[period]) return 0;
  const pool = lamp.pool;
  const inPool = pool ? 1 - Math.hypot((feetX - pool.x) / (pool.rx * 1.4), (feetY - pool.y) / (pool.ry * 3)) : 0;
  const atHead = 1 - Math.hypot(feetX - lamp.x, (feetY - spriteH) - lamp.y) / (3 * (lamp.r || 14));
  return round2(Math.max(0, Math.min(1, Math.max(inPool, atHead))) * LAMP_SHARE[period]);
}

// The light on a sprite, pet or prop, as a CSS filter (or none): by day only the lamp at dawn and
// dusk warms it; at night, on a night painting, everything drawn in daylight colours is first
// graded down to the painting's moonlight (NIGHT_GRADE, about the night paintings' own drop
// from their day paintings — without it the angler came out twice as bright as the dock he stood
// on and a cooler ten times), and the lamp brings back what it reaches, as far as its pool lights
// a plank (LAMP_LIFT) and never back to daylight. A crew mate wears a slightly quieter tone than
// you, lamp or no lamp. On a ground with its light painted in (the creek's golden hour, the
// Canyon's sunset) `light` is the id of that light's colour filter (the stage's scene-light), laid
// on first, so the figures are lit by the painting's own sun.
export const NIGHT_GRADE = { brightness: 0.22, saturate: 0.6 };
export const LAMP_LIFT = 0.6;
export function spriteFilter({ lit = 0, night = false, crew = false, light = null }) {
  let brightness = night ? NIGHT_GRADE.brightness + (LAMP_LIFT - NIGHT_GRADE.brightness) * lit : 1 + 0.45 * lit;
  let saturate = night ? NIGHT_GRADE.saturate + 0.45 * lit : 1 + 0.15 * lit;
  const sepia = 0.3 * lit;
  if (crew) { brightness *= 0.92; saturate *= 0.85; }
  const tone = light && !night ? `url(#${light})` : '';
  if (brightness === 1 && saturate === 1 && sepia === 0) return tone || undefined;
  return `${tone ? `${tone} ` : ''}brightness(${round2(brightness)}) sepia(${round2(sepia)}) saturate(${round2(saturate)})`;
}

function AnglerSprite({ feet, boxH, stripKey, current, className = '', viewW, sheets = null, look = null, lit = 0, filter }) {
  const { action, frame = 0, play, durationMs, loop } = current;
  const sprite = ANGLER_SPRITES[action];
  const frameStep = 100 / (sprite.frames - 1);
  const style = {
    ...spriteStyle(feet, boxH, viewW),
    backgroundImage: `url(${sheets?.[action] || sprite.src})`,
    backgroundSize: `${sprite.frames * 100}% 100%`,
    backgroundPositionX: `${frame * frameStep}%`,
  };
  if (filter) style.filter = filter;
  if (play) {
    style['--sprite-end'] = `${(play - 1) * frameStep}%`;
    style.animationDuration = `${durationMs}ms`;
    // jump-none lands on exactly `play` positions (both ends included), one per frame.
    style.animationTimingFunction = `steps(${play}, jump-none)`;
  }
  return <div
    key={stripKey}
    className={`scene-sprite ${className} ${play ? (loop ? 'is-looping' : 'is-playing') : ''}`}
    data-action={action}
    data-look={look ? lookKey(look) : undefined}
    data-painted={sheets ? 'yes' : 'no'}
    data-lit={lit > 0 ? lit : undefined}
    style={style}
  />;
}

// The dock pet a look brings (utils/petSprites.js): sat beside its owner where the layout puts
// it, drawn at its own rows of art pixels, and lit by the lamp like him. Two moods: `idle` is the
// sitting strip on a long cycle that holds the first frame and flicks the tail twice near the
// end (pet-idle in App.css, its start offset by where the pet sits so two pets never flick
// together), and `cheer` is the celebration strip looping fast for as long as its angler is
// celebrating a landed fish.
function PetSprite({ petKey, mood = 'idle', feet, viewW, frame, lit = 0, filter, className = '' }) {
  const pet = petSprite(petKey);
  if (!pet || !feet) return null;
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
  if (filter) style.filter = filter;
  return <div className={`scene-sprite scene-pet ${cheering ? 'is-looping is-cheer' : 'is-idle'} ${className}`} data-pet={petKey} data-mood={cheering ? 'cheer' : 'idle'} data-lit={lit > 0 ? lit : undefined} style={style} />;
}

// The Golden Pennant, hoisted along its left edge at the rod tip and flying away from his head:
// on a wind-up frame, where the tip is behind him, it is mirrored about its hoist so it flies
// back, clear of his cap. The one frame with no rod in it (the fish held up in his fist) flies it
// from the fist instead, above it so it clears the fish, and it stays up for the whole landing.
function Pennant({ tip, frame, filter }) {
  if (!tip) return null;
  const top = tip.hand ? tip.y - stageLen(GOLDEN_PENNANT.unitH, frame) : tip.y - stageLen(2 * A, frame);
  const back = tip.behind && !tip.hand;
  return <span
    className={`scene-pennant ${back ? 'is-back' : ''}`}
    data-cosmetic="golden-pennant"
    data-hand={tip.hand ? 'yes' : undefined}
    style={{ left: pctX(tip.x, frame), top: pctY(top), width: pctW(GOLDEN_PENNANT.unitW, frame), backgroundImage: `url(${GOLDEN_PENNANT.src})`, backgroundSize: `${GOLDEN_PENNANT.frames * 100}% 100%`, filter, ...(back ? { transformOrigin: '0 0', transform: 'scaleX(-1)' } : {}) }}
  />;
}

// A name on the deck under someone's feet — or over their head, where the deck below them is
// somebody else's (a guest on a back row) or the painting's edge (the Canyon's cockpit floor;
// sceneLayout's tagAboveFor): one style for you and the crew (the pixel face, a one-art-pixel
// keyline), mint for you, cream for the crew, gold for the derby champion, drawn above the night
// tint so it reads at any hour. Over a head, the name sits three art pixels above the top of the
// pose, and holds still while a strip plays: over the held frame of a strip, and over the highest
// point of the whole reel loop (its bounds are the rod tip swinging, not his head), so it never
// hops with the frames. It never leaves the top of the frame the camera shows (`visTop`).
const TAG_H = 7 * A;
function poseTop(current) {
  const bounds = strips[current.action]?.bounds || [];
  if (current.action === 'reel' && bounds.length) return Math.min(...bounds.map((b) => b.y));
  return (bounds[heldFrame(current)] || { y: 0 }).y;
}
function headTop(feet, boxH, current) {
  return feet.y - (SPRITE_FRAME.feetY - poseTop(current)) * (boxH / SPRITE_FRAME.h);
}
function tagTop(feet, boxH, above, frame, pose = null, visTop = -Infinity) {
  if (!above) return feet.y + stageLen(3 * A, frame);
  const head = pose ? headTop(feet, boxH, pose) : feet.y - boxH;
  return Math.max(visTop + stageLen(A, frame), head - stageLen(TAG_H + 3 * A, frame));
}
// The "+N more" sign hangs on the last name's own line, beside it (`side` is left or right).
function NameTag({ feet, boxH, above = false, pose = null, name, you = false, champion = false, frame, user, visTop, more = null }) {
  return <span
    className={`scene-name-tag ${you ? 'is-you' : 'is-crew scene-crew-tag'} ${champion ? 'is-champion' : ''} ${above ? 'is-above' : ''}`}
    data-user={user}
    style={{ left: pctX(feet.x, frame), top: pctY(tagTop(feet, boxH, above, frame, pose, visTop)) }}
  >{name.toUpperCase()}
    {more && <span className={`scene-crew-more is-${more.side}`}>+{more.count} more</span>}
  </span>;
}

function crewAction(other) {
  const phase = other.phase || 'ready';
  return anglerAction({ phase, result: { success: phase === 'result' && Boolean(other.species) }, holding: phase === 'reeling' });
}

// A club member on the deck, in their own look and pose (each needs its own paint job and its
// own strip clock, so its own hooks), with their pet and their pennant if they are the champion.
// Their name and their news are drawn with the other labels, above the tint.
function CrewMember({ other, slot, boxH, viewW, frame, layout, period, night, light }) {
  const sheets = useAnglerSheets(other.look || null);
  const action = crewAction(other);
  const stripKey = `crew-${other.phase || 'ready'}-${action.action}-${action.play ? 'play' : 'hold'}`;
  const shown = useStripFrame(action, stripKey);
  const feet = { x: stageX(slot.x, frame), y: stageY(slot.y, frame) };
  const petFeet = slot.pet ? { x: stageX(slot.pet.x, frame), y: stageY(slot.pet.y, frame) } : null;
  const lit = lampLight(layout.lamp, slot.x, slot.y, layout.spriteH, period);
  const petLit = slot.pet ? lampLight(layout.lamp, slot.pet.x, slot.pet.y, 30, period) : 0;
  const tip = rodTipFor(feet, boxH, action.action, shown);
  return <>
    <PetSprite petKey={slot.pet ? petOf(other.look) : null} mood={action.action === 'celebrate' ? 'cheer' : 'idle'} feet={petFeet} viewW={viewW} frame={frame} className="is-crew" lit={petLit} filter={spriteFilter({ lit: petLit, night, crew: true, light })} />
    <AnglerSprite look={other.look || null} sheets={sheets} feet={feet} boxH={boxH} stripKey={stripKey} current={action} className="is-crew" viewW={viewW} lit={lit} filter={spriteFilter({ lit, night, crew: true, light })} />
    {other.champion && <Pennant tip={tip} frame={frame} filter={spriteFilter({ lit, night, light })} />}
  </>;
}

// A crew mate's labels beyond their name: their news, "Landed a …!", and on the last guest the
// "+N more" sign. The news goes over their head (over their name, where that is over their head
// too), centred on them but kept inside the frame the camera shows. Where the frame has no room
// over them, it goes on their name's own line beside it, and the sign does too: each takes a
// side the frame has room for (the sign right where it can), never the same one. Widths are
// reckoned from the text in the pixel face — a name about 4.7 art pixels a letter, the news 3.7
// and the sign 3.8, each sign with its plank. Stage units; `view` is the frame's left and right,
// `visTop` its top. The news's `x` is its centre over a head, its left edge beside a name.
const BUBBLE_H = 13;
// Over a head it slides sideways off anybody else's name it would lie on (`names`, their boxes
// [x0, y0, x1, y1]), and goes beside its own name where it cannot.
export function nameBox(name, feet, tagY, frame) {
  const half = stageLen((name.length * 4.7 + 1) * A, frame) / 2;
  return [feet.x - half, tagY - stageLen(2.5 * A, frame), feet.x + half, tagY + stageLen(9.5 * A, frame)];
}
export function crewLabelsFor({ name, news = '', extra = 0, feet, headY, tagY, above, view, visTop, frame, names = [] }) {
  const len = (n) => stageLen(n * A, frame);
  const gap = len(2);
  const tagHalf = len(name.length * 4.7 + 1) / 2;
  const newsW = news ? len(news.length * 3.7 + 8) : 0;
  const signW = extra > 0 ? len(`+${extra} more`.length * 3.8 + 10) : 0;
  const line = [tagY - len(2.5), tagY + len(9.5)];
  const beside = (side, out, w) => (side === 'right' ? feet.x + tagHalf + gap + out : feet.x - tagHalf - gap - out - w);
  const signBox = (side, out = 0) => (side ? [beside(side, out, signW), line[0], beside(side, out, signW) + signW, line[1]] : null);
  const hits = (box, others) => others.some((o) => o && box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
  const inView = (box) => box[0] >= view[0] - 0.01 && box[2] <= view[1] + 0.01 && box[1] >= visTop - 0.01;
  // Every way the news and the sign can go, in the order they are preferred.
  const candidates = [];
  const signSides = extra > 0 ? ['right', 'left'] : [null];
  if (news) {
    const bottom = (above ? tagY : headY) - len(3);
    const top = bottom - len(BUBBLE_H);
    const centred = Math.max(view[0] + newsW / 2, Math.min(view[1] - newsW / 2, feet.x));
    const overs = [centred, ...names.flatMap((o) => [o[0] - len(1) - newsW / 2, o[2] + len(1) + newsW / 2])]
      .sort((a, b) => Math.abs(a - feet.x) - Math.abs(b - feet.x));
    signSides.forEach((signSide) => overs.forEach((x) => candidates.push({ news: { beside: false, x, y: bottom }, newsBox: [x - newsW / 2, top, x + newsW / 2, bottom], signSide, sign: signBox(signSide) })));
    ['right', 'left'].forEach((side) => signSides.forEach((signSide) => [0, 1].forEach((past) => {
      if (past && signSide !== side) return;
      const out = past ? signW + gap : 0;
      const x = beside(side, out, newsW);
      candidates.push({ news: { beside: true, side, x, y: tagY + len(3.5) }, newsBox: [x, line[0], x + newsW, line[1]], signSide, sign: signBox(signSide) });
    })));
  } else {
    signSides.forEach((signSide) => candidates.push({ news: null, newsBox: null, signSide, sign: signBox(signSide) }));
  }
  const clear = (c) => (!c.newsBox || (inView(c.newsBox) && !hits(c.newsBox, [...names, c.sign])))
    && (!c.sign || (inView(c.sign) && !hits(c.sign, names)));
  // Where nothing is clear (a crowded phone crop), the one in the frame that covers least.
  const area = (box, others) => others.reduce((sum, o) => sum + (o ? Math.max(0, Math.min(box[2], o[2]) - Math.max(box[0], o[0])) * Math.max(0, Math.min(box[3], o[3]) - Math.max(box[1], o[1])) : 0), 0);
  const cover = (c) => (c.newsBox ? area(c.newsBox, [...names, c.sign]) : 0) + (c.sign ? area(c.sign, names) : 0);
  const shown = candidates.filter((c) => (!c.newsBox || inView(c.newsBox)) && (!c.sign || inView(c.sign)));
  const chosen = candidates.find(clear)
    || shown.sort((a, b) => cover(a) - cover(b))[0]
    || candidates[candidates.length - 1];
  const at = chosen.news && chosen.news.beside
    ? { ...chosen.news, x: Math.max(view[0], Math.min(view[1] - newsW, chosen.news.x)) }
    : chosen.news;
  return { news: at, signSide: chosen.signSide, boxes: [chosen.newsBox, chosen.sign].filter(Boolean) };
}

// Rings on the water, one art pixel wide, flattened three to one as they lie on the surface.
const waterRing = (rx) => ringCells(rx, Math.max(1, Math.round(rx / 3)));
const RIPPLES = [3, 6, 9].map(waterRing);
const SPLASH = [
  { ring: waterRing(3), drops: [[-2, -3], [2, -3], [0, -4]] },
  { ring: waterRing(6), drops: [[-4, -6], [4, -6], [-1, -8], [2, -7]] },
  { ring: waterRing(9), drops: [[-6, -4], [6, -4], [-2, -6], [3, -5]] },
];
const RISE = [4, 7, 10].map(waterRing);
// The hookset ring closes on the strike a step every tick of the stage's 125 ms clock over the
// window, from HOOK_R art pixels round it to 5 (the last step holds to the window's end): round
// in painting space (art pixels are square), whatever the stage's shape.
const TICK_MS = 125;
export function hookSteps(windowMs) {
  const steps = Math.max(3, Math.floor(windowMs / TICK_MS));
  return Array.from({ length: steps }, (_, n) => ({
    r: Math.round(HOOK_R - (n * (HOOK_R - 5)) / (steps - 1)),
    delay: n * TICK_MS,
    duration: n === steps - 1 ? windowMs - (steps - 1) * TICK_MS : TICK_MS,
  }));
}
// Sparkles round a landed fish, placed on whole art pixels of the catch's box (x, y in % of it,
// symmetric about its middle; the ones outside it at least three art pixels clear of it, however
// small the fish), whatever size the fish is drawn at; rarity decides how many light up (App.css).
const SPARKLES = [
  { x: 12, y: 18, delay: 0 }, { x: 88, y: 22, delay: 0.125 }, { x: 50, y: -8, delay: 0.25 }, { x: 28, y: 92, delay: 0.375 },
  { x: 72, y: 88, delay: 0.5 }, { x: -4, y: 58, delay: 0.625 }, { x: 104, y: 50, delay: 0.75 }, { x: 50, y: 108, delay: 0.875 },
];
export function sparkleAt(sparkle, box) {
  const at = (f, size) => {
    const px = Math.round((f / 100) * size);
    if (f < 0) return Math.min(px, -3);
    if (f > 100) return Math.max(px, size + 3);
    return px;
  };
  return { x: at(sparkle.x, box.w), y: at(sparkle.y, box.h) };
}
// The celebrating angler reaches this far right of his feet (art pixels; the fish he holds up).
const CELEBRATE_REACH = 31;
const REVEAL_GAP = 4 * A;
// The HUD's strip across the top of the stage, which the reveal keeps below (stage units at rest).
const REVEAL_HUD = 26;
// The plaque's width in art pixels, reckoned from its lines in the pixel face (measured on the
// page: about 2.9 art pixels a letter in the small line, 3.6 in a tag with 4 of padding and 3
// between tags, 5 in the name, 7 in the size) plus its plank and padding each side. The reveal
// makes room for the wider of it and the fish, so on a phone the plaque never runs off the frame.
export function plaqueWidth(result) {
  const tags = [RARITY_INFO[result.rarity]?.label, result.isRecord && 'NEW RECORD', result.derbyFish && 'DERBY FISH'].filter(Boolean);
  const small = `${result.pointsEarned != null ? `+${result.pointsEarned} tackle points · ` : ''}tap to continue`;
  return Math.ceil(Math.max(
    small.length * 2.9,
    tags.join('').length * 3.6 + tags.length * 4 + Math.max(0, tags.length - 1) * 3,
    speciesLabel(result.species).length * 5,
    String(result.sizeLabel || '').length * 7,
  ) + 2 * (6 + 2));
}
// Where the meters stand: at his back, above his pet's head (painting units from his feet). The
// meter is METER_ROWS art pixels tall, a plank of 3 top and bottom round 7 segments of 3 with a
// keyline between (4 x 7 - 1 = 27), short enough that its top stays under the face of a guest on
// the row behind. Where the frame is too short for it there (a wide stage, whose fight camera
// cannot ease off), it comes down to the frame's top and steps back past the pet.
export const METER_ROWS = 33;
export const METER_SEGMENTS = 7;
const METER = { dx: -42.67, w: 12 * A, bottom: 32, h: METER_ROWS * A, back: 26 };
// The tension meter's fill in whole segments (art pixels as the camera shows them), never a
// sliver of one: a segment lights as soon as the strain reaches into it.
export function tensionRows(tension) {
  const segs = Math.ceil((Math.min(100, Math.max(0, tension || 0)) / 100) * METER_SEGMENTS);
  return Math.max(0, 4 * segs - 1);
}

// Play happens on the stage: `interaction` makes the whole scene a tap (or hold) surface for
// the current phase, and the meters — cast power at the angler's back, the lure's rhythm or
// speed gauge over the lure, the hookset ring on the strike, tension at his back and progress
// over the water — are drawn where the action is. The dock keeps a labelled button for the same
// action so every step works by keyboard too.
export default function GameScene({
  biome, phase, displayName, species, reel, zoneWidth = 0, result, holding = false, travel = null, period = 'day',
  interaction = null, castFillRef = null, castDistance = 60, lure = 'livebait', lureDisplay = null, lureFeedback = '',
  hooksetWindowMs = 0, tension = 0, callout = '', others = [], now = Date.now, champion = false, catchSize = null,
  castBand = [40, 60], rise = null, look = null, season = null,
}) {
  const sheets = useAnglerSheets(look);
  const layout = layoutFor(biome, season);
  const sceneKey = sceneKeyFor(biome, season);
  const dayArt = ART[sceneKey] || ART[biome] || ART.river;
  const nightSrc = NIGHT_ART[sceneKey] || NIGHT_ART[biome] || null;
  const night = period === 'night' && Boolean(nightSrc);
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
  const grid = stageGrid(frame, A);
  const cell = grid.cell;
  const place = placements(layout);

  // The angler, in stage units, his feet on the art grid.
  const feet = { x: stageX(place.you.x, frame), y: stageY(place.you.y, frame) };
  const spriteH = stageLen(layout.spriteH, frame);
  const landed = phase === 'result' && Boolean(result?.success);
  const current = anglerAction({ phase, result, holding });
  const stripKey = `${phase}-${current.action}-${current.play ? 'play' : 'hold'}`;
  const shownFrame = useStripFrame(current, stripKey);
  const rodTip = rodTipFor(feet, spriteH, current.action, shownFrame);

  // The water: where the cast lands, where the fly drifts and where the fish fights.
  const surfaceY = snapY(grid, stageY(layout.cast.y, frame));
  const landing = snapX(grid, landingFor(layout, castDistance, frame));
  const fishY = stageY(layout.fishY, frame);
  const fishX = snapX(grid, reel ? reelX(layout, reel.fishPos, frame) : landing);
  const [waterA, waterZ] = waterSpan(layout, frame);
  const lineOut = phase === 'waiting' || phase === 'hookset' || phase === 'reeling';
  const working = lure !== 'livebait' && lureDisplay && (phase === 'waiting' || phase === 'hookset');
  const drifting = working && LURES[lure]?.interaction === 'drift';
  // A worked lure travels back from where it landed toward the dock as line comes in — to the
  // water's near edge, not the rod tip over the planks, and on its own course rather than the
  // rod's, so it stays on the water to the end of the retrieve and holds still while the rod
  // swings through the hookset. A fly goes the other way, drifting down the run from where it
  // landed, no further than a strike on it can still be ringed inside the cast camera's frame.
  const retrieve = working ? (lure === 'jerkbait' ? (lureDisplay.lineOut ?? 100) : 100 - (lureDisplay.distance || 0)) : 100;
  const driftEnd = Math.min(waterZ, stageX(castWindow(layout, frame)[1] - HOOK_EDGE, frame));
  const driftRun = Math.max(0, Math.min(stageLen(70, frame), driftEnd - landing));
  const lureX = snapX(grid, !working ? landing : drifting ? landing + ((lureDisplay.drift || 0) / 100) * driftRun : waterA + (landing - waterA) * (retrieve / 100));
  const lureSprite = working ? LURE_SPRITES[lure] || LURE_SPRITES.livebait : null;
  const riseX = rise === null || rise === undefined ? null : snapX(grid, landingFor(layout, rise, frame));
  const strikeX = working ? lureX : landing;
  const gauge = phase === 'waiting' && working ? (lure === 'jerkbait'
    ? { band: [55, 80], marker: lureDisplay.marker || 0, fill: lureDisplay.attraction || 0 }
    : drifting
      ? { band: MEND_ZONE, marker: lureDisplay.drag || 0, fill: lureDisplay.attraction || 0 }
      : { band: [(lureDisplay.bandCenter || 50) - 11, (lureDisplay.bandCenter || 50) + 11], marker: lureDisplay.speed || 0, fill: lureDisplay.attraction || 0 }) : null;
  const hold = Boolean(interaction?.onHoldStart);

  // What was landed, drawn one file pixel to one art pixel at whatever size its art is (a
  // panfish small, a marlin up to PIXEL_FISH_BOX), and how much room it and its plaque need right
  // of him — the result keeps the fight's camera, eased off where a phone needs the width.
  const catchPx = landed ? (pixelFishSize(result.species) || PIXEL_FISH_BOX) : null;
  const catchW = catchPx ? stageLen(catchPx.w * A, frame) : 0;
  const catchH = catchPx ? stageLen(catchPx.h * A, frame) : 0;
  const revealW = catchPx ? Math.max(catchW, stageLen(plaqueWidth(result) * A, frame)) : 0;
  const room = catchPx ? stageLen(CELEBRATE_REACH * A + 2 * REVEAL_GAP, frame) + revealW : 0;
  // The catch over its plaque (about 50 art pixels tall: tags, name, size, points, the plank
  // round them), with the HUD's strip at the top of the frame.
  const revealH = catchPx ? catchH + stageLen((3 + 50 + 2) * A, frame) + REVEAL_HUD : 0;

  // The camera, and the meters that sit outside it in screen space at the angler's back.
  const camera = cameraForLayout(landed ? 'result' : phase, layout, frame, { room, roomH: revealH });
  // The painting's own box in stage units. It is laid out like everything else on the stage
  // rather than fitted by the browser, so a narrow stage — which crops the painting's right
  // rather than shrinking it — still has the rest of it there for the camera to pan across. The
  // backdrop is its 203 art rows tall (a third of a unit past the painting's foot, which the
  // stage's overflow crops); the tint and the ambience keep the painting's own box.
  const paintBox = { left: 0, top: pctY(-frame.cropTop * frame.k), width: pctX(stageX(PAINT_W, frame), frame), height: pctY(stageLen(PAINT_H, frame)) };
  const artBox = { ...paintBox, height: pctY(stageLen(BACKDROP_ROWS * A, frame)) };
  const focused = camera !== REST_CAMERA;
  const toScreenX = (sx) => (sx - camera.x) * camera.scale;
  const toScreenY = (sy) => (sy - camera.y) * camera.scale;
  const meterH = stageLen(METER.h + 2 * A, frame) * camera.scale;
  const meterFoot = toScreenY(feet.y - stageLen(METER.bottom, frame));
  // Brought down to the frame's top, it steps back past the pet only if it would come down on
  // the pet's head.
  const petTop = place.pet && petOf(look) ? toScreenY(stageY(place.pet.y - PET_H, frame)) : Infinity;
  const meterLowered = meterFoot < meterH && meterH > petTop - stageLen(A, frame) * camera.scale;
  const meterLeft = pctX(Math.max(2, toScreenX(feet.x + stageLen(METER.dx - (meterLowered ? METER.back : 0), frame))), frame);
  const meterBottom = pctY(PAINT_H - Math.max(meterFoot, meterH));
  // What the camera shows, in world (stage) units.
  const view = [camera.x, camera.x + viewW / camera.scale];
  const visTop = camera.y;

  // A ground whose light is painted in lights the figures with the painting's colour.
  const lightId = layout.lightTone && !night ? `scene-light-${sceneKey.replace(/[^a-z]/g, '-')}` : null;

  // Other club members on this ground stand in the layout's slots; anyone past the last slot is
  // counted on a sign beside the last name on the deck, on its own line.
  const crewShown = others.slice(0, place.crew.length);
  const crewExtra = others.length - crewShown.length;
  const crewTags = crewShown.map((other, index) => {
    const slot = place.crew[index];
    const slotFeet = { x: stageX(slot.x, frame), y: stageY(slot.y, frame) };
    const pose = crewAction(other);
    const above = tagAboveFor(layout, slot);
    return { other, slotFeet, pose, above, tagY: tagTop(slotFeet, spriteH, above, frame, pose, visTop) };
  });
  const youTagY = tagTop(feet, spriteH, tagAboveFor(layout), frame, current, visTop);
  // Each guest's news and sign keep off every name on the deck and off what was placed before
  // them (the last guest, with the sign, first).
  const placed = [nameBox(displayName || 'You', feet, youTagY, frame), ...crewTags.map((t) => nameBox(t.other.name || 'Angler', t.slotFeet, t.tagY, frame))];
  // …and off the dock lamp's head, the one light on the deck after dark.
  if (layout.lamp) {
    const r = stageLen(layout.lamp.r + 2 * A, frame);
    placed.push([stageX(layout.lamp.x, frame) - r, stageY(layout.lamp.y, frame) - r, stageX(layout.lamp.x, frame) + r, stageY(layout.lamp.y, frame) + r]);
  }
  const crewLabels = [];
  for (let index = crewTags.length - 1; index >= 0; index -= 1) {
    const { other, slotFeet, pose, above, tagY } = crewTags[index];
    const recent = Boolean(other.lastCatch) && now() - other.lastCatch.at < RECENT_CATCH_MS;
    const text = recent ? `Landed a ${String(other.lastCatch.species).toLowerCase()}!` : '';
    const last = index === crewTags.length - 1;
    const labels = crewLabelsFor({
      name: other.name || 'Angler', news: text, extra: last ? crewExtra : 0, feet: slotFeet, above, view, visTop, frame,
      headY: headTop(slotFeet, spriteH, pose), tagY, names: placed.filter((_, n) => n !== index + 1),
    });
    placed.push(...labels.boxes);
    crewLabels.unshift({
      other, slotFeet, pose, above, bubble: labels.news ? { ...labels.news, text } : null,
      more: labels.signSide ? { count: crewExtra, side: labels.signSide } : null,
    });
  }
  const [bandTop, bandBottom] = fightBand(layout).map((y) => stageY(y, frame));
  const zoneLeft = reel ? snapX(grid, reelX(layout, reel.zonePos - zoneWidth / 2, frame)) : 0;
  const zoneRight = reel ? snapX(grid, reelX(layout, reel.zonePos + zoneWidth / 2, frame)) : 0;
  const inZone = Boolean(reel) && Math.abs((reel.fishPos || 0) - (reel.zonePos || 0)) <= zoneWidth / 2;
  const shadow = fishShadowFor(24 + 100 * lengthFraction(catchSize));
  const shadowW = stageLen(shadow.unitW, frame);
  const facingLeft = (reel?.fishVel || 0) < 0;
  // The shadow is centred on the fish (the mark stays through its middle), and only the part of
  // it over water is drawn: at the near end of the fight it noses under the dock's post or the
  // hull, at the far end under the bank, the way the painting would hide it.
  const shadowBox = { left: fishX - Math.floor(shadow.w / 2) * cell, top: snapY(grid, fishY) - Math.floor(shadow.h / 2) * cell, width: shadowW, height: stageLen(shadow.unitH, frame) };
  const shadowClip = clipPathFor(layout.waterClip, shadowBox, frame, facingLeft);
  const onWater = (x, y) => !layout.waterClip || insidePolygon([x / frame.k, y / frame.k + frame.cropTop], layout.waterClip);

  // The line: one art pixel wide on the art grid, from the rod tip in the frame on screen to the
  // float's antenna, the lure's eye or the fish's mouth; coral when the line is near breaking.
  let linePath = null;
  if (lineOut) {
    const tip = [rodTip.x, rodTip.y];
    let points;
    if (phase === 'reeling') {
      // To the fish's mouth — or, where its head is under the post or the hull, to the part of
      // it that shows.
      const mouthX = fishX + (facingLeft ? -1 : 1) * 0.42 * shadowW;
      points = [tip, [onWater(mouthX, fishY) ? mouthX : fishX, fishY]];
    } else {
      // The lure's eye sits in the row just above the surface; the float's antenna tip is its top row.
      const end = working
        ? [lureX + cell / 2, surfaceY - cell / 2]
        : [strikeX + cell / 2, surfaceY - stageLen((BOBBER.length - 1.5) * A, frame)];
      points = quadPoints(tip, [(tip[0] + end[0]) / 2, Math.min(tip[1], end[1]) - stageLen(30, frame)], end);
    }
    linePath = cellsPath(lineCells(points, grid), grid);
  }
  const bobberAt = { cx: Math.round((strikeX - grid.ox) / cell), cy: Math.round((surfaceY - grid.oy) / cell) - 1 };

  // The dock lamp's light, after dark: a glow at the lamp head and a pool on the deck below it,
  // each a few hard bands of pixels fading out on a dithered edge, screened over the tinted world.
  // A night painting whose lit lamp does not sit where the day painting's glass does gives the
  // lamp a `night` anchor, and the glow goes there after dark.
  const lamp = layout.lamp && period !== 'day' ? layout.lamp : null;
  const lampHead = lamp && night && lamp.night ? lamp.night : lamp;
  const lampCell = lamp ? [Math.round(stageX(lampHead.x, frame) / cell), Math.round((stageY(lampHead.y, frame) - grid.oy) / cell)] : null;
  const poolCell = lamp?.pool ? [Math.round(stageX(lamp.pool.x, frame) / cell), Math.round((stageY(lamp.pool.y, frame) - grid.oy) / cell)] : null;

  // The landed catch, right of the angler over the water, in the camera's frame: centred in the
  // room between his reach and the frame's right edge (with room for the wider of it and its
  // plaque), and in the frame's height below the HUD.
  let reveal = null;
  if (catchPx) {
    const visRight = view[1];
    const visBottom = camera.y + PAINT_H / camera.scale;
    const roomLeft = feet.x + stageLen(CELEBRATE_REACH * A + REVEAL_GAP, frame);
    const roomRight = visRight - stageLen(REVEAL_GAP, frame);
    const centre = Math.max(roomLeft + revealW / 2, Math.min(roomRight - revealW / 2, (roomLeft + roomRight) / 2));
    const left = snapX(grid, centre - catchW / 2);
    // The group sits in the frame's height below the HUD, and never below the frame's foot.
    const groupH = catchH + stageLen(53 * A, frame);
    const hud = REVEAL_HUD / camera.scale;
    const middle = visTop + hud + Math.max(0, (visBottom - visTop - hud - groupH) / 2);
    const top = snapY(grid, Math.max(visTop + stageLen(2 * A, frame), Math.min(middle, visBottom - groupH)));
    reveal = { left, top, w: catchW, h: catchH };
  }

  // Everybody on the deck, drawn back to front.
  const deck = [];
  const decorKey = decorOf(look);
  const prop = decorProp(decorKey);
  if (prop && place.decor) {
    const lit = lampLight(layout.lamp, place.decor.x, place.decor.y, prop.h, period);
    deck.push({ y: place.decor.y, node: <img
      key="decor"
      className="scene-dock-prop scene-decor"
      data-decor={decorKey}
      data-lit={lit > 0 ? lit : undefined}
      src={prop.src}
      alt=""
      style={{ left: pctX(stageX(place.decor.x - Math.floor(prop.w / 2) * A, frame), frame), top: pctY(stageY(place.decor.y - prop.h, frame)), width: pctW(prop.w * A, frame), height: pctH(prop.h, frame), filter: spriteFilter({ lit, night, light: lightId }) }}
    /> });
  }
  crewShown.forEach((other, index) => {
    const slot = place.crew[index];
    deck.push({ y: slot.y, node: <CrewMember key={other.userId} other={other} slot={slot} boxH={spriteH} viewW={viewW} frame={frame} layout={layout} period={period} night={night} light={lightId} /> });
  });
  if (place.pet && petOf(look)) {
    const lit = lampLight(layout.lamp, place.pet.x, place.pet.y, 30, period);
    deck.push({ y: place.pet.y, node: <PetSprite key="pet" petKey={petOf(look)} mood={current.action === 'celebrate' ? 'cheer' : 'idle'} feet={{ x: stageX(place.pet.x, frame), y: stageY(place.pet.y, frame) }} viewW={viewW} frame={frame} className="is-you" lit={lit} filter={spriteFilter({ lit, night, light: lightId })} /> });
  }
  const youLit = lampLight(layout.lamp, place.you.x, place.you.y, layout.spriteH, period);
  deck.push({ y: place.you.y + 0.01, node: <React.Fragment key="you">
    <AnglerSprite feet={feet} boxH={spriteH} stripKey={stripKey} current={current} className="is-you" viewW={viewW} sheets={sheets} look={look} lit={youLit} filter={spriteFilter({ lit: youLit, night, light: lightId })} />
    {champion && <Pennant tip={rodTip} frame={frame} filter={spriteFilter({ lit: youLit, night, light: lightId })} />}
  </React.Fragment> });
  deck.sort((a, b) => a.y - b.y);
  // The lure's gauge, centred over the lure but kept whole inside the frame the camera shows.
  const gaugeHalf = stageLen(24 * A, frame);
  const gaugeX = Math.max(view[0] + gaugeHalf, Math.min(view[1] - gaugeHalf, lureX));
  // The progress gauge across the water, both ends on the art grid.
  const [barA, barZ] = [snapX(grid, waterA), snapX(grid, waterZ)];
  // The trip's vehicle is world pixel art, so it takes the world's light (it is drawn over the
  // tint, so it is graded here rather than by it): the night's grade after dark, and a breath of
  // the dusk and dawn light, or the painted light of a ground that has it.
  const vehicleFilter = night ? spriteFilter({ night: true })
    : [lightId ? `url(#${lightId})` : '', period === 'dusk' ? 'sepia(0.3) brightness(0.82) saturate(0.9)' : period === 'dawn' ? 'sepia(0.2) brightness(0.94)' : ''].filter(Boolean).join(' ') || undefined;

  return <div
    ref={stageRef}
    className={`game-scene is-${phase} ${focused ? 'is-focused' : ''}`}
    data-biome={biome}
    data-phase={phase}
    data-period={period}
    data-night-art={night ? 'yes' : undefined}
    data-light={layout.light || undefined}
    data-view-w={viewW}
    style={{ '--k': frame.k, '--cam': camera.scale }}
  >
    <div className="scene-world" data-camera={phase === 'casting' ? 'cast' : landed && focused ? 'result' : focused ? 'fight' : 'rest'} data-camera-x={camera.x} data-camera-y={camera.y} data-camera-scale={camera.scale} style={{ transform: cameraTransform(camera, viewW) }}>
      {/* The painting's own light as a colour filter for the figures (spriteFilter's `light`). */}
      {lightId && <svg className="scene-filters" width="0" height="0" aria-hidden="true" focusable="false">
        <filter id={lightId} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values={`${layout.lightTone[0]} 0 0 0 0 0 ${layout.lightTone[1]} 0 0 0 0 0 ${layout.lightTone[2]} 0 0 0 0 0 1 0`} />
        </filter>
      </svg>}
      <img key={`day-${sceneKey}`} className="scene-backdrop is-day" src={dayArt} alt="" data-crop={cropAnchor(layout.crop)} style={artBox} />
      {/* The night painting is always there, and only shown or hidden, so whatever the clock
          does — dusk, or a sleep straight from day to night — the swap steps through the fade
          rather than mounting a painting that arrives from black. */}
      {nightSrc && <img key={`night-${sceneKey}`} className={`scene-backdrop is-night ${night ? 'is-shown' : ''}`} src={nightSrc} alt="" style={artBox} />}
      <SceneAmbience biome={biome} period={period} season={season} viewW={viewW} />
      <svg viewBox={`0 0 ${viewW} ${PAINT_H}`} preserveAspectRatio="none" className="game-scene-svg" shapeRendering="crispEdges" role="img" aria-label={`${displayName || 'You'} fishing`}>
        {linePath && <path className={`scene-line ${phase === 'reeling' && tension > 85 ? 'is-strained' : ''}`} d={linePath} />}
        {phase === 'waiting' && !working && <g className="scene-ripple" data-x={strikeX}>
          {RIPPLES.map((ring, n) => <path key={n} className={`scene-ripple-ring is-${n}`} d={cellsPath(ring, grid, [bobberAt.cx, bobberAt.cy + 1])} />)}
        </g>}
        {(phase === 'waiting' || phase === 'hookset') && !working && <g className="scene-bobber" data-x={strikeX} style={{ '--cell': `${round2(cell)}px` }}>
          <path fill={KEYLINE} d={cellsPath(spriteCells(BOBBER, 'k'), grid, [bobberAt.cx, bobberAt.cy + 1])} />
          <path fill="#d0412c" d={cellsPath(spriteCells(BOBBER, 'r'), grid, [bobberAt.cx, bobberAt.cy + 1])} />
          <path fill="#f06a4a" d={cellsPath(spriteCells(BOBBER, 'h'), grid, [bobberAt.cx, bobberAt.cy + 1])} />
          <path fill="#f2ece0" d={cellsPath(spriteCells(BOBBER, 'w'), grid, [bobberAt.cx, bobberAt.cy + 1])} />
        </g>}
        {phase === 'hookset' && <g className="scene-splash" data-x={strikeX}>
          {SPLASH.map((step, n) => <path key={n} className={`scene-splash-step is-${n}`} d={cellsPath([...step.ring, ...step.drops], grid, [Math.round((strikeX - grid.ox) / cell), bobberAt.cy + 1])} />)}
        </g>}
      </svg>
      {deck.map((item) => item.node)}
      {/* Time of day is a tint (multiply) over everything that is *in* the world — the
          painting, its ambience, the line, the crew and the angler — not a second set of
          backdrops. It sits here, after the sprites, so he is lit like the dock he stands on;
          the play surfaces after it (lure, zone, the fish's mark) stay bright, and so do the names. */}
      <div className={`scene-tint is-${period}`} aria-hidden="true" style={paintBox} />
      {lamp && <svg className={`scene-lamp is-${period}`} viewBox={`0 0 ${viewW} ${PAINT_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
        {poolCell && <g className="scene-lamp-pool">
          {glowBands(Math.round(lamp.pool.rx / A), Math.round(lamp.pool.ry / A)).map((cells, n) => <path key={n} className={`is-band-${n}`} d={cellsPath(cells, grid, poolCell)} />)}
        </g>}
        <g className="scene-lamp-glow">
          {glowBands(Math.round(lampHead.r / A), Math.round(lampHead.r / A)).map((cells, n) => <path key={n} className={`is-band-${n}`} d={cellsPath(cells, grid, lampCell)} />)}
        </g>
      </svg>}
      {working && <img
        className={`scene-lure ${phase === 'waiting' && lure === 'crankbait' ? 'is-wobbling' : ''}`}
        src={lureSprite.src}
        alt=""
        data-lure={lure}
        style={{ left: pctX(lureX - stageLen(lureSprite.eye.x * A, frame), frame), top: pctY(surfaceY - stageLen((lureSprite.eye.y + 1) * A, frame)), width: pctW(lureSprite.unitW, frame), height: pctH(lureSprite.unitH, frame) }}
      />}
      {gauge && <div className={`stage-gauge is-${lure}`} style={{ left: pctX(gaugeX, frame), top: pctY(surfaceY - stageLen(26 * A, frame)) }} aria-hidden="true">
        <span className="stage-gauge-track">
          <span className="stage-gauge-band" style={{ left: `${round2(gauge.band[0])}%`, width: `${round2(gauge.band[1] - gauge.band[0])}%` }} />
          <span className="stage-gauge-marker" style={{ left: `${round2(gauge.marker)}%` }} />
        </span>
        <span className="stage-gauge-fill"><span style={{ width: `${round2(gauge.fill)}%` }} /></span>
        {lureFeedback && <span key={lureFeedback} className="stage-feedback">{lureFeedback}</span>}
      </div>}
      {(riseX !== null || phase === 'hookset') && <svg className="game-scene-svg is-marks" viewBox={`0 0 ${viewW} ${PAINT_H}`} preserveAspectRatio="none" shapeRendering="crispEdges" aria-hidden="true">
        {riseX !== null && <g className="scene-rise" data-rise={rise} data-x={riseX}>
          {RISE.map((ring, n) => <path key={n} className={`scene-rise-ring is-${n}`} d={cellsPath(ring, grid, [Math.round((riseX - grid.ox) / cell), Math.round((surfaceY - grid.oy) / cell)])} />)}
        </g>}
        {phase === 'hookset' && <g className="scene-hook-ring" data-x={strikeX} data-window-ms={hooksetWindowMs || 600} style={{ animationDuration: `${hooksetWindowMs || 600}ms` }}>
          {hookSteps(hooksetWindowMs || 600).map(({ r, delay, duration }, n, steps) => {
            const at = [Math.round((strikeX - grid.ox) / cell), Math.round((surfaceY - grid.oy) / cell)];
            return <g key={n} className={`scene-hook-step ${n === steps.length - 1 ? 'is-last' : ''}`} style={{ animationDelay: `${delay}ms`, animationDuration: `${duration}ms` }}>
              <path className="scene-hook-key" d={cellsPath([...ringCells(r + 1, r + 1), ...ringCells(Math.max(1, r - 1), Math.max(1, r - 1))], grid, at)} />
              <path className="scene-hook-rim" d={cellsPath(ringCells(r, r), grid, at)} />
            </g>;
          })}
        </g>}
      </svg>}
      <NameTag feet={feet} boxH={spriteH} above={tagAboveFor(layout)} pose={current} name={displayName || 'You'} you champion={champion} frame={frame} visTop={visTop} />
      {crewLabels.map(({ other, slotFeet, pose, above, more }) => <NameTag
        key={other.userId}
        feet={slotFeet}
        boxH={spriteH}
        above={above}
        pose={pose}
        name={other.name || 'Angler'}
        champion={Boolean(other.champion)}
        frame={frame}
        user={other.userId}
        visTop={visTop}
        more={more}
      />)}
      {crewLabels.map(({ other, bubble }) => (bubble
        ? <span key={`bubble-${other.userId}`} className={`scene-crew-bubble ${bubble.beside ? `is-beside is-${bubble.side}` : ''}`} style={{ left: pctX(bubble.x, frame), top: pctY(bubble.y) }}>{bubble.text}</span>
        : null))}
      {phase === 'reeling' && reel && <>
        {/* The zone the fish has to be held in: a hard frame on the water, mint while the fish
            is inside it and coral, pulsing, the moment it isn't — the edge is the whole game. */}
        <div className={`reel-zone scene-zone ${inZone ? 'is-in' : 'is-out'}`} style={{ left: pctX(zoneLeft, frame), width: pctX(zoneRight - zoneLeft, frame), top: pctY(bandTop), height: pctY(bandBottom - bandTop) }}>
          <span className="scene-zone-cap is-top" aria-hidden="true" /><span className="scene-zone-cap is-bottom" aria-hidden="true" />
        </div>
        {/* What's on the line is a shadow until it's landed — drawn at the fish's actual length
            on the scale of every fish in the game (a size class of pixel silhouette), facing the
            way it's running, mirrored as a whole about its middle so the mark stays on its
            centre — the fight reads as a fight and the catch is the reveal. */}
        <span className={`scene-fish scene-shadow ${facingLeft ? 'is-left' : ''} ${inZone ? 'is-in' : 'is-out'}`} data-species={species} style={{ left: pctX(shadowBox.left, frame), top: pctY(shadowBox.top), width: pctX(shadowBox.width, frame), height: pctY(shadowBox.height), clipPath: shadowClip }}>
          <img src={shadow.src} alt="" />
        </span>
        {/* The point that counts: the fish is judged by its centre, so a line drops through it
            from the zone's top to its bottom, in the zone's colour, with a pointer at the top. */}
        <span className={`scene-fish-mark ${inZone ? 'is-in' : 'is-out'}`} aria-hidden="true" style={{ left: pctX(fishX, frame), top: pctY(bandTop), height: pctY(bandBottom - bandTop) }} />
        <div className="stage-progress" style={{ left: pctX(barA, frame), width: pctX(barZ - barA, frame), top: pctY(bandTop - stageLen(FIGHT_ABOVE, frame)) }} aria-hidden="true">
          <span style={{ width: `${round2(reel.progress || 0)}%` }} />
        </div>
      </>}
      {reveal && <>
        {/* The catch, one file pixel to one art pixel, right of the angler over the water — and
            its plaque under it. It stays up until the next tap; the stage is the tap surface. */}
        <div className="scene-catch" data-art-w={catchPx.w} data-art-h={catchPx.h} style={{ left: pctX(reveal.left, frame), top: pctY(reveal.top), width: pctX(reveal.w, frame), height: pctY(reveal.h), '--rise-a': Math.round(catchPx.h * 0.62), '--rise-b': Math.round(catchPx.h * 0.25) }}>
          <FishIllustration species={result.species} variant="pixel" className="scene-trophy" />
          <div className={`scene-sparkles is-${result.rarity || 'common'}`} aria-hidden="true" style={{ color: (RARITY_INFO[result.rarity] || RARITY_INFO.common).color }}>
            {SPARKLES.map((sparkle, index) => {
              const at = sparkleAt(sparkle, catchPx);
              return <span key={index} data-x={at.x} data-y={at.y} style={{ '--sx': at.x, '--sy': at.y, animationDelay: `${sparkle.delay}s` }} />;
            })}
          </div>
        </div>
        <div className="scene-plaque" role="status" style={{ left: pctX(reveal.left + reveal.w / 2, frame), top: pctY(reveal.top + reveal.h + stageLen(3 * A, frame)) }}>
          <span className="scene-plaque-tags">
            {result.rarity && RARITY_INFO[result.rarity] && <span className={`rarity-tag scene-plaque-tag is-${result.rarity}`} style={{ background: RARITY_INFO[result.rarity].color, color: RARITY_INFO[result.rarity].text }}>{RARITY_INFO[result.rarity].label.toUpperCase()}</span>}
            {result.isRecord && <span className="rarity-tag scene-plaque-tag is-record">NEW RECORD</span>}
            {result.derbyFish && <span className="rarity-tag scene-plaque-tag is-derby">DERBY FISH</span>}
          </span>
          <strong>{speciesLabel(result.species)}</strong>
          {result.sizeLabel && <span className="scene-plaque-size">{result.sizeLabel}</span>}
          <small>{result.pointsEarned != null ? `+${result.pointsEarned} tackle points · ` : ''}tap to continue</small>
        </div>
      </>}
    </div>

    {phase === 'casting' && <div className="stage-meter is-cast" style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" ref={castFillRef} />
      <span className="stage-meter-band" style={{ bottom: `${castBand[0]}%`, height: `${castBand[1] - castBand[0]}%` }} />
    </div>}
    {phase === 'reeling' && reel && <div className="stage-meter is-tension" data-strain={tension > 85 ? 'high' : tension > 60 ? 'mid' : 'low'} style={{ left: meterLeft, bottom: meterBottom }} aria-hidden="true">
      <span className="stage-meter-fill" data-rows={tensionRows(tension)} style={{ '--rows': tensionRows(tension) }} />
    </div>}
    {callout && <p key={phase} className={`stage-callout ${phase === 'hookset' ? 'is-alert' : ''}`} data-phase={phase}>{callout}</p>}
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
    {travel && <TravelTransition vehicle={travel.vehicle} toBiome={travel.to} k={frame.k} viewW={viewW} filter={vehicleFilter} />}
  </div>;
}
