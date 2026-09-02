import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  MapPin,
  MessageSquare,
  Radio,
  RefreshCw,
  ShieldCheck,
  Users,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { VerificationSession } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { useTranslation } from '../../i18n';
import { userFriendlyStatus } from '../../lib/statusLabels';

type DashboardDestination = 'customers' | 'campaigns' | 'verifications' | 'reminders';

interface DashboardViewProps {
  onSelectVerification: (sessionId: string) => void;
  onNavigate: (destination: DashboardDestination) => void;
}

interface DashboardMetricCardProps {
  label: string;
  value: number;
  detail: string;
  icon: LucideIcon;
  iconClassName: string;
  valueClassName?: string;
  detailClassName?: string;
  onClick: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
  valueClassName = 'text-gray-900 dark:text-white',
  detailClassName = 'text-gray-400 dark:text-gray-500',
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-3.5 rounded-xl shadow-xs hover:border-gray-400 dark:hover:border-gray-600 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600"
  >
    <div className="flex items-center justify-between text-gray-500 dark:text-gray-400 mb-1">
      <span className="text-[11px] font-medium">{label}</span>
      <Icon className={`w-4 h-4 ${iconClassName}`} />
    </div>
    <div className={`text-xl font-bold tracking-tight ${valueClassName}`}>{value.toLocaleString('id-ID')}</div>
    <div className={`text-[10px] mt-1 font-mono ${detailClassName}`}>{detail}</div>
  </button>
);

