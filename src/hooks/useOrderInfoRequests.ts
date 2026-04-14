import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantOptional } from "@/contexts/TenantContext";

export type InfoStatus = "COMPLETE" | "AWAITING_INFO" | "OVERDUE";

export type InfoRequestStatus =
  | "PENDING"
  | "FULFILLED"
  | "OVERDUE"
  | "CANCELLED";

export interface OrderInfoRequest {
  id: string;
  tenant_id: string;
  order_id: string;
  field_name: string;
  field_label: string | null;
  status: InfoRequestStatus;
  promised_by_contact_id: string | null;
  promised_by_name: string | null;
  promised_by_email: string | null;
  promised_at: string;
  expected_by: string | null;
  fulfilled_at: string | null;
  fulfilled_value: string | null;
  fulfilled_source: string | null;
  reminder_sent_at: string[];
  escalated_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewInfoRequestInput {
  order_id: string;
  field_name: string;
  field_label?: string | null;
  promised_by_name?: string | null;
  promised_by_email?: string | null;
  promised_by_contact_id?: string | null;
  expected_by?: string | null;
}

// Welke velden gebruikers typisch aanvinken als "volgt van klant".
// label = wat in UI en reminder-mail verschijnt.
export const TRACKABLE_FIELDS: Array<{ name: string; label: string }> = [
  { name: "laadreferentie", label: "Laadreferentie" },
  { name: "losreferentie", label: "Losreferentie" },
  { name: "mrn", label: "MRN-nummer" },
  { name: "contact_person", label: "Contactpersoon op locatie" },
  { name: "pickup_time_window", label: "Tijdslot laden" },
  { name: "delivery_time_window", label: "Tijdslot lossen" },
];

export function useOrderInfoRequests(orderId: string | null | undefined) {
  const { tenant } = useTenantOptional();

  return useQuery({
    queryKey: ["order_info_requests", orderId, tenant?.id],
    enabled: !!orderId && !!tenant?.id,
    staleTime: 5_000,
    queryFn: async (): Promise<OrderInfoRequest[]> => {
      const { data, error } = await (supabase as any)
        .from("order_info_requests")
        .select("*")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as OrderInfoRequest[];
    },
  });
}

export function useCreateInfoRequest() {
  const { tenant } = useTenantOptional();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewInfoRequestInput) => {
      if (!tenant?.id) throw new Error("no tenant");
      const payload = {
        tenant_id: tenant.id,
        order_id: input.order_id,
        field_name: input.field_name,
        field_label: input.field_label ?? null,
        promised_by_name: input.promised_by_name ?? null,
        promised_by_email: input.promised_by_email ?? null,
        promised_by_contact_id: input.promised_by_contact_id ?? null,
        expected_by: input.expected_by ?? null,
        status: "PENDING",
      };
      const { data, error } = await (supabase as any)
        .from("order_info_requests")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data as OrderInfoRequest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["order_info_requests", row.order_id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", row.order_id] });
    },
  });
}

export function useFulfillInfoRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: {
      id: string;
      value: string;
      source?: "manual" | "inbox_reply" | "portal";
    }) => {
      const { data, error } = await (supabase as any)
        .from("order_info_requests")
        .update({
          status: "FULFILLED",
          fulfilled_at: new Date().toISOString(),
          fulfilled_value: args.value,
          fulfilled_source: args.source ?? "manual",
        })
        .eq("id", args.id)
        .select()
        .single();
      if (error) throw error;
      return data as OrderInfoRequest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["order_info_requests", row.order_id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", row.order_id] });
    },
  });
}

export function useCancelInfoRequest() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (args: { id: string; reason?: string }) => {
      const { data, error } = await (supabase as any)
        .from("order_info_requests")
        .update({
          status: "CANCELLED",
          cancelled_at: new Date().toISOString(),
          cancelled_reason: args.reason ?? null,
        })
        .eq("id", args.id)
        .select()
        .single();
      if (error) throw error;
      return data as OrderInfoRequest;
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["order_info_requests", row.order_id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// Forceert een directe reminder-run via edge-function (handmatige "Nu herinneren"-knop).
export async function triggerInfoReminder(requestId: string): Promise<void> {
  const { error } = await (supabase as any).functions.invoke(
    "check-info-requests",
    { body: { request_id: requestId, force: true } }
  );
  if (error) throw error;
}

/**
 * Standaard `expected_by` = 4 uur vóór pickup. Als geen pickup bekend is,
 * defaulten we naar einde van vandaag zodat er altijd iets in de cron komt.
 */
export function defaultExpectedBy(pickupIso: string | null | undefined): string {
  if (pickupIso) {
    const pickup = new Date(pickupIso).getTime();
    if (!Number.isNaN(pickup)) {
      return new Date(pickup - 4 * 60 * 60 * 1000).toISOString();
    }
  }
  const eod = new Date();
  eod.setHours(18, 0, 0, 0);
  return eod.toISOString();
}
