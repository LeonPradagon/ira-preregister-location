import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Compass, Edit3, Loader2, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { api, PublicVerificationContextApi, ServerValidationDecision } from '../../lib/apiClient';
import { useTranslation } from '../../i18n';
import { calculateGeodesicDistanceMeters, evaluateBestGpsSample, formatAddressForDisplay } from '../../lib/validationEngine';
import { userFriendlyReason } from '../../lib/statusLabels';

interface Props { token: string; simulation?: boolean }
type AddressForm = Record<string, string>;
type RegionLevel = 'province' | 'city' | 'district' | 'subdistrict';
type RegionOption = { code: string; name: string; postalCode?: string | null };
const regionLevels: RegionLevel[] = ['province', 'city', 'district', 'subdistrict'];
const fields = ['province', 'city', 'district', 'subdistrict', 'postalCode', 'street', 'houseNumber'];
const fieldLabels: Record<string, string> = { province: 'Provinsi', city: 'Kota / Kabupaten', district: 'Kecamatan', subdistrict: 'Kelurahan / Desa', postalCode: 'Kode pos', street: 'Nama jalan', houseNumber: 'Nomor rumah (opsional)' };
const fieldPlaceholders: Record<string, string> = { province: 'Contoh: Jawa Barat', city: 'Contoh: Kota Bandung', district: 'Contoh: Coblong', subdistrict: 'Contoh: Dago', postalCode: 'Contoh: 40135', street: 'Contoh: Jalan Ir. H. Juanda', houseNumber: 'Contoh: 10 atau TANPA NOMOR' };
const toDateTimeLocalValue = (date: Date) => {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const createSimulationContext = (customerName: string, customerAddress: string, referenceLocation: { latitude: number; longitude: number } | null, referencePrecision: string, simulationConfig: { homeRadiusMeters: number; gpsMaxAccuracyMeters: number; manualReview: boolean }): PublicVerificationContextApi => ({
  session: { id: 'simulation-session', status: 'CREATED', expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(), customerConfirmationStatus: 'UNCONFIRMED', reminderCount: 0 },
  customer: { id: 'simulation-customer', name: customerName, phoneE164: '+628111111111' },
  address: { id: 'simulation-address', rawAddress: customerAddress, province: 'Jawa Barat', city: 'Bandung', district: 'Coblong', subdistrict: 'Dago', street: 'Jalan Ir H Juanda', houseNumber: '10', referencePrecision, referenceLocation, simulationConfig },
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
  const simulationConfig = { homeRadiusMeters: simulationHomeRadiusMeters, gpsMaxAccuracyMeters: simulationGpsMaxAccuracyMeters, manualReview: true };
  const [context, setContext] = useState<PublicVerificationContextApi | null>(() => simulation ? createSimulationContext(simulationName, simulationAddress, simulationReferenceLocation, simulationReferencePrecision, simulationConfig) : null);
  const [decision, setDecision] = useState<ServerValidationDecision | null>(null);
  const [addressForm, setAddressForm] = useState<AddressForm>({});
  const [editingAddress, setEditingAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [postalLookupLoading, setPostalLookupLoading] = useState(false);
  const [regionOptions, setRegionOptions] = useState<Record<RegionLevel, RegionOption[]>>({ province: [], city: [], district: [], subdistrict: [] });
  const [regionCodes, setRegionCodes] = useState<Partial<Record<RegionLevel, string>>>({});
  const [regionLoading, setRegionLoading] = useState<RegionLevel | null>(null);
  const [regionError, setRegionError] = useState<string | null>(null);
  const regionRequestId = useRef(0);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
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
    setReminderDateTime(toDateTimeLocalValue(new Date(Date.now() + 60 * 60 * 1000)));
    setReminderScheduledNow(false);
    setError(null);
  };

  const captureGps = async () => {
    if (!navigator.geolocation) { setBusy(false); setError(t('customer.browserNoLocation')); return; }
    setBusy(true); setError(null); setGpsPermissionDenied(false);
    try {
      const samples: Array<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }> = [];
      for (let index = 0; index < 3; index += 1) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        samples.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, capturedAt: new Date().toISOString() });
        // Give the browser/provider time to refresh the fix. Three calls made
        // within half a second often return the same stale or unstable fix.
        if (index < 2) await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }
      if (simulation) {
        const evaluation = evaluateBestGpsSample(samples);
        const referenceLocation = context.address.referenceLocation;
        const distanceFromReferenceMeters = referenceLocation ? calculateGeodesicDistanceMeters(evaluation.bestSample, referenceLocation) : null;
        const reasonCodes: string[] = [];
        let result = 'LOCATION_VALID';
        if (evaluation.bestSample.accuracyMeters > context.address.simulationConfig.gpsMaxAccuracyMeters) { result = 'LOW_GPS_ACCURACY'; reasonCodes.push('LOW_GPS_ACCURACY'); }
        else if (!evaluation.isConsistent) { result = 'MANUAL_REVIEW'; reasonCodes.push('GPS_SAMPLE_INCONSISTENT'); }
        else if (!referenceLocation) { result = 'MANUAL_REVIEW'; reasonCodes.push('REFERENCE_LOCATION_MISSING'); }
        else if (!['EXACT_MASTER', 'ROOFTOP', 'HOUSE'].includes(context.address.referencePrecision)) { result = 'MANUAL_REVIEW'; reasonCodes.push('REFERENCE_LOCATION_NOT_PRECISE'); }
        else if (distanceFromReferenceMeters > context.address.simulationConfig.homeRadiusMeters) { result = 'LOCATION_MISMATCH'; reasonCodes.push('HOME_RADIUS_EXCEEDED'); }
        else if (context.address.simulationConfig?.manualReview) { result = 'MANUAL_REVIEW'; reasonCodes.push('AUTOMATED_VALIDATION_PASSED', 'MANUAL_REVIEW_REQUIRED'); }
        else reasonCodes.push('LOCATION_VALID');
        setDecision({ id: 'simulation-result', result, reasonCodes, bestSample: evaluation.bestSample, distanceFromReferenceMeters, addressScore: result === 'LOCATION_VALID' || reasonCodes.includes('AUTOMATED_VALIDATION_PASSED') ? 1 : 0, sampleSpreadMeters: evaluation.sampleSpreadMeters, capturedLocation: { ...evaluation.bestSample, coordinateText: `${evaluation.bestSample.latitude.toFixed(6)}, ${evaluation.bestSample.longitude.toFixed(6)}`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${evaluation.bestSample.latitude},${evaluation.bestSample.longitude}` } });
        updateSimulationSession({ status: result });
        return;
      }
      setDecision(await api.submitLocation(token, samples)); await refresh();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? Number((cause as { code?: unknown }).code) : undefined;
      if (code === 1) {
        setGpsPermissionDenied(true);
        setError(t('customer.permissionDenied'));
      } else setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
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
      ? run(async () => updateSimulationSession({ status: context && context.session.reminderCount + 1 >= 3 ? 'REMINDER_LIMIT_REACHED' : 'WAITING_FOR_HOME', reminderCount: (context?.session.reminderCount ?? 0) + 1 }))
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
    const required = ['province', 'city', 'district', 'subdistrict', 'street', 'postalCode'];
    if (required.some((field) => field === 'postalCode' ? !postalCode : !addressForm[field]?.trim())) { setError(t('customer.requiredAddressFieldsWithPostal')); return; }
    const submittedAddress = { ...addressForm, postalCode, houseNumber: addressForm.houseNumber?.trim() || 'TANPA NOMOR' };
    setBusy(true); setError(null);
    try {
      if (simulation) {
        updateSimulationSession({ status: 'ADDRESS_PROPOSED' });
        setContext((current) => current ? { ...current, address: { ...current.address, ...submittedAddress, rawAddress: `${submittedAddress.street}, No. ${submittedAddress.houseNumber}, ${submittedAddress.subdistrict}, ${submittedAddress.district}, ${submittedAddress.city}, ${submittedAddress.province}` } } : current);
      } else {
        await api.changeAddress(token, submittedAddress);
        await refresh();
      }
      setEditingAddress(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('customer.requestFailed'));
    } finally { setBusy(false); }
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
    const selected = regionOptions[field].find((option) => option.name.toLowerCase() === value.trim().toLowerCase());
    const nextAddress = { ...addressForm, [field]: value, postalCode: '' };
    for (const child of regionLevels.slice(levelIndex + 1)) nextAddress[child] = '';
    if (field === 'subdistrict' && selected?.postalCode) nextAddress.postalCode = selected.postalCode;
    setAddressForm(nextAddress);
    setRegionCodes((current) => {
      const next = { ...current, [field]: regionOptions[field].find((option) => option.name.toLowerCase() === value.trim().toLowerCase())?.code };
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

  if (error && !context) return <Panel><XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" /><h2 className="text-base font-semibold">{t('customer.invalidLink')}</h2><p className="mt-2 text-xs text-gray-600">{error}</p></Panel>;
  if (!context) return <Panel><Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500" /><p className="mt-3 text-xs text-gray-600">{t('customer.loading')}</p></Panel>;

  const status = context.session.status;
  const confirmed = context.session.customerConfirmationStatus === 'CONFIRMED';
  const showConfirmation = context.session.customerConfirmationStatus === 'UNCONFIRMED';
  const mismatch = ['LOCATION_MISMATCH', 'LOW_GPS_ACCURACY'].includes(status);
  const reminderLinkFlow = !reminderScheduledNow && confirmed && context.session.reminderCount > 0 && ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(status);
  const renderAddressField = (field: string) => {
    const regionLevel = regionLevels.includes(field as RegionLevel) ? field as RegionLevel : null;
    const parentLevel = regionLevel ? regionLevels[regionLevels.indexOf(regionLevel) - 1] : undefined;
     const input = <input required={field !== 'houseNumber'} value={addressForm[field] || ''} placeholder={fieldPlaceholders[field]} list={regionLevel ? `customer-${regionLevel}-options` : undefined} disabled={busy || Boolean(parentLevel && !regionCodes[parentLevel])} inputMode={field === 'postalCode' ? 'numeric' : undefined} maxLength={field === 'postalCode' ? 5 : undefined} onChange={(event) => regionLevel ? void handleRegionChange(regionLevel, event.target.value) : setAddressForm((prev) => ({ ...prev, [field]: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm placeholder:text-slate-400 disabled:bg-slate-100" />;
    const options = regionLevel ? regionOptions[regionLevel] : [];
    const regionInput = regionLevel ? <>{input}<datalist id={`customer-${regionLevel}-options`}>{options.map((option) => <option key={option.code} value={option.name} />)}</datalist>{regionLoading === regionLevel && <p className="mt-1 text-[11px] font-normal text-slate-500">Memuat pilihan...</p>}{regionLevel === 'province' && regionError && <p className="mt-1 text-[11px] font-normal text-amber-600">{regionError}. Anda tetap bisa mengetik manual.</p>}</> : input;
    return <label key={field} className="block text-xs font-medium text-slate-700"><span>{fieldLabels[field] || field}</span>{field === 'postalCode' ? <><div className="flex items-start gap-2"><div className="min-w-0 flex-1">{input}</div><button type="button" disabled={postalLookupLoading || busy} onClick={() => void lookupPostalCode()} className="mt-1 shrink-0 rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-xs font-semibold text-blue-700 disabled:opacity-50">{postalLookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('customer.postalLookup')}</button></div><p className="mt-1 text-[11px] font-normal text-slate-500">{t('customer.postalLookupHint')}</p></> : regionInput}</label>;
  };
  return <div className="min-h-screen bg-slate-50 p-3 sm:p-6"><div className="mx-auto flex min-h-[640px] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    {simulation && <div className="flex items-center justify-between gap-3 bg-indigo-600 px-4 py-2 text-[10px] font-semibold tracking-wide text-white"><span>SIMULASI CUSTOMER — MODE TESTING E2E</span><button type="button" onClick={resetSimulation} className="shrink-0 rounded-md border border-white/40 px-2 py-1 tracking-normal hover:bg-white/10">Ulangi</button></div>}
    <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4"><MapPin className="h-5 w-5 text-blue-600" /><span className="text-sm font-semibold">{t('customer.verification')}</span></div>
    <div className="flex-1 space-y-5 p-5 sm:p-7">
      <div><p className="text-sm text-slate-500">{t('customer.hello')}, {context.customer.name}</p><h1 className="mt-1 text-xl font-bold text-slate-900">{t('customer.confirmLocation')}</h1></div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs"><p className="font-medium text-gray-500">{t('customer.registeredAddress')}</p><p className="mt-2 font-semibold leading-relaxed text-gray-900">{formatAddressForDisplay(context.address.rawAddress)}</p><p className="mt-2 text-gray-500">{t('customer.phone')}: {context.customer.phoneE164}</p></div>
      {error && <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>{gpsPermissionDenied && <button type="button" disabled={busy} onClick={() => void captureGps()} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-800">{t('customer.requestGpsAgain')}</button>}</div>}
      {showConfirmation && <div className="space-y-3"><p className="text-base font-medium leading-relaxed text-slate-700">{t('customer.confirmData')}</p><button disabled={busy} onClick={() => void run(() => simulation ? Promise.resolve(updateSimulationSession({ status: 'CONSENTED', customerConfirmationStatus: 'CONFIRMED' })) : api.confirm(token, true))} className="w-full rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{t('customer.yesCorrect')}</button><button disabled={busy} onClick={() => void run(() => simulation ? Promise.resolve(updateSimulationSession({ status: 'CUSTOMER_DATA_MISMATCH', customerConfirmationStatus: 'MISMATCH' })) : api.confirm(token, false))} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 disabled:opacity-50">{t('customer.notMyData')}</button></div>}
      {status === 'CONSENTED' && <div className="space-y-3"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800">{t('customer.locationPermission')}</div><button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.consent(token))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><ShieldCheck className="h-5 w-5" />{t('customer.allowAndStart')}</button></div>}
      {busy && ['CONSENTED', 'GPS_CAPTURING', 'ADDRESS_PROPOSED'].includes(status) && <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-relaxed text-blue-800"><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{t('customer.gpsAutomatic')}</div>}
      {reminderLinkFlow && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-900">{t('customer.stillAtAddress')}</p><button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.addressStatus(token, true))} className="w-full rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">{t('customer.yesCorrect')}</button><button disabled={busy} onClick={() => { setEditingAddress(true); if (simulation) updateSimulationSession({ status: 'ADDRESS_EDITING' }); else void run(() => api.addressStatus(token, false)); }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-xs font-medium text-gray-800"><Edit3 className="mr-1 inline h-4 w-4" />{t('customer.addressChanged')}</button></div>}
      {mismatch && !reminderLinkFlow && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">{t('customer.previousMismatch')}</p>{decision && <ValidationEvidence decision={decision} /> }<button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.retryGps')}</button><ReminderPicker value={reminderDateTime} onChange={setReminderDateTime} disabled={busy || context.session.reminderCount >= 3} onSubmit={scheduleReminder} /><button disabled={busy} onClick={() => { setEditingAddress(true); setAddressForm({}); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium"><Edit3 className="h-4 w-4" />{t('customer.addressChanged')}</button></div>}
      {!mismatch && !reminderLinkFlow && status === 'ADDRESS_PROPOSED' && <ReminderPicker value={reminderDateTime} onChange={setReminderDateTime} disabled={busy || context.session.reminderCount >= 3} onSubmit={scheduleReminder} />}
      {editingAddress && <form noValidate onSubmit={(event) => void submitAddress(event)} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-base font-semibold">{t('customer.requestNewAddress')}</p><p className="mt-1 text-xs leading-relaxed text-slate-600">Isi bagian yang wajib diubah.</p></div>{fields.map(renderAddressField)}<div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setEditingAddress(false)} className="w-1/3 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium text-slate-700">Batal</button><button type="submit" disabled={busy} className="w-2/3 rounded-xl bg-blue-600 px-3 py-3 text-sm font-semibold text-white">{t('customer.submitAddress')}</button></div></form>}
      {status === 'WAITING_FOR_HOME' && !reminderLinkFlow && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title={t('customer.waitingAtHome')} text={t('customer.reminderScheduled')} />}
      {status === 'REMINDER_LIMIT_REACHED' && !reminderLinkFlow && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title={t('customer.reminderLimit')} text={t('customer.returnToLink')} />}
      {status === 'CUSTOMER_DATA_MISMATCH' && <ResultPanel icon={<XCircle className="h-7 w-7 text-rose-600" />} title={t('customer.dataNeedsUpdate')} text={t('customer.contactSupport')} />}
      {status === 'ADDRESS_PROPOSED' && <div className="space-y-3"><ResultPanel icon={<MapPin className="h-7 w-7 text-blue-600" />} title={t('customer.newAddressSubmitted')} text={t('customer.addressWaitingGps')} /><button disabled={busy} onClick={() => void captureAfterTransition(() => simulation ? updateSimulationSession({ status: 'GPS_CAPTURING' }) : api.addressStatus(token, true))} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"><Compass className="h-5 w-5" />{t('customer.retryGps')}</button></div>}
      {status === 'MANUAL_REVIEW' && <><ResultPanel icon={<ShieldCheck className="h-7 w-7 text-amber-600" />} title={t('customer.manualReview')} text={t('customer.manualReviewNotice')} />{decision && <ValidationEvidence decision={decision} />}</>}
      {status === 'LOCATION_VALID' && <><ResultPanel icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title={t('customer.locationVerified')} text={t('customer.addressValidated')} />{decision?.capturedLocation && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Koordinat: <span className="font-mono font-semibold">{decision.capturedLocation.coordinateText}</span>{decision.distanceFromReferenceMeters != null && <><br />Jarak: {decision.distanceFromReferenceMeters.toFixed(1)} meter</>}</div>}</>}
    </div><div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">{t('customer.doNotShareLink')}</div>
  </div></div>;
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex min-h-screen items-center justify-center bg-gray-100 p-5 text-center">{children}</div>;
const ResultPanel: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-center"><div className="mb-2 flex justify-center">{icon}</div><p className="text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-gray-600">{text}</p></div>;
const ValidationEvidence: React.FC<{ decision: ServerValidationDecision }> = ({ decision }) => <div className="rounded-lg border border-amber-200 bg-white/70 p-3 text-[11px] text-slate-700"><div className="grid grid-cols-2 gap-2"><span>Akurasi lokasi: <strong>±{decision.bestSample.accuracyMeters.toFixed(1)} m</strong></span><span>Perbedaan titik: <strong>{decision.sampleSpreadMeters.toFixed(1)} m</strong></span><span>Jarak dari alamat: <strong>{decision.distanceFromReferenceMeters == null ? 'belum tersedia' : `${decision.distanceFromReferenceMeters.toFixed(1)} m`}</strong></span><span>Kecocokan alamat: <strong>{Math.round(decision.addressScore * 100)}%</strong></span></div><p className="mt-2 break-words text-slate-500">Catatan: {decision.reasonCodes.map(userFriendlyReason).join(', ')}</p></div>;
const ReminderPicker: React.FC<{ value: string; onChange: (value: string) => void; disabled: boolean; onSubmit: () => void }> = ({ value, onChange, disabled, onSubmit }) => { const { t } = useTranslation(); const minimum = toDateTimeLocalValue(new Date(Date.now() + 60_000)); return <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3"><label className="block text-xs font-medium text-gray-700">{t('customer.reminderDateTime')}</label><input type="datetime-local" min={minimum} disabled={disabled} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs" /><p className="text-[11px] text-gray-500">{t('customer.reminderTimezone')}</p><button type="button" disabled={disabled} onClick={onSubmit} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"><Clock3 className="h-4 w-4" />{t('customer.askReminder')}</button></div>; };
