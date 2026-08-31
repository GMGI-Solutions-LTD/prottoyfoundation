// Parser for the "Reg and Monthly" sheet of the Prottoy Foundation account summary.
//
// Validated layout (row 1 = header):
//   A: Member No | B: Member Name | C: Reference Person Name | D: Member Type | E: Fee
//   then repeating pairs: [Date, <Month_Year>] starting at column F/G.
//
// Section 3 alignment: month columns are discovered from the header row, so
// adding future month pairs to the workbook needs no code change.

import * as XLSX from "xlsx";

export const SHEET_NAME = "Reg and Monthly";

export type ParsedPayment = {
  /** "YYYY-MM" */
  forMonth: string;
  /** ISO date (YYYY-MM-DD) */
  txnDate: string;
  amount: number;
};

export type ParsedRow = {
  excelRow: number;
  memberNo: number;
  fullName: string;
  referencePerson: string | null;
  memberType: string;
  registrationFee: number | null;
  registrationDate: string | null;
  /** Earliest dated activity — used as joining date. */
  joiningDate: string;
  monthlyFee: number;
  monthlyFundCode: string;
  payments: ParsedPayment[];
};

export type ParseIssue = {
  level: "error" | "warning";
  excelRow: number | null;
  message: string;
};

export type ParseResult = {
  fileName: string;
  monthHeaders: string[];
  rows: ParsedRow[];
  issues: ParseIssue[];
};

/** Excel header label ("August_2024") -> "YYYY-MM" */
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function headerToYm(label: string): string | null {
  const m = String(label).trim().replace(/\s+/g, "_").match(/^([A-Za-z]+)_(\d{4})$/);
  if (!m) return null;
  const idx = MONTHS.indexOf(m[1].toLowerCase());
  if (idx < 0) return null;
  return `${m[2]}-${String(idx + 1).padStart(2, "0")}`;
}

