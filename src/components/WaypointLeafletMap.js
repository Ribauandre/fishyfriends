import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Webpack fingerprints these image URLs, which breaks Leaflet's own baked-in relative paths —
// the standard fix is to hand it the resolved URLs directly.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

// Builds tooltip/popup content as real DOM nodes with textContent, never an HTML string —
// Leaflet inserts string content via innerHTML unescaped, and a waypoint's name/notes can
// come straight from a GPX file's <name>/<desc> tags, which this app doesn't control.
export function textEl(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

export function popupContentFor(waypoint) {
  const wrapper = document.createElement('div');
  wrapper.className = 'waypoint-popup';
  wrapper.appendChild(textEl('strong', waypoint.name));
  if (waypoint.notes) wrapper.appendChild(textEl('p', waypoint.notes));
  wrapper.appendChild(textEl('span', `Added by ${waypoint.created_by_name}`, 'waypoint-popup-meta'));
  return wrapper;
}

// Standard OSM tiles are keyless (CARTO's dark tiles, used first, now stamp "API KEY
// REQUIRED" on every tile). They only come light, so the waypoint-base-tiles CSS filter
// darkens this layer alone and the seamark overlay keeps its true buoy colours.
const BASE_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const NAUTICAL_OVERLAY_TILES = 'https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';
const DEFAULT_CENTER = [39.5, -98.35];
const DEFAULT_ZOOM = 4;

// A thin imperative wrapper, not react-leaflet: Leaflet owns a real DOM node it mutates
// directly, so this component's job is just to keep that instance's markers in sync with
// `waypoints` and to relay a click back out — everything else about the map lives outside
// React on purpose.
export default function WaypointLeafletMap({ waypoints, onMapClick, addingMode }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    L.tileLayer(BASE_TILES, { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, className: 'waypoint-base-tiles' }).addTo(map);
    L.tileLayer(NAUTICAL_OVERLAY_TILES, { attribution: 'Seamarks: OpenSeaMap', maxZoom: 18 }).addTo(map);
    map.on('click', (event) => onMapClickRef.current?.(event.latlng.lat, event.latlng.lng));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = waypoints.map((waypoint) => {
      const marker = L.marker([waypoint.lat, waypoint.lng]).addTo(map);
      marker.bindTooltip(textEl('span', waypoint.name));
      marker.bindPopup(popupContentFor(waypoint));
      return marker;
    });
    if (waypoints.length) {
      map.fitBounds(L.latLngBounds(waypoints.map((waypoint) => [waypoint.lat, waypoint.lng])), { padding: [40, 40], maxZoom: 12 });
    }
  }, [waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getContainer().style.cursor = addingMode ? 'crosshair' : '';
  }, [addingMode]);

  return <div className="waypoint-map-canvas" ref={containerRef} data-testid="waypoint-map-canvas" />;
}
