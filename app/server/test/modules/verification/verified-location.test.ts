import { describe, expect, it } from 'vitest';
import { buildVerifiedAddressReference } from '../../../src/modules/verification/verified-location.js';

describe('verified location persistence', () => {
  it('promotes the captured GPS point to the active address reference', () => {
    expect(buildVerifiedAddressReference(-6.2146268, 106.8451304)).toEqual({
      referenceLocation: { latitude: -6.2146268, longitude: 106.8451304 },
      referenceSource: 'MASTER_COORDINATE',
      referencePrecision: 'HOUSE',
      referenceConfidence: '0.980',
    });
  });
});
