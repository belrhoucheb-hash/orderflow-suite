import { useOrderTimeline } from "@/hooks/useEventPipeline";
import { EVENT_LABELS } from "@/types/events";
import type { EventType } from "@/types/events";
import {
  Mail, Bot, CheckCircle2, Eye, Pencil, CalendarDays, Truck,
  Send, MapPin, PackageCheck, Image, FileText, Receipt,
  CreditCard, AlertTriangle, ShieldCheck, Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EVENT_ICONS: Record<EventType, typeof Mail> = {
  email_received: Mail,
  ai_extraction_started: Bot,
  ai_extraction_completed: Bot,
  planner_review_started: Eye,
  planner_approved: CheckCircle2,
  planner_corrected: Pencil,
  order_planned: CalendarDays,
  trip_created: Truck,
  trip_dispatched: Send,
  stop_arrived: MapPin,
  stop_completed: PackageCheck,
  pod_uploaded: Image,
  order_delivered: PackageCheck,
  invoice_generated: FileText,
  invoice_sent: Receipt,
  invoice_paid: CreditCard,
  exception_raised: AlertTriangle,
  exception_resolved: ShieldCheck,
};

const EVENT_COLORS: Partial<Record<EventType, string>> = {
  exception_raised: "text-destructive",
  order_delivered: "text-emerald-600",
  planner_approved: "text-emerald-600",
  pod_uploaded: "text-emerald-600",
  invoice_paid: "text-emerald-600",
};

function formatDuration(ms: number | null): string {
  if (ms == null || ms <= 0) return "";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMin = minutes % 60;
  if (hours < 24) return `${hours}u ${remainMin}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}u`;
}

interface OrderTimelineProps {
  orderId: string | null | undefined;
}

export default function OrderTimeline({ orderId }: OrderTimelineProps) {
  const { data: events = [], isLoading } = useOrderTimeline(orderId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Clock className="h-4 w-4 animate-spin" />
        Laden...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">Geen events gevonden.</p>
    );
  }

  return (
    <div className="space-y-4">
      {events.map((event, i) => {
        const Icon = EVENT_ICONS[event.event_type] || Clock;
        const color = EVENT_COLORS[event.event_type];
        const label = EVENT_LABELS[event.event_type] || event.event_type;
        const time = new Date(event.created_at).toLocaleString("nl-NL", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        });
        const duration = formatDuration(event.duration_since_previous_ms);

        return (
          <div key={event.id} className="flex gap-3 text-sm">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center",
                  color ? "bg-destructive/10" : "bg-primary/10",
                )}
              >
                <Icon className={cn("h-3.5 w-3.5", color || "text-primary")} />
              </div>
              {i < events.length - 1 && (
                <div className="w-px h-full bg-border flex-1 mt-1" />
              )}
            </div>
            <div className="pb-4">
              <p className={cn("font-medium", color)}>{label}</p>
              <p className="text-xs text-muted-foreground">
                {time}
                {duration && <span className="ml-2 text-muted-foreground/60">(+{duration})</span>}
              </p>
              {event.confidence_score != null && (
                <p className="text-xs text-muted-foreground/60">
                  Confidence: {event.confidence_score}%
                </p>
              )}
              {event.actor_type !== "system" && (
                <p className="text-xs text-muted-foreground/60 capitalize">
                  Door: {event.actor_type}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
