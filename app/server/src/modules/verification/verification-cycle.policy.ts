const completedStatus = 'LOCATION_VALID';

export function canRestartVerificationCycle(
  status: string | null | undefined,
  attemptCount: number,
  reminderCount: number,
  maxAttempts: number,
  maxReminders: number,
): boolean {
  return (
    attemptCount >= maxAttempts &&
    reminderCount >= maxReminders &&
    String(status ?? '').trim().toUpperCase() !== completedStatus
  );
}
