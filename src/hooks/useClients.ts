import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useTenantInsert } from "@/hooks/useTenantInsert";

export const DORMANT_THRESHOLD_DAYS = 90;

export interface Client {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  primary_contact_id: string | null;
  address: string | null;
  zipcode: string | null;
  city: string | null;
  country: string;
  kvk_number: string | null;
  btw_number: string | null;
  debtor_number: string | null;
  payment_terms: number | null;
  is_active: boolean;
  created_at: string;
  active_order_count?: number;
  last_order_at?: string | null;
  is_dormant?: boolean;

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

// Expliciete kolomlijst — houdt de response klein en maakt het duidelijk welke
// velden de klanten-tab echt nodig heeft. Bij schema-wijzigingen moet deze
// bewust mee-evolueren, wat drift tussen UI en DB zichtbaarder maakt dan een
// `select('*')` ooit kan.
const CLIENT_LIST_COLUMNS = [
  "id", "name", "contact_person", "email", "phone", "primary_contact_id",
  "address", "zipcode", "city", "country", "kvk_number", "btw_number",
  "payment_terms", "is_active", "created_at", "notes",
  "street", "house_number", "house_number_suffix", "lat", "lng", "coords_manual",
  "billing_email", "billing_same_as_main",
  "billing_address", "billing_zipcode", "billing_city", "billing_country",
  "billing_street", "billing_house_number", "billing_house_number_suffix",
  "billing_lat", "billing_lng", "billing_coords_manual",
  "shipping_same_as_main",
  "shipping_address", "shipping_zipcode", "shipping_city", "shipping_country",
  "shipping_street", "shipping_house_number", "shipping_house_number_suffix",
  "shipping_lat", "shipping_lng", "shipping_coords_manual",
].join(",");

export function useClients(search?: string) {
  // Lichte klanten-fetch voor autocomplete/dropdowns (NewOrder, Facturatie).
  // Geeft een platte array terug. Voor paginering/sortering/filters in de
  // klanten-tab zelf → zie useClientsList.
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ["clients", search, tenant?.id],
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select(CLIENT_LIST_COLUMNS)
        .eq("tenant_id", tenant!.id)
        .order("name")
        .limit(200);
      if (search) {
        const term = search.trim();
        if (term) {
          q = q.or(
            [
              `name.ilike.%${term}%`,
              `email.ilike.%${term}%`,
              `contact_person.ilike.%${term}%`,
              `kvk_number.ilike.%${term}%`,
              `phone.ilike.%${term}%`,
              `city.ilike.%${term}%`,
            ].join(","),
          );
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return ((data as unknown) as Client[]);
    },
  });
}

export type ClientSortKey = "name" | "contact_person" | "email";

export interface UseClientsListOptions {
  search?: string;
  page?: number;
  pageSize?: number;
  isActive?: boolean | null;
  country?: string | null;
  sortKey?: ClientSortKey;
  sortDir?: "asc" | "desc";
  /**
   * Wanneer true: alleen klanten zonder order in de afgelopen
   * DORMANT_THRESHOLD_DAYS dagen. Server-side doorgevoerd via een
   * `NOT IN`-filter op client_ids met recente orders, zodat `totalCount`
   * en `pageSize` kloppen op de gefilterde set.
   */
  dormantOnly?: boolean;
}

export interface UseClientsListResult {
  clients: Client[];
  totalCount: number;
}

