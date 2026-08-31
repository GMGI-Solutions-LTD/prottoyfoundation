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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Plus, Search, Pencil, Power, Wallet, Trash2, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { Database } from "@/integrations/supabase/types";
import { MemberSubscriptionsDialog } from "@/components/MemberSubscriptionsDialog";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { safeErrorMessage } from "@/lib/errors";

type Member = Database["public"]["Tables"]["members"]["Row"];
type MemberType = { id: string; name: string; is_active: boolean; sort_order: number };



const memberSchema = z.object({
  member_no: z.string().trim().regex(/^\d*$/, "Must be a number").optional().or(z.literal("")),
  full_name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().max(255).email("Invalid email").optional().or(z.literal("")),
  mobile: z.string().trim().max(20).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  joining_date: z.string().min(1, "Joining date required"),
  reference_person: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof memberSchema>;

const emptyForm: FormValues = {
  member_no: "",
  full_name: "",
  email: "",
  mobile: "",
  address: "",
  joining_date: new Date().toISOString().slice(0, 10),
  reference_person: "",
  notes: "",
};

export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [types, setTypes] = useState<MemberType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [toggleTarget, setToggleTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);
  const [subsTarget, setSubsTarget] = useState<Member | null>(null);

  const [memberTypeIds, setMemberTypeIds] = useState<Map<string, Set<string>>>(new Map());
  const [selectedTypeIds, setSelectedTypeIds] = useState<Set<string>>(new Set());
  const [fundsMap, setFundsMap] = useState<Map<string, string>>(new Map());
  const [oneTimeFundIds, setOneTimeFundIds] = useState<Set<string>>(new Set());
  const [memberSubs, setMemberSubs] = useState<Map<string, { fund_id: string; monthly_amount: number }[]>>(new Map());

  useEffect(() => {
    document.title = "Members | Prottoy Foundation";
    void fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [mRes, tRes, linkRes, fRes, sRes] = await Promise.all([
      supabase.from("members").select("*").order("member_no", { ascending: true }),
      supabase.from("member_types").select("id,name,is_active,sort_order").order("sort_order").order("name"),
      supabase.from("member_member_types").select("member_id, member_type_id"),
      supabase.from("funds").select("id,name,is_one_time"),
      supabase.from("member_fund_subscriptions").select("member_id, fund_id, monthly_amount, is_active").eq("is_active", true),
    ]);
    if (mRes.error) toast({ title: "Failed to load members", description: safeErrorMessage(mRes.error), variant: "destructive" });
    else setMembers(mRes.data ?? []);
    if (tRes.error) toast({ title: "Failed to load types", description: safeErrorMessage(tRes.error), variant: "destructive" });
    else setTypes((tRes.data ?? []) as MemberType[]);
    const map = new Map<string, Set<string>>();
    for (const r of linkRes.data ?? []) {
      if (!map.has(r.member_id)) map.set(r.member_id, new Set());
      map.get(r.member_id)!.add(r.member_type_id);
    }
    setMemberTypeIds(map);
    setFundsMap(new Map((fRes.data ?? []).map((f: any) => [f.id, f.name])));
    setOneTimeFundIds(new Set((fRes.data ?? []).filter((f: any) => f.is_one_time).map((f: any) => f.id)));
    const sMap = new Map<string, { fund_id: string; monthly_amount: number }[]>();
    for (const s of sRes.data ?? []) {
      const arr = sMap.get(s.member_id) ?? [];
      arr.push({ fund_id: s.fund_id, monthly_amount: Number(s.monthly_amount ?? 0) });
      sMap.set(s.member_id, arr);
    }
    setMemberSubs(sMap);
    setLoading(false);
  }

  const typeMap = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const activeTypes = useMemo(() => types.filter((t) => t.is_active), [types]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (typeFilter !== "all") {
        const set = memberTypeIds.get(m.id);
        if (!set || !set.has(typeFilter)) return false;
      }
      if (statusFilter === "active" && !m.is_active) return false;
      if (statusFilter === "inactive" && m.is_active) return false;
      if (!q) return true;
      return (
        m.full_name.toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q) ||
        (m.mobile ?? "").toLowerCase().includes(q) ||
        String(m.member_no).includes(q)
      );
    });
  }, [members, search, typeFilter, statusFilter, memberTypeIds]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setSelectedTypeIds(new Set(activeTypes[0] ? [activeTypes[0].id] : []));
    setDialogOpen(true);
  }

  function openEdit(m: Member) {
    setEditing(m);
    setForm({
      member_no: String(m.member_no ?? ""),
      full_name: m.full_name,
      email: m.email ?? "",
      mobile: m.mobile ?? "",
      address: m.address ?? "",
      joining_date: m.joining_date,
      reference_person: (m as any).reference_person ?? "",
      notes: m.notes ?? "",
    });
    setSelectedTypeIds(new Set(memberTypeIds.get(m.id) ?? []));
    setDialogOpen(true);
  }

  function toggleSelectedType(id: string) {
    setSelectedTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function syncMemberTypes(memberId: string, prevIds: Set<string>, nextIds: Set<string>) {
    const toAdd = [...nextIds].filter((i) => !prevIds.has(i));
    const toDel = [...prevIds].filter((i) => !nextIds.has(i));
    if (toAdd.length) {
      const { error } = await supabase.from("member_member_types")
        .insert(toAdd.map((tid) => ({ member_id: memberId, member_type_id: tid })));
      if (error) throw error;
    }
    if (toDel.length) {
      const { error } = await supabase.from("member_member_types")
        .delete().eq("member_id", memberId).in("member_type_id", toDel);
      if (error) throw error;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = memberSchema.safeParse(form);
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.issues[0]?.message ?? "Check the form", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const v = parsed.data;
    const payload: any = {
      full_name: v.full_name,
      email: v.email || null,
      mobile: v.mobile || null,
      address: v.address || null,
      joining_date: v.joining_date,
      reference_person: v.reference_person || null,
      notes: v.notes || null,
    };
    if (v.member_no && v.member_no.trim() !== "") {
      payload.member_no = parseInt(v.member_no, 10);
    }

    try {
      let memberId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("members").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("members").insert(payload).select("id").single();
        if (error) throw error;
        memberId = data!.id;
      }
      const prev = editing ? (memberTypeIds.get(editing.id) ?? new Set<string>()) : new Set<string>();
      await syncMemberTypes(memberId!, prev, selectedTypeIds);
      toast({ title: editing ? "Member updated" : "Member added" });
      setDialogOpen(false);
      void fetchAll();
    } catch (err: any) {
      toast({ title: editing ? "Update failed" : "Create failed", description: safeErrorMessage(err), variant: "destructive" });
    }
    setSubmitting(false);
  }

  async function confirmToggle() {
    if (!toggleTarget) return;
    const { error } = await supabase
      .from("members")
      .update({ is_active: !toggleTarget.is_active })
      .eq("id", toggleTarget.id);
    if (error) toast({ title: "Action failed", description: safeErrorMessage(error), variant: "destructive" });
    else {
      toast({ title: toggleTarget.is_active ? "Member deactivated" : "Member activated" });
      void fetchAll();
    }
    setToggleTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { count } = await supabase.from("transactions")
      .select("id", { count: "exact", head: true }).eq("member_id", deleteTarget.id);
    if ((count ?? 0) > 0) {
      toast({ title: "Cannot delete", description: `Member has ${count} transaction(s). Deactivate instead.`, variant: "destructive" });
      setDeleteTarget(null);
      return;
    }
    await supabase.from("member_fund_subscriptions").delete().eq("member_id", deleteTarget.id);
    const { error } = await supabase.from("members").delete().eq("id", deleteTarget.id);
    if (error) toast({ title: "Delete failed", description: safeErrorMessage(error), variant: "destructive" });
    else { toast({ title: "Member deleted" }); void fetchAll(); }
    setDeleteTarget(null);
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
            <p className="text-sm text-muted-foreground">
              Manage foundation members, their types, and fund subscriptions.
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Member
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Member list</CardTitle>
            <CardDescription>
              {loading ? "Loading…" : `${filtered.length} of ${members.length} members`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, mobile, or member no."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">No.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Mobile</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Fund Subscriptions</TableHead>
                    <TableHead className="text-right">Total Monthly</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                        No members found.
                      </TableCell>
                    </TableRow>
                  )}
                  {filtered.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono">{m.member_no}</TableCell>
                      <TableCell>
                        <div className="font-medium">{m.full_name}</div>
                        {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {[...(memberTypeIds.get(m.id) ?? [])].map((tid) => (
                            <Badge key={tid} variant="secondary">{typeMap.get(tid) ?? "—"}</Badge>
                          ))}
                          {!memberTypeIds.get(m.id)?.size && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>{m.mobile ?? "—"}</TableCell>
                      <TableCell>{(m as any).reference_person ?? "—"}</TableCell>
                      <TableCell>{m.joining_date}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {(memberSubs.get(m.id) ?? []).map((s) => (
                            <Badge key={s.fund_id} variant="outline">{fundsMap.get(s.fund_id) ?? "—"}</Badge>
                          ))}
                          {!memberSubs.get(m.id)?.length && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ৳{(memberSubs.get(m.id) ?? []).filter((s) => !oneTimeFundIds.has(s.fund_id)).reduce((sum, s) => sum + s.monthly_amount, 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {m.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Fund subscriptions" onClick={() => setSubsTarget(m)}>
                            <Wallet className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Toggle active" onClick={() => setToggleTarget(m)}>
                            <Power className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Delete" onClick={() => setDeleteTarget(m)}>
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
            <DialogTitle>{editing ? "Edit member" : "Add member"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Member No. ${editing.member_no}`
                : "Leave Member No. empty to auto-assign."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="member_no">Member No.</Label>
                <Input
                  id="member_no"
                  inputMode="numeric"
                  placeholder="Auto"
                  value={form.member_no}
                  onChange={(e) => setForm({ ...form, member_no: e.target.value.replace(/[^\d]/g, "") })}
                />
              </div>
              <div className="grid gap-2 col-span-2">
                <Label htmlFor="full_name">Full name *</Label>
                <Input
                  id="full_name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="mobile">Mobile</Label>
                <Input
                  id="mobile"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>Member types</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" className="justify-between font-normal">
                    <span className="truncate text-left">
                      {selectedTypeIds.size === 0
                        ? "Select types"
                        : [...selectedTypeIds].map((id) => typeMap.get(id) ?? "?").join(", ")}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="max-h-64 overflow-auto space-y-1">
                    {activeTypes.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No active types. Create one first.</p>
                    )}
                    {activeTypes.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent cursor-pointer">
                        <Checkbox
                          checked={selectedTypeIds.has(t.id)}
                          onCheckedChange={() => toggleSelectedType(t.id)}
                        />
                        <span className="text-sm">{t.name}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              {selectedTypeIds.size > 0 && (
                <div className="flex flex-wrap gap-1">
                  {[...selectedTypeIds].map((id) => (
                    <Badge key={id} variant="secondary">{typeMap.get(id) ?? "?"}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="joining_date">Joining date *</Label>
              <Input
                id="joining_date"
                type="date"
                value={form.joining_date}
                onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reference_person">Reference person</Label>
              <Input
                id="reference_person"
                list="reference-person-options"
                placeholder="Select an existing member or type a new name"
                value={form.reference_person}
                onChange={(e) => setForm({ ...form, reference_person: e.target.value })}
              />
              <datalist id="reference-person-options">
                {members
                  .filter((m) => !editing || m.id !== editing.id)
                  .map((m) => (
                    <option key={m.id} value={m.full_name} />
                  ))}
              </datalist>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : editing ? "Save changes" : "Add member"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggleTarget} onOpenChange={(o) => !o && setToggleTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleTarget?.is_active ? "Deactivate member?" : "Activate member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleTarget?.is_active
                ? `${toggleTarget?.full_name} will be marked inactive and hidden from default lists.`
                : `${toggleTarget?.full_name} will be reactivated.`}
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
        title="Delete member?"
        description={<>Permanently delete {deleteTarget?.full_name}. Members with recorded transactions cannot be deleted — deactivate them instead.</>}
        onConfirm={confirmDelete}
      />

      <MemberSubscriptionsDialog
        open={!!subsTarget}
        onOpenChange={(o) => !o && setSubsTarget(null)}
        memberId={subsTarget?.id ?? null}
        memberName={subsTarget?.full_name ?? ""}
      />
    </AppLayout>
  );
}
