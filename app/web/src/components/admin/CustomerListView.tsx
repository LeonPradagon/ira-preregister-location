import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
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
import { api } from '../../lib/apiClient';
import { Customer, CustomerStatus } from '../../types';
import { hasCapability } from '../../lib/accessControl';
import { AdminTable, TablePagination, TablePageSize } from '../common/AdminTable';
import { CustomerImportModal } from './CustomerImportModal';
import { useTranslation } from '../../i18n';
import { formatAddressForDisplay, isIncompleteAddress } from '../../lib/validationEngine';
import { userFriendlyStatus } from '../../lib/statusLabels';
import { findRegionOption, regionOptionValue, RegionOption } from '../../lib/regionSelection';

interface CustomerListViewProps {
  onSelectCustomer: (customerId: string, alreadyLoaded?: boolean) => void;
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

type RegionLevel = 'province' | 'city' | 'district' | 'subdistrict';
const regionLevels: RegionLevel[] = ['province', 'city', 'district', 'subdistrict'];

const generateCustomerExternalId = () => `REREG-NON-CUSTOMER-${Math.floor(Math.random() * 900000 + 100000)}`;
const getPhoneNationalPart = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('62') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
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
}) => {
  const { customers, customerPage, loadCustomerPage, addCustomer, updateCustomer, deleteCustomer, refreshDashboard, currentAdmin } = useApp();
  const { t } = useTranslation();
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
  const [newCustExtId, setNewCustExtId] = useState(generateCustomerExternalId);
  const [newCustStreet, setNewCustStreet] = useState('');
  const [newCustHouseNo, setNewCustHouseNo] = useState('');
  const [newCustAddressDetail, setNewCustAddressDetail] = useState('');
  const [newCustDistrict, setNewCustDistrict] = useState('');
  const [newCustSubdistrict, setNewCustSubdistrict] = useState('');
  const [newCustCity, setNewCustCity] = useState('');
  const [newCustProvince, setNewCustProvince] = useState('');
  const [newCustPostalCode, setNewCustPostalCode] = useState('');
  const [newCustLat, setNewCustLat] = useState('');
  const [newCustLng, setNewCustLng] = useState('');
  const [newCustStatus, setNewCustStatus] = useState<CustomerStatus>('PENDING_INSTALLATION');
  const [formError, setFormError] = useState('');
  const [regionOptions, setRegionOptions] = useState<Record<RegionLevel, RegionOption[]>>({ province: [], city: [], district: [], subdistrict: [] });
  const [regionCodes, setRegionCodes] = useState<Partial<Record<RegionLevel, string>>>({});
  const [regionLoading, setRegionLoading] = useState<RegionLevel | null>(null);
  const [regionError, setRegionError] = useState('');
  const regionRequestId = useRef(0);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const resetCustomerForm = () => {
    setEditingCustomer(null);
    setNewCustName(''); setNewCustPhone('+62'); setNewCustExtId(generateCustomerExternalId());
    setNewCustStreet(''); setNewCustHouseNo(''); setNewCustAddressDetail(''); setNewCustDistrict(''); setNewCustSubdistrict(''); setNewCustCity(''); setNewCustProvince(''); setNewCustPostalCode('');
    setNewCustLat(''); setNewCustLng(''); setNewCustStatus('PENDING_INSTALLATION'); setFormError(''); setRegionCodes({});
    setRegionOptions({ province: [], city: [], district: [], subdistrict: [] }); setRegionError('');
  };

  useEffect(() => {
    if (!isAddModalOpen) return undefined;
    let active = true;
    const loadRegions = async () => {
      const provinces = await api.regions.provinces();
      if (!active) return;
      setRegionOptions((current) => ({ ...current, province: provinces }));
      if (!editingCustomer) return;
      const address = editingCustomer.activeAddress;

      const province = findRegionOption(provinces, address.province);
      if (!province) return;
      setNewCustProvince(regionOptionValue(province));
      const cities = await api.regions.regencies(province.code);
      if (!active) return;
      const city = findRegionOption(cities, address.city);
      if (!city) { setRegionOptions((current) => ({ ...current, city: cities })); setRegionCodes({ province: province.code }); return; }
      setNewCustCity(regionOptionValue(city));
      const districts = await api.regions.districts(city.code);
      if (!active) return;
      const district = findRegionOption(districts, address.district);
      if (!district) { setRegionOptions((current) => ({ ...current, city: cities, district: districts })); setRegionCodes({ province: province.code, city: city.code }); return; }
      setNewCustDistrict(regionOptionValue(district));
      const subdistricts = await api.regions.villages(district.code);
      if (!active) return;
      const subdistrict = findRegionOption(subdistricts, address.subdistrict);
      if (subdistrict) setNewCustSubdistrict(regionOptionValue(subdistrict));
      setRegionOptions({ province: provinces, city: cities, district: districts, subdistrict: subdistricts });
      setRegionCodes({ province: province.code, city: city.code, district: district.code, ...(subdistrict ? { subdistrict: subdistrict.code } : {}) });
    };
    void loadRegions().catch((error: unknown) => { if (active) setRegionError(error instanceof Error ? error.message : 'Data wilayah gagal dimuat.'); });
    return () => { active = false; };
  }, [isAddModalOpen, editingCustomer]);

  const getRegionValue = (field: RegionLevel) => {
    const value = { province: newCustProvince, city: newCustCity, district: newCustDistrict, subdistrict: newCustSubdistrict }[field];
    const selected = findRegionOption(regionOptions[field], value);
    return selected ? regionOptionValue(selected) : value.trim();
  };
  const setPhoneNationalPart = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const nationalPart = digits.startsWith('62') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
    setNewCustPhone(`+62${nationalPart}`);
  };
  const setRegionValue = (field: RegionLevel, value: string) => {
    if (field === 'province') setNewCustProvince(value);
    if (field === 'city') setNewCustCity(value);
    if (field === 'district') setNewCustDistrict(value);
    if (field === 'subdistrict') setNewCustSubdistrict(value);
  };
  const handleRegionChange = async (field: RegionLevel, value: string) => {
    const levelIndex = regionLevels.indexOf(field);
    const selected = findRegionOption(regionOptions[field], value);
    setRegionValue(field, selected ? regionOptionValue(selected) : value.trim());
    if (field === 'subdistrict') setNewCustPostalCode(selected?.postalCode || '');
    else setNewCustPostalCode('');
    for (const child of regionLevels.slice(levelIndex + 1)) setRegionValue(child, '');
    setRegionCodes((current) => {
      const next = { ...current, [field]: selected?.code };
      for (const child of regionLevels.slice(levelIndex + 1)) delete next[child];
      return next;
    });
    setRegionOptions((current) => {
      const next = { ...current };
      for (const child of regionLevels.slice(levelIndex + 1)) next[child] = [];
      return next;
    });
    const child = regionLevels[levelIndex + 1];
    if (!selected || !child) return;
    const requestId = ++regionRequestId.current;
    setRegionLoading(child); setRegionError('');
    try {
      const options = field === 'province'
        ? await api.regions.regencies(selected.code)
        : field === 'city'
          ? await api.regions.districts(selected.code)
          : await api.regions.villages(selected.code);
      if (requestId === regionRequestId.current) setRegionOptions((current) => ({ ...current, [child]: options }));
    } catch (error: unknown) {
      if (requestId === regionRequestId.current) setRegionError(error instanceof Error ? error.message : 'Data wilayah gagal dimuat.');
    } finally {
      if (requestId === regionRequestId.current) setRegionLoading(null);
    }
  };
  const renderRegionField = (field: RegionLevel, label: string) => {
    const parent = regionLevels[regionLevels.indexOf(field) - 1];
    const options = regionOptions[field];
    return <div>
      <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{label} <span className="text-rose-600">*</span></label>
      <select required value={getRegionValue(field).trim()} disabled={Boolean(parent && !regionCodes[parent]) || regionLoading === field || options.length === 0} onChange={(event) => void handleRegionChange(field, event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white p-2 text-xs disabled:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:disabled:bg-gray-800/60">
        <option value="">Pilih {label}</option>
        {options.map((option) => <option key={option.code} value={regionOptionValue(option)}>{regionOptionValue(option)}</option>)}
      </select>
      {regionLoading === field && <p className="mt-1 text-[10px] text-gray-500">Memuat pilihan...</p>}
    </div>;
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setLoadError('');
      void loadCustomerPage(1, searchTerm, statusFilter as CustomerStatus | 'ALL')
        .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : t('customers.loadError')))
        .finally(() => setIsLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchTerm, statusFilter, t]);

  const handleCreateCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const latitudeText = newCustLat.trim();
    const longitudeText = newCustLng.trim();
    const hasLatitude = Boolean(latitudeText);
    const hasLongitude = Boolean(longitudeText);
    if (hasLatitude !== hasLongitude) { setFormError(t('customers.invalidCoordinates')); return; }
    const latitude = hasLatitude ? Number(latitudeText) : undefined;
    const longitude = hasLongitude ? Number(longitudeText) : undefined;
    if ((latitude !== undefined && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) || (longitude !== undefined && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) { setFormError(t('customers.invalidCoordinates')); return; }
    setFormError('');
    const rawAddr = [newCustStreet, `No. ${newCustHouseNo.trim()}`, newCustAddressDetail.trim(), newCustSubdistrict, newCustDistrict, newCustCity, newCustProvince, newCustPostalCode].filter(Boolean).join(', ');

    try {
      const address = {
        province: newCustProvince,
        city: newCustCity,
        district: newCustDistrict,
        subdistrict: newCustSubdistrict,
        postalCode: newCustPostalCode,
        street: newCustStreet,
        houseNumber: newCustHouseNo.trim(),
        addressDetail: newCustAddressDetail.trim() || undefined,
        ...(latitude !== undefined && longitude !== undefined ? { referenceLocation: { latitude, longitude }, referenceSource: 'MASTER_COORDINATE' as const, referencePrecision: 'ROOFTOP' as const, referenceConfidence: 0.98 } : { referenceSource: 'CUSTOMER_PROPOSED' as const, referencePrecision: 'UNKNOWN' as const, referenceConfidence: 0 }),
      };
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, { externalId: newCustExtId, name: newCustName, phoneE164: newCustPhone, status: newCustStatus, address });
        setEditingCustomer(null);
      } else {
        const created = await addCustomer(
          { name: newCustName, phoneE164: newCustPhone, externalId: newCustExtId, status: 'PENDING_INSTALLATION' },
          { ...address, addressType: 'MASTER', addressStatus: 'ACTIVE', rawAddress: rawAddr, validFrom: new Date().toISOString() },
        );
        onSelectCustomer(created.id, true);
      }
      setIsAddModalOpen(false);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : t('customers.saveError'));
    }
  };

  const openEditCustomer = (customer: Customer) => {
    const address = customer.activeAddress;
    setEditingCustomer(customer);
    setNewCustName(customer.name);
    setNewCustPhone(`+62${getPhoneNationalPart(customer.phoneE164)}`);
    setNewCustExtId(customer.externalId);
    setNewCustStreet(address.street);
    setNewCustHouseNo(address.houseNumber);
    setNewCustAddressDetail([address.addressDetail, address.landmark && `Patokan: ${address.landmark}`].filter(Boolean).join(', '));
    setNewCustDistrict(address.district);
    setNewCustSubdistrict(address.subdistrict);
    setNewCustCity(address.city);
    setNewCustProvince(address.province);
    setNewCustPostalCode(address.postalCode);
    setNewCustLat(address.referenceLocation ? String(address.referenceLocation.latitude) : '');
    setNewCustLng(address.referenceLocation ? String(address.referenceLocation.longitude) : '');
    setRegionCodes({}); setRegionOptions({ province: [], city: [], district: [], subdistrict: [] });
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
      setDeleteError(error instanceof Error ? error.message : t('customers.permanentDeleteError'));
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
            <span>{t('customers.title')}</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {t('customers.description')}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            <Upload className="w-4 h-4" />
            <span>{t('customers.import')}</span>
          </button>
          <button
            type="button"
            onClick={() => { resetCustomerForm(); setIsAddModalOpen(true); }}
            disabled={!canManageCustomers}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white rounded-lg text-xs font-medium transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>{t('customers.add')}</span>
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
            placeholder={t('customers.search')}
            className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
          <label htmlFor="customer-status-filter" className="text-gray-600 dark:text-gray-300 font-medium">{t('customers.status')}:</label>
          <select
            id="customer-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="min-w-0 max-w-full flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-gray-800 focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:focus:border-gray-400 dark:focus:ring-gray-400 sm:flex-none"
          >
            <option value="ALL">{t('customers.allStatuses')}</option>
            <option value="PENDING_INSTALLATION">{t('customers.waitingInstallation')}</option>
            <option value="VERIFIED">{t('customers.verified')}</option>
            <option value="ACTIVE">{t('customers.active')}</option>
            <option value="SUSPENDED">{t('customers.suspended')}</option>
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
                <th className="w-[175px] px-4 py-3 whitespace-nowrap">{t('table.customerId')}</th>
                <th className="w-[155px] px-4 py-3 whitespace-nowrap">{t('table.customerName')}</th>
                <th className="w-[145px] px-4 py-3 whitespace-nowrap">{t('table.whatsapp')}</th>
                <th className="w-[260px] px-4 py-3">{t('table.address')}</th>
                <th className="w-[110px] px-4 py-3 whitespace-nowrap">{t('table.latitude')}</th>
                <th className="w-[110px] px-4 py-3 whitespace-nowrap">{t('table.longitude')}</th>
                <th className="w-[145px] px-4 py-3">{t('table.coverage')}</th>
                <th className="w-[160px] px-4 py-3">{t('table.status')}</th>
                <th className="w-[190px] px-4 py-3 text-right whitespace-nowrap">{t('table.action')}</th>
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
                          <div className="text-gray-800 dark:text-gray-200 font-medium break-words whitespace-normal leading-4">{formatAddressForDisplay(masterAddr.rawAddress)}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">{masterAddr.province} • {masterAddr.city} • {masterAddr.district} • {masterAddr.subdistrict} • {masterAddr.postalCode}</div>
                          {masterAddr.addressReference && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">Patokan: {masterAddr.addressReference}</div>}
                          {isIncompleteAddress(masterAddr) && <div className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">{t('customers.addressIncomplete')}</div>}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500 italic">{t('customers.noAddress')}</span>
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
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 break-words whitespace-normal leading-4">Pemeriksaan: {latestSession ? userFriendlyStatus(latestSession.verificationStatus) : 'Belum ada pemeriksaan'}</div>
                      <div className={`mt-1 text-[10px] font-medium break-words whitespace-normal leading-4 ${masterAddr?.isVerified ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>Status lokasi GPS: {masterAddr?.isVerified || latestSession?.verificationStatus === 'LOCATION_VALID' ? 'Terverifikasi' : 'Belum diverifikasi'}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => onSelectCustomer(cust.id)}
                        title={t('customers.viewDetail')}
                        aria-label={t('customers.viewDetail')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditCustomer(cust)}
                        disabled={!canManageCustomers}
                        title={t('customers.edit')}
                        aria-label={t('customers.edit')}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteCustomer(cust)}
                        disabled={!canManageCustomers}
                        title={t('customers.permanentDelete')}
                        aria-label={t('customers.permanentDelete')}
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
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{editingCustomer ? t('customers.editTitle') : t('customers.addTitle')}</h3>
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
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.fullName')}</label>
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
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.externalId')} <span className="font-normal text-gray-400">(otomatis)</span></label>
                  <input type="text" value={newCustExtId} disabled title="Customer ID dibuat otomatis dan tidak dapat diubah" className="w-full rounded-lg border border-gray-300 bg-gray-100 p-2 text-xs font-mono text-gray-500 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400" />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.whatsapp')} (+62)</label>
                  <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <span className="flex items-center border-r border-gray-300 bg-gray-50 px-2 font-mono text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">+62</span>
                    <input
                      type="tel"
                      required
                      inputMode="numeric"
                      pattern="8[0-9]{7,12}"
                      placeholder="812345678"
                      value={getPhoneNationalPart(newCustPhone)}
                      onChange={(e) => setPhoneNationalPart(e.target.value)}
                      aria-label="Nomor WhatsApp setelah kode negara +62"
                      className="min-w-0 flex-1 bg-transparent p-2 text-xs font-mono text-gray-900 outline-none focus:ring-1 focus:ring-gray-900 dark:text-white dark:focus:ring-gray-400"
                    />
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-gray-500">Kode negara +62 dikunci. Isi nomor mulai dari 8.</p>
                </div>
              </div>

              {editingCustomer && <div><label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Status</label><select value={newCustStatus} onChange={(e) => setNewCustStatus(e.target.value as CustomerStatus)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs"><option value="ACTIVE">Aktif</option><option value="PENDING_INSTALLATION">Menunggu pemasangan</option><option value="VERIFIED">Terverifikasi</option><option value="SUSPENDED">Ditangguhkan</option></select></div>}

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Nama Jalan / Perumahan <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Jl. Gatot Subroto Kav. 52"
                  value={newCustStreet}
                  onChange={(e) => setNewCustStreet(e.target.value)}
                  className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {renderRegionField('province', 'Provinsi')}
                {renderRegionField('city', 'Kota / Kabupaten')}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {renderRegionField('district', 'Kecamatan')}
                {renderRegionField('subdistrict', 'Kelurahan')}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                   <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">No. Rumah <span className="text-rose-600">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 12 atau A-12"
                    value={newCustHouseNo}
                    onChange={(e) => setNewCustHouseNo(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                   />
                   <p className="mt-1 text-[10px] leading-4 text-gray-500">Nomor rumah wajib diisi, termasuk nomor unit atau blok jika relevan.</p>
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Kode Pos <span className="text-rose-600">*</span></label>
                  <input required inputMode="numeric" maxLength={5} pattern="[0-9]{5}" placeholder="Contoh: 11540" value={newCustPostalCode} onChange={(e) => setNewCustPostalCode(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Detail Alamat & Patokan <span className="font-normal text-gray-400">(opsional)</span></label>
                  <textarea rows={2} maxLength={1000} placeholder="Contoh: Blok A lantai 2, dekat pos satpam, sebelah minimarket" value={newCustAddressDetail} onChange={(e) => setNewCustAddressDetail(e.target.value)} className="w-full resize-y rounded-lg border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Koordinat Ref Lat <span className="font-normal text-gray-400">(opsional)</span></label>
                  <input
                    type="text"
                    placeholder="Contoh: -6.2088"
                    value={newCustLat}
                    onChange={(e) => setNewCustLat(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">Koordinat Ref Lng <span className="font-normal text-gray-400">(opsional)</span></label>
                  <input
                    type="text"
                    placeholder="Contoh: 106.8456"
                    value={newCustLng}
                    onChange={(e) => setNewCustLng(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
              </div>
              <p className="text-[10px] leading-4 text-gray-500">Titik lokasi boleh dikosongkan. Alamat tetap tersimpan dan dapat dilengkapi saat pemeriksaan lokasi.</p>

              {formError && <p className="text-xs text-rose-600">{formError}</p>}

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-200 dark:border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium"
                >
                  {t('customers.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white text-white font-medium rounded-lg shadow-xs"
                >
                  {editingCustomer ? t('customers.saveChanges') : t('customers.save')}
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
                <h3 id="delete-customer-title" className="text-sm font-semibold text-gray-900 dark:text-white">{t('customers.permanentDeleteQuestion')}</h3>
                <p id="delete-customer-description" className="mt-1 text-xs leading-5 text-gray-600 dark:text-gray-400">
                  {t('customers.permanentDeleteDescription')} Customer: <span className="font-semibold text-gray-900 dark:text-white">{customerToDelete.name}</span>.
                </p>
              </div>
            </div>

            <div className="space-y-3 p-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
                {t('customers.permanentDeleteWarning')}
              </div>

              {deleteError && <p className="text-xs text-rose-600 dark:text-rose-400">{deleteError}</p>}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCustomerToDelete(null)}
                  disabled={isDeletingCustomer}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  {t('customers.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmDeleteCustomer()}
                  disabled={isDeletingCustomer}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeletingCustomer && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                  {isDeletingCustomer ? t('campaigns.process') : t('customers.confirmPermanentDelete')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
