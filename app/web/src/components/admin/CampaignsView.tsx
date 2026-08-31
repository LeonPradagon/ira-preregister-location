import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Megaphone, Play, RefreshCw, Search, Send, Users } from 'lucide-react';
import { mapApiCustomer, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, VerificationCampaign } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';

const campaignStatusLabel: Record<string, string> = { DRAFT: 'Draft', RUNNING: 'Berjalan', PAUSED: 'Dijeda', COMPLETED: 'Selesai' };
const itemStatusLabel: Record<string, string> = { PENDING: 'Menunggu', PROCESSING: 'Diproses', SENT: 'Diterima provider', DELIVERED: 'Terkirim', READ: 'Dibaca', FAILED: 'Gagal', PROVIDER_UNAVAILABLE: 'Provider tidak tersedia', OPTED_OUT: 'Opt-out' };

function mapCampaign(raw: Record<string, unknown>): VerificationCampaign {
  return {
    ...(raw as unknown as VerificationCampaign),
    id: String(raw.id), name: String(raw.name ?? ''),
    status: String(raw.status ?? 'DRAFT') as VerificationCampaign['status'],
    timezone: String(raw.timezone ?? 'Asia/Jakarta'), scheduledAt: String(raw.scheduledAt ?? ''),
    targetCount: Number(raw.targetCount ?? 0), sentCount: Number(raw.sentCount ?? 0), failedCount: Number(raw.failedCount ?? 0),
    optedOutCount: Number(raw.optedOutCount ?? 0), batchSize: Number(raw.batchSize ?? 1000), sendWindowDays: Number(raw.sendWindowDays ?? 7),
    materializedCount: Number(raw.materializedCount ?? 0), materializationComplete: Boolean(raw.materializationComplete),
    createdBy: String(raw.createdBy ?? ''), createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? ''),
  };
}

