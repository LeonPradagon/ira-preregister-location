const ExcelJS = require('exceljs');
const path = require('node:path');

const outputPath = path.resolve(process.cwd(), 'Budget_Aplikasi_Exact_Location.xlsx');
const workbook = new ExcelJS.Workbook();
workbook.creator = 'Codex';
workbook.lastModifiedBy = 'Codex';
workbook.created = new Date('2026-09-01T00:00:00Z');
workbook.modified = new Date('2026-09-01T00:00:00Z');
workbook.calcProperties.fullCalcOnLoad = true;
workbook.calcProperties.forceFullCalc = true;

const colors = {
  navy: '17365D',
  blue: 'D9EAF7',
  lightBlue: 'EAF3F8',
  yellow: 'FFF2CC',
  green: 'E2F0D9',
  orange: 'FCE4D6',
  gray: 'F2F2F2',
  white: 'FFFFFF',
  border: 'B7C9D6',
};

const idrFormat = '"Rp" #,##0';
const usdFormat = '$#,##0.00';
const numberFormat = '#,##0.00';
const percentFormat = '0.0%';

function title(sheet, text, subtitle) {
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = text;
  sheet.getCell('A1').font = { bold: true, size: 16, color: colors.white };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;
  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = subtitle;
  sheet.getCell('A2').font = { italic: true, color: '666666' };
  sheet.getCell('A2').alignment = { wrapText: true };
  sheet.getRow(2).height = 30;
}

function header(row) {
  row.font = { bold: true, color: colors.white };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.navy } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.eachCell((cell) => { cell.border = { bottom: { style: 'thin', color: colors.border } }; });
}

function section(cell) {
  cell.font = { bold: true, color: colors.navy };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.blue } };
}

function bodyStyle(row, fill) {
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = { bottom: { style: 'hair', color: colors.border } };
    if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  });
}

function input(cell, format) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.yellow } };
  cell.font = { color: '9C6500' };
  if (format) cell.numFmt = format;
}

function formula(cell, value, result, format) {
  cell.value = { formula: value, result };
  if (format) cell.numFmt = format;
}

function addScenarioHeaders(sheet, rowNumber) {
  sheet.getRow(rowNumber).values = ['Komponen', 'Pilot', 'Growth', 'Scale'];
  header(sheet.getRow(rowNumber));
}

const assumptions = {
  pilotCustomers: 1000,
  growthCustomers: 10000,
  scaleCustomers: 50000,
  invitationPerCustomer: 1,
  remindersPerCustomer: 1.5,
  marketingPerCustomer: 0,
  deliveryRate: 0.95,
  utilityRate: 500,
  marketingRate: 1000,
  metaFixedFee: 0,
  forwardPerCustomer: 0.1,
  reversePerCustomer: 1,
  geocodeFreeCap: 10000,
  geocodeUsdPer1000: 5,
  mapLoadsPerCustomer: 0,
  mapFreeCap: 10000,
  mapUsdPer1000: 7,
  fx: 16000,
  server: 500000,
  database: 500000,
  redis: 250000,
  backup: 200000,
  monitoring: 250000,
  domainAnnual: 250000,
  contingency: 0.10,
  implementationHours: 40,
  implementationRate: 200000,
  qaHours: 16,
  qaRate: 200000,
  complianceBuffer: 1000000,
};

