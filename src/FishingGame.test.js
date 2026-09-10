import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FishingGame from './FishingGame';
import { useAuth } from './context/AuthContext';
import { stepReel } from './utils/reelPhysics';
import { twitchJerk, stepCrank, stepDrift, mendLine } from './utils/lurePhysics';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./utils/reelPhysics', () => {
  const actual = jest.requireActual('./utils/reelPhysics');
  return { ...actual, stepReel: jest.fn(actual.stepReel) };
});
jest.mock('./utils/lurePhysics', () => {
  const actual = jest.requireActual('./utils/lurePhysics');
  return { ...actual, twitchJerk: jest.fn(actual.twitchJerk), stepCrank: jest.fn(actual.stepCrank), stepDrift: jest.fn(actual.stepDrift), mendLine: jest.fn(actual.mendLine) };
});

// A fixed daytime clock so the dock, the captain and the derby don't depend on when CI runs.
const NOON = () => new Date(2026, 5, 15, 12, 0, 0);

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
    purchaseFlyRod: jest.fn(),
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  expect(screen.getByText(/waiting for a bite/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook' }));
  expect(screen.getByText(/too early/i)).toBeInTheDocument();
});

test('missing the hookset window lets the fish steal the bait', async () => {
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  await userEvent.click(screen.getAllByRole('button', { name: /upgrade/i })[0]);
  expect(await screen.findByText(/not enough tackle points yet/i, { selector: '.form-error' })).toBeInTheDocument();
});

test('chartering an offshore trip deducts tackle points before casting', async () => {
  const charterBoat = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 50 }) });
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat }));
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /crank bait/i }));
  expect(await screen.findByText(/not enough tackle points yet/i, { selector: '.form-error' })).toBeInTheDocument();
  expect(screen.getByText('Live bait', { selector: '.hud-chip' })).toBeInTheDocument();
});

test('jerk bait: twitching on the beat fills attraction and triggers the bite', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['jerkbait'] })) }));
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /jerk bait/i }));
  await reachWaiting();
  await advance(16000);
  expect(screen.getByText(/no takers/i)).toBeInTheDocument();
});

test('crank bait: a retrieve held in the strike zone triggers the bite', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['crankbait'] })) }));
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /crank bait/i }));
  await reachWaiting();

  stepCrank.mockReturnValueOnce({ speed: 80, bandCenter: 40, attraction: 10, distance: 100, inBandTicks: 0, ticks: 30 });
  await advance(80);

  expect(screen.getByText(/nothing followed/i)).toBeInTheDocument();
});

// ---- The fly rod ----
test('the fly rod is bought at Sal\'s, then the flies show on the dock at the river', async () => {
  const purchaseFlyRod = jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 30, fly_rod: true }) });
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ tackle_points: 150 })), purchaseFlyRod }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  // Without the rod the dock points at Sal's instead of showing flies.
  expect(screen.queryByRole('button', { name: /dry fly/i })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /fly rod at sal's/i }));
  expect(screen.getByRole('button', { name: /buy · 120 pts/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /buy · 120 pts/i }));
  await act(async () => { await Promise.resolve(); });
  expect(purchaseFlyRod).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/match the hatch/i)).toBeInTheDocument();
  expect(screen.getByText(/owned · flies are on the dock/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /close tackle shop/i }));
  expect(screen.getByRole('button', { name: /dry fly unlock · 40 pts/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /nymph unlock · 50 pts/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /streamer unlock · 70 pts/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /fly rod at sal's/i })).not.toBeInTheDocument();
});

test('flies stay in the truck off trout water: the chips vanish on the bay and live bait goes back on', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ fly_rod: true, owned_lures: ['nymph'] })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /nymph owned/i }));
  expect(screen.getByText('Nymph', { selector: '.hud-chip' })).toBeInTheDocument();
  expect(screen.getByText(/the hatch is on for this fly/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /^bay/i }));
  await advance(2000);
  expect(screen.queryByRole('button', { name: /nymph/i })).not.toBeInTheDocument();
  expect(screen.getByText('Live bait', { selector: '.hud-chip' })).toBeInTheDocument();
});