export const CampaignsView: React.FC = () => {
  const { createCampaign, startCampaign } = useApp();
  const [campaigns, setCampaigns] = useState<VerificationCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('Verifikasi Lokasi');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectAllEligible, setSelectAllEligible] = useState(false);
  const [batchSize, setBatchSize] = useState(1000);
  const [sendWindowDays, setSendWindowDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState<TablePageSize>(10);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [customerSearch, setCustomerSearch] = useState('');
  const [candidateCustomers, setCandidateCustomers] = useState<Customer[]>([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState<TablePageSize>(25);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateLoading, setCandidateLoading] = useState(true);

  const selectableCustomers = useMemo(() => candidateCustomers.filter((customer) => customer.status !== 'SUSPENDED' && !customer.whatsappOptOutAt), [candidateCustomers]);
  const allSelected = selectableCustomers.length > 0 && selectableCustomers.every((customer) => selected.includes(customer.id));

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await api.campaigns({ page, pageSize, search: searchTerm });
      setCampaigns(response.items.map(mapCampaign));
      setTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Campaign gagal dimuat.');
    } finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); }, [searchTerm]);
  useEffect(() => { void loadCampaigns(); }, [page, pageSize, searchTerm]);

  const loadCandidates = async () => {
    setCandidateLoading(true);
    try {
      const response = await api.customers({ page: candidatePage, pageSize: candidatePageSize, search: customerSearch, locationStatus: 'UNVERIFIED' });
      setCandidateCustomers(response.items.map(mapApiCustomer));
      setCandidateTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Daftar target belum terverifikasi gagal dimuat.');
    } finally { setCandidateLoading(false); }
  };

  useEffect(() => { void loadCandidates(); }, [candidatePage, candidatePageSize, customerSearch]);

  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !selectableCustomers.some((customer) => customer.id === id)) : [...new Set([...selected, ...selectableCustomers.map((customer) => customer.id)])]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected.length && !selectAllEligible) { setMessage('Pilih customer atau gunakan semua customer eligible.'); return; }
    setBusy(true); setMessage(null);
    try {
      const campaign = await createCampaign(name, selectAllEligible ? [] : selected, undefined, selectAllEligible ? { targetFilter: { locationStatus: 'UNVERIFIED', search: customerSearch }, batchSize, sendWindowDays } : { batchSize, sendWindowDays });
      await startCampaign(campaign.id);
      setSelected([]); setSelectAllEligible(false);
      setMessage(`Campaign dibuat dan dijadwalkan untuk ${campaign.targetCount.toLocaleString('id-ID')} customer.`);
      await loadCampaigns();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Campaign gagal dibuat.'); }
    finally { setBusy(false); }
  };

  const showItems = async (campaignId: string, nextPage = 1, nextPageSize = itemPageSize) => {
    setSelectedCampaignId(campaignId); setItemPage(nextPage); setItemPageSize(nextPageSize);
    try {
      const response = await api.campaignItems(campaignId, { page: nextPage, pageSize: nextPageSize });
      setItems(response.items); setItemTotal(response.total);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Status item tidak dapat dimuat.'); }
  };

  return <div className="space-y-6">
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3"><Megaphone className="mt-0.5 h-5 w-5 text-indigo-500" /><div><h1 className="text-base font-semibold">Campaign Blast WhatsApp</h1><p className="mt-1 text-xs text-gray-500">Kirim bertahap melalui queue. Target dapat dipilih per halaman atau seluruh customer yang eligible.</p></div></div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder="Nama campaign" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><label className="text-xs text-gray-600 dark:text-gray-300">Ukuran batch worker<input type="number" min={100} max={10000} step={100} value={batchSize} onChange={(event) => setBatchSize(Math.min(10000, Math.max(100, Number(event.target.value) || 100)))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" /></label><label className="text-xs text-gray-600 dark:text-gray-300">Window blast (hari)<input type="number" min={1} max={30} value={sendWindowDays} onChange={(event) => setSendWindowDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" /></label><div className="col-span-2 flex items-end text-[11px] text-gray-500 sm:col-span-1">Default 7 hari; rate limit provider tetap berlaku.</div></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={customerSearch} onChange={(event) => { setCustomerSearch(event.target.value); setCandidatePage(1); }} className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder="Cari nama, ID, atau nomor HP customer..." /></div><button type="button" onClick={() => setCandidatePage(1)} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium dark:border-gray-700">Cari customer</button></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Pilih semua pada halaman ini</label>
          <span className="font-mono text-gray-500">Terpilih: {selectAllEligible ? candidateTotal.toLocaleString('id-ID') : selected.length} / {candidateTotal.toLocaleString('id-ID')} eligible</span></div>
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">{candidateLoading && <p className="p-6 text-center text-xs text-gray-500">Memuat target yang belum terverifikasi...</p>}{!candidateLoading && selectableCustomers.map((customer) => <label key={customer.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 text-xs last:border-0 dark:border-gray-800"><input type="checkbox" checked={selected.includes(customer.id)} disabled={selectAllEligible} onChange={() => setSelected((current) => current.includes(customer.id) ? current.filter((id) => id !== customer.id) : [...current, customer.id])} /><span className="font-medium break-words">{customer.name}</span><span className="ml-auto font-mono text-gray-500 break-all">{customer.externalId}</span></label>)}</div>
        {!candidateLoading && !selectableCustomers.length && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Tidak ada customer yang belum terverifikasi GPS pada halaman ini.</p>}
        <TablePagination page={candidatePage} pageSize={candidatePageSize} total={candidateTotal} onPageChange={setCandidatePage} onPageSizeChange={(size) => { setCandidatePageSize(size); setCandidatePage(1); }} disabled={candidateLoading} />
        {message && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{message}</p>}
        <button disabled={busy || (!selected.length && !selectAllEligible)} className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"><Send className="h-4 w-4" />{busy ? 'Memproses...' : 'Buat & mulai campaign'}</button>
      </form>
      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30"><p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">Pilih semua eligible memakai filter backend dan diproses worker per batch. Sistem tetap memblokir customer opt-out dan provider yang tidak tersedia tidak dianggap berhasil.</p></div>
    </section>

    <section className="space-y-0"><div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-gray-200 bg-white p-4 text-sm font-semibold dark:border-gray-800 dark:bg-gray-900"><span>Riwayat Campaign</span><div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari campaign..." className="w-48 rounded-lg border border-gray-300 py-1.5 pl-8 pr-2 text-xs font-normal dark:border-gray-700 dark:bg-gray-800" /></div><button type="button" onClick={() => void loadCampaigns()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300" aria-label="Muat ulang campaign"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div><AdminTable minWidthClass="min-w-[900px]" footer={<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />}><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Materialisasi</th><th className="px-4 py-3">Terkirim</th><th className="px-4 py-3">Gagal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">Memuat campaign...</td></tr>}{!loading && campaigns.map((campaign) => <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-medium break-words">{campaign.name}<div className="font-mono text-[10px] text-gray-500">{campaign.timezone} · {campaign.sendWindowDays} hari</div></td><td className="px-4 py-3"><Users className="mr-1 inline h-3.5 w-3.5" />{campaign.targetCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 font-mono text-xs">{(campaign.materializedCount ?? 0).toLocaleString('id-ID')} / {campaign.targetCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{campaign.sentCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 text-rose-700">{campaign.failedCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 font-medium">{campaignStatusLabel[campaign.status] || campaign.status}</td><td className="space-x-2 px-4 py-3 whitespace-nowrap"><button type="button" onClick={() => void showItems(campaign.id)} className="rounded border border-gray-300 px-2 py-1 text-[11px]">Detail</button>{campaign.status === 'DRAFT' && <button type="button" onClick={() => void startCampaign(campaign.id).then(() => void loadCampaigns())} className="inline-flex items-center gap-1 rounded bg-gray-900 px-2 py-1 text-[11px] text-white"><Play className="h-3 w-3" />Mulai</button>}</td></tr>)}{!loading && !campaigns.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">Belum ada campaign.</td></tr>}</tbody></AdminTable></section>

    {selectedCampaignId && <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-200 p-4 dark:border-gray-800"><p className="text-sm font-semibold">Status pengiriman per customer</p><p className="mt-1 text-xs text-gray-500">Item ditampilkan secara paginasi agar campaign besar tidak dimuat sekaligus.</p></div><AdminTable minWidthClass="min-w-[720px]" footer={<TablePagination page={itemPage} pageSize={itemPageSize} total={itemTotal} onPageChange={(nextPage) => void showItems(selectedCampaignId, nextPage, itemPageSize)} onPageSizeChange={(size) => void showItems(selectedCampaignId, 1, size)} />}><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Status pengiriman</th><th className="px-4 py-3">Retry</th><th className="px-4 py-3">Pesan provider</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{items.map((row) => { const item = row.item as Record<string, unknown>; const customer = row.customer as Record<string, unknown>; const status = String(item.status ?? 'PENDING'); return <tr key={String(item.id)}><td className="px-4 py-3"><div className="font-medium">{String(customer.name ?? 'Customer')}</div><div className="font-mono text-[10px] text-gray-500">{String(customer.phoneE164 ?? '')}</div></td><td className="px-4 py-3 font-medium">{itemStatusLabel[status] ?? status}{item.lastError && <div className="text-[10px] text-rose-600">{String(item.lastError)}</div>}</td><td className="px-4 py-3 font-mono">{String(item.retryCount ?? 0)}</td><td className="px-4 py-3 font-mono text-[10px] break-all">{String(item.providerMessageId ?? '—')}</td></tr>; })}{!items.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-gray-500">Belum ada item.</td></tr>}</tbody></AdminTable></section>}
  </div>;
};
