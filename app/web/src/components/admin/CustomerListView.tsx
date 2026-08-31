import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Compass,
  AlertTriangle,
  Eye,
  Filter,
  MapPin,
  Pencil,
  Plus,
  Search,
  Upload,
  Trash2,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Customer, CustomerStatus } from '../../types';
import { hasCapability } from '../../lib/accessControl';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { CustomerImportModal } from './CustomerImportModal';

interface CustomerListViewProps {
  onSelectCustomer: (customerId: string) => void;
  onCreateVerificationForCustomer: (customerId: string, addressId?: string) => void;
}

const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  ACTIVE: 'Aktif',
  PENDING_INSTALLATION: 'Menunggu pemasangan',
  SUSPENDED: 'Ditangguhkan',
  VERIFIED: 'Terverifikasi',
};

const statusBadgeClass = (status: CustomerStatus) => {
  if (status === 'VERIFIED') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  if (status === 'SUSPENDED') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
  if (status === 'ACTIVE') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
};

const CustomerTableSkeleton: React.FC = () => (
  <>
    {Array.from({ length: 6 }, (_, index) => (
      <tr key={`customer-skeleton-${index}`} className="animate-pulse">
        {Array.from({ length: 8 }, (_, cellIndex) => (
          <td key={`customer-skeleton-${index}-${cellIndex}`} className="px-4 py-4 align-top">
            <div className={`h-3 rounded bg-gray-200 dark:bg-gray-700 ${cellIndex === 3 ? 'w-full' : cellIndex === 7 ? 'w-24' : 'w-3/4'}`} />
            {cellIndex !== 4 && cellIndex !== 5 && <div className="mt-2 h-2 w-1/2 rounded bg-gray-100 dark:bg-gray-800" />}
          </td>
        ))}
        <td className="px-4 py-4">
          <div className="flex justify-end gap-1.5">
            <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
            <div className="h-8 w-8 rounded-lg bg-gray-200 dark:bg-gray-700" />
          </div>
        </td>
      </tr>
    ))}
  </>
);

