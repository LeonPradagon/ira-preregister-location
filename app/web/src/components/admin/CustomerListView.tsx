import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  MapPin,
  MoreHorizontal,
  Plus,
  Search,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Customer, CustomerStatus } from '../../types';
import { hasCapability } from '../../lib/accessControl';

interface CustomerListViewProps {
  onSelectCustomer: (customerId: string) => void;
  onCreateVerificationForCustomer: (customerId: string) => void;
}

export const CustomerListView: React.FC<CustomerListViewProps> = ({
  onSelectCustomer,
  onCreateVerificationForCustomer,
}) => {
  const { customers, addresses, verificationSessions, addCustomer, currentAdmin } = useApp();
  const canCreateVerification = hasCapability(currentAdmin?.role, 'createVerification');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // New Customer Form State
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('+628');
  const [newCustExtId, setNewCustExtId] = useState(`CUST-JKT-${Math.floor(Math.random() * 900000 + 100000)}`);
  const [newCustStreet, setNewCustStreet] = useState('');
  const [newCustHouseNo, setNewCustHouseNo] = useState('');
  const [newCustDistrict, setNewCustDistrict] = useState('');
  const [newCustSubdistrict, setNewCustSubdistrict] = useState('');
  const [newCustCity, setNewCustCity] = useState('Jakarta Selatan');
  const [newCustProvince, setNewCustProvince] = useState('DKI Jakarta');
  const [newCustLat, setNewCustLat] = useState('-6.233812');
  const [newCustLng, setNewCustLng] = useState('106.809599');

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.externalId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phoneE164.includes(searchTerm);

    const matchesStatus = statusFilter === 'ALL' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawAddr = `${newCustStreet} No. ${newCustHouseNo}, ${newCustSubdistrict}, ${newCustDistrict}, ${newCustCity}, ${newCustProvince}`;

    const created = await addCustomer(
      {
        name: newCustName,
        phoneE164: newCustPhone,
        externalId: newCustExtId,
        status: 'PENDING_INSTALLATION',
      },
      {
        addressType: 'MASTER',
        addressStatus: 'ACTIVE',
        rawAddress: rawAddr,
        province: newCustProvince,
        city: newCustCity,
        district: newCustDistrict,
        subdistrict: newCustSubdistrict,
        postalCode: '12110',
        street: newCustStreet,
        houseNumber: newCustHouseNo,
        referenceLocation: {
          latitude: parseFloat(newCustLat) || -6.2088,
          longitude: parseFloat(newCustLng) || 106.8456,
        },
        referenceSource: 'MASTER_COORDINATE',
        referencePrecision: 'ROOFTOP',
        referenceConfidence: 0.98,
      }
    );

    setIsAddModalOpen(false);
    onSelectCustomer(created.id);
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
            Daftar data induk customer fiber broadband, alamat referensi, dan riwayat verifikasi.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Pelanggan Baru</span>
        </button>
      </div>

      {/* Filter & Search Controls */}
      <div className="bg-white dark:bg-gray-900 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cari nama, external ID, nomor HP..."
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <span className="text-gray-600 dark:text-gray-300 font-medium">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-800 dark:text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
          >
            <option value="ALL">Semua Status ({customers.length})</option>
            <option value="PENDING_INSTALLATION">PENDING_INSTALLATION</option>
            <option value="VERIFIED">VERIFIED</option>
            <option value="ACTIVE">ACTIVE</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/80 dark:bg-gray-800/60 text-gray-600 dark:text-gray-400 font-semibold border-b border-gray-200 dark:border-gray-800">
              <tr>
                <th className="px-4 py-3">ID &amp; Nama Pelanggan</th>
                <th className="px-4 py-3">Nomor WhatsApp</th>
                <th className="px-4 py-3">Alamat Master Referensi</th>
                <th className="px-4 py-3">Status Verifikasi</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {filteredCustomers.map((cust) => {
                const custAddresses = addresses.filter((a) => a.customerId === cust.id);
                const masterAddr = custAddresses.find((a) => a.addressType === 'MASTER') || custAddresses[0];
                const custSessions = verificationSessions.filter((s) => s.customerId === cust.id);
                const latestSession = custSessions[0];

                return (
                  <tr
                    key={cust.id}
                    className="hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                    onClick={() => onSelectCustomer(cust.id)}
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-gray-900 dark:text-white">{cust.name}</div>
                      <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{cust.externalId}</div>
                    </td>

                    <td className="px-4 py-3.5 font-mono text-gray-700 dark:text-gray-300">
                      {cust.phoneE164}
                    </td>

                    <td className="px-4 py-3.5 max-w-xs">
                      {masterAddr ? (
                        <div>
                          <div className="text-gray-800 dark:text-gray-200 truncate font-medium">{masterAddr.rawAddress}</div>
                          <div className="text-[10px] font-mono text-gray-500 dark:text-gray-400 mt-0.5">
                            Ref: {masterAddr.referenceLocation.latitude.toFixed(6)}, {masterAddr.referenceLocation.longitude.toFixed(6)} ({masterAddr.referencePrecision})
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">Belum ada alamat</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {latestSession ? (
                        <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded-md font-mono text-[10px] border border-gray-200 dark:border-gray-700">
                          {latestSession.verificationStatus}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 italic">Belum ada sesi</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right space-x-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => onCreateVerificationForCustomer(cust.id)}
                        disabled={!canCreateVerification}
                        title={!canCreateVerification ? 'Role ini tidak dapat membuat sesi' : undefined}
                        className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                      >
                        <Compass className="w-3 h-3" />
                        <span>Sesi Baru</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onSelectCustomer(cust.id)}
                        className="px-2.5 py-1 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-lg text-[11px] font-medium transition-colors"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 max-w-lg w-full rounded-2xl shadow-xl overflow-hidden">
            <div className="p-4 bg-gray-50/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Tambah Pelanggan Baru &amp; Alamat Master</h3>
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
                  Simpan Pelanggan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
