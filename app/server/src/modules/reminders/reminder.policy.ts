export const MAX_REMINDERS_PER_SESSION = 3;

export type ReminderPreference = 'IN_1_HOUR' | 'TONIGHT' | 'TOMORROW_MORNING' | 'DEFAULT';

export function nextReminderNumber(current: number, max = MAX_REMINDERS_PER_SESSION): number | null {
  if (current >= max) return null;
  return current + 1;
}

export function scheduleReminder(preference: ReminderPreference, from = new Date()): Date {
  const scheduledAt = new Date(from);
  if (preference === 'IN_1_HOUR') scheduledAt.setTime(scheduledAt.getTime() + 60 * 60 * 1000);
  else if (preference === 'TONIGHT') scheduledAt.setHours(20, 0, 0, 0);
  else scheduledAt.setTime(scheduledAt.getTime() + 24 * 60 * 60 * 1000);
  return scheduledAt;
}
