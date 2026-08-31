import { ReactNode, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  Users,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  LogOut,
  Tags,
  Receipt,
  ShieldCheck,
  Scale,
  Droplet,
  FileSpreadsheet,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/members", label: "Members", icon: Users },
  { to: "/member-types", label: "Member Types", icon: Tags },
  { to: "/funds", label: "Funds", icon: Wallet },
  { to: "/income", label: "Income", icon: ArrowDownCircle },
  { to: "/expenses", label: "Expenses", icon: ArrowUpCircle },
  { to: "/dues", label: "Dues", icon: Receipt },
  { to: "/reconciliation", label: "Reconciliation", icon: Scale },
  { to: "/bulk-import", label: "Import / Export", icon: FileSpreadsheet },
  { to: "/blood-donors", label: "Blood Donors", icon: Droplet },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive
      ? "bg-primary text-primary-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { isSuperAdmin } = useAuth();
  return (
    <nav className="flex-1 space-y-1 p-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} end={item.end} className={linkClass} onClick={onNavigate}>
            <Icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        );
      })}
      {isSuperAdmin && (
        <NavLink to="/users" className={linkClass} onClick={onNavigate}>
          <ShieldCheck className="h-4 w-4" />
          Users
        </NavLink>
      )}
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const brand = (
    <div className="border-b p-4 flex items-center gap-3">
      <img src="/logo.png" alt="Prottoy Foundation" className="h-10 w-10 rounded-full" />
      <div>
        <h1 className="text-sm font-semibold leading-tight">Prottoy Foundation</h1>
        <p className="text-xs text-muted-foreground">Account Management</p>
      </div>
    </div>
  );

  const footer = (
    <div className="border-t p-3">
      <p className="mb-2 truncate px-3 text-xs text-muted-foreground">
        {(user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email}
      </p>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
        <LogOut className="mr-2 h-4 w-4" />
        Sign Out
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="hidden w-60 flex-col border-r bg-card md:flex">
        {brand}
        <SidebarNav />
        {footer}
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="md:hidden flex items-center justify-between border-b bg-card p-3">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-full flex-col">
                  {brand}
                  <SidebarNav onNavigate={() => setMobileOpen(false)} />
                  {footer}
                </div>
              </SheetContent>
            </Sheet>
            <img src="/logo.png" alt="Prottoy Foundation" className="h-7 w-7 rounded-full" />
            <h1 className="font-semibold">Prottoy Foundation</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={handleSignOut} aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
        <div key={location.pathname} className="p-6">{children}</div>
      </main>
    </div>
  );
}
