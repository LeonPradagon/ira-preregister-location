import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  AdminUser, AuditLog, Customer, CustomerAddress, CustomerPage, CustomerStatus, DashboardSummary, IntegrationConfigs, IntegrationOutboxEvent,
  LocationCapture, Reminder, ReviewDecision, ThemeMode, ValidationConfig, ValidationResult,
  VerificationCampaign, VerificationReview, VerificationSession,
} from '../types';
import { assertCapability } from '../lib/accessControl';
import { AdminDashboardApi, api } from '../lib/apiClient';

const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  GPS_MAX_ACCURACY_METERS: 30, HOME_RADIUS_METERS: 50, STREET_MATCH_THRESHOLD: 0.9,
  ADDRESS_SCORE_THRESHOLD: 0.9, MAX_LOCATION_ATTEMPTS: 5, MAX_REMINDERS_PER_SESSION: 3,
  COORDINATE_DISPLAY_DECIMALS: 6, VERIFICATION_TOKEN_TTL_DAYS: 7,
  REMINDER_LINK_TTL_HOURS: 24,
  REMINDER_DEFAULT_1_HOURS: 2, REMINDER_DEFAULT_2_HOURS: 24, REMINDER_DEFAULT_3_HOURS: 24,
  ENABLE_CUSTOMER_OTP: false, ENABLE_IRA_COVERAGE: false, ENABLE_TICKETING: false,
  ENABLE_MANUAL_REVIEW: true, ENABLE_ADDRESS_EDIT: true, ENABLE_REMINDERS: true,
};

const DEFAULT_INTEGRATION_CONFIGS: IntegrationConfigs = {
  IRA_COVERAGE: { enabled: false, name: 'IRA Coverage', description: 'Coverage verification integration', status: 'PENDING_EXTERNAL_CONTRACT' },
  TICKETING: { enabled: false, name: 'Ticketing', description: 'Dispatch ticket integration', status: 'PENDING_EXTERNAL_CONTRACT' },
};

const EMPTY_CUSTOMER_PAGE: CustomerPage = { items: [], page: 1, pageSize: 25, total: 0, totalPages: 0 };
const EMPTY_DASHBOARD_SUMMARY: DashboardSummary = {
  generatedAt: '',
  customers: { total: 0, active: 0, verified: 0, whatsappOptedIn: 0, whatsappOptedOut: 0 },
  verifications: { total: 0, invitationsSent: 0, linksOpened: 0, customersConfirmed: 0, customersMismatch: 0, gpsCaptured: 0, lowGpsAccuracy: 0, waitingForHome: 0, addressChanged: 0, manualReview: 0, locationValid: 0, statusCounts: {} },
  reminders: { total: 0, scheduled: 0, sent: 0, failed: 0, cancelled: 0, byNumber: {} },
  outbox: { total: 0, pending: 0, published: 0, failed: 0 },
};

