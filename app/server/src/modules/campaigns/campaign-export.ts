import ExcelJS from 'exceljs';

export type CampaignExportValue = string | number | boolean | null;
export type CampaignExportRow = Record<string, CampaignExportValue>;

export const CAMPAIGN_DETAIL_COLUMNS = [
  ['campaign_name', 'Nama campaign'],
  ['campaign_status', 'Status campaign'],
  ['customer_external_id', 'ID pelanggan'],
  ['customer_name', 'Nama pelanggan'],
  ['phone_number', 'Nomor HP'],
  ['customer_status', 'Status pelanggan'],
  ['original_address', 'Alamat saat pengiriman'],
  ['current_address', 'Alamat yang digunakan'],
  ['coverage_fwa', 'Coverage FWA'],
  ['coverage_ftth', 'Coverage FTTH'],
  ['delivery_status', 'Status pengiriman WhatsApp'],
  ['scheduled_at', 'Jadwal pengiriman'],
  ['sent_at', 'Waktu terkirim'],
  ['delivered_at', 'Waktu diterima'],
  ['read_at', 'Waktu dibaca'],
  ['delivery_error', 'Keterangan jika gagal'],
  ['session_status', 'Status pemeriksaan lokasi'],
  ['customer_confirmation_status', 'Konfirmasi data pelanggan'],
  ['link_opened_at', 'Waktu link dibuka'],
  ['address_changed', 'Alamat berubah'],
  ['gps_received', 'Lokasi HP diterima'],
  ['location_valid', 'Lokasi sesuai'],
  ['manual_review', 'Perlu pemeriksaan tim'],
  ['attempt_count', 'Jumlah percobaan lokasi'],
  ['reminder_count', 'Jumlah reminder dipilih'],
  ['reminder_sent_count', 'Jumlah reminder terkirim'],
  ['reminder_last_sent_at', 'Reminder terakhir terkirim'],
] as const;

export const CAMPAIGN_DETAIL_HEADERS = CAMPAIGN_DETAIL_COLUMNS.map(([, header]) => header);
export const CAMPAIGN_SUMMARY_HEADERS = ['Keterangan', 'Nilai'] as const;

export const campaignExportStatusLabels: Record<string, string> = {
  DRAFT: 'Draft',
  RUNNING: 'Sedang berjalan',
  PAUSED: 'Dijeda',
  COMPLETED: 'Selesai',
  PENDING: 'Menunggu dikirim',
  PROCESSING: 'Sedang dikirim',
  SENT: 'Sudah diterima sistem',
  DELIVERED: 'Terkirim',
  READ: 'Sudah dibaca',
  FAILED: 'Gagal dikirim',
  PROVIDER_UNAVAILABLE: 'Layanan pengiriman belum tersedia',
  OPTED_OUT: 'Pengiriman dihentikan',
  CREATED: 'Belum mulai',
  MESSAGE_SENT: 'Undangan terkirim',
  LINK_OPENED: 'Link dibuka',
  CONSENTED: 'Menunggu izin lokasi',
  CUSTOMER_DATA_MISMATCH: 'Data pelanggan tidak sesuai',
  GPS_CAPTURING: 'Sedang mengambil lokasi',
  LOW_GPS_ACCURACY: 'Akurasi lokasi rendah',
  LOCATION_MISMATCH: 'Lokasi belum sesuai',
  WAITING_FOR_HOME: 'Menunggu pelanggan di alamat',
  REMINDER_REQUIRED: 'Menunggu reminder',
  REMINDER_LIMIT_REACHED: 'Batas reminder tercapai',
  ADDRESS_EDITING: 'Sedang mengubah alamat',
  ADDRESS_PROPOSED: 'Alamat baru diajukan',
  MANUAL_REVIEW: 'Perlu diperiksa tim',
  LOCATION_VALID: 'Lokasi sesuai',
  EXPIRED: 'Link kedaluwarsa',
  ACTIVE: 'Aktif',
  PENDING_INSTALLATION: 'Menunggu pemasangan',
  SUSPENDED: 'Ditangguhkan',
  VERIFIED: 'Terverifikasi',
  UNCONFIRMED: 'Belum dikonfirmasi',
  CONFIRMED: 'Sudah dikonfirmasi',
  MISMATCH: 'Data tidak sesuai',
};

const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const csvContentType = 'text/csv; charset=utf-8';
const omittedSummaryFields = new Set(['Sudah terkirim', 'Sudah dibaca']);

const dateColumns = new Set([
  'campaign_scheduled_at',
  'scheduled_at',
  'processing_started_at',
  'sent_at',
  'delivered_at',
  'read_at',
  'failed_at',
  'link_opened_at',
  'customer_confirmed_at',
  'consent_at',
  'location_verified_at',
  'completed_at',
  'session_expires_at',
  'latest_gps_server_timestamp',
  'latest_gps_device_timestamp',
  'validation_created_at',
  'reminder_last_sent_at',
]);

const csvCell = (value: CampaignExportValue): string => {
  if (value == null) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
};

const csvEscape = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;

export function createCampaignCsv(rows: CampaignExportRow[]): Buffer {
  const lines = [CAMPAIGN_DETAIL_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(CAMPAIGN_DETAIL_COLUMNS.map(([key]) => csvEscape(csvCell(row[key]))).join(','));
  }
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

function cellValue(value: CampaignExportValue): string | number | boolean {
  return value == null ? '' : value;
}

function excelColumnName(columnNumber: number): string {
  let value = columnNumber;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function addTableSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  columns: readonly (readonly [string, string])[],
  rows: CampaignExportRow[],
) {
  const keys = columns.map(([key]) => key);
  const headers = columns.map(([, header]) => header);
  const worksheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  worksheet.columns = columns.map(([key, header]) => ({
    header,
    key,
    width: Math.min(Math.max(header.length + 4, 16), 42),
  }));
  for (const row of rows) worksheet.addRow(keys.map((key) => cellValue(row[key])));
  const header = worksheet.getRow(1);
  header.height = 32;
  header.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const headerName = keys[columnNumber - 1];
      cell.alignment = { vertical: 'top', wrapText: false };
      if (dateColumns.has(headerName)) cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
      if (headerName.endsWith('_latitude') || headerName.endsWith('_longitude')) cell.numFmt = '0.0000000';
    });
  }
  worksheet.autoFilter = { from: 'A1', to: `${excelColumnName(headers.length)}1` };
  return worksheet;
}

export async function createCampaignXlsx(
  summaryRows: CampaignExportRow[],
  detailRows: CampaignExportRow[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IRA Preregist';
  const summary = workbook.addWorksheet('Campaign Summary');
  summary.columns = [{ header: CAMPAIGN_SUMMARY_HEADERS[0], key: 'field', width: 34 }, { header: CAMPAIGN_SUMMARY_HEADERS[1], key: 'value', width: 72 }];
  for (const row of summaryRows) {
    if (omittedSummaryFields.has(String(row.field ?? ''))) continue;
    summary.addRow([row.field ?? '', row.value ?? '']);
  }
  summary.getRow(1).eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  summary.views = [{ state: 'frozen', ySplit: 1 }];
  addTableSheet(workbook, 'Data Penerima', CAMPAIGN_DETAIL_COLUMNS, detailRows);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export const campaignExportContentTypes = { xlsx: xlsxContentType, csv: csvContentType } as const;
