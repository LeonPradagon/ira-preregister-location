import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectGpsSamples } from '../../src/lib/gpsCapture';

describe('customer GPS capture', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as { window?: unknown }).window;
  });

  it('finishes after the three samples required by the public API', async () => {
    vi.useFakeTimers();
    const onSuccess: Array<(position: GeolocationPosition) => void> = [];
    const clearWatch = vi.fn();
    const geolocation = {
      watchPosition: vi.fn((success: PositionCallback) => {
        onSuccess.push(success);
        return 7;
      }),
      clearWatch,
    } as unknown as Geolocation;
    (globalThis as { window?: unknown }).window = {
      setTimeout,
      clearTimeout,
    };

    const samplesPromise = collectGpsSamples(geolocation);
    const position = (capturedAt: number): GeolocationPosition => ({
      coords: {
        latitude: -6.2,
        longitude: 106.8,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
        toJSON: () => ({}),
      },
      timestamp: capturedAt,
      toJSON: () => ({}),
    });
    vi.setSystemTime(1_000);
    onSuccess[0](position(1_000));
    vi.setSystemTime(2_000);
    onSuccess[0](position(2_000));
    vi.setSystemTime(3_000);
    onSuccess[0](position(3_000));

    await expect(samplesPromise).resolves.toHaveLength(3);
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
});
