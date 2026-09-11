export const APP_TIMEZONE = 'Asia/Jakarta';
export const APP_TIMEZONE_LABEL = 'WIB';

type DateInput = string | Date;

function parseDate(value?: DateInput): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimeZoneParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

export function formatAppDateTime(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '—';
  return `${date.toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: APP_TIMEZONE,
  })} ${APP_TIMEZONE_LABEL}`;
}

export function formatAppDate(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('id-ID', { dateStyle: 'medium', timeZone: APP_TIMEZONE });
}

export function formatAppTime(value?: DateInput): string {
  const date = parseDate(value);
  if (!date) return '—';
  return `${date.toLocaleTimeString('id-ID', { timeStyle: 'medium', timeZone: APP_TIMEZONE })} ${APP_TIMEZONE_LABEL}`;
}

export function toAppDateTimeLocalValue(date: Date): string {
  const parts = getTimeZoneParts(date);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

export function parseAppDateTimeLocalValue(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour, minute] = match;
  const target = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  const observed = getTimeZoneParts(new Date(target));
  const observedUtc = Date.UTC(observed.year, observed.month - 1, observed.day, observed.hour, observed.minute);
  return new Date(target + (target - observedUtc));
}
