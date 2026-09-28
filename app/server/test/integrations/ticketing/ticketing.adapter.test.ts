import { describe, expect, it, vi } from 'vitest';
import { TicketingAdapter } from '../../../src/integrations/ticketing/ticketing.adapter.js';

describe('TicketingAdapter', () => {
  it('posts the envelope to configured endpoint with API key and idempotency key', async () => {
    const post = vi.fn().mockResolvedValue({ status: 201, data: { ticket_id: 'TCK-1' } });
    const adapter = new TicketingAdapter({ post, get: vi.fn() }, 'https://ticketing.test/v1/tickets', 'secret-key', 8000);
    const envelope = {
      platform: 'IRA-PREREGIST',
      payload: { title: 'Test ticket' },
      entity: { entity_kind: 'Customer' },
      osp_data: null,
      mitra_data: null,
    };

    await expect(adapter.createTicket(envelope)).resolves.toEqual({ httpStatus: 201, data: { ticket_id: 'TCK-1' } });
    expect(post).toHaveBeenCalledWith('https://ticketing.test/v1/tickets', envelope, {
      timeout: 8000,
      headers: {
        'x-api-key': 'secret-key',
        'Content-Type': 'application/json',
      },
    });
  });

  it('searches provider status with platform and entity code', async () => {
    const get = vi.fn().mockResolvedValue({ status: 200, data: { data: [] } });
    const adapter = new TicketingAdapter({ post: vi.fn(), get }, 'https://ticketing.test/v1/tickets', 'secret-key', 8000);

    await expect(adapter.searchTickets({ platform: 'IRA Preregist', entityCode: 'DUMMY-001' })).resolves.toEqual({
      httpStatus: 200,
      data: { data: [] },
    });
    expect(get).toHaveBeenCalledWith('https://ticketing.test/v1/tickets/search', {
      params: { platform: 'IRA Preregist', entityCode: 'DUMMY-001' },
      timeout: 8000,
      headers: {
        'x-api-key': 'secret-key',
        'Content-Type': 'application/json',
      },
    });
  });
});
