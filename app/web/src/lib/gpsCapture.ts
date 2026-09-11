const GPS_SAMPLE_TARGET = 3;
const GPS_CAPTURE_TIMEOUT_MS = 30_000;
const GPS_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: GPS_CAPTURE_TIMEOUT_MS, maximumAge: 0 };

export function collectGpsSamples(
  geolocation: Geolocation,
): Promise<Array<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }>> {
  return new Promise((resolve, reject) => {
    const samples: Array<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }> = [];
    let watchId: number | null = null;
    let timeoutId: number | null = null;
    let lastAcceptedAt = 0;
    const finish = (error?: Error) => {
      if (watchId !== null) geolocation.clearWatch(watchId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (error) reject(error);
      else resolve(samples);
    };
    const onSuccess = (position: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastAcceptedAt < 1000) return;
      lastAcceptedAt = now;
      samples.push({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        capturedAt: new Date().toISOString(),
      });
      if (samples.length >= GPS_SAMPLE_TARGET) finish();
    };
    const onError = (cause: GeolocationPositionError) => {
      if (cause.code === 1 || samples.length < 3) {
        const error = Object.assign(new Error(cause.message || 'GPS tidak tersedia.'), { code: cause.code });
        finish(error);
      } else {
        finish();
      }
    };
    watchId = geolocation.watchPosition(onSuccess, onError, GPS_WATCH_OPTIONS);
    timeoutId = window.setTimeout(() => {
      if (samples.length >= 3) finish();
      else finish(Object.assign(new Error('GPS belum mendapatkan minimal 3 titik lokasi.'), { code: 3 }));
    }, GPS_CAPTURE_TIMEOUT_MS);
  });
}
