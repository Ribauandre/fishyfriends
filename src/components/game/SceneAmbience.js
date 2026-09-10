import React, { useEffect, useState } from 'react';
import FishIllustration from '../FishIllustration';
import { ambienceFor, nextJumpDelay, planJump, planShadows, planCurrent, planRings, planSurf, planMoss, planFireflies, JUMP_DURATION_MS } from '../../utils/sceneAmbience';
import { frameFor, layoutFor, stageX, stageY, pctX, pctY, pctW, pctH } from '../../utils/sceneLayout';
import seagull from '../../assets/ambient/seagull.png';
import dragonfly from '../../assets/ambient/dragonfly.png';
import cloud1 from '../../assets/ambient/cloud1.png';
import cloud2 from '../../assets/ambient/cloud2.png';
import cloud3 from '../../assets/ambient/cloud3.png';

const CLOUDS = [cloud1, cloud2, cloud3];
const SEAGULL_FRAMES = 3;

// Everything on the stage that moves without the player: see utils/sceneAmbience.js for
// the per-ground plan — no two grounds move the same way, so the river runs, the lake rings
// and mists, the swamp sways and blinks after dark, the beach breaks and the bay swells.
// Clouds, gulls, dragonflies, the lamp, the water and all of those are pure CSS loops laid
// out in painting units; the distant fish jump is a timer here so it stays random and
// infrequent, and pauses during the hookset and the fight, when the real fish is the only thing that should
// be splashing. Fish shadows cruise under the bobber only while a line is actually out.
// Positions come from the painting (utils/sceneLayout.js) and are mapped to this stage's crop.
export default function SceneAmbience({ biome, phase, period = 'day', viewW = 480 }) {
  const config = ambienceFor(biome);
  const layout = layoutFor(biome);
  const frame = frameFor(viewW, layout.crop);
  const [jump, setJump] = useState(null);
  const [shadows, setShadows] = useState([]);
  const quiet = phase === 'hookset' || phase === 'reeling';

  useEffect(() => {
    if (quiet) { setJump(null); return undefined; }
    let showTimer;
    let hideTimer;
    function schedule() {
      showTimer = setTimeout(() => {
        setJump({ ...planJump(biome, Math.random, frame.visibleRight), id: Date.now() });
        hideTimer = setTimeout(() => { setJump(null); schedule(); }, JUMP_DURATION_MS);
      }, nextJumpDelay(biome));
    }
    schedule();
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [biome, quiet, frame.visibleRight]);

  useEffect(() => {
    if (phase === 'waiting') setShadows(planShadows(biome));
    else if (phase !== 'hookset') setShadows([]);
  }, [phase, biome]);

  // Gulls roost after dark; the fresh-water bugs keep going (crickets take over the sound).
  const night = period === 'night';
  const gullCount = config.critter === 'seagull' && !night ? config.critters : 0;
  const stars = night && config.clouds.length > 0;
  const skyBottom = stars ? Math.max(...config.clouds.map((lane) => lane.y1)) + 6 : 0;
  // Each ground's own water, laid out in painting units like everything else here.
  const effects = config.effects;
  const current = planCurrent(biome);
  const rings = planRings(biome);
  const surf = planSurf(biome);
  const moss = planMoss(biome);
  const fireflies = night ? planFireflies(biome) : [];
  const box = (rect) => ({
    left: pctX(stageX(rect.x0, frame), frame), top: pctY(stageY(rect.y0, frame)),
    width: pctW(rect.x1 - rect.x0, frame), height: pctH(rect.y1 - rect.y0, frame),
  });

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
      style={{ left: pctX(stageX(strand.x, frame), frame), top: pctY(stageY(strand.y, frame)), height: pctH(strand.length, frame), width: pctW(2, frame), animationDuration: `${strand.duration}s`, animationDelay: `${strand.delay}s` }}
    />)}
    <div
      className={`scene-water ${effects.swell ? 'is-swell' : ''}`}
      style={{ ...box(config.sparkle), opacity: effects.sparkle, animationDuration: effects.swell ? `${effects.swell.seconds}s` : undefined }}
    />
    {current.map((line, index) => <span
      key={`current-${index}`}
      className="scene-current"
      style={{ top: pctY(stageY(line.y, frame)), width: pctW(line.width, frame), height: pctH(2.5, frame), opacity: line.opacity, animationDuration: `${line.duration}s`, animationDelay: `${line.delay}s` }}
    />)}
    {surf.map((wave, index) => <span
      key={`surf-${index}`}
      className="scene-surf"
      style={{ left: pctX(stageX(wave.x, frame), frame), top: pctY(stageY(wave.y, frame)), width: pctW(wave.width, frame), height: pctH(wave.height, frame), animationDuration: `${wave.duration}s`, animationDelay: `${wave.delay}s` }}
    />)}
    {rings.map((ring, index) => <span
      key={`ring-${index}`}
      className="scene-ring"
      style={{ left: pctX(stageX(ring.x, frame), frame), top: pctY(stageY(ring.y, frame)), width: pctW(ring.size, frame), height: pctH(ring.size * 0.42, frame), animationDuration: `${ring.duration}s`, animationDelay: `${ring.delay}s` }}
    />)}
    {effects.mist && <div
      className="scene-mist"
      style={{ top: pctY(stageY(config.water.y0 - effects.mist.height, frame)), height: pctH(effects.mist.height, frame), animationDuration: `${effects.mist.seconds}s` }}
    />}
    {fireflies.map((bug, index) => <span
      key={`firefly-${index}`}
      className="scene-firefly"
      style={{ left: pctX(stageX(bug.x, frame), frame), top: pctY(stageY(bug.y, frame)), width: pctW(bug.size, frame), height: pctH(bug.size, frame), animationDuration: `${bug.duration}s, ${bug.duration / 4}s`, animationDelay: `${bug.delay}s, ${bug.delay / 2}s` }}
    />)}
    {config.lamp && <div className="scene-lamp" style={box({ x0: config.lamp.x - config.lamp.r, x1: config.lamp.x + config.lamp.r, y0: config.lamp.y - config.lamp.r, y1: config.lamp.y + config.lamp.r })} />}
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
      style={{ left: pctX(stageX(spot.x, frame), frame), top: pctY(stageY(spot.y, frame)), width: pctW(17, frame), animationDuration: `${13 + index * 4}s`, animationDelay: `${-index * 5}s` }}
    />)}
    {shadows.map((shadow, index) => <FishIllustration
      key={`${shadow.species}-${index}`}
      species={shadow.species}
      className="scene-shadow"
      style={{ left: pctX(stageX(shadow.x, frame), frame), top: pctY(stageY(shadow.y, frame)), width: pctW(shadow.width, frame), animationDuration: `${shadow.duration}s`, animationDelay: `${shadow.delay}s` }}
    />)}
    {jump && <div key={jump.id} className="scene-jump" data-species={jump.species} style={{ left: pctX(stageX(jump.x, frame), frame), top: pctY(stageY(jump.y, frame)), width: pctW(jump.width, frame) }}>
      <FishIllustration species={jump.species} className="scene-jump-fish" />
      <span className="scene-jump-splash" />
    </div>}
  </div>;
}
