// The angler's skeleton and poses. Everything here is in *native* pixels: a frame is a
// NATIVE.w × NATIVE.h grid with the feet at (feetX, feetY), the figure faces right (the water
// is always to the right of the dock), and utils/anglerDraw.js renders these poses SCALE×
// with no smoothing, which is what makes it pixel art. Nothing here touches the DOM, so the
// poses, the arm solver and the rod geometry are unit-tested on their own.
//
// A pose is a handful of numbers — where the rod hand is, the rod's angle and bend, how far
// the body leans, a bob or a jump, the stance and the face — and `framesFor` turns each
// action's list of them into solved frames: shoulders, elbows (two-bone IK), hands and the
// rod's butt, reel and tip. `rodTipFor` is what the fishing line and the pennant attach to.
export const NATIVE = { w: 144, h: 120, feetX: 50, feetY: 116 };
export const SCALE = 3;
export const SPRITE_FRAME = { w: NATIVE.w * SCALE, h: NATIVE.h * SCALE, feetX: NATIVE.feetX * SCALE, feetY: NATIVE.feetY * SCALE };

export const FRAME_COUNTS = { idle: 7, cast: 6, reel: 7, fishon: 6, celebrate: 8 };
// The frame a strip rests on while its phase is held (see anglerAction in anglerSprites.js).
export const HELD_FRAME = { idle: 0, cast: 5, reel: 0, fishon: 5, celebrate: 0 };

export const ROD_LENGTH = 58;
export const ARM = 16;
export const HIP_Y = 72;
export const SHOULDER_Y = 46;
export const SHOULDERS = { back: { x: 37, y: SHOULDER_Y }, front: { x: 63, y: SHOULDER_Y } };
export const HEAD = { x: 36, y: 12, w: 28, h: 28 };
export const LEGS = { back: 37, front: 51, w: 13 };

const rad = (deg) => (deg * Math.PI) / 180;
const r1 = (value) => Math.round(value * 10) / 10;

// Two-bone IK: the elbow for a shoulder S reaching a hand H with two bones of length `len`.
// `bend` picks which of the two mirror solutions: elbows hang 'down' unless a pose says
// 'up' (a raised fist), 'back' (behind the body) or 'front'.
export function solveArm(S, H, len = ARM, bend = 'down') {
  const dx = H.x - S.x; const dy = H.y - S.y;
  const dist = Math.hypot(dx, dy) || 0.001;
  const reach = Math.min(dist, 2 * len - 0.5);
  const ux = dx / dist; const uy = dy / dist;
  const hand = { x: S.x + ux * reach, y: S.y + uy * reach };
  const half = reach / 2;
  const h = Math.sqrt(Math.max(0, len * len - half * half));
  const mid = { x: S.x + ux * half, y: S.y + uy * half };
  const a = { x: mid.x + -uy * h, y: mid.y + ux * h };
  const b = { x: mid.x - -uy * h, y: mid.y - ux * h };
  const pick = {
    down: a.y >= b.y ? a : b,
    up: a.y < b.y ? a : b,
    back: a.x <= b.x ? a : b,
    front: a.x > b.x ? a : b,
  }[bend] || a;
  return { elbow: { x: r1(pick.x), y: r1(pick.y) }, hand: { x: r1(hand.x), y: r1(hand.y) } };
}

// The rod from the hand holding it: butt behind the hand, reel hanging under the grip, tip
// out along the angle and, when a fish is on, bent down toward the water. Coordinates are
// frame pixels; angle is degrees above the water (0 = flat out to the right, 90 = straight up).
export function rodGeometry(hand, angle, bend = 0) {
  const dir = { x: Math.cos(rad(angle)), y: -Math.sin(rad(angle)) };
  const under = { x: Math.sin(rad(angle)), y: Math.cos(rad(angle)) };
  const along = (t, off = 0) => ({ x: r1(hand.x + dir.x * t + under.x * off), y: r1(hand.y + dir.y * t + under.y * off) });
  const droop = Math.max(0, bend) * ROD_LENGTH;
  return {
    butt: along(-12),
    grip: along(4),
    reel: along(-5, 5),
    control: { x: r1(hand.x + dir.x * ROD_LENGTH * 0.55 + droop * 0.06), y: r1(hand.y + dir.y * ROD_LENGTH * 0.55 + droop * 0.12) },
    tip: { x: r1(hand.x + dir.x * ROD_LENGTH + droop * 0.3), y: r1(hand.y + dir.y * ROD_LENGTH + droop * 0.62) },
    dir,
    under,
  };
}

const pose = (overrides) => ({ lean: 0, bob: 0, jump: 0, stance: 'stand', face: 'calm', rodHand: 'front', hand: { x: 64, y: 68 }, angle: 72, bend: 0, crank: null, backHand: null, ...overrides });

