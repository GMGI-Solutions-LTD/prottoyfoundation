import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { formatBDT } from "@/lib/format";
import { toast } from "@/hooks/use-toast";
import { safeErrorMessage } from "@/lib/errors";
import { Upload, Download, FileSpreadsheet, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import {
  toImportPayload, ymToHeader, SHEET_NAME, type ParseResult,
} from "@/lib/excelSheet";
import {
  MAX_IMPORT_ROWS, parseWithProgress, findDuplicateFlags, dupKey, applySkips,
  applyTypeMapping, RowLimitError, type DuplicateFlag,
} from "@/lib/excelImportRun";
import {
  buildRegAndMonthlyWorkbook, downloadWorkbook, monthRange, exportFileName, type ExportMember,
} from "@/lib/excelExport";

type ImportSummary = {
  batch_id: string;
  members_created: number;
  members_updated: number;
  inserted: number;
  updated: number;
  unchanged: number;
};

/** Section 2 — canonical member types the importer can map onto. */
const TYPE_TARGETS = [
  { label: "Founding & Executive (৳100/mo)", memberType: "Founding & Executive", fundCode: "MONTHLY_FOUNDING" },
  { label: "General (৳50/mo)", memberType: "General", fundCode: "MONTHLY_GENERAL" },
];
const KNOWN_TYPES = new Set(TYPE_TARGETS.map((t) => t.memberType));

export default function BulkImport() {
  const { isAdmin, isSuperAdmin, user } = useAuth();
  const canImport = isAdmin || isSuperAdmin;
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const [typeMap, setTypeMap] = useState<Record<string, { memberType: string; fundCode: string }>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  useEffect(() => {
    document.title = "Bulk Import & Export | Prottoy Foundation";
  }, []);

  const errors = useMemo(() => parsed?.issues.filter((i) => i.level === "error") ?? [], [parsed]);
  const warnings = useMemo(() => parsed?.issues.filter((i) => i.level === "warning") ?? [], [parsed]);

  /** Rows after manual type mapping + duplicate skips. */
  const effectiveRows = useMemo(() => {
    if (!parsed) return [];
    return applySkips(applyTypeMapping(parsed.rows, typeMap), skipped);
  }, [parsed, typeMap, skipped]);

  const sheetTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of parsed?.rows ?? []) set.add(r.memberType);
    return [...set].sort();
  }, [parsed]);

  const duplicates = useMemo<DuplicateFlag[]>(
    () => (parsed ? findDuplicateFlags(parsed.rows) : []),
    [parsed],
  );

  const totals = useMemo(() => {
    if (!parsed) return null;
    let payments = 0;
    let amount = 0;
    let registration = 0;
    for (const r of effectiveRows) {
      payments += r.payments.length;
      amount += r.payments.reduce((s, p) => s + p.amount, 0);
      registration += r.registrationFee ?? 0;
    }
    return { members: effectiveRows.length, payments, amount, registration };
  }, [parsed, effectiveRows]);

  async function handleFile(file: File) {
    setParsing(true);
    setSummary(null);
    setTypeMap({});
    setSkipped(new Set());
    setProgress({ done: 0, total: 0 });
    try {
      const buf = await file.arrayBuffer();
      const result = await parseWithProgress(file.name, buf, (done, total) => setProgress({ done, total }));
      setParsed(result);
      if (result.rows.length === 0) {
        toast({ title: "Nothing to import", description: "No usable rows were found.", variant: "destructive" });
      }
    } catch (e) {
      setParsed(null);
      toast({
        title: e instanceof RowLimitError ? "File too large" : "Could not read file",
        description: safeErrorMessage(e),
        variant: "destructive",
      });
    } finally {
      setParsing(false);
      setProgress(null);
    }
  }

  async function commit() {
    if (!parsed) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.rpc("import_reg_and_monthly", {
        p_rows: toImportPayload(effectiveRows) as never,
        p_file_name: parsed.fileName,
      });
      if (error) throw error;
      const s = data as unknown as ImportSummary;
      setSummary(s);
      toast({
        title: "Import committed",
        description: `${s.inserted} new, ${s.updated} corrected, ${s.unchanged} unchanged.`,
      });
    } catch (e) {
      // Section 10 — failed attempts are recorded too.
      await supabase.from("audit_logs").insert({
        user_id: user?.id ?? null,
        action_type: "excel_import",
        file_name: parsed.fileName,
        records_processed: 0,
        status: "failed",
        details: { error: safeErrorMessage(e) },
      });
      toast({ title: "Import failed — nothing was saved", description: safeErrorMessage(e), variant: "destructive" });
    } finally {
      setImporting(false);
    }
  }

  async function exportWorkbook() {
    setExporting(true);
    let fileName = "";
    try {
      const [mRes, fRes, tRes, tyRes] = await Promise.all([
        supabase.from("members").select("id,member_no,full_name,reference_person,member_type_id,joining_date").order("member_no"),
        supabase.from("funds").select("id,code,name,is_one_time"),
        supabase.from("transactions").select("member_id,fund_id,amount,txn_date,for_month").not("member_id", "is", null),
        supabase.from("member_types").select("id,name"),
      ]);
      const err = mRes.error || fRes.error || tRes.error || tyRes.error;
      if (err) throw err;

      const funds = fRes.data ?? [];
      const regFundId = funds.find((f) => f.code === "REGISTRATION")?.id;
      const monthlyFundIds = new Set(funds.filter((f) => f.code.startsWith("MONTHLY_")).map((f) => f.id));
      const typeName = new Map((tyRes.data ?? []).map((t) => [t.id, t.name]));

      const byMember = new Map<string, ExportMember>();
      for (const m of mRes.data ?? []) {
        byMember.set(m.id, {
          member_no: m.member_no,
          full_name: m.full_name,
          reference_person: m.reference_person ?? null,
          member_type: (m.member_type_id ? typeName.get(m.member_type_id) : null) ?? "General",
          registration_fee: null,
          registration_date: null,
          monthly: {},
        });
      }

      const monthsSeen = new Set<string>();
      for (const t of tRes.data ?? []) {
        const em = t.member_id ? byMember.get(t.member_id) : null;
        if (!em) continue;
        if (t.fund_id === regFundId) {
          em.registration_fee = (em.registration_fee ?? 0) + Number(t.amount);
          if (!em.registration_date || t.txn_date < em.registration_date) em.registration_date = t.txn_date;
          continue;
        }
        if (!monthlyFundIds.has(t.fund_id) || !t.for_month) continue;
        const ym = String(t.for_month).slice(0, 7);
        monthsSeen.add(ym);
        const prev = em.monthly[ym];
        em.monthly[ym] = {
          date: t.txn_date,
          amount: (prev?.amount ?? 0) + Number(t.amount),
        };
      }

      const sortedMonths = [...monthsSeen].sort();
      const months = sortedMonths.length
        ? monthRange(sortedMonths[0], sortedMonths[sortedMonths.length - 1])
        : [];
      const members = [...byMember.values()].sort((a, b) => a.member_no - b.member_no);

      if (members.length === 0) {
        toast({ title: "Nothing to export", description: "No members found.", variant: "destructive" });
        return;
      }

      const wb = buildRegAndMonthlyWorkbook(members, months);
      const targetMonth = sortedMonths.length ? sortedMonths[sortedMonths.length - 1] : new Date().toISOString().slice(0, 7);
      fileName = exportFileName(targetMonth);
      downloadWorkbook(wb, fileName);
      await supabase.from("audit_logs").insert({
        user_id: user?.id ?? null,
        action_type: "excel_export",
        file_name: fileName,
        records_processed: members.length,
        status: "success",
        details: { months: months.length, target_month: targetMonth },
      });
      toast({ title: "Export ready", description: `${members.length} members × ${months.length} months.` });
    } catch (e) {
      await supabase.from("audit_logs").insert({
        user_id: user?.id ?? null,
        action_type: "excel_export",
        file_name: fileName || null,
        records_processed: 0,
        status: "failed",
        details: { error: safeErrorMessage(e) },
      });
      toast({ title: "Export failed", description: safeErrorMessage(e), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  if (!canImport) {
    return (
      <AppLayout>
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Admins only</AlertTitle>
          <AlertDescription>Bulk import and export require an Admin or Super Admin account.</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Bulk Import &amp; Export</h1>
          <p className="text-sm text-muted-foreground">
            Import the “{SHEET_NAME}” sheet of the account summary workbook, or export current records in the same layout.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4" /> Import from Excel
              </CardTitle>
              <CardDescription>
                Nothing is saved until you review the preview and commit. Re-importing corrects amounts instead of
                duplicating them. Files over {MAX_IMPORT_ROWS.toLocaleString()} rows are rejected before parsing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xlsm,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button onClick={() => fileRef.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                Choose workbook
              </Button>
              {progress && progress.total > 0 && (
                <div className="space-y-1">
                  <Progress value={Math.round((progress.done / progress.total) * 100)} />
                  <p className="text-xs text-muted-foreground">
                    Parsing rows {progress.done} of {progress.total} (100-row chunks)…
                  </p>
                </div>
              )}
              {parsed && (
                <p className="text-xs text-muted-foreground">
                  {parsed.fileName} — {parsed.monthHeaders.length} month columns detected
                  {parsed.monthHeaders.length > 0 &&
                    ` (${ymToHeader(parsed.monthHeaders[0])} → ${ymToHeader(parsed.monthHeaders[parsed.monthHeaders.length - 1])})`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" /> Export to Excel
              </CardTitle>
              <CardDescription>
                Generates <span className="font-mono">Prottoy_Summary_&lt;TargetMonth&gt;_&lt;ExportDate&gt;.xlsx</span> in the
                reference layout: member details, registration fee, then a Date/Amount pair per month.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="secondary" onClick={() => void exportWorkbook()} disabled={exporting}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Download workbook
              </Button>
            </CardContent>
          </Card>
        </div>

        {summary && (
          <Alert>
            <AlertTitle>Import committed</AlertTitle>
            <AlertDescription>
              {summary.members_created} members created, {summary.members_updated} updated · {summary.inserted} payments
              inserted, {summary.updated} corrected, {summary.unchanged} already matched. Batch {summary.batch_id.slice(0, 8)}.
            </AlertDescription>
          </Alert>
        )}

        {parsed && (
          <Card>
            <CardHeader>
              <CardTitle>Preview</CardTitle>
              <CardDescription>
                {totals
                  ? `${totals.members} members · ${totals.payments} monthly payments · ${formatBDT(totals.amount)} monthly + ${formatBDT(totals.registration)} registration`
                  : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sheetTypes.length > 0 && (
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">Member type mapping</p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Map each label found in the sheet to a canonical type. Non-standard labels are highlighted.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {sheetTypes.map((t) => {
                      const current = typeMap[t];
                      const known = KNOWN_TYPES.has(t);
                      return (
                        <div key={t} className="space-y-1">
                          <Label className="flex items-center gap-2 text-xs">
                            <span className="font-mono">{t}</span>
                            {!known && <Badge variant="destructive">non-standard</Badge>}
                          </Label>
                          <Select
                            value={current ? current.fundCode : known ? TYPE_TARGETS.find((x) => x.memberType === t)!.fundCode : ""}
                            onValueChange={(v) => {
                              const target = TYPE_TARGETS.find((x) => x.fundCode === v)!;
                              setTypeMap((prev) => ({ ...prev, [t]: { memberType: target.memberType, fundCode: target.fundCode } }));
                            }}
                          >
                            <SelectTrigger><SelectValue placeholder="Choose a type" /></SelectTrigger>
                            <SelectContent>
                              {TYPE_TARGETS.map((x) => (
                                <SelectItem key={x.fundCode} value={x.fundCode}>{x.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertTitle>{errors.length} row error{errors.length === 1 ? "" : "s"} — these rows are skipped</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                      {errors.slice(0, 10).map((i, idx) => (
                        <li key={idx}>{i.excelRow ? `Row ${i.excelRow}: ` : ""}{i.message}</li>
                      ))}
                      {errors.length > 10 && <li>…and {errors.length - 10} more.</li>}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              {warnings.length > 0 && (
                <Alert>
                  <AlertTitle>{warnings.length} warning{warnings.length === 1 ? "" : "s"}</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                      {warnings.slice(0, 10).map((i, idx) => (
                        <li key={idx}>{i.excelRow ? `Row ${i.excelRow}: ` : ""}{i.message}</li>
                      ))}
                      {warnings.length > 10 && <li>…and {warnings.length - 10} more.</li>}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {duplicates.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    {duplicates.length} possible duplicate entr{duplicates.length === 1 ? "y" : "ies"}
                  </p>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Decide each one. Skipped rows are excluded from the commit; confirmed rows are imported.
                  </p>
                  <div className="max-h-64 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Member</TableHead>
                          <TableHead>Due month</TableHead>
                          <TableHead>Paid on</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                          <TableHead className="text-right">Decision</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {duplicates.map((d) => {
                          const key = dupKey(d);
                          const isSkipped = skipped.has(key);
                          return (
                            <TableRow key={`${key}-${d.txnDate}`}>
                              <TableCell className="font-medium">#{d.memberNo} {d.fullName}</TableCell>
                              <TableCell>{ymToHeader(d.forMonth)}</TableCell>
                              <TableCell className="font-mono">{d.txnDate}</TableCell>
                              <TableCell className="text-right font-mono">{formatBDT(d.amount)}</TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant={isSkipped ? "destructive" : "outline"}
                                  onClick={() =>
                                    setSkipped((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      return next;
                                    })
                                  }
                                >
                                  {isSkipped ? "Skipped — undo" : "Skip duplicate"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div className="max-h-[26rem] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">No.</TableHead>
                      <TableHead>Member</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Monthly</TableHead>
                      <TableHead className="text-right">Reg. fee</TableHead>
                      <TableHead className="text-right">Months paid</TableHead>
                      <TableHead className="text-right">Total paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {effectiveRows.map((r) => (
                      <TableRow key={r.memberNo}>
                        <TableCell className="font-mono">{r.memberNo}</TableCell>
                        <TableCell className="font-medium">{r.fullName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.memberType}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatBDT(r.monthlyFee)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {r.registrationFee == null ? "—" : formatBDT(r.registrationFee)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{r.payments.length}</TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBDT(r.payments.reduce((s, p) => s + p.amount, 0))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Separator />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void commit()} disabled={importing || effectiveRows.length === 0}>
                  {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirm &amp; commit import
                </Button>
                <Button variant="ghost" onClick={() => { setParsed(null); setSummary(null); setSkipped(new Set()); setTypeMap({}); }} disabled={importing}>
                  Discard
                </Button>
                <p className="text-xs text-muted-foreground">
                  Committed as a single all-or-nothing transaction, with every change written to the audit trail.
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
