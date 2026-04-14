# OrderFlow Suite — 90% Automatische Keten

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatiseer de volledige orderketen van email-inlezen tot facturatie zodat 90% zonder handmatige klik verloopt.

**Architecture:** De pipeline-trigger edge function is de orchestrator — hij evalueert bij elke statuswijziging of de volgende stap automatisch mag. We sluiten de 6 ontbrekende schakels: (1) auto-approve orders bij hoge confidence, (2) server-side VRP planning, (3) cron-activatie dispatch, (4) CMR/documentgeneratie, (5) auto-verzending facturen, (6) end-to-end ketenkoppeling via database webhooks.

**Tech Stack:** Supabase Edge Functions (Deno), React/Vite frontend, Supabase Realtime, jsPDF (documentgeneratie), Gemini 2.5 Flash (AI)

---

## Huidige keten en wat elke taak oplost

```
Email → poll-inbox → parse-order → [TAAK 1: auto-approve] → order PENDING
  → pipeline-trigger CONFIRM_ORDER → order CONFIRMED
  → [TAAK 2: planning-trigger server-side VRP] → trips aangemaakt, order PLANNED
  → pipeline-trigger DISPATCH_TRIP
  → [TAAK 3: dispatch-scheduler cron] → trip VERZONDEN → chauffeur notified
  → chauffeur levert af → trip COMPLETED
  → financial-trigger → [TAAK 5: auto-send factuur] → factuur verzonden
  → [TAAK 4: CMR/documenten] → bij trip creatie
  → [TAAK 6: webhooks koppelen] → pipeline-trigger automatisch getriggerd
```

---

## Task 1: Auto-Approve Orders bij Hoge Confidence

**Probleem:** `useInbox.ts` logt `wasAutoApproved: true` bij 95%+ confidence, maar de order blijft DRAFT — gebruiker moet nog klikken.

**Files:**
- Modify: `src/hooks/useInbox.ts:287-304` (na AI extractie, auto-approve logica)
- Modify: `src/hooks/useInbox.ts:819-837` (auto-extractie flow, zelfde aanpassing)
- Test: `src/__tests__/hooks/useInboxAutoApprove.test.ts` (nieuw)

- [ ] **Step 1: Write the failing test**

