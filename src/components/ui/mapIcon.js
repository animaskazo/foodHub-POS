import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapPin } from 'lucide-react';
import L from 'leaflet';

export const mapPinIcon = L.divIcon({
  className: 'foodhub-map-marker',
  html: renderToStaticMarkup(createElement(MapPin, { size: 28, color: '#000', strokeWidth: 2, fill: 'none', 'aria-hidden': true })),
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28],
});
