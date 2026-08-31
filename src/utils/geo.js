// Calcula la distancia en kilómetros entre dos coordenadas usando la fórmula de Haversine
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radio de la tierra en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; // Distancia en km
};

// Obtiene lat/lng de una dirección usando OpenStreetMap Nominatim (gratuito)
export const geocodeAddress = async (address) => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}`);
    const data = await response.json();
    if (data && data.length > 0) {
      const r = data[0];
      return {
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        displayName: r.display_name,
        address: r.address || {},
      };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
};

// Obtiene sugerencias de autocompletado para una búsqueda de dirección
export const searchAddressSuggestions = async (query) => {
  if (!query || query.trim().length < 3) return [];
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    return (data || []).map(r => ({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      displayName: r.display_name,
      address: r.address || {},
    }));
  } catch (error) {
    console.error('Address search error:', error);
    return [];
  }
};

// Obtiene la dirección legible a partir de latitud y longitud (Reverse Geocoding)
export const reverseGeocode = async (lat, lng) => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`);
    const data = await response.json();
    if (data && data.display_name) {
      return {
        displayName: data.display_name,
        address: data.address || {},
      };
    }
    return null;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return null;
  }
};


// Verifica si un punto (lat, lng) está dentro de un polígono usando Ray-Casting
export const isPointInPolygon = (point, vs) => {
  // point: {lat, lng}
  // vs: array de {lat, lng}
  const x = point.lng, y = point.lat;
  
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].lng, yi = vs[i].lat;
    const xj = vs[j].lng, yj = vs[j].lat;
    
    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
};

// Encuentra la zona de entrega que corresponde a una ubicación dada
export const findDeliveryZoneForLocation = (point, storePoint, zones = []) => {
  if (!point || point.lat === undefined || point.lng === undefined) return null;

  const activeZones = (zones || []).filter(z => z.is_active !== false);

  if (activeZones.length > 0) {
    // 1. Priorizar zonas de polígono
    for (const zone of activeZones) {
      if (zone.type === 'polygon' && zone.polygon?.length >= 3) {
        if (isPointInPolygon(point, zone.polygon)) {
          return zone;
        }
      }
    }

    // 2. Verificar zonas por radio
    if (storePoint && storePoint.lat && storePoint.lng) {
      const dist = calculateDistance(storePoint.lat, storePoint.lng, point.lat, point.lng);
      for (const zone of activeZones) {
        if (zone.type === 'radius' && zone.radius_km > 0) {
          if (dist <= zone.radius_km) {
            return zone;
          }
        }
      }
    }
  }

  return null;
};

