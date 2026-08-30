import React, { useState, useEffect } from 'react';
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
import { CustomerVerificationView } from './components/customer/CustomerVerificationView';
import { BackendCustomerVerificationView } from './components/customer/BackendCustomerVerificationView';
import { WhatsAppSimulatorModal } from './components/common/WhatsAppSimulatorModal';
import { Compass, MessageSquare, Smartphone, X } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { currentAdmin, verificationSessions, customers, addresses, createVerificationSession } = useApp();

  const tokenFromLocation = () => {
    const queryToken = new URLSearchParams(window.location.search).get('token');
    if (queryToken) return queryToken;
    const pathMatch = window.location.pathname.match(/^\/v\/([^/]+)$/);
    return pathMatch ? decodeURIComponent(pathMatch[1]) : null;
  };
  const backendMode = import.meta.env.VITE_API_MODE === 'true';

  // Navigation State
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVerificationId, setSelectedVerificationId] = useState<string | null>(null);

  // Customer verification mobile simulation modal / drawer
  const initialCustomerToken = tokenFromLocation();
  const [activeCustomerToken, setActiveCustomerToken] = useState<string | null>(initialCustomerToken);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(Boolean(initialCustomerToken));

  // WhatsApp Simulator Modal
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppSimSessionId, setWhatsAppSimSessionId] = useState<string | null>(null);

  // Keep direct public verification links independent from admin authentication.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = tokenFromLocation();
    if (urlToken) {
      setActiveCustomerToken(urlToken);
      setIsCustomerModalOpen(true);
    }
  }, []);

  const handleOpenCustomerSimulator = (token: string) => {
    setActiveCustomerToken(token);
    setIsCustomerModalOpen(true);
  };

  const handleOpenWhatsAppModal = (sessionId?: string) => {
    const targetSessionId = sessionId || verificationSessions[0]?.id;
    if (targetSessionId) {
      setWhatsAppSimSessionId(targetSessionId);
      setIsWhatsAppModalOpen(true);
    }
  };

  const handleCreateNewSessionModal = async () => {
    const firstCust = customers[0];
    if (firstCust) {
      const custAddr = addresses.find((a) => a.customerId === firstCust.id) || addresses[0];
      if (custAddr) {
        const newSess = await createVerificationSession(firstCust.id, custAddr.id);
        setSelectedVerificationId(newSess.id);
        setCurrentTab('verifications');
      }
    }
  };

  const handleCreateVerificationForCustomer = async (customerId: string, addressId?: string) => {
    const targetAddr = addressId
      ? addresses.find((a) => a.id === addressId)
      : addresses.find((a) => a.customerId === customerId);

    if (targetAddr) {
      const newSess = await createVerificationSession(customerId, targetAddr.id);
      setSelectedVerificationId(newSess.id);
      setCurrentTab('verifications');
    }
  };

  // Customer links are public and do not require an Admin session.
  if (backendMode && !currentAdmin && activeCustomerToken) {
    return <BackendCustomerVerificationView token={activeCustomerToken} />;
  }

  if (!currentAdmin && activeCustomerToken) {
    return <CustomerVerificationView token={activeCustomerToken} />;
  }

  // Admin pages require authentication.
  if (!currentAdmin) {
    return <LoginView />;
  }

  // Render Admin View Content based on Tab & Selected Items
  const renderTabContent = () => {
    if (selectedVerificationId) {
      return (
        <VerificationDetailView
          sessionId={selectedVerificationId}
          onBack={() => setSelectedVerificationId(null)}
          onOpenCustomerSimulator={handleOpenCustomerSimulator}
        />
      );
    }

    if (selectedCustomerId) {
      return (
        <CustomerDetailView
          customerId={selectedCustomerId}
          onBack={() => setSelectedCustomerId(null)}
          onSelectVerification={(sessionId) => setSelectedVerificationId(sessionId)}
          onCreateVerification={(custId, addrId) =>
            handleCreateVerificationForCustomer(custId, addrId)
          }
          onOpenCustomerSimulator={handleOpenCustomerSimulator}
        />
      );
    }

    switch (currentTab) {
      case 'dashboard':
        return (
          <DashboardView
            onSelectVerification={(sessionId) => setSelectedVerificationId(sessionId)}
            onSelectCustomer={(custId) => setSelectedCustomerId(custId)}
            onCreateVerificationClick={handleCreateNewSessionModal}
            onOpenCustomerSimulator={handleOpenCustomerSimulator}
          />
        );

      case 'customers':
        return (
          <CustomerListView
            onSelectCustomer={(custId) => setSelectedCustomerId(custId)}
            onCreateVerificationForCustomer={(custId) =>
              handleCreateVerificationForCustomer(custId)
            }
          />
        );

      case 'verifications':
        return (
          <VerificationListView
            onSelectVerification={(sessionId) => setSelectedVerificationId(sessionId)}
            onOpenCustomerSimulator={handleOpenCustomerSimulator}
          />
        );

      case 'reminders':
        return (
          <RemindersView
            onSelectVerification={(sessionId) => setSelectedVerificationId(sessionId)}
            onOpenCustomerSimulator={handleOpenCustomerSimulator}
          />
        );

      case 'audit-logs':
        return <AuditLogsView />;

      case 'settings':
        return <ValidationSettingsView />;

      case 'integrations':
        return <IntegrationsView />;

      default:
        return (
          <DashboardView
            onSelectVerification={(sessionId) => setSelectedVerificationId(sessionId)}
            onSelectCustomer={(custId) => setSelectedCustomerId(custId)}
            onCreateVerificationClick={handleCreateNewSessionModal}
            onOpenCustomerSimulator={handleOpenCustomerSimulator}
          />
        );
    }
  };

  return (
    <>
      <AdminLayout
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        selectedCustomerId={selectedCustomerId}
        onSelectCustomer={setSelectedCustomerId}
        selectedVerificationId={selectedVerificationId}
        onSelectVerification={setSelectedVerificationId}
        onOpenCustomerSimulator={handleOpenCustomerSimulator}
      >
        {renderTabContent()}
      </AdminLayout>

      {/* Floating Quick Simulator Trigger Button */}
      <div className="fixed bottom-5 right-5 z-40 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => handleOpenWhatsAppModal()}
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white text-xs font-medium rounded-lg shadow-md border border-gray-700 transition-all hover:scale-105 active:scale-95"
          title="Buka Simulator WhatsApp"
        >
          <MessageSquare className="w-4 h-4 text-emerald-400" />
          <span>Simulasi Chat WhatsApp</span>
        </button>
      </div>

      {/* Mobile Customer Verification Screen Simulator Modal */}
      {isCustomerModalOpen && activeCustomerToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200 flex flex-col max-h-[95vh]">
            {/* Header bar of the simulation frame */}
            <div className="bg-white px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-gray-900 flex items-center justify-center text-white text-xs">
                  <Smartphone className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-900">Simulasi Web Pelanggan</div>
                  <div className="text-[10px] text-gray-500 font-mono truncate max-w-[200px]">
                    token: {activeCustomerToken}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-700 rounded-lg transition-colors"
                title="Tutup Simulasi"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customer Verification Component */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              <CustomerVerificationView
                token={activeCustomerToken}
                onExit={() => setIsCustomerModalOpen(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Simulator Modal */}
      {isWhatsAppModalOpen && (
        <WhatsAppSimulatorModal
          sessionId={whatsAppSimSessionId || verificationSessions[0]?.id}
          isOpen={isWhatsAppModalOpen}
          onClose={() => setIsWhatsAppModalOpen(false)}
          onOpenVerificationLink={(token) => {
            setIsWhatsAppModalOpen(false);
            handleOpenCustomerSimulator(token);
          }}
        />
      )}
    </>
  );
};

export function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}

export default App;
