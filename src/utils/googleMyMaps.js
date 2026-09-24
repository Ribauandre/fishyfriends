import parseKml from './parseKml';

// Google serves any link-shared My Maps map as KML with CORS open, so the browser can pull
// its pins directly — no export step, no backend. Only the map id is taken from the pasted
// link; the request always goes to Google's own KML endpoint, never to the pasted URL.
const MAP_ID = /^[A-Za-z0-9_-]{10,}$/;
const GOOGLE_HOST = /^(www\.)?google\.[a-z]{2,3}(\.[a-z]{2})?$/;

export function myMapsId(link) {
  let url;
  try { url = new URL(link.trim()); } catch (error) { return null; }
  if (!GOOGLE_HOST.test(url.hostname) || !url.pathname.startsWith('/maps/d/')) return null;
  const mid = url.searchParams.get('mid');
  return mid && MAP_ID.test(mid) ? mid : null;
}

const NOT_SHARED = 'Couldn\'t open that map. In Google My Maps, tap Share and turn on "Anyone with this link can view", then try again.';

export async function fetchMyMapsPoints(link) {
  const mid = myMapsId(link || '');
  if (!mid) throw new Error('That doesn\'t look like a Google My Maps link. Open the map and copy the link from the address bar: it has "google.com/maps/d/" and "mid=" in it.');
  let response;
  try {
    response = await fetch(`https://www.google.com/maps/d/kml?mid=${mid}&forcekml=1`);
  } catch (error) {
    throw new Error('Couldn\'t reach Google Maps. Check your connection and try again.');
  }
  if (!response.ok) throw new Error(NOT_SHARED);
  const text = await response.text();
  // A private map can come back as a sign-in page rather than an error status.
  if (!text.includes('<kml')) throw new Error(NOT_SHARED);
  return parseKml(text);
}
