import { cleanup, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, afterEach } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: "inc-1" }, error: null }) }) }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
  },
}));

vi.mock("@/lib/podStorage", () => ({
  uploadPodBlob: vi.fn().mockResolvedValue("path/photo.jpg"),
}));

vi.mock("@/components/chauffeur/CameraCapture", () => ({
  CameraCapture: () => null,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

import { IncidentDialog } from "@/components/chauffeur/IncidentDialog";

describe("IncidentDialog", () => {
  afterEach(() => cleanup());

  it("rendert vier categorieën in stap 1", () => {
    render(
      <IncidentDialog
        open
        onOpenChange={() => {}}
        tenantId="tenant-1"
        tripStopId="stop-1"
        orderId="order-1"
        driverId="driver-1"
        onSubmitted={() => {}}
      />,
    );
    expect(screen.getByText("Probleem melden")).toBeTruthy();
    expect(screen.getByText("Schade")).toBeTruthy();
    expect(screen.getByText("Geweigerd door ontvanger")).toBeTruthy();
    expect(screen.getByText("Geen toegang")).toBeTruthy();
    expect(screen.getByText("Onbereikbaar")).toBeTruthy();
  });
});
