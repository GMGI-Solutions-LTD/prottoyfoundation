import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, FileDown } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatBDT } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { safeErrorMessage } from "@/lib/errors";

type Fund = { id: string; name: string; code: string; is_one_time: boolean };
type Member = { id: string; full_name: string; member_no: number; is_active: boolean };
type Subscription = {
  id: string;
  member_id: string;
  fund_id: string;
  monthly_amount: number;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
};
type Txn = { member_id: string | null; fund_id: string; amount: number; txn_date: string };

const ALL = "all";

function ymToDate(ym: string) {
  return new Date(`${ym}-01T00:00:00`);
}
function dateToYm(d: Date | string) {
  const dd = typeof d === "string" ? new Date(d) : d;
  return `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`;
}
function monthsBetween(startYm: string, endYm: string) {
  const s = ymToDate(startYm);
  const e = ymToDate(endYm);
  if (e < s) return 0;
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

export default function Dues() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const defaultEnd = dateToYm(today);
  const [memberFilter, setMemberFilter] = useState<string>(ALL);
  const [fundFilter, setFundFilter] = useState<string>(ALL);
  const [endMonth, setEndMonth] = useState<string>(defaultEnd);

  useEffect(() => {
    document.title = "Dues | Prottoy Foundation";
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [fRes, mRes, sRes, tRes] = await Promise.all([
      supabase.from("funds").select("id,name,code,is_one_time").order("sort_order"),
      supabase.from("members").select("id,full_name,member_no,is_active").order("member_no"),
      supabase.from("member_fund_subscriptions").select("*").eq("is_active", true),
      supabase.from("transactions").select("member_id,fund_id,amount,txn_date"),
    ]);
    const err = fRes.error || mRes.error || sRes.error || tRes.error;
    if (err) toast({ title: "Failed to load", description: safeErrorMessage(err), variant: "destructive" });
    setFunds((fRes.data ?? []) as Fund[]);
    setMembers((mRes.data ?? []) as Member[]);
    setSubs(((sRes.data ?? []) as Subscription[]).map((s) => ({ ...s, monthly_amount: Number(s.monthly_amount) })));
    setTxns(((tRes.data ?? []) as Txn[]).map((t) => ({ ...t, amount: Number(t.amount) })));
    setLoading(false);
  }

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const fundMap = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds]);

  const rows = useMemo(() => {
    return subs
      .filter((s) => memberFilter === ALL || s.member_id === memberFilter)
      .filter((s) => fundFilter === ALL || s.fund_id === fundFilter)
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
          paid = txns
            .filter((t) => t.member_id === s.member_id && t.fund_id === s.fund_id)
            .reduce((sum, t) => sum + t.amount, 0);
        } else {
          const effectiveStart = startYm > endMonth ? endMonth : startYm;
          months = monthsBetween(effectiveStart, endMonth);
          expected = months * s.monthly_amount;
          paid = txns
            .filter(
              (t) =>
                t.member_id === s.member_id &&
                t.fund_id === s.fund_id &&
                dateToYm(t.txn_date) <= endMonth &&
                dateToYm(t.txn_date) >= startYm
            )
            .reduce((sum, t) => sum + t.amount, 0);
        }
        const rawDue = expected - paid;
        const due = isOneTime ? Math.max(rawDue, 0) : rawDue;
        const monthlyAmount = isOneTime ? 0 : s.monthly_amount;
        const totalMonths = isOneTime ? 0 : months;
        const paidMonths = monthlyAmount > 0 ? Math.floor(paid / monthlyAmount) : null;
        const dueMonths = paidMonths === null ? null : Math.max(totalMonths - paidMonths, 0);
        return {
          key: s.id,
          memberNo: member?.member_no ?? 0,
          memberName: member?.full_name ?? "—",
          fundName: fund?.name ?? "—",
          monthly: monthlyAmount,
          months: totalMonths,
          joiningYm: startYm,
          joiningLabel: ymToDate(startYm).toLocaleString("en-US", { month: "long", year: "numeric" }),
          // Section 8 — presentation-only joining-month breakdown.
          joiningReg: isOneTime ? s.monthly_amount : 0,
          joiningMonthly: isOneTime ? 0 : s.monthly_amount,
          expected,
          paid,
          due,
          paidMonths,
          dueMonths,
        };

      })

      .sort((a, b) => a.memberNo - b.memberNo || a.fundName.localeCompare(b.fundName));
  }, [subs, txns, memberFilter, fundFilter, endMonth, memberMap, fundMap]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        expected: acc.expected + r.expected,
        paid: acc.paid + r.paid,
        due: acc.due + r.due,
      }),
      { expected: 0, paid: 0, due: 0 }
    );
  }, [rows]);

  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  function exportStamp() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  async function renderCanvas() {
    const node = captureRef.current;
    if (!node) throw new Error("Nothing to export");
    const { default: html2canvas } = await import("html2canvas");
    const bg = getComputedStyle(document.body).backgroundColor || "#ffffff";
    return html2canvas(node, {
      backgroundColor: bg,
      scale: 2,
      windowWidth: node.scrollWidth + 48,
      width: node.scrollWidth,
      height: node.scrollHeight,
    });
  }

  async function handleExportImage() {
    setExporting(true);
    try {
      const canvas = await renderCanvas();
      const link = document.createElement("a");
      link.download = `Prottoy_Dues_${endMonth}_${exportStamp()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast({ title: "Image exported" });
    } catch (e) {
      toast({ title: "Export failed", description: safeErrorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    setExporting(true);
    try {
      const canvas = await renderCanvas();
      const { jsPDF } = await import("jspdf");
      const landscape = canvas.width >= canvas.height;
      const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const scale = Math.min((pw - margin * 2) / canvas.width, (ph - margin * 2) / canvas.height);
      const w = canvas.width * scale;
      const h = canvas.height * scale;
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", (pw - w) / 2, margin, w, h);
      pdf.save(`Prottoy_Dues_${endMonth}_${exportStamp()}.pdf`);
      toast({ title: "PDF exported" });
    } catch (e) {
      toast({ title: "Export failed", description: safeErrorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }


  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Member Dues</h1>
          <p className="text-sm text-muted-foreground">
            Expected vs paid contributions per member per fund, based on subscriptions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Calculated up to the selected month (inclusive).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>Member</Label>
                <Select value={memberFilter} onValueChange={setMemberFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All members</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        #{m.member_no} — {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Fund</Label>
                <Select value={fundFilter} onValueChange={setFundFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All funds</SelectItem>
                    {funds.map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="endMonth">Up to month</Label>
                <Input
                  id="endMonth"
                  type="month"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Dues</CardTitle>
              <CardDescription>{loading ? "Loading…" : `${rows.length} subscription rows`}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportImage} disabled={exporting || rows.length === 0}>
                <ImageIcon className="mr-2 h-4 w-4" /> Export image
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exporting || rows.length === 0}>
                <FileDown className="mr-2 h-4 w-4" /> Export PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-x-auto">
              <div ref={captureRef} className="min-w-max bg-background p-4">
                <div className="mb-3">
                  <p className="text-base font-semibold">Member Dues — up to {new Date(`${endMonth}-01T00:00:00`).toLocaleString("en-US", { month: "long", year: "numeric" })}</p>
                  <p className="text-xs text-muted-foreground">
                    {memberFilter === ALL ? "All members" : memberMap.get(memberFilter)?.full_name} · {fundFilter === ALL ? "All funds" : fundMap.get(fundFilter)?.name} · {rows.length} rows
                  </p>
                </div>
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Member Number</TableHead>
                    <TableHead>Member Name</TableHead>
                    <TableHead>Fund Name</TableHead>
                    <TableHead>Joining Month</TableHead>
                    <TableHead className="text-right">Monthly Amount</TableHead>
                    <TableHead className="text-right">Total Month</TableHead>
                    <TableHead className="text-right">Expected Amount</TableHead>
                    <TableHead className="text-right">Paid Month</TableHead>
                    <TableHead className="text-right">Paid Amount</TableHead>
                    <TableHead className="text-right">Due Month</TableHead>
                    <TableHead className="text-right">Due Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                        No subscriptions match.
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.key}>
                      <TableCell className="font-mono">{r.memberNo}</TableCell>
                      <TableCell className="font-medium">{r.memberName}</TableCell>
                      <TableCell>{r.fundName}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.joiningLabel}</TableCell>
                      <TableCell className="text-right font-mono">{formatBDT(r.monthly)}</TableCell>
                      <TableCell className="text-right font-mono">{r.months}</TableCell>
                      <TableCell className="text-right font-mono">{formatBDT(r.expected)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.paidMonths === null ? <span className="text-muted-foreground">—</span> : r.paidMonths}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${r.paid > 0 ? "text-green-700" : ""}`}>{formatBDT(r.paid)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.dueMonths === null ? <span className="text-muted-foreground">—</span> : r.dueMonths}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.due > 0 ? (
                          <span className="text-red-700">{formatBDT(r.due)}</span>
                        ) : r.due < 0 ? (
                          <span className="text-green-700">+{formatBDT(-r.due)}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {rows.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-right font-semibold">Totals</TableCell>
                      <TableCell className="text-right font-mono font-semibold">{formatBDT(totals.expected)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono font-semibold">{formatBDT(totals.paid)}</TableCell>
                      <TableCell />
                      <TableCell className="text-right font-mono font-semibold">{formatBDT(totals.due)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
