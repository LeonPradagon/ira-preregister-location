import { createHash } from 'node:crypto';

export const OPT_OUT_KEYWORDS = new Set(['STOP', 'UNSUBSCRIBE', 'BERHENTI', 'BERHENTI WA', 'NO MORE']);
export const WHATSAPP_TIMEZONE = 'Asia/Jakarta';

export function hashPhone(phoneE164: string): string {
  return createHash('sha256').update(phoneE164).digest('hex');
}

export function isOptOutMessage(text: string): boolean {
  return OPT_OUT_KEYWORDS.has(text.trim().toUpperCase());
}

export function nextAllowedSendAt(
  lastSentAt: Date | null,
  minimumIntervalMinutes: number,
  now = new Date(),
): Date | null {
  if (!lastSentAt) return null;
  const next = new Date(lastSentAt.getTime() + minimumIntervalMinutes * 60 * 1000);
  return next > now ? next : null;
}

export function nextUtcMidnight(now = new Date()): Date {
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

export function formatWhatsAppDateTime(value: Date): string {
  return `${new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: WHATSAPP_TIMEZONE,
  }).format(value)} WIB`;
}
