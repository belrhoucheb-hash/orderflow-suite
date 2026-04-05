import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanOrder, Assignments } from "@/components/planning/types";
import type { FleetVehicle } from "@/hooks/useVehicles";
import type { GeoCoord } from "@/data/geoData";
import type {
  PlanningResult,
  PlanningConfidence,
  WhatIfResult,
  PlanningTriggerType,
} from "@/types/planning";
import { solveVRP, incrementalSolve, scoreSolution } from "@/lib/vrpSolver";
import { shouldAutoExecute, recordDecision } from "@/lib/confidenceEngine";
import { DEFAULT_AUTONOMY_CONFIG } from "@/types/confidence";

// -- Helpers ──────────────────────────────────────────────────

/**
 * Fetch a single order by ID from the database and map it to PlanOrder shape.
 */
async function fetchOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
): Promise<PlanOrder | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, pickup_address, delivery_address, " +
      "quantity, weight_kg, requirements, is_weight_per_unit, " +
      "time_window_start, time_window_end, pickup_time_from, pickup_time_to, " +
      "delivery_time_from, delivery_time_to, " +
      "geocoded_pickup_lat, geocoded_pickup_lng, " +
      "geocoded_delivery_lat, geocoded_delivery_lng, " +
      "delivery_date, pickup_date"
    )
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .single();

  if (error || !data) return null;
  return data as PlanOrder;
}

/**
 * Fetch all orders for a given date.
 */
async function fetchOrdersForDate(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
): Promise<PlanOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, client_name, pickup_address, delivery_address, " +
      "quantity, weight_kg, requirements, is_weight_per_unit, " +
      "time_window_start, time_window_end, pickup_time_from, pickup_time_to, " +
      "delivery_time_from, delivery_time_to, " +
      "geocoded_pickup_lat, geocoded_pickup_lng, " +
      "geocoded_delivery_lat, geocoded_delivery_lng, " +
      "delivery_date, pickup_date"
    )
    .eq("tenant_id", tenantId)
    .eq("delivery_date", date)
    .eq("status", "CONFIRMED");

  if (error || !data) return [];
  return data as PlanOrder[];
}

/**
 * Fetch current draft assignments for a date.
 */
async function fetchCurrentAssignments(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  allOrders: PlanOrder[],
): Promise<Assignments> {
  const { data, error } = await supabase
    .from("planning_drafts")
    .select("vehicle_id, order_ids")
    .eq("tenant_id", tenantId)
    .eq("planned_date", date);

  if (error || !data) return {};

  const orderMap = new Map(allOrders.map((o) => [o.id, o]));
  const assignments: Assignments = {};

  for (const row of data) {
    const orders: PlanOrder[] = [];
    for (const oid of (row.order_ids as string[])) {
      const order = orderMap.get(oid);
      if (order) orders.push(order);
    }
    if (orders.length > 0) {
      assignments[row.vehicle_id] = orders;
    }
  }

  return assignments;
}

/**
 * Record a planning event in the database.
 */
async function recordPlanningEvent(
  supabase: SupabaseClient,
  tenantId: string,
  result: PlanningResult,
): Promise<void> {
  const assignmentSnapshot: Record<string, string[]> = {};
  for (const [vId, orders] of Object.entries(result.assignments)) {
    assignmentSnapshot[vId] = orders.map((o) => o.id);
  }

  await supabase.from("planning_events").insert({
    tenant_id: tenantId,
    trigger_type: result.trigger_type,
    trigger_entity_id: result.trigger_entity_id,
    orders_evaluated: result.orders_evaluated,
    orders_assigned: result.orders_assigned,
    orders_changed: result.orders_changed,
    confidence: result.confidence.score,
    planning_duration_ms: result.planning_duration_ms,
    auto_executed: result.auto_executed,
    assignments_snapshot: assignmentSnapshot,
  });
}

/**
 * Count how many orders are assigned across all vehicles.
 */
function countAssigned(assignments: Assignments): number {
  return Object.values(assignments).reduce((sum, orders) => sum + orders.length, 0);
}

/**
 * Count orders that changed vehicle between two assignment sets.
 */
function countChanges(before: Assignments, after: Assignments): number {
  // Build order -> vehicle maps
  const beforeMap = new Map<string, string>();
  for (const [vId, orders] of Object.entries(before)) {
    for (const o of orders) beforeMap.set(o.id, vId);
  }

  let changes = 0;
  for (const [vId, orders] of Object.entries(after)) {
    for (const o of orders) {
      const prevVehicle = beforeMap.get(o.id);
      if (prevVehicle !== vId) changes++;
    }
  }
  return changes;
}

// -- Public API ───────────────────────────────────────────────

/**
 * Called when an order is confirmed. Tries incremental insertion into
 * existing assignments. Scores the result and checks if it should be
 * auto-executed or queued for human validation.
 */
