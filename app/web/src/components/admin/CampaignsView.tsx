import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Megaphone,
  MessageCircle,
  Play,
  RefreshCw as RefreshCwIcon,
  Search,
  Send,
  Smartphone,
} from 'lucide-react';
import { mapApiCustomer, useApp } from '../../context/AppContext';
import { api } from '../../lib/apiClient';
import { Customer, VerificationCampaign } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { AppLoader } from '../common/AppLoader';

const RefreshCw: React.FC<React.ComponentProps<typeof RefreshCwIcon>> = (props) =>
  props.className?.includes('animate-spin') ? <AppLoader size={18} label="Loading" /> : <RefreshCwIcon {...props} />;
import { useTranslation } from '../../i18n';
import { confirmAction, showActionSuccess } from '../../lib/swal';

const campaignStatusLabel: Record<string, string> = {
  DRAFT: 'campaigns.status.DRAFT',
  RUNNING: 'campaigns.status.RUNNING',
  PAUSED: 'campaigns.status.PAUSED',
  COMPLETED: 'campaigns.status.COMPLETED',
};
const itemStatusLabel: Record<string, string> = {
  PENDING: 'campaigns.itemStatus.PENDING',
  PROCESSING: 'campaigns.itemStatus.PROCESSING',
  SENT: 'campaigns.itemStatus.SENT',
  DELIVERED: 'campaigns.itemStatus.DELIVERED',
  READ: 'campaigns.itemStatus.READ',
  FAILED: 'campaigns.itemStatus.FAILED',
  PROVIDER_UNAVAILABLE: 'campaigns.itemStatus.PROVIDER_UNAVAILABLE',
  OPTED_OUT: 'campaigns.itemStatus.OPTED_OUT',
};
type WhatsAppPreview = Awaited<ReturnType<typeof api.previewWhatsApp>>;

function mapCampaign(raw: Record<string, unknown>): VerificationCampaign {
  return {
    ...(raw as unknown as VerificationCampaign),
    id: String(raw.id),
    name: String(raw.name ?? ''),
    status: String(raw.status ?? 'DRAFT') as VerificationCampaign['status'],
    timezone: String(raw.timezone ?? 'Asia/Jakarta'),
    scheduledAt: String(raw.scheduledAt ?? ''),
    targetCount: Number(raw.targetCount ?? 0),
    sentCount: Number(raw.sentCount ?? 0),
    failedCount: Number(raw.failedCount ?? 0),
    optedOutCount: Number(raw.optedOutCount ?? 0),
    batchSize: Number(raw.batchSize ?? 500),
    dailySendLimit: Number(raw.dailySendLimit ?? 500),
    sendWindowDays: Number(raw.sendWindowDays ?? 0),
    materializedCount: Number(raw.materializedCount ?? 0),
    materializationComplete: Boolean(raw.materializationComplete),
    createdBy: String(raw.createdBy ?? ''),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  };
}

const campaignStatusClassName = (status: string) => {
  if (status === 'RUNNING')
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300';
  if (status === 'COMPLETED')
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (status === 'PAUSED')
    return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

const itemStatusClassName = (status: string) =>
  ['FAILED', 'PROVIDER_UNAVAILABLE'].includes(status)
    ? 'text-rose-700 dark:text-rose-300'
    : ['SENT', 'DELIVERED', 'READ'].includes(status)
      ? 'text-emerald-700 dark:text-emerald-300'
      : 'text-slate-700 dark:text-slate-200';

const formatCountdown = (remainingMs: number) => {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
};

const PendingCountdown: React.FC<{ scheduledAt?: unknown }> = ({ scheduledAt }) => {
  const { t } = useTranslation();
  const scheduledTime = typeof scheduledAt === 'string' ? Date.parse(scheduledAt) : Number.NaN;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!Number.isFinite(scheduledTime)) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [scheduledTime]);

  if (!Number.isFinite(scheduledTime)) return null;
  const remainingMs = scheduledTime - now;
  if (remainingMs <= 0)
    return (
      <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-emerald-700 dark:text-emerald-300">
        <Clock3 className="h-3 w-3" />
        {t('campaigns.scheduleReady')}
      </div>
    );
  return (
    <div className="mt-1 flex items-center gap-1 text-[10px] font-normal text-amber-700 dark:text-amber-300">
      <Clock3 className="h-3 w-3" />
      {t('campaigns.scheduleRemaining', { time: formatCountdown(remainingMs) })}
    </div>
  );
};

