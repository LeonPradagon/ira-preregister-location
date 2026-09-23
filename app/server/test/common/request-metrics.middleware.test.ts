import { describe, expect, it } from 'vitest';
import { shouldRecordAuditResponse } from '../../src/common/request-metrics.middleware.js';

describe('shouldRecordAuditResponse', () => {
  it('records admin writes and any API error response', () => {
    expect(shouldRecordAuditResponse('/v1/admin/coverage/checks', 'POST', 201)).toBe(true);
    expect(shouldRecordAuditResponse('/v1/admin/customers/missing', 'GET', 404)).toBe(true);
    expect(shouldRecordAuditResponse('/v1/api/auth/sign-in/email', 'POST', 401)).toBe(true);
  });

  it('skips successful read requests', () => {
    expect(shouldRecordAuditResponse('/v1/admin/audit-logs', 'GET', 200)).toBe(false);
    expect(shouldRecordAuditResponse('/v1/health', 'GET', 200)).toBe(false);
  });
});
