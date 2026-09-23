import React from 'react';
import { render } from '@testing-library/react';
import WaypointLeafletMap, { textEl, popupContentFor } from './WaypointLeafletMap';

const waypoint = { id: 'wp-1', name: 'Reef Spot', lat: 40.47, lng: -74.27, notes: 'Good at dusk', created_by_name: 'Andre' };

test('mounts a map canvas without throwing', () => {
  const { getByTestId } = render(<WaypointLeafletMap waypoints={[waypoint]} onMapClick={() => {}} addingMode={false} />);
  expect(getByTestId('waypoint-map-canvas')).toBeInTheDocument();
});

test('renders one Leaflet marker per waypoint', () => {
  const { container } = render(<WaypointLeafletMap waypoints={[waypoint, { ...waypoint, id: 'wp-2', name: 'Wreck' }]} onMapClick={() => {}} addingMode={false} />);
  expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(2);
});

test('renders no markers, and does not throw, with an empty waypoint list', () => {
  const { container } = render(<WaypointLeafletMap waypoints={[]} onMapClick={() => {}} addingMode={false} />);
  expect(container.querySelectorAll('.leaflet-marker-icon')).toHaveLength(0);
});

describe('textEl', () => {
  test('sets plain text content rather than parsing markup', () => {
    const el = textEl('span', '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });
});

describe('popupContentFor', () => {
  test('a waypoint name or notes containing markup never becomes a real element', () => {
    const malicious = { name: '<img src=x onerror=alert(1)>', notes: '<script>alert(2)</script>', created_by_name: 'Andre' };
    const content = popupContentFor(malicious);
    expect(content.querySelector('img')).toBeNull();
    expect(content.querySelector('script')).toBeNull();
    expect(content.textContent).toContain(malicious.name);
    expect(content.textContent).toContain(malicious.notes);
  });

  test('omits the notes paragraph when there are no notes', () => {
    const content = popupContentFor({ name: 'Reef Spot', notes: '', created_by_name: 'Andre' });
    expect(content.querySelector('p')).toBeNull();
  });
});
