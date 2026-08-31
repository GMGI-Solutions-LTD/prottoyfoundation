import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { Loader2, MoreVertical, Plus, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { safeErrorMessage } from "@/lib/errors";
import { format } from "date-fns";

const USERNAME_DOMAIN = "prottoy.local";

const usernameToDisplay = (email: string | null) => {
  if (!email) return "—";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
};

const createSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-z0-9_.-]+$/, "Use letters, numbers, dot, dash, or underscore"),
  full_name: z.string().trim().min(1, "Name required").max(200),
  password: z.string().min(8, "At least 8 characters").max(72),
});

interface AdminRow {
  user_id: string;
  email: string | null;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  roles: string[];
}

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const [rows, setRows] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [showCreatePassword, setShowCreatePassword] = useState(false);

  const [resetTarget, setResetTarget] = useState<AdminRow | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: profiles } = await supabase
      .from("admin_profiles")
      .select("user_id, email, full_name, is_active, created_at")
      .order("created_at", { ascending: false });
    const { data: roles } = await supabase.from("user_roles").select("user_id, role");
    const rolesByUser = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role);
      rolesByUser.set(r.user_id, list);
    });
    setRows(
      (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.user_id) ?? [],
      }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = createSchema.safeParse({ username, full_name: fullName, password });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("create-admin", { body: parsed.data });
    setSubmitting(false);
    if (error || (data && (data as { error?: string }).error)) {
      toast({
        title: "Create failed",
        description: safeErrorMessage(error ?? (data as { error?: string })?.error),
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Admin created", description: `${parsed.data.username} can now sign in.` });
    setUsername(""); setFullName(""); setPassword("");
    setShowCreatePassword(false);
    setCreateOpen(false);
    load();
  };

  const doAction = async (action: string, target_user_id: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke("admin-action", {
      body: { action, target_user_id, ...extra },
    });
    if (error || (data && (data as { error?: string }).error)) {
      toast({
        title: "Action failed",
        description: safeErrorMessage(error ?? (data as { error?: string })?.error),
        variant: "destructive",
      });
      return false;
    }
    toast({ title: "Done" });
    load();
    return true;
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "At least 8 characters", variant: "destructive" });
      return;
    }
    const ok = await doAction("reset_password", resetTarget.user_id, { new_password: newPassword });
    if (ok) {
      setResetTarget(null);
      setNewPassword("");
      setShowResetPassword(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-muted-foreground">Create and manage admin accounts.</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Create admin</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create admin account</DialogTitle>
                <DialogDescription>
                  Share the username and password with the new admin. They can sign in directly — no email verification required.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ca-name">Full name</Label>
                  <Input id="ca-name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ca-username">Username</Label>
                  <Input
                    id="ca-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ca-password">Password (min 8 chars)</Label>
                  <div className="relative">
                    <Input
                      id="ca-password"
                      type={showCreatePassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreatePassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                      aria-label={showCreatePassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showCreatePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={submitting}>
                    {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All admins</CardTitle>
            <CardDescription>{rows.length} total</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No admins yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const isSuper = r.roles.includes("super_admin");
                    const isSelf = r.user_id === currentUser?.id;
                    const uname = usernameToDisplay(r.email);
                    return (
                      <TableRow key={r.user_id}>
                        <TableCell className="font-medium">{r.full_name ?? "—"}{isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}</TableCell>
                        <TableCell>{uname}</TableCell>
                        <TableCell>
                          {isSuper ? (
                            <Badge className="gap-1"><ShieldCheck className="h-3 w-3" />Super admin</Badge>
                          ) : (
                            <Badge variant="secondary">Admin</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {r.is_active ? (
                            <Badge variant="outline" className="border-green-500 text-green-700">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive text-destructive">Deactivated</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setResetTarget(r)}>
                                Reset password
                              </DropdownMenuItem>
                              {!isSelf && (
                                <>
                                  {r.is_active ? (
                                    <DropdownMenuItem onClick={() => doAction("deactivate", r.user_id)}>
                                      Deactivate
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => doAction("reactivate", r.user_id)}>
                                      Reactivate
                                    </DropdownMenuItem>
                                  )}
                                  {isSuper ? (
                                    <DropdownMenuItem onClick={() => doAction("demote", r.user_id)}>
                                      Demote to admin
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem onClick={() => doAction("promote", r.user_id)}>
                                      Promote to super admin
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="text-destructive"
                                    onClick={() => {
                                      if (confirm(`Delete ${uname}? This cannot be undone.`)) {
                                        doAction("delete", r.user_id);
                                      }
                                    }}
                                  >
                                    Delete
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>

                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!resetTarget}
        onOpenChange={(o) => {
          if (!o) {
            setResetTarget(null);
            setNewPassword("");
            setShowResetPassword(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for {usernameToDisplay(resetTarget?.email ?? null)}. Share it with them securely.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rp-pw">New password (min 8 chars)</Label>
              <div className="relative">
                <Input
                  id="rp-pw"
                  type={showResetPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showResetPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">Update password</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
