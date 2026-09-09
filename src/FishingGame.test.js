import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FishingGame from './FishingGame';
import { useAuth } from './context/AuthContext';
import { stepReel } from './utils/reelPhysics';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./utils/reelPhysics', () => {
  const actual = jest.requireActual('./utils/reelPhysics');
  return { ...actual, stepReel: jest.fn(actual.stepReel) };
});

function makeGameProfile(overrides = {}) {
  return { tackle_points: 100, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, ...overrides };
}

function makeBaseAuth(overrides = {}) {
  return {
    getGameProfile: jest.fn().mockResolvedValue(makeGameProfile()),
    listMyGameCatches: jest.fn().mockResolvedValue([]),
    logGameCatch: jest.fn().mockResolvedValue({
      error: null,
      catchEntry: { id: 'gc-1', species: 'trout', rarity: 'common', size_label: '8.0 in', points_earned: 5 },
      gameProfile: makeGameProfile({ tackle_points: 105 }),
    }),
    purchaseUpgrade: jest.fn(),
    ...overrides,
  };
}

async function advance(ms) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function reachWaiting() {
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await userEvent.click(screen.getByRole('button', { name: /^cast!/i }));
}

beforeEach(() => {
  jest.useFakeTimers({ legacyFakeTimers: true });
  useAuth.mockReturnValue(makeBaseAuth());
  jest.spyOn(Math, 'random').mockReturnValue(0.5);
  stepReel.mockClear();
});

afterEach(() => {
  Math.random.mockRestore();
  jest.useRealTimers();
});

test('shows a loading state, then the stage, shop and empty trophy case once data resolves', async () => {
  render(<FishingGame />);
  expect(screen.getByText(/loading your tackle box/i)).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('button', { name: 'Cast' })).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
  expect(screen.getByText(/no catches yet/i)).toBeInTheDocument();
  ['Rod', 'Line', 'Reel', 'Bait'].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
});

test('striking before a bite ends the round as a false start', async () => {
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  expect(screen.getByText(/waiting for a bite/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook' }));
  expect(screen.getByText(/too early/i)).toBeInTheDocument();
});

test('missing the hookset window lets the fish steal the bait', async () => {
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  await advance(4000);
  expect(screen.getByText(/fish on/i)).toBeInTheDocument();
  await advance(2000);
  expect(screen.getByText(/stole the bait/i)).toBeInTheDocument();
});

test('landing the fish logs the catch and shows the trophy result', async () => {
  const logGameCatch = jest.fn().mockResolvedValue({
    error: null,
    catchEntry: { id: 'gc-1', species: 'trout', rarity: 'common', size_label: '8.0 in', points_earned: 5 },
    gameProfile: makeGameProfile({ tackle_points: 105 }),
  });
  useAuth.mockReturnValue(makeBaseAuth({ logGameCatch }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  await advance(4000);
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook!' }));
  expect(screen.getByRole('button', { name: 'Hold to reel' })).toBeInTheDocument();

  stepReel.mockReturnValueOnce({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 100, tension: 0 });
  await advance(80);

  expect(logGameCatch).toHaveBeenCalledWith(expect.objectContaining({ species: expect.any(String), rarity: expect.any(String) }));
  expect(await screen.findByText(/landed!/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cast again' })).toBeInTheDocument();
});

test('a snapped line ends the round without logging a catch', async () => {
  const logGameCatch = jest.fn();
  useAuth.mockReturnValue(makeBaseAuth({ logGameCatch }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  await advance(4000);
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook!' }));

  stepReel.mockReturnValueOnce({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 10, tension: 9999 });
  await advance(80);

  expect(logGameCatch).not.toHaveBeenCalled();
  expect(screen.getByText(/line snapped/i)).toBeInTheDocument();
});

test('purchasing an upgrade updates the tackle profile shown', async () => {
  const purchaseUpgrade = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 60, rod_level: 2 }) });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseUpgrade }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(purchaseUpgrade).toHaveBeenCalledWith('rod');
  expect(await screen.findByText('60')).toBeInTheDocument();
  expect(screen.getByText(/lv 2/i)).toBeInTheDocument();
});

test('shows the server error when an upgrade purchase fails', async () => {
  const purchaseUpgrade = jest.fn().mockResolvedValue({ error: new Error('Not enough tackle points yet.') });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseUpgrade }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(await screen.findByText(/not enough tackle points yet/i)).toBeInTheDocument();
});

test('renders past catches in the trophy case', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listMyGameCatches: jest.fn().mockResolvedValue([
      { id: 'gc-1', species: 'shark', rarity: 'legendary', size_label: '50.0 in', points_earned: 150 },
    ]),
  }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Shark')).toBeInTheDocument();
  expect(screen.getByText(/50\.0 in · \+150 pts/i)).toBeInTheDocument();
  expect(screen.getByText('Legendary')).toBeInTheDocument();
});
