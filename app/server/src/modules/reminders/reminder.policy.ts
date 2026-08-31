export const MAX_REMINDERS_PER_SESSION = 3;

export type ReminderPreference = 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING' | 'DEFAULT';

export function nextReminderNumber(current: number, max = MAX_REMINDERS_PER_SESSION): number | null {
  if (current >= max) return null;
  return current + 1;
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
