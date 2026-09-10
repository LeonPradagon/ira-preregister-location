import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Compass, Edit3, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { api, ApiClientError, PublicVerificationContextApi, ServerValidationDecision } from '../../lib/apiClient';
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';
import {
  calculateGeodesicDistanceMeters,
  evaluateBestGpsSample,
  formatAddressForDisplay,
} from '../../lib/validationEngine';
import { findRegionOption, regionOptionValue } from '../../lib/regionSelection';
import {
  getMissingAddressFields,
  normalizeOptionalAddressValue,
  requiredAddressFields,
  shouldAllowAddressChange,
  shouldShowCustomerConfirmation,
  shouldShowLocationRetry,
  shouldShowReminderPending,
  shouldShowReminderPickerOnLink,
  shouldShowReminderResume,
} from '../../lib/customerVerificationFlow';
import { confirmAction } from '../../lib/swal';

interface Props {
  token: string;
  simulation?: boolean;
}
type AddressForm = Record<string, string>;
type RegionLevel = 'province' | 'city' | 'district' | 'subdistrict';
type RegionOption = { code: string; name: string; postalCode?: string | null };
const regionLevels: RegionLevel[] = ['province', 'city', 'district', 'subdistrict'];
const fields = ['street', 'province', 'city', 'district', 'subdistrict', 'houseNumber', 'postalCode', 'addressDetail'];
const optionalAddressFields = new Set(['houseNumber', 'postalCode', 'addressDetail']);
const fieldLabels: Record<string, string> = {
  province: 'Provinsi',
  city: 'Kota / Kabupaten',
  district: 'Kecamatan',
  subdistrict: 'Kelurahan / Desa',
  postalCode: 'Kode pos',
  street: 'Nama jalan / perumahan',
  houseNumber: 'Nomor rumah',
  addressDetail: 'Detail alamat & patokan (optional)',
};
const fieldPlaceholders: Record<string, string> = {
  province: 'Contoh: Jawa Barat',
  city: 'Contoh: Kota Bandung',
  district: 'Contoh: Coblong',
  subdistrict: 'Contoh: Dago',
  postalCode: 'Contoh: 40135',
  street: 'Contoh: Jalan Ir. H. Juanda atau Perumahan Griya Asri',
  houseNumber: 'Contoh: 10 atau A-12',
  addressDetail: 'Contoh: Blok A lantai 2, dekat pos satpam, sebelah minimarket',
};
const GPS_SAMPLE_TARGET = 5;
const GPS_CAPTURE_TIMEOUT_MS = 30_000;
const GPS_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: GPS_CAPTURE_TIMEOUT_MS, maximumAge: 0 };

