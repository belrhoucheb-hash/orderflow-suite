import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CompanySearchHit {
  place_id: string;
  name: string;
  description: string;
}

export interface CompanyDetails {
  name: string;
  street: string;
  house_number: string;
  zipcode: string;
  city: string;
  country: string;
  phone: string;
}

interface SearchResponse {
  results?: CompanySearchHit[];
  error?: string;
}

interface DetailsResponse {
  result?: CompanyDetails | null;
  error?: string;
}

async function invokeLookup<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("google-places-business", { body });
  if (error) throw new Error(error.message || "Bedrijven-lookup mislukt");
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function useCompanySearch() {
  return useMutation({
    mutationFn: async (query: string): Promise<CompanySearchHit[]> => {
      const trimmed = query.trim();
      if (trimmed.length < 2) return [];
      const data = await invokeLookup<SearchResponse>({ mode: "search", query: trimmed });
      return data.results ?? [];
    },
  });
}

export function useCompanyDetails() {
  return useMutation({
    mutationFn: async (placeId: string): Promise<CompanyDetails | null> => {
      const data = await invokeLookup<DetailsResponse>({ mode: "details", place_id: placeId });
      return data.result ?? null;
    },
  });
}
