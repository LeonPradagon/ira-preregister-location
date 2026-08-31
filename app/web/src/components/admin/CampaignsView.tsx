import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Megaphone, Play, RefreshCw, Search, Send, Users } from 'lucide-react';
import { mapApiCustomer, useApp } from '../../context/AppContext';
import { adminApi } from '../../lib/apiClient';
import { Customer } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';

const campaignStatusLabel: Record<string, string> = { DRAFT: 'Draft', RUNNING: 'Berjalan', COMPLETED: 'Selesai' };

export const CampaignsView: React.FC = () => {
  const { createCampaign, startCampaign } = useApp();
  const [campaigns, setCampaigns] = useState<Array<import('../../types').VerificationCampaign>>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('Verifikasi Lokasi');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
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
      const response = await adminApi.campaigns({ page, pageSize, search: searchTerm });
      setCampaigns(response.items.map((raw) => ({ ...(raw as unknown as import('../../types').VerificationCampaign), id: String(raw.id), name: String(raw.name ?? ''), status: String(raw.status ?? 'DRAFT') as import('../../types').VerificationCampaign['status'], timezone: String(raw.timezone ?? 'Asia/Jakarta'), scheduledAt: String(raw.scheduledAt ?? ''), targetCount: Number(raw.targetCount ?? 0), sentCount: Number(raw.sentCount ?? 0), failedCount: Number(raw.failedCount ?? 0), createdBy: String(raw.createdBy ?? ''), createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? '') })));
      setTotal(response.total);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Campaign gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { setPage(1); }, [searchTerm]);
  useEffect(() => { void loadCampaigns(); }, [page, pageSize, searchTerm]);
  const loadCandidates = async () => {
    setCandidateLoading(true);
    try {
      const response = await adminApi.customers({ page: candidatePage, pageSize: candidatePageSize, search: customerSearch, locationStatus: 'UNVERIFIED' });
      setCandidateCustomers(response.items.map((raw) => mapApiCustomer(raw)));
      setCandidateTotal(response.total);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Daftar target belum terverifikasi gagal dimuat.'); }
    finally { setCandidateLoading(false); }
  };
  useEffect(() => { void loadCandidates(); }, [candidatePage, candidatePageSize, customerSearch]);

  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !selectableCustomers.some((customer) => customer.id === id)) : [...new Set([...selected, ...selectableCustomers.map((customer) => customer.id)])]);
  const searchCustomers = () => setCandidatePage(1);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected.length) { setMessage('Pilih minimal satu customer.'); return; }
    setBusy(true); setMessage(null);
    try {
      const campaign = await createCampaign(name, selected);
      await startCampaign(campaign.id);
      setSelected([]);
      setMessage(`Campaign dibuat dan dijadwalkan untuk ${campaign.targetCount} customer.`);
      await loadCampaigns();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Campaign gagal dibuat.'); }
    finally { setBusy(false); }
  };
  const showItems = async (campaignId: string) => { setSelectedCampaignId(campaignId); try { setItems(await adminApi.campaignItems(campaignId)); } catch (error) { setMessage(error instanceof Error ? error.message : 'Status item tidak dapat dimuat.'); } };

  return <div className="space-y-6">
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3"><Megaphone className="mt-0.5 h-5 w-5 text-indigo-500" /><div><h1 className="text-base font-semibold">Campaign Blast WhatsApp</h1><p className="mt-1 text-xs text-gray-500">Kirim undangan secara asynchronous per batch. Satu batch maksimal 10.000 customer.</p></div></div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder="Nama campaign" />
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder="Cari nama, ID, atau nomor HP customer..." /></div><button type="button" onClick={searchCustomers} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium dark:border-gray-700">Cari customer</button></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allSelected} onChange={toggleAll} /> Pilih semua customer pada halaman ini</label><span className="font-mono text-gray-500">Terpilih: {selected.length} / {candidateTotal.toLocaleString('id-ID')} eligible</span></div>
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">{candidateLoading && <p className="p-6 text-center text-xs text-gray-500">Memuat target yang belum terverifikasi...</p>}{!candidateLoading && selectableCustomers.map((customer) => <label key={customer.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 text-xs last:border-0 dark:border-gray-800"><input type="checkbox" checked={selected.includes(customer.id)} onChange={() => setSelected((current) => current.includes(customer.id) ? current.filter((id) => id !== customer.id) : [...current, customer.id])} /><span className="font-medium break-words">{customer.name}</span><span className="ml-auto font-mono text-gray-500 break-all">{customer.externalId}</span></label>)}</div>
        {!candidateLoading && !selectableCustomers.length && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">Tidak ada customer yang belum terverifikasi GPS pada halaman ini.</p>}
        <TablePagination page={candidatePage} pageSize={candidatePageSize} total={candidateTotal} onPageChange={setCandidatePage} onPageSizeChange={(size) => { setCandidatePageSize(size); setCandidatePage(1); }} disabled={candidateLoading} />
        {message && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{message}</p>}
        <button disabled={busy || !selected.length} className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"><Send className="h-4 w-4" />{busy ? 'Memproses...' : 'Buat & mulai campaign'}</button>
      </form>
      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30"><p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">Customer hasil import dapat langsung dipilih sesuai kebijakan operasional. Sistem tetap menghentikan pengiriman untuk customer yang memiliki opt-out aktif dan tidak mengirim otomatis sebelum campaign dibuat serta dimulai oleh admin.</p></div>
    </div>
    <div className="space-y-0"><div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-gray-200 bg-white p-4 text-sm font-semibold dark:border-gray-800 dark:bg-gray-900"><span>Riwayat Campaign</span><div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Cari campaign..." className="w-48 rounded-lg border border-gray-300 py-1.5 pl-8 pr-2 text-xs font-normal dark:border-gray-700 dark:bg-gray-800" /></div><button type="button" onClick={() => void loadCampaigns()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300" aria-label="Muat ulang campaign"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div><AdminTable minWidthClass="min-w-[900px]" footer={<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />}><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3">Campaign</th><th className="px-4 py-3">Target</th><th className="px-4 py-3">Terkirim</th><th className="px-4 py-3">Gagal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Aksi</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-500">Memuat campaign...</td></tr>}{!loading && campaigns.map((campaign) => <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-medium break-words">{campaign.name}<div className="font-mono text-[10px] text-gray-500">{campaign.timezone}</div></td><td className="px-4 py-3"><Users className="mr-1 inline h-3.5 w-3.5" />{campaign.targetCount}</td><td className="px-4 py-3 text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{campaign.sentCount}</td><td className="px-4 py-3 text-rose-700">{campaign.failedCount}</td><td className="px-4 py-3 font-medium">{campaignStatusLabel[campaign.status] || campaign.status}</td><td className="space-x-2 px-4 py-3 whitespace-nowrap"><button type="button" onClick={() => void showItems(campaign.id)} className="rounded border border-gray-300 px-2 py-1 text-[11px]">Detail</button>{campaign.status === 'DRAFT' && <button type="button" onClick={() => void startCampaign(campaign.id).then(() => void loadCampaigns())} className="inline-flex items-center gap-1 rounded bg-gray-900 px-2 py-1 text-[11px] text-white"><Play className="h-3 w-3" />Mulai</button>}</td></tr>)}{!loading && !campaigns.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-500">Belum ada campaign.</td></tr>}</tbody></AdminTable>{selectedCampaignId && <div className="rounded-b-xl border border-t-0 border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"><p className="mb-3 text-sm font-semibold">Status pengiriman per customer</p><div className="space-y-2">{items.map((row) => { const item = row.item as Record<string, unknown>; const customer = row.customer as Record<string, unknown>; const status = item.lastError === 'PROVIDER_UNAVAILABLE' ? 'Provider tidak tersedia' : String(item.status ?? 'PENDING'); return <div key={String(item.id)} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-gray-800"><span>{String(customer.name ?? 'Customer')}<span className="ml-2 font-mono text-[10px] text-gray-500">{String(customer.phoneE164 ?? '')}</span></span><span className="font-medium">{status}</span></div>; })}</div></div>}</div>
  </div>;
};
