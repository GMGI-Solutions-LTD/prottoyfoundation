import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Receipt, Pencil, Trash2, Paperclip, X } from "lucide-react";
import { formatBDT, PAYMENT_METHODS, PAYMENT_LABEL, type PaymentMethod } from "@/lib/format";
import { uploadAttachment, deleteAttachment } from "@/lib/uploadAttachment";
import { AttachmentThumb, AttachmentViewLink } from "@/components/AttachmentThumb";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import type { Database } from "@/integrations/supabase/types";
import { safeErrorMessage } from "@/lib/errors";

type Txn = Database["public"]["Tables"]["transactions"]["Row"];
type Fund = Pick<Database["public"]["Tables"]["funds"]["Row"], "id" | "name" | "code">;
type Member = Pick<Database["public"]["Tables"]["members"]["Row"], "id" | "full_name" | "member_no" | "monthly_fee">;

const txnSchema = z.object({
  fund_id: z.string().uuid("Select a fund"),
  member_id: z.string().uuid().optional().or(z.literal("")),
  donor_name: z.string().trim().max(200).optional().or(z.literal("")),
  amount: z.coerce.number().positive("Amount must be > 0"),
  payment_method: z.enum(PAYMENT_METHODS),
  txn_date: z.string().min(1),
  for_month: z.string().optional().or(z.literal("")),
  from_month: z.string().optional().or(z.literal("")),
  to_month: z.string().optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  issue_receipt: z.boolean(),
});
type FormValues = z.infer<typeof txnSchema>;

const empty: FormValues = {
  fund_id: "",
  member_id: "",
  donor_name: "",
  amount: 0,
  payment_method: "cash",
  txn_date: new Date().toISOString().slice(0, 10),
  for_month: "",
  from_month: "",
  to_month: "",
  description: "",
  issue_receipt: true,
};