const scenarios = [assumptions.pilotCustomers, assumptions.growthCustomers, assumptions.scaleCustomers];
const calculations = scenarios.map((customers) => {
  const invitations = customers * assumptions.invitationPerCustomer;
  const reminders = customers * assumptions.remindersPerCustomer;
  const marketing = customers * assumptions.marketingPerCustomer;
  const delivered = (invitations + reminders + marketing) * assumptions.deliveryRate;
  const waUtility = (invitations + reminders) * assumptions.deliveryRate * assumptions.utilityRate;
  const waMarketing = marketing * assumptions.deliveryRate * assumptions.marketingRate;
  const geoRequests = customers * (assumptions.forwardPerCustomer + assumptions.reversePerCustomer);
  const geoBillable = Math.max(0, geoRequests - assumptions.geocodeFreeCap);
  const geoCost = geoBillable / 1000 * assumptions.geocodeUsdPer1000 * assumptions.fx;
  const mapLoads = customers * assumptions.mapLoadsPerCustomer;
  const mapBillable = Math.max(0, mapLoads - assumptions.mapFreeCap);
  const mapCost = mapBillable / 1000 * assumptions.mapUsdPer1000 * assumptions.fx;
  const infra = assumptions.server + assumptions.database + assumptions.redis + assumptions.backup + assumptions.monitoring + assumptions.domainAnnual / 12 + assumptions.metaFixedFee;
  const subtotal = waUtility + waMarketing + geoCost + mapCost + infra;
  const contingency = subtotal * assumptions.contingency;
  const recurring = subtotal + contingency;
  const oneTime = assumptions.implementationHours * assumptions.implementationRate + assumptions.qaHours * assumptions.qaRate + assumptions.complianceBuffer;
  return { invitations, reminders, marketing, delivered, waUtility, waMarketing, geoRequests, geoBillable, geoCost, mapLoads, mapBillable, mapCost, infra, subtotal, contingency, recurring, oneTime, firstYear: recurring * 12 + oneTime };
});

const as = workbook.addWorksheet('Asumsi');
title(as, 'Asumsi Budget Aplikasi Exact Location', 'Sel kuning dapat diubah. Tarif WhatsApp adalah asumsi sementara dan wajib disesuaikan dengan rate card Meta untuk market Indonesia dan kategori pesan yang disetujui.');
as.getRow(4).values = ['Parameter', 'Nilai', 'Satuan', 'Catatan'];
header(as.getRow(4));
const assumptionRows = [
  ['Pilot customers per month', assumptions.pilotCustomers, 'customer', 'Skenario awal'],
  ['Growth customers per month', assumptions.growthCustomers, 'customer', 'Skenario pertumbuhan'],
  ['Scale customers per month', assumptions.scaleCustomers, 'customer', 'Skenario skala'],
  ['Invitation messages per customer', assumptions.invitationPerCustomer, 'message/customer', 'Template verifikasi awal'],
  ['Average reminders per customer', assumptions.remindersPerCustomer, 'message/customer', 'Rata-rata; maksimum aplikasi saat ini 3 per sesi'],
  ['Marketing campaign messages per customer', assumptions.marketingPerCustomer, 'message/customer', 'Isi jika campaign diklasifikasikan Marketing'],
  ['Estimated successful delivery rate', assumptions.deliveryRate, '%', 'Meta menagih saat delivered; asumsi untuk budgeting'],
  ['WhatsApp Utility rate', assumptions.utilityRate, 'IDR/delivered message', 'ASUMSI EDITABLE; cek rate card Meta'],
  ['WhatsApp Marketing rate', assumptions.marketingRate, 'IDR/delivered message', 'ASUMSI EDITABLE; cek rate card Meta'],
  ['Meta/BSP fixed monthly fee', assumptions.metaFixedFee, 'IDR/month', '0 untuk direct Cloud API; partner fee bila ada diisi di sini'],
  ['Forward geocode requests per customer', assumptions.forwardPerCustomer, 'request/customer', 'Alamat baru/ubah alamat'],
  ['Reverse geocode requests per customer', assumptions.reversePerCustomer, 'request/customer', 'GPS terbaik per submit pada implementasi saat ini'],
  ['Google Geocoding free usage cap', assumptions.geocodeFreeCap, 'request/month/SKU', 'Baseline global Essentials'],
  ['Google Geocoding price', assumptions.geocodeUsdPer1000, 'USD/1,000 requests', 'Baseline global, tier pertama setelah free cap'],
  ['Google Maps JS map loads per customer', assumptions.mapLoadsPerCustomer, 'load/customer', '0 berarti tetap memakai Leaflet/OSM seperti aplikasi saat ini'],
  ['Google Dynamic Maps free usage cap', assumptions.mapFreeCap, 'load/month/SKU', 'Baseline global Essentials'],
  ['Google Dynamic Maps price', assumptions.mapUsdPer1000, 'USD/1,000 loads', 'Baseline global, tier pertama setelah free cap'],
  ['Exchange rate', assumptions.fx, 'IDR/USD', 'Asumsi budgeting, ubah sesuai kurs pembayaran'],
  ['Application/VPS server', assumptions.server, 'IDR/month', 'Asumsi VPS kecil; sesuaikan vendor dan spesifikasi'],
  ['Managed PostgreSQL/PostGIS', assumptions.database, 'IDR/month', 'Asumsi managed database'],
  ['Redis/BullMQ', assumptions.redis, 'IDR/month', 'Asumsi managed Redis atau resource terpisah'],
  ['Backup/object storage', assumptions.backup, 'IDR/month', 'Backup database dan log'],
  ['Monitoring/email/alerting', assumptions.monitoring, 'IDR/month', 'Monitoring, alert, email operasional'],
  ['Domain', assumptions.domainAnnual, 'IDR/year', 'Dibagi 12 pada biaya bulanan'],
  ['Contingency', assumptions.contingency, '%', 'Buffer 10% untuk perubahan volume/biaya'],
  ['Implementation hours', assumptions.implementationHours, 'hour', 'Estimasi adaptasi Meta + Google + hardening'],
  ['Implementation rate', assumptions.implementationRate, 'IDR/hour', 'Asumsi tenaga implementasi'],
  ['QA/deployment hours', assumptions.qaHours, 'hour', 'Testing, staging, deploy, webhook verification'],
  ['QA/deployment rate', assumptions.qaRate, 'IDR/hour', 'Asumsi tenaga QA/deployment'],
  ['Compliance/privacy/setup buffer', assumptions.complianceBuffer, 'IDR one-time', 'Legal, consent flow, template/setup contingency'],
];
assumptionRows.forEach((values, index) => {
  const row = as.getRow(5 + index);
  row.values = values;
  bodyStyle(row, index % 2 ? colors.white : colors.lightBlue);
  input(row.getCell(2));
  const unit = values[2];
  if (unit === '%') row.getCell(2).numFmt = percentFormat;
  if (unit.startsWith('IDR')) row.getCell(2).numFmt = idrFormat;
  if (unit === 'IDR/year' || unit === 'IDR/month' || unit === 'IDR/hour' || unit === 'IDR one-time' || unit === 'IDR/delivered message') row.getCell(2).numFmt = idrFormat;
  if (unit.startsWith('USD')) row.getCell(2).numFmt = usdFormat;
});
as.getColumn(1).width = 42; as.getColumn(2).width = 18; as.getColumn(3).width = 24; as.getColumn(4).width = 65;
as.freezePanes = 'A5';
as.autoFilter = { from: 'A4', to: `D${4 + assumptionRows.length}` };

