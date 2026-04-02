import { describe, it, expect } from "vitest";
import { isValidStatusTransition } from "@/hooks/useOrders";

describe("Order Status State Machine", () => {
  // ─── Valid forward transitions ─────────────────────────────────────
  describe("valid transitions", () => {
    it("DRAFT -> PENDING", () => {
      expect(isValidStatusTransition("DRAFT", "PENDING")).toBe(true);
    });

    it("PENDING -> PLANNED", () => {
      expect(isValidStatusTransition("PENDING", "PLANNED")).toBe(true);
    });

    it("PLANNED -> IN_TRANSIT", () => {
      expect(isValidStatusTransition("PLANNED", "IN_TRANSIT")).toBe(true);
    });

    it("IN_TRANSIT -> DELIVERED", () => {
      expect(isValidStatusTransition("IN_TRANSIT", "DELIVERED")).toBe(true);
    });
  });

  // ─── Cancellation from any active state ────────────────────────────
  describe("cancellation transitions", () => {
    it.each(["DRAFT", "PENDING", "PLANNED", "IN_TRANSIT"])(
      "%s -> CANCELLED is allowed",
      (from) => {
        expect(isValidStatusTransition(from, "CANCELLED")).toBe(true);
      },
    );
  });

  // ─── Terminal states ───────────────────────────────────────────────
  describe("terminal states cannot transition", () => {
    it("DELIVERED -> anything is rejected", () => {
      expect(isValidStatusTransition("DELIVERED", "DRAFT")).toBe(false);
      expect(isValidStatusTransition("DELIVERED", "PENDING")).toBe(false);
      expect(isValidStatusTransition("DELIVERED", "PLANNED")).toBe(false);
      expect(isValidStatusTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
      expect(isValidStatusTransition("DELIVERED", "CANCELLED")).toBe(false);
    });

    it("CANCELLED -> anything is rejected", () => {
      expect(isValidStatusTransition("CANCELLED", "DRAFT")).toBe(false);
      expect(isValidStatusTransition("CANCELLED", "PENDING")).toBe(false);
    });
  });

  // ─── Invalid / backwards transitions ───────────────────────────────
  describe("invalid transitions", () => {
    it("DELIVERED -> DRAFT is rejected", () => {
      expect(isValidStatusTransition("DELIVERED", "DRAFT")).toBe(false);
    });

    it("IN_TRANSIT -> PENDING (backwards) is rejected", () => {
      expect(isValidStatusTransition("IN_TRANSIT", "PENDING")).toBe(false);
    });

    it("PENDING -> DRAFT (backwards) is rejected", () => {
      expect(isValidStatusTransition("PENDING", "DRAFT")).toBe(false);
    });

    it("DRAFT -> DELIVERED (skipping steps) is rejected", () => {
      expect(isValidStatusTransition("DRAFT", "DELIVERED")).toBe(false);
    });

    it("DRAFT -> IN_TRANSIT (skipping steps) is rejected", () => {
      expect(isValidStatusTransition("DRAFT", "IN_TRANSIT")).toBe(false);
    });

    it("PENDING -> IN_TRANSIT (skipping PLANNED) is rejected", () => {
      expect(isValidStatusTransition("PENDING", "IN_TRANSIT")).toBe(false);
    });
  });

  // ─── Legacy status mapping ─────────────────────────────────────────
  describe("legacy status mapping", () => {
    it("OPEN maps to PENDING, so OPEN -> PLANNED is valid", () => {
      expect(isValidStatusTransition("OPEN", "PLANNED")).toBe(true);
    });

    it("WAITING maps to PENDING, so WAITING -> PLANNED is valid", () => {
      expect(isValidStatusTransition("WAITING", "PLANNED")).toBe(true);
    });

    it("OPEN -> CANCELLED is valid", () => {
      expect(isValidStatusTransition("OPEN", "CANCELLED")).toBe(true);
    });

    it("OPEN -> DRAFT (backwards from mapped PENDING) is rejected", () => {
      expect(isValidStatusTransition("OPEN", "DRAFT")).toBe(false);
    });
  });

  // ─── Unknown statuses ──────────────────────────────────────────────
  describe("unknown statuses", () => {
    it("unknown source status returns false", () => {
      expect(isValidStatusTransition("NONEXISTENT", "PENDING")).toBe(false);
    });

    it("unknown target status returns false", () => {
      expect(isValidStatusTransition("DRAFT", "NONEXISTENT")).toBe(false);
    });
  });
});
