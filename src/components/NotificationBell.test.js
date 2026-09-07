import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

const notifications = [
  { id: 'n-1', type: 'like', target_type: 'personal_best', target_id: 'pb-1', actor_name: 'Kevin', preview: '', read: false, created_at: '2026-01-01' },
  { id: 'n-2', type: 'comment', target_type: 'fish_year_catch', target_id: 'fy-1', actor_name: 'Sam', preview: 'Nice one!', read: true, created_at: '2026-01-02' },
];

function makeBaseAuth(overrides = {}) {
  return {
    listNotifications: jest.fn().mockResolvedValue([]),
    markNotificationRead: jest.fn().mockResolvedValue({ error: null }),
    markAllNotificationsRead: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

function renderBell(overrides) {
  useAuth.mockReturnValue(makeBaseAuth(overrides));
  return render(<MemoryRouter initialEntries={['/home']}>
    <Routes>
      <Route path="*" element={<><NotificationBell /><LocationProbe /></>} />
    </Routes>
  </MemoryRouter>);
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

test('shows an unread badge count matching unread notifications', async () => {
  renderBell({ listNotifications: jest.fn().mockResolvedValue(notifications) });
  await waitFor(() => expect(screen.getByRole('button', { name: /notifications, 1 unread/i })).toBeInTheDocument());
});

test('shows no badge when there are no unread notifications', async () => {
  renderBell({ listNotifications: jest.fn().mockResolvedValue([{ ...notifications[1] }]) });
  await waitFor(() => expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument());
});

test('opening the bell lists notifications with actor and preview text', async () => {
  renderBell({ listNotifications: jest.fn().mockResolvedValue(notifications) });
  await waitFor(() => expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
  expect(screen.getByText(/kevin liked your personal best/i)).toBeInTheDocument();
  expect(screen.getByText(/sam commented on your catch/i)).toBeInTheDocument();
  expect(screen.getByText('"Nice one!"')).toBeInTheDocument();
});

test('shows an empty state when there are no notifications at all', async () => {
  renderBell();
  await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
  expect(screen.getByText(/nothing yet/i)).toBeInTheDocument();
});

test('clicking a notification marks it read and navigates to its target', async () => {
  const markNotificationRead = jest.fn().mockResolvedValue({ error: null });
  renderBell({ listNotifications: jest.fn().mockResolvedValue(notifications), markNotificationRead });
  await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
  await userEvent.click(await screen.findByText(/kevin liked your personal best/i));
  expect(markNotificationRead).toHaveBeenCalledWith('n-1');
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/anglers?best=pb-1'));
});

test('clicking an already-read notification navigates without marking it read again', async () => {
  const markNotificationRead = jest.fn();
  renderBell({ listNotifications: jest.fn().mockResolvedValue(notifications), markNotificationRead });
  await userEvent.click(screen.getByRole('button', { name: /notifications/i }));
  await userEvent.click(await screen.findByText(/sam commented on your catch/i));
  expect(markNotificationRead).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/fish-year?catch=fy-1'));
});

test('mark all read clears the unread badge and calls markAllNotificationsRead', async () => {
  const markAllNotificationsRead = jest.fn().mockResolvedValue({ error: null });
  renderBell({ listNotifications: jest.fn().mockResolvedValue(notifications), markAllNotificationsRead });
  await waitFor(() => expect(screen.getByRole('button', { name: /1 unread/i })).toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: /1 unread/i }));
  await userEvent.click(screen.getByRole('button', { name: /mark all read/i }));
  expect(markAllNotificationsRead).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole('button', { name: /^notifications$/i })).toBeInTheDocument());
});