const wa = workbook.addWorksheet('WA Calculator');
title(wa, 'WhatsApp Cloud API Calculator', 'Perhitungan menggunakan delivered message. Rate Utility/Marketing diambil dari sel Asumsi dan sengaja dibuat editable karena rate Meta berubah berdasarkan market, kategori, dan volume.');
addScenarioHeaders(wa, 4);
const waRows = [
  ['Customer per month'],
  ['Invitation messages/customer'],
  ['Average reminders/customer'],
  ['Marketing messages/customer'],
  ['Delivery success rate'],
  ['Invitation Utility messages sent'],
  ['Reminder Utility messages sent'],
  ['Marketing messages sent'],
  ['Total messages sent'],
  ['Estimated delivered messages'],
  ['WhatsApp Utility rate'],
  ['Utility message cost'],
  ['WhatsApp Marketing rate'],
  ['Marketing message cost'],
  ['Meta/BSP fixed monthly fee'],
  ['Total WhatsApp monthly cost'],
];
waRows.forEach((value, index) => { wa.getRow(5 + index).getCell(1).value = value[0]; bodyStyle(wa.getRow(5 + index), index % 2 ? colors.white : colors.lightBlue); });
const waRefs = ['B5', 'C5', 'D5'];
const waResults = [
  (i) => calculations[i].invitations,
  () => assumptions.invitationPerCustomer,
  () => assumptions.remindersPerCustomer,
  () => assumptions.marketingPerCustomer,
  () => assumptions.deliveryRate,
  (i) => calculations[i].invitations,
  (i) => calculations[i].reminders,
  (i) => calculations[i].marketing,
  (i) => calculations[i].invitations + calculations[i].reminders + calculations[i].marketing,
  (i) => calculations[i].delivered,
  () => assumptions.utilityRate,
  (i) => calculations[i].waUtility,
  () => assumptions.marketingRate,
  (i) => calculations[i].waMarketing,
  () => assumptions.metaFixedFee,
  (i) => calculations[i].waUtility + calculations[i].waMarketing + assumptions.metaFixedFee,
];
for (let i = 0; i < 3; i += 1) {
  const col = String.fromCharCode(66 + i);
  const customerRef = `Asumsi!$${col}$5`;
  const formulas = [
    `=${customerRef}`, '=Asumsi!$B$8', '=Asumsi!$B$9', '=Asumsi!$B$10', '=Asumsi!$B$11',
    `=${col}5*${col}6`, `=${col}5*${col}7`, `=${col}5*${col}8`, `=SUM(${col}10:${col}12)`, `=${col}13*${col}9`,
    '=Asumsi!$B$12', `=${col}14*${col}15`, '=Asumsi!$B$13', `=${col}14*${col}17`, '=Asumsi!$B$14', `=SUM(${col}16,${col}18,${col}19)`,
  ];
  formulas.forEach((f, index) => formula(wa.getCell(5 + index, 2 + i), f, waResults[index](i), index === 4 ? percentFormat : index === 9 ? numberFormat : [10, 11, 12, 13, 14, 15].includes(index) ? idrFormat : undefined));
}
wa.getRow(20).font = { bold: true }; wa.getRow(20).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
wa.getColumn(1).width = 38; wa.getColumn(2).width = 18; wa.getColumn(3).width = 18; wa.getColumn(4).width = 18;
wa.freezePanes = 'B5';

