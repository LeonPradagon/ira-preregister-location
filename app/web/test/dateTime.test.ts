import { describe, expect, it } from 'vitest';
import { formatAppDateTime } from '../src/lib/dateTime';

describe('formatAppDateTime', () => {
  it('formats reminder timestamps in Jakarta time regardless of device timezone', () => {
    expect(formatAppDateTime('2026-09-11T07:48:00.000Z')).toBe('Sep 11, 2026, 2:48 PM');
  });

  it('returns a placeholder for missing or invalid timestamps', () => {
    expect(formatAppDateTime()).toBe('—');
    expect(formatAppDateTime('not-a-date')).toBe('—');
  });
});
