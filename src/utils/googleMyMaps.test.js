import { myMapsId, fetchMyMapsPoints } from './googleMyMaps';

const KML = `<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Fishing Spots</name>
  <Placemark><name>Deep Pool</name><Point><coordinates>-74.72,40.77,0</coordinates></Point></Placemark>
</Document></kml>`;

describe('myMapsId', () => {
  test.each([
    'https://www.google.com/maps/d/edit?hl=en&mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA&ll=40.99%2C-74.84&z=10',
    'https://www.google.com/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA',
    'https://www.google.com/maps/d/u/0/edit?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA&usp=sharing',
    'https://google.com/maps/d/embed?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA',
    '  https://www.google.co.uk/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA  ',
  ])('reads the map id out of %s', (link) => {
    expect(myMapsId(link)).toBe('1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA');
  });

  test.each([
    'not a url',
    'https://www.google.com/maps/place/Somewhere',
    'https://evil.example.com/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA',
    'https://google.com.evil.example/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA',
    'https://www.google.com/maps/d/viewer?mid=../../etc',
    'https://maps.app.goo.gl/abc123',
  ])('rejects %s', (link) => {
    expect(myMapsId(link)).toBeNull();
  });
});

describe('fetchMyMapsPoints', () => {
  afterEach(() => { delete global.fetch; });

  test('fetches the map\'s KML from Google itself, whatever the pasted link\'s other parameters', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(KML) });
    const result = await fetchMyMapsPoints('https://www.google.com/maps/d/edit?hl=en&mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA&ll=40.99%2C-74.84');
    expect(global.fetch).toHaveBeenCalledWith('https://www.google.com/maps/d/kml?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA&forcekml=1');
    expect(result.title).toBe('Fishing Spots');
    expect(result.points).toEqual([{ name: 'Deep Pool', lat: 40.77, lng: -74.72, notes: '' }]);
  });

  test('never fetches anything for a link that isn\'t a My Maps link', async () => {
    global.fetch = jest.fn();
    await expect(fetchMyMapsPoints('https://example.com/whatever')).rejects.toThrow(/google my maps link/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('explains sharing when Google refuses the map', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, text: () => Promise.resolve('') });
    await expect(fetchMyMapsPoints('https://www.google.com/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA')).rejects.toThrow(/anyone with this link can view/i);
  });

  test('explains sharing when Google answers with a sign-in page instead of KML', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('<html><body>Sign in</body></html>') });
    await expect(fetchMyMapsPoints('https://www.google.com/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA')).rejects.toThrow(/anyone with this link can view/i);
  });

  test('says so when the network is down', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchMyMapsPoints('https://www.google.com/maps/d/viewer?mid=1Scwx2cIMDclt0vRr_tcwG_7ByBE6WpA')).rejects.toThrow(/couldn't reach google maps/i);
  });
});
