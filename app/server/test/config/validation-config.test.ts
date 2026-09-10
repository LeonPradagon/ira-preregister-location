import { describe, expect, it } from 'vitest';
import {
  MAX_WHATSAPP_DAILY_SEND_LIMIT,
  normalizeWhatsAppDailySendLimit,
} from '../../src/config/validation-config.service.js';

describe('validation configuration limits', () => {
  it('normalizes the WhatsApp daily limit within the absolute safety boundary', () => {
    expect(normalizeWhatsAppDailySendLimit(2500)).toBe(2500);
    expect(normalizeWhatsAppDailySendLimit(25000)).toBe(MAX_WHATSAPP_DAILY_SEND_LIMIT);
    expect(normalizeWhatsAppDailySendLimit(0)).toBe(1);
    expect(normalizeWhatsAppDailySendLimit('invalid')).toBe(1000);
  });
});
