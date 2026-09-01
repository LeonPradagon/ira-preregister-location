const ExcelJS = require('exceljs');
const path = require('node:path');

const output = path.resolve(process.cwd(), 'Budget_WA_GMaps_1_Juta_User_IDR.xlsx');
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Codex';
workbook.created = new Date('2026-09-01T00:00:00Z');
workbook.modified = new Date('2026-09-01T00:00:00Z');
workbook.calcProperties.fullCalcOnLoad = true;
workbook.calcProperties.forceFullCalc = true;

const C = { navy: '17365D', blue: 'D9EAF7', light: 'F5F9FC', yellow: 'FFF2CC', green: 'E2F0D9', orange: 'FCE4D6', white: 'FFFFFF', border: 'B7C9D6' };
const idr = '"Rp" #,##0';
const idrDecimal = '"Rp" #,##0.00';
const number = '#,##0.00';
const percent = '0.0%';

const a = {
  users: 1000000,
  invitation: 1,
  reminders: 1.5,
  marketing: 0,
  delivery: 0.95,
  utilityRate: 356.65,
  marketingRate: 586.33,
  forward: 0.1,
  reverse: 1,
  geoFree: 10000,
  geoPriceIdr: 80000,
  mapLoads: 1,
  mapFree: 10000,
  mapPriceIdr: 112000,
  contingency: 0.10,
  cycles: 1,
};

const utilityTiers = [
  { from: 1, to: 750000, rate: 356.65 },
  { from: 750001, to: 4000000, rate: 338.82 },
  { from: 4000001, to: 25000000, rate: 320.99 },
  { from: 25000001, to: 75000000, rate: 303.15 },
  { from: 75000001, to: 150000000, rate: 285.32 },
  { from: 150000001, to: null, rate: 267.49 },
];

function progressiveCost(messages, tiers) {
  return tiers.reduce((total, tier) => {
    const capacity = tier.to == null ? messages : tier.to - tier.from + 1;
    const used = Math.max(0, Math.min(messages - tier.from + 1, capacity));
    return total + used * tier.rate;
  }, 0);
}

const invite = a.users * a.invitation;
const reminders = a.users * a.reminders;
const marketing = a.users * a.marketing;
const deliveredUtility = (invite + reminders) * a.delivery;
const delivered = (invite + reminders + marketing) * a.delivery;
const utilityTierUsage = utilityTiers.map((tier) => {
  const capacity = tier.to == null ? deliveredUtility : tier.to - tier.from + 1;
  return Math.max(0, Math.min(deliveredUtility - tier.from + 1, capacity));
});
const waUtility = progressiveCost(deliveredUtility, utilityTiers);
const waMarketing = marketing * a.delivery * a.marketingRate;
const geoRequests = a.users * (a.forward + a.reverse);
const geoBillable = Math.max(0, geoRequests - a.geoFree);
const geoCost = geoBillable / 1000 * a.geoPriceIdr;
const mapRequests = a.users * a.mapLoads;
const mapBillable = Math.max(0, mapRequests - a.mapFree);
const mapCost = mapBillable / 1000 * a.mapPriceIdr;
const waTotal = waUtility + waMarketing;
const googleTotal = geoCost + mapCost;
const subtotal = waTotal + googleTotal;
const contingency = subtotal * a.contingency;
const cycleTotal = subtotal + contingency;

function styleTitle(sheet, main, sub) {
  sheet.mergeCells('A1:D1'); sheet.getCell('A1').value = main; sheet.getCell('A1').font = { bold: true, size: 16, color: C.white }; sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }; sheet.getRow(1).height = 28;
  sheet.mergeCells('A2:D2'); sheet.getCell('A2').value = sub; sheet.getCell('A2').font = { italic: true, color: '666666' }; sheet.getCell('A2').alignment = { wrapText: true }; sheet.getRow(2).height = 32;
}
function header(row) { row.font = { bold: true, color: C.white }; row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }; row.alignment = { wrapText: true, vertical: 'middle' }; }
function body(row, fill) { row.eachCell((cell) => { cell.alignment = { wrapText: true, vertical: 'top' }; cell.border = { bottom: { style: 'hair', color: C.border } }; if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; }); }
function setFormula(cell, f, result, format) { cell.value = { formula: f, result }; if (format) cell.numFmt = format; }