test('the fly: cast to the rise, mend the drift, and a clean drift brings the take', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ fly_rod: true, owned_lures: ['dryfly'] })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /dry fly owned/i }));
  expect(screen.getByText(/off-hatch for this fly/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cast' }));
  // Math.random is pinned at 0.5: the trout rises at meter position 50, so the band sits 42-58.
  expect(screen.getByText(/stop the cast on the rise/i)).toBeInTheDocument();
  expect(document.querySelector('.scene-rise')).toHaveAttribute('data-rise', '50');
  expect(document.querySelector('.stage-meter-band').style.bottom).toBe('42%');
  await userEvent.click(screen.getByRole('button', { name: /^cast!/i }));

  expect(screen.getByRole('button', { name: 'Mend' })).toBeInTheDocument();
  expect(screen.getByText(/mend when the drag climbs/i)).toBeInTheDocument();
  expect(document.querySelector('.scene-lure')).toHaveAttribute('data-lure', 'dryfly');
  mendLine.mockReturnValueOnce({ drag: 0, drift: 20, attraction: 40, mends: 1, cleanMends: 1, ticks: 10, cleanTicks: 10, lastMendClean: true, accuracy: 0 });
  await userEvent.click(screen.getByRole('button', { name: 'Mend' }));
  expect(screen.getByText('Clean mend.')).toBeInTheDocument();

  stepDrift.mockReturnValueOnce({ drag: 10, drift: 30, attraction: 100, mends: 1, cleanMends: 1, ticks: 12, cleanTicks: 12, accuracy: 0, clean: true });
  await advance(80);
  expect(screen.getByText(/fish on/i)).toBeInTheDocument();
});

test('the fly: letting the drag set spooks the fish and spends the cast', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ fly_rod: true, owned_lures: ['streamer'] })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /streamer owned/i }));
  await reachWaiting();
  // CRA resets mock implementations between tests, so script the tick: drag has topped out.
  stepDrift.mockReturnValue({ drag: 100, drift: 45, attraction: 10, mends: 0, cleanMends: 0, ticks: 70, cleanTicks: 55, accuracy: 0, clean: false });
  await advance(80);
  expect(screen.getByText(/drag set in/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Mend' })).not.toBeInTheDocument();
});

test('the angler on the stage is the signed-in person', async () => {
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  expect(document.querySelector('.game-scene[data-phase="ready"]')).toBeInTheDocument();
  expect(screen.getByText('ANDRE')).toBeInTheDocument();
});

test('real personal bests hang in the trophy case, tagged apart from game catches', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    personalBests: [{ id: 'pb-1', species: 'Striped Bass', size_label: '34 in', photo_url: '' }],
    listMyGameCatches: jest.fn().mockResolvedValue([{ id: 'gc-1', species: 'walleye', rarity: 'uncommon', size_label: '18.0 in', points_earned: 12 }]),
  }));
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(screen.getByText('Shark')).toBeInTheDocument();
  expect(screen.getByText(/50\.0 in · \+150 pts/i)).toBeInTheDocument();
  expect(screen.getByText('Legendary')).toBeInTheDocument();
});

test('picking a new ground plays the trip on the stage, and casting cuts it short', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ charterBoat: jest.fn().mockResolvedValue({ error: null, gameProfile: makeGameProfile({ tackle_points: 50 }) }) }));
  render(<FishingGame clock={NOON} />);
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
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  const panel = document.querySelector('.game-overlay-panel');
  expect(panel).toHaveClass('has-backdrop');
  expect(panel.getAttribute('data-backdrop')).toContain('shop');
  expect(document.querySelectorAll('.upgrade-icon').length).toBe(4);
  expect(document.querySelectorAll('.lure-icon').length).toBe(3);
});

// ---- The world: clock, almanac, derby, quests, bounties, sound ----

const NIGHT = () => new Date(2026, 5, 15, 23, 0, 0);

test('after dark the HUD says so, the captain changes his tip, and the roll is told the hour', async () => {
  render(<FishingGame clock={NIGHT} />);
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText('Night', { selector: '.hud-chip' })).toBeInTheDocument();
  expect(screen.getByText(/catfish and walleye come out after dark/i)).toBeInTheDocument();
  expect(document.querySelector('.game-scene')).toHaveAttribute('data-period', 'night');
  expect(document.querySelector('.scene-tint')).toHaveClass('is-night');
});

