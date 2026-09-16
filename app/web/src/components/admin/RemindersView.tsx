import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CheckCircle2,
  Filter,
  MessageCircle,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { mapApiCustomer, mapApiSession, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { formatAppDateTime } from '../../lib/dateTime';
import { Customer, Reminder, ReminderSource, ReminderStatus, VerificationSession } from '../../types';
import {
  AdminTable,
  SortableTableHeader,
  sortTableRows,
  TablePagination,
  TablePageSize,
  TableSortDirection,
} from '../common/AdminTable';
import { AppLoader } from '../common/AppLoader';
import { useTranslation } from '../../i18n';

interface RemindersViewProps {
  onSelectVerification: (sessionId: string) => void;
}

const reminderStatuses: ReminderStatus[] = ['SCHEDULED', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED', 'LIMIT_REACHED'];

const statusClassName = (status: ReminderStatus) => {
  if (status === 'SENT')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (status === 'FAILED')
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300';
  if (status === 'CANCELLED' || status === 'LIMIT_REACHED')
    return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
  return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
};

const StatusIcon: React.FC<{ status: ReminderStatus }> = ({ status }) => {
  if (status === 'SENT') return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === 'FAILED') return <XCircle className="h-3.5 w-3.5" />;
  if (status === 'CANCELLED' || status === 'LIMIT_REACHED') return <AlertTriangle className="h-3.5 w-3.5" />;
  return <CalendarClock className="h-3.5 w-3.5" />;
};

const sourceClassName = (source: ReminderSource) => {
  if (source === 'UNOPENED_LINK')
    return 'border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300';
  if (source === 'ADMIN_MANUAL')
    return 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300';
};

const sourceIcon = (source: ReminderSource) => (source === 'UNOPENED_LINK' ? '⚙' : source === 'ADMIN_MANUAL' ? '✦' : '✓');

export const RemindersView: React.FC<RemindersViewProps> = ({ onSelectVerification }) => {
  const { validationConfig, dashboardSummary } = useApp();
  const { t } = useTranslation();
  const [rows, setRows] = useState<Array<{ reminder: Reminder; session: VerificationSession; customer: Customer }>>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [cursors, setCursors] = useState<Record<number, string>>({});
  const [sortKey, setSortKey] = useState<'customer' | 'step' | 'recipient' | 'schedule' | 'status'>('schedule');
  const [sortDirection, setSortDirection] = useState<TableSortDirection>('desc');

  useEffect(() => {
    setPage(1);
    setCursors({});
  }, [searchTerm, statusFilter]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.reminders({
        page,
        pageSize,
        search: searchTerm,
        status: statusFilter,
        sortBy: sortKey,
        sortDirection,
        cursor: page === 1 ? undefined : cursors[page],
      });
      if (response.nextCursor) setCursors((previous) => ({ ...previous, [page + 1]: response.nextCursor! }));
      setRows(
        response.items.map((raw) => ({
          reminder: raw as unknown as Reminder,
          session: mapApiSession(raw.session as Record<string, unknown>),
          customer: mapApiCustomer(raw.customer as Record<string, unknown>),
        })),
      );
      setTotal(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('reminders.loadError'));
    } finally {
      setLoading(false);
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
          if (sortKey === 'step') return row.reminder.reminderNumber;
          if (sortKey === 'recipient') return row.session.registeredPhoneSnapshot;
          if (sortKey === 'status') return row.reminder.status;
          return new Date(row.reminder.sentAt || row.reminder.scheduledAt).getTime();
        },
        sortDirection,
      ),
    [rows, sortDirection, sortKey],
  );

  const toggleSort = (nextKey: 'customer' | 'step' | 'recipient' | 'schedule' | 'status') => {
    if (sortKey === nextKey) setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(nextKey);
      setSortDirection('asc');
    }
    setPage(1);
    setCursors({});
  };

  const reminderStats = dashboardSummary.reminders;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-amber-50/70 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-amber-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {t('reminders.title')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {t('reminders.description')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? <AppLoader size={18} label={t('reminders.refresh')} /> : <RefreshCw className="h-4 w-4" />}
            {t('reminders.refresh')}
          </button>
        </div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-100/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            <span className="font-semibold">{t('reminders.howItWorks')}:</span>{' '}
            {t('reminders.howItWorksText', { count: validationConfig.MAX_REMINDERS_PER_SESSION })}
          </p>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{t('reminders.total')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
            {reminderStats.total.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('reminders.totalHelp')}</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('reminders.scheduled')}</p>
          <p className="mt-2 text-2xl font-bold text-amber-700 dark:text-amber-300">
            {reminderStats.scheduled.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-300/80">{t('reminders.scheduledHelp')}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{t('reminders.sent')}</p>
          <p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">
            {reminderStats.sent.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">{t('reminders.sentHelp')}</p>
        </div>
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm dark:border-rose-900 dark:bg-rose-950/20">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{t('reminders.failed')}</p>
          <p className="mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300">
            {reminderStats.failed.toLocaleString('en-US')}
          </p>
          <p className="mt-1 text-[11px] text-rose-700/80 dark:text-rose-300/80">{t('reminders.failedHelp')}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={t('reminders.search')}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Filter className="h-3.5 w-3.5" />
            <span>{t('reminders.deliveryStatus')}</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            >
              <option value="ALL">{t('reminders.allStatuses')}</option>
              {reminderStatuses.map((status) => (
                <option key={status} value={status}>
                  {t(`reminders.status.${status}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t('reminders.filterHelp')}</p>
      </section>

      <AdminTable
        minWidthClass="min-w-[1060px]"
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
        <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
          <tr>
            <SortableTableHeader active={sortKey === 'customer'} direction={sortDirection} onClick={() => toggleSort('customer')} className="px-4 py-3">
              {t('reminders.customerAndCheck')}
            </SortableTableHeader>
            <SortableTableHeader active={sortKey === 'step'} direction={sortDirection} onClick={() => toggleSort('step')} className="px-4 py-3">
              {t('reminders.step')}
            </SortableTableHeader>
            <th className="px-4 py-3">{t('reminders.source')}</th>
            <SortableTableHeader active={sortKey === 'recipient'} direction={sortDirection} onClick={() => toggleSort('recipient')} className="px-4 py-3">
              {t('reminders.recipient')}
            </SortableTableHeader>
            <SortableTableHeader active={sortKey === 'schedule'} direction={sortDirection} onClick={() => toggleSort('schedule')} className="px-4 py-3">
              {t('reminders.schedule')}
            </SortableTableHeader>
            <SortableTableHeader active={sortKey === 'status'} direction={sortDirection} onClick={() => toggleSort('status')} className="px-4 py-3">
              {t('reminders.deliveryStatus')}
            </SortableTableHeader>
            <th className="px-4 py-3 text-right">{t('table.action')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {sortedRows.map(({ reminder, session, customer }) => (
            <tr key={reminder.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50">
              <td className="px-4 py-3.5 align-top">
                <div className="font-semibold text-slate-900 dark:text-white">{customer?.name || 'Customer'}</div>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{reminder.sessionId}</div>
              </td>
              <td className="px-4 py-3.5 align-top">
                <span className="inline-flex rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                  #{reminder.reminderNumber} / {validationConfig.MAX_REMINDERS_PER_SESSION}
                </span>
                <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{t('reminders.step')}</div>
              </td>
              <td className="px-4 py-3.5 align-top">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${sourceClassName(
                    reminder.reminderSource ?? 'CUSTOMER_SELECTED',
                  )}`}
                >
                  <span aria-hidden="true">{sourceIcon(reminder.reminderSource ?? 'CUSTOMER_SELECTED')}</span>
                  {t(`reminders.source.${reminder.reminderSource ?? 'CUSTOMER_SELECTED'}`)}
                </span>
                <div className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  {t(`reminders.sourceHelp.${reminder.reminderSource ?? 'CUSTOMER_SELECTED'}`)}
                </div>
              </td>
              <td className="px-4 py-3.5 align-top">
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  WhatsApp
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {session?.registeredPhoneSnapshot || '—'}
                </div>
              </td>
              <td className="px-4 py-3.5 align-top text-[11px] text-slate-600 dark:text-slate-300">
                <div className="font-medium">{formatAppDateTime(reminder.sentAt || reminder.scheduledAt)}</div>
                {reminder.sentAt && (
                  <div className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-300">Sent at this time</div>
                )}
              </td>
              <td className="px-4 py-3.5 align-top">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${statusClassName(reminder.status)}`}
                >
                  <StatusIcon status={reminder.status} />
                  {t(`reminders.status.${reminder.status}`)}
                </span>
                <div className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  {t(`reminders.statusHelp.${reminder.status}`)}
                </div>
              </td>
              <td className="px-4 py-3.5 text-right align-top">
                <button
                  type="button"
                  onClick={() => onSelectVerification(session.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                >
                  {t('reminders.openCheck')}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
          {loading && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-500">
                <div className="flex flex-col items-center gap-2">
                  <AppLoader size={64} label={t('table.loadingReminders')} />
                  <span>{t('table.loadingReminders')}</span>
                </div>
              </td>
            </tr>
          )}
          {!loading && error && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-xs text-rose-600">
                {error}
              </td>
            </tr>
          )}
          {!loading && !error && !rows.length && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-xs text-slate-400">
                {t('reminders.noItems')}
              </td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </div>
  );
};
