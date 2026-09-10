import { describe, expect, it } from 'vitest';
import {
  shouldAuditImportedCoordinate,
  shouldAutoVerifyCoordinateAudit,
} from '../../../src/modules/validation/coordinate-audit.policy.js';

describe('coordinate audit policy', () => {
  it('does not audit an imported coordinate when the customer is already verified', () => {
    expect(
      shouldAuditImportedCoordinate({
        customerStatus: 'VERIFIED',
        referenceSource: 'PREREG_IMPORT',
        coordinateAuditStatus: 'PENDING',
        hasReferenceLocation: true,
      }),
    ).toBe(false);
  });

  it('audits a pending imported coordinate for an unverified customer', () => {
    expect(
      shouldAuditImportedCoordinate({
        customerStatus: 'ACTIVE',
        referenceSource: 'PREREG_IMPORT',
        coordinateAuditStatus: 'PENDING',
        hasReferenceLocation: true,
      }),
    ).toBe(true);
  });

  it('auto-verifies only a coordinate audit that matched the address', () => {
    expect(shouldAutoVerifyCoordinateAudit('MATCHED')).toBe(true);
    expect(shouldAutoVerifyCoordinateAudit('UNCERTAIN')).toBe(false);
    expect(shouldAutoVerifyCoordinateAudit('MISMATCH')).toBe(false);
  });
});
