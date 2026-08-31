import { describe, expect, it } from 'vitest';
import { hashPhone, isOptOutMessage, nextAllowedSendAt, nextUtcMidnight } from './whatsapp.policy.js';

describe('WhatsApp safety policy', () => {
  it('recognizes explicit opt-out keywords and hashes phone numbers', () => {
    expect(isOptOutMessage(' berhenti ')).toBe(true);
    expect(isOptOutMessage('tolong kirim lagi')).toBe(false);
    expect(hashPhone('+628111111111')).toHaveLength(64);
  });

  it('enforces the recipient cooldown', () => {
    const now = new Date('2026-08-31T10:00:00.000Z');
    expect(nextAllowedSendAt(new Date('2026-08-31T09:30:00.000Z'), 60, now)?.toISOString()).toBe('2026-08-31T10:30:00.000Z');
    expect(nextAllowedSendAt(new Date('2026-08-31T08:00:00.000Z'), 60, now)).toBeNull();
  });

  it('moves daily quota retry to the next UTC day', () => {
    expect(nextUtcMidnight(new Date('2026-08-31T10:00:00.000Z')).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });
});
