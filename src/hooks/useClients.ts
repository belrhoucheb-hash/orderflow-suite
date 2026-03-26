import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery({
    queryKey: ["clients", search],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*")
        .order("name");

      if (search) {
        query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Get active order counts per client
      const { data: orderCounts } = await supabase
        .from("orders")
        .select("client_name")
        .not("status", "in", '("DELIVERED","CANCELLED")');

      const countMap: Record<string, number> = {};
      orderCounts?.forEach((o) => {
        const name = o.client_name?.toLowerCase();
        if (name) countMap[name] = (countMap[name] || 0) + 1;
      });

      return (data as Client[]).map((c) => ({
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
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .ilike("client_name", clientName || "")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (client: Partial<Client>) => {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: client.name!, ...client } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}