const input = workbook.addWorksheet('Input');
styleTitle(input, 'Input Budget: 1 Juta User', 'Sel kuning dapat diubah. Tarif WhatsApp diambil dari rate card Indonesia Meta efektif 1 Juli 2026. Semua angka harga di workbook menggunakan IDR.');
input.getRow(4).values = ['Parameter', 'Nilai', 'Satuan', 'Catatan']; header(input.getRow(4));
const inputs = [
  ['Jumlah user', a.users, 'user/siklus', 'Default 1.000.000'],
  ['Pesan undangan per user', a.invitation, 'message/user', 'Template verifikasi awal'],
  ['Rata-rata reminder per user', a.reminders, 'message/user', 'Maksimum aplikasi saat ini 3 per sesi'],
  ['Pesan marketing per user', a.marketing, 'message/user', 'Default 0; isi jika campaign bersifat promosi'],
  ['Delivery success rate', a.delivery, '%', 'Meta menghitung pesan yang delivered'],
  ['Tarif WhatsApp Utility tier awal', a.utilityRate, 'IDR/message', 'Rate card Indonesia; biaya utility dihitung bertingkat di sheet WA Rate Card'],
  ['Tarif WhatsApp Marketing', a.marketingRate, 'IDR/message', 'Rate card Indonesia; marketing tidak memakai volume tier pada kartu ini'],
  ['Forward geocode per user', a.forward, 'request/user', 'Alamat baru/ubah alamat'],
  ['Reverse geocode per user', a.reverse, 'request/user', 'GPS terbaik per submit'],
  ['Google Geocoding free cap', a.geoFree, 'request/SKU/month', 'Baseline global Essentials'],
  ['Google Geocoding price', a.geoPriceIdr, 'IDR/1.000 request', 'Input budgeting IDR; cek billing account Google'],
  ['Google Maps JS loads per user', a.mapLoads, 'load/user', '0 berarti tetap Leaflet/OSM; isi jika migrasi ke Google Maps JS'],
  ['Google Dynamic Maps free cap', a.mapFree, 'load/SKU/month', 'Baseline global Essentials'],
  ['Google Dynamic Maps price', a.mapPriceIdr, 'IDR/1.000 load', 'Input budgeting IDR; cek billing account Google'],
  ['Contingency', a.contingency, '%', 'Buffer perubahan volume/tarif'],
  ['Siklus per tahun', a.cycles, 'siklus/year', '1 = sekali; 12 = setiap bulan'],
];
inputs.forEach((values, i) => { const row = input.getRow(5 + i); row.values = values; body(row, i % 2 ? C.white : C.light); row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.yellow } }; const unit = values[2]; if (unit === '%') row.getCell(2).numFmt = percent; if (unit.startsWith('IDR')) row.getCell(2).numFmt = idrDecimal; });
input.getColumn(1).width = 38; input.getColumn(2).width = 18; input.getColumn(3).width = 25; input.getColumn(4).width = 78; input.freezePanes = 'A5'; input.autoFilter = { from: 'A4', to: `D${4 + inputs.length}` };

