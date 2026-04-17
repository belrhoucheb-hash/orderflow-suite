#!/usr/bin/env bun
/**
 * Maakt een lege demo-tenant + planner-user aan via de Supabase Admin API.
 * De handle_new_user() trigger leest `tenant_id` en `display_name` uit user_metadata
 * en koppelt de user automatisch aan de tenant (profiles, tenant_members, JWT app_metadata).
 */

import { createClient } from "@supabase/supabase-js";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("ERROR: SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY env vars zijn verplicht");
  process.exit(1);
}

const name = arg("name");
const email = arg("email");
if (!name || !email) {
  console.error("ERROR: --name en --email zijn verplicht");
  process.exit(1);
}

const slugFromName = name
  .toLowerCase()
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 48);
const slug = arg("slug") ?? (slugFromName || `tenant-${Date.now()}`);

const displayName = arg("display-name") ?? email.split("@")[0];
const redirectTo = arg("redirect");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: tenant, error: tenantErr } = await supabase
  .from("tenants")
  .insert({ name, slug, is_active: true })
  .select("id, name, slug")
  .single();

if (tenantErr || !tenant) {
  console.error("ERROR: tenant-insert faalde:", tenantErr?.message);
  process.exit(1);
}

const { data: created, error: userErr } = await supabase.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: {
    tenant_id: tenant.id,
    display_name: displayName,
    role: "planner",
  },
});

if (userErr || !created?.user) {
  console.error("ERROR: user-creatie faalde, rollback tenant:", userErr?.message);
  await supabase.from("tenants").delete().eq("id", tenant.id);
  process.exit(1);
}

const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: redirectTo ? { redirectTo } : undefined,
});

if (linkErr) {
  console.error("WAARSCHUWING: magic-link genereren faalde:", linkErr.message);
}

console.log("\n=== Demo tenant aangemaakt ===");
console.log(`tenant_id:    ${tenant.id}`);
console.log(`tenant_name:  ${tenant.name}`);
console.log(`tenant_slug:  ${tenant.slug}`);
console.log(`user_id:      ${created.user.id}`);
console.log(`user_email:   ${created.user.email}`);
console.log(`display_name: ${displayName}`);
if (linkData?.properties?.action_link) {
  console.log(`\nMagic login-link (eenmalig):\n${linkData.properties.action_link}`);
}
console.log("\nKlaar. Stuur de link door naar de prospect.");
