import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const {
  mockSupabase,
  mockCreateNotification,
  mockRecordDecision,
  mockResolveDecision,
} = vi.hoisted(() => {
  const from = vi.fn();
  const mockSupabase = { from };
  return {
    mockSupabase,
    mockCreateNotification: vi.fn().mockResolvedValue(undefined),
    mockRecordDecision: vi.fn().mockResolvedValue({ id: "decision-1" }),
    mockResolveDecision: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: mockSupabase }));
vi.mock("@/contexts/TenantContext", () => ({
  useTenantOptional: () => ({ tenant: { id: "tenant-1" } }),
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/hooks/useNotifications", () => ({
  createNotification: mockCreateNotification,
}));
vi.mock("@/lib/confidenceEngine", () => ({
  recordDecision: mockRecordDecision,
  resolveDecision: mockResolveDecision,
}));
vi.mock("@/hooks/useOrderInfoRequests", () => ({
  defaultExpectedBy: () => "2026-04-25T18:00:00.000Z",
}));

import {
  useCreateExceptionAction,
  useExecuteExceptionAction,
} from "@/hooks/useExceptionActions";

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function makeInsertChain(returnData: any) {
  return {
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
  };
}

function makeSelectMaybeSingle(returnData: any) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: returnData, error: null }),
    single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
}

function makeUpdateChain(returnData: any) {
  return {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData, error: null }),
  };
}

describe("useExceptionActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores decisionLogId when creating an exception action", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "orders") {
        return makeSelectMaybeSingle({
          id: "order-1",
          order_number: "1001",
          client_id: "client-1",
          client_name: "Acme BV",
          recipient_email: "ops@acme.test",
          recipient_phone: null,
          delivery_date: "2026-04-26",
        });
      }
      if (table === "exception_actions") {
        return makeInsertChain({
          id: "action-1",
          tenant_id: "tenant-1",
          exception_id: null,
          source_type: "adhoc",
          source_ref: "missing-order-1",
          action_type: "REQUEST_MISSING_INFO",
          title: "Vraag ontbrekende info automatisch op",
          description: "Vraag klantgegevens op.",
          confidence: 93,
          impact_json: {},
          payload_json: { orderId: "order-1", decisionLogId: "decision-1" },
          status: "PENDING",
          recommended: true,
          requires_approval: true,
          executed_at: null,
          executed_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { result } = renderHook(() => useCreateExceptionAction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        sourceType: "adhoc",
        sourceRef: "missing-order-1",
        actionType: "REQUEST_MISSING_INFO",
        title: "Vraag ontbrekende info automatisch op",
        confidence: 93,
        payload: { orderId: "order-1" },
        recommended: true,
        requiresApproval: true,
      });
    });

    expect(mockRecordDecision).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        tenantId: "tenant-1",
        decisionType: "DISPATCH",
        entityType: "order",
        entityId: "order-1",
        clientId: "client-1",
      }),
    );
  });

  it("blocks execution until approval when action requires approval", async () => {
    const { result } = renderHook(() => useExecuteExceptionAction(), {
      wrapper: createWrapper(),
    });

    await expect(
      result.current.mutateAsync({
        actionId: "action-1",
        actionType: "REQUEST_MISSING_INFO",
        payload: {
          orderId: "order-1",
          requiresApproval: true,
          currentStatus: "PENDING",
        },
      }),
    ).rejects.toThrow(/Keur deze actie eerst goed/i);
  });

  it("executes billing review and resolves decision log", async () => {
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === "orders") {
        return {
          ...makeSelectMaybeSingle({
            id: "order-1",
            order_number: "1001",
            client_id: "client-1",
            client_name: "Acme BV",
            recipient_email: "ops@acme.test",
            recipient_phone: null,
            delivery_date: "2026-04-26",
          }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === "order_charges") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        };
      }
      if (table === "exception_actions") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn()
            .mockResolvedValueOnce({
              data: {
                id: "action-1",
                tenant_id: "tenant-1",
                exception_id: null,
                source_type: "adhoc",
                source_ref: "billing-order-1",
                action_type: "FLAG_BILLING_REVIEW",
                title: "Markeer voor billing review",
                description: null,
                confidence: 86,
                impact_json: {},
                payload_json: { orderId: "order-1", decisionLogId: "decision-1" },
                status: "APPROVED",
                recommended: true,
                requires_approval: true,
                executed_at: null,
                executed_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            })
            .mockResolvedValueOnce({
              data: {
                id: "action-1",
                tenant_id: "tenant-1",
                exception_id: null,
                source_type: "adhoc",
                source_ref: "billing-order-1",
                action_type: "FLAG_BILLING_REVIEW",
                title: "Markeer voor billing review",
                description: null,
                confidence: 86,
                impact_json: {},
                payload_json: { orderId: "order-1", decisionLogId: "decision-1" },
                status: "EXECUTED",
                recommended: true,
                requires_approval: true,
                executed_at: new Date().toISOString(),
                executed_by: "user-1",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            }),
          update: vi.fn().mockReturnThis(),
        };
      }
      if (table === "exception_action_runs") {
        return makeInsertChain({
          id: "run-1",
          tenant_id: "tenant-1",
          exception_action_id: "action-1",
          run_type: "EXECUTED",
          result: "SUCCESS",
          notes: null,
          payload_json: {},
          created_by: "user-1",
          created_at: new Date().toISOString(),
        });
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const { result } = renderHook(() => useExecuteExceptionAction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({
        actionId: "action-1",
        actionType: "FLAG_BILLING_REVIEW",
        payload: {
          orderId: "order-1",
          decisionLogId: "decision-1",
          requiresApproval: true,
          currentStatus: "APPROVED",
        },
      });
    });

    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "BILLING_REVIEW",
        order_id: "order-1",
        tenant_id: "tenant-1",
      }),
    );
    expect(mockResolveDecision).toHaveBeenCalledWith(
      mockSupabase,
      "decision-1",
      "APPROVED",
      expect.objectContaining({
        actionType: "FLAG_BILLING_REVIEW",
        status: "EXECUTED",
      }),
      "user-1",
    );
  });
});
