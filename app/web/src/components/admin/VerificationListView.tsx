import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleHelp,
  ChevronDown,
  Clock3,
  Compass,
  Edit3,
  ExternalLink,
  Filter,
  MapPin,
  RefreshCw as RefreshCwIcon,
  Search,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { mapApiAddress, mapApiCustomer, mapApiSession, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, CustomerAddress, VerificationSession } from '../../types';
import { formatAppDateTime } from '../../lib/dateTime';
import { formatAddressForDisplay } from '../../lib/validationEngine';
import { isLocationMatched, userFriendlyReason, userFriendlyStatus } from '../../lib/statusLabels';
import { getManualReviewCaseKeys } from '../../lib/manualReviewCases';
import {
  AdminTable,
  SortableTableHeader,
  sortTableRows,
  TablePagination,
  TablePageSize,
  TableSortDirection,
} from '../common/AdminTable';
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';

const RefreshCw: React.FC<React.ComponentProps<typeof RefreshCwIcon>> = (props) =>
  props.className?.includes('animate-spin') ? <AppLoader size={18} label="Loading" /> : <RefreshCwIcon {...props} />;

const numberFormat = new Intl.NumberFormat('id-ID');

const Metric: React.FC<{
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
  onClick?: () => void;
  expanded?: boolean;
}> = ({
  label,
  value,
  icon,
  tone,
  onClick,
  expanded = false,
}) => {
  const content = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{numberFormat.format(value)}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-xl p-2.5 ${tone}`}>{icon}</span>
        {onClick && <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />}
      </div>
    </div>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-expanded={expanded}
        className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-700 dark:hover:bg-amber-950/20"
      >
        {content}
      </button>
    );
  }

  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">{content}</div>;
};

interface VerificationListViewProps {
  onSelectVerification: (sessionId: string) => void;
}

interface VerificationListRow {
  session: VerificationSession;
  customer: Customer;
  address: CustomerAddress;
}

const statusValues = [
  'LOCATION_VALID',
  'WAITING_FOR_HOME',
  'LOW_GPS_ACCURACY',
  'LOCATION_MISMATCH',
  'ADDRESS_PROPOSED',
  'ADDRESS_EDITING',
  'CUSTOMER_DATA_MISMATCH',
  'REMINDER_REQUIRED',
  'REMINDER_LIMIT_REACHED',
  'GPS_CAPTURING',
  'CONSENTED',
  'LINK_OPENED',
  'MESSAGE_SENT',
  'CREATED',
  'EXPIRED',
];

const quickFilterValues = new Set([
  'WAITING_FOR_CUSTOMER',
  'NEEDS_ATTENTION',
  'ADDRESS_CHANGED',
  'LOCATION_VALID',
  'REMINDER_LIMIT_REACHED',
]);

const getStatusLabel = (status: string, t: (key: string) => string) => {
  const translated = t(`customers.checkStatus.${status}`);
  return translated === `customers.checkStatus.${status}` ? userFriendlyStatus(status) : translated;
};

const getFilterLabel = (status: string, t: (key: string) => string) => {
  const quickFilterLabels: Record<string, string> = {
    WAITING_FOR_CUSTOMER: t('verifications.waitingForCustomerFilter'),
    NEEDS_ATTENTION: t('verifications.teamActionFilter'),
    ADDRESS_CHANGED: t('verifications.addressChangeFilter'),
    LOCATION_VALID: t('verifications.verifiedFilter'),
    REMINDER_LIMIT_REACHED: t('verifications.reminderLimitFilter'),
  };
  return quickFilterLabels[status] ?? getStatusLabel(status, t);
};

const getEnumLabel = (value: string | null | undefined, key: string, t: (key: string) => string) => {
  if (!value) return '—';
  const translated = t(`${key}.${value}`);
  return translated === `${key}.${value}` ? value.replaceAll('_', ' ') : translated;
};

const getStatusClassName = (status: string) => {
  if (status === 'LOCATION_VALID')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (['MANUAL_REVIEW', 'ADDRESS_PROPOSED', 'WAITING_FOR_HOME'].includes(status))
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  if (['LOW_GPS_ACCURACY', 'CUSTOMER_DATA_MISMATCH'].includes(status))
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'LOCATION_VALID') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (['LOW_GPS_ACCURACY', 'CUSTOMER_DATA_MISMATCH', 'LOCATION_MISMATCH'].includes(status)) return <XCircle className="h-3.5 w-3.5" />;
  if (status === 'MANUAL_REVIEW') return <ShieldCheck className="h-3.5 w-3.5" />;
  return <Clock3 className="h-3.5 w-3.5" />;
};

export const VerificationListView: React.FC<VerificationListViewProps> = ({ onSelectVerification }) => {
  const { validationConfig, dashboardSummary } = useApp();
  const { t } = useTranslation();
  const [rows, setRows] = useState<VerificationListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [cursors, setCursors] = useState<Record<number, string>>({});
  const latestRequestId = useRef(0);
  const [sortKey, setSortKey] = useState<
    'customer' | 'address' | 'addressChange' | 'status' | 'location' | 'activity'
  >('customer');
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('asc');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [showAttentionBreakdown, setShowAttentionBreakdown] = useState(false);

  useEffect(() => {
    setPage(1);
    setCursors({});
  }, [searchTerm, statusFilter]);

  const load = async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await api.verifications({
        page,
        pageSize,
        search: searchTerm,
        status: statusFilter,
        sortBy: sortKey,
        sortDirection,
        cursor: page === 1 ? undefined : cursors[page],
      });
      if (requestId !== latestRequestId.current) return;
      if (response.nextCursor) setCursors((previous) => ({ ...previous, [page + 1]: response.nextCursor! }));
      setRows(
        response.items.map((row) => ({
          session: mapApiSession(row.session),
          customer: mapApiCustomer(row.customer),
          address: mapApiAddress(row.address),
        })),
      );
      setTotal(response.total);
    } catch (cause) {
      if (requestId !== latestRequestId.current) return;
      setError(cause instanceof Error ? cause.message : t('verifications.loadError'));
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, pageSize, searchTerm, statusFilter, sortKey, sortDirection]);

  const sortedRows = useMemo(
    () =>
      sortTableRows(
        rows,
        (row) => {
          if (sortKey === 'customer') return row.customer.name;
          if (sortKey === 'address') return row.address.rawAddress;
          if (sortKey === 'addressChange')
            return ['ADDRESS_EDITING', 'ADDRESS_PROPOSED'].includes(row.session.verificationStatus) ||
              row.address.addressType === 'PROPOSED'
              ? 1
              : 0;
          if (sortKey === 'status') return row.session.verificationStatus;
          if (sortKey === 'location')
            return isLocationMatched(row.session.verificationStatus, row.session.lastValidationResult?.result)
              ? 'LOCATION_VALID'
              : row.session.lastValidationResult?.result;
          return row.session.attemptCount;
        },
        sortDirection,
      ),
    [rows, sortDirection, sortKey],
  );

  const toggleSort = (
    nextKey: 'customer' | 'address' | 'addressChange' | 'status' | 'location' | 'activity',
  ) => {
    if (sortKey === nextKey) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(nextKey);
      setSortDirection('asc');
    }
    setPage(1);
    setCursors({});
  };

  const verificationStats = dashboardSummary.verifications;
  const attentionCount =
    verificationStats.manualReview +
    verificationStats.lowGpsAccuracy +
    verificationStats.waitingForHome +
    verificationStats.addressChanged +
    verificationStats.customersMismatch;
  const attentionBreakdown = [
    {
      label: t('verifications.needsAttentionManualReview'),
      value: verificationStats.manualReview,
      action: t('verifications.caseAction.REVIEW_REQUIRED'),
      filter: 'MANUAL_REVIEW',
    },
    {
      label: t('verifications.needsAttentionLowGpsAccuracy'),
      value: verificationStats.lowGpsAccuracy,
      action: t('verifications.caseAction.GPS_ACCURACY'),
      filter: 'LOW_GPS_ACCURACY',
    },
    {
      label: t('verifications.needsAttentionWaitingForHome'),
      value: verificationStats.waitingForHome,
      action: t('verifications.caseAction.GPS_INCONSISTENT'),
      filter: 'WAITING_FOR_HOME',
    },
    {
      label: t('verifications.needsAttentionAddressChanged'),
      value: verificationStats.addressChanged,
      action: t('verifications.caseAction.ADDRESS_CHANGE'),
      filter: 'ADDRESS_CHANGED',
    },
    {
      label: t('verifications.needsAttentionCustomerMismatch'),
      value: verificationStats.customersMismatch,
      action: t('verifications.caseAction.CUSTOMER_DATA_MISMATCH'),
      filter: 'CUSTOMER_DATA_MISMATCH',
    },
  ];

  const openAttentionCase = (filter: string) => {
    setStatusFilter(filter);
    setShowAttentionBreakdown(false);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/70 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t('verifications.title')}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('verifications.description')}</p>
              {dashboardSummary.generatedAt && (
                <p className="mt-2 text-[11px] text-slate-400">
                  {t('verifications.updated')}: {formatAppDateTime(dashboardSummary.generatedAt)}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('verifications.refresh')}
          </button>
        </div>
        <div className="mt-4 grid gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:grid-cols-3">
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <Compass className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t('verifications.step1Title')}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t('verifications.step1Text')}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-300" />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t('verifications.step2Title')}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t('verifications.step2Text')}</p>
            </div>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{t('verifications.step3Title')}</p>
              <p className="mt-0.5 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{t('verifications.step3Text')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
          <CircleHelp className="h-4 w-4 text-slate-400" />
          {t('verifications.statusGuideTitle')}
        </div>
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 className="h-3.5 w-3.5" /> {t('verifications.statusGuideMatched')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
            <Clock3 className="h-3.5 w-3.5" /> {t('verifications.statusGuideWaiting')}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('verifications.statusGuideAction')}
          </span>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label={t('verifications.totalChecks')} value={verificationStats.total} icon={<Compass className="h-5 w-5" />} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <Metric label={t('verifications.invitationsSent')} value={verificationStats.invitationsSent} icon={<Send className="h-5 w-5" />} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" />
        <Metric label={t('verifications.linksOpened')} value={verificationStats.linksOpened} icon={<ExternalLink className="h-5 w-5" />} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300" />
        <Metric label={t('verifications.gpsCaptured')} value={verificationStats.gpsCaptured} icon={<MapPin className="h-5 w-5" />} tone="bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-300" />
        <Metric label={t('verifications.matched')} value={verificationStats.locationValid} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" />
        <Metric
          label={t('verifications.needsAttention')}
          value={attentionCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"
          onClick={() => setShowAttentionBreakdown((current) => !current)}
          expanded={showAttentionBreakdown}
        />
      </section>

      {showAttentionBreakdown && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-100">
                {t('verifications.needsAttentionDetailsTitle')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-amber-800/80 dark:text-amber-200/80">
                {t('verifications.needsAttentionDetailsText')}
              </p>
            </div>
            <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
              {numberFormat.format(attentionCount)} {t('verifications.needsAttentionDetailsCount')}
            </span>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {attentionBreakdown.map((item) => (
              <button
                key={item.filter}
                type="button"
                onClick={() => openAttentionCase(item.filter)}
                className="rounded-xl border border-amber-200/80 bg-white/80 p-3 text-left transition-colors hover:border-amber-400 hover:bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 dark:border-amber-900/70 dark:bg-amber-950/20 dark:hover:border-amber-700 dark:hover:bg-amber-950/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold leading-4 text-amber-950 dark:text-amber-100">{item.label}</span>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-amber-700 dark:text-amber-300">
                    {numberFormat.format(item.value)}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-4 text-amber-800/80 dark:text-amber-200/80">{item.action}</p>
                <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                  {t('verifications.viewDetails')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-amber-800/80 dark:text-amber-200/80">
            {t('verifications.needsAttentionCountNote')}
          </p>
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('verifications.listTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('verifications.listDescription')}</p>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t('verifications.filterStatusHelp')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('verifications.search')}
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 sm:w-64"
              />
            </label>
          </div>
        </div>
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <span>{t('verifications.detailFilterHeading')}</span>
              <select
                aria-label={t('verifications.detailFilterHeading')}
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="ALL">{t('verifications.allStatuses')}</option>
                <optgroup label={t('verifications.detailFilters')}>
                  <option value="WAITING_FOR_CUSTOMER">{t('verifications.waitingForCustomerFilter')}</option>
                  <option value="NEEDS_ATTENTION">{t('verifications.teamActionFilter')}</option>
                  <option value="ADDRESS_CHANGED">{t('verifications.addressChangeFilter')}</option>
                  <option value="LOCATION_VALID">{t('verifications.verifiedFilter')}</option>
                  <option value="REMINDER_LIMIT_REACHED">{t('verifications.reminderLimitFilter')}</option>
                  {statusValues
                    .filter((value) => !quickFilterValues.has(value))
                    .map((value) => (
                      <option key={value} value={value}>
                        {getStatusLabel(value, t)}
                      </option>
                    ))}
                </optgroup>
              </select>
            </label>
            {statusFilter !== 'ALL' && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  {t('verifications.activeFilter')}: <strong className="font-semibold text-slate-700 dark:text-slate-200">{getFilterLabel(statusFilter, t)}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {t('verifications.clearFilter')}
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-indigo-50/70 px-3 py-2.5 text-[11px] text-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-200">
            <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
            <div>
              <p className="font-semibold">{t('verifications.statusExplanationTitle')}</p>
              <p className="mt-0.5 leading-4">{t(`verifications.statusExplanation.${statusFilter}`)}</p>
            </div>
          </div>
        </div>
        <AdminTable
          minWidthClass="min-w-[1750px]"
          footer={
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
                setCursors({});
              }}
              disabled={loading}
            />
          }
        >
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <SortableTableHeader active={sortKey === 'customer'} direction={sortDirection} onClick={() => toggleSort('customer')} className="px-4 py-3">
                {t('table.customerName')}
              </SortableTableHeader>
              <SortableTableHeader
                active={sortKey === 'address'}
                direction={sortDirection}
                onClick={() => toggleSort('address')}
                className="px-4 py-3"
              >
                {t('verifications.address')}
              </SortableTableHeader>
              <SortableTableHeader
                active={sortKey === 'addressChange'}
                direction={sortDirection}
                onClick={() => toggleSort('addressChange')}
                className="px-4 py-3"
              >
                {t('verifications.addressChange')}
              </SortableTableHeader>
              <th className="px-4 py-3">{t('verifications.linkAndConfirmation')}</th>
              <SortableTableHeader active={sortKey === 'status'} direction={sortDirection} onClick={() => toggleSort('status')} className="px-4 py-3">
                {t('verifications.status')}
              </SortableTableHeader>
              <SortableTableHeader active={sortKey === 'location'} direction={sortDirection} onClick={() => toggleSort('location')} className="px-4 py-3">
                {t('verifications.location')}
              </SortableTableHeader>
              <th className="px-4 py-3">{t('verifications.manualCase')}</th>
              <SortableTableHeader active={sortKey === 'activity'} direction={sortDirection} onClick={() => toggleSort('activity')} className="px-4 py-3">
                {t('verifications.activity')}
              </SortableTableHeader>
              <th className="px-4 py-3 text-right">{t('table.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedRows.map(({ session, customer, address }) => {
              const lastVal = session.lastValidationResult;
              const locationMatched = isLocationMatched(session.verificationStatus, lastVal?.result);
              const manualCaseKeys = getManualReviewCaseKeys(session.verificationStatus, lastVal?.reasonCodes);
              const addressChangeStatus =
                session.verificationStatus === 'ADDRESS_EDITING'
                  ? t('verifications.addressChangeInProgress')
                  : session.verificationStatus === 'ADDRESS_PROPOSED' || address.addressType === 'PROPOSED'
                    ? t('verifications.addressChangePending')
                    : null;
              const expanded = expandedSessionId === session.id;
              return (
                <React.Fragment key={session.id}>
                <tr className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{customer.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {customer.externalId} · {customer.phoneE164}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedSessionId(expanded ? null : session.id)}
                      aria-expanded={expanded}
                      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                    >
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      {expanded ? t('monitoring.hideDetails') : t('monitoring.showDetails')}
                    </button>
                  </td>
                  <td className="max-w-[320px] px-4 py-3">
                    <div className="line-clamp-2 text-xs font-medium leading-5 text-slate-900 dark:text-white">
                      {formatAddressForDisplay(address.rawAddress)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {address.subdistrict}, {address.district}, {address.city}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {addressChangeStatus ? (
                      <span className="inline-flex max-w-[190px] items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold leading-4 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                        <Edit3 className="h-3.5 w-3.5 shrink-0" />
                        {addressChangeStatus}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {t('verifications.addressChangeNone')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {session.openedAt ? t('verifications.opened') : t('verifications.notOpened')}
                    </div>
                    {session.openedAt && <div className="mt-1 text-[10px] text-slate-400">{formatAppDateTime(session.openedAt)}</div>}
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {session.customerConfirmationStatus === 'CONFIRMED'
                        ? t('verifications.confirmed')
                        : session.customerConfirmationStatus === 'MISMATCH'
                          ? t('verifications.customerMismatch')
                          : t('verifications.notConfirmed')}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(session.verificationStatus)}`}
                    >
                      <StatusIcon status={session.verificationStatus} />
                            {getStatusLabel(session.verificationStatus, t)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {lastVal ? (
                      <div>
                        <div
                          className={`text-xs font-semibold ${locationMatched ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
                        >
                          {locationMatched
                            ? t('verifications.locationMatched')
                            : t('verifications.locationNeedsReview')}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                          {lastVal.distanceFromReferenceMeters == null
                            ? t('verifications.noReference')
                            : `${lastVal.distanceFromReferenceMeters.toFixed(1)}m ${t('verifications.away')}`}{' '}
                          · ±{lastVal.gpsAccuracyM}m {t('verifications.accuracy')}
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs italic text-slate-400">{t('verifications.noLocation')}</span>
                    )}
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    {manualCaseKeys.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {manualCaseKeys.map((caseKey) => (
                          <span
                            key={caseKey}
                            className="inline-flex rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold leading-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
                            title={t(`verifications.caseHelp.${caseKey}`)}
                          >
                            {t(`verifications.case.${caseKey}`)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">{t('verifications.manualCaseNone')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
                    <div>
                      {session.attemptCount} {t('verifications.attempts')}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {session.reminderCount} / {validationConfig.MAX_REMINDERS_PER_SESSION}{' '}
                      {t('verifications.reminders')}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      Terakhir: {formatAppDateTime(session.updatedAt)}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      Link berlaku sampai: {formatAppDateTime(session.expiresAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onSelectVerification(session.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                      {t('verifications.viewDetails')}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-indigo-50/40 dark:bg-indigo-950/10">
                    <td colSpan={9} className="px-4 py-4">
                      <div className="grid gap-3 text-xs md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <h3 className="font-semibold text-slate-900 dark:text-white">{t('verifications.customerDetails')}</h3>
                          <dl className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
                            <div><dt className="inline font-medium">{t('verifications.customerName')}:</dt> <dd className="inline">{customer.name}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.customerId')}:</dt> <dd className="inline">{customer.externalId}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.phoneNumber')}:</dt> <dd className="inline">{customer.phoneE164}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.sessionId')}:</dt> <dd className="inline break-all">{session.id}</dd></div>
                          </dl>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <h3 className="font-semibold text-slate-900 dark:text-white">{t('verifications.addressDetails')}</h3>
                          <div className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">
                            <div>
                              <div className="font-medium text-slate-500 dark:text-slate-400">{t('verifications.currentAddress')}</div>
                              <div className="mt-1 leading-relaxed">{formatAddressForDisplay(address.rawAddress)}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-[11px]">
                              <div><span className="font-medium">{t('verifications.addressType')}:</span> {getEnumLabel(address.addressType, 'verifications.addressTypeValue', t)}</div>
                              <div><span className="font-medium">{t('verifications.referencePrecision')}:</span> {getEnumLabel(address.referencePrecision, 'verifications.referencePrecisionValue', t)}</div>
                              <div><span className="font-medium">{t('verifications.addressVerification')}:</span> {address.isVerified ? t('verifications.verified') : t('verifications.notVerified')}</div>
                              <div><span className="font-medium">{t('verifications.auditStatus')}:</span> {getEnumLabel(address.coordinateAuditStatus, 'verifications.auditStatusValue', t)}</div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                          <h3 className="font-semibold text-slate-900 dark:text-white">{t('verifications.checkDetails')}</h3>
                          <dl className="mt-2 space-y-1.5 text-slate-600 dark:text-slate-300">
                            <div><dt className="inline font-medium">{t('verifications.status')}:</dt> <dd className="inline">{getStatusLabel(session.verificationStatus, t)}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.linkStatus')}:</dt> <dd className="inline">{session.openedAt ? `${t('verifications.opened')} · ${formatAppDateTime(session.openedAt)}` : t('verifications.notOpened')}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.confirmation')}:</dt> <dd className="inline">{session.customerConfirmationStatus === 'CONFIRMED' ? t('verifications.confirmed') : session.customerConfirmationStatus === 'MISMATCH' ? t('verifications.customerMismatch') : t('verifications.notConfirmed')}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.createdAt')}:</dt> <dd className="inline">{formatAppDateTime(session.createdAt)}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.updatedAt')}:</dt> <dd className="inline">{formatAppDateTime(session.updatedAt)}</dd></div>
                            <div><dt className="inline font-medium">{t('verifications.linkExpiresAt')}:</dt> <dd className="inline">{formatAppDateTime(session.expiresAt)}</dd></div>
                          </dl>
                        </div>
                      </div>
                      {lastVal && (
                        <div className="mt-3 rounded-xl border border-indigo-200 bg-white p-3 text-xs dark:border-indigo-900/60 dark:bg-slate-900">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-slate-900 dark:text-white">{t('verifications.locationEvidence')}</h3>
                            {lastVal.capturedLocation?.googleMapsUrl && (
                              <a href={lastVal.capturedLocation.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline dark:text-indigo-300">
                                {t('verifications.openGoogleMaps')} <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          <div className="mt-2 grid gap-2 text-slate-600 dark:text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                            <div><span className="font-medium">{t('verifications.result')}:</span> {getStatusLabel(locationMatched ? 'LOCATION_VALID' : lastVal.result, t)}</div>
                            <div><span className="font-medium">{t('verifications.distance')}:</span> {lastVal.distanceFromReferenceMeters == null ? t('verifications.noReference') : `${lastVal.distanceFromReferenceMeters.toFixed(1)}m`}</div>
                            <div><span className="font-medium">{t('verifications.gpsAccuracy')}:</span> ±{lastVal.gpsAccuracyM}m</div>
                            <div><span className="font-medium">{t('verifications.reasonCodes')}:</span> {lastVal.reasonCodes.length ? lastVal.reasonCodes.map(userFriendlyReason).join(', ') : '—'}</div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('table.loadingSessions')}
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-rose-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && !rows.length && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('table.noMatchingSessions')}
                </td>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>
    </div>
  );
};