const rateCard = workbook.addWorksheet('WA Rate Card');
styleTitle(rateCard, 'Meta WhatsApp Rate Card - Indonesia', 'Tarif dari PDF rate card yang Anda kirim, efektif 1 Juli 2026. Volume tier berlaku per kategori per bulan; utility pada estimasi dihitung progresif per tier.');
rateCard.getRow(4).values = ['Kategori', 'Mulai pesan/bulan', 'Sampai pesan/bulan', 'Tarif IDR/message', 'Pesan pada tier', 'Biaya IDR', 'Keterangan']; header(rateCard.getRow(4));
utilityTiers.forEach((tier, i) => {
  const row = rateCard.getRow(5 + i); row.values = ['Utility', tier.from, tier.to, tier.rate, null, null, i === 0 ? 'List rate' : `Tier rate (${i * 5}% discount)`]; body(row, i % 2 ? C.white : C.light);
  setFormula(row.getCell(5), `=MAX(0,MIN(WhatsApp!$B$9,IF(C${5 + i}="",1E+99,C${5 + i}))-B${5 + i}+1)`, utilityTierUsage[i], number);
  setFormula(row.getCell(6), `=D${5 + i}*E${5 + i}`, utilityTierUsage[i] * tier.rate, idrDecimal);
  row.getCell(3).numFmt = number; row.getCell(4).numFmt = idrDecimal;
});
rateCard.getRow(11).values = ['Total Utility', null, null, null, null, null, 'Dipakai oleh sheet WhatsApp']; body(rateCard.getRow(11), C.green); setFormula(rateCard.getCell('F11'), '=SUM(F5:F10)', waUtility, idrDecimal); rateCard.getRow(11).font = { bold: true };
rateCard.getRow(13).values = ['Kategori', 'Rate awal IDR/message', 'Rate tertinggi IDR/message', 'Catatan']; header(rateCard.getRow(13));
[
  ['Marketing', 586.33, 586.33, 'Rate Indonesia pada rate card'],
  ['Utility', 356.65, 267.49, 'Volume tier 0 sampai 150 juta+ pesan/bulan'],
  ['Authentication', 356.65, 267.49, 'Volume tier; tidak dipakai dalam baseline ini'],
  ['Authentication-International', 1940.13, 1455.10, 'Volume tier; tidak dipakai dalam baseline ini'],
  ['Service', null, null, 'Tidak dikenakan biaya pada rate card yang dirujuk'],
].forEach((values, i) => { const row = rateCard.getRow(14 + i); row.values = values; body(row, i % 2 ? C.white : C.light); row.getCell(2).numFmt = idrDecimal; row.getCell(3).numFmt = idrDecimal; });
rateCard.getColumn(1).width = 30; rateCard.getColumn(2).width = 20; rateCard.getColumn(3).width = 20; rateCard.getColumn(4).width = 22; rateCard.getColumn(5).width = 20; rateCard.getColumn(6).width = 22; rateCard.getColumn(7).width = 48; rateCard.freezePanes = 'A5';

const wa = workbook.addWorksheet('WhatsApp');
styleTitle(wa, 'WhatsApp Cloud API Cost', 'Perhitungan API-only untuk market Indonesia. Utility memakai volume tier dari sheet WA Rate Card; biaya dihitung berdasarkan pesan delivered.');
wa.getRow(4).values = ['Komponen', 'Nilai', 'Satuan', 'Formula/penjelasan']; header(wa.getRow(4));
const waRows = [
  ['Invitation messages', '=Input!$B$5*Input!$B$6', invite, 'user x invitation/user'],
  ['Reminder messages', '=Input!$B$5*Input!$B$7', reminders, 'user x average reminder/user'],
  ['Marketing messages', '=Input!$B$5*Input!$B$8', marketing, 'user x marketing/user'],
  ['Total messages sent', '=SUM(B5:B7)', invite + reminders + marketing, 'Semua pesan yang diminta dikirim'],
  ['Estimated delivered', '=B8*Input!$B$9', delivered, 'sent x delivery success rate'],
  ['Utility rate tier awal', `='WA Rate Card'!D5`, a.utilityRate, 'Referensi rate tier pertama'],
  ['Utility cost bertingkat', `='WA Rate Card'!F11`, waUtility, 'Utility delivered x rate tiap volume tier'],
  ['Marketing rate', '=Input!$B$11', a.marketingRate, 'Rate card Indonesia'],
  ['Marketing cost', '=B7*Input!$B$9*B12', waMarketing, 'Marketing delivered x rate'],
  ['Total WhatsApp cost / cycle', '=SUM(B11,B13)', waTotal, 'Tidak termasuk hosting/BSP fee'],
];
waRows.forEach((values, i) => { const row = wa.getRow(5 + i); row.values = [values[0], null, i <= 4 ? 'message' : 'IDR', values[3]]; body(row, i % 2 ? C.white : C.light); setFormula(row.getCell(2), values[1], values[2], i <= 4 ? number : idrDecimal); });
wa.getRow(14).font = { bold: true }; wa.getRow(14).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } }; wa.getColumn(1).width = 34; wa.getColumn(2).width = 22; wa.getColumn(3).width = 22; wa.getColumn(4).width = 52; wa.freezePanes = 'A5';

