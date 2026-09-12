import { describe, expect, it } from 'vitest';
import { coordinateAuditEnqueueLimit } from '../../../src/modules/validation/coordinate-audit-queue.policy.js';

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
});
