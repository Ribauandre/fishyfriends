/* eslint-disable no-restricted-globals */

// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

clientsClaim();

// Precache the app shell (JS/CSS/HTML) so the site installs and loads instantly offline —
// but NOT /static/media/, which is 50+ MB of fish/scene/angler art for the fishing game.
// Force-downloading all of that on first visit would make "install" itself a multi-minute
// download on mobile data; those assets get cached opportunistically instead, by the
// StaleWhileRevalidate route below, as a player actually encounters them in the game.
const appShellManifest = self.__WB_MANIFEST.filter((entry) => !entry.url.includes('/static/media/'));
precacheAndRoute(appShellManifest);

// App Shell-style routing: every same-origin navigation request that isn't for a specific
// file (no extension) is served the cached index.html, so client-side routing keeps working
// offline instead of hitting GitHub Pages' 404 page for a deep link like /fish-year.
const fileExtensionRegexp = new RegExp('/[^/?]+\\.[^/]+$');
registerRoute(
  ({ request, url }) => {
    if (request.mode !== 'navigate') return false;
    if (url.pathname.startsWith('/_')) return false;
    if (url.pathname.match(fileExtensionRegexp)) return false;
    return true;
  },
  createHandlerBoundToURL(process.env.PUBLIC_URL + '/index.html')
);

// Runtime cache for the species/scene art, which isn't in the precache manifest by name
// (it's referenced by hashed URL from JS) but is still worth keeping around between visits.
registerRoute(
  ({ url }) => url.origin === self.location.origin && (url.pathname.endsWith('.png') || url.pathname.endsWith('.webp')),
  new StaleWhileRevalidate({
    cacheName: 'images',
    plugins: [new ExpirationPlugin({ maxEntries: 200 })],
  })
);

// Lets a waiting service worker take over immediately when the page asks it to, rather than
// waiting for every open tab to close first.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
