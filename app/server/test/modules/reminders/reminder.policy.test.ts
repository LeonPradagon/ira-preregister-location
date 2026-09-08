import { describe, expect, it } from 'vitest';
import {
  automaticReminderTimes,
  isReminderScheduledBeforeSessionExpiry,
  nextAutomaticReminderAt,
  nextReminderNumber,
  reminderLinkExpiresAt,
  scheduleReminder,
  scheduleReminderInTimezone,
  spreadReminderTimes,
} from '../../../src/modules/reminders/reminder.policy.js';

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
    expect(scheduleReminderInTimezone('TOMORROW_MORNING', from, 'Asia/Jakarta').toISOString()).toBe(
      '2026-01-02T02:00:00.000Z',
    );
  });

  it('expires a reminder link at the first of its TTL or session expiry', () => {
    const sentAt = new Date('2026-01-01T10:00:00.000Z');
    expect(reminderLinkExpiresAt(sentAt, new Date('2026-01-03T00:00:00.000Z'), 24).toISOString()).toBe(
      '2026-01-02T10:00:00.000Z',
    );
    expect(reminderLinkExpiresAt(sentAt, new Date('2026-01-01T18:00:00.000Z'), 24).toISOString()).toBe(
      '2026-01-01T18:00:00.000Z',
    );
  });

  it('does not allow scheduling after the verification session expires', () => {
    const expiry = new Date('2026-01-03T00:00:00.000Z');
    expect(isReminderScheduledBeforeSessionExpiry(new Date('2026-01-02T23:59:00.000Z'), expiry)).toBe(true);
    expect(isReminderScheduledBeforeSessionExpiry(expiry, expiry)).toBe(false);
  });

  it('spreads the remaining reminders across the selected range', () => {
    const start = new Date('2026-01-01T10:00:00.000Z');
    const until = new Date('2026-01-03T10:00:00.000Z');
    expect(spreadReminderTimes(start, until, 3).map((time) => time.toISOString())).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-02T10:00:00.000Z',
      '2026-01-03T10:00:00.000Z',
    ]);
  });

  it('creates three reminders from one selected time two days apart', () => {
    const start = new Date('2026-01-01T10:00:00.000Z');
    const expiry = new Date('2026-01-10T00:00:00.000Z');
    expect(automaticReminderTimes(start, 3, expiry).map((time) => time.toISOString())).toEqual([
      '2026-01-01T10:00:00.000Z',
      '2026-01-03T10:00:00.000Z',
      '2026-01-05T10:00:00.000Z',
    ]);
  });

  it('schedules an unopened follow-up two days later at the same time', () => {
    const previous = new Date('2026-09-01T05:30:00.000Z');
    const expiry = new Date('2026-09-10T00:00:00.000Z');
    expect(nextAutomaticReminderAt(previous, expiry)?.toISOString()).toBe('2026-09-03T05:30:00.000Z');
  });
});
