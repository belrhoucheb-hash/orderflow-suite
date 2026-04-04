import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";
import type { NotificationPreferences } from "@/types/notifications";

interface RecipientFieldsProps {
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  notificationPreferences: NotificationPreferences;
  onChange: (field: string, value: any) => void;
  readOnly?: boolean;
}

export function RecipientFields({
  recipientName,
  recipientEmail,
  recipientPhone,
  notificationPreferences,
  onChange,
  readOnly = false,
}: RecipientFieldsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Bell className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Ontvanger &amp; Notificaties</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Naam ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientName || "—"}</p>
          ) : (
            <Input
              value={recipientName ?? ""}
              onChange={(e) => onChange("recipient_name", e.target.value)}
              placeholder="Naam contactpersoon"
              className="h-8 text-sm"
            />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">E-mail ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientEmail || "—"}</p>
          ) : (
            <Input
              type="email"
              value={recipientEmail ?? ""}
              onChange={(e) => onChange("recipient_email", e.target.value)}
              placeholder="email@bedrijf.nl"
              className="h-8 text-sm"
            />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">Telefoon ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientPhone || "—"}</p>
          ) : (
            <Input
              type="tel"
              value={recipientPhone ?? ""}
              onChange={(e) => onChange("recipient_phone", e.target.value)}
              placeholder="+31612345678"
              className="h-8 text-sm"
            />
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={notificationPreferences?.email ?? true}
            onCheckedChange={(checked) =>
              onChange("notification_preferences", {
                ...notificationPreferences,
                email: checked,
              })
            }
            disabled={readOnly}
          />
          <Label className="text-sm cursor-pointer">E-mail notificaties</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={notificationPreferences?.sms ?? false}
            onCheckedChange={(checked) =>
              onChange("notification_preferences", {
                ...notificationPreferences,
                sms: checked,
              })
            }
            disabled={readOnly}
          />
          <Label className="text-sm cursor-pointer">SMS notificaties</Label>
        </div>
      </div>
    </div>
  );
}