export const DashboardView: React.FC<DashboardViewProps> = ({
  onSelectVerification,
  onNavigate,
}) => {
  const { customers, verificationSessions, dashboardSummary, refreshDashboard, validationConfig, integrationConfigs } = useApp();
  const { t } = useTranslation();
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState<TablePageSize>(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const pagedVerificationSessions = verificationSessions.slice((sessionPage - 1) * sessionPageSize, sessionPage * sessionPageSize);

  const customerStats = dashboardSummary.customers;
  const verificationStats = dashboardSummary.verifications;
  const reminderStats = dashboardSummary.reminders;
  const outboxStats = dashboardSummary.outbox;
  const totalCustomers = customerStats.total;
  const totalCreated = verificationStats.total;
  const invitationsSent = verificationStats.invitationsSent;
  const linksOpened = verificationStats.linksOpened;
  const customersConfirmed = verificationStats.customersConfirmed;
  const customersMismatch = verificationStats.customersMismatch;
  const gpsCaptured = verificationStats.gpsCaptured;
  const lowGpsAccuracyCount = verificationStats.lowGpsAccuracy;
  const waitingForHomeCount = verificationStats.waitingForHome;
  const addressChangedCount = verificationStats.addressChanged;
  const manualReviewCount = verificationStats.manualReview;
  const locationValidCount = verificationStats.locationValid;
  const reminder1Count = reminderStats.byNumber['1'] ?? 0;
  const reminder2Count = reminderStats.byNumber['2'] ?? 0;
  const reminder3Count = reminderStats.byNumber['3'] ?? 0;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDashboard();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = (status: VerificationSession['verificationStatus']) => {
    switch (status) {
      case 'LOCATION_VALID':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      case 'WAITING_FOR_HOME':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <Clock className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      case 'MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <ShieldCheck className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      case 'LOW_GPS_ACCURACY':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      case 'ADDRESS_PROPOSED':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <MapPin className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      case 'CUSTOMER_DATA_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <XCircle className="w-3 h-3" />
            <span>{userFriendlyStatus(status)}</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <span>{userFriendlyStatus(status)}</span>
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
            {t('dashboard.title')}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('dashboard.description')}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 font-mono">
            {t('dashboard.apiUpdated')}: {dashboardSummary.generatedAt ? new Date(dashboardSummary.generatedAt).toLocaleString('id-ID') : t('dashboard.loading')}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3.5 py-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-700 text-xs font-medium rounded-lg transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{t('dashboard.refresh')}</span>
          </button>
        </div>
      </div>

      {/* Primary KPI Grid (PRD Section 33.2 Operational Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DashboardMetricCard
          label={t('dashboard.totalCustomers')}
          value={totalCustomers}
          detail={`${customerStats.verified.toLocaleString('id-ID')} ${t('dashboard.verified')}`}
          icon={Users}
          iconClassName="text-gray-400"
          onClick={() => onNavigate('customers')}
        />
        <DashboardMetricCard
          label={t('dashboard.whatsappInvitations')}
          value={invitationsSent}
          detail={`${linksOpened.toLocaleString('id-ID')} ${t('dashboard.linksOpened')}`}
          icon={MessageSquare}
          iconClassName="text-emerald-600 dark:text-emerald-400"
          detailClassName="text-emerald-600 dark:text-emerald-400"
          onClick={() => onNavigate('campaigns')}
        />
        <DashboardMetricCard
          label={t('dashboard.confirmedData')}
          value={customersConfirmed}
          detail={`${customersMismatch.toLocaleString('id-ID')} ${t('dashboard.mismatch')}`}
          icon={CheckCircle2}
          iconClassName="text-emerald-600 dark:text-emerald-400"
          detailClassName="text-rose-600 dark:text-rose-400"
          onClick={() => onNavigate('verifications')}
        />
        <DashboardMetricCard
          label={t('dashboard.gpsCaptured')}
          value={gpsCaptured}
          detail={t('dashboard.multiSample')}
          icon={Compass}
          iconClassName="text-gray-600 dark:text-gray-300"
          onClick={() => onNavigate('verifications')}
        />
        <DashboardMetricCard
          label={t('dashboard.manualReview')}
          value={manualReviewCount}
          detail={t('dashboard.addressQa')}
          icon={ShieldCheck}
          iconClassName="text-purple-600 dark:text-purple-400"
          valueClassName="text-purple-700 dark:text-purple-400"
          detailClassName="text-purple-600 dark:text-purple-400"
          onClick={() => onNavigate('verifications')}
        />
        <DashboardMetricCard
          label={t('dashboard.locationValid')}
          value={locationValidCount}
          detail={`${outboxStats.total.toLocaleString('id-ID')} ${t('dashboard.outboxEvents')}`}
          icon={CheckCircle2}
          iconClassName="text-emerald-600 dark:text-emerald-400"
          valueClassName="text-emerald-700 dark:text-emerald-400"
          detailClassName="text-emerald-600 dark:text-emerald-400"
          onClick={() => onNavigate('verifications')}
        />
      </div>

      {/* Funnel Sub-Metrics & Breakdown Bar */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-4 rounded-xl space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-900 dark:text-white">{t('dashboard.funnel')}:</div>
          <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{t('dashboard.totalSessions')}: {totalCreated}</div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <button type="button" onClick={() => onNavigate('verifications')} className="w-full text-left bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.waitingAtHome')}:</span>
            </div>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{waitingForHomeCount}</span>
          </button>

          <button type="button" onClick={() => onNavigate('verifications')} className="w-full text-left bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.lowAccuracy')} (&gt;{validationConfig.GPS_MAX_ACCURACY_METERS}m):</span>
            </div>
            <span className="font-semibold text-rose-700 dark:text-rose-400">{lowGpsAccuracyCount}</span>
          </button>

          <button type="button" onClick={() => onNavigate('verifications')} className="w-full text-left bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.addressChanged')}:</span>
            </div>
            <span className="font-semibold text-blue-700 dark:text-blue-400">{addressChangedCount}</span>
          </button>

          <button type="button" onClick={() => onNavigate('reminders')} className="w-full text-left bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-between hover:border-gray-400 dark:hover:border-gray-600 transition-colors">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-600 dark:text-gray-300" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{t('dashboard.reminders')}:</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">
              {reminder1Count.toLocaleString('id-ID')} / {reminder2Count.toLocaleString('id-ID')} / {reminder3Count.toLocaleString('id-ID')}
            </span>
          </button>
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
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Pemeriksaan Jangkauan Jaringan</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Ketersediaan jaringan di sekitar lokasi</div>
              </div>
            </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-medium ${integrationConfigs.IRA_COVERAGE.enabled ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {integrationConfigs.IRA_COVERAGE.enabled ? 'Aktif' : userFriendlyStatus(integrationConfigs.IRA_COVERAGE.status)}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {integrationConfigs.IRA_COVERAGE.description}. Pembaruan pemeriksaan tetap dicatat untuk diteruskan saat koneksi tersedia.
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
                <div className="text-xs font-semibold text-gray-900 dark:text-white">Tugas Pemasangan</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">Penerusan pekerjaan ke tim teknisi</div>
              </div>
            </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md border font-medium ${integrationConfigs.TICKETING.enabled ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
              {integrationConfigs.TICKETING.enabled ? 'Aktif' : userFriendlyStatus(integrationConfigs.TICKETING.status)}
            </span>
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
            {integrationConfigs.TICKETING.description}. Data akan siap diteruskan saat koneksi sistem tersedia.
          </p>
        </div>
      </div>

      {/* Recent Verification Sessions Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
              {t('dashboard.recentSessions')}
            </h2>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {t('dashboard.recentDescription')}
            </p>
          </div>
        </div>

        <AdminTable
          minWidthClass="min-w-[950px]"
          footer={<TablePagination page={sessionPage} pageSize={sessionPageSize} total={verificationSessions.length} onPageChange={setSessionPage} onPageSizeChange={(size) => { setSessionPageSize(size); setSessionPage(1); }} />}
        >
            <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-2.5">{t('dashboard.customer')}</th>
                <th className="px-4 py-2.5">{t('dashboard.phone')}</th>
                <th className="px-4 py-2.5">{t('dashboard.verificationStatus')}</th>
                <th className="px-4 py-2.5">{t('dashboard.gpsDistance')}</th>
                <th className="px-4 py-2.5">{t('nav.reminders')}</th>
                <th className="px-4 py-2.5 text-right">{t('dashboard.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {pagedVerificationSessions.map((session) => {
                const customer = customers.find((c) => c.id === session.customerId);
                const lastVal = session.lastValidationResult;

                return (
                  <tr key={session.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors">
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
                            Jarak: {lastVal.distanceFromReferenceMeters == null ? 'Belum ada referensi' : `${lastVal.distanceFromReferenceMeters.toFixed(1)}m`} • Akurasi: &plusmn;{lastVal.gpsAccuracyM}m
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 text-[11px] italic">{t('dashboard.noGps')}</span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                        {session.reminderCount} / {validationConfig.MAX_REMINDERS_PER_SESSION}x
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => onSelectVerification(session.id)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-900 dark:bg-gray-100 hover:bg-gray-800 dark:hover:bg-white text-white dark:text-gray-900 text-[11px] font-medium transition-colors"
                      >
                        <span>{t('dashboard.detailMap')}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!pagedVerificationSessions.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-500">{t('dashboard.noSessions')}</td></tr>}
            </tbody>
        </AdminTable>
      </div>
    </div>
  );
};