const maps = workbook.addWorksheet('Maps Calculator');
title(maps, 'Google Maps / Geocoding Calculator', 'Aplikasi saat ini memakai Leaflet + OpenStreetMap untuk peta dan hanya membuat deep link Google Maps. Isi map loads/customer jika ingin migrasi ke Maps JavaScript API.');
addScenarioHeaders(maps, 4);
const mapRows = [
  ['Customer per month'], ['Forward geocode requests/customer'], ['Reverse geocode requests/customer'], ['Google Maps JS map loads/customer'],
  ['Forward geocode requests'], ['Reverse geocode requests'], ['Total Geocoding requests'], ['Free usage cap'], ['Billable Geocoding requests'], ['Geocoding price USD/1,000'], ['Geocoding cost USD'], ['Geocoding cost IDR'],
  ['Google Maps JS map loads'], ['Map free usage cap'], ['Billable map loads'], ['Dynamic Maps price USD/1,000'], ['Dynamic Maps cost USD'], ['Dynamic Maps cost IDR'], ['Total Google monthly cost'],
];
mapRows.forEach((value, index) => { maps.getRow(5 + index).getCell(1).value = value[0]; bodyStyle(maps.getRow(5 + index), index % 2 ? colors.white : colors.lightBlue); });
const mapResults = [
  (i) => scenarios[i], () => assumptions.forwardPerCustomer, () => assumptions.reversePerCustomer, () => assumptions.mapLoadsPerCustomer,
  (i) => scenarios[i] * assumptions.forwardPerCustomer, (i) => scenarios[i] * assumptions.reversePerCustomer, (i) => calculations[i].geoRequests, () => assumptions.geocodeFreeCap, (i) => calculations[i].geoBillable, () => assumptions.geocodeUsdPer1000, (i) => calculations[i].geoBillable / 1000 * assumptions.geocodeUsdPer1000, (i) => calculations[i].geoCost,
  (i) => calculations[i].mapLoads, () => assumptions.mapFreeCap, (i) => calculations[i].mapBillable, () => assumptions.mapUsdPer1000, (i) => calculations[i].mapBillable / 1000 * assumptions.mapUsdPer1000, (i) => calculations[i].mapCost, (i) => calculations[i].geoCost + calculations[i].mapCost,
];
for (let i = 0; i < 3; i += 1) {
  const col = String.fromCharCode(66 + i);
  const formulas = [
    `=Asumsi!$${col}$5`, '=Asumsi!$B$15', '=Asumsi!$B$16', '=Asumsi!$B$19', `=${col}5*${col}6`, `=${col}5*${col}7`, `=SUM(${col}9:${col}10)`, '=Asumsi!$B$17', `=MAX(0,${col}11-${col}12)`, '=Asumsi!$B$18', `=${col}13/1000*${col}14`, `=${col}15*Asumsi!$B$22`, `=${col}5*${col}8`, '=Asumsi!$B$20', `=MAX(0,${col}17-${col}18)`, '=Asumsi!$B$21', `=${col}19/1000*${col}20`, `=${col}21*Asumsi!$B$22`, `=SUM(${col}16,${col}22)`,
  ];
  formulas.forEach((f, index) => {
    let format;
    if ([9, 10, 15, 16].includes(index)) format = usdFormat;
    if ([11, 17, 18].includes(index)) format = idrFormat;
    formula(maps.getCell(5 + index, 2 + i), f, mapResults[index](i), format);
  });
}
maps.getRow(24).font = { bold: true }; maps.getRow(24).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
maps.getColumn(1).width = 38; maps.getColumn(2).width = 18; maps.getColumn(3).width = 18; maps.getColumn(4).width = 18;
maps.freezePanes = 'B5';

