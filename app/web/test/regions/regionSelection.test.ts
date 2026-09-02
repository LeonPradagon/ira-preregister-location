import { describe, expect, it } from 'vitest';
import { findRegionOption, regionOptionValue } from '../../src/lib/regionSelection';

describe('region selection', () => {
  it('matches region names when the provider includes trailing whitespace', () => {
    const options = [{ code: '31.72', name: 'Kota Administrasi Jakarta Utara ' }];

    expect(findRegionOption(options, 'Kota Administrasi Jakarta Utara')?.code).toBe('31.72');
    expect(regionOptionValue(options[0])).toBe('Kota Administrasi Jakarta Utara');
  });
});
