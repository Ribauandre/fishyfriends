import {
  NATIVE, SCALE, SPRITE_FRAME, FRAME_COUNTS, HELD_FRAME, POSES, ARM, ROD_LENGTH, HEAD,
  solveArm, rodGeometry, solvePose, framesFor, rodTipFor,
} from './anglerRig';

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

test('the frame box scales the native grid and keeps the feet on the ground', () => {
  expect(SPRITE_FRAME).toEqual({ w: NATIVE.w * SCALE, h: NATIVE.h * SCALE, feetX: NATIVE.feetX * SCALE, feetY: NATIVE.feetY * SCALE });
  expect(NATIVE.feetY).toBeLessThan(NATIVE.h);
  expect(NATIVE.feetY).toBeGreaterThan(NATIVE.h - 8);
});

test('every action has as many poses as its strip has frames, and a held frame to rest on', () => {
  Object.entries(FRAME_COUNTS).forEach(([action, count]) => {
    expect(POSES[action]).toHaveLength(count);
    expect(framesFor(action)).toHaveLength(count);
    expect(HELD_FRAME[action]).toBeLessThan(count);
  });
});

test('the arm solver keeps both bones their length and bends the way it is asked', () => {
  const S = { x: 60, y: 40 };
  const down = solveArm(S, { x: 72, y: 60 }, ARM, 'down');
  expect(dist(S, down.elbow)).toBeCloseTo(ARM, 0);
  expect(dist(down.elbow, down.hand)).toBeCloseTo(ARM, 0);
  const up = solveArm(S, { x: 72, y: 60 }, ARM, 'up');
  expect(up.elbow.y).toBeLessThan(down.elbow.y);
  const back = solveArm(S, { x: 70, y: 20 }, ARM, 'back');
  const front = solveArm(S, { x: 70, y: 20 }, ARM, 'front');
  expect(back.elbow.x).toBeLessThan(front.elbow.x);
  // Out of reach: the hand stops at nearly full extension along the same line.
  const far = solveArm(S, { x: 160, y: 40 }, ARM, 'down');
  expect(far.hand.x).toBeCloseTo(S.x + 2 * ARM - 0.5, 0);
  expect(far.hand.y).toBeCloseTo(40, 0);
});

test('the rod runs out from the hand at its angle, the reel hangs under the grip, and a fish bends the tip down', () => {
  const hand = { x: 60, y: 50 };
  const flat = rodGeometry(hand, 0);
  expect(flat.tip).toEqual({ x: 60 + ROD_LENGTH, y: 50 });
  expect(flat.butt.x).toBeLessThan(hand.x);
  expect(flat.reel.y).toBeGreaterThan(hand.y);
  const up = rodGeometry(hand, 90);
  expect(up.tip.x).toBeCloseTo(60, 0);
  expect(up.tip.y).toBeCloseTo(50 - ROD_LENGTH, 0);
  const bent = rodGeometry(hand, 60, 0.8);
  const straight = rodGeometry(hand, 60, 0);
  expect(bent.tip.y).toBeGreaterThan(straight.tip.y);
  expect(bent.tip.x).toBeGreaterThan(straight.tip.x);
  expect(rodGeometry(hand, 60, -0.2).tip).toEqual(straight.tip);
});

test('solved poses put the hands on the rod and keep the figure inside the frame', () => {
  Object.keys(FRAME_COUNTS).forEach((action) => {
    framesFor(action).forEach((s) => {
      // The rod hand is where the pose asked (within reach).
      const holder = s.rod.inFront || s.rodHand === 'front' ? s.arms.front.hand : s.arms.back.hand;
      expect(dist(holder, s.rod.hand)).toBeLessThan(2.5);
      // Bones stay bones.
      expect(dist(s.shoulders.front, s.arms.front.elbow)).toBeCloseTo(ARM, 0);
      expect(dist(s.arms.back.elbow, s.arms.back.hand)).toBeCloseTo(ARM, 0);
      // Head, hands and rod tip all land inside the strip frame (a few pixels of grace at the top for the backswing).
      [s.head, s.arms.front.hand, s.arms.back.hand, s.rod.tip, s.rod.butt].forEach((point) => {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(NATIVE.w);
        expect(point.y).toBeGreaterThanOrEqual(-6);
        expect(point.y).toBeLessThanOrEqual(NATIVE.h);
      });
    });
  });
});

test('a jump lifts the whole figure and a lean moves the head further than the shoulders', () => {
  const still = solvePose(POSES.celebrate[0]);
  const airborne = solvePose(POSES.celebrate[2]);
  expect(airborne.lift).toBeLessThan(0);
  expect(airborne.head.y).toBe(still.head.y + airborne.lift);
  expect(airborne.shoulders.front.y).toBe(still.shoulders.front.y + airborne.lift);
  const leaning = solvePose(POSES.cast[4]);
  expect(leaning.lean).toBeGreaterThan(0);
  expect(leaning.head.x - HEAD.x).toBeGreaterThan(leaning.shoulders.front.x - 63);
});

test('the backswing carries the rod behind the head; every other frame holds it in front', () => {
  const cast = framesFor('cast');
  expect(cast[2].rod.inFront).toBe(false);
  expect(cast[5].rod.inFront).toBe(true);
  framesFor('reel').forEach((s) => expect(s.rod.inFront).toBe(true));
  // Celebrating, the rod is in the back hand and the front fist is up by the hat.
  const cheer = framesFor('celebrate')[2];
  expect(cheer.rod.inFront).toBe(false);
  expect(cheer.arms.front.hand.y).toBeLessThan(cheer.head.y + 8);
});

test('rodTipFor is the held frame tip in strip pixels: out over the water while waiting, high while fighting', () => {
  const waiting = rodTipFor('cast');
  const held = framesFor('cast')[5];
  expect(waiting).toEqual({ x: Math.round(held.rod.tip.x * SCALE), y: Math.round(held.rod.tip.y * SCALE) });
  expect(waiting.x).toBeGreaterThan(SPRITE_FRAME.feetX + 60 * SCALE);
  expect(rodTipFor('fishon').y).toBeLessThan(rodTipFor('cast').y);
  // At rest the rod stands up, so its tip is above the fighting rod's and above the hat.
  expect(rodTipFor('idle').y).toBeLessThan(rodTipFor('reel').y);
  expect(rodTipFor('idle').y).toBeLessThan(framesFor('idle')[0].head.y * SCALE);
});
