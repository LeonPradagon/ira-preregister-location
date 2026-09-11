import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Filter,
  History,
  RefreshCw,
  Search,
  User,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { ApiClientError, api } from '../../lib/apiClient';
import { AuditLog } from '../../types';
import { AppLoader } from '../common/AppLoader';
import { TablePagination, TablePageSize } from '../common/AdminTable';
import { useTranslation } from '../../i18n';
import { userFriendlyAuditAction, userFriendlyAuditEntity } from '../../lib/statusLabels';
import { formatAppDateTime } from '../../lib/dateTime';

type AuditOutcome = 'success' | 'failed' | 'review' | 'recorded';

const getAuditOutcome = (action: string): AuditOutcome => {
  const normalized = action.toUpperCase();
  if (/(FAILED|REJECTED|MISMATCH|BLOCKED|ERROR)/.test(normalized)) return 'failed';
  if (/(REVIEW|WAITING|PROPOSED|ADDRESS_CHANGE_STARTED|LOW_ACCURACY)/.test(normalized)) return 'review';
  if (
    /(CREATED|UPDATED|COMPLETED|VALID|APPROVED|SENT|SCHEDULED|STARTED|OPENED|CONFIRMED|GIVEN|MATERIALIZED|RESENT|OPTED_OUT|REVOKED)/.test(
      normalized,
    )
  )
    return 'success';
  return 'recorded';
};

const outcomeStyles: Record<AuditOutcome, string> = {
  success:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
  failed: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300',
  review: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
  recorded:
    'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
};

