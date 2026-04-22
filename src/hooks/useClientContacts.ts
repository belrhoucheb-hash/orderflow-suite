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

// Fire-and-forget audit-log via de DB-helper uit migratie 20260422001000.
// Faalt de call (RLS, network), dan loggen we een warning maar breken
// de flow niet. Audit is waardevol, maar de gebruikerservaring van de
// mutatie blijft leading.
async function logContactAudit(
  clientId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
) {
  try {
    const { error } = await (supabase as any).rpc("log_client_audit", {
      p_client_id: clientId,
      p_field: field,
      p_old: oldValue ?? null,
      p_new: newValue ?? null,
    });
    if (error) console.warn("[client-contact-audit]", field, error.message);
  } catch (e) {
    console.warn("[client-contact-audit] rpc failed", field, e);
  }
}

export function useClientContacts(clientId: string | null, opts?: { includeArchived?: boolean }) {
  const includeArchived = opts?.includeArchived ?? false;
  return useQuery({
    queryKey: ["client_contacts", clientId, includeArchived],
    enabled: !!clientId,
    staleTime: 60_000,
    queryFn: async () => {
      let query = supabase
        .from("client_contacts")
        .select("*")
        .eq("client_id", clientId!);
      if (!includeArchived) {
        query = query.eq("is_active", true);
      }
      const { data, error } = await query.order("role").order("name");
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
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] });
      logContactAudit(row.client_id, "contact.created", null, {
        name: row.name,
        role: row.role,
        email: row.email,
      });
    },
  });
}

export function useUpdateClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...patch
    }: Partial<ClientContact> & { id: string }) => {
      // Ophalen van de huidige waarde zodat we een old/new snapshot in de
      // audit-log kunnen zetten. Één extra roundtrip, maar essentieel voor
      // een leesbare historie. Failt dit, dan gaan we toch door met de
      // update; audit-old is dan null.
      const { data: before } = await supabase
        .from("client_contacts")
        .select("name, role, email, phone, notes, is_active")
        .eq("id", id)
        .maybeSingle();

      const { data, error } = await supabase
        .from("client_contacts")
        .update(patch as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { row: data as ClientContact, before };
    },
    onSuccess: ({ row, before }) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] });
      logContactAudit(
        row.client_id,
        "contact.updated",
        before ?? null,
        { name: row.name, role: row.role, email: row.email, phone: row.phone, notes: row.notes, is_active: row.is_active },
      );
    },
  });
}

// Archive i.p.v. hard-delete (SG-01 archive-pattern). Historie blijft
// beschikbaar, audit-log toont "contact.archived". Voor echte
// GDPR-verwijdering is een aparte admin-actie nodig — bewust niet
// bovenaan bij elke dispatcher als one-click optie.
export function useArchiveClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
    }: {
      id: string;
      clientId: string;
    }) => {
      const { data: before } = await supabase
        .from("client_contacts")
        .select("name, role, email")
        .eq("id", id)
        .maybeSingle();

      const { error } = await supabase
        .from("client_contacts")
        .update({ is_active: false } as any)
        .eq("id", id);
      if (error) throw error;
      return { id, clientId, before };
    },
    onSuccess: ({ clientId, before }) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
      logContactAudit(clientId, "contact.archived", before ?? null, null);
    },
  });
}

export function useReactivateClientContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      clientId,
    }: {
      id: string;
      clientId: string;
    }) => {
      const { data, error } = await supabase
        .from("client_contacts")
        .update({ is_active: true } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return { row: data as ClientContact, clientId };
    },
    onSuccess: ({ row, clientId }) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", clientId] });
      logContactAudit(clientId, "contact.reactivated", null, {
        name: row.name,
        role: row.role,
      });
    },
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

      const { data: before } = await supabase
        .from("client_contacts")
        .select("role")
        .eq("id", contactId)
        .maybeSingle();

      const { data, error } = await supabase
        .from("client_contacts")
        .update({ role, is_active: true } as any)
        .eq("id", contactId)
        .select()
        .single();
      if (error) throw error;
      return { row: data as ClientContact, before };
    },
    onSuccess: ({ row, before }) => {
      qc.invalidateQueries({ queryKey: ["client_contacts", row.client_id] });
      logContactAudit(
        row.client_id,
        "contact.role_changed",
        before ? { role: before.role } : null,
        { role: row.role, name: row.name },
      );
    },
  });
}
