'use client';

import { useEffect, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

interface MapCoordinatePickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (latitude: number, longitude: number) => void;
  isPinLocked?: boolean;
}

const DEFAULT_CENTER: [number, number] = [13.7563, 100.5018];
const DEFAULT_ZOOM = 6;
const PIN_ZOOM = 17;

export default function MapCoordinatePicker({
  latitude,
  longitude,
  onChange,
  isPinLocked = false,
}: MapCoordinatePickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    let isDisposed = false;

    const setupMap = async () => {
      const L = await import('leaflet');

      if (isDisposed || !containerRef.current) {
        return;
      }

      // Use CDN marker icons so the pin is visible in Next.js production builds.
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      const hasInitialPin = latitude !== null && longitude !== null;
      const center: [number, number] = hasInitialPin
        ? [latitude as number, longitude as number]
        : DEFAULT_CENTER;

      const map = L.map(containerRef.current, {
        center,
        zoom: hasInitialPin ? PIN_ZOOM : DEFAULT_ZOOM,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      if (hasInitialPin) {
        const marker = L.marker(center, { draggable: !isPinLocked }).addTo(map);
        marker.on('dragend', () => {
          if (isPinLocked) {
            return;
          }
          const nextPosition = marker.getLatLng();
          onChange(
            Number(nextPosition.lat.toFixed(7)),
            Number(nextPosition.lng.toFixed(7))
          );
        });
        markerRef.current = marker;
      }

      map.on('click', (event: any) => {
        if (isPinLocked) {
          return;
        }
        const nextLat = Number(event.latlng.lat.toFixed(7));
        const nextLng = Number(event.latlng.lng.toFixed(7));
        onChange(nextLat, nextLng);
      });

      mapRef.current = map;
    };

    void setupMap();

    return () => {
      isDisposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      markerRef.current = null;
    };
  }, [latitude, longitude, onChange, isPinLocked]);

  useEffect(() => {
    if (!mapRef.current || latitude === null || longitude === null) {
      return;
    }

    import('leaflet')
      .then((L) => {
        const position: [number, number] = [latitude, longitude];

        if (!markerRef.current) {
          const marker = L.marker(position, { draggable: !isPinLocked }).addTo(mapRef.current);
          marker.on('dragend', () => {
            if (isPinLocked) {
              return;
            }
            const nextPosition = marker.getLatLng();
            onChange(
              Number(nextPosition.lat.toFixed(7)),
              Number(nextPosition.lng.toFixed(7))
            );
          });
          markerRef.current = marker;
        } else {
          markerRef.current.setLatLng(position);
          if (markerRef.current.dragging) {
            if (isPinLocked) {
              markerRef.current.dragging.disable();
            } else {
              markerRef.current.dragging.enable();
            }
          }
        }

        mapRef.current.setView(position, PIN_ZOOM);
      })
      .catch((error) => {
        console.error('Unable to load map picker:', error);
      });
  }, [latitude, longitude, onChange, isPinLocked]);

  return (
    <div className="relative z-0 overflow-hidden rounded-xl border border-gray-200">
      <div ref={containerRef} className="h-[320px] w-full bg-slate-100" />
    </div>
  );
}
