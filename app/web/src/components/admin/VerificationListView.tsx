import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import { mapApiCustomer, mapApiSession, mapApiValidationResult, useApp } from '../../context/AppContext';
import { adminApi } from '../../lib/apiClient';
import { Customer } from '../../types';
import { VerificationSession, VerificationStatus } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';

interface VerificationListViewProps {
  onSelectVerification: (sessionId: string) => void;
}

export const VerificationListView: React.FC<VerificationListViewProps> = ({
  onSelectVerification,
}) => {
  const { validationConfig } = useApp();
  const [rows, setRows] = useState<Array<{ session: VerificationSession; customer: Customer }>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);

  useEffect(() => setPage(1), [searchTerm, statusFilter]);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const response = await adminApi.verifications({ page, pageSize, search: searchTerm, status: statusFilter });
      const mapped = await Promise.all(response.items.map(async (row) => {
        const session = mapApiSession(row.session);
        try {
          const detail = await adminApi.verification(session.id);
          const results = Array.isArray(detail.results) ? detail.results : [];
          if (results[0]) session.lastValidationResult = mapApiValidationResult(results[0] as Record<string, unknown>);
        } catch { /* detail loads when the row is opened */ }
        return { session, customer: mapApiCustomer(row.customer) };
      }));
      setRows(mapped); setTotal(response.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Daftar sesi gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [page, pageSize, searchTerm, statusFilter]);

  const getStatusBadge = (status: VerificationStatus) => {
    switch (status) {
      case 'LOCATION_VALID':
        return (
          <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>LOCATION_VALID</span>
          </span>
        );
      case 'WAITING_FOR_HOME':
        return (
          <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <Clock className="w-3 h-3" />
            <span>WAITING_FOR_HOME</span>
          </span>
        );
      case 'MANUAL_REVIEW':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <ShieldCheck className="w-3 h-3" />
            <span>MANUAL_REVIEW</span>
          </span>
        );
      case 'LOW_GPS_ACCURACY':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <AlertTriangle className="w-3 h-3" />
            <span>LOW_GPS_ACCURACY</span>
          </span>
        );
      case 'ADDRESS_PROPOSED':
        return (
          <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <MapPin className="w-3 h-3" />
            <span>ADDRESS_PROPOSED</span>
          </span>
        );
      case 'CUSTOMER_DATA_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <XCircle className="w-3 h-3" />
            <span>DATA_MISMATCH</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded-md text-[11px] font-medium">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Compass className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <span>Daftar Sesi Verifikasi Lokasi</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Monitoring seluruh verification session, state machine, percobaan GPS, dan status pengingat.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Muat ulang</button>
      </div>

      {/* Filter / Search */}
      <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari sesi, nama customer, nomor HP..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-gray-500 dark:text-gray-400 font-medium">Filter Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
          >
            <option value="ALL">Semua Status</option>
            <option value="LOCATION_VALID">LOCATION_VALID</option>
            <option value="MANUAL_REVIEW">MANUAL_REVIEW</option>
            <option value="WAITING_FOR_HOME">WAITING_FOR_HOME</option>
            <option value="LOW_GPS_ACCURACY">LOW_GPS_ACCURACY</option>
            <option value="ADDRESS_PROPOSED">ADDRESS_PROPOSED</option>
            <option value="CUSTOMER_DATA_MISMATCH">CUSTOMER_DATA_MISMATCH</option>
            <option value="MESSAGE_SENT">MESSAGE_SENT</option>
          </select>
        </div>
      </div>

      {/* Verifications Table */}
      <AdminTable
        minWidthClass="min-w-[1050px]"
        footer={<TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />}
      >
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-4 py-2.5">Sesi ID &amp; Pelanggan</th>
                <th className="px-4 py-2.5">Status Verifikasi</th>
                <th className="px-4 py-2.5">Hasil GPS &amp; Jarak</th>
                <th className="px-4 py-2.5">Percobaan</th>
                <th className="px-4 py-2.5">Pengingat (Max 3)</th>
                <th className="px-4 py-2.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map(({ session, customer }) => {
                const lastVal = session.lastValidationResult;

                return (
                  <tr
                    key={session.id}
                    className="hover:bg-gray-50/70 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => onSelectVerification(session.id)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{customer?.name || 'Pelanggan'}</div>
                      <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400">
                        {session.id} • {customer?.phoneE164}
                      </div>
                    </td>

                    <td className="px-4 py-3">{getStatusBadge(session.verificationStatus)}</td>

                    <td className="px-4 py-3">
                      {lastVal ? (
                        <div>
                          <div className="font-mono text-gray-900 dark:text-white font-medium">
                            {lastVal.capturedLocation.latitude.toFixed(6)},{' '}
                            {lastVal.capturedLocation.longitude.toFixed(6)}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400">
                            Jarak: {lastVal.distanceFromReferenceMeters.toFixed(1)}m • Akurasi: &plusmn;
                            {lastVal.gpsAccuracyM}m
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic text-[11px]">Belum ada tangkapan GPS</span>
                      )}
                    </td>

                    <td className="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">
                      {session.attemptCount}x
                    </td>

                    <td className="px-4 py-3">
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300 font-mono">
                        {session.reminderCount} / {validationConfig.MAX_REMINDERS_PER_SESSION}x
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onSelectVerification(session.id)}
                        className="px-3 py-1 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-md text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                      >
                        <span>Detail</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-500">Memuat sesi...</td></tr>}
              {!loading && error && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-rose-600">{error}</td></tr>}
              {!loading && !error && !rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-500">Tidak ada sesi yang sesuai.</td></tr>}
            </tbody>
      </AdminTable>
    </div>
  );
};
