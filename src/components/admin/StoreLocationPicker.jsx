import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Search, MapPin, Navigation, Loader2, CheckCircle2 } from 'lucide-react';
import { searchAddressSuggestions, reverseGeocode } from '../../utils/geo';

// Fix for default marker icon in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom component to handle map clicks & center updates
const MapController = ({ center, onLocationSelect }) => {
  const map = useMap();

  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, 17, { animate: true, duration: 1.2 });
    }
  }, [center, map]);

  useMapEvents({
    click(e) {
      onLocationSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return null;
};

const StoreLocationPicker = ({ address = '', lat = null, lng = null, onChange }) => {
  const defaultLat = -33.4489; // Santiago, Chile fallback
  const defaultLng = -70.6693;

  const currentLat = lat || defaultLat;
  const currentLng = lng || defaultLng;

  const [inputAddress, setInputAddress] = useState(address || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [selectedCoords, setSelectedCoords] = useState({ lat: currentLat, lng: currentLng });
  const [mapCenter, setMapCenter] = useState([currentLat, currentLng]);

  const [isLocatingGPS, setIsLocatingGPS] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  const containerRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const markerRef = useRef(null);

  // Sync internal address state when prop changes
  useEffect(() => {
    setInputAddress(address || '');
  }, [address]);

  // Sync coords when lat/lng props change
  useEffect(() => {
    if (lat && lng) {
      setSelectedCoords({ lat, lng });
      setMapCenter([lat, lng]);
    }
  }, [lat, lng]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle address input change + debounced autocomplete search
  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputAddress(value);
    onChange?.({ address: value, lat: selectedCoords.lat, lng: selectedCoords.lng });

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (value.trim().length >= 3) {
      setIsSearching(true);
      setShowSuggestions(true);
      searchTimeoutRef.current = setTimeout(async () => {
        const results = await searchAddressSuggestions(value);
        setSuggestions(results);
        setIsSearching(false);
      }, 350);
    } else {
      setSuggestions([]);
      setIsSearching(false);
      setShowSuggestions(false);
    }
  };

  // When user selects a suggestion from dropdown
  const handleSelectSuggestion = (item) => {
    const newAddress = item.displayName;
    const newLat = item.lat;
    const newLng = item.lng;

    setInputAddress(newAddress);
    setSelectedCoords({ lat: newLat, lng: newLng });
    setMapCenter([newLat, newLng]);
    setShowSuggestions(false);

    setStatusMsg('Dirección seleccionada correctamente');
    setTimeout(() => setStatusMsg(null), 3000);

    onChange?.({ address: newAddress, lat: newLat, lng: newLng });
  };

  // Update position via map click or marker drag
  const handleLocationUpdate = async ({ lat, lng }, updateAddressText = true) => {
    setSelectedCoords({ lat, lng });
    setMapCenter([lat, lng]);

    let resolvedAddress = inputAddress;
    if (updateAddressText) {
      setStatusMsg('Obteniendo nombre de la ubicación...');
      const rev = await reverseGeocode(lat, lng);
      if (rev?.displayName) {
        resolvedAddress = rev.displayName;
        setInputAddress(resolvedAddress);
      }
      setStatusMsg('Punto fijado en el mapa');
      setTimeout(() => setStatusMsg(null), 3000);
    }

    onChange?.({ address: resolvedAddress, lat, lng });
  };

  // Draggable marker handlers
  const markerEventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          handleLocationUpdate({ lat: latLng.lat, lng: latLng.lng }, true);
        }
      },
    }),
    [inputAddress]
  );

  // Get current browser GPS location
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización');
      return;
    }
    setIsLocatingGPS(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await handleLocationUpdate({ lat: latitude, lng: longitude }, true);
        setIsLocatingGPS(false);
      },
      (err) => {
        console.error(err);
        alert('No se pudo obtener tu ubicación actual. Revisa los permisos de tu navegador.');
        setIsLocatingGPS(false);
      },
      { enableHighAccuracy: true }
    );
  };

  return (
    <div className="space-y-4" ref={containerRef}>
      {/* Address Search Input with Autocomplete */}
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-gray-700">
            Dirección del Local
          </label>
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocatingGPS}
            className="text-xs font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
          >
            {isLocatingGPS ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Navigation className="w-3.5 h-3.5 text-blue-600" />
            )}
            Usar mi ubicación actual
          </button>
        </div>

        <div className="form-field flex items-center px-4 bg-white border border-gray-300 rounded-xl focus-within:ring-2 focus-within:ring-black focus-within:border-black transition-all">
          <Search className="w-5 h-5 text-gray-400 shrink-0 mr-2" />
          <input
            type="text"
            value={inputAddress}
            onChange={handleInputChange}
            onFocus={() => {
              if (suggestions.length > 0) setShowSuggestions(true);
            }}
            placeholder="Escribe la dirección de tu negocio (ej: Av. Providencia 1234, Santiago)..."
            className="flex-1 h-12 bg-transparent outline-none text-[15px] text-gray-800 placeholder-gray-400"
          />
          {isSearching && <Loader2 className="w-5 h-5 animate-spin text-gray-400 shrink-0 ml-2" />}
        </div>

        {/* Autocomplete Suggestions Dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-2xl shadow-xl z-[2000] overflow-hidden max-h-64 overflow-y-auto divide-y divide-gray-100">
            {suggestions.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className="w-full px-4 py-3 text-left hover:bg-blue-50/70 transition-colors flex items-start gap-3 group cursor-pointer"
              >
                <MapPin className="w-4 h-4 text-gray-400 group-hover:text-blue-600 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-800 group-hover:text-blue-900 leading-snug font-medium">
                  {item.displayName}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Map display & interactive pin */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500 px-1">
          <span className="flex items-center gap-1.5 text-gray-700 font-bold">
            <MapPin className="w-4 h-4 text-emerald-600" />
            Punto exacto en el mapa (arrastra el pin o haz clic para ajustar)
          </span>
          {lat && lng ? (
            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-mono text-[11px] border border-emerald-200">
              Lat: {Number(lat).toFixed(5)}, Lng: {Number(lng).toFixed(5)}
            </span>
          ) : (
            <span className="text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-[11px] border border-amber-200 font-bold">
              Falta fijar punto
            </span>
          )}
        </div>

        <div className="relative w-full h-[320px] rounded-2xl overflow-hidden border-2 border-gray-200 shadow-sm z-10">
          <MapContainer
            center={mapCenter}
            zoom={17}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapController
              center={mapCenter}
              onLocationSelect={(coords) => handleLocationUpdate(coords, true)}
            />
            <Marker
              position={[selectedCoords.lat, selectedCoords.lng]}
              draggable={true}
              eventHandlers={markerEventHandlers}
              ref={markerRef}
            >
              <Popup>
                <div className="text-xs p-1 font-bold">
                  {inputAddress || 'Ubicación de tu local'}
                </div>
              </Popup>
            </Marker>
          </MapContainer>
        </div>

        {statusMsg && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl">
            <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StoreLocationPicker;