export function ymToHeader(ym: string): string {
  const [y, mo] = ym.split("-");
  const name = MONTHS[Number(mo) - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}_${y}`;
}

function toIsoDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    const d = value;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[,\s৳]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Section 2 — member type -> monthly fund + default monthly fee. */
export function fundForMemberType(memberType: string): { code: string; defaultFee: number } {
  const t = memberType.toLowerCase();
  if (t.includes("founding") || t.includes("executive")) {
    return { code: "MONTHLY_FOUNDING", defaultFee: 100 };
  }
  return { code: "MONTHLY_GENERAL", defaultFee: 50 };
}

/** Most frequent positive amount in a member's month cells (fallback: type default). */
function inferMonthlyFee(amounts: number[], fallback: number): number {
  const counts = new Map<number, number>();
  for (const a of amounts) {
    if (a > 0) counts.set(a, (counts.get(a) ?? 0) + 1);
  }
  let best = fallback;
  let bestCount = 0;
  for (const [amount, count] of counts) {
    if (count > bestCount || (count === bestCount && amount < best)) {
      best = amount;
      bestCount = count;
    }
  }
  return bestCount > 0 ? best : fallback;
}

export function parseRegAndMonthly(fileName: string, data: ArrayBuffer): ParseResult {
  const issues: ParseIssue[] = [];
  const wb = XLSX.read(data, { cellDates: true });
  const sheet = wb.Sheets[SHEET_NAME];
  if (!sheet) {
    return {
      fileName,
      monthHeaders: [],
      rows: [],
      issues: [{ level: "error", excelRow: null, message: `Sheet "${SHEET_NAME}" not found. Found: ${wb.SheetNames.join(", ")}` }],
    };
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: false });
  if (grid.length < 2) {
    return { fileName, monthHeaders: [], rows: [], issues: [{ level: "error", excelRow: null, message: "Sheet has no data rows." }] };
  }

  const header = grid[0] as unknown[];
  // Discover (dateCol, amountCol) pairs from the header row.
  const monthCols: { ym: string; dateCol: number; amountCol: number }[] = [];
  for (let c = 5; c < header.length; c++) {
    const ym = headerToYm(String(header[c] ?? ""));
    if (ym) monthCols.push({ ym, dateCol: c - 1, amountCol: c });
  }
  if (monthCols.length === 0) {
    issues.push({ level: "error", excelRow: 1, message: "No Month_Year columns detected in the header row." });
  }

  const seen = new Set<number>();
  const rows: ParsedRow[] = [];

  for (let r = 1; r < grid.length; r++) {
    const row = grid[r] as unknown[];
    const excelRow = r + 1;
    const fullName = String(row[1] ?? "").trim();
    if (!fullName) continue;

    const memberNo = toNumber(row[0]);
    if (memberNo == null) {
      issues.push({ level: "error", excelRow, message: `"${fullName}" has no Member No — row skipped.` });
      continue;
    }
    if (seen.has(memberNo)) {
      issues.push({ level: "error", excelRow, message: `Duplicate Member No ${memberNo} — row skipped.` });
      continue;
    }
    seen.add(memberNo);

    const memberType = String(row[3] ?? "").trim() || "General";
    const { code: monthlyFundCode, defaultFee } = fundForMemberType(memberType);
    const registrationFee = toNumber(row[4]);
    const registrationDate = toIsoDate(row[5]);

    const payments: ParsedPayment[] = [];
    const amounts: number[] = [];
    for (const mc of monthCols) {
      const amount = toNumber(row[mc.amountCol]);
      if (amount == null || amount === 0) continue;
      const txnDate = toIsoDate(row[mc.dateCol]) ?? `${mc.ym}-01`;
      if (!toIsoDate(row[mc.dateCol])) {
        issues.push({ level: "warning", excelRow, message: `${fullName}: ${ymToHeader(mc.ym)} has an amount but no date — defaulting to the 1st.` });
      }
      if (amount < 0) {
        issues.push({ level: "error", excelRow, message: `${fullName}: negative amount in ${ymToHeader(mc.ym)}.` });
        continue;
      }
      amounts.push(amount);
      payments.push({ forMonth: mc.ym, txnDate, amount });
    }

    const monthlyFee = inferMonthlyFee(amounts, defaultFee);
    for (const p of payments) {
      if (p.amount % monthlyFee !== 0 && p.amount !== monthlyFee) {
        issues.push({
          level: "warning",
          excelRow,
          message: `${fullName}: ${ymToHeader(p.forMonth)} amount ৳${p.amount} is not a multiple of the ৳${monthlyFee} monthly fee.`,
        });
      }
    }

    const candidateDates = [registrationDate, ...payments.map((p) => p.txnDate)].filter(Boolean) as string[];
    if (candidateDates.length === 0) {
      issues.push({ level: "error", excelRow, message: `${fullName} has no dated entries — row skipped.` });
      continue;
    }
    const joiningDate = candidateDates.sort()[0];

    if (registrationFee == null) {
      issues.push({ level: "warning", excelRow, message: `${fullName} has no registration fee recorded.` });
    }

    rows.push({
      excelRow,
      memberNo,
      fullName,
      referencePerson: (String(row[2] ?? "").trim() || null),
      memberType,
      registrationFee,
      registrationDate: registrationDate ?? joiningDate,
      joiningDate,
      monthlyFee,
      monthlyFundCode,
      payments,
    });
  }

  return { fileName, monthHeaders: monthCols.map((m) => m.ym), rows, issues };
}

/** Payload shape consumed by the import_reg_and_monthly() RPC. */
export function toImportPayload(rows: ParsedRow[]) {
  return rows.map((r) => ({
    member_no: r.memberNo,
    full_name: r.fullName,
    reference_person: r.referencePerson,
    member_type: r.memberType,
    joining_date: r.joiningDate,
    monthly_fee: r.monthlyFee,
    monthly_fund_code: r.monthlyFundCode,
    registration_fee: r.registrationFee,
    registration_date: r.registrationDate,
    payments: r.payments.map((p) => ({
      for_month: p.forMonth,
      txn_date: p.txnDate,
      amount: p.amount,
    })),
  }));
}
