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

type OfficeRole = "admin" | "medewerker";

interface AdminUsersRequest {
  action:
    | "list"
    | "invite"
    | "update_role"
    | "update_profile"
    | "update_access"
    | "reset_password"
    | "deactivate_user"
    | "list_activity";
  tenant_id?: string | null;
  user_id?: string;
  email?: string;
  display_name?: string | null;
  role?: OfficeRole;
  redirect_to?: string;
  access_overrides?: Record<string, unknown>;
}

function jsonWith(corsHeaders: Record<string, string>, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRole(value: unknown): value is OfficeRole {
  return value === "admin" || value === "medewerker";
}

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

async function logUserActivity(
  admin: ReturnType<typeof createClient>,
  params: {
    tenantId: string | null;
    actorUserId: string;
    targetUserId: string;
    action: string;
    changes?: Record<string, unknown>;
  },
) {
  if (!params.tenantId) return;

  await admin.from("activity_log").insert({
    tenant_id: params.tenantId,
    user_id: params.actorUserId,
    entity_type: "office_user",
    entity_id: params.targetUserId,
    action: params.action,
    changes: params.changes ?? {},
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

    const body = await req.json() as AdminUsersRequest;
    const tenantId = body.tenant_id ?? null;

    const { data: appAdminRole } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    let isTenantAdmin = false;
    if (tenantId) {
      const { data: membership } = await admin
        .from("tenant_members")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      isTenantAdmin = !!membership;
    }

    if (!appAdminRole && !isTenantAdmin) {
      return json(403, { error: "Alleen admins kunnen gebruikers beheren" });
    }

    if (body.action === "list") {
      let profilesQuery = admin
        .from("profiles")
        .select("user_id, display_name, avatar_url, created_at, tenant_id")
        .order("created_at", { ascending: false });

      if (tenantId) {
        profilesQuery = appAdminRole
          ? profilesQuery.or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          : profilesQuery.eq("tenant_id", tenantId);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) return json(500, { error: profilesError.message });

      const userIds = (profiles ?? []).map((profile) => profile.user_id);
      const { data: roles, error: rolesError } = userIds.length > 0
        ? await admin.from("user_roles").select("user_id, role").in("user_id", userIds)
        : { data: [], error: null };
      if (rolesError) return json(500, { error: rolesError.message });

      const emailMap = new Map<string, { email: string | null; last_sign_in_at: string | null; banned_until: string | null }>();
      let page = 1;
      while (true) {
        const { data: authUsers, error: usersError } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (usersError) return json(500, { error: usersError.message });
        for (const authUser of authUsers.users) {
          if (userIds.includes(authUser.id)) {
            emailMap.set(authUser.id, {
              email: authUser.email ?? null,
              last_sign_in_at: authUser.last_sign_in_at ?? null,
              banned_until: authUser.banned_until ?? null,
            });
          }
        }
        if (authUsers.users.length < 1000 || emailMap.size >= userIds.length) break;
        page += 1;
      }

      const rolesMap = new Map<string, OfficeRole[]>();
      for (const roleRow of roles ?? []) {
        if (!isRole(roleRow.role)) continue;
        rolesMap.set(roleRow.user_id, [...(rolesMap.get(roleRow.user_id) ?? []), roleRow.role]);
      }

      return json(200, {
        users: (profiles ?? []).map((profile) => ({
          user_id: profile.user_id,
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
          created_at: profile.created_at,
          email: emailMap.get(profile.user_id)?.email ?? null,
          last_sign_in_at: emailMap.get(profile.user_id)?.last_sign_in_at ?? null,
          banned_until: emailMap.get(profile.user_id)?.banned_until ?? null,
          roles: rolesMap.get(profile.user_id) ?? ["medewerker"],
        })),
      });
    }

    if (body.action === "list_activity") {
      if (!body.user_id) return json(400, { error: "user_id is verplicht" });
      if (!tenantId) return json(400, { error: "tenant_id is verplicht" });

      const { data: events, error: activityError } = await admin
        .from("activity_log")
        .select("id, user_id, action, changes, created_at")
        .eq("tenant_id", tenantId)
        .eq("entity_type", "office_user")
        .eq("entity_id", body.user_id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (activityError) return json(500, { error: activityError.message });

      const { data: targetUser } = await admin.auth.admin.getUserById(body.user_id);
      const lastSignInAt = targetUser.user?.last_sign_in_at ?? null;

      return json(200, {
        activity: [
          ...(lastSignInAt ? [{
            id: `login-${body.user_id}-${lastSignInAt}`,
            user_id: body.user_id,
            action: "user.login",
            changes: {
              description: "Laatste succesvolle login",
              source: "Supabase Auth",
            },
            created_at: lastSignInAt,
          }] : []),
          ...(events ?? []),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      });
    }

    if (body.action === "invite") {
      const email = normalizeEmail(body.email);
      if (!email || !isRole(body.role)) {
        return json(400, { error: "E-mail en rol zijn verplicht" });
      }

      const origin = req.headers.get("origin");
      const fallbackBaseUrl = Deno.env.get("PUBLIC_SITE_URL") ?? origin ?? supabaseUrl.replace(".supabase.co", ".app");
      const redirectTo = body.redirect_to ?? `${fallbackBaseUrl.replace(/\/$/, "")}/login`;

      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        data: {
          display_name: body.display_name ?? email,
          tenant_id: tenantId,
        },
        redirectTo,
      });
      if (inviteError) return json(400, { error: inviteError.message });

      const invitedUserId = inviteData.user?.id;
      if (!invitedUserId) return json(500, { error: "Supabase gaf geen user-id terug voor de uitnodiging" });

      await admin.from("profiles").upsert({
        user_id: invitedUserId,
        display_name: body.display_name ?? email,
        tenant_id: tenantId,
      }, { onConflict: "user_id" });

      if (tenantId) {
        await admin.from("tenant_members").upsert({
          tenant_id: tenantId,
          user_id: invitedUserId,
          role: body.role === "admin" ? "admin" : "planner",
        }, { onConflict: "tenant_id,user_id" });

        await admin.auth.admin.updateUserById(invitedUserId, {
          app_metadata: {
            ...(inviteData.user?.app_metadata ?? {}),
            tenant_id: tenantId,
          },
        });
      }

      await admin.from("user_roles").delete().eq("user_id", invitedUserId);
      const { error: roleError } = await admin.from("user_roles").insert({ user_id: invitedUserId, role: body.role });
      if (roleError) return json(500, { error: roleError.message });

      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: invitedUserId,
        action: "user.invited",
        changes: {
          email,
          display_name: body.display_name ?? email,
          role: body.role,
        },
      });

      return json(200, { ok: true });
    }

    if (body.action === "update_role") {
      if (!body.user_id || !isRole(body.role)) {
        return json(400, { error: "user_id en rol zijn verplicht" });
      }

      if (body.user_id === user.id && body.role !== "admin") {
        return json(400, { error: "Je kunt je eigen adminrol niet verwijderen" });
      }

      const { count: adminCount, error: countError } = await admin
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) return json(500, { error: countError.message });

      const { data: existingRoles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", body.user_id);
      const targetIsAdmin = (existingRoles ?? []).some((row) => row.role === "admin");
      if (targetIsAdmin && body.role !== "admin" && (adminCount ?? 0) <= 1) {
        return json(400, { error: "Er moet minimaal een admin overblijven" });
      }

      await admin.from("user_roles").delete().eq("user_id", body.user_id);
      const { error: insertError } = await admin.from("user_roles").insert({ user_id: body.user_id, role: body.role });
      if (insertError) return json(500, { error: insertError.message });

      if (tenantId) {
        await admin.from("tenant_members").upsert({
          tenant_id: tenantId,
          user_id: body.user_id,
          role: body.role === "admin" ? "admin" : "planner",
        }, { onConflict: "tenant_id,user_id" });
      }

      const previousRole = targetIsAdmin ? "admin" : "medewerker";
      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: body.user_id,
        action: "user.role_updated",
        changes: {
          from: previousRole,
          to: body.role,
        },
      });

      return json(200, { ok: true });
    }

    if (body.action === "update_profile") {
      if (!body.user_id) return json(400, { error: "user_id is verplicht" });

      const displayName = typeof body.display_name === "string" && body.display_name.trim().length > 0
        ? body.display_name.trim()
        : null;
      const { error: profileError } = await admin
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", body.user_id);
      if (profileError) return json(500, { error: profileError.message });

      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: body.user_id,
        action: "user.profile_updated",
        changes: {
          display_name: displayName,
        },
      });

      return json(200, { ok: true });
    }

    if (body.action === "update_access") {
      if (!body.user_id) return json(400, { error: "user_id is verplicht" });

      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: body.user_id,
        action: "user.access_updated",
        changes: {
          overrides: body.access_overrides ?? {},
          override_count: Object.keys(body.access_overrides ?? {}).length,
        },
      });

      return json(200, { ok: true });
    }

    if (body.action === "reset_password") {
      if (!body.user_id) return json(400, { error: "user_id is verplicht" });

      const { data: targetUser, error: targetError } = await admin.auth.admin.getUserById(body.user_id);
      if (targetError || !targetUser.user?.email) {
        return json(400, { error: "Geen e-mailadres gevonden voor deze gebruiker" });
      }

      const origin = req.headers.get("origin");
      const fallbackBaseUrl = Deno.env.get("PUBLIC_SITE_URL") ?? origin ?? supabaseUrl.replace(".supabase.co", ".app");
      const redirectTo = `${fallbackBaseUrl.replace(/\/$/, "")}/login`;
      const { error: resetError } = await admin.auth.resetPasswordForEmail(targetUser.user.email, { redirectTo });
      if (resetError) return json(400, { error: resetError.message });

      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: body.user_id,
        action: "user.password_reset_sent",
        changes: {
          email: targetUser.user.email,
        },
      });

      return json(200, { ok: true });
    }

    if (body.action === "deactivate_user") {
      if (!body.user_id) return json(400, { error: "user_id is verplicht" });
      if (body.user_id === user.id) {
        return json(400, { error: "Je kunt jezelf niet deactiveren" });
      }

      const { error: deactivateError } = await admin.auth.admin.updateUserById(body.user_id, {
        ban_duration: "876000h",
      });
      if (deactivateError) return json(400, { error: deactivateError.message });

      await logUserActivity(admin, {
        tenantId,
        actorUserId: user.id,
        targetUserId: body.user_id,
        action: "user.deactivated",
      });

      return json(200, { ok: true });
    }

    return json(400, { error: "Onbekende actie" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return json(500, { error: message });
  }
});
