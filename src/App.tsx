import { Suspense, lazy } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";
import Login from "@/pages/Login";
import NotFound from "@/pages/NotFound";

/**
 * Route guard based on effective role.
 * - admin: all routes
 * - planner: everything except admin-only (/settings, /users)
 * - chauffeur: only /chauffeur
 */
function RoleGuard({ allow, children }: { allow: Array<"admin" | "planner" | "chauffeur">; children: React.ReactNode }) {
  const { effectiveRole, loading } = useAuth();
  if (loading) return null;
  if (!allow.includes(effectiveRole)) {
    // Redirect to role-appropriate default page
    const defaultPaths: Record<string, string> = { admin: "/", planner: "/", chauffeur: "/chauffeur" };
    return <Navigate to={defaultPaths[effectiveRole] || "/"} replace />;
  }
  return <>{children}</>;
}

// Lazy load heavy pages
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const Orders = lazy(() => import("@/pages/Orders"));
const OrderDetail = lazy(() => import("@/pages/OrderDetail"));
const NewOrder = lazy(() => import("@/pages/NewOrder"));
const Planning = lazy(() => import("@/pages/PlanningV2"));
const ChauffeursRit = lazy(() => import("@/pages/ChauffeursRit"));
const Chauffeurs = lazy(() => import("@/pages/Chauffeurs"));
const Inbox = lazy(() => import("@/pages/Inbox"));
const Mail = lazy(() => import("@/pages/Mail"));
const UsersPage = lazy(() => import("@/pages/UsersPage"));
const Clients = lazy(() => import("@/pages/Clients"));
const ClientDetail = lazy(() => import("@/pages/ClientDetail"));
const Fleet = lazy(() => import("@/pages/Fleet"));
const VehicleDetail = lazy(() => import("@/pages/VehicleDetail"));
const VoertuigcheckHistorie = lazy(() => import("@/pages/VoertuigcheckHistorie"));
const VoertuigcheckPerVoertuig = lazy(() => import("@/pages/VoertuigcheckPerVoertuig"));
const Settings = lazy(() => import("@/pages/Settings"));
const Rapportage = lazy(() => import("@/pages/Rapportage"));
const Facturatie = lazy(() => import("@/pages/Facturatie"));
const FacturatieDetail = lazy(() => import("@/pages/FacturatieDetail"));
const ChauffeurApp = lazy(() => import("@/pages/ChauffeurApp"));
const PreviewPreDepartureModal = lazy(() => import("@/pages/PreviewPreDepartureModal"));
const TrackTrace = lazy(() => import("@/pages/TrackTrace"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));
const Exceptions = lazy(() => import("@/pages/Exceptions"));
const PortalOrders = lazy(() => import("@/pages/portal/PortalOrders"));
const PortalTracking = lazy(() => import("@/pages/portal/PortalTracking"));
const PortalDocuments = lazy(() => import("@/pages/portal/PortalDocuments"));
const PortalInvoicing = lazy(() => import("@/pages/portal/PortalInvoicing"));
const PortalReporting = lazy(() => import("@/pages/portal/PortalReporting"));
const PortalSettings = lazy(() => import("@/pages/portal/PortalSettings"));
const Dispatch = lazy(() => import("@/pages/Dispatch"));
const LiveTracking = lazy(() => import("@/pages/LiveTracking"));
const Autonomie = lazy(() => import("@/pages/Autonomie"));

