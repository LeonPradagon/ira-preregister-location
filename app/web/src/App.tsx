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
import { I18nProvider, useTranslation } from './i18n';

const MainAppContent: React.FC = () => {
  const { currentAdmin, loadCustomerDetail } = useApp();
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const tokenMatch = window.location.pathname.match(/^\/v\/([^/]+)$/);
  const customerToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
  const simulationRoute = Boolean(customerToken?.startsWith('simulasi-'));

  useEffect(() => {
    document.title = customerToken ? t('app.customerVerification') : t('app.opsTitle');
  }, [customerToken, t]);

  if (customerToken) return <BackendCustomerVerificationView token={customerToken} simulation={simulationRoute} />;
  if (!currentAdmin) return <LoginView />;

  const selectCustomer = async (customerId: string, alreadyLoaded = false) => {
    if (alreadyLoaded) {
      setSelectedCustomerId(customerId);
      return;
    }
    try {
      await loadCustomerDetail(customerId);
      setSelectedCustomerId(customerId);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : t('customer.requestFailed'));
    }
  };

  const renderTabContent = () => {
    if (selectedVerificationId) return <VerificationDetailView sessionId={selectedVerificationId} onBack={() => setSelectedVerificationId(null)} />;
    if (selectedCustomerId) return <CustomerDetailView customerId={selectedCustomerId} onBack={() => setSelectedCustomerId(null)} onSelectVerification={setSelectedVerificationId} />;
    if (currentTab === 'dashboard') return <DashboardView onSelectVerification={setSelectedVerificationId} onNavigate={setCurrentTab} />;
    if (currentTab === 'customers') return <CustomerListView onSelectCustomer={(customerId, alreadyLoaded) => void selectCustomer(customerId, alreadyLoaded)} />;
    if (currentTab === 'campaigns') return <CampaignsView />;
    if (currentTab === 'verifications') return <VerificationListView onSelectVerification={setSelectedVerificationId} />;
    if (currentTab === 'reminders') return <RemindersView onSelectVerification={setSelectedVerificationId} />;
    if (currentTab === 'audit-logs') return <AuditLogsView />;
    if (currentTab === 'settings') return <ValidationSettingsView />;
    if (currentTab === 'integrations') return <IntegrationsView />;
    return <DashboardView onSelectVerification={setSelectedVerificationId} onNavigate={setCurrentTab} />;
  };

  return <AdminLayout currentTab={currentTab} onSelectTab={setCurrentTab} selectedCustomerId={selectedCustomerId} onSelectCustomer={setSelectedCustomerId} selectedVerificationId={selectedVerificationId} onSelectVerification={setSelectedVerificationId}>{renderTabContent()}</AdminLayout>;
};

export default function App() {
  const customerRoute = /^\/v\//.test(window.location.pathname);
  return <I18nProvider defaultLanguage={customerRoute ? 'id' : undefined}><AppProvider><MainAppContent /></AppProvider></I18nProvider>;
}