```typescript
// src/__tests__/hooks/useInboxAutoApprove.test.ts
import { describe, it, expect, vi } from "vitest";

describe("auto-approve logic", () => {
  it("should call createOrderMutation when confidence >= 95 and client_name present", () => {
    const normalizedConfidence = 97;
    const ext = { client_name: "Test BV" };
    const autoApprove = normalizedConfidence >= 95 && !!ext.client_name;
    expect(autoApprove).toBe(true);
  });

  it("should NOT auto-approve when confidence < 95", () => {
    const normalizedConfidence = 80;
    const ext = { client_name: "Test BV" };
    const autoApprove = normalizedConfidence >= 95 && !!ext.client_name;
    expect(autoApprove).toBe(false);
  });

  it("should NOT auto-approve when client_name is missing", () => {
    const normalizedConfidence = 98;
    const ext = { client_name: "" };
    const autoApprove = normalizedConfidence >= 95 && !!ext.client_name;
    expect(autoApprove).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes** (this is a pure logic test)

Run: `cd orderflow-suite && npx vitest run src/__tests__/hooks/useInboxAutoApprove.test.ts`
Expected: 3 PASS

- [ ] **Step 3: Modify useInbox.ts — add auto-approve after AI extraction (line ~300)**

In `src/hooks/useInbox.ts`, after the confidence store record block (line ~304), add auto-approve logic. Find this block (appears twice — in the test scenario handler around line 290 and in the auto-extraction effect around line 823):

```typescript
// After: setDecisionMap((prev) => ({ ...prev, [newOrder.id]: decision.id }));
// Add:
if (autoApprove) {
  // Build form from extracted data for createOrderMutation
  const autoForm = formData[newOrder.id];
  if (autoForm && !getFormErrors(autoForm)) {
    console.log(`[auto-approve] Order ${newOrder.id} confidence=${normalizedConfidence}% — auto-approving`);
    createOrderMutation.mutate({ id: newOrder.id, form: autoForm });
  }
}
```

Apply the same change in both locations:
1. Test scenario handler (~line 300, after `setDecisionMap`)
2. Auto-extraction effect (~line 833, after `setDecisionMap`)

The `createOrderMutation` already exists — it updates status to PENDING, links client, emits events, and resolves the confidence store decision.

- [ ] **Step 4: Add toast notification for auto-approved orders**

In the `createOrderMutation.onSuccess` callback (around line 437), add a distinct toast for auto-approved orders:

```typescript
// In onSuccess, check if this was auto-approved via the decision
const wasAutoApproved = decisionMap[id] && drafts.find(d => d.id === id)?.confidence_score && drafts.find(d => d.id === id)!.confidence_score! >= 95;
if (wasAutoApproved) {
  toast.success("Order automatisch goedgekeurd", { description: `Order #${order?.order_number} — confidence ${order?.confidence_score}%` });
} else {
  toast.success("Order aangemaakt", { description: `Order #${order?.order_number} is nu actief` });
}
```

- [ ] **Step 5: Run full test suite**

Run: `cd orderflow-suite && npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useInbox.ts src/__tests__/hooks/useInboxAutoApprove.test.ts
git commit -m "feat: auto-approve orders at 95%+ confidence with known client"
```

---

## Task 2: Server-Side VRP Planning in planning-trigger

**Probleem:** `planning-trigger` is een stub — het logt een event maar doet geen planning. De VRP-solver draait alleen client-side. We moeten de kern-logica server-side repliceren.

**Files:**
- Rewrite: `supabase/functions/planning-trigger/index.ts`
- Reference (read-only): `src/lib/vrpSolver.ts` (logica om te porten)
- Reference (read-only): `src/components/planning/planningUtils.ts` (haversine, getTotalWeight)

- [ ] **Step 1: Write planning-trigger with inline VRP solver**

De edge function moet:
1. Alle CONFIRMED orders voor dezelfde `planned_date` ophalen
2. Alle actieve voertuigen ophalen
3. VRP toewijzing berekenen (nearest-neighbor + constraint checks)
4. Trips + trip_stops aanmaken in de database
5. Order status naar PLANNED updaten

```typescript
// supabase/functions/planning-trigger/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Haversine distance ──
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const WAREHOUSE = { lat: 51.9225, lng: 4.4792 }; // Rotterdam default
const AVG_SPEED_KMH = 60;
const UNLOAD_MINUTES = 15;

interface Order {
  id: string;
  quantity: number | null;
  unit: string | null;
  weight_kg: number | null;
  is_weight_per_unit: boolean | null;
  requirements: string[] | null;
  time_window_start: string | null;
  time_window_end: string | null;
  geocoded_delivery_lat: number | null;
  geocoded_delivery_lng: number | null;
  geocoded_pickup_lat: number | null;
  geocoded_pickup_lng: number | null;
  pickup_address: string | null;
  delivery_address: string | null;
  order_number: string;
  client_name: string | null;
}

interface Vehicle {
  id: string;
  code: string;
  capacity_kg: number;
  capacity_pallets: number;
  features: string[];
  is_active: boolean;
}

function getTotalWeight(o: Order): number {
  if (!o.weight_kg) return 0;
  if (o.is_weight_per_unit && o.quantity) return o.weight_kg * o.quantity;
  return o.weight_kg;
}

