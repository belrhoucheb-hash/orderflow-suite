import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientPortalUser, PortalRole } from "@/types/clientPortal";

const QUERY_KEY = "client_portal_users";

/**
 * Fetch all portal users for a client (planner-side).
 */
export function useClientPortalUsers(clientId: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, clientId],
    staleTime: 30_000,
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_portal_users" as any)
        .select("*")
        .eq("client_id", clientId!)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as ClientPortalUser[];
    },
  });
}

/**
 * Fetch portal user record for the current user (portal-side).
 */
export function useCurrentPortalUser() {
  return useQuery({
    queryKey: [QUERY_KEY, "current"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("client_portal_users" as any)
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as ClientPortalUser | null;
    },
  });
}

/**
 * Invite a new portal user (sends magic link email).
 */
export function useInvitePortalUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      email: string;
      client_id: string;
      tenant_id: string;
      portal_role: PortalRole;
    }) => {
      const { email, client_id, tenant_id, portal_role } = params;

      // 1. Create the user via Supabase auth (invite / magic link)
      const { data: inviteData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
        email,
        {
          data: {
            client_id,
            portal_role,
            is_portal_user: true,
          },
          redirectTo: `${window.location.origin}/portal`,
        }
      );

      // If admin.inviteUserByEmail fails (no admin access), fallback to
      // calling the edge function or creating a magic link OTP
      if (inviteError) {
        // Fallback: send magic link via signInWithOtp
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            data: {
              client_id,
              portal_role,
              is_portal_user: true,
            },
            emailRedirectTo: `${window.location.origin}/portal`,
            shouldCreateUser: true,
          },
        });
        if (otpError) throw otpError;
      }

      // 2. Get the user_id (either from invite or by looking up)
      // Since the user may not exist yet (magic link pending), we store a placeholder
      // and update user_id on first login via the auth hook
      const userId = inviteData?.user?.id;

      if (userId) {
        // 3. Insert the client_portal_users record
        const { data: { user: currentUser } } = await supabase.auth.getUser();

        const { data, error } = await supabase
          .from("client_portal_users" as any)
          .insert({
            tenant_id,
            client_id,
            user_id: userId,
            portal_role,
            invited_by: currentUser?.id ?? null,
            invited_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;
        return data as ClientPortalUser;
      }

      return null; // Will be linked on first login
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Update portal user role or active status.
 */
export function useUpdatePortalUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      updates: Partial<Pick<ClientPortalUser, "portal_role" | "is_active">>;
    }) => {
      const { id, updates } = params;
      const { data, error } = await supabase
        .from("client_portal_users" as any)
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as ClientPortalUser;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Remove a portal user.
 */
export function useDeletePortalUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_portal_users" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

/**
 * Record last_login_at for a portal user.
 */
export function useRecordPortalLogin() {
  return useMutation({
    mutationFn: async (portalUserId: string) => {
      const { error } = await supabase
        .from("client_portal_users" as any)
        .update({ last_login_at: new Date().toISOString() })
        .eq("id", portalUserId);
      if (error) throw error;
    },
  });
}
