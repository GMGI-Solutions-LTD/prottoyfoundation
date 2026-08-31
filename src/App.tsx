import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import AuthPage from "./pages/Auth";
import SignupPage from "./pages/Signup";

import Members from "./pages/Members";
import Funds from "./pages/Funds";
import Income from "./pages/Income";
import Expenses from "./pages/Expenses";
import MemberTypes from "./pages/MemberTypes";
import Dues from "./pages/Dues";
import Reconciliation from "./pages/Reconciliation";
import BulkImport from "./pages/BulkImport";
import Users from "./pages/Users";
import BloodDonors from "./pages/BloodDonors";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/signup" element={<SignupPage />} />
            
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/members" element={<ProtectedRoute><Members /></ProtectedRoute>} />
            <Route path="/funds" element={<ProtectedRoute><Funds /></ProtectedRoute>} />
            <Route path="/income" element={<ProtectedRoute><Income /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/member-types" element={<ProtectedRoute><MemberTypes /></ProtectedRoute>} />
            <Route path="/dues" element={<ProtectedRoute><Dues /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><Reconciliation /></ProtectedRoute>} />
            <Route path="/bulk-import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />

            <Route path="/blood-donors" element={<ProtectedRoute><BloodDonors /></ProtectedRoute>} />
            <Route
              path="/users"
              element={<ProtectedRoute requireSuperAdmin><Users /></ProtectedRoute>}
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
