import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { geocodeAddress } from '../../utils/geo';
import { MapPin, Loader2 } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MapUpdater = ({ coords }) => {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.lat && coords.lng) {
      map.flyTo([coords.lat, coords.lng], 15);
    }
  }, [coords, map]);
  return null;
};

const AddressMap = ({ address, coords: initialCoords, emptyLabel = 'Ubicación no disponible' }) => {
  const [coords, setCoords] = useState(initialCoords || null);
  const [state, setState] = useState(initialCoords ? 'ok' : 'loading');

  useEffect(() => {
    let active = true;
    if (initialCoords) {
      setCoords(initialCoords);
      setState('ok');
      return;
    }
    
    if (!address) {
      setState('empty');
      return;
    }
    setState('loading');
    setCoords(null);
    geocodeAddress(address)
      .then((res) => {
        if (!active) return;
        if (res) { setCoords(res); setState('ok'); }
        else setState('error');
      })
      .catch(() => { if (active) setState('error'); });
    return () => { active = false; };
  }, [address, initialCoords]);

  if (state === 'empty' || state === 'error') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 gap-2">
        <MapPin className="h-8 w-8 text-gray-300" />
        <span className="text-sm font-medium">{state === 'error' ? 'No se pudo ubicar la dirección' : emptyLabel}</span>
      </div>
    );
  }

  if (state === 'loading') {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50 text-gray-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full relative z-0">
      <MapContainer center={[coords.lat, coords.lng]} zoom={15} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater coords={coords} />
        <Marker position={[coords.lat, coords.lng]} />
      </MapContainer>
    </div>
  );
};

export default AddressMap;