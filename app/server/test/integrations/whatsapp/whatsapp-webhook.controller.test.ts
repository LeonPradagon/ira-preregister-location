import { describe, expect, it } from 'vitest';
import { normalizeDeliveryPayload } from '../../../src/integrations/whatsapp/whatsapp-webhook.controller.js';

describe('WhatsApp webhook payload normalization', () => {
  it('normalizes a direct provider status payload into the campaign status shape', () => {
    expect(
      normalizeDeliveryPayload({
        id: 'broadcast-1',
        status: 'delivered',
        timestamp: '1700000000',
      }),
    ).toEqual({
      providerMessageId: 'broadcast-1',
      status: 'DELIVERED',
      error: undefined,
      errorCode: undefined,
      occurredAt: '2023-11-14T22:13:20.000Z',
    });
  });
});
