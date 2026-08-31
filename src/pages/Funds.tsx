import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Power, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import type { Database } from "@/integrations/supabase/types";
import { safeErrorMessage } from "@/lib/errors";

type Fund = Database["public"]["Tables"]["funds"]["Row"];

const fundSchema = z.object({
  code: z.string().trim().min(1).max(50).regex(/^[A-Z0-9_]+$/, "Use UPPERCASE letters, numbers, underscore"),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).max(9999),
  is_active: z.boolean(),
  is_one_time: z.boolean(),
});

type FormValues = z.infer<typeof fundSchema>;

const empty: FormValues = {
  code: "",
  name: "",
  description: "",
  sort_order: 0,
  is_active: true,
  is_one_time: false,
};


export default function Funds() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Fund | null>(null);
  const [form, setForm] = useState<FormValues>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Fund | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Fund | null>(null);

  async function confirmToggle() {
    if (!toggleTarget) return;
    const { error } = await supabase.from("funds")
      .update({ is_active: !toggleTarget.is_active }).eq("id", toggleTarget.id);
    if (error) toast({ title: "Action failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: toggleTarget.is_active ? "Fund deactivated" : "Fund activated" }); fetchFunds(); }
    setToggleTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const [tx, ex, sub] = await Promise.all([
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("fund_id", deleteTarget.id),
      supabase.from("expenses").select("id", { count: "exact", head: true }).eq("fund_id", deleteTarget.id),
      supabase.from("member_fund_subscriptions").select("id", { count: "exact", head: true }).eq("fund_id", deleteTarget.id),
    ]);
    const refs = (tx.count ?? 0) + (ex.count ?? 0) + (sub.count ?? 0);
    if (refs > 0) {
      toast({ title: "Cannot delete", description: `Fund is referenced by ${refs} record(s).`, variant: "destructive" });
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from("funds").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Fund deleted" }); fetchFunds(); }
    setDeleteTarget(null);
  }

  useEffect(() => {
    document.title = "Funds | Prottoy Foundation";
    fetchFunds();
  }, []);

  async function fetchFunds() {
    setLoading(true);
    const { data, error } = await supabase
      .from("funds")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast({ title: "Failed to load funds", description: safeErrorMessage(error), variant: "destructive" });
    else setFunds(data ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...empty, sort_order: (funds[funds.length - 1]?.sort_order ?? 0) + 1 });
    setDialogOpen(true);
  }

  function openEdit(f: Fund) {
    setEditing(f);
    setForm({
      code: f.code,
      name: f.name,
      description: f.description ?? "",
      sort_order: f.sort_order,
      is_active: f.is_active,
      is_one_time: (f as Fund & { is_one_time?: boolean }).is_one_time ?? false,
    });
    setDialogOpen(true);
  }


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = fundSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0]?.message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    const payload = {
      code: v.code,
      name: v.name,
      description: v.description || null,
      sort_order: v.sort_order,
      is_active: v.is_active,
      is_one_time: v.is_one_time,
    };

    const { error } = editing
      ? await supabase.from("funds").update(payload).eq("id", editing.id)
      : await supabase.from("funds").insert(payload);
    if (error) toast({ title: "Save failed", description: safeErrorMessage(error), variant: "destructive" });
    else {
      toast({ title: editing ? "Fund updated" : "Fund created" });
      setDialogOpen(false);
      fetchFunds();
    }
    setSubmitting(false);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Funds</h1>
            <p className="text-sm text-muted-foreground">
              Categorize income and expenses across foundation funds.
            </p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Fund</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Fund list</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${funds.length} funds`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {funds.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="font-mono">{f.sort_order}</TableCell>
                      <TableCell className="font-mono text-xs">{f.code}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{f.name}</span>
                          {(f as Fund & { is_one_time?: boolean }).is_one_time && (
                            <Badge variant="secondary">One-time</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                        {f.description ?? "—"}
                      </TableCell>
                      <TableCell>
                        {f.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(f)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title={f.is_active ? "Deactivate" : "Activate"} onClick={() => setToggleTarget(f)}>
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(f)}>
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
            <DialogTitle>{editing ? "Edit fund" : "Add fund"}</DialogTitle>
            <DialogDescription>Funds organize income and expense ledgers.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="code">Code *</Label>
                <Input id="code" value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="ZAKAT" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="sort_order">Sort order</Label>
                <Input id="sort_order" type="number" min={0}
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-muted-foreground">Inactive funds are hidden from new entries.</p>
              </div>
              <Switch checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>One-time payment</Label>
                <p className="text-xs text-muted-foreground">Charged once (e.g. registration fee). No monthly dues after the first payment.</p>
              </div>
              <Switch checked={form.is_one_time}
                onCheckedChange={(v) => setForm({ ...form, is_one_time: v })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Add fund"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{toggleTarget?.is_active ? "Deactivate fund?" : "Activate fund?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `"${toggleTarget?.name}" will be hidden from new income/expense entries.`
                : `"${toggleTarget?.name}" will be available again.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggle}>Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete fund?"
        description={<>Permanently delete "{deleteTarget?.name}". Funds with existing transactions, expenses, or subscriptions cannot be deleted.</>}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
