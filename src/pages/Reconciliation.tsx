import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { formatBDT } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { safeErrorMessage } from "@/lib/errors";
import { CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  compareDueRows,
  legacyDueRows,
  reconciledDueRows,
  resolveTargetMonth,
  type ParityRow,
  type ReconFund,
  type ReconMember,
  type ReconSubscription,
  type ReconTxn,
} from "@/lib/reconciliation";

export default function Reconciliation() {
  const [funds, setFunds] = useState<ReconFund[]>([]);
  const [members, setMembers] = useState<ReconMember[]>([]);
  const [subs, setSubs] = useState<ReconSubscription[]>([]);
  const [txns, setTxns] = useState<ReconTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState<string>("");
  const [onlyDiffs, setOnlyDiffs] = useState(true);

  useEffect(() => {
    document.title = "Reconciliation Parity Report | Prottoy Foundation";
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [fRes, mRes, sRes, tRes] = await Promise.all([
      supabase.from("funds").select("id,name,code,is_one_time").order("sort_order"),
      supabase.from("members").select("id,full_name,member_no,is_active,joining_date").order("member_no"),
      supabase.from("member_fund_subscriptions").select("*").eq("is_active", true),
      supabase.from("transactions").select("member_id,fund_id,amount,txn_date"),
    ]);
    const err = fRes.error || mRes.error || sRes.error || tRes.error;
    if (err) toast({ title: "Failed to load", description: safeErrorMessage(err), variant: "destructive" });
    setFunds((fRes.data ?? []) as ReconFund[]);
    setMembers((mRes.data ?? []) as ReconMember[]);
    setSubs(((sRes.data ?? []) as ReconSubscription[]).map((s) => ({ ...s, monthly_amount: Number(s.monthly_amount) })));
    setTxns(((tRes.data ?? []) as ReconTxn[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  }

  const resolved = useMemo(
    () => resolveTargetMonth({ override: override || null, txnDates: txns.map((t) => t.txn_date) }),
    [override, txns],
  );

  const parity: ParityRow[] = useMemo(() => {
    if (loading) return [];
    const ctx = { funds, members, subs, txns, targetMonth: resolved.targetMonth };
    return compareDueRows(legacyDueRows(ctx), reconciledDueRows(ctx));
  }, [loading, funds, members, subs, txns, resolved.targetMonth]);

  const diffs = useMemo(() => parity.filter((p) => !p.matches), [parity]);
  const visible = onlyDiffs ? diffs : parity;

  const totals = useMemo(
    () =>
      parity.reduce(
        (acc, p) => ({
          legacyDue: acc.legacyDue + p.legacy.due,
          nextDue: acc.nextDue + p.next.due,
        }),
        { legacyDue: 0, nextDue: 0 },
      ),
    [parity],
  );

  const sourceLabel: Record<string, string> = {
    override: "manual override",
    excel: "latest Excel month column",
    transactions: "latest transaction date",
    system: "current system month",
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reconciliation Parity Report</h1>
          <p className="text-sm text-muted-foreground">
            Read-only comparison of the live Dues calculation against the new reconciliation formula. Nothing on this
            page writes to the database or changes any existing value.
          </p>
        </div>

        <Card className="border-primary/30">
          <CardHeader className="flex flex-row items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Phase 1 — baseline verification</CardTitle>
              <CardDescription>
                The new formula stays disabled until every difference below is reviewed and approved. The live Dues page
                is untouched.
              </CardDescription>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Target month</CardTitle>
            <CardDescription>
              Resolved to <span className="font-medium text-foreground">{resolved.targetMonth}</span> from{" "}
              {sourceLabel[resolved.source]}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="override">Override target month</Label>
                <Input id="override" type="month" value={override} onChange={(e) => setOverride(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <Switch id="onlyDiffs" checked={onlyDiffs} onCheckedChange={setOnlyDiffs} />
                <Label htmlFor="onlyDiffs" className="mb-2">Show differences only</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardDescription>Rows compared</CardDescription></CardHeader>
            <CardContent className="text-2xl font-semibold">{loading ? "…" : parity.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Discrepancies</CardDescription></CardHeader>
            <CardContent className="flex items-center gap-2 text-2xl font-semibold">
              {loading ? "…" : diffs.length}
              {!loading && (diffs.length === 0
                ? <CheckCircle2 className="h-5 w-5 text-primary" />
                : <AlertTriangle className="h-5 w-5 text-destructive" />)}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardDescription>Total due (live → new)</CardDescription></CardHeader>
            <CardContent className="font-mono text-lg font-semibold">
              {formatBDT(totals.legacyDue)} → {formatBDT(totals.nextDue)}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Row-by-row comparison</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${visible.length} row${visible.length === 1 ? "" : "s"} shown`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">No.</TableHead>
                    <TableHead>Member</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead className="text-right">Live due</TableHead>
                    <TableHead className="text-right">New due</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Explanation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.length === 0 && !loading && (
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {onlyDiffs ? "No discrepancies — the new formula matches every live value." : "No rows."}
                    </TableCell>
                  )}
                  {visible.map((p) => (
                    <TableRow key={p.key}>
                      <TableCell className="font-mono">{p.memberNo}</TableCell>
                      <TableCell className="font-medium">{p.memberName}</TableCell>
                      <TableCell>{p.fundName}</TableCell>
                      <TableCell className="text-right font-mono">{formatBDT(p.legacy.due)}</TableCell>
                      <TableCell className="text-right font-mono">{formatBDT(p.next.due)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {p.dueDelta === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <Badge variant={p.dueDelta > 0 ? "destructive" : "secondary"}>
                            {p.dueDelta > 0 ? "+" : "−"}{formatBDT(Math.abs(p.dueDelta))}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="max-w-md text-xs text-muted-foreground">
                        {p.reasons.length ? p.reasons.join(" ") : "Identical."}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