test('the almanac shows silhouettes until a species is landed, then its best size', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ records: { walleye: { size_in: 22.5 } } })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Almanac' }));
  expect(screen.getByRole('dialog', { name: /almanac/i })).toBeInTheDocument();
  const walleye = document.querySelector('.almanac-card[data-species="walleye"]');
  expect(walleye).toHaveClass('is-known');
  expect(walleye).toHaveTextContent('Walleye');
  expect(walleye).toHaveTextContent('Best 22.5 in');
  const pike = document.querySelector('.almanac-card[data-species="pike"]');
  expect(pike).toHaveClass('is-unknown');
  expect(pike).toHaveTextContent('???');
  // The locked canyon is listed as a rumor, not by name.
  expect(screen.getByRole('region', { name: 'Locked ground' })).toBeInTheDocument();
  expect(document.querySelector('.almanac-progress')).toHaveTextContent('1 of 26 species landed');
});

test('landing your biggest of a species is called out as a record', async () => {
  const logGameCatch = jest.fn().mockResolvedValue({
    error: null, isRecord: true, completedQuests: [],
    catchEntry: { id: 'gc-1', species: 'trout', rarity: 'common', size_label: '14.0 in', points_earned: 5 },
    gameProfile: makeGameProfile({ tackle_points: 105, records: { trout: { size_in: 14 } } }),
  });
  useAuth.mockReturnValue(makeBaseAuth({ logGameCatch }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await reachWaiting();
  await advance(4000);
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook!' }));
  stepReel.mockReturnValueOnce({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 100, tension: 0 });
  await advance(80);
  expect(await screen.findByText('NEW RECORD')).toBeInTheDocument();
  expect(logGameCatch).toHaveBeenCalledWith(expect.objectContaining({ sizeIn: expect.any(Number), biome: 'river' }));
  expect(screen.getByText(/your biggest yet/i)).toBeInTheDocument();
});

test('the trophy case opens on this week\'s derby board', async () => {
  const listDerbyLeaders = jest.fn().mockResolvedValue([
    { userId: 'user-2', anglerName: 'Kevin', sizeIn: 24, catchId: 'a', createdAt: '2026-06-15T10:00:00Z', avatarUrl: '' },
    { userId: 'user-1', anglerName: 'Andre', sizeIn: 21.5, catchId: 'b', createdAt: '2026-06-15T11:00:00Z', avatarUrl: '' },
  ]);
  useAuth.mockReturnValue(makeBaseAuth({ listDerbyLeaders }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(listDerbyLeaders).toHaveBeenCalledWith(expect.objectContaining({ species: expect.any(String), since: expect.stringMatching(/T00:00:00/) }));
  expect(await screen.findByText('Kevin')).toBeInTheDocument();
  expect(screen.getByText('24.0 in')).toBeInTheDocument();
  expect(screen.getByText('21.5 in')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: /club derby/i })).toHaveTextContent(/biggest .* this week/i);
});

test('the canyon stays locked on the map until the proving quest is done', async () => {
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  expect(screen.getByRole('button', { name: 'The Canyon · Locked' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /dismiss fishing grounds/i }));

  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ quests: { rays_proving: { progress: 3, done: true, claimed: false } } })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getAllByRole('button', { name: 'Travel' })[1]);
  expect(screen.getByRole('button', { name: 'The Canyon · Charter · 80 pts' })).toBeEnabled();
});

test("Cap'n Ray tracks the proving quest on the dock and it completes on the third bay fish", async () => {
  const logGameCatch = jest.fn().mockResolvedValue({
    error: null, isRecord: false, completedQuests: ['rays_proving'],
    catchEntry: { id: 'gc-1', species: 'flounder', rarity: 'common', size_label: '14.0 in', points_earned: 5 },
    gameProfile: makeGameProfile({ quests: { rays_proving: { progress: 3, done: true, claimed: false } } }),
  });
  useAuth.mockReturnValue(makeBaseAuth({ logGameCatch, getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ quests: { rays_proving: { progress: 2, done: false, claimed: false } } })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Travel' }));
  await userEvent.click(screen.getByRole('button', { name: /^bay/i }));
  expect(screen.getByText('2 / 3')).toBeInTheDocument();
  expect(screen.getByText(/1 more from the bay/i)).toBeInTheDocument();
  await reachWaiting();
  await advance(4000);
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook!' }));
  stepReel.mockReturnValueOnce({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 100, tension: 0 });
  await advance(80);
  expect(await screen.findByText(/quest complete/i)).toBeInTheDocument();
  expect(screen.getByText(/a new ground is on the map/i)).toBeInTheDocument();
});

test("Sal's bass can be turned in at the shop for the promised points", async () => {
  const claimQuestReward = jest.fn().mockResolvedValue({ error: null, points: 75, gameProfile: makeGameProfile({ tackle_points: 175, quests: { sals_wall: { progress: 1, done: true, claimed: true } } }) });
  useAuth.mockReturnValue(makeBaseAuth({ claimQuestReward, getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ quests: { sals_wall: { progress: 1, done: true, claimed: false } } })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/is that my bass/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /turn in · 75 pts/i }));
  expect(claimQuestReward).toHaveBeenCalledWith('sals_wall');
  expect(await screen.findByLabelText('175 tackle points')).toBeInTheDocument();
  expect(screen.getByText(/75 points, as promised/i)).toBeInTheDocument();
  expect(screen.getByText('Turned in')).toBeInTheDocument();
});

