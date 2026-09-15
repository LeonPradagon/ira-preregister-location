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
import { MonitoringView } from './components/admin/MonitoringView';
import { UserManagementView } from './components/admin/UserManagementView';
import { I18nProvider, useTranslation } from './i18n';
import { showActionError } from './lib/swal';

const MainAppContent: React.FC = () => {
  const { currentAdmin, loadCustomerDetail } = useApp();
  const { t } = useTranslation();
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [visitedTabs, setVisitedTabs] = useState<AdminTab[]>(['dashboard']);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);
  const tokenMatch = window.location.pathname.match(/^\/(?:v|s)\/([^/]+)$/);
  const customerToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
  const simulationRoute = Boolean(customerToken?.startsWith('simulasi-'));

  useEffect(() => {
    document.title = customerToken ? t('app.customerVerification') : t('app.opsTitle');
  }, [customerToken, t]);

  useEffect(() => {
    setVisitedTabs((tabs) => (tabs.includes(currentTab) ? tabs : [...tabs, currentTab]));
  }, [currentTab]);

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
      void showActionError(t('crud.error'), error instanceof Error ? error.message : t('customer.requestFailed'));
    }
  };

  const renderBaseTabContent = () => {
    const tabViews: Array<[AdminTab, React.ReactNode]> = [
      ['dashboard', <DashboardView onSelectVerification={setSelectedVerificationId} onNavigate={setCurrentTab} />],
      [
        'customers',
        <CustomerListView
          onSelectCustomer={(customerId, alreadyLoaded) => void selectCustomer(customerId, alreadyLoaded)}
        />,
      ],
      ['campaigns', <CampaignsView />],
      ['monitoring', <MonitoringView />],
      ['verifications', <VerificationListView onSelectVerification={setSelectedVerificationId} />],
      ['reminders', <RemindersView onSelectVerification={setSelectedVerificationId} />],
      ['audit-logs', <AuditLogsView />],
      ['settings', <ValidationSettingsView />],
      ['integrations', <IntegrationsView />],
      ['users', <UserManagementView />],
    ];
    const detailOpen = Boolean(selectedCustomerId || selectedVerificationId);
    return tabViews
      .filter(([tab]) => visitedTabs.includes(tab))
      .map(([tab, content]) => (
      <div key={tab} className={currentTab === tab && !detailOpen ? '' : 'hidden'}>
        {content}
      </div>
      ));
  };

  const renderTabContent = () => {
    const detailOpen = Boolean(selectedCustomerId || selectedVerificationId);
    return (
      <>
        <div className={detailOpen ? 'hidden' : ''}>{renderBaseTabContent()}</div>
        {selectedCustomerId && (
          <div className={selectedVerificationId ? 'hidden' : ''}>
            <CustomerDetailView
              customerId={selectedCustomerId}
              onBack={() => setSelectedCustomerId(null)}
              onSelectVerification={setSelectedVerificationId}
            />
          </div>
        )}
        {selectedVerificationId && (
          <VerificationDetailView
            sessionId={selectedVerificationId}
            onBack={() => setSelectedVerificationId(null)}
            onRestart={(newSessionId) => setSelectedVerificationId(newSessionId)}
          />
        )}
      </>
    );
  };

  return (
    <AdminLayout
      currentTab={currentTab}
      onSelectTab={setCurrentTab}
      selectedCustomerId={selectedCustomerId}
      onSelectCustomer={setSelectedCustomerId}
      selectedVerificationId={selectedVerificationId}
      onSelectVerification={setSelectedVerificationId}
    >
      {renderTabContent()}
    </AdminLayout>
  );
};

export default function App() {
  const customerRoute = /^\/(?:v|s)\//.test(window.location.pathname);
  return (
    <I18nProvider defaultLanguage={customerRoute ? 'id' : 'en'}>
      <AppProvider>
        <MainAppContent />
      </AppProvider>
    </I18nProvider>
  );
}
