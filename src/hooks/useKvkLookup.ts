import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface KvkCompany {
  kvk: string;
  name: string;
  street: string;
  house_number: string;
  zipcode: string;
  city: string;
  country: string;
}

interface SearchResponse {
  results?: KvkCompany[];
  error?: string;
}

interface ByKvkResponse {
  result?: KvkCompany | null;
  error?: string;
}

async function invokeLookup<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("kvk-lookup", { body });
  if (error) throw new Error(error.message || "KvK-lookup mislukt");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useKvkSearch() {
  return useMutation({
    mutationFn: async (query: string): Promise<KvkCompany[]> => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const data = await invokeLookup<SearchResponse>({ mode: "search", query: trimmed });
      return data.results ?? [];
    },
  });
}

export function useKvkByNumber() {
  return useMutation({
    mutationFn: async (kvk: string): Promise<KvkCompany | null> => {
      const cleaned = kvk.replace(/\s+/g, "");
      if (!/^\d{8}$/.test(cleaned)) {
        throw new Error("KvK-nummer moet 8 cijfers zijn");
      }
      const data = await invokeLookup<ByKvkResponse>({ mode: "byKvk", kvk: cleaned });
      return data.result ?? null;
    },
  });
}
