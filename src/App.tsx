import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import NewOrder from "@/pages/NewOrder";
import Planning from "@/pages/Planning";
import ChauffeursRit from "@/pages/ChauffeursRit";
import Inbox from "@/pages/Inbox";
import UsersPage from "@/pages/UsersPage";
import Clients from "@/pages/Clients";
import Fleet from "@/pages/Fleet";
import VehicleDetail from "@/pages/VehicleDetail";
import Settings from "@/pages/Settings";
import Rapportage from "@/pages/Rapportage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="/inbox" element={<ErrorBoundary><Inbox /></ErrorBoundary>} />
              <Route path="/orders" element={<ErrorBoundary><Orders /></ErrorBoundary>} />
              <Route path="/orders/nieuw" element={<ErrorBoundary><NewOrder /></ErrorBoundary>} />
              <Route path="/klanten" element={<ErrorBoundary><Clients /></ErrorBoundary>} />
              <Route path="/orders/:id" element={<ErrorBoundary><OrderDetail /></ErrorBoundary>} />
              <Route path="/planning" element={<ErrorBoundary><Planning /></ErrorBoundary>} />
              <Route path="/ritten" element={<ErrorBoundary><ChauffeursRit /></ErrorBoundary>} />
              <Route path="/vloot" element={<ErrorBoundary><Fleet /></ErrorBoundary>} />
              <Route path="/vloot/:id" element={<ErrorBoundary><VehicleDetail /></ErrorBoundary>} />
              <Route path="/users" element={<ErrorBoundary><UsersPage /></ErrorBoundary>} />
              <Route path="/rapportage" element={<ErrorBoundary><Rapportage /></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
              <Route path="/settings/stamgegevens" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
