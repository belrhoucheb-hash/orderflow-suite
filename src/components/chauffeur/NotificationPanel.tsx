import { Truck, Bell, X } from "lucide-react";
import type { Notification } from "@/hooks/useNotifications";

interface NotificationPanelProps {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  onClose: () => void;
}

export function NotificationPanel({
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  onClose,
}: NotificationPanelProps) {
  return (
    <div className="absolute top-[72px] right-2 left-2 z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-[60vh] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <h3 className="text-sm font-bold text-slate-900">Notificaties</h3>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="text-xs text-primary font-semibold"
            >
              Alles gelezen
            </button>
          )}
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-slate-400">
            <Bell className="h-8 w-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm font-medium">Geen notificaties</p>
          </div>
        ) : (
          notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => {
                if (!n.is_read) markAsRead(n.id);
              }}
              className={`w-full text-left px-4 py-3 border-b border-slate-50 transition-colors ${
                !n.is_read ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                    !n.is_read ? "bg-green-100" : "bg-slate-100"
                  }`}
                >
                  <Truck
                    className={`h-4 w-4 ${
                      !n.is_read ? "text-green-600" : "text-slate-400"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    {new Date(n.created_at).toLocaleString("nl-NL", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
