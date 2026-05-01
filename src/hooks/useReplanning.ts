// ─── Real-time Replanning Hooks ─────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Trip } from "@/types/dispatch";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { Disruption, ReplanSuggestion } from "@/types/replanning";
import {
  detectDisruptions,
  generateReplanSuggestions,
} from "@/utils/replanningEngine";

// ─── useDisruptions ─────────────────────────────────────────
// Monitors active trips and detects disruptions (polling every 60s)

export function useDisruptions(
  trips: Trip[],
  orders: Array<{ id: string; weight_kg?: number; time_window_start?: string | null; time_window_end?: string | null; status?: string }>,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ["disruptions", trips.map((t) => t.id).join(",")],
    queryFn: () => {
      return detectDisruptions(trips, orders);
    },
    enabled: enabled && trips.length > 0,
    staleTime: 30_000,
    refetchInterval: 60_000, // Poll every 60 seconds
  });

  return query;
}

// ─── useReplanSuggestions ───────────────────────────────────
// Get suggestions for a specific disruption

export function useReplanSuggestions(
  disruption: Disruption | null,
  availableVehicles: FleetVehicle[],
  trips: Trip[],
) {
  return useQuery({
    queryKey: ["replan-suggestions", disruption?.id],
    queryFn: () => {
      if (!disruption) return [];
      return generateReplanSuggestions(disruption, availableVehicles, trips);
    },
    enabled: !!disruption,
    staleTime: 30_000,
  });
}

// ─── useApplyReplan ─────────────────────────────────────────
// Apply a suggestion: update trip stops, reassign orders in DB

export function useApplyReplan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (suggestion: ReplanSuggestion) => {
      for (const action of suggestion.actions) {
        switch (action.type) {
          case "reorder_stops": {
            const newSequence = (action.details as { newSequence?: string[] }).newSequence;
            if (newSequence && action.fromTripId) {
              for (let i = 0; i < newSequence.length; i++) {
                await supabase
                  .from("trip_stops")
                  .update({ stop_sequence: i + 1 })
                  .eq("id", newSequence[i]);
              }
            }
            break;
          }
          case "reassign_order": {
            if (action.orderId && action.fromTripId && action.toTripId) {
              // Move stop from one trip to another
              await supabase
                .from("trip_stops")
                .update({ trip_id: action.toTripId })
                .eq("trip_id", action.fromTripId)
                .eq("order_id", action.orderId);
            }
            break;
          }
          case "swap_vehicle": {
            const targetVehicle = (action.details as { targetVehicle?: string }).targetVehicle;
            if (action.fromTripId && targetVehicle) {
              await supabase
                .from("trips")
                .update({ vehicle_id: targetVehicle })
                .eq("id", action.fromTripId);
            }
            break;
          }
          // delay_delivery and split_route are informational — no automated DB changes
          default:
            break;
        }
      }

      // Record the suggestion as applied
      // (Only if we have a disruptions table; use a try/catch for safety)
      try {
        await supabase.from("replan_suggestions" as any).insert({
          disruption_id: suggestion.disruptionId,
          description: suggestion.description,
          confidence: suggestion.confidence,
          impact: suggestion.impact,
          actions: suggestion.actions,
          status: "approved",
          applied_at: new Date().toISOString(),
        });
      } catch {
        // Table may not exist yet in dev environments
      }

      return suggestion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trip"] });
      queryClient.invalidateQueries({ queryKey: ["disruptions"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ─── useAutoApplyHighConfidence ─────────────────────────────
// Auto-apply suggestions with confidence >= 90%

export function useAutoApplyHighConfidence(
  disruptions: Disruption[],
  availableVehicles: FleetVehicle[],
  trips: Trip[],
  enabled = false,
) {
  const applyReplan = useApplyReplan();

  const autoApply = useCallback(async () => {
    if (!enabled || disruptions.length === 0) return;

    for (const disruption of disruptions) {
      const suggestions = generateReplanSuggestions(
        disruption,
        availableVehicles,
        trips,
      );

      for (const suggestion of suggestions) {
        if (suggestion.confidence >= 90) {
          const autoSuggestion: ReplanSuggestion = {
            ...suggestion,
            status: "auto_applied",
          };
          try {
            await applyReplan.mutateAsync(autoSuggestion);
          } catch (err) {
            console.error("[useAutoApplyHighConfidence] Failed to auto-apply:", err);
          }
        }
      }
    }
  }, [enabled, disruptions, availableVehicles, trips, applyReplan]);

  useEffect(() => {
    if (enabled) {
      autoApply();
    }
  }, [enabled, autoApply]);

  return { autoApply };
}
