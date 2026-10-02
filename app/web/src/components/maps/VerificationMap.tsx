import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { Map as MapLibreMap } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import 'maplibre-gl/dist/maplibre-gl.css';
import { ExternalLink, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
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

const OPEN_FREEMAP_HOST = 'https://tiles.openfreemap.org/';
const OPEN_FREEMAP_STYLE = `${OPEN_FREEMAP_HOST}styles/liberty`;
maplibregl.setWorkerUrl(maplibreWorkerUrl);
type LngLat = [longitude: number, latitude: number];
type OverlayProperties = {
  kind: 'home-radius' | 'gps-accuracy' | 'distance-line';
  color: string;
  fillColor?: string;
  fillOpacity?: number;
  width?: number;
};

const toLngLat = (coordinate: Coordinate): LngLat => [coordinate.longitude, coordinate.latitude];

const createCircleCoordinates = (center: Coordinate, radiusMeters: number, steps = 64): LngLat[] => {
  const earthRadiusMeters = 6_371_008.8;
  const latitude = (center.latitude * Math.PI) / 180;
  const longitude = (center.longitude * Math.PI) / 180;
  const angularDistance = radiusMeters / earthRadiusMeters;

  return Array.from({ length: steps + 1 }, (_, index) => {
    const bearing = (index / steps) * Math.PI * 2;
    const destinationLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(angularDistance) +
        Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing),
    );
    const destinationLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude),
        Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(destinationLatitude),
      );
    return [(destinationLongitude * 180) / Math.PI, (destinationLatitude * 180) / Math.PI];
  });
};

const createCoordinatePopup = (
  title: string,
  titleClassName: string,
  label: string,
  coordinate: Coordinate,
  extra?: string,
) => {
  const content = document.createElement('div');
  content.className = 'p-1 font-sans';

  const heading = document.createElement('div');
  heading.className = `${titleClassName} mb-1 flex items-center gap-1 text-xs font-bold`;
  heading.textContent = title;
  content.append(heading);

  const description = document.createElement('div');
  description.className = 'text-[11px] leading-snug text-slate-700';
  description.textContent = label;
  content.append(description);

  const coordinates = document.createElement('div');
  coordinates.className = 'mt-1 font-mono text-[10px] text-slate-500';
  coordinates.textContent = `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`;
  content.append(coordinates);

  if (extra) {
    const details = document.createElement('div');
    details.className = 'mt-0.5 text-[10px] text-slate-600';
    details.textContent = extra;
    content.append(details);
  }

  return content;
};

