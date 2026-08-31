import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { safeErrorMessage } from "@/lib/errors";

type MemberTypeRow = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name required").max(50),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).max(9999),
});

type FormValues = z.infer<typeof schema>;
const empty: FormValues = { name: "", description: "", sort_order: 0 };

export default function MemberTypes() {
  const [rows, setRows] = useState<MemberTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<MemberTypeRow | null>(null);
  const [form, setForm] = useState<FormValues>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemberTypeRow | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    const { count } = await supabase
      .from("member_member_types")
      .select("member_id", { count: "exact", head: true })
      .eq("member_type_id", deleteTarget.id);
    if ((count ?? 0) > 0) {
      toast({ title: "Cannot delete", description: `${count} member(s) still use this type.`, variant: "destructive" });
      setDeleteTarget(null);
      return;
    }
    const { error } = await supabase.from("member_types").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Type deleted" }); fetchRows(); }
    setDeleteTarget(null);
  }

  useEffect(() => {
    document.title = "Member Types | Prottoy Foundation";
    fetchRows();
  }, []);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from("member_types")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) toast({ title: "Failed to load", description: safeErrorMessage(error), variant: "destructive" });
    else setRows(data ?? []);
    setLoading(false);
  }

  function openCreate() {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  }
  function openEdit(r: MemberTypeRow) {
    setEditing(r);
    setForm({ name: r.name, description: r.description ?? "", sort_order: r.sort_order });
    setOpen(true);
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
    const payload = { name: v.name, description: v.description || null, sort_order: v.sort_order };
    const res = editing
      ? await supabase.from("member_types").update(payload).eq("id", editing.id)
      : await supabase.from("member_types").insert(payload);
    if (res.error) {
      toast({ title: "Save failed", description: safeErrorMessage(res.error), variant: "destructive" });
    } else {
      toast({ title: editing ? "Type updated" : "Type added" });
      setOpen(false);
      fetchRows();
    }
    setSubmitting(false);
  }

  async function toggleActive(r: MemberTypeRow) {
    const { error } = await supabase
      .from("member_types")
      .update({ is_active: !r.is_active })
      .eq("id", r.id);
    if (error) toast({ title: "Action failed", description: safeErrorMessage(error), variant: "destructive" });
    else fetchRows();
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Member Types</h1>
            <p className="text-sm text-muted-foreground">Define the categories of membership.</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Type</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Types</CardTitle>
            <CardDescription>{loading ? "Loading…" : `${rows.length} types`}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && !loading && (
                    <TableRow><TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No types defined.</TableCell></TableRow>
                  )}
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.sort_order}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.description ?? "—"}</TableCell>
                      <TableCell>{r.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title={r.is_active ? "Deactivate" : "Activate"} onClick={() => toggleActive(r)}><Power className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(r)}><Trash2 className="h-4 w-4" /></Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit type" : "Add type"}</DialogTitle>
            <DialogDescription>Categories shown when adding/editing members.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="sort_order">Sort order</Label>
              <Input id="sort_order" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : editing ? "Save" : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete type?"
        description={<>This permanently removes "{deleteTarget?.name}". Members currently using it will block the delete.</>}
        onConfirm={handleDelete}
      />
    </AppLayout>
  );
}
