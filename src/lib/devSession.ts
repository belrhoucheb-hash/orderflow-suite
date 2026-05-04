import type { User } from "@supabase/supabase-js";

export const DEV_BYPASS_STORAGE_KEY = "debug_bypass";
export const DEV_BYPASS_USER_ID = import.meta.env.DEV
  ? "00000000-0000-0000-0000-00000000d001"
  : "";
export const DEV_BYPASS_TENANT_ID = import.meta.env.DEV
  ? "00000000-0000-0000-0000-000000000001"
  : "";

export function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export function readDevBypassPayload(): { email?: string; display_name?: string } | null {
  if (!import.meta.env.DEV || !isLocalDevHost() || typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(DEV_BYPASS_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { email?: string; display_name?: string } | null;
  } catch {
    return null;
  }
}

export function readDevBypassUser(): User | null {
  const parsed = readDevBypassPayload();
  if (!parsed?.email) return null;

  return {
    id: DEV_BYPASS_USER_ID,
    app_metadata: { tenant_id: DEV_BYPASS_TENANT_ID, debug_bypass: true },
    user_metadata: { display_name: parsed.display_name ?? "Local Admin" },
    aud: "authenticated",
    confirmation_sent_at: "",
    created_at: new Date().toISOString(),
    email: parsed.email,
    factors: null,
    identities: [],
    is_anonymous: false,
    last_sign_in_at: new Date().toISOString(),
    phone: "",
    role: "authenticated",
    updated_at: new Date().toISOString(),
  } as User;
}

export function getEffectiveLocalUserId() {
  return readDevBypassUser()?.id ?? null;
}
