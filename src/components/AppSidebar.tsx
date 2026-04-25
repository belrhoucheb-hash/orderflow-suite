import { LayoutDashboard, Inbox, Package, Building2, Truck, Route, LogOut, Users, Settings, BarChart3, Receipt, Moon, Sun, Container, Send, AlertTriangle, Activity } from "lucide-react";
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
  { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
  { titleKey: "nav.inbox", url: "/inbox", icon: Inbox },
  { titleKey: "nav.orders", url: "/orders", icon: Package },
  { titleKey: "nav.planning", url: "/planning", icon: Truck },
  { titleKey: "nav.dispatch", url: "/dispatch", icon: Send },
  { title: "Uitzonderingen", url: "/exceptions", icon: AlertTriangle },
];

const controlItemsDef = [
  { title: "Autonomie", url: "/autonomie", icon: Activity },
  { titleKey: "nav.invoicing", url: "/facturatie", icon: Receipt },
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
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { profile, user, signOut, isAdmin, effectiveRole } = useAuth();
  const { tenant } = useTenant();
  const { data: exceptionCount } = useExceptionCount();

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

  const renderNavGroup = (label: string, items: Array<{ title: string; url: string; icon: any }>) => (
    <SidebarGroup
      className="mt-4 first:mt-0 rounded-2xl border px-2.5 py-3"
      style={{
        borderColor: "hsl(var(--gold) / 0.14)",
        background: "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--gold-soft) / 0.1) 100%)",
        boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.04)",
      }}
    >
      <SidebarGroupLabel
        className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--gold-deep))]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-1">
          {items.map((item) => {
            const active = isActive(item.url);
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild isActive={active}>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    aria-label={item.title}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                      active
                        ? "text-foreground"
                        : "text-sidebar-foreground/68 hover:text-foreground"
                    )}
                    style={active ? {
                      background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.7) 0%, hsl(var(--gold-soft) / 0.18) 100%)",
                      boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.24), 0 8px 20px -16px hsl(var(--gold-deep) / 0.45)",
                    } : undefined}
                  >
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                      style={active ? {
                        background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)",
                        color: "white",
                        boxShadow: "0 8px 18px -12px hsl(var(--gold-deep) / 0.6)",
                      } : {
                        background: "hsl(var(--gold-soft) / 0.34)",
                        color: "hsl(var(--gold-deep))",
                      }}
                    >
                      <item.icon className="h-[16px] w-[16px]" strokeWidth={active ? 2.1 : 1.8} />
                    </span>
                    <span>{item.title}</span>
                    {item.url === "/exceptions" && exceptionBadgeValue > 0 && (
                      <span
                        className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          background: active ? "hsl(0 0% 100% / 0.94)" : "hsl(12 92% 58%)",
                          color: active ? "hsl(var(--gold-deep))" : "white",
                          boxShadow: active ? "0 0 0 1px hsl(var(--gold) / 0.18)" : "none",
                        }}
                      >
                        {Math.min(exceptionBadgeValue, 99)}
                      </span>
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
        { label: "Operatie", items: operationsItems },
        { label: "Controle", items: controlItems },
        { label: "Stamgegevens", items: masterDataItems },
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
        className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border px-4 py-4"
        style={{
          borderColor: "hsl(var(--gold) / 0.16)",
          background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.24) 0%, hsl(224 30% 12%) 100%)",
          boxShadow: "inset 0 1px 0 hsl(0 0% 100% / 0.04)",
        }}
      >
        <img 
          src={tenant?.logoUrl || defaultLogo} 
          alt={tenant?.name || "TMS"} 
          className="h-10 w-10 rounded-xl object-contain p-1.5"
          style={{
            background: "linear-gradient(135deg, hsl(var(--gold-soft) / 0.9), hsl(var(--gold-soft) / 0.3))",
            boxShadow: "inset 0 0 0 1px hsl(var(--gold) / 0.2)",
          }}
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0 pr-2">
            <span
              className="truncate text-sm font-semibold tracking-tight leading-tight text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {tenant?.name || DEFAULT_COMPANY.name}
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-[hsl(var(--gold-light))]">
              Autonomous TMS
            </span>
          </div>
        )}
      </div>

      <SidebarContent className="px-3 py-3">
        {visiblePrimaryGroups.map((group) => renderNavGroup(group.label, group.items))}

        {isAdmin && (
          renderNavGroup("Beheer", adminItems)
        )}

      </SidebarContent>

      <SidebarFooter
        className="mx-3 mb-3 rounded-2xl border px-4 py-4"
        style={{
          borderColor: "hsl(var(--gold) / 0.12)",
          background: "linear-gradient(180deg, hsl(var(--card) / 0.14) 0%, hsl(var(--gold-soft) / 0.08) 100%)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ background: "linear-gradient(180deg, hsl(var(--gold)) 0%, hsl(var(--gold-deep)) 100%)" }}
          >
            {(profile?.display_name || user?.email || "?").slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="truncate text-sm font-medium text-white/90">{profile?.display_name || "Gebruiker"}</span>
              <span className="truncate text-xs text-white/45">{user?.email}</span>
            </div>
          )}
          <button
            onClick={() => navigate("/settings")}
            className="shrink-0 rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white/80"
            aria-label="Instellingen"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="shrink-0 rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white/80"
            aria-label={isDark ? "Licht thema" : "Donker thema"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={async () => { await signOut(); navigate("/login"); }}
            className="shrink-0 rounded-md p-1.5 text-white/35 transition-colors hover:bg-white/5 hover:text-white/80"
            aria-label="Uitloggen"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