interface AppContextType {
  currentAdmin: AdminUser | null;
  loginAdmin: (email: string, password?: string) => Promise<boolean>;
  logoutAdmin: () => void;
  customers: Customer[];
  customerPage: CustomerPage;
  dashboardSummary: DashboardSummary;
  refreshDashboard: () => Promise<void>;
  loadCustomerPage: (page?: number, search?: string, status?: CustomerStatus | 'ALL', pageSize?: number) => Promise<CustomerPage>;
  loadCustomerDetail: (customerId: string) => Promise<{ customer: Customer; addresses: CustomerAddress[]; sessions: VerificationSession[] }>;
  loadVerificationDetail: (sessionId: string) => Promise<void>;
  addresses: CustomerAddress[];
  verificationSessions: VerificationSession[];
  locationCaptures: LocationCapture[];
  verificationReviews: VerificationReview[];
  reminders: Reminder[];
  campaigns: VerificationCampaign[];
  auditLogs: AuditLog[];
  outboxEvents: IntegrationOutboxEvent[];
  validationConfig: ValidationConfig;
  integrationConfigs: IntegrationConfigs;
  addCustomer: (customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, addressData: Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt' | 'updatedAt' | 'isActive' | 'isVerified'>) => Promise<Customer>;
  updateCustomer: (customerId: string, body: unknown) => Promise<Customer>;
  deleteCustomer: (customerId: string) => Promise<void>;
  getCustomerById: (id: string) => Customer | undefined;
  getCustomerAddresses: (customerId: string) => CustomerAddress[];
  getCustomerSessions: (customerId: string) => VerificationSession[];
  createVerificationSession: (customerId: string, addressId: string) => Promise<VerificationSession>;
  resendInvitation: (sessionId: string) => Promise<void>;
  revokeVerificationSession: (sessionId: string) => Promise<void>;
  performManualReview: (sessionId: string, decision: ReviewDecision, reasonCode: string, reviewNote: string) => Promise<void>;
  updateAddressFromGps: (sessionId: string) => Promise<string[]>;
  sendManualReminder: (sessionId: string) => Promise<{ success: boolean; message: string }>;
  createCampaign: (name: string, customerIds?: string[], scheduledAt?: string, options?: { targetFilter?: { locationStatus: 'UNVERIFIED' | 'VERIFIED'; status?: CustomerStatus; search?: string }; batchSize?: number; sendWindowDays?: number }) => Promise<VerificationCampaign>;
  startCampaign: (campaignId: string) => Promise<void>;
  optOutCustomer: (customerId: string) => Promise<void>;
  updateValidationConfig: (newConfig: Partial<ValidationConfig>) => Promise<void>;
  theme: ThemeMode;
  isDarkMode: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

function mapApiAdmin(raw: { id: string; email: string; name: string; role: string; department?: string | null }): AdminUser {
  return { id: raw.id, email: raw.email, name: raw.name, role: raw.role as AdminUser['role'], department: raw.department || 'Operations' };
}

function mapApiDashboard(raw: AdminDashboardApi): DashboardSummary {
  const number = (value: unknown) => Number(value ?? 0);
  const numberMap = (value: Record<string, unknown> | undefined) => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, number(item)]));
  return {
    generatedAt: String(raw.generatedAt ?? ''),
    customers: {
      total: number(raw.customers.total), active: number(raw.customers.active), verified: number(raw.customers.verified),
      whatsappOptedIn: number(raw.customers.whatsappOptedIn), whatsappOptedOut: number(raw.customers.whatsappOptedOut),
    },
    verifications: {
      total: number(raw.verifications.total), invitationsSent: number(raw.verifications.invitationsSent), linksOpened: number(raw.verifications.linksOpened),
      customersConfirmed: number(raw.verifications.customersConfirmed), customersMismatch: number(raw.verifications.customersMismatch), gpsCaptured: number(raw.verifications.gpsCaptured),
      lowGpsAccuracy: number(raw.verifications.lowGpsAccuracy), waitingForHome: number(raw.verifications.waitingForHome), addressChanged: number(raw.verifications.addressChanged),
      manualReview: number(raw.verifications.manualReview), locationValid: number(raw.verifications.locationValid), statusCounts: numberMap(raw.verifications.statusCounts),
    },
    reminders: {
      total: number(raw.reminders.total), scheduled: number(raw.reminders.scheduled), sent: number(raw.reminders.sent),
      failed: number(raw.reminders.failed), cancelled: number(raw.reminders.cancelled), byNumber: numberMap(raw.reminders.byNumber),
    },
    outbox: { total: number(raw.outbox.total), pending: number(raw.outbox.pending), published: number(raw.outbox.published), failed: number(raw.outbox.failed) },
  };
}

