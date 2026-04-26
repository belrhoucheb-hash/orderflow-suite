import { LayoutDashboard, Inbox, Package, Building2, Truck, Route, LogOut, Users, Settings, BarChart3, Receipt, Moon, Sun, Container, Send, AlertTriangle, Activity, ChevronDown } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import defaultLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";
import { useExceptionCount } from "@/hooks/useExceptionCount";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const operationsItemsDef = [
  { title: "Overzicht", url: "/", icon: LayoutDashboard },
  { titleKey: "nav.inbox", url: "/inbox", icon: Inbox },
  { titleKey: "nav.orders", url: "/orders", icon: Package },
  { titleKey: "nav.planning", url: "/planning", icon: Truck },
  { titleKey: "nav.dispatch", url: "/dispatch", icon: Send },
  { title: "Uitzonderingen", url: "/exceptions", icon: AlertTriangle },
];

const controlItemsDef = [
  { title: "Autonomie", url: "/autonomie", icon: Activity },
  { title: "Finance", url: "/facturatie", icon: Receipt },
  { titleKey: "nav.reporting", url: "/rapportage", icon: BarChart3 },
];

const masterDataItemsDef = [
  { titleKey: "nav.clients", url: "/klanten", icon: Building2 },
  { titleKey: "nav.drivers", url: "/chauffeurs", icon: Users },
  { titleKey: "nav.fleet", url: "/vloot", icon: Container },
];

const adminItemsDef = [
  { titleKey: "nav.users", url: "/users", icon: Users },
  { titleKey: "nav.settings", url: "/settings", icon: Settings },
];

const chauffeurItemsDef = [
  { titleKey: "nav.myTrips", url: "/chauffeur", icon: Route },
];

