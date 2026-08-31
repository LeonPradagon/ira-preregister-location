import { describe, expect, it, vi } from 'vitest';
import { HttpWhatsAppAdapter } from './http-whatsapp.adapter.js';

describe('HTTP WhatsApp adapter', () => {
  it('returns a stable provider message id', async () => {
    process.env.WHATSAPP_BASE_URL = 'https://whatsapp.test';
    process.env.WHATSAPP_TEMPLATE_NAME = 'location_verification';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({ id: 'provider-message-1' }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new HttpWhatsAppAdapter().send({ phoneE164: '+628111111111', templateName: 'location_verification', templateParameters: ['Customer', 'https://example.test/v/token'], idempotencyKey: 'test-1' });
    expect(result.providerMessageId).toBe('provider-message-1');
    expect(fetchMock).toHaveBeenCalledOnce();
    delete process.env.WHATSAPP_BASE_URL;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    vi.unstubAllGlobals();
  });

  it('does not treat a response without provider id as a successful send', async () => {
    process.env.WHATSAPP_BASE_URL = 'https://whatsapp.test';
    process.env.WHATSAPP_TEMPLATE_NAME = 'location_verification';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 202, json: async () => ({}) }));
    await expect(new HttpWhatsAppAdapter().send({ phoneE164: '+628111111111', idempotencyKey: 'test-no-provider-id' })).rejects.toThrow('did not return a message id');
    delete process.env.WHATSAPP_BASE_URL;
    delete process.env.WHATSAPP_TEMPLATE_NAME;
    vi.unstubAllGlobals();
  });
});
