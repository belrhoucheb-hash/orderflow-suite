import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet } from "react-router-dom";
import { NotificationCenter } from "@/components/NotificationCenter";
import { useSLAMonitor } from "@/hooks/useSLAMonitor";
import { useOrdersSubscription } from "@/hooks/useOrders";

export function AppLayout() {
  // Monitor SLA deadlines and auto-create notifications
  useSLAMonitor();
  // Listen for realtime database changes for orders
  useOrdersSubscription();

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border/40 flex items-center justify-between px-5 bg-card/80 backdrop-blur-sm relative z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
            </div>
            <div className="flex items-center gap-2">
              <NotificationCenter />
            </div>
          </header>
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
