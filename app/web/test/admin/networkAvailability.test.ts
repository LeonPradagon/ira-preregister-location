import { describe, expect, it } from 'vitest';
import { fwaCoverageLabel, networkAvailabilityLabel } from '../../src/lib/networkAvailability';

describe('networkAvailabilityLabel', () => {
  it('uses the latest FWA check before stale imported network status', () => {
    expect(networkAvailabilityLabel('COVERED', 'NOT COVERED BTS')).toBe('customers.coverageAvailable');
    expect(networkAvailabilityLabel('UNCOVERED', 'COVERED BTS')).toBe('customers.coverageUnavailable');
  });

  it('falls back to imported network status before a live check exists', () => {
    expect(networkAvailabilityLabel(null, 'COVERED BTS')).toBe('customers.coverageAvailable');
    expect(networkAvailabilityLabel('NOT_CHECKED', 'NOT COVERED BTS')).toBe('customers.coverageUnavailable');
  });

  it('shows the live FWA result instead of an empty imported FWA field', () => {
    expect(fwaCoverageLabel('UNCOVERED', null)).toBe('coverage.status.UNCOVERED');
    expect(fwaCoverageLabel('COVERED', 'Not Coverage')).toBe('coverage.status.COVERED');
    expect(fwaCoverageLabel('NOT_CHECKED', null)).toBe('—');
  });
});
