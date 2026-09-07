import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Compass, Edit3, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { api, PublicVerificationContextApi, ServerValidationDecision } from '../../lib/apiClient';
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';
import { calculateGeodesicDistanceMeters, evaluateBestGpsSample, formatAddressForDisplay } from '../../lib/validationEngine';
import { findRegionOption, regionOptionValue } from '../../lib/regionSelection';
import { shouldShowCustomerConfirmation, shouldShowLocationRetry, shouldShowReminderResume } from '../../lib/customerVerificationFlow';
import { confirmAction } from '../../lib/swal';

interface Props { token: string; simulation?: boolean }
type AddressForm = Record<string, string>;
type RegionLevel = 'province' | 'city' | 'district' | 'subdistrict';
type RegionOption = { code: string; name: string; postalCode?: string | null };
const regionLevels: RegionLevel[] = ['province', 'city', 'district', 'subdistrict'];
const fields = ['street', 'province', 'city', 'district', 'subdistrict', 'houseNumber', 'postalCode', 'addressDetail'];
const fieldLabels: Record<string, string> = { province: 'Provinsi', city: 'Kota / Kabupaten', district: 'Kecamatan', subdistrict: 'Kelurahan / Desa', postalCode: 'Kode pos', street: 'Nama jalan / perumahan', houseNumber: 'Nomor rumah', addressDetail: 'Detail alamat & patokan (optional)' };
const fieldPlaceholders: Record<string, string> = { province: 'Contoh: Jawa Barat', city: 'Contoh: Kota Bandung', district: 'Contoh: Coblong', subdistrict: 'Contoh: Dago', postalCode: 'Contoh: 40135', street: 'Contoh: Jalan Ir. H. Juanda atau Perumahan Griya Asri', houseNumber: 'Contoh: 10 atau A-12', addressDetail: 'Contoh: Blok A lantai 2, dekat pos satpam, sebelah minimarket' };
const GPS_SAMPLE_TARGET = 5;
const GPS_CAPTURE_TIMEOUT_MS = 30_000;
const GPS_WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: GPS_CAPTURE_TIMEOUT_MS, maximumAge: 0 };

function collectGpsSamples(geolocation: Geolocation): Promise<Array<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }>> {
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
      samples.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, capturedAt: new Date().toISOString() });
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

const createSimulationContext = (customerName: string, customerAddress: string, referenceLocation: { latitude: number; longitude: number } | null, referencePrecision: string, simulationConfig: { homeRadiusMeters: number; gpsMaxAccuracyMeters: number; manualReview: boolean; autoApprovalEnabled: boolean; autoApprovalScoreThreshold: number }): PublicVerificationContextApi => ({
  session: { id: 'simulation-session', status: 'CREATED', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), linkExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), customerConfirmationStatus: 'UNCONFIRMED', reminderCount: 0, isReminderLink: false },
  customer: { id: 'simulation-customer', name: customerName, phoneE164: '+628111111111' },
  address: { id: 'simulation-address', addressType: 'MASTER', rawAddress: customerAddress, province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago', street: 'Jalan Ir H Juanda', houseNumber: '10', referencePrecision, referenceLocation, simulationConfig },
});

