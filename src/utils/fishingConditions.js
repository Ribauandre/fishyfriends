// Client-side calls to Open-Meteo (no API key, CORS-friendly) so the Home page can show
// "should I go fish today" conditions for an angler's own home water without any backend.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// home_water is freeform text ("Raritan Bay", "the pond behind my house"), so this can and
// does come back empty for plenty of profiles — callers treat null as "nothing to show",
// not an error.
export async function geocodePlace(query) {
  const trimmed = query?.trim();
  if (!trimmed) return null;
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(trimmed)}&count=1&language=en&format=json`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const match = data?.results?.[0];
  if (!match) return null;
  return { latitude: match.latitude, longitude: match.longitude, label: [match.name, match.admin1].filter(Boolean).join(', ') };
}

export async function fetchConditions(latitude, longitude) {
  const url = `${FORECAST_URL}?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,wind_speed_10m,wind_direction_10m,cloud_cover,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  const current = data?.current;
  if (!current) return null;
  return {
    temperatureF: Math.round(current.temperature_2m),
    windMph: Math.round(current.wind_speed_10m),
    windDirection: current.wind_direction_10m,
    cloudCoverPct: Math.round(current.cloud_cover),
    weatherCode: current.weather_code,
  };
}

// WMO weather codes (what Open-Meteo's "weather_code" field returns) collapsed to the short
// labels an angler actually wants, not the meteorologist's grid.
const SKY_LABELS = {
  0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Foggy', 48: 'Foggy',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
  80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy showers',
  95: 'Thunderstorms', 96: 'Thunderstorms', 99: 'Thunderstorms',
};
export function skyLabel(code) {
  return SKY_LABELS[code] || 'Mixed conditions';
}

const COMPASS_POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassDirection(degrees) {
  if (degrees === null || degrees === undefined) return '';
  return COMPASS_POINTS[Math.round(degrees / 22.5) % 16];
}

// Pure lunar-phase calculation (no API needed) — days since a known new moon, modulo the
// synodic month length.
const SYNODIC_MONTH_DAYS = 29.530588861;
const KNOWN_NEW_MOON_UTC = Date.UTC(2000, 0, 6, 18, 14);
const MOON_PHASES = [
  { upTo: 0.033, name: 'New moon' },
  { upTo: 0.25, name: 'Waxing crescent' },
  { upTo: 0.283, name: 'First quarter' },
  { upTo: 0.467, name: 'Waxing gibbous' },
  { upTo: 0.533, name: 'Full moon' },
  { upTo: 0.717, name: 'Waning gibbous' },
  { upTo: 0.75, name: 'Last quarter' },
  { upTo: 0.967, name: 'Waning crescent' },
  { upTo: 1, name: 'New moon' },
];

export function moonPhase(date = new Date()) {
  const daysSince = (date.getTime() - KNOWN_NEW_MOON_UTC) / 86400000;
  const cyclesElapsed = daysSince / SYNODIC_MONTH_DAYS;
  const fraction = cyclesElapsed - Math.floor(cyclesElapsed);
  const phase = MOON_PHASES.find((entry) => fraction <= entry.upTo) || MOON_PHASES[MOON_PHASES.length - 1];
  return { fraction, name: phase.name };
}
