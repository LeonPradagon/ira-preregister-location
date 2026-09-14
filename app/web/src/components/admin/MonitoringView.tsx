import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, Clock3, ExternalLink, MapPin, RefreshCw, Search, Send, XCircle } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { api, type AdminMonitoringApi, type AdminMonitoringCampaign } from '../../lib/apiClient';
import { formatAppDateTime } from '../../lib/dateTime';
import { AppLoader } from '../common/AppLoader';
import { TablePagination, type TablePageSize } from '../common/AdminTable';

const numberFormat = new Intl.NumberFormat('id-ID');

const Metric: React.FC<{ label: string; value: number; icon: React.ReactNode; tone: string }> = ({
  label,
  value,
  icon,
  tone,
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{numberFormat.format(value)}</p>
      </div>
      <span className={`rounded-xl p-2.5 ${tone}`}>{icon}</span>
    </div>
  </div>
);

const campaignStatusClassName = (status: string) => {
  if (status === 'COMPLETED') return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300';
  if (status === 'RUNNING') return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300';
  if (status === 'PAUSED') return 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300';
  return 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';
};

const value = (metric: number) => numberFormat.format(metric);

const addressValue = (address: Record<string, unknown> | null | undefined) => {
  if (!address) return '';
  const parts = [
    address.street,
    address.houseNumber && `No. ${address.houseNumber}`,
    address.rt && `RT ${address.rt}`,
    address.rw && `RW ${address.rw}`,
    address.building,
    address.block && `Blok ${address.block}`,
    address.unit && `Unit ${address.unit}`,
    address.subdistrict,
    address.district,
    address.city,
    address.province,
    address.postalCode,
  ]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean);
  return parts.join(', ') || String(address.rawAddress ?? '').trim();
};

