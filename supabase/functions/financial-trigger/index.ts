/**
 * Supabase Edge Function: financial-trigger
 *
 * Triggered when a trip status changes to COMPLETED.
 * Runs the full financial autonomy pipeline:
 *   1. Auto-pricing (via autoInvoicer)
 *   2. Auto-invoicing (draft or auto-send)
 *   3. Margin check
 *   4. Cashflow prediction
 *
 * Trigger setup: Configure a Database Webhook on the trips table
 * WHERE status = 'COMPLETED' to call this function.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTrustedCaller } from "../_shared/auth.ts";
import { emitWebhookEvent } from "../_shared/emit-webhook.ts";
import { triggerConnectors } from "../_shared/trigger-connectors.ts";

// Default margin threshold: 15%
const DEFAULT_MARGIN_THRESHOLD_PCT = 15;

interface TripPayload {
  type: "UPDATE";
  table: "trips";
  record: {
    id: string;
    tenant_id: string;
    status: string;
  };
  old_record: {
    id: string;
    tenant_id: string;
    status: string;
  };
}

Deno.serve(async (req: Request) => {
  // Webhook-only: DB-webhook stuurt service-role JWT, of CRON_SECRET via header.
  if (!isTrustedCaller(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    // 1. Parse the webhook payload
    const payload: TripPayload = await req.json();

    // Only process when trip transitions TO COMPLETED
    if (
      payload.record.status !== "COMPLETED" ||
      payload.old_record.status === "COMPLETED"
    ) {
      return new Response(
        JSON.stringify({ message: "Skipped: not a COMPLETED transition" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const tripId = payload.record.id;
    const tenantId = payload.record.tenant_id;

    // 2. Create authenticated Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, unknown> = {
      trip_id: tripId,
      tenant_id: tenantId,
    };

    // Emit trip.completed voor externe subscribers, vóór de (potentieel
    // falende) invoicing-flow. Zo krijgt een klant altijd het trip-event,
    // ongeacht of er auto-invoicing slaagt.
    await emitWebhookEvent(supabase, tenantId, "trip.completed", {
      entity_type: "trip",
      entity_id: tripId,
      tenant_id: tenantId,
      previous_status: payload.old_record.status,
      new_status: "COMPLETED",
      occurred_at: new Date().toISOString(),
    });

    // 3. Auto-invoice: price all orders and create draft/auto invoice
    //    Import dynamically to handle the case where modules are bundled
    //    For Edge Functions, these would be inline or bundled separately.
    //    Below is the direct implementation for the Edge Function context.

    // --- Step 3a: Fetch delivered orders for trip ---
    const { data: orders, error: ordersErr } = await supabase
      .from("orders")
      .select("*")
      .eq("trip_id", tripId)
      .eq("status", "DELIVERED")
      .is("invoice_id", null);

    if (ordersErr || !orders || orders.length === 0) {
      results.invoicing = { skipped: true, reason: "no_delivered_orders" };
      return new Response(JSON.stringify(results), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group orders by client_id
    const ordersByClient = new Map<string, typeof orders>();
    for (const order of orders) {
      if (!order.client_id) continue;
      const existing = ordersByClient.get(order.client_id) || [];
      existing.push(order);
      ordersByClient.set(order.client_id, existing);
    }

    const invoiceResults: Record<string, unknown>[] = [];

    for (const [clientId, clientOrders] of ordersByClient) {
      // Fetch rate card
      const { data: rateCards } = await supabase
        .from("rate_cards")
        .select("*, rate_rules(*)")
        .eq("tenant_id", tenantId)
        .eq("client_id", clientId)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!rateCards || rateCards.length === 0) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "no_rate_card" });
        continue;
      }

      // Fetch surcharges
      const { data: surcharges } = await supabase
        .from("surcharges")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("is_active", true);

      // Fetch client
      const { data: client } = await supabase
        .from("clients")
        .select("name, address, btw_number, kvk_number, payment_terms")
        .eq("id", clientId)
        .single();

      if (!client) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "client_not_found" });
        continue;
      }

      // Generate invoice number
      const { data: invoiceNumber } = await supabase
        .rpc("generate_invoice_number", { p_tenant_id: tenantId });

      if (!invoiceNumber) {
        invoiceResults.push({ client_id: clientId, skipped: true, reason: "no_invoice_number" });
        continue;
      }

      // Calculate totals (simplified pricing for Edge Function)
      // In production, this would import the pricing engine
      let subtotal = 0;
      const invoiceLines: Array<{
        order_id: string;
        description: string;
        quantity: number;
        unit: string;
        unit_price: number;
        total: number;
        sort_order: number;
      }> = [];
      let sortOrder = 0;

      for (const order of clientOrders) {
        const rateCard = rateCards[0];
        const rules = rateCard.rate_rules ?? [];

        for (const rule of rules) {
          let qty = 1;
          let unit = "rit";

          switch (rule.rule_type) {
            case "PER_KM":
              qty = order.distance_km ?? 0;
              unit = "km";
              break;
            case "PER_UUR":
              qty = (order.duration_hours ?? 0);
              unit = "uur";
              break;
            case "PER_STOP":
              qty = order.stop_count ?? 2;
              unit = "stop";
              break;
            case "VAST_BEDRAG":
            case "ZONE_TARIEF":
              qty = 1;
              unit = "rit";
              break;
            case "PER_PALLET":
              qty = order.quantity ?? 0;
              unit = "pallet";
              break;
            case "PER_KG":
              qty = order.weight_kg ?? 0;
              unit = "kg";
              break;
            default:
              qty = 1;
              unit = "stuk";
          }

          if (qty <= 0) continue;

          let lineTotal = Math.round(qty * rule.amount * 100) / 100;
          if (rule.min_amount != null && lineTotal < rule.min_amount) {
            lineTotal = rule.min_amount;
          }

          subtotal += lineTotal;
          invoiceLines.push({
            order_id: order.id,
            description: `Order #${order.order_number}: ${rule.rule_type} ${qty} ${unit} x EUR ${rule.amount}`,
            quantity: qty,
            unit,
            unit_price: rule.amount,
            total: lineTotal,
            sort_order: sortOrder++,
          });
        }

        // Apply surcharges
        for (const surcharge of (surcharges ?? [])) {
          if (!surcharge.is_active) continue;
          // Simplified surcharge application
          let sAmount = 0;
          if (surcharge.surcharge_type === "VAST_BEDRAG") {
            sAmount = surcharge.amount;
          } else if (surcharge.surcharge_type === "PERCENTAGE") {
            sAmount = Math.round(subtotal * (surcharge.amount / 100) * 100) / 100;
          }
          if (sAmount > 0) {
            subtotal += sAmount;
            invoiceLines.push({
              order_id: order.id,
              description: `Toeslag: ${surcharge.name}`,
              quantity: 1,
              unit: "toeslag",
              unit_price: sAmount,
              total: sAmount,
              sort_order: sortOrder++,
            });
          }
        }
      }

      subtotal = Math.round(subtotal * 100) / 100;
      const btwPercentage = 21;
      const btwAmount = Math.round(subtotal * (btwPercentage / 100) * 100) / 100;
      const total = Math.round((subtotal + btwAmount) * 100) / 100;

      let dueDate: string | null = null;
      if (client.payment_terms) {
        const due = new Date();
        due.setDate(due.getDate() + client.payment_terms);
        dueDate = due.toISOString().split("T")[0];
      }

      // Create concept invoice (Edge Function always creates concept; auto-send
      // decision is made by the autoInvoicer lib on the client side or by a
      // separate confidence evaluation)
      const { data: invoice, error: invErr } = await supabase
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          invoice_number: invoiceNumber,
          client_id: clientId,
          client_name: client.name,
          client_address: client.address ?? null,
          client_btw_number: client.btw_number ?? null,
          client_kvk_number: client.kvk_number ?? null,
          status: "concept",
          invoice_date: new Date().toISOString().split("T")[0],
          due_date: dueDate,
          subtotal,
          btw_percentage: btwPercentage,
          btw_amount: btwAmount,
          total,
          notes: `Auto-concept bij trip ${tripId} — ${clientOrders.length} order(s)`,
        })
        .select()
        .single();

      if (invErr || !invoice) {
        invoiceResults.push({ client_id: clientId, error: invErr?.message ?? "insert_failed" });
        continue;
      }

      // Insert invoice lines
      if (invoiceLines.length > 0) {
        await supabase.from("invoice_lines").insert(
          invoiceLines.map((line) => ({
            invoice_id: invoice.id,
            order_id: line.order_id,
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unit_price: line.unit_price,
            total: line.total,
            sort_order: line.sort_order,
          })),
        );
      }

      // Link orders to invoice
      for (const order of clientOrders) {
        await supabase
          .from("orders")
          .update({ invoice_id: invoice.id, billing_status: "GEFACTUREERD" })
          .eq("id", order.id);
      }

      // Log to auto_invoice_log
      await supabase.from("auto_invoice_log").insert({
        tenant_id: tenantId,
        invoice_id: invoice.id,
        trigger_trip_id: tripId,
        auto_calculated_total: subtotal,
        final_total: total,
        price_accuracy_pct: 100,
        was_auto_sent: false,
      });

      invoiceResults.push({
        client_id: clientId,
        invoice_id: invoice.id,
        invoice_number: invoiceNumber,
        total,
        order_count: clientOrders.length,
      });

      // Emit invoice.created naar externe subscribers en triggert connectoren.
      const invoiceEventPayload = {
        entity_type: "invoice",
        entity_id: invoice.id,
        tenant_id: tenantId,
        invoice_number: invoiceNumber,
        client_id: clientId,
        subtotal,
        btw_amount: btwAmount,
        total,
        order_count: clientOrders.length,
        trip_id: tripId,
        occurred_at: new Date().toISOString(),
      };
      await emitWebhookEvent(supabase, tenantId, "invoice.created", invoiceEventPayload);
      await triggerConnectors(tenantId, "invoice.created", invoiceEventPayload);

      // --- Step 3b: Margin check ---
      const { data: tripCosts } = await supabase
        .from("trip_costs")
        .select("amount")
        .eq("trip_id", tripId);

      const totalCosts = (tripCosts ?? []).reduce(
        (sum: number, c: { amount: number }) => sum + c.amount,
        0,
      );
      const revenue = total;
      const marginEur = revenue - totalCosts;
      const marginPct = revenue > 0 ? (marginEur / revenue) * 100 : 0;

      if (marginPct < DEFAULT_MARGIN_THRESHOLD_PCT) {
        await supabase.from("margin_alerts").insert({
          tenant_id: tenantId,
          entity_type: "trip",
          entity_id: tripId,
          margin_pct: Math.round(marginPct * 100) / 100,
          threshold_pct: DEFAULT_MARGIN_THRESHOLD_PCT,
          alert_status: "ACTIVE",
        });

        results.margin_alert = {
          created: true,
          margin_pct: Math.round(marginPct * 100) / 100,
          threshold_pct: DEFAULT_MARGIN_THRESHOLD_PCT,
        };
      }

      // --- Step 3c: Cashflow prediction ---
      const paymentTerms = client.payment_terms ?? 30;
      const predictedDate = new Date();
      predictedDate.setDate(predictedDate.getDate() + paymentTerms);

      await supabase.from("cashflow_predictions").insert({
        tenant_id: tenantId,
        invoice_id: invoice.id,
        predicted_payment_date: predictedDate.toISOString().split("T")[0],
        actual_payment_date: null,
        amount: total,
        client_id: clientId,
      });

      results.cashflow_prediction = {
        invoice_id: invoice.id,
        predicted_payment_date: predictedDate.toISOString().split("T")[0],
        amount: total,
      };
    }

    results.invoicing = invoiceResults;

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
