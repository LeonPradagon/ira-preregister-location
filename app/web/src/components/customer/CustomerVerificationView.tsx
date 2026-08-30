import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  Edit3,
  ExternalLink,
  Home,
  Info,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { GpsSample, ReminderPreference } from '../../types';
import {
  maskAddress,
  maskCustomerName,
  maskPhoneNumber,
  buildGoogleMapsDeepLink,
} from '../../lib/validationEngine';
import { VerificationMap } from '../maps/VerificationMap';

interface CustomerVerificationViewProps {
  token: string;
  onExit?: () => void;
}

export const CustomerVerificationView: React.FC<CustomerVerificationViewProps> = ({
  token,
  onExit,
}) => {
  const {
    getVerificationByToken,
    openVerificationSession,
    startAddressChange,
    confirmCustomerData,
    consentLocationCapture,
    submitLocationSamples,
    waitForHome,
    submitProposedAddress,
    requestGpsRetry,
    validationConfig,
  } = useApp();

  const ctx = getVerificationByToken(token);

  useEffect(() => {
    openVerificationSession(token);
  }, [openVerificationSession, token]);

  // Local capture states
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureProgress, setCaptureProgress] = useState(0);
  const [collectedSamples, setCollectedSamples] = useState<GpsSample[]>([]);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [simulationMode, setSimulationMode] = useState<
    'REAL_GPS' | 'SIM_AT_HOME' | 'SIM_AT_OFFICE' | 'SIM_LOW_ACCURACY' | 'SIM_NEW_ADDRESS'
  >('REAL_GPS');

  // Address edit state
  const [editForm, setEditForm] = useState({
    province: '',
    city: '',
    district: '',
    subdistrict: '',
    postalCode: '',
    street: '',
    houseNumber: '',
    rt: '',
    rw: '',
    block: '',
    unit: '',
    landmark: '',
  });

  // Selected reminder schedule
  const [selectedReminderPref, setSelectedReminderPref] =
    useState<ReminderPreference>('IN_1_HOUR');
  const [reminderSavedNotice, setReminderSavedNotice] = useState(false);

  useEffect(() => {
    if (ctx?.address) {
      setEditForm({
        province: ctx.address.province,
        city: ctx.address.city,
        district: ctx.address.district,
        subdistrict: ctx.address.subdistrict,
        postalCode: ctx.address.postalCode,
        street: ctx.address.street,
        houseNumber: ctx.address.houseNumber,
        rt: ctx.address.rt || '',
        rw: ctx.address.rw || '',
        block: ctx.address.block || '',
        unit: ctx.address.unit || '',
        landmark: ctx.address.landmark || '',
      });
    }
  }, [ctx?.address?.id]);

  if (!ctx) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl p-6 text-center shadow-sm border border-gray-200">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-900 mb-2">Tautan Tidak Valid atau Kedaluwarsa</h2>
          <p className="text-xs text-gray-600 mb-5 leading-relaxed">
            Tautan verifikasi ini tidak ditemukan atau sudah habis masa berlakunya. Silakan hubungi customer service kami untuk mendapatkan tautan baru.
          </p>
          {onExit && (
            <button
              onClick={onExit}
              className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-xs font-medium"
            >
              Kembali ke Beranda
            </button>
          )}
        </div>
      </div>
    );
  }

  const { session, customer, address } = ctx;

  // Handle GPS Multi-Sample Capture
  const handleStartGpsCapture = () => {
    setGpsError(null);
    setIsCapturing(true);
    setCaptureProgress(10);
    setCollectedSamples([]);

    if (simulationMode === 'REAL_GPS' && 'geolocation' in navigator) {
      const realSamples: GpsSample[] = [];
      let count = 0;

      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          count++;
          const sample: GpsSample = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyMeters: Math.round(pos.coords.accuracy),
            capturedAt: new Date().toISOString(),
          };
          realSamples.push(sample);
          setCollectedSamples([...realSamples]);
          setCaptureProgress(Math.min(90, count * 30));

          if (count >= 3) {
            navigator.geolocation.clearWatch(watchId);
            setIsCapturing(false);
            setCaptureProgress(100);
            try {
              submitLocationSamples(token, realSamples);
            } catch (error) {
              setGpsError(error instanceof Error ? error.message : 'Sampel GPS tidak dapat diproses.');
              setIsCapturing(false);
            }
          }
        },
        (err) => {
          setIsCapturing(false);
          setCaptureProgress(0);
          setGpsError(
            err.code === err.PERMISSION_DENIED
              ? 'Izin lokasi ditolak. Aktifkan izin lokasi browser lalu coba lagi.'
              : 'Lokasi tidak dapat diambil dari perangkat. Pastikan GPS aktif lalu coba lagi.'
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      // Simulation mode logic for immediate testing
      const simSamples: GpsSample[] = [];
      let baseLat = address.referenceLocation.latitude;
      let baseLng = address.referenceLocation.longitude;
      let baseAcc = 12;

      if (simulationMode === 'SIM_AT_OFFICE') {
        baseLat = -6.215432; // Jakarta Sudirman CBD (outside home)
        baseLng = 106.819876;
        baseAcc = 15;
      } else if (simulationMode === 'SIM_LOW_ACCURACY') {
        baseAcc = 68; // Exceeds 30m limit
      } else if (simulationMode === 'SIM_NEW_ADDRESS') {
        baseLat = -6.267812;
        baseLng = 106.61905;
        baseAcc = 16;
      }

      const timer1 = setTimeout(() => {
        setCaptureProgress(35);
        simSamples.push({
          latitude: baseLat + 0.00002,
          longitude: baseLng - 0.00001,
          accuracyMeters: baseAcc + 2,
          capturedAt: new Date().toISOString(),
        });
      }, 500);

      const timer2 = setTimeout(() => {
        setCaptureProgress(70);
        simSamples.push({
          latitude: baseLat - 0.00001,
          longitude: baseLng + 0.00002,
          accuracyMeters: baseAcc - 1,
          capturedAt: new Date().toISOString(),
        });
      }, 1100);

      const timer3 = setTimeout(() => {
        setCaptureProgress(100);
        simSamples.push({
          latitude: baseLat,
          longitude: baseLng,
          accuracyMeters: baseAcc,
          capturedAt: new Date().toISOString(),
        });
        setIsCapturing(false);
        try {
          submitLocationSamples(token, simSamples);
        } catch (error) {
          setGpsError(error instanceof Error ? error.message : 'Sampel GPS tidak dapat diproses.');
          setIsCapturing(false);
        }
      }, 1700);

      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);
      };
    }
  };

  const handleSaveProposedAddress = (e: React.FormEvent) => {
    e.preventDefault();
    // A proposed address must be forward-geocoded by the backend before it
    // can become a precise validation target. The demo intentionally leaves
    // the reference non-precise instead of inventing coordinates.
    submitProposedAddress(token, editForm);
  };

  const handleSaveReminder = () => {
    waitForHome(token, selectedReminderPref);
    setReminderSavedNotice(true);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 flex flex-col items-center justify-center p-3 sm:p-6 font-sans">
      {/* Mobile Frame Container */}
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden border border-gray-200 dark:border-gray-800 flex flex-col min-h-[640px] relative">
        {/* Top App Header */}
        <div className="bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-5 py-3.5 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center">
              <MapPin className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold tracking-tight text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>Fiber Installation</span>
                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  Exact Location
                </span>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">Verifikasi Lokasi Pemasangan</div>
            </div>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="text-[11px] bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 transition-colors font-medium"
            >
              Mode Ops
            </button>
          )}
        </div>

        {/* Demo-only scenario selector; never shown on a real public link. */}
        {onExit && <div className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-800 px-4 py-2 flex items-center justify-between text-[11px]">
          <span className="font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
            <span>Skenario Uji:</span>
          </span>
          <select
            value={simulationMode}
            onChange={(e) => setSimulationMode(e.target.value as typeof simulationMode)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 font-medium rounded-md px-2 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400"
          >
            <option value="REAL_GPS">GPS Perangkat Asli</option>
            <option value="SIM_AT_HOME">Simulasi: Di Rumah (Valid &le; 12m)</option>
            <option value="SIM_AT_OFFICE">Simulasi: Di Kantor (12km away)</option>
            <option value="SIM_LOW_ACCURACY">Simulasi: Akurasi Buruk (±68m)</option>
            <option value="SIM_NEW_ADDRESS">Simulasi: Di Alamat Baru (Proposed)</option>
          </select>
        </div>}

        {/* Main Content Area: Screen Switcher based on Session Status */}
        <div className="flex-1 p-5 overflow-y-auto flex flex-col justify-between">
          {/* SCREEN 1: Customer Data Confirmation (PRD Section 32 Screen 1) */}
          {(session.verificationStatus === 'CREATED' ||
            session.verificationStatus === 'MESSAGE_SENT' ||
            session.verificationStatus === 'LINK_OPENED' ||
            session.customerConfirmationStatus === 'UNCONFIRMED') && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div>
                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider">
                  Langkah 1 dari 3
                </span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-2">Konfirmasi Data Pemasangan</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Mohon pastikan informasi pelanggan dan alamat pemasangan di bawah ini sesuai dengan data Anda.
                </p>
              </div>

              {/* Masked Data Card (PRD Section 7.1) */}
              <div className="bg-gray-50/70 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <div className="flex items-start justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Nama Pelanggan</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white font-mono">
                    {maskCustomerName(customer.name)}
                  </span>
                </div>
                <div className="flex items-start justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs text-gray-500 dark:text-gray-400">No. HP Terdaftar</span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white font-mono">
                    {maskPhoneNumber(customer.phoneE164)}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Alamat Pemasangan</span>
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 leading-relaxed">
                    {maskAddress(address.rawAddress, address.district, address.city)}
                  </span>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex gap-2 text-xs text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                <span>
                  Jika data di atas bukan milik Anda, verifikasi tidak dapat dilanjutkan demi keamanan.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => confirmCustomerData(token, true)}
                  className="w-full py-2.5 px-4 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
                >
                  <span>Ya, Data Ini Milik Saya</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => confirmCustomerData(token, false)}
                  className="w-full py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-xs transition-colors"
                >
                  Bukan Data Saya (Laporkan)
                </button>
              </div>
            </div>
          )}

          {/* SCREEN: Customer Data Mismatch (PRD Section 7.1) */}
          {session.verificationStatus === 'CUSTOMER_DATA_MISMATCH' && (
            <div className="space-y-5 text-center py-6 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-center mx-auto shadow-xs">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Verifikasi Dihentikan</h2>
                <p className="text-xs text-gray-600 dark:text-gray-300 mt-2 px-3 leading-relaxed">
                  Anda telah menyatakan bahwa data tersebut bukan milik Anda. Sesi verifikasi ini telah dihentikan dan diteruskan ke tim Admin/Ops kami untuk pengecekan data master.
                </p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/60 p-4 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 text-left space-y-1.5">
                <div className="font-semibold text-gray-900 dark:text-white">Apa langkah selanjutnya?</div>
                <p>• Tim layanan pelanggan akan menghubungi nomor terdaftar Anda.</p>
                <p>• Tidak ada akses lokasi yang diambil dari perangkat Anda.</p>
              </div>
            </div>
          )}

          {/* SCREEN 2: Instruction & Consent (PRD Section 32 Screen 2) */}
          {session.verificationStatus === 'CONSENTED' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div>
                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider">
                  Langkah 2 dari 3
                </span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-2">Izin Lokasi GPS</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Pastikan Anda sedang berada di rumah/lokasi pemasangan saat ini.
                </p>
              </div>

              <div className="p-4 bg-gray-50/80 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center flex-shrink-0">
                    <Home className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-gray-900 dark:text-white">Verifikasi Keberadaan di Rumah</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                      Sistem akan mengambil koordinat GPS perangkat Anda untuk mencocokkan dengan alamat pemasangan.
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-700 pt-2.5 text-[11px] text-gray-600 dark:text-gray-300 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Akurasi tinggi diperlukan (&le; {validationConfig.GPS_MAX_ACCURACY_METERS} meter)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>3-5 sampel GPS diambil untuk memastikan stabilitas titik</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    consentLocationCapture(token);
                    handleStartGpsCapture();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-all active:scale-[0.99]"
                >
                  <Compass className="w-4 h-4" />
                  <span>Gunakan Lokasi Saya & Ambil GPS</span>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 3: Active GPS Multi-Sample Capturing (PRD Section 11 & 32 Screen 3) */}
          {(session.verificationStatus === 'GPS_CAPTURING' || isCapturing) && (
            <div className="space-y-6 text-center py-8 animate-in fade-in duration-300">
              <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
                <div className="w-14 h-14 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center shadow-sm relative z-10">
                  <Compass className="w-6 h-6 animate-spin" />
                </div>
              </div>

              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Mencari Lokasi GPS Anda...</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xs mx-auto">
                  Sedang mengumpulkan multi-sampel GPS berakurasi tinggi (3-5 titik)...
                </p>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gray-900 dark:bg-gray-100 h-full transition-all duration-300"
                  style={{ width: `${captureProgress}%` }}
                />
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-700 dark:text-gray-300 flex items-center justify-between">
                <span>Sampel Terkumpul:</span>
                <span className="font-mono font-semibold text-gray-900 dark:text-white">
                  {collectedSamples.length > 0 ? `${collectedSamples.length} / 3 Sampel` : 'Menginisialisasi...'}
                </span>
              </div>

              {gpsError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-lg text-xs text-rose-700 dark:text-rose-300">
                  {gpsError}
                </div>
              )}

              {!isCapturing && (
                <button
                  type="button"
                  onClick={handleStartGpsCapture}
                  className="w-full py-2.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg text-xs font-medium"
                >
                  Mulai Pengambilan Sampel Ulang
                </button>
              )}
            </div>
          )}

          {/* SCREEN: Low GPS Accuracy (PRD Section 12 & AC-05) */}
          {session.verificationStatus === 'LOW_GPS_ACCURACY' && (
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Akurasi GPS Belum Cukup Baik</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Akurasi GPS terdeteksi ±{session.lastValidationResult?.gpsAccuracyM || 68} meter (maksimum yang diizinkan ±{validationConfig.GPS_MAX_ACCURACY_METERS} meter).
                </p>
              </div>

              <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl p-3.5 text-xs text-gray-700 dark:text-gray-300 space-y-2">
                <div className="font-semibold text-gray-900 dark:text-white">Tips Meningkatkan Akurasi:</div>
                <p>1. Dekati jendela atau area terbuka luar ruangan.</p>
                <p>2. Aktifkan mode "Lokasi Akurasi Tinggi" pada pengaturan HP.</p>
                <p>3. Pastikan Wi-Fi aktif untuk membantu estimasi lokasi.</p>
              </div>

              <button
                type="button"
                onClick={() => {
                  requestGpsRetry(token);
                  handleStartGpsCapture();
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Coba Lagi Pengambilan GPS</span>
              </button>
            </div>
          )}

          {/* SCREEN 4: Location Mismatch (PRD Section 17 & 32 Screen 4) */}
          {session.verificationStatus === 'LOCATION_MISMATCH' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 rounded-xl flex items-center justify-center mx-auto">
                <MapPin className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Lokasi Anda Belum Sesuai</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  Lokasi GPS saat ini berjarak{' '}
                  <span className="font-semibold text-rose-600 dark:text-rose-400">
                    {session.lastValidationResult?.distanceFromReferenceMeters.toFixed(0) || '1200'} meter
                  </span>{' '}
                  dari alamat pemasangan yang terdaftar (batas toleransi: {validationConfig.HOME_RADIUS_METERS}m).
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-xs space-y-1">
                <div className="text-gray-500 dark:text-gray-400 text-[11px]">Alamat Terdaftar:</div>
                <div className="font-medium text-gray-900 dark:text-gray-100">{address.rawAddress}</div>
              </div>

              <p className="text-xs font-medium text-gray-900 dark:text-gray-100 text-center">
                Apakah alamat di atas masih menjadi lokasi pemasangan Anda?
              </p>

              {/* 3 Main Choice CTAs (PRD Section 17) */}
              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={() => waitForHome(token, 'IN_1_HOUR')}
                  className="w-full py-2.5 px-4 rounded-lg bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium text-xs flex items-center justify-between shadow-xs transition-colors text-left"
                >
                  <span>Alamat masih benar, saya belum di rumah</span>
                  <ArrowRight className="w-4 h-4 flex-shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    startAddressChange(token);
                  }}
                  className="w-full py-2.5 px-4 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-200 font-medium text-xs flex items-center justify-between transition-colors text-left"
                >
                  <span>Alamat saya sudah berubah (Pindah)</span>
                  <Edit3 className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    requestGpsRetry(token);
                    handleStartGpsCapture();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Saya sudah di rumah, coba ulang GPS</span>
                </button>
              </div>
            </div>
          )}

          {/* SCREEN 5A: Waiting for Home & Reminder Scheduling (PRD Section 18 & 32 Screen 5A) */}
          {(session.verificationStatus === 'WAITING_FOR_HOME' ||
            session.verificationStatus === 'REMINDER_LIMIT_REACHED') && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-xl flex items-center justify-center mx-auto border border-gray-200 dark:border-gray-700">
                <Clock className="w-6 h-6" />
              </div>
              <div className="text-center">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Lakukan Verifikasi Saat di Rumah</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Kami dapat mengirimkan pengingat melalui WhatsApp ketika Anda diperkirakan sudah berada di rumah.
                </p>
              </div>

              {/* Remaining Reminders Counter (PRD Section 18.1: Max 3x) */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between text-xs">
                <span className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span>Sisa Pengingat WhatsApp:</span>
                </span>
                 <span className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-medium px-2 py-0.5 rounded text-[11px]">
                   {Math.max(0, validationConfig.MAX_REMINDERS_PER_SESSION - session.reminderCount)} dari {validationConfig.MAX_REMINDERS_PER_SESSION}
                 </span>
               </div>

              {session.verificationStatus === 'REMINDER_LIMIT_REACHED' && (
                <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-center space-y-2">
                  <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">Batas pengingat telah tercapai</div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                    Tidak ada pengingat ke-4. Buka kembali tautan ini saat sudah berada di rumah untuk mencoba verifikasi.
                  </p>
                </div>
              )}

              {session.verificationStatus !== 'REMINDER_LIMIT_REACHED' && reminderSavedNotice ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 text-center space-y-2">
                  <CheckCircle2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">Pengingat Berhasil Dijadwalkan!</div>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-300 leading-relaxed">
                    Anda dapat menutup halaman ini sekarang. Cukup klik tautan di WhatsApp saat Anda tiba di rumah.
                  </p>
                </div>
              ) : session.verificationStatus !== 'REMINDER_LIMIT_REACHED' ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Pilih Waktu Pengingat:</label>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedReminderPref('IN_1_HOUR')}
                      className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                        selectedReminderPref === 'IN_1_HOUR'
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span>Ingatkan 1 jam lagi</span>
                      {selectedReminderPref === 'IN_1_HOUR' && (
                        <CheckCircle2 className="w-4 h-4 text-gray-900 dark:text-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedReminderPref('TONIGHT')}
                      className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                        selectedReminderPref === 'TONIGHT'
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span>Ingatkan malam ini (20:00 WIB)</span>
                      {selectedReminderPref === 'TONIGHT' && (
                        <CheckCircle2 className="w-4 h-4 text-gray-900 dark:text-white" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedReminderPref('TOMORROW_MORNING')}
                      className={`p-3 rounded-lg border text-xs font-medium flex items-center justify-between transition-all ${
                        selectedReminderPref === 'TOMORROW_MORNING'
                          ? 'border-gray-900 dark:border-gray-100 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white font-semibold'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                      }`}
                    >
                      <span>Ingatkan besok pagi (09:00 WIB)</span>
                      {selectedReminderPref === 'TOMORROW_MORNING' && (
                        <CheckCircle2 className="w-4 h-4 text-gray-900 dark:text-white" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveReminder}
                    className="w-full mt-3 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium shadow-xs transition-colors"
                  >
                    Simpan Pengingat & Selesai
                  </button>
                </div>
              ) : null}

              {session.verificationStatus !== 'REMINDER_LIMIT_REACHED' && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => {
                    requestGpsRetry(token);
                    handleStartGpsCapture();
                  }}
                  className="w-full py-2 text-xs font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  Sudah sampai rumah sekarang? Verifikasi Sekarang &rarr;
                </button>
              </div>
              )}
            </div>
          )}

          {/* SCREEN 5B: Proposed Address Editing (PRD Section 19 & 32 Screen 5B) */}
          {(session.verificationStatus === 'ADDRESS_EDITING' ||
            session.verificationStatus === 'ADDRESS_PROPOSED') && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div>
                <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[10px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider">
                  Alamat Usulan (Proposed)
                </span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-1">Ubah Alamat Pemasangan</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Alamat baru akan disimpan sebagai <span className="font-semibold text-gray-900 dark:text-white">PROPOSED</span> dan wajib diverifikasi GPS saat Anda berada di alamat baru.
                </p>
              </div>

              {session.verificationStatus === 'ADDRESS_PROPOSED' ? (
                <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Alamat Baru Berhasil Disimpan (Proposed)</span>
                  </div>
                  <p className="text-emerald-800 dark:text-emerald-300 leading-relaxed">
                    Alamat baru Anda telah dicatat. Silakan lakukan pengambilan sampel GPS saat Anda berada di lokasi baru tersebut.
                  </p>
                  <div className="bg-white dark:bg-gray-900 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 font-medium text-gray-900 dark:text-gray-100">
                    {address.rawAddress}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      requestGpsRetry(token);
                      handleStartGpsCapture();
                    }}
                    className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg font-medium shadow-xs transition-colors flex items-center justify-center gap-2 mt-2"
                  >
                    <Compass className="w-4 h-4" />
                    <span>Verifikasi GPS di Alamat Baru</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveProposedAddress} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Provinsi</label>
                      <input
                        type="text"
                        required
                        value={editForm.province}
                        onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Kota/Kabupaten</label>
                      <input
                        type="text"
                        required
                        value={editForm.city}
                        onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Kecamatan</label>
                      <input
                        type="text"
                        required
                        value={editForm.district}
                        onChange={(e) => setEditForm({ ...editForm, district: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Kelurahan/Desa</label>
                      <input
                        type="text"
                        required
                        value={editForm.subdistrict}
                        onChange={(e) => setEditForm({ ...editForm, subdistrict: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Nama Jalan / Kompleks</label>
                    <input
                      type="text"
                      required
                      placeholder="Contoh: Jl. Senopati / Cluster Faraday"
                      value={editForm.street}
                      onChange={(e) => setEditForm({ ...editForm, street: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">No. Rumah</label>
                      <input
                        type="text"
                        required
                        placeholder="Contoh: 18B"
                        value={editForm.houseNumber}
                        onChange={(e) => setEditForm({ ...editForm, houseNumber: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Blok/Unit</label>
                      <input
                        type="text"
                        placeholder="Blok F1"
                        value={editForm.block}
                        onChange={(e) => setEditForm({ ...editForm, block: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Kode Pos</label>
                      <input
                        type="text"
                        placeholder="15334"
                        value={editForm.postalCode}
                        onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })}
                        className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-gray-700 dark:text-gray-300">Patokan Lokasi (Landmark)</label>
                    <input
                      type="text"
                      placeholder="Contoh: Depan Taman / Samping Alfamart"
                      value={editForm.landmark}
                      onChange={(e) => setEditForm({ ...editForm, landmark: e.target.value })}
                      className="w-full mt-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg font-medium shadow-xs transition-colors mt-2"
                  >
                    Simpan Alamat Baru
                  </button>
                </form>
              )}
            </div>
          )}

          {/* SCREEN: Manual Review Case (PRD Section 20) */}
          {session.verificationStatus === 'MANUAL_REVIEW' && (
            <div className="space-y-4 text-center py-6 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white">Verifikasi Sedang Ditinjau Tim Ops</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 px-4 leading-relaxed">
                  Data koordinat GPS Anda telah kami terima dengan baik. Karena adanya perbedaan nama jalan/gang lokal, tim Address QA kami sedang melakukan verifikasi manual singkat.
                </p>
              </div>

              <div className="p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl text-left text-xs space-y-1.5">
                <div className="font-semibold text-gray-900 dark:text-white">Status Sesi:</div>
                <div className="text-gray-600 dark:text-gray-300">
                  Estimasi waktu review: &plusmn;10-30 menit pada jam operasional. Anda akan menerima notifikasi WhatsApp setelah selesai.
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 6: Success / Location Valid (PRD Section 32 Screen 6 & AC-04) */}
          {session.verificationStatus === 'LOCATION_VALID' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 rounded-xl flex items-center justify-center mx-auto shadow-xs">
                <CheckCircle2 className="w-6 h-6" />
              </div>

              <div className="text-center">
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-semibold px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                  Verified Location
                </span>
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mt-2">Lokasi Berhasil Diverifikasi!</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Lokasi dan alamat pemasangan Anda telah tervalidasi dengan tingkat keyakinan tinggi.
                </p>
              </div>

              {/* Exact Coordinate & Validation Receipt (PRD Section 11.1) */}
              <div className="bg-gray-50/70 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">Koordinat Terverifikasi</span>
                  <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
                    {session.lastValidationResult?.capturedLocation.coordinateText ||
                      `${address.referenceLocation.latitude.toFixed(6)}, ${address.referenceLocation.longitude.toFixed(6)}`}
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">Akurasi GPS Perangkat</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    &plusmn;{session.lastValidationResult?.gpsAccuracyM || 12} meter
                  </span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400">Jarak ke Titik Referensi</span>
                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                    {session.lastValidationResult?.distanceFromReferenceMeters.toFixed(1) || '11.2'} meter (Pass)
                  </span>
                </div>

                <div className="flex flex-col gap-1 pt-1">
                  <span className="text-gray-500 dark:text-gray-400 text-[11px]">Alamat Terverifikasi:</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 leading-relaxed bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    {address.rawAddress}
                  </span>
                </div>
              </div>

              {/* Google Maps Deep Link */}
              {session.lastValidationResult && (
                <a
                  href={session.lastValidationResult.capturedLocation.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-3 rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium text-xs flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Buka Titik di Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}

              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg text-center text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                Data Anda telah siap untuk proses penjadwalan instalasi fiber selanjutnya.
              </div>
            </div>
          )}
        </div>

        {/* Bottom Status / Footer */}
        <div className="bg-gray-50 dark:bg-gray-950 px-4 py-2.5 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
          <span>Link verifikasi terproteksi</span>
          <span>Jangan bagikan tautan ini</span>
        </div>
      </div>
    </div>
  );
};
