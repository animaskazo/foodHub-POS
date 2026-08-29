import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';

const AddressAutocomplete = ({ value, onChange, onSelectAddress, onBlur, error, required }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Sync external value
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Debounced search
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (!query || query.length < 3 || !isOpen) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      try {
        // Bias the search to Chile and limit results
        const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&bbox=-75.64,-55.97,-66.93,-17.58`);
        const data = await res.json();
        if (data && data.features) {
          const results = data.features.map(f => {
            const props = f.properties;
            const street = props.street || props.name || '';
            
            // Extract number from user query if OSM doesn't have it
            let userNumber = '';
            const match = query.match(/\b\d+\b/);
            if (!props.housenumber && match) {
              userNumber = match[0];
            }
            const finalHouseNumber = props.housenumber || userNumber;
            const housenumberStr = finalHouseNumber ? ` ${finalHouseNumber}` : '';
            
            const city = props.city || props.town || props.village || props.county || '';
            
            // Format a nice display name
            const parts = [];
            if (street) parts.push(street + housenumberStr);
            if (city && city !== street) parts.push(city);
            if (props.state && props.state !== city) parts.push(props.state);
            
            return {
              display: parts.join(', '),
              lat: f.geometry.coordinates[1],
              lng: f.geometry.coordinates[0],
              addressData: {
                street: street,
                housenumber: finalHouseNumber,
                city: city,
                state: props.state || '',
                postcode: props.postcode || ''
              }
            };
          }).filter(r => r.display.length > 0);
          
          setSuggestions(results);
        }
      } catch (err) {
        console.error('Photon search error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(searchTimeout);
  }, [query, isOpen]);

  const handleSelect = (sugg) => {
    setQuery(sugg.display);
    setIsOpen(false);
    onChange(sugg.display);
    onSelectAddress(sugg);
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <label className="block text-xs font-bold text-gray-500 mb-1.5 uppercase tracking-wide">
        Dirección de entrega {required && '*'}
      </label>
      
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
          <MapPin className="h-5 w-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={onBlur}
          placeholder="Ej: Av Providencia 1234"
          className={`w-full pl-11 pr-10 py-3.5 bg-gray-50 border rounded-xl text-[15px] font-medium text-gray-900 focus:outline-none focus:ring-2 transition-all ${
            error 
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400 focus:bg-white' 
              : 'border-gray-200 focus:ring-gray-200 focus:border-gray-400 focus:bg-white'
          }`}
        />
        
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none">
          {isLoading ? (
            <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
          ) : (
            <Search className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
          <ul className="py-2">
            {suggestions.map((sugg, i) => (
              <li 
                key={i}
                onClick={() => handleSelect(sugg)}
                className="px-4 py-3 hover:bg-gray-50 cursor-pointer flex items-start gap-3 transition-colors border-b border-gray-50 last:border-0"
              >
                <MapPin className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[14px] font-semibold text-gray-900 leading-tight">
                    {sugg.addressData.street} {sugg.addressData.housenumber}
                  </span>
                  <span className="text-[12px] font-medium text-gray-500 mt-0.5">
                    {sugg.addressData.city}{sugg.addressData.state ? `, ${sugg.addressData.state}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
