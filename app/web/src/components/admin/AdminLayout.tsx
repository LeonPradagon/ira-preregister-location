import React, { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  Compass,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  Moon,
  Radio,
  Settings,
  Sun,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';

export type AdminTab =
  | 'dashboard'
  | 'customers'
  | 'campaigns'
  | 'verifications'
  | 'reminders'
  | 'audit-logs'
  | 'settings'
  | 'integrations'
  | 'users';

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
  const { currentAdmin, logoutAdmin, dashboardSummary, validationConfig, theme, isDarkMode, setTheme, toggleTheme } =
    useApp();
  const { t } = useTranslation();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const pendingReviewsCount =
    dashboardSummary.verifications.manualReview +
    (dashboardSummary.verifications.statusCounts.CUSTOMER_DATA_MISMATCH ?? 0);
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
  if (currentAdmin?.role === 'SUPER_ADMIN') navItems.push({ id: 'users', label: t('nav.users'), icon: UserCog });

  const handleNavClick = (tab: AdminTab) => {
    onSelectTab(tab);
    if (onSelectCustomer) onSelectCustomer(null);
    if (onSelectVerification) onSelectVerification(null);
    setMobileNavOpen(false);
  };

  return (
    <div className="admin-theme min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header className="h-16 flex-shrink-0 bg-white dark:bg-gray-900 border-b border-red-100 dark:border-gray-800 sticky top-0 z-30 px-4 lg:px-6 py-2.5 flex items-center justify-between">
        {/* Left Branding */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
            aria-label={mobileNavOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => handleNavClick('dashboard')}
            className="flex items-center gap-2.5 text-left group"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-[#d71920] p-0.5 shadow-sm transition-transform group-hover:scale-[1.03] dark:border-red-900/60">
              <img src="/ira-logo-hd.png?v=3" alt="IRA" className="h-full w-full rounded-[0.65rem] object-contain" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-bold tracking-tight text-[#b8171d] dark:text-red-300">
                IRA Preregist
              </div>
              <div className="mt-0.5 hidden truncate text-[10px] font-medium text-gray-500 dark:text-gray-400 sm:block">
                {t('shell.navSubtitle')}
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
            {t('shell.radius')}:{' '}
            <span className="text-gray-900 dark:text-gray-200 font-semibold">
              {validationConfig.HOME_RADIUS_METERS}m
            </span>{' '}
            • {t('shell.accuracy')}:{' '}
            <span className="text-gray-900 dark:text-gray-200 font-semibold">
              &le;{validationConfig.GPS_MAX_ACCURACY_METERS}m
            </span>
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
              {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
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

          {/* User Role Badge & Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
              className="flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-red-100 dark:border-gray-700 text-xs transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-[#d71920] dark:bg-[#b8171d] flex items-center justify-center font-medium text-[11px] text-white shadow-sm">
                {currentAdmin?.name.charAt(0) || 'A'}
              </div>
              <div className="hidden md:block text-left">
                <div className="font-semibold text-gray-900 dark:text-white leading-tight">{currentAdmin?.name}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  {t(`users.role.${currentAdmin?.role || 'VIEWER'}`)}
                </div>
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

                {currentAdmin?.role === 'SUPER_ADMIN' && (
                  <button
                    type="button"
                    onClick={() => {
                      handleNavClick('users');
                      setRoleDropdownOpen(false);
                    }}
                    className="w-full px-3 py-2 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                    <span>{t('nav.users')}</span>
                  </button>
                )}

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
        <aside
          className={`${mobileNavOpen ? 'fixed inset-x-0 top-16 z-40 flex max-h-[calc(100vh-4rem)]' : 'hidden md:flex'} w-full md:fixed md:left-0 md:top-16 md:bottom-0 md:z-20 md:w-64 md:overflow-y-auto bg-white dark:bg-gray-900 border-r border-red-100 dark:border-gray-800 p-3 md:flex-col justify-between flex-shrink-0`}
        >
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
                      ? 'bg-[#d71920] dark:bg-[#b8171d] text-white font-semibold shadow-xs'
                      : 'text-gray-600 dark:text-gray-300 hover:text-[#b8171d] dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30'
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
              <span>Keamanan akun</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">{t('shell.online')}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span>Penyimpanan lokasi</span>
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
        {mobileNavOpen && (
          <button
            type="button"
            aria-label="Tutup menu navigasi"
            onClick={() => setMobileNavOpen(false)}
            className="fixed inset-0 top-16 z-30 bg-slate-950/30 md:hidden"
          />
        )}

        {/* Main Content Area */}
        <main className="min-w-0 min-h-[calc(100vh-4rem)] flex-1 bg-[#fffafa] dark:bg-gray-950 p-4 lg:p-6 overflow-y-auto transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};