export const BackendCustomerVerificationView: React.FC<Props> = ({ token, simulation = false }) => {
  const { t } = useTranslation();
  const simulationParams = simulation ? new URLSearchParams(window.location.search) : null;
  const simulationName = simulationParams?.get('name') || 'Budi Santoso';
  const simulationAddress = simulationParams?.get('address') || 'Jl. Contoh No. 10, Kelurahan Sukamaju, Kota Bandung';
  const simulationPostalCode = simulationParams?.get('postalCode') || '40135';
  const simulationReferenceLatitude = Number(simulationParams?.get('referenceLatitude'));
  const simulationReferenceLongitude = Number(simulationParams?.get('referenceLongitude'));
  const simulationReferenceLocation = Number.isFinite(simulationReferenceLatitude) && Number.isFinite(simulationReferenceLongitude) ? { latitude: simulationReferenceLatitude, longitude: simulationReferenceLongitude } : null;
  const simulationReferencePrecision = simulationParams?.get('referencePrecision') || 'UNKNOWN';
  const simulationHomeRadiusMeters = Number(simulationParams?.get('homeRadiusMeters')) || 50;
  const simulationGpsMaxAccuracyMeters = Number(simulationParams?.get('gpsMaxAccuracyMeters')) || 30;
  const simulationConfig = { homeRadiusMeters: simulationHomeRadiusMeters, gpsMaxAccuracyMeters: simulationGpsMaxAccuracyMeters, manualReview: simulationParams?.get('manualReview') !== 'false', autoApprovalEnabled: simulationParams?.get('autoApprovalEnabled') === 'true', autoApprovalScoreThreshold: Number(simulationParams?.get('autoApprovalScoreThreshold')) || 0.9 };
  const [context, setContext] = useState<PublicVerificationContextApi | null>(() => simulation ? createSimulationContext(simulationName, simulationAddress, simulationReferenceLocation, simulationReferencePrecision, simulationConfig) : null);
  const [decision, setDecision] = useState<ServerValidationDecision | null>(null);
  const [addressForm, setAddressForm] = useState<AddressForm>({});
  const [editingAddress, setEditingAddress] = useState(false);
  const [showAddressChangeConfirmation, setShowAddressChangeConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [postalLookupLoading, setPostalLookupLoading] = useState(false);
  const [regionOptions, setRegionOptions] = useState<Record<RegionLevel, RegionOption[]>>({ province: [], city: [], district: [], subdistrict: [] });
  const [regionCodes, setRegionCodes] = useState<Partial<Record<RegionLevel, string>>>({});
  const [regionLoading, setRegionLoading] = useState<RegionLevel | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const regionRequestId = useRef(0);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [gpsRetryAvailable, setGpsRetryAvailable] = useState(false);
  const [reminderDateTime, setReminderDateTime] = useState(() => toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
  const [reminderScheduledNow, setReminderScheduledNow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => { if (!simulation) setContext(await api.context(token)); };
  useEffect(() => { if (!simulation) void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : t('customer.invalidLink'))); }, [simulation, token, t]);
  useEffect(() => {
    let active = true;
    void api.regions.provinces().then((options) => { if (active) setRegionOptions((current) => ({ ...current, province: options })); }).catch((cause) => { if (active) setRegionError(cause instanceof Error ? cause.message : t('customer.requestFailed')); });
    return () => { active = false; };
  }, [t]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : t('customer.requestFailed')); } finally { setBusy(false); }
  };
  const updateSimulationSession = (changes: Partial<PublicVerificationContextApi['session']>) => setContext((current) => current ? { ...current, session: { ...current.session, ...changes } } : current);
  const resetSimulation = () => {
    setContext(createSimulationContext(simulationName, simulationAddress, simulationReferenceLocation, simulationReferencePrecision, simulationConfig));
    setDecision(null);
    setAddressForm({});
    setEditingAddress(false);
    setPostalLookupLoading(false);
    setBusy(false);
    setGpsPermissionDenied(false);
    setGpsRetryAvailable(false);
    setReminderDateTime(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    setReminderScheduledNow(false);
    setError(null);
  };

  const captureGps = async () => {
    if (!navigator.geolocation) { setBusy(false); setGpsRetryAvailable(false); setError(t('customer.browserNoLocation')); return; }
    setBusy(true); setError(null); setGpsPermissionDenied(false); setGpsRetryAvailable(false);
    try {
      const samples = await collectGpsSamples(navigator.geolocation);
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
        const distanceFromReferenceMeters = referenceLocation ? calculateGeodesicDistanceMeters(evaluation.bestSample, referenceLocation) : null;
        const reasonCodes: string[] = [];
        const automaticApproval = simulationConfig.autoApprovalEnabled && 1 >= (simulationConfig.autoApprovalScoreThreshold ?? 0.9);
        let result = 'LOCATION_VALID';
        if (evaluation.bestSample.accuracyMeters > simulationConfig.gpsMaxAccuracyMeters) { result = 'WAITING_FOR_HOME'; reasonCodes.push('LOW_GPS_ACCURACY', 'WAITING_FOR_HOME'); }
        else if (!evaluation.isConsistent) { result = 'WAITING_FOR_HOME'; reasonCodes.push('GPS_SAMPLE_INCONSISTENT', 'WAITING_FOR_HOME'); }
        else if (distanceFromReferenceMeters != null && distanceFromReferenceMeters > simulationConfig.homeRadiusMeters) { result = 'LOCATION_MISMATCH'; reasonCodes.push('HOME_RADIUS_EXCEEDED'); }
        else if (automaticApproval) {
          if (!referenceLocation) reasonCodes.push('REFERENCE_LOCATION_MISSING');
          else if (!['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(simulationContext.address.referencePrecision)) reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE');
          reasonCodes.push('LOCATION_VALID', 'AUTO_APPROVED');
        }
        else if (!referenceLocation) { result = 'MANUAL_REVIEW'; reasonCodes.push('REFERENCE_LOCATION_MISSING'); }
        else if (!['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(simulationContext.address.referencePrecision)) { result = 'MANUAL_REVIEW'; reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE'); }
        else { result = 'MANUAL_REVIEW'; reasonCodes.push('AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED'); }
        setDecision({ id: 'simulation-result', result, reasonCodes, bestSample: evaluation.bestSample, distanceFromReferenceMeters, addressScore: result === 'LOCATION_VALID' || reasonCodes.includes('AUTOMATED_VALIDATION_PASSED') ? 1 : 0, sampleSpreadMeters: evaluation.sampleSpreadMeters, capturedLocation: { ...evaluation.bestSample, coordinateText: `${evaluation.bestSample.latitude.toFixed(6)}, ${evaluation.bestSample.longitude.toFixed(6)}`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${evaluation.bestSample.latitude},${evaluation.bestSample.longitude}` } });
        updateSimulationSession({ status: result });
        return;
      }
      setDecision(await api.submitLocation(token, samples)); await refresh();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? Number((cause as { code?: unknown }).code) : undefined;
      if (code === 1) {
        setGpsPermissionDenied(true);
        setGpsRetryAvailable(true);
        setError(t('customer.permissionDenied'));
      } else if (code === 2 || code === 3) {
        setGpsRetryAvailable(true);
        setError(t('customer.gpsTimeout'));
      } else {
        setGpsRetryAvailable(true);
        setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
      }
    } finally { setBusy(false); }
  };

  const scheduleReminder = () => {
    const scheduledAt = new Date(reminderDateTime);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      setError(t('customer.reminderInvalid'));
      return;
    }
    setReminderScheduledNow(true);
    return simulation
      ? run(async () => {
        const nextReminderCount = (context?.session.reminderCount ?? 0) + 1;
        updateSimulationSession({ status: nextReminderCount >= 3 ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME', reminderCount: nextReminderCount });
      })
      : run(() => api.waitForHome(token, { scheduledAt: scheduledAt.toISOString() }));
  };

  const captureAfterTransition = async (transition: () => Promise<unknown> | unknown) => {
    setBusy(true); setError(null); setGpsPermissionDenied(false);
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

  const submitAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const selectedSubdistrict = regionOptions.subdistrict.find((option) => option.name.toLowerCase() === addressForm.subdistrict?.trim().toLowerCase());
    const postalCode = addressForm.postalCode?.trim() || selectedSubdistrict?.postalCode?.trim() || '';
    const required = ['province', 'city', 'district', 'subdistrict', 'street', 'houseNumber', 'postalCode'];
    if (required.some((field) => field === 'postalCode' ? !postalCode : !addressForm[field]?.trim())) { setError(t('customer.requiredAddressFieldsWithPostal')); return; }
    if (!/^\d{5}$/.test(postalCode)) { setError(t('customer.postalCodeInvalid')); return; }
    const submittedAddress: AddressForm = { ...addressForm, postalCode, houseNumber: addressForm.houseNumber.trim() };
    const confirmed = await confirmAction({
      title: t('crud.updateQuestion'),
      text: t('crud.updateText'),
      confirmButtonText: t('crud.continue'),
      cancelButtonText: t('crud.cancel'),
    });
    if (!confirmed) return;
    setBusy(true); setError(null);
    try {
      if (simulation) {
        updateSimulationSession({ status: 'ADDRESS_PROPOSED' });
        setContext((current) => current ? { ...current, address: { ...current.address, ...submittedAddress, addressType: 'PROPOSED', rawAddress: [submittedAddress.street, `No. ${submittedAddress.houseNumber}`, submittedAddress.addressDetail, submittedAddress.subdistrict, submittedAddress.district, submittedAddress.city, submittedAddress.province, submittedAddress.postalCode].filter(Boolean).join(', ') } } : current);
      } else {
        await api.changeAddress(token, submittedAddress);
        await refresh();
      }
      setEditingAddress(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally { setBusy(false); }
  };

  const requestAddressChange = () => setShowAddressChangeConfirmation(true);
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
      setPostalLookupLoading(true); setError(null);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setAddressForm((current) => ({ ...current, postalCode: simulationPostalCode }));
      setPostalLookupLoading(false);
      return;
    }
    setPostalLookupLoading(true); setError(null);
    try {
      const result = await api.lookupAddress(token, addressForm);
      if (result.postalCode) setAddressForm((current) => ({ ...current, postalCode: result.postalCode! }));
      else setError(t('customer.postalLookupEmpty'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.postalLookupFailed'));
    } finally { setPostalLookupLoading(false); }
  };

  const handleRegionChange = async (field: RegionLevel, value: string) => {
    const levelIndex = regionLevels.indexOf(field);
    const selected = findRegionOption(regionOptions[field], value) || regionOptions[field].find((option) => option.code === value);
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
    setRegionLoading(child); setRegionError(null);
    try {
      const options = field === 'province'
        ? await api.regions.regencies(selected.code)
        : field === 'city'
          ? await api.regions.districts(selected.code)
          : await api.regions.villages(selected.code);
      if (requestId === regionRequestId.current) setRegionOptions((current) => ({ ...current, [child]: options }));
    } catch (cause) {
      if (requestId === regionRequestId.current) setRegionError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally {
      if (requestId === regionRequestId.current) setRegionLoading(null);
    }
  };

  useEffect(() => {
    if (!editingAddress || postalLookupLoading || addressForm.postalCode?.trim()) return undefined;
    const requiredForLookup = ['province', 'city', 'district', 'subdistrict'];
    if (requiredForLookup.some((field) => !addressForm[field]?.trim())) return undefined;
    const timer = window.setTimeout(() => { void lookupPostalCode(); }, 500);
    return () => window.clearTimeout(timer);
  }, [editingAddress, simulation, addressForm.province, addressForm.city, addressForm.district, addressForm.subdistrict, addressForm.postalCode]);

  if (error && !context) return <Panel><XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" /><h2 className="break-words text-base font-semibold">{t('customer.invalidLink')}</h2><p className="mt-2 break-words text-xs text-gray-600">{error}</p></Panel>;
  if (!context) return <Panel><AppLoader size={72} label={t('customer.loading')} className="mx-auto" /><p className="mt-4 break-words text-sm font-medium text-gray-700">{t('customer.loading')}</p><p className="mt-1 text-xs leading-relaxed text-gray-500">{t('customer.loadingHint')}</p></Panel>;

  const status = String(context.session.status || 'LINK_OPENED').trim().toUpperCase();
  const confirmationStatus = String(context.session.customerConfirmationStatus || 'UNCONFIRMED').trim().toUpperCase();
  const confirmed = confirmationStatus === 'CONFIRMED';
  const showConfirmation = shouldShowCustomerConfirmation(status, confirmationStatus);
  const mismatch = ['LOCATION_MISMATCH', 'LOW_GPS_ACCURACY'].includes(status);
  const locationMismatchStatus = status === 'LOCATION_MISMATCH';
  const addressChangeAvailable = context.address.addressType !== 'PROPOSED';
  const selectedReminderWaiting = reminderScheduledNow || (!context.session.isReminderLink && confirmed && context.session.reminderCount > 0 && ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(status));
  const reminderLinkFlow = !selectedReminderWaiting && confirmed && context.session.reminderCount > 0 && ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(status);
  // A customer who has selected a reminder must wait for that schedule.
  // Keep the resume action reserved for a later, unique reminder link.
  const reminderResumeAvailable = !selectedReminderWaiting && shouldShowReminderResume(status, confirmationStatus, context.session.reminderCount, context.session.isReminderLink, busy);
  const renderAddressField = (field: string) => {
    const regionLevel = regionLevels.includes(field as RegionLevel) ? field as RegionLevel : null;
    const parentLevel = regionLevel ? regionLevels[regionLevels.indexOf(regionLevel) - 1] : undefined;
    const isLongText = field === 'addressDetail';
    const input = isLongText
      ? <textarea required={false} rows={3} value={addressForm[field] || ''} placeholder={fieldPlaceholders[field]} disabled={busy} maxLength={1000} onChange={(event) => setAddressForm((prev) => ({ ...prev, [field]: event.target.value }))} className="mt-1 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-3 text-base placeholder:text-slate-400 disabled:bg-slate-100 sm:text-sm" />
      : <input required={field !== 'addressDetail'} pattern={field === 'postalCode' ? '[0-9]{5}' : undefined} value={addressForm[field] || ''} placeholder={fieldPlaceholders[field]} list={regionLevel ? `customer-${regionLevel}-options` : undefined} disabled={busy || Boolean(parentLevel && !regionCodes[parentLevel])} inputMode={field === 'postalCode' ? 'numeric' : undefined} maxLength={field === 'postalCode' ? 5 : undefined} onChange={(event) => regionLevel ? void handleRegionChange(regionLevel, event.target.value) : setAddressForm((prev) => ({ ...prev, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base placeholder:text-slate-400 disabled:bg-slate-100 sm:text-sm" />;
     const options = regionLevel ? regionOptions[regionLevel] : [];
    const selectedOption = regionLevel ? findRegionOption(options, addressForm[field] || '') : undefined;
    const regionInput = regionLevel
      ? <>
        <select required value={selectedOption?.code || ''} disabled={busy || Boolean(parentLevel && !regionCodes[parentLevel]) || regionLoading === regionLevel || options.length === 0} onChange={(event) => void handleRegionChange(regionLevel, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base disabled:bg-slate-100 sm:text-sm">
          <option value="">Pilih {fieldLabels[field]}</option>
          {options.map((option) => <option key={option.code} value={option.code}>{option.name}</option>)}
        </select>
        {regionLoading === regionLevel && <p className="mt-1 text-[11px] font-normal text-slate-500">Memuat pilihan...</p>}
        {regionError && <p className="mt-1 break-words text-[11px] font-normal text-amber-600">{regionError}</p>}
      </>
      : input;
    return <label key={field} className="block text-xs font-medium text-slate-700"><span>{fieldLabels[field] || field}{field !== 'addressDetail' && <span className="ml-1 text-rose-600">*</span>}</span>{field === 'postalCode' ? <><div className="min-w-0">{input}</div><p className="mt-1 break-words text-[11px] font-normal text-slate-500">{t('customer.postalLookupHint')}</p></> : regionInput}</label>;
   };
   const addressEditForm = <form noValidate onSubmit={(event) => void submitAddress(event)} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-base font-semibold">{t('customer.requestNewAddress')}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">{t('customer.addressEditFormHint')}</p></div>{fields.map(renderAddressField)}<div><button type="submit" disabled={busy} className="w-full rounded-lg bg-blue-600 px-3 py-3 text-xs font-semibold text-white">{t('customer.submitAddress')}</button></div></form>;
   const addressChangeAction = addressChangeAvailable
     ? <button disabled={busy} onClick={requestAddressChange} className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium"><Edit3 className="h-4 w-4" />{t('customer.addressChanged')}</button>
     : <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">{t('customer.addressChangeContactSupport')}</p>;
   if (editingAddress) return <div className="min-h-[100dvh] bg-slate-50 px-2 py-3 sm:p-6"><div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:min-h-[640px]"><div className="border-b border-slate-200 px-4 py-4 sm:px-5"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{t('customer.requestNewAddress')}</p><p className="mt-1 break-words text-[11px] text-slate-500">{t('customer.addressEditSubtitle')}</p></div></div><div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-7">{error && <div className="flex gap-2 break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}{addressEditForm}</div><div className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-center text-[10px] text-gray-500 sm:px-5">{t('customer.doNotShareLink')}</div></div></div>;
  return <div className="min-h-[100dvh] bg-slate-50 px-2 py-3 sm:p-6"><div className="mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:min-h-[640px]">
    {simulation && <div className="flex items-start justify-between gap-3 bg-indigo-600 px-3 py-2 text-[10px] font-semibold leading-snug tracking-wide text-white sm:px-4"><span className="min-w-0 break-words">SIMULASI CUSTOMER — MODE TESTING E2E</span><button type="button" onClick={resetSimulation} className="shrink-0 rounded-md border border-white/40 px-2 py-1 tracking-normal hover:bg-white/10">Ulangi</button></div>}
    <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4 sm:px-5"><MapPin className="h-5 w-5 shrink-0 text-blue-600" /><span className="break-words text-sm font-semibold">{t('customer.verification')}</span></div>
    <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-7">
      <div><p className="break-words text-sm text-slate-500">{t('customer.hello')}, {context.customer.name}</p><h1 className="break-words text-xl font-bold text-slate-900">{t('customer.confirmLocation')}</h1></div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs"><p className="font-medium text-gray-500">{t('customer.registeredAddress')}</p><p className="mt-2 break-words font-semibold leading-relaxed text-gray-900">{formatAddressForDisplay(context.address.rawAddress)}</p><p className="mt-2 break-words text-gray-500">{t('customer.phone')}: {context.customer.phoneE164}</p></div>
      {error && <div className="space-y-2 break-words rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 break-words">{error}</span></div>{gpsRetryAvailable && <button type="button" disabled={busy} onClick={() => void captureGps()} className="w-full rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-800 sm:w-auto">{gpsPermissionDenied ? t('customer.requestGpsAgain') : t('customer.retryGps')}</button>}</div>}
      {showConfirmation && <div className="space-y-3"><p className="text-base font-medium leading-relaxed text-slate-700">{t('customer.confirmData')}</p><button disabled={busy} onClick={() => void run(() => simulation ? Promise.resolve(updateSimulationSession({ status: 'CONSENTED', customerConfirmationStatus: 'CONFIRMED' })) : api.confirm(token, true))} className="w-full rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{t('customer.yesCorrect')}</button><button disabled={busy} onClick={() => void run(() => simulation ? Promise.resolve(updateSimulationSession({ status: 'CUSTOMER_DATA_MISMATCH', customerConfirmationStatus: 'MISMATCH' })) : api.confirm(token, false))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50">{t('customer.notMyData')}</button></div>}
      {status === 'CONSENTED' && <div className="space-y-3"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800">{t('customer.locationPermission')}</div><button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.consent(token))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><ShieldCheck className="h-5 w-5" />{t('customer.allowAndStart')}</button></div>}
      {busy && ['CONSENTED', 'GPS_CAPTURING', 'ADDRESS_PROPOSED'].includes(status) && <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800"><AppLoader size={28} label={t('customer.gpsAutomatic')} />{t('customer.gpsAutomatic')}</div>}
      {selectedReminderWaiting && <ResultPanel icon={<Clock3 className="h-7 w-7 text-emerald-600" />} title={t('customer.reminderScheduled')} text={t(context.session.reminderCount >= 3 ? 'customer.reminderLimitScheduled' : 'customer.remindersScheduledAutomatically')} />}
      {reminderResumeAvailable && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><div><p className="text-sm font-semibold text-blue-900">{t('customer.stillAtAddress')}</p><p className="mt-1 break-words text-xs leading-relaxed text-blue-800">{t('customer.reminderContinueHelp')}</p></div>{context.session.linkExpiresAt && <p className="text-[11px] text-blue-700">{formatLinkExpiry(context.session.linkExpiresAt, t)}</p>}<button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.addressStatus(token, true))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-3 text-xs font-semibold text-white"><Compass className="h-4 w-4" />{t('customer.startVerificationNow')}</button>{addressChangeAction}</div>}
      {mismatch && !selectedReminderWaiting && <div role="status" className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start gap-3"><div className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-700"><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0"><p className="break-words text-base font-semibold text-amber-950">{t(locationMismatchStatus ? 'customer.locationMismatchTitle' : 'customer.locationAccuracyTitle')}</p><p className="mt-1 break-words text-sm leading-relaxed text-amber-900">{t(locationMismatchStatus ? 'customer.locationMismatchText' : 'customer.locationAccuracyText')}</p></div></div><div className="rounded-lg bg-white/70 p-3"><p className="text-xs font-semibold text-amber-950">{t('customer.locationNextSteps')}</p><p className="mt-1 break-words text-xs leading-relaxed text-amber-900">{t(locationMismatchStatus ? 'customer.locationMismatchSteps' : 'customer.locationAccuracySteps')}</p></div><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.retryLocation')}</button>{addressChangeAction}</div>}
      {mismatch && !selectedReminderWaiting && <ReminderPicker value={reminderDateTime} onChange={setReminderDateTime} disabled={busy || context.session.reminderCount >= 3} max={toDateTimeLocalValue(new Date(context.session.expiresAt))} onSubmit={scheduleReminder} />}
      {shouldShowLocationRetry(status, confirmationStatus, busy) && !selectedReminderWaiting && <div className="space-y-3"><ResultPanel icon={<Compass className="h-7 w-7 text-blue-600" />} title={t('customer.locationWaitingTitle')} text={t('customer.locationWaitingText')} /><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.startVerificationNow')}</button></div>}
      {status === 'WAITING_FOR_HOME' && !selectedReminderWaiting && !showConfirmation && <div className="space-y-3"><ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title={t('customer.locationWaitingTitle')} text={t('customer.locationWaitingText')} /><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.retryLocation')}</button></div>}
      {status === 'REMINDER_LIMIT_REACHED' && !selectedReminderWaiting && !showConfirmation && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title={t('customer.reminderLimit')} text={t('customer.returnToLink')} />}
      {status === 'CUSTOMER_DATA_MISMATCH' && <ResultPanel icon={<XCircle className="h-7 w-7 text-rose-600" />} title={t('customer.dataNeedsUpdate')} text={t('customer.contactSupport')} />}
      {status === 'ADDRESS_PROPOSED' && <div className="space-y-3"><ResultPanel icon={<MapPin className="h-7 w-7 text-blue-600" />} title={t('customer.newAddressSubmitted')} text={t('customer.addressWaitingGps')} /><button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.addressStatus(token, true))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.retryGps')}</button></div>}
      {status === 'MANUAL_REVIEW' && <ManualReviewPanel />}
      {status === 'LOCATION_VALID' && <><ResultPanel icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title={t('customer.locationVerified')} text={t('customer.addressValidated')} />{decision?.capturedLocation && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Koordinat: <span className="font-mono font-semibold">{decision.capturedLocation.coordinateText}</span>{decision.distanceFromReferenceMeters != null && <><br />Jarak: {decision.distanceFromReferenceMeters.toFixed(1)} meter</>}</div>}</>}
    </div><div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">{t('customer.doNotShareLink')}</div>
  </div>{showAddressChangeConfirmation && <AddressChangeConfirmation busy={busy} onCancel={() => setShowAddressChangeConfirmation(false)} onConfirm={confirmAddressChange} />}</div>;
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex min-h-[100dvh] w-full items-center justify-center bg-slate-50 px-4 py-8 text-center"><div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{children}</div></div>;
const ResultPanel: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-center sm:p-5"><div className="mb-2 flex justify-center">{icon}</div><p className="break-words text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{text}</p></div>;
const ManualReviewPanel: React.FC = () => {
  const { t } = useTranslation();
  const steps = ['customer.manualReviewStep1', 'customer.manualReviewStep2', 'customer.manualReviewStep3'];
  return <div role="status" aria-live="polite" className="space-y-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
    <div className="flex items-start gap-3">
      <div className="shrink-0 rounded-full bg-blue-100 p-2 text-blue-700"><ShieldCheck className="h-5 w-5" /></div>
      <div className="min-w-0 text-left">
        <p className="break-words text-base font-semibold text-blue-950">{t('customer.manualReviewTitle')}</p>
        <p className="mt-1 break-words text-sm leading-relaxed text-blue-900">{t('customer.manualReviewText')}</p>
      </div>
    </div>
    <ol className="space-y-2 rounded-lg bg-white/80 p-3 text-left">
      {steps.map((step, index) => <li key={step} className="flex items-center gap-3 text-xs text-blue-950"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 font-semibold text-white">{index + 1}</span><span className={index === 1 ? 'font-semibold' : ''}>{t(step)}</span></li>)}
    </ol>
    <p className="break-words text-left text-xs leading-relaxed text-blue-800">{t('customer.manualReviewHelp')}</p>
  </div>;
};
const AddressChangeConfirmation: React.FC<{ busy: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }> = ({ busy, onCancel, onConfirm }) => { const { t } = useTranslation(); return <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 sm:p-5"><div role="dialog" aria-modal="true" aria-labelledby="address-change-confirmation-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-5"><div className="flex items-start gap-3"><div className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-700"><Edit3 className="h-5 w-5" /></div><div className="min-w-0"><h2 id="address-change-confirmation-title" className="break-words text-base font-semibold text-slate-900">{t('customer.addressChangeConfirmTitle')}</h2><p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{t('customer.addressChangeConfirmText')}</p></div></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row"><button type="button" disabled={busy} onClick={onCancel} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-medium text-slate-700 disabled:opacity-50">{t('customer.addressChangeConfirmNo')}</button><button type="button" disabled={busy} onClick={() => void onConfirm()} className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{t('customer.addressChangeConfirmYes')}</button></div></div></div>; };
const ReminderPicker: React.FC<{ value: string; onChange: (value: string) => void; disabled: boolean; max: string; onSubmit: () => void }> = ({ value, onChange, disabled, max, onSubmit }) => { const { t } = useTranslation(); const minimum = toDateTimeLocalValue(new Date(Date.now() + 60_000)); return <div className="min-w-0 space-y-3 rounded-lg border border-amber-200 bg-white p-3"><div><p className="break-words text-sm font-semibold text-amber-950">{t('customer.reminderQuestion')}</p><p className="mt-1 break-words text-xs leading-relaxed text-gray-600">{t('customer.reminderHelp')}</p></div><div><label className="block break-words text-xs font-medium text-gray-700">{t('customer.reminderDateTime')}</label><input type="datetime-local" min={minimum} max={max} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block w-full min-w-0 rounded-lg border border-gray-300 px-3 py-2 text-sm sm:text-xs" /></div><p className="break-words text-[11px] text-gray-500">{t('customer.reminderRangeHelp')} {t('customer.reminderTimezone')}</p><button type="button" disabled={disabled} onClick={onSubmit} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"><Clock3 className="h-4 w-4 shrink-0" />{t('customer.askReminder')}</button></div>; };

function formatLinkExpiry(value: string | undefined, translate: (key: string, values?: Record<string, string | number>) => string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : translate('customer.linkExpiresAt', { date: date.toLocaleString() });
}
