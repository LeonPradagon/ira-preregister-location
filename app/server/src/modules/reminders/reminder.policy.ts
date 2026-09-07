export const MAX_REMINDERS_PER_SESSION = 3;
export const DEFAULT_REMINDER_LINK_TTL_HOURS = 24;
const AUTOMATIC_REMINDER_INTERVAL_DAYS = 2;
const REMINDER_EXPIRY_BUFFER_MS = 60 * 1000;

export type ReminderPreference = 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING' | 'DEFAULT';

export function nextReminderNumber(current: number, max = MAX_REMINDERS_PER_SESSION): number | null {
  if (current >= max) return null;
  return current + 1;
}

export function reminderLinkExpiresAt(sentAt: Date, sessionExpiresAt: Date, ttlHours = DEFAULT_REMINDER_LINK_TTL_HOURS): Date {
  if (!Number.isFinite(ttlHours) || ttlHours <= 0) throw new Error('Reminder link TTL must be positive');
  return new Date(Math.min(sessionExpiresAt.getTime(), sentAt.getTime() + ttlHours * 60 * 60 * 1000));
}

export function isReminderScheduledBeforeSessionExpiry(scheduledAt: Date, sessionExpiresAt: Date): boolean {
  return scheduledAt < sessionExpiresAt;
}

export function spreadReminderTimes(startAt: Date, untilAt: Date, count: number): Date[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Reminder count must be positive');
  if (untilAt <= startAt) throw new Error('Reminder end must be after reminder start');
  if (count === 1) return [new Date(startAt)];
  const interval = (untilAt.getTime() - startAt.getTime()) / (count - 1);
  return Array.from({ length: count }, (_, index) => new Date(startAt.getTime() + interval * index));
}

export function automaticReminderTimes(startAt: Date, count: number, sessionExpiresAt: Date): Date[] {
  if (!Number.isInteger(count) || count < 1) throw new Error('Reminder count must be positive');
  if (!Number.isFinite(startAt.getTime()) || !Number.isFinite(sessionExpiresAt.getTime()) || startAt >= sessionExpiresAt) {
    throw new Error('Automatic reminder time must be before session expiry');
  }
  if (count === 1) return [new Date(startAt)];
  const latestAllowed = new Date(sessionExpiresAt.getTime() - REMINDER_EXPIRY_BUFFER_MS);
  if (latestAllowed <= startAt) throw new Error('Automatic reminders do not fit before session expiry');
  const preferredEnd = new Date(startAt.getTime() + (count - 1) * AUTOMATIC_REMINDER_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
  return spreadReminderTimes(startAt, preferredEnd < latestAllowed ? preferredEnd : latestAllowed, count);
}

export function nextAutomaticReminderAt(previousScheduledAt: Date, sessionExpiresAt: Date, intervalDays = AUTOMATIC_REMINDER_INTERVAL_DAYS): Date | null {
  if (!Number.isFinite(previousScheduledAt.getTime()) || !Number.isFinite(sessionExpiresAt.getTime())) throw new Error('Automatic reminder time must be valid');
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) throw new Error('Automatic reminder interval must be positive');
  const next = new Date(previousScheduledAt.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  return next < sessionExpiresAt ? next : null;
}

export function scheduleReminder(preference: ReminderPreference, from = new Date()): Date {
  return scheduleReminderInTimezone(preference, from, 'Asia/Jakarta');
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) };
}

function zonedDateToUtc(parts: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  const observed = localParts(new Date(target), timeZone);
  const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
  return new Date(target + (target - observedUtc));
}

export function scheduleReminderInTimezone(preference: ReminderPreference, from = new Date(), timeZone = 'Asia/Jakarta'): Date {
  const scheduledAt = new Date(from);
  if (preference === 'IN_1_HOUR') scheduledAt.setTime(scheduledAt.getTime() + 60 * 60 * 1000);
  else {
    const current = localParts(from, timeZone);
    const target = { ...current, hour: preference === 'TONIGHT' ? 20 : 9, minute: 0 };
    if (preference === 'TONIGHT' && current.hour >= 20) target.day += 1;
    if (preference !== 'TONIGHT') target.day += 1;
    return zonedDateToUtc(target, timeZone);
  }
  return scheduledAt;
}
