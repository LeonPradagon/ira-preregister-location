import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, MapPin, RefreshCw, Search, UserRound, Wifi } from 'lucide-react';
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

function statusClass(status: CoverageCandidateStatus): string {
  if (status === 'COVERED')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300';
  if (status === 'UNCOVERED' || status === 'FAILED')
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300';
  if (status === 'QUEUED' || status === 'PROCESSING')
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300';
  return 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300';
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
      void api
        .coverageBatch(batch.id)
        .then((response) => {
          setBatch(response.batch);
          if (['COMPLETED', 'PARTIAL_FAILED', 'FAILED'].includes(response.batch.status)) void load();
        })
        .catch(() => undefined);
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
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-300">
              <Wifi className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                {t('coverage.title')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {t('coverage.description')}
              </p>
              <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('coverage.total', { count: total })}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:justify-end">
            <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
              {t('coverage.selected', { count: selectedCount })}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {t('coverage.refresh')}
            </button>
          </div>
        </div>
      </section>

      {batch && (
        <section className="rounded-2xl border border-indigo-200 bg-white p-5 shadow-xs dark:border-indigo-900 dark:bg-gray-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('coverage.batchProgress', { status: batch.status })}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('coverage.batchCounts', {
                  completed: batch.completedCount,
                  failed: batch.failedCount,
                  total: batch.totalCount,
                })}
              </p>
            </div>
            <span className="text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
              {batchProgress}%
            </span>
          </div>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"
            role="progressbar"
            aria-valuenow={batchProgress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
              style={{ width: `${batchProgress}%` }}
            />
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs sm:p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end">
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {t('coverage.search')}
            <span className="relative mt-1.5 block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                placeholder={t('coverage.searchPlaceholder')}
              />
            </span>
          </label>
          <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {t('coverage.status')}
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as CoverageCandidateStatus | 'ALL')}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-indigo-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
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
            onClick={() => void submit()}
            disabled={!selectedCount || submitting}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {t('coverage.checkSelected')}
          </button>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-sm text-gray-500">
            <AppLoader size={56} label={t('coverage.loading')} />
            <span>{t('coverage.loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <span className="mb-3 rounded-full bg-gray-100 p-3 text-gray-400 dark:bg-gray-800">
              <Wifi className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('coverage.empty')}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800">
              <button
                type="button"
                onClick={toggleVisible}
                className="text-left text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400"
              >
                {allVisibleSelected ? t('coverage.clearPage') : t('coverage.selectPage')}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('coverage.total', { count: total })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-left text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="w-12 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleVisible}
                        aria-label={t('coverage.selectPage')}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3">{t('coverage.customer')}</th>
                    <th className="px-4 py-3">{t('coverage.address')}</th>
                    <th className="px-4 py-3">{t('coverage.coordinates')}</th>
                    <th className="px-4 py-3">{t('coverage.statusHeader')}</th>
                    <th className="px-4 py-3">{t('coverage.lastChecked')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr
                      key={item.verificationId}
                      className="transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40"
                    >
                      <td className="px-4 py-4 align-top">
                        <input
                          type="checkbox"
                          checked={selected.has(item.verificationId)}
                          onChange={() => toggle(item.verificationId)}
                          aria-label={item.customerName}
                          className="mt-0.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span className="rounded-lg bg-gray-100 p-2 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            <UserRound className="h-4 w-4" />
                          </span>
                          <div>
                            <div className="font-semibold text-gray-900 dark:text-white">{item.customerName}</div>
                            <div className="mt-1 font-mono text-xs text-gray-500">{item.customerExternalId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-[300px] px-4 py-4 align-top">
                        <div className="flex gap-2 text-gray-600 dark:text-gray-300">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <span className="leading-5">{item.address}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-top font-mono text-xs text-gray-600 dark:text-gray-300">
                        <div>{item.latitude.toFixed(6)}</div>
                        <div className="mt-1">{item.longitude.toFixed(6)}</div>
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.coverageStatus)}`}
                        >
                          {t(`coverage.status.${item.coverageStatus}`)}
                        </span>
                        {item.importedCoverageStatus === 'Not Coverage' && item.coverageStatus === 'NOT_CHECKED' && (
                          <div className="mt-2 max-w-40 text-xs leading-4 text-amber-700 dark:text-amber-400">
                            {t('coverage.importedNotCovered')}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 align-top text-xs text-gray-500 dark:text-gray-400">
                        {formatDate(item.lastCheckedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
              disabled={loading}
            />
          </>
        )}
      </section>
    </div>
  );
};
