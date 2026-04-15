import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <Label className="label-luxe">Naam ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientName || "—"}</p>
          ) : (
            <input
              className="field-luxe"
              value={recipientName ?? ""}
              onChange={(e) => onChange("recipient_name", e.target.value)}
              placeholder="Naam contactpersoon"
            />
          )}
        </div>
        <div>
          <Label className="label-luxe">E-mail ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientEmail || "—"}</p>
          ) : (
            <input
              className="field-luxe"
              type="email"
              value={recipientEmail ?? ""}
              onChange={(e) => onChange("recipient_email", e.target.value)}
              placeholder="email@bedrijf.nl"
            />
          )}
        </div>
        <div>
          <Label className="label-luxe">Telefoon ontvanger</Label>
          {readOnly ? (
            <p className="text-sm font-medium">{recipientPhone || "—"}</p>
          ) : (
            <input
              className="field-luxe"
              type="tel"
              value={recipientPhone ?? ""}
              onChange={(e) => onChange("recipient_phone", e.target.value)}
              placeholder="+31612345678"
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
          <Label className="font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 cursor-pointer">
            E-mail notificaties
          </Label>
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
          <Label className="font-display text-[11px] uppercase tracking-[0.14em] text-muted-foreground/80 cursor-pointer">
            SMS notificaties
          </Label>
        </div>
      </div>
    </div>
  );
}
