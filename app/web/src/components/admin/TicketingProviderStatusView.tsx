import React, { useEffect, useState } from 'react';
import { CheckCircle2, Circle, GitBranch, Loader2, RefreshCw, Search, Wifi, XCircle } from 'lucide-react';
import { api, type TicketingCandidateApi } from '../../lib/apiClient';
import { TablePagination, type TablePageSize } from '../common/AdminTable';

type ProviderStatusResult = Awaited<ReturnType<typeof api.ticketingProviderStatus>>;
type StatusCheckState = {
  candidate: TicketingCandidateApi;
  phase: 'CHECKING' | 'FOUND' | 'NOT_FOUND' | 'ERROR';
  result?: ProviderStatusResult;
  error?: string;
};

function localStatusLabel(status: string) {
  if (status === 'PUBLISHED') return 'Diterima provider';
  if (status === 'FAILED') return 'Gagal dikirim';
  if (status === 'PROCESSING') return 'Sedang diproses';
  return 'Belum dibuat';
}

function localStatusClass(status: string) {
  if (status === 'PUBLISHED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'PROCESSING') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function providerStatusText(item: TicketingCandidateApi) {
  if (!item.providerStatus) return 'Belum dicek';
  return item.providerStatusForCustomer ? `${item.providerStatus} — ${item.providerStatusForCustomer}` : item.providerStatus;
}

export const TicketingProviderStatusView: React.FC = () => {
  const [items, setItems] = useState<TicketingCandidateApi[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [statusCheck, setStatusCheck] = useState<StatusCheckState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.ticketingCandidates({ page, pageSize, search });
      setItems(response.items);
      setTotal(response.total);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Daftar status ticketing gagal dimuat.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  useEffect(() => {
    void load();
  }, [page, pageSize, search]);

  const checkStatus = async (item: TicketingCandidateApi) => {
    setChecking(item.customerId);
    setStatusCheck({ candidate: item, phase: 'CHECKING' });
    try {
      const response = await api.ticketingProviderStatus(item.customerId);
      await load();
      setStatusCheck({ candidate: item, phase: response.status, result: response });
    } catch (cause) {
      setStatusCheck({
        candidate: item,
        phase: 'ERROR',
        error: cause instanceof Error ? cause.message : 'Status provider gagal diperiksa.',
      });
    } finally {
      setChecking(null);
    }
  };

  const closeStatusCheck = () => {
    if (!checking) setStatusCheck(null);
  };

  const timeline = statusCheck
    ? [
        { label: 'Pelanggan dipilih', detail: statusCheck.candidate.externalId, state: 'done' },
        {
          label: 'Mengirim permintaan ke provider',
          detail: statusCheck.phase === 'CHECKING' ? 'Sedang mencari ticket...' : `Platform: ${statusCheck.result?.platform ?? '—'}`,
          state: statusCheck.phase === 'CHECKING' ? 'active' : statusCheck.phase === 'ERROR' ? 'error' : 'done',
        },
        {
          label: statusCheck.phase === 'NOT_FOUND' ? 'Ticket belum ditemukan' : statusCheck.phase === 'ERROR' ? 'Pengecekan gagal' : 'Ticket ditemukan',
          detail: statusCheck.phase === 'NOT_FOUND'
            ? 'Provider belum mengembalikan ticket untuk pelanggan ini.'
            : statusCheck.error ?? (statusCheck.result?.providerTicketId ? `Nomor tiket: ${statusCheck.result.providerTicketId}` : 'Provider mengembalikan data ticket.'),
          state: statusCheck.phase === 'CHECKING' ? 'pending' : statusCheck.phase === 'NOT_FOUND' || statusCheck.phase === 'ERROR' ? 'error' : 'done',
        },
        {
          label: 'Status ticket provider',
          detail: statusCheck.result?.providerStatus ?? 'Menunggu hasil provider',
          state: statusCheck.phase === 'FOUND' ? 'done' : 'pending',
        },
        {
          label: 'Status untuk pelanggan',
          detail: statusCheck.result?.providerStatusForCustomer ?? 'Belum tersedia',
          state: statusCheck.phase === 'FOUND' ? 'done' : 'pending',
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><Wifi className="h-6 w-6" /></div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Status Provider Ticketing</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Cek status ticket langsung dari provider tanpa membuka menu pembuatan tiket.</p>
            </div>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh daftar
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <label className="relative block max-w-xl text-xs font-semibold text-gray-600 dark:text-gray-300">
          Cari pelanggan
          <Search className="pointer-events-none absolute left-3 top-8 h-4 w-4 text-gray-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau nomor pelanggan" className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm font-normal text-gray-900 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Memuat status...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Belum ada kandidat ticketing.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">Status lokal</th>
                    <th className="px-4 py-3">Status provider</th>
                    <th className="px-4 py-3">Nomor tiket</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item) => (
                    <tr key={item.customerId} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-4 align-top">
                        <div className="font-semibold text-gray-900 dark:text-white">{item.name}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{item.externalId}</div>
                      </td>
                      <td className="px-4 py-4 align-top"><span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${localStatusClass(item.ticketStatus)}`}>{localStatusLabel(item.ticketStatus)}</span></td>
                      <td className="px-4 py-4 align-top text-xs text-gray-600 dark:text-gray-300">{providerStatusText(item)}</td>
                      <td className="px-4 py-4 align-top font-mono text-xs text-gray-600 dark:text-gray-300">{item.providerTicketId ?? '—'}</td>
                      <td className="px-4 py-4 text-right align-top">
                        <button type="button" onClick={() => void checkStatus(item)} disabled={checking === item.customerId} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                          {checking === item.customerId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          Cek status
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(value) => { setPageSize(value); setPage(1); }} disabled={loading} />
          </>
        )}
      </section>

      {statusCheck && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeStatusCheck(); }}>
          <section className="w-full max-w-2xl rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900" role="dialog" aria-modal="true" aria-labelledby="provider-status-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300"><GitBranch className="h-5 w-5" /></div>
                <div>
                  <h2 id="provider-status-modal-title" className="font-semibold text-gray-900 dark:text-white">Alur cek status provider</h2>
                  <p className="mt-1 text-xs text-gray-500">{statusCheck.candidate.name} · {statusCheck.candidate.externalId}</p>
                </div>
              </div>
              <button type="button" aria-label="Tutup modal" onClick={closeStatusCheck} disabled={Boolean(checking)} className="text-gray-400 hover:text-gray-700 disabled:opacity-50"><XCircle className="h-5 w-5" /></button>
            </div>

            <ol className="mt-6 space-y-0">
              {timeline.map((step, index) => {
                const Icon = step.state === 'active' ? Loader2 : step.state === 'error' ? XCircle : step.state === 'done' ? CheckCircle2 : Circle;
                const iconClass = step.state === 'error' ? 'text-rose-500' : step.state === 'done' ? 'text-emerald-500' : step.state === 'active' ? 'animate-spin text-blue-500' : 'text-gray-300 dark:text-gray-600';
                return (
                  <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                    {index < timeline.length - 1 && <span className="absolute left-[11px] top-7 h-full w-px bg-gray-200 dark:bg-gray-700" aria-hidden="true" />}
                    <Icon className={`relative z-10 h-6 w-6 shrink-0 bg-white dark:bg-gray-900 ${iconClass}`} />
                    <div className="min-w-0 pt-0.5">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{step.label}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{step.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {statusCheck.result?.providerResponse != null && (
              <details className="mt-5 rounded-lg border border-gray-200 p-3 text-xs dark:border-gray-700">
                <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-200">Lihat respons provider</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] dark:bg-gray-800">{JSON.stringify(statusCheck.result.providerResponse, null, 2)}</pre>
              </details>
            )}

            <div className="mt-6 flex justify-end">
              <button type="button" onClick={closeStatusCheck} disabled={Boolean(checking)} className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Tutup</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
