import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const migration = readFileSync(
  resolve(ROOT, "supabase/migrations/20260429020000_webhook_and_api_token_hardening.sql"),
  "utf-8",
);
const dispatcher = readFileSync(
  resolve(ROOT, "supabase/functions/webhook-dispatcher/index.ts"),
  "utf-8",
);
const hook = readFileSync(
  resolve(ROOT, "src/hooks/useWebhooks.ts"),
  "utf-8",
);

describe("webhook and api token hardening", () => {
  it("migration enforces API token scope constraints", () => {
    expect(migration).toMatch(/api_tokens_scopes_allowed_chk/);
    expect(migration).toMatch(/api_tokens_client_scope_chk/);
    expect(migration).toMatch(/'orders:read'/);
    expect(migration).toMatch(/'trips:read'/);
  });

  it("dispatcher claims deliveries atomically via RPC", () => {
    expect(dispatcher).toMatch(/rpc\(\s*"claim_pending_webhook_deliveries"/);
    expect(migration).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(migration).toMatch(/status = 'PROCESSING'/);
  });

  it("test webhook schedules one targeted delivery via enqueue_test_webhook_delivery", () => {
    expect(hook).toMatch(/rpc\("enqueue_test_webhook_delivery"/);
    expect(hook).not.toMatch(/emit_webhook_event/);
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION public\.enqueue_test_webhook_delivery/);
  });
});
