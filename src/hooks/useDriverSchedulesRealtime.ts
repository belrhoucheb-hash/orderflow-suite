import { useQueryClient } from "@tanstack/react-query";

import { useTenantOptional } from "@/contexts/TenantContext";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";

/**
 * Subscribe to all changes on `driver_schedules` and invalidate de relevante
 * React Query caches. Hierdoor zien meerdere planners (en de chauffeur-app)
 * elkaars wijzigingen op het rooster bijna direct.
 *
 * Side-effect-only: mount eenmalig in de rooster-pagina of de chauffeur-app.
 * Het patroon volgt `usePlanningDraftsRealtime`. Gebruikt
 * `useTenantOptional` zodat de hook ook in test-omgevingen zonder
 * TenantProvider veilig laadt (dan staat hij gewoon uit).
 */
export function useDriverSchedulesRealtime(): void {
  const queryClient = useQueryClient();
  const { tenant } = useTenantOptional();

  useRealtimeSubscription(
    {
      table: "driver_schedules",
      enabled: !!tenant?.id,
    },
    () => {
      queryClient.invalidateQueries({ queryKey: ["driver-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedule-for-date"] });
      queryClient.invalidateQueries({ queryKey: ["driver-schedules-for-date"] });
      queryClient.invalidateQueries({ queryKey: ["planning_day_support"] });
    },
  );
}
