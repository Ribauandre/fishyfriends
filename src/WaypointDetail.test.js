import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import WaypointDetail from './WaypointDetail';
import { useAuth } from './context/AuthContext';
import { fetchMyMapsPoints } from './utils/googleMyMaps';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./utils/googleMyMaps', () => ({ fetchMyMapsPoints: jest.fn() }));

jest.mock('./components/WaypointLeafletMap', () => ({
  __esModule: true,
  default: ({ waypoints, onMapClick, addingMode }) => (
    <div data-testid="mock-map" data-adding={addingMode ? 'yes' : 'no'} data-count={waypoints.length}>
      <button type="button" onClick={() => onMapClick(40.5, -74.1)}>simulate map click</button>
    </div>
  ),
}));

function renderDetail(route = '/waypoints/map-1') {
  return render(<MemoryRouter initialEntries={[route]}>
    <Routes>
      <Route path="/waypoints/:mapId" element={<WaypointDetail />} />
      <Route path="/waypoints" element={<div>All maps page</div>} />
    </Routes>
  </MemoryRouter>);
}

const baseMap = { id: 'map-1', name: 'Backwater Spots', description: 'Striper haunts', owner_id: 'user-1', isOwner: true };

function makeBaseAuth(overrides = {}) {
  return {
    user: { id: 'user-1' },
    getWaypointMap: jest.fn().mockResolvedValue(baseMap),
    listWaypoints: jest.fn().mockResolvedValue([]),
    listMapMembers: jest.fn().mockResolvedValue([]),
    deleteWaypoint: jest.fn(),
    removeMapMember: jest.fn(),
    deleteWaypointMap: jest.fn(),
    addWaypoint: jest.fn(),
    importWaypoints: jest.fn(),
    inviteToWaypointMap: jest.fn(),
    listAnglers: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

beforeEach(() => {
  useAuth.mockReturnValue(makeBaseAuth());
});

test('shows a loading state, then the map name and description', async () => {
  renderDetail();
  expect(screen.getByText(/loading the map/i)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Backwater Spots' })).toBeInTheDocument());
  expect(screen.getByText('Striper haunts')).toBeInTheDocument();
  expect(screen.getByText('YOUR MAP')).toBeInTheDocument();
});

test('shows an access-denied state for a missing or unshared map', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getWaypointMap: jest.fn().mockResolvedValue(null) }));
  renderDetail();
  expect(await screen.findByText(/haven't been invited/i)).toBeInTheDocument();
});

test('shows "SHARED WITH YOU" for a collaborator, not the owner', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getWaypointMap: jest.fn().mockResolvedValue({ ...baseMap, isOwner: false }) }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });
  expect(screen.getByText('SHARED WITH YOU')).toBeInTheDocument();
  expect(screen.queryByText(/delete this map/i)).not.toBeInTheDocument();
});

