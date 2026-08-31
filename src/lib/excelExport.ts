// Excel export — rebuilds the "Reg and Monthly" sheet layout from live data.
import * as XLSX from "xlsx";
import { ymToHeader } from "./excelSheet";

export type ExportMember = {
  member_no: number;
  full_name: string;
  reference_person: string | null;
  member_type: string;
  registration_fee: number | null;
  registration_date: string | null;
  /** ym -> { date, amount } */
  monthly: Record<string, { date: string; amount: number }>;
};

/** Inclusive list of "YYYY-MM" between two months. */
export function monthRange(startYm: string, endYm: string): string[] {
  const out: string[] = [];
  let [y, m] = startYm.split("-").map(Number);
  const [ey, em] = endYm.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** Section 9 — raw numbers with a Taka display format (never currency strings). */
export const BDT_FMT = '"৳"#,##0;("৳"#,##0);"-"';

/** Prottoy_Summary_<TargetMonth>_<ExportDate>.xlsx */
export function exportFileName(targetMonth: string, exportDate = new Date()): string {
  const stamp = `${exportDate.getFullYear()}-${String(exportDate.getMonth() + 1).padStart(2, "0")}-${String(
    exportDate.getDate(),
  ).padStart(2, "0")}`;
  return `Prottoy_Summary_${targetMonth}_${stamp}.xlsx`;
}

export function buildRegAndMonthlyWorkbook(members: ExportMember[], months: string[]) {
  const aoa: (string | number | null)[][] = [
    [
      "Member No", "Member Name", "Reference Person Name", "Member Type", "Fee",
      ...months.flatMap((ym) => ["Date", ymToHeader(ym)]),
    ],
  ];

  for (const m of members) {
    const row: (string | number | null)[] = [
      m.member_no,
      m.full_name,
      m.reference_person ?? null,
      m.member_type,
      m.registration_fee ?? null,
      ...months.flatMap((ym) => {
        const cell = m.monthly[ym];
        return [cell ? cell.date : null, cell ? cell.amount : null];
      }),
    ];
    // Column F is the registration / first payment date in the source layout.
    if (!row[5]) row[5] = m.registration_date ?? null;
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [
    { wch: 10 }, { wch: 26 }, { wch: 22 }, { wch: 20 }, { wch: 8 },
    ...months.flatMap(() => [{ wch: 12 }, { wch: 13 }]),
  ];
  ws["!freeze"] = { xSplit: "2", ySplit: "1" };

  // Section 9 formatting: bold header row, centered month columns, ৳ number format.
  const lastCol = 5 + months.length * 2;
  for (let c = 0; c < lastCol; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    const cell = ws[ref];
    if (cell) cell.s = { font: { bold: true }, alignment: { horizontal: c >= 5 ? "center" : "left" } };
  }
  for (let r = 1; r <= members.length; r++) {
    const feeRef = XLSX.utils.encode_cell({ r, c: 4 });
    if (ws[feeRef] && typeof ws[feeRef].v === "number") ws[feeRef].z = BDT_FMT;
    for (let i = 0; i < months.length; i++) {
      const dateRef = XLSX.utils.encode_cell({ r, c: 5 + i * 2 });
      const amtRef = XLSX.utils.encode_cell({ r, c: 6 + i * 2 });
      if (ws[dateRef]) ws[dateRef].s = { alignment: { horizontal: "center" } };
      if (ws[amtRef] && typeof ws[amtRef].v === "number") {
        ws[amtRef].z = BDT_FMT;
        ws[amtRef].s = { alignment: { horizontal: "center" } };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Reg and Monthly");
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(wb, fileName, { bookType: "xlsx", compression: true, cellStyles: true });
}

