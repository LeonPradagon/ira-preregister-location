import React from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  MapPin,
  MessageSquare,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Users,
  XCircle,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { VerificationSession } from '../../types';
import { hasCapability } from '../../lib/accessControl';

interface DashboardViewProps {
  onSelectVerification: (sessionId: string) => void;
  onSelectCustomer: (customerId: string) => void;
  onCreateVerificationClick: () => void;
  onOpenCustomerSimulator: (token: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectVerification,
  onSelectCustomer,
  onCreateVerificationClick,
  onOpenCustomerSimulator,
}) => {
  const { customers, verificationSessions, reminders, outboxEvents, validationConfig, integrationConfigs, currentAdmin } =
    useApp();
  const canCreateVerification = hasCapability(currentAdmin?.role, 'createVerification');

  // Compute Funnel Metrics (PRD Section 33.2)
  const totalCustomers = customers.length;
  const totalCreated = verificationSessions.length;
  const invitationsSent = verificationSessions.filter(
    (s) => s.verificationStatus !== 'CREATED'
  ).length;
  const linksOpened = verificationSessions.filter(
    (s) => !!s.openedAt || s.verificationStatus !== 'MESSAGE_SENT'
  ).length;
  const customersConfirmed = verificationSessions.filter(
    (s) => s.customerConfirmationStatus === 'CONFIRMED'
  ).length;
  const customersMismatch = verificationSessions.filter(
    (s) => s.customerConfirmationStatus === 'MISMATCH'
  ).length;
  const gpsCaptured = verificationSessions.filter(
    (s) => s.attemptCount > 0 || s.lastValidationResult
  ).length;
  const lowGpsAccuracyCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'LOW_GPS_ACCURACY'
  ).length;
  const waitingForHomeCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'WAITING_FOR_HOME'
  ).length;
  const addressChangedCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'ADDRESS_EDITING' || s.verificationStatus === 'ADDRESS_PROPOSED'
  ).length;
  const manualReviewCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'MANUAL_REVIEW'
  ).length;
  const locationValidCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'LOCATION_VALID'
  ).length;

  // Reminder stats
  const reminder1Count = reminders.filter((r) => r.reminderNumber === 1 && r.status === 'SENT').length;
  const reminder2Count = reminders.filter((r) => r.reminderNumber === 2 && r.status === 'SENT').length;
  const reminder3Count = reminders.filter((r) => r.reminderNumber === 3 && r.status === 'SENT').length;

  const getStatusBadge = (status: VerificationSession['verificationStatus']) => {
    switch (status) {
      case 'LOCATION_VALID':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>LOCATION_VALID</span>
          </span>
        );
      case 'WAITING_FOR_HOME':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <Clock className="w-3 h-3" />
            <span>WAITING_FOR_HOME</span>
          </span>
        );
      case 'MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <ShieldCheck className="w-3 h-3" />
            <span>MANUAL_REVIEW</span>
          </span>
        );
      case 'LOW_GPS_ACCURACY':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>LOW_GPS_ACCURACY</span>
          </span>
        );
      case 'ADDRESS_PROPOSED':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <MapPin className="w-3 h-3" />
            <span>ADDRESS_PROPOSED</span>
          </span>
        );
      case 'CUSTOMER_DATA_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <XCircle className="w-3 h-3" />
            <span>DATA_MISMATCH</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">
            Dashboard Operasional Validasi Lokasi
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Monitoring verifikasi exact coordinate customer, kecocokan alamat, dan status antrean manual review.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCreateVerificationClick}
            disabled={!canCreateVerification}
            title={!canCreateVerification ? 'Role ini hanya dapat melihat data' : undefined}
            className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white text-xs font-medium rounded-lg shadow-xs transition-all active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            <span>Buat Sesi Verifikasi Baru</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (PRD Section 33.2 Operational Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Pelanggan */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">Total Pelanggan</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{totalCustomers}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Master records</div>
        </div>

        {/* Undangan Dikirim */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">Undangan WA</span>
            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{invitationsSent}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{linksOpened} link dibuka</div>
        </div>

        {/* Konfirmasi Benar */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">Data Terkonfirmasi</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{customersConfirmed}</div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-1 font-mono">{customersMismatch} mismatch</div>
        </div>

        {/* GPS Captured */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">GPS Captured</span>
            <Compass className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </div>
          <div className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">{gpsCaptured}</div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1 font-mono">Multi-sampel</div>
        </div>

        {/* Needs Ops Review */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">Manual Review</span>
            <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="text-xl font-bold text-purple-700 dark:text-purple-400 tracking-tight">{manualReviewCount}</div>
          <div className="text-[10px] text-purple-600 dark:text-purple-400 mt-1 font-mono">Address QA queue</div>
        </div>

        {/* Location Valid */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
            <span className="text-[11px] font-medium">Location Valid</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-700 dark:text-emerald-400 tracking-tight">{locationValidCount}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-mono">{outboxEvents.length} outbox events</div>
        </div>
      </div>

      {/* Funnel Sub-Metrics & Breakdown Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-900 dark:text-white">Status Alur Verifikasi (Funnel Breakdown):</div>
          <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">Total Sesi: {totalCreated}</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">Menunggu di Rumah:</span>
            </div>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{waitingForHomeCount}</span>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">Akurasi Rendah (&gt;30m):</span>
            </div>
            <span className="font-semibold text-rose-700 dark:text-rose-400">{lowGpsAccuracyCount}</span>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">Alamat Berubah (Proposed):</span>
            </div>
            <span className="font-semibold text-blue-700 dark:text-blue-400">{addressChangedCount}</span>
          </div>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">Pengingat (1 / 2 / 3):</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {reminder1Count} / {reminder2Count} / {reminder3Count}
            </span>
          </div>
        </div>
      </div>

      {/* Future Integrations Readiness Cards (PRD Section 33.2 & Section 36) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* IRA Coverage Integration Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white">IRA Coverage Integration</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Network Polygon & Port Capacity</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 font-medium">
              PORT_READY (DISABLED)
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Adapter & event consumer contract <code className="text-gray-900 dark:text-gray-200 font-mono">location.verified.v1</code> disiapkan di Outbox. Tidak menjadi blocking dependency untuk MVP verifikasi lokasi.
          </p>
        </div>

        {/* Ticketing / Work Order System Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl space-y-2 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Ticketing / Work Order System</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Technician Dispatch & SLA</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 font-medium">
              PORT_READY (DISABLED)
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            Contract Idempotency Key & Correlation ID siap dipanggil saat customer dinyatakan eligible di fase instalasi berikutnya.
          </p>
        </div>
      </div>

      {/* Recent Verification Sessions Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
              Sesi Verifikasi Terbaru
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              Klik pada baris pelanggan untuk membuka detail verifikasi, peta visual, dan koordinat GPS.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-2.5">Pelanggan</th>
                <th className="px-4 py-2.5">No. HP</th>
                <th className="px-4 py-2.5">Status Verifikasi</th>
                <th className="px-4 py-2.5">GPS & Jarak</th>
                <th className="px-4 py-2.5">Pengingat</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {verificationSessions.map((session) => {
                const customer = customers.find((c) => c.id === session.customerId);
                const lastVal = session.lastValidationResult;

                return (
                  <tr
                    key={session.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => onSelectVerification(session.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{customer?.name || 'Pelanggan'}</div>
                      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{customer?.externalId}</div>
                    </td>

                    <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300 text-[11px]">
                      {session.registeredPhoneSnapshot}
                    </td>

                    <td className="px-4 py-3">{getStatusBadge(session.verificationStatus)}</td>

                    <td className="px-4 py-3">
                      {lastVal ? (
                        <div>
                          <div className="font-mono text-[11px] text-gray-900 dark:text-gray-200 font-medium">
                            {lastVal.capturedLocation.latitude.toFixed(6)}, {lastVal.capturedLocation.longitude.toFixed(6)}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            Jarak: {lastVal.distanceFromReferenceMeters.toFixed(1)}m • Akurasi: &plusmn;{lastVal.gpsAccuracyM}m
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-[11px] italic">Belum ada tangkapan GPS</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                        {session.reminderCount} / {validationConfig.MAX_REMINDERS_PER_SESSION}x
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onOpenCustomerSimulator(session.token)}
                        disabled={!session.token}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 text-[11px] font-medium transition-colors"
                        title={session.token ? 'Buka Tampilan Customer Mobile' : 'Token hanya tersedia saat link dibuat atau dirotasi'}
                      >
                        <Smartphone className="w-3 h-3" />
                        <span>Simulasi</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectVerification(session.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 text-[11px] font-medium transition-colors"
                      >
                        <span>Detail & Peta</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
