import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export interface Department {
  id: string;
  code: string;
  name: string;
  color: string | null;
}

export const departmentsQueryKey = (tenantId: string) => ["departments", tenantId] as const;

async function fetchDepartments(tenantId: string): Promise<Department[]> {
  const { data, error } = await (supabase as any)
    .from("departments")
    .select("id, code, name, color")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((d: any) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    color: d.color ?? null,
  })) as Department[];
}

/**
 * Shared cache fetcher. useOrders / useShipments gebruiken deze i.p.v. elke
 * keer een eigen `departments`-query. Binnen de staleTime wordt het uit
 * de React Query cache geserveerd — geen netwerkcall.
 */
export function fetchDepartmentsCached(client: QueryClient, tenantId: string) {
  return client.fetchQuery({
    queryKey: departmentsQueryKey(tenantId),
    queryFn: () => fetchDepartments(tenantId),
    staleTime: 60_000,
  });
}

export function useDepartments() {
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: departmentsQueryKey(tenant?.id ?? ""),
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: () => fetchDepartments(tenant!.id),
  });
}
