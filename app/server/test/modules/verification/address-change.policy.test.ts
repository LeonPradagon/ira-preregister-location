import { describe, expect, it } from 'vitest';
import { canReplaceAddress } from '../../../src/modules/verification/address-change.policy.js';

describe('address change policy', () => {
  it('allows correcting an incomplete proposed address', () => {
    expect(canReplaceAddress('PROPOSED', true)).toBe(true);
  });

  it('blocks changing a complete proposed address', () => {
    expect(canReplaceAddress('PROPOSED', false)).toBe(false);
  });

  it('allows the first address proposal', () => {
    expect(canReplaceAddress('MASTER', false)).toBe(true);
    expect(canReplaceAddress('MASTER', true)).toBe(true);
  });
});
