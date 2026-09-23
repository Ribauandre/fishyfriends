// Parses a GPX file (as exported by Navionics, C-MAP, and most other chartplotter apps)
// into plain waypoint objects, entirely client-side via the browser's native DOMParser — no
// extra dependency for what's a small, well-defined XML shape. Only <wpt> elements are read;
// tracks/routes aren't waypoints and this feature isn't a route planner.
export default function parseGpx(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error("That file doesn't look like valid GPX.");

  const nodes = doc.querySelectorAll('wpt');
  if (!nodes.length) throw new Error('No waypoints found in that file.');

  const points = [];
  nodes.forEach((node) => {
    const lat = Number.parseFloat(node.getAttribute('lat'));
    const lng = Number.parseFloat(node.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const name = node.querySelector('name')?.textContent?.trim() || 'Waypoint';
    const desc = node.querySelector('desc')?.textContent?.trim() || '';
    const cmt = node.querySelector('cmt')?.textContent?.trim() || '';
    const notes = [desc, cmt !== desc ? cmt : ''].filter(Boolean).join(' — ');
    points.push({ name, lat, lng, notes });
  });
  if (!points.length) throw new Error('No waypoints with valid coordinates were found in that file.');
  return points;
}
