import { afterEach, describe, expect, it } from 'vitest';
import {
  createCoordinateAuditGeocodingAdapter,
  createGeocodingAdapter,
} from '../../../src/integrations/geocoding/geocoding.adapter.factory.js';
import { FallbackGeocodingAdapter } from '../../../src/integrations/geocoding/fallback-geocoding.adapter.js';
import { OsmGeocodingAdapter } from '../../../src/integrations/geocoding/osm-geocoding.adapter.js';

afterEach(() => {
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  delete process.env.OSM_NOMINATIM_ENABLED;
});

describe('geocoding adapter factories', () => {
  it('keeps the general geocoder available for customer verification', () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.OSM_NOMINATIM_ENABLED = 'true';

    expect(createGeocodingAdapter()).toBeInstanceOf(FallbackGeocodingAdapter);
  });

  it('uses OSM only for coordinate audits even when Google is configured', () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.OSM_NOMINATIM_ENABLED = 'false';

    expect(createCoordinateAuditGeocodingAdapter()).toBeInstanceOf(OsmGeocodingAdapter);
  });
});
