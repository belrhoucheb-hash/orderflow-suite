import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../../..");
const inboxFn = readFileSync(
  resolve(ROOT, "supabase/functions/test-inbox-connection/index.ts"),
  "utf-8",
);
const inviteFn = readFileSync(
  resolve(ROOT, "supabase/functions/invite-portal-user/index.ts"),
  "utf-8",
);
const portalHook = readFileSync(
  resolve(ROOT, "src/hooks/useClientPortalUsers.ts"),
  "utf-8",
);

describe("inbox and portal hardening", () => {
  it("test-inbox-connection requires owner/admin membership", () => {
    expect(inboxFn).toMatch(/from\("tenant_members"\)/);
    expect(inboxFn).toMatch(/\.in\("role", \["owner", "admin"\]\)/);
    expect(inboxFn).toMatch(/Alleen owner\/admin mag inboxen testen/);
  });

  it("test-inbox-connection blocks unsafe raw hosts", () => {
    expect(inboxFn).toMatch(/function isUnsafeImapHost/);
    expect(inboxFn).toMatch(/value === "localhost"/);
    expect(inboxFn).toMatch(/octets\[0\] === 10/);
    expect(inboxFn).toMatch(/octets\[0\] === 192 && octets\[1\] === 168/);
  });

  it("portal invites run through edge function instead of browser OTP fallback", () => {
    expect(portalHook).toMatch(/functions\.invoke\("invite-portal-user"/);
    expect(portalHook).not.toMatch(/inviteUserByEmail/);
    expect(portalHook).not.toMatch(/signInWithOtp/);
  });

  it("invite-portal-user validates admin membership and tenant-bound client", () => {
    expect(inviteFn).toMatch(/from\("tenant_members"\)/);
    expect(inviteFn).toMatch(/\.in\("role", \["owner", "admin"\]\)/);
    expect(inviteFn).toMatch(/from\("clients"\)/);
    expect(inviteFn).toMatch(/\.eq\("tenant_id", body\.tenant_id\)/);
    expect(inviteFn).toMatch(/inviteUserByEmail/);
  });
});
