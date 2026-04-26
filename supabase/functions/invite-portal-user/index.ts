import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsFor, handleOptions } from "../_shared/cors.ts";

const CORS_OPTIONS = {
  extraHeaders: [
    "x-supabase-client-platform",
    "x-supabase-client-platform-version",
    "x-supabase-client-runtime",
    "x-supabase-client-runtime-version",
  ],
};

interface InvitePortalUserRequest {
  email: string;
  client_id: string;
  tenant_id: string;
  portal_role: "viewer" | "editor" | "admin";
  redirect_to?: string;
}

function jsonWith(corsHeaders: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  const preflight = handleOptions(req, CORS_OPTIONS);
  if (preflight) return preflight;
  const corsHeaders = corsFor(req, CORS_OPTIONS);
  const json = (status: number, body: unknown) => jsonWith(corsHeaders, status, body);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Authenticatie vereist" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json(401, { error: "Ongeldige sessie" });

    const body = await req.json() as InvitePortalUserRequest;
    if (!body.email || !body.client_id || !body.tenant_id || !body.portal_role) {
      return json(400, { error: "email, client_id, tenant_id en portal_role zijn verplicht" });
    }

    const { data: membership, error: membershipError } = await admin
      .from("tenant_members")
      .select("role")
      .eq("tenant_id", body.tenant_id)
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"])
      .maybeSingle();
    if (membershipError || !membership) {
      return json(403, { error: "Alleen owner/admin mag portal-gebruikers uitnodigen" });
    }

    const { data: client, error: clientError } = await admin
      .from("clients")
      .select("id")
      .eq("id", body.client_id)
      .eq("tenant_id", body.tenant_id)
      .maybeSingle();
    if (clientError || !client) {
      return json(404, { error: "Client niet gevonden binnen deze tenant" });
    }

    const origin = req.headers.get("origin");
    const fallbackBaseUrl = Deno.env.get("PUBLIC_SITE_URL") ?? origin ?? supabaseUrl.replace(".supabase.co", ".app");
    const redirectTo = body.redirect_to ?? `${fallbackBaseUrl.replace(/\/$/, "")}/portal`;

    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      body.email,
      {
        data: {
          client_id: body.client_id,
          portal_role: body.portal_role,
          is_portal_user: true,
        },
        redirectTo,
      },
    );
    if (inviteError) return json(400, { error: inviteError.message });

    const invitedUserId = inviteData.user?.id;
    if (!invitedUserId) {
      return json(500, { error: "Supabase gaf geen user-id terug voor de uitnodiging" });
    }

    const { data: portalUser, error: portalUserError } = await admin
      .from("client_portal_users")
      .upsert(
        {
          tenant_id: body.tenant_id,
          client_id: body.client_id,
          user_id: invitedUserId,
          portal_role: body.portal_role,
          invited_by: user.id,
          invited_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "tenant_id,client_id,user_id" },
      )
      .select()
      .single();
    if (portalUserError) return json(500, { error: portalUserError.message });

    return json(200, { user: portalUser });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
