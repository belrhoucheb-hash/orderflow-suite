import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NotificationTemplate, TriggerEvent, NotificationChannel } from "@/types/notifications";

const QUERY_KEY = "notification_templates";

export function useNotificationTemplates() {
  return useQuery({
    queryKey: [QUERY_KEY],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_templates" as any)
        .select("*")
        .order("trigger_event", { ascending: true })
        .order("channel", { ascending: true });

      if (error) throw error;
      return (data ?? []) as NotificationTemplate[];
    },
  });
}

export function useNotificationTemplate(id: string | null) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    staleTime: 30_000,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_templates" as any)
        .select("*")
        .eq("id", id!)
        .single();

      if (error) throw error;
      return data as NotificationTemplate;
    },
  });
}

export function useUpsertNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (template: {
      id?: string;
      tenant_id: string;
      trigger_event: TriggerEvent;
      channel: NotificationChannel;
      subject_template?: string | null;
      body_template: string;
      is_active?: boolean;
    }) => {
      const payload = {
        ...template,
        updated_at: new Date().toISOString(),
      };

      if (template.id) {
        const { data, error } = await supabase
          .from("notification_templates" as any)
          .update(payload)
          .eq("id", template.id)
          .select()
          .single();
        if (error) throw error;
        return data as NotificationTemplate;
      } else {
        const { data, error } = await supabase
          .from("notification_templates" as any)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return data as NotificationTemplate;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useToggleNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("notification_templates" as any)
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useDeleteNotificationTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notification_templates" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}
