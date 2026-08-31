import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, Paperclip, X } from "lucide-react";
import { formatBDT } from "@/lib/format";
import { uploadAttachment, deleteAttachment } from "@/lib/uploadAttachment";
import { AttachmentThumb, AttachmentViewLink } from "@/components/AttachmentThumb";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import type { Database } from "@/integrations/supabase/types";
import { safeErrorMessage } from "@/lib/errors";

type Expense = Database["public"]["Tables"]["expenses"]["Row"];
type Fund = Pick<Database["public"]["Tables"]["funds"]["Row"], "id" | "name">;

const schema = z.object({
  fund_id: z.string().uuid("Select a fund"),
  amount: z.coerce.number().positive("Amount must be > 0"),
  expense_date: z.string().min(1),
  category: z.string().trim().max(80).optional().or(z.literal("")),
  payee: z.string().trim().max(200).optional().or(z.literal("")),
  description: z.string().trim().max(500).optional().or(z.literal("")),
});
type FormValues = z.infer<typeof schema>;

const empty: FormValues = {
  fund_id: "",
  amount: 0,
  expense_date: new Date().toISOString().slice(0, 10),
  category: "",
  payee: "",
  description: "",
};

interface Row extends Expense {
  fund?: { name: string } | null;
}

export default function Expenses() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fundFilter, setFundFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormValues>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [existingAttachment, setExistingAttachment] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Expenses | Prottoy Foundation";
    // Section 12.1 — reset any open modal state when this route mounts.
    setDialogOpen(false);
    setDeleteTarget(null);

    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [e, f] = await Promise.all([
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("funds").select("id, name").eq("is_active", true).order("sort_order"),
    ]);
    if (e.error) toast({ title: "Load failed", description: safeErrorMessage(e.error), variant: "destructive" });
    const fundMap = new Map((f.data ?? []).map((x) => [x.id, x]));
    setRows((e.data ?? []).map((r) => ({ ...r, fund: fundMap.get(r.fund_id) ?? null })));
    setFunds(f.data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (fundFilter !== "all" && r.fund_id !== fundFilter) return false;
      if (!q) return true;
      return (
        (r.payee ?? "").toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q) ||
        (r.fund?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, fundFilter]);

  const totals = useMemo(() => filtered.reduce((s, r) => s + Number(r.amount), 0), [filtered]);

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
      amount: Number(r.amount),
      expense_date: r.expense_date,
      category: r.category ?? "",
      payee: r.payee ?? "",
      description: r.description ?? "",
    });
    setAttachmentFile(null);
    setExistingAttachment(r.attachment_url ?? null);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    let attachment_url: string | null = existingAttachment;
    try {
      if (attachmentFile) {
        if (editing?.attachment_url) await deleteAttachment(editing.attachment_url);
        attachment_url = await uploadAttachment(attachmentFile, "expense");
      } else if (editing && !existingAttachment && editing.attachment_url) {
        await deleteAttachment(editing.attachment_url);
        attachment_url = null;
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: safeErrorMessage(err), variant: "destructive" });
      setSubmitting(false);
      return;
    }
    const payload = {
      fund_id: v.fund_id,
      amount: v.amount,
      expense_date: v.expense_date,
      category: v.category || null,
      payee: v.payee || null,
      description: v.description || null,
      attachment_url,
    };
    const { error } = editing
      ? await supabase.from("expenses").update(payload).eq("id", editing.id)
      : await supabase.from("expenses").insert({ ...payload, created_by: user?.id ?? null });
    if (error) toast({ title: "Save failed", description: safeErrorMessage(error), variant: "destructive" });
    else {
      toast({ title: editing ? "Expense updated" : "Expense recorded" });
      setDialogOpen(false);
      load();
    }
    setSubmitting(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.attachment_url) await deleteAttachment(deleteTarget.attachment_url);
    const { error } = await supabase.from("expenses").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Expense deleted" }); load(); }
    setDeleteTarget(null);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">Track outflows from each fund.</p>
          </div>
          <Button onClick={openCreate} disabled={funds.length === 0}>
            <Plus className="h-4 w-4" /> New Expense
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Expense entries</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${filtered.length} entries · Total ৳ ${formatBDT(totals)}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search payee, category or fund"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <Select value={fundFilter} onValueChange={setFundFilter}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {funds.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Fund</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Payee</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Attachment</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No expenses recorded.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.expense_date}</TableCell>
                      <TableCell>{r.fund?.name ?? "—"}</TableCell>
                      <TableCell>{r.category ?? "—"}</TableCell>
                      <TableCell>{r.payee ?? "—"}</TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground text-sm">
                        {r.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        <AttachmentThumb stored={r.attachment_url} />
                      </TableCell>
                      <TableCell className="text-right font-mono">৳{formatBDT(r.amount)}</TableCell>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit expense" : "Record expense"}</DialogTitle>
            <DialogDescription>Add an outflow against a specific fund.</DialogDescription>
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
                <Label htmlFor="expense_date">Date *</Label>
                <Input id="expense_date" type="date" value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })} required />
              </div>
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
                <Label htmlFor="category">Category</Label>
                <Input id="category" value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Utilities, Salary, Supplies…" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="payee">Payee</Label>
              <Input id="payee" value={form.payee}
                onChange={(e) => setForm({ ...form, payee: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="exp_attachment">Attachment (image, optional)</Label>
              <Input id="exp_attachment" type="file" accept="image/jpeg,image/png,image/gif,image/webp"
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Record expense"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete expense?"
        description="This permanently removes the expense entry."
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
