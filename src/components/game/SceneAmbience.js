import React, { useEffect, useState } from 'react';
import FishIllustration from '../FishIllustration';
import { ambienceFor, nextJumpDelay, planJump, planShadows, JUMP_DURATION_MS } from '../../utils/sceneAmbience';
import { frameFor, layoutFor, stageX, stageY, pctX, pctY, pctW, pctH } from '../../utils/sceneLayout';
import seagull from '../../assets/ambient/seagull.png';
import dragonfly from '../../assets/ambient/dragonfly.png';
import cloud1 from '../../assets/ambient/cloud1.png';
import cloud2 from '../../assets/ambient/cloud2.png';
import cloud3 from '../../assets/ambient/cloud3.png';

const CLOUDS = [cloud1, cloud2, cloud3];
const SEAGULL_FRAMES = 3;

// Everything on the stage that moves without the player: see utils/sceneAmbience.js for
// the per-biome plan. Clouds, gulls, dragonflies, the lamp and the water sparkle are pure
// CSS loops; the distant fish jump is a timer here so it stays random and infrequent. It
// pauses during the hookset and the fight, when the real fish is the only thing that should
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
      }, nextJumpDelay());
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
    <div className="scene-water" style={box(config.sparkle)} />
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
