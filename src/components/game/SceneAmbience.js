import React from 'react';
import { planAmbience, svgStrip, maskUrl, holesUrl, polygonRuns, cloudTables, ART_COLS, ART_ROWS } from '../../utils/sceneAmbience';
import { frameFor, layoutFor, stageX, stageLen, pctX, pctY, PAINT_W, PAINT_H } from '../../utils/sceneLayout';

const r4 = (value) => Math.round(value * 10000) / 10000;
const col = (px) => `${r4((px / ART_COLS) * 100)}%`;
const row = (px) => `${r4((px / ART_ROWS) * 100)}%`;
const secs = (value) => `${value}s`;
// A piece's box on the painting, in whole art pixels.
const box = (p) => ({ left: col(p.x), top: row(p.y), width: col(p.w), height: row(p.h) });
// One art pixel of a piece's own box, for the keyframes that move it a pixel at a time.
const unit = (p) => ({ '--ax': `${r4(100 / p.w)}%`, '--ay': `${r4(100 / p.h)}%` });
const cells = (p) => p.shape.cells.length;
// A flipbook: the shape's cells side by side, stepped through on the stage's clock.
const flip = (p, colours) => ({
  backgroundImage: svgStrip(p.shape, colours),
  backgroundSize: `${cells(p) * 100}% 100%`,
  animationDuration: secs(p.duration),
  animationDelay: secs(p.delay),
  animationTimingFunction: `steps(${cells(p)}, jump-none)`,
});
const opacity = (p, palette) => r4((p.opacity ?? 1) * palette.strength);

// Everything on the stage that moves without the player: see utils/sceneAmbience.js for the
// per-ground plans — no two grounds move the same way. Every piece is pixel art on the world's
// one art pixel: a box of whole art pixels on the painting, drawn as a hard-edged SVG in the
// painting's own colours (a flipbook of cells where it changes shape), stepped a pixel at a
// time or a cell at a time on the stage's 125 ms clock by the keyframes in App.css. A thing
// that travels is three nested boxes — its lane, its run across and its run down — so each axis
// steps a whole pixel on its own count, the way a pixel line is drawn.
//
// The whole layer is laid out on the painting, not the stage: it takes the same box the
// backdrop does (`paintBox` in GameScene — the painting runs to PAINT_W however narrow the
// stage is) and everything inside it is placed as a percentage of the painting, so a piece
// on the painting's right edge sits there on every crop. The clouds drift inside the painting's
// own sky (a mask read off it), so they pass behind the lamp posts, the pines, the peaks and the
// headland, never over them; the gulls fly nearer, in front of the far cliffs and headlands but
// behind the dock lamp, the pier's lamp posts and the charter's tower (`fore`).
//
// Building the pieces' SVGs costs a few milliseconds, and GameScene renders on every tick of a
// fight, so the layer only renders again when its own props change (they are all plain values).
export default React.memo(SceneAmbience);

