import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppTour from './AppTour';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

function makeAuth(overrides = {}) {
  return { shouldShowTour: true, completeTour: jest.fn().mockResolvedValue({ error: null }), ...overrides };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeAuth());
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

test('renders nothing for someone who has already seen the tour', () => {
  useAuth.mockReturnValue(makeAuth({ shouldShowTour: false }));
  render(<AppTour />);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('opens on the welcome step for a first-time angler', () => {
  render(<AppTour />);
  expect(screen.getByRole('dialog', { name: /feature tour/i })).toBeInTheDocument();
  expect(screen.getByText(/here's the quick tour/i)).toBeInTheDocument();
  expect(screen.getByText('1 / 7')).toBeInTheDocument();
});

test('Next walks forward through the steps', async () => {
  render(<AppTour />);
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByText('2 / 7')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: /fish year/i })).toBeInTheDocument();
});

test('Skip closes the tour and records it as done', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  render(<AppTour />);
  await userEvent.click(screen.getByRole('button', { name: /skip/i }));
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('finishing the last step records the tour as done', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  render(<AppTour />);
  for (let i = 0; i < 6; i++) {
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
  }
  expect(screen.getByText('7 / 7')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /start fishing/i }));
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});

test('spotlights a step target that exists on the page', async () => {
  document.body.insertAdjacentHTML('beforeend', '<a data-tour="nav-fish-year" href="/fish-year">Fish Year</a>');
  const target = document.querySelector('[data-tour="nav-fish-year"]');
  // jsdom reports a zero-size box for everything, and a zero-size target deliberately gets
  // no spotlight, so give this one a real layout box to exercise the spotlight path.
  target.getBoundingClientRect = () => ({ top: 100, left: 60, width: 120, height: 40 });
  render(<AppTour />);
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  const spotlight = document.querySelector('.tour-spotlight');
  expect(spotlight).toBeInTheDocument();
  expect(spotlight).toHaveStyle({ top: '92px', left: '52px' });
  target.remove();
});

test('still shows a step whose target is missing, just without a spotlight', async () => {
  render(<AppTour />);
  await userEvent.click(screen.getByRole('button', { name: /next/i }));
  expect(screen.getByRole('heading', { name: /fish year/i })).toBeInTheDocument();
  expect(document.querySelector('.tour-spotlight')).not.toBeInTheDocument();
  expect(document.querySelector('.tour-scrim')).toBeInTheDocument();
});

test('Escape dismisses the tour', async () => {
  const completeTour = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeAuth({ completeTour }));
  render(<AppTour />);
  await userEvent.keyboard('{Escape}');
  expect(completeTour).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog', { name: /feature tour/i })).not.toBeInTheDocument();
});
