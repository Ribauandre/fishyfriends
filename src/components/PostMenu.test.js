import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostMenu from './PostMenu';

const shareData = { title: 'Kevin\'s Steelhead', text: "Kevin's Steelhead — 30 in on Fishy Friends.", url: 'https://www.fishyfriends.club/fish-year?catch=fy-1' };

function renderMenu(props = {}) {
  return render(<div><PostMenu shareData={shareData} {...props} /><button>outside</button></div>);
}

afterEach(() => {
  delete navigator.share;
  delete navigator.clipboard;
});

test('dropdown is closed until the trigger is clicked', () => {
  renderMenu({ onDelete: jest.fn() });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('shows Share but not Delete when no onDelete is provided', async () => {
  renderMenu();
  await userEvent.click(screen.getByRole('button', { name: /more options/i }));
  expect(screen.getByRole('menuitem', { name: /share/i })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /delete/i })).not.toBeInTheDocument();
});

test('shows Delete when onDelete is provided, and calls it', async () => {
  const onDelete = jest.fn();
  renderMenu({ onDelete });
  await userEvent.click(screen.getByRole('button', { name: /more options/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /delete/i }));
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('clicking outside the menu closes it', async () => {
  renderMenu({ onDelete: jest.fn() });
  await userEvent.click(screen.getByRole('button', { name: /more options/i }));
  expect(screen.getByRole('menu')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'outside' }));
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

test('Share uses the native share sheet when available, and closes the menu', async () => {
  navigator.share = jest.fn().mockResolvedValue(undefined);
  renderMenu();
  await userEvent.click(screen.getByRole('button', { name: /more options/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));
  expect(navigator.share).toHaveBeenCalledWith(shareData);
  await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
});

test('Share falls back to copying a blurb to the clipboard when the share sheet is unavailable', async () => {
  navigator.clipboard = { writeText: jest.fn().mockResolvedValue(undefined) };
  renderMenu();
  await userEvent.click(screen.getByRole('button', { name: /more options/i }));
  await userEvent.click(screen.getByRole('menuitem', { name: /share/i }));
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${shareData.text} ${shareData.url}`);
  expect(await screen.findByRole('menuitem', { name: /copied!/i })).toBeInTheDocument();
});