test('clicking the map while in adding mode opens the name-pin form and saves it', async () => {
  const addWaypoint = jest.fn().mockResolvedValue({ error: null, waypoint: { id: 'wp-1', name: 'Reef Spot', lat: 40.5, lng: -74.1, notes: '', created_by: 'user-1', created_by_name: 'Andre', source: 'manual' } });
  useAuth.mockReturnValue(makeBaseAuth({ addWaypoint }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  await userEvent.click(screen.getByRole('button', { name: /add a waypoint/i }));
  expect(screen.getByTestId('mock-map')).toHaveAttribute('data-adding', 'yes');

  await userEvent.click(screen.getByRole('button', { name: /simulate map click/i }));
  expect(await screen.findByText(/name this waypoint/i)).toBeInTheDocument();

  await userEvent.type(screen.getByLabelText(/^name$/i), 'Reef Spot');
  await userEvent.click(screen.getByRole('button', { name: /drop the pin/i }));

  await waitFor(() => expect(addWaypoint).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-1', lat: 40.5, lng: -74.1, name: 'Reef Spot' })));
  expect(await screen.findByText('Reef Spot')).toBeInTheDocument();
});

test('importing a GPX file previews and confirms the import', async () => {
  const importWaypoints = jest.fn().mockResolvedValue({
    error: null,
    waypoints: [{ id: 'wp-1', name: 'Wreck', lat: 1, lng: 2, notes: '', created_by: 'user-1', created_by_name: 'Andre', source: 'gpx' }],
  });
  useAuth.mockReturnValue(makeBaseAuth({ importWaypoints }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  const gpxText = `<?xml version="1.0"?><gpx><wpt lat="1" lon="2"><name>Wreck</name></wpt></gpx>`;
  const file = new File([gpxText], 'spots.gpx', { type: 'application/gpx+xml' });
  const input = document.querySelector('input[type="file"]');
  await userEvent.upload(input, file);

  expect(await screen.findByText(/import from spots.gpx/i)).toBeInTheDocument();
  expect(screen.getByText(/found 1 waypoint/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /^import 1/i }));

  await waitFor(() => expect(importWaypoints).toHaveBeenCalledWith({ mapId: 'map-1', points: expect.any(Array), source: 'gpx' }));
  expect(await screen.findByText('Wreck')).toBeInTheDocument();
});

test('shows a parse error for a malformed GPX file without opening the import modal', async () => {
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  const file = new File(['not xml at all'], 'bad.gpx', { type: 'application/gpx+xml' });
  const input = document.querySelector('input[type="file"]');
  await userEvent.upload(input, file);

  expect(await screen.findByText(/doesn't look like valid gpx/i)).toBeInTheDocument();
  expect(screen.queryByText(/import from bad.gpx/i)).not.toBeInTheDocument();
});

test('importing a KML file previews its pins, says what was skipped, and imports them as kml', async () => {
  const importWaypoints = jest.fn().mockResolvedValue({
    error: null,
    waypoints: [{ id: 'wp-1', name: 'Deep Pool', lat: 40.77, lng: -74.72, notes: 'Black River', created_by: 'user-1', created_by_name: 'Andre', source: 'kml' }],
  });
  useAuth.mockReturnValue(makeBaseAuth({ importWaypoints }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Black River</name>
    <Placemark><name>Deep Pool</name><Point><coordinates>-74.72,40.77,0</coordinates></Point></Placemark>
    <Placemark><name>Trail</name><LineString><coordinates>1,2 3,4</coordinates></LineString></Placemark>
  </Folder></Document></kml>`;
  await userEvent.upload(document.querySelector('input[type="file"]'), new File([kml], 'spots.kml', { type: 'application/vnd.google-earth.kml+xml' }));

  expect(await screen.findByText(/import from spots.kml/i)).toBeInTheDocument();
  expect(screen.getByText(/1 line or shape skipped/i)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /^import 1/i }));

  await waitFor(() => expect(importWaypoints).toHaveBeenCalledWith({ mapId: 'map-1', points: [{ name: 'Deep Pool', lat: 40.77, lng: -74.72, notes: 'Black River' }], source: 'kml' }));
  expect(await screen.findByText('Deep Pool')).toBeInTheDocument();
  expect(screen.getByText(/KML import/)).toBeInTheDocument();
});

describe('Google My Maps link', () => {
  test('reads the pins from a pasted link and imports them as kml', async () => {
    fetchMyMapsPoints.mockResolvedValue({ title: 'Fishing Spots', skipped: 0, points: [{ name: 'Deep Pool', lat: 40.77, lng: -74.72, notes: 'Black River' }] });
    const importWaypoints = jest.fn().mockResolvedValue({ error: null, waypoints: [{ id: 'wp-1', name: 'Deep Pool', lat: 40.77, lng: -74.72, notes: 'Black River', created_by: 'user-1', created_by_name: 'Andre', source: 'kml' }] });
    useAuth.mockReturnValue(makeBaseAuth({ importWaypoints }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Backwater Spots' });

    await userEvent.click(screen.getByRole('button', { name: /google my maps/i }));
    const link = 'https://www.google.com/maps/d/edit?hl=en&mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA';
    await userEvent.type(screen.getByLabelText(/map link/i), link);
    await userEvent.click(screen.getByRole('button', { name: /find pins/i }));

    expect(fetchMyMapsPoints).toHaveBeenCalledWith(link);
    expect(await screen.findByText(/import from "fishing spots"/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^import 1/i }));
    await waitFor(() => expect(importWaypoints).toHaveBeenCalledWith(expect.objectContaining({ mapId: 'map-1', source: 'kml' })));
    expect(await screen.findByText('Deep Pool')).toBeInTheDocument();
  });

  test('shows why a link could not be read and keeps the form open to fix it', async () => {
    fetchMyMapsPoints.mockRejectedValue(new Error('Couldn\'t open that map. In Google My Maps, tap Share and turn on "Anyone with this link can view", then try again.'));
    renderDetail();
    await screen.findByRole('heading', { name: 'Backwater Spots' });

    await userEvent.click(screen.getByRole('button', { name: /google my maps/i }));
    await userEvent.type(screen.getByLabelText(/map link/i), 'https://www.google.com/maps/d/viewer?mid=1PRIVATEMAPIDxxxxxxxx');
    await userEvent.click(screen.getByRole('button', { name: /find pins/i }));

    expect(await screen.findByText(/anyone with this link can view/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/map link/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /find pins/i })).not.toBeDisabled();
  });
});

test('only the waypoint creator or the map owner can delete a waypoint', async () => {
  useAuth.mockReturnValue(makeBaseAuth({
    getWaypointMap: jest.fn().mockResolvedValue({ ...baseMap, isOwner: false }),
    listWaypoints: jest.fn().mockResolvedValue([
      { id: 'wp-1', name: 'Mine', lat: 1, lng: 2, notes: '', created_by: 'user-1', created_by_name: 'Me', source: 'manual' },
      { id: 'wp-2', name: 'Someone Else', lat: 3, lng: 4, notes: '', created_by: 'other-user', created_by_name: 'Kevin', source: 'manual' },
    ]),
  }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  expect(screen.getByRole('button', { name: /delete mine/i })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /delete someone else/i })).not.toBeInTheDocument();
});

test('deleting a waypoint removes it from the list', async () => {
  const deleteWaypoint = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({
    deleteWaypoint,
    listWaypoints: jest.fn().mockResolvedValue([
      { id: 'wp-1', name: 'Reef Spot', lat: 1, lng: 2, notes: '', created_by: 'user-1', created_by_name: 'Me', source: 'manual' },
    ]),
  }));
  renderDetail();
  await screen.findByText('Reef Spot');

  await userEvent.click(screen.getByRole('button', { name: /delete reef spot/i }));
  await waitFor(() => expect(deleteWaypoint).toHaveBeenCalledWith('wp-1'));
  await waitFor(() => expect(screen.queryByText('Reef Spot')).not.toBeInTheDocument());
});

test('only the map owner sees the invite form, and inviting adds a member', async () => {
  const inviteToWaypointMap = jest.fn().mockResolvedValue({ error: null, member: { id: 'mem-1', user_id: 'user-2', status: 'pending', profile: { display_name: 'Kevin' } } });
  useAuth.mockReturnValue(makeBaseAuth({
    inviteToWaypointMap,
    listAnglers: jest.fn().mockResolvedValue([{ profile: { id: 'user-2', display_name: 'Kevin' } }]),
  }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  const select = await screen.findByLabelText(/angler to invite/i);
  await userEvent.selectOptions(select, 'user-2');
  await userEvent.click(screen.getByRole('button', { name: /^invite$/i }));

  await waitFor(() => expect(inviteToWaypointMap).toHaveBeenCalledWith('map-1', 'Backwater Spots', 'user-2'));
  await waitFor(() => expect(screen.getAllByText('Kevin').length).toBeGreaterThan(0));
});

test('a non-owner does not see the invite form', async () => {
  useAuth.mockReturnValue(makeBaseAuth({ getWaypointMap: jest.fn().mockResolvedValue({ ...baseMap, isOwner: false }) }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });
  expect(screen.queryByLabelText(/angler to invite/i)).not.toBeInTheDocument();
});

test('a member can remove themselves even when not the owner', async () => {
  const removeMapMember = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({
    removeMapMember,
    getWaypointMap: jest.fn().mockResolvedValue({ ...baseMap, isOwner: false }),
    listMapMembers: jest.fn().mockResolvedValue([
      { id: 'mem-1', user_id: 'user-1', status: 'accepted', profile: { display_name: 'Me' } },
    ]),
  }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  await userEvent.click(screen.getByRole('button', { name: /remove me/i }));
  await waitFor(() => expect(removeMapMember).toHaveBeenCalledWith('mem-1'));
});

test('deleting the map confirms first, then navigates back to the maps list', async () => {
  const deleteWaypointMap = jest.fn().mockResolvedValue({ error: null });
  useAuth.mockReturnValue(makeBaseAuth({ deleteWaypointMap }));
  renderDetail();
  await screen.findByRole('heading', { name: 'Backwater Spots' });

  await userEvent.click(screen.getByRole('button', { name: /delete this map/i }));
  expect(await screen.findByText(/are you sure/i)).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /^delete map$/i }));
  await waitFor(() => expect(deleteWaypointMap).toHaveBeenCalledWith('map-1'));
  expect(await screen.findByText(/all maps page/i)).toBeInTheDocument();
});
