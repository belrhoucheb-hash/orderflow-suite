import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_COMPANY } from "@/lib/companyConfig";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string;
}

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

// Helper to convert HEX to HSL for Tailwind CSS variables
function hexToHSL(hex: string): string {
  // Remove # if present
  let h = hex.replace("#", "");
  
  // Parse hex values
  let r = parseInt(h.substring(0, 2), 16) / 255;
  let g = parseInt(h.substring(2, 4), 16) / 255;
  let b = parseInt(h.substring(4, 6), 16) / 255;

  let max = Math.max(r, g, b);
  let min = Math.min(r, g, b);
  let h_val = 0, s_val = 0, l_val = (max + min) / 2;

  if (max !== min) {
    let d = max - min;
    s_val = l_val > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h_val = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h_val = (b - r) / d + 2; break;
      case b: h_val = (r - g) / d + 4; break;
    }
    h_val /= 6;
  }

  return `${(h_val * 360).toFixed(1)} ${(s_val * 100).toFixed(1)}% ${(l_val * 100).toFixed(1)}%`;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const refresh = useCallback(async () => {
    setRefreshCounter((c) => c + 1);
  }, []);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    async function resolveTenant() {
      // If auth is still loading, wait
      if (authLoading) return;
      
      setLoading(true);
      
      try {
        let tenantId = user?.app_metadata?.tenant_id as string | undefined;
        let tenantData: Tenant | null = null;
        
        // 1. Logged in user with explicit tenant mapping
        if (tenantId) {
          const { data: rawData, error } = await supabase
            .from('tenants' as any)
            .select('*')
            .eq('id', tenantId)
            .single();
            
          const data = rawData as any;
          if (data && !error) {
            tenantData = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              logoUrl: data.logo_url,
              primaryColor: data.primary_color || '#dc2626'
            };
          }
        } 
        // 2. Not logged in, or no tenant assigned: resolve via subdomain
        else {
          const hostname = window.location.hostname;
          const slug = hostname.split('.')[0];
          
          let query = supabase.from('tenants' as any).select('*');
          
          if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
            query = query.eq('slug', slug);
          }
          
          const { data: rawData, error } = await query.limit(1).maybeSingle();
          const data = rawData as any;
          if (data && !error) {
            tenantData = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              logoUrl: data.logo_url,
              primaryColor: data.primary_color || '#dc2626'
            };
          }
        }
        
        // 3. Ultimate Fallback for Development: Just grab ANY active tenant if we STILL have no tenant
        if (!tenantData) {
          if (!import.meta.env.DEV || !isLocalDevHost()) {
            console.warn("Could not accurately resolve tenant via JWT or Hostname. Falling back to first available tenant.");
          }
          const { data: rawData } = await supabase.from('tenants' as any).select('*').limit(1).maybeSingle();
          const data = rawData as any;
          if (data) {
            tenantData = {
              id: data.id,
              name: data.name,
              slug: data.slug,
              logoUrl: data.logo_url,
              primaryColor: data.primary_color || '#dc2626'
            };
          } else {
             tenantData = {
               id: "00000000-0000-0000-0000-000000000001",
               name: DEFAULT_COMPANY.name,
               slug: "localhost-dev",
               logoUrl: null,
               primaryColor: "#dc2626"
             };
          }
        }
        
        setTenant(tenantData);
      } catch (err) {
        console.error("Failed to load tenant", err);
      } finally {
        setLoading(false);
      }
    }
    
    resolveTenant();
  }, [user, authLoading, refreshCounter]);

  // Inject dynamic CSS properties
  useEffect(() => {
    if (tenant?.primaryColor) {
      const hsl = hexToHSL(tenant.primaryColor);
      document.documentElement.style.setProperty('--primary', hsl);
      // Ensure we have a contrasting foreground for buttons, usually white (0 0% 100%)
      document.documentElement.style.setProperty('--primary-foreground', '0 0% 100%');
    } else {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--primary-foreground');
    }
  }, [tenant]);

  return (
    <TenantContext.Provider value={{ tenant, loading, refresh }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (ctx === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
}

/**
 * Soft variant: geeft `null` terug wanneer geen TenantProvider beschikbaar is
 * (bijv. in unit tests met een bare QueryClient wrapper). Gebruiken in hooks
 * die gracefully moeten kunnen werken zonder tenant-context.
 */
export function useTenantOptional(): { tenant: { id: string } | null } {
  const ctx = useContext(TenantContext);
  if (ctx === undefined) return { tenant: null };
  return { tenant: ctx.tenant ? { id: ctx.tenant.id } : null };
}
