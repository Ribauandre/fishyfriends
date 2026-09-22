import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import FishingConditions from './FishingConditions';
import { useAuth } from '../context/AuthContext';

jest.mock('../context/AuthContext', () => ({ useAuth: jest.fn() }));

function mockFetchSequence(...responses) {
  const fn = jest.fn();
  responses.forEach((response) => fn.mockResolvedValueOnce(response));
  global.fetch = fn;
  return fn;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  delete global.fetch;
});

test('renders nothing when the profile has no home water', () => {
  useAuth.mockReturnValue({ profile: { home_water: '' } });
  const { container } = render(<FishingConditions />);
  expect(container).toBeEmptyDOMElement();
});

test('renders nothing when the home water cannot be geocoded', async () => {
  useAuth.mockReturnValue({ profile: { home_water: 'the pond behind my house' } });
  mockFetchSequence({ ok: true, json: async () => ({ results: [] }) });
  const { container } = render(<FishingConditions />);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(container).toBeEmptyDOMElement();
});

test('shows conditions once geocoding and the forecast both resolve', async () => {
  useAuth.mockReturnValue({ profile: { home_water: 'Raritan Bay' } });
  mockFetchSequence(
    { ok: true, json: async () => ({ results: [{ latitude: 40.47, longitude: -74.27, name: 'Raritan Bay', admin1: 'New Jersey' }] }) },
    { ok: true, json: async () => ({ current: { temperature_2m: 61.8, wind_speed_10m: 17.9, wind_direction_10m: 0, cloud_cover: 100, weather_code: 3 } }) },
  );
  render(<FishingConditions />);
  expect(await screen.findByText('62°F')).toBeInTheDocument();
  expect(screen.getByText('Overcast')).toBeInTheDocument();
  expect(screen.getByText('18 mph')).toBeInTheDocument();
  expect(screen.getByText(/RARITAN BAY/)).toBeInTheDocument();
});

test('caches a successful geocode so a second mount does not re-geocode', async () => {
  useAuth.mockReturnValue({ profile: { home_water: 'Raritan Bay' } });
  const fetchMock = mockFetchSequence(
    { ok: true, json: async () => ({ results: [{ latitude: 40.47, longitude: -74.27, name: 'Raritan Bay', admin1: 'New Jersey' }] }) },
    { ok: true, json: async () => ({ current: { temperature_2m: 61.8, wind_speed_10m: 17.9, wind_direction_10m: 0, cloud_cover: 100, weather_code: 3 } }) },
  );
  const { unmount } = render(<FishingConditions />);
  await screen.findByText('62°F');
  unmount();

  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ current: { temperature_2m: 70, wind_speed_10m: 5, wind_direction_10m: 0, cloud_cover: 10, weather_code: 0 } }) });
  render(<FishingConditions />);
  expect(await screen.findByText('70°F')).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls[2][0]).toMatch(/api\.open-meteo\.com\/v1\/forecast/);
});
