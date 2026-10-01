const spreadsheetFormulaPrefix = /^[\u0000-\u0020\uFEFF]*[=+\-@]/;

export function safeCsvCell(value: string): string {
  const safeValue = spreadsheetFormulaPrefix.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safeValue) ? `"${safeValue.replaceAll('"', '""')}"` : safeValue;
}
