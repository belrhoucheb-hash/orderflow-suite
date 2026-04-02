import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

// Lazy load heavy pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const NewOrder = lazy(() => import("@/pages/NewOrder"));
const Planning = lazy(() => import("@/pages/Planning"));
const ChauffeursRit = lazy(() => import("@/pages/ChauffeursRit"));
const Chauffeurs = lazy(() => import("@/pages/Chauffeurs"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Mail = lazy(() => import("@/pages/Mail"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const Clients = lazy(() => import("@/pages/Clients"));
const Fleet = lazy(() => import("@/pages/Fleet"));
const VehicleDetail = lazy(() => import("@/pages/VehicleDetail"));
const Settings = lazy(() => import("@/pages/Settings"));
const Rapportage = lazy(() => import("@/pages/Rapportage"));
const Facturatie = lazy(() => import("@/pages/Facturatie"));
const ChauffeurApp = lazy(() => import("@/pages/ChauffeurApp"));
const TrackTrace = lazy(() => import("@/pages/TrackTrace"));
const Exceptions = lazy(() => import("@/pages/Exceptions"));
const Dispatch = lazy(() => import("@/pages/Dispatch"));

const queryClient = new QueryClient();

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-[calc(100vh-5rem)]">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TooltipProvider>
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
              <Route path="/" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ErrorBoundary>} />
              <Route path="/inbox" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Inbox /></Suspense></ErrorBoundary>} />
              <Route path="/mail" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Mail /></Suspense></ErrorBoundary>} />
              <Route path="/orders" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Orders /></Suspense></ErrorBoundary>} />
              <Route path="/orders/nieuw" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><NewOrder /></Suspense></ErrorBoundary>} />
              <Route path="/klanten" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Clients /></Suspense></ErrorBoundary>} />
              <Route path="/orders/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><OrderDetail /></Suspense></ErrorBoundary>} />
              <Route path="/planning" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Planning /></Suspense></ErrorBoundary>} />
              <Route path="/ritten" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><ChauffeursRit /></Suspense></ErrorBoundary>} />
              <Route path="/chauffeurs" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Chauffeurs /></Suspense></ErrorBoundary>} />
              <Route path="/vloot" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Fleet /></Suspense></ErrorBoundary>} />
              <Route path="/vloot/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><VehicleDetail /></Suspense></ErrorBoundary>} />
              <Route path="/users" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><UsersPage /></Suspense></ErrorBoundary>} />
              <Route path="/rapportage" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Rapportage /></Suspense></ErrorBoundary>} />
              <Route path="/facturatie" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Facturatie /></Suspense></ErrorBoundary>} />
              <Route path="/facturatie/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Facturatie /></Suspense></ErrorBoundary>} />
              <Route path="/dispatch" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Dispatch /></Suspense></ErrorBoundary>} />
              <Route path="/exceptions" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Exceptions /></Suspense></ErrorBoundary>} />
              <Route path="/settings" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Settings /></Suspense></ErrorBoundary>} />
              <Route path="/settings/stamgegevens" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Settings /></Suspense></ErrorBoundary>} />
            </Route>

            <Route path="/chauffeur" element={<ProtectedRoute><ErrorBoundary><Suspense fallback={<PageLoader />}><ChauffeurApp /></Suspense></ErrorBoundary></ProtectedRoute>} />
            <Route path="/track" element={<Suspense fallback={<PageLoader />}><TrackTrace /></Suspense>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
