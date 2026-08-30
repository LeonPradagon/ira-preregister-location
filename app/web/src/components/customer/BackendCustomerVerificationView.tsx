import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Compass, Loader2, MapPin, ShieldCheck, XCircle } from 'lucide-react';
import { publicVerificationApi, PublicVerificationContextApi, ServerValidationDecision } from '../../lib/apiClient';

interface BackendCustomerVerificationViewProps { token: string; onExit?: () => void }

export const BackendCustomerVerificationView: React.FC<BackendCustomerVerificationViewProps> = ({ token, onExit }) => {
  const [context, setContext] = useState<PublicVerificationContextApi | null>(null);
  const [decision, setDecision] = useState<ServerValidationDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setContext(await publicVerificationApi.context(token));
  };

  useEffect(() => {
    void refresh().catch((cause) => setError(cause instanceof Error ? cause.message : 'Tautan tidak dapat dibuka.'));
  }, [token]);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Permintaan tidak dapat diproses.'); }
    finally { setBusy(false); }
  };

  const captureGps = async () => {
    if (!navigator.geolocation) { setError('Browser tidak mendukung pengambilan lokasi.'); return; }
    setBusy(true); setError(null);
    try {
      const samples = [];
      for (let index = 0; index < 3; index += 1) {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }));
        samples.push({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracyMeters: position.coords.accuracy, capturedAt: new Date().toISOString() });
        if (index < 2) await new Promise((resolve) => window.setTimeout(resolve, 500));
      }
      const result = await publicVerificationApi.submitLocation(token, samples);
      setDecision(result);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sampel GPS tidak dapat diproses.');
    } finally { setBusy(false); }
  };

  if (error && !context) return <Panel><XCircle className="mx-auto mb-3 h-12 w-12 text-rose-500" /><h2 className="text-base font-semibold">Tautan tidak valid</h2><p className="mt-2 text-xs text-gray-600">{error}</p></Panel>;
  if (!context) return <Panel><Loader2 className="mx-auto h-8 w-8 animate-spin text-gray-500" /><p className="mt-3 text-xs text-gray-600">Memuat verifikasi...</p></Panel>;

  const status = context.session.status;
  const confirmed = context.session.customerConfirmationStatus === 'CONFIRMED';
  const showGps = confirmed && ['GPS_CAPTURING', 'LOW_GPS_ACCURACY', 'LOCATION_MISMATCH', 'REMINDER_LIMIT_REACHED'].includes(status);

  return <div className="min-h-screen bg-gray-100 p-3 sm:p-6"><div className="mx-auto flex min-h-[640px] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4"><div className="flex items-center gap-2"><MapPin className="h-5 w-5" /><span className="text-sm font-semibold">Verifikasi Lokasi</span></div>{onExit && <button className="text-xs text-gray-500" onClick={onExit}>Kembali</button>}</div>
    <div className="flex-1 space-y-4 p-5">
      <div><p className="text-xs text-gray-500">Halo, {context.customer.name}</p><h1 className="mt-1 text-lg font-semibold text-gray-900">Konfirmasi lokasi pemasangan</h1></div>
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs"><p className="font-medium text-gray-500">Alamat terdaftar</p><p className="mt-2 font-semibold leading-relaxed text-gray-900">{context.address.rawAddress}</p><p className="mt-2 text-gray-500">Telepon: {context.customer.phoneE164}</p></div>
      {error && <div className="flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
      {!confirmed && <div className="space-y-3"><p className="text-sm text-gray-700">Apakah data dan alamat di atas benar milik Anda?</p><div className="grid grid-cols-2 gap-2"><button disabled={busy} onClick={() => void run(() => publicVerificationApi.confirm(token, false))} className="rounded-lg border border-gray-300 px-3 py-3 text-xs font-medium">Bukan data saya</button><button disabled={busy} onClick={() => void run(() => publicVerificationApi.confirm(token, true))} className="rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">Ya, benar</button></div></div>}
      {status === 'CONSENTED' && <div className="space-y-3"><div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">Kami membutuhkan izin lokasi browser untuk memvalidasi Anda berada di alamat tersebut.</div><button disabled={busy} onClick={() => void run(() => publicVerificationApi.consent(token))} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white"><ShieldCheck className="h-4 w-4" />Izinkan dan mulai verifikasi GPS</button></div>}
      {showGps && <div className="space-y-3"><p className="text-xs text-gray-600">Ambil 3 sampel GPS dengan akurasi terbaik. Pastikan Anda berada di lokasi pemasangan.</p><button disabled={busy} onClick={() => void captureGps()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-3 py-3 text-xs font-medium text-white">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Compass className="h-4 w-4" />}Ambil 3 sampel lokasi</button><button disabled={busy || status === 'REMINDER_LIMIT_REACHED'} onClick={() => void run(() => publicVerificationApi.waitForHome(token, 'IN_1_HOUR'))} className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-3 text-xs font-medium"><Clock3 className="h-4 w-4" />Saya belum di rumah</button></div>}
      {status === 'CUSTOMER_DATA_MISMATCH' && <ResultPanel icon={<XCircle className="h-7 w-7 text-rose-600" />} title="Data perlu diperbarui" text="Hubungi customer service untuk memperbarui data sebelum verifikasi dilanjutkan." />}
      {status === 'WAITING_FOR_HOME' && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title="Menunggu Anda tiba di rumah" text="Pengingat WhatsApp telah dijadwalkan." />}
      {status === 'REMINDER_LIMIT_REACHED' && <ResultPanel icon={<Clock3 className="h-7 w-7 text-amber-600" />} title="Batas pengingat tercapai" text="Silakan kembali ke link ini saat sudah berada di lokasi." />}
      {status === 'MANUAL_REVIEW' && <ResultPanel icon={<ShieldCheck className="h-7 w-7 text-amber-600" />} title="Sedang ditinjau tim Ops" text="Data GPS sudah diterima dan membutuhkan pemeriksaan manual." />}
      {status === 'LOCATION_VALID' && <><ResultPanel icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title="Lokasi berhasil diverifikasi" text="Alamat dan titik lokasi pemasangan telah tervalidasi." />{decision?.capturedLocation && <div className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">Koordinat: <span className="font-mono font-semibold">{decision.capturedLocation.coordinateText}</span><br />Jarak: {decision.distanceFromReferenceMeters.toFixed(1)} meter</div>}</>}
      {(status === 'LOW_GPS_ACCURACY' || status === 'LOCATION_MISMATCH') && <p className="text-xs text-amber-700">Hasil sebelumnya belum memenuhi aturan validasi. Coba lagi saat berada di lokasi dan GPS lebih stabil.</p>}
    </div>
    <div className="border-t border-gray-200 bg-gray-50 px-5 py-3 text-center text-[10px] text-gray-500">Jangan bagikan tautan verifikasi ini</div>
  </div></div>;
};

const Panel: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="flex min-h-screen items-center justify-center bg-gray-100 p-5 text-center">{children}</div>;
const ResultPanel: React.FC<{ icon: React.ReactNode; title: string; text: string }> = ({ icon, title, text }) => <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 text-center"><div className="mb-2 flex justify-center">{icon}</div><p className="text-sm font-semibold text-gray-900">{title}</p><p className="mt-1 text-xs leading-relaxed text-gray-600">{text}</p></div>;
