import { describe, expect, it } from 'vitest';
import {
  decodeCustomerNameCursor,
  decodeCoverageCandidateCursor,
  decodeListCursor,
  encodeCustomerNameCursor,
  encodeCoverageCandidateCursor,
  encodeListCursor,
} from '../../src/common/list-cursor.js';

describe('list cursor', () => {
  it('round-trips a timestamp and stable id without exposing raw JSON in the URL', () => {
    const encoded = encodeListCursor(new Date('2026-09-04T00:00:00.000Z'), 'customer-2');
    expect(encoded).not.toContain('{');
    expect(decodeListCursor(encoded)).toEqual({ value: '2026-09-04T00:00:00.000Z', id: 'customer-2' });
  });

  it('rejects malformed cursors safely', () => {
    expect(decodeListCursor('not-a-cursor')).toBeNull();
    expect(decodeListCursor('')).toBeNull();
    expect(
      decodeListCursor(Buffer.from(JSON.stringify({ value: 'invalid-date', id: 'x' })).toString('base64url')),
    ).toBeNull();
  });

  it('round-trips a customer name cursor and rejects oversized names', () => {
    const cursor = encodeCustomerNameCursor('Nama Customer', 'customer-2');
    expect(decodeCustomerNameCursor(cursor)).toEqual({ name: 'Nama Customer', id: 'customer-2' });
    expect(decodeCustomerNameCursor(encodeCustomerNameCursor('n'.repeat(256), 'customer-2'))).toBeNull();
  });

  it('round-trips a coverage priority cursor including a null location timestamp', () => {
    const cursor = encodeCoverageCandidateCursor(2, null, 'session-2');
    expect(decodeCoverageCandidateCursor(cursor)).toEqual({
      priority: 2,
      locationVerifiedAt: null,
      id: 'session-2',
    });
    expect(decodeCoverageCandidateCursor(encodeCoverageCandidateCursor(5, null, 'session-2'))).toBeNull();
  });
});