export async function onOrderConfirmed(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<PlanningResult> {
  const startMs = performance.now();

  // Fetch the confirmed order
  const order = await fetchOrder(supabase, tenantId, orderId);

  if (!order) {
    const durationMs = Math.round(performance.now() - startMs);
    return {
      assignments: {},
      confidence: { score: 0, utilization_pct: 0, avg_window_slack_min: 0, efficiency_ratio: 0 },
      trigger_type: "NEW_ORDER",
      trigger_entity_id: orderId,
      orders_evaluated: 0,
      orders_assigned: 0,
      orders_changed: 0,
      planning_duration_ms: durationMs,
      auto_executed: false,
      inserted_into: null,
    };
  }

  // Fetch current assignments for this order's delivery date
  const date = order.delivery_date || new Date().toISOString().slice(0, 10);
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Try incremental insertion
  const { assignments: newAssignments, insertedInto } = incrementalSolve(
    order,
    currentAssignments,
    vehicles,
    coordMap,
  );

  // Score the solution
  const confidence = scoreSolution(newAssignments, vehicles, coordMap);

  const ordersAssigned = insertedInto ? 1 : 0;
  const ordersChanged = countChanges(currentAssignments, newAssignments);

  // Check if we should auto-execute
  const autoResult = await shouldAutoExecute(
    supabase,
    DEFAULT_AUTONOMY_CONFIG,
    tenantId,
    "PLANNING",
    confidence.score,
  );

  const durationMs = Math.round(performance.now() - startMs);

  const result: PlanningResult = {
    assignments: newAssignments,
    confidence,
    trigger_type: "NEW_ORDER",
    trigger_entity_id: orderId,
    orders_evaluated: 1,
    orders_assigned: ordersAssigned,
    orders_changed: ordersChanged,
    planning_duration_ms: durationMs,
    auto_executed: autoResult.auto,
    inserted_into: insertedInto,
  };

  // Record the planning event
  await recordPlanningEvent(supabase, tenantId, result);

  // Record the decision for confidence learning
  await recordDecision(supabase, {
    tenantId,
    decisionType: "PLANNING",
    entityType: "order",
    entityId: orderId,
    inputConfidence: confidence.score,
    modelConfidence: confidence.score,
    proposedAction: {
      inserted_into: insertedInto,
      utilization_pct: confidence.utilization_pct,
      efficiency_ratio: confidence.efficiency_ratio,
    },
    resolution: autoResult.auto ? "AUTO_EXECUTED" : "PENDING",
  });

  return result;
}

/**
 * Full re-solve of all orders for a given date. Compares with current
 * assignments to measure improvement and record changes.
 */
export async function periodicOptimize(
  supabase: SupabaseClient,
  tenantId: string,
  date: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<PlanningResult> {
  const startMs = performance.now();

  // Fetch all confirmed orders for the date
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Full re-solve
  const newAssignments = solveVRP(allOrders, vehicles, coordMap);

  // Score new solution
  const confidence = scoreSolution(newAssignments, vehicles, coordMap);

  const ordersAssigned = countAssigned(newAssignments);
  const ordersChanged = countChanges(currentAssignments, newAssignments);

  // Check if we should auto-execute the improved plan
  const autoResult = await shouldAutoExecute(
    supabase,
    DEFAULT_AUTONOMY_CONFIG,
    tenantId,
    "PLANNING",
    confidence.score,
  );

  const durationMs = Math.round(performance.now() - startMs);

  const result: PlanningResult = {
    assignments: newAssignments,
    confidence,
    trigger_type: "SCHEDULE",
    trigger_entity_id: null,
    orders_evaluated: allOrders.length,
    orders_assigned: ordersAssigned,
    orders_changed: ordersChanged,
    planning_duration_ms: durationMs,
    auto_executed: autoResult.auto,
    inserted_into: null,
  };

  // Record planning event
  await recordPlanningEvent(supabase, tenantId, result);

  // Record decision for confidence feedback loop
  await recordDecision(supabase, {
    tenantId,
    decisionType: "PLANNING",
    entityType: "order",
    entityId: date, // Use date as entity for periodic optimizations
    inputConfidence: confidence.score,
    modelConfidence: confidence.score,
    proposedAction: {
      trigger: "SCHEDULE",
      orders_evaluated: allOrders.length,
      orders_assigned: ordersAssigned,
      orders_changed: ordersChanged,
    },
    resolution: autoResult.auto ? "AUTO_EXECUTED" : "PENDING",
  });

  return result;
}

/**
 * Simulate removing a vehicle from the fleet and re-solving.
 * Returns which orders are affected, reassigned, and unassignable.
 */
export async function simulateVehicleRemoval(
  supabase: SupabaseClient,
  tenantId: string,
  vehicleId: string,
  date: string,
  vehicles: FleetVehicle[],
  coordMap: Map<string, GeoCoord>,
): Promise<WhatIfResult> {
  // Fetch current state
  const allOrders = await fetchOrdersForDate(supabase, tenantId, date);
  const currentAssignments = await fetchCurrentAssignments(supabase, tenantId, date, allOrders);

  // Orders currently on the removed vehicle
  const affectedOrders = currentAssignments[vehicleId] || [];

  // Remove the vehicle from the available list
  const remainingVehicles = vehicles.filter((v) => v.id !== vehicleId);

  // Build assignments without the removed vehicle
  const assignmentsWithout: Assignments = {};
  for (const [vId, orders] of Object.entries(currentAssignments)) {
    if (vId !== vehicleId) {
      assignmentsWithout[vId] = [...orders];
    }
  }

  // Re-solve: try to place affected orders into remaining vehicles
  const newAssignments = solveVRP(affectedOrders, remainingVehicles, coordMap, assignmentsWithout);

  // Determine which affected orders got reassigned
  const reassignedIds = new Set<string>();
  for (const [vId, orders] of Object.entries(newAssignments)) {
    if (vId === vehicleId) continue;
    for (const order of orders) {
      if (affectedOrders.some((ao) => ao.id === order.id)) {
        reassignedIds.add(order.id);
      }
    }
  }

  const reassignedOrders = affectedOrders.filter((o) => reassignedIds.has(o.id));
  const unassignableOrders = affectedOrders.filter((o) => !reassignedIds.has(o.id));

  // Score the new solution
  const confidence = scoreSolution(newAssignments, remainingVehicles, coordMap);

  return {
    removed_vehicle_id: vehicleId,
    affected_orders: affectedOrders,
    reassigned_orders: reassignedOrders,
    unassignable_orders: unassignableOrders,
    new_assignments: newAssignments,
    confidence,
  };
}
