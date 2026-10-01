import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AppTour, { placeCard } from './AppTour';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

function makeAuth(overrides = {}) {
  return { shouldShowTour: true, completeTour: jest.fn().mockResolvedValue({ error: null }), ...overrides };
}

function renderTour(initialPath = '/home') {
  return render(<MemoryRouter initialEntries={[initialPath]}><AppTour /></MemoryRouter>);
}

beforeEach(() => {
  useAuth.mockReturnValue(makeAuth());
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

test('renders nothing for someone who has already seen the tour', () => {
  useAuth.mockReturnValue(makeAuth({ shouldShowTour: false }));
  renderTour();
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('opens on the welcome step for a first-time angler', () => {
  renderTour();
  expect(screen.getByRole('dialog', { name: /feature tour/i })).toBeInTheDocument();
  expect(screen.getByText(/here's the quick tour/i)).toBeInTheDocument();
  expect(screen.getByText('1 / 8')).toBeInTheDocument();
});

test('Next walks forward through the steps', async () => {
  renderTour();
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByText('2 / 8')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /fish year/i })).toBeInTheDocument();
});

test('Skip closes the tour and records it as done', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  renderTour();
  await userEvent.click(screen.getByRole('button', { name: /skip/i }));
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('finishing the last step records the tour as done', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  renderTour();
  for (let i = 0; i < 7; i++) {
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
  }
  expect(screen.getByText('8 / 8')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /start fishing/i }));
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('spotlights a step target that exists on the page', async () => {
  document.body.insertAdjacentHTML('beforeend', '<button data-tour="log-catch-button">Log a catch</button>');
  const target = document.querySelector('[data-tour="log-catch-button"]');
  // jsdom reports a zero-size box for everything, and a zero-size target deliberately gets
  // no spotlight, so give this one a real layout box to exercise the spotlight path.
  target.getBoundingClientRect = () => ({ top: 100, left: 60, width: 120, height: 40 });
  renderTour();
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  const spotlight = document.querySelector('.tour-spotlight');
  expect(spotlight).toBeInTheDocument();
  expect(spotlight).toHaveStyle({ top: '92px', left: '52px' });
  target.remove();
});

test('clamps the card on screen when the target sits near the edge of a short viewport', async () => {
  const originalHeight = window.innerHeight;
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
  document.body.insertAdjacentHTML('beforeend', '<button data-tour="log-catch-button">Log a catch</button>');
  const target = document.querySelector('[data-tour="log-catch-button"]');
  // Near the bottom of a short (mobile-height) viewport, with barely room below.
  target.getBoundingClientRect = () => ({ top: 460, left: 20, width: 100, height: 30 });
  renderTour();
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  const card = document.querySelector('.tour-card');
  const top = parseFloat(card.style.top);
  expect(top).toBeGreaterThanOrEqual(12);
  // Falls back to a 200px height estimate in jsdom (no real layout) — the clamp should keep
  // the whole estimated card within the viewport instead of letting it run off the bottom.
  expect(top).toBeLessThanOrEqual(500 - 200 - 12);
  target.remove();
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
});

test('still shows a step whose target is missing, just without a spotlight', async () => {
  renderTour();
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByRole('heading', { name: /fish year/i })).toBeInTheDocument();
  expect(document.querySelector('.tour-spotlight')).not.toBeInTheDocument();
  expect(document.querySelector('.tour-scrim')).toBeInTheDocument();
});

test('does not restart the tour if shouldShowTour flickers back to true after it finished', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  const { rerender } = renderTour();
  await userEvent.click(screen.getByRole('button', { name: /skip/i }));
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();

  // A background profile refetch (e.g. after a token refresh) can race the completeTour()
  // write and briefly report shouldShowTour as true again — the tour must not replay.
  useAuth.mockReturnValue(makeAuth({ completeTour, shouldShowTour: true }));
  rerender(<MemoryRouter initialEntries={['/home']}><AppTour /></MemoryRouter>);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('Escape dismisses the tour', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  renderTour();
  await userEvent.keyboard('{Escape}');
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('the card is placed inside the safe area: never under the home indicator, nor under the island in landscape', () => {
  const card = { width: 340, height: 244 };
  // Portrait iPhone 15 Pro, installed (insets 59 top, 34 bottom): a tall spotlight with no room
  // below or above used to clamp the card 12px off the raw bottom, its button on the indicator.
  const portrait = placeCard({ top: 120, left: 12, width: 369, height: 520 }, card, { width: 393, height: 852 }, { top: 59, right: 0, bottom: 34, left: 0 });
  expect(portrait.top + card.height).toBeLessThanOrEqual(852 - 34 - 12);
  expect(portrait.top).toBeGreaterThanOrEqual(59 + 12);
  // Landscape with the island on the right (59 each side): the card stays left of it.
  const landscape = placeCard({ top: 10, left: 700, width: 120, height: 40 }, card, { width: 852, height: 393 }, { top: 0, right: 59, bottom: 21, left: 59 });
  expect(landscape.left + card.width).toBeLessThanOrEqual(852 - 59 - 12);
  // A browser tab has no insets and keeps the old 12px margins.
  expect(placeCard({ top: 10, left: 0, width: 50, height: 40 }, card, { width: 393, height: 852 }).left).toBe(12);
});