const google = workbook.addWorksheet('Google Maps');
styleTitle(google, 'Google Maps / Geocoding Cost', 'Semua biaya ditampilkan dalam IDR. Baseline memakai 1 Google Maps JS map load per user; ubah menjadi 0 jika hanya memakai geocoding atau deep link.');
google.getRow(4).values = ['Komponen', 'Nilai', 'Satuan', 'Formula/penjelasan']; header(google.getRow(4));
const googleRows = [
  ['Forward geocode requests', '=Input!$B$5*Input!$B$12', a.users * a.forward, 'user x forward/user'],
  ['Reverse geocode requests', '=Input!$B$5*Input!$B$13', a.users * a.reverse, 'user x reverse/user'],
  ['Total Geocoding requests', '=SUM(B5:B6)', geoRequests, 'Forward + reverse'],
  ['Free usage cap', '=Input!$B$14', a.geoFree, 'Free cap per SKU/month'],
  ['Billable Geocoding requests', '=MAX(0,B7-B8)', geoBillable, 'Total - free cap'],
  ['Geocoding price IDR/1.000', '=Input!$B$15', a.geoPriceIdr, 'Input budgeting IDR'],
  ['Geocoding cost IDR', '=B9/1000*B10', geoCost, 'Billable/1000 x IDR rate'],
  ['Google Maps JS map loads', '=Input!$B$5*Input!$B$16', mapRequests, '0 jika tetap Leaflet/OSM'],
  ['Map free usage cap', '=Input!$B$17', a.mapFree, 'Free cap per SKU/month'],
  ['Billable map loads', '=MAX(0,B12-B13)', mapBillable, 'Total - free cap'],
  ['Dynamic Maps price IDR/1.000', '=Input!$B$18', a.mapPriceIdr, 'Input budgeting IDR'],
  ['Dynamic Maps cost IDR', '=B14/1000*B15', mapCost, 'Billable/1000 x IDR rate'],
  ['Total Google cost / cycle', '=SUM(B11,B16)', googleTotal, 'Geocoding + optional Maps JS'],
];
googleRows.forEach((values, i) => { const row = google.getRow(5 + i); row.values = [values[0], null, i === 5 || i === 10 ? 'IDR/1.000' : i === 6 || i === 11 || i === 12 ? 'IDR' : 'request/load', values[3]]; body(row, i % 2 ? C.white : C.light); const format = i === 5 || i === 10 ? idrDecimal : i === 6 || i === 11 || i === 12 ? idrDecimal : number; setFormula(row.getCell(2), values[1], values[2], format); });
google.getRow(17).font = { bold: true }; google.getRow(17).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } }; google.getColumn(1).width = 38; google.getColumn(2).width = 22; google.getColumn(3).width = 22; google.getColumn(4).width = 52; google.freezePanes = 'A5';

