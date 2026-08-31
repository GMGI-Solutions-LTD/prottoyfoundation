// Reconciliation engine (Phase 1 — READ ONLY).
//
// This module is deliberately side-effect free. It contains BOTH:
//   1. `legacyDueRows`  — a byte-faithful re-implementation of the calculation
//      currently shipped in src/pages/Dues.tsx (the fixed baseline).
//   2. `reconciledDueRows` — the new Section 7 formula, adapted to this
//      project's data-driven fee model (funds + member_fund_subscriptions),
//      per the confirmed decision to keep existing fees as the source of truth.
//
// Nothing here is wired into the live Dues page. It powers the parity report
// only, so any discrepancy can be reviewed by an Admin BEFORE the new formula
// is allowed to influence a displayed value.

export type ReconFund = {
  id: string;
  name: string;
  code: string;
  is_one_time: boolean;
};

export type ReconMember = {
  id: string;
  full_name: string;
  member_no: number;
  is_active: boolean;
  joining_date: string;
};

export type ReconSubscription = {
  id: string;
  member_id: string;
  fund_id: string;
  monthly_amount: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type ReconTxn = {
  member_id: string | null;
  fund_id: string;
  amount: number;
  txn_date: string;
};

/** "YYYY-MM" */
export type YearMonth = string;

export function ymToDate(ym: YearMonth): Date {
  return new Date(`${ym}-01T00:00:00`);
}

export function dateToYm(d: Date | string): YearMonth {
  const dd = typeof d === "string" ? new Date(d) : d;
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive month count. Returns 0 when end precedes start. */
export function monthsBetween(startYm: YearMonth, endYm: YearMonth): number {
  const s = ymToDate(startYm);
  const e = ymToDate(endYm);
  if (e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export function currentYm(now: Date = new Date()): YearMonth {
  return dateToYm(now);
}

/**
 * Section 1 — dynamic Target Month resolution.
 * Resolves to the latest transaction month found in the data, falling back to
 * the current system month when no dated record is present. An explicit
 * override always wins.
 */
export function resolveTargetMonth(opts: {
  override?: YearMonth | null;
  txnDates?: string[];
  excelMonthHeaders?: YearMonth[];
  now?: Date;
}): { targetMonth: YearMonth; source: "override" | "excel" | "transactions" | "system" } {
  const { override, txnDates = [], excelMonthHeaders = [], now = new Date() } = opts;

  if (override) return { targetMonth: override, source: "override" };

  const excelLatest = excelMonthHeaders.filter(Boolean).sort().at(-1);
  if (excelLatest) return { targetMonth: excelLatest, source: "excel" };

  const txnLatest = txnDates
    .filter(Boolean)
    .map((d) => dateToYm(d))
    .sort()
    .at(-1);
  if (txnLatest) return { targetMonth: txnLatest, source: "transactions" };

  return { targetMonth: currentYm(now), source: "system" };
}

export type DueRow = {
  key: string;
  memberId: string;
  memberNo: number;
  memberName: string;
  fundId: string;
  fundName: string;
  isOneTime: boolean;
  monthly: number;
  months: number;
  expected: number;
  paid: number;
  due: number;
};

type Ctx = {
  funds: ReconFund[];
  members: ReconMember[];
  subs: ReconSubscription[];
  txns: ReconTxn[];
  targetMonth: YearMonth;
  /** Fund ids treated as EXEMPTED for this member (registration fee waivers). */
  exemptions?: Set<string>;
};

function maps(ctx: Ctx) {
  return {
    memberMap: new Map(ctx.members.map((m) => [m.id, m])),
    fundMap: new Map(ctx.funds.map((f) => [f.id, f])),
  };
}

function paidAll(txns: ReconTxn[], memberId: string, fundId: string, upToYm: YearMonth) {
  return txns
    .filter((t) => t.member_id === memberId && t.fund_id === fundId && dateToYm(t.txn_date) <= upToYm)
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * BASELINE: mirrors src/pages/Dues.tsx exactly as it behaves today.
 * Do not "improve" this — it exists purely as the comparison reference.
 */
export function legacyDueRows(ctx: Ctx): DueRow[] {
  const { memberMap, fundMap } = maps(ctx);
  const endMonth = ctx.targetMonth;

  return ctx.subs
    .map((s) => {
      const fund = fundMap.get(s.fund_id);
      const member = memberMap.get(s.member_id);
      const startYm = dateToYm(s.start_date);
      const isOneTime = !!fund?.is_one_time;

      let months: number;
      let expected: number;
      let paid: number;

      if (isOneTime) {
        months = 1;
        expected = s.monthly_amount;
        paid = ctx.txns
          .filter((t) => t.member_id === s.member_id && t.fund_id === s.fund_id)
          .reduce((sum, t) => sum + t.amount, 0);
      } else {
        const effectiveStart = startYm > endMonth ? endMonth : startYm;
        months = monthsBetween(effectiveStart, endMonth);
        expected = months * s.monthly_amount;
        paid = ctx.txns
          .filter(
            (t) =>
              t.member_id === s.member_id &&
              t.fund_id === s.fund_id &&
              dateToYm(t.txn_date) <= endMonth &&
              dateToYm(t.txn_date) >= startYm,
          )
          .reduce((sum, t) => sum + t.amount, 0);
      }

      const rawDue = expected - paid;
      return {
        key: s.id,
        memberId: s.member_id,
        memberNo: member?.member_no ?? 0,
        memberName: member?.full_name ?? "—",
        fundId: s.fund_id,
        fundName: fund?.name ?? "—",
        isOneTime,
        monthly: isOneTime ? 0 : s.monthly_amount,
        months: isOneTime ? 0 : months,
        expected,
        paid,
        due: isOneTime ? Math.max(rawDue, 0) : rawDue,
      };
    })
    .sort((a, b) => a.memberNo - b.memberNo || a.fundName.localeCompare(b.fundName));
}

/**
 * NEW (Section 7), data-driven fee variant.
 *
 * Differences from the baseline, all intentional:
 *  - Joining/start month AFTER the target month => N = 0 and Expected = 0
 *    (the baseline clamps to the target month and charges 1 month).
 *  - One-time funds flagged EXEMPTED => Expected = 0, Due = 0. Monthly funds
 *    keep accruing for exempted members.
 *  - Monthly paid totals are no longer floored at the subscription start month,
 *    so a backdated/bulk payment recorded before the start month still counts.
 */
export function reconciledDueRows(ctx: Ctx): DueRow[] {
  const { memberMap, fundMap } = maps(ctx);
  const target = ctx.targetMonth;
  const exemptions = ctx.exemptions ?? new Set<string>();

  return ctx.subs
    .map((s) => {
      const fund = fundMap.get(s.fund_id);
      const member = memberMap.get(s.member_id);
      const isOneTime = !!fund?.is_one_time;
      const startYm = dateToYm(s.start_date);
      const exempted = isOneTime && exemptions.has(`${s.member_id}:${s.fund_id}`);

      let months: number;
      let expected: number;

      if (isOneTime) {
        months = startYm > target ? 0 : 1;
        expected = exempted || months === 0 ? 0 : s.monthly_amount;
      } else {
        months = startYm > target ? 0 : monthsBetween(startYm, target);
        expected = months * s.monthly_amount;
      }

      const paid = paidAll(ctx.txns, s.member_id, s.fund_id, target);
      const rawDue = expected - paid;

      return {
        key: s.id,
        memberId: s.member_id,
        memberNo: member?.member_no ?? 0,
        memberName: member?.full_name ?? "—",
        fundId: s.fund_id,
        fundName: fund?.name ?? "—",
        isOneTime,
        monthly: isOneTime ? 0 : s.monthly_amount,
        months: isOneTime ? 0 : months,
        expected,
        paid,
        due: exempted ? 0 : isOneTime ? Math.max(rawDue, 0) : rawDue,
      };
    })
    .sort((a, b) => a.memberNo - b.memberNo || a.fundName.localeCompare(b.fundName));
}

export type ParityRow = {
  key: string;
  memberNo: number;
  memberName: string;
  fundName: string;
  legacy: DueRow;
  next: DueRow;
  expectedDelta: number;
  paidDelta: number;
  dueDelta: number;
  matches: boolean;
  reasons: string[];
};

/** Compares baseline vs new output row-by-row and explains every difference. */
export function compareDueRows(legacy: DueRow[], next: DueRow[]): ParityRow[] {
  const nextMap = new Map(next.map((r) => [r.key, r]));

  return legacy.map((l) => {
    const n = nextMap.get(l.key) ?? l;
    const expectedDelta = n.expected - l.expected;
    const paidDelta = n.paid - l.paid;
    const dueDelta = n.due - l.due;

    const reasons: string[] = [];
    if (expectedDelta !== 0 && n.months === 0) {
      reasons.push("Subscription starts after the target month — new rule charges nothing (guard N = 0).");
    } else if (expectedDelta !== 0) {
      reasons.push("Expected total differs (month count or exemption change).");
    }
    if (paidDelta !== 0) {
      reasons.push("Payment recorded before the subscription start month now counts toward Paid.");
    }
    if (dueDelta !== 0 && reasons.length === 0) {
      reasons.push("Due differs — needs investigation.");
    }

    return {
      key: l.key,
      memberNo: l.memberNo,
      memberName: l.memberName,
      fundName: l.fundName,
      legacy: l,
      next: n,
      expectedDelta,
      paidDelta,
      dueDelta,
      matches: expectedDelta === 0 && paidDelta === 0 && dueDelta === 0,
      reasons,
    };
  });
}

/** Section 8 — presentation-only joining-month breakdown. */
export type JoiningMonthBreakdown = {
  month: YearMonth;
  lines: { label: string; amount: number; note?: string }[];
  total: number;
};

export function joiningMonthBreakdown(
  member: ReconMember,
  subs: ReconSubscription[],
  funds: ReconFund[],
): JoiningMonthBreakdown {
  const month = dateToYm(member.joining_date);
  const fundMap = new Map(funds.map((f) => [f.id, f]));
  const lines: { label: string; amount: number; note?: string }[] = [];

  for (const s of subs.filter((x) => x.member_id === member.id && x.is_active)) {
    const fund = fundMap.get(s.fund_id);
    if (!fund) continue;
    if (dateToYm(s.start_date) !== month) continue;
    lines.push({
      label: fund.name,
      amount: s.monthly_amount,
      note: fund.is_one_time ? "one-time" : undefined,
    });
  }

  return { month, lines, total: lines.reduce((sum, l) => sum + l.amount, 0) };
}