// Performance: saner React Query defaults.
//   * staleTime 60s — avoids instant re-fetch op elk mount.
//   * refetchOnWindowFocus off — voorkomt full reload bij tab-switch.
//   * retry 1 — laat fouten snel terugzien ipv 3x wachten.
// Per-query overrides blijven mogelijk via queryOptions.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
                  <RoleGuard allow={["admin", "planner"]}>
                    <AppLayout />
                  </RoleGuard>
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ErrorBoundary>} />
              <Route path="/inbox" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Inbox /></Suspense></ErrorBoundary>} />
              <Route path="/mail" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Mail /></Suspense></ErrorBoundary>} />
              <Route path="/orders" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Orders /></Suspense></ErrorBoundary>} />
              <Route path="/orders/nieuw" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><NewOrder /></Suspense></ErrorBoundary>} />
              <Route path="/klanten" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Clients /></Suspense></ErrorBoundary>} />
              <Route path="/klanten/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><ClientDetail /></Suspense></ErrorBoundary>} />
              <Route path="/orders/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><OrderDetail /></Suspense></ErrorBoundary>} />
              <Route path="/planning" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Planning /></Suspense></ErrorBoundary>} />
              <Route path="/planning-v2" element={<Navigate to="/planning" replace />} />
              <Route path="/ritten" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><ChauffeursRit /></Suspense></ErrorBoundary>} />
              <Route path="/chauffeurs" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Chauffeurs /></Suspense></ErrorBoundary>} />
              <Route path="/vloot" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Fleet /></Suspense></ErrorBoundary>} />
              <Route path="/vloot/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><VehicleDetail /></Suspense></ErrorBoundary>} />
              <Route path="/voertuigcheck" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><VoertuigcheckHistorie /></Suspense></ErrorBoundary>} />
              <Route path="/voertuigcheck/voertuig/:vehicleId" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><VoertuigcheckPerVoertuig /></Suspense></ErrorBoundary>} />
              <Route path="/users" element={<RoleGuard allow={["admin"]}><ErrorBoundary><Suspense fallback={<PageLoader />}><UsersPage /></Suspense></ErrorBoundary></RoleGuard>} />
              <Route path="/rapportage" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Rapportage /></Suspense></ErrorBoundary>} />
              <Route path="/facturatie" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Facturatie /></Suspense></ErrorBoundary>} />
              <Route path="/facturatie/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><FacturatieDetail /></Suspense></ErrorBoundary>} />
              <Route path="/dispatch" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Dispatch /></Suspense></ErrorBoundary>} />
              <Route path="/tracking" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><LiveTracking /></Suspense></ErrorBoundary>} />
              <Route path="/exceptions" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Exceptions /></Suspense></ErrorBoundary>} />
              <Route path="/autonomie" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Autonomie /></Suspense></ErrorBoundary>} />
              <Route path="/settings" element={<RoleGuard allow={["admin"]}><ErrorBoundary><Suspense fallback={<PageLoader />}><Settings /></Suspense></ErrorBoundary></RoleGuard>} />
              <Route path="/settings/*" element={<RoleGuard allow={["admin"]}><ErrorBoundary><Suspense fallback={<PageLoader />}><Settings /></Suspense></ErrorBoundary></RoleGuard>} />
            </Route>

            <Route path="/chauffeur" element={<ProtectedRoute><ErrorBoundary><Suspense fallback={<PageLoader />}><ChauffeurApp /></Suspense></ErrorBoundary></ProtectedRoute>} />
            <Route path="/chauffeur/preview-modal" element={<Suspense fallback={<PageLoader />}><PreviewPreDepartureModal /></Suspense>} />
            <Route path="/track" element={<Suspense fallback={<PageLoader />}><TrackTrace /></Suspense>} />
            <Route path="/portal" element={<Suspense fallback={<PageLoader />}><ClientPortal /></Suspense>}>
              <Route index element={<Suspense fallback={<PageLoader />}><PortalOrders /></Suspense>} />
              <Route path="tracking" element={<Suspense fallback={<PageLoader />}><PortalTracking /></Suspense>} />
              <Route path="documenten" element={<Suspense fallback={<PageLoader />}><PortalDocuments /></Suspense>} />
              <Route path="facturatie" element={<Suspense fallback={<PageLoader />}><PortalInvoicing /></Suspense>} />
              <Route path="rapportage" element={<Suspense fallback={<PageLoader />}><PortalReporting /></Suspense>} />
              <Route path="instellingen" element={<Suspense fallback={<PageLoader />}><PortalSettings /></Suspense>} />
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
