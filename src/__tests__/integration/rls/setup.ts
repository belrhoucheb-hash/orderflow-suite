// Helpers voor RLS-integratietests tegen een echte Supabase-instance.
//
// Tests die deze helpers gebruiken draaien tegen een lokale of CI
// Supabase-branch en valideren dat row-level security écht voorkomt
// dat tenant A bij tenant B's data kan. De statische tenant-scoping
// audit (apiV1TenantScoping.test.ts) bewijst dat de gateway-code
// scope-filters toevoegt; deze laag bewijst dat ook de DB-policies
// het juiste blokkeren wanneer code per ongeluk een filter mist.
//
// Tests skippen automatisch als SUPABASE_TEST_URL en
// SUPABASE_TEST_SERVICE_KEY ontbreken. Lokaal:
//
//   export SUPABASE_TEST_URL=http://localhost:54321
//   export SUPABASE_TEST_SERVICE_KEY=<service-role-key>
//   npx vitest run src/__tests__/integration

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

export interface TestTenant {
  id: string;
  name: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerUserId: string;
  authedClient: SupabaseClient;
}

export interface TestContext {
  admin: SupabaseClient;
  tenantA: TestTenant;
  tenantB: TestTenant;
  cleanup: () => Promise<void>;
}

const TEST_URL = process.env.SUPABASE_TEST_URL;
const TEST_SERVICE_KEY = process.env.SUPABASE_TEST_SERVICE_KEY;
const TEST_ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY;

export const hasTestDb = Boolean(TEST_URL && TEST_SERVICE_KEY && TEST_ANON_KEY);

export function adminClient(): SupabaseClient {
  if (!TEST_URL || !TEST_SERVICE_KEY) throw new Error("Test-DB niet geconfigureerd");
  return createClient(TEST_URL, TEST_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function createTenantWithUser(
  admin: SupabaseClient,
  label: string,
): Promise<TestTenant> {
  const tenantId = randomUUID();
  const email = `rls-${label}-${tenantId.slice(0, 8)}@test.invalid`;
  const password = `pw-${randomUUID()}`;

  await admin.from("tenants").insert({ id: tenantId, name: `RLS-${label}` });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) throw createErr ?? new Error("user create failed");
  const userId = created.user.id;

  await admin.from("tenant_members").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "owner",
  });

  const authed = createClient(TEST_URL!, TEST_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await authed.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;

  return {
    id: tenantId,
    name: `RLS-${label}`,
    ownerEmail: email,
    ownerPassword: password,
    ownerUserId: userId,
    authedClient: authed,
  };
}

export async function setupTenants(): Promise<TestContext> {
  const admin = adminClient();
  const tenantA = await createTenantWithUser(admin, "A");
  const tenantB = await createTenantWithUser(admin, "B");

  const cleanup = async () => {
    for (const t of [tenantA, tenantB]) {
      try {
        await admin.from("orders").delete().eq("tenant_id", t.id);
        await admin.from("tenant_members").delete().eq("tenant_id", t.id);
        await admin.from("tenants").delete().eq("id", t.id);
        await admin.auth.admin.deleteUser(t.ownerUserId);
      } catch {
        // best-effort cleanup
      }
    }
  };

  return { admin, tenantA, tenantB, cleanup };
}
