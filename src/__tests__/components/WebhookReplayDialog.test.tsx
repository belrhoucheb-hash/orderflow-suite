// WebhookReplayDialog: opent met initial payload, kan toggelen naar
// edit-modus en submit roept de replay-mutation aan.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncLogRow } from "@/hooks/useConnectors";

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({ tenant: { id: "tenant-1" } }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const replayMutation = { mutateAsync: vi.fn(async () => ({ ok: true })), isPending: false };
const replayBulkMutation = { mutateAsync: vi.fn(async () => ({ ok: true })), isPending: false };
vi.mock("@/hooks/useReplaySyncEvent", () => ({
  useReplaySyncEvent: () => replayMutation,
  useReplaySyncEventsBulk: () => replayBulkMutation,
}));

import { WebhookReplayDialog } from "@/components/settings/connectors/WebhookReplayDialog";

const sampleRow: SyncLogRow = {
  id: "evt-1",
  provider: "snelstart",
  direction: "push",
  event_type: "invoice.sent",
  entity_type: "invoice",
  entity_id: "inv-1",
  status: "FAILED",
  records_count: 1,
  error_message: "Timeout",
  duration_ms: 1234,
  external_id: null,
  started_at: "2026-05-04T12:00:00Z",
};

function renderDialog(row: SyncLogRow | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WebhookReplayDialog row={row} open={!!row} onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("WebhookReplayDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the original payload by default", () => {
    renderDialog(sampleRow);
    expect(screen.getByText(/Type invoice.sent/)).toBeInTheDocument();
    // Payload pre-renders met event_type, JSON-pretty-printed.
    const matches = screen.getAllByText(/invoice\.sent/);
    expect(matches.length).toBeGreaterThan(0);
  });

  it("calls replay mutation on submit", async () => {
    renderDialog(sampleRow);
    const submit = screen.getByRole("button", { name: /Opnieuw versturen/i });
    fireEvent.click(submit);
    await waitFor(() => expect(replayMutation.mutateAsync).toHaveBeenCalled());
    const firstCall = replayMutation.mutateAsync.mock.calls[0] as unknown as Array<Record<string, unknown>>;
    expect(firstCall[0]).toMatchObject({
      eventId: "evt-1",
      eventType: "invoice.sent",
      edited: false,
    });
  });
});
