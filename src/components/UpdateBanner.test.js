import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UpdateBanner from './UpdateBanner';
import { announceUpdate, resetForTests } from '../utils/appUpdate';

afterEach(() => { resetForTests(); delete navigator.serviceWorker; });

test('shows nothing until an update is ready', () => {
  render(<UpdateBanner />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('offers a ready update and applies it on tap', async () => {
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { addEventListener: jest.fn() } });
  const postMessage = jest.fn();
  render(<UpdateBanner />);
  act(() => announceUpdate({ waiting: { postMessage } }));
  expect(screen.getByText(/a new version of fishy friends is ready/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
  expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(screen.getByRole('button', { name: /updating/i })).toBeDisabled();
});
