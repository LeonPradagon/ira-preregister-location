import { describe, expect, it } from 'vitest';
import {
  formatAppDate,
  formatAppDateTime,
  formatAppTime,
  parseAppDateTimeLocalValue,
  toAppDateTimeLocalValue,
} from '../src/lib/dateTime';

describe('formatAppDateTime', () => {
  it('formats reminder timestamps in Jakarta time regardless of device timezone', () => {
    expect(formatAppDateTime('2026-09-11T07:48:00.000Z')).toBe('11 Sep 2026, 14.48 WIB');
    expect(formatAppDate('2026-09-11T17:48:02.506Z')).toBe('12 Sep 2026');
    expect(formatAppTime('2026-09-11T17:48:02.506Z')).toBe('00.48.02 WIB');
  });

  it('uses Jakarta time for datetime-local reminder inputs', () => {
    const date = new Date('2026-09-11T17:48:02.506Z');
    expect(toAppDateTimeLocalValue(date)).toBe('2026-09-12T00:48');
    expect(parseAppDateTimeLocalValue('2026-09-12T00:48').toISOString()).toBe('2026-09-11T17:48:00.000Z');
  });

  it('returns a placeholder for missing or invalid timestamps', () => {
    expect(formatAppDateTime()).toBe('—');
    expect(formatAppDateTime('not-a-date')).toBe('—');
  });
});
