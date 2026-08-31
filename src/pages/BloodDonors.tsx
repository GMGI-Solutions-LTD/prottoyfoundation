import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { safeErrorMessage } from "@/lib/errors";
import type { Database } from "@/integrations/supabase/types";

type Donor = Database["public"]["Tables"]["blood_donors"]["Row"];
type BG = Database["public"]["Enums"]["blood_group"];

const BLOOD_GROUPS: BG[] = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

const schema = z.object({
  sl: z.string().trim().regex(/^\d*$/, "Must be a number").optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(100),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  present_address: z.string().trim().max(255).optional().or(z.literal("")),
  permanent_address: z.string().trim().max(255).optional().or(z.literal("")),
  reference_person: z.string().trim().max(100).optional().or(z.literal("")),
  reference_mobile: z.string().trim().max(20).optional().or(z.literal("")),
  last_donation_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

const emptyForm: FormValues = {
  sl: "",
  name: "",
  blood_group: "O+",
  mobile: "",
  present_address: "",
  permanent_address: "",
  reference_person: "",
  reference_mobile: "",
  last_donation_date: "",
  notes: "",
};

const bgColor: Record<BG, string> = {
  "A+": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  "A-": "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  "B+": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  "B-": "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  "O+": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  "O-": "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  "AB+": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  "AB-": "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
};

export default function BloodDonors() {
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [bgFilter, setBgFilter] = useState<string>("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Donor | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Donor | null>(null);

  useEffect(() => {
    document.title = "Blood Donors | Prottoy Foundation";
    void fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const { data, error } = await supabase
      .from("blood_donors")
      .select("*")
      .order("sl", { ascending: true });
    if (error) toast({ title: "Failed to load donors", description: safeErrorMessage(error), variant: "destructive" });
    else setDonors(data ?? []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return donors.filter((d) => {
      if (bgFilter !== "all" && d.blood_group !== bgFilter) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.mobile ?? "").toLowerCase().includes(q) ||
        (d.present_address ?? "").toLowerCase().includes(q) ||
        (d.reference_person ?? "").toLowerCase().includes(q) ||
        String(d.sl).includes(q)
      );
    });
  }, [donors, search, bgFilter]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEdit(d: Donor) {
    setEditing(d);
    setForm({
      sl: String(d.sl),
      name: d.name,
      blood_group: d.blood_group,
      mobile: d.mobile ?? "",
      present_address: d.present_address ?? "",
      permanent_address: d.permanent_address ?? "",
      reference_person: d.reference_person ?? "",
      reference_mobile: d.reference_mobile ?? "",
      last_donation_date: d.last_donation_date ?? "",
      notes: d.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0]?.message ?? "Check the form", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    const payload: any = {
      name: v.name,
      blood_group: v.blood_group,
      mobile: v.mobile || null,
      present_address: v.present_address || null,
      permanent_address: v.permanent_address || null,
      reference_person: v.reference_person || null,
      reference_mobile: v.reference_mobile || null,
      last_donation_date: v.last_donation_date || null,
      notes: v.notes || null,
    };
    try {
      if (editing) {
        if (v.sl && v.sl.trim() !== "") payload.sl = parseInt(v.sl, 10);
        const { error } = await supabase.from("blood_donors").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        if (v.sl && v.sl.trim() !== "") {
          payload.sl = parseInt(v.sl, 10);
        } else {
          const maxSl = donors.reduce((m, d) => Math.max(m, d.sl), 0);
          payload.sl = maxSl + 1;
        }
        const { error } = await supabase.from("blood_donors").insert(payload);
        if (error) throw error;
      }
      toast({ title: editing ? "Donor updated" : "Donor added" });
      setDialogOpen(false);
      void fetchAll();
    } catch (err: any) {
      toast({ title: editing ? "Update failed" : "Create failed", description: safeErrorMessage(err), variant: "destructive" });
    }
    setSubmitting(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { error } = await supabase.from("blood_donors").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Donor deleted" }); void fetchAll(); }
    setDeleteTarget(null);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Blood Donors</h1>
            <p className="text-sm text-muted-foreground">Database of blood donors with contact and last donation info.</p>
          </div>
          <Button onClick={openCreate}><Plus className="h-4 w-4" /> Add Donor</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Donor list</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${filtered.length} of ${donors.length} donors`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, mobile, address, or SL"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={bgFilter} onValueChange={setBgFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All blood groups</SelectItem>
                  {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">SL</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Blood Group</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Present Address</TableHead>
                    <TableHead>Permanent Address</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Last Donation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No donors found.</TableCell>
                    </TableRow>
                  )}
                  {filtered.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono">{d.sl}</TableCell>
                      <TableCell className="font-medium">{d.name}</TableCell>
                      <TableCell>
                        <Badge className={bgColor[d.blood_group]} variant="secondary">{d.blood_group}</Badge>
                      </TableCell>
                      <TableCell>{d.mobile ?? "—"}</TableCell>
                      <TableCell>{d.present_address ?? "—"}</TableCell>
                      <TableCell>{d.permanent_address ?? "—"}</TableCell>
                      <TableCell>
                        {d.reference_person ? (
                          <div>
                            <div>{d.reference_person}</div>
                            {d.reference_mobile && <div className="text-xs text-muted-foreground">{d.reference_mobile}</div>}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{d.last_donation_date ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(d)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(d)}>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit donor" : "Add donor"}</DialogTitle>
            <DialogDescription>
              {editing ? `SL ${editing.sl}` : "Leave SL empty to auto-assign."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>SL</Label>
                <Input value={form.sl} onChange={(e) => setForm({ ...form, sl: e.target.value })} placeholder="auto" />
              </div>
              <div>
                <Label>Blood Group *</Label>
                <Select value={form.blood_group} onValueChange={(v) => setForm({ ...form, blood_group: v as BG })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BLOOD_GROUPS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Mobile</Label>
              <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <Label>Present Address</Label>
              <Input value={form.present_address} onChange={(e) => setForm({ ...form, present_address: e.target.value })} />
            </div>
            <div>
              <Label>Permanent Address</Label>
              <Input value={form.permanent_address} onChange={(e) => setForm({ ...form, permanent_address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Reference Person</Label>
                <Input value={form.reference_person} onChange={(e) => setForm({ ...form, reference_person: e.target.value })} />
              </div>
              <div>
                <Label>Reference Mobile</Label>
                <Input value={form.reference_mobile} onChange={(e) => setForm({ ...form, reference_mobile: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Last Donation Date</Label>
              <Input type="date" value={form.last_donation_date} onChange={(e) => setForm({ ...form, last_donation_date: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete donor?"
        description={deleteTarget ? `Permanently delete "${deleteTarget.name}"?` : ""}
        onConfirm={confirmDelete}
      />
    </AppLayout>
  );
}
