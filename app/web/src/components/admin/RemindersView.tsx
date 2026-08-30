import React from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  Compass,
  MessageSquare,
  Send,
  Smartphone,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface RemindersViewProps {
  onSelectVerification: (sessionId: string) => void;
  onOpenCustomerSimulator: (token: string) => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  onSelectVerification,
  onOpenCustomerSimulator,
}) => {
  const { reminders, verificationSessions, customers, validationConfig, sendManualReminder } = useApp();

  const sentReminders = reminders.filter((r) => r.status === 'SENT');
  const scheduledReminders = reminders.filter((r) => r.status === 'SCHEDULED');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            <span>Riwayat &amp; Antrean Pengingat WhatsApp (Reminders)</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manajemen pengingat otomatis (H+1, H+2, H+3) dengan batasan maksimal {validationConfig.MAX_REMINDERS_PER_SESSION}x per sesi pelanggan.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-lg">
            Terkirim: {sentReminders.length}
          </span>
          <span className="bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-lg">
            Terjadwal: {scheduledReminders.length}
          </span>
        </div>
      </div>

      {/* Reminders Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 dark:bg-gray-800/80 text-gray-600 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-3">Pelanggan &amp; Sesi</th>
                <th className="px-4 py-3">Urutan Pengingat</th>
                <th className="px-4 py-3">Channel &amp; Target</th>
                <th className="px-4 py-3">Jadwal / Waktu Kirim</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {reminders.map((rem) => {
                const session = verificationSessions.find((s) => s.id === rem.sessionId);
                const customer = session ? customers.find((c) => c.id === session.customerId) : null;

                return (
                  <tr key={rem.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-gray-900 dark:text-white">{customer?.name || 'Pelanggan'}</div>
                      <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{rem.sessionId}</div>
                    </td>

                    <td className="px-4 py-3.5 font-bold text-amber-600 dark:text-amber-400">
                      Pengingat #{rem.reminderNumber}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-gray-700 dark:text-gray-300">
                      {rem.channel}: {session?.registeredPhoneSnapshot}
                    </td>

                    <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-gray-400 text-[11px]">
                      {rem.sentAt
                        ? new Date(rem.sentAt).toLocaleString('id-ID')
                        : new Date(rem.scheduledAt).toLocaleString('id-ID')}
                    </td>

                    <td className="px-4 py-3.5">
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-semibold border ${
                          rem.status === 'SENT'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {rem.status}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-2">
                      {session && (
                        <>
                          <button
                            type="button"
                            onClick={() => onOpenCustomerSimulator(session.token)}
                            disabled={!session.token}
                            className="px-2.5 py-1 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-medium transition-colors"
                            title={session.token ? 'Buka tampilan customer' : 'Token hanya tersedia saat link dibuat atau dirotasi'}
                          >
                            Simulasi
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectVerification(session.id)}
                            className="px-2.5 py-1 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-[11px] font-medium shadow-xs transition-colors"
                          >
                            Buka Sesi
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
