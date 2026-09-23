import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, auditRows } = vi.hoisted(() => ({
  auditRows: [] as Array<Record<string, unknown>>,
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
}));

vi.mock('../../../src/db/client.js', () => ({ db }));

import { WhatsAppComplianceService } from '../../../src/integrations/whatsapp/whatsapp-compliance.service.js';

describe('WhatsAppComplianceService opt-out audit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditRows.length = 0;
    const customer = { id: 'customer-1', phoneE164: '+628123456789' };
    db.select.mockImplementation(() => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => [customer],
        then: (resolve: (value: (typeof customer)[]) => unknown) => Promise.resolve([customer]).then(resolve),
      };
      return query;
    });
    const insert = {
      values: vi.fn((row: Record<string, unknown>) => {
        auditRows.push(row);
        return Promise.resolve(undefined);
      }),
    };
    const update = {
      set: () => update,
      where: () => update,
      returning: async () => [],
    };
    const tx = {
      update: vi.fn(() => update),
      insert: vi.fn(() => insert),
    };
    db.transaction.mockImplementation((run) => run(tx));
  });

  it('uses the same transaction and preserves the source in both audit paths', async () => {
    const service = new WhatsAppComplianceService();

    await expect(service.recordInbound('+628123456789', 'STOP')).resolves.toMatchObject({
      optedOut: true,
      matched: true,
    });
    await expect(service.optOut('admin-1', 'customer-1')).resolves.toEqual({
      customerId: 'customer-1',
      status: 'OPTED_OUT',
    });

    expect(auditRows.map(({ actorUserId, after }) => [actorUserId, (after as { source: string }).source])).toEqual([
      ['whatsapp-inbound', 'inbound_keyword'],
      ['admin-1', 'admin'],
    ]);
  });
});
