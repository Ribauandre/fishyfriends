// Pure per-tick physics for Cast & Catch's reel-in phase, split out from FishingGame so the
// actual skill mechanic (keep the fish inside a moving catch zone) can be tested without
// timers or DOM. The component just calls stepReel on a fixed interval and renders the
// result; it holds no game logic of its own.
export const INITIAL_REEL_STATE = { fishPos: 50, fishVel: 0, zonePos: 50, progress: 0, tension: 0, run: 0, runVel: 0 };

// A hooked fish does not wander: it sulks, then bolts. Between runs the fish drifts on a
// damped random walk; each tick there is a chance (`runChance`, the species' rarity's — a
// common fish mostly sulks, a legendary one is never still) to start a run — a burst of
// velocity (`runPower` times the base burst) in one direction for a few ticks, quicker than
// the stock reel can follow, so the player has to read where it is going rather than chase
// where it is — and a smaller chance it jinks, snapping back the way it came. All of it goes
// through Math.random, so a mocked 0.5 keeps the fish still and the zone maths testable.
// Without an explicit temperament the run chance and power follow the fish's speed.
//
// The numbers are balanced against a modelled player (the fight simulator in the session
// scratchpad: a thumb that sees the fish two to four ticks late and fumbles now and then)
// so that a run costs a share of the line, never all of it: with stock tackle an average
// player lands nearly every common and uncommon, three rare fish in four, one epic in four
// and a legendary once in thirty, and at level 5 on every track lands rare and epic fish
// almost every time and three legendaries in four. Before this a run carried a legendary
// seventy units in five ticks against a zone that could follow twenty-seven, and no level
// of tackle landed one.
export const RUN_CHANCE = 0.06;
export const JINK_CHANCE = 0.035;
export const MAX_FISH_VEL = 11;
// A run's burst of velocity, before the fish's runPower: quicker than the stock reel can
// follow for any fish but a common one, so a run always costs some line, never all of it.
export const RUN_BURST = [4, 3];
// How far the zone moves a tick under the player's thumb — the reel's; a better reel is a
// faster one, so `zonePull` is passed in (gameUpgrades.zonePullFor) and this is the stock reel.
export const ZONE_PULL = 5.5;
// Tension per tick out of the zone is the fish's drainRate times this; in the zone it recovers.
export const TENSION_GAIN = 4.5;
export const TENSION_RECOVERY = 4;
// Progress a tick with the fish in the zone, and lost a tick with it out.
export const PROGRESS_GAIN = 3.2;
export const PROGRESS_LOSS = 1.2;

export function stepReel(state, { holding, fishSpeed, drainRate, zoneWidth, zonePull = ZONE_PULL, runChance = RUN_CHANCE * fishSpeed, runPower = Math.min(1.6, fishSpeed) }) {
  let run = state.run || 0;
  let runVel = state.runVel || 0;
  let velocity = state.fishVel;
  if (run > 0) {
    run -= 1;
    velocity = velocity * 0.55 + runVel * 0.45;
  } else if (Math.random() < runChance) {
    const direction = Math.random() < 0.5 ? -1 : 1;
    run = 3 + Math.floor(Math.random() * 5);
    runVel = direction * (RUN_BURST[0] + Math.random() * RUN_BURST[1]) * runPower;
    velocity = runVel * 0.6;
  } else {
    velocity += ((Math.random() * 2 - 1) - velocity * 0.15) * fishSpeed;
    if (Math.random() < JINK_CHANCE * (runChance / RUN_CHANCE)) velocity = -velocity * 1.5;
  }
  velocity = Math.max(-MAX_FISH_VEL, Math.min(MAX_FISH_VEL, velocity));
  let fishPos = state.fishPos + velocity;
  // Off either edge the fish turns, and a run turns with it.
  if (fishPos < 0) { fishPos = -fishPos; velocity = -velocity; runVel = -runVel; }
  if (fishPos > 100) { fishPos = 200 - fishPos; velocity = -velocity; runVel = -runVel; }

  const pull = holding ? zonePull : -zonePull * 0.82;
  const zonePos = Math.max(0, Math.min(100, state.zonePos + pull));

  const inZone = Math.abs(fishPos - zonePos) <= zoneWidth / 2;
  const progress = Math.max(0, Math.min(100, state.progress + (inZone ? PROGRESS_GAIN : -PROGRESS_LOSS)));
  const tension = Math.max(0, state.tension + (inZone ? -TENSION_RECOVERY : drainRate * TENSION_GAIN));

  return { fishPos, fishVel: velocity, zonePos, progress, tension, run, runVel };
}