const infra = workbook.addWorksheet('Infra & Setup');
title(infra, 'Infrastructure dan One-time Setup', 'Angka hosting, database, Redis, domain, tenaga implementasi, dan compliance adalah estimasi budgeting yang dapat diganti sesuai vendor/penawaran aktual.');
addScenarioHeaders(infra, 4);
const infraRows = [
  ['Application/VPS server'], ['Managed PostgreSQL/PostGIS'], ['Redis/BullMQ'], ['Backup/object storage'], ['Monitoring/email/alerting'], ['Domain monthly equivalent'], ['Meta/BSP fixed monthly fee'], ['Total infrastructure monthly'],
  ['Implementation cost'], ['QA/deployment cost'], ['Compliance/privacy/setup buffer'], ['Total one-time setup'],
];
infraRows.forEach((value, index) => { infra.getRow(5 + index).getCell(1).value = value[0]; bodyStyle(infra.getRow(5 + index), index % 2 ? colors.white : colors.lightBlue); });
for (let i = 0; i < 3; i += 1) {
  const col = String.fromCharCode(66 + i);
  const monthly = [
    '=Asumsi!$B$23', '=Asumsi!$B$24', '=Asumsi!$B$25', '=Asumsi!$B$26', '=Asumsi!$B$27', '=Asumsi!$B$28/12', '=Asumsi!$B$14', `=SUM(${col}5:${col}11)`,
    '=Asumsi!$B$30*Asumsi!$B$31', '=Asumsi!$B$32*Asumsi!$B$33', '=Asumsi!$B$34', `=SUM(${col}13:${col}15)`,
  ];
  const values = [assumptions.server, assumptions.database, assumptions.redis, assumptions.backup, assumptions.monitoring, assumptions.domainAnnual / 12, assumptions.metaFixedFee, assumptions.server + assumptions.database + assumptions.redis + assumptions.backup + assumptions.monitoring + assumptions.domainAnnual / 12 + assumptions.metaFixedFee, assumptions.implementationHours * assumptions.implementationRate, assumptions.qaHours * assumptions.qaRate, assumptions.complianceBuffer, assumptions.implementationHours * assumptions.implementationRate + assumptions.qaHours * assumptions.qaRate + assumptions.complianceBuffer];
  monthly.forEach((f, index) => formula(infra.getCell(5 + index, 2 + i), f, values[index], idrFormat));
}
infra.getRow(12).font = { bold: true }; infra.getRow(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
infra.getRow(16).font = { bold: true }; infra.getRow(16).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.orange } };
infra.getColumn(1).width = 42; infra.getColumn(2).width = 18; infra.getColumn(3).width = 18; infra.getColumn(4).width = 18;
infra.freezePanes = 'B5';

