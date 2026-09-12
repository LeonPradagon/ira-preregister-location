export type CoordinateAuditQueueCounts = Partial<
  Record<'waiting' | 'active' | 'delayed' | 'prioritized' | 'paused', number>
>;

const outstandingStates: Array<keyof CoordinateAuditQueueCounts> = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'paused',
];

export const coordinateAuditEnqueueLimit = (
  counts: CoordinateAuditQueueCounts,
  queueBuffer: number,
): number => {
  const normalizedBuffer = Math.max(0, Math.floor(queueBuffer));
  const outstanding = outstandingStates.reduce((total, state) => total + Number(counts[state] ?? 0), 0);
  return Math.max(0, normalizedBuffer - outstanding);
};
