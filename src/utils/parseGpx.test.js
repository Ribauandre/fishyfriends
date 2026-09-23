import parseGpx from './parseGpx';

const NAVIONICS_STYLE_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Navionics" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="40.474830" lon="-74.268760">
    <name>Reef Spot</name>
    <desc>Good striper spot at dusk</desc>
    <cmt>Good striper spot at dusk</cmt>
  </wpt>
  <wpt lat="40.501200" lon="-74.301000">
    <name>Wreck</name>
    <desc>Sunken barge</desc>
  </wpt>
</gpx>`;

test('extracts name, lat, lng, and notes from each waypoint', () => {
  const points = parseGpx(NAVIONICS_STYLE_GPX);
  expect(points).toEqual([
    { name: 'Reef Spot', lat: 40.47483, lng: -74.26876, notes: 'Good striper spot at dusk' },
    { name: 'Wreck', lat: 40.5012, lng: -74.301, notes: 'Sunken barge' },
  ]);
});

test('defaults an unnamed waypoint to "Waypoint"', () => {
  const gpx = `<gpx><wpt lat="1" lon="2"></wpt></gpx>`;
  expect(parseGpx(gpx)[0].name).toBe('Waypoint');
});

test('skips a waypoint missing valid coordinates rather than throwing', () => {
  const gpx = `<gpx>
    <wpt lat="not-a-number" lon="-74"><name>Bad</name></wpt>
    <wpt lat="41" lon="-74"><name>Good</name></wpt>
  </gpx>`;
  const points = parseGpx(gpx);
  expect(points).toHaveLength(1);
  expect(points[0].name).toBe('Good');
});

test('throws a clear error for a file with no waypoints', () => {
  expect(() => parseGpx('<gpx><trk><name>Track only</name></trk></gpx>')).toThrow(/no waypoints/i);
});

test('throws a clear error for malformed XML', () => {
  expect(() => parseGpx('not xml at all <<<')).toThrow(/doesn't look like valid gpx/i);
});