export const VerificationMap: React.FC<VerificationMapProps> = ({
  referenceLocation,
  referenceLabel = 'Alamat Master / Referensi Rumah',
  referencePrecision = 'ROOFTOP',
  capturedLocation,
  capturedLabel = 'Titik GPS Customer',
  homeRadiusMeters = 300,
  distanceMeters,
  isMatch = true,
  heightClass = 'h-[360px] md:h-[420px]',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<MapLibreMap | null>(null);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current) return;
    setMapError(false);

    const initialCenter: LngLat = capturedLocation
      ? toLngLat(capturedLocation)
      : referenceLocation
        ? toLngLat(referenceLocation)
        : [106.8456, -6.2088];
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: OPEN_FREEMAP_STYLE,
      center: initialCenter,
      zoom: 18,
      maxZoom: 20,
      attributionControl: false,
      transformRequest: (url) => ({
        url: url.startsWith(OPEN_FREEMAP_HOST) ? url.replace(OPEN_FREEMAP_HOST, '/basemap/') : url,
      }),
    });
    mapInstanceRef.current = map;
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
      }),
      'top-left',
    );

    let disposed = false;
    const handleMapError = (event: maplibregl.ErrorEvent) => {
      console.error('Basemap resource error:', event.error);
      if (!disposed) setMapError(true);
    };
    map.on('error', handleMapError);
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainerRef.current);

    map.once('load', () => {
      if (disposed) return;

      const features: Feature<Geometry, OverlayProperties>[] = [];
      if (referenceLocation) {
        features.push({
          type: 'Feature',
          properties: { kind: 'home-radius', color: '#6366f1', fillColor: '#818cf8', fillOpacity: 0.12, width: 1.5 },
          geometry: {
            type: 'Polygon',
            coordinates: [createCircleCoordinates(referenceLocation, Math.max(homeRadiusMeters, 0))],
          },
        });
      }
      if (capturedLocation) {
        const accuracyRadius = Number.isFinite(capturedLocation.accuracyMeters)
          ? Math.max(capturedLocation.accuracyMeters, 0)
          : 0;
        features.push({
          type: 'Feature',
          properties: {
            kind: 'gps-accuracy',
            color: isMatch ? '#10b981' : '#f43f5e',
            fillColor: isMatch ? '#34d399' : '#fb7185',
            fillOpacity: 0.15,
            width: 1.5,
          },
          geometry: { type: 'Polygon', coordinates: [createCircleCoordinates(capturedLocation, accuracyRadius)] },
        });
      }
      if (referenceLocation && capturedLocation) {
        features.push({
          type: 'Feature',
          properties: { kind: 'distance-line', color: isMatch ? '#059669' : '#dc2626', width: 2.5 },
          geometry: { type: 'LineString', coordinates: [toLngLat(referenceLocation), toLngLat(capturedLocation)] },
        });
      }

      const overlays: FeatureCollection<Geometry, OverlayProperties> = { type: 'FeatureCollection', features };
      map.addSource('verification-overlays', { type: 'geojson', data: overlays });

      const addCircleLayers = (kind: 'home-radius' | 'gps-accuracy', id: string, dashed: boolean) => {
        const filter = ['==', ['get', 'kind'], kind] as maplibregl.FilterSpecification;
        map.addLayer({
          id: `${id}-fill`,
          type: 'fill',
          source: 'verification-overlays',
          filter,
          paint: { 'fill-color': ['get', 'fillColor'], 'fill-opacity': ['get', 'fillOpacity'] },
        });
        map.addLayer({
          id: `${id}-outline`,
          type: 'line',
          source: 'verification-overlays',
          filter,
          paint: {
            'line-color': ['get', 'color'],
            'line-width': ['get', 'width'],
            ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
          },
        });
      };
      addCircleLayers('home-radius', 'home-radius', true);
      addCircleLayers('gps-accuracy', 'gps-accuracy', false);
      map.addLayer({
        id: 'distance-line',
        type: 'line',
        source: 'verification-overlays',
        filter: ['==', ['get', 'kind'], 'distance-line'],
        paint: { 'line-color': ['get', 'color'], 'line-width': ['get', 'width'], 'line-dasharray': [3, 3] },
      });

      const addMarker = (
        kind: 'reference' | 'captured',
        coordinate: Coordinate,
        label: string,
        title: string,
        titleClassName: string,
        extra?: string,
      ) => {
        const markerElement = document.createElement('div');
        markerElement.setAttribute('aria-label', kind === 'reference' ? 'Titik referensi A' : 'Titik GPS B');
        markerElement.style.cssText =
          'position:relative;width:44px;height:44px;display:flex;align-items:center;justify-content:center;overflow:visible;';
        const markerColor = kind === 'reference' ? '#111827' : isMatch ? '#059669' : '#e11d48';
        const markerText = kind === 'reference' ? 'A' : 'B';
        const markerLabel = kind === 'reference' ? 'Ref' : 'GPS';
        const badge = document.createElement('div');
        badge.textContent = markerText;
        badge.style.cssText = `width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;border:2px solid #fff;border-radius:50%;background:${markerColor};color:#fff;font:700 12px/1 system-ui,sans-serif;box-shadow:0 2px 6px #0006;`;
        const labelElement = document.createElement('div');
        labelElement.textContent = markerLabel;
        labelElement.style.cssText =
          'position:absolute;top:35px;left:50%;transform:translateX(-50%);white-space:nowrap;border-radius:4px;background:#111827;padding:2px 6px;color:#fff;font:500 10px/14px system-ui,sans-serif;box-shadow:0 1px 3px #0005;';
        markerElement.append(badge, labelElement);

        const popup = new maplibregl.Popup({ offset: 18, maxWidth: '280px' }).setDOMContent(
          createCoordinatePopup(title, titleClassName, label, coordinate, extra),
        );
        new maplibregl.Marker({ element: markerElement, anchor: 'center' })
          .setLngLat(toLngLat(coordinate))
          .setPopup(popup)
          .addTo(map);
      };

      if (referenceLocation) {
        addMarker(
          'reference',
          referenceLocation,
          referenceLabel,
          `Titik A: Referensi Rumah (${referencePrecision})`,
          'text-indigo-700',
        );
      }
      if (capturedLocation) {
        addMarker(
          'captured',
          capturedLocation,
          capturedLabel,
          'Titik B: Lokasi pelanggan',
          isMatch ? 'text-emerald-700' : 'text-rose-700',
          `Akurasi Perangkat: ±${capturedLocation.accuracyMeters} meter`,
        );
      }
      if (referenceLocation && capturedLocation) {
        const distanceTag = document.createElement('div');
        distanceTag.className =
          'whitespace-nowrap rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white shadow-md';
        distanceTag.textContent = distanceMeters != null ? `${distanceMeters.toFixed(1)} m` : 'Jarak Antar Titik';
        new maplibregl.Marker({ element: distanceTag, anchor: 'center' })
          .setLngLat([
            (referenceLocation.longitude + capturedLocation.longitude) / 2,
            (referenceLocation.latitude + capturedLocation.latitude) / 2,
          ])
          .addTo(map);

        const bounds = new maplibregl.LngLatBounds()
          .extend(toLngLat(referenceLocation))
          .extend(toLngLat(capturedLocation));
        map.fitBounds(bounds, { padding: 45, maxZoom: 19 });
      }
      requestAnimationFrame(() => map.resize());
    });

    return () => {
      disposed = true;
      map.off('error', handleMapError);
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [
    referenceLocation,
    referenceLabel,
    referencePrecision,
    capturedLocation,
    capturedLabel,
    homeRadiusMeters,
    distanceMeters,
    isMatch,
  ]);

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();
  const handleFitBounds = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (referenceLocation && capturedLocation) {
      const bounds = new maplibregl.LngLatBounds()
        .extend(toLngLat(referenceLocation))
        .extend(toLngLat(capturedLocation));
      map.fitBounds(bounds, { padding: 40 });
    } else if (capturedLocation) {
      map.jumpTo({ center: toLngLat(capturedLocation), zoom: 18 });
    } else if (referenceLocation) {
      map.jumpTo({ center: toLngLat(referenceLocation), zoom: 18 });
    }
  };

  const gmapsUrl = capturedLocation
    ? buildGoogleMapsDeepLink(capturedLocation.latitude, capturedLocation.longitude)
    : referenceLocation
      ? buildGoogleMapsDeepLink(referenceLocation.latitude, referenceLocation.longitude)
      : '#';

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-xs dark:border-gray-800 dark:bg-gray-800">
      <div ref={mapContainerRef} className={`w-full ${heightClass} z-0`} />
      {mapError && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-md bg-amber-100/95 px-2 py-1 text-[11px] text-amber-900 shadow-sm dark:bg-amber-950/95 dark:text-amber-100">
          Sebagian data basemap gagal dimuat; peta tetap aktif.
        </div>
      )}

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-xs backdrop-blur-xs dark:border-gray-800 dark:bg-gray-900/95">
        <button
          type="button"
          onClick={handleZoomIn}
          className="rounded p-1.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          title="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleZoomOut}
          className="rounded p-1.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          title="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleFitBounds}
          className="rounded p-1.5 text-gray-700 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          title="Tampilkan Semua Titik"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>

      <div className="absolute bottom-3 left-3 z-10 max-w-xs space-y-1.5 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs shadow-xs backdrop-blur-xs dark:border-gray-800 dark:bg-gray-900/95">
        {referenceLocation && (
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 flex-shrink-0 rounded-full bg-gray-900 dark:bg-gray-100" />
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">
              Marker A: Master Home ({referencePrecision})
            </span>
          </div>
        )}
        {capturedLocation && (
          <div className="flex items-center gap-2">
            <span className={`h-3 w-3 flex-shrink-0 rounded-full ${isMatch ? 'bg-emerald-600' : 'bg-rose-600'}`} />
            <span className="truncate font-medium text-gray-800 dark:text-gray-200">
              Marker B: Lokasi pelanggan (±{capturedLocation.accuracyMeters}m)
            </span>
          </div>
        )}
        {referenceLocation ? (
          <div className="flex items-center gap-2 border-t border-gray-100 pt-1 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <span className="h-2.5 w-2.5 rounded-full border border-gray-400 bg-gray-100 dark:border-gray-600 dark:bg-gray-800" />
            <span>Toleransi Rumah: &le; {homeRadiusMeters}m</span>
          </div>
        ) : (
          <div className="border-t border-gray-100 pt-1 text-[11px] text-amber-600 dark:border-gray-800 dark:text-amber-400">
            Titik referensi rumah belum tersedia; jarak tidak dapat dihitung.
          </div>
        )}
      </div>

      {capturedLocation && (
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white shadow-xs transition-colors hover:bg-gray-800"
          style={{ backgroundColor: '#d71920', color: '#fff', opacity: 1 }}
        >
          <span>Open in Google Maps</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
};
