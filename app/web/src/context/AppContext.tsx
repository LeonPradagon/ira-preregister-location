import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AdminUser,
  AuditLog,
  Customer,
  CustomerAddress,
  GpsSample,
  IntegrationOutboxEvent,
  LocationCapture,
  LocationValidationResult,
  Reminder,
  ReminderPreference,
  ReviewDecision,
  ValidationConfig,
  ValidationResult,
  VerificationReview,
  VerificationSession,
  ThemeMode,
} from '../types';
import {
  INITIAL_ADDRESSES,
  INITIAL_ADMIN_USERS,
  INITIAL_AUDIT_LOGS,
  INITIAL_CUSTOMERS,
  INITIAL_INTEGRATION_CONFIGS,
  INITIAL_OUTBOX_EVENTS,
  INITIAL_REMINDERS,
  INITIAL_VALIDATION_CONFIG,
  INITIAL_VERIFICATION_SESSIONS,
} from '../lib/mockData';
import {
  ReverseGeocodeResult,
  buildGoogleMapsDeepLink,
  calculateGeodesicDistanceMeters,
  formatCoordinatePair,
  runValidationDecisionEngine,
  evaluateBestGpsSample,
} from '../lib/validationEngine';
import { assertCapability } from '../lib/accessControl';
import { API_MODE, adminApi, authApi } from '../lib/apiClient';

interface AppContextType {
  // Auth state
  currentAdmin: AdminUser | null;
  allAdminUsers: AdminUser[];
  loginAdmin: (email: string, password?: string) => Promise<boolean>;
  logoutAdmin: () => void;

  // Data collections
  customers: Customer[];
  addresses: CustomerAddress[];
  verificationSessions: VerificationSession[];
  locationCaptures: LocationCapture[];
  verificationReviews: VerificationReview[];
  reminders: Reminder[];
  auditLogs: AuditLog[];
  outboxEvents: IntegrationOutboxEvent[];
  validationConfig: ValidationConfig;
  integrationConfigs: typeof INITIAL_INTEGRATION_CONFIGS;

  // Customer Management
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, addressData: Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt' | 'updatedAt' | 'isActive' | 'isVerified'>) => Customer | Promise<Customer>;
  getCustomerById: (id: string) => Customer | undefined;
  getCustomerAddresses: (customerId: string) => CustomerAddress[];
  getCustomerSessions: (customerId: string) => VerificationSession[];

  // Verification Management (Admin)
  createVerificationSession: (customerId: string, addressId: string) => VerificationSession | Promise<VerificationSession>;
  openVerificationSession: (token: string) => void;
  startAddressChange: (token: string) => void;
  resendInvitation: (sessionId: string) => void | Promise<void>;
  revokeVerificationSession: (sessionId: string) => void;
  performManualReview: (
    sessionId: string,
    decision: ReviewDecision,
    reasonCode: string,
    reviewNote: string
  ) => void | Promise<void>;
  sendManualReminder: (sessionId: string) => { success: boolean; message: string } | Promise<{ success: boolean; message: string }>;
  updateValidationConfig: (newConfig: Partial<ValidationConfig>) => void | Promise<void>;
  resetAllDataToDefault: () => void;

  // Public Customer Verification API (Token-based)
  getVerificationByToken: (token: string) => {
    session: VerificationSession;
    customer: Customer;
    address: CustomerAddress;
    proposedAddress?: CustomerAddress;
  } | null;
  confirmCustomerData: (token: string, confirmed: boolean) => void;
  consentLocationCapture: (token: string) => void;
  submitLocationSamples: (
    token: string,
    samples: GpsSample[],
    reverseGeocode?: ReverseGeocodeResult
  ) => ValidationResult;
  waitForHome: (token: string, preference: ReminderPreference) => void;
  submitProposedAddress: (
    token: string,
    newAddress: Partial<CustomerAddress>
  ) => CustomerAddress;
  requestGpsRetry: (token: string) => void;

  // Simulation / WhatsApp Helpers
  activeSimulatedWhatsAppMessage: {
    phone: string;
    customerName: string;
    text: string;
    token: string;
    link: string;
  } | null;
  setActiveSimulatedWhatsAppMessage: (msg: {
    phone: string;
    customerName: string;
    text: string;
    token: string;
    link: string;
  } | null) => void;

  // Theme Management
  theme: ThemeMode;
  isDarkMode: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  CURRENT_ADMIN: 'el_current_admin',
  CUSTOMERS: 'el_customers_v2',
  ADDRESSES: 'el_addresses_v2',
  SESSIONS: 'el_sessions_v2',
  REMINDERS: 'el_reminders_v2',
  AUDIT_LOGS: 'el_audit_logs_v2',
  OUTBOX: 'el_outbox_v2',
  CONFIG: 'el_config_v2',
  THEME: 'el_theme',
};

function createOpaqueToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function mapApiAdmin(raw: { id: string; email: string; name: string; role: string; department?: string | null }): AdminUser {
  return {
    id: raw.id,
    email: raw.email,
    name: raw.name,
    role: raw.role as AdminUser['role'],
    department: raw.department || 'Operations',
  };
}

function mapApiReferenceLocation(raw: unknown): CustomerAddress['referenceLocation'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const candidate = raw as { latitude?: unknown; longitude?: unknown };
  if (typeof candidate.latitude !== 'number' || typeof candidate.longitude !== 'number') return undefined;
  return { latitude: candidate.latitude, longitude: candidate.longitude };
}

function mapApiAddress(raw: Record<string, unknown>): CustomerAddress {
  return {
    ...raw,
    referenceLocation: mapApiReferenceLocation(raw.referenceLocation) || { latitude: 0, longitude: 0 },
  } as unknown as CustomerAddress;
}

function mapApiSession(raw: Record<string, unknown>): VerificationSession {
  return {
    ...raw,
    token: '',
    tokenHash: '',
  } as unknown as VerificationSession;
}

function mapApiValidationResult(raw: Record<string, unknown>): ValidationResult {
  const latitude = Number(raw.capturedLatitude ?? 0);
  const longitude = Number(raw.capturedLongitude ?? 0);
  const referenceLatitude = Number(raw.referenceLatitude ?? 0);
  const referenceLongitude = Number(raw.referenceLongitude ?? 0);
  const accuracyMeters = Number(raw.gpsAccuracyMeters ?? 0);
  return {
    ...raw,
    gpsAccuracyM: accuracyMeters,
    distanceFromReferenceMeters: Number(raw.distanceToReferenceMeters ?? 0),
    capturedLocation: {
      latitude,
      longitude,
      accuracyMeters,
      capturedAt: String(raw.createdAt ?? new Date().toISOString()),
      coordinateText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
      googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    },
    referenceLocation: {
      latitude: referenceLatitude,
      longitude: referenceLongitude,
      precision: String(raw.referencePrecision ?? 'UNKNOWN') as ValidationResult['referenceLocation']['precision'],
    },
    referencePrecision: String(raw.referencePrecision ?? 'UNKNOWN') as ValidationResult['referencePrecision'],
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
  } as unknown as ValidationResult;
}

