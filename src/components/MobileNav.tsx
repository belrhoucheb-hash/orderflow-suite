import { useMemo, useState } from "react";
import {
  LayoutDashboard,
  Inbox,
  Package,
  Truck,
  MoreHorizontal,
  Building2,
  Send,
  Users,
  Container,
  BarChart3,
  AlertTriangle,
  Receipt,
  Settings,
  Activity,
  ChevronRight,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { preloadAppRoute } from "@/lib/routePreload";
import { useExceptionCount } from "@/hooks/useExceptionCount";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const primaryItems = [
  { label: "Overzicht", path: "/", icon: LayoutDashboard },
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Orders", path: "/orders", icon: Package },
  { label: "Planbord", path: "/planning", icon: Truck },
];

const sections = [
  {
    label: "Operatie",
    items: [
      { label: "Dispatch", path: "/dispatch", icon: Send },
      { label: "Uitzonderingen", path: "/exceptions", icon: AlertTriangle },
    ],
  },
  {
    label: "Financieel",
    items: [
      { label: "Autonomie", path: "/autonomie", icon: Activity },
      { label: "Facturatie", path: "/facturatie", icon: Receipt },
      { label: "Rapportage", path: "/rapportage", icon: BarChart3 },
    ],
  },
  {
    label: "Relaties",
    items: [
      { label: "Klanten", path: "/klanten", icon: Building2 },
      { label: "Chauffeurs", path: "/chauffeurs", icon: Users },
      { label: "Vloot", path: "/vloot", icon: Container },
    ],
  },
  {
    label: "Beheer",
    items: [
      { label: "Instellingen", path: "/settings", icon: Settings },
    ],
  },
] as const;

export function MobileNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: exceptionCount } = useExceptionCount();
  const exceptionBadgeValue = exceptionCount?.total ?? 0;
  const isExceptionsActive = location.pathname.startsWith("/exceptions");
  const showExceptionCount = !isExceptionsActive && exceptionBadgeValue >= 4;
  const showExceptionDot = !isExceptionsActive && exceptionBadgeValue > 0 && !showExceptionCount;

  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  const moreItems = useMemo(() => sections.flatMap((section) => section.items), []);
  const moreIsActive = moreItems.some((item) => isActive(item.path));

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t md:hidden safe-area-bottom"
        style={{
          background: "linear-gradient(180deg, hsl(224 28% 13% / 0.94), hsl(220 27% 9% / 0.98))",
          borderColor: "hsl(var(--gold) / 0.14)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div className="flex h-14 items-center justify-around px-2">
          {primaryItems.map((item) => {
            const active = isActive(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors",
                  "min-h-[44px]",
                  active ? "text-white" : "text-white/52"
                )}
                style={active ? { background: "linear-gradient(180deg, hsl(220 23% 18%), hsl(220 22% 14%))", boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.18)" } : undefined}
                aria-label={item.label}
                onPointerEnter={() => preloadAppRoute(item.path)}
                onFocus={() => preloadAppRoute(item.path)}
                onTouchStart={() => preloadAppRoute(item.path)}
              >
                <item.icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2.2 : 1.9}
                  style={active ? { color: "hsl(var(--gold-light))" } : undefined}
                />
                <span className="truncate text-[11px] font-medium">{item.label}</span>
              </NavLink>
            );
          })}

          {/* "Meer" button opens a sheet with remaining nav items */}
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-colors",
                  "min-h-[44px]",
                  moreIsActive ? "text-white" : "text-white/52"
                )}
                style={moreIsActive ? { background: "linear-gradient(180deg, hsl(220 23% 18%), hsl(220 22% 14%))", boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.18)" } : undefined}
                aria-label="Meer navigatie"
              >
                <div className="relative">
                  <MoreHorizontal
                    className="h-5 w-5"
                    strokeWidth={moreIsActive ? 2.2 : 1.9}
                    style={moreIsActive ? { color: "hsl(var(--gold-light))" } : undefined}
                  />
                  {showExceptionDot && (
                    <span
                      className="absolute -right-1 -top-0.5 h-1.5 w-1.5 rounded-full"
                      style={{ background: "hsl(var(--gold-light))" }}
                    />
                  )}
                </div>
                <span className="truncate text-[11px] font-medium">Meer</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="max-h-[75vh] rounded-t-3xl border-0 pb-safe"
              style={{
                background: "linear-gradient(180deg, hsl(224 29% 11%) 0%, hsl(220 25% 9%) 100%)",
              }}
            >
              <SheetHeader className="pb-3">
                <SheetTitle
                  className="text-sm font-semibold text-white"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  Navigatie
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-1">
                {sections.map((section) => (
                  <div key={section.label}>
                    <p
                      className="mb-1.5 px-1 text-[9px] font-semibold uppercase tracking-[0.24em] text-white/30"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {section.label}
                    </p>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const active = isActive(item.path);
                        return (
                          <button
                            key={item.path}
                            onPointerEnter={() => preloadAppRoute(item.path)}
                            onFocus={() => preloadAppRoute(item.path)}
                            onTouchStart={() => preloadAppRoute(item.path)}
                            onClick={() => {
                              setMoreOpen(false);
                              navigate(item.path);
                            }}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors",
                              "min-h-[52px]",
                              active ? "text-white" : "text-white/72",
                            )}
                            style={active ? {
                              background: "hsl(219 22% 17%)",
                              boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.18)",
                            } : {
                              background: "hsl(222 22% 12%)",
                            }}
                          >
                            <div
                              className="relative flex h-9 w-9 items-center justify-center rounded-xl"
                              style={active ? {
                                background: "hsl(var(--gold) / 0.18)",
                                color: "hsl(var(--gold-light))",
                              } : {
                                background: "hsl(220 20% 15%)",
                                color: "hsl(0 0% 100% / 0.72)",
                              }}
                            >
                              <item.icon className="h-4 w-4" strokeWidth={active ? 2 : 1.85} />
                              {item.path === "/exceptions" && showExceptionDot && (
                                <span
                                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
                                  style={{ background: "hsl(var(--gold-light))" }}
                                />
                              )}
                            </div>
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.label}</span>
                            {item.path === "/exceptions" && showExceptionCount && (
                              <span
                                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{
                                  background: exceptionBadgeValue >= 10 ? "hsl(8 82% 56%)" : "hsl(var(--gold) / 0.18)",
                                  color: exceptionBadgeValue >= 10 ? "white" : "hsl(var(--gold-light))",
                                }}
                              >
                                {Math.min(exceptionBadgeValue, 99)}
                              </span>
                            )}
                            <ChevronRight className="h-4 w-4 text-white/28" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}