const summary = workbook.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
title(summary, 'Budget Aplikasi Exact Location', 'Estimasi awal per 1 September 2026. Gunakan sheet Asumsi untuk mengganti volume dan tarif. Angka ini bukan quotation vendor.');
addScenarioHeaders(summary, 4);
const summaryLabels = ['WhatsApp monthly', 'Google Maps/Geocoding monthly', 'Infrastructure monthly', 'Recurring subtotal monthly', 'Contingency', 'Total recurring monthly', 'Total recurring annual', 'One-time implementation/setup', 'Total first-year budget', 'First-year monthly equivalent'];
summaryLabels.forEach((label, index) => { summary.getRow(5 + index).getCell(1).value = label; bodyStyle(summary.getRow(5 + index), index % 2 ? colors.white : colors.lightBlue); });
for (let i = 0; i < 3; i += 1) {
  const col = String.fromCharCode(66 + i);
  const calc = calculations[i];
  const formulas = [`='WA Calculator'!${col}20`, `='Maps Calculator'!${col}23`, `='Infra & Setup'!${col}12`, `=SUM(${col}5:${col}7)`, `=${col}8*Asumsi!$B$29`, `=SUM(${col}8:${col}9)`, `=${col}10*12`, `='Infra & Setup'!${col}16`, `=${col}11+${col}12`, `=${col}13/12`];
  const values = [calc.waUtility + calc.waMarketing, calc.geoCost + calc.mapCost, calc.infra, calc.subtotal, calc.contingency, calc.recurring, calc.recurring * 12, calc.oneTime, calc.firstYear, calc.firstYear / 12];
  formulas.forEach((f, index) => formula(summary.getCell(5 + index, 2 + i), f, values[index], idrFormat));
}
summary.getRow(10).font = { bold: true }; summary.getRow(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.green } };
summary.getRow(13).font = { bold: true }; summary.getRow(13).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.orange } };
summary.getRow(16).values = ['Catatan penting']; section(summary.getCell('A16')); summary.mergeCells('A16:D16');
const notes = [
  '1. Tarif WhatsApp pada sheet Asumsi adalah angka contoh untuk simulasi, bukan tarif resmi final. Meta menghitung per delivered message berdasarkan market dan kategori.',
  '2. Utility/Marketing harus ditentukan dari isi dan tujuan template. Jika campaign bersifat promosi, masukkan ke Marketing.',
  '3. Google Geocoding memakai baseline global USD 5/1.000 request setelah free cap 10.000; kurs dan tier dapat berubah.',
  '4. Map loads default 0 karena aplikasi sekarang memakai Leaflet + OpenStreetMap. Isi angka jika ingin memakai Google Maps JavaScript API.',
  '5. Biaya development, server, domain, dan compliance adalah asumsi internal; minta quotation vendor sebelum keputusan final.',
];
notes.forEach((note, index) => { summary.mergeCells(`A${17 + index}:D${17 + index}`); summary.getCell(`A${17 + index}`).value = note; summary.getCell(`A${17 + index}`).alignment = { wrapText: true, vertical: 'top' }; summary.getRow(17 + index).height = 28; });
summary.getColumn(1).width = 42; summary.getColumn(2).width = 20; summary.getColumn(3).width = 20; summary.getColumn(4).width = 20;
summary.freezePanes = 'B5';

