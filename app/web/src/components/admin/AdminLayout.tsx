import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Compass,
  Cpu,
  HardDrive,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Megaphone,
  MemoryStick,
  Moon,
  RefreshCw,
  Settings,
  Sun,
  Ticket,
  type LucideIcon,
  UserCog,
  Users,
  Wifi,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTranslation } from '../../i18n';

export type AdminTab =
  | 'dashboard'
  | 'customers'
  | 'campaigns'
  | 'monitoring'
  | 'verifications'
  | 'reminders'
  | 'audit-logs'
  | 'settings'
  | 'integrations'
  | 'coverage'
  | 'ticketing'
  | 'ticketing-status'
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

interface AdminNavItem {
  id: AdminTab;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeColor?: string;
}

interface AdminNavGroup {
  id: string;
  label: string;
  items: AdminNavItem[];
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  currentTab,
  onSelectTab,
  onSelectCustomer,
  onSelectVerification,
  children,
}) => {
  const { currentAdmin, logoutAdmin, dashboardSummary, theme, isDarkMode, setTheme, validationConfig } = useApp();
  const { t } = useTranslation();
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Accordion behavior: undefined follows the active tab, null means all
  // groups are intentionally collapsed, and a group id is the only open one.
  const [openNavGroupId, setOpenNavGroupId] = useState<string | null | undefined>(undefined);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [systemMetrics, setSystemMetrics] = useState({
    cpuCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null,
    memoryUsed: null as number | null,
    memoryTotal: null as number | null,
    storageUsed: null as number | null,
    storageTotal: null as number | null,
  });

  const pendingReviewsCount =
    dashboardSummary.verifications.manualReview +
    (dashboardSummary.verifications.statusCounts.CUSTOMER_DATA_MISMATCH ?? 0);

  useEffect(() => {
    if (!themeDropdownOpen && !roleDropdownOpen) return undefined;

    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (themeMenuRef.current?.contains(target) || profileMenuRef.current?.contains(target)) return;
      setThemeDropdownOpen(false);
      setRoleDropdownOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setThemeDropdownOpen(false);
      setRoleDropdownOpen(false);
    };

    document.addEventListener('pointerdown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [roleDropdownOpen, themeDropdownOpen]);

  useEffect(() => {
    let active = true;

    const readSystemMetrics = async () => {
      const browserPerformance =
        typeof performance !== 'undefined'
          ? (performance as Performance & {
              memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
            })
          : undefined;
      let storage: StorageEstimate | undefined;
      try {
        storage =
          typeof navigator !== 'undefined' && navigator.storage?.estimate
            ? await navigator.storage.estimate()
            : undefined;
      } catch {
        storage = undefined;
      }

      if (!active) return;
      setSystemMetrics({
        cpuCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || null : null,
        memoryUsed: browserPerformance?.memory?.usedJSHeapSize ?? null,
        memoryTotal: browserPerformance?.memory?.jsHeapSizeLimit ?? null,
        storageUsed: storage?.usage ?? null,
        storageTotal: storage?.quota ?? null,
      });
    };

    void readSystemMetrics();
    const refreshTimer = window.setInterval(() => void readSystemMetrics(), 30_000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const navGroups: AdminNavGroup[] = [
    {
      id: 'overview',
      label: t('nav.groupOverview'),
      items: [{ id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard }],
    },
    {
      id: 'operations',
      label: t('nav.groupOperations'),
      items: [
        { id: 'customers', label: t('nav.customers'), icon: Users },
        {
          id: 'verifications',
          label: t('nav.verifications'),
          icon: Compass,
          badge: pendingReviewsCount > 0 ? pendingReviewsCount : undefined,
          badgeColor: 'bg-amber-500 text-white',
        },
        { id: 'coverage', label: t('nav.coverageCheck'), icon: Wifi },
        ...(validationConfig.ENABLE_TICKETING
          ? [
              { id: 'ticketing' as const, label: 'Ticketing', icon: Ticket },
              { id: 'ticketing-status' as const, label: 'Status Provider Ticketing', icon: RefreshCw },
            ]
          : []),
      ],
    },
    {
      id: 'messaging',
      label: t('nav.groupMessaging'),
      items: [
        { id: 'monitoring', label: t('nav.monitoring'), icon: BarChart3 },
        { id: 'campaigns', label: t('nav.campaigns'), icon: Megaphone },
        { id: 'reminders', label: t('nav.reminders'), icon: Bell },
      ],
    },
    {
      id: 'system',
      label: t('nav.groupSystem'),
      items: [
        { id: 'audit-logs', label: t('nav.auditLogs'), icon: History },
        { id: 'settings', label: t('nav.validationRules'), icon: Settings },
      ],
    },
  ];
  if (currentAdmin?.role === 'SUPER_ADMIN')
    navGroups[3].items.push({ id: 'users', label: t('nav.users'), icon: UserCog });

  const handleNavClick = (tab: AdminTab) => {
    onSelectTab(tab);
    if (onSelectCustomer) onSelectCustomer(null);
    if (onSelectVerification) onSelectVerification(null);
    const parentGroup = navGroups.find((group) => group.items.some((item) => item.id === tab));
    setOpenNavGroupId(parentGroup?.id ?? null);
    setMobileNavOpen(false);
  };
  const toggleNavGroup = (groupId: string) => setOpenNavGroupId((current) => (current === groupId ? null : groupId));
  const toggleSidebar = () => {
    setSidebarCollapsed((collapsed) => !collapsed);
    setOpenNavGroupId(null);
  };
  const navbarOffsetClass = sidebarCollapsed ? 'md:left-20' : 'md:left-64';
  const formatBytes = (bytes: number | null) => {
    if (bytes === null || !Number.isFinite(bytes)) return '—';
    if (bytes < 1024 * 1024) return `${Math.max(bytes / 1024, 0.1).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };
  const formatCompactBytes = (bytes: number | null) => formatBytes(bytes).replace(' ', '');
  const remainingBytes = (total: number | null, used: number | null) =>
    total !== null && used !== null ? Math.max(total - used, 0) : null;
  const usagePercent = (used: number | null, total: number | null) =>
    used !== null && total !== null && total > 0 ? Math.min(Math.round((used / total) * 100), 100) : null;

  return (
    <div className="admin-theme coreui-shell min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Navbar */}
      <header
        className={`header header-sticky coreui-header fixed left-0 right-0 top-0 z-50 h-16 border-b border-red-100 bg-white px-4 py-2.5 dark:border-gray-800 dark:bg-gray-900 lg:px-6 ${navbarOffsetClass} flex items-center justify-between`}
      >
        {/* Navigation Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileNavOpen((open) => !open)}
            className="header-toggler inline-flex items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 md:hidden"
            aria-label={mobileNavOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={toggleSidebar}
            className="header-toggler hidden items-center justify-center rounded-lg border border-gray-200 p-2 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 md:inline-flex"
            aria-label={sidebarCollapsed ? 'Perlebar sidebar' : 'Ciutkan sidebar'}
            title={sidebarCollapsed ? 'Perlebar sidebar' : 'Ciutkan sidebar'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden border-l border-gray-200 pl-4 text-sm font-semibold text-gray-700 dark:border-gray-700 dark:text-gray-200 lg:block">
            {navGroups.flatMap((group) => group.items).find((item) => item.id === currentTab)?.label ?? 'Dashboard'}
          </div>
        </div>

        {/* Right User & RBAC Menu */}
        <div className="header-nav flex items-center gap-2 sm:gap-2.5">
          {/* Theme Toggle Button */}
          <div ref={themeMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setThemeDropdownOpen((open) => !open);
                setRoleDropdownOpen(false);
              }}
              aria-expanded={themeDropdownOpen}
              aria-haspopup="menu"
              className="coreui-header-action nav-link p-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors border border-gray-200 dark:border-gray-700 flex items-center gap-1.5 text-xs font-medium"
              title={`${t('shell.theme')}: ${theme === 'dark' ? t('shell.dark') : theme === 'light' ? t('shell.light') : t('shell.system')}`}
            >
              {isDarkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
            </button>

            {themeDropdownOpen && (
              <div className="dropdown-menu dropdown-menu-end show coreui-menu absolute right-0 mt-2 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-1.5 z-50 text-xs animate-in fade-in">
                <div className="px-2.5 py-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                  {t('shell.theme')}:
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setTheme('light');
                    setThemeDropdownOpen(false);
                  }}
                  className={`dropdown-item w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
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
                  className={`dropdown-item w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
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
                  className={`dropdown-item w-full px-2.5 py-1.5 text-left flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
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
          <div ref={profileMenuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setRoleDropdownOpen((open) => !open);
                setThemeDropdownOpen(false);
              }}
              aria-expanded={roleDropdownOpen}
              aria-haspopup="menu"
              className="coreui-profile-trigger nav-link flex items-center gap-2 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-950/30 p-1.5 sm:px-3 sm:py-1.5 rounded-lg border border-red-100 dark:border-gray-700 text-xs transition-colors"
            >
              <div className="coreui-avatar w-6 h-6 rounded-md bg-[#d71920] dark:bg-[#b8171d] flex items-center justify-center font-medium text-[11px] text-white shadow-sm">
                {currentAdmin?.name.charAt(0) || 'A'}
              </div>
            </button>

            {roleDropdownOpen && (
              <div className="dropdown-menu dropdown-menu-end show coreui-menu absolute right-0 mt-2 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-lg py-2 z-50 text-xs">
                <div className="dropdown-header px-3 py-2 border-b border-gray-100 dark:border-gray-800">
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
                    className="dropdown-item w-full px-3 py-2 text-left text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center gap-2"
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
                    className="dropdown-item w-full px-3 py-2 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center gap-2"
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
      <div className={`flex flex-1 flex-col pt-16 md:flex-row ${sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'}`}>
        {/* Sidebar Navigation */}
        <aside
          className={`sidebar sidebar-dark sidebar-fixed coreui-sidebar ${sidebarCollapsed && !mobileNavOpen ? 'coreui-sidebar-collapsed' : ''} ${mobileNavOpen ? 'fixed inset-x-0 top-16 z-40 flex max-h-[calc(100vh-4rem)]' : 'hidden md:flex'} w-full flex-shrink-0 flex-col justify-between border-r border-red-100 bg-white p-3 dark:border-gray-800 dark:bg-gray-900 md:fixed md:bottom-0 md:left-0 md:top-0 md:z-40 ${sidebarCollapsed ? 'md:w-20' : 'md:w-64'} md:overflow-y-auto`}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-12 items-center gap-2 border-b border-red-100 pb-3 dark:border-gray-800">
              <button
                type="button"
                onClick={() => handleNavClick('dashboard')}
                className="coreui-brand-button group flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-red-200 bg-[#d71920] p-0.5 shadow-sm transition-transform group-hover:scale-[1.03] dark:border-red-900/60">
                  <img
                    src="/ira-logo-hd.png?v=3"
                    alt="IRA - Internet Rakyat"
                    className="h-full w-full rounded-[0.65rem] object-contain"
                  />
                </div>
                <div className="coreui-brand-copy min-w-0 leading-tight">
                  <div className="truncate text-sm font-bold tracking-tight text-[#b8171d] dark:text-red-300">
                    IRA - Internet Rakyat
                  </div>
                  {/* <div className="mt-0.5 hidden truncate text-[10px] font-medium text-gray-500 dark:text-gray-400 sm:block">
                    {t('shell.navSubtitle')}
                  </div> */}
                </div>
              </button>
            </div>
            <nav className="sidebar-nav min-h-0 w-full flex-1 space-y-4 overflow-y-auto pt-3">
              {navGroups.map((group) => {
                const groupOpen =
                  !sidebarCollapsed &&
                  (openNavGroupId === undefined
                    ? group.items.some((item) => currentTab === item.id)
                    : openNavGroupId === group.id);
                const GroupIcon =
                  group.id === 'overview'
                    ? LayoutDashboard
                    : group.id === 'operations'
                      ? Compass
                      : group.id === 'messaging'
                        ? Megaphone
                        : Settings;
                return (
                  <div key={group.id} className={`nav-group space-y-1 ${groupOpen ? 'show' : ''}`}>
                    <button
                      type="button"
                      aria-expanded={groupOpen}
                      title={sidebarCollapsed ? group.label : undefined}
                      onClick={() => toggleNavGroup(group.id)}
                      className={`coreui-group-toggle nav-link nav-group-toggle flex w-full items-center justify-start gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-bold uppercase tracking-[0.12em] text-gray-400 transition-colors hover:bg-red-50 hover:text-[#b8171d] dark:text-gray-500 dark:hover:bg-red-950/30 dark:hover:text-red-300 ${sidebarCollapsed ? 'justify-center' : ''}`}
                    >
                      <GroupIcon className="coreui-group-icon h-4 w-4 shrink-0" />
                      <span className="coreui-group-label">{group.label}</span>
                      <ChevronDown
                        className={`coreui-group-chevron ml-auto h-3.5 w-3.5 transition-transform ${groupOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {groupOpen && (
                      <div className="nav-group-items space-y-1 pl-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const isActive = currentTab === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleNavClick(item.id)}
                              className={`coreui-nav-item nav-link w-full flex items-center justify-start text-left rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${sidebarCollapsed ? 'justify-center' : ''} ${
                                isActive
                                  ? 'active bg-[#d71920] dark:bg-[#b8171d] text-white font-semibold shadow-xs'
                                  : 'text-gray-600 dark:text-gray-300 hover:text-[#b8171d] dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30'
                              }`}
                            >
                              <div className="coreui-nav-item-content flex min-w-0 flex-1 items-center gap-2.5 text-left">
                                <Icon
                                  className={`nav-icon w-4 h-4 ${isActive ? 'text-white' : 'text-gray-500 dark:text-gray-400'}`}
                                />
                                <span className="coreui-nav-label">{item.label}</span>
                              </div>
                              {item.badge !== undefined && (
                                <span
                                  className={`coreui-nav-badge ml-auto text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                                    item.badgeColor || 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                  }`}
                                >
                                  {item.badge}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
          <div className="sidebar-footer coreui-system-utilization mt-3 border-t border-white/15 pt-3">
            <h2 className="coreui-system-title">DEVICE METRICS</h2>
            <div className="coreui-utilization-list">
              <div className="coreui-utilization-item">
                <div className="coreui-utilization-label">
                  <Cpu className="coreui-utilization-icon" />
                  CPU CORES
                </div>
                <div className="coreui-utilization-detail">
                  {systemMetrics.cpuCores ? `${systemMetrics.cpuCores} logical cores detected` : 'Unavailable in browser'}
                </div>
              </div>
              <div className="coreui-utilization-item">
                <div className="coreui-utilization-label">
                  <MemoryStick className="coreui-utilization-icon" />
                  BROWSER MEMORY
                </div>
                <div
                  className="coreui-utilization-bar"
                  role="progressbar"
                  aria-label="Memory usage"
                  aria-valuenow={usagePercent(systemMetrics.memoryUsed, systemMetrics.memoryTotal) ?? undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="coreui-utilization-fill coreui-utilization-memory"
                    style={{ width: `${usagePercent(systemMetrics.memoryUsed, systemMetrics.memoryTotal) ?? 0}%` }}
                  />
                </div>
                <div className="coreui-utilization-detail">
                  {systemMetrics.memoryUsed !== null && systemMetrics.memoryTotal !== null ? (
                    <>
                      {formatCompactBytes(systemMetrics.memoryUsed)}/{formatCompactBytes(systemMetrics.memoryTotal)}
                      <span className="coreui-utilization-free">
                        {' '}
                        · Sisa {formatCompactBytes(remainingBytes(systemMetrics.memoryTotal, systemMetrics.memoryUsed))}
                      </span>
                    </>
                  ) : (
                    'Unavailable in this browser'
                  )}
                </div>
              </div>
              <div className="coreui-utilization-item">
                <div className="coreui-utilization-label">
                  <HardDrive className="coreui-utilization-icon" />
                  SITE STORAGE
                </div>
                <div
                  className="coreui-utilization-bar"
                  role="progressbar"
                  aria-label="Storage usage"
                  aria-valuenow={usagePercent(systemMetrics.storageUsed, systemMetrics.storageTotal) ?? undefined}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="coreui-utilization-fill coreui-utilization-storage"
                    style={{ width: `${usagePercent(systemMetrics.storageUsed, systemMetrics.storageTotal) ?? 0}%` }}
                  />
                </div>
                <div className="coreui-utilization-detail">
                  {systemMetrics.storageUsed !== null && systemMetrics.storageTotal !== null ? (
                    <>
                      {formatCompactBytes(systemMetrics.storageUsed)}/{formatCompactBytes(systemMetrics.storageTotal)}
                      <span className="coreui-utilization-free">
                        {' '}
                        · Sisa {formatCompactBytes(remainingBytes(systemMetrics.storageTotal, systemMetrics.storageUsed))}
                      </span>
                    </>
                  ) : (
                    'Unavailable in this browser'
                  )}
                </div>
              </div>
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
        <main className="coreui-content min-w-0 min-h-[calc(100vh-4rem)] flex-1 bg-[#fffafa] dark:bg-gray-950 p-4 lg:p-6 overflow-y-auto transition-colors duration-200">
          {children}
        </main>
      </div>
    </div>
  );
};
