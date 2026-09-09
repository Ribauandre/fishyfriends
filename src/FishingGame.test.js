import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FishingGame from './FishingGame';
import { useAuth } from './context/AuthContext';
import { stepReel } from './utils/reelPhysics';
import { twitchJerk, stepCrank } from './utils/lurePhysics';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./utils/reelPhysics', () => {
  const actual = jest.requireActual('./utils/reelPhysics');
  return { ...actual, stepReel: jest.fn(actual.stepReel) };
});
jest.mock('./utils/lurePhysics', () => {
  const actual = jest.requireActual('./utils/lurePhysics');
  return { ...actual, twitchJerk: jest.fn(actual.twitchJerk), stepCrank: jest.fn(actual.stepCrank) };
});

function makeGameProfile(overrides = {}) {
  return { tackle_points: 100, rod_level: 1, line_level: 1, reel_level: 1, bait_level: 1, owned_lures: [], ...overrides };
}

function makeBaseAuth(overrides = {}) {
  return {
    profile: { display_name: 'Andre', avatar_url: '' },
    personalBests: [],
    getGameProfile: jest.fn().mockResolvedValue(makeGameProfile()),
    listMyGameCatches: jest.fn().mockResolvedValue([]),
    logGameCatch: jest.fn().mockResolvedValue({
      error: null,
      catchEntry: { id: 'gc-1', species: 'trout', rarity: 'common', size_label: '8.0 in', points_earned: 5 },
      gameProfile: makeGameProfile({ tackle_points: 105 }),
    }),
    purchaseUpgrade: jest.fn(),
    charterBoat: jest.fn(),
    purchaseLure: jest.fn(),
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
  twitchJerk.mockClear();
  stepCrank.mockClear();
});

afterEach(() => {
  Math.random.mockRestore();
  jest.useRealTimers();
});

test('shows a loading state, then one game frame with the shop and trophy case as overlays', async () => {
  render(<FishingGame />);
  expect(screen.getByText(/loading your tackle box/i)).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByRole('button', { name: 'Cast' })).toBeInTheDocument();
  expect(screen.getByLabelText('100 tackle points')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(screen.getByRole('dialog', { name: /real bests and game catches/i })).toBeInTheDocument();
  expect(screen.getByText(/nothing on the wall yet/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close real bests/i }));
  expect(screen.queryByRole('dialog')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
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
  expect(screen.getByRole('button', { name: 'Back to the dock' })).toBeInTheDocument();
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
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(purchaseUpgrade).toHaveBeenCalledWith('rod');
  expect(await screen.findByLabelText('60 tackle points')).toBeInTheDocument();
  expect(screen.getByText(/lv 2/i)).toBeInTheDocument();
});

test('shows the server error when an upgrade purchase fails', async () => {
  const purchaseUpgrade = jest.fn().mockResolvedValue({ error: new Error('Not enough tackle points yet.') });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseUpgrade }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(await screen.findByText(/not enough tackle points yet/i, { selector: '.form-error' })).toBeInTheDocument();
});

test('chartering an offshore trip deducts tackle points before casting', async () => {
  const charterBoat = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 50 }) });
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  expect(charterBoat).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('50 tackle points')).toBeInTheDocument();
  expect(screen.getByText(/tap to stop the cast/i)).toBeInTheDocument();
});

test('declines to charter without enough points and stays on the dock', async () => {
  const charterBoat = jest.fn().mockResolvedValue({ error: new Error('Not enough tackle points to charter a boat.') });
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  expect(await screen.findByText(/not enough tackle points to charter a boat/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Cast' })).toBeInTheDocument();
});

test('leaving offshore and coming back requires chartering again', async () => {
  const charterBoat = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 50 }) });
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(charterBoat).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole('button', { name: /^cast!/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook' }));
  await userEvent.click(screen.getByRole('button', { name: 'Back to the dock' }));

  // Same trip, still chartered — casting again shouldn't charge a second time.
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); });
  expect(charterBoat).toHaveBeenCalledTimes(1);

  await userEvent.click(screen.getByRole('button', { name: /^cast!/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook' }));
  await userEvent.click(screen.getByRole('button', { name: 'Back to the dock' }));

  // Switching away and back to offshore ends the trip, so it charters again.
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /^river/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(charterBoat).toHaveBeenCalledTimes(2);
});

test('unlocking a lure spends tackle points and ties it on', async () => {
  const purchaseLure = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 40, owned_lures: ['jerkbait'] }) });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseLure }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });

  expect(screen.getByRole('button', { name: /jerk bait unlock · 60 pts/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /jerk bait/i }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });

  expect(purchaseLure).toHaveBeenCalledWith('jerkbait');
  expect(screen.getByLabelText('40 tackle points')).toBeInTheDocument();
  expect(screen.getByText('Jerk bait', { selector: '.hud-chip' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /jerk bait owned/i })).toBeInTheDocument();
});

