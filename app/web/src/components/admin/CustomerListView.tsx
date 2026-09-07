import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
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
import { findRegionOption, regionOptionValue, RegionOption } from '../../lib/regionSelection';
import { confirmAction, showActionSuccess } from '../../lib/swal';
import { AppLoader } from '../common/AppLoader';

interface CustomerListViewProps {
  onSelectCustomer: (customerId: string, alreadyLoaded?: boolean) => void;
}

const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  ACTIVE: 'customers.statusLabel.ACTIVE',
  PENDING_INSTALLATION: 'customers.statusLabel.PENDING_INSTALLATION',
  SUSPENDED: 'customers.statusLabel.SUSPENDED',
  VERIFIED: 'customers.statusLabel.VERIFIED',
};

const CUSTOMER_CHECK_STATUS_LABEL: Record<string, string> = {
  CREATED: 'customers.checkStatus.CREATED', MESSAGE_SENT: 'customers.checkStatus.MESSAGE_SENT', LINK_OPENED: 'customers.checkStatus.LINK_OPENED', CONSENTED: 'customers.checkStatus.CONSENTED', GPS_CAPTURING: 'customers.checkStatus.GPS_CAPTURING', LOCATION_VALID: 'customers.checkStatus.LOCATION_VALID', LOW_GPS_ACCURACY: 'customers.checkStatus.LOW_GPS_ACCURACY', LOCATION_MISMATCH: 'customers.checkStatus.LOCATION_MISMATCH', CUSTOMER_DATA_MISMATCH: 'customers.checkStatus.CUSTOMER_DATA_MISMATCH', MANUAL_REVIEW: 'customers.checkStatus.MANUAL_REVIEW', WAITING_FOR_HOME: 'customers.checkStatus.WAITING_FOR_HOME', ADDRESS_PROPOSED: 'customers.checkStatus.ADDRESS_PROPOSED',
};

const statusBadgeClass = (status: CustomerStatus) => {
  if (status === 'VERIFIED') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  if (status === 'SUSPENDED') return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800';
  if (status === 'ACTIVE') return 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
};

type RegionLevel = 'province' | 'city' | 'district' | 'subdistrict';
const regionLevels: RegionLevel[] = ['province', 'city', 'district', 'subdistrict'];

const generateCustomerExternalId = () => `PREREREG-NON-CUSTOMER-${Math.floor(Math.random() * 900000 + 100000)}`;
const getPhoneNationalPart = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('62') ? digits.slice(2) : digits.startsWith('0') ? digits.slice(1) : digits;
};

const CustomerTableSkeleton: React.FC = () => (
  <tr>
    <td colSpan={9} className="px-4 py-12">
      <div className="flex flex-col items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <AppLoader size={64} label="Loading customers" />
        <span>Loading customers...</span>
      </div>
    </td>
  </tr>
);

