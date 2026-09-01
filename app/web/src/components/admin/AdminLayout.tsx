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
  Megaphone,
  Moon,
  Radio,
  Search,
  Settings,
  Shield,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ThemeMode } from '../../types';
import { useTranslation } from '../../i18n';
import { LanguageSwitcher } from '../common/LanguageSwitcher';

export type AdminTab =
  | 'dashboard'
  | 'customers'
  | 'campaigns'
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
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onSelectCustomer,
  onSelectVerification,
  children,
}) => {
  const {
    currentAdmin,
    logoutAdmin,
    dashboardSummary,
    validationConfig,
    theme,
    isDarkMode,
    setTheme,
    toggleTheme,
  } = useApp();
  const { t } = useTranslation();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const pendingReviewsCount = dashboardSummary.verifications.manualReview
    + (dashboardSummary.verifications.statusCounts.CUSTOMER_DATA_MISMATCH ?? 0);
  const validLocationsCount = dashboardSummary.verifications.locationValid;

  const navItems = [
    { id: 'dashboard' as AdminTab, label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'customers' as AdminTab, label: t('nav.customers'), icon: Users },
    { id: 'campaigns' as AdminTab, label: t('nav.campaigns'), icon: Megaphone },
    {
      id: 'verifications' as AdminTab,
      label: t('nav.verifications'),
      icon: Compass,
      badge: pendingReviewsCount > 0 ? pendingReviewsCount : undefined,
      badgeColor: 'bg-amber-500 text-white',
    },
    { id: 'reminders' as AdminTab, label: t('nav.reminders'), icon: Bell },
    { id: 'audit-logs' as AdminTab, label: t('nav.auditLogs'), icon: History },
    { id: 'settings' as AdminTab, label: t('nav.validationRules'), icon: Settings },
    { id: 'integrations' as AdminTab, label: t('nav.integrations'), icon: Radio },
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
      <header className="h-16 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30 px-4 lg:px-6 py-2.5 flex items-center justify-between">
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
                <span>IRA Preregist</span>
                <span className="bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[10px] font-mono px-1.5 py-0.5 rounded font-medium border border-gray-200 dark:border-gray-700">
                  v0.6 MVP
                </span>
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400 hidden sm:block">
                Customer &amp; GPS Validation Portal
              </div>
            </div>
          </button>
        </div>

        {/* Center Live KPIs / Quick Status */}
        <div className="hidden xl:flex items-center gap-3 bg-gray-50 dark:bg-gray-800/60 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-gray-500 dark:text-gray-400">{t('shell.verifiedLocations')}:</span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">{validLocationsCount}</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">{t('shell.needsReview')}:</span>
            <span className="font-semibold text-amber-700 dark:text-amber-400">{pendingReviewsCount}</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <div className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
            {t('shell.radius')}: <span className="text-gray-900 dark:text-gray-200 font-semibold">{validationConfig.HOME_RADIUS_METERS}m</span> • {t('shell.accuracy')}: <span className="text-gray-900 dark:text-gray-200 font-semibold">&le;{validationConfig.GPS_MAX_ACCURACY_METERS}m</span>
          </div>
        </div>

        {/* Right User & RBAC Menu */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* Theme Toggle Button */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setThemeDropdownOpen(!themeDropdownOpen)}
              className="p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-xs font-medium"
              title={`${t('shell.theme')}: ${theme === 'dark' ? t('shell.dark') : theme === 'light' ? t('shell.light') : t('shell.system')}`}
            >
              {isDarkMode ? (
                <Moon className="w-4 h-4 text-indigo-400" />
              ) : (
                <Sun className="w-4 h-4 text-amber-500" />
              )}
              <span className="hidden md:inline capitalize text-[11px]">
                {theme === 'system' ? t('shell.system') : theme === 'dark' ? t('shell.dark') : t('shell.light')}
              </span>
              <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {themeDropdownOpen && (
              <div className="absolute right-0 mt-2 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1.5 z-50 text-xs animate-in fade-in">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {t('shell.theme')}:
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
                    <span>{t('shell.light')}</span>
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
                    <span>{t('shell.dark')}</span>
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
                    <span>{t('shell.system')}</span>
                  </div>
                  {theme === 'system' && <CheckCircle2 className="w-3 h-3 text-gray-900 dark:text-white" />}
                </button>
              </div>
            )}
          </div>

          <LanguageSwitcher compact />

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
                    <span>{t('shell.logout')}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Layout Container with Sidebar & Content */}
      <div className="flex-1 flex flex-col md:flex-row md:pl-64">
        {/* Sidebar Navigation */}
        <aside className="w-full md:fixed md:left-0 md:top-16 md:bottom-0 md:z-20 md:w-64 md:overflow-y-auto bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-3 flex md:flex-col justify-between flex-shrink-0">
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
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t('shell.online')}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>Spatial: PostGIS</span>
              <span className="text-gray-900 dark:text-gray-200 font-medium">{t('shell.ready')}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>{t('shell.theme')}</span>
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
        <main className="min-w-0 min-h-[calc(100vh-4rem)] flex-1 bg-gray-50 dark:bg-gray-950 p-4 lg:p-6 overflow-y-auto transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};
