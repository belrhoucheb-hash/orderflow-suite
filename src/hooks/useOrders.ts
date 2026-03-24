import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Order } from "@/data/mockData";

// Map DB status to UI status
const statusMap: Record<string, Order["status"]> = {
  DRAFT: "nieuw",
  OPEN: "in_behandeling",
  PLANNED: "onderweg",
  DELIVERED: "afgeleverd",
  CANCELLED: "geannuleerd",
};

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((o): Order => ({
        id: o.id,
        orderNumber: `RCS-${new Date(o.created_at).getFullYear()}-${String(o.order_number).padStart(4, "0")}`,
        customer: o.client_name || "Onbekend",
        email: o.source_email_from || "",
        phone: "",
        pickupAddress: o.pickup_address || "",
        deliveryAddress: o.delivery_address || "",
        status: statusMap[o.status] || "nieuw",
        priority: "normaal",
        items: [],
        totalWeight: o.weight_kg ?? 0,
        vehicle: o.vehicle_id ?? undefined,
        createdAt: o.created_at,
        estimatedDelivery: "",
        notes: o.internal_note || "",
      }));
    },
  });
}
