import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CorrectionRecord {
  id: string;
  order_id: string | null;
  client_name: string | null;
  field_name: string;
  ai_value: string | null;
  corrected_value: string;
  created_at: string;
}

export interface CorrectionPattern {
  field_name: string;
  count: number;
  percentage: number;
}

export interface CorrectionStats {
  totalCorrections: number;
  topFields: CorrectionPattern[];
  clientAccuracy: number | null; // percentage 0-100
}

const FIELD_LABELS: Record<string, string> = {
  pickupAddress: "Ophaaladres",
  deliveryAddress: "Afleveradres",
  quantity: "Aantal",
  weight: "Gewicht",
  unit: "Eenheid",
  dimensions: "Afmetingen",
  transportType: "Transport type",
  requirements: "Vereisten",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

/**
 * Fetch corrections for a specific order
 */
export function useOrderCorrections(orderId: string | null) {
  return useQuery({
    queryKey: ["ai-corrections", "order", orderId],
    queryFn: async () => {
      if (!orderId) return [];
      const { data, error } = await supabase
        .from("ai_corrections")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as CorrectionRecord[];
    },
    enabled: !!orderId,
  });
}

/**
 * Fetch correction patterns for a specific client:
 * - Which fields get corrected most
 * - Overall accuracy estimate
 */
export function useClientCorrectionStats(clientName: string | null) {
  return useQuery({
    queryKey: ["ai-corrections", "client-stats", clientName],
    queryFn: async (): Promise<CorrectionStats> => {
      if (!clientName) {
        return { totalCorrections: 0, topFields: [], clientAccuracy: null };
      }

      const { data, error } = await supabase
        .from("ai_corrections")
        .select("field_name")
        .ilike("client_name", `%${clientName}%`);

      if (error) throw error;
      if (!data || data.length === 0) {
        return { totalCorrections: 0, topFields: [], clientAccuracy: null };
      }

      const totalCorrections = data.length;

      // Count per field
      const fieldCounts: Record<string, number> = {};
      data.forEach((row) => {
        fieldCounts[row.field_name] = (fieldCounts[row.field_name] || 0) + 1;
      });

      const topFields: CorrectionPattern[] = Object.entries(fieldCounts)
        .map(([field_name, count]) => ({
          field_name,
          count,
          percentage: Math.round((count / totalCorrections) * 100),
        }))
        .sort((a, b) => b.count - a.count);

      // Estimate accuracy: we need total AI-processed orders for this client
      // Use orders table to get count of AI-processed orders
      const { count: aiOrderCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .ilike("client_name", `%${clientName}%`)
        .not("confidence_score", "is", null)
        .gt("confidence_score", 0);

      // Each AI order has ~6 extractable fields
      const FIELDS_PER_ORDER = 6;
      const totalFields = (aiOrderCount || 0) * FIELDS_PER_ORDER;
      const clientAccuracy =
        totalFields > 0
          ? Math.round(((totalFields - totalCorrections) / totalFields) * 100)
          : null;

      return { totalCorrections, topFields, clientAccuracy };
    },
    enabled: !!clientName,
    staleTime: 30_000, // 30s cache
  });
}

/**
 * Fetch correction rate for a specific field + client combo.
 * Returns how often this field gets corrected for this client.
 */
export function useFieldCorrectionRate(
  clientName: string | null,
  fieldName: string | null
) {
  return useQuery({
    queryKey: ["ai-corrections", "field-rate", clientName, fieldName],
    queryFn: async () => {
      if (!clientName || !fieldName) return null;

      const { count: correctionCount } = await supabase
        .from("ai_corrections")
        .select("id", { count: "exact", head: true })
        .ilike("client_name", `%${clientName}%`)
        .eq("field_name", fieldName);

      const { count: orderCount } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .ilike("client_name", `%${clientName}%`)
        .not("confidence_score", "is", null)
        .gt("confidence_score", 0);

      if (!orderCount || orderCount === 0) return null;

      return {
        correctionRate: Math.round(((correctionCount || 0) / orderCount) * 100),
        corrections: correctionCount || 0,
        totalOrders: orderCount,
      };
    },
    enabled: !!clientName && !!fieldName,
    staleTime: 30_000,
  });
}

/**
 * Mutation to save a correction
 */
export function useSaveCorrection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      orderId: string;
      clientName: string;
      fieldName: string;
      aiValue: string;
      correctedValue: string;
    }) => {
      if (!params.correctedValue || params.aiValue === params.correctedValue) {
        return null;
      }
      const { error } = await supabase.from("ai_corrections").insert({
        order_id: params.orderId,
        client_name: params.clientName,
        field_name: params.fieldName,
        ai_value: params.aiValue,
        corrected_value: params.correctedValue,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-corrections"] });
    },
  });
}
