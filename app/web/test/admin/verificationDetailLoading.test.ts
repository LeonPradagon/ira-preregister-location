import { describe, expect, it } from 'vitest';
import { withTimeout } from '../../src/lib/async';

describe('verification detail loading', () => {
  it('rejects when the detail request does not settle before the UI timeout', async () => {
    await expect(withTimeout(new Promise(() => undefined), 5, 'Detail sesi terlalu lama dimuat')).rejects.toThrow(
      'Detail sesi terlalu lama dimuat',
    );
  });
});
