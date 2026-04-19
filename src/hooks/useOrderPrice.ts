import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PriceBreakdown } from "@/types/rateModels";

export interface OrderPriceInput {
  tenant_id: string;
  vehicle_type_id: string;
  distance_km: number;
  pickup_date?: string;
  pickup_time_local?: string;
  transport_type?: string | null;
  requirements?: string[];
  weight_kg?: number | null;
  client_id?: string | null;
  stop_count?: number;
  duration_hours?: number;
  waiting_time_min?: number;
  diesel_included?: boolean;
  include_optional_purposes?: string[];
}

export interface OrderPriceResult {
  breakdown: PriceBreakdown;
  vehicle_type_id: string;
  rate_card_id: string;
  rate_card_name: string;
}

interface PreviewSuccess {
  ok: true;
  breakdown: PriceBreakdown;
  vehicle_type_id: string;
  rate_card_id: string;
  rate_card_name: string;
}

interface PreviewSkipped {
  ok: true;
  skipped: true;
  reason: string;
}

interface PreviewError {
  ok: false;
  error: string;
}

type PreviewResponse = PreviewSuccess | PreviewSkipped | PreviewError;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

function isComplete(input: OrderPriceInput | null): input is OrderPriceInput {
  if (!input) return false;
  if (!input.tenant_id || !input.vehicle_type_id) return false;
  if (!(input.distance_km > 0)) return false;
  return true;
}

/**
 * Haalt live prijsvoorbeeld op via de preview-order-price Edge Function.
 * - Debounced 300ms zodat elk karakter in km-veld geen roundtrip triggert.
 * - Cached 5s (staleTime) om herhaling bij tab-switch te beperken.
 * - Returnt skipped=true wanneer de tariefmotor uit staat voor de tenant.
 */
export function useOrderPrice(input: OrderPriceInput | null) {
  const debouncedInput = useDebounced(input, 300);
  const enabled = isComplete(debouncedInput);

  return useQuery<OrderPriceResult | { skipped: true; reason: string }>({
    queryKey: ["order-price-preview", debouncedInput],
    enabled,
    staleTime: 5000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke<PreviewResponse>(
        "preview-order-price",
        { body: debouncedInput as OrderPriceInput },
      );
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Geen antwoord van preview-order-price");
      if (data.ok === false) throw new Error(data.error);
      if ("skipped" in data) return { skipped: true, reason: data.reason };
      return {
        breakdown: data.breakdown,
        vehicle_type_id: data.vehicle_type_id,
        rate_card_id: data.rate_card_id,
        rate_card_name: data.rate_card_name,
      };
    },
  });
}