export function mapApiCustomer(raw: Record<string, unknown>): Customer {
  return {
    id: String(raw.id), externalId: String(raw.externalId ?? ''), name: String(raw.name ?? ''), phoneE164: String(raw.phoneE164 ?? ''),
    whatsappOptInAt: raw.whatsappOptInAt ? String(raw.whatsappOptInAt) : undefined, whatsappOptInSource: raw.whatsappOptInSource ? String(raw.whatsappOptInSource) : undefined, whatsappOptOutAt: raw.whatsappOptOutAt ? String(raw.whatsappOptOutAt) : undefined,
    status: String(raw.status ?? 'ACTIVE') as Customer['status'], sourceRecordId: raw.sourceRecordId ? String(raw.sourceRecordId) : undefined,
    sourceCreatedAt: raw.sourceCreatedAt ? String(raw.sourceCreatedAt) : undefined, isCoverBts: typeof raw.isCoverBts === 'boolean' ? raw.isCoverBts : undefined,
    btsName: raw.btsName ? String(raw.btsName) : undefined, coverageStatus: raw.coverageStatus ? String(raw.coverageStatus) : undefined,
    sourceMetadata: raw.sourceMetadata && typeof raw.sourceMetadata === 'object' ? raw.sourceMetadata as Record<string, unknown> : undefined,
    activeAddress: raw.activeAddress && typeof raw.activeAddress === 'object' ? mapApiAddress(raw.activeAddress as Record<string, unknown>) : null,
    latestVerification: raw.latestVerification && typeof raw.latestVerification === 'object' ? mapApiSession(raw.latestVerification as Record<string, unknown>) : null,
    createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? ''),
  };
}

