import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({
  children,
  requireSuperAdmin = false,
}: {
  children: React.ReactNode;
  requireSuperAdmin?: boolean;
}) {
  const { user, canAccessApp, isSuperAdmin, loading, profileLoaded } = useAuth();

  if (loading || (user && !profileLoaded)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!canAccessApp) return <Navigate to="/auth" replace />;
  if (requireSuperAdmin && !isSuperAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}
