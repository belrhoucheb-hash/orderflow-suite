import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

// Mock supabase
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
const mockSelect = vi.fn(() => ({
  eq: vi.fn().mockReturnThis(),
  order: vi.fn().mockResolvedValue({ data: [], error: null }),
  maybeSingle: mockMaybeSingle,
}));
const mockGetUser = vi.fn().mockResolvedValue({ data: { user: null } });

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
    auth: {
      getUser: mockGetUser,
    },
  },
}));

describe("clientPortal types", () => {
  it("exports all portal role labels", async () => {
    const { PORTAL_ROLE_LABELS } = await import("@/types/clientPortal");
    expect(Object.keys(PORTAL_ROLE_LABELS)).toHaveLength(3);
    expect(PORTAL_ROLE_LABELS.viewer).toBe("Alleen bekijken");
    expect(PORTAL_ROLE_LABELS.editor).toBe("Bewerken");
    expect(PORTAL_ROLE_LABELS.admin).toBe("Beheerder");
  });

  it("exports all order source labels", async () => {
    const { ORDER_SOURCE_LABELS } = await import("@/types/clientPortal");
    expect(Object.keys(ORDER_SOURCE_LABELS)).toHaveLength(4);
    expect(ORDER_SOURCE_LABELS.INTERN).toBe("Intern");
    expect(ORDER_SOURCE_LABELS.PORTAL).toBe("Portaal");
  });

  it("exports all portal module labels", async () => {
    const { PORTAL_MODULE_LABELS } = await import("@/types/clientPortal");
    expect(Object.keys(PORTAL_MODULE_LABELS)).toHaveLength(6);
    expect(PORTAL_MODULE_LABELS.orders).toBe("Orders");
    expect(PORTAL_MODULE_LABELS.tracking).toBe("Tracking");
  });

  it("exports order source colors for all sources", async () => {
    const { ORDER_SOURCE_COLORS } = await import("@/types/clientPortal");
    expect(ORDER_SOURCE_COLORS.PORTAL).toContain("purple");
    expect(ORDER_SOURCE_COLORS.EMAIL).toContain("blue");
  });
});
