import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Waypoints from './Waypoints';
import { useAuth } from './context/AuthContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));

function renderWaypoints() {
  return render(<MemoryRouter><Waypoints /></MemoryRouter>);
}

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    listMyWaypointMaps: jest.fn().mockResolvedValue([]),
    listMyWaypointInvites: jest.fn().mockResolvedValue([]),
    respondToWaypointInvite: jest.fn(),
    createWaypointMap: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows an empty state when the angler has no waypoint maps', async () => {
  renderWaypoints();
  expect(await screen.findByText(/no waypoint maps yet/i)).toBeInTheDocument();
});

test('lists owned and collaborator maps with their stats', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    listMyWaypointMaps: jest.fn().mockResolvedValue([
      { id: 'map-1', name: 'My Spots', description: '', isOwner: true, waypointCount: 5, memberCount: 2 },
      { id: 'map-2', name: "Kevin's Spots", description: '', isOwner: false, waypointCount: 3, memberCount: 1 },
    ]),
  }));
  renderWaypoints();
  expect(await screen.findByText('My Spots')).toBeInTheDocument();
  expect(screen.getByText('5 waypoints')).toBeInTheDocument();
  expect(screen.getByText('OWNER')).toBeInTheDocument();
  expect(screen.getByText("Kevin's Spots")).toBeInTheDocument();
  expect(screen.getByText('COLLABORATOR')).toBeInTheDocument();
});

test('creating a map calls createWaypointMap and navigates to it', async () => {
  const createWaypointMap = jest.fn().mockResolvedValue({ error: null, map: { id: 'map-new', name: 'New Map' } });
  useAuth.mockReturnValue(makeBaseAuth({ createWaypointMap }));
  renderWaypoints();
  await screen.findByText(/no waypoint maps yet/i);

  await userEvent.click(screen.getByRole('button', { name: /create a map/i }));
  await userEvent.type(screen.getByLabelText(/^name$/i), 'New Map');
  await userEvent.click(screen.getByRole('button', { name: /^create map/i }));

  await waitFor(() => expect(createWaypointMap).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Map' })));
});

test('shows the server error and keeps the form open when creating a map fails', async () => {
  const createWaypointMap = jest.fn().mockResolvedValue({ error: new Error('Name the map first.') });
  useAuth.mockReturnValue(makeBaseAuth({ createWaypointMap }));
  renderWaypoints();
  await screen.findByText(/no waypoint maps yet/i);

  await userEvent.click(screen.getByRole('button', { name: /create a map/i }));
  await userEvent.type(screen.getByLabelText(/^name$/i), 'x');
  await userEvent.click(screen.getByRole('button', { name: /^create map/i }));

  expect(await screen.findByText(/name the map first/i)).toBeInTheDocument();
});

test('shows the Postgres code/details/hint alongside the message for a database-level failure', async () => {
  const createWaypointMap = jest.fn().mockResolvedValue({
    error: { message: 'new row violates row-level security policy for table "waypoint_maps"', code: '42501', details: null, hint: null },
  });
  useAuth.mockReturnValue(makeBaseAuth({ createWaypointMap }));
  renderWaypoints();
  await screen.findByText(/no waypoint maps yet/i);

  await userEvent.click(screen.getByRole('button', { name: /create a map/i }));
  await userEvent.type(screen.getByLabelText(/^name$/i), 'Backwater Spots');
  await userEvent.click(screen.getByRole('button', { name: /^create map/i }));

  expect(await screen.findByText(/violates row-level security policy.*\(42501\)/i)).toBeInTheDocument();
});

describe('pending invites', () => {
  test('shows a pending invite and accepting it removes it from the list and refreshes maps', async () => {
    const respondToWaypointInvite = jest.fn().mockResolvedValue({ error: null });
    const listMyWaypointMaps = jest.fn().mockResolvedValue([]);
    useAuth.mockReturnValue(makeBaseAuth({
      listMyWaypointInvites: jest.fn().mockResolvedValue([{ id: 'mem-1', map_name: 'Kevin\'s Spots', inviterName: 'Kevin' }]),
      respondToWaypointInvite,
      listMyWaypointMaps,
    }));
    renderWaypoints();

    expect(await screen.findByText(/kevin's spots/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));

    await waitFor(() => expect(respondToWaypointInvite).toHaveBeenCalledWith('mem-1', true));
    await waitFor(() => expect(screen.queryByText(/kevin's spots/i)).not.toBeInTheDocument());
    await waitFor(() => expect(listMyWaypointMaps).toHaveBeenCalledTimes(2));
  });

  test('declining an invite removes it without refreshing the maps list', async () => {
    const respondToWaypointInvite = jest.fn().mockResolvedValue({ error: null });
    const listMyWaypointMaps = jest.fn().mockResolvedValue([]);
    useAuth.mockReturnValue(makeBaseAuth({
      listMyWaypointInvites: jest.fn().mockResolvedValue([{ id: 'mem-1', map_name: 'Kevin\'s Spots', inviterName: 'Kevin' }]),
      respondToWaypointInvite,
      listMyWaypointMaps,
    }));
    renderWaypoints();

    await screen.findByText(/kevin's spots/i);
    await userEvent.click(screen.getByRole('button', { name: /decline/i }));

    await waitFor(() => expect(respondToWaypointInvite).toHaveBeenCalledWith('mem-1', false));
    await waitFor(() => expect(screen.queryByText(/kevin's spots/i)).not.toBeInTheDocument());
    expect(listMyWaypointMaps).toHaveBeenCalledTimes(1);
  });
});
