import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, Trash2, Clock, Reply, AlertTriangle, Truck, CalendarClock, Package, X, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { motion, AnimatePresence } from "framer-motion";

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string }> = {
  sla_warning: { icon: Clock, color: "text-amber-600", bg: "bg-amber-500/10" },
  sla_critical: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  client_reply: { icon: Reply, color: "text-blue-600", bg: "bg-blue-500/10" },
  order_approved: { icon: Package, color: "text-emerald-600", bg: "bg-emerald-500/10" },
  order_cancelled: { icon: X, color: "text-destructive", bg: "bg-destructive/10" },
  planning_conflict: { icon: CalendarClock, color: "text-violet-600", bg: "bg-violet-500/10" },
  driver_update: { icon: Truck, color: "text-primary", bg: "bg-primary/10" },
  info: { icon: Bell, color: "text-muted-foreground", bg: "bg-muted" },
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
        "group flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer hover:bg-muted/40",
        !notification.is_read && "bg-primary/[0.03]"
      )}
      onClick={() => {
        if (!notification.is_read) onRead(notification.id);
        if (notification.order_id) onNavigate(notification.order_id);
      }}
    >
      <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("text-[12px] font-semibold leading-snug", !notification.is_read ? "text-foreground" : "text-muted-foreground")}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
          )}
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
          {notification.message}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] text-muted-foreground/50">{formatTimeAgo(notification.created_at)}</span>
          {notification.order_id && (
            <span className="text-[10px] text-primary/60 font-medium">
              Bekijk order →
            </span>
          )}
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1 p-1 rounded hover:bg-muted"
        onClick={(e) => { e.stopPropagation(); onDelete(notification.id); }}
      >
        <Trash2 className="h-3 w-3 text-muted-foreground/50" />
      </button>
    </motion.div>
  );
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    if (isOpen) document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleNavigate = (orderId: string) => {
    setIsOpen(false);
    navigate(`/orders/${orderId}`);
  };

  const unread = notifications.filter((n) => !n.is_read);
  const read = notifications.filter((n) => n.is_read);

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Bell className="h-4 w-4" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-0.5 rounded-full bg-primary text-[10px] text-primary-foreground flex items-center justify-center font-semibold"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-[380px] bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground">Notificaties</h3>
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-primary/10 text-primary border-primary/20">
                    {unreadCount} nieuw
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1 text-muted-foreground" onClick={markAllAsRead}>
                    <CheckCheck className="h-3 w-3" />
                    Alles gelezen
                  </Button>
                )}
              </div>
            </div>

            {/* Notification list */}
            <ScrollArea className="max-h-[420px]">
              {notifications.length === 0 ? (
                <div className="text-center py-12">
                  <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <Inbox className="h-5 w-5 text-muted-foreground/30" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Geen notificaties</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">Alles is up-to-date</p>
                </div>
              ) : (
                <>
                  {unread.length > 0 && (
                    <div>
                      <div className="px-4 pt-2 pb-1">
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.12em]">Nieuw</span>
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
                      {unread.length > 0 && <Separator className="bg-border/30" />}
                      <div className="px-4 pt-2 pb-1 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-[0.12em]">Eerder</span>
                        {read.length > 0 && (
                          <Button variant="ghost" size="sm" className="h-5 text-[9px] text-muted-foreground/40 px-1.5" onClick={clearAll}>
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
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
