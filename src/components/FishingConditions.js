import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { geocodePlace, fetchConditions, skyLabel, compassDirection, moonPhase } from '../utils/fishingConditions';

const GEOCODE_CACHE_KEY = 'fishyfriends:conditions-geocode';

// A place's coordinates don't change, so once home_water geocodes successfully there's no
// reason to hit the geocoder again on every visit — only the conditions themselves refetch.
function readGeocodeCache(place) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(GEOCODE_CACHE_KEY) || '{}');
    return cache[place.toLowerCase()] || null;
  } catch { return null; }
}

function writeGeocodeCache(place, location) {
  try {
    const cache = JSON.parse(window.localStorage.getItem(GEOCODE_CACHE_KEY) || '{}');
    cache[place.toLowerCase()] = location;
    window.localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(cache));
  } catch { /* private mode */ }
}

// Silent by design: home_water is freeform text ("the pond behind my house") that often
// won't geocode, and this is a nice-to-have on the dashboard, not something worth an error
// banner over. No match, no network, or no profile water at all all just render nothing.
export default function FishingConditions() {
  const { profile } = useAuth();
  const homeWater = profile?.home_water?.trim();
  const [conditions, setConditions] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    if (!homeWater) { setConditions(null); setLocation(null); return; }
    let active = true;
    (async () => {
      let place = readGeocodeCache(homeWater);
      if (!place) {
        place = await geocodePlace(homeWater).catch(() => null);
        if (place) writeGeocodeCache(homeWater, place);
      }
      if (!place) { if (active) { setConditions(null); setLocation(null); } return; }
      const data = await fetchConditions(place.latitude, place.longitude).catch(() => null);
      if (active) { setLocation(place); setConditions(data); }
    })();
    return () => { active = false; };
  }, [homeWater]);

  if (!homeWater || !conditions || !location) return null;

  const moon = moonPhase();
  return <section className="table-card fishing-conditions">
    <div className="section-heading">
      <div><span className="eyebrow">RIGHT NOW · {location.label.split(',')[0].toUpperCase()}</span><h2>Fishing conditions</h2></div>
    </div>
    <div className="participant-summary">
      <div><strong>{conditions.temperatureF}°F</strong><span>{skyLabel(conditions.weatherCode)}</span></div>
      <div><strong>{conditions.windMph} mph</strong><span>wind {compassDirection(conditions.windDirection)}</span></div>
      <div><strong>{conditions.cloudCoverPct}%</strong><span>cloud cover</span></div>
      <div><strong>{moon.name}</strong><span>moon phase</span></div>
    </div>
  </section>;
}
