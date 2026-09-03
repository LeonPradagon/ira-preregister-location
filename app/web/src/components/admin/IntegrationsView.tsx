import React, { useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  Code,
  Compass,
  FileCode,
  Radio,
  RefreshCw,
  Send,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';
import { api } from '../../lib/apiClient';
import { IntegrationOutboxEvent } from '../../types';
import { TablePagination, TablePageSize } from '../common/AdminTable';
import { userFriendlyStatus } from '../../lib/statusLabels';

export const IntegrationsView: React.FC = () => {
  const { t } = useTranslation();
  const { integrationConfigs } = useApp();
  const [outboxEvents, setOutboxEvents] = useState<IntegrationOutboxEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const response = await api.outbox({ page, pageSize, search: searchTerm, status: statusFilter });
      setOutboxEvents(response.items as unknown as IntegrationOutboxEvent[]); setTotal(response.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t('integrations.loadError')); }
    finally { setLoading(false); }
  };
  useEffect(() => setPage(1), [searchTerm, statusFilter]);
  useEffect(() => { void load(); }, [page, pageSize, searchTerm, statusFilter]);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>{t('integrations.title')}</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('integrations.description')} <code className="text-indigo-600 dark:text-indigo-400 font-mono font-medium">location.verified.v1</code>
          </p>
        </div>

        <span className="text-xs font-mono px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-lg">
          {t('integrations.outboxCount', { count: total })}
        </span>
      </div>

      {/* Integration Adapter Contracts (PRD Section 36) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* IRA Coverage System Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Pemeriksaan Jangkauan Jaringan</h3>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{t('integrations.coverageSubtitle')}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              {userFriendlyStatus(integrationConfigs.IRA_COVERAGE.status)}
            </span>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {t('integrations.coverageDescription')}
          </p>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-mono space-y-1">
            <div className="text-gray-400 dark:text-gray-500">// TypeScript Port Interface</div>
            <div className="text-indigo-700 dark:text-indigo-400 font-medium">interface IRACoveragePort &#123;</div>
            <div className="text-gray-700 dark:text-gray-300 pl-3">checkCoverage(lat: number, lng: number): Promise&lt;CoverageResult&gt;;</div>
            <div className="text-indigo-700 dark:text-indigo-400 font-medium">&#125;</div>
          </div>
        </div>

        {/* Ticketing System Card */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-5 rounded-xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Activity className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-gray-900 dark:text-white">Tugas Pemasangan</h3>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">{t('integrations.ticketSubtitle')}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              {userFriendlyStatus(integrationConfigs.TICKETING.status)}
            </span>
          </div>

          <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
            {t('integrations.ticketDescription')}
          </p>

          <div className="bg-gray-50 dark:bg-gray-800/60 p-3 rounded-lg border border-gray-200 dark:border-gray-700 text-[11px] font-mono space-y-1">
            <div className="text-gray-400 dark:text-gray-500">// Work Order Port Interface</div>
            <div className="text-emerald-700 dark:text-emerald-400 font-medium">interface TicketingPort &#123;</div>
            <div className="text-gray-700 dark:text-gray-300 pl-3">createWorkOrder(event: LocationVerifiedEvent): Promise&lt;TicketId&gt;;</div>
            <div className="text-emerald-700 dark:text-emerald-400 font-medium">&#125;</div>
          </div>
        </div>
      </div>

      {/* Outbox Events Stream */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 pb-3">
          <div>
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Riwayat Pembaruan Sistem</span>
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {t('integrations.streamDescription')}
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label={t('integrations.reload')} title={t('integrations.reload')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row"><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('integrations.search')} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:w-96" /><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs dark:bg-gray-800"><option value="ALL">{t('integrations.allStatuses')}</option><option value="PENDING">Menunggu diproses</option><option value="PUBLISHED">Sudah diteruskan</option><option value="FAILED">Gagal</option></select></div>

        {loading ? <div className="p-8 text-center text-xs text-gray-500">{t('integrations.loading')}</div> : error ? <div className="p-8 text-center text-xs text-rose-600">{error}</div> : outboxEvents.length > 0 ? (
          <div className="space-y-4">
            {outboxEvents.map((evt) => (
              <div key={evt.id} className="bg-gray-50/70 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-xs space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">{evt.eventType}</span>
                    <span className="text-[10px] font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded">
                      Status: {userFriendlyStatus(evt.status)}
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-gray-500 dark:text-gray-400">
                     ID: {evt.id} • {new Date(evt.sentAt || evt.createdAt).toLocaleString('id-ID')}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-gray-600 dark:text-gray-400">
                  <div>
                    <span className="text-gray-500">Nomor pembaruan:</span>{' '}
                    <span className="text-gray-800 dark:text-gray-200 font-medium">{evt.idempotencyKey}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Nomor pelacakan:</span>{' '}
                    <span className="text-gray-800 dark:text-gray-200 font-medium">{evt.correlationId}</span>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-900 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="text-[10px] text-indigo-700 dark:text-indigo-400 font-semibold mb-1 flex items-center gap-1">
                    <Code className="w-3 h-3" />
                    <span>{t('integrations.payload')}:</span>
                  </div>
                  <pre className="text-[10px] font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
                    {JSON.stringify(evt.payload, null, 2)}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400 dark:text-gray-500 text-xs italic">
            {t('integrations.empty')}
          </div>
        )}
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />
      </div>
    </div>
  );
};