function monthsInRange(from: string, to: string): string[] {
  // from / to: "YYYY-MM"
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const out: string[] = [];
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

interface Row extends Txn {
  fund?: { name: string; code: string } | null;
  member?: { full_name: string; member_no: number } | null;
  receipt?: { receipt_no: string } | null;
}

export default function Income() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "member">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");


  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Income | Prottoy Foundation";
    // Section 12.1 — reset any open modal state when this route mounts.
    setDialogOpen(false);
    setEditing(null);
    setDeleteTarget(null);
    setForm(empty);

    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [t, f, m, r] = await Promise.all([
      supabase.from("transactions").select("*").order("txn_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("funds").select("id, name, code").eq("is_active", true).order("sort_order"),
      supabase.from("members").select("id, full_name, member_no, monthly_fee").eq("is_active", true).order("member_no"),
      supabase.from("receipts").select("transaction_id, receipt_no"),
    ]);
    if (t.error) toast({ title: "Load failed", description: safeErrorMessage(t.error), variant: "destructive" });
    const fundMap = new Map((f.data ?? []).map((x) => [x.id, x]));
    const memberMap = new Map((m.data ?? []).map((x) => [x.id, x]));
    const recMap = new Map((r.data ?? []).map((x) => [x.transaction_id, x]));
    setRows((t.data ?? []).map((row) => ({
      ...row,
      fund: fundMap.get(row.fund_id) ?? null,
      member: row.member_id ? memberMap.get(row.member_id) ?? null : null,
      receipt: recMap.get(row.id) ?? null,
    })));
    setFunds(f.data ?? []);
    setMembers(m.data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (fundFilter !== "all" && r.fund_id !== fundFilter) return false;
      // Section 1 / 12.5 — Target Month filter.
      if (monthFilter && String(r.txn_date).slice(0, 7) !== monthFilter) return false;
      if (!q) return true;
      return (
        (r.donor_name ?? "").toLowerCase().includes(q) ||
        (r.member?.full_name ?? "").toLowerCase().includes(q) ||
        (r.receipt?.receipt_no ?? "").toLowerCase().includes(q) ||
        (r.fund?.name ?? "").toLowerCase().includes(q)
      );
    });
    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortBy === "amount") return (Number(a.amount) - Number(b.amount)) * dir;
      if (sortBy === "member") {
        return (a.member?.full_name ?? a.donor_name ?? "").localeCompare(b.member?.full_name ?? b.donor_name ?? "") * dir;
      }
      return String(a.txn_date).localeCompare(String(b.txn_date)) * dir;
    });
  }, [rows, search, fundFilter, monthFilter, sortBy, sortDir]);


  const totals = useMemo(
    () => filtered.reduce((s, r) => s + Number(r.amount), 0),
    [filtered]
  );

  function openCreate() {
    setEditing(null);
    setForm({ ...empty, fund_id: funds[0]?.id ?? "" });
    setAttachmentFile(null);
    setExistingAttachment(null);
    setDialogOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      fund_id: r.fund_id,
      member_id: r.member_id ?? "",
      donor_name: r.donor_name ?? "",
      amount: Number(r.amount),
      payment_method: r.payment_method as PaymentMethod,
      txn_date: r.txn_date,
      for_month: r.for_month ? String(r.for_month).slice(0, 7) : "",
      description: r.description ?? "",
      issue_receipt: false,
    });
    setAttachmentFile(null);
    setExistingAttachment(r.attachment_url ?? null);
    setDialogOpen(true);
  }

  function onMemberSelect(id: string) {
    const member = members.find((mm) => mm.id === id);
    setForm((prev) => ({
      ...prev,
      member_id: id,
      donor_name: member?.full_name ?? prev.donor_name,
      amount: prev.amount || Number(member?.monthly_fee ?? 0),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = txnSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    if (!parsed.data.member_id && !parsed.data.donor_name) {
      toast({ title: "Missing donor", description: "Choose a member or enter a donor name.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    let attachment_url: string | null = existingAttachment;
    try {
      if (attachmentFile) {
        if (editing?.attachment_url) await deleteAttachment(editing.attachment_url);
        attachment_url = await uploadAttachment(attachmentFile, "income");
      } else if (editing && !existingAttachment && editing.attachment_url) {
        await deleteAttachment(editing.attachment_url);
        attachment_url = null;
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: safeErrorMessage(err), variant: "destructive" });
      setSubmitting(false);
      return;
    }
    // Resolve months covered: from/to range (create-only) or single for_month
    let months: (string | null)[] = [v.for_month ? `${v.for_month}-01` : null];
    if (!editing && v.from_month && v.to_month) {
      if (v.to_month < v.from_month) {
        toast({ title: "Invalid range", description: "To month must be on or after From month.", variant: "destructive" });
        setSubmitting(false);
        return;
      }
      const range = monthsInRange(v.from_month, v.to_month);
      if (range.length > 24) {
        toast({ title: "Range too large", description: "Maximum 24 months per entry.", variant: "destructive" });
        setSubmitting(false);
        return;
      }
      months = range;
    } else if (!editing && (v.from_month || v.to_month)) {
      // Only one of the two set → treat as single for_month
      const single = v.from_month || v.to_month;
      months = [`${single}-01`];
    }

    const basePayload = {
      fund_id: v.fund_id,
      member_id: v.member_id || null,
      donor_name: v.donor_name || null,
      amount: v.amount,
      payment_method: v.payment_method,
      txn_date: v.txn_date,
      description: v.description || null,
      attachment_url,
    };

    if (editing) {
      const { error } = await supabase.from("transactions").update({ ...basePayload, for_month: months[0] }).eq("id", editing.id);
      if (error) {
        toast({ title: "Update failed", description: safeErrorMessage(error), variant: "destructive" });
        setSubmitting(false);
        return;
      }
      if (editing.receipt && Number(editing.amount) !== v.amount) {
        await supabase.from("receipts").update({ amount: v.amount }).eq("transaction_id", editing.id);
      }
      toast({ title: "Income updated" });
    } else {
      const rowsToInsert = months.map((fm) => ({
        ...basePayload,
        for_month: fm,
        created_by: user?.id ?? null,
      }));
      const { data: ins, error } = await supabase
        .from("transactions")
        .insert(rowsToInsert)
        .select("id");
      if (error) {
        toast({ title: "Save failed", description: safeErrorMessage(error), variant: "destructive" });
        setSubmitting(false);
        return;
      }
      if (v.issue_receipt && ins?.length) {
        const issuedTo = v.donor_name || members.find((mm) => mm.id === v.member_id)?.full_name || "Donor";
        const receipts = ins.map((row) => ({
          transaction_id: row.id,
          amount: v.amount,
          issued_to: issuedTo,
          issued_by: user?.id ?? null,
          receipt_no: "",
        }));
        const { error: rerr } = await supabase.from("receipts").insert(receipts);
        if (rerr) toast({ title: "Receipt failed", description: safeErrorMessage(rerr), variant: "destructive" });
      }
      toast({ title: months.length > 1 ? `Recorded ${months.length} monthly transactions` : "Income recorded" });
    }
    setDialogOpen(false);
    setSubmitting(false);
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.attachment_url) await deleteAttachment(deleteTarget.attachment_url);
    await supabase.from("receipts").delete().eq("transaction_id", deleteTarget.id);
    const { error } = await supabase.from("transactions").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Income deleted" }); load(); }
    setDeleteTarget(null);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Income</h1>
            <p className="text-sm text-muted-foreground">
              Record member contributions and donations. Receipts are auto-numbered.
            </p>
          </div>
          <Button onClick={openCreate} disabled={funds.length === 0}>
            <Plus className="h-4 w-4" /> New Income
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Transactions</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${filtered.length} entries · Total ৳ ${formatBDT(totals)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search donor, member, fund or receipt no."
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={fundFilter} onValueChange={setFundFilter}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input
                type="month"
                className="w-full sm:w-40"
                value={monthFilter}
                onChange={(e) => setMonthFilter(e.target.value)}
                aria-label="Target month"
              />
              <Select value={`${sortBy}:${sortDir}`} onValueChange={(v) => {
                const [by, dir] = v.split(":");
                setSortBy(by as "date" | "amount" | "member");
                setSortDir(dir as "asc" | "desc");
              }}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="date:desc">Date — newest first</SelectItem>
                  <SelectItem value="date:asc">Date — oldest first</SelectItem>
                  <SelectItem value="amount:desc">Amount — high to low</SelectItem>
                  <SelectItem value="amount:asc">Amount — low to high</SelectItem>
                  <SelectItem value="member:asc">Donor / member A→Z</SelectItem>
                </SelectContent>
              </Select>

            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Receipt</TableHead>
                    <TableHead>Donor / Member</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Attachment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>For Month</TableHead>
                    <TableHead className="text-right">Actions</TableHead>

                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                        No income recorded.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.txn_date}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.receipt ? (
                          <Badge variant="secondary" className="gap-1">
                            <Receipt className="h-3 w-3" />{r.receipt.receipt_no}
                          </Badge>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {r.member?.full_name ?? r.donor_name ?? "—"}
                        </div>
                        {r.member && (
                          <div className="text-xs text-muted-foreground">Member #{r.member.member_no}</div>
                        )}
                      </TableCell>
                      <TableCell>{r.fund?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{PAYMENT_LABEL[r.payment_method as PaymentMethod]}</Badge>
                      </TableCell>
                      <TableCell>
                        <AttachmentThumb stored={r.attachment_url} />
                      </TableCell>
                      <TableCell className="text-right font-mono">৳{formatBDT(r.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {r.for_month
                          ? new Date(r.for_month).toLocaleDateString("en-US", { month: "short", year: "numeric" })
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">

                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(r)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(r)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit income" : "Record income"}</DialogTitle>
            <DialogDescription>{editing ? "Update this transaction." : "Add a contribution or donation to a fund."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Fund *</Label>
                <Select value={form.fund_id} onValueChange={(v) => setForm({ ...form, fund_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select fund" /></SelectTrigger>
                  <SelectContent>
                    {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="txn_date">Date *</Label>
                <Input id="txn_date" type="date" value={form.txn_date}
                  onChange={(e) => setForm({ ...form, txn_date: e.target.value })} required />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Member (optional)</Label>
              <Select value={form.member_id || "none"}
                onValueChange={(v) => v === "none" ? setForm({ ...form, member_id: "" }) : onMemberSelect(v)}>
                <SelectTrigger><SelectValue placeholder="Select member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— External donor —</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={m.id}>#{m.member_no} · {m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="donor_name">Donor name</Label>
              <Input id="donor_name" value={form.donor_name}
                onChange={(e) => setForm({ ...form, donor_name: e.target.value })}
                placeholder="If different from member or for external donor" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="amount">Amount (৳) *</Label>
                <Input id="amount" type="number" min={0} step="0.01"
                  value={form.amount === 0 ? "" : form.amount}
                  placeholder="0"
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => setForm({ ...form, amount: e.target.value === "" ? 0 : Number(e.target.value) })} required />

              </div>
              <div className="grid gap-2">
                <Label>Payment method *</Label>
                <Select value={form.payment_method}
                  onValueChange={(v) => setForm({ ...form, payment_method: v as PaymentMethod })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((p) => (
                      <SelectItem key={p} value={p}>{PAYMENT_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {editing ? (
              <div className="grid gap-2">
                <Label htmlFor="for_month">For month (optional)</Label>
                <Input id="for_month" type="month" value={form.for_month}
                  onChange={(e) => setForm({ ...form, for_month: e.target.value })} />
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>For months (optional)</Label>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="month" value={form.from_month}
                    placeholder="From"
                    onChange={(e) => setForm({ ...form, from_month: e.target.value })} />
                  <Input type="month" value={form.to_month}
                    placeholder="To"
                    onChange={(e) => setForm({ ...form, to_month: e.target.value })} />
                </div>
                {form.from_month && form.to_month && form.to_month >= form.from_month && (() => {
                  const n = monthsInRange(form.from_month, form.to_month).length;
                  if (n <= 1) return null;
                  return (
                    <p className="text-xs text-muted-foreground">
                      Will create {n} transactions totalling ৳{formatBDT(n * (Number(form.amount) || 0))}.
                    </p>
                  );
                })()}
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="inc_attachment">Attachment (image, optional)</Label>
              <Input id="inc_attachment" type="file" accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} />
              {(attachmentFile || existingAttachment) && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  <span className="truncate">{attachmentFile ? attachmentFile.name : "Current attachment"}</span>
                  {existingAttachment && !attachmentFile && (
                    <AttachmentViewLink stored={existingAttachment}>View</AttachmentViewLink>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
                    onClick={() => { setAttachmentFile(null); setExistingAttachment(null); }}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>

            {!editing && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Issue receipt</Label>
                  <p className="text-xs text-muted-foreground">Auto-numbered as PF-YYYY-####</p>
                </div>
                <Switch checked={form.issue_receipt}
                  onCheckedChange={(v) => setForm({ ...form, issue_receipt: v })} />
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Record income"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete income?"
        description={`This permanently removes the transaction${deleteTarget?.receipt ? " and its receipt" : ""}.`}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
