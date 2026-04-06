// ─── Order Status State Machine (pure, no Supabase dependency) ──────────────
export type OrderStatus = "DRAFT" | "PENDING" | "PLANNED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";

/** Map of each status to its allowed next statuses. */
export const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING", "CANCELLED"],
  PENDING: ["PLANNED", "CANCELLED"],
  PLANNED: ["IN_TRANSIT", "CANCELLED"],
  IN_TRANSIT: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],    // terminal state
  CANCELLED: [],    // terminal state
};

/**
 * Check whether a status transition is allowed.
 * Also accepts legacy statuses (OPEN, WAITING) and maps them to the new model.
 */
export function isValidStatusTransition(from: string, to: string): boolean {
  // Map legacy statuses used in existing data to the new state machine
  const legacyMap: Record<string, OrderStatus> = {
    OPEN: "PENDING",
    WAITING: "PENDING",
    CONFIRMED: "PENDING",
  };
  const normFrom = (legacyMap[from] ?? from) as OrderStatus;
  const normTo = (legacyMap[to] ?? to) as OrderStatus;

  const allowed = VALID_TRANSITIONS[normFrom];
  if (!allowed) return false; // unknown source status
  return allowed.includes(normTo);
}
