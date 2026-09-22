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
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';
import { formatAppDateTime } from '../../lib/dateTime';

const RefreshCw: React.FC<React.ComponentProps<typeof RefreshCwIcon>> = (props) =>
  props.className?.includes('animate-spin') ? <AppLoader size={18} label="Loading" /> : <RefreshCwIcon {...props} />;

type DashboardDestination = 'customers' | 'campaigns' | 'verifications' | 'reminders';

interface DashboardViewProps {
  onNavigate: (destination: DashboardDestination, verificationFilter?: string) => void;
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

const progressPercent = (value: number, total: number) =>
  total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const { dashboardSummary, refreshDashboard, integrationConfigs } = useApp();
  const { t } = useTranslation();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const customerStats = dashboardSummary.customers;
  const verificationStats = dashboardSummary.verifications;
  const reminderStats = dashboardSummary.reminders;
  const outboxStats = dashboardSummary.outbox;
  const totalCustomers = customerStats.total;
  const totalChecks = verificationStats.total;
  const locationValidCount = verificationStats.locationValid;
  const workflowStages = verificationStats.workflowStages;
  const workflowStageTotal = Object.values(workflowStages).reduce((sum, value) => sum + value, 0);
  const needsAttentionCount = workflowStages.teamAction;
  const matchRate = progressPercent(locationValidCount, totalChecks);
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
      label: t('verifications.workflowNotStarted'),
      value: workflowStages.notStarted,
      percent: progressPercent(workflowStages.notStarted, totalChecks),
      icon: Clock3,
      color: 'bg-slate-400',
      filter: 'WORKFLOW_NOT_STARTED',
    },
    {
      label: t('verifications.workflowInvitationSent'),
      value: workflowStages.invitationSent,
      percent: progressPercent(workflowStages.invitationSent, totalChecks),
      icon: MessageSquare,
      color: 'bg-indigo-500',
      filter: 'WORKFLOW_INVITATION_SENT',
    },
    {
      label: t('verifications.workflowLinkOpened'),
      value: workflowStages.linkOpened,
      percent: progressPercent(workflowStages.linkOpened, totalChecks),
      icon: CheckCircle2,
      color: 'bg-blue-500',
      filter: 'WORKFLOW_LINK_OPENED',
    },
    {
      label: t('verifications.workflowGpsReceived'),
      value: workflowStages.gpsReceived,
      percent: progressPercent(workflowStages.gpsReceived, totalChecks),
      icon: Compass,
      color: 'bg-violet-500',
      filter: 'WORKFLOW_GPS_RECEIVED',
    },
    {
      label: t('verifications.workflowTeamAction'),
      value: workflowStages.teamAction,
      percent: progressPercent(workflowStages.teamAction, totalChecks),
      icon: AlertTriangle,
      color: 'bg-amber-500',
      filter: 'WORKFLOW_TEAM_ACTION',
    },
    {
      label: t('verifications.workflowMatched'),
      value: workflowStages.matched,
      percent: progressPercent(workflowStages.matched, totalChecks),
      icon: MapPin,
      color: 'bg-emerald-500',
      filter: 'WORKFLOW_MATCHED',
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
          detail={`${workflowStages.matched.toLocaleString('en-US')} ${t('dashboard.locationsMatched').toLowerCase()}`}
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
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
              label={t('verifications.needsAttentionWaitingForHome')}
              description={t('verifications.caseAction.GPS_INCONSISTENT')}
              value={verificationStats.waitingForHome}
              icon={Clock3}
              colorClassName="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300"
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
            <div className="flex flex-wrap justify-end gap-2 text-xs font-semibold">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {workflowStageTotal.toLocaleString('en-US')} / {totalChecks.toLocaleString('en-US')}
              </span>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                {matchRate}% {t('dashboard.matched')}
              </span>
            </div>
          </div>
          <div className="mt-5">
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200/70 dark:bg-slate-800 dark:ring-slate-700/70">
              {progressSteps.map((step) => (
                <div
                  key={step.label}
                  className={`${step.color} min-w-0 border-r border-white/60 transition-all last:border-r-0 dark:border-slate-900/50`}
                  style={{ width: `${totalChecks > 0 ? (step.value / totalChecks) * 100 : 0}%` }}
                  title={`${step.label}: ${step.value.toLocaleString('en-US')}`}
                />
              ))}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 2xl:grid-cols-3">
              {progressSteps.map((step, index) => (
                <button
                  key={step.label}
                  type="button"
                  onClick={() => onNavigate('verifications', step.filter)}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 text-left transition hover:border-indigo-300 hover:bg-white hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:border-indigo-700 dark:hover:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                      <span className={`rounded-lg p-1.5 text-white ${step.color}`}>
                        <step.icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                          {index + 1}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold leading-4 text-slate-700 dark:text-slate-200">
                          {step.label}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                      {step.value.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                      <div className={`h-full rounded-full ${step.color}`} style={{ width: `${step.percent}%` }} />
                    </div>
                    <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
                      {step.percent}%
                    </span>
                  </div>
                </button>
              ))}
            </div>
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

    </div>
  );
};
