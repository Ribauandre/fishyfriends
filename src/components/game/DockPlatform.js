import React from 'react';
import { DOCK_KIT, pilingsFor, deckTilePct } from '../../utils/dockKit';
import { stageX, stageY, stageLen, pctX, pctY, pctW } from '../../utils/sceneLayout';

// The dock, built from the kit rather than painted into the backdrop: the plank span runs from
// the left edge of the painting to `dock.x1`, the pilings stand in front of it and the post
// with the rope caps the end. Everything is in painting units, so the dock crops and scales
// with the painting and a ground can have as much or as little dock as its water wants.
export default function DockPlatform({ dock, frame }) {
  if (!dock) return null;
  const top = stageY(dock.y, frame);
  const depth = stageLen(dock.h, frame);
  return <div className="scene-dock" data-dock-x1={dock.x1}>
    <div
      className="scene-dock-deck"
      style={{
        left: 0,
        top: pctY(top),
        width: pctX(stageX(dock.x1, frame), frame),
        height: pctY(depth),
        backgroundImage: `url(${DOCK_KIT.deck.src})`,
        backgroundSize: `${deckTilePct(dock)}% 100%`,
      }}
    />
    {pilingsFor(dock).map((x) => <img
      key={x}
      className="scene-dock-piling"
      src={DOCK_KIT.piling.src}
      alt=""
      style={{ left: pctX(stageX(x, frame), frame), top: pctY(top + depth * DOCK_KIT.piling.top), width: pctW(dock.h * DOCK_KIT.piling.w, frame) }}
    />)}
    <img
      className="scene-dock-end"
      src={DOCK_KIT.end.src}
      alt=""
      style={{ left: pctX(stageX(dock.x1, frame), frame), top: pctY(top + depth * DOCK_KIT.end.top), width: pctW(dock.h * DOCK_KIT.end.w, frame) }}
    />
  </div>;
}
