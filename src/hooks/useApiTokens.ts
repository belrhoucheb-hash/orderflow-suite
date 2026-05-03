import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ApiToken {
  id: string;
  tenant_id: string;
  client_id: string | null;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  owner_user_id?: string | null;
  review_due_at?: string | null;
  rotation_required_at?: string | null;
  risk_level?: "low" | "standard" | "high" | "critical";
}

export const AVAILABLE_SCOPES = [
  { value: "orders:read", label: "Orders lezen" },
  { value: "orders:write", label: "Orders aanmaken" },
  { value: "trips:read", label: "Ritten lezen (alleen tenant)" },
  { value: "invoices:read", label: "Facturen lezen" },
  { value: "clients:read", label: "Klanten lezen" },
] as const;

export const TENANT_ONLY_SCOPES = new Set(["trips:read"]);

const TOKEN_PREFIX = "ofs_";
const DEFAULT_TOKEN_TTL_DAYS = 90;
const DEFAULT_REVIEW_DAYS = 90;

async function sha256Hex(plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(plaintext));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generatePlaintext(): string {
  const bytes = new Uint8Array(30);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const rand = btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 40);
  return `${TOKEN_PREFIX}${rand}`;
}

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function useApiTokens(clientId?: string | null) {
  return useQuery({
    queryKey: ["api_tokens", clientId ?? "all"],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase
        .from("api_tokens" as any)
        .select("*")
        .order("created_at", { ascending: false });

      if (clientId !== undefined) {
        if (clientId === null) q = q.is("client_id", null);
        else q = q.eq("client_id", clientId);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ApiToken[];
    },
  });
}

export interface CreateTokenInput {
  name: string;
  scopes: string[];
  expires_at?: string | null;
  client_id?: string | null;
}

export function useCreateApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTokenInput) => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id ?? null;
      const tenantId = (userRes.user?.app_metadata as { tenant_id?: string })?.tenant_id;
      if (!tenantId) throw new Error("Geen tenant-id in sessie");
      if (!userId) throw new Error("Geen gebruiker in sessie");
      if (input.client_id && input.scopes.some((scope) => TENANT_ONLY_SCOPES.has(scope))) {
        throw new Error("Klant-tokens mogen geen tenant-brede scopes bevatten");
      }

      const plaintext = generatePlaintext();
      const token_hash = await sha256Hex(plaintext);
      const token_prefix = plaintext.slice(0, 8);

      const { data, error } = await supabase
        .from("api_tokens" as any)
        .insert({
          tenant_id: tenantId,
          client_id: input.client_id ?? null,
          name: input.name,
          token_hash,
          token_prefix,
          scopes: input.scopes,
          expires_at: input.expires_at ?? daysFromNow(DEFAULT_TOKEN_TTL_DAYS),
          created_by: userId,
          owner_user_id: userId,
          review_due_at: daysFromNow(DEFAULT_REVIEW_DAYS),
          rotation_required_at: input.expires_at ?? daysFromNow(DEFAULT_TOKEN_TTL_DAYS),
          risk_level: input.scopes.some((scope) => scope.endsWith(":write")) ? "high" : "standard",
        })
        .select()
        .single();

      if (error) throw error;
      return { token: data as unknown as ApiToken, plaintext };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api_tokens"] });
      toast.success("Token aangemaakt");
    },
    onError: (err) => {
      toast.error("Aanmaken mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}

export function useRevokeApiToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_tokens" as any)
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api_tokens"] });
      toast.success("Token ingetrokken");
    },
    onError: (err) => {
      toast.error("Intrekken mislukt", {
        description: err instanceof Error ? err.message : String(err),
      });
    },
  });
}