function hasTag(o: Order, tag: string): boolean {
  return (o.requirements ?? []).some((r) => r.toUpperCase().includes(tag));
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { tenant_id, order_id } = await req.json();

    if (!tenant_id || !order_id) {
      return new Response(
        JSON.stringify({ error: "tenant_id and order_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1. Fetch the triggering order
    const { data: triggerOrder, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", order_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (orderErr || !triggerOrder) {
      return new Response(
        JSON.stringify({ error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (triggerOrder.status !== "CONFIRMED") {
      return new Response(
        JSON.stringify({ skipped: true, reason: `Order status is ${triggerOrder.status}, not CONFIRMED` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch all CONFIRMED orders for today (batch planning)
    const planDate = new Date().toISOString().slice(0, 10);

    const { data: allOrders } = await supabase
      .from("orders")
      .select("*")
      .eq("tenant_id", tenant_id)
      .eq("status", "CONFIRMED");

    const orders: Order[] = (allOrders ?? []).filter(
      (o: any) => o.geocoded_delivery_lat && o.geocoded_delivery_lng
    );

    if (orders.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No geocoded CONFIRMED orders" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 3. Fetch active vehicles
    const { data: vehicleRows } = await supabase
      .from("vehicles")
      .select("id, code, capacity_kg, capacity_pallets, features, is_active")
      .eq("tenant_id", tenant_id)
      .eq("is_active", true);

    const vehicles: Vehicle[] = (vehicleRows ?? []).map((v: any) => ({
      ...v,
      features: v.features ?? [],
    }));

    if (vehicles.length === 0) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "No active vehicles" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 4. Build coord map
    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const o of orders) {
      if (o.geocoded_delivery_lat && o.geocoded_delivery_lng) {
        coordMap.set(o.id, { lat: o.geocoded_delivery_lat, lng: o.geocoded_delivery_lng });
      }
    }

    // 5. Run VRP solver (greedy nearest-neighbor with constraints)
    // Sort by time window urgency
    const sorted = [...orders].sort((a, b) => {
      const urgA = a.time_window_end ? parseTimeToMinutes(a.time_window_end) : 9999;
      const urgB = b.time_window_end ? parseTimeToMinutes(b.time_window_end) : 9999;
      return urgA - urgB;
    });

    const assignments: Record<string, Order[]> = {};
    const vehicleWeight: Record<string, number> = {};
    const vehiclePallets: Record<string, number> = {};

    for (const v of vehicles) {
      assignments[v.id] = [];
      vehicleWeight[v.id] = 0;
      vehiclePallets[v.id] = 0;
    }

    const placed = new Set<string>();

    for (const order of sorted) {
      if (placed.has(order.id)) continue;

      const orderWeight = getTotalWeight(order);
      const orderPallets = order.quantity || 0;
      const isKoeling = hasTag(order, "KOELING");
      const isADR = hasTag(order, "ADR");
      const orderCoord = coordMap.get(order.id);

      let bestVehicle: string | null = null;
      let bestDist = Infinity;

      for (const v of vehicles) {
        if (vehicleWeight[v.id] + orderWeight > v.capacity_kg) continue;
        if (vehiclePallets[v.id] + orderPallets > v.capacity_pallets) continue;
        if (isKoeling && !v.features.includes("KOELING")) continue;
        if (isADR && !v.features.includes("ADR")) continue;

        // Distance heuristic
        let dist = 0;
        if (orderCoord && assignments[v.id].length > 0) {
          let minD = Infinity;
          for (const ex of assignments[v.id]) {
            const exCoord = coordMap.get(ex.id);
            if (exCoord) {
              const d = haversineKm(orderCoord, exCoord);
              if (d < minD) minD = d;
            }
          }
          dist = minD === Infinity ? 0 : minD;
        } else if (orderCoord) {
          dist = haversineKm(WAREHOUSE, orderCoord);
        }

        if (dist < bestDist) {
          bestDist = dist;
          bestVehicle = v.id;
        }
      }

      if (bestVehicle) {
        assignments[bestVehicle].push(order);
        vehicleWeight[bestVehicle] += orderWeight;
        vehiclePallets[bestVehicle] += orderPallets;
        placed.add(order.id);
      }
    }

    // 6. Create trips and trip_stops, update order status
    let tripsCreated = 0;
    let ordersPlanned = 0;

    for (const [vehicleId, vOrders] of Object.entries(assignments)) {
      if (vOrders.length === 0) continue;

      // Optimize route order (nearest-neighbor from warehouse)
      const optimized: Order[] = [];
      const remaining = [...vOrders];
      let currentPos = WAREHOUSE;

      while (remaining.length > 0) {
        let nearestIdx = 0;
        let nearestDist = Infinity;
        for (let i = 0; i < remaining.length; i++) {
          const coord = coordMap.get(remaining[i].id);
          if (coord) {
            const d = haversineKm(currentPos, coord);
            if (d < nearestDist) {
              nearestDist = d;
              nearestIdx = i;
            }
          }
        }
        const next = remaining.splice(nearestIdx, 1)[0];
        optimized.push(next);
        const nextCoord = coordMap.get(next.id);
        if (nextCoord) currentPos = nextCoord;
      }

      // Create trip
      const { data: trip, error: tripErr } = await supabase
        .from("trips")
        .insert({
          tenant_id,
          vehicle_id: vehicleId,
          dispatch_status: "GEPLAND",
          planned_date: planDate,
        })
        .select("id, trip_number")
        .single();

      if (tripErr || !trip) {
        console.error("Failed to create trip:", tripErr);
        continue;
      }

      tripsCreated++;

      // Create trip_stops
      const stops = [];
      for (let i = 0; i < optimized.length; i++) {
        const o = optimized[i];
        // Pickup stop
        stops.push({
          trip_id: trip.id,
          order_id: o.id,
          stop_type: "OPHALEN",
          stop_sequence: i * 2 + 1,
          stop_status: "GEPLAND",
          planned_address: o.pickup_address,
          planned_time: o.time_window_start ? `${planDate}T${o.time_window_start}:00` : null,
        });
        // Delivery stop
        stops.push({
          trip_id: trip.id,
          order_id: o.id,
          stop_type: "AFLEVEREN",
          stop_sequence: i * 2 + 2,
          stop_status: "GEPLAND",
          planned_address: o.delivery_address,
          planned_time: o.time_window_end ? `${planDate}T${o.time_window_end}:00` : null,
        });
      }

      if (stops.length > 0) {
        await supabase.from("trip_stops").insert(stops);
      }

      // Update orders to PLANNED
      for (const o of optimized) {
        await supabase
          .from("orders")
          .update({ status: "PLANNED", vehicle_id: vehicleId })
          .eq("id", o.id);
        ordersPlanned++;
      }
    }

    // 7. Record planning event
    await supabase.from("planning_events").insert({
      tenant_id,
      trigger_type: "NEW_ORDER",
      trigger_entity_id: order_id,
      orders_evaluated: orders.length,
      orders_assigned: ordersPlanned,
      orders_changed: 0,
      confidence: ordersPlanned > 0 ? Math.round((ordersPlanned / orders.length) * 100) : 0,
      planning_duration_ms: 0,
      auto_executed: true,
    });

    return new Response(
      JSON.stringify({
        success: true,
        trips_created: tripsCreated,
        orders_planned: ordersPlanned,
        orders_evaluated: orders.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("planning-trigger error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 2: Test locally with Supabase CLI**

Run: `cd orderflow-suite && npx supabase functions serve planning-trigger --no-verify-jwt`

Then test with curl:
```bash
curl -X POST http://localhost:54321/functions/v1/planning-trigger \
  -H "Content-Type: application/json" \
  -d '{"tenant_id":"00000000-0000-0000-0000-000000000001","order_id":"<a confirmed order id>"}'
```

Expected: `{ "success": true, "trips_created": N, "orders_planned": N }`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/planning-trigger/index.ts
git commit -m "feat: implement server-side VRP solver in planning-trigger"
```

---

## Task 3: Activeer Dispatch Scheduler Cron

**Probleem:** `dispatch-scheduler` is volledig geimplementeerd maar de cron is niet geconfigureerd.

**Files:**
- Create: `supabase/functions/dispatch-scheduler/cron.sql`
- Modify: `supabase/functions/dispatch-scheduler/index.ts` (kleine fix: ook GEPLAND trips meenemen)

- [ ] **Step 1: Maak cron SQL migratie**

```sql
-- supabase/functions/dispatch-scheduler/cron.sql
-- Run this in Supabase SQL Editor to activate the dispatch cron

-- Enable pg_cron if not already
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule dispatch-scheduler every 5 minutes
SELECT cron.schedule(
  'dispatch-scheduler',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/dispatch-scheduler',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

- [ ] **Step 2: Update dispatch-scheduler to also handle GEPLAND trips**

In `supabase/functions/dispatch-scheduler/index.ts` line 57, change:

```typescript
// OLD:
.eq("dispatch_status", "VERZENDKLAAR")

// NEW — also pick up GEPLAND trips (from auto-planning):
.in("dispatch_status", ["VERZENDKLAAR", "GEPLAND"])
```

- [ ] **Step 3: Create dispatch_rules seed for dev tenant**

```sql
-- Run in SQL Editor for dev tenant
INSERT INTO dispatch_rules (tenant_id, auto_dispatch_enabled, dispatch_lead_time_min)
VALUES ('00000000-0000-0000-0000-000000000001', true, 60)
ON CONFLICT (tenant_id) DO UPDATE SET auto_dispatch_enabled = true;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/dispatch-scheduler/
git commit -m "feat: activate dispatch-scheduler cron, include GEPLAND trips"
```

---

## Task 4: CMR & Document Generatie

**Probleem:** Geen automatische documentgeneratie (CMR, vrachtbrief, labels).

**Files:**
- Create: `supabase/functions/generate-documents/index.ts`

- [ ] **Step 1: Install jsPDF in edge function context**

Edge functions use ESM imports. We'll use jsPDF via esm.sh:

```typescript
import jsPDF from "https://esm.sh/jspdf@2.5.2";
```

- [ ] **Step 2: Write generate-documents edge function**

```typescript
// supabase/functions/generate-documents/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import jsPDF from "https://esm.sh/jspdf@2.5.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "https://orderflow-suite.vercel.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { trip_id, tenant_id, document_type } = await req.json();

    if (!trip_id || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "trip_id and tenant_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch trip with stops and orders
    const { data: trip } = await supabase
      .from("trips")
      .select("*, trip_stops(*, orders:order_id(*))")
      .eq("id", trip_id)
      .single();

    if (!trip) {
      return new Response(
        JSON.stringify({ error: "Trip not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, settings")
      .eq("id", tenant_id)
      .single();

    const docType = document_type || "cmr";
    const doc = new jsPDF();

    if (docType === "cmr") {
      // CMR Vrachtbrief
      doc.setFontSize(18);
      doc.text("CMR VRACHTBRIEF", 105, 20, { align: "center" });

      doc.setFontSize(10);
      doc.text(`Vervoerder: ${tenant?.name || ""}`, 14, 35);
      doc.text(`Rit: #${trip.trip_number}`, 14, 42);
      doc.text(`Datum: ${trip.planned_date}`, 14, 49);
      doc.text(`CMR Nr: CMR-${trip.trip_number}-${Date.now().toString(36).toUpperCase()}`, 14, 56);

      let y = 70;
      doc.setFontSize(12);
      doc.text("Stops:", 14, y);
      y += 8;

      doc.setFontSize(9);
      const stops = trip.trip_stops || [];
      for (const stop of stops) {
        const order = stop.orders;
        const line = `${stop.stop_sequence}. ${stop.stop_type} — ${stop.planned_address || "Onbekend"}`;
        doc.text(line, 14, y);
        y += 6;
        if (order) {
          doc.text(`   Order: ${order.order_number} | ${order.client_name || ""} | ${order.quantity || 0} ${order.unit || ""}`, 14, y);
          y += 6;
        }
        if (y > 270) { doc.addPage(); y = 20; }
      }

      // Signature fields
      y += 15;
      doc.setFontSize(10);
      doc.text("Handtekening afzender:", 14, y);
      doc.text("Handtekening vervoerder:", 105, y);
      doc.line(14, y + 15, 90, y + 15);
      doc.line(105, y + 15, 190, y + 15);
    }

    // Upload PDF to Supabase Storage
    const pdfBytes = doc.output("arraybuffer");
    const fileName = `${docType}-${trip.trip_number}-${Date.now()}.pdf`;
    const storagePath = `documents/${tenant_id}/${fileName}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf" });

    if (uploadErr) {
      console.error("Upload error:", uploadErr);
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(storagePath);

    // Update order with CMR number if CMR
    if (docType === "cmr") {
      const cmrNumber = `CMR-${trip.trip_number}-${Date.now().toString(36).toUpperCase()}`;
      const orderIds = (trip.trip_stops || [])
        .map((s: any) => s.order_id)
        .filter(Boolean);

      for (const oid of orderIds) {
        await supabase
          .from("orders")
          .update({ cmr_number: cmrNumber, cmr_generated_at: new Date().toISOString() })
          .eq("id", oid);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        document_type: docType,
        file_name: fileName,
        url: urlData?.publicUrl,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("generate-documents error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
```

- [ ] **Step 3: Create Supabase storage bucket**

```sql
-- Run in SQL Editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/generate-documents/
git commit -m "feat: add CMR/document generation edge function with PDF upload"
```

---

## Task 5: Auto-Verzending Facturen

**Probleem:** `financial-trigger` maakt altijd `concept` facturen. Bij bekende klanten met rate card moet de factuur automatisch verzonden worden.

**Files:**
- Modify: `supabase/functions/financial-trigger/index.ts:249-270` (invoice creation)

- [ ] **Step 1: Add auto-send logic to financial-trigger**

Replace the invoice insert block (line ~252-272). After determining `dueDate`, add:

```typescript
// Determine if invoice should auto-send
// Auto-send when: rate card exists (already confirmed above) + client has payment_terms
const shouldAutoSend = !!client.payment_terms && client.payment_terms > 0;
const invoiceStatus = shouldAutoSend ? "verzonden" : "concept";
```

Then change the insert to use `invoiceStatus`:

```typescript
const { data: invoice, error: invErr } = await supabase
  .from("invoices")
  .insert({
    // ... all existing fields ...
    status: invoiceStatus,  // was hardcoded "concept"
    // ... rest ...
  })
```

- [ ] **Step 2: Send invoice email when auto-sent**

After the invoice insert succeeds and `shouldAutoSend` is true, call send-notification:

```typescript
if (shouldAutoSend && invoice) {
  // Call send-notification to email invoice
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseServiceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        trigger_event: "INVOICE_SENT",
        tenant_id: tenantId,
        order_id: clientOrders[0]?.id,
        extra_variables: {
          invoice_number: invoiceNumber,
          invoice_total: `EUR ${total.toFixed(2)}`,
          due_date: dueDate,
        },
      }),
    });
  } catch (notifyErr) {
    console.error("Auto-send notification failed:", notifyErr);
    // Don't fail the whole trigger for a notification error
  }
}
```

- [ ] **Step 3: Update auto_invoice_log**

Change `was_auto_sent: false` to:

```typescript
was_auto_sent: shouldAutoSend,
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/financial-trigger/index.ts
git commit -m "feat: auto-send invoices for clients with payment terms and rate cards"
```

---

## Task 6: End-to-End Ketenkoppeling via Database Webhooks

**Probleem:** `pipeline-trigger` wordt nergens automatisch aangeroepen. De status-wijzigingen moeten database webhooks triggeren die de pipeline voeden.

**Files:**
- Create: `supabase/migrations/enable_pipeline_webhooks.sql`
- Modify: `supabase/functions/pipeline-trigger/index.ts:256-282` (add calls to planning-trigger en generate-documents)

- [ ] **Step 1: Create database webhook SQL**

```sql
-- supabase/migrations/enable_pipeline_webhooks.sql
-- Webhook: orders status change -> pipeline-trigger
CREATE OR REPLACE FUNCTION public.notify_pipeline_on_order_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/pipeline-trigger',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'entity_type', 'order',
        'entity_id', NEW.id,
        'previous_status', OLD.status,
        'new_status', NEW.status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipeline_order_status ON public.orders;
CREATE TRIGGER trg_pipeline_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.notify_pipeline_on_order_change();

-- Webhook: trips dispatch_status change -> pipeline-trigger
CREATE OR REPLACE FUNCTION public.notify_pipeline_on_trip_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.dispatch_status IS DISTINCT FROM NEW.dispatch_status THEN
    PERFORM net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/pipeline-trigger',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'tenant_id', NEW.tenant_id,
        'entity_type', 'trip',
        'entity_id', NEW.id,
        'previous_status', OLD.dispatch_status,
        'new_status', NEW.dispatch_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pipeline_trip_status ON public.trips;
CREATE TRIGGER trg_pipeline_trip_status
  AFTER UPDATE OF dispatch_status ON public.trips
  FOR EACH ROW
  WHEN (OLD.dispatch_status IS DISTINCT FROM NEW.dispatch_status)
  EXECUTE FUNCTION public.notify_pipeline_on_trip_change();
```

- [ ] **Step 2: Expand pipeline-trigger actions to call downstream functions**

In `supabase/functions/pipeline-trigger/index.ts`, in the `shouldAuto` block (line ~256), expand the switch cases:

```typescript
case "CONFIRM_ORDER":
  // Confirm order, then trigger planning
  updateResult = await supabase.from("orders").update({ status: "CONFIRMED" }).eq("id", entityId);
  // Trigger planning asynchronously
  if (!updateResult.error) {
    fetch(`${supabaseUrl}/functions/v1/planning-trigger`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenant_id: tenantId, order_id: entityId }),
    }).catch((e) => console.error("planning-trigger call failed:", e));
  }
  break;

case "DISPATCH_TRIP":
  updateResult = await supabase.from("trips").update({ dispatch_status: "VERZONDEN", dispatched_at: new Date().toISOString() }).eq("id", entityId);
  // Generate CMR document
  if (!updateResult.error) {
    fetch(`${supabaseUrl}/functions/v1/generate-documents`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trip_id: entityId, tenant_id: tenantId, document_type: "cmr" }),
    }).catch((e) => console.error("generate-documents call failed:", e));
  }
  break;
```

- [ ] **Step 3: Enable autonomy for dev tenant**

```sql
-- Run in SQL Editor
UPDATE tenants
SET settings = jsonb_set(
  COALESCE(settings, '{}'),
  '{autonomy}',
  '{
    "enabled": true,
    "global_threshold": 90,
    "thresholds": {
      "ORDER_INTAKE": 95,
      "PLANNING": 85,
      "DISPATCH": 80,
      "INVOICING": 90
    }
  }'::jsonb
)
WHERE id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/ supabase/functions/pipeline-trigger/index.ts
git commit -m "feat: wire end-to-end pipeline via DB webhooks + downstream function calls"
```

---

## Verificatie: End-to-End Test

Na alle 6 taken, test de volledige keten:

- [ ] **Step 1: Stuur een test-email naar de poll-inbox**

Of trigger handmatig:
```bash
curl -X POST <SUPABASE_URL>/functions/v1/poll-inbox \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
```

- [ ] **Step 2: Controleer de flow in de database**

```sql
-- Check order werd automatisch aangemaakt en bevestigd
SELECT id, order_number, status, confidence_score, created_at
FROM orders
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 5;

-- Check trips werden aangemaakt
SELECT id, trip_number, dispatch_status, planned_date
FROM trips
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 5;

-- Check pipeline events
SELECT entity_type, event_type, evaluation_result, action_taken
FROM pipeline_events
WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 10;

-- Check invoices
SELECT invoice_number, status, total, was_auto_sent
FROM invoices i
JOIN auto_invoice_log a ON a.invoice_id = i.id
WHERE i.tenant_id = '00000000-0000-0000-0000-000000000001'
ORDER BY i.created_at DESC LIMIT 5;
```

- [ ] **Step 3: Controleer documenten**

```sql
-- Check CMR nummers
SELECT order_number, cmr_number, cmr_generated_at
FROM orders
WHERE cmr_number IS NOT NULL
ORDER BY cmr_generated_at DESC LIMIT 5;
```

Expected flow:
```
Email → poll-inbox → DRAFT order (auto-parsed)
  → useInbox auto-approve → PENDING
  → DB webhook → pipeline-trigger → CONFIRMED
  → pipeline-trigger → planning-trigger → trips + PLANNED
  → DB webhook → pipeline-trigger → DISPATCH_TRIP
  → dispatch-scheduler cron → VERZONDEN + CMR gegenereerd
  → chauffeur levert af → COMPLETED
  → financial-trigger → factuur auto-verzonden
```
