import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createMekariHmacHeaders } from '../../../src/integrations/whatsapp/mekari-hmac.js';

describe('Mekari HMAC authentication', () => {
  it('signs the Date header and request-line exactly as documented', () => {
    const date = 'Tue, 08 Sep 2026 02:00:00 GMT';
    const headers = createMekariHmacHeaders({
      method: 'POST',
      pathWithQuery: '/qontak/chat/v1/broadcasts/whatsapp/direct',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      date,
    });
    const expected = createHmac('sha256', 'client-secret')
      .update(`date: ${date}\nPOST /qontak/chat/v1/broadcasts/whatsapp/direct HTTP/1.1`)
      .digest('base64');

    expect(headers.date).toBe(date);
    expect(headers.authorization).toContain(`username="client-id"`);
    expect(headers.authorization).toContain(`signature="${expected}"`);
  });
});
