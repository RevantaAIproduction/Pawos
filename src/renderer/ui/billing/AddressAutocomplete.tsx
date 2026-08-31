import React, { useState, useRef, useEffect } from 'react';
import { useIpcBridge } from '../../services/ipc/useIpcBridge';

type AddressResult = {
  address1: string;
  address2: string;
  city: string;
  state: string;
  postalCode: string;
};

type Props = {
  onAddressSelect: (address: AddressResult) => void;
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
};

export function AddressAutocomplete({ onAddressSelect, placeholder = 'Enter address', value = '', onChange }: Props) {
  const ipc = useIpcBridge();
  const [input, setInput] = useState(value);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scriptLoaded = useRef(false);
  const [googlePlacesAvailable, setGooglePlacesAvailable] = useState(false);

  useEffect(() => {
    // Load Google Places API
    if (!window.google) {
      (async () => {
        const apiKey = await ipc.billingGetGooglePlacesApiKey();
        if (!apiKey) {
          // Gracefully degrade if no API key - allow manual entry
          setGooglePlacesAvailable(false);
          return;
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
          scriptLoaded.current = true;
          setGooglePlacesAvailable(true);
        };
        script.onerror = () => {
          setGooglePlacesAvailable(false);
        };
        document.head.appendChild(script);
      })();
    } else {
      scriptLoaded.current = true;
      setGooglePlacesAvailable(true);
    }
  }, [ipc]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInput(value);
    onChange?.(value);

    if (!value.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Only use Google Places if available
    if (googlePlacesAvailable && window.google && scriptLoaded.current) {
      const service = new window.google.maps.places.AutocompleteService();
      service.getPlacePredictions(
        { input: value, componentRestrictions: { country: ['in'] } },
        (predictions: any, status: any) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
            setSuggestions(predictions);
            setShowSuggestions(true);
          }
        }
      );
    }
  };

  const handleSelectSuggestion = (placeId: string, description: string) => {
    setInput(description);
    setShowSuggestions(false);

    if (window.google && scriptLoaded.current) {
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div')
      );
      service.getDetails(
        { placeId, fields: ['formatted_address', 'address_components'] },
        (place: any, status: any) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && place?.address_components) {
            // Parse address components
            const components: Record<string, string> = {};
            place.address_components.forEach((component: any) => {
              const types = component.types;
              if (types.includes('street_number')) components.streetNumber = component.long_name;
              if (types.includes('route')) components.route = component.long_name;
              if (types.includes('locality')) components.city = component.long_name;
              if (types.includes('administrative_area_level_1')) components.state = component.long_name;
              if (types.includes('postal_code')) components.postalCode = component.long_name;
            });

            const address1 = [components.streetNumber, components.route]
              .filter(Boolean)
              .join(' ');

            onAddressSelect({
              address1,
              address2: '',
              city: components.city || '',
              state: components.state || '',
              postalCode: components.postalCode || '',
            });
          }
        }
      );
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={handleInputChange}
        onFocus={() => showSuggestions && setShowSuggestions(true)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
          background: 'rgba(var(--pawos-overlay-rgb), 0.03)',
          color: 'var(--pawos-fg)',
          fontSize: 13,
          boxSizing: 'border-box',
        }}
      />

      {showSuggestions && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: 'rgba(var(--pawos-base-rgb), 1)',
            border: '1px solid rgba(var(--pawos-overlay-rgb), 0.2)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 10,
            maxHeight: 300,
            overflowY: 'auto',
          }}
        >
          <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.5)', padding: '8px 12px' }}>
            Suggestions powered by Google
          </div>
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion.place_id, suggestion.description)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'transparent',
                border: 'none',
                borderTop: '1px solid rgba(var(--pawos-overlay-rgb), 0.08)',
                textAlign: 'left',
                cursor: 'pointer',
                fontSize: 11,
                color: 'rgba(var(--pawos-overlay-rgb), 0.8)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(var(--pawos-overlay-rgb), 0.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <div style={{ fontWeight: 600 }}>{suggestion.main_text}</div>
              <div style={{ fontSize: 10, color: 'rgba(var(--pawos-overlay-rgb), 0.5)', marginTop: 2 }}>
                {suggestion.secondary_text}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    google: any;
  }
}
