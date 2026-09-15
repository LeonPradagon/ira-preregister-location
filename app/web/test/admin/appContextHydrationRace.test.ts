import { describe, expect, it } from 'vitest';
import { mergeCachedRecords } from '../../src/context/AppContext';

describe('admin cache hydration', () => {
  it('keeps a detail loaded before the initial list response finishes', () => {
    const detail = { id: 'detail-session', customerId: 'detail-customer' };
    const firstPage = [{ id: 'first-page-session', customerId: 'other-customer' }];

    const afterDetailLoad = mergeCachedRecords([], [detail]);
    const afterLateHydration = mergeCachedRecords(afterDetailLoad, firstPage);

    expect(afterLateHydration).toContainEqual(detail);
  });

  it('does not duplicate records when the same id is present', () => {
    const current = [{ id: 'session-1', value: 'detail' }];
    const incoming = [{ id: 'session-1', value: 'list' }];

    expect(mergeCachedRecords(current, incoming)).toEqual(incoming);
  });
});
