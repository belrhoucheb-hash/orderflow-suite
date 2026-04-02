import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientRate } from "@/hooks/useClients";

// ─── Interfaces ─────────────────────────────────────────────────────

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  client_address: string | null;
  client_btw_number: string | null;
  client_kvk_number: string | null;
  status: "concept" | "verzonden" | "betaald" | "vervallen";
  invoice_date: string;
  due_date: string | null;
  subtotal: number;
  btw_percentage: number;
  btw_amount: number;
  total: number;
  notes: string | null;
  pdf_url: string | null;
  created_at: string;
  updated_at: string;
  invoice_lines?: InvoiceLine[];
}

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  order_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
  sort_order: number;
  created_at: string;
}

export interface CreateInvoiceInput {
  client_id: string;
  lines: Omit<InvoiceLine, "id" | "invoice_id" | "created_at">[];
  notes?: string;
  btw_percentage?: number;
}

export interface OrderCostResult {
  lines: Omit<InvoiceLine, "id" | "invoice_id" | "created_at">[];
  subtotal: number;
  btw: number;
  total: number;
}

// ─── Hooks ──────────────────────────────────────────────────────────

/**
 * Fetch all invoices for the tenant, ordered by invoice_date DESC.
 */
export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      return (data ?? []) as Invoice[];
    },
  });
}

/**
 * Fetch a single invoice with its lines.
 */
export function useInvoiceById(id: string | null) {
  return useQuery({
    queryKey: ["invoices", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*, invoice_lines(*)")
        .eq("id", id!)
        .single();

      if (error) throw error;
      if (!data) return null;

      // Sort lines by sort_order
      const invoice = data as Invoice;
      if (invoice.invoice_lines) {
        invoice.invoice_lines.sort((a, b) => a.sort_order - b.sort_order);
      }
      return invoice;
    },
  });
}

/**
 * Create a new invoice with lines.
 * Looks up client data, generates invoice number via RPC, calculates totals,
 * and inserts invoice + lines in sequence.
 */
export function useCreateInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateInvoiceInput) => {
      const { client_id, lines, notes, btw_percentage = 21.0 } = input;

      // 1. Look up client data (name, address, btw, kvk, payment_terms)
      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("name, address, btw_number, kvk_number, payment_terms")
        .eq("id", client_id)
        .single();

      if (clientErr) throw clientErr;
      if (!client) throw new Error("Client niet gevonden");

      // 2. Get tenant_id from current user context
      const { data: { user }, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      if (!user) throw new Error("Niet ingelogd");

      // Look up tenant_id from tenant_users
      const { data: tenantUser, error: tuErr } = await supabase
        .from("tenant_users")
        .select("tenant_id")
        .eq("user_id", user.id)
        .single();

      if (tuErr) throw tuErr;
      if (!tenantUser) throw new Error("Geen tenant gevonden voor gebruiker");

      const tenantId = tenantUser.tenant_id;

      // 3. Generate invoice number via RPC
      const { data: invoiceNumber, error: rpcErr } = await supabase
        .rpc("generate_invoice_number", { p_tenant_id: tenantId });

      if (rpcErr) throw rpcErr;
      if (!invoiceNumber) throw new Error("Kon geen factuurnummer genereren");

      // 4. Calculate totals
      const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
      const btwAmount = Math.round(subtotal * (btw_percentage / 100) * 100) / 100;
      const total = Math.round((subtotal + btwAmount) * 100) / 100;

      // 5. Calculate due_date from payment_terms
      let dueDate: string | null = null;
      if (client.payment_terms) {
        const due = new Date();
        due.setDate(due.getDate() + client.payment_terms);
        dueDate = due.toISOString().split("T")[0];
      }

      // 6. Insert invoice
      const { data: invoice, error: insertErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          client_id,
          client_name: client.name,
          client_address: client.address ?? null,
          client_btw_number: client.btw_number ?? null,
          client_kvk_number: client.kvk_number ?? null,
          status: "concept",
          invoice_date: new Date().toISOString().split("T")[0],
          due_date: dueDate,
          subtotal,
          btw_percentage: btw_percentage,
          btw_amount: btwAmount,
          total,
          notes: notes ?? null,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      // 7. Insert invoice lines
      const lineInserts = lines.map((line, idx) => ({
        invoice_id: invoice.id,
        order_id: line.order_id ?? null,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        total: line.total,
        sort_order: line.sort_order ?? idx,
      }));

      if (lineInserts.length > 0) {
        const { error: linesErr } = await supabase
          .from("invoice_lines")
          .insert(lineInserts);

        if (linesErr) throw linesErr;
      }

      return invoice as Invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

/**
 * Update invoice status (concept -> verzonden -> betaald).
 */
export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Invoice["status"] }) => {
      const { data, error } = await supabase
        .from("invoices")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as Invoice;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices", variables.id] });
    },
  });
}

/**
 * Delete an invoice (only concept invoices).
 */
