import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Circle, Loader2, RefreshCw, Search, Ticket, XCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { api, type TicketingCandidateApi, type TicketingMitraApi } from '../../lib/apiClient';
import { showActionError, showActionSuccess } from '../../lib/swal';
import { TablePagination, type TablePageSize } from '../common/AdminTable';

const normalizeMitraName = (name: string) => name.trim().toLocaleLowerCase();
const mitraEntriesForName = (name: string, mitraOptions: TicketingMitraApi[]) => {
  const normalized = normalizeMitraName(name);
  return normalized ? mitraOptions.filter((mitra) => normalizeMitraName(mitra.name) === normalized) : [];
};

interface TicketForm {
  title: string;
  description: string;
  solution: string;
  error_category: string;
  priority: string;
  severity: string;
  ticket_type: string;
  companies: string;
  alert_interval_minutes: number;
  attachments: string;
  entity_email: string;
  additional_creator: string;
  mitra_name: string;
  station: string;
}

type TicketSubmissionProgress = {
  phase: 'SENDING' | 'RESPONSE' | 'ERROR';
  response?: unknown;
  status?: string;
  message?: string;
};

const covered = (value: string | null | undefined) => {
  const normalized = value?.trim().toUpperCase() ?? '';
  return (
    normalized.startsWith('COVERED') && !normalized.startsWith('UNCOVERED') && !normalized.startsWith('NOT COVERED')
  );
};

function formFor(candidate: TicketingCandidateApi): TicketForm {
  const fwaCovered = covered(candidate.coverageFwaStatus) || candidate.latestFwaCoverageStatus === 'COVERED';
  const ftthCovered = covered(candidate.coverageFtthStatus);
  const coverageLabel = [fwaCovered && 'FWA', ftthCovered && 'FTTH'].filter(Boolean).join(' dan ');
  const matchedMitra =
    candidate.mitraMatch.status === 'MATCHED' ||
    candidate.mitraMatch.status === 'AMBIGUOUS' ||
    candidate.mitraMatch.status === 'RECOMMENDED'
      ? candidate.mitraMatch.candidates[0]
      : null;
  return {
    title: `Tindak lanjut coverage ${coverageLabel}: ${candidate.name}`,
    description: '',
    solution: '',
    error_category: 'instalasi',
    priority: 'LOW',
    severity: 'LOW',
    ticket_type: fwaCovered ? 'FWA' : 'FTTH',
    companies: 'SURGE',
    alert_interval_minutes: 60,
    attachments: '',
    entity_email: '',
    additional_creator: '-',
    mitra_name: matchedMitra?.name ?? '',
    station: matchedMitra?.stations.length === 1 ? matchedMitra.stations[0] : '',
  };
}