function mapApiReferenceLocation(raw: unknown): CustomerAddress['referenceLocation'] {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { latitude?: unknown; longitude?: unknown };
  const latitude = Number(candidate.latitude); const longitude = Number(candidate.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function mapApiAddress(raw: Record<string, unknown>): CustomerAddress {
  return { ...(raw as unknown as CustomerAddress), id: String(raw.id), customerId: String(raw.customerId), referenceConfidence: Number(raw.referenceConfidence ?? 0), referenceLocation: mapApiReferenceLocation(raw.referenceLocation) };
}

export function mapApiSession(raw: Record<string, unknown>): VerificationSession {
  return { ...(raw as unknown as VerificationSession), id: String(raw.id), customerId: String(raw.customerId), currentAddressId: String(raw.currentAddressId), reminderCount: Number(raw.reminderCount ?? 0), attemptCount: Number(raw.attemptCount ?? 0) };
}

export function mapApiValidationResult(raw: Record<string, unknown>): ValidationResult {
  const latitude = Number(raw.capturedLatitude); const longitude = Number(raw.capturedLongitude); const accuracyMeters = Number(raw.gpsAccuracyMeters);
  const precision = String(raw.referencePrecision ?? 'UNKNOWN') as ValidationResult['referencePrecision'];
  return {
    ...(raw as unknown as ValidationResult), id: String(raw.id), sessionId: String(raw.sessionId), captureId: String(raw.captureId), addressId: String(raw.addressId),
    gpsAccuracyM: accuracyMeters, distanceToReferenceM: raw.distanceToReferenceMeters == null ? null : Number(raw.distanceToReferenceMeters), distanceFromReferenceMeters: raw.distanceToReferenceMeters == null ? null : Number(raw.distanceToReferenceMeters),
    capturedLocation: { latitude, longitude, accuracyMeters, capturedAt: String(raw.createdAt), coordinateText: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` },
    referenceLocation: raw.referenceLatitude == null || raw.referenceLongitude == null ? null : { latitude: Number(raw.referenceLatitude), longitude: Number(raw.referenceLongitude), precision }, referencePrecision: precision, createdAt: String(raw.createdAt),
  };
}

function mapApiCapture(raw: Record<string, unknown>): LocationCapture {
  return { ...(raw as unknown as LocationCapture), id: String(raw.id), sessionId: String(raw.sessionId), latitude: Number(raw.latitude), longitude: Number(raw.longitude), accuracyMeters: Number(raw.accuracyMeters), bestAccuracyMeters: Number(raw.bestAccuracyMeters), sampleCount: Number(raw.sampleCount), samples: Array.isArray(raw.samples) ? raw.samples : [] };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentAdmin, setCurrentAdmin] = useState<AdminUser | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]); const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [customerPage, setCustomerPage] = useState<CustomerPage>(EMPTY_CUSTOMER_PAGE);
  const [verificationSessions, setVerificationSessions] = useState<VerificationSession[]>([]); const [locationCaptures, setLocationCaptures] = useState<LocationCapture[]>([]);
  const [verificationReviews, setVerificationReviews] = useState<VerificationReview[]>([]); const [reminders, setReminders] = useState<Reminder[]>([]);
  const [campaigns, setCampaigns] = useState<VerificationCampaign[]>([]);
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary>(EMPTY_DASHBOARD_SUMMARY);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]); const [outboxEvents, setOutboxEvents] = useState<IntegrationOutboxEvent[]>([]);
  const [validationConfig, setValidationConfig] = useState<ValidationConfig>(DEFAULT_VALIDATION_CONFIG); const [integrationConfigs, setIntegrationConfigs] = useState<IntegrationConfigs>(DEFAULT_INTEGRATION_CONFIGS);
  const [theme, setThemeState] = useState<ThemeMode>(() => { const saved = localStorage.getItem('el_theme') as ThemeMode | null; return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light'; });
  const [isDarkMode, setIsDarkMode] = useState(false);

  useEffect(() => {
    localStorage.setItem('el_theme', theme);
    const applyTheme = () => { const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches); setIsDarkMode(dark); document.documentElement.classList.toggle('dark', dark); };
    applyTheme(); if (theme !== 'system') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)'); const listener = () => applyTheme(); mediaQuery.addEventListener('change', listener); return () => mediaQuery.removeEventListener('change', listener);
  }, [theme]);

  useEffect(() => {
    let active = true;
    void api.getSession().then(async (session) => { if (!active || !session?.user) return; const admin = await api.me(); if (active) setCurrentAdmin(mapApiAdmin(admin)); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!currentAdmin) return;
    let active = true;
    const load = async () => {
      const [rawDashboard, rawCustomerPage, rawVerifications, rawReminders, rawAudits, rawSettings, rawIntegrations, rawOutbox, rawCampaigns] = await Promise.all([
        api.dashboard().catch(() => null), api.customers({ page: 1, pageSize: 25 }).catch(() => null), api.verifications({ page: 1, pageSize: 25 }).catch(() => null), api.reminders({ page: 1, pageSize: 25 }).catch(() => null),
        api.auditLogs({ page: 1, pageSize: 25 }).catch(() => null), api.settings().catch(() => null), api.integrations().catch(() => null), api.outbox({ page: 1, pageSize: 25 }).catch(() => null), api.campaigns({ page: 1, pageSize: 25 }).catch(() => null),
      ]);
      const verificationDetails = rawVerifications ? await Promise.all(rawVerifications.items.map((raw) => api.verification(String(raw.session.id)).catch(() => null))) : [];
      if (!active) return;
      if (rawDashboard) setDashboardSummary(mapApiDashboard(rawDashboard));
      if (rawCustomerPage) {
        const mappedCustomers = rawCustomerPage.items.map(mapApiCustomer);
        setCustomers(mappedCustomers);
        setCustomerPage({ ...rawCustomerPage, items: mappedCustomers });
      }
      setAddresses([]);
      const successfulDetails = verificationDetails.filter((detail): detail is NonNullable<typeof detail> => Boolean(detail));
      const detailsById = new Map(successfulDetails.map((detail) => [String((detail.session as Record<string, unknown>).id), detail]));
      const detailAddresses = successfulDetails
        .filter((detail) => detail.address && typeof detail.address === 'object')
        .map((detail) => mapApiAddress(detail.address as Record<string, unknown>));
      if (detailAddresses.length) setAddresses((previous) => [...previous.filter((address) => !detailAddresses.some((item) => item.id === address.id)), ...detailAddresses]);
      if (rawVerifications) setVerificationSessions(rawVerifications.items.map((raw) => { const session = mapApiSession(raw.session); const detail = detailsById.get(session.id); const results = detail && Array.isArray(detail.results) ? detail.results : []; return { ...session, lastValidationResult: results[0] ? mapApiValidationResult(results[0] as Record<string, unknown>) : undefined }; }));
      if (successfulDetails.length) {
        setLocationCaptures(successfulDetails.flatMap((detail) => (Array.isArray(detail.captures) ? detail.captures : []).map((row) => mapApiCapture(row as Record<string, unknown>))));
        setVerificationReviews(successfulDetails.flatMap((detail) => (Array.isArray(detail.reviews) ? detail.reviews : [])) as VerificationReview[]);
      }
      if (rawReminders) setReminders(rawReminders.items as unknown as Reminder[]);
      if (rawAudits) setAuditLogs(rawAudits.items as unknown as AuditLog[]);
      if (rawOutbox) setOutboxEvents(rawOutbox.items as unknown as IntegrationOutboxEvent[]);
      if (rawCampaigns) setCampaigns(rawCampaigns.items.map((raw) => ({ ...(raw as unknown as VerificationCampaign), id: String(raw.id), name: String(raw.name ?? ''), status: String(raw.status ?? 'DRAFT') as VerificationCampaign['status'], timezone: String(raw.timezone ?? 'Asia/Jakarta'), scheduledAt: String(raw.scheduledAt ?? ''), targetCount: Number(raw.targetCount ?? 0), sentCount: Number(raw.sentCount ?? 0), failedCount: Number(raw.failedCount ?? 0), createdBy: String(raw.createdBy ?? ''), createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? '') })));
      if (rawSettings) setValidationConfig({ ...DEFAULT_VALIDATION_CONFIG, ...rawSettings } as ValidationConfig);
      if (rawIntegrations) { const next = { ...DEFAULT_INTEGRATION_CONFIGS }; for (const raw of rawIntegrations) { const key = String(raw.key) as keyof IntegrationConfigs; if (key in next) next[key] = { enabled: Boolean(raw.enabled), name: String(raw.name), description: String(raw.description), status: String(raw.status) }; } setIntegrationConfigs(next); }
    };
    void load(); return () => { active = false; };
  }, [currentAdmin]);

  const loginAdmin = async (email: string, password = ''): Promise<boolean> => { try { await api.signInEmail(email.trim().toLowerCase(), password); setCurrentAdmin(mapApiAdmin(await api.me())); return true; } catch { return false; } };
  const logoutAdmin = () => { void api.signOut().catch(() => undefined); setCurrentAdmin(null); };
  const getCustomerById = (id: string) => customers.find((customer) => customer.id === id);
  const getCustomerAddresses = (customerId: string) => addresses.filter((address) => address.customerId === customerId);
  const getCustomerSessions = (customerId: string) => verificationSessions.filter((session) => session.customerId === customerId);
  const loadCustomerPage = async (page = 1, search = '', status: CustomerStatus | 'ALL' = 'ALL', pageSize = customerPage.pageSize || 25): Promise<CustomerPage> => {
    const raw = await api.customers({ page, pageSize, search, status });
    const mapped = raw.items.map(mapApiCustomer);
    const result = { ...raw, items: mapped };
    setCustomers(mapped);
    setCustomerPage(result);
    return result;
  };
  const refreshDashboard = async () => {
    setDashboardSummary(mapApiDashboard(await api.dashboard()));
  };
  const loadCustomerDetail = async (customerId: string) => {
    const raw = await api.customer(customerId);
    const customer = mapApiCustomer(raw.customer as Record<string, unknown>);
    const detailAddresses = (Array.isArray(raw.addresses) ? raw.addresses : []).map((row) => mapApiAddress(row as Record<string, unknown>));
    const detailSessions = (Array.isArray(raw.sessions) ? raw.sessions : []).map((row) => mapApiSession(row as Record<string, unknown>));
    setCustomers((prev) => prev.some((item) => item.id === customerId) ? prev.map((item) => item.id === customerId ? customer : item) : [customer, ...prev]);
    setCustomerPage((prev) => ({ ...prev, items: prev.items.map((item) => item.id === customerId ? customer : item) }));
    setAddresses((prev) => [...prev.filter((item) => item.customerId !== customerId), ...detailAddresses]);
    setVerificationSessions((prev) => [...prev.filter((item) => item.customerId !== customerId), ...detailSessions]);
    return { customer, addresses: detailAddresses, sessions: detailSessions };
  };
  const loadVerificationDetail = async (sessionId: string) => {
    const raw = await api.verification(sessionId);
    const rawSession = raw.session as Record<string, unknown>;
    const rawCustomer = raw.customer as Record<string, unknown>;
    const rawAddress = raw.address as Record<string, unknown>;
    const session = mapApiSession(rawSession);
    const customer = mapApiCustomer(rawCustomer);
    const address = mapApiAddress(rawAddress);
    const customerWithAddress = { ...customer, activeAddress: address };
    const results = Array.isArray(raw.results) ? raw.results : [];
    const lastValidationResult = results[0] ? mapApiValidationResult(results[0] as Record<string, unknown>) : undefined;
    setCustomers((previous) => [customerWithAddress, ...previous.filter((item) => item.id !== customer.id)]);
    setCustomerPage((previous) => ({ ...previous, items: previous.items.map((item) => item.id === customer.id ? customerWithAddress : item) }));
    setAddresses((previous) => [address, ...previous.filter((item) => item.id !== address.id)]);
    setVerificationSessions((previous) => [{ ...session, lastValidationResult }, ...previous.filter((item) => item.id !== session.id)]);
    if (Array.isArray(raw.captures)) setLocationCaptures((previous) => [...(raw.captures as Record<string, unknown>[]).map(mapApiCapture), ...previous.filter((item) => item.sessionId !== session.id)]);
    if (Array.isArray(raw.reviews)) setVerificationReviews((previous) => [...raw.reviews as VerificationReview[], ...previous.filter((item) => item.sessionId !== session.id)]);
    if (Array.isArray(raw.reminders)) setReminders((previous) => [...raw.reminders as Reminder[], ...previous.filter((item) => item.sessionId !== session.id)]);
    if (Array.isArray(raw.audits)) setAuditLogs((previous) => [...raw.audits as AuditLog[], ...previous.filter((item) => item.entityId !== session.id)]);
  };

  const addCustomer = async (customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>, addressData: Omit<CustomerAddress, 'id' | 'customerId' | 'createdAt' | 'updatedAt' | 'isActive' | 'isVerified'>): Promise<Customer> => {
    const payload = await api.createCustomer({ ...customerData, address: addressData }); const mappedAddress = mapApiAddress(payload.address as Record<string, unknown>); const customer = { ...mapApiCustomer(payload.customer as Record<string, unknown>), activeAddress: mappedAddress }; setCustomers((prev) => [customer, ...prev]); setCustomerPage((prev) => { const total = prev.total + 1; return { ...prev, items: [customer, ...prev.items].slice(0, prev.pageSize), total, totalPages: Math.ceil(total / prev.pageSize) }; }); setAddresses((prev) => [mappedAddress, ...prev]); return customer;
  };

  const updateCustomer = async (customerId: string, body: unknown): Promise<Customer> => {
    assertCapability(currentAdmin?.role, 'manageCustomers');
    const payload = await api.updateCustomer(customerId, body);
    const updatedAddress = payload.address ? mapApiAddress(payload.address) : undefined;
    const updatedCustomer = mapApiCustomer(payload.customer);
    const customer = updatedAddress ? { ...updatedCustomer, activeAddress: updatedAddress } : updatedCustomer;
    setCustomers((prev) => prev.map((item) => item.id === customerId ? customer : item));
    setCustomerPage((prev) => ({ ...prev, items: prev.items.map((item) => item.id === customerId ? customer : item) }));
    if (updatedAddress) setAddresses((prev) => [...prev.filter((item) => item.id !== updatedAddress.id), updatedAddress]);
    return customer;
  };

  const deleteCustomer = async (customerId: string): Promise<void> => {
    assertCapability(currentAdmin?.role, 'manageCustomers');
    await api.deleteCustomer(customerId);
    const updatedAt = new Date().toISOString();
    setCustomers((prev) => prev.map((item) => item.id === customerId ? { ...item, status: 'SUSPENDED', updatedAt } : item));
    setCustomerPage((prev) => ({ ...prev, items: prev.items.map((item) => item.id === customerId ? { ...item, status: 'SUSPENDED', updatedAt } : item) }));
    await refreshDashboard();
  };

  const createVerificationSession = async (customerId: string, addressId: string): Promise<VerificationSession> => {
    assertCapability(currentAdmin?.role, 'createVerification'); const customer = getCustomerById(customerId); const address = addresses.find((candidate) => candidate.id === addressId && candidate.customerId === customerId); if (!customer || !address) throw new Error('Customer or address not found');
    const result = await api.createVerification(customerId, addressId); const now = new Date().toISOString(); const session: VerificationSession = { id: result.sessionId, customerId, currentAddressId: addressId, expiresAt: result.expiresAt, verificationStatus: 'MESSAGE_SENT', customerConfirmationStatus: 'UNCONFIRMED', attemptCount: 0, reminderCount: 0, registeredPhoneSnapshot: customer.phoneE164, createdAt: now, updatedAt: now }; setVerificationSessions((prev) => [session, ...prev.filter((item) => item.id !== session.id)]); await refreshDashboard(); return session;
  };
  const resendInvitation = async (sessionId: string) => { assertCapability(currentAdmin?.role, 'sendVerification'); const result = await api.resend(sessionId); setVerificationSessions((prev) => prev.map((session) => session.id === sessionId ? { ...session, expiresAt: result.expiresAt, updatedAt: new Date().toISOString() } : session)); await refreshDashboard(); };
  const revokeVerificationSession = async (sessionId: string) => { assertCapability(currentAdmin?.role, 'sendVerification'); await api.revoke(sessionId); const now = new Date().toISOString(); setVerificationSessions((prev) => prev.map((session) => session.id === sessionId ? { ...session, revokedAt: now, verificationStatus: 'EXPIRED', updatedAt: now } : session)); setReminders((prev) => prev.map((reminder) => reminder.sessionId === sessionId && reminder.status === 'SCHEDULED' ? { ...reminder, status: 'CANCELLED' } : reminder)); await refreshDashboard(); };
  const sendManualReminder = async (sessionId: string) => { try { assertCapability(currentAdmin?.role, 'sendVerification'); const result = await api.reminder(sessionId); setVerificationSessions((prev) => prev.map((session) => session.id === sessionId ? { ...session, reminderCount: result.reminderNumber, verificationStatus: result.status as VerificationSession['verificationStatus'], updatedAt: new Date().toISOString() } : session)); await refreshDashboard(); return { success: true, message: `Pengingat #${result.reminderNumber} berhasil dijadwalkan.` }; } catch (error) { return { success: false, message: error instanceof Error ? error.message : 'Pengingat gagal dijadwalkan.' }; } };
  const createCampaign = async (name: string, customerIds: string[] = [], scheduledAt?: string, options?: { targetFilter?: { locationStatus: 'UNVERIFIED' | 'VERIFIED'; status?: CustomerStatus; search?: string }; batchSize?: number; sendWindowDays?: number }) => { assertCapability(currentAdmin?.role, 'createVerification'); const raw = await api.createCampaign({ name, ...(options?.targetFilter ? { targetFilter: options.targetFilter } : { customerIds }), batchSize: options?.batchSize ?? 1000, sendWindowDays: options?.sendWindowDays ?? 7, scheduledAt, timezone: 'Asia/Jakarta' }); const campaign = { ...(raw as unknown as VerificationCampaign), id: String(raw.id), name: String(raw.name), status: String(raw.status) as VerificationCampaign['status'], timezone: String(raw.timezone), scheduledAt: String(raw.scheduledAt), targetCount: Number(raw.targetCount), sentCount: Number(raw.sentCount ?? 0), failedCount: Number(raw.failedCount ?? 0), optedOutCount: Number(raw.optedOutCount ?? 0), batchSize: Number(raw.batchSize ?? 1000), sendWindowDays: Number(raw.sendWindowDays ?? 7), materializedCount: Number(raw.materializedCount ?? 0), createdBy: String(raw.createdBy ?? ''), createdAt: String(raw.createdAt ?? ''), updatedAt: String(raw.updatedAt ?? '') }; setCampaigns((prev) => [campaign, ...prev]); await refreshDashboard(); return campaign; };
  const startCampaign = async (campaignId: string) => { assertCapability(currentAdmin?.role, 'createVerification'); await api.startCampaign(campaignId); setCampaigns((prev) => prev.map((campaign) => campaign.id === campaignId ? { ...campaign, status: 'RUNNING' } : campaign)); await refreshDashboard(); };
  const optOutCustomer = async (customerId: string) => { await api.optOutCustomer(customerId); setCustomers((prev) => prev.map((customer) => customer.id === customerId ? { ...customer, whatsappOptOutAt: new Date().toISOString() } : customer)); await refreshDashboard(); };
  const performManualReview = async (sessionId: string, decision: ReviewDecision, reasonCode: string, reviewNote: string) => { assertCapability(currentAdmin?.role, 'manualReview'); const result = await api.review(sessionId, { decision, reasonCode, reviewNote }); await loadVerificationDetail(sessionId); await refreshDashboard(); if (result.status !== 'LOCATION_VALID') setVerificationSessions((prev) => prev.map((session) => session.id === sessionId ? { ...session, verificationStatus: result.status as VerificationSession['verificationStatus'], updatedAt: new Date().toISOString() } : session)); };
  const updateAddressFromGps = async (sessionId: string) => { assertCapability(currentAdmin?.role, 'manualReview'); const result = await api.addressFromGps(sessionId); await loadVerificationDetail(sessionId); await refreshDashboard(); return result.updatedFields; };
  const updateValidationConfig = async (newConfig: Partial<ValidationConfig>) => { assertCapability(currentAdmin?.role, 'changeValidationConfig'); const saved = await api.updateSettings(newConfig); setValidationConfig((prev) => ({ ...prev, ...saved } as ValidationConfig)); };

  return <AppContext.Provider value={{ currentAdmin, loginAdmin, logoutAdmin, customers, customerPage, dashboardSummary, refreshDashboard, loadCustomerPage, loadCustomerDetail, loadVerificationDetail, addresses, verificationSessions, locationCaptures, verificationReviews, reminders, campaigns, auditLogs, outboxEvents, validationConfig, integrationConfigs, addCustomer, updateCustomer, deleteCustomer, getCustomerById, getCustomerAddresses, getCustomerSessions, createVerificationSession, resendInvitation, revokeVerificationSession, performManualReview, updateAddressFromGps, sendManualReminder, createCampaign, startCampaign, optOutCustomer, updateValidationConfig, theme, isDarkMode, setTheme: setThemeState, toggleTheme: () => setThemeState((prev) => prev === 'dark' ? 'light' : 'dark') }}>{children}</AppContext.Provider>;
};

export const useApp = () => { const context = useContext(AppContext); if (!context) throw new Error('useApp must be used within an AppProvider'); return context; };
