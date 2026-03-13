'use client';

import { useEffect, useRef, useState } from 'react';

interface MapCoordinatePickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  isPinLocked?: boolean;
  showZoomControls?: boolean;
}

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 6;
const PIN_ZOOM = 17;
const GOOGLE_MAPS_SCRIPT_ID = 'parkd-google-maps-script';

declare global {
  interface Window {
    google?: any;
    __parkdGoogleMapsPromise?: Promise<void>;
  }
}

function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps can only load in browser'));
  }

  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (window.__parkdGoogleMapsPromise) {
    return window.__parkdGoogleMapsPromise;
  }

  window.__parkdGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Unable to load Google Maps script')), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Google Maps script'));
    document.head.appendChild(script);
  });

  return window.__parkdGoogleMapsPromise;
}

export default function MapCoordinatePicker({
  latitude,
  longitude,
  onChange,
  isPinLocked = false,
  showZoomControls = false,
}: MapCoordinatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  const pinLockedRef = useRef(isPinLocked);
  const [isMapReady, setIsMapReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    pinLockedRef.current = isPinLocked;

    if (markerRef.current) {
      markerRef.current.setDraggable(!isPinLocked);
    }
  }, [isPinLocked]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || '';
    if (!apiKey) {
      setLoadError('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }

    let isDisposed = false;

    const setupMap = async () => {
      try {
        await loadGoogleMapsApi(apiKey);
      } catch (error) {
        console.error('Unable to load Google Maps API:', error);
        setLoadError('Unable to load Google Maps right now.');
        return;
      }

      if (isDisposed || !containerRef.current || !window.google?.maps) {
        return;
      }

      const map = new window.google.maps.Map(containerRef.current, {
        center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
        zoom: DEFAULT_ZOOM,
        mapTypeControl: false,
        zoomControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      map.addListener('click', (event: any) => {
        if (pinLockedRef.current) {
          return;
        }

        const nextLat = Number(event.latLng?.lat().toFixed(7));
        const nextLng = Number(event.latLng?.lng().toFixed(7));
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
          return;
        }

        onChangeRef.current(nextLat, nextLng);
      });

      mapRef.current = map;
      setIsMapReady(true);
      setLoadError('');
    };

    void setupMap();

    return () => {
      isDisposed = true;
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isMapReady || !mapRef.current || !window.google?.maps) {
      return;
    }

    if (latitude === null || longitude === null) {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current.setCenter({ lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] });
      mapRef.current.setZoom(DEFAULT_ZOOM);
      return;
    }

    const position = { lat: latitude, lng: longitude };

    if (!markerRef.current) {
      const marker = new window.google.maps.Marker({
        map: mapRef.current,
        position,
        draggable: !pinLockedRef.current,
      });

      marker.addListener('dragend', (event: any) => {
        if (pinLockedRef.current) {
          return;
        }

        const nextLat = Number(event.latLng?.lat().toFixed(7));
        const nextLng = Number(event.latLng?.lng().toFixed(7));
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
          return;
        }

        onChangeRef.current(nextLat, nextLng);
      });

      markerRef.current = marker;
    } else {
      markerRef.current.setPosition(position);
      markerRef.current.setDraggable(!pinLockedRef.current);
    }

    mapRef.current.setCenter(position);
    mapRef.current.setZoom(PIN_ZOOM);
  }, [latitude, longitude, isPinLocked, isMapReady]);

  const changeZoom = (delta: number) => {
    if (!mapRef.current) {
      return;
    }

    const currentZoomRaw = Number(mapRef.current.getZoom?.());
    const currentZoom = Number.isFinite(currentZoomRaw) ? currentZoomRaw : DEFAULT_ZOOM;
    const nextZoom = Math.max(1, Math.min(21, currentZoom + delta));
    mapRef.current.setZoom(nextZoom);
  };

  return (
    <div className="relative z-0 overflow-hidden rounded-xl border border-gray-200">
      <div ref={containerRef} className="h-[320px] w-full bg-slate-100" />
      {showZoomControls && !loadError ? (
        <div className="absolute left-3 top-3 z-10 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => changeZoom(1)}
            className="flex h-9 w-9 items-center justify-center border-b border-slate-200 text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => changeZoom(-1)}
            className="flex h-9 w-9 items-center justify-center text-lg font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            aria-label="Zoom out"
          >
            -
          </button>
        </div>
      ) : null}
      {loadError ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 px-4 text-center text-sm text-rose-700">
          {loadError}
        </div>
      ) : null}
    </div>
  );
}
