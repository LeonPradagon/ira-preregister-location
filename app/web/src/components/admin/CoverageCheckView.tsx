import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, Search, Wifi } from 'lucide-react';
import { api } from '../../lib/apiClient';
import type { CoverageBatchApi } from '../../lib/apiClient';
import type { CoverageCandidate, CoverageCandidateStatus } from '../../types';
import { useTranslation } from '../../i18n';
import { AppLoader } from '../common/AppLoader';
import { TablePagination, TablePageSize } from '../common/AdminTable';

const statusOptions: Array<CoverageCandidateStatus | 'ALL'> = [
  'ALL',
  'NOT_CHECKED',
  'UNCOVERED',
  'COVERED',
  'QUEUED',
  'PROCESSING',
  'FAILED',
];

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('id-ID') : '—';
}

export const CoverageCheckView: React.FC = () => {
  const { t } = useTranslation();
  const [items, setItems] = useState<CoverageCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CoverageCandidateStatus | 'ALL'>('NOT_CHECKED');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batch, setBatch] = useState<CoverageBatchApi['batch'] | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.coverageCandidates({
        page,
        pageSize,
        search,
        status: status === 'ALL' ? undefined : status,
      });
      setItems(response.items);
      setTotal(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('coverage.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, status, pageSize]);

  useEffect(() => {
    void load();
  }, [page, pageSize, search, status]);

  useEffect(() => {
    if (!batch || ['COMPLETED', 'PARTIAL_FAILED', 'FAILED'].includes(batch.status)) return undefined;
    const timer = window.setInterval(() => {
      void api.coverageBatch(batch.id).then((response) => {
        setBatch(response.batch);
        if (['COMPLETED', 'PARTIAL_FAILED', 'FAILED'].includes(response.batch.status)) void load();
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [batch]);

  const allVisibleSelected = items.length > 0 && items.every((item) => selected.has(item.verificationId));
  const selectedCount = selected.size;
  const batchProgress = useMemo(() => {
    if (!batch || !batch.totalCount) return 0;
    return Math.round(((batch.completedCount + batch.failedCount) / batch.totalCount) * 100);
  }, [batch]);

  const toggle = (verificationId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(verificationId)) next.delete(verificationId);
      else next.add(verificationId);
      return next;
    });
  };

  const toggleVisible = () => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) items.forEach((item) => next.delete(item.verificationId));
      else items.forEach((item) => next.add(item.verificationId));
      return next;
    });
  };

  const submit = async () => {
    if (!selected.size) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await api.enqueueCoverageChecks([...selected]);
      const batchResponse = await api.coverageBatch(response.batchId);
      setBatch(batchResponse.batch);
      setSelected(new Set());
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('coverage.submitError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h1 className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
              <Wifi className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              {t('coverage.title')}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t('coverage.description')}
            </p>
          </div>
          <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
            {t('coverage.selected', { count: selectedCount })}
          </span>
        </div>
      </div>

      {batch && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs dark:border-indigo-900 dark:bg-indigo-950/30">
          <div className="flex items-center justify-between gap-3 font-semibold text-indigo-900 dark:text-indigo-200">
            <span>{t('coverage.batchProgress', { status: batch.status })}</span>
            <span>{batchProgress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-950">
            <div className="h-full bg-indigo-600 transition-all dark:bg-indigo-400" style={{ width: `${batchProgress}%` }} />
          </div>
          <p className="mt-2 text-indigo-800 dark:text-indigo-300">
            {t('coverage.batchCounts', { completed: batch.completedCount, failed: batch.failedCount, total: batch.totalCount })}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex-1 text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('coverage.search')}
            <span className="relative mt-1 block">
              <Search className="pointer-events-none absolute left-3 top-2 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-xs text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder={t('coverage.searchPlaceholder')}
              />
            </span>
          </label>
          <label className="text-xs font-medium text-gray-600 dark:text-gray-300">
            {t('coverage.status')}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CoverageCandidateStatus | 'ALL')}
              className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {t(`coverage.status.${option}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" />
            {t('coverage.refresh')}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!selectedCount || submitting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {t('coverage.checkSelected')}
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex flex-col items-center gap-2 p-12 text-xs text-gray-500"><AppLoader size={56} label={t('coverage.loading')} /><span>{t('coverage.loading')}</span></div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-xs text-gray-500 dark:text-gray-400">{t('coverage.empty')}</div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 text-xs dark:border-gray-800">
              <button type="button" onClick={toggleVisible} className="font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400">
                {allVisibleSelected ? t('coverage.clearPage') : t('coverage.selectPage')}
              </button>
              <span className="text-gray-500 dark:text-gray-400">{t('coverage.total', { count: total })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-left text-xs">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="w-12 px-4 py-3"><input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} aria-label={t('coverage.selectPage')} /></th>
                    <th className="px-4 py-3">{t('coverage.customer')}</th>
                    <th className="px-4 py-3">{t('coverage.address')}</th>
                    <th className="px-4 py-3">{t('coverage.coordinates')}</th>
                    <th className="px-4 py-3">{t('coverage.statusHeader')}</th>
                    <th className="px-4 py-3">{t('coverage.lastChecked')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr key={item.verificationId} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3"><input type="checkbox" checked={selected.has(item.verificationId)} onChange={() => toggle(item.verificationId)} aria-label={item.customerName} /></td>
                      <td className="px-4 py-3"><div className="font-medium text-gray-900 dark:text-white">{item.customerName}</div><div className="font-mono text-[10px] text-gray-500">{item.customerExternalId}</div></td>
                      <td className="max-w-[320px] px-4 py-3 text-gray-600 dark:text-gray-300">{item.address}</td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-gray-600 dark:text-gray-300">{item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}</td>
                      <td className="px-4 py-3"><span className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1 font-medium dark:border-gray-700 dark:bg-gray-800">{t(`coverage.status.${item.coverageStatus}`)}</span>{item.importedCoverageStatus === 'Not Coverage' && item.coverageStatus === 'NOT_CHECKED' && <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">{t('coverage.importedNotCovered')}</div>}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-500 dark:text-gray-400">{formatDate(item.lastCheckedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} disabled={loading} />
          </>
        )}
      </div>
    </div>
  );
};