test('real Fish Year catches pay a bounty at the shop, once', async () => {
  const listFishYearBounties = jest.fn().mockResolvedValue([{ id: 'fy-1', species: 'Pike', points: 15 }, { id: 'fy-2', species: 'Carp', points: 15 }]);
  const claimFishYearBounties = jest.fn().mockResolvedValue({ error: null, claimed: 2, points: 30, gameProfile: makeGameProfile({ tackle_points: 130, bounties_claimed: ['fy-1', 'fy-2'] }) });
  useAuth.mockReturnValue(makeBaseAuth({ listFishYearBounties, claimFishYearBounties }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Shop' }));
  expect(screen.getByText(/saw 2 real catches in your logbook/i)).toBeInTheDocument();
  expect(screen.getByText('2 to claim · 30 pts')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Claim bounty' }));
  expect(claimFishYearBounties).toHaveBeenCalledTimes(1);
  expect(await screen.findByLabelText('130 tackle points')).toBeInTheDocument();
  expect(screen.getByText(/2 real fish on the books — 30 points/i)).toBeInTheDocument();
  expect(screen.getByText('Nothing new to claim')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Claim bounty' })).toBeDisabled();
});

test('the bell toggles sound and remembers it for this device', async () => {
  window.localStorage.removeItem('cast-and-catch-muted');
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  const bell = screen.getByRole('button', { name: 'Sound on' });
  expect(bell).toHaveAttribute('aria-pressed', 'true');
  await userEvent.click(bell);
  expect(screen.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  expect(window.localStorage.getItem('cast-and-catch-muted')).toBe('1');
  await userEvent.click(screen.getByRole('button', { name: 'Sound off' }));
  expect(window.localStorage.getItem('cast-and-catch-muted')).toBe('0');
});

test('the whole round can be played by tapping and holding the stage itself', async () => {
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: 'Cast a line' }));
  expect(screen.getByText(/tap to stop the cast/i)).toHaveClass('stage-callout');
  await userEvent.click(screen.getByRole('button', { name: 'Stop the cast' }));
  expect(screen.getByText(/waiting for a bite/i)).toBeInTheDocument();
  await advance(4000);
  expect(screen.getByText(/fish on/i)).toHaveClass('is-alert');
  await userEvent.click(screen.getByRole('button', { name: 'Set the hook now' }));
  const surface = screen.getByRole('button', { name: 'Hold to reel in' });
  fireEvent.pointerDown(surface);
  expect(document.querySelector('.scene-sprite')).toHaveClass('is-looping');
  fireEvent.pointerUp(surface);
  expect(document.querySelector('.scene-sprite')).not.toHaveClass('is-looping');
  // Nothing to tap once the round is over, or while an overlay is up.
  stepReel.mockReturnValueOnce({ fishPos: 50, fishVel: 0, zonePos: 50, progress: 10, tension: 9999 });
  await advance(80);
  expect(screen.getByText(/line snapped/i)).toBeInTheDocument();
  expect(document.querySelector('.scene-action')).toBeNull();
});

test('a worked lure shows on the stage with its gauge, and twitching from the stage counts', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getGameProfile: jest.fn().mockResolvedValue(makeGameProfile({ owned_lures: ['jerkbait'] })) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  await userEvent.click(screen.getByRole('button', { name: /jerk bait/i }));
  await reachWaiting();
  expect(document.querySelector('.scene-lure')).toHaveAttribute('data-lure', 'jerkbait');
  expect(document.querySelector('.stage-gauge')).toHaveClass('is-jerkbait');
  twitchJerk.mockReturnValueOnce({ attraction: 100, hits: 5, misses: 0, lastTwitchOnBeat: true });
  await userEvent.click(screen.getByRole('button', { name: 'Twitch the lure' }));
  await act(async () => { await Promise.resolve(); });
  expect(screen.getByText(/fish on/i)).toBeInTheDocument();
  expect(document.querySelector('.scene-hook-ring')).toBeInTheDocument();
});

test('the dock shows who else is on the water, puts same-ground anglers on the stage, and lets you travel to a friend', async () => {
  let sync;
  const update = jest.fn(); const leave = jest.fn();
  const joinDock = jest.fn((initial, onSync) => { sync = onSync; return { update, leave }; });
  useAuth.mockReturnValue(makeBaseAuth({ joinDock }));
  const { unmount } = render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  expect(joinDock).toHaveBeenCalledWith(expect.objectContaining({ name: 'Andre', biome: 'river', phase: 'ready' }), expect.any(Function));
  // Alone, the strip still shows you, so it's clear the dock is live.
  expect(screen.getByRole('group', { name: /on the water now/i })).toBeInTheDocument();
  expect(screen.getByLabelText(/you · river · nobody else out right now/i)).toBeInTheDocument();

  await act(async () => { sync([
    { userId: 'u2', name: 'Kevin', biome: 'river', phase: 'reeling', species: 'pike' },
    { userId: 'u3', name: 'Sam', biome: 'bay', phase: 'waiting' },
  ]); });
  expect(screen.getByRole('group', { name: /on the water now/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Kevin · fighting one · River' })).toBeDisabled();
  expect(document.querySelectorAll('.scene-sprite.is-crew').length).toBe(1);
  expect(screen.getByText('KEVIN')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Sam · waiting on a bite · Bay · travel there' }));
  expect(screen.getByText('Bay', { selector: '.hud-chip' })).toBeInTheDocument();
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ biome: 'bay', phase: 'ready' }));
  expect(document.querySelectorAll('.scene-sprite.is-crew').length).toBe(1);
  expect(screen.getByText('SAM')).toBeInTheDocument();

  // The stage isn't tappable until the trip finishes.
  await advance(2000);
  await userEvent.click(screen.getByRole('button', { name: 'Cast a line' }));
  expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ biome: 'bay', phase: 'casting' }));
  unmount();
  expect(leave).toHaveBeenCalledTimes(1);
});

