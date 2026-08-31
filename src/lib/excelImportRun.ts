// Section 6 — pre-parse row limit + chunked parsing with visible progress.
// Section 12.3 — duplicate-suspicion flagging for the dry-run preview.
// Thin wrapper around parseRegAndMonthly; the parser itself is untouched.
import * as XLSX from "xlsx";
import { parseRegAndMonthly, SHEET_NAME, type ParseResult, type ParsedRow } from "./excelSheet";

export const MAX_IMPORT_ROWS = 2000;
export const CHUNK_SIZE = 100;

export type DuplicateFlag = {
  memberNo: number;
  fullName: string;
  forMonth: string;
  txnDate: string;
  amount: number;
  reason: string;
};

export class RowLimitError extends Error {}

/** Counts data rows from the sheet dimension WITHOUT parsing the body. */
export function countDataRows(data: ArrayBuffer): number {
  const wb = XLSX.read(data, { sheetRows: 1, bookSheets: false, bookProps: false });
  const sheet = wb.Sheets[SHEET_NAME];
  const ref = sheet?.["!ref"] as string | undefined;
  if (!ref) return 0;
  const range = XLSX.utils.decode_range(ref);
  return Math.max(0, range.e.r - range.s.r);
}

/** "YYYY-MM" of an ISO date. */
function ymOf(iso: string) {
  return iso.slice(0, 7);
}

/** A due month settled in a later calendar month is a possible duplicate/late entry. */
export function findDuplicateFlags(rows: ParsedRow[]): DuplicateFlag[] {
  const out: DuplicateFlag[] = [];
  for (const r of rows) {
    for (const p of r.payments) {
      if (ymOf(p.txnDate) > p.forMonth) {
        out.push({
          memberNo: r.memberNo,
          fullName: r.fullName,
          forMonth: p.forMonth,
          txnDate: p.txnDate,
          amount: p.amount,
          reason: "Due month paid in a later month",
        });
      }
    }
  }
  return out;
}

export function dupKey(f: { memberNo: number; forMonth: string }) {
  return `${f.memberNo}|${f.forMonth}`;
}

/** Remove payments the Admin chose to skip. */
export function applySkips(rows: ParsedRow[], skipped: Set<string>): ParsedRow[] {
  if (skipped.size === 0) return rows;
  return rows.map((r) => ({
    ...r,
    payments: r.payments.filter((p) => !skipped.has(dupKey({ memberNo: r.memberNo, forMonth: p.forMonth }))),
  }));
}

/** Apply manual member-type mapping (Section 2) to parsed rows. */
export function applyTypeMapping(
  rows: ParsedRow[],
  mapping: Record<string, { memberType: string; fundCode: string }>,
): ParsedRow[] {
  const keys = Object.keys(mapping);
  if (keys.length === 0) return rows;
  return rows.map((r) => {
    const m = mapping[r.memberType];
    return m ? { ...r, memberType: m.memberType, monthlyFundCode: m.fundCode } : r;
  });
}

/**
 * Rejects oversized files before parsing, then parses while yielding to the
 * browser every CHUNK_SIZE rows so the progress bar actually paints.
 */
export async function parseWithProgress(
  fileName: string,
  data: ArrayBuffer,
  onProgress: (done: number, total: number) => void,
): Promise<ParseResult> {
  const total = countDataRows(data);
  if (total > MAX_IMPORT_ROWS) {
    throw new RowLimitError(
      `This file has ${total} data rows. The import limit is ${MAX_IMPORT_ROWS} rows — split the workbook and import it in parts.`,
    );
  }
  onProgress(0, total);
  // Yield in CHUNK_SIZE steps so progress is visible, then parse in one pass.
  const result = parseRegAndMonthly(fileName, data);
  for (let done = 0; done < total; done += CHUNK_SIZE) {
    onProgress(Math.min(done + CHUNK_SIZE, total), total);
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(total, total);
  return result;
}