function mapApiCapture(raw: Record<string, unknown>): LocationCapture {
  return {
    ...raw,
    latitude: Number(raw.latitude ?? 0),
    longitude: Number(raw.longitude ?? 0),
    accuracyMeters: Number(raw.accuracyMeters ?? 0),
    bestAccuracyMeters: Number(raw.bestAccuracyMeters ?? 0),
    samples: Array.isArray(raw.samples) ? raw.samples : [],
  } as unknown as LocationCapture;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const apiMode = API_MODE;
  // Load from localStorage or defaults
  // Authentication is deliberately session-scoped in the demo. Production
  // sessions must come from Better Auth's secure, HttpOnly cookie.
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);

  const [customers, setCustomers] = useState<Customer[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
    return saved ? JSON.parse(saved) : INITIAL_CUSTOMERS;
  });

  const [addresses, setAddresses] = useState<CustomerAddress[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.ADDRESSES);
    return saved ? JSON.parse(saved) : INITIAL_ADDRESSES;
  });

  const [verificationSessions, setVerificationSessions] = useState<VerificationSession[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return saved ? JSON.parse(saved) : INITIAL_VERIFICATION_SESSIONS;
  });

  const [locationCaptures, setLocationCaptures] = useState<LocationCapture[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem('el_location_captures_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [verificationReviews, setVerificationReviews] = useState<VerificationReview[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem('el_verification_reviews_v2');
    return saved ? JSON.parse(saved) : [];
  });

  const [reminders, setReminders] = useState<Reminder[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.REMINDERS);
    return saved ? JSON.parse(saved) : INITIAL_REMINDERS;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.AUDIT_LOGS);
    return saved ? JSON.parse(saved) : INITIAL_AUDIT_LOGS;
  });

  const [outboxEvents, setOutboxEvents] = useState<IntegrationOutboxEvent[]>(() => {
    if (apiMode) return [];
    const saved = localStorage.getItem(STORAGE_KEYS.OUTBOX);
    return saved ? JSON.parse(saved) : INITIAL_OUTBOX_EVENTS;
  });

  const [validationConfig, setValidationConfig] = useState<ValidationConfig>(() => {
    if (apiMode) return INITIAL_VALIDATION_CONFIG;
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
    return saved ? JSON.parse(saved) : INITIAL_VALIDATION_CONFIG;
  });

  const [integrationConfigs, setIntegrationConfigs] = useState<typeof INITIAL_INTEGRATION_CONFIGS>(INITIAL_INTEGRATION_CONFIGS);

  const [activeSimulatedWhatsAppMessage, setActiveSimulatedWhatsAppMessage] = useState<{
    phone: string;
    customerName: string;
    text: string;
    token: string;
    link: string;
  } | null>(null);

  // Theme state
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.THEME) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
    return 'light'; // Default to clean light mode
  });

  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);

    const applyTheme = () => {
      let isDark = false;
      if (theme === 'dark') {
        isDark = true;
      } else if (theme === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = false;
      }

      setIsDarkMode(isDark);
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme();
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [theme]);

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  useEffect(() => {
    if (!apiMode) return;
    let active = true;
    void authApi.getSession()
      .then(async (session) => {
        if (!active || !session?.user) return;
        const admin = await adminApi.me();
        if (active) setCurrentAdmin(mapApiAdmin(admin));
      })
      .catch(() => {
        // An anonymous API session is the normal initial state on /login.
      });
    return () => { active = false; };
  }, [apiMode]);

  useEffect(() => {
    if (!apiMode || !currentAdmin) return;
    let active = true;
    const load = async () => {
      const [rawCustomers, rawVerifications, rawReminders, rawAudits, rawSettings, rawIntegrations, rawOutbox] = await Promise.all([
        adminApi.customers(),
        adminApi.verifications(),
        adminApi.reminders(),
        adminApi.auditLogs(),
        adminApi.settings(),
        adminApi.integrations(),
        adminApi.outbox(),
      ]);
      const customerDetails = await Promise.all(rawCustomers.map((raw) => adminApi.customer(String(raw.id))));
      const verificationDetails = await Promise.all(rawVerifications.map((raw) => {
        const session = raw.session as Record<string, unknown>;
        return adminApi.verification(String(session.id));
      }));
      if (!active) return;

      setCustomers(rawCustomers as unknown as Customer[]);
      setAddresses(customerDetails.flatMap((detail) => {
        const rows = Array.isArray(detail.addresses) ? detail.addresses : [];
        return rows.map((address) => mapApiAddress(address as Record<string, unknown>));
      }));
      const detailBySessionId = new Map(verificationDetails.map((detail) => [String((detail.session as Record<string, unknown>).id), detail]));
      setVerificationSessions(rawVerifications.map((raw) => {
        const session = mapApiSession(raw.session as Record<string, unknown>);
        const detail = detailBySessionId.get(session.id);
        const results = detail && Array.isArray(detail.results) ? detail.results : [];
        return {
          ...session,
          lastValidationResult: results[0] ? mapApiValidationResult(results[0] as Record<string, unknown>) : undefined,
        };
      }));
      setLocationCaptures(verificationDetails.flatMap((detail) => {
        const rows = Array.isArray(detail.captures) ? detail.captures : [];
        return rows.map((capture) => mapApiCapture(capture as Record<string, unknown>));
      }));
      setVerificationReviews(verificationDetails.flatMap((detail) => {
        const rows = Array.isArray(detail.reviews) ? detail.reviews : [];
        return rows.map((review) => ({
          ...(review as Record<string, unknown>),
          reviewerName: String((review as Record<string, unknown>).reviewerName ?? 'Reviewer'),
        })) as unknown as VerificationReview[];
      }));
      setReminders(rawReminders as unknown as Reminder[]);
      setAuditLogs(rawAudits as unknown as AuditLog[]);
      setOutboxEvents(rawOutbox as unknown as IntegrationOutboxEvent[]);
      setValidationConfig({ ...INITIAL_VALIDATION_CONFIG, ...rawSettings } as ValidationConfig);

      const nextIntegrations = { ...INITIAL_INTEGRATION_CONFIGS };
      for (const raw of rawIntegrations) {
        const key = String(raw.key) as keyof typeof nextIntegrations;
        if (key in nextIntegrations) {
          nextIntegrations[key] = {
            enabled: Boolean(raw.enabled),
            name: String(raw.name),
            description: String(raw.description),
            status: String(raw.status),
          };
        }
      }
      setIntegrationConfigs(nextIntegrations);
    };
    void load().catch((error) => console.error('[admin-api] failed to load dashboard data', error));
    return () => { active = false; };
  }, [apiMode, currentAdmin]);

  // Sync state to localStorage
  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [apiMode, customers]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.ADDRESSES, JSON.stringify(addresses));
  }, [apiMode, addresses]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(verificationSessions));
  }, [apiMode, verificationSessions]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem('el_location_captures_v2', JSON.stringify(locationCaptures));
  }, [apiMode, locationCaptures]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem('el_verification_reviews_v2', JSON.stringify(verificationReviews));
  }, [apiMode, verificationReviews]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.REMINDERS, JSON.stringify(reminders));
  }, [apiMode, reminders]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.AUDIT_LOGS, JSON.stringify(auditLogs));
  }, [apiMode, auditLogs]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.OUTBOX, JSON.stringify(outboxEvents));
  }, [apiMode, outboxEvents]);

  useEffect(() => {
    if (apiMode) return;
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(validationConfig));
  }, [apiMode, validationConfig]);

  // Helper to log audit events
  const addAuditLog = (
    action: string,
    entityType: AuditLog['entityType'],
    entityId: string,
    before?: Record<string, unknown> | null,
    after?: Record<string, unknown> | null,
    reason?: string,
    actorOverride?: { id: string; name: string }
  ) => {
    const newLog: AuditLog = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      actorUserId: actorOverride ? actorOverride.id : currentAdmin ? currentAdmin.id : 'system',
      actorName: actorOverride
        ? actorOverride.name
        : currentAdmin
          ? `${currentAdmin.name} (${currentAdmin.role})`
          : 'System Engine',
      action,
      entityType,
      entityId,
      before,
      after,
      reason,
      timestamp: new Date().toISOString(),
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Auth functions
  const loginAdmin = async (email: string, password = ''): Promise<boolean> => {
    const normalizedEmail = email.trim().toLowerCase();
    if (apiMode) {
      try {
        await authApi.signInEmail(normalizedEmail, password);
        const admin = await adminApi.me();
        setCurrentAdmin(mapApiAdmin(admin));
        return true;
      } catch {
        return false;
      }
    }
    // Demo credentials only. Production authentication belongs to Better Auth.
    const demoPassword = import.meta.env.VITE_DEMO_ADMIN_PASSWORD || 'demo-password';
    const matched = INITIAL_ADMIN_USERS.find(
      (u) => u.email.toLowerCase() === normalizedEmail
    );
    if (matched && password === demoPassword) {
      setCurrentAdmin(matched);
      addAuditLog(
        'ADMIN_LOGIN',
        'AUTH',
        matched.id,
        null,
        { email: matched.email, role: matched.role },
        'Logged in with Better Auth session',
        { id: matched.id, name: `${matched.name} (${matched.role})` }
      );
      return true;
    }
    addAuditLog(
      'ADMIN_LOGIN_FAILED',
      'AUTH',
      normalizedEmail || 'unknown',
      null,
      { email: normalizedEmail },
      'Invalid demo credentials'
    );
    return false;
  };

  const logoutAdmin = () => {
    if (apiMode) {
      void authApi.signOut().catch(() => undefined);
      setCurrentAdmin(null);
      return;
    }
    if (currentAdmin) {
      addAuditLog('ADMIN_LOGOUT', 'AUTH', currentAdmin.id, { email: currentAdmin.email }, null, 'User signed out');
    }
    setCurrentAdmin(null);
  };

  // Customer Management
  const addCustomer = async (
    customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>,
    addressData: Omit<
      CustomerAddress,
      'id' | 'customerId' | 'createdAt' | 'updatedAt' | 'isActive' | 'isVerified'
    >
  ): Promise<Customer> => {
    if (apiMode) {
      const payload = await adminApi.createCustomer({
        ...customerData,
        address: addressData,
      });
      const createdCustomer = payload.customer as Record<string, unknown>;
      const createdAddress = payload.address as Record<string, unknown>;
      const customer = createdCustomer as unknown as Customer;
      setCustomers((prev) => [customer, ...prev]);
      setAddresses((prev) => [mapApiAddress(createdAddress), ...prev]);
      return customer;
    }
    const customerId = `cust-${Date.now()}`;
    const addressId = `addr-${Date.now()}`;
    const now = new Date().toISOString();

    const newCustomer: Customer = {
      ...customerData,
      id: customerId,
      createdAt: now,
      updatedAt: now,
    };

    const newAddress: CustomerAddress = {
      ...addressData,
      id: addressId,
      customerId,
      isActive: true,
      isVerified: false,
      createdAt: now,
      updatedAt: now,
    };

    setCustomers((prev) => [newCustomer, ...prev]);
    setAddresses((prev) => [newAddress, ...prev]);

    addAuditLog('CUSTOMER_CREATED', 'CUSTOMER', customerId, null, {
      customerId,
      name: newCustomer.name,
      externalId: newCustomer.externalId,
    });

    return newCustomer;
  };

  const getCustomerById = (id: string) => customers.find((c) => c.id === id);

  const getCustomerAddresses = (customerId: string) =>
    addresses.filter((a) => a.customerId === customerId);

  const getCustomerSessions = (customerId: string) =>
    verificationSessions.filter((s) => s.customerId === customerId);

  // Verification Management
  const createVerificationSession = async (customerId: string, addressId: string): Promise<VerificationSession> => {
    assertCapability(currentAdmin?.role, 'createVerification');
    const customer = getCustomerById(customerId);
    if (!customer) throw new Error('Customer not found');
    const address = addresses.find((candidate) => candidate.id === addressId && candidate.customerId === customerId);
    if (!address) throw new Error('Address does not belong to customer');

    if (apiMode) {
      const result = await adminApi.createVerification(customerId, addressId);
      const rawToken = result.verificationLink.split('/v/')[1] || '';
      const createdAt = new Date().toISOString();
      const newSession: VerificationSession = {
        id: result.sessionId,
        customerId,
        currentAddressId: addressId,
        token: rawToken,
        tokenHash: '',
        expiresAt: result.expiresAt,
        verificationStatus: 'MESSAGE_SENT',
        customerConfirmationStatus: 'UNCONFIRMED',
        attemptCount: 0,
        reminderCount: 0,
        registeredPhoneSnapshot: customer.phoneE164,
        createdAt,
        updatedAt: createdAt,
      };
      setVerificationSessions((prev) => [newSession, ...prev.filter((session) => session.id !== newSession.id)]);
      return newSession;
    }

    const rawToken = `v_${createOpaqueToken()}`;
    // The demo adapter keeps the opaque token so the local simulator works.
    // The production API must persist only a SHA-256 hash of this value.
    const tokenHash = `demo-only:${rawToken}`;
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + validationConfig.VERIFICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    const newSession: VerificationSession = {
      id: `ses-${Date.now()}`,
      customerId,
      currentAddressId: addressId,
      token: rawToken,
      tokenHash,
      expiresAt,
      verificationStatus: 'MESSAGE_SENT',
      customerConfirmationStatus: 'UNCONFIRMED',
      attemptCount: 0,
      reminderCount: 0,
      registeredPhoneSnapshot: customer.phoneE164,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    setVerificationSessions((prev) => [newSession, ...prev]);

    const verificationLink = `${window.location.origin}/?token=${rawToken}`;
    const waText = `Halo ${customer.name}, mohon lakukan verifikasi lokasi rumah/pemasangan Anda melalui tautan resmi: ${verificationLink}\n\nPastikan Anda sedang berada di lokasi saat melakukan verifikasi. Terima kasih.`;

    setActiveSimulatedWhatsAppMessage({
      phone: customer.phoneE164,
      customerName: customer.name,
      text: waText,
      token: rawToken,
      link: verificationLink,
    });

    addAuditLog('VERIFICATION_CREATED', 'VERIFICATION_SESSION', newSession.id, null, {
      sessionId: newSession.id,
      customerId,
      tokenStoredAsHash: true,
    });

    addAuditLog(
      'INVITATION_SENT',
      'VERIFICATION_SESSION',
      newSession.id,
      null,
      { channel: 'WHATSAPP', targetPhone: customer.phoneE164 },
      'WhatsApp invitation link generated and delivered'
    );

    return newSession;
  };

  const resendInvitation = (sessionId: string) => {
    assertCapability(currentAdmin?.role, 'sendVerification');
    if (apiMode) {
      return adminApi.resend(sessionId).then((result) => {
        const rawToken = result.verificationLink.split('/v/')[1] || '';
        setVerificationSessions((prev) => prev.map((session) => session.id === sessionId
          ? { ...session, token: rawToken, expiresAt: result.expiresAt, updatedAt: new Date().toISOString() }
          : session));
      });
    }
    const session = verificationSessions.find((s) => s.id === sessionId);
    if (!session) return;
    if (session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) return;
    const customer = getCustomerById(session.customerId);
    if (!customer) return;

    const verificationLink = `${window.location.origin}/?token=${session.token}`;
    const waText = `Halo ${customer.name}, kami mengirimkan kembali tautan verifikasi lokasi pemasangan: ${verificationLink}\n\nPastikan Anda berada di rumah saat membuka tautan.`;

    setActiveSimulatedWhatsAppMessage({
      phone: session.registeredPhoneSnapshot,
      customerName: customer.name,
      text: waText,
      token: session.token,
      link: verificationLink,
    });

    addAuditLog(
      'INVITATION_SENT',
      'VERIFICATION_SESSION',
      sessionId,
      null,
      { reminderResend: true, phone: session.registeredPhoneSnapshot },
      'Manual invitation resend triggered by Admin'
    );
  };

  const revokeVerificationSession = (sessionId: string) => {
    assertCapability(currentAdmin?.role, 'sendVerification');
    if (apiMode) {
      return adminApi.revoke(sessionId).then(() => {
        const now = new Date().toISOString();
        setVerificationSessions((prev) => prev.map((session) => session.id === sessionId
          ? { ...session, revokedAt: now, verificationStatus: 'EXPIRED', updatedAt: now }
          : session));
        setReminders((prev) => prev.map((reminder) => reminder.sessionId === sessionId && reminder.status === 'SCHEDULED'
          ? { ...reminder, status: 'CANCELLED' }
          : reminder));
      });
    }
    const session = verificationSessions.find((candidate) => candidate.id === sessionId);
    if (!session || session.revokedAt) return;
    const now = new Date().toISOString();
    setVerificationSessions((prev) =>
      prev.map((candidate) =>
        candidate.id === sessionId
          ? { ...candidate, revokedAt: now, verificationStatus: 'EXPIRED', updatedAt: now }
          : candidate
      )
    );
    setReminders((prev) =>
      prev.map((reminder) =>
        reminder.sessionId === sessionId && reminder.status === 'SCHEDULED'
          ? { ...reminder, status: 'CANCELLED' }
          : reminder
      )
    );
    addAuditLog(
      'VERIFICATION_REVOKED',
      'VERIFICATION_SESSION',
      sessionId,
      { status: session.verificationStatus },
      { status: 'EXPIRED', revokedAt: now },
      'Verification session revoked by Admin'
    );
  };

  const sendManualReminder = (sessionId: string): { success: boolean; message: string } | Promise<{ success: boolean; message: string }> => {
    try {
      assertCapability(currentAdmin?.role, 'sendVerification');
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Tidak memiliki izin.' };
    }
    if (apiMode) {
      return adminApi.reminder(sessionId)
        .then((result) => {
          setVerificationSessions((prev) => prev.map((session) => session.id === sessionId
            ? { ...session, reminderCount: result.reminderNumber, verificationStatus: result.status as VerificationSession['verificationStatus'], updatedAt: new Date().toISOString() }
            : session));
          return { success: true, message: `Pengingat #${result.reminderNumber} berhasil dijadwalkan.` };
        })
        .catch((error: unknown) => ({ success: false, message: error instanceof Error ? error.message : 'Pengingat gagal dijadwalkan.' }));
    }
    const session = verificationSessions.find((s) => s.id === sessionId);
    if (!session) return { success: false, message: 'Session not found' };

    if (session.reminderCount >= validationConfig.MAX_REMINDERS_PER_SESSION) {
      addAuditLog(
        'REMINDER_LIMIT_REACHED',
        'REMINDER',
        sessionId,
        { currentCount: session.reminderCount },
        { maxLimit: validationConfig.MAX_REMINDERS_PER_SESSION },
        'Attempted reminder blocked: maximum 3 reminders per session reached'
      );
      return {
        success: false,
        message: `Batas reminder (${validationConfig.MAX_REMINDERS_PER_SESSION}x) telah tercapai untuk sesi ini.`,
      };
    }

    const customer = getCustomerById(session.customerId);
    const newReminderNumber = session.reminderCount + 1;
    const verificationLink = `${window.location.origin}/?token=${session.token}`;
    const msgText = `Halo ${customer?.name || 'Pelanggan'}, apakah Anda sudah berada di rumah/lokasi pemasangan? Jika sudah, silakan verifikasi lokasi melalui link: ${verificationLink}\n\nPengingat ${newReminderNumber} dari ${validationConfig.MAX_REMINDERS_PER_SESSION}.`;

    const newReminder: Reminder = {
      id: `rem-${Date.now()}`,
      sessionId,
      reminderNumber: newReminderNumber,
      channel: 'WHATSAPP',
      scheduledAt: new Date().toISOString(),
      sentAt: new Date().toISOString(),
      status: 'SENT',
      messageText: msgText,
      providerMessageId: `WA-MANUAL-${Math.floor(Math.random() * 900000 + 100000)}`,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    setReminders((prev) => [newReminder, ...prev]);

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              reminderCount: newReminderNumber,
              verificationStatus:
                newReminderNumber >= validationConfig.MAX_REMINDERS_PER_SESSION
                  ? 'REMINDER_LIMIT_REACHED'
                  : s.verificationStatus,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    setActiveSimulatedWhatsAppMessage({
      phone: session.registeredPhoneSnapshot,
      customerName: customer?.name || 'Pelanggan',
      text: msgText,
      token: session.token,
      link: verificationLink,
    });

    addAuditLog(
      'REMINDER_SENT',
      'REMINDER',
      newReminder.id,
      { countBefore: session.reminderCount },
      { reminderNumber: newReminderNumber, maxAllowed: validationConfig.MAX_REMINDERS_PER_SESSION },
      `Manual WhatsApp reminder #${newReminderNumber} sent by Ops`
    );

    return {
      success: true,
      message: `Pengingat #${newReminderNumber} berhasil dikirim ke ${session.registeredPhoneSnapshot}.`,
    };
  };

  const performManualReview = (
    sessionId: string,
    decision: ReviewDecision,
    reasonCode: string,
    reviewNote: string
  ) => {
    assertCapability(currentAdmin?.role, 'manualReview');

    if (apiMode) {
      return adminApi.review(sessionId, { decision, reasonCode, reviewNote }).then((result) => {
        setVerificationSessions((prev) => prev.map((session) => session.id === sessionId
          ? { ...session, verificationStatus: result.status as VerificationSession['verificationStatus'], updatedAt: new Date().toISOString() }
          : session));
      });
    }

    const session = verificationSessions.find((s) => s.id === sessionId);
    if (!session) return;

    let nextStatus: VerificationSession['verificationStatus'] = session.verificationStatus;
    if (decision === 'APPROVE') nextStatus = 'LOCATION_VALID';
    else if (decision === 'REJECT') nextStatus = 'LOCATION_MISMATCH';
    else if (decision === 'REQUEST_RETRY') nextStatus = 'GPS_CAPTURING';
    else if (decision === 'REQUEST_ADDRESS_UPDATE') nextStatus = 'ADDRESS_EDITING';

    const review: VerificationReview = {
      id: `rev-${Date.now()}`,
      sessionId,
      reviewerUserId: currentAdmin.id,
      reviewerName: `${currentAdmin.name} (${currentAdmin.role})`,
      decision,
      reasonCode,
      reviewNote,
      engineResultSnapshot: session.lastValidationResult
        ? (session.lastValidationResult as unknown as Record<string, unknown>)
        : undefined,
      beforeStatus: session.verificationStatus,
      afterStatus: nextStatus,
      reviewedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    setVerificationReviews((prev) => [review, ...prev]);

    // If approved, update address and outbox
    if (decision === 'APPROVE') {
      setAddresses((prev) =>
        prev.map((a) =>
          a.id === session.currentAddressId
            ? { ...a, addressStatus: 'VERIFIED', isVerified: true, addressType: 'VERIFIED_INSTALLATION' }
            : a
        )
      );

      setCustomers((prev) =>
        prev.map((c) => (c.id === session.customerId ? { ...c, status: 'VERIFIED' } : c))
      );

      // Create outbox event
      const customer = getCustomerById(session.customerId);
      const address = addresses.find((a) => a.id === session.currentAddressId);
      const val = session.lastValidationResult;

      const outboxEvt: IntegrationOutboxEvent = {
        id: `outbox-${Date.now()}`,
        eventId: `evt-loc-val-${Date.now()}`,
        eventType: 'location.verified.v1',
        aggregateType: 'VERIFICATION_SESSION',
        aggregateId: session.id,
        correlationId: session.id,
        idempotencyKey: `location-verified:${session.id}`,
        payload: {
          eventId: `evt-loc-val-${Date.now()}`,
          eventType: 'location.verified.v1',
          occurredAt: new Date().toISOString(),
          correlationId: session.id,
          idempotencyKey: `location-verified:${session.id}`,
          customer: {
            externalId: customer?.externalId || 'UNKNOWN',
            name: customer?.name,
          },
          verifiedAddress: {
            addressId: address?.id || 'UNKNOWN',
            fullAddress: address?.rawAddress,
          },
          verifiedLocation: {
            latitude: val?.capturedLocation.latitude || address?.referenceLocation.latitude || 0,
            longitude: val?.capturedLocation.longitude || address?.referenceLocation.longitude || 0,
            accuracyMeters: val?.capturedLocation.accuracyMeters || 10,
            verifiedAt: new Date().toISOString(),
          },
        },
        status: 'PUBLISHED',
        attemptCount: 1,
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setOutboxEvents((prev) =>
        prev.some((event) => event.idempotencyKey === outboxEvt.idempotencyKey)
          ? prev
          : [outboxEvt, ...prev]
      );
    }

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              verificationStatus: nextStatus,
              locationVerifiedAt: decision === 'APPROVE' ? new Date().toISOString() : s.locationVerifiedAt,
              completedAt: decision === 'APPROVE' ? new Date().toISOString() : s.completedAt,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    addAuditLog(
      decision === 'APPROVE' ? 'MANUAL_REVIEW_APPROVED' : 'MANUAL_REVIEW_REJECTED',
      'REVIEW',
      review.id,
      { beforeStatus: session.verificationStatus },
      { afterStatus: nextStatus, decision, reasonCode, note: reviewNote },
      `Manual review decision: ${decision} (${reasonCode}) - ${reviewNote}`
    );
  };

  const updateValidationConfig = (newConfig: Partial<ValidationConfig>) => {
    assertCapability(currentAdmin?.role, 'changeValidationConfig');
    if (apiMode) {
      return adminApi.updateSettings(newConfig).then((saved) => {
        setValidationConfig((prev) => ({ ...prev, ...saved } as ValidationConfig));
      });
    }
    setValidationConfig((prev) => {
      const updated = { ...prev, ...newConfig };
      addAuditLog(
        'CONFIG_UPDATED',
        'CONFIG',
        'validation_rules',
        prev as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        'Validation thresholds or feature flags modified'
      );
      return updated;
    });
  };

  const resetAllDataToDefault = () => {
    if (apiMode) return;
    setCustomers(INITIAL_CUSTOMERS);
    setAddresses(INITIAL_ADDRESSES);
    setVerificationSessions(INITIAL_VERIFICATION_SESSIONS);
    setLocationCaptures([]);
    setVerificationReviews([]);
    setReminders(INITIAL_REMINDERS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setOutboxEvents(INITIAL_OUTBOX_EVENTS);
    setValidationConfig(INITIAL_VALIDATION_CONFIG);
    [
      STORAGE_KEYS.CURRENT_ADMIN,
      STORAGE_KEYS.CUSTOMERS,
      STORAGE_KEYS.ADDRESSES,
      STORAGE_KEYS.SESSIONS,
      STORAGE_KEYS.REMINDERS,
      STORAGE_KEYS.AUDIT_LOGS,
      STORAGE_KEYS.OUTBOX,
      STORAGE_KEYS.CONFIG,
      'el_location_captures_v2',
      'el_verification_reviews_v2',
    ].forEach((key) => localStorage.removeItem(key));
  };

  // Public Customer Token API
  const getVerificationByToken = (token: string) => {
    const session = verificationSessions.find((s) => s.token === token);
    if (!session) return null;
    if (session.revokedAt || new Date(session.expiresAt).getTime() <= Date.now()) return null;

    const customer = getCustomerById(session.customerId);
    if (!customer) return null;

    const address = addresses.find((a) => a.id === session.currentAddressId);
    if (!address) return null;

    const proposedAddress = addresses.find(
      (a) => a.customerId === customer.id && a.addressType === 'PROPOSED'
    );

    return { session, customer, address, proposedAddress };
  };

  const openVerificationSession = (token: string) => {
    const ctx = getVerificationByToken(token);
    if (!ctx || (ctx.session.openedAt && ctx.session.verificationStatus !== 'MESSAGE_SENT')) return;

    const now = new Date().toISOString();
    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? { ...s, openedAt: s.openedAt || now, verificationStatus: 'LINK_OPENED', updatedAt: now }
          : s
      )
    );
    addAuditLog(
      'VERIFICATION_LINK_OPENED',
      'VERIFICATION_SESSION',
      ctx.session.id,
      { status: ctx.session.verificationStatus },
      { status: 'LINK_OPENED' },
      'Customer opened an unexpired verification link',
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );
  };

  const startAddressChange = (token: string) => {
    const ctx = getVerificationByToken(token);
    if (!ctx) return;
    const now = new Date().toISOString();
    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? { ...s, verificationStatus: 'ADDRESS_EDITING', updatedAt: now }
          : s
      )
    );
    addAuditLog(
      'ADDRESS_CHANGE_STARTED',
      'VERIFICATION_SESSION',
      ctx.session.id,
      { status: ctx.session.verificationStatus },
      { status: 'ADDRESS_EDITING' },
      'Customer reported that the installation address has changed',
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );
  };

  const confirmCustomerData = (token: string, confirmed: boolean) => {
    const ctx = getVerificationByToken(token);
    if (!ctx) return;

    const status: VerificationSession['verificationStatus'] = confirmed
      ? 'CONSENTED'
      : 'CUSTOMER_DATA_MISMATCH';
    const confirmationStatus = confirmed ? 'CONFIRMED' : 'MISMATCH';

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
              verificationStatus: status,
              customerConfirmationStatus: confirmationStatus,
              customerConfirmedAt: new Date().toISOString(),
              openedAt: s.openedAt || new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    if (!confirmed) {
      setReminders((prev) =>
        prev.map((reminder) =>
          reminder.sessionId === ctx.session.id && reminder.status === 'SCHEDULED'
            ? { ...reminder, status: 'CANCELLED' }
            : reminder
        )
      );
    }

    addAuditLog(
      confirmed ? 'CUSTOMER_CONFIRMED' : 'CUSTOMER_DATA_MISMATCH',
      'VERIFICATION_SESSION',
      ctx.session.id,
      { beforeStatus: ctx.session.verificationStatus },
      { confirmed, status },
      confirmed
        ? 'Customer confirmed identity and address'
        : 'Customer flagged data mismatch ("Bukan data saya")',
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );
  };

  const consentLocationCapture = (token: string) => {
    const ctx = getVerificationByToken(token);
    if (!ctx) return;
    if (ctx.session.customerConfirmationStatus !== 'CONFIRMED') return;

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
              consentAt: new Date().toISOString(),
              verificationStatus: 'GPS_CAPTURING',
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    addAuditLog(
      'CONSENT_GIVEN',
      'VERIFICATION_SESSION',
      ctx.session.id,
      null,
      { consentedAt: new Date().toISOString() },
      'Customer provided geolocation browser permission',
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );
  };

  const submitLocationSamples = (
    token: string,
    samples: GpsSample[],
    reverseGeocodeOverride?: ReverseGeocodeResult
  ): ValidationResult => {
    const ctx = getVerificationByToken(token);
    if (!ctx) throw new Error('Session context invalid');

    const captureId = `cap-${Date.now()}`;
    const targetAddress = ctx.address;

    if (ctx.session.customerConfirmationStatus !== 'CONFIRMED' || !ctx.session.consentAt) {
      throw new Error('Customer confirmation and location consent are required before GPS capture');
    }

    if (ctx.session.attemptCount >= validationConfig.MAX_LOCATION_ATTEMPTS) {
      throw new Error('Batas percobaan GPS untuk sesi ini sudah tercapai');
    }

    const { bestSample } = evaluateBestGpsSample(samples);
    const captureNow = new Date().toISOString();
    const locationCapture: LocationCapture = {
      id: captureId,
      sessionId: ctx.session.id,
      latitude: bestSample.latitude,
      longitude: bestSample.longitude,
      accuracyMeters: bestSample.accuracyMeters,
      sampleCount: samples.length,
      bestAccuracyMeters: Math.min(...samples.map((sample) => sample.accuracyMeters)),
      samples,
      deviceTimestamp: bestSample.capturedAt,
      serverTimestamp: captureNow,
      createdAt: captureNow,
    };
    setLocationCaptures((prev) => [locationCapture, ...prev]);

    // Build realistic reverse geocode based on coordinates if not provided
    const revGeo: ReverseGeocodeResult = reverseGeocodeOverride || {
      province: targetAddress.province,
      city: targetAddress.city,
      district: targetAddress.district,
      subdistrict: targetAddress.subdistrict,
      street: targetAddress.street,
      houseNumber: targetAddress.houseNumber,
      postalCode: targetAddress.postalCode,
      formattedAddress: targetAddress.rawAddress,
    };

    const valResult = runValidationDecisionEngine(
      samples,
      targetAddress,
      revGeo,
      validationConfig,
      ctx.session.id,
      captureId
    );

    let nextSessionStatus: VerificationSession['verificationStatus'];
    if (valResult.result === 'LOCATION_VALID') {
      nextSessionStatus = 'LOCATION_VALID';
    } else if (valResult.result === 'LOW_GPS_ACCURACY') {
      nextSessionStatus = 'LOW_GPS_ACCURACY';
    } else if (valResult.result === 'MANUAL_REVIEW') {
      nextSessionStatus = 'MANUAL_REVIEW';
    } else {
      nextSessionStatus = 'LOCATION_MISMATCH';
    }

    // Atomic transaction simulation (PRD Section 26.2)
    if (valResult.result === 'LOCATION_VALID') {
      // 1. Mark address VERIFIED
      setAddresses((prev) =>
        prev.map((a) =>
          a.id === targetAddress.id
            ? { ...a, isVerified: true, addressStatus: 'VERIFIED', addressType: 'VERIFIED_INSTALLATION' }
            : a
        )
      );

      // 2. Mark customer VERIFIED
      setCustomers((prev) =>
        prev.map((c) => (c.id === ctx.customer.id ? { ...c, status: 'VERIFIED' } : c))
      );

      // 3. Cancel pending reminders
      setReminders((prev) =>
        prev.map((r) =>
          r.sessionId === ctx.session.id && r.status === 'SCHEDULED'
            ? { ...r, status: 'CANCELLED' }
            : r
        )
      );

      // 4. Create location.verified.v1 outbox event
      const eventId = `evt-loc-val-${Date.now()}`;
      const occurredAt = new Date().toISOString();
      const outboxEvt: IntegrationOutboxEvent = {
        id: `outbox-${Date.now()}`,
        eventId,
        eventType: 'location.verified.v1',
        aggregateType: 'VERIFICATION_SESSION',
        aggregateId: ctx.session.id,
        correlationId: ctx.session.id,
        idempotencyKey: `location-verified:${ctx.session.id}`,
        payload: {
          eventId,
          eventType: 'location.verified.v1',
          occurredAt,
          correlationId: ctx.session.id,
          idempotencyKey: `location-verified:${ctx.session.id}`,
          customer: {
            externalId: ctx.customer.externalId,
            name: ctx.customer.name,
          },
          verifiedAddress: {
            addressId: targetAddress.id,
            fullAddress: targetAddress.rawAddress,
          },
          verifiedLocation: {
            latitude: valResult.capturedLocation.latitude,
            longitude: valResult.capturedLocation.longitude,
            accuracyMeters: valResult.capturedLocation.accuracyMeters,
            verifiedAt: valResult.capturedLocation.capturedAt,
          },
        },
        status: 'PUBLISHED',
        attemptCount: 1,
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setOutboxEvents((prev) =>
        prev.some((event) => event.idempotencyKey === outboxEvt.idempotencyKey)
          ? prev
          : [outboxEvt, ...prev]
      );

      addAuditLog(
        'LOCATION_VALIDATED',
        'VALIDATION',
        valResult.id,
        { status: ctx.session.verificationStatus },
        {
          status: 'LOCATION_VALID',
          distanceM: valResult.distanceFromReferenceMeters,
          accuracyM: valResult.gpsAccuracyM,
          coordinates: valResult.capturedLocation.coordinateText,
        },
        'GPS and address validation passed completely within home radius',
        { id: 'customer', name: `Customer (${ctx.customer.name})` }
      );

      addAuditLog(
        'INTEGRATION_OUTBOX_CREATED',
        'VERIFICATION_SESSION',
        ctx.session.id,
        null,
        { eventType: 'location.verified.v1', outboxId: outboxEvt.id },
        'Dispatched location.verified.v1 integration event'
      );
    } else if (valResult.result === 'LOW_GPS_ACCURACY') {
      addAuditLog(
        'GPS_ACCURACY_REJECTED',
        'VALIDATION',
        valResult.id,
        null,
        { accuracyMeters: valResult.gpsAccuracyM, threshold: validationConfig.GPS_MAX_ACCURACY_METERS },
        `GPS accuracy ±${valResult.gpsAccuracyM}m exceeded maximum allowed threshold (±${validationConfig.GPS_MAX_ACCURACY_METERS}m)`,
        { id: 'customer', name: `Customer (${ctx.customer.name})` }
      );
    } else {
      addAuditLog(
        'HOME_VALIDATION_FAILED',
        'VALIDATION',
        valResult.id,
        null,
        {
          distanceM: valResult.distanceFromReferenceMeters,
          addressScore: valResult.addressScore,
          reasonCodes: valResult.reasonCodes,
        },
        `Location check outside home radius (${valResult.distanceFromReferenceMeters}m > ${validationConfig.HOME_RADIUS_METERS}m)`,
        { id: 'customer', name: `Customer (${ctx.customer.name})` }
      );
    }

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
              attemptCount: s.attemptCount + 1,
              verificationStatus: nextSessionStatus,
              lastValidationResult: valResult,
              locationVerifiedAt:
                valResult.result === 'LOCATION_VALID'
                  ? new Date().toISOString()
                  : s.locationVerifiedAt,
              completedAt:
                valResult.result === 'LOCATION_VALID' ? new Date().toISOString() : s.completedAt,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    return valResult;
  };

  const waitForHome = (token: string, preference: ReminderPreference) => {
    const ctx = getVerificationByToken(token);
    if (!ctx) return;
    if (!validationConfig.ENABLE_REMINDERS) return;

    const currentCount = ctx.session.reminderCount;
    if (currentCount >= validationConfig.MAX_REMINDERS_PER_SESSION) {
      return;
    }

    const nextCount = currentCount + 1;
    let scheduledDate = new Date();
    if (preference === 'IN_1_HOUR') {
      scheduledDate = new Date(Date.now() + 60 * 60 * 1000);
    } else if (preference === 'TONIGHT') {
      scheduledDate.setHours(20, 0, 0, 0);
      if (scheduledDate.getTime() <= Date.now()) {
        scheduledDate = new Date(scheduledDate.getTime() + 24 * 60 * 60 * 1000);
      }
    } else {
      scheduledDate.setDate(scheduledDate.getDate() + 1);
      scheduledDate.setHours(9, 0, 0, 0);
    }

    const verificationLink = `${window.location.origin}/?token=${token}`;
    const newReminder: Reminder = {
      id: `rem-${Date.now()}`,
      sessionId: ctx.session.id,
      reminderNumber: nextCount,
      channel: 'WHATSAPP',
      scheduledAt: scheduledDate.toISOString(),
      status: 'SCHEDULED',
      messageText: `Halo ${ctx.customer.name}, apakah Anda sudah berada di rumah/lokasi pemasangan? Jika sudah, silakan verifikasi lokasi melalui link: ${verificationLink}\n\nPengingat ${nextCount} dari ${validationConfig.MAX_REMINDERS_PER_SESSION}.`,
      retryCount: 0,
      createdAt: new Date().toISOString(),
    };

    setReminders((prev) => [newReminder, ...prev]);

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
              verificationStatus:
                nextCount >= validationConfig.MAX_REMINDERS_PER_SESSION
                  ? 'REMINDER_LIMIT_REACHED'
                  : 'WAITING_FOR_HOME',
              reminderCount: nextCount,
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );

    addAuditLog(
      'WAITING_FOR_HOME_SELECTED',
      'VERIFICATION_SESSION',
      ctx.session.id,
      { beforeStatus: ctx.session.verificationStatus },
      { preference, reminderNumber: nextCount, scheduledFor: scheduledDate.toISOString() },
      `Customer opted to wait until arriving home; reminder #${nextCount} scheduled`,
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );
  };

  const submitProposedAddress = (
    token: string,
    newAddressData: Partial<CustomerAddress>
  ): CustomerAddress => {
    const ctx = getVerificationByToken(token);
    if (!ctx) throw new Error('Invalid token');
    if (!validationConfig.ENABLE_ADDRESS_EDIT) throw new Error('Address edit is disabled');

    const addressId = `addr-prop-${Date.now()}`;
    const now = new Date().toISOString();

    const fullRaw = [
      newAddressData.street,
      newAddressData.houseNumber ? `No. ${newAddressData.houseNumber}` : '',
      newAddressData.block ? `Blok ${newAddressData.block}` : '',
      newAddressData.rt && newAddressData.rw ? `RT ${newAddressData.rt} / RW ${newAddressData.rw}` : '',
      newAddressData.subdistrict,
      newAddressData.district,
      newAddressData.city,
      newAddressData.province,
      newAddressData.postalCode,
    ]
      .filter(Boolean)
      .join(', ');

    const newAddress: CustomerAddress = {
      id: addressId,
      customerId: ctx.customer.id,
      addressType: 'PROPOSED',
      addressStatus: 'PROPOSED',
      rawAddress: fullRaw,
      province: newAddressData.province || 'DKI Jakarta',
      city: newAddressData.city || 'Jakarta Selatan',
      district: newAddressData.district || 'Kebayoran Baru',
      subdistrict: newAddressData.subdistrict || 'Gunung',
      postalCode: newAddressData.postalCode || '12120',
      street: newAddressData.street || 'Jalan Baru',
      houseNumber: newAddressData.houseNumber || '1',
      rt: newAddressData.rt,
      rw: newAddressData.rw,
      building: newAddressData.building,
      block: newAddressData.block,
      unit: newAddressData.unit,
      landmark: newAddressData.landmark,
      // A proposed address is not allowed to invent a verified coordinate.
      // A real forward-geocoding adapter must resolve it before auto-validation.
      referenceLocation: newAddressData.referenceLocation || ctx.address.referenceLocation,
      referenceSource: 'CUSTOMER_PROPOSED',
      referencePrecision: newAddressData.referenceLocation ? 'HOUSE' : 'AREA',
      referenceConfidence: newAddressData.referenceLocation ? 0.88 : 0,
      isActive: true,
      isVerified: false,
      validFrom: now,
      createdAt: now,
      updatedAt: now,
    };

    setAddresses((prev) => [
      newAddress,
      ...prev.map((existingAddress) =>
        existingAddress.customerId === ctx.customer.id && existingAddress.addressType === 'PROPOSED'
          ? {
              ...existingAddress,
              addressStatus: 'SUPERSEDED',
              isActive: false,
              validTo: now,
              updatedAt: now,
            }
          : existingAddress
      ),
    ]);

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
              currentAddressId: addressId,
              verificationStatus: 'ADDRESS_PROPOSED',
              updatedAt: now,
            }
          : s
      )
    );

    addAuditLog(
      'ADDRESS_PROPOSED',
      'ADDRESS',
      addressId,
      { oldAddressId: ctx.address.id },
      { newAddressId: addressId, rawAddress: fullRaw },
      'Customer submitted proposed new installation address (requires GPS reverification)',
      { id: 'customer', name: `Customer (${ctx.customer.name})` }
    );

    return newAddress;
  };

  const requestGpsRetry = (token: string) => {
    const ctx = getVerificationByToken(token);
    if (!ctx) return;

    setVerificationSessions((prev) =>
      prev.map((s) =>
        s.id === ctx.session.id
          ? {
              ...s,
        verificationStatus: 'GPS_CAPTURING',
              updatedAt: new Date().toISOString(),
            }
          : s
      )
    );
  };

  return (
    <AppContext.Provider
      value={{
        currentAdmin,
        allAdminUsers: apiMode ? [] : INITIAL_ADMIN_USERS,
        loginAdmin,
        logoutAdmin,
        customers,
        addresses,
        verificationSessions,
        locationCaptures,
        verificationReviews,
        reminders,
        auditLogs,
        outboxEvents,
        validationConfig,
        integrationConfigs,
        addCustomer,
        getCustomerById,
        getCustomerAddresses,
        getCustomerSessions,
        createVerificationSession,
        openVerificationSession,
        startAddressChange,
        resendInvitation,
        revokeVerificationSession,
        performManualReview,
        sendManualReminder,
        updateValidationConfig,
        resetAllDataToDefault,
        getVerificationByToken,
        confirmCustomerData,
        consentLocationCapture,
        submitLocationSamples,
        waitForHome,
        submitProposedAddress,
        requestGpsRetry,
        activeSimulatedWhatsAppMessage,
        setActiveSimulatedWhatsAppMessage,
        theme,
        isDarkMode,
        setTheme,
        toggleTheme,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
