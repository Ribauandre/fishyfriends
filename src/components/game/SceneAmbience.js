import React, { useEffect, useState } from 'react';
import FishIllustration from '../FishIllustration';
import { ambienceFor, nextJumpDelay, planJump, planShadows, JUMP_DURATION_MS } from '../../utils/sceneAmbience';
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
export default function SceneAmbience({ biome, phase, period = 'day' }) {
  const config = ambienceFor(biome);
  const [jump, setJump] = useState(null);
  const [shadows, setShadows] = useState([]);
  const quiet = phase === 'hookset' || phase === 'reeling';

  useEffect(() => {
    if (quiet) { setJump(null); return undefined; }
    let showTimer;
    let hideTimer;
    function schedule() {
      showTimer = setTimeout(() => {
        setJump({ ...planJump(biome), id: Date.now() });
        hideTimer = setTimeout(() => { setJump(null); schedule(); }, JUMP_DURATION_MS);
      }, nextJumpDelay());
    }
    schedule();
    return () => { clearTimeout(showTimer); clearTimeout(hideTimer); };
  }, [biome, quiet]);

  useEffect(() => {
    if (phase === 'waiting') setShadows(planShadows(biome));
    else if (phase !== 'hookset') setShadows([]);
  }, [phase, biome]);

  // Gulls roost after dark; the fresh-water bugs keep going (crickets take over the sound).
  const night = period === 'night';
  const critterCount = config.critter === 'seagull' && night ? 0 : config.critters;
  const critters = Array.from({ length: critterCount }, (_, index) => index);
  const stars = night && config.clouds.length > 0;

  return <div className="scene-ambience" aria-hidden="true" data-critter={config.critter} data-period={period}>
    {stars && <div className="scene-stars" style={{ height: `${Math.max(...config.clouds.map((lane) => lane.top + lane.height)) + 4}%` }} />}
    {config.clouds.map((lane, index) => <img
      key={index}
      className="scene-cloud"
      src={CLOUDS[index % CLOUDS.length]}
      alt=""
      style={{ top: `${lane.top}%`, height: `${lane.height}%`, animationDuration: `${lane.duration}s`, animationDelay: `${lane.delay}s`, '--drift-from': `${lane.from ?? -22}%` }}
    />)}
    <div className="scene-water" style={{ '--water-left': `${config.water.left}%`, '--water-top': `${config.water.top}%` }} />
    {config.lamp && <div className="scene-lamp" />}
    {critters.map((index) => (config.critter === 'seagull'
      ? <div
        key={index}
        className="scene-gull"
        data-critter="seagull"
        style={{
          top: `${5 + index * 6}%`,
          width: `${6 - index * 0.8}%`,
          backgroundImage: `url(${seagull})`,
          backgroundSize: `${SEAGULL_FRAMES * 100}% 100%`,
          animationDuration: `${0.5 + index * 0.08}s, ${26 + index * 9}s`,
          animationDelay: `0s, ${-8 - index * 11}s`,
        }}
      />
      : <img
        key={index}
        className="scene-dragonfly"
        data-critter="dragonfly"
        src={dragonfly}
        alt=""
        style={{ left: `${6 + index * 22}%`, top: `${56 + index * 8}%`, animationDuration: `${13 + index * 4}s`, animationDelay: `${-index * 5}s` }}
      />))}
    {shadows.map((shadow, index) => <FishIllustration
      key={`${shadow.species}-${index}`}
      species={shadow.species}
      className="scene-shadow"
      style={{ left: `${shadow.left}%`, top: `${shadow.top}%`, animationDuration: `${shadow.duration}s`, animationDelay: `${shadow.delay}s` }}
    />)}
    {jump && <div key={jump.id} className="scene-jump" data-species={jump.species} style={{ left: `${jump.x}%`, top: `${jump.y}%`, width: `${jump.width}%` }}>
      <FishIllustration species={jump.species} className="scene-jump-fish" />
      <span className="scene-jump-splash" />
    </div>}
  </div>;
}
