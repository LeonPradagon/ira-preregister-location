import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { ExternalLink, Home, Navigation, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { Coordinate } from '../../types';
import { buildGoogleMapsDeepLink } from '../../lib/validationEngine';

interface VerificationMapProps {
  referenceLocation?: Coordinate | null;
  referenceLabel?: string;
  referencePrecision?: string;
  capturedLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt?: string;
  } | null;
  capturedLabel?: string;
  homeRadiusMeters?: number;
  distanceMeters?: number | null;
  isMatch?: boolean;
  heightClass?: string;
}

export const VerificationMap: React.FC<VerificationMapProps> = ({
  referenceLocation,
  referenceLabel = 'Alamat Master / Referensi Rumah',
  referencePrecision = 'ROOFTOP',
  capturedLocation,
  capturedLabel = 'Titik GPS Customer',
  homeRadiusMeters = 50,
  distanceMeters,
  isMatch = true,
  heightClass = 'h-[360px] md:h-[420px]',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Center point prioritization
    const initialCenter: [number, number] = capturedLocation
      ? [capturedLocation.latitude, capturedLocation.longitude]
      : referenceLocation
        ? [referenceLocation.latitude, referenceLocation.longitude]
        : [-6.2088, 106.8456]; // Jakarta default

    // Clean up previous instance if any
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 18,
      zoomControl: false,
    });

    mapInstanceRef.current = map;

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 20,
    }).addTo(map);

    // Custom Marker Icons
    const createCustomIcon = (type: 'reference' | 'captured', isSuccess: boolean) => {
      const bgColor =
        type === 'reference'
          ? 'bg-gray-900 border-white text-white'
          : isSuccess
            ? 'bg-emerald-600 border-white text-white'
            : 'bg-rose-600 border-white text-white';

      const labelLetter = type === 'reference' ? 'A' : 'B';
      const labelTitle = type === 'reference' ? 'Ref' : 'GPS';

      const html = `
        <div class="relative flex items-center justify-center">
          <div class="w-8 h-8 rounded-full border-2 shadow-md flex items-center justify-center font-bold text-xs ${bgColor}">
            ${labelLetter}
          </div>
          <div class="absolute -bottom-5 whitespace-nowrap bg-gray-900 text-white text-[10px] font-medium px-1.5 py-0.5 rounded shadow-sm">
            ${labelTitle}
          </div>
        </div>
      `;

      return L.divIcon({
        className: 'custom-map-marker',
        html,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
    };

    const markersGroup = L.featureGroup();

    // 1. Reference Location Marker & Home Radius Circle
    if (referenceLocation) {
      const refCoord: [number, number] = [
        referenceLocation.latitude,
        referenceLocation.longitude,
      ];

      // Home Radius Circle (e.g. 50m)
      L.circle(refCoord, {
        radius: homeRadiusMeters,
        color: '#6366f1',
        fillColor: '#818cf8',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4, 4',
      })
        .bindTooltip(`Batas Toleransi Radius Rumah (${homeRadiusMeters}m)`, {
          permanent: false,
          direction: 'top',
        })
        .addTo(map);

      const refMarker = L.marker(refCoord, {
        icon: createCustomIcon('reference', true),
      }).bindPopup(`
        <div class="p-1 font-sans">
          <div class="text-xs font-bold text-indigo-700 flex items-center gap-1 mb-1">
            <span>Titik A: Referensi Rumah (${referencePrecision})</span>
          </div>
          <div class="text-[11px] text-slate-700 leading-snug">${referenceLabel}</div>
          <div class="text-[10px] font-mono text-slate-500 mt-1">${referenceLocation.latitude.toFixed(6)}, ${referenceLocation.longitude.toFixed(6)}</div>
        </div>
      `);

      markersGroup.addLayer(refMarker);
    }

    // 2. Captured GPS Marker & Device Accuracy Circle
    if (capturedLocation) {
      const capCoord: [number, number] = [
        capturedLocation.latitude,
        capturedLocation.longitude,
      ];

      // Accuracy circle
      L.circle(capCoord, {
        radius: capturedLocation.accuracyMeters,
        color: isMatch ? '#10b981' : '#f43f5e',
        fillColor: isMatch ? '#34d399' : '#fb7185',
        fillOpacity: 0.15,
        weight: 1.5,
      })
        .bindTooltip(`Akurasi GPS (±${capturedLocation.accuracyMeters}m)`, {
          permanent: false,
          direction: 'bottom',
        })
        .addTo(map);

      const capMarker = L.marker(capCoord, {
        icon: createCustomIcon('captured', isMatch),
      }).bindPopup(`
        <div class="p-1 font-sans">
          <div class="text-xs font-bold ${isMatch ? 'text-emerald-700' : 'text-rose-700'} flex items-center gap-1 mb-1">
            <span>Titik B: GPS Capture Customer</span>
          </div>
          <div class="text-[11px] text-slate-700 leading-snug">${capturedLabel}</div>
          <div class="text-[10px] font-mono text-slate-500 mt-1">${capturedLocation.latitude.toFixed(6)}, ${capturedLocation.longitude.toFixed(6)}</div>
          <div class="text-[10px] text-slate-600 mt-0.5">Akurasi Perangkat: ±${capturedLocation.accuracyMeters} meter</div>
        </div>
      `);

      markersGroup.addLayer(capMarker);
    }

    // 3. Distance Polyline between Reference & Captured
    if (referenceLocation && capturedLocation) {
      const points: [number, number][] = [
        [referenceLocation.latitude, referenceLocation.longitude],
        [capturedLocation.latitude, capturedLocation.longitude],
      ];

      const polyline = L.polyline(points, {
        color: isMatch ? '#059669' : '#dc2626',
        weight: 2.5,
        dashArray: '6, 6',
      }).addTo(map);

      const midLat = (referenceLocation.latitude + capturedLocation.latitude) / 2;
      const midLng = (referenceLocation.longitude + capturedLocation.longitude) / 2;

      const distText =
        distanceMeters != null
          ? `${distanceMeters.toFixed(1)} m`
          : 'Jarak Antar Titik';

      L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'distance-tag',
          html: `<div class="bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-md border border-slate-700 whitespace-nowrap transform -translate-x-1/2 -translate-y-1/2">${distText}</div>`,
        }),
      }).addTo(map);

      markersGroup.addLayer(polyline);
    }

    markersGroup.addTo(map);

    // Fit bounds if multiple points exist
    if (referenceLocation && capturedLocation) {
      map.fitBounds(markersGroup.getBounds(), {
        padding: [45, 45],
        maxZoom: 19,
      });
    }

    // Leaflet map needs a resize trigger after mount
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [referenceLocation, capturedLocation, homeRadiusMeters, distanceMeters, isMatch]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleFitBounds = () => {
    if (!mapInstanceRef.current) return;
    if (referenceLocation && capturedLocation) {
      const bounds = L.latLngBounds([
        [referenceLocation.latitude, referenceLocation.longitude],
        [capturedLocation.latitude, capturedLocation.longitude],
      ]);
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    } else if (capturedLocation) {
      mapInstanceRef.current.setView(
        [capturedLocation.latitude, capturedLocation.longitude],
        18
      );
    } else if (referenceLocation) {
      mapInstanceRef.current.setView(
        [referenceLocation.latitude, referenceLocation.longitude],
        18
      );
    }
  };

  const gmapsUrl = capturedLocation
    ? buildGoogleMapsDeepLink(capturedLocation.latitude, capturedLocation.longitude)
    : referenceLocation
      ? buildGoogleMapsDeepLink(referenceLocation.latitude, referenceLocation.longitude)
      : '#';

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-gray-200 dark:border-gray-800 shadow-xs bg-gray-100 dark:bg-gray-800">
      {/* Map Container */}
      <div ref={mapContainerRef} className={`w-full ${heightClass} z-0`} />

      {/* Floating Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs p-1 rounded-lg border border-gray-200 dark:border-gray-800 shadow-xs">
        <button
          type="button"
          onClick={handleZoomIn}
          className="p-1.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="p-1.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={handleFitBounds}
          className="p-1.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
          title="Tampilkan Semua Titik"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* Map Legend Overlay */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 shadow-xs text-xs space-y-1.5 max-w-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-gray-900 dark:bg-gray-100 flex-shrink-0" />
          <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
            Marker A: Master Home ({referencePrecision})
          </span>
        </div>
        {capturedLocation && (
          <div className="flex items-center gap-2">
            <span
              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                isMatch ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            />
            <span className="font-medium text-gray-800 dark:text-gray-200 truncate">
              Marker B: GPS Capture (±{capturedLocation.accuracyMeters}m)
            </span>
          </div>
        )}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400">
          <span className="w-2.5 h-2.5 border border-gray-400 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 rounded-full" />
          <span>Toleransi Rumah: &le; {homeRadiusMeters}m</span>
        </div>
      </div>

      {/* External Map Action */}
      {capturedLocation && (
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white text-xs font-medium px-3 py-2 rounded-lg shadow-xs transition-colors"
        >
          <span>Open in Google Maps</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
};
