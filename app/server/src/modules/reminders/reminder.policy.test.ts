import { describe, expect, it } from 'vitest';
import { nextReminderNumber, scheduleReminder } from './reminder.policy.js';

describe('reminder policy', () => {
  it('caps reminders at three per session', () => {
    expect(nextReminderNumber(0)).toBe(1);
    expect(nextReminderNumber(2)).toBe(3);
    expect(nextReminderNumber(3)).toBeNull();
  });

  it('schedules one-hour reminders from the supplied clock', () => {
    const from = new Date('2026-01-01T10:00:00.000Z');
    expect(scheduleReminder('IN_1_HOUR', from).toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });
});