const MobileLandingPreviewCard: React.FC<{ preview: WhatsAppPreview; onOpen: () => void }> = ({ preview, onOpen }) => (
  <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
    <div className="flex items-start gap-3">
      <span className="rounded-xl bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        <Smartphone className="h-5 w-5" />
      </span>
      <div>
        <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">WhatsApp message preview</h2>
        <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
          This is a real test link. It does not send a message to the customer.
        </p>
      </div>
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-slate-900">
        <div className="grid gap-3 text-xs sm:grid-cols-2">
          <div>
            <span className="text-slate-500">Recipient</span>
            <p className="mt-1 font-semibold text-slate-900 dark:text-white">{preview.recipient.name}</p>
            <p className="text-slate-500">{preview.recipient.phoneE164}</p>
          </div>
          <div>
            <span className="text-slate-500">Template</span>
            <p className="mt-1 break-all font-mono text-slate-900 dark:text-white">{preview.templateName}</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl rounded-tl-sm bg-emerald-50 p-4 text-sm leading-relaxed text-slate-800 dark:bg-emerald-950/30 dark:text-slate-100">
          <p className="whitespace-pre-wrap">{preview.message}</p>
        </div>
        <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Active test link</p>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500 dark:text-slate-400">
            {preview.verificationLink}
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-100 p-3 dark:bg-slate-950">
        <iframe
          title="WhatsApp message customer preview"
          src={preview.verificationLink}
          className="h-[420px] w-full max-w-[300px] rounded-[1.5rem] border-4 border-slate-800 bg-white shadow-lg"
        />
        <button
          type="button"
          onClick={onOpen}
          className="mt-3 inline-flex w-full max-w-[300px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700"
        >
          <Smartphone className="h-4 w-4" />
          Open full test link
        </button>
      </div>
    </div>
  </section>
);

