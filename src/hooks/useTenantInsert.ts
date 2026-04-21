import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

/**
 * Helper rond `supabase.from(table).insert(...)` en `.upsert(...)`
 * die automatisch `tenant_id` meestuurt vanuit de actieve tenant.
 *
 * Waarom: eerder leverde een vergeten tenant_id een stille RLS-blokkade op
 * (rij werd nooit zichtbaar, geen foutmelding in de UI). Deze helper
 * centraliseert de injectie, zodat geen enkele tenant-scoped insert deze
 * stap kan missen en elke hook dezelfde foutmelding geeft als er geen
 * tenant actief is.
 *
 * Het resultaat van `insert` / `upsert` is een Supabase query builder,
 * zodat de caller `.select().single()` of andere chains zelf kan afmaken.
 */
export function useTenantInsert(table: string) {
  const { tenant } = useTenant();

  function requireTenantId(): string {
    if (!tenant?.id) {
      throw new Error("Geen actieve tenant, log opnieuw in");
    }
    return tenant.id;
  }

  function withTenantId<T extends Record<string, unknown>>(payload: T): T & { tenant_id: string } {
    return { ...payload, tenant_id: requireTenantId() };
  }

  return {
    /**
     * Insert één rij of een array van rijen, met `tenant_id` automatisch
     * toegevoegd. Retourneert de onderliggende Supabase query builder,
     * zodat je er `.select().single()` op kunt chainen.
     */
    insert<T extends Record<string, unknown>>(payload: T | T[]) {
      const withTenant = Array.isArray(payload)
        ? payload.map((row) => withTenantId(row))
        : withTenantId(payload);
      return supabase.from(table as any).insert(withTenant as any);
    },

    /**
     * Upsert één rij of een array van rijen, met `tenant_id` automatisch
     * toegevoegd. Retourneert de onderliggende Supabase query builder.
     */
    upsert<T extends Record<string, unknown>>(
      payload: T | T[],
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) {
      const withTenant = Array.isArray(payload)
        ? payload.map((row) => withTenantId(row))
        : withTenantId(payload);
      return supabase.from(table as any).upsert(withTenant as any, options);
    },
  };
}
