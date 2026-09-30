import React from 'react';
import { render, act } from '@testing-library/react';
import useStripFrame, { stripFrameAt, heldFrame } from './useStripFrame';
import { anglerAction, FRAME_MS } from '../../utils/anglerSprites';

test('the frame on screen follows the strip\'s own clock: once and hold, or round and round', () => {
  const hookset = anglerAction({ phase: 'hookset' });
  expect([0, 124, 125, 260, 5000].map((ms) => stripFrameAt(hookset, ms))).toEqual([0, 0, 1, 2, 2]);
  const reeling = anglerAction({ phase: 'reeling', holding: true });
  expect([0, 125, 250, 375, 500, 625].map((ms) => stripFrameAt(reeling, ms))).toEqual([0, 1, 2, 3, 0, 1]);
  // A held pose is its frame, whatever the clock.
  expect(stripFrameAt(anglerAction({ phase: 'waiting' }), 999)).toBe(3);
  expect(heldFrame(anglerAction({ phase: 'result', result: { success: true } }))).toBe(3);
  expect(heldFrame(reeling)).toBe(0);
});

function Probe({ current, stripKey, onFrame }) {
  onFrame(useStripFrame(current, stripKey));
  return null;
}

test('the hook counts frames from when the strip starts, against the clock', () => {
  jest.useFakeTimers();
  const frames = [];
  const cast = anglerAction({ phase: 'casting' });
  try {
    render(<Probe current={cast} stripKey="casting" onFrame={(f) => frames.push(f)} />);
    expect(frames[frames.length - 1]).toBe(0);
    act(() => { jest.advanceTimersByTime(FRAME_MS * 2 + 20); });
    expect(frames[frames.length - 1]).toBe(2);
    act(() => { jest.advanceTimersByTime(FRAME_MS * 4); });
    // Played once, it holds its last frame.
    expect(frames[frames.length - 1]).toBe(3);
  } finally {
    jest.useRealTimers();
  }
});

// The CSS drops a sprite to its held frame the moment reduced motion is turned on, and starts it
// again when it is turned off; the frame the line and the pennant follow must do the same, live.
test('the hook follows a change of prefers-reduced-motion while a strip is playing', () => {
  jest.useFakeTimers();
  const listeners = new Set();
  const query = { matches: false, addEventListener: (type, cb) => listeners.add(cb), removeEventListener: (type, cb) => listeners.delete(cb) };
  const original = window.matchMedia;
  window.matchMedia = () => query;
  const flip = (matches) => act(() => { query.matches = matches; listeners.forEach((cb) => cb({ matches })); });
  const frames = [];
  try {
    render(<Probe current={anglerAction({ phase: 'reeling', holding: true })} stripKey="reel-loop" onFrame={(f) => frames.push(f)} />);
    act(() => { jest.advanceTimersByTime(FRAME_MS * 2 + 20); });
    expect(frames[frames.length - 1]).toBe(2);
    expect(listeners.size).toBe(1);
    flip(true);
    expect(frames[frames.length - 1]).toBe(0);
    act(() => { jest.advanceTimersByTime(FRAME_MS * 5); });
    expect(frames[frames.length - 1]).toBe(0);
    flip(false);
    act(() => { jest.advanceTimersByTime(FRAME_MS + 20); });
    expect(frames[frames.length - 1]).toBe(1);
  } finally {
    window.matchMedia = original;
    jest.useRealTimers();
  }
});

test('a new strip starts again at its first frame; a held pose never ticks', () => {
  jest.useFakeTimers();
  const frames = [];
  try {
    const { rerender } = render(<Probe current={anglerAction({ phase: 'casting' })} stripKey="casting" onFrame={(f) => frames.push(f)} />);
    act(() => { jest.advanceTimersByTime(FRAME_MS * 5); });
    expect(frames[frames.length - 1]).toBe(3);
    rerender(<Probe current={anglerAction({ phase: 'hookset' })} stripKey="hookset" onFrame={(f) => frames.push(f)} />);
    expect(frames[frames.length - 1]).toBe(0);
    rerender(<Probe current={anglerAction({ phase: 'waiting' })} stripKey="waiting" onFrame={(f) => frames.push(f)} />);
    expect(frames[frames.length - 1]).toBe(3);
  } finally {
    jest.useRealTimers();
  }
});
