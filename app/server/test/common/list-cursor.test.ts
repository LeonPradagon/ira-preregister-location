import { describe, expect, it } from 'vitest';
import { decodeListCursor, encodeListCursor } from '../../src/common/list-cursor.js';

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
});