export function AppSidebar() {
  const groupStorageKey = "app-sidebar-collapsed-groups";
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { profile, user, signOut, isAdmin, effectiveRole } = useAuth();
  const { tenant } = useTenant();
  const { data: exceptionCount } = useExceptionCount();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    Controle: true,
    Netwerk: true,
    Beheer: true,
  });

  const toItems = (defs: Array<{ titleKey?: string; title?: string; titleFallback?: string; url: string; icon: any }>) =>
    defs.map((d: any) => {
      const translated = d.titleKey ? t(d.titleKey) : d.title;
      const title = d.title ?? (translated === d.titleKey && d.titleFallback ? d.titleFallback : translated);
      return { title, titleKey: d.titleKey, url: d.url, icon: d.icon };
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const operationsItems = useMemo(() => toItems(operationsItemsDef), [t, i18n.language]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const controlItems = useMemo(() => toItems(controlItemsDef), [t, i18n.language]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const masterDataItems = useMemo(() => toItems(masterDataItemsDef), [t, i18n.language]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const adminItems = useMemo(() => toItems(adminItemsDef), [t, i18n.language]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chauffeurItems = useMemo(() => toItems(chauffeurItemsDef), [t, i18n.language]);

  const exceptionBadgeValue = exceptionCount?.total ?? 0;
  const showExceptionCount = exceptionBadgeValue >= 4;
  const showExceptionDot = exceptionBadgeValue > 0 && !showExceptionCount;

  useEffect(() => {
    const savedGroups = localStorage.getItem(groupStorageKey);
    if (!savedGroups) return;

    try {
      const parsed = JSON.parse(savedGroups) as Record<string, boolean>;
      setCollapsedGroups((current) => ({ ...current, ...parsed }));
    } catch {
      localStorage.removeItem(groupStorageKey);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(groupStorageKey, JSON.stringify(collapsedGroups));
  }, [collapsedGroups]);

  const toggleGroup = (label: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [label]: !current[label],
    }));
  };

  const getExceptionBadgeTone = () => {
    if (exceptionBadgeValue >= 10) {
      return {
        background: "hsl(8 82% 56%)",
        color: "white",
        boxShadow: "0 0 0 1px hsl(8 82% 62% / 0.25)",
      };
    }

    return {
      background: "hsl(var(--gold) / 0.18)",
      color: "hsl(var(--gold-light))",
      boxShadow: "0 0 0 1px hsl(var(--gold) / 0.2)",
    };
  };

  const renderNavGroup = (
    label: string,
    items: Array<{ title: string; url: string; icon: any }>,
    collapsible: boolean = false,
  ) => (
    <SidebarGroup className="mt-3 first:mt-0 px-1.5 py-0">
      <SidebarGroupLabel asChild>
        <button
          type="button"
          className={cn(
            "mb-1.5 flex h-auto w-full items-center px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.24em] outline-none transition-colors",
            collapsible ? "hover:text-white/58" : "cursor-default",
            collapsedGroups[label] ? "text-white/32" : "text-white/44",
          )}
          style={{ fontFamily: "var(--font-display)" }}
          onClick={collapsible ? () => toggleGroup(label) : undefined}
        >
          <span>{label}</span>
          {collapsible && (
            <ChevronDown
              className={cn("ml-auto h-3.5 w-3.5 transition-transform", !collapsedGroups[label] && "rotate-180")}
              strokeWidth={1.7}
            />
          )}
        </button>
      </SidebarGroupLabel>
      <SidebarGroupContent className={cn(collapsible && collapsedGroups[label] && "hidden")}>
        <SidebarMenu className="space-y-0.5">
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="hover:bg-transparent active:bg-transparent data-[active=true]:bg-transparent"
                >
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    aria-label={item.title}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-all duration-150",
                      active
                        ? "text-white"
                        : "text-white/68 hover:text-white"
                    )}
                    style={active ? {
                      background: "hsl(219 22% 17%)",
                      boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.22)",
                    } : {
                      background: "transparent",
                    }}
                    onMouseEnter={(event) => {
                      if (!active) {
                        event.currentTarget.style.background = "hsl(220 20% 14%)";
                      }
                    }}
                    onMouseLeave={(event) => {
                      if (!active) {
                        event.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors"
                      style={active ? {
                        background: "hsl(var(--gold) / 0.18)",
                        color: "white",
                      } : {
                        background: "transparent",
                        color: "hsl(0 0% 100% / 0.72)",
                      }}
                    >
                      <item.icon className="h-[15px] w-[15px]" strokeWidth={active ? 2 : 1.85} />
                    </span>
                    <span className="truncate">{item.title}</span>
                    {item.url === "/exceptions" && showExceptionCount && (
                      <span
                        className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={active ? {
                          background: "hsl(var(--gold) / 0.22)",
                          color: "white",
                          boxShadow: "0 0 0 1px hsl(var(--gold) / 0.24)",
                        } : getExceptionBadgeTone()}
                      >
                        {Math.min(exceptionBadgeValue, 99)}
                      </span>
                    )}
                    {item.url === "/exceptions" && showExceptionDot && (
                      <span
                        className="ml-auto h-2 w-2 rounded-full"
                        style={{ background: "hsl(var(--gold-light))", boxShadow: "0 0 0 3px hsl(var(--gold) / 0.08)" }}
                      />
                    )}
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const visiblePrimaryGroups = effectiveRole === "chauffeur"
    ? [{ label: t("nav.navigation"), items: chauffeurItems }]
    : [
        { label: "Operatie", items: operationsItems, collapsible: false },
        { label: "Controle", items: controlItems, collapsible: true },
        { label: "Netwerk", items: masterDataItems, collapsible: true },
      ];

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };
  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") { document.documentElement.classList.add("dark"); setIsDark(true); }
    else if (saved === "light") { document.documentElement.classList.remove("dark"); setIsDark(false); }
  }, []);

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  const displayName = profile?.display_name || "Gebruiker";
  const userEmail = user?.email || "";
  const initials = (profile?.display_name || user?.email || "?").slice(0, 2).toUpperCase();

  return (
    <Sidebar
      collapsible="icon"
      className="border-r-0"
      style={{
        background: "linear-gradient(180deg, hsl(224 29% 11%) 0%, hsl(220 25% 9%) 100%)",
        color: "hsl(45 44% 96%)",
      }}
    >
      <div
        className="mx-3 mt-2.5 flex items-center gap-2.5 rounded-2xl border px-3 py-2.5"
        style={{
          borderColor: "hsl(218 24% 18%)",
          background: "hsl(222 24% 12%)",
        }}
      >
        <img 
          src={tenant?.logoUrl || defaultLogo} 
          alt={tenant?.name || "TMS"} 
          className="h-8 w-8 rounded-xl object-contain p-1"
          style={{
            background: "hsl(219 22% 16%)",
            boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.18)",
          }}
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0 pr-2">
            <span
              className="truncate text-[14px] font-semibold tracking-tight leading-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {tenant?.name || DEFAULT_COMPANY.name}
            </span>
            <span className="text-[8px] uppercase tracking-[0.24em] text-white/30">
              Autonomous TMS
            </span>
          </div>
        )}
      </div>

      <SidebarContent className="px-3 py-2">
        {visiblePrimaryGroups.map((group) => renderNavGroup(group.label, group.items, group.collapsible))}

        {isAdmin && (
          renderNavGroup("Beheer", adminItems, true)
        )}

      </SidebarContent>

      <SidebarFooter
        className="mx-3 mb-3 px-1 py-2"
      >
        <div className={cn("space-y-2.5", collapsed && "space-y-2")}>
          <div
            className={cn(
              "flex items-center gap-3 rounded-2xl px-2 py-2.5",
              collapsed && "justify-center px-1.5",
            )}
            style={{
              background: "linear-gradient(180deg, hsl(220 18% 14%) 0%, hsl(220 18% 12%) 100%)",
              boxShadow: "inset 0 0 0 1px hsl(0 0% 100% / 0.04)",
            }}
          >
            <div
              className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[11px] font-semibold text-white"
              style={{
                background: "linear-gradient(135deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                boxShadow: "0 10px 24px -16px hsl(var(--gold) / 0.7), inset 0 1px 0 hsl(0 0% 100% / 0.18)",
              }}
            >
              {initials}
              <span
                className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-[hsl(222_24%_12%)]"
                style={{ background: "hsl(142 66% 46%)" }}
                aria-hidden="true"
              />
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold tracking-tight text-white">{displayName}</span>
                <p className="truncate text-[11px] text-white/42">{userEmail}</p>
              </div>
            )}
          </div>

          {!collapsed && (
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => navigate("/settings")}
                className="group inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10.5px] font-medium text-white/68 transition-all hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-white"
                aria-label="Instellingen"
              >
                <Settings className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Instellingen</span>
              </button>

              <button
                onClick={toggleTheme}
                className="group inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10.5px] font-medium transition-all hover:bg-[hsl(var(--gold-soft)/0.12)] hover:text-white"
                style={{
                  color: isDark ? "hsl(var(--gold-light))" : "hsl(0 0% 100% / 0.7)",
                  background: isDark ? "hsl(var(--gold-soft) / 0.14)" : "transparent",
                }}
                aria-label={isDark ? "Licht thema" : "Donker thema"}
              >
                {isDark ? <Sun className="h-3.5 w-3.5 shrink-0" /> : <Moon className="h-3.5 w-3.5 shrink-0" />}
                <span className="truncate">{isDark ? "Licht" : "Dark mode"}</span>
              </button>

              <button
                onClick={async () => { await signOut(); navigate("/login"); }}
                className="group inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 text-[10.5px] font-medium text-white/56 transition-all hover:bg-[hsl(0_84%_65%/0.1)] hover:text-white"
                aria-label="Uitloggen"
              >
                <LogOut className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Uitloggen</span>
              </button>
            </div>
          )}

          {collapsed && (
            <div className="flex flex-col items-center gap-1.5">
              <button
                onClick={() => navigate("/settings")}
                className="grid h-9 w-9 place-items-center rounded-xl border text-white/62 transition-all hover:border-[hsl(var(--gold)/0.2)] hover:bg-white/5 hover:text-white"
                style={{ borderColor: "hsl(0 0% 100% / 0.05)" }}
                aria-label="Instellingen"
              >
                <Settings className="h-4 w-4" />
              </button>
              <button
                onClick={toggleTheme}
                className="grid h-9 w-9 place-items-center rounded-xl border text-white/62 transition-all hover:border-[hsl(var(--gold)/0.2)] hover:bg-white/5 hover:text-white"
                style={{ borderColor: "hsl(0 0% 100% / 0.05)" }}
                aria-label={isDark ? "Licht thema" : "Donker thema"}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={async () => { await signOut(); navigate("/login"); }}
                className="grid h-9 w-9 place-items-center rounded-xl border text-white/62 transition-all hover:border-[hsl(0_84%_65%/0.18)] hover:bg-white/5 hover:text-white"
                style={{ borderColor: "hsl(0 0% 100% / 0.05)" }}
                aria-label="Uitloggen"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
