import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_DETAIL_HEADERS,
  createCampaignCsv,
  createCampaignXlsx,
  type CampaignExportRow,
} from '../../../src/modules/campaigns/campaign-export.js';

const detailRow: CampaignExportRow = {
  campaign_name: 'Blast September',
  customer_external_id: 'CUST-001',
  customer_name: 'Customer, One',
  delivery_status: 'Sudah diterima sistem',
  delivery_error: null,
};

describe('campaign export builders', () => {
  it('creates an Excel-compatible UTF-8 CSV with all monitoring headers', () => {
    const csv = createCampaignCsv([detailRow]).toString('utf8');
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.replace(/^\uFEFF/, '').split('\r\n')[0]).toBe(CAMPAIGN_DETAIL_HEADERS.join(','));
    expect(csv).toContain('"Customer, One"');
  });

  it('creates an XLSX workbook with summary and detailed monitoring sheets', async () => {
    const workbookBuffer = await createCampaignXlsx(
      [
        { field: 'campaign_id', value: 'campaign-1' },
        { field: 'Sudah terkirim', value: 1 },
        { field: 'Sudah dibaca', value: 1 },
      ],
      [detailRow],
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(workbookBuffer);
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual([
      'Campaign Summary',
      'Data Penerima',
    ]);
    const summaryFields = workbook
      .getWorksheet('Campaign Summary')!
      .getColumn(1)
      .values.map((value) => String(value ?? ''));
    expect(summaryFields).not.toContain('Sudah terkirim');
    expect(summaryFields).not.toContain('Sudah dibaca');
    expect(workbook.getWorksheet('Data Penerima')?.getRow(2).getCell(1).value).toBe('Blast September');
  });
});
