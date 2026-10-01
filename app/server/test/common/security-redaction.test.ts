import { describe, expect, it } from 'vitest';
import { redactLogValue } from '../../src/common/structured-log.js';
import { normalizeRequestPath } from '../../src/common/request-metrics.middleware.js';

describe('security-sensitive log redaction', () => {
  it('redacts secret fields, bearer credentials, query secrets, and verification URLs', () => {
    expect(
      redactLogValue({
        authorization: 'Bearer admin-token',
        error: 'GET /v1/public/verifications/id.secret?token=query-secret and Bearer opaque-value',
        providerUrl: 'https://example.test/callback?api_key=private',
      }),
    ).toEqual({
      authorization: '[REDACTED]',
      error: 'GET /v1/public/verifications/[REDACTED]?token=[REDACTED] and Bearer [REDACTED]',
      providerUrl: 'https://example.test/callback?api_key=[REDACTED]',
    });
  });

  it('normalizes verification tokens before metrics or audit paths are recorded', () => {
    expect(normalizeRequestPath('/v1/public/verifications/id.secret/address-status')).toBe(
      '/v1/public/verifications/:token/address-status',
    );
  });
});
