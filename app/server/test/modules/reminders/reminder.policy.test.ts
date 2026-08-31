import { describe, expect, it } from 'vitest';
import { nextReminderNumber, scheduleReminder, scheduleReminderInTimezone } from '../../../src/modules/reminders/reminder.policy.js';

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

  it('schedules tonight using the configured timezone', () => {
    const from = new Date('2026-01-01T08:00:00.000Z');
    expect(scheduleReminderInTimezone('TONIGHT', from, 'Asia/Jakarta').toISOString()).toBe('2026-01-01T13:00:00.000Z');
  });

  it('schedules tomorrow morning using the configured timezone', () => {
    const from = new Date('2026-01-01T08:00:00.000Z');
    expect(scheduleReminderInTimezone('TOMORROW_MORNING', from, 'Asia/Jakarta').toISOString()).toBe('2026-01-02T02:00:00.000Z');
  });
});
