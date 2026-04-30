// src/__tests__/components/TimeWindowManager.test.tsx
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

vi.mock("@/hooks/useTimeWindows", () => ({
  useTimeWindows: vi.fn().mockReturnValue({
    data: [
      { id: "tw1", day_of_week: 0, open_time: "08:00", close_time: "17:00", slot_duration_min: 30, max_concurrent_slots: 2, notes: null },
      { id: "tw2", day_of_week: 2, open_time: "09:00", close_time: "12:00", slot_duration_min: 60, max_concurrent_slots: 1, notes: "Woensdag ochtend" },
    ],
    isLoading: false,
  }),
  useCreateTimeWindow: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTimeWindow: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteTimeWindow: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
}));

import TimeWindowManager from "@/components/clients/TimeWindowManager";

const DAY_NAMES = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    QueryClientProvider({ client: qc, children });
}

describe("TimeWindowManager", () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders time windows as rows", () => {
    render(<TimeWindowManager locationId="loc1" tenantId="t1" />, { wrapper: createWrapper() });
    expect(screen.getByText("Maandag")).toBeDefined();
    expect(screen.getByText("08:00")).toBeDefined();
    expect(screen.getByText("17:00")).toBeDefined();
    expect(screen.getByText("Woensdag")).toBeDefined();
  });

  it("shows add button", () => {
    render(<TimeWindowManager locationId="loc1" tenantId="t1" />, { wrapper: createWrapper() });
    expect(screen.getByRole("button", { name: /tijdvenster toevoegen/i })).toBeDefined();
  });
});
