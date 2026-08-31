import React, { useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { LoginView } from './components/auth/LoginView';
import { AdminLayout, AdminTab } from './components/admin/AdminLayout';
import { DashboardView } from './components/admin/DashboardView';
import { CustomerListView } from './components/admin/CustomerListView';
import { CustomerDetailView } from './components/admin/CustomerDetailView';
import { VerificationListView } from './components/admin/VerificationListView';
import { VerificationDetailView } from './components/admin/VerificationDetailView';
import { ValidationSettingsView } from './components/admin/ValidationSettingsView';
import { AuditLogsView } from './components/admin/AuditLogsView';
import { RemindersView } from './components/admin/RemindersView';
import { IntegrationsView } from './components/admin/IntegrationsView';
import { BackendCustomerVerificationView } from './components/customer/BackendCustomerVerificationView';
import { CampaignsView } from './components/admin/CampaignsView';

const MainAppContent: React.FC = () => {
  const { currentAdmin, customers, addresses, createVerificationSession, loadCustomerDetail } = useApp();
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const tokenMatch = window.location.pathname.match(/^\/v\/([^/]+)$/);
  const customerToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;

  useEffect(() => {
    document.title = customerToken ? 'Verifikasi Lokasi' : 'Exact Location Ops';
  }, [customerToken]);

  if (customerToken) return <BackendCustomerVerificationView token={customerToken} />;
  if (!currentAdmin) return <LoginView />;

  const createVerificationForCustomer = async (customerId: string, addressId?: string) => {
    let address = addressId ? addresses.find((item) => item.id === addressId) : addresses.find((item) => item.customerId === customerId && item.isActive);
    if (!address) {
      const detail = await loadCustomerDetail(customerId);
      address = addressId ? detail.addresses.find((item) => item.id === addressId) : detail.addresses.find((item) => item.isActive);
    }
    if (!address) return;
    const session = await createVerificationSession(customerId, address.id);
    setSelectedVerificationId(session.id);
    setCurrentTab('verifications');
  };
  const selectCustomer = async (customerId: string) => {
    try {
      await loadCustomerDetail(customerId);
      setSelectedCustomerId(customerId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Detail pelanggan gagal dimuat.');
    }
  };

  const renderTabContent = () => {
    if (selectedVerificationId) return <VerificationDetailView sessionId={selectedVerificationId} onBack={() => setSelectedVerificationId(null)} />;
    if (selectedCustomerId) return <CustomerDetailView customerId={selectedCustomerId} onBack={() => setSelectedCustomerId(null)} onSelectVerification={setSelectedVerificationId} onCreateVerification={createVerificationForCustomer} />;
    if (currentTab === 'dashboard') return <DashboardView onSelectVerification={setSelectedVerificationId} onNavigate={setCurrentTab} onCreateVerificationClick={() => { const customer = customers[0]; if (customer) void createVerificationForCustomer(customer.id, customer.activeAddress?.id); }} />;
    if (currentTab === 'customers') return <CustomerListView onSelectCustomer={(customerId) => void selectCustomer(customerId)} onCreateVerificationForCustomer={(customerId, addressId) => void createVerificationForCustomer(customerId, addressId)} />;
    if (currentTab === 'campaigns') return <CampaignsView />;
    if (currentTab === 'verifications') return <VerificationListView onSelectVerification={setSelectedVerificationId} />;
    if (currentTab === 'reminders') return <RemindersView onSelectVerification={setSelectedVerificationId} />;
    if (currentTab === 'audit-logs') return <AuditLogsView />;
    if (currentTab === 'settings') return <ValidationSettingsView />;
    if (currentTab === 'integrations') return <IntegrationsView />;
    return <DashboardView onSelectVerification={setSelectedVerificationId} onNavigate={setCurrentTab} onCreateVerificationClick={() => undefined} />;
  };

  return <AdminLayout currentTab={currentTab} onSelectTab={setCurrentTab} selectedCustomerId={selectedCustomerId} onSelectCustomer={setSelectedCustomerId} selectedVerificationId={selectedVerificationId} onSelectVerification={setSelectedVerificationId}>{renderTabContent()}</AdminLayout>;
};

export default function App() {
  return <AppProvider><MainAppContent /></AppProvider>;
}
