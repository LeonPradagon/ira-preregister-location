import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Compass, Edit3, Loader2, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { api, PublicVerificationContextApi, ServerValidationDecision } from '../../lib/apiClient';

interface Props { token: string }
type AddressForm = Record<string, string>;
const fields = ['province', 'city', 'district', 'subdistrict', 'postalCode', 'street', 'houseNumber', 'rt', 'rw', 'building', 'block', 'unit', 'addressDetail', 'landmark'];

export const BackendCustomerVerificationView: React.FC<Props> = ({ token }) => {
  const [context, setContext] = useState<PublicVerificationContextApi | null>(null);
  const [decision, setDecision] = useState<ServerValidationDecision | null>(null);
  const [addressForm, setAddressForm] = useState<AddressForm>({});
  const [editingAddress, setEditingAddress] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);
  const [reminderPreference, setReminderPreference] = useState<'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING'>('IN_1_HOUR');
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => setContext(await api.context(token));
  useEffect(() => { void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Tautan tidak dapat dibuka.')); }, [token]);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); await refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Permintaan tidak dapat diproses.'); } finally { setBusy(false); }
  };

  const captureGps = async () => {
    if (!navigator.geolocation) { setError('Browser tidak mendukung pengambilan lokasi.'); return; }
    setBusy(true); setError(null); setGpsPermissionDenied(false);
    try {
      const samples: Array<{ latitude: number; longitude: number; accuracyMeters: number; capturedAt: string }> = [];
      for (let index = 0; index < 3; index += 1) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        samples.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, capturedAt: new Date().toISOString() });
        if (index < 2) await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      setDecision(await api.submitLocation(token, samples)); await refresh();
    } catch (cause) {
      const code = typeof cause === 'object' && cause !== null && 'code' in cause ? Number((cause as { code?: unknown }).code) : undefined;
      if (code === 1) {
        setGpsPermissionDenied(true);
        setError('Izin lokasi ditolak. Tekan coba lagi. Jika browser tidak menampilkan permintaan izin, buka pengaturan izin lokasi untuk situs ini lalu aktifkan kembali.');
      } else setError(cause instanceof Error ? cause.message : 'Sampel GPS tidak dapat diproses.');
    } finally { setBusy(false); }
  };

  const submitAddress = async (event: React.FormEvent) => {
    event.preventDefault();
    const required = ['province', 'city', 'district', 'subdistrict', 'street', 'houseNumber'];
    if (required.some((field) => !addressForm[field]?.trim())) { setError('Provinsi, kota, kecamatan, kelurahan, jalan, dan nomor rumah wajib diisi.'); return; }
    await run(() => api.changeAddress(token, addressForm)); setEditingAddress(false);
  };

  const scheduleReminder = () => run(() => api.waitForHome(token, reminderPreference));

  if (error && !context) return <Panel><XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" /><h2 className="text-base font-semibold">Tautan tidak valid</h2><p className="mt-2 text-xs text-gray-600">{error}</p></Panel>;
  if (!context) return <Panel><Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500" /><p className="mt-3 text-xs text-gray-600">Memuat verifikasi...</p></Panel>;

  const status = context.session.status;
  const confirmed = context.session.customerConfirmationStatus === 'CONFIRMED';
  const showConfirmation = context.session.customerConfirmationStatus === 'UNCONFIRMED';
  const mismatch = ['LOCATION_MISMATCH', 'LOW_GPS_ACCURACY'].includes(status);
  const reminderLinkFlow = confirmed && context.session.reminderCount > 0 && ['WAITING_FOR_HOME', 'REMINDER_LIMIT_REACHED'].includes(status);
  const canCapture = confirmed && ['CONSENTED', 'GPS_CAPTURING', 'LOW_GPS_ACCURACY', 'LOCATION_MISMATCH', 'ADDRESS_PROPOSED'].includes(status);

  return <div className="min-h-screen bg-gray-100 p-3 sm:p-6"><div className="mx-auto flex min-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4"><MapPin className="h-5 w-5" /><span className="text-sm font-semibold">Verifikasi Lokasi</span></div>
    <div className="flex-1 space-y-4 p-5">
      <div><p className="text-xs text-gray-500">Halo, {context.customer.name}</p><h1 className="mt-1 text-lg font-semibold text-gray-900">Konfirmasi lokasi pemasangan</h1></div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs"><p className="font-medium text-gray-500">Alamat terdaftar</p><p className="mt-2 font-semibold leading-relaxed text-gray-900">{context.address.rawAddress}</p><p className="mt-2 text-gray-500">Telepon: {context.customer.phoneE164}</p></div>
      {error && <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><div className="flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>{gpsPermissionDenied && <button type="button" disabled={busy} onClick={() => void captureGps()} className="rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs font-medium text-rose-800">Coba minta izin GPS lagi</button>}</div>}
      {showConfirmation && <div className="space-y-3"><p className="text-sm text-gray-700">Apakah data dan alamat di atas benar milik Anda?</p><div className="grid grid-cols-2 gap-2"><button disabled={busy} onClick={() => void run(() => api.confirm(token, false))} className="rounded-lg border border-gray-300 px-3 py-3 text-xs font-medium">Bukan data saya</button><button disabled={busy} onClick={() => void run(() => api.confirm(token, true))} className="rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">Ya, benar</button></div></div>}
      {status === 'CUSTOMER_DATA_MISMATCH' && <ResultPanel icon={<XCircle className="h-7 w-7 text-rose-600" />} title="Data perlu diperbarui" text="Silakan ajukan alamat terbaru atau hubungi customer service." />}
      {status === 'CONSENTED' && <div className="space-y-3"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">Kami membutuhkan izin lokasi browser untuk memvalidasi Anda berada di alamat tersebut.</div><button disabled={busy} onClick={() => void run(() => api.consent(token))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white"><ShieldCheck className="h-4 w-4" />Izinkan dan mulai verifikasi GPS</button></div>}
      {reminderLinkFlow && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-900">Sebelum melanjutkan, apakah Anda masih tinggal di alamat ini?</p><button disabled={busy} onClick={() => void run(() => api.addressStatus(token, true))} className="w-full rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">Ya, masih di alamat ini</button><button disabled={busy} onClick={() => { setEditingAddress(true); void run(() => api.addressStatus(token, false)); }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-xs font-medium text-gray-800"><Edit3 className="mr-1 inline h-4 w-4" />Tidak, alamat saya berubah</button></div>}
      {mismatch && !reminderLinkFlow && <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-semibold text-amber-900">Hasil sebelumnya belum sesuai</p><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white"><Compass className="h-4 w-4" />Saya sudah di rumah, coba GPS ulang</button><ReminderPicker value={reminderPreference} onChange={setReminderPreference} disabled={busy || context.session.reminderCount >= 3} onSubmit={scheduleReminder} /><button disabled={busy} onClick={() => { setEditingAddress(true); setAddressForm({}); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-3 text-xs font-medium"><Edit3 className="h-4 w-4" />Alamat saya berubah</button></div>}
      {canCapture && !mismatch && !reminderLinkFlow && <div className="space-y-3"><p className="text-xs text-gray-600">Ambil 3 sampel GPS. Sistem akan memilih sampel dengan akurasi terbaik di backend.</p><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}Ambil 3 sampel lokasi</button><ReminderPicker value={reminderPreference} onChange={setReminderPreference} disabled={busy || context.session.reminderCount >= 3} onSubmit={scheduleReminder} /></div>}
      {editingAddress && <form onSubmit={(event) => void submitAddress(event)} className="space-y-2 rounded-xl border border-gray-200 p-4"><p className="text-sm font-semibold">Ajukan alamat baru</p>{fields.map((field) => <input key={field} required={['province', 'city', 'district', 'subdistrict', 'street', 'houseNumber'].includes(field)} value={addressForm[field] || ''} onChange={(event) => setAddressForm((prev) => ({ ...prev, [field]: event.target.value }))} placeholder={field} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs" />)}<button disabled={busy} className="w-full rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">Ajukan alamat untuk verifikasi ulang</button></form>}
      {status === 'WAITING_FOR_HOME' && !reminderLinkFlow && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title="Menunggu Anda tiba di rumah" text="Pengingat telah dijadwalkan. Buka kembali tautan ini saat sudah di lokasi." />}
      {status === 'REMINDER_LIMIT_REACHED' && !reminderLinkFlow && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title="Batas pengingat tercapai" text="Silakan kembali ke link ini saat sudah berada di lokasi." />}
      {status === 'ADDRESS_PROPOSED' && <ResultPanel icon={<MapPin className="h-7 w-7 text-blue-600" />} title="Alamat baru diajukan" text="Alamat baru tetap menunggu verifikasi GPS." />}
      {status === 'MANUAL_REVIEW' && <ResultPanel icon={<ShieldCheck className="h-7 w-7 text-amber-600" />} title="Sedang ditinjau tim Ops" text="Data GPS sudah diterima dan membutuhkan pemeriksaan manual." />}
      {status === 'LOCATION_VALID' && <><ResultPanel icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title="Lokasi berhasil diverifikasi" text="Alamat dan titik lokasi pemasangan telah tervalidasi." />{decision?.capturedLocation && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Koordinat: <span className="font-mono font-semibold">{decision.capturedLocation.coordinateText}</span>{decision.distanceFromReferenceMeters != null && <><br />Jarak: {decision.distanceFromReferenceMeters.toFixed(1)} meter</>}</div>}</>}
    </div><div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">Jangan bagikan tautan verifikasi ini</div>
  </div></div>;
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex min-h-screen items-center justify-center bg-gray-100 p-5 text-center">{children}</div>;
const ResultPanel: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-center"><div className="mb-2 flex justify-center">{icon}</div><p className="text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-gray-600">{text}</p></div>;
const ReminderPicker: React.FC<{ value: 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING'; onChange: (value: 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING') => void; disabled: boolean; onSubmit: () => void }> = ({ value, onChange, disabled, onSubmit }) => <div className="space-y-2 rounded-lg border border-amber-200 bg-white p-3"><label className="block text-xs font-medium text-gray-700">Pilih waktu pengingat</label><select disabled={disabled} value={value} onChange={(event) => onChange(event.target.value as typeof value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs"><option value="IN_1_HOUR">1 jam lagi</option><option value="TONIGHT">Malam ini</option><option value="TOMORROW_MORNING">Besok pagi</option></select><button disabled={disabled} onClick={onSubmit} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium"><Clock3 className="h-4 w-4" />Ingatkan saya</button></div>;
