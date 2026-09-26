import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import Navbar from './Navbar';
import SectionTabs from './SectionTabs';
import { useAuth } from '../context/AuthContext';
import { resetNavMemory } from '../utils/navSections';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./NotificationBell', () => () => <button type="button">Notifications</button>);

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

function renderAt(path) {
  return render(<MemoryRouter initialEntries={[path]}><Navbar /><SectionTabs /><Routes><Route path="*" element={<Where />} /></Routes></MemoryRouter>);
}

beforeEach(() => {
  resetNavMemory();
  useAuth.mockReturnValue({ user: { id: 'u1', email: 'someone@example.com' }, profile: { display_name: 'Andre', avatar_url: '' } });
});

const mainNav = () => within(screen.getByRole('navigation', { name: 'Main' }));

test('shows five section tabs, with the profile and bell beside them', () => {
  renderAt('/home');
  expect(mainNav().getAllByRole('link').map((link) => link.textContent.replace(/^\d+\s*/, ''))).toEqual(['Home', 'Compete', 'Crew', 'Plan', 'Game']);
  expect(screen.getByRole('link', { name: /your profile/i })).toHaveAttribute('href', '/profile');
  expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();
});

test('the tab for the section you are in is marked current, detail pages included', () => {
  renderAt('/trips/abc');
  expect(mainNav().getByRole('link', { name: /plan/i })).toHaveAttribute('aria-current', 'page');
  expect(mainNav().getByRole('link', { name: /compete/i })).not.toHaveAttribute('aria-current');
});

test('a section with two pages shows sub-tabs on those pages, and its tab remembers the last one', async () => {
  renderAt('/fish-year');
  const subTabs = within(screen.getByRole('navigation', { name: 'Compete' }));
  await userEvent.click(subTabs.getByRole('link', { name: 'Tournaments' }));
  expect(screen.getByTestId('where')).toHaveTextContent('/tournaments');

  await userEvent.click(mainNav().getByRole('link', { name: /plan/i }));
  expect(screen.getByTestId('where')).toHaveTextContent('/trips');
  expect(within(screen.getByRole('navigation', { name: 'Plan' })).getByRole('link', { name: 'Trips' })).toHaveClass('active');

  await userEvent.click(mainNav().getByRole('link', { name: /compete/i }));
  expect(screen.getByTestId('where')).toHaveTextContent('/tournaments');
});

test('no sub-tabs on a single-page section or a detail page', () => {
  const { unmount } = renderAt('/anglers');
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
  unmount();
  renderAt('/trips/abc');
  expect(screen.getAllByRole('navigation')).toHaveLength(1);
});

test('the top bar steps aside on the game, leaving the tabs', () => {
  renderAt('/fishing-game');
  expect(screen.getByRole('banner')).toHaveClass('is-game');
  expect(mainNav().getByRole('link', { name: /game/i })).toHaveAttribute('aria-current', 'page');
});

test('nothing renders signed out', () => {
  useAuth.mockReturnValue({ user: null, profile: {} });
  renderAt('/fish-year');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});
