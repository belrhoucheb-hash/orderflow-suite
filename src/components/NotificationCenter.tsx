import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Trash2, Clock, Reply, AlertTriangle, Truck, CalendarClock, Package, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useNotificationCenter } from "@/hooks/useNotificationCenter";
import { motion, AnimatePresence } from "framer-motion";

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  sla_warning: { icon: Clock, color: "text-amber-700", bg: "bg-amber-50 ring-amber-200" },
  sla_critical: { icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50 ring-red-200" },
  client_reply: { icon: Reply, color: "text-[hsl(var(--gold-deep))]", bg: "bg-[hsl(var(--gold-soft)/0.48)] ring-[hsl(var(--gold)/0.18)]" },
  order_approved: { icon: Package, color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
  order_cancelled: { icon: X, color: "text-red-700", bg: "bg-red-50 ring-red-200" },
  planning_conflict: { icon: CalendarClock, color: "text-[hsl(var(--gold-deep))]", bg: "bg-[hsl(var(--gold-soft)/0.48)] ring-[hsl(var(--gold)/0.18)]" },
  driver_update: { icon: Truck, color: "text-[hsl(var(--gold-deep))]", bg: "bg-[hsl(var(--gold-soft)/0.48)] ring-[hsl(var(--gold)/0.18)]" },
  DISPATCH: { icon: Truck, color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
  trip_dispatched: { icon: Truck, color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
  info_escalation: { icon: AlertTriangle, color: "text-red-700", bg: "bg-red-50 ring-red-200" },
  info: { icon: Bell, color: "text-[hsl(var(--gold-deep))]", bg: "bg-[hsl(var(--gold-soft)/0.4)] ring-[hsl(var(--gold)/0.16)]" },
};

function formatTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Zojuist";
  if (diffMin < 60) return `${diffMin} min geleden`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}u geleden`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d geleden`;
}

function NotificationItem({
  notification,
  onRead,
  onDelete,
  onNavigate,
}: {
  notification: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (orderId: string) => void;
}) {
  const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8, height: 0 }}
      className={cn(
        "group mx-2 flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-[hsl(var(--gold-soft)/0.16)]",
        !notification.is_read && "bg-[linear-gradient(135deg,hsl(var(--gold-soft)/0.34),hsl(var(--card)))] ring-1 ring-[hsl(var(--gold)/0.14)]"
      )}
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
        if (notification.order_id) onNavigate(notification.order_id);
      }}
    >
      <div className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ring-1", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-sm font-semibold leading-snug text-foreground")}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[hsl(var(--gold-deep))]" />
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-muted-foreground/70">{formatTimeAgo(notification.created_at)}</span>
          {notification.order_id && (
            <span className="text-xs font-medium text-[hsl(var(--gold-deep))]">
              Bekijk order
            </span>
          )}
        </div>
      </div>
      <button
        className="mt-1 shrink-0 rounded-lg p-1 opacity-0 transition-opacity hover:bg-[hsl(var(--gold-soft)/0.28)] group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
      >
        <Trash2 className="h-3 w-3 text-muted-foreground" />
      </button>
    </motion.div>
  );
}

export function NotificationCenter() {
  const navigate = useNavigate();
  const {
    notifications: dbNotifications,
    unreadCount: dbUnreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  // Wire up realtime subscriptions for orders, trips, anomalies.
  // This hook subscribes to multiple tables and invalidates React Query caches.
  // We use its unreadCount to supplement the DB-based count.
  const realtimeCenter = useNotificationCenter();

  // Merge: DB notifications are the canonical source; realtime center
  // adds cache-invalidation side-effects (the actual notification list
  // displayed is still the DB-persisted list to avoid duplicates).
  const notifications = dbNotifications;
  const unreadCount = dbUnreadCount;
  void realtimeCenter;

  const handleNavigate = (orderId: string) => {
    navigate(`/orders/${orderId}`);
  };

  const unread = notifications.filter((n) => !n.is_read);
  const read = notifications.filter((n) => n.is_read);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative h-10 w-10 rounded-2xl border bg-[linear-gradient(180deg,hsl(var(--card)),hsl(var(--gold-soft)/0.18))] text-foreground shadow-sm transition-all",
            "border-[hsl(var(--gold)/0.14)] hover:border-[hsl(var(--gold)/0.28)] hover:bg-[hsl(var(--gold-soft)/0.3)]",
          )}
          aria-label={unreadCount > 0 ? `${unreadCount} ongelezen meldingen` : "Meldingen"}
        >
          <Bell className="h-4 w-4 text-[hsl(var(--gold-deep))]" />
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0 }}
                className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border border-[hsl(var(--card))] bg-[linear-gradient(135deg,hsl(var(--gold)),hsl(var(--gold-deep)))] px-1 text-[10px] font-semibold text-white shadow-[0_8px_18px_-10px_hsl(var(--gold-deep))]"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[380px] overflow-hidden rounded-2xl border border-[hsl(var(--gold)/0.16)] bg-[hsl(var(--card))] p-0 shadow-[0_30px_80px_-48px_hsl(var(--gold-deep)/0.42)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--gold)/0.12)] bg-[linear-gradient(180deg,hsl(var(--gold-soft)/0.34),hsl(var(--card)))] px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
              Meldingen
            </h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="h-5 border border-[hsl(var(--gold)/0.18)] bg-[hsl(var(--gold-soft)/0.55)] px-1.5 py-0 text-xs text-[hsl(var(--gold-deep))]">
                {unreadCount} nieuw
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-lg text-xs text-muted-foreground hover:bg-[hsl(var(--gold-soft)/0.28)] hover:text-foreground" onClick={markAllAsRead}>
                <CheckCheck className="h-3 w-3" />
                Alles gelezen
              </Button>
            )}
          </div>
        </div>

        {/* Notification list */}
        <div className="h-[420px] overflow-y-auto overscroll-contain">
          {notifications.length === 0 ? (
            <div className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[hsl(var(--gold)/0.14)] bg-[hsl(var(--gold-soft)/0.32)]">
                <Inbox className="h-5 w-5 text-[hsl(var(--gold-deep))]/50" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Geen meldingen</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Alles is up-to-date</p>
            </div>
          ) : (
            <>
              {unread.length > 0 && (
                <div>
                  <div className="px-4 pt-2 pb-1">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[hsl(var(--gold-deep))]/70">Nieuw</span>
                  </div>
                  <AnimatePresence>
                    {unread.map((n) => (
                      <NotificationItem
                        key={n.id}
                        notification={n}
                        onRead={markAsRead}
                        onDelete={deleteNotification}
                        onNavigate={handleNavigate}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
              {read.length > 0 && (
                <div>
                  {unread.length > 0 && <Separator className="bg-[hsl(var(--gold)/0.12)]" />}
                  <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground/55">Eerder</span>
                    {read.length > 0 && (
                      <Button variant="ghost" size="sm" className="h-6 rounded-md px-1.5 text-xs text-muted-foreground/55 hover:bg-[hsl(var(--gold-soft)/0.24)] hover:text-foreground" onClick={clearAll}>
                        Wis gelezen
                      </Button>
                    )}
                  </div>
                  {read.slice(0, 10).map((n) => (
                    <NotificationItem
                      key={n.id}
                      notification={n}
                      onRead={markAsRead}
                      onDelete={deleteNotification}
                      onNavigate={handleNavigate}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