export const AuditLogsView: React.FC = () => {
  const { t } = useTranslation();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [apiStatusCode, setApiStatusCode] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const [cursors, setCursors] = useState<Record<number, string>>({});

  useEffect(() => {
    setPage(1);
    setCursors({});
    setExpandedLogId(null);
  }, [searchTerm, actorFilter, entityFilter]);

  const load = async () => {
    setLoading(true);
    setApiStatus('loading');
    setApiStatusCode(null);
    setError(null);
    try {
      const response = await api.auditLogsWithStatus({
        page,
        pageSize,
        search: searchTerm,
        status: entityFilter,
        actor: actorFilter,
        cursor: page === 1 ? undefined : cursors[page],
      });
      if (response.data.nextCursor) setCursors((previous) => ({ ...previous, [page + 1]: response.data.nextCursor! }));
      setAuditLogs(response.data.items as unknown as AuditLog[]);
      setTotal(response.data.total);
      setApiStatusCode(response.status);
      setLastUpdatedAt(new Date().toISOString());
      setApiStatus('success');
    } catch (cause) {
      setApiStatus('error');
      setApiStatusCode(cause instanceof ApiClientError ? (cause.status ?? null) : null);
      setError(cause instanceof Error ? cause.message : t('audit.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [page, pageSize, searchTerm, actorFilter, entityFilter]);

  const outcomeLabel = (outcome: AuditOutcome) => {
    if (outcome === 'success') return t('audit.success');
    if (outcome === 'failed') return t('audit.failed');
    if (outcome === 'review') return t('audit.needsReview');
    return t('audit.recorded');
  };

  const outcomeIcon = (outcome: AuditOutcome) => {
    if (outcome === 'success') return <CheckCircle2 className="h-3.5 w-3.5" />;
    if (outcome === 'failed') return <XCircle className="h-3.5 w-3.5" />;
    if (outcome === 'review') return <CircleAlert className="h-3.5 w-3.5" />;
    return <Clock3 className="h-3.5 w-3.5" />;
  };

  const apiStatusLabel =
    apiStatus === 'success'
      ? t('audit.apiConnected')
      : apiStatus === 'error'
        ? t('audit.apiError')
        : t('audit.apiLoading');
  const apiCodeLabel = apiStatusCode ? `HTTP ${apiStatusCode}` : apiStatus === 'error' ? t('audit.networkError') : '';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                {t('audit.title')}
              </h1>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('audit.description')}</p>
            </div>
          </div>
          <div
            className={`flex items-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-semibold ${apiStatus === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : apiStatus === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300' : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'}`}
          >
            {apiStatus === 'success' ? (
              <Wifi className="h-3.5 w-3.5" />
            ) : apiStatus === 'error' ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : (
              <AppLoader size={18} label={t('audit.apiLoading')} />
            )}
            <span>
              {apiStatusLabel}
              {apiCodeLabel && ` · ${apiCodeLabel}`}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('audit.total')}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{total.toLocaleString('en-US')}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('audit.showing')}</p>
            <p className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
              {auditLogs.length.toLocaleString('en-US')}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{t('audit.lastUpdated')}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
              {lastUpdatedAt ? formatAppDateTime(lastUpdatedAt) : '—'}
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
              placeholder={t('audit.search')}
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-950"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Filter className="h-3.5 w-3.5" />
              <span>{t('audit.actor')}</span>
              <select
                value={actorFilter}
                onChange={(event) => setActorFilter(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="ALL">{t('audit.all')}</option>
                <option value="CUSTOMER">{t('audit.customer')}</option>
                <option value="SYSTEM">{t('audit.system')}</option>
                <option value="ADMIN">{t('audit.admin')}</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{t('audit.entity')}</span>
              <select
                value={entityFilter}
                onChange={(event) => setEntityFilter(event.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                <option value="ALL">{t('audit.all')}</option>
                <option value="VERIFICATION_SESSION">{t('audit.verification')}</option>
                <option value="VALIDATION">{t('audit.validation')}</option>
                <option value="CUSTOMER">{t('audit.customer')}</option>
                <option value="ADDRESS">{t('audit.address')}</option>
                <option value="REMINDER">{t('audit.reminder')}</option>
                <option value="REVIEW">{t('audit.review')}</option>
                <option value="CONFIG">{t('audit.config')}</option>
                <option value="CAMPAIGN">{t('audit.campaign')}</option>
                <option value="CAMPAIGN_ITEM">{t('audit.campaignItem')}</option>
                <option value="DELIVERY">{t('audit.delivery')}</option>
                <option value="AUTH">{t('audit.auth')}</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            aria-label={t('audit.refresh')}
          >
            {loading ? <AppLoader size={18} label={t('audit.apiLoading')} /> : <RefreshCw className="h-4 w-4" />}
            <span className="sm:hidden">{t('audit.refresh')}</span>
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('audit.activity')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('audit.activityHelp')}</p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t('audit.page')} {page}
          </span>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {auditLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            const outcome = getAuditOutcome(log.action);
            return (
              <article key={log.id} className="p-4 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                    className="mt-0.5 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                    aria-label={isExpanded ? t('audit.collapse') : t('audit.expand')}
                    title={isExpanded ? t('audit.collapse') : t('audit.expand')}
                  >
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {userFriendlyAuditAction(log.action)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${outcomeStyles[outcome]}`}
                        >
                          {outcomeIcon(outcome)}
                          {outcomeLabel(outcome)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5" />
                          {log.actorName}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5" />
                          {formatAppDateTime(log.timestamp)}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium text-slate-700 dark:text-slate-200">
                        {userFriendlyAuditEntity(log.entityType)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="break-all font-mono text-[11px]">{log.entityId}</span>
                    </div>
                    {log.reason && (
                      <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                        {log.reason}
                      </p>
                    )}
                    {isExpanded && (
                      <div className="mt-3 grid gap-3 border-t border-slate-200 pt-3 dark:border-slate-800 md:grid-cols-2">
                        {log.before && (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                            <div className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                              {t('audit.before')}
                            </div>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                              {JSON.stringify(log.before, null, 2)}
                            </pre>
                          </div>
                        )}
                        {log.after && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-800 dark:bg-emerald-950/20">
                            <div className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                              {t('audit.after')}
                            </div>
                            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-emerald-900 dark:text-emerald-200">
                              {JSON.stringify(log.after, null, 2)}
                            </pre>
                          </div>
                        )}
                        {!log.before && !log.after && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('audit.noDetails')}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
          {loading && (
            <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-slate-500 dark:text-slate-400">
              <AppLoader size={64} label={t('audit.loading')} />
              <span>{t('audit.loading')}</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <WifiOff className="h-8 w-8 text-rose-500" />
              <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{t('audit.apiError')}</p>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">{error}</p>
              <button
                type="button"
                onClick={() => void load()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
              >
                {t('audit.retry')}
              </button>
            </div>
          )}
          {!loading && !error && !auditLogs.length && (
            <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">{t('audit.empty')}</div>
          )}
        </div>
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
      </section>
    </div>
  );
};
