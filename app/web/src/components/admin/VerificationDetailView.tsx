import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Edit3,
  ExternalLink,
  HelpCircle,
  Home,
  Info,
  MapPin,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ReviewDecision, VerificationSession } from '../../types';
import { VerificationMap } from '../maps/VerificationMap';
import { buildGoogleMapsDeepLink, formatAddressForDisplay, formatCoordinatePair } from '../../lib/validationEngine';
import { hasCapability } from '../../lib/accessControl';
import { AdminTable } from '../common/AdminTable';
import { useTranslation } from '../../i18n';

interface VerificationDetailViewProps {
  sessionId: string;
  onBack: () => void;
}

export const VerificationDetailView: React.FC<VerificationDetailViewProps> = ({
  sessionId,
  onBack,
}) => {
  const {
    verificationSessions,
    customers,
    addresses,
    reminders,
    locationCaptures,
    auditLogs,
    loadVerificationDetail,
    currentAdmin,
    performManualReview,
    resendInvitation,
    sendManualReminder,
    validationConfig,
  } = useApp();
  const { t } = useTranslation();
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetailLoading(true);
    setDetailError(null);
    void loadVerificationDetail(sessionId)
      .catch((cause) => { if (active) setDetailError(cause instanceof Error ? cause.message : 'Detail sesi gagal dimuat.'); })
      .finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [sessionId]);

  const session = verificationSessions.find((s) => s.id === sessionId);
  const customer = session ? customers.find((c) => c.id === session.customerId) : null;
  const address = session ? addresses.find((a) => a.id === session.currentAddressId) : null;
  const masterAddress = customer
    ? addresses.find((a) => a.customerId === customer.id && a.addressType === 'MASTER')
    : null;
  const proposedAddress = customer
    ? addresses.find((a) => a.customerId === customer.id && a.addressType === 'PROPOSED')
    : null;

  const sessionReminders = reminders.filter((r) => r.sessionId === sessionId);
  const sessionCaptures = locationCaptures.filter((capture) => capture.sessionId === sessionId);
  const sessionAudits = auditLogs.filter(
    (l) => l.entityId === sessionId || (session?.lastValidationResult && l.entityId === session.lastValidationResult.id)
  );

  // Copy state helpers
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Manual review modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>('APPROVE');
  const [reviewReasonCode, setReviewReasonCode] = useState('REFERENCE_LOCATION_VERIFIED_MANUAL');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewError, setReviewError] = useState('');

  // Reminder trigger toast
  const [reminderFeedback, setReminderFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  if (!session || !customer || !address) {
    return (
      <div className="p-8 text-center bg-slate-950 rounded-2xl border border-slate-800 text-slate-400">
        {detailLoading || !detailError ? 'Memuat detail sesi verifikasi...' : `Detail sesi tidak dapat dimuat: ${detailError}`}
        <button onClick={onBack} className="block mx-auto mt-4 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs">
          Kembali
        </button>
      </div>
    );
  }

  const lastVal = session.lastValidationResult;
  const capturedLoc = lastVal?.capturedLocation;
  const refLoc = address.referenceLocation;

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleSendManualReminder = async () => {
    const res = await sendManualReminder(session.id);
    if (res.success) {
      setReminderFeedback({ type: 'success', message: res.message });
    } else {
      setReminderFeedback({ type: 'error', message: res.message });
    }
    setTimeout(() => setReminderFeedback(null), 4000);
  };

  const handleExecuteReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewNote.trim()) {
      setReviewError('Catatan review (Review Note) wajib diisi untuk kepatuhan audit trail.');
      return;
    }

    await performManualReview(session.id, reviewDecision, reviewReasonCode, reviewNote.trim());
    setReviewModalOpen(false);
    setReviewNote('');
    setReviewError('');
  };

  // RBAC permission check for manual review
  const canPerformReview =
    currentAdmin?.role === 'SUPER_ADMIN' ||
    currentAdmin?.role === 'ADMIN' ||
    currentAdmin?.role === 'REVIEWER';
  const canSendVerification = hasCapability(currentAdmin?.role, 'sendVerification');

  return (
    <div className="space-y-4">
      {/* Top Header with Back Navigation & Action Buttons */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors border border-gray-300 dark:border-gray-700 shadow-xs"
            title="Kembali ke Daftar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
                Verifikasi: {customer.name}
              </h1>
              <span className="font-mono text-[11px] text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                {customer.externalId}
              </span>
              <span className="text-[11px] font-mono font-medium px-2.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                {session.verificationStatus}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Sesi ID: <code className="font-mono text-gray-700 dark:text-gray-300">{session.id}</code> • Dibuat:{' '}
              {new Date(session.createdAt).toLocaleString('id-ID')}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Resend WhatsApp Link */}
          <button
            type="button"
            onClick={() => resendInvitation(session.id)}
            disabled={!canSendVerification}
            title={!canSendVerification ? 'Role ini tidak dapat mengirim ulang undangan' : 'Kirim ulang undangan WhatsApp'}
            className="px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
            <span>Kirim Ulang Undangan</span>
          </button>

          {/* Manual Review Button */}
          {canPerformReview &&
            (session.verificationStatus === 'MANUAL_REVIEW' ||
              session.verificationStatus === 'CUSTOMER_DATA_MISMATCH') && (
            <button
              type="button"
              onClick={() => setReviewModalOpen(true)}
              className="px-3.5 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium shadow-xs flex items-center gap-1.5 transition-all"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Review Manual Ops</span>
            </button>
          )}
        </div>
      </div>

      {/* Reminder Action Feedback */}
      {reminderFeedback && (
        <div
          className={`p-3 rounded-lg text-xs font-medium flex items-center justify-between animate-in fade-in ${
            reminderFeedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300'
          }`}
        >
          <span>{reminderFeedback.message}</span>
          <button onClick={() => setReminderFeedback(null)} className="p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* DUAL PANEL LAYOUT (PRD Section 33.4) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* LEFT PANEL: Customer & Address Evidence Data (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* Customer Master Info Card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-gray-100 dark:border-gray-800">
              <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <User className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span>Identitas Pelanggan (Person Link)</span>
              </div>
              <span
                className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  session.customerConfirmationStatus === 'CONFIRMED'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : session.customerConfirmationStatus === 'MISMATCH'
                      ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                }`}
              >
                {session.customerConfirmationStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-[11px]">Nama Lengkap</span>
                <span className="font-semibold text-gray-900 dark:text-white">{customer.name}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-[11px]">No. Telepon Terdaftar</span>
                <span className="font-mono text-gray-800 dark:text-gray-200">{session.registeredPhoneSnapshot}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-[11px]">Status Akun</span>
                <span className="font-semibold text-gray-900 dark:text-white">{customer.status}</span>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400 block text-[11px]">Masa Berlaku Token</span>
                <span className="text-gray-700 dark:text-gray-300 text-[11px]">
                  {new Date(session.expiresAt).toLocaleDateString('id-ID')}
                </span>
              </div>
            </div>
          </div>

          {/* Master vs Proposed Address Card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3.5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Home className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                <span>Data Alamat Master & Referensi</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                {address.referencePrecision}
              </span>
            </div>

            <div className="text-xs space-y-2">
              <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">
                  Alamat Aktif Saat Ini ({address.addressType}):
                </span>
                <p className="font-medium text-gray-900 dark:text-white leading-relaxed">{formatAddressForDisplay(address.rawAddress)}</p>
              </div>

              {address.landmark && (
                <div className="text-[11px] text-gray-600 dark:text-gray-400 flex items-start gap-1.5 px-1">
                  <Info className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0 mt-0.5" />
                  <span>Patokan (Landmark): {address.landmark}</span>
                </div>
              )}

              {/* Hierarchy tags */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 block">Kecamatan / Kelurahan:</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {address.district} / {address.subdistrict}
                  </span>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                  <span className="text-gray-500 dark:text-gray-400 block">Kota / Provinsi:</span>
                  <span className="text-gray-900 dark:text-white font-medium">
                    {address.city}, {address.province}
                  </span>
                </div>
              </div>

              {/* Proposed Address Alert if any */}
              {proposedAddress && proposedAddress.id !== address.id && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg space-y-1">
                  <div className="text-xs font-semibold text-blue-900 dark:text-blue-300 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
                    <span>Ada Usulan Alamat Baru (PROPOSED):</span>
                  </div>
                  <p className="text-[11px] text-blue-800 dark:text-blue-200 leading-relaxed">
                    {formatAddressForDisplay(proposedAddress.rawAddress)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Reminder History & Policy (PRD Section 18) */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>Riwayat Pengingat WhatsApp ({session.reminderCount} / {validationConfig.MAX_REMINDERS_PER_SESSION})</span>
              </div>
              <button
                type="button"
                onClick={handleSendManualReminder}
                disabled={session.reminderCount >= validationConfig.MAX_REMINDERS_PER_SESSION}
                className="text-[11px] px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/40 disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 rounded-lg font-medium transition-colors flex items-center gap-1"
              >
                <Bell className="w-3 h-3" />
                <span>Kirim Reminder Manual</span>
              </button>
            </div>

            {sessionReminders.length > 0 ? (
              <div className="space-y-2">
                {sessionReminders.map((rem) => (
                  <div
                    key={rem.id}
                    className="p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        Pengingat #{rem.reminderNumber} ({rem.channel})
                      </span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-medium ${
                          rem.status === 'SENT'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {rem.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                      Jadwal: {new Date(rem.scheduledAt).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-2">
                Belum ada pengingat terjadwal untuk sesi ini.
              </div>
            )}
          </div>

          {/* GPS attempt evidence, including raw multi-sample count */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="text-xs font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Compass className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <span>Riwayat Capture GPS ({sessionCaptures.length})</span>
            </div>
            {sessionCaptures.length > 0 ? (
              <div className="space-y-2">
                {sessionCaptures.map((capture, index) => (
                  <div key={capture.id} className="p-2.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px]">
                    <div className="flex items-center justify-between font-mono text-gray-900 dark:text-white">
                      <span>Percobaan #{sessionCaptures.length - index}</span>
                      <span>{capture.sampleCount} samples</span>
                    </div>
                    <div className="mt-1 text-gray-500 dark:text-gray-400">
                      {capture.latitude.toFixed(6)}, {capture.longitude.toFixed(6)} · ±{capture.accuracyMeters}m · {new Date(capture.serverTimestamp).toLocaleString('id-ID')}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic">Belum ada evidence capture GPS.</div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Map / GPS / Validation Engine Breakdown (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Explicit GPS Coordinates & Copyable Data (PRD Section 11.1 & AC-11) */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Hasil Tangkapan GPS Customer</span>
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                  Koordinat eksplisit dengan presisi 6 digit desimal dan akurasi perangkat.
                </div>
              </div>

              {capturedLoc && (
                <a
                  href={capturedLoc.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-medium transition-colors shadow-xs"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>

            {capturedLoc ? (
              <div className="space-y-3">
                {/* 4 Coordinate Badges with Individual Copy Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  {/* Latitude */}
                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-mono block">Latitude:</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-white text-xs">
                        {capturedLoc.latitude.toFixed(validationConfig.COORDINATE_DISPLAY_DECIMALS)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          capturedLoc.latitude.toFixed(validationConfig.COORDINATE_DISPLAY_DECIMALS),
                          'lat'
                        )
                      }
                      className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
                      title="Salin Latitude"
                    >
                      {copiedKey === 'lat' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Longitude */}
                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-mono block">Longitude:</span>
                      <span className="font-mono font-bold text-gray-900 dark:text-white text-xs">
                        {capturedLoc.longitude.toFixed(validationConfig.COORDINATE_DISPLAY_DECIMALS)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        copyToClipboard(
                          capturedLoc.longitude.toFixed(validationConfig.COORDINATE_DISPLAY_DECIMALS),
                          'lng'
                        )
                      }
                      className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
                      title="Salin Longitude"
                    >
                      {copiedKey === 'lng' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Combined Lat,Lng Copy Button */}
                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-mono block">Combined Lat,Lng:</span>
                      <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs truncate max-w-[130px] block">
                        {capturedLoc.coordinateText}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(capturedLoc.coordinateText, 'latlng')}
                      className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
                      title="Salin Pasangan Lat,Lng"
                    >
                      {copiedKey === 'latlng' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Device Accuracy & Distance vs Toleransi Rumah */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-[10px] block">Akurasi GPS (Radius):</span>
                    <span
                      className={`font-mono font-bold ${
                        capturedLoc.accuracyMeters <= validationConfig.GPS_MAX_ACCURACY_METERS
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      &plusmn;{capturedLoc.accuracyMeters} meter
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-[10px] block">Jarak ke Rumah:</span>
                    <span className="font-mono font-bold text-gray-900 dark:text-white">
                      {lastVal?.distanceFromReferenceMeters == null ? 'Belum ada referensi' : `${lastVal.distanceFromReferenceMeters.toFixed(1)} meter`}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-[10px] block">Batas Radius Rumah:</span>
                    <span className="font-mono font-bold text-gray-900 dark:text-white">
                      &le; {validationConfig.HOME_RADIUS_METERS} meter
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-gray-800/60 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
                    <span className="text-gray-500 dark:text-gray-400 text-[10px] block">Waktu Tangkapan:</span>
                    <span className="font-mono text-gray-600 dark:text-gray-300 text-[10px]">
                      {new Date(capturedLoc.capturedAt).toLocaleTimeString('id-ID')}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
                Customer belum melakukan pengambilan koordinat GPS.
              </div>
            )}

            {/* Interactive Leaflet Map (PRD Section 11.3 & AC-11) */}
            <div className="pt-2">
          <VerificationMap
                referenceLocation={refLoc}
                referenceLabel={formatAddressForDisplay(address.rawAddress)}
                referencePrecision={address.referencePrecision}
                capturedLocation={capturedLoc}
                capturedLabel={`Customer: ${customer.name}`}
                homeRadiusMeters={validationConfig.HOME_RADIUS_METERS}
                distanceMeters={lastVal?.distanceFromReferenceMeters}
                isMatch={lastVal?.result === 'LOCATION_VALID'}
                heightClass="h-[340px]"
              />
            </div>
          </div>

          {/* Validation Engine Signals Breakdown (PRD Section 15 & Section 33.4 Table) */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
            <div className="p-3.5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
                Rincian Keputusan Mesin Validasi (Decision Breakdown)
              </h3>
              <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
                Engine v1.1.0 • Rule 2026-09
              </span>
            </div>

            <AdminTable embedded minWidthClass="min-w-[760px]">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-3.5 py-2">{t('table.signal')}</th>
                    <th className="px-3.5 py-2">{t('table.masterReference')}</th>
                    <th className="px-3.5 py-2">{t('table.deviceGeo')}</th>
                    <th className="px-3.5 py-2 text-right">{t('table.evaluation')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Latitude</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">{refLoc ? refLoc.latitude.toFixed(6) : 'Tidak tersedia'}</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">
                      {capturedLoc ? capturedLoc.latitude.toFixed(6) : '-'}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">ST_Point(lng,lat)</td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Longitude</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">{refLoc ? refLoc.longitude.toFixed(6) : 'Tidak tersedia'}</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">
                      {capturedLoc ? capturedLoc.longitude.toFixed(6) : '-'}
                    </td>
                    <td className="px-3.5 py-2 text-right font-mono text-[11px] text-gray-500 dark:text-gray-400">PostGIS Geog</td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Provinsi</td>
                    <td className="px-3.5 py-2">{address.province}</td>
                    <td className="px-3.5 py-2">{address.province}</td>
                    <td className="px-3.5 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">Match</td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Kota / Kabupaten</td>
                    <td className="px-3.5 py-2">{address.city}</td>
                    <td className="px-3.5 py-2">{address.city}</td>
                    <td className="px-3.5 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">Match</td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Kecamatan</td>
                    <td className="px-3.5 py-2">{address.district}</td>
                    <td className="px-3.5 py-2">{address.district}</td>
                    <td className="px-3.5 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">Match (20%)</td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Nama Jalan / Kompleks</td>
                    <td className="px-3.5 py-2">{address.street}</td>
                    <td className="px-3.5 py-2">{address.street}</td>
                    <td className="px-3.5 py-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {lastVal ? `${Math.round(lastVal.streetScore * 100)}% Match` : 'Belum ada hasil'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Akurasi GPS Device</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">&le; {validationConfig.GPS_MAX_ACCURACY_METERS}m</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">
                      {lastVal ? `±${lastVal.gpsAccuracyM}m` : 'Belum ada tangkapan'}
                    </td>
                    <td
                      className={`px-3.5 py-2 text-right font-semibold ${
                        lastVal != null && lastVal.gpsAccuracyM <= validationConfig.GPS_MAX_ACCURACY_METERS
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {lastVal == null ? '—' : lastVal.gpsAccuracyM <= validationConfig.GPS_MAX_ACCURACY_METERS ? 'PASS' : 'FAIL'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3.5 py-2 font-medium text-gray-900 dark:text-white">Jarak vs Toleransi Rumah</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">&le; {validationConfig.HOME_RADIUS_METERS}m</td>
                    <td className="px-3.5 py-2 font-mono text-[11px]">
                      {lastVal?.distanceFromReferenceMeters == null ? 'Belum ada referensi' : `${lastVal.distanceFromReferenceMeters.toFixed(1)}m`}
                    </td>
                    <td
                      className={`px-3.5 py-2 text-right font-semibold ${
                        lastVal?.distanceFromReferenceMeters != null && lastVal.distanceFromReferenceMeters <= validationConfig.HOME_RADIUS_METERS
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {lastVal?.distanceFromReferenceMeters != null && lastVal.distanceFromReferenceMeters <= validationConfig.HOME_RADIUS_METERS
                        ? 'PASS'
                        : 'FAIL'}
                    </td>
                  </tr>
                </tbody>
            </AdminTable>
          </div>
        </div>
      </div>

      {/* MANUAL REVIEW MODAL (PRD Section 20.2 & AC-08) */}
      {reviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-lg w-full rounded-2xl shadow-xl overflow-hidden">
            <div className="bg-white dark:bg-gray-900 px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Manual Review Keputusan Ops</h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    Kepatuhan Audit: Keputusan wajib menyertakan alasan dan catatan review.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleExecuteReview} className="p-5 space-y-4 text-xs">
              {reviewError && (
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 rounded-lg">
                  {reviewError}
                </div>
              )}

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1.5">Pilih Keputusan (Decision):</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('APPROVE');
                      setReviewReasonCode('MANUAL_APPROVAL_PRECISION_PASS');
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      reviewDecision === 'APPROVE'
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 font-semibold'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>APPROVE (Valid)</span>
                      {reviewDecision === 'APPROVE' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Setujui lokasi &amp; alamat valid</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('REJECT');
                      setReviewReasonCode('LOCATION_MISMATCH_REJECTED');
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      reviewDecision === 'REJECT'
                        ? 'border-rose-600 bg-rose-50 dark:bg-rose-950/50 text-rose-900 dark:text-rose-200 font-semibold'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>REJECT (Mismatch)</span>
                      {reviewDecision === 'REJECT' && <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Tolak hasil &amp; minta customer ke rumah</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('REQUEST_RETRY');
                      setReviewReasonCode('GPS_RETRY_REQUESTED_BY_OPS');
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      reviewDecision === 'REQUEST_RETRY'
                        ? 'border-gray-900 dark:border-gray-400 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>REQUEST RETRY</span>
                      {reviewDecision === 'REQUEST_RETRY' && <RefreshCw className="w-3.5 h-3.5 text-gray-900 dark:text-white" />}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Minta customer ambil GPS ulang</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setReviewDecision('REQUEST_ADDRESS_UPDATE');
                      setReviewReasonCode('ADDRESS_UPDATE_REQUIRED');
                    }}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      reviewDecision === 'REQUEST_ADDRESS_UPDATE'
                        ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/50 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>REQUEST UPDATE</span>
                      {reviewDecision === 'REQUEST_ADDRESS_UPDATE' && <Edit3 className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Minta customer update alamat</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">Kode Alasan (Reason Code):</label>
                <select
                  value={reviewReasonCode}
                  onChange={(e) => setReviewReasonCode(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
                >
                  <option value="MANUAL_APPROVAL_PRECISION_PASS">MANUAL_APPROVAL_PRECISION_PASS (Sesuai patokan satelit/cluster)</option>
                  <option value="STREET_ALIAS_VERIFIED">STREET_ALIAS_VERIFIED (Nama jalan memiliki alias resmi)</option>
                  <option value="LOCATION_MISMATCH_REJECTED">LOCATION_MISMATCH_REJECTED (Titik terlalu jauh dari master)</option>
                  <option value="GPS_ACCURACY_INSUFFICIENT">GPS_ACCURACY_INSUFFICIENT (Akurasi melewati konfigurasi)</option>
                  <option value="ADDRESS_UPDATE_REQUIRED">ADDRESS_UPDATE_REQUIRED (Alamat master tidak akurat)</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-1">
                  Catatan Reviewer Wajib (Review Note):
                </label>
                <textarea
                  required
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                  placeholder="Tuliskan justifikasi detail verifikasi visual terhadap peta dan data master..."
                  className="w-full p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300 placeholder-gray-400 dark:placeholder-gray-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setReviewModalOpen(false)}
                  className="px-4 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg font-medium shadow-xs transition-colors"
                >
                  Simpan Keputusan Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
