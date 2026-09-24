import parseKml from './parseKml';

const MY_MAPS_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Fishing Spots</name>
    <description>Spots to fish</description>
    <Folder>
      <name>Big Flat Brook Spots</name>
      <Placemark>
        <name>Undercut Bank</name>
        <description><![CDATA[Deep on the far side<br>Best at dawn]]></description>
        <styleUrl>#icon-1899-0F9D58-labelson-nodesc</styleUrl>
        <Point>
          <coordinates>
            -74.7088333333333,41.2578611111111,0
          </coordinates>
        </Point>
      </Placemark>
      <Placemark>
        <name>Trail along the brook</name>
        <LineString><coordinates>-74.70,41.25,0 -74.71,41.26,0</coordinates></LineString>
      </Placemark>
    </Folder>
    <Placemark>
      <Point><coordinates>-74.5,40.9</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;

test('turns each pin into a waypoint, KML longitude-first coordinates the right way round', () => {
  const { title, points } = parseKml(MY_MAPS_KML);
  expect(title).toBe('Fishing Spots');
  expect(points[0]).toEqual({ name: 'Undercut Bank', lat: 41.2578611111111, lng: -74.7088333333333, notes: 'Big Flat Brook Spots — Deep on the far side Best at dawn' });
});

test('names an unnamed pin and gives a pin outside any layer no layer note', () => {
  const { points } = parseKml(MY_MAPS_KML);
  expect(points[1]).toEqual({ name: 'Waypoint', lat: 40.9, lng: -74.5, notes: '' });
});

test('skips lines and shapes, and counts them', () => {
  const { points, skipped } = parseKml(MY_MAPS_KML);
  expect(points).toHaveLength(2);
  expect(skipped).toBe(1);
});

test('keeps the words of an HTML description but never its markup', () => {
  const kml = MY_MAPS_KML.replace('Deep on the far side<br>Best at dawn', '<img src=x onerror=alert(1)><b>Big</b> fish');
  expect(parseKml(kml).points[0].notes).toBe('Big Flat Brook Spots — Big fish');
});

test('skips a pin with out-of-range coordinates', () => {
  const kml = MY_MAPS_KML.replace('-74.5,40.9', '-74.5,95');
  const { points, skipped } = parseKml(kml);
  expect(points).toHaveLength(1);
  expect(skipped).toBe(2);
});

test('rejects a map with only lines or shapes', () => {
  const kml = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>1,2 3,4</coordinates></LineString></Placemark></Document></kml>`;
  expect(() => parseKml(kml)).toThrow(/only lines or shapes/i);
});

test('rejects something that is not KML', () => {
  expect(() => parseKml('<html><body>Sign in</body></html>')).toThrow(/valid KML/i);
  expect(() => parseKml('not xml at all')).toThrow(/valid KML/i);
});

test('rejects KML with no placemarks', () => {
  expect(() => parseKml('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Empty</name></Document></kml>')).toThrow(/no pins/i);
});