const checklist = workbook.addWorksheet('Checklist');
title(checklist, 'Checklist Production', 'Item non-biaya yang harus selesai sebelum API resmi dipakai di production.');
checklist.getRow(4).values = ['Area', 'Item', 'Status', 'Catatan']; header(checklist.getRow(4));
const checklistRows = [
  ['Meta', 'Business Portfolio dan WABA aktif', 'Pending', 'Nomor bisnis dan business verification'],
  ['Meta', 'Phone Number ID dan Access Token server-side', 'Pending', 'Jangan taruh token di frontend/Git'],
  ['Meta', 'Template verifikasi/reminder ID dan EN approved', 'Pending', 'Satu template per bahasa/tujuan'],
  ['Meta', 'Webhook HTTPS + verify token + App Secret signature', 'Pending', 'Uji delivery, read, failed, inbound'],
  ['Meta', 'Opt-in evidence dan STOP/UNSUBSCRIBE handling', 'Pending', 'Wajib ditautkan ke customer record'],
  ['Google', 'Billing account dan Geocoding API aktif', 'Pending', 'Set quota dan budget alert'],
  ['Google', 'Pisahkan server key dan browser key', 'Pending', 'IP restriction untuk server; referrer restriction untuk browser'],
  ['Application', 'Google adapter memetakan response ke GeocodingResult', 'Pending', 'Adapter saat ini masih generic /forward dan /reverse'],
  ['Application', 'Meta adapter membaca messages[0].id', 'Pending', 'Response Cloud API bukan providerMessageId top-level'],
  ['Operations', 'Monitoring, retry, circuit breaker, backup', 'Pending', 'Siapkan runbook pause campaign'],
  ['Legal', 'Privacy notice, retention, consent, audit access', 'Pending', 'Review sebelum live customer'],
];
checklistRows.forEach((values, index) => { const row = checklist.getRow(5 + index); row.values = values; bodyStyle(row, index % 2 ? colors.white : colors.lightBlue); row.getCell(3).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Pending,In Progress,Done,Blocked"'] }; });
checklist.getColumn(1).width = 18; checklist.getColumn(2).width = 55; checklist.getColumn(3).width = 18; checklist.getColumn(4).width = 65; checklist.freezePanes = 'A5'; checklist.autoFilter = { from: 'A4', to: `D${4 + checklistRows.length}` };

const sources = workbook.addWorksheet('Sumber');
title(sources, 'Sumber Harga dan Referensi', 'URL resmi/primer yang digunakan sebagai referensi workbook. Tarif dinamis tetap harus dicek kembali saat pembelian atau production launch.');
sources.getRow(4).values = ['Provider', 'Referensi', 'URL', 'Tanggal cek', 'Keterangan']; header(sources.getRow(4));
const sourceRows = [
  ['Meta', 'WhatsApp Business Platform Pricing', 'https://whatsappbusiness.com/products/platform-pricing/', '2026-09-01', 'Per delivered message; market + category'],
  ['Meta', 'Business Messaging Policy Indonesia', 'https://business.whatsapp.com/policy/preview?lang=id_ID', '2026-09-01', 'Consent, approved templates, opt-out'],
  ['Meta', 'Messages API collection', 'https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages', '2026-09-01', 'Endpoint and required token/Phone Number ID'],
  ['Meta', 'Templates API collection', 'https://www.postman.com/meta/whatsapp-business-platform/folder/lczy75a/templates', '2026-09-01', 'Template creation and management'],
  ['Meta', 'Webhooks API collection', 'https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks', '2026-09-01', 'Webhook subscription and events'],
  ['Google', 'Geocoding API overview', 'https://developers.google.com/maps/documentation/geocoding/overview', '2026-09-01', 'Forward and reverse geocoding'],
  ['Google', 'Core services pricing list', 'https://developers.google.com/maps/billing-and-pricing/pricing', '2026-09-01', 'Geocoding: 10k free; baseline USD 5/1k; Dynamic Maps: USD 7/1k baseline'],
  ['Google', 'API security best practices', 'https://developers.google.com/maps/api-security-best-practices', '2026-09-01', 'Key restrictions and server/browser separation'],
  ['Google', 'Maps JavaScript API overview', 'https://developers.google.com/maps/documentation/javascript/overview', '2026-09-01', 'Optional interactive Google map'],
  ['Local', 'Current application architecture', 'README.md', '2026-09-01', 'NestJS, PostgreSQL/PostGIS, Redis/BullMQ, Leaflet/OSM'],
];
sourceRows.forEach((values, index) => { const row = sources.getRow(5 + index); row.values = values; bodyStyle(row, index % 2 ? colors.white : colors.lightBlue); row.getCell(3).font = { color: '0563C1', underline: true }; });
sources.getColumn(1).width = 14; sources.getColumn(2).width = 34; sources.getColumn(3).width = 75; sources.getColumn(4).width = 16; sources.getColumn(5).width = 58; sources.freezePanes = 'A5'; sources.autoFilter = { from: 'A4', to: `E${4 + sourceRows.length}` };

for (const sheet of workbook.worksheets) {
  sheet.eachRow((row) => { row.alignment = { ...row.alignment, vertical: row.alignment?.vertical || 'top' }; });
  sheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  sheet.properties.defaultRowHeight = 18;
}

workbook.xlsx.writeFile(outputPath).then(() => console.log(outputPath));