export function useClientsList(opts: UseClientsListOptions = {}) {
  const {
    search,
    page = 0,
    pageSize = 50,
    isActive = null,
    country = null,
    sortKey = "name",
    sortDir = "asc",
    dormantOnly = false,
  } = opts;
  const { tenant } = useTenant();

  return useQuery<UseClientsListResult>({
    queryKey: [
      "clients_list",
      { search, page, pageSize, isActive, country, sortKey, sortDir, dormantOnly, tenantId: tenant?.id },
    ],
    staleTime: 60_000,
    enabled: !!tenant?.id,
    queryFn: async () => {
      // Server-side paginering + filters + sortering. active_order_count
      // en last_order_at worden client-side gejoined via de twee orders-
      // queries hieronder. Zonder view/rpc is dat nog steeds een paar
      // extra queries, maar de clients-query haalt alleen de ~50 rijen
      // van de huidige pagina op.
      const dormantThresholdIso = new Date(
        Date.now() - DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Stap 1 (alleen bij dormantOnly): verzamel client_ids die in de
      // laatste 90 dagen een order hadden. Die set excluden we server-side
      // via `.not('id','in',...)` zodat paginering over de slapende-set
      // consistent blijft.
      let dormantExcludeIds: string[] | null = null;
      if (dormantOnly) {
        const recentResult = await supabase
          .from("orders")
          .select("client_id")
          .eq("tenant_id", tenant!.id)
          .gte("created_at", dormantThresholdIso)
          .not("client_id", "is", null);
        if (recentResult.error) throw recentResult.error;
        const set = new Set<string>();
        recentResult.data?.forEach((o) => {
          const id = (o as { client_id: string | null }).client_id;
          if (id) set.add(id);
        });
        dormantExcludeIds = Array.from(set);
      }

      let clientQuery = supabase
        .from("clients")
        .select(CLIENT_LIST_COLUMNS, { count: "exact" })
        .eq("tenant_id", tenant!.id)
        .order(sortKey, { ascending: sortDir === "asc" })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (isActive !== null) {
        clientQuery = clientQuery.eq("is_active", isActive);
      }
      if (country) {
        clientQuery = clientQuery.eq("country", country);
      }

      if (dormantExcludeIds && dormantExcludeIds.length > 0) {
        // PostgREST `in`-filter serialiseert uuids zonder quotes:
        // `(uuid1,uuid2,...)`. Lege set kan NIET als `in.()` meegestuurd,
        // dus we slaan de clause dan over.
        const list = dormantExcludeIds.join(",");
        clientQuery = clientQuery.not("id", "in", `(${list})`);
      }

      if (search) {
        const term = search.trim();
        if (term) {
          clientQuery = clientQuery.or(
            [
              `name.ilike.%${term}%`,
              `email.ilike.%${term}%`,
              `contact_person.ilike.%${term}%`,
              `kvk_number.ilike.%${term}%`,
              `phone.ilike.%${term}%`,
              `city.ilike.%${term}%`,
            ].join(","),
          );
        }
      }

      const [clientsResult, countsResult, lastOrdersResult] = await Promise.all([
        clientQuery,
        supabase
          .from("orders")
          .select("client_id")
          .eq("tenant_id", tenant!.id)
          .not("status", "in", '("DELIVERED","CANCELLED")')
          .not("client_id", "is", null),
        supabase
          .from("orders")
          .select("client_id, created_at")
          .eq("tenant_id", tenant!.id)
          .not("client_id", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      if (clientsResult.error) throw clientsResult.error;

      const countMap: Record<string, number> = {};
      countsResult.data?.forEach((o) => {
        const id = (o as { client_id: string | null }).client_id;
        if (id) countMap[id] = (countMap[id] || 0) + 1;
      });

      // `lastOrdersResult` is gesorteerd op created_at DESC, dus de eerste
      // rij per client_id is tegelijk de meest recente.
      const lastOrderMap: Record<string, string> = {};
      lastOrdersResult.data?.forEach((o) => {
        const row = o as { client_id: string | null; created_at: string | null };
        if (!row.client_id || !row.created_at) return;
        if (!lastOrderMap[row.client_id]) lastOrderMap[row.client_id] = row.created_at;
      });

      const dormantSince = new Date(dormantThresholdIso);
      const clients = ((clientsResult.data as unknown) as Client[]).map((c) => {
        const lastOrderAt = lastOrderMap[c.id] ?? null;
        const isDormant = !lastOrderAt || new Date(lastOrderAt) < dormantSince;
        return {
          ...c,
          active_order_count: countMap[c.id] || 0,
          last_order_at: lastOrderAt,
          is_dormant: isDormant,
        };
      });

      return { clients, totalCount: clientsResult.count ?? clients.length };
    },
  });
}

export interface ClientStats {
  total: number;
  active: number;
  inactive: number;
  dormant: number;
}

/**
 * KPI-strip voor de klantenlijst: totale klant-aantallen en slapende-
 * klant-telling voor de hele tenant, los van de huidige paginering of
 * filters. Slapend = actieve klant zonder order in de laatste
 * DORMANT_THRESHOLD_DAYS dagen (inclusief klanten die nog nooit een
 * order hebben gehad).
 */
export function useClientStats() {
  const { tenant } = useTenant();
  return useQuery<ClientStats>({
    queryKey: ["client_stats", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const dormantThresholdIso = new Date(
        Date.now() - DORMANT_THRESHOLD_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const [clientsResult, recentResult] = await Promise.all([
        supabase
          .from("clients")
          .select("id, is_active")
          .eq("tenant_id", tenant!.id),
        supabase
          .from("orders")
          .select("client_id")
          .eq("tenant_id", tenant!.id)
          .gte("created_at", dormantThresholdIso)
          .not("client_id", "is", null),
      ]);

      if (clientsResult.error) throw clientsResult.error;
      if (recentResult.error) throw recentResult.error;

      const recentSet = new Set<string>();
      recentResult.data?.forEach((o) => {
        const id = (o as { client_id: string | null }).client_id;
        if (id) recentSet.add(id);
      });

      const rows = (clientsResult.data ?? []) as Array<{ id: string; is_active: boolean }>;
      let active = 0;
      let inactive = 0;
      let dormant = 0;
      for (const c of rows) {
        if (c.is_active) {
          active += 1;
          if (!recentSet.has(c.id)) dormant += 1;
        } else {
          inactive += 1;
        }
      }
      return { total: rows.length, active, inactive, dormant };
    },
  });
}

// Unieke landen per tenant, apart gecached zodat de dropdown ook bij
// server-side paginering de volledige set toont (niet alleen landen van
// de huidige 50 rijen).
export function useClientCountries() {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["client_countries", tenant?.id],
    enabled: !!tenant?.id,
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("country")
        .eq("tenant_id", tenant!.id)
        .not("country", "is", null);
      if (error) throw error;
      const set = new Set<string>();
      (data ?? []).forEach((row) => {
        const c = (row as { country: string | null }).country;
        if (c) set.add(c);
      });
      return Array.from(set).sort();
    },
  });
}

export function useClient(clientId: string | null | undefined) {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: ["client", clientId, tenant?.id],
    enabled: !!clientId && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data as Client | null;
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

export function useClientOrders(clientId: string | null) {
  return useQuery({
    queryKey: ["client_orders", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      // Filter op client_id, niet op een ilike van client_name. Naam-
      // varianten en partial matches liepen anders tussen klanten door
      // (bv. "Heede" matchte ook "Van Heede BV" en omgekeerd).
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, order_number, status, pickup_address, delivery_address, created_at, priority, info_status",
        )
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Omzet year-to-date per klant, gebaseerd op `invoices.total` (euro's).
 * Statussen `verzonden`, `betaald` en `vervallen` tellen als geboekte omzet,
 * `concept` blijft buiten de telling zodat niet-verstuurde concepten geen
 * vals-hoog cijfer opleveren. Peildatum: 1 januari van het huidige jaar.
 */
export function useRevenueYtd(clientId: string | null | undefined) {
  const { tenant } = useTenant();
  const yearStart = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0];
  }, []);

  return useQuery({
    queryKey: ["client_revenue_ytd", clientId, tenant?.id, yearStart],
    enabled: !!clientId && !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("total")
        .eq("tenant_id", tenant!.id)
        .eq("client_id", clientId!)
        .in("status", ["verzonden", "betaald", "vervallen"])
        .gte("invoice_date", yearStart);
      if (error) throw error;
      const total = (data ?? []).reduce(
        (sum, row) => sum + Number((row as { total: number | null }).total ?? 0),
        0,
      );
      return total;
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

/**
 * Zoekt of er al een klant bestaat met hetzelfde KvK-nummer in dezelfde tenant.
 * Query draait pas als er minstens 4 tekens ingetypt zijn, om overbodige calls
 * te vermijden tijdens typen. Bij edit kan de eigen id uitgesloten worden.
 */
export function useClientDuplicateCheck(kvk: string, excludeId?: string) {
  const { tenant } = useTenant();
  const trimmed = kvk.trim();

  const query = useQuery({
    queryKey: ["clients_duplicate_kvk", tenant?.id, trimmed.toLowerCase(), excludeId ?? null],
    enabled: !!tenant?.id && trimmed.length >= 4,
    staleTime: 30_000,
    queryFn: async () => {
      let q = supabase
        .from("clients")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .ilike("kvk_number", trimmed)
        .limit(1);

      if (excludeId) {
        q = q.neq("id", excludeId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data?.[0] as Client | undefined) ?? null;
    },
  });

  return {
    duplicate: query.data ?? null,
    isChecking: query.isFetching,
  };
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

/**
 * Bulk-update `is_active` voor meerdere klanten tegelijk. We blijven bij
 * het archive-pattern (nooit hard-delete), dus dit is een gewone UPDATE
 * in één round-trip via `.in('id', ids)`. Query-invalidatie vernieuwt
 * lijst, stats en KPI's.
 */
export function useBulkUpdateClientsActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) => {
      if (ids.length === 0) return { updated: 0 };
      const { data, error } = await supabase
        .from("clients")
        .update({ is_active: isActive })
        .in("id", ids)
        .select("id");
      if (error) throw error;
      return { updated: data?.length ?? 0 };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["clients_list"] });
      qc.invalidateQueries({ queryKey: ["client_stats"] });
    },
  });
}