export const MonitoringView: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminMonitoringApi | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<AdminMonitoringCampaign | null>(null);
  const [recipientRows, setRecipientRows] = useState<Array<Record<string, unknown>>>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientPageSize, setRecipientPageSize] = useState<TablePageSize>(25);
  const [recipientCursors, setRecipientCursors] = useState<Record<number, string>>({});
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientLoading, setRecipientLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.monitoring());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('monitoring.loadError'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedCampaign) return;
    const loadRecipients = async () => {
      setRecipientLoading(true);
      try {
        const response = await api.campaignItems(selectedCampaign.id, {
          page: recipientPage,
          pageSize: recipientPageSize,
          search: recipientSearch,
          cursor: recipientPage === 1 ? undefined : recipientCursors[recipientPage],
        });
        if (response.nextCursor)
          setRecipientCursors((previous) => ({ ...previous, [recipientPage + 1]: response.nextCursor! }));
        setRecipientRows(response.items);
        setRecipientTotal(response.total);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('monitoring.recipientsLoadError'));
      } finally {
        setRecipientLoading(false);
      }
    };
    void loadRecipients();
  }, [selectedCampaign, recipientPage, recipientPageSize, recipientSearch]);

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (data?.campaigns ?? []).filter((campaign) => {
      const matchesSearch = !normalizedSearch || campaign.name.toLowerCase().includes(normalizedSearch);
      const matchesStatus = status === 'ALL' || campaign.status === status;
      return matchesSearch && matchesStatus;
    });
  }, [data, search, status]);

  const summary = data?.summary;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-indigo-50/70 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-2.5 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">{t('monitoring.title')}</h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-300">{t('monitoring.description')}</p>
              {data && <p className="mt-2 text-[11px] text-slate-400">{t('monitoring.updated')}: {formatAppDateTime(data.generatedAt)}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {loading ? <AppLoader size={18} label={t('monitoring.refresh')} /> : <RefreshCw className="h-4 w-4" />}
            {t('monitoring.refresh')}
          </button>
        </div>
      </section>

      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}

      {summary && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label={t('monitoring.campaigns')} value={summary.campaigns} icon={<BarChart3 className="h-5 w-5" />} tone="bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300" />
          <Metric label={t('monitoring.target')} value={summary.target} icon={<Send className="h-5 w-5" />} tone="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
          <Metric label={t('monitoring.sent')} value={summary.sent} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300" />
          <Metric label={t('monitoring.delivered')} value={summary.delivered} icon={<CheckCircle2 className="h-5 w-5" />} tone="bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300" />
          <Metric label={t('monitoring.linksOpened')} value={summary.linksOpened} icon={<ExternalLink className="h-5 w-5" />} tone="bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-300" />
          <Metric label={t('monitoring.addressChanged')} value={summary.addressChanged} icon={<MapPin className="h-5 w-5" />} tone="bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300" />
          <Metric label={t('monitoring.remindersSent')} value={summary.reminders.sent} icon={<Clock3 className="h-5 w-5" />} tone="bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-300" />
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('monitoring.breakdownTitle')}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('monitoring.breakdownDescription')}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('monitoring.search')} className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 sm:w-64" />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <option value="ALL">{t('monitoring.allStatuses')}</option>
              {['DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED'].map((item) => <option key={item} value={item}>{t(`campaigns.status.${item}`)}</option>)}
            </select>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex min-h-44 items-center justify-center"><AppLoader size={24} label={t('monitoring.loading')} /></div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-44 items-center justify-center px-4 text-sm text-slate-500 dark:text-slate-400">{t('monitoring.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1700px] w-full text-left text-xs">
              <thead className="whitespace-nowrap bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-950/50 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">{t('monitoring.campaign')}</th>
                  <th className="px-3 py-3">{t('monitoring.target')}</th>
                  <th className="px-3 py-3">{t('monitoring.sent')}</th>
                  <th className="px-3 py-3">{t('monitoring.delivered')}</th>
                  <th className="px-3 py-3">{t('monitoring.read')}</th>
                  <th className="px-3 py-3">{t('monitoring.linksOpened')}</th>
                  <th className="px-3 py-3">{t('monitoring.remindersSent')}</th>
                  <th className="px-3 py-3">{t('monitoring.addressChanged')}</th>
                  <th className="px-3 py-3">{t('monitoring.gps')}</th>
                  <th className="px-3 py-3">{t('monitoring.locationValid')}</th>
                  <th className="px-3 py-3">{t('monitoring.failed')}</th>
                  <th className="px-3 py-3">{t('monitoring.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((campaign: AdminMonitoringCampaign) => (
                  <tr key={campaign.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="max-w-[290px] whitespace-normal break-words px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-slate-800 dark:text-slate-100" title={campaign.name}>{campaign.name}</div>
                        <span className={`shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-semibold ${campaignStatusClassName(campaign.status)}`}>{t(`campaigns.status.${campaign.status}`)}</span>
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">{formatAppDateTime(campaign.scheduledAt)}</div>
                    </td>
                    <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{value(campaign.target)}</td>
                    <td className="px-3 py-3 text-blue-600 dark:text-blue-300">{value(campaign.sent)}</td>
                    <td className="px-3 py-3 text-emerald-600 dark:text-emerald-300">{value(campaign.delivered)}</td>
                    <td className="px-3 py-3">{value(campaign.read)}</td>
                    <td className="px-3 py-3 text-violet-600 dark:text-violet-300">{value(campaign.linksOpened)}</td>
                    <td className="px-3 py-3 text-orange-600 dark:text-orange-300">{value(campaign.reminders.sent)}</td>
                    <td className="px-3 py-3 text-amber-600 dark:text-amber-300">{value(campaign.addressChanged)}</td>
                    <td className="px-3 py-3">{value(campaign.gpsReceived)}</td>
                    <td className="px-3 py-3 font-semibold text-emerald-600 dark:text-emerald-300">{value(campaign.locationValid)}</td>
                    <td className="px-3 py-3 text-rose-600 dark:text-rose-300">{value(campaign.failed)} <XCircle className="ml-1 inline h-3.5 w-3.5" /></td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCampaign(campaign);
                          setRecipientPage(1);
                          setRecipientCursors({});
                        }}
                        className="whitespace-nowrap rounded-lg border border-indigo-200 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
                      >
                        {t('monitoring.viewRecipients')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCampaign && (
        <section className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900/70 dark:bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-indigo-100 p-4 dark:border-indigo-900/60 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{t('monitoring.recipientsTitle')}: {selectedCampaign.name}</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('monitoring.recipientsDescription')}</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={recipientSearch}
                  onChange={(event) => {
                    setRecipientSearch(event.target.value);
                    setRecipientPage(1);
                    setRecipientCursors({});
                  }}
                  placeholder={t('monitoring.recipientsSearch')}
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 sm:w-56"
                />
              </label>
              <button type="button" onClick={() => setSelectedCampaign(null)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                {t('monitoring.closeRecipients')}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1350px] w-full text-left text-xs">
              <thead className="whitespace-nowrap bg-indigo-50/60 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-indigo-950/20 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">{t('monitoring.recipient')}</th>
                  <th className="px-3 py-3">{t('monitoring.deliveryStatus')}</th>
                  <th className="px-3 py-3">{t('monitoring.linkStatus')}</th>
                  <th className="px-3 py-3">{t('monitoring.addressChanged')}</th>
                  <th className="px-3 py-3">{t('monitoring.gps')}</th>
                  <th className="px-3 py-3">{t('monitoring.locationValid')}</th>
                  <th className="px-3 py-3">{t('monitoring.confirmed')}</th>
                  <th className="px-3 py-3">{t('monitoring.reminderCount')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {recipientRows.map((row) => {
                  const item = row.item as Record<string, unknown>;
                  const customer = row.customer as Record<string, unknown>;
                  const yes = (field: unknown) => field === true || field === 'true';
                  const opened = Boolean(row.linkOpenedAt);
                  const sessionStatus = String(row.sessionStatus ?? 'CREATED');
                  const reminderSentCount = Number(row.reminderSentCount ?? 0);
                  const reminderLastSentAt = row.reminderLastSentAt ? String(row.reminderLastSentAt) : '';
                  const currentAddressId = String(row.currentAddressId ?? '');
                  const originalAddressId = String(item.addressId ?? '');
                  const addressWasReplaced = Boolean(currentAddressId && originalAddressId && currentAddressId !== originalAddressId);
                  const changedAddress = addressValue(row.currentAddress as Record<string, unknown> | null);
                  return (
                    <tr key={String(item.id)} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="max-w-[260px] whitespace-normal break-words px-4 py-3">
                        <div className="font-semibold text-slate-800 dark:text-slate-100">{String(customer.name ?? t('campaigns.defaultCustomer'))}</div>
                        <div className="mt-1 break-all font-mono text-[10px] text-slate-500">{String(customer.phoneE164 ?? '')}</div>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700 dark:text-slate-200">{t(`campaigns.itemStatus.${String(item.status ?? 'PENDING')}`)}</td>
                      <td className="px-3 py-3">
                        <span className={opened ? 'font-semibold text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'}>{opened ? t('monitoring.opened') : t('monitoring.notOpened')}</span>
                        {opened && <div className="mt-1 text-[10px] text-slate-400">{formatAppDateTime(String(row.linkOpenedAt))}</div>}
                      </td>
                      <td className="max-w-[280px] whitespace-normal px-3 py-3">
                        {yes(row.addressChanged) ? (
                          <>
                            <div className="font-semibold text-amber-600 dark:text-amber-300">{t('monitoring.yes')}</div>
                            {addressWasReplaced && changedAddress && (
                              <div className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                                <span className="font-semibold">{t('monitoring.changedAddressDetail')}:</span> {changedAddress}
                              </div>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className="whitespace-normal px-3 py-3">{yes(row.gpsReceived) ? t('monitoring.yes') : '—'}</td>
                      <td className="whitespace-normal px-3 py-3 font-semibold text-emerald-600 dark:text-emerald-300">{yes(row.locationValid) ? t('monitoring.yes') : '—'}</td>
                      <td className="whitespace-normal px-3 py-3">{String(row.confirmationStatus ?? 'UNCONFIRMED') === 'CONFIRMED' ? t('monitoring.yes') : '—'}</td>
                      <td className="max-w-[220px] whitespace-normal px-3 py-3">
                        <div className={reminderSentCount > 0 ? 'font-semibold text-orange-600 dark:text-orange-300' : 'text-slate-500 dark:text-slate-400'}>
                          {reminderSentCount > 0 ? `${reminderSentCount}x` : t('monitoring.noReminder')}
                        </div>
                        {reminderLastSentAt && (
                          <div className="mt-1 text-[10px] text-slate-400">
                            {t('monitoring.reminderSentAt')}: {formatAppDateTime(reminderLastSentAt)}
                          </div>
                        )}
                        <div className="mt-1 text-[10px] text-slate-400">{t(`monitoring.status.${sessionStatus}`)}</div>
                      </td>
                    </tr>
                  );
                })}
                {recipientLoading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{t('monitoring.loading')}</td></tr>}
                {!recipientLoading && !recipientRows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">{t('monitoring.recipientsEmpty')}</td></tr>}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={recipientPage}
            pageSize={recipientPageSize}
            total={recipientTotal}
            onPageChange={setRecipientPage}
            onPageSizeChange={(size) => {
              setRecipientPageSize(size);
              setRecipientPage(1);
              setRecipientCursors({});
            }}
            disabled={recipientLoading}
          />
        </section>
      )}
    </div>
  );
};
