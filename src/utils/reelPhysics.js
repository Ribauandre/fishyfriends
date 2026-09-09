// Pure per-tick physics for Cast & Catch's reel-in phase, split out from FishingGame so the
// actual skill mechanic (keep the fish inside a moving catch zone) can be tested without
// timers or DOM. The component just calls stepReel on a fixed interval and renders the
// result; it holds no game logic of its own.
export const INITIAL_REEL_STATE = { fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 0 };

export function stepReel(state, { holding, fishSpeed, drainRate, zoneWidth }) {
  let velocity = state.fishVel + ((Math.random() * 2 - 1) - state.fishVel * 0.15) * fishSpeed;
  velocity = Math.max(-6, Math.min(6, velocity));
  let fishPos = state.fishPos + velocity;
  if (fishPos < 0) { fishPos = -fishPos; velocity = -velocity; }
  if (fishPos > 100) { fishPos = 200 - fishPos; velocity = -velocity; }

  const pull = holding ? 5.5 : -4.5;
  const zonePos = Math.max(0, Math.min(100, state.zonePos + pull));

  const inZone = Math.abs(fishPos - zonePos) <= zoneWidth / 2;
  const progress = Math.max(0, Math.min(100, state.progress + (inZone ? 3.2 : -1.6)));
  const tension = Math.max(0, state.tension + (inZone ? -2.5 : drainRate * 4.5));

  return { fishPos, fishVel: velocity, zonePos, progress, tension };
}