function collectGpsSamples(
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
const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const createSimulationContext = (
  customerName: string,
  customerAddress: string,
  referenceLocation: { latitude: number; longitude: number } | null,
  referencePrecision: string,
  simulationConfig: {
    homeRadiusMeters: number;
    gpsMaxAccuracyMeters: number;
    manualReview: boolean;
    autoApprovalEnabled: boolean;
    autoApprovalScoreThreshold: number;
  },
): PublicVerificationContextApi => ({
  session: {
    id: 'simulation-session',
    status: 'CREATED',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    linkExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    customerConfirmationStatus: 'UNCONFIRMED',
    reminderCount: 0,
    attemptCount: 0,
    isReminderLink: false,
    canScheduleReminder: true,
  },
  customer: { id: 'simulation-customer', name: customerName, phoneE164: '+628111111111' },
  address: {
    id: 'simulation-address',
    addressType: 'MASTER',
    rawAddress: customerAddress,
    province: 'Jawa Barat',
    city: 'Bandung',
    district: 'Coblong',
    subdistrict: 'Dago',
    street: 'Jalan Ir H Juanda',
    houseNumber: '10',
    referencePrecision,
    referenceLocation,
    simulationConfig,
  },
});

export const BackendCustomerVerificationView: React.FC<Props> = ({ token, simulation = false }) => {
  const { t } = useTranslation();
  const simulationParams = simulation ? new URLSearchParams(window.location.search) : null;
  const simulationName = simulationParams?.get('name') || 'Budi Santoso';
  const simulationAddress = simulationParams?.get('address') || 'Jl. Contoh No. 10, Kelurahan Sukamaju, Kota Bandung';
  const simulationPostalCode = simulationParams?.get('postalCode') || '40135';
  const simulationReferenceLatitude = Number(simulationParams?.get('referenceLatitude'));
  const simulationReferenceLongitude = Number(simulationParams?.get('referenceLongitude'));
  const simulationReferenceLocation =
    Number.isFinite(simulationReferenceLatitude) && Number.isFinite(simulationReferenceLongitude)
      ? { latitude: simulationReferenceLatitude, longitude: simulationReferenceLongitude }
      : null;
  const simulationReferencePrecision = simulationParams?.get('referencePrecision') || 'UNKNOWN';
  const simulationHomeRadiusMeters = Number(simulationParams?.get('homeRadiusMeters')) || 50;
  const simulationGpsMaxAccuracyMeters = Number(simulationParams?.get('gpsMaxAccuracyMeters')) || 30;
  const simulationConfig = {
    homeRadiusMeters: simulationHomeRadiusMeters,
    gpsMaxAccuracyMeters: simulationGpsMaxAccuracyMeters,
    manualReview: simulationParams?.get('manualReview') !== 'false',
    autoApprovalEnabled: simulationParams?.get('autoApprovalEnabled') === 'true',
    autoApprovalScoreThreshold: Number(simulationParams?.get('autoApprovalScoreThreshold')) || 0.9,
  };
  const [context, setContext] = useState<PublicVerificationContextApi | null>(() =>
    simulation
      ? createSimulationContext(
          simulationName,
          simulationAddress,
          simulationReferenceLocation,
          simulationReferencePrecision,
          simulationConfig,
        )
      : null,
  );
  const [decision, setDecision] = useState<ServerValidationDecision | null>(null);
  const [addressForm, setAddressForm] = useState<AddressForm>({});
  const [editingAddress, setEditingAddress] = useState(false);
  const [showAddressChangeConfirmation, setShowAddressChangeConfirmation] = useState(false);
  const [addressSubmitting, setAddressSubmitting] = useState(false);
  const [addressFieldErrors, setAddressFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [locationBlocked, setLocationBlocked] = useState(false);
  const [postalLookupLoading, setPostalLookupLoading] = useState(false);
  const [regionOptions, setRegionOptions] = useState<Record<RegionLevel, RegionOption[]>>({
    province: [],
    city: [],
    district: [],
    subdistrict: [],
  });
  const [regionCodes, setRegionCodes] = useState<Partial<Record<RegionLevel, string>>>({});
  const [regionLoading, setRegionLoading] = useState<RegionLevel | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const regionRequestId = useRef(0);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [gpsRetryAvailable, setGpsRetryAvailable] = useState(false);
  const [reminderDateTime, setReminderDateTime] = useState(() =>
    toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false);
  const [reminderScheduledNow, setReminderScheduledNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyContext = (nextContext: PublicVerificationContextApi) => {
    setContext(nextContext);
    if (nextContext.address.requiresCorrection) {
      setEditingAddress(true);
      setShowAddressChangeConfirmation(false);
    }
  };
  const refresh = async () => {
    if (!simulation) applyContext(await api.context(token));
  };
  useEffect(() => {
    if (!navigator.permissions?.query) return undefined;
    let active = true;
    let permissionStatus: PermissionStatus | undefined;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (!active) return;
        permissionStatus = status;
        setLocationBlocked(status.state === 'denied');
        status.onchange = () => {
          if (active) setLocationBlocked(status.state === 'denied');
        };
      })
      .catch(() => undefined);
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);
  useEffect(() => {
    if (!simulation)
      void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : t('customer.invalidLink')));
  }, [simulation, token, t]);
  useEffect(() => {
    let active = true;
    void api.regions
      .provinces()
      .then((options) => {
        if (active) setRegionOptions((current) => ({ ...current, province: options }));
      })
      .catch((cause) => {
        if (active) setRegionError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
      });
    return () => {
      active = false;
    };
  }, [t]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await refresh();
      return true;
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.code === 'REMINDER_ALREADY_SELECTED') {
        setReminderScheduledNow(true);
        setReminderPickerOpen(false);
        setError(null);
        void refresh().catch(() => undefined);
        return true;
      }
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const updateSimulationSession = (changes: Partial<PublicVerificationContextApi['session']>) =>
    setContext((current) => (current ? { ...current, session: { ...current.session, ...changes } } : current));
  const resetSimulation = () => {
    setContext(
      createSimulationContext(
        simulationName,
        simulationAddress,
        simulationReferenceLocation,
        simulationReferencePrecision,
        simulationConfig,
      ),
    );
    setDecision(null);
    setAddressForm({});
    setEditingAddress(false);
    setAddressSubmitting(false);
    setAddressFieldErrors({});
    setPostalLookupLoading(false);
    setBusy(false);
    setGpsBusy(false);
    setLocationBlocked(false);
    setGpsPermissionDenied(false);
    setGpsRetryAvailable(false);
    setReminderDateTime(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    setReminderPickerOpen(false);
    setReminderScheduledNow(false);
    setError(null);
  };

  const captureGps = async () => {
    if (!navigator.geolocation) {
      setBusy(false);
      setGpsBusy(false);
      setGpsRetryAvailable(false);
      setError(t('customer.browserNoLocation'));
      return;
    }
    setGpsBusy(true);
    setBusy(true);
    setError(null);
    setGpsPermissionDenied(false);
    setGpsRetryAvailable(false);
    try {
      const samples = await collectGpsSamples(navigator.geolocation);
      setLocationBlocked(false);
      if (simulation) {
        const evaluation = evaluateBestGpsSample(samples);
        const simulationContext = context;
        if (!simulationContext) {
          setError(t('customer.requestFailed'));
          return;
        }
        const simulationConfig = simulationContext.address.simulationConfig ?? {
          homeRadiusMeters: 50,
          gpsMaxAccuracyMeters: 30,
          manualReview: true,
          autoApprovalEnabled: false,
          autoApprovalScoreThreshold: 0.9,
        };
        const referenceLocation = simulationContext.address.referenceLocation;
        const distanceFromReferenceMeters = referenceLocation
          ? calculateGeodesicDistanceMeters(evaluation.bestSample, referenceLocation)
          : null;
        const reasonCodes: string[] = [];
        const automaticApproval =
          simulationConfig.autoApprovalEnabled && 1 >= (simulationConfig.autoApprovalScoreThreshold ?? 0.9);
        let result = 'LOCATION_VALID';
        if (evaluation.bestSample.accuracyMeters > simulationConfig.gpsMaxAccuracyMeters) {
          result = 'WAITING_FOR_HOME';
          reasonCodes.push('LOW_GPS_ACCURACY', 'WAITING_FOR_HOME');
        } else if (!evaluation.isConsistent) {
          result = 'WAITING_FOR_HOME';
          reasonCodes.push('GPS_SAMPLE_INCONSISTENT', 'WAITING_FOR_HOME');
        } else if (
          distanceFromReferenceMeters != null &&
          distanceFromReferenceMeters > simulationConfig.homeRadiusMeters
        ) {
          result = 'LOCATION_MISMATCH';
          reasonCodes.push('HOME_RADIUS_EXCEEDED');
        } else if (automaticApproval) {
          if (!referenceLocation) reasonCodes.push('REFERENCE_LOCATION_MISSING');
          else if (!['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(simulationContext.address.referencePrecision))
            reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE');
          reasonCodes.push('LOCATION_VALID', 'AUTO_APPROVED');
        } else if (!referenceLocation) {
          result = 'MANUAL_REVIEW';
          reasonCodes.push('REFERENCE_LOCATION_MISSING');
        } else if (!['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(simulationContext.address.referencePrecision)) {
          result = 'MANUAL_REVIEW';
          reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE');
        } else {
          result = 'MANUAL_REVIEW';
          reasonCodes.push('AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED');
        }
        const nextAttemptCount = (simulationContext.session.attemptCount ?? 0) + 1;
        const forceReminder = nextAttemptCount >= 3 && result !== 'LOCATION_VALID';
        if (forceReminder) reasonCodes.push('GPS_ATTEMPT_LIMIT_REACHED');
        setDecision({
          id: 'simulation-result',
          result,
          reasonCodes,
          bestSample: evaluation.bestSample,
          distanceFromReferenceMeters,
          addressScore: result === 'LOCATION_VALID' || reasonCodes.includes('AUTOMATED_VALIDATION_PASSED') ? 1 : 0,
          sampleSpreadMeters: evaluation.sampleSpreadMeters,
          capturedLocation: {
            ...evaluation.bestSample,
            coordinateText: `${evaluation.bestSample.latitude.toFixed(6)}, ${evaluation.bestSample.longitude.toFixed(6)}`,
            googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${evaluation.bestSample.latitude},${evaluation.bestSample.longitude}`,
          },
        });
        updateSimulationSession({
          status: forceReminder ? 'REMINDER_REQUIRED' : result,
          attemptCount: nextAttemptCount,
        });
        return;
      }
      setDecision(await api.submitLocation(token, samples));
      await refresh();
    } catch (cause) {
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause
          ? Number((cause as { code?: unknown }).code)
          : undefined;
      if (code === 1) {
        setLocationBlocked(true);
        setGpsPermissionDenied(true);
        setGpsRetryAvailable(true);
        setError(t('customer.permissionDenied'));
      } else if (code === 2 || code === 3) {
        setLocationBlocked(true);
        setGpsRetryAvailable(true);
        setError(t('customer.gpsTimeout'));
      } else {
        setGpsRetryAvailable(true);
        const errorCode =
          typeof cause === 'object' && cause !== null && 'code' in cause
            ? String((cause as { code?: unknown }).code)
            : '';
        setGpsRetryAvailable(errorCode !== 'ATTEMPT_LIMIT_REACHED');
        setError(
          errorCode === 'ATTEMPT_LIMIT_REACHED'
            ? t('customer.gpsAttemptLimit')
            : cause instanceof Error
              ? cause.message
              : t('customer.requestFailed'),
        );
      }
    } finally {
      setGpsBusy(false);
      setBusy(false);
    }
  };

  const scheduleReminder = () => {
    const scheduledAt = new Date(reminderDateTime);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      setError(t('customer.reminderInvalid'));
      return;
    }
    const scheduled = simulation
      ? run(async () => {
          const nextReminderCount = (context?.session.reminderCount ?? 0) + 1;
          updateSimulationSession({
            status: nextReminderCount >= 3 ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME',
            reminderCount: nextReminderCount,
        });
      })
      : run(() => api.waitForHome(token, { scheduledAt: scheduledAt.toISOString() }));
    return scheduled.then((success) => {
      if (success) {
        setReminderScheduledNow(true);
        setReminderPickerOpen(false);
      }
    });
  };

  const captureAfterTransition = async (transition: () => Promise<unknown> | unknown) => {
    if (!navigator.geolocation) {
      setLocationBlocked(true);
      setError(t('customer.browserNoLocation'));
      return;
    }
    if (navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        // Permissions API can keep a stale `denied` state while the customer
        // is returning from the phone/browser settings. Do not stop here:
        // geolocation is the source of truth and may prompt again or succeed
        // after the setting has been changed.
        if (permission.state === 'denied') setLocationBlocked(true);
      } catch {
        // The geolocation request below remains the source of truth on browsers
        // that do not expose the Permissions API consistently.
      }
    }
    setBusy(true);
    setError(null);
    setGpsPermissionDenied(false);
    try {
      await transition();
      if (!simulation) await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
      setBusy(false);
      return;
    }
    await captureGps();
  };

  const startProposedAddressVerification = async () => {
    if (simulation) {
      updateSimulationSession({ status: 'GPS_CAPTURING', customerConfirmationStatus: 'CONFIRMED' });
      return;
    }
    if (!confirmed) await api.confirm(token, true);
    await api.consent(token);
  };

  const submitAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedSubdistrict = regionOptions.subdistrict.find(
      (option) => option.name.toLowerCase() === addressForm.subdistrict?.trim().toLowerCase(),
    );
    const postalCode = addressForm.postalCode?.trim() || selectedSubdistrict?.postalCode?.trim() || '';
    const missingFields = getMissingAddressFields(addressForm);
    if (missingFields.length > 0) {
      const missingFieldLabels = missingFields
        .map((field) => t(`customer.addressField${field[0].toUpperCase()}${field.slice(1)}`))
        .join(', ');
      setAddressFieldErrors(
        Object.fromEntries(missingFields.map((field) => [field, t('customer.addressFieldRequired')])),
      );
      setError(t('customer.addressFieldsMissing', { fields: missingFieldLabels }));
      return;
    }
    if (postalCode && !/^\d{5}$/.test(postalCode)) {
      setAddressFieldErrors({ postalCode: t('customer.postalCodeInvalid') });
      setError(t('customer.postalCodeInvalid'));
      return;
    }
    setAddressFieldErrors({});
    const submittedAddress: AddressForm = {
      ...addressForm,
      postalCode,
      houseNumber: normalizeOptionalAddressValue(addressForm.houseNumber),
    };
    setAddressSubmitting(true);
    setError(null);
    try {
      const confirmed = await confirmAction({
        title: t('crud.updateQuestion'),
        text: t('crud.updateText'),
        confirmButtonText: t('crud.continue'),
        cancelButtonText: t('crud.cancel'),
        onConfirm: async () => {
          if (simulation) {
            updateSimulationSession({ status: 'ADDRESS_PROPOSED' });
            setContext((current) =>
              current
                ? {
                    ...current,
                    address: {
                      ...current.address,
                      ...submittedAddress,
                      addressType: 'PROPOSED',
                      requiresCorrection: false,
                      rawAddress: [
                        submittedAddress.street,
                        `No. ${submittedAddress.houseNumber}`,
                        submittedAddress.addressDetail,
                        submittedAddress.subdistrict,
                        submittedAddress.district,
                        submittedAddress.city,
                        submittedAddress.province,
                        submittedAddress.postalCode,
                      ]
                        .filter(Boolean)
                        .join(', '),
                    },
                  }
                : current,
            );
          } else {
            await api.changeAddress(token, submittedAddress);
            await refresh();
          }
        },
      });
      if (confirmed) setEditingAddress(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally {
      setAddressSubmitting(false);
    }
  };

  const requestAddressChange = () => setShowAddressChangeConfirmation(true);

  const clearAddressFieldError = (field: string) => {
    setAddressFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setError(null);
  };

  const updateAddressField = (field: string, value: string) => {
    clearAddressFieldError(field);
    setAddressForm((current) => ({ ...current, [field]: value }));
  };
  const confirmAddressChange = async () => {
    setBusy(true);
    setError(null);
    try {
      if (simulation) {
        updateSimulationSession({ status: 'ADDRESS_EDITING' });
      } else {
        await api.addressStatus(token, false);
        await refresh();
      }
      setShowAddressChangeConfirmation(false);
      setAddressForm({});
      setEditingAddress(true);
    } catch (cause) {
      setShowAddressChangeConfirmation(false);
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally {
      setBusy(false);
    }
  };

  const lookupPostalCode = async () => {
    const requiredForLookup = ['province', 'city', 'district', 'subdistrict'];
    if (requiredForLookup.some((field) => !addressForm[field]?.trim())) {
      setError(t('customer.postalLookupRequired'));
      return;
    }
    if (simulation) {
      setPostalLookupLoading(true);
      setError(null);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setAddressForm((current) => ({ ...current, postalCode: simulationPostalCode }));
      setPostalLookupLoading(false);
      return;
    }
    setPostalLookupLoading(true);
    setError(null);
    try {
      const result = await api.lookupAddress(token, addressForm);
      if (result.postalCode) setAddressForm((current) => ({ ...current, postalCode: result.postalCode! }));
      else setError(t('customer.postalLookupEmpty'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.postalLookupFailed'));
    } finally {
      setPostalLookupLoading(false);
    }
  };

  const handleRegionChange = async (field: RegionLevel, value: string) => {
    clearAddressFieldError(field);
    const levelIndex = regionLevels.indexOf(field);
    const selected =
      findRegionOption(regionOptions[field], value) || regionOptions[field].find((option) => option.code === value);
    const selectedName = selected ? regionOptionValue(selected) : value.trim();
    const nextAddress = { ...addressForm, [field]: selectedName, postalCode: '' };
    for (const child of regionLevels.slice(levelIndex + 1)) nextAddress[child] = '';
    if (field === 'subdistrict' && selected?.postalCode) nextAddress.postalCode = selected.postalCode;
    setAddressForm(nextAddress);
    setRegionCodes((current) => {
      const next = { ...current, [field]: selected?.code };
      for (const child of regionLevels.slice(levelIndex + 1)) delete next[child];
      return next;
    });
    setRegionOptions((current) => {
      const next = { ...current };
      for (const child of regionLevels.slice(levelIndex + 1)) next[child] = [];
      return next;
    });
    const child = regionLevels[levelIndex + 1];
    if (!selected || !child) return;
    const requestId = ++regionRequestId.current;
    setRegionLoading(child);
    setRegionError(null);
    try {
      const options =
        field === 'province'
          ? await api.regions.regencies(selected.code)
          : field === 'city'
            ? await api.regions.districts(selected.code)
            : await api.regions.villages(selected.code);
      if (requestId === regionRequestId.current) setRegionOptions((current) => ({ ...current, [child]: options }));
    } catch (cause) {
      if (requestId === regionRequestId.current)
        setRegionError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally {
      if (requestId === regionRequestId.current) setRegionLoading(null);
    }
  };

  useEffect(() => {
    if (!editingAddress || postalLookupLoading || addressForm.postalCode?.trim()) return undefined;
    const requiredForLookup = ['province', 'city', 'district', 'subdistrict'];
    if (requiredForLookup.some((field) => !addressForm[field]?.trim())) return undefined;
    const timer = window.setTimeout(() => {
      void lookupPostalCode();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [
    editingAddress,
    simulation,
    addressForm.province,
    addressForm.city,
    addressForm.district,
    addressForm.subdistrict,
    addressForm.postalCode,
  ]);

  if (error && !context)
    return (
      <Panel>
        <XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" />
        <h2 className="break-words text-base font-semibold">{t('customer.invalidLink')}</h2>
        <p className="mt-2 break-words text-xs text-gray-600">{error}</p>
      </Panel>
    );
  if (!context)
    return (
      <Panel>
        <AppLoader size={72} label={t('customer.loading')} className="mx-auto" />
        <p className="mt-4 break-words text-sm font-medium text-gray-700">{t('customer.loading')}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">{t('customer.loadingHint')}</p>
      </Panel>
    );

  const status = String(context.session.status || 'LINK_OPENED')
    .trim()
    .toUpperCase();
  const confirmationStatus = String(context.session.customerConfirmationStatus || 'UNCONFIRMED')
    .trim()
    .toUpperCase();
  const confirmed = confirmationStatus === 'CONFIRMED';
  const showConfirmation = shouldShowCustomerConfirmation(
    status,
    confirmationStatus,
    context.address.addressType,
  );
  const mismatch = ['LOCATION_MISMATCH', 'LOW_GPS_ACCURACY'].includes(status);
  const reminderRequired = status === 'REMINDER_REQUIRED';
  const locationMismatchStatus = status === 'LOCATION_MISMATCH';
  const addressChangeAvailable = shouldAllowAddressChange(
    context.address.addressType,
    Boolean(context.address.requiresCorrection),
  );
  const selectedReminderWaiting = shouldShowReminderPending(
    status,
    confirmationStatus,
    context.session.reminderCount,
    context.session.isReminderLink,
    reminderScheduledNow,
    context.session.canScheduleReminder,
  );
  const reminderLinkFlow =
    !selectedReminderWaiting &&
    confirmed &&
    context.session.canScheduleReminder &&
    context.session.reminderCount > 0 &&
    ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(status);
  const gpsActionContent = (label: string, idleIcon: React.ReactNode = <Compass className="h-5 w-5" />) =>
    busy ? (
      <>
        <AppLoader size={22} label={t('customer.gpsAutomatic')} />
        <span>{t('customer.gpsAutomatic')}</span>
      </>
    ) : (
      <>
        {idleIcon}
        <span>{label}</span>
      </>
    );
  // A customer who has selected a reminder must wait for that schedule.
  // Keep the resume action reserved for a later, unique reminder link.
  const reminderResumeAvailable =
    !selectedReminderWaiting &&
    shouldShowReminderResume(
      status,
      confirmationStatus,
      context.session.reminderCount,
      context.session.isReminderLink,
      busy,
      context.session.canScheduleReminder,
    );
  const reminderPickerOnLinkAvailable = shouldShowReminderPickerOnLink(
    status,
    confirmationStatus,
    context.session.reminderCount,
    context.session.isReminderLink,
    busy,
    3,
    context.session.canScheduleReminder,
  );
  const reminderActionAvailable = context.session.canScheduleReminder && context.session.reminderCount < 3;
  const renderAddressField = (field: string) => {
    const regionLevel = regionLevels.includes(field as RegionLevel) ? (field as RegionLevel) : null;
    const parentLevel = regionLevel ? regionLevels[regionLevels.indexOf(regionLevel) - 1] : undefined;
    const isLongText = field === 'addressDetail';
    const isOptional = optionalAddressFields.has(field);
    const fieldError = addressFieldErrors[field];
    const fieldClassName = `mt-1 w-full rounded-lg border px-3 py-3 text-base placeholder:text-slate-400 disabled:bg-slate-100 sm:text-sm ${
      fieldError ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
    }`;
    const input = isLongText ? (
      <textarea
        required={false}
        rows={3}
        value={addressForm[field] || ''}
        placeholder={fieldPlaceholders[field]}
        disabled={addressSubmitting}
        maxLength={1000}
        onChange={(event) => updateAddressField(field, event.target.value)}
        aria-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? `${field}-error` : undefined}
        className={`${fieldClassName} resize-y`}
      />
    ) : (
      <input
        required={!isOptional}
        pattern={field === 'postalCode' ? '[0-9]{5}' : undefined}
        value={addressForm[field] || ''}
        placeholder={fieldPlaceholders[field]}
        list={regionLevel ? `customer-${regionLevel}-options` : undefined}
        disabled={addressSubmitting || Boolean(parentLevel && !regionCodes[parentLevel])}
        inputMode={field === 'postalCode' ? 'numeric' : undefined}
        maxLength={field === 'postalCode' ? 5 : undefined}
        onChange={(event) =>
          regionLevel
            ? void handleRegionChange(regionLevel, event.target.value)
            : updateAddressField(field, event.target.value)
        }
        aria-invalid={Boolean(fieldError)}
        aria-describedby={fieldError ? `${field}-error` : undefined}
        className={fieldClassName}
      />
    );
    const options = regionLevel ? regionOptions[regionLevel] : [];
    const selectedOption = regionLevel ? findRegionOption(options, addressForm[field] || '') : undefined;
    const regionInput = regionLevel ? (
      <>
        <select
          required
          value={selectedOption?.code || ''}
          disabled={
            addressSubmitting ||
            Boolean(parentLevel && !regionCodes[parentLevel]) ||
            regionLoading === regionLevel ||
            options.length === 0
          }
          onChange={(event) => void handleRegionChange(regionLevel, event.target.value)}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? `${field}-error` : undefined}
          className={`mt-1 w-full rounded-lg border px-3 py-3 text-base disabled:bg-slate-100 sm:text-sm ${
            fieldError ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'
          }`}
        >
          <option value="">Pilih {fieldLabels[field]}</option>
          {options.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
        {regionLoading === regionLevel && (
          <p className="mt-1 text-[11px] font-normal text-slate-500">Memuat pilihan...</p>
        )}
        {regionError && <p className="mt-1 break-words text-[11px] font-normal text-amber-600">{regionError}</p>}
      </>
    ) : (
      input
    );
    return (
      <label key={field} className="block text-xs font-medium text-slate-700">
        <span>
          {fieldLabels[field] || field}
          {isOptional ? (
            <span className="ml-1 font-normal text-slate-500">(opsional)</span>
          ) : (
            <span className="ml-1 text-rose-600">*</span>
          )}
        </span>
        {field === 'postalCode' ? (
          <>
            <div className="min-w-0">{input}</div>
            <p className="mt-1 break-words text-[11px] font-normal text-slate-500">{t('customer.postalLookupHint')}</p>
          </>
        ) : (
          regionInput
        )}
        {fieldError && (
          <p id={`${field}-error`} className="mt-1 text-[11px] font-medium text-rose-600">
            {fieldError}
          </p>
        )}
      </label>
    );
  };
  const addressEditForm = (
    <form
      noValidate
      onSubmit={(event) => void submitAddress(event)}
      className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
    >
      <div>
        <p className="text-base font-semibold">{t('customer.requestNewAddress')}</p>
        {context.address.requiresCorrection && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
            <p className="font-semibold">{t('customer.addressCorrectionRequired')}</p>
            <p className="mt-1">{t('customer.addressCorrectionHint')}</p>
          </div>
        )}
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{t('customer.addressEditFormHint')}</p>
        {requiredAddressFields.some((field) => addressFieldErrors[field]) && (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs leading-relaxed text-rose-800" role="alert">
            <p className="font-semibold">{t('customer.requiredAddressFields')}</p>
            <p className="mt-1">
              {t('customer.addressFieldsMissing', {
                fields: requiredAddressFields
                  .filter((field) => addressFieldErrors[field])
                  .map((field) => t(`customer.addressField${field[0].toUpperCase()}${field.slice(1)}`))
                  .join(', '),
              })}
            </p>
          </div>
        )}
      </div>
      {fields.map(renderAddressField)}
      <div>
        <button
          type="submit"
          disabled={addressSubmitting}
          className="w-full rounded-lg bg-blue-600 px-3 py-3 text-xs font-semibold text-white"
        >
          {addressSubmitting ? (
            <span className="flex items-center justify-center gap-2">
              <AppLoader size={16} label={t('customer.submittingAddress')} />
              {t('customer.submittingAddress')}
            </span>
          ) : (
            t('customer.submitAddress')
          )}
        </button>
      </div>
    </form>
  );
  const addressChangeAction = addressChangeAvailable ? (
    <button
      type="button"
      disabled={busy}
      onClick={requestAddressChange}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium"
    >
      <Edit3 className="h-4 w-4" />
      {t('customer.addressChanged')}
    </button>
  ) : (
    <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
      {t('customer.addressChangeContactSupport')}
    </p>
  );
  const reminderAction = reminderPickerOpen ? (
    <ReminderPicker
      value={reminderDateTime}
      onChange={setReminderDateTime}
      disabled={busy || context.session.reminderCount >= 3}
      max={toDateTimeLocalValue(new Date(context.session.expiresAt))}
      onSubmit={scheduleReminder}
      onCancel={() => setReminderPickerOpen(false)}
    />
  ) : (
    <button
      type="button"
      disabled={busy || context.session.reminderCount >= 3}
      onClick={() => setReminderPickerOpen(true)}
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-900"
    >
      <Clock3 className="h-4 w-4 shrink-0" />
      {t('customer.askReminder')}
    </button>
  );
  if (editingAddress)
    return (
      <div className="customer-theme min-h-[100dvh] bg-[#fff5f5] px-0 py-0 sm:px-4 sm:py-6">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl flex-col overflow-hidden border border-red-100 bg-white shadow-sm sm:min-h-[680px] sm:rounded-3xl sm:shadow-lg">
          <div className="border-b border-red-100 px-4 py-4 sm:px-7 sm:py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-[#d71920] p-0.5 shadow-sm">
                <img src="/ira-logo-hd.png?v=3" alt="IRA" className="h-full w-full rounded-[0.65rem] object-contain" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold tracking-tight text-[#d71920]">
                  {t('app.customerVerification')}
                </p>
                <p className="break-words text-xs font-medium text-slate-600">{t('customer.requestNewAddress')}</p>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-4 p-4 pb-24 sm:p-7 sm:pb-7">
            {error && (
              <div className="flex gap-2 break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            {addressEditForm}
          </div>
          <div className="border-t border-red-100 bg-red-50/50 px-4 py-3 text-center text-xs text-slate-500 sm:px-5">
            {t('customer.doNotShareLink')}
          </div>
        </div>
      </div>
    );
  return (
    <div className="customer-theme min-h-[100dvh] bg-[#fff5f5] px-0 py-0 sm:px-4 sm:py-6">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-xl min-w-0 flex-col overflow-hidden border border-red-100 bg-white shadow-sm sm:min-h-[680px] sm:rounded-3xl sm:shadow-lg">
        {simulation && (
          <div className="flex items-start justify-between gap-3 bg-indigo-600 px-3 py-2 text-[10px] font-semibold leading-snug tracking-wide text-white sm:px-4">
            <span className="min-w-0 break-words">SIMULASI CUSTOMER — MODE TESTING E2E</span>
            <button
              type="button"
              onClick={resetSimulation}
              className="shrink-0 rounded-md border border-white/40 px-2 py-1 tracking-normal hover:bg-white/10"
            >
              Ulangi
            </button>
          </div>
        )}
        <div className="border-b border-red-100 bg-white px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-[#d71920] p-0.5 shadow-sm">
              <img src="/ira-logo-hd.png?v=3" alt="IRA" className="h-full w-full rounded-[0.65rem] object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-extrabold tracking-tight text-[#d71920]">
                {t('app.customerVerification')}
              </p>
              <p className="break-words text-xs font-medium text-slate-600">{t('customer.verification')}</p>
            </div>
            <div className="ml-auto hidden items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-[#b8171d] sm:flex">
              <ShieldCheck className="h-3.5 w-3.5" />
              {t('customer.secureCheck')}
            </div>
          </div>
        </div>
        <div className="flex-1 space-y-5 p-4 pb-24 sm:p-7 sm:pb-7">
          <div>
            <p className="break-words text-sm text-slate-500">
              {t('customer.hello')}, <span className="font-semibold text-slate-700">{context.customer.name}</span>
            </p>
            <h1 className="mt-1 break-words text-2xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-3xl">
              {t('customer.confirmLocation')}
            </h1>
            <p className="mt-2 max-w-prose break-words text-sm leading-relaxed text-slate-600">
              {t('customer.pageIntro')}
            </p>
          </div>
          <div className="rounded-2xl border border-red-100 border-l-4 border-l-[#d71920] bg-[#fff8f8] p-4 shadow-sm sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-[#b8171d]">
              {t(context.address.addressType === 'PROPOSED' ? 'customer.proposedAddress' : 'customer.registeredAddress')}
            </p>
            <p className="mt-2 break-words text-base font-semibold leading-relaxed text-slate-900 sm:text-lg">
              {formatAddressForDisplay(context.address.rawAddress)}
            </p>
            <p className="mt-3 break-words text-xs text-slate-600 sm:text-sm">
              {t('customer.phone')}: <span className="font-semibold text-slate-800">{context.customer.phoneE164}</span>
            </p>
          </div>
          {gpsBusy ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center justify-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-6 text-center text-blue-800"
            >
              <AppLoader size={64} label={t('customer.gpsAutomatic')} />
              <div>
                <p className="text-base font-semibold">{t('customer.gpsCheckingTitle')}</p>
                <p className="mt-1 text-sm leading-relaxed">{t('customer.gpsAutomatic')}</p>
              </div>
            </div>
          ) : (
            <>
              {error && (
                <div className="space-y-2 break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="min-w-0 break-words">{error}</span>
                  </div>
                  {gpsRetryAvailable && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void captureGps()}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-800 sm:w-auto"
                    >
                      {gpsActionContent(
                        gpsPermissionDenied ? t('customer.requestGpsAgain') : t('customer.retryGps'),
                        <Compass className="h-4 w-4" />,
                      )}
                    </button>
                  )}
                </div>
              )}
              {showConfirmation && (
                <div className="space-y-3">
                  <p className="text-base font-medium leading-relaxed text-slate-700">{t('customer.confirmData')}</p>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        simulation
                          ? Promise.resolve(
                              updateSimulationSession({ status: 'CONSENTED', customerConfirmationStatus: 'CONFIRMED' }),
                            )
                          : api.confirm(token, true),
                      )
                    }
                    className="w-full rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t('customer.yesCorrect')}
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        simulation
                          ? Promise.resolve(
                              updateSimulationSession({
                                status: 'CUSTOMER_DATA_MISMATCH',
                                customerConfirmationStatus: 'MISMATCH',
                              }),
                            )
                          : api.confirm(token, false),
                      )
                    }
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50"
                  >
                    {t('customer.notMyData')}
                  </button>
                </div>
              )}
              {status === 'CONSENTED' && (
                <div
                  role={locationBlocked ? 'alert' : undefined}
                  className="space-y-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950 sm:p-5"
                >
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-full bg-red-100 p-2 text-[#d71920]">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-bold">
                        {locationBlocked ? t('customer.locationAccessTitle') : t('customer.locationPermission')}
                      </p>
                      {locationBlocked && (
                        <p className="mt-1 break-words leading-relaxed">{t('customer.locationAccessText')}</p>
                      )}
                    </div>
                  </div>
                  {locationBlocked && (
                    <ol className="space-y-2 rounded-xl bg-white/80 p-3 text-xs leading-relaxed text-red-950">
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d71920] font-bold text-white">
                          1
                        </span>
                        <span>{t('customer.locationAccessStep1')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d71920] font-bold text-white">
                          2
                        </span>
                        <span>{t('customer.locationAccessStep2')}</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#d71920] font-bold text-white">
                          3
                        </span>
                        <span>{t('customer.locationAccessStep3')}</span>
                      </li>
                    </ol>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void captureAfterTransition(() =>
                        simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.consent(token),
                      )
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {gpsActionContent(
                      locationBlocked ? t('customer.locationTryAgain') : t('customer.allowAndStart'),
                      <ShieldCheck className="h-5 w-5" />,
                    )}
                  </button>
                </div>
              )}
              {selectedReminderWaiting && (
                <ResultPanel
                  icon={<Clock3 className="h-7 w-7 text-emerald-600" />}
                  title={t('customer.reminderAlreadySelected')}
                  text={t('customer.reminderPendingText')}
                />
              )}
              {reminderResumeAvailable && (
                <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div>
                    <p className="text-sm font-semibold text-blue-900">{t('customer.reminderLinkReadyTitle')}</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-blue-800">
                      {t('customer.reminderLinkReadyText')}
                    </p>
                  </div>
                  {context.session.linkExpiresAt && (
                    <p className="text-[11px] text-blue-700">{formatLinkExpiry(context.session.linkExpiresAt, t)}</p>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void captureAfterTransition(() =>
                        simulation
                          ? updateSimulationSession({ status: 'GPS_CAPTURING' })
                          : api.addressStatus(token, true),
                      )
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-3 text-xs font-semibold text-white"
                  >
                    {gpsActionContent(t('customer.startVerificationNow'), <Compass className="h-4 w-4" />)}
                  </button>
                  {addressChangeAction}
                  {reminderPickerOnLinkAvailable && reminderAction}
                </div>
              )}
              {!reminderLinkFlow && mismatch && !selectedReminderWaiting && (
                <div role="status" className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-700">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-base font-semibold text-amber-950">
                        {t(
                          locationMismatchStatus ? 'customer.locationMismatchTitle' : 'customer.locationAccuracyTitle',
                        )}
                      </p>
                      <p className="mt-1 break-words text-sm leading-relaxed text-amber-900">
                        {t(locationMismatchStatus ? 'customer.locationMismatchText' : 'customer.locationAccuracyText')}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-xs font-semibold text-amber-950">{t('customer.locationNextSteps')}</p>
                    <p className="mt-1 break-words text-xs leading-relaxed text-amber-900">
                      {t(locationMismatchStatus ? 'customer.locationMismatchSteps' : 'customer.locationAccuracySteps')}
                    </p>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() => void captureGps()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {gpsActionContent(t('customer.retryLocation'))}
                  </button>
                  {addressChangeAction}
                </div>
              )}
              {!reminderLinkFlow && mismatch && !selectedReminderWaiting && reminderActionAvailable && reminderAction}
              {!reminderLinkFlow && reminderRequired && !selectedReminderWaiting && (
                <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <ResultPanel
                    icon={<Clock3 className="h-7 w-7 text-amber-600" />}
                    title={t('customer.gpsAttemptLimitTitle')}
                    text={t('customer.gpsAttemptLimitText')}
                  />
                  {reminderActionAvailable && reminderAction}
                </div>
              )}
              {!reminderLinkFlow && shouldShowLocationRetry(status, confirmationStatus) && !selectedReminderWaiting && (
                <div className="space-y-3">
                  <ResultPanel
                    icon={<Compass className="h-7 w-7 text-blue-600" />}
                    title={t('customer.locationWaitingTitle')}
                    text={t('customer.locationWaitingText')}
                  />
                  <button
                    disabled={busy}
                    onClick={() => void captureGps()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {gpsActionContent(t('customer.startVerificationNow'))}
                  </button>
                </div>
              )}
              {!reminderLinkFlow && status === 'WAITING_FOR_HOME' && !selectedReminderWaiting && !showConfirmation && (
                <div className="space-y-3">
                  <ResultPanel
                    icon={<Clock3 className="h-7 w-7 text-amber-600" />}
                    title={t('customer.locationWaitingTitle')}
                    text={t('customer.locationWaitingText')}
                  />
                  <button
                    disabled={busy}
                    onClick={() => void captureGps()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {gpsActionContent(t('customer.retryLocation'))}
                  </button>
                </div>
              )}
              {!reminderLinkFlow &&
                status === 'REMINDER_LIMIT_REACHED' &&
                !selectedReminderWaiting &&
                !showConfirmation && (
                  <ResultPanel
                    icon={<Clock3 className="h-7 w-7 text-amber-600" />}
                    title={t('customer.reminderLimit')}
                    text={t('customer.returnToLink')}
                  />
                )}
              {status === 'CUSTOMER_DATA_MISMATCH' && (
                <ResultPanel
                  icon={<XCircle className="h-7 w-7 text-rose-600" />}
                  title={t('customer.dataNeedsUpdate')}
                  text={t('customer.contactSupport')}
                />
              )}
              {status === 'ADDRESS_PROPOSED' && (
                <div className="space-y-3">
                  <ResultPanel
                    icon={<MapPin className="h-7 w-7 text-blue-600" />}
                    title={t('customer.newAddressSubmitted')}
                    text={t('customer.addressWaitingGps')}
                  />
                  <button
                    disabled={busy}
                    onClick={() => void captureAfterTransition(startProposedAddressVerification)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    {gpsActionContent(t('customer.startVerificationNow'))}
                  </button>
                </div>
              )}
              {status === 'MANUAL_REVIEW' && <ManualReviewPanel />}
              {status === 'LOCATION_VALID' && (
                <>
                  <ResultPanel
                    icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
                    title={t('customer.locationVerified')}
                    text={t('customer.addressValidated')}
                  />
                  {decision?.capturedLocation && (
                    <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                      Koordinat:{' '}
                      <span className="font-mono font-semibold">{decision.capturedLocation.coordinateText}</span>
                      {decision.distanceFromReferenceMeters != null && (
                        <>
                          <br />
                          Jarak: {decision.distanceFromReferenceMeters.toFixed(1)} meter
                        </>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
        <div className="border-t border-red-100 bg-red-50/50 px-4 py-3 text-center text-xs text-slate-500 sm:px-5">
          {t('customer.doNotShareLink')}
        </div>
      </div>
      {showAddressChangeConfirmation && (
        <AddressChangeConfirmation
          busy={busy}
          onCancel={() => setShowAddressChangeConfirmation(false)}
          onConfirm={confirmAddressChange}
        />
      )}
    </div>
  );
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  return (
    <div className="customer-theme flex min-h-[100dvh] w-full items-center justify-center bg-[#fff5f5] px-4 py-8 text-center">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-red-100 bg-white shadow-lg">
        <div className="flex items-center gap-3 border-b border-red-100 px-5 py-4 text-left">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-[#d71920] p-0.5 shadow-sm">
            <img src="/ira-logo-hd.png?v=3" alt="IRA" className="h-full w-full rounded-[0.65rem] object-contain" />
          </div>
          <div>
            <p className="truncate font-extrabold tracking-tight text-[#d71920]">{t('app.customerVerification')}</p>
            <p className="text-[11px] text-slate-500">{t('customer.verification')}</p>
          </div>
        </div>
        <div className="p-6 sm:p-8">{children}</div>
      </div>
    </div>
  );
};
const ResultPanel: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => (
  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center sm:p-5">
    <div className="mb-2 flex justify-center">{icon}</div>
    <p className="break-words text-sm font-semibold text-gray-900">{title}</p>
    <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{text}</p>
  </div>
);
const ManualReviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const steps = ['customer.manualReviewStep1', 'customer.manualReviewStep2', 'customer.manualReviewStep3'];
  return (
    <div role="status" aria-live="polite" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-full bg-blue-100 p-2 text-blue-700">
          <ShieldCheck className="h-5 w-5" />
        </div>
        <div className="min-w-0 text-left">
          <p className="break-words text-base font-semibold text-blue-950">{t('customer.manualReviewTitle')}</p>
          <p className="mt-1 break-words text-sm leading-relaxed text-blue-900">{t('customer.manualReviewText')}</p>
        </div>
      </div>
      <ol className="space-y-2 rounded-lg bg-white/80 p-3 text-left">
        {steps.map((step, index) => (
          <li key={step} className="flex items-center gap-3 text-xs text-blue-950">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">
              {index + 1}
            </span>
            <span className={index === 1 ? 'font-semibold' : ''}>{t(step)}</span>
          </li>
        ))}
      </ol>
      <p className="break-words text-left text-xs leading-relaxed text-blue-800">{t('customer.manualReviewHelp')}</p>
    </div>
  );
};
const AddressChangeConfirmation: React.FC<{
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}> = ({ busy, onCancel, onConfirm }) => {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-change-confirmation-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5"
      >
        <div className="flex items-start gap-3">
          <div className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-700">
            <Edit3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="address-change-confirmation-title" className="break-words text-base font-semibold text-slate-900">
              {t('customer.addressChangeConfirmTitle')}
            </h2>
            <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">
              {t('customer.addressChangeConfirmText')}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-700 disabled:opacity-50"
          >
            {t('customer.addressChangeConfirmNo')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <span className="flex items-center justify-center gap-2">
                <AppLoader size={16} label={t('customer.submittingAddress')} />
                {t('customer.submittingAddress')}
              </span>
            ) : (
              t('customer.addressChangeConfirmYes')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
const ReminderPicker: React.FC<{
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  max: string;
  onSubmit: () => void;
  onCancel: () => void;
}> = ({ value, onChange, disabled, max, onSubmit, onCancel }) => {
  const { t } = useTranslation();
  const minimum = toDateTimeLocalValue(new Date(Date.now() + 60_000));
  return (
    <div className="min-w-0 space-y-3 rounded-lg border border-amber-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="break-words text-sm font-semibold text-amber-950">{t('customer.reminderQuestion')}</p>
          <p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{t('customer.reminderHelp')}</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="shrink-0 text-xs font-medium text-gray-500 underline underline-offset-2 disabled:opacity-50"
        >
          {t('customer.cancelReminder')}
        </button>
      </div>
      <div>
        <label className="block break-words text-xs font-medium text-gray-700">{t('customer.reminderDateTime')}</label>
        <input
          type="datetime-local"
          min={minimum}
          max={max}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm sm:text-xs"
        />
      </div>
      <p className="break-words text-[11px] text-gray-500">
        {t('customer.reminderRangeHelp')} {t('customer.reminderTimezone')}
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"
      >
        <Clock3 className="h-4 w-4 shrink-0" />
        {t('customer.askReminder')}
      </button>
    </div>
  );
};

function formatLinkExpiry(
  value: string | undefined,
  translate: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : translate('customer.linkExpiresAt', { date: date.toLocaleString() });
}