export const CustomerListView: React.FC<CustomerListViewProps> = ({
  onSelectCustomer,
}) => {
  const { customers, customerPage, dashboardSummary, loadCustomerPage, addCustomer, updateCustomer, deleteCustomer, refreshDashboard, currentAdmin } = useApp();
  const { t } = useTranslation();
  const canManageCustomers = hasCapability(currentAdmin?.role, 'manageCustomers');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

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
        <option value="">{t('customers.selectRegion', { label })}</option>
        {options.map((option) => <option key={option.code} value={regionOptionValue(option)}>{regionOptionValue(option)}</option>)}
      </select>
      {regionLoading === field && <p className="mt-1 text-[10px] text-gray-500">{t('customers.regionLoading')}</p>}
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

    const confirmed = await confirmAction({
      title: editingCustomer ? t('customers.editTitle') : t('customers.addTitle'),
      text: t('customers.confirmText'),
      confirmButtonText: editingCustomer ? t('customers.saveChanges') : t('customers.save'),
      cancelButtonText: t('customers.cancel'),
    });
    if (!confirmed) return;

    try {
      const isEditing = Boolean(editingCustomer);
      let createdCustomerId: string | undefined;
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
      if (isEditing && editingCustomer) {
        await updateCustomer(editingCustomer.id, { externalId: newCustExtId, name: newCustName, phoneE164: newCustPhone, status: newCustStatus, address });
        setEditingCustomer(null);
      } else {
        const created = await addCustomer(
          { name: newCustName, phoneE164: newCustPhone, externalId: newCustExtId, status: 'PENDING_INSTALLATION' },
          { ...address, addressType: 'MASTER', addressStatus: 'ACTIVE', rawAddress: rawAddr, validFrom: new Date().toISOString() },
        );
        createdCustomerId = created.id;
      }
      setIsAddModalOpen(false);
      await showActionSuccess(
        t(isEditing ? 'crud.updated' : 'crud.saved'),
        t(isEditing ? 'customers.saveChanges' : 'customers.save'),
      );
      if (createdCustomerId) onSelectCustomer(createdCustomerId, true);
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

  const handleDeleteCustomer = async (customer: Customer) => {
    const confirmed = await confirmAction({
      title: t('customers.permanentDeleteQuestion'),
      text: `${t('customers.permanentDeleteDescription')} Customer: ${customer.name}. ${t('customers.permanentDeleteWarning')}`,
      confirmButtonText: t('customers.confirmPermanentDelete'),
      cancelButtonText: t('customers.cancel'),
      icon: 'warning',
      confirmButtonColor: '#dc2626',
    });
    if (!confirmed) return;

    try {
      await deleteCustomer(customer.id);
      await showActionSuccess(t('crud.deleted'), t('customers.permanentDelete'));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : t('customers.permanentDeleteError'));
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

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"><div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Users className="h-4 w-4" />{t('customers.total')}</div><p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{dashboardSummary.customers.total.toLocaleString('en-US')}</p><p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{t('customers.totalHelp')}</p></div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20"><div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="h-4 w-4" />{t('customers.verifiedCount')}</div><p className="mt-2 text-2xl font-bold text-emerald-700 dark:text-emerald-300">{dashboardSummary.customers.verified.toLocaleString('en-US')}</p><p className="mt-1 text-[11px] text-emerald-700/80 dark:text-emerald-300/80">{t('customers.verifiedCountHelp')}</p></div>
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm dark:border-indigo-900 dark:bg-indigo-950/20"><div className="flex items-center gap-2 text-xs font-medium text-indigo-700 dark:text-indigo-300"><Clock className="h-4 w-4" />{t('customers.activeCount')}</div><p className="mt-2 text-2xl font-bold text-indigo-700 dark:text-indigo-300">{dashboardSummary.customers.active.toLocaleString('en-US')}</p><p className="mt-1 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">{t('customers.activeCountHelp')}</p></div>
      </section>

      {/* Filter & Search Controls */}
      <div className="bg-white dark:bg-gray-900 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xs flex flex-col gap-3 text-xs">
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
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('customers.filterHelp')}</p>
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
                      <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{t('customers.systemId')}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="font-semibold text-gray-900 dark:text-white break-words whitespace-normal leading-4">{cust.name}</div>
                      {cust.sourceRecordId && <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">{t('customers.sourceId')}: <span className="font-mono">{cust.sourceRecordId}</span></div>}
                    </td>

                    <td className="px-4 py-3.5 align-top font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      <div>{cust.phoneE164}</div>
                      <div className="font-sans text-[10px] text-gray-400 dark:text-gray-500 mt-1">{t('customers.whatsappLabel')}</div>
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
                      {masterAddr?.referenceLocation ? masterAddr.referenceLocation.latitude.toFixed(6) : t('customers.noCoordinates')}
                    </td>

                    <td className="px-4 py-3.5 align-top font-mono text-[11px] text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {masterAddr?.referenceLocation ? masterAddr.referenceLocation.longitude.toFixed(6) : t('customers.noCoordinates')}
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <div className="text-gray-800 dark:text-gray-200 break-words whitespace-normal leading-4">{cust.coverageStatus === 'COVERED BTS' ? t('customers.coverageAvailable') : cust.coverageStatus === 'KELURAHAN BTS SAMA' ? t('customers.coverageSameArea') : cust.coverageStatus === 'NOT COVERED BTS' ? t('customers.coverageUnavailable') : t('customers.coverageUnknown')}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 break-words whitespace-normal leading-4">{cust.btsName || (cust.isCoverBts ? t('customers.btsAvailable') : t('customers.btsNameMissing'))}</div>
                    </td>

                    <td className="px-4 py-3.5 align-top">
                      <span className={`inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-semibold ${statusBadgeClass(cust.status)}`}>
                        {CUSTOMER_STATUS_LABEL[cust.status] ? t(CUSTOMER_STATUS_LABEL[cust.status]) : cust.status}
                      </span>
                      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 break-words whitespace-normal leading-4">{t('customers.lastCheck')}: {latestSession ? (CUSTOMER_CHECK_STATUS_LABEL[latestSession.verificationStatus] ? t(CUSTOMER_CHECK_STATUS_LABEL[latestSession.verificationStatus]) : 'In progress') : t('customers.noCheck')}</div>
                      <div className={`mt-1 text-[10px] font-medium break-words whitespace-normal leading-4 ${masterAddr?.isVerified || latestSession?.verificationStatus === 'LOCATION_VALID' ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('customers.locationStatus')}: {masterAddr?.isVerified || latestSession?.verificationStatus === 'LOCATION_VALID' ? t('customers.locationVerified') : t('customers.locationPending')}</div>
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
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.externalId')} <span className="font-normal text-gray-400">({t('customers.autoGenerated')})</span></label>
                  <input type="text" value={newCustExtId} disabled title={t('customers.idReadOnly')} className="w-full rounded-lg border border-gray-300 bg-gray-100 p-2 text-xs font-mono text-gray-500 disabled:cursor-not-allowed dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400" />
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
                      aria-label={t('customers.whatsappLabel')}
                      className="min-w-0 flex-1 bg-transparent p-2 text-xs font-mono text-gray-900 outline-none focus:ring-1 focus:ring-gray-900 dark:text-white dark:focus:ring-gray-400"
                    />
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-gray-500">{t('customers.countryCodeHelp')}</p>
                </div>
              </div>

              {editingCustomer && <div><label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.statusLabelText')}</label><select value={newCustStatus} onChange={(e) => setNewCustStatus(e.target.value as CustomerStatus)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs"><option value="ACTIVE">{t('customers.statusLabel.ACTIVE')}</option><option value="PENDING_INSTALLATION">{t('customers.statusLabel.PENDING_INSTALLATION')}</option><option value="VERIFIED">{t('customers.statusLabel.VERIFIED')}</option><option value="SUSPENDED">{t('customers.statusLabel.SUSPENDED')}</option></select></div>}

              <div>
                <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.street')} <span className="text-rose-600">*</span></label>
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
                {renderRegionField('province', t('customers.province'))}
                {renderRegionField('city', t('customers.city'))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                {renderRegionField('district', t('customers.district'))}
                {renderRegionField('subdistrict', t('customers.subdistrict'))}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                   <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.houseNumber')} <span className="text-rose-600">*</span></label>
                  <input
                    type="text"
                    required
                    placeholder="Contoh: 12 atau A-12"
                    value={newCustHouseNo}
                    onChange={(e) => setNewCustHouseNo(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                   />
                   <p className="mt-1 text-[10px] leading-4 text-gray-500">{t('customers.houseNumberHelp')}</p>
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.postalCode')} <span className="text-rose-600">*</span></label>
                  <input required inputMode="numeric" maxLength={5} pattern="[0-9]{5}" placeholder="Contoh: 11540" value={newCustPostalCode} onChange={(e) => setNewCustPostalCode(e.target.value)} className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-xs" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.addressDetail')} <span className="font-normal text-gray-400">({t('customers.optional')})</span></label>
                  <textarea rows={2} maxLength={1000} placeholder="Contoh: Blok A lantai 2, dekat pos satpam, sebelah minimarket" value={newCustAddressDetail} onChange={(e) => setNewCustAddressDetail(e.target.value)} className="w-full resize-y rounded-lg border border-gray-300 bg-white p-2 text-xs dark:border-gray-700 dark:bg-gray-800" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.referenceLatitude')} <span className="font-normal text-gray-400">({t('customers.optional')})</span></label>
                  <input
                    type="text"
                    placeholder="Contoh: -6.2088"
                    value={newCustLat}
                    onChange={(e) => setNewCustLat(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 dark:text-gray-300 font-medium mb-1">{t('customers.referenceLongitude')} <span className="font-normal text-gray-400">({t('customers.optional')})</span></label>
                  <input
                    type="text"
                    placeholder="Contoh: 106.8456"
                    value={newCustLng}
                    onChange={(e) => setNewCustLng(e.target.value)}
                    className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-xs font-mono focus:ring-1 focus:ring-gray-900 dark:focus:ring-gray-400 focus:border-gray-900 dark:focus:border-gray-400"
                  />
                </div>
              </div>
              <p className="text-[10px] leading-4 text-gray-500">{t('customers.coordinateHelp')}</p>

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

    </div>
  );
};
