import JSZip from 'jszip';

export const MAX_XLSX_COMPRESSED_BYTES = 50 * 1024 * 1024;
export const MAX_XLSX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
export const MAX_XLSX_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_XLSX_ENTRIES = 5000;

export function assertSafeXlsxEntries(files) {
  const entries = Object.values(files).filter((file) => !file.dir);
  if (entries.length > MAX_XLSX_ENTRIES) {
    throw new Error(`Workbook berisi terlalu banyak item (maksimal ${MAX_XLSX_ENTRIES}).`);
  }

  let totalUncompressedBytes = 0;
  for (const file of entries) {
    const size = file._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Workbook memiliki metadata ZIP yang tidak valid.');
    if (size > MAX_XLSX_ENTRY_BYTES) throw new Error('Item workbook terlalu besar untuk diproses dengan aman.');
    totalUncompressedBytes += size;
    if (totalUncompressedBytes > MAX_XLSX_UNCOMPRESSED_BYTES) {
      throw new Error('Ukuran hasil ekstraksi workbook melebihi batas aman.');
    }
  }
}

export async function loadSafeXlsxArchive(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_XLSX_COMPRESSED_BYTES) {
    throw new Error('Ukuran file XLSX melebihi batas aman.');
  }
  const archive = await JSZip.loadAsync(buffer);
  assertSafeXlsxEntries(archive.files);
  return archive;
}
