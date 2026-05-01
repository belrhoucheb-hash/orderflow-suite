import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { NotificationCenter } from "@/components/NotificationCenter";
import { KeyboardShortcutsDialog } from "@/components/KeyboardShortcuts";
import { MobileNav } from "@/components/MobileNav";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { useSLAMonitor } from "@/hooks/useSLAMonitor";
import { useOrdersSubscription } from "@/hooks/useOrders";
import { useInboxSubscription } from "@/hooks/useInbox";
import { useAutoCompleteTripCheck } from "@/hooks/useTrips";
import { useAutoInvoiceGeneration } from "@/hooks/useInvoices";

export function AppLayout() {
  // Monitor SLA deadlines and auto-create notifications
  useSLAMonitor();
  // Listen for realtime database changes for orders
  useOrdersSubscription();
  // Listen for realtime database changes for inbox (draft/sent/concept orders)
  useInboxSubscription();
  // Auto-complete trips when all stops reach terminal status (via Realtime)
  useAutoCompleteTripCheck();
  // Auto-generate concept invoices for billing-ready orders
  useAutoInvoiceGeneration();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0 bg-[hsl(40_26%_96%)]">
          <header className="h-14 border-b border-[hsl(220_18%_88%/0.55)] flex items-center justify-between px-5 bg-[hsl(42_34%_98%/0.78)] backdrop-blur-xl relative z-50 shadow-[0_1px_0_hsl(0_0%_100%/0.65)]">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="hidden md:inline-flex" />
            </div>
            <div className="flex items-center gap-2">
              <NotificationCenter />
            </div>
          </header>
          <main className="app-main flex-1 overflow-auto p-3 md:p-6 pb-20 md:pb-6">
            <Outlet />
          </main>
          <MobileNav />
        </div>
      </div>
      <KeyboardShortcutsDialog />
      <OnboardingWizard />
    </SidebarProvider>
  );
}
