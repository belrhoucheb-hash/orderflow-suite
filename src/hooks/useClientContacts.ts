import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import type { ClientContactRole } from "@/lib/validation/clientContactSchema";

export interface ClientContact {
  id: string;
  tenant_id: string;
  client_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: ClientContactRole;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function useClientContacts(clientId: string | null) {
  return useQuery({
    queryKey: ["client_contacts", clientId],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId!)
        .order("role")
        .order("name");
      if (error) throw error;
      return data as ClientContact[];
    },
  });
}

export function useCreateClientContact() {
  const qc = useQueryClient();
  const { tenant } = useTenant();
  return useMutation({
    mutationFn: async (
      input: Omit<ClientContact, "id" | "tenant_id" | "created_at" | "updated_at">,
    ) => {
      if (!tenant?.id) throw new Error("Geen actieve tenant");
      const { data, error } = await supabase
        .from("client_contacts")
        .insert({ ...input, tenant_id: tenant.id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as ClientContact;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] }),
  });
}

export function useUpdateClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<ClientContact> & { id: string }) => {
      const { data, error } = await supabase
        .from("client_contacts")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as ClientContact;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] }),
  });
}

export function useDeleteClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
    }: {
      id: string;
      clientId: string;
    }) => {
      const { error } = await supabase
        .from("client_contacts")
        .delete()
        .eq("id", id);
      if (error) throw error;
      return { id, clientId };
    },
    onSuccess: ({ clientId }) =>
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] }),
  });
}

/**
 * Verwisselt rollen atomair, zodat de partial unique indexes niet geschonden
 * worden. Bestaande houder van de rol krijgt 'other', de nieuwe krijgt de rol.
 */
export function useAssignContactRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contactId,
      clientId,
      role,
    }: {
      contactId: string;
      clientId: string;
      role: Extract<ClientContactRole, "primary" | "backup">;
    }) => {
      const { data: current, error: fetchErr } = await supabase
        .from("client_contacts")
        .select("id")
        .eq("client_id", clientId)
        .eq("role", role)
        .eq("is_active", true)
        .neq("id", contactId);
      if (fetchErr) throw fetchErr;

      if (current && current.length > 0) {
        const { error } = await supabase
          .from("client_contacts")
          .update({ role: "other" } as any)
          .in(
            "id",
            current.map((c) => c.id),
          );
        if (error) throw error;
      }

      const { data, error } = await supabase
        .from("client_contacts")
        .update({ role, is_active: true } as any)
        .eq("id", contactId)
        .select()
        .single();
      if (error) throw error;
      return data as ClientContact;
    },
    onSuccess: (row) =>
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] }),
  });
}
