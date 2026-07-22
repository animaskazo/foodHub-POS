import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MapPin } from 'lucide-react';

// Fix for default marker icon in Leaflet with Webpack/Vite
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

const DeliveryMap = ({ lat, lng, radiusKm, onLocationChange }) => {
  const [center, setCenter] = useState([-33.4489, -70.6693]); // Default Santiago, Chile
  const mapRef = useRef(null);

  useEffect(() => {
    if (lat && lng) {
      setCenter([lat, lng]);
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], 13);
      }
    } else {
      // Try to get user location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const newCenter = [pos.coords.latitude, pos.coords.longitude];
            setCenter(newCenter);
            if (mapRef.current) {
              mapRef.current.flyTo(newCenter, 13);
            }
          },
          () => {}
        );
      }
    }
  }, [lat, lng]);

  const handleLocationSelect = (latlng) => {
    onLocationChange(latlng.lat, latlng.lng);
  };

  return (
    <div className="relative w-full h-[400px] rounded-xl overflow-hidden border-2 border-gray-200">
      <div className="absolute top-4 right-4 z-[400] bg-white px-3 py-2 rounded-lg shadow-md border border-gray-100 flex items-center gap-2 pointer-events-none">
        <MapPin className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-700">Haz clic en el mapa para marcar tu local</span>
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
          <>
            <Marker position={[lat, lng]} />
            <Circle 
              center={[lat, lng]} 
              radius={radiusKm * 1000} // Leaflet radius is in meters
              pathOptions={{ fillColor: '#3b82f6', color: '#2563eb', weight: 2, fillOpacity: 0.2 }}
            />
          </>
        )}
        <MapEvents onLocationSelect={handleLocationSelect} />
      </MapContainer>
    </div>
  );
};

export default DeliveryMap;