function SceneAmbience({ biome, period = 'day', season = null, viewW = 480 }) {
  const plan = planAmbience(biome, season, period);
  const { config, palette } = plan;
  const layout = layoutFor(biome, season);
  const frame = frameFor(viewW, layout.crop);
  const paintBox = { left: 0, top: pctY(-frame.cropTop * frame.k), width: pctX(stageX(PAINT_W, frame), frame), height: pctY(stageLen(PAINT_H, frame)) };
  const skyMask = config.sky ? maskUrl(config.sky) : null;
  const masked = (url) => (url ? { WebkitMaskImage: url, maskImage: url, WebkitMaskSize: '100% 100%', maskSize: '100% 100%', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' } : {});
  const cloudFilter = plan.clouds.length && config.cloudTones ? `scene-cloud-tones-${config.sceneKey.replace(/[^a-z]/g, '-')}` : null;
  const flipPiece = (p, key) => <span
    key={key}
    className={`scene-px scene-${p.kind} amb-flip-${p.rhythm}`}
    style={{ ...box(p), ...flip(p, palette), opacity: opacity(p, palette) }}
  />;
  const tiles = plan.tiles;

  return <div className="scene-ambience" aria-hidden="true" data-critter={config.critter} data-period={period} style={paintBox}>
    {cloudFilter && <svg className="scene-filters" width="0" height="0" focusable="false">
      <filter id={cloudFilter} colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          {cloudTables(config.cloudTones).map((table, index) => React.createElement(['feFuncR', 'feFuncG', 'feFuncB'][index], { key: index, type: 'discrete', tableValues: table }))}
        </feComponentTransfer>
      </filter>
    </svg>}
    {plan.clouds.length > 0 && <div className="scene-sky" style={masked(skyMask)}>
      {plan.clouds.map((p, index) => <img
        key={`cloud-${index}`}
        className="scene-cloud"
        src={p.src}
        alt=""
        style={{ ...box(p), '--mx0': `${r4((p.tx0 / p.w) * 100)}%`, '--mx': `${r4(((p.tx0 + p.tx) / p.w) * 100)}%`, animationDuration: secs(p.duration), animationDelay: secs(p.delay), animationTimingFunction: `steps(${p.tx})`, filter: cloudFilter ? `url(#${cloudFilter})` : undefined }}
      />)}
    </div>}
    {plan.gulls.length > 0 && <div className="scene-flock" style={masked(config.fore.length ? holesUrl(config.fore, config.sky) : null)}>
      {plan.gulls.map((p, index) => <span
        key={`gull-${index}`}
        className="scene-gull"
        data-critter="seagull"
        style={{ ...box(p), '--mx': `${r4((p.tx / p.w) * 100)}%`, animationDuration: secs(p.duration), animationDelay: secs(p.delay), animationTimingFunction: `steps(${Math.round(p.tx / p.stride)})` }}
      ><i style={{ ...unit(p), backgroundImage: `url(${p.src})`, backgroundSize: `${p.frames * 100}% 100%`, animationDuration: `${secs(p.flap)}, ${secs(p.bob)}`, animationDelay: `0s, ${secs(-index * 0.5)}` }} /></span>)}
    </div>}
    {plan.stars.map((p, index) => flipPiece(p, `star-${index}`))}
    {plan.moss.map((p, index) => flipPiece(p, `moss-${index}`))}
    {plan.grass.map((p, index) => flipPiece(p, `grass-${index}`))}
    {plan.glints.length > 0 && <div className={period === 'night' ? 'scene-moonpath' : 'scene-glitter'} data-glints={plan.glints.length}>
      {plan.glints.map((p, index) => flipPiece(p, `glint-${index}`))}
    </div>}
    {tiles && <div className={`scene-tiles scene-${tiles.kind}`} style={{ opacity: r4(tiles.opacity * palette.strength), ...masked(tiles.clip ? maskUrl(polygonRuns(tiles.clip)) : null) }}>
      {tiles.layers.map((layer, index) => <i
        key={index}
        style={{
          backgroundImage: svgStrip(layer.tile, palette),
          backgroundSize: `${col(layer.tile.w)} ${row(layer.tile.h)}`,
          '--tx': `${r4((layer.x / (ART_COLS - layer.tile.w)) * 100)}%`,
          '--ty': `${r4((layer.y / (ART_ROWS - layer.tile.h)) * 100)}%`,
          animationDuration: `${secs(layer.seconds[0])}, ${secs(layer.seconds[1])}`,
          animationTimingFunction: `steps(${Math.abs(layer.x)}), steps(${Math.abs(layer.y)})`,
        }}
      />)}
    </div>}
    {plan.gleam.map((p, index) => flipPiece(p, `gleam-${index}`))}
    {plan.movers.map((p, index) => <span
      key={`mover-${index}`}
      className={`scene-mover is-${p.kind}`}
      style={{ ...box(p), '--mx': `${r4((p.tx / p.w) * 100)}%`, '--my': `${r4((p.ty / p.h) * 100)}%` }}
    ><i style={{ animationDuration: secs(p.duration), animationDelay: secs(p.delay), animationTimingFunction: `steps(${Math.max(1, Math.abs(p.tx))})` }}><b style={{
      backgroundImage: svgStrip(p.shape, palette),
      backgroundSize: `${cells(p) * 100}% 100%`,
      animationDuration: `${secs(p.duration)}, ${secs(p.duration)}${p.flipSeconds ? `, ${secs(p.flipSeconds)}` : ''}`,
      animationDelay: `${secs(p.delay)}, ${secs(p.delay)}${p.flipSeconds ? ', 0s' : ''}`,
      animationTimingFunction: `steps(${Math.max(1, Math.abs(p.ty))}), step-end${p.flipSeconds ? `, steps(${cells(p)}, jump-none)` : ''}`,
      '--o': opacity(p, palette),
    }} /></i></span>)}
    {plan.caps.map((p, index) => flipPiece(p, `cap-${index}`))}
    {plan.wash.map((p, index) => <span
      key={`wash-${index}`}
      className={`scene-px scene-wash is-${p.levels}`}
      style={{ ...box(p), backgroundImage: svgStrip(p.shape, palette), backgroundSize: '100% 100%', '--wy': `${r4((p.step / p.h) * 100)}%`, '--o': opacity(p, palette), animationDuration: secs(p.duration), animationDelay: secs(p.delay) }}
    />)}
    {plan.foam.map((p, index) => flipPiece(p, `foam-${index}`))}
    {plan.rings.map((p, index) => flipPiece(p, `ring-${index}`))}
    {plan.bubbles.map((p, index) => flipPiece(p, `bubble-${index}`))}
    {plan.mist.map((p, index) => <span
      key={`mist-${index}`}
      className="scene-px scene-mist"
      style={{ ...box(p), ...unit(p), backgroundImage: svgStrip(p.shape, palette), backgroundSize: '100% 100%', opacity: opacity(p, palette), animationDuration: secs(p.duration), animationDelay: secs(p.delay) }}
    />)}
    {plan.fireflies.map((p, index) => <span
      key={`firefly-${index}`}
      className="scene-firefly"
      style={{ ...box(p), ...unit(p), animationDuration: secs(p.wander), animationDelay: secs(p.wanderDelay) }}
    ><i className="scene-px amb-flip-25" style={flip(p, palette)} /></span>)}
    {plan.dragonflies.map((p, index) => <span
      key={`dragonfly-${index}`}
      className="scene-dragonfly"
      data-critter="dragonfly"
      style={{ ...box(p), ...unit(p), animationDuration: secs(p.duration), animationDelay: secs(p.delay) }}
    ><i style={{ backgroundImage: `url(${p.src})`, backgroundSize: `${p.frames * 100}% 100%`, animationDuration: secs(p.wings) }} /></span>)}
  </div>;
}
