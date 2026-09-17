import React from 'react';
import { ambienceFor, planMovers, planFoam, planRings, planWash, planMist, planMoss, planGrass, planBubbles, planFireflies, clipFor } from '../../utils/sceneAmbience';
import { frameFor, layoutFor, stageX, stageY, pctX, pctY, pctW, pctH, PAINT_W, PAINT_H } from '../../utils/sceneLayout';
import seagull from '../../assets/ambient/seagull.png';
import dragonfly from '../../assets/ambient/dragonfly.png';
import cloud1 from '../../assets/ambient/cloud1.png';
import cloud2 from '../../assets/ambient/cloud2.png';
import cloud3 from '../../assets/ambient/cloud3.png';

const CLOUDS = [cloud1, cloud2, cloud3];
const SEAGULL_FRAMES = 3;
const WHOLE_PAINTING = { x0: 0, y0: 0, x1: PAINT_W, y1: PAINT_H };

// Everything on the stage that moves without the player: see utils/sceneAmbience.js for
// the per-ground plan — no two grounds move the same way. Every plan is a list of things in
// painting units, and this maps them onto this stage's crop (utils/sceneLayout.js) as pure
// CSS loops: a thing that travels (a streak, a roller, a whitecap, a leaf) is a lane rotated
// to its heading with the piece running along it; surf is a bar rotated along the sand line
// that runs up it and back; foam, rings, bubbles, mist, moss and grass sit where they were
// planned and pulse, open, rise, drift or sway in place (the surf bar straddles its line, a third
// over the water, so the foam shows against the water before it runs up the sand); the sun glint, caustics, horizon
// gleam and snow are tiled layers over a box. Nothing here is a fish: the only one on the
// water is the one the player is fighting.
export default function SceneAmbience({ biome, period = 'day', season = null, viewW = 480 }) {
  const config = ambienceFor(biome, season);
  const layout = layoutFor(biome, season);
  const frame = frameFor(viewW, layout.crop);
  // Gulls roost after dark; the fresh-water bugs keep going (crickets take over the sound).
  const night = period === 'night';
  const gullCount = config.critter === 'seagull' && !night ? config.critters : 0;
  const stars = night && config.clouds.length > 0;
  const skyBottom = stars ? Math.max(...config.clouds.map((lane) => lane.y1)) + 6 : 0;
  const effects = config.effects;
  const movers = planMovers(biome, season);
  const foam = planFoam(biome, season);
  const rings = planRings(biome, season);
  const wash = planWash(biome, season);
  const mist = planMist(biome, season);
  const moss = planMoss(biome, season);
  const grass = planGrass(biome, season);
  const bubbles = planBubbles(biome, season);
  const fireflies = night ? planFireflies(biome, season) : [];
  const at = (x, y) => ({ left: pctX(stageX(x, frame), frame), top: pctY(stageY(y, frame)) });
  const size = (w, h) => ({ width: pctW(w, frame), height: pctH(h, frame) });
  const box = (rect) => ({ ...at(rect.x0, rect.y0), ...size(rect.x1 - rect.x0, rect.y1 - rect.y0) });
  const loop = (piece) => ({ animationDuration: `${piece.duration}s`, animationDelay: `${piece.delay}s` });
  const waterClip = clipFor(effects.clip, config.sparkle);

  return <div className="scene-ambience" aria-hidden="true" data-critter={config.critter} data-period={period}>
    {stars && <div className="scene-stars" style={{ height: pctY(Math.max(6, stageY(skyBottom, frame))) }} />}
    {config.clouds.map((lane, index) => <img
      key={index}
      className="scene-cloud"
      src={CLOUDS[index % CLOUDS.length]}
      alt=""
      style={{ top: pctY(stageY(lane.y0, frame)), height: pctH(lane.y1 - lane.y0, frame), animationDuration: `${lane.duration}s`, animationDelay: `${lane.delay}s`, '--drift-from': lane.from > 0 ? pctX(stageX(lane.from, frame), frame) : '-22%' }}
    />)}
    {moss.map((strand, index) => <span
      key={`moss-${index}`}
      className="scene-moss"
      style={{ ...at(strand.x, strand.y), ...size(3, strand.length), ...loop(strand) }}
    />)}
    {grass.map((blade, index) => <span
      key={`grass-${index}`}
      className="scene-grass"
      style={{ ...at(blade.x, blade.y - blade.height), ...size(3.5, blade.height), ...loop(blade) }}
    />)}
    {effects.glitter > 0 && <div
      className="scene-glitter"
      style={{ ...box(config.sparkle), opacity: effects.glitter, clipPath: waterClip }}
    />}
    {effects.caustics && <div
      className="scene-caustics"
      style={{ ...box(config.sparkle), opacity: effects.caustics.opacity, clipPath: waterClip, animationDuration: `${effects.caustics.seconds}s, ${effects.caustics.seconds * 1.6}s` }}
    />}
    {effects.gleam && <div
      className="scene-gleam"
      style={{ ...box(effects.gleam.box), animationDuration: `${effects.gleam.seconds}s, ${effects.gleam.seconds * 0.45}s` }}
    />}
    {movers.map((piece, index) => <span
      key={`mover-${index}`}
      className={`scene-mover is-${piece.kind}`}
      data-heading={piece.heading}
      style={{ ...at(piece.x, piece.y), ...size(piece.across ? piece.h : piece.w, piece.across ? piece.w : piece.h), opacity: piece.opacity, transform: `translateY(-50%) rotate(${piece.heading}deg)`, '--travel': `${Math.round((piece.travel / (piece.across ? piece.h : piece.w)) * 100)}%` }}
    ><i style={loop(piece)} /></span>)}
    {wash.map((piece, index) => <span
      key={`wash-${index}`}
      className="scene-wash"
      style={{ ...at(piece.x, piece.y), ...size(piece.length, piece.reach * 1.5), transform: `rotate(${piece.angle}deg) translateY(-33%)` }}
    ><i style={loop(piece)} /></span>)}
    {foam.map((spot, index) => <span
      key={`foam-${index}`}
      className="scene-foam"
      style={{ ...at(spot.x, spot.y), ...size(spot.size, spot.size * 0.55), ...loop(spot) }}
    />)}
    {rings.map((ring, index) => <span
      key={`ring-${index}`}
      className="scene-ring"
      style={{ ...at(ring.x, ring.y), ...size(ring.size, ring.size * 0.42), ...loop(ring) }}
    />)}
    {bubbles.map((bubble, index) => <span
      key={`bubble-${index}`}
      className="scene-bubble"
      style={{ ...at(bubble.x, bubble.y), ...size(bubble.size, bubble.size), ...loop(bubble) }}
    />)}
    {mist.map((band, index) => <div
      key={`mist-${index}`}
      className="scene-mist"
      style={{ ...at(band.x, band.y), ...size(band.w, band.h), ...loop(band) }}
    />)}
    {effects.snow && <div
      className="scene-snow"
      style={{ ...box(WHOLE_PAINTING), opacity: effects.snow.opacity, animationDuration: `${effects.snow.seconds}s, ${effects.snow.seconds * 1.7}s` }}
    />}
    {fireflies.map((bug, index) => <span
      key={`firefly-${index}`}
      className="scene-firefly"
      style={{ ...at(bug.x, bug.y), ...size(bug.size, bug.size), animationDuration: `${bug.duration}s, ${bug.duration / 4}s`, animationDelay: `${bug.delay}s, ${bug.delay / 2}s` }}
    />)}
    {Array.from({ length: gullCount }, (_, index) => <div
      key={index}
      className="scene-gull"
      data-critter="seagull"
      style={{
        top: pctY(stageY(config.gulls.y0 + ((config.gulls.y1 - config.gulls.y0) * index) / Math.max(1, config.critters - 1), frame)),
        width: pctW(28 - index * 4, frame),
        backgroundImage: `url(${seagull})`,
        backgroundSize: `${SEAGULL_FRAMES * 100}% 100%`,
        animationDuration: `${0.5 + index * 0.08}s, ${26 + index * 9}s`,
        animationDelay: `0s, ${-8 - index * 11}s`,
      }}
    />)}
    {config.critter === 'dragonfly' && config.dragonflies.map((spot, index) => <img
      key={index}
      className="scene-dragonfly"
      data-critter="dragonfly"
      src={dragonfly}
      alt=""
      style={{ ...at(spot.x, spot.y), width: pctW(17, frame), animationDuration: `${13 + index * 4}s`, animationDelay: `${-index * 5}s` }}
    />)}
  </div>;
}
