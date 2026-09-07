import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react';
import { CustomerImportApiResult, api } from '../../lib/apiClient';
import { confirmAction, showActionSuccess } from '../../lib/swal';
import { AppLoader } from '../common/AppLoader';

interface CustomerImportModalProps {
  onClose: () => void;
  onImported: () => Promise<void> | void;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const formatNumber = (value: number) => value.toLocaleString('id-ID');

export const CustomerImportModal: React.FC<CustomerImportModalProps> = ({ onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CustomerImportApiResult | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setResult(null);
    if (!selected) {
      setFile(null);
      return;
    }
    const extension = selected.name.slice(selected.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.csv'].includes(extension)) {
      setFile(null);
      setError('File harus berformat .xlsx atau .csv.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError('Ukuran file maksimal 50 MB. Pecah data menjadi beberapa file batch.');
      return;
    }
    setFile(selected);
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError('Pilih file .xlsx atau .csv terlebih dahulu.');
      return;
    }
    const confirmed = await confirmAction({
      title: 'Mulai import data?',
      text: 'Data customer dari file ini akan dibuat atau diperbarui di sistem.',
      confirmButtonText: 'Ya, mulai import',
      cancelButtonText: 'Batal',
    });
    if (!confirmed) return;
    setError('');
    setIsUploading(true);
    try {
      const queued = await api.importCustomers(file);
      if (!queued.jobId) throw new Error('Server tidak mengembalikan ID import job.');
      let imported = queued;
      const deadline = Date.now() + 15 * 60 * 1000;
      while (imported.status !== 'COMPLETED' && imported.status !== 'FAILED' && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
        imported = await api.importJob(queued.jobId);
      }
      if (imported.status === 'FAILED') throw new Error(imported.errorSummary || 'Import gagal diproses.');
      if (imported.status !== 'COMPLETED') throw new Error('Import masih diproses. Silakan cek status job dan coba lagi nanti.');
      setResult(imported);
      await onImported();
      await showActionSuccess('Import berhasil', 'Data customer berhasil disimpan ke sistem.');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'File gagal diimpor.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-xl w-full rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Import Pelanggan Massal</h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">Upload Excel atau CSV per batch</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={isUploading} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 p-1 rounded-lg disabled:opacity-50" aria-label="Tutup">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="p-5 space-y-4 text-xs">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
            <p className="font-semibold">Format yang didukung</p>
            <p className="mt-1 leading-relaxed">Gunakan header report yang sama seperti import sebelumnya. Maksimal 50 MB per file. Source ID yang sudah ada akan diperbarui secara idempotent, bukan dibuat sebagai duplikat.</p>
          </div>

          <label htmlFor="customer-import-file" className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:border-emerald-600">
            <Upload className="w-7 h-7 text-gray-400 dark:text-gray-500" />
            <span className="mt-2 font-semibold text-gray-800 dark:text-gray-200">{file ? file.name : 'Pilih file Excel atau CSV'}</span>
            <span className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">.xlsx atau .csv • maksimal 50 MB</span>
            <input id="customer-import-file" type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={handleFileChange} disabled={isUploading} className="sr-only" />
          </label>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
              <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Data berhasil dimasukkan</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                <span>Baris diproses: <strong>{formatNumber(result.rowsRead)}</strong></span>
                <span>Customer: <strong>{formatNumber(result.customersUpserted)}</strong></span>
                <span>Alamat baru: <strong>{formatNumber(result.addressesInserted)}</strong></span>
                <span>Alamat diperbarui: <strong>{formatNumber(result.addressesUpdated)}</strong></span>
                {result.incompleteAddressRows > 0 && <span className="col-span-2 text-amber-700 dark:text-amber-300">Alamat perlu dilengkapi dan diperiksa: <strong>{formatNumber(result.incompleteAddressRows)}</strong></span>}
              </div>
              <p className="mt-2 text-[10px]">Pilihan menerima pesan WhatsApp tidak diubah oleh proses ini.</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
            <button type="button" onClick={onClose} disabled={isUploading} className="rounded-lg border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700">{result ? 'Tutup' : 'Batal'}</button>
            {!result && <button type="submit" disabled={!file || isUploading} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 font-medium text-white shadow-xs hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white">{isUploading && <AppLoader size={20} label="Importing" />} {isUploading ? 'Mengimpor...' : 'Mulai Import'}</button>}
          </div>
        </form>
      </div>
    </div>
  );
};
