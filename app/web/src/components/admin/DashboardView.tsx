import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  MapPin,
  MessageSquare,
  Radio,
  RefreshCw as RefreshCwIcon,
  ShieldCheck,
  Users,
  Wifi,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';
import { formatAppDateTime } from '../../lib/dateTime';

const RefreshCw: React.FC<React.ComponentProps<typeof RefreshCwIcon>> = (props) =>
  props.className?.includes('animate-spin') ? <AppLoader size={18} label="Loading" /> : <RefreshCwIcon {...props} />;

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
  onClick: () => void;
}

const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  detail,
  icon: Icon,
  iconClassName,
  valueClassName = 'text-slate-900 dark:text-white',
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700"
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className={`mt-2 text-2xl font-bold tracking-tight ${valueClassName}`}>{value.toLocaleString('en-US')}</p>
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{detail}</p>
      </div>
      <span className={`rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800 ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
    </div>
    <div className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-indigo-600 opacity-0 transition group-hover:opacity-100 dark:text-indigo-400">
      <span>{'View details'}</span>
      <ChevronRight className="h-3.5 w-3.5" />
    </div>
  </button>
);

interface AttentionCardProps {
  label: string;
  description: string;
  value: number;
  icon: LucideIcon;
  colorClassName: string;
  onClick: () => void;
}

const AttentionCard: React.FC<AttentionCardProps> = ({
  label,
  description,
  value,
  icon: Icon,
  colorClassName,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
  >
    <span className={`rounded-xl p-2.5 ${colorClassName}`}>
      <Icon className="h-5 w-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</span>
      <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</span>
    </span>
    <span className="text-xl font-bold text-slate-900 dark:text-white">{value.toLocaleString('en-US')}</span>
  </button>
);

const statusText: Record<string, string> = {
  LOCATION_VALID: 'Location matched',
  WAITING_FOR_HOME: 'Waiting for customer',
  MANUAL_REVIEW: 'Needs team review',
  LOW_GPS_ACCURACY: 'Location signal is weak',
  ADDRESS_PROPOSED: 'Address needs review',
  CUSTOMER_DATA_MISMATCH: 'Customer data does not match',
  GPS_CAPTURING: 'Checking location',
  CONSENTED: 'Waiting for location permission',
  CREATED: 'Not started',
};

const getStatusText = (status: string) => statusText[status] ?? 'In progress';

const getStatusClassName = (status: string) => {
  if (status === 'LOCATION_VALID')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (['MANUAL_REVIEW', 'ADDRESS_PROPOSED', 'WAITING_FOR_HOME'].includes(status))
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  if (['LOW_GPS_ACCURACY', 'CUSTOMER_DATA_MISMATCH'].includes(status))
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

const progressPercent = (value: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

export const DashboardView: React.FC<DashboardViewProps> = ({ onSelectVerification, onNavigate }) => {
  const { customers, verificationSessions, dashboardSummary, refreshDashboard, integrationConfigs } = useApp();
  const { t } = useTranslation();
  const [sessionPage, setSessionPage] = useState(1);
  const [sessionPageSize, setSessionPageSize] = useState<TablePageSize>(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const customerStats = dashboardSummary.customers;
  const verificationStats = dashboardSummary.verifications;
  const reminderStats = dashboardSummary.reminders;
  const outboxStats = dashboardSummary.outbox;
  const totalCustomers = customerStats.total;
  const totalChecks = verificationStats.total;
  const locationValidCount = verificationStats.locationValid;
  const needsAttentionCount =
    verificationStats.manualReview +
    verificationStats.lowGpsAccuracy +
    verificationStats.addressChanged +
    verificationStats.customersMismatch;
  const matchRate = progressPercent(locationValidCount, totalChecks);
  const pagedVerificationSessions = verificationSessions.slice(
    (sessionPage - 1) * sessionPageSize,
    sessionPage * sessionPageSize,
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshDashboard();
    } finally {
      setIsRefreshing(false);
    }
  };

  const progressSteps = [
    {
      label: t('dashboard.invitationsSent'),
      value: verificationStats.invitationsSent,
      percent: 100,
      icon: MessageSquare,
      color: 'bg-indigo-500',
    },
    {
      label: t('dashboard.linksOpened'),
      value: verificationStats.linksOpened,
      percent: progressPercent(verificationStats.linksOpened, verificationStats.invitationsSent),
      icon: CheckCircle2,
      color: 'bg-blue-500',
    },
    {
      label: t('dashboard.gpsReceived'),
      value: verificationStats.gpsCaptured,
      percent: progressPercent(verificationStats.gpsCaptured, verificationStats.invitationsSent),
      icon: Compass,
      color: 'bg-violet-500',
    },
    {
      label: t('dashboard.locationsMatched'),
      value: locationValidCount,
      percent: progressPercent(locationValidCount, verificationStats.invitationsSent),
      icon: MapPin,
      color: 'bg-emerald-500',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                <Activity className="h-5 w-5" />
              </span>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('dashboard.title')}
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t('dashboard.description')}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t('dashboard.apiUpdated')}:{' '}
              {dashboardSummary.generatedAt ? formatAppDateTime(dashboardSummary.generatedAt) : t('dashboard.loading')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('dashboard.refresh')}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardMetricCard
          label={t('dashboard.totalCustomers')}
          value={totalCustomers}
          detail={`${customerStats.active.toLocaleString('en-US')} ${t('dashboard.activeCustomers')}`}
          icon={Users}
          iconClassName="text-slate-600 dark:text-slate-300"
          onClick={() => onNavigate('customers')}
        />
        <DashboardMetricCard
          label={t('dashboard.totalChecks')}
          value={totalChecks}
          detail={`${locationValidCount.toLocaleString('en-US')} ${t('dashboard.locationsMatched').toLowerCase()}`}
          icon={MapPin}
          iconClassName="text-indigo-600 dark:text-indigo-300"
          onClick={() => onNavigate('verifications')}
        />
        <DashboardMetricCard
          label={t('dashboard.needsAttention')}
          value={needsAttentionCount}
          detail={`${verificationStats.manualReview.toLocaleString('en-US')} ${t('dashboard.teamReview').toLowerCase()}`}
          icon={AlertTriangle}
          iconClassName="text-amber-600 dark:text-amber-300"
          valueClassName="text-amber-700 dark:text-amber-300"
          onClick={() => onNavigate('verifications')}
        />
        <DashboardMetricCard
          label={t('dashboard.matchRate')}
          value={matchRate}
          detail={t('dashboard.matchRateDetail')}
          icon={ShieldCheck}
          iconClassName="text-emerald-600 dark:text-emerald-300"
          valueClassName="text-emerald-700 dark:text-emerald-300"
          onClick={() => onNavigate('verifications')}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.attentionTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('dashboard.attentionDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('verifications')}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 sm:mt-0 dark:text-indigo-400"
          >
            {t('dashboard.openChecks')}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {needsAttentionCount > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <AttentionCard
              label={t('dashboard.teamReview')}
              description={t('dashboard.teamReviewDescription')}
              value={verificationStats.manualReview}
              icon={ShieldCheck}
              colorClassName="bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300"
              onClick={() => onNavigate('verifications')}
            />
            <AttentionCard
              label={t('dashboard.locationSignal')}
              description={t('dashboard.locationSignalDescription')}
              value={verificationStats.lowGpsAccuracy}
              icon={AlertTriangle}
              colorClassName="bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300"
              onClick={() => onNavigate('verifications')}
            />
            <AttentionCard
              label={t('dashboard.addressUpdates')}
              description={t('dashboard.addressUpdatesDescription')}
              value={verificationStats.addressChanged}
              icon={MapPin}
              colorClassName="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
              onClick={() => onNavigate('verifications')}
            />
            <AttentionCard
              label={t('dashboard.dataMismatch')}
              description={t('dashboard.dataMismatchDescription')}
              value={verificationStats.customersMismatch}
              icon={XCircle}
              colorClassName="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
              onClick={() => onNavigate('verifications')}
            />
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-5 w-5" />
            {t('dashboard.noAttention')}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.progressTitle')}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('dashboard.progressDescription')}</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
              {matchRate}% {t('dashboard.matched')}
            </span>
          </div>
          <div className="mt-5 space-y-4">
            {progressSteps.map((step) => (
              <div key={step.label}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200">
                    <span className={`rounded-lg p-1.5 text-white ${step.color}`}>
                      <step.icon className="h-3.5 w-3.5" />
                    </span>
                    {step.label}
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {step.value.toLocaleString('en-US')}{' '}
                    <span className="font-normal text-slate-400">({step.percent}%)</span>
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full ${step.color} transition-all`}
                    style={{ width: `${step.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.systemHealth')}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('dashboard.systemHealthDescription')}
              </p>
            </div>
            <Wifi className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-300" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('dashboard.reminderQueue')}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {reminderStats.scheduled} {t('dashboard.scheduled')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-600 dark:text-amber-300" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('dashboard.systemUpdates')}
                </span>
              </div>
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {outboxStats.pending} {t('dashboard.pending')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('dashboard.networkCoverage')}
                </span>
              </div>
              <span
                className={`text-xs font-semibold ${integrationConfigs.IRA_COVERAGE.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                {integrationConfigs.IRA_COVERAGE.enabled ? t('dashboard.connected') : t('dashboard.notConnected')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  {t('dashboard.installationTasks')}
                </span>
              </div>
              <span
                className={`text-xs font-semibold ${integrationConfigs.TICKETING.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'}`}
              >
                {integrationConfigs.TICKETING.enabled ? t('dashboard.connected') : t('dashboard.notConnected')}
              </span>
            </div>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('dashboard.recentSessions')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('dashboard.recentDescription')}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('verifications')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            {t('dashboard.viewAllChecks')}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <AdminTable
          minWidthClass="min-w-[760px]"
          footer={
            <TablePagination
              page={sessionPage}
              pageSize={sessionPageSize}
              total={verificationSessions.length}
              onPageChange={setSessionPage}
              onPageSizeChange={(size) => {
                setSessionPageSize(size);
                setSessionPage(1);
              }}
            />
          }
        >
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">{t('dashboard.customer')}</th>
              <th className="px-4 py-3">{t('dashboard.verificationStatus')}</th>
              <th className="px-4 py-3">{t('dashboard.locationResult')}</th>
              <th className="px-4 py-3 text-right">{t('dashboard.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedVerificationSessions.map((session) => {
              const customer = customers.find((item) => item.id === session.customerId);
              const lastVal = session.lastValidationResult;
              const status = session.verificationStatus;
              const result = lastVal?.result ?? '';
              return (
                <tr key={session.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">
                      {customer?.name || t('dashboard.unknownCustomer')}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {customer?.externalId || session.registeredPhoneSnapshot}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(status)}`}
                    >
                      {status === 'LOCATION_VALID' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : status === 'CUSTOMER_DATA_MISMATCH' ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : (
                        <Clock3 className="h-3.5 w-3.5" />
                      )}
                      {getStatusText(status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lastVal ? (
                      <div>
                        <div
                          className={`text-xs font-semibold ${result === 'LOCATION_VALID' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
                        >
                          {result === 'LOCATION_VALID'
                            ? t('dashboard.locationMatched')
                            : t('dashboard.locationNeedsReview')}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {lastVal.distanceFromReferenceMeters == null
                            ? t('dashboard.noReference')
                            : `${lastVal.distanceFromReferenceMeters.toFixed(1)}m away`}{' '}
                          · ±{lastVal.gpsAccuracyM}m accuracy
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">{t('dashboard.noLocation')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectVerification(session.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      {t('dashboard.viewDetails')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!pagedVerificationSessions.length && (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t('dashboard.noSessions')}
                </td>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>
    </div>
  );
};