const summary = workbook.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
styleTitle(summary, 'Ringkasan Budget API: 1 Juta User', 'Budget ini hanya mencakup WhatsApp Cloud API dan Google Maps/Geocoding API. Baseline memakai 1 Google Maps JS load per user. Hosting, database, Redis, domain, development, dan pajak belum termasuk.');
summary.getRow(4).values = ['Komponen', 'Per 1 siklus', 'Siklus/tahun', 'Per tahun']; header(summary.getRow(4));
const summaryRows = [
  ['WhatsApp Cloud API', waTotal],
  ['Google Maps/Geocoding API', googleTotal],
  ['Subtotal API', subtotal],
  ['Contingency', contingency],
  ['Total API / siklus', cycleTotal],
  ['Total API / tahun', cycleTotal * a.cycles],
];
summaryRows.forEach((values, i) => { const row = summary.getRow(5 + i); row.values = [values[0], null, null, null]; body(row, i % 2 ? C.white : C.light); setFormula(row.getCell(2), i === 0 ? "=WhatsApp!B14" : i === 1 ? "='Google Maps'!B17" : i === 2 ? '=SUM(B5:B6)' : i === 3 ? '=B7*Input!$B$19' : i === 4 ? '=SUM(B7:B8)' : '=B9*Input!$B$20', values[1], idrDecimal); setFormula(row.getCell(3), '=Input!$B$20', a.cycles, number); setFormula(row.getCell(4), i === 5 ? '=B9*C9' : `=B${5 + i}*C${5 + i}`, i === 5 ? cycleTotal * a.cycles : values[1] * a.cycles, idrDecimal); });
summary.getRow(9).font = { bold: true }; summary.getRow(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.green } }; summary.getRow(10).font = { bold: true }; summary.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.orange } };
summary.mergeCells('A13:D13'); summary.getCell('A13').value = 'Catatan'; summary.getCell('A13').font = { bold: true, color: C.navy }; summary.getCell('A13').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.blue } };
const notes = [
  'Tarif WhatsApp Indonesia dari PDF Meta efektif 1 Juli 2026: Utility mulai Rp356,65/pesan dan turun bertahap sampai Rp267,49/pesan sesuai volume bulanan. Estimasi utility memakai tier progresif.',
  'Perhitungan default: 1 undangan + rata-rata 1,5 reminder per user, delivery success 95%. Jika 1 juta user diproses setiap bulan, ubah siklus/tahun menjadi 12 agar total tahunan mengikuti volume bulanan.',
  'Biaya Google pada workbook dibuat dalam IDR sebagai angka budgeting dan editable. Tarif final mengikuti billing account, SKU, lokasi penggunaan, serta free cap Google yang berlaku.',
  'Baseline workbook memakai 1 Google Maps JS load per user. Set map loads/user menjadi 0 jika aplikasi tetap memakai Leaflet/OpenStreetMap atau hanya memakai deep link.',
];
notes.forEach((note, i) => { summary.mergeCells(`A${14 + i}:D${14 + i}`); summary.getCell(`A${14 + i}`).value = note; summary.getCell(`A${14 + i}`).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(14 + i).height = 34; });
summary.getColumn(1).width = 40; summary.getColumn(2).width = 22; summary.getColumn(3).width = 18; summary.getColumn(4).width = 22; summary.freezePanes = 'A5';

const sources = workbook.addWorksheet('Sumber');
styleTitle(sources, 'Sumber Harga', 'Harga dan kebijakan provider dapat berubah. Cek ulang sebelum production launch.');
sources.getRow(4).values = ['Provider', 'Referensi', 'URL', 'Tanggal cek', 'Keterangan']; header(sources.getRow(4));
[
  ['Meta', 'WhatsApp Rate Card Indonesia - PDF user', 'https://developers.facebook.com/docs/whatsapp/pricing/volume-tiers', '2026-09-01', 'Tarif IDR; efektif 1 Juli 2026; utility/authentication volume tiers'],
  ['Meta', 'WhatsApp Business Platform Pricing', 'https://whatsappbusiness.com/products/platform-pricing/', '2026-09-01', 'Per delivered message; market + category'],
  ['Meta', 'Business Messaging Policy Indonesia', 'https://business.whatsapp.com/policy/preview?lang=id_ID', '2026-09-01', 'Consent, template, opt-out'],
  ['Meta', 'Messages API collection', 'https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages', '2026-09-01', 'Endpoint dan permission'],
  ['Google', 'Core services pricing list', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-09-01', 'Geocoding dan Dynamic Maps baseline'],
  ['Google', 'Geocoding API overview', 'https://developers.google.com/maps/documentation/geocoding/overview', '2026-09-01', 'Forward/reverse geocoding'],
  ['Google', 'API security best practices', 'https://developers.google.com/maps/api-security-best-practices', '2026-09-01', 'Restrict key dan pisahkan server/browser key'],
].forEach((values, i) => { const row = sources.getRow(5 + i); row.values = values; body(row, i % 2 ? C.white : C.light); row.getCell(3).font = { color: '0563C1', underline: true }; });
sources.getColumn(1).width = 14; sources.getColumn(2).width = 42; sources.getColumn(3).width = 75; sources.getColumn(4).width = 16; sources.getColumn(5).width = 62; sources.freezePanes = 'A5'; sources.autoFilter = { from: 'A4', to: 'E11' };

for (const sheet of workbook.worksheets) { sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }; sheet.properties.defaultRowHeight = 18; }

workbook.xlsx.writeFile(output).then(() => console.log(output));
