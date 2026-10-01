import { describe, expect, it, vi } from 'vitest';
import {
  claimWhatsAppWebhookEvent,
  createWhatsAppWebhookSignature,
  isFreshWebhookTimestamp,
  validateWhatsAppWebhookRequest,
} from '../../../src/integrations/whatsapp/whatsapp-webhook.guard.js';

const secret = 'webhook-secret-for-tests';
const now = 1_700_000_000_000;
const timestamp = '1700000000';
const eventId = 'event-12345678';
const body = Buffer.from('{"phoneE164":"+628123456789","text":"STOP"}');

describe('WhatsApp webhook replay protection', () => {
  it('accepts a fresh signed request with complete headers', () => {
    const signature = createWhatsAppWebhookSignature(secret, timestamp, eventId, body);
    expect(
      validateWhatsAppWebhookRequest({ secret, timestamp, eventId, signature: `sha256=${signature}` }, body, secret, now),
    ).toBe(true);
  });

  it('rejects stale timestamps, invalid signatures, altered bodies, and malformed event IDs', () => {
    const signature = createWhatsAppWebhookSignature(secret, timestamp, eventId, body);
    expect(isFreshWebhookTimestamp('1699999000', now)).toBe(false);
    expect(validateWhatsAppWebhookRequest({ secret, timestamp, eventId, signature }, body, secret, now)).toBe(true);
    expect(validateWhatsAppWebhookRequest({ secret, timestamp, eventId, signature }, Buffer.from('tampered'), secret, now)).toBe(false);
    expect(validateWhatsAppWebhookRequest({ secret, timestamp, eventId: 'bad id', signature }, body, secret, now)).toBe(false);
    expect(validateWhatsAppWebhookRequest({ secret: 'wrong', timestamp, eventId, signature }, body, secret, now)).toBe(false);
  });

  it('claims event IDs atomically with Redis NX and rejects duplicate deliveries', async () => {
    const set = vi.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const store = { set } as never;

    await expect(claimWhatsAppWebhookEvent(store, eventId)).resolves.toBe(true);
    await expect(claimWhatsAppWebhookEvent(store, eventId)).resolves.toBe(false);
    expect(set).toHaveBeenCalledWith(expect.stringMatching(/^webhook:whatsapp:replay:[a-f0-9]{64}$/), '1', 'EX', 600, 'NX');
  });
});
