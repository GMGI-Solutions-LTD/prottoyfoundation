import { useEffect, useState } from "react";
import { useNavigate, Navigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { safeErrorMessage } from "@/lib/errors";

const USERNAME_DOMAIN = "prottoy.local";

const signInSchema = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters")
    .max(50)
    .regex(/^[a-z0-9_.-]+$/, "Use letters, numbers, dot, dash, or underscore"),
  password: z.string().min(6, "Password must be at least 6 characters").max(72),
});

export default function AuthPage() {
  const { user, canAccessApp, adminProfile, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const [siUsername, setSiUsername] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    supabase.rpc("bootstrap_needed").then(({ data }) => setBootstrapNeeded(!!data));
  }, []);

  useEffect(() => {
    if (loading || !user) return;
    if (canAccessApp) {
      navigate("/", { replace: true });
      return;
    }
    if (adminProfile && !adminProfile.is_active) {
      setStatusMsg("Your account has been deactivated. Please contact your super admin.");
      signOut();
    }
  }, [user, adminProfile, canAccessApp, loading, navigate, signOut]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (user && canAccessApp) return <Navigate to="/" replace />;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    const parsed = signInSchema.safeParse({ username: siUsername, password: siPassword });
    if (!parsed.success) {
      toast({ title: "Invalid input", description: parsed.error.errors[0].message, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: `${parsed.data.username}@${USERNAME_DOMAIN}`,
      password: parsed.data.password,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Sign in failed", description: safeErrorMessage(error), variant: "destructive" });
      return;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md overflow-hidden">
        <img src="/header.png" alt="Prottoy Foundation" className="w-full" />
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Prottoy Foundation</CardTitle>
          <CardDescription>Account Management System</CardDescription>
        </CardHeader>
        <CardContent>
          {statusMsg && (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {statusMsg}
            </div>
          )}
          <form onSubmit={handleSignIn} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label htmlFor="si-username">Username</Label>
              <Input
                id="si-username"
                autoComplete="username"
                value={siUsername}
                onChange={(e) => setSiUsername(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="si-password">Password</Label>
              <div className="relative">
                <Input
                  id="si-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={siPassword}
                  onChange={(e) => setSiPassword(e.target.value)}
                  className="pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Sign In
            </Button>

            {bootstrapNeeded ? (
              <p className="text-center text-xs text-muted-foreground">
                No accounts yet?{" "}
                <Link to="/signup" className="text-primary underline">
                  Set up the first administrator
                </Link>
              </p>
            ) : (
              <p className="text-center text-xs text-muted-foreground">
                Need an account? Ask your super admin to create one for you.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
