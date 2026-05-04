import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";
import {
  isAddressBookReady,
  toAddressBookPayload,
  type AddressBookEntryInput,
} from "@/lib/addressBook";

export interface AddressBookEntry {
  id: string;
  tenant_id: string;
  label: string;
  company_name: string | null;
  aliases: string[] | null;
  alias_search: string | null;
  address: string;
  street: string;
  house_number: string;
  house_number_suffix: string;
  zipcode: string;
  city: string;
  country: string;
  lat: number | null;
  lng: number | null;
  coords_manual: boolean;
  location_type: "pickup" | "delivery" | "both";
  notes: string | null;
  driver_instructions: string | null;
  requires_tail_lift: boolean;
  temperature_controlled: boolean;
  photo_required: boolean;
  time_window_start: string | null;
  time_window_end: string | null;
  usage_count: number;
  last_used_at: string | null;
  normalized_company_key: string;
  normalized_key: string;
  source: string;
  created_at: string;
  updated_at: string;
}

export function useAddressBookSearch(search?: string) {
  const { tenant } = useTenantOptional();
  const term = search?.trim() ?? "";

  return useQuery({
    queryKey: ["address_book_search", tenant?.id, term],
    enabled: !!tenant?.id && term.length >= 2,
    staleTime: 60_000,
    queryFn: async () => {
      const columns = ["label", "company_name", "alias_search", "address", "street", "zipcode", "city"];
      const results = await Promise.all(
        columns.map(async (column) => {
          const { data, error } = await (supabase.from("address_book" as any) as any)
            .select("*")
            .eq("tenant_id", tenant!.id)
            .ilike(column, `%${term}%`)
            .order("usage_count", { ascending: false })
            .order("last_used_at", { ascending: false, nullsFirst: false })
            .limit(12);
          if (error) throw error;
          return (data ?? []) as AddressBookEntry[];
        }),
      );

      const byId = new Map<string, AddressBookEntry>();
      results.flat().forEach((entry) => byId.set(entry.id, entry));
      return [...byId.values()]
        .sort((a, b) => {
          const usageDiff = (b.usage_count ?? 0) - (a.usage_count ?? 0);
          if (usageDiff !== 0) return usageDiff;
          return (b.last_used_at ?? "").localeCompare(a.last_used_at ?? "");
        })
        .slice(0, 12);
    },
  });
}

export function useAddressBookEntries(search?: string) {
  const { tenant } = useTenantOptional();
  const term = search?.trim() ?? "";

  return useQuery({
    queryKey: ["address_book_entries", tenant?.id, term],
    enabled: !!tenant?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const baseSelect = () =>
        (supabase.from("address_book" as any) as any)
          .select("*")
          .eq("tenant_id", tenant!.id)
          .order("company_name", { ascending: true, nullsFirst: false })
          .order("city", { ascending: true })
          .limit(100);

      if (term.length < 2) {
        const { data, error } = await baseSelect();
        if (error) throw error;
        return (data ?? []) as AddressBookEntry[];
      }

      const columns = ["label", "company_name", "alias_search", "address", "street", "zipcode", "city"];
      const results = await Promise.all(
        columns.map(async (column) => {
          const { data, error } = await baseSelect().ilike(column, `%${term}%`);
          if (error) throw error;
          return (data ?? []) as AddressBookEntry[];
        }),
      );

      const byId = new Map<string, AddressBookEntry>();
      results.flat().forEach((entry) => byId.set(entry.id, entry));
      return [...byId.values()].sort((a, b) => {
        const company = (a.company_name || a.label).localeCompare(b.company_name || b.label);
        if (company !== 0) return company;
        return a.address.localeCompare(b.address);
      });
    },
  });
}

export function useUpsertAddressBookEntry() {
  const qc = useQueryClient();
  const { tenant } = useTenantOptional();

  return useMutation({
    mutationFn: async (input: Omit<AddressBookEntryInput, "tenant_id">) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant gevonden");
      if (!isAddressBookReady(input)) return null;

      const payload = toAddressBookPayload({ ...input, tenant_id: tenant.id });
      const { data, error } = await (supabase as any).rpc("upsert_address_book_entry", {
        p_entry: payload,
      });
      if (error) throw error;
      return {
        row: data?.row as AddressBookEntry,
        duplicate: data?.action === "updated",
        action: data?.action as "inserted" | "updated",
        matchedName: data?.matched_name as string | null,
        message: data?.message as string | null,
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["address_book_search"] });
      qc.invalidateQueries({ queryKey: ["address_book_entries"] });
    },
  });
}

export function useUpdateAddressBookEntry() {
  const qc = useQueryClient();
  const { tenant } = useTenantOptional();

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Omit<AddressBookEntryInput, "tenant_id"> }) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant gevonden");
      if (!isAddressBookReady(input)) throw new Error("Vul minimaal straat, huisnummer en postcode of plaats in");

      const payload = toAddressBookPayload({ ...input, tenant_id: tenant.id });
      const { data, error } = await (supabase.from("address_book" as any) as any)
        .update({
          ...payload,
          alias_search: payload.alias_search,
        })
        .eq("tenant_id", tenant.id)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as AddressBookEntry;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["address_book_search"] });
      qc.invalidateQueries({ queryKey: ["address_book_entries"] });
    },
  });
}

export function useDeleteAddressBookEntry() {
  const qc = useQueryClient();
  const { tenant } = useTenantOptional();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant gevonden");
      const { error } = await (supabase.from("address_book" as any) as any)
        .delete()
        .eq("tenant_id", tenant.id)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["address_book_search"] });
      qc.invalidateQueries({ queryKey: ["address_book_entries"] });
    },
  });
}