test('a failed lure purchase shows the error and keeps live bait tied on', async () => {
  const purchaseLure = jest.fn().mockResolvedValue({ error: new Error('Not enough tackle points yet.') });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseLure }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /crank bait/i }));
  expect(await screen.findByText(/not enough tackle points yet/i, { selector: '.form-error' })).toBeInTheDocument();
  expect(screen.getByText('Live bait', { selector: '.hud-chip' })).toBeInTheDocument();
});

test('jerk bait: twitching on the beat fills attraction and triggers the bite', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['jerkbait'] })) }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /jerk bait/i }));
  await reachWaiting();

  expect(screen.getByRole('button', { name: 'Twitch' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Set the hook' })).not.toBeInTheDocument();

  twitchJerk.mockReturnValueOnce({ attraction: 100, hits: 5, misses: 0, lastTwitchOnBeat: true });
  await userEvent.click(screen.getByRole('button', { name: 'Twitch' }));
  await act(async () => { await Promise.resolve(); });

  expect(screen.getByText(/fish on/i)).toBeInTheDocument();
});

test('jerk bait: running out of retrieve with no bite wastes the cast', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['jerkbait'] })) }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /jerk bait/i }));
  await reachWaiting();
  await advance(16000);
  expect(screen.getByText(/no takers/i)).toBeInTheDocument();
});

test('crank bait: a retrieve held in the strike zone triggers the bite', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['crankbait'] })) }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /crank bait/i }));
  await reachWaiting();

  expect(screen.getByRole('button', { name: 'Hold to crank' })).toBeInTheDocument();
  stepCrank.mockReturnValueOnce({ speed: 55, bandCenter: 55, attraction: 100, distance: 20, inBandTicks: 30, ticks: 30 });
  await advance(80);

  expect(screen.getByText(/fish on/i)).toBeInTheDocument();
});

test('crank bait: reaching the boat with no strike wastes the cast', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['crankbait'] })) }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /crank bait/i }));
  await reachWaiting();

  stepCrank.mockReturnValueOnce({ speed: 80, bandCenter: 40, attraction: 10, distance: 100, inBandTicks: 0, ticks: 30 });
  await advance(80);

  expect(screen.getByText(/nothing followed/i)).toBeInTheDocument();
});

test('the angler on the stage is the signed-in person', async () => {
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  expect(document.querySelector('.game-scene[data-phase="ready"]')).toBeInTheDocument();
  expect(screen.getByText('ANDRE')).toBeInTheDocument();
});

test('real personal bests hang in the trophy case, tagged apart from game catches', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    personalBests: [{ id: 'pb-1', species: 'Striped Bass', size_label: '34 in', photo_url: '' }],
    listMyGameCatches: jest.fn().mockResolvedValue([{ id: 'gc-1', species: 'walleye', rarity: 'uncommon', size_label: '18.0 in', points_earned: 12 }]),
  }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(screen.getByText('Striped Bass')).toBeInTheDocument();
  expect(screen.getByText('Real PB')).toBeInTheDocument();
  expect(screen.getByText('34 in')).toBeInTheDocument();
  expect(document.querySelector('.trophy-card.is-real img')).toHaveAttribute('data-species', 'stripedbass');
  expect(screen.getByText('Walleye')).toBeInTheDocument();
  expect(screen.getByText('Uncommon')).toBeInTheDocument();
});

test('the shop owner reacts to a purchase and the captain pitches the charter', async () => {
  const purchaseUpgrade = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 60, rod_level: 2 }) });
  useAuth.mockReturnValue(makeBaseAuth({ purchaseUpgrade }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/work the current seams/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/100 tackle points, huh/i)).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(await screen.findByText(/rod will treat you right/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close tackle shop/i }));

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  expect(screen.getByText(/50 points gets you past the reef/i)).toBeInTheDocument();
});

test('renders past catches in the trophy case', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listMyGameCatches: jest.fn().mockResolvedValue([
      { id: 'gc-1', species: 'shark', rarity: 'legendary', size_label: '50.0 in', points_earned: 150 },
    ]),
  }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(screen.getByText('Shark')).toBeInTheDocument();
  expect(screen.getByText(/50\.0 in · \+150 pts/i)).toBeInTheDocument();
  expect(screen.getByText('Legendary')).toBeInTheDocument();
});

test('picking a new ground plays the trip on the stage, and casting cuts it short', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat: jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 50 }) }) }));
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  expect(document.querySelector('.scene-travel')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /^bay/i }));
  expect(document.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'truck');
  expect(screen.getByText('Bay', { selector: '.hud-chip' })).toBeInTheDocument();
  await advance(2000);
  expect(document.querySelector('.scene-travel')).toBeNull();

  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /offshore/i }));
  expect(document.querySelector('.scene-travel')).toHaveAttribute('data-vehicle', 'boat');
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(document.querySelector('.scene-travel')).toBeNull();
});

test('the shop is a place: Sal, the shop interior, and gear icons on every upgrade', async () => {
  render(<FishingGame />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  const panel = document.querySelector('.game-overlay-panel');
  expect(panel).toHaveClass('has-backdrop');
  expect(panel.getAttribute('data-backdrop')).toContain('shop');
  expect(document.querySelectorAll('.upgrade-icon').length).toBe(4);
  expect(document.querySelectorAll('.lure-icon').length).toBe(3);
});
