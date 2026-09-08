import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerHttpClient } from '../../../src/common/http/provider-http.client.js';
import { MekariWhatsAppAdapter } from '../../../src/integrations/whatsapp/mekari-whatsapp.adapter.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.WHATSAPP_BASE_URL;
  delete process.env.WHATSAPP_MEKARI_CLIENT_ID;
  delete process.env.WHATSAPP_MEKARI_CLIENT_SECRET;
  delete process.env.WHATSAPP_MESSAGE_TEMPLATE_ID;
  delete process.env.WHATSAPP_CHANNEL_INTEGRATION_ID;
  delete process.env.WHATSAPP_TEMPLATE_PARAMETER_NAMES;
});

describe('Mekari WhatsApp adapter', () => {
  it('creates a Qontak direct broadcast request', async () => {
    process.env.WHATSAPP_BASE_URL = 'https://api.mekari.com/qontak/chat/v1';
    process.env.WHATSAPP_MEKARI_CLIENT_ID = 'client-id';
    process.env.WHATSAPP_MEKARI_CLIENT_SECRET = 'client-secret';
    process.env.WHATSAPP_MESSAGE_TEMPLATE_ID = 'template-id';
    process.env.WHATSAPP_CHANNEL_INTEGRATION_ID = 'channel-id';
    process.env.WHATSAPP_TEMPLATE_PARAMETER_NAMES = 'name,link';
    const postMock = vi.spyOn(providerHttpClient, 'post').mockResolvedValue({ data: { id: 'broadcast-1' } } as never);

    const result = await new MekariWhatsAppAdapter().send({
      phoneE164: '+628111111111',
      recipientName: 'Customer',
      templateParameters: ['Customer', 'https://example.test/v/token'],
      idempotencyKey: 'test-1',
    });

    expect(result.providerMessageId).toBe('broadcast-1');
    const [url, rawBody, requestConfig] = postMock.mock.calls[0];
    expect(url).toBe('https://api.mekari.com/qontak/chat/v1/broadcasts/whatsapp/direct');
    expect(JSON.parse(String(rawBody))).toEqual({
      to_name: 'Customer',
      to_number: '628111111111',
      message_template_id: 'template-id',
      channel_integration_id: 'channel-id',
      language: { code: 'id' },
      parameters: {
        buttons: [],
        body: [
          { key: '1', value: 'name', value_text: 'Customer' },
          { key: '2', value: 'link', value_text: 'https://example.test/v/token' },
        ],
      },
    });
    expect(requestConfig).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: expect.stringContaining('hmac username="client-id"'),
          digest: expect.stringMatching(/^SHA-256=/),
        }),
      }),
    );
  });
});
