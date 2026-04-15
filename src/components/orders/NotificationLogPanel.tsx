import { Badge } from "@/components/ui/badge";
import { Bell, Mail, Smartphone, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationLogByOrder } from "@/hooks/useNotificationLog";
import type { NotificationLog, NotificationStatus } from "@/types/notifications";
import { TRIGGER_EVENT_LABELS } from "@/types/notifications";

const STATUS_CONFIG: Record<NotificationStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  QUEUED: { label: "Wachtrij", color: "bg-gray-100 text-gray-600", icon: Clock },
  SENT: { label: "Verzonden", color: "bg-blue-100 text-blue-700", icon: CheckCircle2 },
  DELIVERED: { label: "Afgeleverd", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  FAILED: { label: "Mislukt", color: "bg-red-100 text-red-700", icon: XCircle },
  BOUNCED: { label: "Gebounced", color: "bg-amber-100 text-amber-700", icon: XCircle },
};

export function NotificationLogPanel({ orderId }: { orderId: string }) {
  const { data: logs, isLoading } = useNotificationLogByOrder(orderId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-6">
        <Bell className="h-8 w-8 text-gray-300 mx-auto mb-2" />
        <p className="font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground/70">
          Nog geen notificaties verzonden voor deze order.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const config = STATUS_CONFIG[log.status as NotificationStatus] ?? STATUS_CONFIG.QUEUED;
        const StatusIcon = config.icon;

        return (
          <div
            key={log.id}
            className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50/50"
          >
            <div className="flex-shrink-0 mt-0.5">
              {log.channel === "EMAIL" ? (
                <Mail className="h-4 w-4 text-blue-500" />
              ) : (
                <Smartphone className="h-4 w-4 text-green-500" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-display text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--gold-deep))] font-semibold">
                  {TRIGGER_EVENT_LABELS[log.trigger_event as keyof typeof TRIGGER_EVENT_LABELS] ?? log.trigger_event}
                </span>
                <Badge className={cn("text-[10px] px-1.5 py-0 border-0 rounded-full", config.color)}>
                  <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                  {config.label}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {log.channel === "EMAIL"
                  ? `Naar: ${log.recipient_email ?? "—"}`
                  : `Naar: ${log.recipient_phone ?? "—"}`}
              </p>
              {log.error_message && (
                <p className="text-xs text-red-500 mt-0.5">{log.error_message}</p>
              )}
              <p className="text-[11px] tabular-nums text-muted-foreground/70 mt-0.5">
                {log.sent_at
                  ? new Date(log.sent_at).toLocaleString("nl-NL", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })
                  : new Date(log.created_at).toLocaleString("nl-NL", {
                      day: "2-digit", month: "2-digit", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
