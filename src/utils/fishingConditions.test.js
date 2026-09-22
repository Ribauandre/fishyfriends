import { geocodePlace, fetchConditions, skyLabel, compassDirection, moonPhase } from './fishingConditions';

afterEach(() => {
  delete global.fetch;
});

describe('geocodePlace', () => {
  test('returns null for an empty query without calling fetch', async () => {
    global.fetch = jest.fn();
    expect(await geocodePlace('   ')).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns the first match with a lat/lon and a human label', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ latitude: 40.47, longitude: -74.27, name: 'Raritan Bay', admin1: 'New Jersey' }] }),
    });
    const result = await geocodePlace('Raritan Bay');
    expect(result).toEqual({ latitude: 40.47, longitude: -74.27, label: 'Raritan Bay, New Jersey' });
  });

  test('returns null when nothing matches', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
    expect(await geocodePlace('a made-up place')).toBeNull();
  });

  test('returns null on a non-ok response instead of throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await geocodePlace('Raritan Bay')).toBeNull();
  });
});

describe('fetchConditions', () => {
  test('rounds and maps the current-conditions fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { temperature_2m: 61.8, wind_speed_10m: 17.9, wind_direction_10m: 37, cloud_cover: 100, weather_code: 3 } }),
    });
    const result = await fetchConditions(40.47, -74.27);
    expect(result).toEqual({ temperatureF: 62, windMph: 18, windDirection: 37, cloudCoverPct: 100, weatherCode: 3 });
  });

  test('returns null on a non-ok response instead of throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false });
    expect(await fetchConditions(40.47, -74.27)).toBeNull();
  });
});

test('skyLabel maps known WMO codes and falls back for unknown ones', () => {
  expect(skyLabel(0)).toBe('Clear');
  expect(skyLabel(63)).toBe('Rain');
  expect(skyLabel(9999)).toBe('Mixed conditions');
});

test('compassDirection converts degrees to the nearest compass point', () => {
  expect(compassDirection(0)).toBe('N');
  expect(compassDirection(90)).toBe('E');
  expect(compassDirection(181)).toBe('S');
  expect(compassDirection(null)).toBe('');
});

test('moonPhase returns a known phase name for a known date', () => {
  // The reference new moon itself.
  expect(moonPhase(new Date(Date.UTC(2000, 0, 6, 18, 14))).name).toBe('New moon');
  // Roughly half a synodic month later should land on a full moon.
  expect(moonPhase(new Date(Date.UTC(2000, 0, 21, 12, 0))).name).toBe('Full moon');
});
