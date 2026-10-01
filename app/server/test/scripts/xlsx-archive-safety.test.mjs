import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  assertSafeXlsxEntries,
  loadSafeXlsxArchive,
  MAX_XLSX_ENTRIES,
  MAX_XLSX_ENTRY_BYTES,
  MAX_XLSX_UNCOMPRESSED_BYTES,
} from '../../scripts/xlsx-archive-safety.mjs';

const zipEntry = (uncompressedSize) => ({ dir: false, _data: { uncompressedSize } });

describe('XLSX archive safety', () => {
  it('accepts a small valid XLSX zip', async () => {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook/>');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    await expect(loadSafeXlsxArchive(buffer)).resolves.toBeDefined();
  });

  it('rejects archives with too many entries', () => {
    const files = Object.fromEntries(Array.from({ length: MAX_XLSX_ENTRIES + 1 }, (_, index) => [`file-${index}`, zipEntry(1)]));
    expect(() => assertSafeXlsxEntries(files)).toThrow(/terlalu banyak item/i);
  });

  it('rejects an oversized expanded entry and total expanded archive', () => {
    expect(() => assertSafeXlsxEntries({ large: zipEntry(MAX_XLSX_ENTRY_BYTES + 1) })).toThrow(/terlalu besar/i);
    expect(() =>
      assertSafeXlsxEntries({
        first: zipEntry(MAX_XLSX_ENTRY_BYTES),
        second: zipEntry(MAX_XLSX_ENTRY_BYTES),
        third: zipEntry(1),
      }),
    ).toThrow(/hasil ekstraksi/i);
  });

  it('rejects entries with missing size metadata', () => {
    expect(() => assertSafeXlsxEntries({ malformed: { dir: false, _data: {} } })).toThrow(/metadata ZIP/i);
  });
});
