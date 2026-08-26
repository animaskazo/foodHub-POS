import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polygon, Circle, Tooltip, useMapEvents } from 'react-leaflet';
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

const DeliveryMap = ({ lat, lng, polygon, zones = [], activeZoneId = null, activeZoneColor = null, isDrawingMode = false, onLocationChange, onPolygonChange }) => {
  const [center, setCenter] = useState([lat || -33.4489, lng || -70.6693]);
  const [mode, setMode] = useState(isDrawingMode ? 'polygon' : 'marker');
  const mapRef = useRef(null);

  useEffect(() => {
    if (isDrawingMode) {
      setMode('polygon');
    }
  }, [isDrawingMode]);

  useEffect(() => {
    if (lat && lng) {
      setCenter([lat, lng]);
      if (mapRef.current) {
        mapRef.current.flyTo([lat, lng], 13);
      }
    }
  }, [lat, lng]);

  const handleLocationSelect = (latlng) => {
    if (isDrawingMode) {
      const newPolygon = [...(polygon || []), { lat: latlng.lat, lng: latlng.lng }];
      onPolygonChange?.(newPolygon);
    }
  };

  const polyPositions = (polygon || []).map(p => [p.lat, p.lng]);

  return (
    <div className="relative w-full h-[420px] rounded-xl overflow-hidden border-2 border-gray-200 flex flex-col">
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none items-end">
        {isDrawingMode && (
          <div className="pointer-events-auto bg-white rounded-lg shadow-md border border-gray-100 p-1 flex gap-1">
            <span className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-black bg-amber-400 text-black">
              <MousePointer2 className="w-3.5 h-3.5" />
              Dibujando Zona
            </span>
            {polygon?.length > 0 && (
              <button
                type="button"
                onClick={() => onPolygonChange?.([])}
                className="flex items-center gap-1.5 px-3 py-2 bg-white text-red-600 rounded-md text-xs font-bold hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar Puntos
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="absolute top-4 left-16 z-[1000] bg-white/95 backdrop-blur-sm px-3.5 py-2 rounded-lg shadow-md border border-gray-100 flex items-center gap-2 pointer-events-none">
        <span className="text-xs font-semibold text-gray-800">
          {isDrawingMode ? '🖊️ Haz clics en el mapa para trazar los vértices del perímetro' : '🏪 Ubicación del local fija según configuración general'}
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
          <Marker position={[lat, lng]}>
            <Tooltip permanent font-bold direction="top" offset={[0, -20]}>
              🏪 Tu Local
            </Tooltip>
          </Marker>
        )}

        {/* Existing Zones */}
        {zones.map((zone) => {
          if (!zone.is_active) return null;
          // Hide static shape of zone if it is currently being drawn
          if (zone.id === activeZoneId && isDrawingMode) return null;

          if (zone.type === 'radius' && zone.radius_km > 0 && lat && lng) {
            return (
              <Circle
                key={zone.id}
                center={[lat, lng]}
                radius={zone.radius_km * 1000}
                pathOptions={{
                  fillColor: zone.color || '#10b981',
                  color: zone.color || '#059669',
                  weight: 2,
                  fillOpacity: 0.2
                }}
              >
                <Tooltip sticky font-bold>
                  {zone.name} (${Number(zone.fee || 0).toLocaleString('es-CL')}) - {zone.radius_km} km
                </Tooltip>
              </Circle>
            );
          }

          if (zone.type === 'polygon' && zone.polygon?.length >= 3) {
            return (
              <Polygon
                key={zone.id}
                positions={zone.polygon.map(p => [p.lat, p.lng])}
                pathOptions={{
                  fillColor: zone.color || '#3b82f6',
                  color: zone.color || '#2563eb',
                  weight: 2,
                  fillOpacity: 0.25
                }}
              >
                <Tooltip sticky font-bold>
                  {zone.name} (${Number(zone.fee || 0).toLocaleString('es-CL')})
                </Tooltip>
              </Polygon>
            );
          }
          return null;
        })}

        {/* Polygon currently being drawn with chosen zone color */}
        {polyPositions.length > 0 && isDrawingMode && (
          <Polygon 
            positions={polyPositions}
            pathOptions={{
              fillColor: activeZoneColor || '#10b981',
              color: activeZoneColor || '#059669',
              weight: 3,
              fillOpacity: 0.4
            }}
          />
        )}

        <MapEvents onLocationSelect={handleLocationSelect} />
      </MapContainer>
    </div>
  );
};

export default DeliveryMap;

