import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantInsert } from "@/hooks/useTenantInsert";

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  country: string;
  kvk_number: string | null;
  btw_number: string | null;
  payment_terms: number | null;
  is_active: boolean;
  created_at: string;
  active_order_count?: number;

  street: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  lat: number | null;
  lng: number | null;
  coords_manual: boolean;

  billing_email: string | null;
  billing_same_as_main: boolean;
  billing_address: string | null;
  billing_zipcode: string | null;
  billing_city: string | null;
  billing_country: string | null;
  billing_street: string | null;
  billing_house_number: string | null;
  billing_house_number_suffix: string | null;
  billing_lat: number | null;
  billing_lng: number | null;
  billing_coords_manual: boolean;

  shipping_same_as_main: boolean;
  shipping_address: string | null;
  shipping_zipcode: string | null;
  shipping_city: string | null;
  shipping_country: string | null;
  shipping_street: string | null;
  shipping_house_number: string | null;
  shipping_house_number_suffix: string | null;
  shipping_lat: number | null;
  shipping_lng: number | null;
  shipping_coords_manual: boolean;

  notes: string | null;
}

export interface ClientLocation {
  id: string;
  client_id: string;
  label: string;
  address: string;
  zipcode: string | null;
  city: string | null;
  country: string | null;
  location_type: string;
  time_window_start: string | null;
  time_window_end: string | null;
  max_vehicle_length: string | null;
  notes: string | null;
  created_at: string;

  street: string | null;
  house_number: string | null;
  house_number_suffix: string | null;
  lat: number | null;
  lng: number | null;
  coords_manual: boolean;
}

export interface ClientRate {
  id: string;
  client_id: string;
  rate_type: string;
  description: string | null;
  amount: number;
  currency: string | null;
  is_active: boolean;
  created_at: string;
}

export function useClients(search?: string) {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["clients", search, tenant?.id],
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      // 8.10 – Single query: fetch clients and active order counts in parallel
      // instead of N+1 (one query per client). We fire both requests at once
      // and join the results in memory by client name.
      //
      // Explicitly filter by tenant_id to help Postgres use the right index
      // and to ensure we get all tenant clients even if RLS relies on
      // current_tenant_id() which may return NULL for dev users.
      let clientQuery = supabase
        .from("clients")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("name")
        .limit(200);

      if (search) {
        clientQuery = clientQuery.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const [clientsResult, countsResult] = await Promise.all([
        clientQuery,
        supabase
          .from("orders")
          .select("client_name")
          .not("status", "in", '("DELIVERED","CANCELLED")'),
      ]);

      if (clientsResult.error) throw clientsResult.error;

      const countMap: Record<string, number> = {};
      countsResult.data?.forEach((o) => {
        const name = o.client_name?.toLowerCase();
        if (name) countMap[name] = (countMap[name] || 0) + 1;
      });

      return (clientsResult.data as Client[]).map((c) => ({
        ...c,
        active_order_count: countMap[c.name.toLowerCase()] || 0,
      }));
    },
  });
}

export function useClientLocations(clientId: string | null) {
  return useQuery({
    queryKey: ["client_locations", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_locations")
        .select("*")
        .eq("client_id", clientId!)
        .order("label");
      if (error) throw error;
      return data as ClientLocation[];
    },
  });
}

export function useClientRates(clientId: string | null) {
  return useQuery({
    queryKey: ["client_rates", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_rates")
        .select("*")
        .eq("client_id", clientId!)
        .order("rate_type");
      if (error) throw error;
      return data as ClientRate[];
    },
  });
}

export function useClientOrders(clientName: string | null) {
  return useQuery({
    queryKey: ["client_orders", clientName],
    enabled: !!clientName,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .ilike("client_name", `%${clientName}%`)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  const clientsInsert = useTenantInsert("clients");
  return useMutation({
    mutationFn: async (client: Partial<Client>) => {
      const { data, error } = await clientsInsert
        .insert({ name: client.name!, ...client })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useCreateClientLocation() {
  const qc = useQueryClient();
  const locationsInsert = useTenantInsert("client_locations");
  return useMutation({
    mutationFn: async (
      input: Omit<ClientLocation, "id" | "created_at"> & { tenant_id?: string },
    ) => {
      const { data, error } = await locationsInsert
        .insert({ ...input })
        .select()
        .single();
      if (error) throw error;
      return data as ClientLocation;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: ["client_locations", row.client_id] }),
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Client> & { id: string }) => {
      const { data, error } = await supabase
        .from("clients")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}
