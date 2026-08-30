import React, { useState } from 'react';
import {
  Activity,
  Bell,
  CheckCircle2,
  ChevronDown,
  Compass,
  FileCheck,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Moon,
  Radio,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Smartphone,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ThemeMode } from '../../types';
import { API_MODE } from '../../lib/apiClient';

export type AdminTab =
  | 'dashboard'
  | 'customers'
  | 'verifications'
  | 'reminders'
  | 'audit-logs'
  | 'settings'
  | 'integrations';

interface AdminLayoutProps {
  currentTab: AdminTab;
  onSelectTab: (tab: AdminTab) => void;
  selectedCustomerId?: string | null;
  onSelectCustomer?: (id: string | null) => void;
  selectedVerificationId?: string | null;
  onSelectVerification?: (id: string | null) => void;
  onOpenCustomerSimulator?: (token: string) => void;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onSelectCustomer,
  onSelectVerification,
  onOpenCustomerSimulator,
  children,
}) => {
  const {
    currentAdmin,
    logoutAdmin,
    verificationSessions,
    resetAllDataToDefault,
    theme,
    isDarkMode,
    setTheme,
    toggleTheme,
  } = useApp();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const pendingReviewsCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'MANUAL_REVIEW' || s.verificationStatus === 'CUSTOMER_DATA_MISMATCH'
  ).length;

  const validLocationsCount = verificationSessions.filter(
    (s) => s.verificationStatus === 'LOCATION_VALID'
  ).length;

  const navItems = [
    { id: 'dashboard' as AdminTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers' as AdminTab, label: 'Pelanggan & Alamat', icon: Users },
    {
      id: 'verifications' as AdminTab,
      label: 'Sesi Verifikasi',
      icon: Compass,
      badge: pendingReviewsCount > 0 ? pendingReviewsCount : undefined,
      badgeColor: 'bg-amber-500 text-white',
    },
    { id: 'reminders' as AdminTab, label: 'Pengingat (Reminders)', icon: Bell },
    { id: 'audit-logs' as AdminTab, label: 'Audit Trail', icon: History },
    { id: 'settings' as AdminTab, label: 'Aturan Validasi', icon: Settings },
    { id: 'integrations' as AdminTab, label: 'Outbox & Integrasi', icon: Radio },
  ];

  const handleNavClick = (tab: AdminTab) => {
    onSelectTab(tab);
    if (onSelectCustomer) onSelectCustomer(null);
    if (onSelectVerification) onSelectVerification(null);
    setMobileNavOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 px-4 lg:px-6 py-2.5 flex items-center justify-between">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="w-8 h-8 rounded-lg bg-gray-900 dark:bg-gray-800 dark:border dark:border-gray-700 flex items-center justify-center group-hover:bg-gray-800 dark:group-hover:bg-gray-700 transition-colors">
              <MapPin className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="font-semibold text-sm text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>Exact Location</span>
                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-mono px-1.5 py-0.5 rounded font-medium border border-gray-200 dark:border-gray-700">
                  v0.6 MVP
                </span>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:block">
                Customer &amp; Exact GPS Validation Portal
              </div>
            </div>
          </button>
        </div>

        {/* Center Live KPIs / Quick Status */}
        <div className="hidden xl:flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-gray-500 dark:text-gray-400">Verified Locations:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{validLocationsCount}</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">Needs Review:</span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{pendingReviewsCount}</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
            Radius: <span className="text-gray-900 dark:text-gray-200 font-semibold">50m</span> • Acc: <span className="text-gray-900 dark:text-gray-200 font-semibold">&le;30m</span>
          </div>
        </div>

        {/* Right User & RBAC Menu */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Quick WhatsApp / Verification Simulator launcher button */}
          <button
            type="button"
            onClick={() => {
              const activeSession = verificationSessions[0];
              if (activeSession && onOpenCustomerSimulator) {
                onOpenCustomerSimulator(activeSession.token);
              }
            }}
            disabled={!verificationSessions[0]?.token}
            className="hidden sm:inline-flex items-center gap-1.5 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 text-gray-700 dark:text-gray-200 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 shadow-xs transition-all"
            title="Buka tampilan mobile customer"
          >
            <Smartphone className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
            <span>Simulasi Web Pelanggan</span>
          </button>

          {/* Theme Toggle Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-xs font-medium"
              title={`Mode Tampilan: ${theme === 'dark' ? 'Gelap (Dark)' : theme === 'light' ? 'Terang (Light)' : 'Sistem'}`}
            >
              {isDarkMode ? (
                <Moon className="w-4 h-4 text-indigo-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span className="hidden md:inline capitalize text-[11px]">
                {theme === 'system' ? 'Auto' : theme}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {themeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1.5 z-50 text-xs animate-in fade-in">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  Tema Tampilan:
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    setThemeDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    theme === 'light'
                      ? 'text-amber-600 dark:text-amber-400 font-semibold bg-gray-50 dark:bg-gray-800'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                    <span>Terang (Light)</span>
                  </div>
                  {theme === 'light' && <CheckCircle2 className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTheme('dark');
                    setThemeDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    theme === 'dark'
                      ? 'text-indigo-600 dark:text-indigo-400 font-semibold bg-gray-50 dark:bg-gray-800'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Moon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Gelap (Dark)</span>
                  </div>
                  {theme === 'dark' && <CheckCircle2 className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setTheme('system');
                    setThemeDropdownOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                    theme === 'system'
                      ? 'text-gray-900 dark:text-white font-semibold bg-gray-50 dark:bg-gray-800'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 flex items-center justify-center font-mono text-[10px] border border-gray-400 rounded">
                      S
                    </span>
                    <span>Sistem (Auto)</span>
                  </div>
                  {theme === 'system' && <CheckCircle2 className="w-3 h-3 text-gray-900 dark:text-white" />}
                </button>
              </div>
            )}
          </div>

          {/* Reset Demo Data Button (demo-only, restricted to Super Admin) */}
          {!API_MODE && currentAdmin?.role === 'SUPER_ADMIN' && <button
            type="button"
            onClick={() => {
              if (confirm('Reset seluruh data ke kondisi awal PRD?')) {
                resetAllDataToDefault();
              }
            }}
            className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
            title="Reset Database ke Seed Awal"
          >
            <RotateCcw className="w-4 h-4" />
          </button>}

          {/* User Role Badge & Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs transition-colors"
            >
              <div className="w-6 h-6 rounded bg-gray-900 dark:bg-gray-700 flex items-center justify-center font-medium text-[11px] text-white">
                {currentAdmin?.name.charAt(0) || 'A'}
              </div>
              <div className="hidden md:block text-left">
                <div className="font-semibold text-gray-900 dark:text-white leading-tight">{currentAdmin?.name}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 font-mono">{currentAdmin?.role}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            </button>

            {roleDropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-2 z-50 text-xs">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <div className="font-semibold text-gray-900 dark:text-white">{currentAdmin?.name}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400">{currentAdmin?.email}</div>
                  <div className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">{currentAdmin?.department}</div>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      logoutAdmin();
                      setRoleDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Keluar Sesi (Logout)</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout Container with Sidebar & Content */}
      <div className="flex-1 flex flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-3 flex md:flex-col justify-between flex-shrink-0">
          <nav className="space-y-1 w-full flex md:flex-col overflow-x-auto md:overflow-visible gap-1 md:gap-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-gray-900 dark:bg-gray-800 text-white font-semibold shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        item.badgeColor || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer Info */}
          <div className="hidden md:block pt-4 border-t border-gray-100 dark:border-gray-800 px-2 text-[11px] text-gray-500 dark:text-gray-400 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <span>Auth: Better Auth</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">Online</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>Spatial: PostGIS</span>
              <span className="text-gray-900 dark:text-gray-200 font-medium">Ready</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>Theme</span>
              <button
                type="button"
                onClick={toggleTheme}
                className="text-gray-700 dark:text-gray-300 hover:underline flex items-center gap-1 font-mono cursor-pointer"
              >
                {isDarkMode ? '🌙 Dark' : '☀️ Light'}
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 bg-gray-50 dark:bg-gray-950 p-4 lg:p-6 overflow-y-auto transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};
