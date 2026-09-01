import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Megaphone, MessageCircle, Play, RefreshCw, Search, Send, Smartphone, Users } from 'lucide-react';
import { mapApiCustomer, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, VerificationCampaign } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { useTranslation } from '../../i18n';

const campaignStatusLabel: Record<string, string> = { DRAFT: 'campaigns.status.DRAFT', RUNNING: 'campaigns.status.RUNNING', PAUSED: 'campaigns.status.PAUSED', COMPLETED: 'campaigns.status.COMPLETED' };
const itemStatusLabel: Record<string, string> = { PENDING: 'campaigns.itemStatus.PENDING', PROCESSING: 'campaigns.itemStatus.PROCESSING', SENT: 'campaigns.itemStatus.SENT', DELIVERED: 'campaigns.itemStatus.DELIVERED', READ: 'campaigns.itemStatus.READ', FAILED: 'campaigns.itemStatus.FAILED', PROVIDER_UNAVAILABLE: 'campaigns.itemStatus.PROVIDER_UNAVAILABLE', OPTED_OUT: 'campaigns.itemStatus.OPTED_OUT' };
type WhatsAppPreview = Awaited<ReturnType<typeof api.previewWhatsApp>>;

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

const MobileLandingPreviewCard: React.FC<{ preview: WhatsAppPreview; language: 'id' | 'en'; onOpen: () => void }> = ({ preview, language, onOpen }) => <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2"><Smartphone className="h-5 w-5 text-indigo-600" /><div><h2 className="text-sm font-semibold text-slate-900 dark:text-white">{language === 'id' ? 'Landing page customer di HP' : 'Customer mobile landing page'}</h2><p className="mt-1 text-xs text-slate-500">{language === 'id' ? 'Preview menggunakan UI customer yang akan dilihat saat link dibuka.' : 'Preview of the customer UI shown when the link is opened.'}</p></div></div><div className="mt-4 flex justify-center overflow-hidden rounded-2xl bg-slate-100 p-3 dark:bg-slate-950"><iframe title="Landing page customer di HP" src={preview.verificationLink} className="h-[560px] w-full max-w-[380px] rounded-[1.5rem] border-4 border-slate-800 bg-white shadow-lg" /></div><button type="button" onClick={onOpen} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-xs font-semibold text-white hover:bg-indigo-700"><Smartphone className="h-4 w-4" />{language === 'id' ? 'Buka landing page mobile penuh' : 'Open full mobile landing page'}</button></section>;

