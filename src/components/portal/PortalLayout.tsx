import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Package, MapPin, FileText, Receipt, BarChart3, Settings,
  LogOut, Menu, X, Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PortalModule } from "@/types/clientPortal";
import { PORTAL_MODULE_LABELS } from "@/types/clientPortal";
import type { User } from "@supabase/supabase-js";

interface TenantBranding {
  name: string;
  logo: string | null;
  primaryColor: string;
}

const MODULE_ICONS: Record<PortalModule, typeof Package> = {
  orders: Package,
  tracking: MapPin,
  documents: FileText,
  invoicing: Receipt,
  reporting: BarChart3,
  settings: Settings,
};

const MODULE_PATHS: Record<PortalModule, string> = {
  orders: "/portal",
  tracking: "/portal/tracking",
  documents: "/portal/documenten",
  invoicing: "/portal/facturatie",
  reporting: "/portal/rapportage",
  settings: "/portal/instellingen",
};

interface PortalLayoutProps {
  children: React.ReactNode;
  user: User;
  clientName: string;
  branding: TenantBranding | null;
  enabledModules?: PortalModule[];
  onLogout: () => void;
}

export function PortalLayout({
  children,
  user,
  clientName,
  branding,
  enabledModules = ["orders", "tracking", "documents", "invoicing", "reporting", "settings"],
  onLogout,
}: PortalLayoutProps) {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const primaryColor = branding?.primaryColor || "#dc2626";
  const companyName = branding?.name || "Klantportaal";

  // Determine active module from URL
  const activeModule: PortalModule = (() => {
    const path = location.pathname;
    if (path.includes("/tracking")) return "tracking";
    if (path.includes("/documenten")) return "documents";
    if (path.includes("/facturatie")) return "invoicing";
    if (path.includes("/rapportage")) return "reporting";
    if (path.includes("/instellingen")) return "settings";
    return "orders";
  })();

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              className="sm:hidden p-2 -ml-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            {branding?.logo ? (
              <img src={branding.logo} alt={companyName} className="h-8 max-w-[140px] object-contain" />
            ) : (
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: primaryColor }}
              >
                <Truck className="h-5 w-5 text-white" />
              </div>
            )}
            <div>
              <span className="text-lg font-bold tracking-tight text-gray-900">
                {companyName}
              </span>
              <span className="hidden sm:inline text-sm text-gray-400 ml-2">Klantportaal</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600 hidden sm:inline">
              {clientName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="gap-1.5 text-gray-500 hover:text-gray-900"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Uitloggen</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex max-w-7xl mx-auto w-full">
        {/* Sidebar navigation */}
        <nav
          className={cn(
            "w-56 bg-white border-r border-gray-100 py-4 flex-shrink-0",
            "hidden sm:block",
            mobileMenuOpen && "!block fixed inset-y-16 left-0 z-10 shadow-lg"
          )}
        >
          <div className="space-y-1 px-3">
            {enabledModules.map((mod) => {
              const Icon = MODULE_ICONS[mod];
              const isActive = activeModule === mod;
              return (
                <Link
                  key={mod}
                  to={MODULE_PATHS[mod]}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "text-white"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                  style={isActive ? { backgroundColor: primaryColor } : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {PORTAL_MODULE_LABELS[mod]}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>

      {/* Footer — no OrderFlow branding */}
      <footer className="border-t border-gray-100 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-xs text-gray-400 text-center">
            &copy; {new Date().getFullYear()} {companyName}. Alle rechten voorbehouden.
          </p>
        </div>
      </footer>
    </div>
  );
}
