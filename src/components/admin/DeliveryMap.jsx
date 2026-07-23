import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin, MousePointer2, Trash2 } from 'lucide-react';

// Fix for default marker icon in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MapEvents = ({ onLocationSelect }) => {
  useMapEvents({
    click(e) {
      onLocationSelect(e.latlng);
    },
  });
  return null;
};

const DeliveryMap = ({ lat, lng, polygon, onLocationChange, onPolygonChange }) => {
  const [center, setCenter] = useState([lat || -33.4489, lng || -70.6693]);
  const [mode, setMode] = useState('marker'); // 'marker' or 'polygon'
  const mapRef = useRef(null);

  useEffect(() => {
    if (lat && lng) {
      setCenter([lat, lng]);
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], 13);
      }
    }
  }, [lat, lng]);

  const handleLocationSelect = (latlng) => {
    if (mode === 'marker') {
      onLocationChange(latlng.lat, latlng.lng);
    } else {
      const newPolygon = [...(polygon || []), { lat: latlng.lat, lng: latlng.lng }];
      onPolygonChange(newPolygon);
    }
  };

  const polyPositions = (polygon || []).map(p => [p.lat, p.lng]);

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden border-2 border-gray-200 flex flex-col">
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none items-end">
        
        <div className="pointer-events-auto bg-white rounded-lg shadow-md border border-gray-100 p-1 flex gap-1">
          <button
            onClick={() => setMode('marker')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'marker' ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'}`}
          >
            <MapPin className="w-4 h-4" />
            Fijar Local
          </button>
          <button
            onClick={() => setMode('polygon')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-bold transition-colors ${mode === 'polygon' ? 'bg-black text-white' : 'hover:bg-gray-100 text-gray-700'}`}
          >
            <MousePointer2 className="w-4 h-4" />
            Dibujar Zona
          </button>
        </div>

        {mode === 'polygon' && (polygon?.length > 0) && (
          <button
            onClick={() => onPolygonChange([])}
            className="pointer-events-auto flex items-center gap-1.5 px-3 py-2 bg-white text-red-600 rounded-lg shadow-md border border-red-100 text-sm font-bold hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Limpiar Zona
          </button>
        )}
      </div>
      
      <div className="absolute top-4 left-16 z-[1000] bg-white px-3 py-2 rounded-lg shadow-md border border-gray-100 flex items-center gap-2 pointer-events-none">
        <span className="text-sm font-medium text-gray-700">
          {mode === 'marker' ? 'Haz clic en el mapa para marcar tu local' : 'Haz clics consecutivos para dibujar tu zona'}
        </span>
      </div>

      <MapContainer 
        center={center} 
        zoom={13} 
        scrollWheelZoom={true} 
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {lat && lng && (
          <Marker position={[lat, lng]} />
        )}

        {polyPositions.length > 0 && (
          <Polygon 
            positions={polyPositions}
            pathOptions={{ fillColor: '#3b82f6', color: '#2563eb', weight: 2, fillOpacity: 0.2 }}
          />
        )}

        <MapEvents onLocationSelect={handleLocationSelect} />
      </MapContainer>
    </div>
  );
};

export default DeliveryMap;