test('the dock is joined once per visit, not again every time the provider re-renders', async () => {
  const leave = jest.fn();
  const joinDock = jest.fn(() => ({ update: jest.fn(), leave }));
  useAuth.mockReturnValue(makeBaseAuth({ joinDock }));
  const { rerender } = render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  expect(joinDock).toHaveBeenCalledTimes(1);
  // A token refresh or a focus change gives the provider a new joinDock function.
  const joinDockAgain = jest.fn(() => ({ update: jest.fn(), leave: jest.fn() }));
  useAuth.mockReturnValue(makeBaseAuth({ joinDock: joinDockAgain }));
  rerender(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); });
  expect(joinDockAgain).not.toHaveBeenCalled();
  expect(leave).not.toHaveBeenCalled();
});

test('topping last week\'s derby pays the Golden Pennant: a banner, a HUD chip, the pennant on the rod, and a ribbon in the case', async () => {
  const claimDerbyWin = jest.fn().mockResolvedValue({ won: true, derby: { key: '2026-W24', species: 'walleye' }, sizeIn: 24.5, gameProfile: makeGameProfile({ derby_wins: ['2026-W24'] }) });
  useAuth.mockReturnValue(makeBaseAuth({ claimDerbyWin }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(claimDerbyWin).toHaveBeenCalledWith(NOON());
  expect(await screen.findByText(/you won last week's derby/i)).toBeInTheDocument();
  expect(screen.getByText(/biggest walleye in the club at 24\.5 in/i)).toBeInTheDocument();
  expect(screen.getByText(/pennant's yours till monday/i)).toBeInTheDocument();
  expect(screen.getByText('Champion', { selector: '.hud-chip' })).toBeInTheDocument();
  expect(document.querySelector('.scene-pennant')).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: 'Trophies' }));
  expect(screen.getByRole('region', { name: /derby wins/i })).toHaveTextContent('2026-W24');
  expect(screen.getByText(/you are the defending champion/i)).toBeInTheDocument();
});

test('no pennant for a week you did not win', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ claimDerbyWin: jest.fn().mockResolvedValue({ won: false }) }));
  render(<FishingGame clock={NOON} />);
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(screen.queryByText(/you won last week's derby/i)).toBeNull();
  expect(screen.queryByText('Champion', { selector: '.hud-chip' })).toBeNull();
  expect(document.querySelector('.scene-pennant')).toBeNull();
});
