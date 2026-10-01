import { describe, expect, it } from 'vitest';
import { safeCsvCell } from '../../../src/modules/admin/csv-cell.js';

describe('CSV cell safety', () => {
  it.each(['=1+1', '+SUM(A1:A2)', '-1+2', '@SUM(A1)', ' \t=1+1', '\uFEFF=1+1'])(
    'neutralizes spreadsheet formula %s',
    (value) => {
    expect(safeCsvCell(value)).toBe(`'${value}`);
    },
  );

  it('keeps regular text and applies CSV quoting after neutralization', () => {
    expect(safeCsvCell('IRA, "Internet Rakyat"')).toBe('"IRA, ""Internet Rakyat"""');
    expect(safeCsvCell('Customer')).toBe('Customer');
  });
});
