import { DisabledGeocodingAdapter } from './disabled-geocoding.adapter.js';
import { FallbackGeocodingAdapter } from './fallback-geocoding.adapter.js';
import { GeocodingPort } from './geocoding.port.js';
import { GoogleGeocodingAdapter } from './google-geocoding.adapter.js';
import { HttpGeocodingAdapter } from './http-geocoding.adapter.js';
import { OsmGeocodingAdapter } from './osm-geocoding.adapter.js';

export function createGeocodingAdapter(): GeocodingPort {
  const osm = process.env.OSM_NOMINATIM_ENABLED !== 'false' ? new OsmGeocodingAdapter() : null;
  const google = process.env.GOOGLE_GEOCODING_API_KEY?.trim()
    ? new GoogleGeocodingAdapter()
    : process.env.GEOCODING_BASE_URL
      ? new HttpGeocodingAdapter()
      : null;

  if (!google) return osm ?? new DisabledGeocodingAdapter();
  return osm ? new FallbackGeocodingAdapter(google, osm) : google;
}

/**
 * Coordinate audits must not consume the Google Geocoding quota.
 * Keep this provider separate from the general verification geocoder.
 */
export function createCoordinateAuditGeocodingAdapter(): GeocodingPort {
  return new OsmGeocodingAdapter();
}
