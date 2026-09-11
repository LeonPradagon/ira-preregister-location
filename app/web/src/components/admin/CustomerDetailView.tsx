import React from 'react';
import { ArrowLeft, Compass, ExternalLink, Home } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';
import { buildGoogleMapsDeepLink, formatAddressForDisplay, isIncompleteAddress } from '../../lib/validationEngine';
import { userFriendlyStatus } from '../../lib/statusLabels';
import { confirmAction } from '../../lib/swal';
import { CoordinateAuditStatus } from '../../types';
import { formatAppDate, formatAppDateTime } from '../../lib/dateTime';

interface CustomerDetailViewProps {
  customerId: string;
  onBack: () => void;
  onSelectVerification: (sessionId: string) => void;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({ customerId, onBack, onSelectVerification }) => {
  const { customers, addresses, verificationSessions, optOutCustomer } = useApp();
  const { t } = useTranslation();

  const customer = customers.find((c) => c.id === customerId);
  const custAddresses = addresses.filter((a) => a.customerId === customerId);
  const custSessions = verificationSessions.filter((s) => s.customerId === customerId);

  if (!customer) {
    return (
      <div className="p-8 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 shadow-xs">
        {t('detail.notFound')}
        <button
          onClick={onBack}
          className="block mx-auto mt-4 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium"
        >
          {t('detail.back')}
        </button>
      </div>
    );
  }

  const masterAddress = custAddresses.find((a) => a.addressType === 'MASTER') || custAddresses[0];
  const coordinateAuditLabel = (status?: CoordinateAuditStatus) =>
    t(
      status === 'MATCHED'
        ? 'customers.coordinateAuditMatched'
        : status === 'MISMATCH'
          ? 'customers.coordinateAuditMismatch'
          : status === 'INVALID'
            ? 'customers.coordinateAuditInvalid'
            : status === 'UNCERTAIN'
              ? 'customers.coordinateAuditUncertain'
              : 'customers.coordinateAuditPending',
    );
  const coordinateAuditClass = (status?: CoordinateAuditStatus) =>
    status === 'MATCHED'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
      : status === 'MISMATCH' || status === 'INVALID'
        ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
        : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';

  const handleOptOut = async () => {
    const confirmed = await confirmAction({
      title: 'Hentikan pesan WhatsApp?',
      text: 'Customer ini tidak akan menerima pesan WhatsApp berikutnya dari sistem.',
      confirmButtonText: 'Ya, hentikan pesan',
      cancelButtonText: 'Batal',
      icon: 'warning',
      confirmButtonColor: '#dc2626',
    });
    if (confirmed) await optOutCustomer(customer.id);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div>
              <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">{customer.name}</h1>
              <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                {t('detail.customerId')}:{' '}
                <span className="font-mono text-indigo-700 dark:text-indigo-400">{customer.externalId}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                {customer.status === 'PENDING_INSTALLATION'
                  ? 'Menunggu pemasangan'
                  : customer.status === 'VERIFIED'
                    ? 'Terverifikasi'
                    : customer.status === 'SUSPENDED'
                      ? 'Ditangguhkan'
                      : 'Aktif'}
              </span>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${masterAddress?.isVerified ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800' : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'}`}
              >
                GPS: {masterAddress?.isVerified ? 'Terverifikasi' : 'Belum diverifikasi'}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              WhatsApp:{' '}
              <span className="font-mono text-gray-800 dark:text-gray-200 font-medium">{customer.phoneE164}</span> •
              Terdaftar sejak: {formatAppDate(customer.createdAt)}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[10px] text-gray-500 dark:text-gray-400">
              <span>
                Source ID:{' '}
                <strong className="font-mono text-gray-700 dark:text-gray-300">{customer.sourceRecordId || '—'}</strong>
              </span>
              <span>
                Source dibuat:{' '}
                <strong className="text-gray-700 dark:text-gray-300">
                  {customer.sourceCreatedAt ? formatAppDateTime(customer.sourceCreatedAt) : '—'}
                </strong>
              </span>
              <span>
                Coverage: <strong className="text-gray-700 dark:text-gray-300">{customer.coverageStatus || '—'}</strong>
              </span>
              <span>
                BTS:{' '}
                <strong className="text-gray-700 dark:text-gray-300">
                  {customer.btsName || '—'}
                  {customer.isCoverBts ? ' (cover)' : ''}
                </strong>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[10px]">
              <span className={customer.whatsappOptOutAt ? 'text-rose-600' : 'text-emerald-600'}>
                {customer.whatsappOptOutAt
                  ? 'WhatsApp opt-out — pengiriman diblokir'
                  : 'WhatsApp eligible — belum opt-out'}
              </span>
              {!customer.whatsappOptOutAt && (
                <button
                  type="button"
                  onClick={() => void handleOptOut()}
                  className="rounded border border-rose-200 px-2 py-1 text-rose-700"
                >
                  Stop pesan
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Address History & Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Addresses list (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Home className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>
                {t('detail.addresses')} ({custAddresses.length})
              </span>
            </h2>

            <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
              {custAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    addr.isActive
                      ? 'bg-gray-50/70 dark:bg-gray-800/60 border-gray-300 dark:border-gray-700'
                      : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
                      <span>{addr.addressType}</span>
                      <span
                        className={`${addr.isVerified ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'} border text-[10px] px-1.5 py-0.2 rounded font-semibold`}
                      >
                        {addr.isVerified ? 'GPS VERIFIED' : 'GPS BELUM VERIFIED'}
                      </span>
                      {customer.status !== 'VERIFIED' &&
                        !addr.isVerified &&
                        addr.referenceSource === 'PREREG_IMPORT' &&
                        addr.referenceLocation && (
                        <span
                          className={`${coordinateAuditClass(addr.coordinateAuditStatus)} border text-[10px] px-1.5 py-0.2 rounded font-semibold`}
                        >
                          {coordinateAuditLabel(addr.coordinateAuditStatus)}
                        </span>
                      )}
                    </span>
                  </div>

                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                    {formatAddressForDisplay(addr.rawAddress)}
                  </p>
                  {isIncompleteAddress(addr) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] font-medium leading-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                      {t('detail.addressIncomplete')}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                    <span>Provinsi: {addr.province || '—'}</span>
                    <span>Kota: {addr.city || '—'}</span>
                    <span>Kecamatan: {addr.district || '—'}</span>
                    <span>Kelurahan: {addr.subdistrict || '—'}</span>
                    <span>Kode pos: {addr.postalCode || '—'}</span>
                    <span>Patokan: {addr.addressReference || addr.landmark || '—'}</span>
                  </div>

                  <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700 flex flex-wrap gap-x-3 gap-y-1">
                    <span>Latitude: {addr.referenceLocation ? addr.referenceLocation.latitude.toFixed(6) : '—'}</span>
                    <span>Longitude: {addr.referenceLocation ? addr.referenceLocation.longitude.toFixed(6) : '—'}</span>
                    {addr.referenceLocation && (
                      <a
                        href={buildGoogleMapsDeepLink(
                          addr.referenceLocation.latitude,
                          addr.referenceLocation.longitude,
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('detail.openGoogleMaps')}
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 font-sans font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/50"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t('detail.openGoogleMaps')}
                      </a>
                    )}
                  </div>
                  {customer.status !== 'VERIFIED' &&
                    !addr.isVerified &&
                    addr.referenceSource === 'PREREG_IMPORT' &&
                    addr.referenceLocation &&
                    addr.coordinateAuditReason && (
                    <p className="text-[10px] leading-4 text-gray-500 dark:text-gray-400">{addr.coordinateAuditReason}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Verification Sessions (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Compass className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>
                {t('detail.sessions')} ({custSessions.length})
              </span>
            </h2>

            {custSessions.length > 0 ? (
              <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1">
                {custSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3 text-xs hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded">
                          {userFriendlyStatus(session.verificationStatus)}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                        {formatAppDate(session.createdAt)}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 dark:text-gray-400">
                      <div>
                        Percobaan GPS:{' '}
                        <span className="text-gray-900 dark:text-white font-semibold">{session.attemptCount}x</span>
                      </div>
                      <div>
                        Pengingat WA:{' '}
                        <span className="text-gray-900 dark:text-white font-semibold">{session.reminderCount}x</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => onSelectVerification(session.id)}
                        className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-[11px] font-medium shadow-xs transition-colors"
                      >
                        {t('detail.openMap')} &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-6">
                {t('detail.noSessions')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