export const CampaignsView: React.FC = () => {
  const { createCampaign, startCampaign, validationConfig } = useApp();
  const { t } = useTranslation();
  const dailySendLimitMax = Math.min(10000, Math.max(1, validationConfig.WHATSAPP_DAILY_SEND_LIMIT || 1000));
  const messageRate = Math.max(1, validationConfig.WHATSAPP_RATE_LIMIT_PER_SECOND || 1);
  const sameNumberCooldown = Math.max(1, validationConfig.WHATSAPP_MIN_INTERVAL_MINUTES || 60);
  const [campaigns, setCampaigns] = useState<VerificationCampaign[]>([]);
  const [total, setTotal] = useState(0);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selectAllEligible, setSelectAllEligible] = useState(false);
  const [dailySendLimit, setDailySendLimit] = useState(() => Math.min(500, dailySendLimitMax));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState<TablePageSize>(10);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const [campaignCursors, setCampaignCursors] = useState<Record<number, string>>({});
  const [candidateCursors, setCandidateCursors] = useState<Record<number, string>>({});
  const [itemCursors, setItemCursors] = useState<Record<number, string>>({});
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

  const selectableCustomers = useMemo(
    () => candidateCustomers.filter((customer) => customer.status !== 'SUSPENDED' && !customer.whatsappOptOutAt),
    [candidateCustomers],
  );
  const allSelected =
    selectableCustomers.length > 0 && selectableCustomers.every((customer) => selected.includes(customer.id));
  const selectedCount = selectAllEligible ? Math.min(candidateTotal, dailySendLimit) : selected.length;

  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const response = await api.campaigns({
        page,
        pageSize,
        search: searchTerm,
        cursor: page === 1 ? undefined : campaignCursors[page],
      });
      if (response.nextCursor) setCampaignCursors((previous) => ({ ...previous, [page + 1]: response.nextCursor! }));
      setCampaigns(response.items.map(mapCampaign));
      setTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    setCampaignCursors({});
  }, [searchTerm]);
  useEffect(() => {
    setDailySendLimit((current) => Math.min(current, dailySendLimitMax));
    setSelected((current) => current.slice(0, dailySendLimitMax));
  }, [dailySendLimitMax]);
  useEffect(() => {
    void loadCampaigns();
  }, [page, pageSize, searchTerm]);

  const loadCandidates = async () => {
    setCandidateLoading(true);
    try {
      const response = await api.customers({
        page: candidatePage,
        pageSize: candidatePageSize,
        search: customerSearch,
        locationStatus: 'UNVERIFIED',
        campaignAvailable: true,
        cursor: candidatePage === 1 ? undefined : candidateCursors[candidatePage],
      });
      if (response.nextCursor)
        setCandidateCursors((previous) => ({ ...previous, [candidatePage + 1]: response.nextCursor! }));
      setCandidateCustomers(response.items.map(mapApiCustomer));
      setCandidateTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.targetError'));
    } finally {
      setCandidateLoading(false);
    }
  };

  useEffect(() => {
    void loadCandidates();
  }, [candidatePage, candidatePageSize, customerSearch]);

  const toggleAll = () => {
    if (allSelected) {
      setSelected((current) => current.filter((id) => !selectableCustomers.some((customer) => customer.id === id)));
      return;
    }
    const remainingSlots = Math.max(0, dailySendLimit - selected.length);
    const pageIds = selectableCustomers.map((customer) => customer.id).filter((id) => !selected.includes(id));
    if (pageIds.length > remainingSlots) setMessage(t('campaigns.dailyLimitReached'));
    setSelected((current) => [...new Set([...current, ...pageIds.slice(0, remainingSlots)])]);
  };
  const toggleAllEligible = (checked: boolean) => {
    setSelectAllEligible(checked);
    if (checked) setSelected([]);
  };
  const applyCustomerSearch = () => {
    setCustomerSearch(customerSearchInput.trim());
    setCandidatePage(1);
    setCandidateCursors({});
  };

  const toggleCustomer = (customerId: string) => {
    setSelected((current) => {
      if (current.includes(customerId)) return current.filter((id) => id !== customerId);
      if (current.length >= dailySendLimit) {
        setMessage(t('campaigns.dailyLimitReached'));
        return current;
      }
      return [...current, customerId];
    });
  };

  const simulateWhatsApp = async () => {
    const customer = selectableCustomers.find((item) => selected.includes(item.id)) ?? selectableCustomers[0];
    if (!customer || !customer.activeAddress) {
      setMessage(t('campaigns.selectCustomerFirst'));
      return;
    }
    const confirmed = await confirmAction({
      title: t('campaigns.simulationQuestion'),
      text: t('campaigns.simulationText'),
      confirmButtonText: t('campaigns.simulationConfirm'),
      cancelButtonText: t('crud.cancel'),
    });
    if (!confirmed) return;
    setPreviewLoading(true);
    setMessage(null);
    try {
      setPreview(await api.createSimulationVerification(customer.id, customer.activeAddress.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.simulationError'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openMobilePreview = () => {
    if (preview) window.open(preview.verificationLink, '_blank', 'noopener,noreferrer');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected.length && !selectAllEligible) {
      setMessage(t('campaigns.selectError'));
      return;
    }
    if (!name.trim()) {
      setMessage(t('campaigns.nameRequired'));
      return;
    }
    const confirmed = await confirmAction({
      title: t('crud.createQuestion'),
      text: t('crud.createText'),
      confirmButtonText: t('crud.continue'),
      cancelButtonText: t('crud.cancel'),
    });
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      const campaign = await createCampaign(
        name.trim(),
        selectAllEligible ? [] : selected,
        undefined,
        selectAllEligible
          ? { targetFilter: { locationStatus: 'UNVERIFIED', search: customerSearch }, dailySendLimit }
          : { dailySendLimit },
      );
      await startCampaign(campaign.id);
      setSelected([]);
      setSelectAllEligible(false);
      await loadCandidates();
      setMessage(t('campaigns.created', { count: campaign.targetCount.toLocaleString('en-US') }));
      await loadCampaigns();
      await showActionSuccess(
        t('campaigns.sentSuccess'),
        t('campaigns.created', { count: campaign.targetCount.toLocaleString('en-US') }),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.createError'));
    } finally {
      setBusy(false);
    }
  };

  const handleStartCampaign = async (campaign: VerificationCampaign) => {
    const confirmed = await confirmAction({
      title: t('campaigns.startQuestion'),
      text: t('campaigns.startText'),
      confirmButtonText: t('campaigns.startConfirm'),
      cancelButtonText: t('crud.cancel'),
    });
    if (!confirmed) return;
    try {
      await startCampaign(campaign.id);
      await loadCampaigns();
      await showActionSuccess(t('campaigns.sentSuccess'), t('campaigns.startSuccess'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('crud.error'));
    }
  };

  const showItems = async (campaignId: string, nextPage = 1, nextPageSize = itemPageSize) => {
    setSelectedCampaignId(campaignId);
    setItemPage(nextPage);
    setItemPageSize(nextPageSize);
    if (nextPage === 1) setItemCursors({});
    try {
      const response = await api.campaignItems(campaignId, {
        page: nextPage,
        pageSize: nextPageSize,
        cursor: nextPage === 1 ? undefined : itemCursors[nextPage],
      });
      if (response.nextCursor) setItemCursors((previous) => ({ ...previous, [nextPage + 1]: response.nextCursor! }));
      setItems(response.items);
      setItemTotal(response.total);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('campaigns.itemLoadError'));
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/60 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/30">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
            <Megaphone className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t('campaigns.title')}</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {t('campaigns.description')}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            1
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('campaigns.chooseRecipients')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('campaigns.chooseRecipientsHelp')}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={customerSearchInput}
              onChange={(event) => setCustomerSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCustomerSearch();
                }
              }}
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              placeholder={t('campaigns.searchCustomer')}
            />
          </div>
          <button
            type="button"
            onClick={applyCustomerSearch}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {t('campaigns.findCustomer')}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4 text-xs font-medium text-slate-700 dark:text-slate-200">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allSelected}
                disabled={selectAllEligible || candidateLoading}
                onChange={toggleAll}
              />
              {t('campaigns.selectPage')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selectAllEligible}
                onChange={(event) => toggleAllEligible(event.target.checked)}
              />
              {t('campaigns.selectAllEligible')}
            </label>
          </div>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            {selectedCount.toLocaleString('en-US')} / {candidateTotal.toLocaleString('en-US')}{' '}
            {t('campaigns.selectedRecipients')}
          </span>
        </div>
        <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
          {candidateLoading && (
            <div className="flex min-h-40 items-center justify-center gap-3 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              <AppLoader size={36} label={t('campaigns.loadingTargets')} />
              <span>{t('campaigns.loadingTargets')}</span>
            </div>
          )}
          {!candidateLoading &&
            selectableCustomers.map((customer) => (
              <label
                key={customer.id}
                className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-0 dark:border-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(customer.id)}
                  disabled={selectAllEligible}
                  onChange={() => toggleCustomer(customer.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800 dark:text-slate-100">{customer.name}</span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {customer.externalId} · {customer.phoneE164}
                  </span>
                </span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </label>
            ))}
          {!candidateLoading && !selectableCustomers.length && (
            <p className="p-8 text-center text-sm text-amber-700 dark:text-amber-300">{t('campaigns.targetEmpty')}</p>
          )}
        </div>
        <TablePagination
          page={candidatePage}
          pageSize={candidatePageSize}
          total={candidateTotal}
          onPageChange={setCandidatePage}
          onPageSizeChange={(size) => {
            setCandidatePageSize(size);
            setCandidatePage(1);
            setCandidateCursors({});
          }}
          disabled={candidateLoading}
        />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
            2
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('campaigns.messageSettings')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t('campaigns.messageSettingsHelp', { max: dailySendLimitMax.toLocaleString('en-US') })}
            </p>
          </div>
        </div>
        <form onSubmit={(event) => void submit(event)} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 md:col-span-1">
              {t('campaigns.name')}
              <input
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder={t('campaigns.namePlaceholder')}
              />
            </label>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t('campaigns.dailyLimit', { max: dailySendLimitMax.toLocaleString('en-US') })}
              <input
                type="number"
                min={1}
                max={dailySendLimitMax}
                step={1}
                value={dailySendLimit}
                onChange={(event) => {
                  const nextLimit = Math.min(dailySendLimitMax, Math.max(1, Number(event.target.value) || 1));
                  setDailySendLimit(nextLimit);
                  setSelected((current) => current.slice(0, nextLimit));
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                placeholder={t('campaigns.dailyLimitPlaceholder', { max: dailySendLimitMax.toLocaleString('en-US') })}
              />
            </label>
          </div>
          <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            {t('campaigns.defaultWindow', {
              rate: messageRate,
              cooldown: sameNumberCooldown,
              max: dailySendLimitMax.toLocaleString('en-US'),
            })}
          </p>
          {message && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
              {message}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={previewLoading || candidateLoading || !selectableCustomers.length}
              onClick={() => void simulateWhatsApp()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
            >
              <MessageCircle className="h-4 w-4" />
              {previewLoading ? t('campaigns.preparing') : t('campaigns.previewMessage')}
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim() || (!selected.length && !selectAllEligible)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {busy ? t('campaigns.processing') : t('campaigns.createStart')}
            </button>
          </div>
        </form>
      </section>

      {preview && <MobileLandingPreviewCard preview={preview} onOpen={openMobilePreview} />}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-1 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('campaigns.history')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('campaigns.historyDescription')}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={t('campaigns.searchHistory')}
                className="w-48 rounded-xl border border-slate-300 py-2 pl-8 pr-2 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
            <button
              type="button"
              onClick={() => void loadCampaigns()}
              disabled={loading}
              className="rounded-xl border border-slate-300 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label={t('campaigns.refresh')}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <AdminTable
          minWidthClass="min-w-[900px]"
          footer={
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
                setCampaignCursors({});
              }}
              disabled={loading}
            />
          }
        >
          <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            <tr>
              <th className="px-4 py-3">{t('table.campaign')}</th>
              <th className="px-4 py-3">{t('table.target')}</th>
              <th className="px-4 py-3">{t('table.sent')}</th>
              <th className="px-4 py-3">{t('table.failed')}</th>
              <th className="px-4 py-3">{t('table.status')}</th>
              <th className="px-4 py-3">{t('table.action')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('campaigns.loading')}
                </td>
              </tr>
            )}
            {!loading &&
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="transition hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900 dark:text-white">{campaign.name}</div>
                    <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {campaign.targetCount.toLocaleString('en-US')} {t('campaigns.recipients')}
                    </div>
                    <div className="mt-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                      {t('campaigns.dailyLimitSummary', {
                        count: (campaign.dailySendLimit ?? 500).toLocaleString('en-US'),
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-200">
                    {campaign.targetCount.toLocaleString('en-US')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-300">
                    {campaign.sentCount.toLocaleString('en-US')}
                  </td>
                  <td className="px-4 py-3 font-semibold text-rose-700 dark:text-rose-300">
                    {campaign.failedCount.toLocaleString('en-US')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold ${campaignStatusClassName(campaign.status)}`}
                    >
                      {campaign.status === 'COMPLETED' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : campaign.status === 'RUNNING' ? (
                        <Send className="h-3.5 w-3.5" />
                      ) : (
                        <Clock3 className="h-3.5 w-3.5" />
                      )}
                      {t(campaignStatusLabel[campaign.status] || campaign.status)}
                    </span>
                  </td>
                  <td className="space-x-2 px-4 py-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => void showItems(campaign.id)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {t('campaigns.viewDetails')}
                    </button>
                    {campaign.status === 'DRAFT' && (
                      <button
                        type="button"
                        onClick={() => void handleStartCampaign(campaign)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                      >
                        <Play className="h-3.5 w-3.5" />
                        {t('campaigns.start')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            {!loading && !campaigns.length && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  {t('campaigns.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </AdminTable>
      </section>

      {selectedCampaignId && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{t('campaigns.deliveryTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('campaigns.itemsDescription')}</p>
          </div>
          <AdminTable
            minWidthClass="min-w-[720px]"
            footer={
              <TablePagination
                page={itemPage}
                pageSize={itemPageSize}
                total={itemTotal}
                onPageChange={(nextPage) => void showItems(selectedCampaignId, nextPage, itemPageSize)}
                onPageSizeChange={(size) => void showItems(selectedCampaignId, 1, size)}
              />
            }
          >
            <thead className="bg-slate-50 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">{t('table.customerName')}</th>
                <th className="px-4 py-3">{t('table.deliveryStatus')}</th>
                <th className="px-4 py-3">{t('table.retry')}</th>
                <th className="px-4 py-3">{t('table.providerMessage')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((row) => {
                const item = row.item as Record<string, unknown>;
                const customer = row.customer as Record<string, unknown>;
                const status = String(item.status ?? 'PENDING');
                return (
                  <tr key={String(item.id)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 dark:text-white">
                        {String(customer.name ?? t('campaigns.defaultCustomer'))}
                      </div>
                      <div className="font-mono text-[10px] text-slate-500">{String(customer.phoneE164 ?? '')}</div>
                    </td>
                    <td className={`px-4 py-3 font-semibold ${itemStatusClassName(status)}`}>
                      {t(itemStatusLabel[status] ?? status)}
                      {status === 'PENDING' && <PendingCountdown scheduledAt={item.scheduledAt} />}
                      {item.lastError && (
                        <div className="mt-1 text-[10px] font-normal text-rose-600">{String(item.lastError)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {String(item.retryCount ?? 0)}
                    </td>
                    <td className="px-4 py-3 break-all font-mono text-[10px] text-slate-500">
                      {String(item.providerMessageId ?? '—')}
                    </td>
                  </tr>
                );
              })}
              {!items.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t('campaigns.noItems')}
                  </td>
                </tr>
              )}
            </tbody>
          </AdminTable>
        </section>
      )}
    </div>
  );
};
