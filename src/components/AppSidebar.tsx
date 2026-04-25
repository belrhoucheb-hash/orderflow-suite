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

  const renderNavGroup = (label: string, items: Array<{ title: string; url: string; icon: any }>) => (
    <SidebarGroup className="mt-4 first:mt-0">
      <SidebarGroupLabel className="text-sidebar-foreground/30 text-xs uppercase tracking-[0.15em] font-medium mb-1 px-3">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="space-y-0.5">
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
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                      active
                        ? "bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-full before:bg-primary"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90 hover:bg-white/5"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.5} />
                    <span>{item.title}</span>
                    {item.url === "/exceptions" && (exceptionCount?.total ?? 0) > 0 && (
                      <span className="ml-auto rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {Math.min(exceptionCount?.total ?? 0, 99)}
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
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="flex items-center gap-3 px-5 py-6">
        <img 
          src={tenant?.logoUrl || defaultLogo} 
          alt={tenant?.name || "TMS"} 
          className="h-9 w-9 rounded-lg object-contain bg-white/10 p-1" 
        />
        {!collapsed && (
          <div className="flex flex-col min-w-0 pr-2">
            <span className="text-sm font-semibold text-white tracking-tight leading-tight truncate">
              {tenant?.name || DEFAULT_COMPANY.name}
            </span>
            <span className="text-xs text-white/50 font-light uppercase tracking-wider">
              TMS Platform
            </span>
          </div>
        )}
      </div>

      <SidebarContent className="px-3">
        {visiblePrimaryGroups.map((group) => renderNavGroup(group.label, group.items))}

        {isAdmin && (
          renderNavGroup("Beheer", adminItems)
        )}

      </SidebarContent>

      <SidebarFooter className="border-t border-white/5 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-xs font-semibold text-white shrink-0">
            {(profile?.display_name || user?.email || "?").slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-sm font-medium text-white/90 truncate">{profile?.display_name || "Gebruiker"}</span>
              <span className="text-xs text-sidebar-foreground/40 truncate">{user?.email}</span>
            </div>
          )}
          <button
            onClick={() => navigate("/settings")}
            className="shrink-0 p-1.5 rounded-md text-sidebar-foreground/30 hover:text-white/70 hover:bg-white/5 transition-colors"
            aria-label="Instellingen"
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={toggleTheme}
            className="shrink-0 p-1.5 rounded-md text-sidebar-foreground/30 hover:text-white/70 hover:bg-white/5 transition-colors"
            aria-label={isDark ? "Licht thema" : "Donker thema"}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            onClick={async () => { await signOut(); navigate("/login"); }}
            className="shrink-0 p-1.5 rounded-md text-sidebar-foreground/30 hover:text-white/70 hover:bg-white/5 transition-colors"
            aria-label="Uitloggen"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
