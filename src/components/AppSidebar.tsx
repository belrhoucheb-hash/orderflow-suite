import { LayoutDashboard, Inbox, Package, Building2, Truck, Map, Route, LogOut, Users, Settings, BarChart3, Receipt, Moon, Sun, Container, Shield, Send, Brain } from "lucide-react";
import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

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

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Inbox", url: "/inbox", icon: Inbox },
  { title: "Orders", url: "/orders", icon: Package },
  { title: "Klanten", url: "/klanten", icon: Building2 },
  { title: "Planbord", url: "/planning", icon: Truck },
  { title: "Dispatch", url: "/dispatch", icon: Send },
  { title: "Ritoverzicht", url: "/ritten", icon: Route },
  { title: "Chauffeurs", url: "/chauffeurs", icon: Users },
  { title: "Vloot", url: "/vloot", icon: Container },
  { title: "Rapportage", url: "/rapportage", icon: BarChart3 },
  { title: "Uitzonderingen", url: "/exceptions", icon: Shield },
  { title: "Autonomie", url: "/autonomie", icon: Brain },
  { title: "Facturatie", url: "/facturatie", icon: Receipt },
];

const adminItems = [
  { title: "Gebruikers", url: "/users", icon: Users },
  { title: "Instellingen", url: "/settings", icon: Settings },
];

function useExceptionCount() {
  return useQuery({
    queryKey: ["exception-count"],
    queryFn: async () => {
      // Count DRAFT orders with missing fields
      const { count: missingCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "DRAFT")
        .not("missing_fields", "eq", "{}");

      // Count DRAFT orders older than 3 hours (SLA risk)
      const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const { count: slaCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "DRAFT")
        .lt("created_at", threeHoursAgo);

      // Count IN_TRANSIT orders older than 24h (delays)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: delayCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "IN_TRANSIT")
        .lt("created_at", oneDayAgo);

      return (missingCount || 0) + (slaCount || 0) + (delayCount || 0);
    },
    refetchInterval: 60_000,
  });
}

// Chauffeur only sees the ChauffeurApp (separate route), so no main sidebar items
// Planner sees all mainItems; Admin sees mainItems + adminItems
const chauffeurItems = [
  { title: "Mijn Ritten", url: "/chauffeur", icon: Route },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, signOut, isAdmin, effectiveRole } = useAuth();
  const { tenant } = useTenant();
  const { data: exceptionCount = 0 } = useExceptionCount();

  const visibleMainItems = effectiveRole === "chauffeur" ? chauffeurItems : mainItems;

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
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/30 text-xs uppercase tracking-[0.15em] font-medium mb-1 px-3">
            Navigatie
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {visibleMainItems.map((item) => {
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
                        {item.title === "Uitzonderingen" && exceptionCount > 0 && !collapsed && (
                          <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none font-medium">
                            {exceptionCount}
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

        {isAdmin && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/30 text-xs uppercase tracking-[0.15em] font-medium mb-1 px-3">
              Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={active}>
                        <NavLink
                          to={item.url}
                          className={cn(
                            "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                            active
                              ? "bg-white/10 text-white before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-[3px] before:rounded-full before:bg-primary"
                              : "text-sidebar-foreground/60 hover:text-sidebar-foreground/90 hover:bg-white/5"
                          )}
                        >
                          <item.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2 : 1.5} />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
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