export const CustomerListView: React.FC<CustomerListViewProps> = ({
  onSelectCustomer,
  onCreateVerificationForCustomer,
}) => {
  const { customers, customerPage, loadCustomerPage, addCustomer, updateCustomer, deleteCustomer, refreshDashboard, currentAdmin } = useApp();
  const canCreateVerification = hasCapability(currentAdmin?.role, 'createVerification');
  const canManageCustomers = hasCapability(currentAdmin?.role, 'manageCustomers');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // New Customer Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+628');
  const [newCustExtId, setNewCustExtId] = useState(`CUST-JKT-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [newCustStreet, setNewCustStreet] = useState('');
  const [newCustHouseNo, setNewCustHouseNo] = useState('');
  const [newCustDistrict, setNewCustDistrict] = useState('');
  const [newCustSubdistrict, setNewCustSubdistrict] = useState('');
  const [newCustCity, setNewCustCity] = useState('');
  const [newCustProvince, setNewCustProvince] = useState('');
  const [newCustPostalCode, setNewCustPostalCode] = useState('');
  const [newCustLat, setNewCustLat] = useState('');
  const [newCustLng, setNewCustLng] = useState('');
  const [newCustStatus, setNewCustStatus] = useState<CustomerStatus>('PENDING_INSTALLATION');
  const [formError, setFormError] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setLoadError('');
      void loadCustomerPage(1, searchTerm, statusFilter as CustomerStatus | 'ALL')
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Data pelanggan gagal dimuat.'))
        .finally(() => setIsLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, statusFilter]);

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const latitude = Number(newCustLat);
    const longitude = Number(newCustLng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setFormError('Latitude dan longitude wajib diisi dengan koordinat yang valid.');
      return;
    }
    setFormError('');
    const rawAddr = `${newCustStreet} No. ${newCustHouseNo}, ${newCustSubdistrict}, ${newCustDistrict}, ${newCustCity}, ${newCustProvince}`;

    try {
      const address = {
        province: newCustProvince,
        city: newCustCity,
        district: newCustDistrict,
        subdistrict: newCustSubdistrict,
        postalCode: newCustPostalCode,
        street: newCustStreet,
        houseNumber: newCustHouseNo,
        referenceLocation: { latitude, longitude },
        referenceSource: 'MASTER_COORDINATE' as const,
        referencePrecision: 'ROOFTOP' as const,
        referenceConfidence: 0.98,
      };
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, { externalId: newCustExtId, name: newCustName, phoneE164: newCustPhone, status: newCustStatus, address });
        setEditingCustomer(null);
      } else {
        const created = await addCustomer(
          { name: newCustName, phoneE164: newCustPhone, externalId: newCustExtId, status: 'PENDING_INSTALLATION' },
          { ...address, addressType: 'MASTER', addressStatus: 'ACTIVE', rawAddress: rawAddr, validFrom: new Date().toISOString() },
        );
        onSelectCustomer(created.id);
      }
      setIsAddModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Data pelanggan gagal disimpan.');
    }
  };

  const openEditCustomer = (customer: Customer) => {
    const address = customer.activeAddress;
    if (!address?.referenceLocation) {
      setFormError('Pelanggan ini belum memiliki alamat aktif dengan koordinat referensi.');
      return;
    }
    setEditingCustomer(customer);
    setNewCustName(customer.name);
    setNewCustPhone(customer.phoneE164);
    setNewCustExtId(customer.externalId);
    setNewCustStreet(address.street);
    setNewCustHouseNo(address.houseNumber);
    setNewCustDistrict(address.district);
    setNewCustSubdistrict(address.subdistrict);
    setNewCustCity(address.city);
    setNewCustProvince(address.province);
    setNewCustPostalCode(address.postalCode);
    setNewCustLat(String(address.referenceLocation.latitude));
    setNewCustLng(String(address.referenceLocation.longitude));
    setNewCustStatus(customer.status);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleDeleteCustomer = (customer: Customer) => {
    setDeleteError('');
    setCustomerToDelete(customer);
  };

  const confirmDeleteCustomer = async () => {
    if (!customerToDelete) return;

    setIsDeletingCustomer(true);
    setDeleteError('');
    try {
      await deleteCustomer(customerToDelete.id);
      setCustomerToDelete(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Pelanggan gagal dinonaktifkan.');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gray-900 p-5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs">
        <div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Master Pelanggan &amp; Alamat Pemasangan</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Kelola data pelanggan, alamat referensi, dan proses verifikasi lokasi.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span>Import Excel / CSV</span>
          </button>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            disabled={!canManageCustomers}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Satu Pelanggan</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="bg-white dark:bg-gray-900 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama, ID, nomor HP, atau source ID..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <label htmlFor="customer-status-filter" className="text-gray-600 dark:text-gray-300 font-medium">Status pelanggan:</label>
          <select
            id="customer-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-0 max-w-full flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-gray-400 dark:focus:ring-gray-400 sm:flex-none"
          >
            <option value="ALL">Semua Status</option>
            <option value="PENDING_INSTALLATION">Menunggu pemasangan</option>
            <option value="VERIFIED">Terverifikasi</option>
            <option value="ACTIVE">Aktif</option>
            <option value="SUSPENDED">Ditangguhkan</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <AdminTable
        minWidthClass="min-w-[1450px]"
        footer={<TablePagination page={customerPage.page} pageSize={customerPage.pageSize} total={customerPage.total} disabled={isLoading} onPageChange={(page) => void loadCustomerPage(page, searchTerm, statusFilter as CustomerStatus | 'ALL')} onPageSizeChange={(pageSize: TablePageSize) => void loadCustomerPage(1, searchTerm, statusFilter as CustomerStatus | 'ALL', pageSize)} />}
      >
            <thead className="bg-gray-50/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="w-[175px] px-4 py-3 whitespace-nowrap">ID Pelanggan</th>
                <th className="w-[155px] px-4 py-3 whitespace-nowrap">Nama Pelanggan</th>
                <th className="w-[145px] px-4 py-3 whitespace-nowrap">Nomor WhatsApp</th>
                <th className="w-[260px] px-4 py-3">Alamat Terdaftar</th>
                <th className="w-[110px] px-4 py-3 whitespace-nowrap">Latitude</th>
                <th className="w-[110px] px-4 py-3 whitespace-nowrap">Longitude</th>
                <th className="w-[145px] px-4 py-3">Coverage / BTS</th>
                <th className="w-[160px] px-4 py-3">Status</th>
                <th className="w-[190px] px-4 py-3 text-right whitespace-nowrap">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {isLoading ? <CustomerTableSkeleton /> : customers.map((cust) => {
                const masterAddr = cust.activeAddress;
                const latestSession = cust.latestVerification;

                return (
                  <tr key={cust.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3.5 align-top">
                      <div className="font-mono text-[11px] text-gray-700 dark:text-gray-300 break-words whitespace-normal leading-4">{cust.externalId}</div>
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">ID sistem</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="font-semibold text-gray-900 dark:text-white break-words whitespace-normal leading-4">{cust.name}</div>
                      {cust.sourceRecordId && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">Source ID: <span className="font-mono">{cust.sourceRecordId}</span></div>}
                    </td>

                    <td className="px-4 py-3.5 align-top font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      <div>{cust.phoneE164}</div>
                      <div className="font-sans text-[10px] text-gray-400 dark:text-gray-500 mt-1">WhatsApp</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      {masterAddr ? (
                        <div>
                          <div className="text-gray-800 dark:text-gray-200 font-medium break-words whitespace-normal leading-4">{masterAddr.rawAddress}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">{masterAddr.province} • {masterAddr.city} • {masterAddr.district} • {masterAddr.subdistrict} • {masterAddr.postalCode}</div>
                          {masterAddr.addressReference && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">Patokan: {masterAddr.addressReference}</div>}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">Belum ada alamat</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 align-top font-mono text-[11px] text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {masterAddr?.referenceLocation ? masterAddr.referenceLocation.latitude.toFixed(6) : '—'}
                    </td>

                    <td className="px-4 py-3.5 align-top font-mono text-[11px] text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {masterAddr?.referenceLocation ? masterAddr.referenceLocation.longitude.toFixed(6) : '—'}
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="text-gray-800 dark:text-gray-200 break-words whitespace-normal leading-4">{cust.coverageStatus === 'COVERED BTS' ? 'Tercover BTS' : cust.coverageStatus === 'KELURAHAN BTS SAMA' ? 'BTS kelurahan sama' : cust.coverageStatus === 'NOT COVERED BTS' ? 'Belum tercover BTS' : 'Belum ada data'}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">{cust.btsName || (cust.isCoverBts ? 'BTS cover tersedia' : 'Nama BTS belum tersedia')}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(cust.status)}`}>
                        {CUSTOMER_STATUS_LABEL[cust.status] || cust.status}
                      </span>
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 break-words whitespace-normal leading-4">Verifikasi sesi: {latestSession ? latestSession.verificationStatus === 'MESSAGE_SENT' ? 'Undangan terkirim' : latestSession.verificationStatus === 'LOCATION_VALID' ? 'Lokasi valid' : latestSession.verificationStatus === 'WAITING_FOR_HOME' ? 'Menunggu di rumah' : latestSession.verificationStatus : 'Belum ada sesi'}</div>
                      <div className={`mt-1 text-[10px] font-medium break-words whitespace-normal leading-4 ${masterAddr?.isVerified ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>Status lokasi GPS: {masterAddr?.isVerified || latestSession?.verificationStatus === 'LOCATION_VALID' ? 'Terverifikasi' : 'Belum diverifikasi'}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onCreateVerificationForCustomer(cust.id, masterAddr?.id)}
                        disabled={!canCreateVerification}
                        title={!canCreateVerification ? 'Role ini tidak dapat membuat sesi' : 'Buat sesi verifikasi baru'}
                        aria-label="Buat sesi verifikasi baru"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 transition-colors hover:bg-indigo-100 disabled:opacity-40 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
                      >
                        <Compass className="h-3.5 w-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectCustomer(cust.id)}
                        title="Lihat detail pelanggan"
                        aria-label="Lihat detail pelanggan"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCustomer(cust)}
                        disabled={!canManageCustomers}
                        title="Edit pelanggan"
                        aria-label="Edit pelanggan"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCustomer(cust)}
                        disabled={!canManageCustomers || cust.status === 'SUSPENDED'}
                        title="Nonaktifkan pelanggan"
                        aria-label="Hapus pelanggan"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:border-rose-800 dark:bg-gray-800 dark:text-rose-300 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && customers.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-xs text-gray-400 dark:text-gray-500">{loadError || 'Tidak ada pelanggan pada halaman ini.'}</td></tr>
              )}
            </tbody>
      </AdminTable>

      {/* ADD / EDIT CUSTOMER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900">
            <div className="p-4 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{editingCustomer ? 'Edit Pelanggan & Alamat Master' : 'Tambah Pelanggan Baru & Alamat Master'}</h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCustomerSubmit} className="p-5 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: Hendra Gunawan"
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">ID Eksternal</label>
                  <input type="text" required value={newCustExtId} onChange={(e) => setNewCustExtId(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-mono" />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">No. WhatsApp</label>
                  <input
                    type="text"
                    required
                    placeholder="+62812345678"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
              </div>

              {editingCustomer && <div><label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Status</label><select value={newCustStatus} onChange={(e) => setNewCustStatus(e.target.value as CustomerStatus)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs"><option value="ACTIVE">Aktif</option><option value="PENDING_INSTALLATION">Menunggu pemasangan</option><option value="VERIFIED">Terverifikasi</option><option value="SUSPENDED">Ditangguhkan</option></select></div>}

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Nama Jalan / Perumahan</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jl. Gatot Subroto Kav. 52"
                  value={newCustStreet}
                  onChange={(e) => setNewCustStreet(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">No. Rumah</label>
                  <input
                    type="text"
                    required
                    placeholder="No. 12"
                    value={newCustHouseNo}
                    onChange={(e) => setNewCustHouseNo(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Kecamatan</label>
                  <input
                    type="text"
                    required
                    placeholder="Setiabudi"
                    value={newCustDistrict}
                    onChange={(e) => setNewCustDistrict(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Kelurahan</label>
                  <input
                    type="text"
                    required
                    placeholder="Karet Semanggi"
                    value={newCustSubdistrict}
                    onChange={(e) => setNewCustSubdistrict(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input required placeholder="Kota / Kabupaten" value={newCustCity} onChange={(e) => setNewCustCity(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs" />
                <input required placeholder="Provinsi" value={newCustProvince} onChange={(e) => setNewCustProvince(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs" />
                <input required placeholder="Kode Pos" value={newCustPostalCode} onChange={(e) => setNewCustPostalCode(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Koordinat Ref Lat</label>
                  <input
                    type="text"
                    required
                    value={newCustLat}
                    onChange={(e) => setNewCustLat(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Koordinat Ref Lng</label>
                  <input
                    type="text"
                    required
                    value={newCustLng}
                    onChange={(e) => setNewCustLng(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
              </div>

              {formError && <p className="text-xs text-rose-600">{formError}</p>}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium rounded-lg shadow-xs"
                >
                  {editingCustomer ? 'Simpan Perubahan' : 'Simpan Pelanggan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportModalOpen && (
        <CustomerImportModal
          onClose={() => setIsImportModalOpen(false)}
          onImported={async () => {
            await Promise.all([
              loadCustomerPage(1, searchTerm, statusFilter as CustomerStatus | 'ALL', customerPage.pageSize),
              refreshDashboard(),
            ]);
          }}
        />
      )}

      {customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-xs" role="presentation">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-gray-800 dark:bg-gray-900"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-customer-title"
            aria-describedby="delete-customer-description"
          >
            <div className="flex items-start gap-3 border-b border-gray-200 p-5 dark:border-gray-800">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 id="delete-customer-title" className="text-sm font-semibold text-gray-900 dark:text-white">Nonaktifkan pelanggan?</h3>
                <p id="delete-customer-description" className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  Anda akan menonaktifkan <span className="font-semibold text-gray-900 dark:text-white">{customerToDelete.name}</span>. Data tidak dihapus permanen dan tetap tersedia untuk riwayat audit.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                Pastikan pelanggan yang dipilih sudah benar sebelum melanjutkan.
              </div>

              {deleteError && <p className="text-xs text-rose-600 dark:text-rose-400">{deleteError}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCustomerToDelete(null)}
                  disabled={isDeletingCustomer}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteCustomer()}
                  disabled={isDeletingCustomer}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeletingCustomer && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                  {isDeletingCustomer ? 'Memproses...' : 'Ya, nonaktifkan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
