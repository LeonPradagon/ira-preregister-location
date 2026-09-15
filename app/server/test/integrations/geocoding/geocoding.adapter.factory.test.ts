import { afterEach, describe, expect, it } from 'vitest';
import {
  createCoordinateAuditGeocodingAdapter,
  createGeocodingAdapter,
} from '../../../src/integrations/geocoding/geocoding.adapter.factory.js';
import { FallbackGeocodingAdapter } from '../../../src/integrations/geocoding/fallback-geocoding.adapter.js';
import { OsmGeocodingAdapter } from '../../../src/integrations/geocoding/osm-geocoding.adapter.js';
import { GoogleGeocodingAdapter } from '../../../src/integrations/geocoding/google-geocoding.adapter.js';

afterEach(() => {
  delete process.env.GOOGLE_GEOCODING_API_KEY;
  delete process.env.OSM_NOMINATIM_ENABLED;
  delete process.env.GEOCODING_PRIMARY;
});

describe('geocoding adapter factories', () => {
  it('keeps the general geocoder available for customer verification', () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.OSM_NOMINATIM_ENABLED = 'true';

    const adapter = createGeocodingAdapter();
    expect(adapter).toBeInstanceOf(FallbackGeocodingAdapter);
    expect((adapter as unknown as { primary: unknown }).primary).toBeInstanceOf(OsmGeocodingAdapter);
    expect((adapter as unknown as { fallback: unknown }).fallback).toBeInstanceOf(GoogleGeocodingAdapter);
  });

  it('allows Google to be selected as the primary provider explicitly', () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.OSM_NOMINATIM_ENABLED = 'true';
    process.env.GEOCODING_PRIMARY = 'GOOGLE';

    const adapter = createGeocodingAdapter();
    expect(adapter).toBeInstanceOf(FallbackGeocodingAdapter);
    expect((adapter as unknown as { primary: unknown }).primary).toBeInstanceOf(GoogleGeocodingAdapter);
    expect((adapter as unknown as { fallback: unknown }).fallback).toBeInstanceOf(OsmGeocodingAdapter);
  });

  it('uses OSM only for coordinate audits even when Google is configured', () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key';
    process.env.OSM_NOMINATIM_ENABLED = 'false';

    expect(createCoordinateAuditGeocodingAdapter()).toBeInstanceOf(OsmGeocodingAdapter);
  });
});
