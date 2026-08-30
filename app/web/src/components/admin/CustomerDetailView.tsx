import React from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Compass,
  Edit3,
  ExternalLink,
  History,
  Home,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Smartphone,
  User,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { VerificationMap } from '../maps/VerificationMap';

interface CustomerDetailViewProps {
  customerId: string;
  onBack: () => void;
  onSelectVerification: (sessionId: string) => void;
  onCreateVerification: (customerId: string, addressId: string) => void;
  onOpenCustomerSimulator: (token: string) => void;
}

export const CustomerDetailView: React.FC<CustomerDetailViewProps> = ({
  customerId,
  onBack,
  onSelectVerification,
  onCreateVerification,
  onOpenCustomerSimulator,
}) => {
  const { customers, addresses, verificationSessions } = useApp();

  const customer = customers.find((c) => c.id === customerId);
  const custAddresses = addresses.filter((a) => a.customerId === customerId);
  const custSessions = verificationSessions.filter((s) => s.customerId === customerId);

  if (!customer) {
    return (
      <div className="p-8 text-center bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 text-gray-500 dark:text-gray-400 shadow-xs">
        Pelanggan tidak ditemukan.
        <button onClick={onBack} className="block mx-auto mt-4 px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium">
          Kembali
        </button>
      </div>
    );
  }

  const masterAddress = custAddresses.find((a) => a.addressType === 'MASTER') || custAddresses[0];

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
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight">{customer.name}</h1>
              <span className="font-mono text-[11px] text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800">
                {customer.externalId}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                {customer.status}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              WhatsApp: <span className="font-mono text-gray-800 dark:text-gray-200 font-medium">{customer.phoneE164}</span> • Terdaftar sejak:{' '}
              {new Date(customer.createdAt).toLocaleDateString('id-ID')}
            </div>
          </div>
        </div>

        {masterAddress && (
          <button
            type="button"
            onClick={() => onCreateVerification(customer.id, masterAddress.id)}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium shadow-xs transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Sesi Verifikasi Baru</span>
          </button>
        )}
      </div>

      {/* Grid: Address History & Active Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Addresses list (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-5 shadow-xs space-y-3">
            <h2 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <Home className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Daftar Alamat Pelanggan ({custAddresses.length})</span>
            </h2>

            <div className="space-y-3">
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
                      {addr.isVerified && (
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-semibold">
                          VERIFIED
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-gray-500 dark:text-gray-400">{addr.referencePrecision}</span>
                  </div>

                  <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">{addr.rawAddress}</p>

                  <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span>
                      Ref: {addr.referenceLocation.latitude.toFixed(6)},{' '}
                      {addr.referenceLocation.longitude.toFixed(6)}
                    </span>
                    <span>Conf: {Math.round(addr.referenceConfidence * 100)}%</span>
                  </div>
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
              <span>Riwayat Sesi Verifikasi ({custSessions.length})</span>
            </h2>

            {custSessions.length > 0 ? (
              <div className="space-y-3">
                {custSessions.map((session) => (
                  <div
                    key={session.id}
                    className="p-4 bg-gray-50/60 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3 text-xs hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-700 dark:text-indigo-400 text-xs">
                          {session.id}
                        </span>
                        <span className="text-[10px] font-mono bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded">
                          {session.verificationStatus}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">
                        {new Date(session.createdAt).toLocaleDateString('id-ID')}
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
                        onClick={() => onOpenCustomerSimulator(session.token)}
                        disabled={!session.token}
                        className="px-2.5 py-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-medium flex items-center gap-1 transition-colors"
                        title={session.token ? 'Buka tampilan customer' : 'Token hanya tersedia saat link dibuat atau dirotasi'}
                      >
                        <Smartphone className="w-3 h-3 text-gray-500 dark:text-gray-400" />
                        <span>Simulasi Customer</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectVerification(session.id)}
                        className="px-3 py-1.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-[11px] font-medium shadow-xs transition-colors"
                      >
                        Buka Detail Peta &amp; Validasi &rarr;
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-gray-400 dark:text-gray-500 italic text-center py-6">
                Belum ada sesi verifikasi untuk pelanggan ini.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