export function useDeleteInvoice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Verify invoice is in concept status before deleting
      const { data: invoice, error: fetchErr } = await supabase
        .from("invoices")
        .select("status")
        .eq("id", id)
        .single();

      if (fetchErr) throw fetchErr;
      if (!invoice) throw new Error("Factuur niet gevonden");
      if (invoice.status !== "concept") {
        throw new Error("Alleen concept-facturen kunnen worden verwijderd");
      }

      // Clear invoice_id on linked orders before deleting
      const { error: unlinkErr } = await supabase
        .from("orders")
        .update({ invoice_id: null })
        .eq("invoice_id", id);

      if (unlinkErr) throw unlinkErr;

      const { error } = await supabase
        .from("invoices")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });
}

// ─── Distance Estimation ───────────────────────────────────────────

/**
 * Calculate haversine distance between two lat/lng points in km.
 */
function haversineDistanceKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate the route distance for an order.
 *
 * 1. If geocoded pickup/delivery coordinates are available, use haversine
 *    distance * 1.3 (road detour factor).
 * 2. Otherwise fall back to 150 km — the average Dutch transport distance.
 *
 * Returns distance in km, rounded to 1 decimal.
 */
function estimateRouteDistance(order: {
  geocoded_pickup_lat?: number | null;
  geocoded_pickup_lng?: number | null;
  geocoded_delivery_lat?: number | null;
  geocoded_delivery_lng?: number | null;
  pickup_address?: string | null;
  delivery_address?: string | null;
}): number {
  const { geocoded_pickup_lat, geocoded_pickup_lng, geocoded_delivery_lat, geocoded_delivery_lng } = order;

  if (
    geocoded_pickup_lat != null &&
    geocoded_pickup_lng != null &&
    geocoded_delivery_lat != null &&
    geocoded_delivery_lng != null
  ) {
    const straightLine = haversineDistanceKm(
      geocoded_pickup_lat, geocoded_pickup_lng,
      geocoded_delivery_lat, geocoded_delivery_lng,
    );
    // Multiply by 1.3 detour factor to approximate road distance
    return Math.round(straightLine * 1.3 * 10) / 10;
  }

  // Fallback: if both addresses exist we assume a real route but no coords yet
  // Use 150 km as reasonable Dutch average; if no addresses, return 0
  if (order.pickup_address && order.delivery_address) {
    // TODO: integrate with route calculation API for exact distance
    return 150;
  }

  return 0;
}

/**
 * Calculate order cost based on client rates.
 * Fetches the order and client_rates, then calculates cost based on
 * applicable rates (per_km with order distance, per_pallet with quantity,
 * per_rit flat rate, surcharges).
 */
export function useCalculateOrderCost(orderId: string | null, clientId: string | null) {
  return useQuery({
    queryKey: ["order_cost", orderId, clientId],
    enabled: !!orderId && !!clientId,
    queryFn: async (): Promise<OrderCostResult> => {
      // Fetch order and client rates in parallel
      const [orderResult, ratesResult] = await Promise.all([
        supabase
          .from("orders")
          .select("*")
          .eq("id", orderId!)
          .single(),
        supabase
          .from("client_rates")
          .select("*")
          .eq("client_id", clientId!)
          .eq("is_active", true)
          .order("rate_type"),
      ]);

      if (orderResult.error) throw orderResult.error;
      if (ratesResult.error) throw ratesResult.error;

      const order = orderResult.data;
      const rates = (ratesResult.data ?? []) as ClientRate[];

      if (!order) throw new Error("Order niet gevonden");

      const lines: Omit<InvoiceLine, "id" | "invoice_id" | "created_at">[] = [];
      let sortOrder = 0;

      for (const rate of rates) {
        let quantity = 1;
        let unitLabel = "stuk";
        let include = false;

        switch (rate.rate_type) {
          case "per_km": {
            // Estimate route distance from geocoded coordinates if available,
            // otherwise use a reasonable default for Dutch transport
            const distance = estimateRouteDistance(order);
            if (distance > 0) {
              quantity = distance;
              unitLabel = "km";
              include = true;
            }
            break;
          }
          case "per_pallet": {
            const pallets = order.quantity ?? 0;
            if (pallets > 0) {
              quantity = pallets;
              unitLabel = "pallet";
              include = true;
            }
            break;
          }
          case "per_rit": {
            quantity = 1;
            unitLabel = "rit";
            include = true;
            break;
          }
          case "toeslag":
          case "surcharge": {
            quantity = 1;
            unitLabel = "stuk";
            include = true;
            break;
          }
          default: {
            // Include any other rate type as a single unit
            quantity = 1;
            unitLabel = "stuk";
            include = true;
            break;
          }
        }

        if (include) {
          const lineTotal = Math.round(quantity * rate.amount * 100) / 100;
          lines.push({
            order_id: orderId!,
            description: rate.description || rate.rate_type,
            quantity,
            unit: unitLabel,
            unit_price: rate.amount,
            total: lineTotal,
            sort_order: sortOrder++,
          });
        }
      }

      const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
      const btwPercentage = 21;
      const btw = Math.round(subtotal * (btwPercentage / 100) * 100) / 100;
      const total = Math.round((subtotal + btw) * 100) / 100;

      return { lines, subtotal, btw, total };
    },
  });
}
