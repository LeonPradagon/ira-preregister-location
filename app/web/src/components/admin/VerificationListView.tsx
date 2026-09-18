import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Compass,
  Edit3,
  Filter,
  Info,
  RefreshCw as RefreshCwIcon,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { mapApiAddress, mapApiCustomer, mapApiSession, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, CustomerAddress, VerificationSession } from '../../types';
import { formatAppDateTime } from '../../lib/dateTime';
import { formatAddressForDisplay } from '../../lib/validationEngine';
import { userFriendlyStatus } from '../../lib/statusLabels';
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
  'MANUAL_REVIEW',
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

const getStatusLabel = (status: string) => userFriendlyStatus(status);

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
  if (['LOW_GPS_ACCURACY', 'CUSTOMER_DATA_MISMATCH'].includes(status)) return <XCircle className="h-3.5 w-3.5" />;
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
          if (sortKey === 'location') return row.session.lastValidationResult?.result;
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
    ['verifications.needsAttentionManualReview', verificationStats.manualReview],
    ['verifications.needsAttentionLowGpsAccuracy', verificationStats.lowGpsAccuracy],
    ['verifications.needsAttentionWaitingForHome', verificationStats.waitingForHome],
    ['verifications.needsAttentionAddressChanged', verificationStats.addressChanged],
    ['verifications.needsAttentionCustomerMismatch', verificationStats.customersMismatch],
  ] as const;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      {loading && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <AppLoader size={28} label={t('table.loadingSessions')} />
          <span>{t('table.loadingSessions')}</span>
        </div>
      )}
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
              <Compass className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('verifications.title')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t('verifications.description')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('verifications.refresh')}
          </button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 sm:items-stretch">
        <div className="grid h-full grid-rows-2 gap-3">
          <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Users className="h-4 w-4" />
              {t('verifications.totalChecks')}
            </div>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {total.toLocaleString('en-US')}
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {t('verifications.totalChecksHelp')}
            </p>
          </div>
          <div className="flex h-full flex-col rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4" />
              {t('verifications.matched')}
            </div>
            <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {verificationStats.locationValid.toLocaleString('en-US')}
            </p>
            <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
              {t('verifications.matchedHelp')}
            </p>
          </div>
        </div>
        <div className="flex h-full flex-col rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            {t('verifications.needsAttention')}
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">
            {attentionCount.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">
            {t('verifications.needsAttentionHelp')}
          </p>
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-white/60 p-3 dark:border-amber-900/70 dark:bg-amber-950/20">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
              <Info className="h-3.5 w-3.5" />
              <span>{t('verifications.needsAttentionBreakdown')}</span>
            </div>
            <ul className="mt-2 space-y-1 text-[11px] text-amber-800/90 dark:text-amber-200/90">
              {attentionBreakdown.map(([label, value]) => (
                <li key={label} className="flex items-start justify-between gap-3">
                  <span>{t(label)}</span>
                  <span className="font-semibold tabular-nums">{value.toLocaleString('en-US')}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 border-t border-amber-200/70 pt-2 text-[10px] leading-4 text-amber-700/80 dark:border-amber-900/60 dark:text-amber-300/80">
              {t('verifications.needsAttentionCountNote')}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('verifications.search')}
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            <span>{t('verifications.filterStatus')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">{t('verifications.allStatuses')}</option>
              <optgroup label={t('verifications.quickFilters')}>
                <option value="WAITING_FOR_CUSTOMER">{t('verifications.waitingForCustomerFilter')}</option>
                <option value="NEEDS_ATTENTION">{t('verifications.teamActionFilter')}</option>
                <option value="ADDRESS_CHANGED">{t('verifications.addressChangeFilter')}</option>
                <option value="LOCATION_VALID">{t('verifications.verifiedFilter')}</option>
                <option value="REMINDER_LIMIT_REACHED">{t('verifications.reminderLimitFilter')}</option>
              </optgroup>
              <optgroup label={t('verifications.detailFilters')}>
                {statusValues
                  .filter((value) => !quickFilterValues.has(value))
                  .map((value) => (
                    <option key={value} value={value}>
                      {getStatusLabel(value)}
                    </option>
                  ))}
              </optgroup>
            </select>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('verifications.listTitle')}</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('verifications.listDescription')}</p>
        </div>
        <AdminTable
          minWidthClass="min-w-[1400px]"
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
              <SortableTableHeader active={sortKey === 'status'} direction={sortDirection} onClick={() => toggleSort('status')} className="px-4 py-3">
                {t('verifications.status')}
              </SortableTableHeader>
              <SortableTableHeader active={sortKey === 'location'} direction={sortDirection} onClick={() => toggleSort('location')} className="px-4 py-3">
                {t('verifications.location')}
              </SortableTableHeader>
              <SortableTableHeader active={sortKey === 'activity'} direction={sortDirection} onClick={() => toggleSort('activity')} className="px-4 py-3">
                {t('verifications.activity')}
              </SortableTableHeader>
              <th className="px-4 py-3 text-right">{t('table.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedRows.map(({ session, customer, address }) => {
              const lastVal = session.lastValidationResult;
              const addressChangeStatus =
                session.verificationStatus === 'ADDRESS_EDITING'
                  ? t('verifications.addressChangeInProgress')
                  : session.verificationStatus === 'ADDRESS_PROPOSED' || address.addressType === 'PROPOSED'
                    ? t('verifications.addressChangePending')
                    : null;
              return (
                <tr key={session.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{customer.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {customer.externalId} · {customer.phoneE164}
                    </div>
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
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(session.verificationStatus)}`}
                    >
                      <StatusIcon status={session.verificationStatus} />
                      {getStatusLabel(session.verificationStatus)}
                    </span>
                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {session.customerConfirmationStatus === 'CONFIRMED'
                        ? 'Data customer sesuai'
                        : session.customerConfirmationStatus === 'MISMATCH'
                          ? 'Data customer berbeda'
                          : 'Belum dikonfirmasi'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {lastVal ? (
                      <div>
                        <div
                          className={`text-xs font-semibold ${lastVal.result === 'LOCATION_VALID' ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'}`}
                        >
                          {lastVal.result === 'LOCATION_VALID'
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
              );
            })}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('table.loadingSessions')}
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-rose-600">
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && !rows.length && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
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
