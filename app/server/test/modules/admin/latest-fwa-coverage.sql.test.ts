import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { latestFwaCoverageValue } from '../../../src/modules/coverage/latest-fwa-coverage.sql.js';

describe('latest FWA coverage query', () => {
  it.each([
    ['customer', 'customer_id', 'customers'],
    ['address', 'address_id', 'customer_addresses'],
    ['session', 'verification_session_id', 'verification_sessions'],
  ] as const)('qualifies the outer %s ID in the correlated subquery', (owner, ownerKey, table) => {
    const query = new PgDialect().sqlToQuery(latestFwaCoverageValue(owner, 'status'));

    expect(query.sql).toContain(`latest_check.${ownerKey} = "${table}"."id"`);
    expect(query.sql).toContain("latest_check.provider_key = 'FWA'");
  });
});