function statusClass(status: string) {
  if (status === 'PUBLISHED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'FAILED') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (status === 'PROCESSING') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-gray-200 bg-gray-50 text-gray-600';
}

function statusLabel(status: string) {
  if (status === 'PUBLISHED') return 'Diterima provider';
  if (status === 'FAILED') return 'Gagal dikirim';
  if (status === 'PROCESSING') return 'Sedang diproses';
  return 'Belum dibuat';
}

function statusHint(item: TicketingCandidateApi) {
  const attempt = item.ticketAttemptCount > 0 ? `Percobaan ke-${item.ticketAttemptCount}. ` : '';
  const providerStatus = item.providerStatus
    ? `Status provider: ${item.providerStatus}${item.providerStatusForCustomer ? ` (${item.providerStatusForCustomer})` : ''}. `
    : '';
  if (item.ticketStatus === 'PUBLISHED')
    return `${attempt}${providerStatus}${item.providerTicketId ? `Nomor tiket: ${item.providerTicketId}` : 'Provider menerima permintaan; nomor tiket belum dikembalikan.'}`;
  if (item.ticketStatus === 'PROCESSING') return `${attempt}Permintaan sedang diteruskan ke sistem ticketing.`;
  if (item.ticketStatus === 'FAILED') return `${attempt}Permintaan gagal; periksa keterangan lalu kirim ulang.`;
  return 'Pelanggan siap dibuatkan tiket.';
}

function providerResponseText(response: unknown) {
  if (typeof response === 'string') return response;
  try {
    return JSON.stringify(response, null, 2);
  } catch {
    return 'Respons provider tidak dapat ditampilkan.';
  }
}

function providerResponseValue(response: unknown, key: string): string | null {
  if (!response || typeof response !== 'object') return null;
  const value = response as Record<string, unknown>;
  const nested = value.data && typeof value.data === 'object' ? (value.data as Record<string, unknown>) : null;
  const candidate = value[key] ?? nested?.[key];
  return typeof candidate === 'string' || typeof candidate === 'number' ? String(candidate) : null;
}

function coverageLabel(value: string | null | undefined) {
  return covered(value) ? 'Tersedia' : 'Belum tersedia';
}

const fieldLabels: Record<string, string> = {
  title: 'Judul tiket',
  description: 'Ringkasan masalah',
  solution: 'Tindakan yang disarankan',
  error_category: 'Kategori masalah',
  priority: 'Prioritas',
  severity: 'Tingkat keparahan',
  ticket_type: 'Jenis layanan',
  companies: 'Tim/perusahaan penanggung jawab',
  entity_email: 'Email pelanggan',
  additional_creator: 'Pembuat tambahan',
  mitra_name: 'Nama mitra/dealer',
  station: 'Nama station',
};

export const TicketingView: React.FC = () => {
  const { currentAdmin, validationConfig } = useApp();
  const [items, setItems] = useState<TicketingCandidateApi[]>([]);
  const [selected, setSelected] = useState<TicketingCandidateApi | null>(null);
  const [form, setForm] = useState<TicketForm | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submissionProgress, setSubmissionProgress] = useState<TicketSubmissionProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mitraOptions, setMitraOptions] = useState<TicketingMitraApi[]>([]);
  const [mitraLoadError, setMitraLoadError] = useState<string | null>(null);
  const matchingMitras = form ? mitraEntriesForName(form.mitra_name, mitraOptions) : [];
  const spatialMitra =
    selected?.mitraMatch.status === 'MATCHED' ||
    selected?.mitraMatch.status === 'AMBIGUOUS' ||
    selected?.mitraMatch.status === 'RECOMMENDED'
      ? selected.mitraMatch.candidates[0]
      : null;
  const spatialStations =
    form && spatialMitra && normalizeMitraName(form.mitra_name) === normalizeMitraName(spatialMitra.name)
      ? spatialMitra.stations
      : [];
  const stationOptions =
    spatialStations.length > 0
      ? spatialStations
      : [...new Set(matchingMitras.flatMap((mitra) => mitra.locations))].sort((a, b) => a.localeCompare(b));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.ticketingCandidates({ page, pageSize, search });
      setItems(response.items);
      setTotal(response.total);
      if (selected) {
        const refreshed = response.items.find((item) => item.customerId === selected.customerId);
        if (refreshed) setSelected(refreshed);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Daftar ticketing gagal dimuat.');
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

  useEffect(() => {
    let mounted = true;
    void api
      .ticketingMitra()
      .then((options) => {
        if (mounted) setMitraOptions(options);
      })
      .catch((cause) => {
        if (mounted) setMitraLoadError(cause instanceof Error ? cause.message : 'Daftar mitra gagal dimuat.');
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectCandidate = (candidate: TicketingCandidateApi) => {
    setSelected(candidate);
    setForm(formFor(candidate));
  };

  const update = (key: keyof TicketForm, value: string | number) =>
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));

  const updateMitraName = (name: string) =>
    setForm((previous) => {
      if (!previous) return previous;
      const matches = mitraEntriesForName(name, mitraOptions);
      const locations = new Set(matches.flatMap((mitra) => mitra.locations));
      return {
        ...previous,
        mitra_name: name,
        station: locations.has(previous.station) ? previous.station : '',
      };
    });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !form) return;
    if (!mitraEntriesForName(form.mitra_name, mitraOptions).length) {
      setError('Pilih nama mitra/dealer dari opsi yang tersedia.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSubmissionProgress({ phase: 'SENDING' });
    try {
      const response = await api.createTicket({
        customerId: selected.customerId,
        payload: {
          title: form.title,
          description: form.description.trim(),
          solution: form.solution,
          error_category: form.error_category,
          priority: form.priority,
          severity: form.severity,
          ticket_type: form.ticket_type,
          companies: form.companies
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          alert_interval_minutes: Number(form.alert_interval_minutes),
          attachments: form.attachments
            .split(/[,\n]/)
            .map((value) => value.trim())
            .filter(Boolean),
        },
        entity: {
          ...(form.entity_email.trim() ? { entity_email: form.entity_email.trim() } : {}),
          ...(form.additional_creator.trim() ? { additional_creator: form.additional_creator.trim() } : {}),
        },
        mitra_data: { name: form.mitra_name.trim(), station: form.station.trim() || null },
      });
      await load();
      setSubmissionProgress({ phase: 'RESPONSE', response: response.providerResponse, status: response.status });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Ticket gagal dibuat.';
      // Re-read server state so a failed request cannot leave a stale
      // "published" row visible in the table.
      await load();
      setSubmissionProgress({ phase: 'ERROR', message });
    } finally {
      setSubmitting(false);
    }
  };

  const finishSubmission = async () => {
    if (!submissionProgress || submitting) return;
    const progress = submissionProgress;
    setSubmissionProgress(null);
    if (progress.phase === 'RESPONSE') {
      const alreadyCreated = progress.status === 'ALREADY_CREATED';
      setSelected(null);
      setForm(null);
      await showActionSuccess(
        alreadyCreated ? 'Ticket sudah pernah dibuat' : 'Ticket berhasil dibuat',
        alreadyCreated
          ? 'Ticket untuk pelanggan ini sudah tercatat sebelumnya.'
          : 'Provider sudah memberikan respons atas ticket.',
      );
    } else if (progress.phase === 'ERROR') {
      await showActionError('Ticket gagal dibuat', progress.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Pembuatan Tiket</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Buat tiket tindak lanjut untuk pelanggan dengan layanan FWA atau FTTH yang tersedia.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs dark:border-gray-800 dark:bg-gray-900">
        <label className="block max-w-xl text-xs font-semibold text-gray-600 dark:text-gray-300">
          Cari pelanggan
          <span className="relative mt-1.5 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari nama atau nomor pelanggan"
              className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-12 pr-4 text-sm font-normal text-gray-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </span>
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Memuat kandidat...
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-sm text-gray-500">Belum ada pelanggan dengan coverage tersedia.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:bg-gray-800/60 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3">Pelanggan</th>
                    <th className="px-4 py-3">Ketersediaan layanan</th>
                    <th className="px-4 py-3">Alamat pemasangan</th>
                    <th className="px-4 py-3">Status tiket</th>
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
                      <td className="px-4 py-4 align-top text-xs text-gray-600 dark:text-gray-300">
                        <div>
                          <span className="font-semibold">FWA:</span>{' '}
                          {coverageLabel(item.latestFwaCoverageStatus ?? item.coverageFwaStatus)}
                        </div>
                        <div className="mt-1">
                          <span className="font-semibold">FTTH:</span> {coverageLabel(item.coverageFtthStatus)}
                        </div>
                      </td>
                      <td className="max-w-sm px-4 py-4 align-top text-xs text-gray-600 dark:text-gray-300">
                        {item.address?.rawAddress ?? '—'}
                      </td>
                      <td className="px-4 py-4 align-top">
                        <span
                          className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusClass(item.ticketStatus)}`}
                        >
                          {statusLabel(item.ticketStatus)}
                        </span>
                        <div className="mt-1 max-w-xs text-[11px] text-gray-500 dark:text-gray-400">
                          {statusHint(item)}
                        </div>
                        {item.providerResponse != null && (
                          <details className="mt-1 max-w-xs text-[11px] text-gray-500 dark:text-gray-400">
                            <summary className="cursor-pointer font-semibold">Lihat respons sistem</summary>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] dark:bg-gray-800">
                              {providerResponseText(item.providerResponse)}
                            </pre>
                          </details>
                        )}
                        {item.ticketError && (
                          <div className="mt-1 max-w-xs text-[11px] text-rose-600">{item.ticketError}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 align-top text-right">
                        <button
                          type="button"
                          onClick={() => selectCandidate(item)}
                          disabled={item.ticketStatus === 'PUBLISHED' || currentAdmin?.role === 'VIEWER'}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {item.ticketStatus === 'PUBLISHED' ? 'Tiket sudah dibuat' : 'Buat tiket'}
                        </button>
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

      {selected && form && (
        <div
          className="fixed inset-0 z-[1100] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-2 sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) {
              setSelected(null);
              setForm(null);
            }
          }}
        >
          <section
            className="coreui-modal my-auto max-h-[calc(100dvh-1rem)] w-full max-w-4xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-h-[calc(100dvh-2rem)] sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticketing-modal-title"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 id="ticketing-modal-title" className="font-semibold text-gray-900 dark:text-white">
                  Buat tiket untuk {selected.name}
                </h2>
                <p className="mt-1 text-xs text-gray-500">Nomor pelanggan: {selected.externalId}</p>
              </div>
              <button
                type="button"
                aria-label="Tutup modal"
                onClick={() => {
                  setSelected(null);
                  setForm(null);
                }}
                disabled={submitting}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={(event) => void submit(event)} className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 md:col-span-2">
                  {fieldLabels.title}
                  <input
                    value={form.title}
                    onChange={(event) => update('title', event.target.value)}
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 md:col-span-2">
                  {fieldLabels.description}
                  <textarea
                    value={form.description}
                    onChange={(event) => update('description', event.target.value)}
                    required
                    rows={4}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 md:col-span-2">
                  {fieldLabels.solution}
                  <textarea
                    value={form.solution}
                    onChange={(event) => update('solution', event.target.value)}
                    required
                    rows={3}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {fieldLabels.error_category}
                  <input
                    value={form.error_category}
                    onChange={(event) => update('error_category', event.target.value)}
                    required
                    placeholder="Contoh: instalasi"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {fieldLabels.companies}
                  <input
                    value="SURGE"
                    disabled
                    required
                    aria-label="Tim/perusahaan penanggung jawab"
                    className="mt-1 block w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 text-sm font-normal text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {fieldLabels.priority}
                  <div className="relative mt-1">
                    <select
                      value={form.priority}
                      onChange={(event) => update('priority', event.target.value)}
                      required
                      className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="LOW">Rendah</option>
                      <option value="MEDIUM">Sedang</option>
                      <option value="HIGH">Tinggi</option>
                      <option value="CRITICAL">Kritis</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                    />
                  </div>
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {fieldLabels.severity}
                  <div className="relative mt-1">
                    <select
                      value={form.severity}
                      onChange={(event) => update('severity', event.target.value)}
                      required
                      className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="LOW">Rendah</option>
                      <option value="MEDIUM">Sedang</option>
                      <option value="HIGH">Tinggi</option>
                      <option value="CRITICAL">Kritis</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                    />
                  </div>
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {fieldLabels.ticket_type}
                  <div className="relative mt-1">
                    <select
                      value={form.ticket_type}
                      onChange={(event) => update('ticket_type', event.target.value)}
                      required
                      className="block w-full appearance-none rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-12 text-sm text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="FWA">FWA</option>
                      <option value="FTTH">FTTH</option>
                      <option value="FWA+FTTH">FWA dan FTTH</option>
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 dark:text-gray-400"
                    />
                  </div>
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                  Interval pengingat (menit)
                  <input
                    type="number"
                    min={1}
                    value={form.alert_interval_minutes}
                    onChange={(event) => update('alert_interval_minutes', Number(event.target.value))}
                    required
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-300 md:col-span-2">
                  Lampiran (opsional)
                  <input
                    value={form.attachments}
                    onChange={(event) => update('attachments', event.target.value)}
                    placeholder="Masukkan URL gambar/dokumen, pisahkan dengan koma"
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </label>
              </div>

              <details className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-gray-800/40">
                <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-200">
                  Data teknis tambahan (nama mitra wajib)
                </summary>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {selected?.mitraMatch.status === 'MATCHED' && (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 md:col-span-2">
                      Mitra terdekat di FWA berjarak{' '}
                      {Math.round(selected.mitraMatch.candidates[0]?.distanceMeters ?? 0)} m (≤
                      {validationConfig.TICKETING_AUTO_MATCH_MAX_METERS} m). Pastikan hasilnya benar.
                    </p>
                  )}
                  {selected?.mitraMatch.status === 'RECOMMENDED' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2">
                      Rekomendasi terdekat ({validationConfig.TICKETING_AUTO_MATCH_MAX_METERS + 1}–
                      {validationConfig.TICKETING_RECOMMENDATION_MAX_METERS} m) sudah terisi sebagai pilihan awal:{' '}
                      {selected.mitraMatch.candidates
                        .map((candidate) => `${candidate.name} (${Math.round(candidate.distanceMeters)} m)`)
                        .join(', ')}
                      . Konfirmasi dengan memilih mitra secara manual.
                    </p>
                  )}
                  {selected?.mitraMatch.status === 'AMBIGUOUS' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2">
                      Pilihan awal adalah mitra FWA terdekat: {selected.mitraMatch.candidates[0]?.name} (
                      {Math.round(selected.mitraMatch.candidates[0]?.distanceMeters ?? 0)} m). Alternatif dalam radius
                      auto-match (≤{validationConfig.TICKETING_AUTO_MATCH_MAX_METERS} m):{' '}
                      {selected.mitraMatch.candidates
                        .slice(1)
                        .map((candidate) => `${candidate.name} (${Math.round(candidate.distanceMeters)} m)`)
                        .join(', ') || 'tidak ada'}
                      . Pastikan pilihan benar sebelum mengirim tiket.
                    </p>
                  )}
                  {selected?.mitraMatch.status === 'FAR' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2">
                      Mitra FWA terdekat {selected.mitraMatch.candidates[0]?.name} berjarak{' '}
                      {Math.round(selected.mitraMatch.candidates[0]?.distanceMeters ?? 0)} m (&gt;
                      {validationConfig.TICKETING_RECOMMENDATION_MAX_METERS} m). Periksa koordinat dan pilih manual.
                    </p>
                  )}
                  {selected?.mitraMatch.status === 'UNAVAILABLE' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2">
                      Lookup koordinat FWA belum tersedia. Pilih mitra secara manual.
                    </p>
                  )}
                  {selected?.mitraMatch.status === 'NOT_FOUND' && (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200 md:col-span-2">
                      {selected.validatedCoordinates
                        ? 'Tidak ditemukan mitra FWA dalam radius 5 km; pilih mitra secara manual.'
                        : 'Koordinat tervalidasi tidak tersedia; pilih mitra secara manual.'}
                    </p>
                  )}
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                    Koordinat tervalidasi
                    <input
                      readOnly
                      value={
                        selected?.validatedCoordinates
                          ? `${selected.validatedCoordinates.latitude.toFixed(7)}, ${selected.validatedCoordinates.longitude.toFixed(7)}`
                          : 'Tidak tersedia'
                      }
                      className="mt-1 block w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 text-sm font-normal text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                    />
                    <span className="mt-1 block font-normal text-gray-500 dark:text-gray-400">
                      Koordinat validasi customer; CPE tidak diisi.
                    </span>
                  </label>
                  {(['entity_email', 'additional_creator', 'mitra_name', 'station'] as const).map((key) => (
                    <label key={key} className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                      {fieldLabels[key]}
                      <input
                        value={form[key]}
                        onChange={(event) =>
                          key === 'mitra_name' ? updateMitraName(event.target.value) : update(key, event.target.value)
                        }
                        type={key === 'entity_email' ? 'email' : 'text'}
                        placeholder={
                          key === 'mitra_name'
                            ? 'Cari dan pilih mitra/dealer'
                            : key === 'station'
                              ? 'Pilih station/lokasi terkait'
                              : undefined
                        }
                        list={
                          key === 'mitra_name'
                            ? 'ticketing-mitra-options'
                            : key === 'station'
                              ? 'ticketing-station-options'
                              : undefined
                        }
                        required={key === 'mitra_name'}
                        className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm font-normal text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                      />
                      {key === 'mitra_name' && (
                        <datalist id="ticketing-mitra-options">
                          {mitraOptions.map((mitra, index) => (
                            <option
                              key={`${mitra.code}-${index}`}
                              value={mitra.name}
                              label={`${mitra.code ?? 'Tanpa kode'} · ${mitra.locations.length} site/lokasi`}
                            />
                          ))}
                        </datalist>
                      )}
                      {key === 'mitra_name' && mitraLoadError && (
                        <span className="mt-1 block font-normal text-rose-600 dark:text-rose-400">
                          Daftar mitra gagal dimuat: {mitraLoadError}
                        </span>
                      )}
                      {key === 'station' && (
                        <>
                          <datalist id="ticketing-station-options">
                            {stationOptions.map((station) => (
                              <option key={station} value={station} />
                            ))}
                          </datalist>
                          <span className="mt-1 block font-normal text-gray-500 dark:text-gray-400">
                            {matchingMitras.length > 1
                              ? 'Nama mitra duplikat di sumber; pilih station/lokasi yang sesuai.'
                              : matchingMitras.length === 0
                                ? 'Pilih mitra terdaftar untuk melihat station/lokasinya.'
                                : stationOptions.length > 0
                                  ? `${stationOptions.length} station/lokasi tersedia untuk mitra ini.`
                                  : 'Belum ada site/lokasi terdaftar untuk mitra ini.'}
                          </span>
                        </>
                      )}
                    </label>
                  ))}
                </div>
              </details>
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setForm(null);
                  }}
                  disabled={submitting}
                  className="coreui-modal-secondary rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || currentAdmin?.role === 'VIEWER'}
                  className="coreui-modal-primary inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Kirim tiket
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {submissionProgress && (
        <div
          className="fixed inset-0 z-[1110] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-2 sm:items-center sm:p-5"
          role="presentation"
        >
          <section
            className="coreui-modal my-auto max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-900 sm:max-h-[calc(100dvh-2rem)] sm:p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-submit-progress-title"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <h2 id="ticket-submit-progress-title" className="font-semibold text-gray-900 dark:text-white">
                  Alur pengiriman ticket
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Pastikan ticket sudah diterima dan feedback provider terlihat.
                </p>
              </div>
            </div>

            <ol className="mt-6 space-y-0">
              {[
                {
                  label: 'Data ticket disiapkan',
                  detail: 'Data pelanggan dan permintaan ticket sudah siap.',
                  state: 'done',
                },
                {
                  label: 'Ticket dikirim ke provider',
                  detail:
                    submissionProgress.phase === 'SENDING'
                      ? 'Sedang mengirim ticket...'
                      : 'Request pengiriman selesai.',
                  state: submissionProgress.phase === 'SENDING' ? 'active' : 'done',
                },
                {
                  label:
                    submissionProgress.phase === 'ERROR' ? 'Provider gagal merespons' : 'Provider memberikan respons',
                  detail:
                    submissionProgress.phase === 'ERROR'
                      ? (submissionProgress.message ?? 'Pengiriman gagal.')
                      : submissionProgress.phase === 'SENDING'
                        ? 'Menunggu balasan provider...'
                        : `Respons HTTP diterima. Status lokal: ${submissionProgress.status ?? '—'}.`,
                  state:
                    submissionProgress.phase === 'ERROR'
                      ? 'error'
                      : submissionProgress.phase === 'SENDING'
                        ? 'pending'
                        : 'done',
                },
                {
                  label: 'Feedback provider',
                  detail:
                    submissionProgress.phase === 'RESPONSE'
                      ? (providerResponseValue(submissionProgress.response, 'status_for_customer') ??
                        providerResponseValue(submissionProgress.response, 'message') ??
                        'Provider menerima request tanpa feedback tambahan.')
                      : 'Feedback tampil setelah provider merespons.',
                  state:
                    submissionProgress.phase === 'RESPONSE'
                      ? 'done'
                      : submissionProgress.phase === 'ERROR'
                        ? 'error'
                        : 'pending',
                },
              ].map((step, index, steps) => {
                const Icon =
                  step.state === 'active'
                    ? Loader2
                    : step.state === 'error'
                      ? XCircle
                      : step.state === 'done'
                        ? CheckCircle2
                        : Circle;
                const iconClass =
                  step.state === 'error'
                    ? 'text-rose-500'
                    : step.state === 'done'
                      ? 'text-emerald-500'
                      : step.state === 'active'
                        ? 'animate-spin text-blue-500'
                        : 'text-gray-300 dark:text-gray-600';
                return (
                  <li key={step.label} className="relative flex gap-3 pb-6 last:pb-0">
                    {index < steps.length - 1 && (
                      <span
                        className="absolute left-[11px] top-7 h-full w-px bg-gray-200 dark:bg-gray-700"
                        aria-hidden="true"
                      />
                    )}
                    <Icon className={`relative z-10 h-6 w-6 shrink-0 bg-white dark:bg-gray-900 ${iconClass}`} />
                    <div className="min-w-0 pt-0.5">
                      <div className="text-sm font-semibold text-gray-900 dark:text-white">{step.label}</div>
                      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{step.detail}</div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {submissionProgress.phase === 'RESPONSE' && (
              <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <div className="font-semibold">Feedback provider</div>
                <div className="mt-1">
                  Nomor ticket:{' '}
                  {providerResponseValue(submissionProgress.response, 'numberTicket') ?? 'belum dikembalikan'}
                </div>
                <div>
                  Status provider:{' '}
                  {providerResponseValue(submissionProgress.response, 'status') ?? 'belum dikembalikan'}
                </div>
                <div>
                  Status pelanggan:{' '}
                  {providerResponseValue(submissionProgress.response, 'status_for_customer') ?? 'belum dikembalikan'}
                </div>
              </div>
            )}
            {submissionProgress.phase === 'ERROR' && (
              <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {submissionProgress.message}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => void finishSubmission()}
                disabled={submitting}
                className="coreui-modal-primary rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submissionProgress.phase === 'SENDING' ? 'Menunggu...' : 'Selesai'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
