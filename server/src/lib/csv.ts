/**
 * CSV that spreadsheets actually open correctly.
 *
 * Three details do the work:
 *  - **Quoting.** A product name containing a comma splits into two columns
 *    otherwise, silently shifting every column after it.
 *  - **CRLF.** Excel treats a bare LF file as a single line.
 *  - **A UTF-8 BOM.** Without it Excel on Windows reads `₹` as `â‚¹`, which is
 *    the single most common "your export is broken" report.
 */
const escapeCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';

  const text = String(value);

  /**
   * A cell starting with `=`, `+`, `-` or `@` is executed as a formula when the
   * file is opened. `=cmd|'/c calc'!A1` in a customer's name field is a real
   * attack, and the fix is a leading apostrophe rather than stripping data the
   * merchant may need.
   */
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export const toCsv = <T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string => {
  const lines = [
    columns.map((column) => escapeCell(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(',')),
  ];

  // The leading character is a UTF-8 BOM, on purpose: without it Excel opens
  // the file as Latin-1 and every ₹ becomes mojibake. CRLF for the same reason.
  // eslint-disable-next-line no-irregular-whitespace -- deliberate BOM
  return `﻿${lines.join('\r\n')}\r\n`;
};

/** `2026-09-03` — sorts correctly in a filename and needs no locale. */
export const isoDay = (date = new Date()): string => date.toISOString().slice(0, 10);

/**
 * The plain decimal a spreadsheet can add up: `149900` → `1499.00`.
 *
 * Not the formatted `₹1,499.00`: a thousands separator in a CSV cell is text,
 * the merchant's `SUM()` returns zero, and nothing says why. The currency
 * belongs in the column heading, once.
 */
export const csvMoney = (value: { amount: number } | null | undefined): string =>
  value ? (value.amount / 100).toFixed(2) : '';
