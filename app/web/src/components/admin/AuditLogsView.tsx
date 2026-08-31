import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  ChevronDown,
  ChevronRight,
  Code,
  Filter,
  History,
  Search,
  Shield,
  User,
  RefreshCw,
} from 'lucide-react';
import { adminApi } from '../../lib/apiClient';
import { AuditLog } from '../../types';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';

export const AuditLogsView: React.FC = () => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [actorFilter, setActorFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<TablePageSize>(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [searchTerm, actorFilter, entityFilter]);
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const response = await adminApi.auditLogs({ page, pageSize, search: searchTerm, status: entityFilter, actor: actorFilter });
      setAuditLogs(response.items as unknown as AuditLog[]); setTotal(response.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Audit trail gagal dimuat.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [page, pageSize, searchTerm, actorFilter, entityFilter]);

  const getActionBadgeColor = (action: string) => {
    if (action.includes('VALID') || action.includes('APPROVE') || action.includes('CREATE')) {
      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    }
    if (action.includes('REJECT') || action.includes('MISMATCH') || action.includes('LOW_ACCURACY') || action.includes('FAILED')) {
      return 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    }
    if (action.includes('REVIEW') || action.includes('WAITING') || action.includes('UPDATE') || action.includes('REMINDER')) {
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
    return 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 flex items-center justify-between shadow-xs">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <History className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            <span>Audit Trail &amp; Kepatuhan Operasional</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Log rekaman seluruh interaksi sistem, GPS captures, audit event, dan keputusan review manual.
          </p>
        </div>

        <div className="text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
          Total Log: <span className="text-gray-900 dark:text-white font-semibold">{total}</span> entries
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800" aria-label="Muat ulang audit trail" title="Muat ulang audit trail"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white dark:bg-gray-900 p-3 rounded-xl border border-gray-200 dark:border-gray-800 flex flex-col md:flex-row items-center justify-between gap-3 text-xs shadow-xs">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari aksi, nama actor, entity ID, alasan..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-gray-500 dark:text-gray-400 font-medium">Actor:</span>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">Semua Actor</option>
              <option value="CUSTOMER">Customer / Web Flow</option>
              <option value="SYSTEM">System Engine / Worker</option>
              <option value="ADMIN">Admin / Reviewer</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400 font-medium">Entity:</span>
            <select
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="ALL">Semua Entity</option>
              <option value="VERIFICATION_SESSION">VERIFICATION_SESSION</option>
              <option value="VALIDATION">VALIDATION</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="ADDRESS">ADDRESS</option>
              <option value="REMINDER">REMINDER</option>
              <option value="REVIEW">REVIEW</option>
              <option value="AUTH">AUTH</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Logs List */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {auditLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;

            return (
              <div key={log.id} className="p-3.5 hover:bg-gray-50/70 dark:hover:bg-gray-800/40 transition-colors text-xs space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="p-1 text-gray-400 hover:text-gray-900 dark:hover:text-white rounded"
                    >
                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    <span
                      className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${getActionBadgeColor(
                        log.action
                      )}`}
                    >
                      {log.action}
                    </span>

                    <span className="font-mono text-[11px] text-gray-700 dark:text-gray-300">
                      {log.entityType} <span className="text-gray-400 dark:text-gray-500">#{log.entityId}</span>
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                    <span className="flex items-center gap-1 text-gray-700 dark:text-gray-300">
                      <User className="w-3 h-3 text-gray-400" />
                      <span>{log.actorName}</span>
                    </span>
                    <span>•</span>
                    <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                  </div>
                </div>

                {log.reason && (
                  <p className="text-[11px] text-gray-600 dark:text-gray-400 pl-6">{log.reason}</p>
                )}

                {/* Expanded Details / JSON Metadata */}
                {isExpanded && (
                  <div className="pl-6 pt-2 space-y-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {log.before && (
                        <div className="bg-gray-50 dark:bg-gray-800/60 p-2.5 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 font-semibold mb-1">State Sebelum (Before):</div>
                          <pre className="text-[10px] font-mono text-gray-800 dark:text-gray-200 overflow-x-auto">
                            {JSON.stringify(log.before, null, 2)}
                          </pre>
                        </div>
                      )}

                      {log.after && (
                        <div className="bg-emerald-50/50 dark:bg-emerald-950/30 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
                          <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-semibold mb-1">State Sesudah (After):</div>
                          <pre className="text-[10px] font-mono text-emerald-900 dark:text-emerald-200 overflow-x-auto">
                            {JSON.stringify(log.after, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {loading && <div className="p-10 text-center text-xs text-gray-500">Memuat audit trail...</div>}
          {!loading && error && <div className="p-10 text-center text-xs text-rose-600">{error}</div>}
          {!loading && !error && !auditLogs.length && <div className="p-10 text-center text-xs text-gray-500">Belum ada audit log.</div>}
        </div>
        <TablePagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} disabled={loading} />
      </div>
    </div>
  );
};