export const CampaignsView: React.FC = () => {
  const { createCampaign, startCampaign } = useApp();
  const { t, language } = useTranslation();
  const [campaigns, setCampaigns] = useState<VerificationCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState(() => t('campaigns.defaultName'));
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
  const [customerSearchInput, setCustomerSearchInput] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [candidateCustomers, setCandidateCustomers] = useState<Customer[]>([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidatePageSize, setCandidatePageSize] = useState<TablePageSize>(25);
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [candidateLoading, setCandidateLoading] = useState(true);
  const [preview, setPreview] = useState<WhatsAppPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const selectableCustomers = useMemo(() => candidateCustomers.filter((customer) => customer.status !== 'SUSPENDED' && !customer.whatsappOptOutAt), [candidateCustomers]);
  const allSelected = selectableCustomers.length > 0 && selectableCustomers.every((customer) => selected.includes(customer.id));

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await api.campaigns({ page, pageSize, search: searchTerm });
      setCampaigns(response.items.map(mapCampaign));
      setTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.loadError'));
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
      setMessage(error instanceof Error ? error.message : t('campaigns.targetError'));
    } finally { setCandidateLoading(false); }
  };

  useEffect(() => { void loadCandidates(); }, [candidatePage, candidatePageSize, customerSearch]);

  const toggleAll = () => setSelected(allSelected ? selected.filter((id) => !selectableCustomers.some((customer) => customer.id === id)) : [...new Set([...selected, ...selectableCustomers.map((customer) => customer.id)])]);
  const toggleAllEligible = (checked: boolean) => {
    setSelectAllEligible(checked);
    if (checked) setSelected([]);
  };

  const applyCustomerSearch = () => {
    setCustomerSearch(customerSearchInput.trim());
    setCandidatePage(1);
  };

  const simulateWhatsApp = async () => {
    const customer = selectableCustomers.find((item) => selected.includes(item.id)) ?? selectableCustomers[0];
    if (!customer || !customer.activeAddress) {
      setMessage(language === 'id' ? 'Pilih customer terlebih dahulu untuk melihat simulasi.' : 'Select a customer first to preview the message.');
      return;
    }
    setPreviewLoading(true); setMessage(null);
    try {
      setPreview(await api.createSimulationVerification(customer.id, customer.activeAddress.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : (language === 'id' ? 'Simulasi WhatsApp gagal dibuat.' : 'WhatsApp preview could not be created.'));
    } finally { setPreviewLoading(false); }
  };

  const openMobilePreview = () => {
    if (!preview) return;
    window.open(preview.verificationLink, '_blank', 'noopener,noreferrer');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected.length && !selectAllEligible) { setMessage(t('campaigns.selectError')); return; }
    setBusy(true); setMessage(null);
    try {
      const campaign = await createCampaign(name, selectAllEligible ? [] : selected, undefined, selectAllEligible ? { targetFilter: { locationStatus: 'UNVERIFIED', search: customerSearch }, batchSize, sendWindowDays } : { batchSize, sendWindowDays });
      await startCampaign(campaign.id);
      setSelected([]); setSelectAllEligible(false);
      setMessage(t('campaigns.created', { count: campaign.targetCount.toLocaleString('id-ID') }));
      await loadCampaigns();
    } catch (error) { setMessage(error instanceof Error ? error.message : t('campaigns.createError')); }
    finally { setBusy(false); }
  };

  const showItems = async (campaignId: string, nextPage = 1, nextPageSize = itemPageSize) => {
    setSelectedCampaignId(campaignId); setItemPage(nextPage); setItemPageSize(nextPageSize);
    try {
      const response = await api.campaignItems(campaignId, { page: nextPage, pageSize: nextPageSize });
      setItems(response.items); setItemTotal(response.total);
    } catch (error) { setMessage(error instanceof Error ? error.message : t('campaigns.itemLoadError')); }
  };

  return <div className="space-y-6">
    {preview && <MobileLandingPreviewCard preview={preview} language={language} onOpen={openMobilePreview} />}
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900">
      <div className="flex items-start gap-3"><Megaphone className="mt-0.5 h-5 w-5 text-indigo-500" /><div><h1 className="text-base font-semibold">{t('campaigns.title')}</h1><p className="mt-1 text-xs text-gray-500">{t('campaigns.description')}</p></div></div>
      <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
        <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder={t('campaigns.name')} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3"><label className="text-xs text-gray-600 dark:text-gray-300">{t('campaigns.batchSize')}<input type="number" min={100} max={10000} step={100} value={batchSize} onChange={(event) => setBatchSize(Math.min(10000, Math.max(100, Number(event.target.value) || 100)))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" /></label><label className="text-xs text-gray-600 dark:text-gray-300">{t('campaigns.window')}<input type="number" min={1} max={30} value={sendWindowDays} onChange={(event) => setSendWindowDays(Math.min(30, Math.max(1, Number(event.target.value) || 1)))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-950" /></label><div className="col-span-2 flex items-end text-[11px] text-gray-500 sm:col-span-1">{t('campaigns.defaultWindow')}</div></div>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input value={customerSearchInput} onChange={(event) => setCustomerSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCustomerSearch(); } }} className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-xs dark:border-gray-700 dark:bg-gray-950" placeholder={t('campaigns.searchCustomer')} /></div><button type="button" onClick={applyCustomerSearch} className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium dark:border-gray-700">{t('campaigns.findCustomer')}</button></div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs"><div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={allSelected} disabled={selectAllEligible} onChange={toggleAll} /> {t('campaigns.selectPage')}</label><label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={selectAllEligible} onChange={(event) => toggleAllEligible(event.target.checked)} /> {t('campaigns.selectAllEligible')}</label></div>
          <span className="font-mono text-gray-500">{t('campaigns.selected')}: {selectAllEligible ? candidateTotal.toLocaleString('id-ID') : selected.length} / {candidateTotal.toLocaleString('id-ID')} {t('campaigns.eligible')}</span></div>
        <div className="max-h-64 overflow-auto rounded-lg border border-gray-200 dark:border-gray-800">{candidateLoading && <p className="p-6 text-center text-xs text-gray-500">{t('campaigns.loadingTargets')}</p>}{!candidateLoading && selectableCustomers.map((customer) => <label key={customer.id} className="flex items-center gap-3 border-b border-gray-100 px-3 py-2 text-xs last:border-0 dark:border-gray-800"><input type="checkbox" checked={selected.includes(customer.id)} disabled={selectAllEligible} onChange={() => setSelected((current) => current.includes(customer.id) ? current.filter((id) => id !== customer.id) : [...current, customer.id])} /><span className="font-medium break-words">{customer.name}</span><span className="ml-auto font-mono text-gray-500 break-all">{customer.externalId}</span></label>)}</div>
        {!candidateLoading && !selectableCustomers.length && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">{t('campaigns.targetEmpty')}</p>}
        <TablePagination page={candidatePage} pageSize={candidatePageSize} total={candidateTotal} onPageChange={setCandidatePage} onPageSizeChange={(size) => { setCandidatePageSize(size); setCandidatePage(1); }} disabled={candidateLoading} />
        {message && <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">{message}</p>}
        <div className="flex flex-wrap gap-2"><button type="button" disabled={previewLoading || candidateLoading || !selectableCustomers.length} onClick={() => void simulateWhatsApp()} className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"><MessageCircle className="h-4 w-4" />{previewLoading ? (language === 'id' ? 'Menyiapkan...' : 'Preparing...') : (language === 'id' ? 'Simulasi E2E' : 'E2E Simulation')}</button><button disabled={busy || (!selected.length && !selectAllEligible)} className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900"><Send className="h-4 w-4" />{busy ? t('campaigns.processing') : t('campaigns.createStart')}</button></div>
      </form>
      <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/60 dark:bg-blue-950/30"><p className="text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">{t('campaigns.info')}</p></div>
    </section>

    {preview && <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-xs dark:border-emerald-900/60 dark:bg-emerald-950/20"><div className="flex items-start gap-3"><MessageCircle className="mt-0.5 h-5 w-5 text-emerald-600" /><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">{language === 'id' ? 'Simulasi pesan WhatsApp E2E' : 'WhatsApp E2E simulation'}</h2><p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">{language === 'id' ? 'Tidak ada WhatsApp yang dikirim. Session dibuat nyata agar seluruh alur customer dan perubahan alamat dapat diuji ke database.' : 'No WhatsApp is sent. A real session is created so the customer flow and address changes can be tested against the database.'}</p><div className="mt-4 grid gap-3 text-xs sm:grid-cols-2"><div><span className="text-emerald-700 dark:text-emerald-400">{language === 'id' ? 'Penerima' : 'Recipient'}</span><p className="font-medium text-slate-900 dark:text-white">{preview.recipient.name} · {preview.recipient.phoneE164}</p></div><div><span className="text-emerald-700 dark:text-emerald-400">Template</span><p className="font-mono break-all text-slate-900 dark:text-white">{preview.templateName} ({preview.language})</p></div></div><div className="mt-4 max-w-md rounded-2xl rounded-tl-sm bg-white p-4 text-sm leading-relaxed text-slate-800 shadow-sm dark:bg-slate-900 dark:text-slate-100"><p className="whitespace-pre-wrap">{preview.message}</p></div><div className="mt-4 rounded-lg border border-emerald-200 bg-white p-3 text-xs dark:border-emerald-900 dark:bg-slate-900"><p className="font-semibold text-emerald-800 dark:text-emerald-300">{language === 'id' ? 'Link E2E aktif' : 'Active E2E link'}</p><p className="mt-1 break-all font-mono text-slate-700 dark:text-slate-200">{preview.verificationLink}</p><p className="mt-2 text-[11px] text-slate-500">{language === 'id' ? 'Link ini memakai session backend nyata. Perubahan alamat dan hasil verifikasi akan masuk ke database.' : 'This link uses a real backend session. Address changes and verification results will be saved to the database.'}</p><button type="button" onClick={openMobilePreview} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-3 text-xs font-semibold text-white hover:bg-emerald-700"><Smartphone className="h-4 w-4" />{language === 'id' ? 'Buka simulasi di HP' : 'Open E2E simulation'}</button></div></div></div></section>}

    <section className="space-y-0"><div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-gray-200 bg-white p-4 text-sm font-semibold dark:border-gray-800 dark:bg-gray-900"><span>{t('campaigns.history')}</span><div className="flex items-center gap-2"><div className="relative"><Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={t('campaigns.name')} className="w-48 rounded-lg border border-gray-300 py-1.5 pl-8 pr-2 text-xs font-normal dark:border-gray-700 dark:bg-gray-800" /></div><button type="button" onClick={() => void loadCampaigns()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300" aria-label={t('campaigns.refresh')}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div></div><AdminTable minWidthClass="min-w-[900px]" footer={<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />}><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3">{t('table.campaign')}</th><th className="px-4 py-3">{t('table.target')}</th><th className="px-4 py-3">{t('table.materialization')}</th><th className="px-4 py-3">{t('table.sent')}</th><th className="px-4 py-3">{t('table.failed')}</th><th className="px-4 py-3">{t('table.status')}</th><th className="px-4 py-3">{t('table.action')}</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">{t('campaigns.loading')}</td></tr>}{!loading && campaigns.map((campaign) => <tr key={campaign.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50"><td className="px-4 py-3 font-medium break-words">{campaign.name}<div className="font-mono text-[10px] text-gray-500">{campaign.timezone} · {campaign.sendWindowDays} {t('campaigns.days')}</div></td><td className="px-4 py-3"><Users className="mr-1 inline h-3.5 w-3.5" />{campaign.targetCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 font-mono text-xs">{(campaign.materializedCount ?? 0).toLocaleString('id-ID')} / {campaign.targetCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 text-emerald-700"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{campaign.sentCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 text-rose-700">{campaign.failedCount.toLocaleString('id-ID')}</td><td className="px-4 py-3 font-medium">{t(campaignStatusLabel[campaign.status] || campaign.status)}</td><td className="space-x-2 px-4 py-3 whitespace-nowrap"><button type="button" onClick={() => void showItems(campaign.id)} className="rounded border border-gray-300 px-2 py-1 text-[11px]">{t('verifications.detail')}</button>{campaign.status === 'DRAFT' && <button type="button" onClick={() => void startCampaign(campaign.id).then(() => void loadCampaigns())} className="inline-flex items-center gap-1 rounded bg-gray-900 px-2 py-1 text-[11px] text-white"><Play className="h-3 w-3" />{t('campaigns.start')}</button>}</td></tr>)}{!loading && !campaigns.length && <tr><td colSpan={7} className="px-4 py-10 text-center text-xs text-gray-500">{t('campaigns.empty')}</td></tr>}</tbody></AdminTable></section>

    {selectedCampaignId && <section className="rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900"><div className="border-b border-gray-200 p-4 dark:border-gray-800"><p className="text-sm font-semibold">{t('campaigns.deliveryTitle')}</p><p className="mt-1 text-xs text-gray-500">{t('campaigns.itemsDescription')}</p></div><AdminTable minWidthClass="min-w-[720px]" footer={<TablePagination page={itemPage} pageSize={itemPageSize} total={itemTotal} onPageChange={(nextPage) => void showItems(selectedCampaignId, nextPage, itemPageSize)} onPageSizeChange={(size) => void showItems(selectedCampaignId, 1, size)} />}><thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3">{t('table.customerName')}</th><th className="px-4 py-3">{t('table.deliveryStatus')}</th><th className="px-4 py-3">{t('table.retry')}</th><th className="px-4 py-3">{t('table.providerMessage')}</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{items.map((row) => { const item = row.item as Record<string, unknown>; const customer = row.customer as Record<string, unknown>; const status = String(item.status ?? 'PENDING'); return <tr key={String(item.id)}><td className="px-4 py-3"><div className="font-medium">{String(customer.name ?? t('campaigns.defaultCustomer'))}</div><div className="font-mono text-[10px] text-gray-500">{String(customer.phoneE164 ?? '')}</div></td><td className="px-4 py-3 font-medium">{t(itemStatusLabel[status] ?? status)}{item.lastError && <div className="text-[10px] text-rose-600">{String(item.lastError)}</div>}</td><td className="px-4 py-3 font-mono">{String(item.retryCount ?? 0)}</td><td className="px-4 py-3 font-mono text-[10px] break-all">{String(item.providerMessageId ?? '—')}</td></tr>; })}{!items.length && <tr><td colSpan={4} className="px-4 py-10 text-center text-xs text-gray-500">{t('campaigns.noItems')}</td></tr>}</tbody></AdminTable></section>}
  </div>;
};
