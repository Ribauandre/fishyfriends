import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LikeButton from './LikeButton';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    listLikes: jest.fn().mockResolvedValue([]),
    likeTarget: jest.fn().mockResolvedValue({ error: null }),
    unlikeTarget: jest.fn().mockResolvedValue({ error: null }),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

afterEach(() => { jest.useRealTimers(); });

test('shows the like count and unliked state once likes resolve', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ listLikes: jest.fn().mockResolvedValue([{ user_id: 'user-2' }]) }));
  render(<LikeButton targetType="personal_best" targetId="pb-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  expect(screen.getByRole('button', { name: /like/i })).toHaveTextContent('1');
  expect(screen.getByRole('button')).not.toHaveClass('is-liked');
});

test('shows liked when the current user is already in the likes list', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ listLikes: jest.fn().mockResolvedValue([{ user_id: 'user-1' }]) }));
  render(<LikeButton targetType="personal_best" targetId="pb-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toHaveClass('is-liked'));
  expect(screen.getByRole('button', { name: /liked/i })).toBeInTheDocument();
});

test('clicking an unliked button calls likeTarget with the owner id and flips to liked immediately', async () => {
  const likeTarget = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ likeTarget }));
  render(<LikeButton targetType="fish_year_catch" targetId="fy-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  await userEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button')).toHaveClass('is-liked');
  expect(likeTarget).toHaveBeenCalledWith('fish_year_catch', 'fy-1', 'user-2');
});

test('clicking a liked button calls unlikeTarget and flips back to unliked', async () => {
  const unlikeTarget = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ listLikes: jest.fn().mockResolvedValue([{ user_id: 'user-1' }]), unlikeTarget }));
  render(<LikeButton targetType="personal_best" targetId="pb-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toHaveClass('is-liked'));
  await userEvent.click(screen.getByRole('button'));
  expect(unlikeTarget).toHaveBeenCalledWith('personal_best', 'pb-1');
  await waitFor(() => expect(screen.getByRole('button')).not.toHaveClass('is-liked'));
});

test('liking gives the heart a brief pop animation that clears itself', async () => {
  const likeTarget = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ likeTarget }));
  render(<LikeButton targetType="fish_year_catch" targetId="fy-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());

  jest.useFakeTimers();
  userEvent.click(screen.getByRole('button'));
  expect(screen.getByRole('button').querySelector('span')).toHaveClass('is-popping');
  act(() => { jest.advanceTimersByTime(400); });
  expect(screen.getByRole('button').querySelector('span')).not.toHaveClass('is-popping');
  jest.useRealTimers();
});

test('rolls back the optimistic update if likeTarget fails', async () => {
  const likeTarget = jest.fn().mockResolvedValue({ error: new Error('nope') });
  useAuth.mockReturnValue(makeBaseAuth({ likeTarget }));
  render(<LikeButton targetType="personal_best" targetId="pb-1" ownerId="user-2" />);
  await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  await userEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('button')).not.toHaveClass('is-liked'));
});
