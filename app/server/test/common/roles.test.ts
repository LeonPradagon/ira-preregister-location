import { describe, expect, it } from 'vitest';
import { roleCan } from '../../src/auth/roles.guard.js';

describe('data export authorization', () => {
  it('restricts bulk exports to administrators', () => {
    expect(roleCan('SUPER_ADMIN', 'exportData')).toBe(true);
    expect(roleCan('ADMIN', 'exportData')).toBe(true);
    expect(roleCan('REVIEWER', 'exportData')).toBe(false);
    expect(roleCan('VIEWER', 'exportData')).toBe(false);
  });
});
