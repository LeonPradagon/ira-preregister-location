import { describe, expect, it } from 'vitest';
import {
  coordinateAuditEnqueueLimit,
  shouldRetryFailedCoordinateAudit,
} from '../../../src/modules/validation/coordinate-audit-queue.policy.js';

describe('coordinate audit queue policy', () => {
  it('fills the queue buffer when no audit jobs are outstanding', () => {
    expect(coordinateAuditEnqueueLimit({}, 500)).toBe(500);
  });

  it('only enqueues the capacity left in the queue buffer', () => {
    expect(coordinateAuditEnqueueLimit({ waiting: 100, active: 25, delayed: 10 }, 500)).toBe(365);
  });

  it('stops refilling once the queue buffer is full', () => {
    expect(coordinateAuditEnqueueLimit({ waiting: 400, active: 50, prioritized: 50 }, 500)).toBe(0);
  });

  it('retries failed audit jobs after the cooldown', () => {
    expect(shouldRetryFailedCoordinateAudit('failed', 1_000, 901_000, 900_000)).toBe(true);
  });

  it('does not retry active, recent, or undated jobs', () => {
    expect(shouldRetryFailedCoordinateAudit('active', 1_000, 901_000, 900_000)).toBe(false);
    expect(shouldRetryFailedCoordinateAudit('failed', 2_000, 901_000, 900_000)).toBe(false);
    expect(shouldRetryFailedCoordinateAudit('failed', undefined, 901_000, 900_000)).toBe(false);
  });
});
