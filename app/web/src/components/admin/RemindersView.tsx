import React, { useEffect, useState } from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  MessageSquare,
  Send,
  Smartphone,
  Users,
  RefreshCw,
  Search,
} from 'lucide-react';
import { mapApiCustomer, mapApiSession, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, Reminder, VerificationSession } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { useTranslation } from '../../i18n';

interface RemindersViewProps {
  onSelectVerification: (sessionId: string) => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  onSelectVerification,
}) => {
  const { validationConfig } = useApp();
  const { t } = useTranslation();
  const [rows, setRows] = useState<Array<{ reminder: Reminder; session: VerificationSession; customer: Customer }>>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);

  const sentReminders = rows.filter((row) => row.reminder.status === 'SENT');
  const scheduledReminders = rows.filter((row) => row.reminder.status === 'SCHEDULED');
  useEffect(() => setPage(1), [searchTerm, statusFilter]);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const response = await api.reminders({ page, pageSize, search: searchTerm, status: statusFilter });
      setRows(response.items.map((raw) => ({ reminder: raw as unknown as Reminder, session: mapApiSession(raw.session as Record<string, unknown>), customer: mapApiCustomer(raw.customer as Record<string, unknown>) })));
      setTotal(response.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('reminders.loadError')); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [page, pageSize, searchTerm, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <span>{t('reminders.title')}</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('reminders.description')} ({validationConfig.MAX_REMINDERS_PER_SESSION}x max.)
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-lg">
            {t('reminders.sent')}: {sentReminders.length}
          </span>
          <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-lg">
            {t('reminders.scheduled')}: {scheduledReminders.length}
          </span>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label={t('reminders.refresh')} title={t('reminders.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 text-xs shadow-xs dark:border-gray-800 dark:bg-gray-900 sm:flex-row">
        <div className="relative w-full sm:w-80"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('reminders.search')} className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-9 pr-3 text-gray-900 outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white" /></div>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"><option value="ALL">{t('reminders.allStatuses')}</option><option value="SCHEDULED">SCHEDULED</option><option value="PROCESSING">PROCESSING</option><option value="SENT">SENT</option><option value="FAILED">FAILED</option><option value="CANCELLED">CANCELLED</option></select>
      </div>

      {/* Reminders Table */}
      <AdminTable
        minWidthClass="min-w-[1050px]"
        footer={<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />}
      >
            <thead className="bg-gray-50/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3">{t('table.sessionCustomer')}</th>
                <th className="px-4 py-3">{t('table.reminderOrder')}</th>
                <th className="px-4 py-3">{t('table.channelTarget')}</th>
                <th className="px-4 py-3">{t('table.schedule')}</th>
                <th className="px-4 py-3">{t('table.status')}</th>
                <th className="px-4 py-3 text-right">{t('table.action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map(({ reminder: rem, session, customer }) => {

                return (
                  <tr key={rem.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-gray-900 dark:text-white">{customer?.name || t('campaigns.defaultCustomer')}</div>
                      <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{rem.sessionId}</div>
                    </td>

                    <td className="px-4 py-3.5 font-bold text-amber-600 dark:text-amber-400">
                      {t('reminders.number', { number: rem.reminderNumber })}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-gray-700 dark:text-gray-300">
                      {rem.channel}: {session?.registeredPhoneSnapshot}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-gray-400 text-[11px]">
                      {rem.sentAt
                        ? new Date(rem.sentAt).toLocaleString('id-ID')
                        : new Date(rem.scheduledAt).toLocaleString('id-ID')}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold border ${
                          rem.status === 'SENT'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {rem.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-2">
                      {session && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSelectVerification(session.id)}
                            className="px-2.5 py-1 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-[11px] font-medium shadow-xs transition-colors"
                          >
                            {t('table.openSession')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-500">{t('table.loadingReminders')}</td></tr>}
              {!loading && error && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-rose-600">{error}</td></tr>}
              {!loading && !error && !rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-500">{t('table.noReminders')}</td></tr>}
            </tbody>
      </AdminTable>
    </div>
  );
};
