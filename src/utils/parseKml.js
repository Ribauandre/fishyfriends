// KML from Google My Maps / Google Earth. Every Placemark with a Point becomes a waypoint;
// lines and shapes (a drift route, an outlined bay) have no single spot to pin, so they're
// counted and skipped rather than guessed at.
function childText(el, tag) {
  const child = [...el.children].find((node) => node.localName === tag);
  return child?.textContent?.trim() || '';
}

// My Maps descriptions are HTML ("<br>", sometimes images); keep only the words.
function plainText(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

// My Maps puts each layer in a Folder; its name ("Big Flat Brook Spots") is worth keeping.
function folderName(placemark) {
  for (let node = placemark.parentElement; node; node = node.parentElement) {
    if (node.localName === 'Folder') return childText(node, 'name');
  }
  return '';
}

export default function parseKml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || doc.documentElement.localName !== 'kml') {
    throw new Error("That file doesn't look like valid KML.");
  }
  const placemarks = [...doc.getElementsByTagName('Placemark')];
  if (!placemarks.length) throw new Error('No pins found in that map.');

  const points = [];
  let skipped = 0;
  placemarks.forEach((placemark) => {
    const coordinates = placemark.getElementsByTagName('Point')[0]?.getElementsByTagName('coordinates')[0]?.textContent?.trim();
    // KML order is longitude,latitude[,altitude].
    const [lng, lat] = (coordinates || '').split(',').map(Number);
    if (!coordinates || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      skipped += 1;
      return;
    }
    const notes = [folderName(placemark), plainText(childText(placemark, 'description'))].filter(Boolean).join(' — ');
    points.push({ name: childText(placemark, 'name') || 'Waypoint', lat, lng, notes });
  });

  if (!points.length) throw new Error('That map has no pins to import, only lines or shapes.');
  const documentEl = doc.getElementsByTagName('Document')[0];
  return { title: documentEl ? childText(documentEl, 'name') : '', points, skipped };
}
