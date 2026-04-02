import { useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  Package,
  Truck,
  MoreHorizontal,
  Building2,
  Send,
  Route,
  Users,
  Container,
  BarChart3,
  Shield,
  Receipt,
  Settings,
  Map,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const primaryItems = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Orders", path: "/orders", icon: Package },
  { label: "Planbord", path: "/planning", icon: Truck },
];

const moreItems = [
  { label: "Dispatch", path: "/dispatch", icon: Send },
  { label: "Ritoverzicht", path: "/ritten", icon: Route },
  { label: "Klanten", path: "/klanten", icon: Building2 },
  { label: "Chauffeurs", path: "/chauffeurs", icon: Users },
  { label: "Vloot", path: "/vloot", icon: Container },
  { label: "Rapportage", path: "/rapportage", icon: BarChart3 },
  { label: "Uitzonderingen", path: "/exceptions", icon: Shield },
  { label: "Facturatie", path: "/facturatie", icon: Receipt },
  { label: "Instellingen", path: "/settings", icon: Settings },
];

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  // Check if any "more" item is active (to highlight the "Meer" button)
  const moreIsActive = moreItems.some((item) => isActive(item.path));

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border/40 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-2">
          {primaryItems.map((item) => {
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                aria-label={item.label}
              >
                <item.icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                <span className="text-xs font-medium truncate">{item.label}</span>
              </NavLink>
            );
          })}

          {/* "Meer" button opens a sheet with remaining nav items */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors min-w-0",
                  moreIsActive ? "text-primary" : "text-muted-foreground"
                )}
                aria-label="Meer navigatie"
              >
                <MoreHorizontal className={cn("h-5 w-5", moreIsActive && "stroke-[2.5px]")} />
                <span className="text-xs font-medium truncate">Meer</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="rounded-t-2xl pb-safe max-h-[70vh]">
              <SheetHeader className="pb-2">
                <SheetTitle className="text-sm font-semibold">Navigatie</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-3 gap-2 py-2">
                {moreItems.map((item) => {
                  const active = isActive(item.path);
                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        setMoreOpen(false);
                        navigate(item.path);
                      }}
                      className={cn(
                        "flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors",
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