// The keyframes, one per strip frame.
export const POSES = {
  // At rest the rod stands up past the face, so the tip (and the champion's pennant) sits above the
  // row of anglers instead of ending at the next one's head.
  idle: [0, 1, 2, 2, 1, 0, -1].map((sway, index) => pose({ angle: 75 + sway, hand: { x: 66, y: 66 }, bob: [0, 0, -1, -1, 0, 0, 0][index] })),
  cast: [
    pose({ angle: 70, hand: { x: 64, y: 64 } }),
    pose({ angle: 100, hand: { x: 64, y: 54 }, lean: -2 }),
    pose({ angle: 148, hand: { x: 54, y: 30 }, lean: -4, stance: 'brace', face: 'grit' }),
    pose({ angle: 50, hand: { x: 74, y: 44 }, lean: 2, stance: 'step', face: 'grit' }),
    pose({ angle: 6, hand: { x: 78, y: 48 }, lean: 5, stance: 'step', bend: -0.06 }),
    pose({ angle: 16, hand: { x: 74, y: 52 }, lean: 3, stance: 'step' }),
  ],
  reel: [0, 1, 2, 3, 4, 5, 6].map((index) => pose({ angle: 50, hand: { x: 70, y: 54 }, bend: 0.35, lean: 1, stance: 'brace', crank: (index * 360) / 7, bob: [0, -1, -1, 0, 0, -1, 0][index] })),
  fishon: [0.3, 0.55, 0.75, 0.8, 0.7, 0.8].map((bend, index) => pose({ angle: 60, hand: { x: 66, y: 48 }, bend, lean: [-1, -3, -5, -6, -5, -6][index], stance: 'brace', face: 'grit', backHand: 'butt' })),
  celebrate: [[78, 18, 0], [80, 8, -5], [80, 4, -9], [80, 8, -6], [78, 14, -2], [76, 22, 0], [72, 28, 0], [70, 32, 0]].map(([x, y, jump]) => pose({ rodHand: 'back', angle: 100, backHand: { x: 36, y: 68 }, hand: { x, y }, face: 'grin', jump })),
};

// Where the legs go for a stance: each leg's x shift and how far the hips drop.
export const STANCES = {
  stand: { back: 0, front: 0, drop: 0 },
  step: { back: -4, front: 6, drop: 1 },
  brace: { back: -5, front: 5, drop: 2 },
};

// Solve one pose into everything the renderer draws.
export function solvePose(p) {
  const stance = STANCES[p.stance] || STANCES.stand;
  const lift = p.jump; // negative = up
  const torsoY = p.bob + stance.drop + lift;
  const shoulders = {
    back: { x: SHOULDERS.back.x + p.lean, y: SHOULDERS.back.y + torsoY },
    front: { x: SHOULDERS.front.x + p.lean, y: SHOULDERS.front.y + torsoY },
  };
  const head = { x: HEAD.x + p.lean * 1.5, y: HEAD.y + torsoY, w: HEAD.w, h: HEAD.h };
  const rodHand = p.rodHand;
  const rodHandPos = rodHand === 'front' ? { x: p.hand.x, y: p.hand.y + lift } : { x: p.backHand.x, y: p.backHand.y + lift };
  const rod = rodGeometry(rodHandPos, p.angle, p.bend);
  let front; let back;
  if (rodHand === 'front') {
    front = solveArm(shoulders.front, rodHandPos, ARM, 'down');
    let target;
    if (p.crank != null) target = { x: rod.reel.x + Math.cos(rad(p.crank)) * 3, y: rod.reel.y + Math.sin(rad(p.crank)) * 3 };
    else if (p.backHand === 'butt') target = { x: rod.butt.x + 1, y: rod.butt.y + 1 };
    else target = { x: rod.reel.x - 2, y: rod.reel.y + 3 };
    back = solveArm(shoulders.back, target, ARM, 'down');
  } else {
    back = solveArm(shoulders.back, rodHandPos, ARM, 'down');
    front = solveArm(shoulders.front, { x: p.hand.x, y: p.hand.y + lift }, ARM, 'front');
  }
  return {
    ...p,
    stanceShift: stance,
    torsoY,
    lift,
    shoulders,
    head,
    arms: { front, back },
    // Over the shoulder on the backswing the rod passes behind the head.
    rod: { ...rod, hand: rodHandPos, inFront: rodHand === 'front' && p.angle <= 95 },
  };
}

export function framesFor(action) {
  return (POSES[action] || POSES.idle).map(solvePose);
}

// The rod tip of the frame a strip holds on, in strip pixels (SCALE×) — the line and the
// pennant hang off it.
export function rodTipFor(action) {
  const frame = framesFor(action)[HELD_FRAME[action] || 0];
  return { x: Math.round(frame.rod.tip.x * SCALE), y: Math.round(frame.rod.tip.y * SCALE) };
}
