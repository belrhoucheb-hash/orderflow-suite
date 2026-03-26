import { LayoutDashboard, Inbox, Package, Building2, Truck, Map, Route, LogOut, Users } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import logo from "@/assets/logo.png";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";

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
  { title: "Transportplanning", url: "/planning", icon: Truck },
  { title: "Routekaart", url: "/routes", icon: Map },
  { title: "Chauffeurs Rit", url: "/ritten", icon: Route },
];

const adminItems = [
  { title: "Gebruikers", url: "/users", icon: Users },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, signOut, isAdmin } = useAuth();

  const isActive = (url: string) => {
    if (url === "/") return location.pathname === "/";
    return location.pathname.startsWith(url);
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src={logo} alt="Royalty Cargo Solutions" className="h-9 w-9 rounded-lg object-contain bg-sidebar-accent" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-white tracking-tight leading-tight">Royalty Cargo</span>
            <span className="text-[11px] text-sidebar-foreground/50 font-light">Solutions</span>
          </div>
        )}
      </div>

      <SidebarContent className="px-3">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/30 text-[10px] uppercase tracking-[0.15em] font-medium mb-1 px-3">
            Navigatie
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {mainItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={active}>
                      <NavLink
                        to={item.url}
                        end={item.url === "/"}
                        className={cn(
                          "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
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

        {isAdmin && (
          <SidebarGroup className="mt-4">
            <SidebarGroupLabel className="text-sidebar-foreground/30 text-[10px] uppercase tracking-[0.15em] font-medium mb-1 px-3">
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
                            "relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
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
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-[11px] font-semibold text-white">
            {(profile?.display_name || user?.email || "?").slice(0, 2).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex flex-col flex-1 min-w-0">
              <span className="text-[12px] font-medium text-white/90 truncate">{profile?.display_name || "Gebruiker"}</span>
              <span className="text-[10px] text-sidebar-foreground/40">{user?.email}</span>
            </div>
          )}
          {!collapsed && (
            <LogOut
              className="h-4 w-4 text-sidebar-foreground/30 cursor-pointer hover:text-white/70 transition-colors"
              onClick={async () => { await signOut(); navigate("/login"); }}
            />
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
