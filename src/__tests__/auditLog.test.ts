import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockFrom } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockReturnValue({
    then: vi.fn().mockImplementation((cb: (result: { error: null }) => void) => {
      cb({ error: null });
      return { catch: vi.fn() };
    }),
  });
  const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });
  return { mockInsert, mockFrom };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: mockFrom },
}));

import { logAudit } from "@/lib/auditLog";

describe("logAudit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock behavior after clearAllMocks
    mockInsert.mockReturnValue({
      then: vi.fn().mockImplementation((cb: (result: { error: null }) => void) => {
        cb({ error: null });
        return { catch: vi.fn() };
      }),
    });
    mockFrom.mockReturnValue({ insert: mockInsert });
  });

  it("calls supabase.from with 'audit_log'", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc-123",
      action: "INSERT",
    });

    expect(mockFrom).toHaveBeenCalledWith("audit_log");
  });

  it("inserts the correct data for an INSERT action", () => {
    logAudit({
      table_name: "invoices",
      record_id: "inv-001",
      action: "INSERT",
      new_data: { amount: 100 },
    });

    expect(mockInsert).toHaveBeenCalledWith({
      table_name: "invoices",
      record_id: "inv-001",
      action: "INSERT",
      old_data: null,
      new_data: { amount: 100 },
      changed_fields: null,
      tenant_id: null,
    });
  });

  it("inserts the correct data for an UPDATE action with old_data and new_data", () => {
    logAudit({
      table_name: "trips",
      record_id: "trip-42",
      action: "UPDATE",
      old_data: { status: "PENDING" },
      new_data: { status: "COMPLETED" },
      changed_fields: ["status"],
    });

    expect(mockInsert).toHaveBeenCalledWith({
      table_name: "trips",
      record_id: "trip-42",
      action: "UPDATE",
      old_data: { status: "PENDING" },
      new_data: { status: "COMPLETED" },
      changed_fields: ["status"],
      tenant_id: null,
    });
  });

  it("inserts the correct data for a DELETE action", () => {
    logAudit({
      table_name: "orders",
      record_id: "ord-99",
      action: "DELETE",
      old_data: { id: "ord-99", name: "Test" },
    });

    expect(mockInsert).toHaveBeenCalledWith({
      table_name: "orders",
      record_id: "ord-99",
      action: "DELETE",
      old_data: { id: "ord-99", name: "Test" },
      new_data: null,
      changed_fields: null,
      tenant_id: null,
    });
  });

  it("defaults old_data to null when not provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ old_data: null })
    );
  });

  it("defaults new_data to null when not provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "DELETE",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ new_data: null })
    );
  });

  it("defaults changed_fields to null when not provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ changed_fields: null })
    );
  });

  it("defaults tenant_id to null when not provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: null })
    );
  });

  it("passes tenant_id when provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
      tenant_id: "tenant-xyz",
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: "tenant-xyz" })
    );
  });

  it("passes changed_fields when provided", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "UPDATE",
      changed_fields: ["status", "updated_at"],
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ changed_fields: ["status", "updated_at"] })
    );
  });

  it("logs a warning when the insert fails", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockFrom.mockReturnValueOnce({
      insert: vi.fn().mockReturnValue({
        then: vi.fn().mockImplementation((cb: any) => {
          cb({ error: { message: "RLS policy violation" } });
          return { catch: vi.fn() };
        }),
      }),
    });

    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
    });

    expect(warnSpy).toHaveBeenCalledWith("Audit log failed:", "RLS policy violation");
    warnSpy.mockRestore();
  });

  it("does not log a warning when the insert succeeds", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
    });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("handles null explicitly passed for old_data", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "INSERT",
      old_data: null,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ old_data: null })
    );
  });

  it("handles null explicitly passed for new_data", () => {
    logAudit({
      table_name: "orders",
      record_id: "abc",
      action: "DELETE",
      new_data: null,
    });

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ new_data: null })
    );
  });
});
